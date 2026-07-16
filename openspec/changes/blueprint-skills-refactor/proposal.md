## Why

`docs/blueprint-skills.md` 已冻结技能域目标架构，但当前实现仍停留在增量补丁阶段：`Skill.hit` 兼做预览与结算、`DamageFormula` 与 `EffectDamageEvent` 双轨、`effect-loader` switch、亚瑟内联伤害/击飞。继续渐进迁移只会长期维持两套并行路径，增加回归面与认知负担。

**本变更采用彻底重构策略**：一次性切到蓝图目标契约，不保留 legacy 适配层、不回滚开关、不分阶段留旧 API。验收标准不变（亚瑟 + 妲己 + 安琪拉矩阵零行为回归），但实现路径是「删旧建新」而非「双轨过渡」。

## What Changes

- **统一 Settlement**（**BREAKING**）：新建 `settlement.ts`；删除 `DamageFormula`、`DamageResult` 扣血路径、`EffectDamageEvent`、`applyDamage`；全部改为 `CombatEvent` + `applyCombatEvents`
- **Skill 契约重写**（**BREAKING**）：`Skill` 移除 `hit`、`damage`、`damageInterval`、`damageTicks`、`onLand → DamageResult[]`；改为 `delivery: SkillDelivery` + 可选 `aim`；`onLand` 产出 `CombatEvent[]`
- **JSON 契约重写**（**BREAKING**）：槽位删除顶层 `hit`；瞄准走 `aim`，结算几何走 `effect`/`delivery`；三英雄 JSON 同步迁移
- **类型重命名**（**BREAKING**）：`HitShape` → `HitGeometry`；新增 `CollisionShape`；`hits.ts` 仅服务 `HitGeometry`
- **`EFFECT_REGISTRY` + `buildHeroSkills`**：删除 `effect-loader.ts`；`arthur.ts`/`daji.ts`/`angela.ts` 降为薄包装（各 ≤ 30 行）；删除一切 per-hero effect 分支
- **删除 `CastOptions`**：`SkillBook.start` / `startSkill` 仅 `CastSnapshot`
- **effect 实体补齐**：`castId`、`destroyWhenOwnerGone`；tick 仅产出 `CombatEvent`；`convergent-burst` 实现 `spawnInterval`
- **`Unit.targetable`** + `TargetFilter.targetableOnly` 一次落地
- **安琪拉三技能**：`beam-channel`（interval-hit + `hitOrigin: 'caster'`）；删除 `periodic-zone` spawn 临时方案
- **归档前置**：apply 前 archive 已完成的 `remote-hero-skill-runtime` 等 active changes，避免 delta 与主 spec 冲突
- 不在范围：元歌/镜/马超/钟馗、真视野/草丛、墙体、空间哈希

## Capabilities

### New Capabilities

- `combat-settlement`: 唯一结算管线；删除旧 damage 类型
- `skill-delivery`: `SkillDelivery` + `resolveDelivery`；`SkillInstance` 仅按 delivery 分支
- `geometry-separation`: `aim` / `HitGeometry` / `CollisionShape` 三分离；JSON 无顶层 `hit`
- `effect-registry`: `EFFECT_REGISTRY` + `buildHeroSkills` + heroId 缓存；删除 `effect-loader`
- `hero-kit-unified-build`: 三英雄统一构建；删除 loader 内联逻辑
- `beam-channel`: 安琪拉三技能 beam

### Modified Capabilities

- `practice-session`: 仅 `applyCombatEvents`；删除 `applyDamage` / `effectEventsToDamageResults`
- `cast-snapshot`: 删除 `CastOptions`
- `skill-effect-entities`: `CombatEvent` only；`castId`；convergent `spawnInterval`
- `combat-targeting`: `targetable` + 全路径 settlement 视野
- `hero-daji` / `hero-angela` / `hero-four-skill-template`: 薄 loader + 新 JSON 契约

## Architecture Impact

- **删除**：`effect-loader.ts`、`CastOptions`、`DamageFormula`、`EffectDamageEvent`、`applyDamage`、`simpleDamage`、`arthurDamage`
- **新建**：`combat/settlement.ts`、`heroes/build.ts`、`heroes/effect-registry.ts`
- **重写**：`skills/types.ts`、`runtime.ts`、`hero-kit.ts`、三 hero JSON、三 hero loader
- **无 legacy 开关**：不保留 `buildSkillLegacy` / 双轨 runtime
- **测试**：全量单测随 PR 一次性更新；架构 regression 禁止旧符号复现

## Impact

- 技能域几乎所有 `src/game/skills/`、`src/game/combat/`、`src/game/heroes/`、`src/game/world/skill-effects/`、`practice-session.ts`
- 全部 `tests/skills/`、`tests/world/`、`tests/heroes/`、`tests/combat/` 需同步改写
- `docs/DEV.md`、`docs/blueprint-skills.md` 状态更新
