## ADDED Requirements

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

### Requirement: Extensible effect fields
四技能模版 MUST 允许各槽位 `effect` 对象携带技能特有字段（如 `aoeRadius`、`damageInterval`、`knockupDuration`、`acquireRange`），schema 不阻塞后续英雄扩展。

#### Scenario: Arthur extended fields
- **WHEN** 亚瑟 JSON 含 `aoeRadius` 与 `knockupDuration`
- **THEN** schema 校验通过且 loader 可读取
