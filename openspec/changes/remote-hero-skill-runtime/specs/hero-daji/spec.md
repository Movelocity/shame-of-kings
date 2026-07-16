## ADDED Requirements

### Requirement: Daji four-skill kit data
系统 SHALL 提供 `daji.json` 与 `daji.ts` loader，通过 `assertFourSkillKit` 校验四槽位（0 普攻 + 1/2/3 主动），数值权威来源为 JSON。

#### Scenario: Valid daji kit loads
- **WHEN** 加载妲己 hero kit
- **THEN** 得到恰好 4 个技能槽位且 hotkey 0–3 各一

### Requirement: Daji locked-target projectiles
妲己至少一类主动技能 MUST 使用 `CastSnapshot.targetId` 生成追踪或多枚 `ProjectileEffect`；目标消失策略按技能 JSON 配置 `onTargetLost`。

#### Scenario: Cast locks nearest enemy in range
- **WHEN** 玩家在指定目标技能范围内对木人桩施法
- **THEN** snapshot 锁定木人桩 `targetId`，生成的弹道追踪该目标而非施法结束时重新索敌

#### Scenario: Multiple projectiles per cast
- **WHEN** 技能配置一次施法生成多枚弹道
- **THEN** 每枚为独立 `SkillEffectEntity`，各自维护命中记录与寿命

### Requirement: Daji damage on projectile hit
妲己弹道伤害 MUST 在弹道命中时结算（`DamageSnapshot`），而非仅在前摇/ active 结束瞬间扣血。

#### Scenario: Damage floater on hit frame
- **WHEN** 追踪弹道命中木人桩
- **THEN** 该帧产生 `DamageResult` 与飘字反馈

### Requirement: Daji ranged homing auto-attack
妲己普攻 MUST 为索敌追踪 `ProjectileEffect`；近身基准 `attackRange` 为 2，有效出手/索敌距离 MUST 为 `attackRange × projectileRangeMultiplier`（默认 2，即 4）。`auto-attack-intent` 使用解析后的有效距离；出手时 `CastSnapshot.targetId` 传入已锁目标。

#### Scenario: AA spawns homing projectile at locked target
- **WHEN** 玩家在普攻获取范围内锁敌并出手
- **THEN** `onActivate` spawn 追踪弹道，`skillId` 为 `auto-attack`，伤害在命中帧结算

#### Scenario: AA effective range is double melee
- **WHEN** 读取 `getDajiAutoAttackRanges()`
- **THEN** `attackRange` 为 4，`acquireRange` 为 5.2（×1.3）
