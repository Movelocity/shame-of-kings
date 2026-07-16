## Context

当前技能栈（M2/M3）以 `SkillInstance` 状态机 + `hits.ts` 五类几何为核心：active 阶段按 tick 调用 `resolveHits`，伤害在施法槽内结算。亚瑟近战、木人桩单目标场景下可用；`practice-session` 在施法时通过 `findNearestEnemy` 解析方向，但 **不保存 `targetId`**，`hit.target` 在结算时仍做最近邻查询。

代码现状与蓝图差异（调研校正）：

| 蓝图表述 | 实际代码 | 结论 |
|---|---|---|
| `origin` 是可变引用 | `startSkill` 已拷贝 `{ x, z }` | 原点值已不可变；问题在于 `hitOrigin` 默认 `caster` 使多数技能仍跟随施法者 |
| `originOverride` 未使用 | `resolveHits` 接收且 `hitOrigin()` 传入 | 已接线；缺的是 snapshot 级 `targetId` 与 effect 生命周期 |
| 无阵营过滤 | `hits.ts` 仅跳过自身；`findNearestEnemy` 有阵营/死亡过滤 | 伤害路径不统一，多单位时友伤风险仍在 |

约束：`docs/DEV.md` 原冻结 M4 前新英雄；本 change **经确认**修订为全矩阵（基础设施 + 妲己 + 安琪拉），元歌/镜仍冻结。M4 前不引入新依赖、不大改 `src/engine/`。`unitsNear` 全量返回可接受至单位数增多前。

## Goals / Non-Goals

**Goals:**

- 建立三层模型：`CastSnapshot` → `SkillEffectEntity` → `HitGeometry` + `TargetFilter` + `HitPolicy`
- 修正命中粗筛（阵营/存活/可选中）与 hurtbox 扫掠碰撞
- 妲己验收：锁定目标、多枚弹道、命中时结算
- 安琪拉验收：大火球 → 持续区域（光束 spike 后另开 delta）
- 练习场多英雄切换，session 统一 tick effects

**Non-Goals:**

- 元歌/镜、分身、换位
- 真视野系统、草丛、`canSee` 完整实现（继续 stub 为全可见即可）
- 空间哈希 / `unitsNear` 优化（P2）
- `BeamEffect` 最终实现（仅 spike）
- 多木人桩 MOBA 地图、塔野

## Architecture Assessment

### Existing Design Reuse

| 资产 | 复用方式 |
|---|---|
| `HitShape` + `hits.ts` | 保持纯几何；`resolveHits` 增加 `origin` 参数，逐步减少传整个 `caster` 作中心 |
| `findNearestEnemy` / `auto-attack-intent` | 施法时锁 `targetId`；普攻粘性锁敌逻辑不变 |
| `hero-kit` 四槽位 | 扩展 `effect.kind`：`projectile`、`projectile-zone`、`periodic-zone` 等 |
| `SkillInstance` 状态机 | 保留前摇/active/后摇；active 结束时可 **spawn** effect，而非延长 active 模拟飞行 |
| `simpleDamage` / `arthurDamage` | 视野仍在 formula；补充对 `TargetFilter` 后目标的数值结算 |
| `HitboxVfx` | 弹道/区域可视化可后续接 effect 位置；不阻塞逻辑层 |

### Boundaries and Ownership

```text
practice-session
  ├─ 英雄选择、cast 入参、preTick/postTick 编排
  └─ postTick: skillBook.tick → world.tickEffects → applyDamage

SkillBook / startSkill
  ├─ 消费 CastSnapshot
  └─ cast 结束 / onActivate: spawnEffect(...)

WorldState
  ├─ units: Map<id, Unit>
  └─ effects: Map<effectId, SkillEffectEntity>  ← 新增所有权

skill-effects/ (新目录，建议)
  ├─ types.ts          SkillEffectEntity, DamageSnapshot, HitPolicy
  ├─ projectile.ts     扫掠碰撞 + homing
  ├─ persistent-area.ts
  └─ spawn.ts          工厂：从 skill effect JSON → entity

combat/
  └─ target-filter.ts  阵营/存活/可选中（不含视野）
```

