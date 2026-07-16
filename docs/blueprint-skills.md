# 技能系统 Blueprint（完整版）

> **状态**：已实施（2026-07-16，`blueprint-skills-refactor`）
> **取代**：[`blueprint-skills-caster.md`](./blueprint-skills-caster.md) 中的增量笔记与问题清单  
> **读者**：后续重构 agent / 实现者；与 [`DEV.md`](./DEV.md) 里程碑对齐

---

## 0. 一句话结论

技能系统分为 **五层、两条生命周期**：

- **施法生命周期**（`SkillInstance`）：前摇 → 生效 → 后摇 → 结束；负责 CD、位移、即时结算、spawn effect。
- **效果生命周期**（`SkillEffectEntity`）：脱手弹道 / 地面区域 / 调度器等；与施法槽解耦，独立 tick。

五层职责：

```text
Input / Aim        瞄准会话、skill-stick、CastSnapshot 构建
Cast               SkillInstance 状态机、SkillBook
Effect             SkillEffectEntity 注册表 + tick
Collision          HitGeometry、扫掠碰撞、TargetFilter、HitPolicy
Settlement         统一伤害/CC/Buff 结算（含视野）
```

**硬规则**：

1. 脱手实体 **不得** 实现为 `Unit`，**不得** 把 `projectile` 塞进 `HitGeometry`。
2. `HitGeometry` 只做几何；移动、寿命、打谁、命中几次 → `Effect` + `HitPolicy`。
3. 英雄 JSON 是数值与效果的 **单一来源**；TypeScript 只做通用执行、校验与注册表映射。
4. 所有伤害路径 **必须** 经过同一套 `Settlement` 管线（含 `TargetFilter` + `canSee`）。

---

## 1. 设计目标

| 目标 | 说明 |
|------|------|
| 近战 + 远程统一 | 亚瑟即时 AoE 与妲己/安琪拉脱手弹道共用底层，不靠 `SkillInstance` 特判 |
| 数据驱动 | 新英雄 = JSON + 可选极薄 loader；禁止 `arthur.ts` 式大段英雄逻辑 |
| 施法语义冻结 | `CastSnapshot` 在施法开始时不可变；锁定目标不得被最近邻替换 |
| 可测试 | 几何、碰撞、snapshot、effect spawn 均为纯函数或可 mock 的 tick |
| 渐进扩展 | 元歌/镜/塔野 **不预埋接口**；妲己 + 安琪拉验收矩阵覆盖远程核心机制 |

### 1.1 非目标（本 Blueprint 不解决）

- 元歌分身、镜换位、多可控实体
- 真视野系统、草丛、墙体碰撞（记录为 P2 扩展点）
- 空间哈希 / `unitsNear` 优化（练习场规模可接受，P2）
- 网络同步、回放、技能编辑器 UI

---

## 2. 分层架构

```text
┌─────────────────────────────────────────────────────────────┐
│  UI: SkillHud / AimIndicatorVfx / HitboxVfx                   │
└───────────────────────────┬─────────────────────────────────┘
                            │ pointer / hotkey
┌───────────────────────────▼─────────────────────────────────┐
│  Input / Aim: AimingSession, skill-stick, cast-aiming       │
│    → 产出 CastSnapshot（origin, forward, targetId/Point）    │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Cast: SkillBook + SkillInstance                            │
│    cast → active → recovery → done                          │
│    onActivate / onLand / damageInterval                     │
└───────────────┬─────────────────────────┬───────────────────┘
                │ 即时结算                  │ spawn
┌───────────────▼──────────┐   ┌────────────▼──────────────────┐
│  Collision + Settlement  │   │  Effect Runtime               │
│  resolveHits + swept     │   │  Projectile / Zone / Scheduler│
└──────────────────────────┘   └────────────┬──────────────────┘
                                            │ tick each frame
                            ┌───────────────▼───────────────────┐
                            │  WorldState                       │
                            │  units + effects + damage bus     │
                            └───────────────────────────────────┘
```

### 2.1 模块归属

| 目录 | 职责 |
|------|------|
| `src/game/skills/` | 类型契约、`SkillInstance`、`hits.ts`（纯几何）、`skill-book` |
| `src/game/input/` | `cast-aiming`、`aim-forward`、skill-stick 映射 |
| `src/game/world/skill-effects/` | `SkillEffectEntity` 实现、spawn 工厂、碰撞 |
| `src/game/combat/` | `target-filter`、`auto-attack-intent`、`unit-cc` |
| `src/game/combat/settlement.ts`（新） | **统一伤害/CC 结算** |
| `src/game/heroes/` | JSON、`hero-kit` 校验、`effect-registry`、极薄 loader |
| `src/game/world/practice-session.ts` | tick 编排；不承载英雄特例 |

---

## 3. 核心类型契约

### 3.1 CastSnapshot（施法快照）

施法开始时生成，贯穿 `SkillInstance` 与 effect spawn。

