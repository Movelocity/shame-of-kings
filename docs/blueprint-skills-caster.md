结论：当前设计用于亚瑟这类近战练习场是合理的，5 种基础几何也可以保留；但不建议直接在 `HitShape` 里追加 `projectile` 来实现远程攻击。现在的模型本质上是“技能生效时，以施法者当前位置做一次单位中心点查询”，缺少远程攻击所需的施法快照、目标身份、弹道生命周期和连续碰撞。

主要问题如下。

- [P1] 命中查询没有阵营、存活状态过滤。所有形状只排除施法者自身，[hits.ts](/Users/hollway/projects/shame-of-kings/src/game/skills/hits.ts:27) 会把友军、死亡单位都返回。虽然注释说调用方负责过滤，但亚瑟伤害公式直接生成伤害，[arthur.ts](/Users/hollway/projects/shame-of-kings/src/game/heroes/arthur.ts:42) 也没有检查阵营、死亡和视野。以后世界中出现多个英雄时会产生友伤、尸体命中、范围 CC 打友军等问题。

- [P1] “锁定施法”没有真正锁定目标。`CastOptions` 只保存方向和 dash 距离，[runtime.ts](/Users/hollway/projects/shame-of-kings/src/game/skills/runtime.ts:38) 没有 `targetId`/`targetPoint`。`target` 命中盒则会在结算时重新寻找最近单位，[hits.ts](/Users/hollway/projects/shame-of-kings/src/game/skills/hits.ts:109)。因此瞄准 A 后，飞行或前摇期间可能改打 B；追踪箭、远程普攻、指定目标技能都无法正确表达。

- [P1] 施法原点实际上没有锁定。`origin = caster.position` 保存的是可变对象引用，[runtime.ts](/Users/hollway/projects/shame-of-kings/src/game/skills/runtime.ts:43)；而且 `resolveHits` 的 `originOverride` 完全未使用，[hits.ts](/Users/hollway/projects/shame-of-kings/src/game/skills/hits.ts:133)，最终仍按施法者结算时的位置检测。角色在前摇期间移动后，攻击会从新位置发出。远程攻击尤其需要不可变的发射位置。

- [P1] 没有独立弹道生命周期。当前非周期技能只在 active 阶段解析一次命中，[runtime.ts](/Users/hollway/projects/shame-of-kings/src/game/skills/runtime.ts:141)，技能实例结束后世界中不能继续存在箭矢、法球等对象，也无法同时维护多枚在途弹道。把飞行时间塞进 `activeTime` 会让施法槽、后摇、CD和弹道错误耦合。

- [P1] 单位只有位置，没有受击半径；当前检测的是“单位中心是否在形状内”。高速弹道逐帧做圆形重叠还会发生穿透。远程弹道应使用“上一帧位置 → 当前帧位置”的线段/胶囊体连续碰撞，并与目标 hurtbox 半径求交。

- [P2] `WorldState.unitsNear` 目前忽略原点和半径，始终返回全部单位，[WorldState.ts](/Users/hollway/projects/shame-of-kings/src/game/world/WorldState.ts:53)。小练习场没问题，单位增多、弹道每帧查询后会成为明显性能瓶颈。

建议分成三层：

```text
Skill / Cast
  └─ 生成不可变 CastSnapshot
      ├─ casterId、origin、direction
      ├─ targetId / targetPoint
      └─ skillId、castId

Effect
  ├─ InstantArea：当前 circle / rect / cone
  ├─ Hitscan：射线、瞬发子弹
  ├─ Projectile：直线、追踪、穿透、碰墙
  └─ PersistentArea：持续地面范围

Collision
  ├─ HitGeometry：圆、扇形、矩形、线段/胶囊
  ├─ TargetFilter：敌方/友方、存活、可见、可选中
  └─ HitPolicy：命中一次、穿透数、同目标冷却
```

具体落地时，我建议：

1. 保留现有 `HitShape`，但让解析函数接收独立的 `origin`，不要接收整个 `caster` 作为几何中心。
2. 给 `Unit` 增加 `collisionRadius` 或 `hurtbox`。
3. 增加统一 `TargetFilter`，至少包含阵营、存活、可见性、可选中状态。
4. 把 `CastOptions` 升级成不可变的 `CastSnapshot`，明确携带 `targetId` 或 `targetPoint`。
5. 在 `WorldState` 中维护独立的 `effects/projectiles` 集合；技能只负责生成弹道，施法结束不销毁弹道。
6. 弹道每个固定 tick 做 swept-circle/capsule 检测，同时维护 `hitTargetIds`、剩余距离、穿透次数和墙体碰撞。
7. 远程普攻锁定目标后生成追踪弹道；伤害在弹道命中时结算，而不是攻击前摇结束时立即扣血。

