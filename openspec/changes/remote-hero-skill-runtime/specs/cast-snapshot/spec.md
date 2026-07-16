## ADDED Requirements

### Requirement: Immutable cast snapshot at cast start
系统 SHALL 在施法开始时生成不可变 `CastSnapshot`，至少包含 `castId`、`casterId`、`skillId`、`origin`（值拷贝的 `Vec2`）、`forwardRad`，以及可选的 `targetId` 或 `targetPoint`（二选一或同时存在时 `targetId` 优先用于锁定类技能）。

#### Scenario: Snapshot freezes origin
- **WHEN** 施法者在前摇期间移动，且技能 `hitOrigin` 为 `cast` 或后续 spawn 的 effect 引用该 snapshot
- **THEN** 命中与弹道发射位置仍使用 snapshot 中的 `origin`，而非施法者当前坐标

#### Scenario: Snapshot carries locked target
- **WHEN** 指定目标技能在施法开始时成功解析 `targetId`
- **THEN** 该 `targetId` 写入 snapshot，后续结算不得重新用 `hit.target` 最近邻替换

### Requirement: SkillBook accepts cast snapshot inputs
`SkillBook.start`（及 `startSkill`）MUST 接收与 `CastSnapshot` 等价的施法入参；旧版仅含 `forwardRad`/`dashDistance` 的 `CastOptions` 语义由 snapshot 字段承载（**BREAKING**）。

#### Scenario: Targeted cast passes targetId
- **WHEN** 练习场对锁定类技能施法且范围内存在合法敌人
- **THEN** `SkillBook.start` 收到的入参包含该敌人的 `targetId`

#### Scenario: Non-targeted cast omits targetId
- **WHEN** 方向类技能施法
- **THEN** snapshot 含 `forwardRad` 与 `origin`，`targetId` 可为空

### Requirement: Dash distance derived from snapshot context
位移类技能在 snapshot 建立时 MAY 根据 `targetId` 与施法者位置计算 `dashDistance`；运行时 dash 推进仍使用 snapshot 的 `origin` 与 `forwardRad`。

#### Scenario: Judgement-style dash caps to target distance
- **WHEN** 锁定施法且 snapshot 含 `targetId`，技能配置 dash
- **THEN** `dashDistance` 不超过施法瞬间到目标距离（与现有亚瑟三技能语义一致）
