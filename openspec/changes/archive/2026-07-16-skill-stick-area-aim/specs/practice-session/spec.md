## MODIFIED Requirements

### Requirement: Cast entry stays on session
按热键/技能 id 施法（含普攻请求）MUST 经由 session 入口，而不是散落在多个互不相通的闭包中重复实现。瞄准会话（`beginAim` / `updateAim` / `commitAim` / `cancelAim`）SHALL 支持 `aimKind: 'area'`：`updateAim` 接收 `targetPoint` 参数，`commitAim` 将 `aimTargetPoint` 写入 `CastSnapshot.targetPoint`。

#### Scenario: Hotkey cast
- **WHEN** 通过 session 的 cast/hotkey API 请求亚瑟某主动技能且 CD 允许
- **THEN** SkillBook 开始对应 SkillInstance，行为与抽出前一致

#### Scenario: Auto-attack request
- **WHEN** 通过 session 请求普攻
- **THEN** 走既有 auto-attack intent 锁敌路径，不在 UI 层另写一套结算

#### Scenario: Area aim begin
- **WHEN** 对 `aimKind: 'area'` 的技能调用 `beginAim`
- **THEN** 进入瞄准态，`suppressManualMove` 为 true，`aimTargetPoint` 初始化为 null

#### Scenario: Area aim update with targetPoint
- **WHEN** 瞄准态下调用 `updateAim` 传入 `targetPoint`
- **THEN** session 的 `AimingSession.aimTargetPoint` 更新为钳制后的坐标

#### Scenario: Area aim commit writes targetPoint
- **WHEN** 对 area 技能调用 `commitAim`，`aimTargetPoint` 为 {x: 3, z: -5}
- **THEN** `CastSnapshot.targetPoint` 为 {x: 3, z: -5}，技能进入施法状态

#### Scenario: Area aim cancel
- **WHEN** 取消 area 瞄准
- **THEN** 不施法、不消耗 CD，`aimTargetPoint` 清空