```ts
interface CastSnapshot {
  readonly castId: string;
  readonly casterId: string;
  readonly skillId: string;
  readonly origin: Vec2;          // 值拷贝，禁止引用 caster.position
  readonly forwardRad: number;
  readonly targetId?: string;     // 锁定类；几何层不得重新最近邻
  readonly targetPoint?: Vec2;    // 区域瞄准落点 / 汇聚点
  readonly dashDistance?: number; // dash 类在构建时写入
}
```

**构建时机**：`SkillBook.start` 之前，由 `practice-session`（或战斗 session）根据瞄准会话 + 索敌结果构建。

旧施法入参已删除；`SkillBook.start` 与 `startSkill` 仅接受 `CastSnapshot`。

### 3.2 Skill（技能定义）

```ts
interface Skill {
  readonly id: string;
  readonly displayName: string;

  // ── 时序 ──
  readonly castTime: number;
  readonly activeTime: number;
  readonly recoveryTime: number;
  readonly cooldown: number;

  // ── 输入语义（与 effect 解耦）──
  readonly castMode: 'instant' | 'targeted';
  readonly aimKind: 'none' | 'direction' | 'lock-target' | 'area';

  // ── 位移（施法者本体；目标 forced-move 见 §8 CombatEvent）──
  readonly displacement: 'none' | 'ground' | 'dash' | 'teleport';  // 远期 + 'swap'（§18.2）
  readonly dashDistance: number;
  readonly dashSpeed: number;

  // ── 即时结算（无 effect 的技能）──
  readonly delivery: SkillDelivery;

  // ── 生命周期钩子 ──
  readonly onActivate?: (ctx: SkillContext) => void;
  readonly onLand?: (ctx: SkillContext) => readonly CombatEvent[];
}
```

**关键变更**：删除 `Skill.hit` 作为运行时结算依据；预览几何与结算几何分离（见 §3.5）。

### 3.3 SkillDelivery（投递方式）

描述 **技能如何造成伤害**，与英雄 JSON `effect.kind` 一一映射。

```ts
type SkillDelivery =
  | { mode: 'instant-hit'; geometry: HitGeometry; hitOrigin: HitOrigin; settlement: SettlementSpec }
  | { mode: 'interval-hit'; geometry: HitGeometry; hitOrigin: HitOrigin; interval: number; ticks: number; settlement: SettlementSpec }
  | { mode: 'spawn-effect'; effectKind: EffectKind; effectConfig: EffectConfig }
  | { mode: 'buff-only' }
  | { mode: 'composite'; phases: readonly SkillDelivery[] };  // 罕见；优先用 effect 链式 spawn
```

| mode | 典型技能 | 结算时机 |
|------|----------|----------|
| `instant-hit` | 亚瑟普攻、三技能落地圈 | `active` 内一次 `resolveHits` |
| `interval-hit` | 亚瑟二技能旋风 | `active` 内按 interval tick |
| `spawn-effect` | 妲己狐火、安琪拉火球 | `onActivate` spawn，`SkillInstance` 可立即进入后摇 |
| `buff-only` | 亚瑟一技能 | 仅 `onActivate` 挂 buff |

### 3.4 SkillEffectEntity（脱手效果）

```ts
interface SkillEffectEntity {
  readonly id: string;
  readonly castId: string;
  readonly skillId: string;
  readonly ownerId: string;
  readonly sourceTeam: Team;       // spawn 时冻结
  readonly kind: EffectKind;
  readonly destroyWhenOwnerGone?: boolean;  // 默认 false
  expired: boolean;
  tick(dt: number, ctx: EffectTickContext): readonly CombatEvent[];
}
```

**EffectKind 注册表**（可扩展，非封闭枚举硬编码在 switch）：

| kind | 说明 | 状态 |
|------|------|------|
| `projectile` | 直线/追踪弹道，扫掠碰撞 | ✓ 已有 |
| `persistent-area` | 地面周期伤害圈 | ✓ 已有 |
| `swept-rect` | 脱手矩形剑气 | ✓ 已有 |
| `projectile-burst` | 同帧/依次多枚弹道调度 | ✓ 已有 |
| `convergent-burst` | 汇聚弹道调度 | ✓ 已有 |
| `beam-channel` | 跟随施法者的持续光束 | P1（见 §14） |
| `wall-bounce-projectile` | 碰墙反弹 | P2 |
| `arena-field` | 镜大招圆盘（场地规则） | 远期（§18.2） |
| `mirror-anchor` | 镜飞雷神换位锚点 | 远期（§18.2） |
| `deployed-weapon` | 马超滞留枪（可拾取） | 远期（§18.3） |
| `grapple-projectile` | 钟馗钩（命中拉人） | 远期（§18.4） |

**调度器 vs 实体**：`convergent-burst`、`projectile-burst` 是 **一次性调度器**——首帧 spawn 子 `projectile` 后自身 `expired`；子实体走标准 tick。

### 3.5 几何三分离

| 概念 | 用途 | 来源 |
|------|------|------|
| `AimGeometry` | 指示器 / 瞄准钳制半径 | `hero JSON.aim` 或从 `effect` 推导 |
| `HitGeometry` | 即时命中、`persistent-area` 每 tick 查询 | `effect` 或 `delivery` |
| `CollisionShape` | 弹道扫掠、剑气飞行盒 | `effect` 独立字段 |

