# hero-angela Specification

## Purpose
TBD - created by archiving change remote-hero-skill-runtime. Update Purpose after archive.
## Requirements
### Requirement: Angela four-skill kit data
系统 SHALL 提供 `angela.json` 与 `angela.ts` loader，通过 `assertFourSkillKit` 校验四槽位。

#### Scenario: Valid angela kit loads
- **WHEN** 加载安琪拉 hero kit
- **THEN** 得到恰好 4 个技能槽位且 hotkey 0–3 各一

### Requirement: Angela fireball projectile to persistent area
安琪拉二技能（大火球）MUST 表达为：前摇结束 spawn 直线 `ProjectileEffect` → 扫掠碰撞 → 命中首个合法敌人或达最大距离后 `expired` → 在撞击点 spawn `PersistentAreaEffect` → 区域周期伤害后销毁。

#### Scenario: Fireball stops on first enemy
- **WHEN** 大火球飞行路径上存在木人桩且 hurtbox 相交
- **THEN** 弹道在首个命中处停止，不在穿透后继续飞行

#### Scenario: Fireball creates burning zone at impact
- **WHEN** 大火球命中或达到最大距离
- **THEN** 撞击点出现持续区域，按配置间隔对区域内敌人周期造成伤害

### Requirement: Angela beam deferred pending spike
安琪拉光束类技能（与施法者绑定的 channel/beam）在本 change 中 **SHALL NOT** 实现，直至完成 beam 建模 spike 并更新本 spec。**本 change 验收范围以大火球 + 持续区域为主。**

#### Scenario: Beam not in acceptance checklist
- **WHEN** 审查本 change 的 DoD
- **THEN** 光束机制列为后续 delta，不阻塞大火球与区域验收

### Requirement: Angela ranged homing auto-attack
安琪拉普攻 MUST 与妲己同为索敌追踪弹道；近身基准 `attackRange` 2，有效距离 4；`CastSnapshot.targetId` 与 `auto-attack-intent` 行为一致。

#### Scenario: Angela AA projectile range
- **WHEN** 读取 `getAngelaAutoAttackRanges()`
- **THEN** `attackRange` 为 4
