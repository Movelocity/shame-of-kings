## MODIFIED Requirements

### Requirement: World ticks effects independently of SkillInstance
`WorldState`（或 session postTick）MUST 在固定步长下 tick 所有未过期 effects，与 `SkillInstance` 阶段解耦；effect tick MUST 产出 `CombatEvent[]` 而非直接 `EffectDamageEvent` 扣血路径（由 `applyCombatEvents` 统一应用）。

#### Scenario: Skill ends while fireball flies
- **WHEN** 技能 active 结束且后摇开始，已 spawn 的弹道仍在飞行
- **THEN** 弹道继续每帧 tick 直至自身 `expired`

#### Scenario: Reset clears effects
- **WHEN** 调用 `resetWorld`
- **THEN** 所有 `SkillEffectEntity` 被移除

#### Scenario: Effect hit uses settlement
- **WHEN** 弹道扫掠命中合法敌方且目标对 owner 不可见
- **THEN** effect tick 经 `settleHit` 不产生 damage event

## ADDED Requirements

### Requirement: Effect entity carries castId
`SkillEffectEntity` SHOULD 包含 `castId` 字段（与 spawn 时 `CastSnapshot.castId` 一致），便于调试与 VFX 关联。

#### Scenario: Spawn preserves castId
- **WHEN** 从 snapshot spawn projectile
- **THEN** entity `castId` 等于 snapshot `castId`

### Requirement: Convergent burst honors spawnInterval
`convergent-burst` 调度器 MUST 在 `spawnInterval > 0` 时按间隔依次 spawn 子 projectile，而非始终当帧齐射。

#### Scenario: Staggered convergent projectiles
- **WHEN** JSON 配置 `spawnInterval: 0.08` 且 `projectileCount: 5`
- **THEN** 五枚弹道在 0.32s 内依次生成，而非同一帧