```ts
type HitGeometry =
  | { kind: 'self' }
  | { kind: 'circle'; radius: number }
  | { kind: 'rect'; halfWidth: number; halfDepth: number }
  | { kind: 'cone'; range: number; halfAngleRad: number }
  | { kind: 'target'; range: number };  // 仅即时锁定结算；追踪弹用 snapshot.targetId

type CollisionShape =
  | { kind: 'circle'; radius: number }
  | { kind: 'capsule-sweep' }            // previous→current + projectileRadius
  | { kind: 'oriented-rect'; halfWidth: number; halfDepth: number };
```

**禁止**：用 `hit: { kind: 'self' }` 表达火球，用 `effect` 里的 `collisionRadius` 表达真实碰撞——两者不得混在一个字段。

### 3.6 TargetFilter + HitPolicy

```ts
interface TargetFilter {
  readonly casterId: string;
  readonly casterTeam: Team;
  readonly includeNeutral?: boolean;   // 默认 true
  readonly targetableOnly?: boolean;   // 默认 true；排除 isStatic 等
}

interface HitPolicy {
  readonly maxHits?: number;           // 总命中次数；1 = 首敌停止
  readonly maxHitsPerTarget?: number;
  readonly pierce?: number;            // 额外穿透次数
  readonly sameTargetCooldown?: number; // 持续区域：同目标 tick 间隔
}
```

**视野不在 TargetFilter**：`canSee(observer, target)` 在 **Settlement** 层判定（§8）。

### 3.7 Unit 扩展字段

```ts
interface Unit {
  // ... 现有字段 ...
  readonly collisionRadius: number;  // hurtbox；默认 0.5
  readonly targetable: boolean;      // 默认 true；塔/特殊单位可 false
}
```

即时 `circle/cone/rect` 检测：**中心点 in 形状**（近战够用）；弹道/高速物体用 **扫掠 + hurtbox**。

---

## 4. 施法管线

### 4.1 状态机

```text
cast (前摇)
  → elapsed ≥ castTime
  → active (生效)
       ├─ onActivate()           // buff / spawn effect
       ├─ displacement tick      // dash / teleport
       ├─ instant/interval hit   // delivery.mode = instant/interval
       └─ elapsed ≥ activeTime && displacement done
  → onLand()                    // 可选；亚瑟三技能落地圈
  → recovery (后摇)
  → done
```

**不变量**：

- CD 在 `start` 时立即开始，跨 `done` 后继续 tick 至 0。
- `cancel()` 仅结束 `SkillInstance`；**不**销毁已 spawn 的 effects。
- `spawn-effect` 类技能：`activeTime` 可极短（0.05–0.15s），弹道飞行 **不** 占用 `activeTime`。

### 4.2 hitOrigin

| 值 | 行为 |
|----|------|
| `caster` | 即时几何中心跟随施法者（近身旋风、跟随光束） |
| `cast` | 固定在 `CastSnapshot.origin`（脱手落点、地面圈） |

### 4.3 SkillBook

```ts
interface SkillBook {
  start(skill: Skill, caster: Unit, snapshot: CastSnapshot): SkillInstance | null;
  tick(dt: number, ctx: SkillContext): readonly DamageResult[];
  active: SkillInstance | null;
}
```

- 同一时刻仅一个 `active SkillInstance`（与现有一致）。
- `SkillContext` 必须携带 `castSnapshot` 与 `buffs`。

---

## 5. 瞄准系统

### 5.1 AimKind 与 castMode 正交

| aimKind | 输入 | snapshot 字段 | 指示器 |
|---------|------|---------------|--------|
| `none` | 无 | `forwardRad` = 朝向 | 无 |
| `direction` | 摇杆 / WASD / skill-stick | `forwardRad` | 方向箭头 |
| `lock-target` | 自动锁敌 + 切换 | `targetId` | 目标连线 |
| `area` | skill-stick 落点 | `targetPoint` + 导出 `forwardRad` | 范围环 + 落点标 |

`castMode: 'targeted'` 控制 **是否需要 hold-release**；与 `aimKind` 独立组合。

### 5.2 skill-stick

- 从 SkillHud 技能按钮 `pointerdown` → `pointermove` → `pointerup`。
- 拖拽 ≥ 8px 视为瞄准；否则走 instant cast。
- 瞄准期间 `suppressManualMove`；skill-stick 优先于移动摇杆。
- 屏幕偏移 → 视口归一化 → 世界单位（与相机缩放一致）。

### 5.3 区域瞄准钳制

```ts
clampTargetPoint(origin, targetPoint, maxRange): Vec2
```

`maxRange` 单一来源：`aim.maxRange` 或从 `effect` 推导（如 `convergent-burst.travelDistance`），**指示器与 snapshot 共用**。

---

## 6. Effect 运行时

### 6.1 WorldState

```ts
interface WorldState {
  readonly units: ReadonlyMap<string, Unit>;
  readonly effects: ReadonlyMap<string, SkillEffectEntity>;
  unitsNear(origin: Vec2, radius: number): readonly Unit[];  // P2: 空间索引
  spawnEffect(effect: SkillEffectEntity): void;
  tickEffects(dt: number): EffectTickResult;
  clearEffects(): void;
}
```

