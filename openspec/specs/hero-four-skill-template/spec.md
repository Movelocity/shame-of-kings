# hero-four-skill-template Specification

## Purpose
TBD - created by archiving change arthur-four-skill-kit. Update Purpose after archive.
## Requirements
### Requirement: Four skill slots per hero
每个英雄数据文件 MUST 定义恰好四个技能槽位，热键分别为 `0`（普攻）、`1`、`2`、`3`（三个主动）；不得缺少或重复 hotkey。

#### Scenario: Valid arthur kit
- **WHEN** 读取 `src/game/heroes/arthur.json` 的 `skills` 数组
- **THEN** 存在且仅存在 hotkey `0`、`1`、`2`、`3` 各一条记录

#### Scenario: Template reusable for future hero
- **WHEN** 新增 `src/game/heroes/<hero>.json` 并调用 hero kit 校验
- **THEN** 校验通过当且仅当四槽位 hotkey 完整

### Requirement: Shared loader contract
系统 SHALL 提供 `hero-kit` 类型与校验/装载辅助（如 `assertFourSkillKit`、`HeroKitData`），供各英雄 loader 复用；不得在每个英雄文件内重复定义 hotkey 枚举。

#### Scenario: Arthur uses shared contract
- **WHEN** `arthur.ts` 装载技能
- **THEN** 先通过四槽位校验再生成 `Skill[]`

### Requirement: Typed effect configuration
四技能模版 MUST 使用 `effect.kind` 区分技能效果；每种效果只允许其契约定义的字段。英雄数值在 JSON 中只能有一个权威来源，loader MUST 在运行时校验该契约，不得仅使用 TypeScript 类型断言。

#### Scenario: Arthur typed effects
- **WHEN** 亚瑟 JSON 定义 `move-speed-buff`、`periodic-damage`、`dash-landing-knockup` 与 `attack-damage` 效果
- **THEN** loader 校验每种效果的必填字段后生成对应运行时技能

#### Scenario: Unknown effect is rejected
- **WHEN** 英雄 JSON 中的 `effect.kind` 未被 hero kit 契约识别，或缺少该效果的必填字段
- **THEN** loader 在创建技能前抛出配置错误
