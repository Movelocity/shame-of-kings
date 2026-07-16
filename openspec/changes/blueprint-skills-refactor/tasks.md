## 0. 前置 — Archive & Spec Sync

- [ ] 0.1 Archive 已完成 changes：`remote-hero-skill-runtime`、`cast-aiming-hold-release`、`skill-stick-area-aim`、`arthur-four-skill-kit`
- [ ] 0.2 Sync delta specs 到 `openspec/specs/`（cast-snapshot、skill-effect-entities、combat-targeting、hero-daji、hero-angela 等）
- [ ] 0.3 确认 main specs 与 blueprint 一致，无冲突 delta

## 1. 新契约 — Types & Settlement（与删旧同步）

- [ ] 1.1 新建 `src/game/combat/settlement.ts`：`SettlementSpec`、`CombatEvent`、`settleHit`、`applyCombatEvents`
- [ ] 1.2 重写 `src/game/skills/types.ts`：`Skill { delivery, aim? }`；`SkillDelivery`；`HitGeometry`（rename from HitShape）；`CollisionShape`；`CombatEvent` 联合类型
- [ ] 1.3 **删除** `DamageFormula`、`DamageResult`（扣血用途）、`CastOptions`、`EffectDamageEvent`、`Skill.hit`、`Skill.damage`、`Skill.damageInterval`、`Skill.damageTicks`
- [ ] 1.4 `Skill.onLand` 签名改为 `→ readonly CombatEvent[]`；`SkillInstance` .damage 改为 .events 或同等结构
- [ ] 1.5 `Unit` 新增 `targetable: boolean`（默认 true）；`TargetFilter.targetableOnly`
- [ ] 1.6 `SkillBook.start` / `startSkill` 仅接受 `CastSnapshot`
- [ ] 1.7 单测：`tests/combat/settlement.test.ts`

## 2. Runtime & Session — 唯一事件管线

- [ ] 2.1 重写 `runtime.ts`：`SkillInstance` 按 `delivery.mode` 分支（instant/interval/spawn/buff）；instant/interval 经 `settleHit`
- [ ] 2.2 **删除** `applyDamage`、`simpleDamage` 及一切 DamageFormula 引用
- [ ] 2.3 重写 `practice-session.postTick`：tickCc → skillBook.tick → tickEffects → **仅** `applyCombatEvents`
- [ ] 2.4 `WorldState.tickEffects` 返回 `CombatEvent[]`；删除 `effectEventsToDamageResults`
- [ ] 2.5 更新 `hits.ts`：`HitGeometry` 类型名；`resolveHits` 签名对齐
- [ ] 2.6 更新 `cast-aiming.ts`：`resolveAreaAimMaxRange(skill)` 读 `skill.aim` / delivery 推导，不读 hit

## 3. Effect Entities — CombatEvent only

- [ ] 3.1 改造 `projectile.ts` / `persistent-area.ts` / `swept-rect.ts` / burst / convergent：tick → `CombatEvent[]` + `settleHit` + `canSee`
- [ ] 3.2 `SkillEffectEntity` 补 `castId`；spawn 时从 snapshot 写入
- [ ] 3.3 `convergent-burst` 实现 `spawnInterval` 间隔调度
- [ ] 3.4 `CollisionShape` 从 HitGeometry 分离；projectile/swept-rect 使用独立 collision 字段
- [ ] 3.5 单测：effect 视野过滤、spawnInterval、castId

## 4. Hero Build — Registry & JSON 迁移

- [ ] 4.1 新建 `heroes/effect-registry.ts`：`EFFECT_REGISTRY` 覆盖全部现有 effect.kind
- [ ] 4.2 新建 `heroes/build.ts`：`buildHeroSkills(heroData)` + `resolveDelivery`
- [ ] 4.3 **删除** `effect-loader.ts`
- [ ] 4.4 迁移 `arthur.json` / `daji.json` / `angela.json`：删除顶层 `hit`；补 `aim` + effect 内几何
- [ ] 4.5 重写 `hero-kit.ts`：校验拒绝顶层 `hit`；`assertEffectConfig` 覆盖全 kind
- [ ] 4.6 重写 `arthur.ts` / `daji.ts` / `angela.ts` 为薄包装（≤ 30 行）；删除一切 effect 分支与内联 applyKnockup
- [ ] 4.7 `heroes/index.ts`：heroId 缓存；`sourceTeam` 仅 `caster.team`
- [ ] 4.8 实现 `dash-landing-knockup` onLand 工厂（CombatEvent damage + knockup）
- [ ] 4.9 实现安琪拉三技能 `beam-channel`（interval-hit + hitOrigin:caster）；更新 angela.json
- [ ] 4.10 单测：registry 全覆盖、buildHeroSkills 三英雄、JSON schema 拒绝旧 hit

## 5. 测试 & 文档 — 全量更新

- [ ] 5.1 改写 `tests/skills/`：删除 DamageFormula 测试；新增 delivery/settlement 测试
- [ ] 5.2 改写 `tests/world/`、`tests/heroes/`：CombatEvent 断言；删除 EffectDamageEvent / applyDamage
- [ ] 5.3 验收矩阵：`arthur-skills`、`remote-heroes`、`convergent-burst`、`practice-session` 全绿
- [ ] 5.4 架构 regression：grep/测试禁止 `DamageFormula|CastOptions|EffectDamageEvent|effect-loader|sourceTeam: 'blue'|applyDamage`
- [ ] 5.5 更新 `docs/DEV.md` §4、`docs/blueprint-skills.md` 状态为「已实施」
- [ ] 5.6 全量 `npm test` 绿灯

## 6. 并发执行策略

**原则：模块可并行，merge 前必须全绿；不允许「先合一半留 legacy」。**

| Workstream | 范围 | Gate |
|---|---|---|
| WS-A Types+Settlement | 1.1–1.7 | 无；先冻结 CombatEvent/SkillDelivery 签名 |
| WS-B Runtime+Session | 2.x | WS-A 签名冻结 |
| WS-C Effects | 3.x | WS-A settleHit |
| WS-D Heroes | 4.x | WS-A delivery 类型 + WS-C registry 接口 |
| WS-E Tests+Docs | 5.x | WS-A–D 全部完成 |

**主 agent：** 独占 `types.ts` merge；确保 Step 1 删旧与 Step 2 接线在同一 merge window 内完成，不提交「半删半留」中间态到 main。

**禁止：** legacy adapter、`buildSkillLegacy`、DamageFormula 过渡层、HitShape alias 并存。
