## Why

当前技能运行时以「施法者当前位置 + 瞬时命中盒」为中心，亚瑟近战练习场可用，但无法表达远程英雄所需的施法快照、目标锁定、弹道生命周期与脱手实体（如安琪拉二技能大火球）。`hits.ts` 五类几何可复用，但缺少阵营/存活粗筛、`CastSnapshot`、独立 `SkillEffectEntity` 与扫掠碰撞，导致锁定施法会在前摇期间改打他人、友伤/尸体命中、高速弹道穿透等问题。

妲己与安琪拉可覆盖远程体系最关键机制（指定目标追踪、多枚弹道、弹道转持续区域、周期地面伤害）；元歌/镜的复杂位移与多实体控制延后。本变更修订 `docs/DEV.md` 排期：在 M4 前插入远程英雄运行时与两位英雄的验收实现，避免在 `SkillInstance` 上持续堆特例。

## What Changes

- 引入不可变 `CastSnapshot`（`casterId`、`origin`、`direction`、`targetId`/`targetPoint`、`skillId`、`castId`），替换仅含 `forwardRad` 的 `CastOptions` 施法语义（**BREAKING**：`startSkill` / `SkillBook.start` 入参）
- 新增 `TargetFilter`：在命中查询前过滤阵营、存活、可选中；视野仍由 `DamageFormula` + `canSee` 在结算时判定（双层职责）
- 为 `Unit` 增加 `collisionRadius`（hurtbox），弹道使用 `previousPosition → position` 胶囊扫掠碰撞
- 在 `WorldState` 维护独立 `effects` 集合（`ProjectileEffect`、`PersistentAreaEffect`）；技能前摇结束 spawn effect，施法槽结束后弹道/区域继续存在
- 扩展 `hero-kit` `effect.kind` 与 loader，新增妲己、安琪拉 JSON + loader；练习场支持英雄切换（至少亚瑟 / 妲己 / 安琪拉）
- 属性快照默认在 effect 生成时冻结为 `DamageSnapshot`；脱手实体默认 `destroyWhenOwnerGone: false`；追踪弹道 `onTargetLost` 按技能配置
- 安琪拉光束（channel/beam）建模 **暂缓**：在 design 中定义验收标准与两种方案对比后再实现
- 元歌、镜、真视野系统、空间哈希、`map.yaml` 仍不在本变更范围

## Capabilities

### New Capabilities

- `cast-snapshot`: 不可变施法快照契约、`SkillBook`/`startSkill` 接入与 `targetId` 锁定语义
- `skill-effect-entities`: 世界层 effect 生命周期、弹道扫掠碰撞、弹道转持续区域、周期地面命中
- `combat-targeting`: `TargetFilter`、单位 `collisionRadius`、与 `hits.ts` 几何层协作
- `hero-daji`: 妲己四槽位数据与指定目标/多枚弹道验收
- `hero-angela`: 安琪拉四槽位数据、大火球与持续区域验收（光束子能力待 spike 后补 spec）

### Modified Capabilities

- `practice-session`: 英雄无关施法入口、世界 effect tick、多英雄练习场切换、reset 清理 effects

## Architecture Impact

- **复用**：`hits.ts` 五类 `HitShape` 降级为纯几何；`findNearestEnemy` / `auto-attack-intent` 的锁敌逻辑可复用于施法时 `targetId` 解析；`hero-kit` 四槽位模版；`HitboxVfx` 可扩展 effect 可视化
- **扩展 G2 契约**：`types.ts` 新增 snapshot/filter/effect 类型；`runtime.ts` 拆分 instant 结算与 effect spawn；`WorldState` 拥有 `effects` 集合与 tick
- **边界**：`GameCanvas` 仅编排；伤害飘字仍走 `notifyDamage`；不引入新依赖；不大改 `src/engine/` 核心循环接口
- **测试**：`hits`/`runtime` 单测扩展；新增 effect 碰撞与 filter 单测；妲己/安琪拉机制单测或 session 级集成测
- **文档**：需同步修订 `docs/DEV.md` 里程碑（M4 前插入本变更；元歌/镜仍冻结至原 M4 退出门之后）

## Impact

- `src/game/skills/types.ts`、`hits.ts`、`runtime.ts`、`skill-book.ts`
- `src/game/world/WorldState.ts`、`practice-session.ts`；可选 `src/game/world/skill-effects/`
- `src/game/heroes/hero-kit.ts`、`daji.json`、`daji.ts`、`angela.json`、`angela.ts`
- `src/game/combat/auto-attack-intent.ts`（锁敌复用，非重写）
- `src/ui/components/GameCanvas.tsx`、英雄选择 UI（最小）
- `tests/skills/`、新增 `tests/world/` 或 `tests/combat/`
- `docs/DEV.md`、`docs/blueprint-skills-caster.md`（引用关系）
