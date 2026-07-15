## Context

亚瑟是首个完整英雄；`arthur.json` 已有 4 槽位但语义过时。用户确认的机制：一技能 **加速 + 强化下一次普攻为 dash**；二技能 **周围周期伤害圈**；三技能 **先 dash 到敌人区域 + 同半径落地圈伤/击飞**；击飞显示在血条上方。后续元歌/镜需复用 **四技能模版**。

约束：M4 前无新依赖；`practice-session` 已抽出；`GameCanvas` 只编排。

## Goals / Non-Goals

**Goals:**
- 四槽位英雄 JSON + TypeScript 契约（`0` 普攻 + `1/2/3` 主动），亚瑟为首例，字段可扩展
- 亚瑟三主动按用户描述可辨认（强化普攻 dash、周期圈、落地圈击飞）
- 最小击飞 CC + 血条上方状态显示
- 单测覆盖 CC、周期伤害盒、空 A 与强化普攻 dash

**Non-Goals:**
- 障碍碰撞 / dash 撞墙（T36.1，后续 change）
- 被动圣光守护（T35.3，可并行）
- 击飞 Y 轴抛起动画（MVP 仅状态 + 血条文案）
- 元歌/镜具体技能实现
- 改 SkillHud 布局或热键数量

## Architecture Assessment

### Existing Design Reuse

- `auto-attack-intent` + `findNearestEnemy`：普攻有目标时锁敌；强化状态放大出手距离并由普攻实例 dash
- `SkillInstance` active 阶段：扩展为支持 `tickInterval` 周期性 `resolveHits`（二技能）
- `makeSkill` + `arthur.ts` loader：loader 只把 `effect.kind` 映射为通用运行时钩子；数值保留在 JSON
- `createHeroStateStack`：统一承载属性叠加、目标技能、剩余次数、持续时间，以及 dash 的索敌模式/独立获取范围/速度；`BuffBag` 作为兼容别名
- `practice-session` postTick：施加 CC、消费击飞计时
- `WorldHpBars`：扩展第二行 sprite 或 canvas 绘制状态文案

### Boundaries and Ownership

| 边界 | 所有者 | 职责 |
|---|---|---|
| Hero kit 契约 | `src/game/heroes/hero-kit.ts`（新） | 四槽位 JSON 类型、运行时校验 hotkey 0–3 与 `effect.kind` |
| Arthur loader | `arthur.ts` | JSON → `Skill[]`，只编排已定义的通用效果 |
| CC 状态 | `src/game/combat/unit-cc.ts`（新） | `applyKnockup`、`tickCc`、`clearCc` |
| 间歇 AoE | `runtime.ts` / `Skill` 可选字段 | active 内按 interval 结算 |
| 落地二次 AoE | `arthur.ts` 三技能 `onLand` 或 `postActive` 钩子 | 共享 `aoeRadius` |
| CC tick | `practice-session` | 每帧 `tickCc` on all units |
| 状态 UI | `WorldHpBars` | 读 `unit.cc` 绘制血条上方 |

失败：无目标时普攻不 start；点一技能即直接位移；三技能无目标走现有 targeted 取消流。

### Options and Rationale

1. **四槽位模版独立类型文件** vs 只改 `arthur.json`：选独立 `hero-kit.ts`，元歌/镜只加 JSON + loader。**理由**：用户明确要求预留模版。
2. **一技能状态**：选 **移速属性状态 + 针对 `auto-attack` 的一次 dash 强化**，强化单独指定 `acquireRange`、`distance`、`speed`；由下一次普攻出手消耗。
   - `locked`：成功索敌后覆盖轮盘方向，本次追击不可被手动移动取消。
   - `forward`：不索敌，以释放瞬间朝向为快照突进配置距离。
   - `locked-or-forward`：技能独立索敌范围内有目标时走 `locked`，否则走 `forward`。
