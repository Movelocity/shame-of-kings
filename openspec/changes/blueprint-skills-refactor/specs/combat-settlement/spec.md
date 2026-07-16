## ADDED Requirements

### Requirement: Unified settleHit pipeline
系统 SHALL 提供 `settleHit(ctx, hit, spec: SettlementSpec)`，在结算层依次判定目标合法性（调用方可跳过已过滤目标）、`world.canSee(caster, target)`（除非 `spec.ignoreVisibility`）、伤害数值（`baseDamage × attackPowerMultiplier × crit`），并产出 `CombatEvent` 或 `null`；MUST NOT 直接修改目标 `hp`。

#### Scenario: Visible enemy receives damage event
- **WHEN** 合法敌方目标对施法者可见，且 `SettlementSpec.baseDamage` 为 100
- **THEN** `settleHit` 返回 `{ kind: 'damage', targetId, payload: { damage: 100, isCrit: false } }`

#### Scenario: Invisible target produces no event
- **WHEN** 几何命中包含对施法者不可见的目标，且未配置 `ignoreVisibility`
- **THEN** `settleHit` 返回 `null`

### Requirement: applyCombatEvents is sole hp mutation entry
练习场与战斗 session 的 `postTick` MUST 通过 `applyCombatEvents(world, events)` 应用所有 `CombatEvent`（damage、knockup、buff）；代码库 MUST NOT 存在 `applyDamage`、`DamageFormula`、`EffectDamageEvent` 或 hero loader 内直接 `applyKnockup`。

#### Scenario: Skill and effect events merged
- **WHEN** 同一帧 `skillBook.tick` 与 `world.tickEffects` 均产出 events
- **THEN** `applyCombatEvents` 一次性处理全部 events 并触发飘字通知

#### Scenario: Knockup via combat event
- **WHEN** 亚瑟三技能 `onLand` 产出 `{ kind: 'knockup', targetId, payload: { duration } }`
- **THEN** `applyCombatEvents` 调用 `unit-cc` 施加击飞，而非 loader 直接 `applyKnockup`

### Requirement: Settlement timing configuration
`SettlementSpec.timing` MUST 支持 `at-spawn` 与 `at-hit`；缺省时 instant/interval 为 `at-hit`，effect spawn 冻结 snapshot 为 `at-spawn`。

#### Scenario: Projectile uses spawn snapshot
- **WHEN** 弹道在 spawn 时冻结 `DamageSnapshot`，施法者 buff 在命中前过期
- **THEN** 命中伤害仍使用 spawn 时数值

## REMOVED Requirements

### Requirement: DamageFormula settlement path
**Reason**: 双轨结算已删除；统一 `settleHit`  
**Migration**: 删除 `DamageFormula`、`simpleDamage`、`arthurDamage`；测试改用 `CombatEvent` 断言

### Requirement: applyDamage direct hp mutation
**Reason**: 唯一入口 `applyCombatEvents`  
**Migration**: `practice-session` 与所有测试删除 `applyDamage` 调用
