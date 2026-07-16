## MODIFIED Requirements

### Requirement: Angela beam deferred pending spike
**本 requirement 已 supersede**：安琪拉三技能光束在本 change 中 SHALL 按 `beam-channel` capability 实现（`interval-hit` + `hitOrigin: 'caster'`），不再 defer。

#### Scenario: Angela S3 beam in acceptance checklist
- **WHEN** 审查本 change 的 DoD
- **THEN** 安琪拉三技能持续伤害跟随施法者且经 settlement 管线验收通过

## ADDED Requirements

### Requirement: Angela uses unified hero build
安琪拉 loader MUST 经 `buildHeroSkills(ANGELA_DATA)` 生成技能；`periodic-zone`、`convergent-burst` spawn 逻辑位于 registry，不在 `angela.ts` 内联。

#### Scenario: No hardcoded blue team
- **WHEN** 审查 `angela.ts` 与 registry 调用链
- **THEN** 不存在字面量 `sourceTeam: 'blue'` 传参

#### Scenario: Convergent burst spawn interval
- **WHEN** 安琪拉一技能 JSON 含 `spawnInterval > 0`
- **THEN** 汇聚弹道按间隔依次发射