### 6.2 Projectile 行为

```text
spawn at snapshot.origin / 独立起点
  → 每 tick: previousPosition → position 胶囊扫掠
  → TargetFilter 粗筛 + sweptHitsTarget
  → 命中 → Settlement → HitPolicy 判定是否继续
  → 超距 / maxHits → expired
  → 若配置 spawnZoneOnExpire → 撞击点生成 persistent-area
```

**追踪**：

- `homing: true` 且 `snapshot.targetId` 存在 → 每 tick 更新 `forwardRad` 朝向目标。
- `onTargetLost`: `'expire' | 'continue-forward' | 'retarget'`（默认 `continue-forward`）。

### 6.3 Persistent Area

- 固定 `position`（spawn 时冻结）。
- 每 `tickInterval` 对 `HitGeometry circle` 做 `resolveHits` + Settlement。
- `ticks` 用尽 → `expired`。
- 施法者死亡：默认继续存在；`destroyWhenOwnerGone: true` 时移除。

### 6.4 属性快照规则

| 场景 | 规则 |
|------|------|
| 弹道 / 区域 | spawn 时冻结 `DamageSnapshot`（默认） |
| 即时命中 | 命中时读取 `buffs.attackPowerMultiplier()`（默认） |
| 例外 | `settlement.timing: 'at-hit'` 显式配置 |

### 6.5 链式 spawn

```text
projectile-then-zone:
  ProjectileEffect { spawnZoneOnExpire: PersistentAreaConfig }
    → expired 时 world.spawnEffect(persistent-area at impact)
```

调度器不得复制碰撞逻辑；子实体复用 `createProjectileEffect`。

---

## 7. 碰撞与目标过滤

### 7.1 查询分层

```text
1. unitsNear(origin, radius)     // 粗空间候选（P2 前可全量）
2. filterTargets(candidates, TargetFilter)
3. geometry test (point-in-shape | swept-capsule)
4. Settlement (canSee + damage formula)
```

### 7.2 锁定目标

- `snapshot.targetId` 写入后，`hitTarget` **不得** 重新最近邻。
- 目标死亡：即时技能返回空命中；追踪弹走 `onTargetLost`。

### 7.3 友军 / 尸体

`TargetFilter` 统一排除：自身、同阵营、`hp ≤ 0`、不可选中单位。  
**所有路径**（`SkillInstance`、`Effect.tick`、`onLand`）必须经过 filter，禁止英雄 loader 手写 `if (team)`。

---

## 8. 统一结算管线（Settlement）

> **重构核心**：消除 `DamageFormula` vs `EffectDamageEvent` 双轨。

```ts
interface SettlementSpec {
  readonly baseDamage: number;
  readonly scalesWithAttackPower?: boolean;
  readonly timing?: 'at-spawn' | 'at-hit';  // 默认 at-hit for instant, at-spawn for effect
  readonly canCrit?: boolean;
  readonly ignoreVisibility?: boolean;
}

interface CombatEvent {
  /** 远期扩展见 §18：pull、pickup、position-swap */
  readonly kind: 'damage' | 'heal' | 'knockup' | 'buff';
  readonly targetId: string;
  readonly payload: unknown;
}

function settleHit(
  ctx: SettlementContext,
  hit: { target: Unit },
  spec: SettlementSpec,
): CombatEvent | null;
```

**流程**：

1. `passesTargetFilter`（调用方已做可跳过）
2. `canSee(caster, target)` — 除非 `ignoreVisibility`
3. 数值：`baseDamage × attackPowerMultiplier × crit`
4. 产出 `CombatEvent`；**不直接改 hp**

`practice-session.postTick`：

```text
skillBook.tick → events
world.tickEffects → events
applyCombatEvents(world, allEvents)  // 唯一扣血入口
```

亚瑟 `onLand` 击飞：产出 `{ kind: 'knockup', ... }` 而非直接 `applyKnockup`。

---

## 9. Hero Kit 数据模型

### 9.1 顶层结构

```ts
interface HeroKitData {
  readonly id: string;
  readonly displayName: string;
  readonly stats: { hpMax: number; attackDamage: number; moveSpeed: number };
  readonly skills: readonly HeroSkillSlotData[];  // 恰好 4 项，hotkey 0–3
}
```

### 9.2 槽位字段

```ts
interface HeroSkillSlotData {
  readonly id: string;
  readonly name: string;
  readonly hotkey: '0' | '1' | '2' | '3';
  readonly castTime: number;
  readonly activeTime: number;
  readonly recoveryTime: number;
  readonly cooldown: number;
  readonly castMode?: 'instant' | 'targeted';
  readonly aimKind?: AimKind;
  readonly displacement?: Displacement;
  readonly dashDistance?: number;
  readonly dashSpeed?: number;

  // 瞄准预览（可与结算几何不同）
  readonly aim?: {
    readonly maxRange?: number;
    readonly preview?: HitGeometry;
  };

  // 效果定义（单一来源）
  readonly effect: EffectConfig;
}
```

### 9.3 EffectConfig（声明式）

