# hero-kit Specification

## Purpose
TBD - created by archiving change cast-aiming-hold-release. Update Purpose after archive.
## Requirements
### Requirement: Hero kit aimKind field
英雄 JSON 每个技能槽位 SHALL 支持可选字段 `aimKind`：`none` | `direction` | `lock-target`；缺省为 `none`。`assertFourSkillKit` MUST 校验合法枚举值。

#### Scenario: Valid aimKind passes validation
- **WHEN** 加载含 `aimKind: direction` 的 angela.json
- **THEN** `assertFourSkillKit` 通过且不抛错

#### Scenario: Invalid aimKind rejected
- **WHEN** JSON 中 `aimKind` 为未知字符串
- **THEN** `assertFourSkillKit` 抛错并指明技能 id

### Requirement: Per-hero aimKind defaults
本 change 验收配置 MUST 为：
- 亚瑟全部技能：`none`
- 妲己 hotkey 1、2：`lock-target`；hotkey 3：`direction`
- 安琪拉 hotkey 1、2、3：`direction`
- 所有英雄普攻 hotkey 0：`none`

#### Scenario: Arthur kit has no direction aim
- **WHEN** 读取 arthur.json 四槽位
- **THEN** 每个技能 `aimKind` 为 `none` 或缺省

#### Scenario: Angela actives require direction
- **WHEN** 读取 angela.json hotkey 1/2/3
- **THEN** 均为 `aimKind: direction`
