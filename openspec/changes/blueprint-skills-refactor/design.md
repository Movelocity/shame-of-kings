## Context

当前技能栈是多次增量 change 叠加的结果，存在大量「迁移中」代码：`CastOptions` 适配、`DamageFormula` 与 `EffectDamageEvent` 双轨、`Skill.hit` 混用、`effect-loader` switch、`arthur.ts` 207 行特例。

用户明确要求 **不留手、彻底重构**。因此本 design 放弃渐进双轨、legacy 回滚、type alias 过渡等保守策略，**一次性切到 `docs/blueprint-skills.md` 目标态**。

约束不变：无新 npm 依赖；不大改 `src/engine/`；元歌/镜/真视野/墙体仍冻结。

## Goals / Non-Goals

**Goals:**

- 单次 change 完成后，技能域仅存在蓝图描述的一套路径
- 删除所有 deprecated 类型与模块（见 Decisions §删除清单）
- 三英雄 JSON + loader + 验收矩阵绿灯
- apply 开始前 archive 已完成的历史 changes

**Non-Goals:**

- 元歌/镜/马超/钟馗、真视野、墙体、空间哈希、被动系统、技能编辑器

## Architecture Assessment

### Target State（apply 完成后的模块图）

```text
heroes/
  hero-kit.ts         JSON 契约（无顶层 hit）、assertEffectConfig、resolveDelivery
  build.ts            buildHeroSkills(heroData) → Skill[]
  effect-registry.ts  EFFECT_REGISTRY
  arthur.ts           export buildHeroSkills(ARTHUR_DATA) + 常量 helper
  daji.ts / angela.ts 同上

combat/
  settlement.ts       settleHit, applyCombatEvents  ← 唯一 hp/cc 入口
  target-filter.ts    粗筛 + targetableOnly
  unit-cc.ts          CC tick（被 applyCombatEvents 调用）

skills/
  types.ts            Skill { delivery, aim? }；CombatEvent；无 DamageFormula
  runtime.ts          SkillInstance 按 delivery.mode；onLand → CombatEvent[]
  hits.ts             resolveHits(HitGeometry)
  skill-book.ts       start(skill, caster, snapshot: CastSnapshot)

world/skill-effects/
  *.ts                tick → CombatEvent[]；CollisionShape 独立字段
  types.ts            无 EffectDamageEvent

practice-session.ts
  postTick: tickCc → skillBook.tick → tickEffects → applyCombatEvents
```

### 删除清单（apply 结束时 MUST 不存在）

| 符号/文件 | 原因 |
|---|---|
| `effect-loader.ts` | 由 registry 替代 |
| `CastOptions` | 由 CastSnapshot 替代 |
| `DamageFormula` / `DamageResult`（扣血用途） | 由 CombatEvent 替代 |
| `EffectDamageEvent` | 同上 |
| `applyDamage` / `simpleDamage` / `arthurDamage` | 由 applyCombatEvents 替代 |
| `Skill.hit` / `Skill.damage` / JSON 顶层 `hit` | 由 aim + delivery 替代 |
| `HitShape` 类型名 | 重命名为 HitGeometry |
| hero loader 内 effect.kind 分支 | 由 buildHeroSkills 替代 |
| `buildSkillLegacy` / 任何双轨开关 | 彻底重构不留回滚路径 |

### Boundaries

- `SkillInstance.cancel()` 不销毁已 spawn effects（不变）
- `WorldState.effects` 所有权不变
- `buildHeroSkills` 结果按 heroId 缓存于 `heroes/index.ts`
- 失败：settleHit 返回 null → 不产出 event

## Decisions

1. **一次性切换，无过渡层** — 不保留 DamageFormula 适配至「Phase 6」；types 改完即删旧字段，测试同 PR 全改
2. **`HitShape` 直接 rename 为 `HitGeometry`** — 不做 alias；全 repo 一次性替换
3. **JSON 删除顶层 `hit`** — 各技能改为 `aim` + `effect` 内几何；校验器拒绝旧字段
4. **`Skill.onLand` 返回 `readonly CombatEvent[]`** — 击飞/伤害均走 event
5. **`world.tickEffects` 返回 `readonly CombatEvent[]`** — 删除 `damageEvents` / `effectEventsToDamageResults`
6. **`sourceTeam` 仅 `caster.team`** — 测试 fixture 显式设 team
7. **无 legacy loader** — 亚瑟与远程英雄同走 `buildHeroSkills`；`arthur.ts` 只保留 passive 常量 helper（若仍需）
8. **前置 archive** — apply 第一步 archive `remote-hero-skill-runtime`、`cast-aiming-hold-release`、`skill-stick-area-aim`、`arthur-four-skill-kit`，再 sync 到 main specs

## Risks / Trade-offs

- [单次 PR 面大] → 按模块并行 workstream，主 agent 统一 merge；每完成一模块跑子集测试，最后全量
- [测试大量改写] → 接受；旧测试绑定废弃 API 的直接删改，不保留 skip
- [无回滚开关] → git revert 整 commit；不在代码内留双轨
- [JSON BREAKING] → 三英雄 JSON 在本 change 内全部更新；校验器拒绝旧 schema

## Migration Plan

```text
Step 0 — archive 已完成 changes → sync main specs
Step 1 — 冻结新 types（SkillDelivery, CombatEvent, HitGeometry）+ settlement.ts
Step 2 — 删旧 types/API（DamageFormula, CastOptions, EffectDamageEvent, applyDamage）
Step 3 — runtime + SkillInstance 按 delivery 重写
Step 4 — effect entities + registry + buildHeroSkills
Step 5 — 三 hero JSON 迁移 + 薄 loader
Step 6 — practice-session / VFX / 测试全改 + 文档
```

**无分阶段 legacy**。Step 1–2 可在同一 workstream 连续提交，中间允许短暂编译红，但 merge 前必须全绿。

## Open Questions

- 亚瑟 passive（脱战回血）是否仍留 `arthur.ts`？→ 是，被动不走 SkillBook，可保留独立小模块
- `getArthurAoeRadius` 等常量 helper → 从 JSON effect 读取，放 `build.ts` 或 `arthur.ts` 导出，不含 loader 逻辑
