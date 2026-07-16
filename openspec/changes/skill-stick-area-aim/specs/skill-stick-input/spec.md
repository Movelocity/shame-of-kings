## ADDED Requirements

### Requirement: Skill-stick drag produces aim vector
系统 SHALL 支持从技能图标处拖拽产生瞄准向量：pointerdown 记录起始位置，pointermove 计算屏幕增量，增量经视口归一化后转为世界坐标偏移。拖拽位移 < 死区阈值（8px）时不产生瞄准输入。

#### Scenario: Drag beyond dead zone
- **WHEN** 玩家在 `aimKind` 非 `none` 的技能按钮上 pointerdown 后拖拽超过 8px
- **THEN** 系统进入瞄准态，每帧将拖拽增量作为 aim move input 传入 `updateAim`

#### Scenario: Short tap within dead zone
- **WHEN** 玩家在技能按钮上 pointerdown 并在 8px 死区内抬起
- **THEN** 按 `castMode` 原有逻辑处理（instant 立即施法，targeted 按现有行为）

#### Scenario: Pointer cancel during drag
- **WHEN** 拖拽中触发 pointercancel 或手指移入取消区
- **THEN** 取消瞄准，不施法、不消耗 CD

### Requirement: Skill-stick overrides movement joystick during aim
当 skill-stick 拖拽正在进行时，系统 SHALL 忽略移动摇杆/WASD 的瞄准输入。skill-stick 无拖拽且瞄准态由桌面热键触发时，MUST fallback 到移动摇杆/WASD。

#### Scenario: Stick active ignores joystick
- **WHEN** 玩家拖拽 skill-stick 同时推动移动摇杆
- **THEN** 瞄准方向/落点仅由 skill-stick 决定，移动摇杆输入被丢弃

#### Scenario: Desktop keyboard fallback
- **WHEN** 桌面端通过热键 keydown 进入瞄准（无 stick 拖拽）
- **THEN** WASD 继续驱动 `updateAim`，行为与 `cast-aiming-hold-release` 一致

### Requirement: Skill-stick works for all non-none aimKinds
skill-stick 输入 SHALL 适用于 `direction`、`lock-target` 和 `area` 三种 aimKind。对 `direction`，拖拽方向映射为 `forwardRad`；对 `area`，拖拽偏移映射为 `targetPoint`；对 `lock-target`，拖拽方向选择最近锁定目标。

#### Scenario: Direction aim via stick
- **WHEN** `aimKind: 'direction'` 技能的 skill-stick 向右上方拖拽
- **THEN** `aimForwardRad` 更新为对应世界方向角

#### Scenario: Area aim via stick
- **WHEN** `aimKind: 'area'` 技能的 skill-stick 拖拽
- **THEN** `aimTargetPoint` 更新为施法者位置 + 世界偏移（钳制到 maxRange 内）
