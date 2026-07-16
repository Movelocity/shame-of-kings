# convergent-burst-effect Specification

## Purpose
TBD - created by archiving change skill-stick-area-aim. Update Purpose after archive.
## Requirements
### Requirement: Convergent burst effect entity
系统 SHALL 提供 `convergent-burst` 类型的 `SkillEffectEntity`。该实体为调度器：根据 `CastSnapshot.targetPoint`（汇聚点 P）和配置参数，计算多颗弹道的独立起点和方向，按间隔依次 spawn 标准 `ProjectileEffect`。

#### Scenario: Burst spawns configured number of projectiles
- **WHEN** convergent-burst 触发，`projectileCount` 为 5，`spawnInterval` 为 0.08
- **THEN** 在 0.32 秒内依次生成 5 颗弹道实体，首颗当帧立即出手

#### Scenario: Burst expires after all spawned
- **WHEN** 所有弹道均已 spawn
- **THEN** 调度器实体的 `expired` 为 true

### Requirement: Equal travel distance geometry
每颗弹道的飞行路程 SHALL 相同，等于配置的 `travelDistance`。起点 S_i 位于以汇聚点 P 为圆心、`travelDistance` 为半径的弧上，弧中心在施法者到 P 的反方向延长线上，角偏移在 `[-fanHalfAngle, +fanHalfAngle]` 内均匀分布。

#### Scenario: All projectiles have same path length
- **WHEN** 5 颗弹道从各自起点飞向汇聚点
- **THEN** 每颗弹道的飞行距离均为 `travelDistance`（误差 < 0.01）

#### Scenario: Spawn points form arc behind caster
- **WHEN** 施法者位于 (0,0)、汇聚点在 (0,-5)、`fanHalfAngle` 为 0.4 rad
- **THEN** 5 颗弹道的起点均在施法者背后形成弧形，且对称分布于施法方向的反向轴

#### Scenario: Simultaneous arrival at convergence point
- **WHEN** 所有弹道以相同速度飞行、相同路程
- **THEN** 忽略 spawnInterval 延迟差异，各弹道的飞行耗时相同

### Requirement: Convergent burst hero JSON configuration
`HeroSkillEffectData` SHALL 新增 `convergent-burst` 变体，包含字段：`projectileCount`、`projectileSpeed`、`travelDistance`、`fanHalfAngle`、`spawnInterval`、`collisionRadius`、`damage`。

#### Scenario: Valid convergent-burst effect config
- **WHEN** 英雄 JSON 技能 effect kind 为 `convergent-burst` 且所有数值字段非负
- **THEN** `assertFourSkillKit` 校验通过

#### Scenario: Missing numeric field rejected
- **WHEN** `convergent-burst` effect 缺少 `travelDistance` 字段
- **THEN** `assertFourSkillKit` 抛出错误

### Requirement: Angela flame-burst redesign
安琪拉一技能 `flame-burst` SHALL 从 cone 即伤改为 `convergent-burst` 效果：`projectileCount: 5`、`aimKind: 'area'`。施法时读取 `CastSnapshot.targetPoint` 作为汇聚点，5 颗法球从背后扇形出发飞向该点。

#### Scenario: Angela S1 spawns five convergent projectiles
- **WHEN** 安琪拉施放一技能，`targetPoint` 在有效范围内
- **THEN** 世界中产生 5 颗弹道实体，各自独立碰撞和结算

#### Scenario: Angela S1 aimKind is area
- **WHEN** 读取安琪拉 hero kit 一技能配置
- **THEN** `aimKind` 为 `'area'`

### Requirement: Each convergent projectile deals independent damage
每颗弹道 SHALL 独立进行碰撞检测和伤害结算。命中首个合法敌人后停止（`maxHits: 1`）。同一目标可被多颗弹道分别命中。

#### Scenario: Multiple projectiles hit same target
- **WHEN** 木人桩站在汇聚点处，5 颗弹道飞向它
- **THEN** 木人桩最多受到 5 次独立伤害

#### Scenario: Projectile stops on first hit
- **WHEN** 一颗弹道飞行路径上有两个敌人
- **THEN** 命中首个后弹道停止，不穿透第二个