- **失败/取消**：`SkillInstance.cancel()` 不销毁已 spawn effects；`resetWorld` 全清
- **并发**：单线程固定步；effects 在 postTick 顺序 tick
- **资源释放**：effect `expired` 当帧从 map 移除；reset 批量清空

### Options and Rationale

**1. 视野 vs 粗筛分层（已决：双层职责）**

| 方案 | 优点 | 缺点 |
|---|---|---|
| 全放 TargetFilter | 查询层干净 | 视野是观察者相对的；弹道飞行中草丛变化难表达；与 `types.ts` 契约冲突 |
| 全放 DamageFormula | 与现有契约一致 | 几何层返回幽灵命中，effect 穿透计数逻辑复杂 |
| **粗筛 TargetFilter + 结算 canSee** | MOBA 常见分工；各层职责清晰 | 两层都要测 |

**选择**：`TargetFilter` = 阵营、存活、`targetable`；`DamageFormula` = 视野 + 数值。理由：视野依赖 observer，且未来可有「无视草丛」技能在 formula 层覆盖。

**2. 脱手实体：Unit vs SkillEffectEntity（已决：独立 entity）**

Unit 会进入索敌、需 hp/cc/isStatic 等字段，火球/地面圈语义污染。独立 entity 成本可控（一个 map + tick 循环）。

**3. 飞行时间：拉长 activeTime vs 独立弹道（已决：独立弹道）**

拉长 activeTime 会让 CD/后摇/施法槽与弹道耦合；安琪拉火球需脱手。active 结束 spawn effect 是正确边界。

**4. 光束：SkillInstance channel vs BeamEffect（暂缓）**

| 方案 | 适用场景 | 风险 |
|---|---|---|
| `SkillInstance` active + `hitOrigin:'caster'` + interval | 光束跟随施法者、施法者动则光束动 | 施法者位移/打断/CC 与光束结束条件纠缠在 instance 内 |
| `BeamEffect` 实体 | 光束有宽度、多段 tick、可配置打断 | 多一种 entity 类型与 VFX 同步 |

**暂缓**：在 Open Questions 中列 spike 验收项后再选。

### Quality Attributes

- **可测试性**：扫掠碰撞、filter、snapshot 冻结、spawn→zone 转换均做纯函数单测
- **性能**：练习场 2–3 单位 + 若干 effects 可接受全量 `unitsNear`；每弹道 tick O(n) 注明技术债
- **可维护性**：英雄 loader 只映射 `effect.kind` → spawn 工厂，避免 `SkillInstance` 内英雄 if-else
- **兼容性**：`CastOptions` → `CastSnapshot` 为 **BREAKING**；亚瑟技能迁移到新入参但行为不变

### Complexity and Exceptions

新增 `skill-effects/` 与 `target-filter.ts` 属于「当前真实复杂度」（远程/脱手），非元歌预埋。控制方式：

- 第一期仅 `ProjectileEffect` + `PersistentAreaEffect` 两种实体
- `HitPolicy` 最小字段：`maxHits`、`maxHitsPerTarget`、`pierce`
- 验证：亚瑟全技能回归 + 妲己/安琪拉验收矩阵
- 回滚：feature flag 或练习场仅亚瑟模式可保留旧路径至迁移完成

## Decisions

### D1: CastSnapshot 替代 CastOptions 施法语义

- **选择**：`CastSnapshot` 为 `startSkill` 唯一施法上下文；`dashDistance` 等衍生字段在 snapshot 构建时写入
- **替代**：保留 `CastOptions` 并额外挂 `targetId` — 拒绝，字段会继续散落

### D2: 伤害默认生成时快照

- **选择**：`DamageSnapshot` 在 effect spawn 时冻结
- **替代**：命中时读属性 — 适合持续施法/叠层，但妲己/安琪拉弹道更常见快照；技能级 `damageAtHitTime` 留扩展

### D3: 默认脱手存活

- **选择**：`destroyWhenOwnerGone` 默认 `false`
- **替代**：默认随施法者消失 — 不符合安琪拉火球常见表现

### D4: hero-kit effect.kind 扩展

建议新增：