用 **结构化 effect 树** 替代扁平 `effect.kind` 爆炸；短期可保留 kind 字符串，长期收敛为：

```ts
type EffectConfig =
  | { kind: 'attack-damage'; range: number; acquireRangeMultiplier: number; projectile?: ProjectileSpec }
  | { kind: 'periodic-damage'; damage: number; interval: number; ticks: number; geometry: HitGeometry }
  | { kind: 'dash-landing'; dash: DashSpec; landing: { geometry: HitGeometry; damage: number; knockupDuration: number } }
  | { kind: 'move-speed-buff'; ... }
  | { kind: 'spawn-projectile'; projectiles: ProjectileSpec | readonly ProjectileSpec[]; spawnInterval?: number }
  | { kind: 'spawn-swept-rect'; ... }
  | { kind: 'projectile-then-zone'; projectile: ProjectileSpec; zone: ZoneSpec }
  | { kind: 'periodic-zone'; zone: ZoneSpec }
  | { kind: 'convergent-burst'; count: number; speed: number; travelDistance: number; fanHalfAngle: number; ... };
```

**校验**：`assertFourSkillKit` + `assertEffectConfig` 在 JSON 导入时执行；删除独立 `arthur.schema.json`。

---

## 10. Effect 注册表

> 取代 `effect-loader.ts` 的 switch 与英雄 loader 分支。

```ts
type EffectFactory = (
  skill: Skill,
  slot: HeroSkillSlotData,
  snapshot: CastSnapshot,
  ctx: { caster: Unit; world: WorldStateHandle; buffs: BuffBag },
) => void;  // 内部 world.spawnEffect(...)

const EFFECT_REGISTRY: Record<EffectConfig['kind'], EffectFactory> = {
  'spawn-projectile': spawnProjectileFromConfig,
  'projectile-then-zone': spawnProjectileThenZoneFromConfig,
  // ...
};

function buildSkillFromSlot(slot: HeroSkillSlotData, heroStats: HeroStats): Skill {
  const delivery = resolveDelivery(slot);
  return makeSkill({ ...slot, delivery, onActivate: delivery.mode === 'spawn-effect'
    ? (ctx) => EFFECT_REGISTRY[slot.effect.kind](skill, slot, ctx.castSnapshot!, ctx)
    : undefined });
}
```

**英雄 loader 极薄化**：

```ts
// daji.ts — 目标形态
export function loadDajiSkills(): readonly Skill[] {
  return buildHeroSkills(DAJI_DATA);  // 通用构建，无英雄 if-else
}
```

**缓存**：`buildHeroSkills` 结果按 `heroId` 缓存；`heroSkillByHotkey` 不得每次全量 rebuild。

**sourceTeam**：从 `caster.team` 传入，禁止硬编码 `'blue'`。

---

## 11. World Tick 编排

`practice-session.postTick` 顺序（固定）：

```text
1. tickDummyRegen / tickCc
2. skillBook.tick(dt)           → CombatEvents
3. world.tickEffects(dt)       → CombatEvents
4. applyCombatEvents           → 扣血、击飞、buff
5. removeDeadUnits
6. sync dash position to render
```

`preTick`：移动、自动攻击意图、瞄准更新、强化普攻 dash 解析。

---

## 12. VFX / 指示器绑定

| 事件 | VFX |
|------|-----|
| 瞄准中 | `AimIndicatorVfx` + `HitboxVfx.bindEffect('aim-preview')` |
| `hitboxActivations++` | `HitboxVfx.spawn` 绑定技能实例 |
| effect position | `HitboxVfx.spawnAttached` 或 effect 驱动 mesh |
| 伤害结算 | 飘字 bus（已有 `notifyDamage`） |

**规则**：逻辑层产出位置/几何；渲染层订阅，不在 `SkillInstance` 内直接操作 Three.js。

---

## 13. 英雄验收矩阵

### 13.1 亚瑟（近战 / 即时 / buff / dash）

| 技能 | delivery | 验证点 |
|------|----------|--------|
| 普攻 | `instant-hit` + `target` | 近战命中、视野 |
| 一技能 | `buff-only` + 强化普攻 dash | `HeroStateStack` 消费 |
| 二技能 | `interval-hit` + `circle` | 周期 tick 次数 = `damageTicks` |
| 三技能 | `dash` + `onLand` + `circle` + knockup | 落地圈半径 = 二技能 canonical 半径 |

### 13.2 妲己（锁定 / 多弹 / 剑气）

| 技能 | delivery | 验证点 |
|------|----------|--------|
| 一技能 | `spawn-swept-rect` | 脱手矩形、方向瞄准 |
| 二技能 | `spawn-projectile` ×1 homing | `targetId` 锁定、`onTargetLost: expire` |
| 三技能 | `spawn-projectile` ×5 + `spawnInterval` | 依次发射、同目标命中上限 |
| 普攻 | `spawn-projectile` homing | 索敌追踪、伤害在命中帧 |

### 13.3 安琪拉（脱手 / 区域 / 汇聚）

