## ADDED Requirements

### Requirement: Foot aim indicator for directional skills
系统 SHALL 在角色脚下（贴地、Y≈0.06）渲染瞄准方向指示器；仅当当前瞄准技能 `aimKind` 为 `direction` 或 `lock-target` 时显示，亚瑟等 `aimKind: none` 技能 MUST NOT 显示指示器。

#### Scenario: Angela skills show indicator
- **WHEN** DEV 环境下按住安琪拉一技能/二技能/三技能瞄准
- **THEN** 角色脚下出现方向指示几何（箭头或扇形）

#### Scenario: Arthur skills hide indicator
- **WHEN** DEV 环境下按住亚瑟任意主动技能瞄准
- **THEN** 脚下无方向指示器（仅可有 hit 预览闪光）

### Requirement: Indicator follows aimForwardRad
指示器 MUST 每帧随 `aimForwardRad` 旋转；`aimKind: direction` 使用箭头或扇形；`aimKind: lock-target` 可选显示指向锁定目标的连线或扇形，但不使用独立方向箭头样式与 `direction` 混淆。

#### Scenario: Direction skill rotates with joystick
- **WHEN** 瞄准安琪拉火球并旋转摇杆
- **THEN** 脚下指示器朝向与弹道预览 `forwardRad` 一致

### Requirement: Indicator lifecycle bound to aiming
指示器 MUST 在 `beginAim` 时创建或显示，在 `commitAim` 或 `cancelAim` 时移除；不得残留到施法后摇阶段。

#### Scenario: Indicator removed after release
- **WHEN** 玩家抬起释放技能
- **THEN** 脚下指示器当帧消失，仅保留正式施法/VFX
