## ADDED Requirements

### Requirement: Beam channel via SkillInstance interval-hit
安琪拉三技能（及同类跟随施法者持续伤害）SHALL 使用 `delivery.mode: 'interval-hit'` 且 `hitOrigin: 'caster'`，在 `SkillInstance` active 期间周期结算；MUST NOT 为短期方案引入独立 `BeamEffect` entity。

#### Scenario: Beam follows caster movement
- **WHEN** 三技能 active 期间施法者移动
- **THEN** 命中几何中心跟随施法者当前位置（`hitOrigin: 'caster'`）

#### Scenario: Beam ends with skill cancel or active end
- **WHEN** 技能 active 结束或 `SkillInstance.cancel()` 被调用
- **THEN** 周期伤害停止，无残留 beam effect 实体

#### Scenario: Beam uses settlement pipeline
- **WHEN** beam interval tick 命中敌方单位
- **THEN** 伤害经 `settleHit` 产出 `CombatEvent` 并由 `applyCombatEvents` 扣血