| 技能 | delivery | 验证点 |
|------|----------|--------|
| 一技能 | `convergent-burst` + `aimKind: area` | `targetPoint` = 交汇点；身后扇形齐射；穿过交汇点继续飞 |
| 二技能 | `projectile-then-zone` | 首敌停止 → 撞击点区域 → 周期伤害 |
| 三技能 | `periodic-zone` 或 `beam-channel` | 跟随/地面持续伤害（光束见 §14） |
| 普攻 | 同妲己远程普攻 | — |

### 13.4 汇聚弹道几何（安琪拉一技能）

- `P = snapshot.targetPoint`（交汇点，**非**灭点）
- 身后扇形排开起点，每枚弹道 `forward = normalize(P - origin_i)`
- `maxRange = travelDistance`；穿过 P 后继续直线飞行直至路程耗尽
- 命中：`maxHits: 1`，各弹道独立 `hitTargetIds`

---

## 14. 光束（Beam）决策

**短期（推荐）**：`beam-channel` = `SkillInstance` active 内 `interval-hit` + `hitOrigin: 'caster'` + `HitGeometry rect/cone`。

- 跟随施法者移动、与 `cancel()` 天然绑定
- 复用 `HitboxVfx.spawnAttached`

**长期（按需）**：独立 `BeamEffect` 实体——仅当需要脱手光束、拐弯、与施法者分离时引入。

---

## 15. 与现有代码的差异（迁移清单）

| 现状 | 目标 | 优先级 |
|------|------|--------|
| `Skill.hit` 兼做预览 + 结算 | 拆为 `aim.preview` + `delivery.geometry` | P0 |
| `effect-loader` switch | `EFFECT_REGISTRY` | P0 |
| `arthur.ts` 手写伤害/击飞 | 声明式 `effect` + 通用 `onLand` 工厂 | P1 |
| `DamageFormula` 与 `EffectDamageEvent` 分裂 | 统一 `settleHit` | P0 |
| effect tick 不检查 `canSee` | Settlement 统一检查 | P0 |
| `daji/angela` 硬编码 `sourceTeam: 'blue'` | 从 `caster.team` 读取 | P1 |
| `loadXSkills()` 每次重建 | 按 heroId 缓存 | P2 |
| `convergent-burst` 忽略 `spawnInterval` | 实现间隔调度或删 JSON 字段 | P1 |
| `CastOptions` 残留 | 删除 | P1 |
| `unitsNear` 全量返回 | 空间哈希 | P2 |
| 即时几何仅中心点检测 | 可选 hurtbox 扩展 | P2 |

---

## 16. 分期落地计划

```text
Phase 0 — 契约冻结（本文件 + OpenSpec delta）
Phase 1 — Settlement 统一 + TargetFilter 全路径
Phase 2 — SkillDelivery 重构 + 几何三分离
Phase 3 — EFFECT_REGISTRY + 英雄 loader 极薄化
Phase 4 — 亚瑟迁移（行为回归为零差异）
Phase 5 — 妲己/安琪拉对齐新契约
Phase 6 — 清理：删 CastOptions、旧 hit 字段、effect-loader switch
```

每 Phase 结束：**亚瑟全技能 + 妲己/安琪拉验收矩阵单测绿灯**。

回滚策略：Phase 4 前保留旧 `buildSkill` 路径；`HERO_IDS` 可逐个迁移。

---

## 17. 技术债登记

| ID | 项 | 处置 |
|----|-----|------|
| TD-1 | `unitsNear` O(n) 全量 | 单位 > 20 时做网格索引 |
| TD-2 | 墙体碰撞 | 弹道 `onWallHit`；dash 撞墙停止 |
| TD-3 | 真视野 / 草丛 | `canSee` 实现；`ignoreVisibility` 技能标签 |
| TD-4 | 元歌/镜/马超/钟馗等 | M4 后按 §18 单独立项；重构期不守扩展性清单（§18.6） |
| TD-5 | 被动技能 | 独立 `PassiveDef` + 事件订阅，不走 SkillBook |

---

## 18. 远期英雄机制参考（仅记录，不实现）

> **用途**：妲己/安琪拉重构完成后，若开工元歌、镜、马超、钟馗等英雄，按本节映射与增量扩展点实施。  
> **原则**：均通过 `EFFECT_REGISTRY` 新 kind、`CombatEvent` 新 kind、`Displacement` 枚举扩展落地；**不**为远期英雄预埋专用接口，**不**把脱手物做成 `Unit`。

### 18.0 扩展模式速查

| 英雄 | 核心机制 | 主要落点 | 增量扩展 | 复杂度 |
|------|----------|----------|----------|--------|
| 元歌 | 分身（真单位） | 多 `Unit` + `ownerId` 映射 | `cooldownGroup?`、施法主体分离 | 高 |
| 镜 | 大招圆盘 + 镜像换位 | `arena-field` + `displacement: swap` | 场地规则、`mirror-anchor` | 中–高 |
| 马超 | 扔枪 / 收枪 / 强化普攻 | `deployed-weapon` + `HeroStateStack` | `pickup` 事件、effect 多阶段 | 中 |
| 钟馗 | 二技能钩子 | `grapple-projectile` + 目标 CC | `pull` 事件、`unit-cc` 扩展 | 低–中 |

**位移归属（易混，须遵守）**：

