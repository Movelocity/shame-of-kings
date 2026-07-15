## ADDED Requirements

### Requirement: Skill one speed and empowered dash attack
一技能（hotkey `1`）MUST 在施放时施加移速加成，并将下一次普攻强化为 dash；施放一技能本身 MUST NOT 产生位移。

#### Scenario: Buff on cast
- **WHEN** 玩家施放一技能且 CD 允许
- **THEN** 施法者在约定持续时间内获得移速加成（经 Buff 系统）

#### Scenario: Empower next basic attack
- **WHEN** 一技能生效后玩家释放下一次普攻
- **THEN** 该普攻以 dash 方式位移并消耗强化状态

#### Scenario: Skill cast never dashes directly
- **WHEN** 玩家点击一技能
- **THEN** 仅挂载移速和强化普攻状态，施法者位置不变

### Requirement: Skill two intermittent circle damage
二技能（hotkey `2`）MUST 以施法者为中心、使用配置的 `aoeRadius`，在 `active` 阶段按 `damageInterval` 间歇对范围内敌人造成伤害，而非单帧一次性多段结算。

#### Scenario: Multiple damage ticks
- **WHEN** 二技能进入 `active` 且 `damageTicks` 为 N、`damageInterval` 为 Δt
- **THEN** 在 active 持续时间内约 N 次对圈内有效目标结算伤害

#### Scenario: Shared radius field
- **WHEN** 读取二技能 `effect.aoeRadius`
- **THEN** 该值作为亚瑟范围技能的 canonical 半径供三技能落地圈复用

### Requirement: Skill three dash landing circle and knockup
三技能（hotkey `3`）MUST 为指向性施法：按 `dashSpeed` 逐帧突进至目标附近，抵达时产生与二技能相同 `aoeRadius` 的范围效果，并对命中敌人施加击飞状态。

#### Scenario: Targeted dash
- **WHEN** 玩家以有效目标释放三技能
- **THEN** 施法者在多帧内位移至目标附近，抵达前不结算落地圈

#### Scenario: Landing circle matches skill two
- **WHEN** 三技能落地结算触发
- **THEN** 范围半径与二技能 `aoeRadius` 一致

#### Scenario: Knockup applied
- **WHEN** 三技能落地圈内命中木人桩或敌人
- **THEN** 目标进入击飞状态，持续 `knockupDuration` 配置时长

### Requirement: Auto attack unchanged slot
普攻（hotkey `0`）MUST 仍占用四槽位模版中的 `0` 槽，有目标时可锁敌，无可锁目标时也 MUST 按当前朝向空释放普攻。

#### Scenario: Hotkey zero still basic attack
- **WHEN** 玩家按 `0` 或点普攻按钮
- **THEN** 走既有 auto-attack intent 与普攻 SkillBook 路径

#### Scenario: Empty basic attack
- **WHEN** 玩家按下普攻且获取范围内无有效目标
- **THEN** 仍以当前朝向启动一次普攻 SkillInstance

#### Scenario: Auto chase range
- **WHEN** 普攻攻击范围为 R
- **THEN** 普通自动索敌/追击范围为 `R × 1.3`，更远目标不会阻止空 A

### Requirement: Hero state stack
系统 MUST 在单次施法状态机之上提供英雄状态栈，可挂载攻击/移速属性、指定目标技能、持续时间、剩余次数与 `locked` / `forward` / `locked-or-forward` dash 特效。

#### Scenario: Dash is not teleport
- **WHEN** 技能位移类型为 `dash`
- **THEN** 运行时按 `speed × dt` 逐帧更新位置；仅 `teleport` 允许单帧到达终点

#### Scenario: Empowered attack has independent acquire range
- **WHEN** 某状态强化下一次普攻为索敌 dash
- **THEN** 索敌使用该强化配置的 `acquireRange`，不使用普通普攻的 `attackRange × 1.3`

#### Scenario: Locked dash overrides manual movement
- **WHEN** `locked` 或 `locked-or-forward` 强化普攻在独立索敌范围内获得目标
- **THEN** 该次强化普攻的方向与位移优先级高于轮盘/点击移动，手动输入不得取消锁敌或改写 dash 方向

#### Scenario: Forward dash keeps cast direction
- **WHEN** 强化普攻的 targeting 为 `forward`
- **THEN** 无论普攻范围内是否有敌人，均不索敌转向，并沿释放瞬间的当前方向 dash 配置距离

#### Scenario: Consume targeted skill enhancement
- **WHEN** 某状态针对技能 S 且剩余 N 次，S 成功启动
- **THEN** 本次施法应用状态特效，剩余次数减一；其他技能不消耗该状态
