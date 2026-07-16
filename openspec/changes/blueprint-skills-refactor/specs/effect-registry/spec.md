## ADDED Requirements

### Requirement: EFFECT_REGISTRY replaces switch loader
系统 SHALL 提供 `EFFECT_REGISTRY: Record<EffectConfig['kind'], EffectFactory>`，每个 factory 接收 `(skill, slot, snapshot, ctx)` 并在内部 `world.spawnEffect(...)`；`effect-loader.ts` 的 if/switch 分支 MUST 在本 change 内删除，不得保留并行路径。

#### Scenario: New effect kind registers without SkillInstance change
- **WHEN** 新增 `effect.kind` 并在 registry 登记 factory
- **THEN** 无需修改 `SkillInstance` 状态机主干即可 spawn 对应 entity

### Requirement: buildHeroSkills generic construction
系统 SHALL 提供 `buildHeroSkills(heroData: HeroKitData): readonly Skill[]`，将四槽位 JSON 转为运行时 `Skill[]`；各英雄 `loadXSkills()` MUST 降级为调用 `buildHeroSkills`（≤ 20 行薄包装）。

#### Scenario: Daji loader is thin
- **WHEN** 读取 `loadDajiSkills` 实现
- **THEN** 不含 `effect.kind` 分支逻辑，仅 `return buildHeroSkills(DAJI_DATA)`

### Requirement: Hero skill cache by heroId
`heroSkillByHotkey(heroId, hotkey)` MUST 按 `heroId` 缓存 `buildHeroSkills` 结果，不得每次 hotkey 查询全量 rebuild。

#### Scenario: Repeated hotkey lookup uses cache
- **WHEN** 连续两次调用 `heroSkillByHotkey('daji', '2')`
- **THEN** 第二次不重新 map 全量 skills 数组

### Requirement: sourceTeam from caster team
Effect spawn MUST 使用 `caster.team` 作为 `sourceTeam`；禁止在 hero loader 硬编码 `'blue'`。

#### Scenario: Red team caster spawns projectile
- **WHEN** 施法者 `team: 'red'` 释放追踪弹
- **THEN** effect `sourceTeam` 为 `'red'` 且 TargetFilter 排除同阵营
