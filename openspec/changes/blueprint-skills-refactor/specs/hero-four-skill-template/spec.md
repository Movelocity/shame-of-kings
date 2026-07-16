## ADDED Requirements

### Requirement: Aim metadata on skill slot
英雄 JSON 技能槽位 SHALL 使用 `aim?: { maxRange?: number; preview?: HitGeometry }` 表达瞄准预览与钳制；当 `aimKind` 为 `area` 时 MUST 提供 `maxRange` 或可从 effect 推导 maxRange 的配置。

#### Scenario: Area skill validates aim or derivable range
- **WHEN** 槽位 `aimKind: 'area'` 且 effect 为 `convergent-burst`
- **THEN** `assertEffectConfig` 通过，且 `resolveAreaAimMaxRange` 可解析正数 maxRange

### Requirement: Effect owns settlement geometry
技能伤害/命中几何 MUST 定义在 `effect` 或 `resolveDelivery` 产出结构中；不得依赖槽位顶层字段。

#### Scenario: Periodic damage geometry in effect
- **WHEN** 亚瑟二技能 `effect.kind` 为 `periodic-damage`
- **THEN** 圆形半径来自 effect 配置，`resolveDelivery` 映射为 `interval-hit` geometry

## MODIFIED Requirements

### Requirement: Typed effect configuration
四技能模版 MUST 使用 `effect.kind` 区分技能效果；每种效果只允许其契约定义的字段。英雄数值在 JSON 中只能有一个权威来源，MUST 经 `assertEffectConfig` + `buildHeroSkills` 构建，禁止 hero loader 内 effect 分支。

#### Scenario: Arthur typed effects
- **WHEN** 亚瑟 JSON 定义 `move-speed-buff`、`periodic-damage`、`dash-landing-knockup` 与 `attack-damage` 效果
- **THEN** `buildHeroSkills` 校验并生成对应运行时技能

#### Scenario: Unknown effect is rejected
- **WHEN** 英雄 JSON 中的 `effect.kind` 未被 hero kit 契约识别，或缺少该效果的必填字段
- **THEN** 在 import 时抛出配置错误

## REMOVED Requirements

### Requirement: Top-level hit field on skill slot
**Reason**: 与 `aim` + `delivery` 三分离冲突；历史字段导致预览/结算混用  
**Migration**: 三英雄 JSON 删除 `hit`；circle/cone/target 等几何迁入 `effect` 或 `aim.preview`；`assertFourSkillKit` 拒绝含 `hit` 的槽位
