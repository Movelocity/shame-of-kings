# area-aim Specification

## Purpose
TBD - created by archiving change skill-stick-area-aim. Update Purpose after archive.
## Requirements
### Requirement: AimKind area type
系统 SHALL 支持 `aimKind: 'area'` 瞄准方式。`AimKind` 枚举扩展为 `'none' | 'direction' | 'lock-target' | 'area'`，`AIM_KINDS` 与 `assertFourSkillKit` 校验同步。

#### Scenario: Valid area aimKind in hero JSON
- **WHEN** 英雄 JSON 某技能 `aimKind` 值为 `'area'`
- **THEN** `assertFourSkillKit` 校验通过

#### Scenario: Invalid aimKind rejected
- **WHEN** 英雄 JSON 某技能 `aimKind` 值为非法字符串
- **THEN** `assertFourSkillKit` 抛出错误

### Requirement: AimingSession supports targetPoint
`AimingSession` SHALL 新增 `aimTargetPoint: Vec2 | null` 字段。对 `aimKind: 'area'`，`updateAimingSession` MUST 接收 `targetPoint` 参数并将其距施法者的距离钳制到 `[0, maxRange]`。

#### Scenario: Target point within range
- **WHEN** `updateAimingSession` 传入 targetPoint 距施法者 5 单位，maxRange 为 7
- **THEN** `aimTargetPoint` 设为传入坐标（未被钳制）

#### Scenario: Target point beyond range
- **WHEN** `updateAimingSession` 传入 targetPoint 距施法者 10 单位，maxRange 为 7
- **THEN** `aimTargetPoint` 被钳制到施法者到目标方向上距施法者 7 单位处

#### Scenario: Cancel clears targetPoint
- **WHEN** 取消瞄准
- **THEN** `aimTargetPoint` 重置为 null

### Requirement: CastSnapshot carries targetPoint
`CastSnapshot` SHALL 新增可选字段 `targetPoint: Vec2`。`commitAim` 时，如果 `aimKind` 为 `area` 且 `aimTargetPoint` 非 null，MUST 将其写入 snapshot。

#### Scenario: Area commit writes targetPoint
- **WHEN** `aimKind: 'area'` 技能提交瞄准，`aimTargetPoint` 为 {x: 3, z: -5}
- **THEN** `CastSnapshot.targetPoint` 为 {x: 3, z: -5}

#### Scenario: Direction commit no targetPoint
- **WHEN** `aimKind: 'direction'` 技能提交瞄准
- **THEN** `CastSnapshot.targetPoint` 为 undefined

### Requirement: Area aim indicator
`AimIndicatorVfx` SHALL 对 `aimKind: 'area'` 显示：施法者脚下的**有效范围环**（半径 = maxRange）和汇聚点处的**落点圆形标记**。瞄准期间每帧更新落点标记位置。

#### Scenario: Area indicator shows range ring and target marker
- **WHEN** 进入 area 瞄准态
- **THEN** 场景中显示范围环和落点圆标，且两者可视

#### Scenario: Target marker follows aim
- **WHEN** area 瞄准期间 targetPoint 变化
- **THEN** 落点圆标位置实时跟随

#### Scenario: Indicator hidden on cancel
- **WHEN** 取消 area 瞄准
- **THEN** 范围环和落点圆标均隐藏
