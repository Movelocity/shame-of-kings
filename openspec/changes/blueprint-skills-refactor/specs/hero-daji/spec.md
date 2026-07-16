## MODIFIED Requirements

### Requirement: Daji damage on projectile hit
妲己弹道伤害 MUST 在弹道命中时经 `settleHit` 产出 `CombatEvent`，由 `applyCombatEvents` 扣血；不得绕过 settlement 直接构造 `EffectDamageEvent` 扣血。

#### Scenario: Damage floater on hit frame
- **WHEN** 追踪弹道命中木人桩且目标可见
- **THEN** 该帧产生 damage `CombatEvent` 与飘字反馈

## ADDED Requirements

### Requirement: Daji uses unified hero build
妲己 loader MUST 经 `buildHeroSkills(DAJI_DATA)` 生成技能；`sourceTeam` MUST 来自施法者 `team`。

#### Scenario: No hardcoded blue team
- **WHEN** 审查 `daji.ts` 与 registry 调用链
- **THEN** 不存在字面量 `sourceTeam: 'blue'` 传参
