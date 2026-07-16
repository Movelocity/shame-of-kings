## MODIFIED Requirements

### Requirement: TargetFilter for hard exclusions
系统 SHALL 提供 `TargetFilter`，在几何命中查询前排除不符合条件的单位，至少支持：非同阵营可攻击（跳过自身、同阵营、`hp <= 0`）、`targetableOnly`（默认 true，排除 `targetable: false` 与 `isStatic` 策略）。视野 **不** 在 `TargetFilter` 中判定。

#### Scenario: Friendly units excluded
- **WHEN** 圆形命中查询范围内同时有敌方与友方单位
- **THEN** 经 `TargetFilter` 后仅返回敌方（及配置允许的中立）单位

#### Scenario: Dead units excluded
- **WHEN** 范围内存在 `hp <= 0` 的单位
- **THEN** 该单位不会进入命中候选

#### Scenario: Non-targetable tower excluded
- **WHEN** 单位 `targetable: false` 且在几何范围内
- **THEN** `targetableOnly: true` 时该单位不进入候选

## MODIFIED Requirements

### Requirement: Visibility resolved at damage time
所有伤害路径（`SkillInstance`、`Effect.tick`、`onLand`）MUST 经 `settleHit` / settlement 层通过 `world.canSee(caster, target)` 判定视野；`DamageFormula` 路径在 Phase 6 删除。

#### Scenario: Invisible target filtered at damage
- **WHEN** 几何命中包含对施法者不可见的单位，且技能未配置 `ignoreVisibility`
- **THEN** settlement 返回 null，不产生扣血 event

#### Scenario: Effect projectile respects visibility
- **WHEN** 脱手弹道命中对 owner 不可见的目标
- **THEN** 不产生 `CombatEvent`，弹道按 HitPolicy 继续或停止

## ADDED Requirements

### Requirement: Unit targetable field
`Unit` MUST 具有 `targetable: boolean`（默认 true）；防御塔等不可被技能选中的单位设为 false。

#### Scenario: Default targetable true
- **WHEN** 创建练习场玩家或木人桩
- **THEN** `targetable` 为 true