| 位移类型 | 谁动 | 蓝图路径 |
|----------|------|----------|
| dash / teleport | 施法者 | `Skill.displacement` |
| swap | 施法者 ↔ 目标/锚点 | `displacement: 'swap'` + `CastSnapshot` |
| pull（钩子） | **目标**拉向施法者 | `CombatEvent: pull` + 目标 `unit-cc` |
| pickup（收枪） | 不位移；触发 buff | `CombatEvent: pickup` → `HeroStateStack` |

---

### 18.1 元歌

- 多 `casterId` 映射：`CastSnapshot.casterId` vs `effect.ownerId` 分离
- 分身单位是 **真 Unit**，不是 Effect（与镜锚点、马超枪区分）
- 技能槽位可能共享 CD 组 — `Skill.cooldownGroup?`
- 可控多实体时，`SkillBook`「单 active 实例」约束可能需按 **施法主体** 放宽（单独立项评估）

---

### 18.2 镜（大招圆盘 + 镜像换位）

#### 机制摘要

- **大招圆盘**：`aimKind: area` 选落点，在场上生成持续一段时间的圆形「镜场」；场内可执行换位等交互
- **飞雷神 / 镜像换位**：与己方镜像锚点或场内敌人交换位置；可多锚点

#### 蓝图映射

```text
大招
  delivery: spawn-effect
  effect.kind: arena-field
    position = snapshot.targetPoint
    radius / duration 来自 JSON
    destroyWhenOwnerGone: true（常见）
  tick: 可选 interval-hit；维护场内单位集；与 mirror-anchor 联动
  expired → 清理属主全部 mirror-anchor

飞雷神（留锚点）
  spawn MirrorAnchorEffect（kind: mirror-anchor）
    position 冻结，ownerId 关联
    maxAnchors 配置上限

换位施法
  displacement: 'swap'   // 新增枚举，§18.2 决议
  CastSnapshot.swapAnchorId?  // 与锚点换位
  CastSnapshot.swapTargetId?  // 与敌人换位（复用 targetId 或专用字段）
  → 双向写入 position；产出 CombatEvent: position-swap
```

#### 与现有模块关系

| 能力 | 复用 | 新增 |
|------|------|------|
| 圆盘落点瞄准 | `aimKind: area`、`clampTargetPoint` | — |
| 圆盘持续存在 | 类比 `persistent-area` | `arena-field`（含场地规则，非纯烫地板） |
| 锚点 | 类比 `projectile` 落点 | `mirror-anchor` effect kind |
| 换位 | — | `Displacement: 'swap'` |
| 大招多段 | — | effect 链式 spawn（优于拉长 `activeTime`） |

#### 注意

- 锚点是 **SkillEffectEntity**，不是分身 `Unit`，避免被普攻索敌
- 圆盘是 **场地规则层**，不能退化为仅 `periodic-zone` 烫伤害
- 圆盘（effect）与换位（SkillInstance）生命周期解耦，不违反单 active 实例约束

#### 增量清单（做镜时）

1. `EffectKind: arena-field`、`mirror-anchor`
2. `Displacement: 'swap'` + `applyCombatEvents` 处理 `position-swap`
3. `CastSnapshot` 可选 `swapAnchorId`
4. 场地边界 / 场内判定（`arena-field.containsPoint`）

---

### 18.3 马超（扔枪 / 收枪 / 强化普攻）

#### 机制摘要

- 技能打出枪（弹道飞行）→ 插地或插在敌人身上 → 滞留场上
- 走过拾取或 dash 穿过拾取 → 强化下一次普攻（类比亚瑟一技能 → 强化普攻）

#### 蓝图映射

```text
扔枪
  delivery: spawn-effect → projectile
  命中/落地 → 不 expired，转为 DeployedWeaponEffect（新 kind）
    state: 'ground' | 'stuck-on-target'
    stuck-on-target: 每 tick 同步 target.position

收枪
  DeployedWeaponEffect.tick:
    owner 进入拾取半径 → emit CombatEvent: pickup
    → expired
  applyCombatEvents:
    pickup → HeroStateStack.applyNextAttackEnhancement('auto-attack', { ... })

dash 穿过拾取（可选）
  displacement: dash 路径检测 × deployed effect 重叠（与 TD-2 墙体检测同类扩展）

强化普攻
  复用亚瑟路径：buff 消费时改写本次 auto-attack 的 delivery（thrust 等）
```

#### Effect 多阶段（相对当前二态）

```text
flying → deployed → picked-up (expired)
```

与 `projectile-then-zone`（命中后 spawn 下一实体）同模式；下一阶段是 **可交互滞留物**，不是伤害区域。

#### 增量清单（做马超时）

1. `EffectKind: deployed-weapon`
2. `CombatEvent.kind: 'pickup'`
3. `ProjectileSpec.onExpire: 'deploy-as-weapon'` 或专用 `throw-weapon` effect
4. dash 路径拾取（可选，与 TD-2 一并考虑）
5. `maxDeployed` 按 `ownerId` 计数

#### 注意

- 枪 **不得** 做成 `Unit` 或塞进 `HitShape`
- 强化普攻走 `HeroStateStack`，不在 `machao.ts` 写普攻分叉

