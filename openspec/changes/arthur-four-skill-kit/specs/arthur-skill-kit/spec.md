## ADDED Requirements

### Requirement: Skill one speed and face charge
一技能（hotkey `1`）MUST 在施放时施加移速加成，并锁定 `acquireRange` 内最近可攻击敌人执行突脸位移；无敌人时仍施加移速加成但不位移。

#### Scenario: Buff on cast
- **WHEN** 玩家施放一技能且 CD 允许
- **THEN** 施法者在约定持续时间内获得移速加成（经 Buff 系统）

#### Scenario: Face charge nearest enemy
- **WHEN** 一技能施放时范围内存在木人桩或敌方单位
- **THEN** 施法者向最近目标突脸移动至攻击/贴身 standoff 距离

#### Scenario: No target buff only
- **WHEN** 一技能施放时 `acquireRange` 内无有效目标
- **THEN** 仅获得移速加成，不发生突脸位移

### Requirement: Skill two intermittent circle damage
二技能（hotkey `2`）MUST 以施法者为中心、使用配置的 `aoeRadius`，在 `active` 阶段按 `damageInterval` 间歇对范围内敌人造成伤害，而非单帧一次性多段结算。

#### Scenario: Multiple damage ticks
- **WHEN** 二技能进入 `active` 且 `damageTicks` 为 N、`damageInterval` 为 Δt
- **THEN** 在 active 持续时间内约 N 次对圈内有效目标结算伤害

#### Scenario: Shared radius field
- **WHEN** 读取二技能 `effect.aoeRadius`
- **THEN** 该值作为亚瑟范围技能的 canonical 半径供三技能落地圈复用

### Requirement: Skill three dash landing circle and knockup
三技能（hotkey `3`）MUST 为指向性施法：瞬间突脸至目标附近，落地时产生与二技能相同 `aoeRadius` 的范围效果，并对命中敌人施加击飞状态。

#### Scenario: Targeted dash
- **WHEN** 玩家以有效目标释放三技能
- **THEN** 施法者位移至目标附近（dash/突脸）

#### Scenario: Landing circle matches skill two
- **WHEN** 三技能落地结算触发
- **THEN** 范围半径与二技能 `aoeRadius` 一致

#### Scenario: Knockup applied
- **WHEN** 三技能落地圈内命中木人桩或敌人
- **THEN** 目标进入击飞状态，持续 `knockupDuration` 配置时长

### Requirement: Auto attack unchanged slot
普攻（hotkey `0`）MUST 仍占用四槽位模版中的 `0` 槽，行为保持既有锁敌普攻语义，除非本 change 明确修改普攻 JSON 字段。

#### Scenario: Hotkey zero still basic attack
- **WHEN** 玩家按 `0` 或点普攻按钮
- **THEN** 走既有 auto-attack intent 与普攻 SkillBook 路径
