## ADDED Requirements

### Requirement: Unit carries crowd control state
`Unit`（或等价战斗单位模型）SHALL 支持可选 CC 状态，至少包含击飞（`knockup`）及剩余时长 `remaining`（秒）。

#### Scenario: Knockup applied
- **WHEN** 三技能落地圈命中目标
- **THEN** 目标 `cc.kind` 为 `knockup` 且 `cc.remaining` 大于 0

#### Scenario: CC ticks down
- **WHEN** 对含 CC 的单位每帧调用 `tickCc(dt)`
- **THEN** `remaining` 递减，降至 0 时 CC 清除

#### Scenario: Reset clears CC
- **WHEN** 调用 `practice-session.resetWorld()` 或等价重置
- **THEN** 场上单位 CC 状态清空

### Requirement: CC display above health bar
击飞状态 MUST 在受影响单位世界空间血条上方可见（文案或图标），`remaining > 0` 时显示。

#### Scenario: Dummy shows knockup label
- **WHEN** 木人桩处于击飞状态
- **THEN** 其血条上方显示击飞状态指示

#### Scenario: Label hides when expired
- **WHEN** 击飞 `remaining` 降至 0
- **THEN** 血条上方击飞指示消失