```ts
| { kind: 'spawn-projectile'; speed; maxRange; homing?; onTargetLost?; pierce?; ... }
| { kind: 'projectile-then-zone'; projectile: {...}; zone: { radius; tickInterval; ticks; damage } }
| { kind: 'periodic-zone'; radius; tickInterval; ticks; damage }
```

loader 映射到 `spawn.ts`，不在 `arthur.ts` 式大 switch 里堆英雄特例。

### D5: 练习场英雄切换

- **选择**：session 构造时或 DEV 下拉切换 `HeroId`；切换触发 `resetWorld`
- **替代**：三个独立场景 — 测试矩阵成本高

## Risks / Trade-offs

- **[Risk] DEV.md 排期冲突** → 本 change 归档时同步修订 `docs/DEV.md`，写明 M4 前远程英雄试点与元歌/镜仍后置
- **[Risk] BREAKING 施法入参影响面广** → 先改 `skill-book`/`runtime` 测试，亚瑟回归绿灯后再接新英雄
- **[Risk] 单木人桩无法测友伤过滤** → 单测用 mock 多单位；可选第二个中立桩作 P2 手测增强
- **[Risk] 全量 unitsNear + 多弹道 tick** → 练习场规模可接受；design 记录 P2 空间哈希
- **[Risk] 光束未定义导致安琪拉技能不全** → spec 明确光束不阻塞本 change DoD；spike 后补 delta

## Migration Plan

1. **Phase A — 基础契约**：`CastSnapshot`、`TargetFilter`、`collisionRadius`；亚瑟迁移新入参；补 filter 单测
2. **Phase B — Effect 运行时**：`WorldState.effects`、`ProjectileEffect`、扫掠碰撞、`PersistentAreaEffect`
3. **Phase C — Session 接线**：postTick tick effects；reset 清理；英雄无关 cast
4. **Phase D — 妲己**：JSON + loader + 验收
5. **Phase E — 安琪拉**：火球→区域；光束 spike 并行调研不阻塞 E 的 logic 验收
6. **Phase F — 文档**：更新 `DEV.md`、归档 change

回滚：保留亚瑟-only 路径至 Phase C 完成；若 effect 系统异常，可暂时禁用妲己/安琪拉英雄切换。

## Open Questions

### Q1: BeamEffect 建模 spike（阻塞安琪拉完整四技能）

**Spike 结论（2026-07-16）**

| 维度 | SkillInstance channel | BeamEffect 实体 |
|---|---|---|
| 跟随施法者移动 | 原生（`hitOrigin:'caster'` + 每 tick resolveHits） | 需每 tick 同步 origin/forward |
| 打断/CC | 与 instance.cancel() 天然绑定 | 需显式监听 owner 状态 |
| 宽度/多目标 | 用 `rect`/`cone` HitShape 每 tick | 独立 entity 维护扫掠盒 |
| 与 VFX | `HitboxVfx.spawnAttached` 可直接复用 | 需 effect 位置驱动 VFX |
| 复杂度 | 低（复用现有状态机） | 中（新 entity 类型 + 生命周期） |

**推荐**：短期光束用 **SkillInstance active channel**（方案 A），与现有 `HitboxVfx` 复用；若后续需要「脱手光束」「光束拐弯」再引入 `BeamEffect`。

**估算**：方案 A 约 0.5–1 工日；方案 B 约 2–3 工日。

**决议**：开 follow-up change 实现安琪拉一技能/三技能光束；本 change 不实现。

spike 原始验收项：

1. 安琪拉光束技能的真实机制表：是否跟随移动、是否可打断、宽度/长度、tick 间隔、是否穿透
2. 对比原型：A) `SkillInstance` active channel vs B) `BeamEffect` 实体
3. 与 `HitboxVfx.spawnAttached` 复用关系
4. 推荐方案 + 估算工作量

**本 change 不实现光束**，spike 可在 Phase E 期间由 sub-agent 调研，主 agent 合并结论后开 follow-up change。

### Q2: 妲己具体技能机制数值

需对照王者/策划源表确定各槽位是单体追踪还是扇形等；实现时以 JSON 为准，本 design 不限定具体技能名。

### Q3: 第二练习目标

是否增加第二个木人桩验证 AoE/友军过滤手测 — 建议单测覆盖即可，手测 P2 再加。