现有 31 个命中盒、运行时和亚瑟技能测试都通过，但测试只覆盖当前近战模型。总体判断是：基础几何层可复用，运行时边界需要在做第一个远程英雄前拆开，否则后面会不断给 `SkillInstance` 加特例。


脱手技能单位，比如安琪拉的二技能大火球，我们在设计时也要考虑。下一步做英雄妲己、安琪拉；元歌和镜延后


对，这会改变优先级：下一阶段应围绕“脱手技能实体”设计，而不是继续为元歌、镜预埋接口。妲己和安琪拉正好能覆盖远程体系最关键的几类机制。

最重要的一点：大火球不要实现成 `Unit`，也不要把 `projectile` 塞进 `HitShape`。它应该是独立的 `SkillEffectEntity`，否则会被普通索敌选中，还会被迫携带 `hp/isStatic/cc` 等无关字段。

建议模型：

```text
SkillInstance
  └─ 前摇结束时 spawn effect，然后技能可进入后摇/结束

WorldState
  └─ effects: Map<effectId, SkillEffectEntity>
       ├─ ProjectileEffect
       ├─ PersistentAreaEffect
       ├─ BeamEffect
       └─ InstantEffect
```

脱手实体至少保存：

```ts
interface SkillEffectEntity {
  id: string;
  skillId: string;
  castId: string;

  ownerId: string;
  sourceTeam: Team;

  position: Vec2;
  previousPosition: Vec2;
  lifetimeRemaining: number;

  tick(dt: number, world: CombatWorld): readonly CombatEvent[];
  expired: boolean;
}
```

其中 `ownerId` 用于归属和统计，`sourceTeam` 应在生成时冻结。这样即便施法者死亡、离场，火球仍能继续飞行和结算。

妲己、安琪拉可以作为验收矩阵：

| 机制 | 验证的架构能力 |
|---|---|
| 妲己指定目标弹道 | `targetId` 锁定、追踪、目标死亡/消失策略 |
| 妲己多枚弹道 | 一个施法生成多个独立 effect、同目标命中上限 |
| 安琪拉大火球 | 直线飞行、扫掠碰撞、碰到首个敌人后停止 |
| 火球命中后持续区域 | Projectile 转换/生成 PersistentArea |
| 持续区域周期伤害 | 每目标 tick 间隔、命中过滤、持续时间 |
| 安琪拉光束 | 与施法者绑定的 channel/beam，而不是脱手 projectile |
| 安琪拉一技能汇聚弹道 | `convergent-burst`：`CastSnapshot.targetPoint` 为航线**交汇点**（非灭点）；身后扇形齐射后沿各自直线穿过该点继续飞行（见 `convergent-burst.ts`） |

大火球比较适合这样表达：

```text
施法
 → 生成 ProjectileEffect
 → 每帧做 previousPosition → position 的胶囊扫掠
 → 命中首个合法敌人或达到最大距离
 → projectile.expired = true
 → 在撞击点生成 PersistentAreaEffect
 → 区域独立周期结算并最终销毁
```

还需要提前定下三个规则：

1. 属性快照：弹道生成时冻结伤害，还是命中时读取英雄属性。建议默认生成时快照，持续区域也继承同一份 `DamageSnapshot`。
2. 施法者死亡：默认脱手弹道和地面区域继续存在；需要消失的技能显式配置 `destroyWhenOwnerGone`。
3. 目标消失：追踪弹道应配置 `onTargetLost: 'expire' | 'continue-forward' | 'retarget'`，妲己类指定目标技能通常选择前两种之一。

因此接下来的合理顺序是：

1. 修正阵营、死亡、视野过滤和不可变 `CastSnapshot`。
2. 给单位增加圆形 hurtbox。
3. 在世界层加入独立 effect 生命周期和扫掠碰撞。
4. 先做妲己验证锁定/多弹道。
5. 再做安琪拉验证弹道转持续区域、周期命中和光束。
6. 元歌、镜相关的复杂位移、分身和多实体控制延后。

现有 `circle/rect/cone/target` 仍然有价值，但它们应降级为纯几何描述；“怎么移动、何时消失、打谁、能命中几次”放到 effect 和 hit policy 中。这样安琪拉的大火球才是真正脱手，而不是一个延迟结算的长矩形技能。