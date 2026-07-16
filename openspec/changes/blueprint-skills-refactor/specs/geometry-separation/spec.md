## ADDED Requirements

### Requirement: Three geometry concepts separated
系统 MUST 区分：`AimGeometry`（JSON `aim`）、`HitGeometry`（即时与 persistent-area 结算）、`CollisionShape`（弹道扫掠）。类型名 MUST 使用 `HitGeometry`（**BREAKING**：删除 `HitShape`）；禁止用顶层 `hit` 或 `effect.collisionRadius` 混表达碰撞语义。

#### Scenario: Projectile uses collision shape not hit self
- **WHEN** 火球 effect 配置 `collisionRadius` 与 `maxRange`
- **THEN** 碰撞检测使用 `CollisionShape`，而非 `HitShape kind: self`

### Requirement: Hero JSON aim field
英雄技能槽位 MAY 定义 `aim: { maxRange?, preview?: HitGeometry }`；区域瞄准最大距离 MUST 优先读 `aim.maxRange`，其次从 effect 推导（如 `convergent-burst.travelDistance`），不得单独依赖 `skill.hit`。

#### Scenario: Angela S1 area clamp uses travel distance
- **WHEN** 安琪拉一技能 `aimKind: area` 且 effect 为 `convergent-burst` 含 `travelDistance: 9`
- **THEN** `clampTargetPoint` 的 `maxRange` 为 9（或 `aim.maxRange` 若显式配置）

#### Scenario: resolveAreaAimMaxRange reads aim not hit
- **WHEN** 技能 `hit.kind` 为 `self` 但 `aim.maxRange` 为 8
- **THEN** 区域瞄准钳制使用 8 而非默认 fallback
