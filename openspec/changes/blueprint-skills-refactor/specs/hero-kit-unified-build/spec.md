## ADDED Requirements

### Requirement: All three heroes use unified build path
亚瑟、妲己、安琪拉 MUST 经同一 `buildHeroSkills` + `EFFECT_REGISTRY` 路径生成 `Skill[]`；亚瑟不得保留独立的大段 `effect.kind` 分支与内联 `arthurDamage` / `applyKnockup` 逻辑。

#### Scenario: Arthur onLand via factory
- **WHEN** 亚瑟三技能 `effect.kind` 为 `dash-landing-knockup`
- **THEN** 落地圈伤害与击飞经 `resolveDelivery` + settlement/onLand 工厂产出 `CombatEvent`，而非 `arthur.ts` 手写循环

#### Scenario: Shared assertEffectConfig
- **WHEN** 任意英雄 JSON 导入
- **THEN** `assertFourSkillKit` 与 `assertEffectConfig` 在校验通过后才会 build

### Requirement: Hero loader file size constraint
各英雄 `*.ts` loader（不含 JSON import）SHALL 仅含：类型断言、`assertFourSkillKit`、常量导出、`buildHeroSkills` 调用、hotkey 辅助函数；不得含超过 30 行的 effect 分支逻辑。

#### Scenario: Angela loader delegates to build
- **WHEN** 安琪拉 `periodic-zone` 或 `convergent-burst` 技能装载
- **THEN** 逻辑位于 registry/factory，不在 `angela.ts` 内联 spawn