3. **二技能间歇** vs 单帧 `hits:3`：选 **active 内 `damageInterval` tick**。**替代**：拉长 active 多帧同一公式 — 等价，用 interval 字段数据驱动。
4. **击飞** vs 眩晕字段 `stunDuration`：选 **击飞 CC**（`knockup`），JSON 改 `knockupDuration`。**替代**：复用 stun 名 — 拒绝，UI 与语义用击飞。
5. **CC 在 Unit 上** vs 独立 `CcBag`：选 **Unit 可选 `cc: { kind, remaining }`**，木人桩够用。**替代**：全局 Map — 过度。

### Quality Attributes

- **可测试性**：CC tick、interval 伤害盒次数、空 A 和强化消耗可单测，不依赖 Three
- **可维护性**：半径只定义在二技能 `hit.radius`，三技能落地圈读取该 canonical 值；效果数值没有第二来源
- **可扩展性**：`hero-kit.ts` 导出 `HeroSkillSlot` 供未来 `yuange.json` 复用
- **性能**：间歇 tick 仅 active 单实例，O(units) CC tick 可接受

### Complexity and Exceptions

新增抽象：**hero-kit 契约**、**unit-cc 小模块**、**Skill.damageInterval**（可选字段）。不引入事件总线或新包。验证：vitest + 手测 0/1/2/3；回滚：revert 本 change。

## Decisions

1. **四技能模版**：`heroes/<id>.json` MUST 含 `skills` 数组且恰好覆盖 hotkey `0`,`1`,`2`,`3` 各一项；`hero-kit.ts` 提供 `assertFourSkillKit(data)`，并在加载时校验每个 `effect.kind` 的字段。替代：继续亚瑟专用 — 拒绝。
2. **一技能**：`active` 开始时在英雄状态栈挂移速与针对 `auto-attack` 的 `locked-or-forward` dash，`charges: 1`；下一次普攻启动时消耗。
3. **二技能**：`hit: circle` 的 `radius` 是范围唯一来源；`effect.kind: periodic-damage` 携带 `damage`、`damageInterval`、`damageTicks`；`activeTime >= ticks * interval`。替代：固定 3 hits 单帧 — 拒绝。
4. **三技能**：`effect.kind: dash-landing-knockup`；按 `dashSpeed` 逐帧到目标区域；仅在抵达后触发与二技能同半径的落地圈与 `applyKnockup(duration)`。
5. **击飞显示**：`WorldHpBars` 在 `offsetY + statusOffset` 绘制短文案「击飞」或图标；`remaining > 0` 时可见。替代：飘字 — 不够持久。
6. **共享半径**：`ARTHUR_AOE_RADIUS` 仅从 JSON 二技能的 `hit.radius` 读取，三技能 `onLand` 引用同一值。

## Risks / Trade-offs

- [强化普攻与普通普攻分叉] -> 把 dash 作为本次普攻 `Skill` 实例的位移属性，伤害仍走同一命中盒
- [间歇伤害与 activeTime 对齐] -> JSON 显式 `damageTicks` + `damageInterval`，单测断言 tick 次数
- [无碰撞时突脸穿障碍] -> 接受至 T36.1；design 注明 dash 终点暂不做障碍裁剪
- [BREAKING 旧一技能手感] -> 更新 DEV.md 机制表；手测清单重写

## Migration Plan

1. 新增 `hero-kit.ts` + 扩展 schema
2. 改 `arthur.json` / loader
3. 实现 CC + runtime interval + 三技能落地圈
4. `practice-session` tick CC；`WorldHpBars` 状态
5. 单测 + 手测；`pnpm typecheck/test/lint/build`
6. 归档后 delta 合入 `openspec/specs/`

回滚：按提交粒度 revert；JSON 可保留备份字段注释。

## Open Questions

- 一技能本身默认 **仅挂 buff 不位移**；位移由下一次普攻触发（已决）
- 击飞期间木人桩是否免疫新伤害：默认 **仍受伤**，仅显示状态（可后续加 `canAct`）
- 三技能落地圈是否击飞施法者自己：默认 **否**，仅敌人/木人桩
