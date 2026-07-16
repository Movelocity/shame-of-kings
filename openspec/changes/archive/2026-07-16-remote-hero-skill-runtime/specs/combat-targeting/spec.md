## ADDED Requirements

### Requirement: TargetFilter for hard exclusions
系统 SHALL 提供 `TargetFilter`，在几何命中查询前排除不符合条件的单位，至少支持：非同阵营可攻击（沿用 `findNearestEnemy` 规则：跳过自身、同阵营、`hp <= 0`）、可选 `targetable`/`isStatic` 策略。视野 **不** 在 `TargetFilter` 中判定。

#### Scenario: Friendly units excluded
- **WHEN** 圆形命中查询范围内同时有敌方与友方单位
- **THEN** 经 `TargetFilter` 后仅返回敌方（及配置允许的中立）单位

#### Scenario: Dead units excluded
- **WHEN** 范围内存在 `hp <= 0` 的单位
- **THEN** 该单位不会进入命中候选

### Requirement: Visibility resolved at damage time
对需要视野的技能，`DamageFormula`（或等价结算钩子）MUST 继续通过 `world.canSee(caster, target)` 判定；`TargetFilter` 不得替代视野逻辑。

#### Scenario: Invisible target filtered at damage
- **WHEN** 几何命中包含对施法者不可见的单位，且技能未配置忽略视野
- **THEN** `DamageFormula` 返回 null 或 0 伤害，不产生扣血

### Requirement: Unit collision radius
每个可受击 `Unit` MUST 具有 `collisionRadius`（世界单位，> 0）；缺省值在 loader 或单位工厂中定义。几何检测在中心点检测之外，MUST 支持弹道扫掠与 hurtbox 求交。

#### Scenario: Practice dummy has hurtbox
- **WHEN** 创建练习场木人桩
- **THEN** 木人桩 `collisionRadius` 为正值且参与弹道碰撞

#### Scenario: Swept circle hits edge of hurtbox
- **WHEN** 弹道胶囊扫掠路径经过目标 hurtbox 边缘而未经过中心点
- **THEN** 仍判定为命中
