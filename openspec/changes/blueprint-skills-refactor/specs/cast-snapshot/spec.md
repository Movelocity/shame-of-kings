## MODIFIED Requirements

### Requirement: SkillBook accepts cast snapshot inputs
`SkillBook.start`（及 `startSkill`）MUST 仅接收 `CastSnapshot` 施法入参；旧版 `CastOptions`（仅含 `forwardRad`/`dashDistance`）MUST 删除（**BREAKING**）。

#### Scenario: Targeted cast passes targetId
- **WHEN** 练习场对锁定类技能施法且范围内存在合法敌人
- **THEN** `SkillBook.start` 收到的入参为含该敌人 `targetId` 的 `CastSnapshot`

#### Scenario: Non-targeted cast omits targetId
- **WHEN** 方向类技能施法
- **THEN** snapshot 含 `forwardRad` 与 `origin`，`targetId` 可为空

#### Scenario: CastOptions rejected at compile time
- **WHEN** 调用方尝试传入旧版 `CastOptions` 形状对象
- **THEN** TypeScript 类型签名不允许该调用（迁移完成后）

## REMOVED Requirements

### Requirement: CastOptions migration adapter
**Reason**: `CastSnapshot` 已全面替代；保留适配层阻碍契约冻结  
**Migration**: 所有 `SkillBook.start` 调用方改用 `createCastSnapshot`；删除 `runtime.ts` 中 `CastOptions` 与 `resolveCastInput` 适配函数
