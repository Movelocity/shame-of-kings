## ADDED Requirements

### Requirement: SkillDelivery resolves from hero JSON effect
系统 SHALL 提供 `resolveDelivery(slot: HeroSkillSlotData): SkillDelivery`，将 JSON `effect.kind` 映射为 `instant-hit` | `interval-hit` | `spawn-effect` | `buff-only` | `composite` 之一；运行时 `Skill` MUST 持有 `delivery` 字段，`SkillInstance` MUST 按 `delivery.mode` 分支。

#### Scenario: Arthur whirlwind maps to interval-hit
- **WHEN** 槽位 `effect.kind` 为 `periodic-damage`
- **THEN** `resolveDelivery` 返回 `{ mode: 'interval-hit', geometry, interval, ticks, settlement }`

#### Scenario: Daji fox fire maps to spawn-effect
- **WHEN** 槽位 `effect.kind` 为 `spawn-projectile`
- **THEN** `resolveDelivery` 返回 `{ mode: 'spawn-effect', effectKind, effectConfig }`

### Requirement: SkillInstance delivery branches
`SkillInstance` active 阶段 MUST：`instant-hit` 调用一次 `resolveHits` + settlement；`interval-hit` 按 interval/ticks 周期结算；`spawn-effect` 在 `onActivate` spawn 后可立即进入短 active/recovery；`buff-only` 仅执行 `onActivate`。

#### Scenario: Spawn effect frees cast slot quickly
- **WHEN** 妲己二技能 `delivery.mode` 为 `spawn-effect` 且 `activeTime` ≤ 0.15s
- **THEN** 弹道 spawn 后施法槽进入 recovery，弹道独立 tick

### Requirement: Skill has no hit or damage fields
运行时 `Skill` 类型 MUST NOT 包含 `hit`、`damage`、`damageInterval`、`damageTicks` 字段；结算几何仅来自 `delivery`，瞄准元数据来自 `aim`。

#### Scenario: Preview differs from settlement
- **WHEN** JSON `aim.preview` 半径大于 `delivery.geometry` 半径
- **THEN** 指示器显示 preview 半径，实际伤害仍按 delivery 几何结算

## REMOVED Requirements

### Requirement: Skill damage formula field
**Reason**: 统一 Settlement 管线；`DamageFormula` 与 `CombatEvent` 双轨已删除  
**Migration**: 所有伤害经 `settleHit` + `applyCombatEvents`；技能数值来自 `SettlementSpec`

### Requirement: Skill hit shape field
**Reason**: 几何三分离；顶层 `hit` 与 effect 几何混用  
**Migration**: 瞄准用 JSON `aim`；结算用 `delivery.geometry` 或 effect 内字段
