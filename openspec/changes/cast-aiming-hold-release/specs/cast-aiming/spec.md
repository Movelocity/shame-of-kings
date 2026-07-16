## ADDED Requirements

### Requirement: Aiming session hold-release
系统 SHALL 提供 `AimingSession`，在玩家按住技能键期间处于 `aiming` 状态，抬起且未落在取消区时提交施法，否则取消；瞄准期间 MUST NOT 调用 `SkillBook.start` 或消耗技能 CD。

#### Scenario: Hold shows preview without cast
- **WHEN** 玩家按住某主动技能键且 CD 就绪
- **THEN** 进入 `aiming` 状态，每帧更新命中盒预览，且 `skillBook.active` 仍为 null

#### Scenario: Release commits cast
- **WHEN** 玩家在非取消区抬起技能键
- **THEN** 构建 `CastSnapshot` 并调用 `SkillBook.start`，瞄准状态结束

#### Scenario: Release in cancel zone aborts
- **WHEN** 玩家抬起时指针落在 `.skill-hud__cancel` 区域
- **THEN** 瞄准取消，不施法，CD 不变

#### Scenario: Desktop escape cancels aim
- **WHEN** DEV 桌面瞄准中按下 `Escape`
- **THEN** 瞄准取消且不施法

### Requirement: Continuous hit preview while aiming
瞄准期间系统 MUST 通过 `HitboxVfx.bindEffect('aim-preview', skill.hit, ...)` 持续显示技能几何；预览 MUST 使用当前 `aimForwardRad` 与施法原点，且与正式 `hitboxActivations` 计数解耦。

#### Scenario: Preview follows aim direction
- **WHEN** `aimKind: direction` 技能瞄准中移动摇杆
- **THEN** `aim-preview` 命中盒随 `aimForwardRad` 实时更新

#### Scenario: Preview cleared on commit or cancel
- **WHEN** 瞄准提交或取消
- **THEN** `aim-preview` 绑定被移除

### Requirement: Aim direction from movement input
`aimKind: direction` 技能在瞄准期间 MUST 将左摇杆或 WASD 输入转换为 `aimForwardRad`（与 `computeJoystick` / 键盘移动约定一致），并 MUST 在此期间的 `preTick` 抑制角色位移（`suppressManualMove`）。

#### Scenario: Joystick steers cone preview
- **WHEN** 安琪拉一技能瞄准中推动左摇杆
- **THEN** 角色不移动，锥形预览与 `aimForwardRad` 指向摇杆方向

### Requirement: Lock target preview
`aimKind: lock-target` 技能在瞄准期间 MUST 解析并预览最近合法敌人（复用 `findNearestEnemy` 规则）；抬起提交时 `CastSnapshot.targetId` MUST 为按住期间最终锁定目标。

#### Scenario: Daji skill 1 locks dummy on release
- **WHEN** 妲己一技能瞄准中木人桩在范围内并抬起释放
- **THEN** snapshot 含木人桩 `targetId`，追踪弹道锁定该目标

#### Scenario: No target fails commit
- **WHEN** `lock-target` 技能瞄准范围内无敌人并抬起释放
- **THEN** 提交失败，不施法，不消耗 CD

### Requirement: DEV force hold-release for active skills
在 `import.meta.env.DEV` 下，除普攻（hotkey `0`）外所有主动技能 MUST 使用 hold-release 路径，无论 JSON `castMode` 是否为 `instant`。

#### Scenario: Arthur skill 2 hold-release in DEV
- **WHEN** DEV 环境下按住亚瑟二技能
- **THEN** 进入瞄准预览，抬起后才启动 `SkillInstance`
