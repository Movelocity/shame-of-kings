# skill-effect-entities Specification

## Purpose
TBD - created by archiving change remote-hero-skill-runtime. Update Purpose after archive.
## Requirements
### Requirement: Skill effects are not units
脱手技能实体（弹道、地面区域等）MUST 实现为 `SkillEffectEntity`，存放在 `WorldState.effects`；不得实现为 `Unit`，不得将 `projectile` 塞进 `HitShape`。

#### Scenario: Effect not targetable by auto-attack
- **WHEN** 普攻或锁敌索敌扫描单位
- **THEN** 进行中的 `SkillEffectEntity` 不会出现在候选目标列表

### Requirement: Effect ownership frozen at spawn
每个 effect MUST 在生成时冻结 `ownerId` 与 `sourceTeam`；施法者死亡或离场后，默认 effect 继续存在并结算，除非技能显式配置 `destroyWhenOwnerGone: true`。

#### Scenario: Projectile survives caster death
- **WHEN** 脱手弹道飞行中施法者被移除或 hp 归零，且未配置 `destroyWhenOwnerGone`
- **THEN** 弹道继续 tick 直至命中、超距或寿命结束

### Requirement: Projectile swept collision
`ProjectileEffect` MUST 每逻辑 tick 使用 `previousPosition → position` 的胶囊/线段扫掠检测，并维护 `hitTargetIds`、剩余飞行距离、穿透次数（`HitPolicy`）。

#### Scenario: First enemy stops default projectile
- **WHEN** 直线弹道配置碰到首个合法敌人后停止，且扫掠路径与敌人 hurtbox 相交
- **THEN** 触发命中结算并将该弹道标记为 `expired`

#### Scenario: No tunneling at high speed
- **WHEN** 弹道单帧位移大于目标 hurtbox 直径
- **THEN** 扫掠检测仍能命中，不会因仅检测终点而穿透

### Requirement: Damage snapshot at spawn
弹道与持续区域生成时 MUST 默认冻结 `DamageSnapshot`（伤害数值与关联属性）；命中时读取 snapshot 而非施法者实时属性，除非技能显式配置 `damageAtHitTime`。

#### Scenario: Buff expires before projectile hits
- **WHEN** 施法时存在攻击加成，弹道生成后加成过期
- **THEN** 命中伤害仍使用生成时 snapshot 的数值

### Requirement: Projectile spawns persistent area
系统 MUST 支持 `ProjectileEffect` 在命中或寿命终点生成 `PersistentAreaEffect`；区域独立 tick 周期伤害，最终按 `lifetimeRemaining` 销毁。

#### Scenario: Fireball creates ground zone
- **WHEN** 配置为撞击首个敌人后生成区域的弹道命中
- **THEN** 在撞击点生成 `PersistentAreaEffect`，弹道 `expired`，区域开始独立周期结算

### Requirement: Homing onTargetLost policy
追踪弹道 MUST 支持配置 `onTargetLost: 'expire' | 'continue-forward' | 'retarget'`；未配置时默认为 `continue-forward`。

#### Scenario: Target dies continue forward
- **WHEN** 追踪弹道配置 `onTargetLost: 'continue-forward'` 且锁定目标死亡
- **THEN** 弹道改为沿最后已知方向直线飞行，不立即销毁

### Requirement: World ticks effects independently of SkillInstance
`WorldState`（或 session postTick）MUST 在固定步长下 tick 所有未过期 effects，与 `SkillInstance` 阶段解耦；技能进入 recovery/done 不自动销毁已 spawn 的 effects。

#### Scenario: Skill ends while fireball flies
- **WHEN** 技能 active 结束且后摇开始，已 spawn 的弹道仍在飞行
- **THEN** 弹道继续每帧 tick 直至自身 `expired`

#### Scenario: Reset clears effects
- **WHEN** 调用 `resetWorld`
- **THEN** 所有 `SkillEffectEntity` 被移除
