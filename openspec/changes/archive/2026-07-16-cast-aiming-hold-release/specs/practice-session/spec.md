## ADDED Requirements

### Requirement: Session aiming API
`practice-session` SHALL 暴露 `beginAim`、`updateAim`、`commitAim`、`cancelAim`（或等价命名），供 UI 编排 hold-release；瞄准与既有 `tryCastHotkey` 施法逻辑 MUST 共用 snapshot 构建路径。

#### Scenario: Commit delegates to cast pipeline
- **WHEN** `commitAim` 成功
- **THEN** 行为与直接 `tryCastHotkey` 施法一致（含 `targetId`、CD、`CastSnapshot`）

#### Scenario: Cancel leaves skill book idle
- **WHEN** `cancelAim` 调用
- **THEN** `skillBook.active` 为 null 且对应技能 CD 未启动

### Requirement: Aiming suppresses movement and auto-attack
瞄准期间 `preTick` MUST 返回 `suppressManualMove: true`，并 MUST 取消进行中的普攻追击意图（`aaIntent.cancel`）。

#### Scenario: No chase while aiming fireball
- **WHEN** 按住安琪拉二技能瞄准
- **THEN** 角色不因普攻意图自动追敌移动

## MODIFIED Requirements

### Requirement: Cast entry stays on session
按热键/技能 id 施法（含普攻请求）MUST 经由 session 入口。DEV 构建下除普攻外主动技能 MUST 先经瞄准会话 hold-release，再由 `commitAim` 触发施法；生产构建仍允许 `castMode: instant` 即时施法。

#### Scenario: Hotkey cast via aim commit in DEV
- **WHEN** DEV 环境下抬起技能键提交瞄准
- **THEN** SkillBook 开始对应 SkillInstance，snapshot 含瞄准期 `forwardRad` / `targetId`

#### Scenario: Auto-attack remains instant
- **WHEN** 请求普攻（hotkey 0）
- **THEN** 不经过瞄准会话，行为与改动前一致

#### Scenario: Production instant unchanged
- **WHEN** 非 DEV 构建且技能 `castMode: instant`
- **THEN** 按下即施法，不要求抬手