---

### 18.4 钟馗（二技能钩子）

#### 机制摘要

- 朝方向抛出钩（直线弹道，不追踪）→ 命中首个合法敌人 → 将 **目标** 拉向施法者 → 钩子消失
- 钩空：超距 `expired`，无后续事件

#### 蓝图映射

```text
二技能
  aimKind: direction
  delivery: spawn-effect
  effect: grapple-projectile（或 projectile + onHit.pull 配置）
    homing: false
    HitPolicy: { maxHits: 1 }
    扫掠碰撞（已有）

  命中时 emit:
    { kind: 'damage', ... }           // 可选
    { kind: 'pull', targetId, toward, speed, duration, stopDistance? }
  → projectile.expired = true

applyCombatEvents → unit-cc:
  pull: 目标每帧向 toward 位移，到达或超时清除
```

#### 与施法者位移的区分

钩子拉的是 **目标**，不是施法者。禁止用 `Skill.displacement: dash` 表达；必须走 `CombatEvent: pull` + 目标 CC。

#### 增量清单（做钟馗时）

1. `CombatEvent.kind: 'pull'` + `PullPayload`
2. `unit-cc` 扩展 `kind: 'pull'`（`toward`、`speed`、`stopDistance`）
3. `ProjectileSpec.onHit.pull` 或 `EffectKind: grapple-projectile`
4. 墙体挡钩（复用 TD-2 `onWallHit`：钩停、不拉人）

#### 边界

| 情况 | 处理 |
|------|------|
| 钩空 | `maxRange` → expired |
| 友军 / 尸体 | `TargetFilter` |
| 拉拽中目标死亡 | pull tick 检测 `hp <= 0` 清除 CC |

#### 复杂度评估

在远期参考英雄中 **最低**：飞行与碰撞直接复用 `projectile`；核心增量为一个 CC kind + 一个 event kind。

---

### 18.5 塔 / 野怪

- `TowerUnit` 已定义；`targetable: false` 对友方
- 野怪 `team: neutral` + `includeNeutral` 策略

---

### 18.6 重构期须守住的扩展性（远期英雄共通）

当前妲己/安琪拉重构 **不必** 等待或预埋下列英雄，但 Phase 1–3 实施时须避免把扩展点写死：

1. **`EFFECT_REGISTRY` 可插拔** — 新 `EffectKind` 只登记 + 注册，不改 `SkillInstance` 主干
2. **`CombatEvent` / `applyCombatEvents` 可扩展** — 预留 `pull`、`pickup`、`position-swap` 等 kind
3. **`unit-cc` 可扩展** — 不只 `knockup`；目标 forced-move 走 CC tick
4. **`Displacement` 枚举可扩展** — 将来加 `swap`，不在 switch 写死四种
5. **`CastSnapshot` 可选字段** — `swapAnchorId`、`swapTargetId` 等按需追加
6. **Effect 阶段转换** — projectile 命中后可 spawn / 变形为下一实体，而非只能 `expired`
7. **脱手物一律 `SkillEffectEntity`** — 枪、锚点、钩子弹道均不是 `Unit`

---

### 18.7 新增 EffectKind 登记（远期）

| kind | 英雄/用途 | 状态 |
|------|-----------|------|
| `arena-field` | 镜大招圆盘 | 远期 |
| `mirror-anchor` | 镜飞雷神锚点 | 远期 |
| `deployed-weapon` | 马超滞留枪 | 远期 |
| `grapple-projectile` | 钟馗钩子（或并入 projectile + onHit） | 远期 |
| `beam-channel` | 安琪拉光束 | P1（见 §14） |
| `wall-bounce-projectile` | 碰墙反弹 | P2（TD-2） |

新 kind 实现前须在本表与 §6 登记，再写代码（见 §20）。

---

## 19. 参考实现映射（当前代码 → 目标）

| 目标模块 | 当前文件 | 动作 |
|----------|----------|------|
| CastSnapshot | `skills/cast-snapshot.ts` | 保留 |
| SkillInstance | `skills/runtime.ts` | 拆出 delivery |
| hits | `skills/hits.ts` | 保留；仅服务 HitGeometry |
| Effect | `world/skill-effects/*` | 保留；接入 Settlement |
| TargetFilter | `combat/target-filter.ts` | 保留；扩展 targetable |
| Settlement | — | **新建** |
| Registry | `heroes/effect-loader.ts` | **重构为 registry** |
| Hero build | `heroes/arthur.ts` 等 | **极薄化** |
| Aim | `input/cast-aiming.ts` | 保留；补 `aim` 字段来源 |
| Session | `world/practice-session.ts` | 改用 `applyCombatEvents` |

---

## 20. 文档维护

- 本文件为技能域 **唯一架构蓝图**；`blueprint-skills-caster.md` 仅作历史调研记录。
- 重构归档时同步更新 `DEV.md` §4 技能栈描述。
- 新 effect kind 必须先在本文件 §6 / §9 / §18.7 登记，再写代码。
- 远期英雄（镜、马超、钟馗等）机制映射见 **§18**，开工前对照 §18.0 速查表与 §18.6 扩展性清单。
