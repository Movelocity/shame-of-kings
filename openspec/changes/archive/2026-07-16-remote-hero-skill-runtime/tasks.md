## 1. 施法快照与粗筛（Phase A）

- [x] 1.1 在 `types.ts` 定义 `CastSnapshot`、`DamageSnapshot`、`TargetFilter` 类型；`CastOptions` 迁移为 snapshot 入参（**BREAKING**）
- [x] 1.2 实现 `combat/target-filter.ts`：阵营/存活/可选中过滤；单测覆盖友军、尸体、中立
- [x] 1.3 `hits.ts` / `resolveHits` 接入 `TargetFilter`；几何层显式接收 `origin: Vec2`，减少对 `caster.position` 的隐式依赖
- [x] 1.4 `Unit` 增加 `collisionRadius`；`practice-dummy` 与玩家单位设默认值
- [x] 1.5 `startSkill` / `skill-book` 消费 `CastSnapshot`；`practice-session` 施法时写入 `targetId`（复用 `findNearestEnemy`）
- [x] 1.6 亚瑟技能迁移新入参；`runtime.test.ts` / `hits.test.ts` 回归绿灯

## 2. Skill Effect 运行时（Phase B）

- [x] 2.1 新建 `world/skill-effects/`：`SkillEffectEntity` 基类、`ProjectileEffect`、`PersistentAreaEffect`
- [x] 2.2 实现胶囊扫掠碰撞（`previousPosition → position` × `collisionRadius`）；单测：高速不穿透、擦边命中
- [x] 2.3 `WorldState` 增加 `effects` 集合、`tickEffects(dt)`、`spawnEffect` / 移除过期实体
- [x] 2.4 实现 `HitPolicy`（首敌停止、穿透数、同目标上限）与 `DamageSnapshot` 命中结算
- [x] 2.5 实现 `projectile-then-zone` spawn 链：弹道 expired → 撞击点生成持续区域
- [x] 2.6 扩展 `hero-kit` `effect.kind` 校验：`spawn-projectile`、`projectile-then-zone`、`periodic-zone`

## 3. Session 与练习场（Phase C）

- [x] 3.1 `practice-session`：`postTick` 调用 `world.tickEffects`；伤害走 `applyDamage` / `notifyDamage`
- [x] 3.2 `resetWorld` 清空 effects；英雄切换 API + 最小 DEV 选择器
- [x] 3.3 施法入口英雄无关化：按当前 `HeroId` 加载 skill loader，移除硬编码 `arthurSkillByHotkey`
- [x] 3.4 session 级单测：reset 清 effects、切换英雄清状态

## 4. 妲己验收（Phase D）

- [x] 4.1 新增 `daji.json` + `daji.ts` loader（四槽位 + 追踪/多枚弹道 effect 配置）
- [x] 4.2 接入指定目标施法：`targetId` 锁定 + `onTargetLost` 配置
- [x] 4.3 单测或 session 测：多枚弹道独立命中、伤害在命中帧产生
- [x] 4.4 手测：练习场切换妲己，对木人桩释放锁定技能可见飘字

## 5. 安琪拉验收（Phase E）

- [x] 5.1 新增 `angela.json` + `angela.ts` loader
- [x] 5.2 二技能大火球：直线弹道 → 首敌停止 → 撞击点持续区域周期伤害
- [x] 5.3 单测：火球转区域、区域 tick 次数与 `DamageSnapshot` 一致性
- [x] 5.4 手测：切换安琪拉，火球命中后地面圈周期伤害可辨认

## 6. Beam Spike（并行调研，不阻塞 5.x 逻辑验收）

- [x] 6.1 **Sub-agent**：调研安琪拉光束机制表（跟随/打断/宽度/tick），对比 `SkillInstance` channel vs `BeamEffect` 实体，输出推荐方案至 `design.md` Open Questions 或附录
- [x] 6.2 **主 agent**：审阅 spike 结论，决定是否开 follow-up change（本 change 不实现光束）

## 7. 文档与架构验证（Phase F）

- [x] 7.1 修订 `docs/DEV.md`：M4 前插入远程英雄试点；元歌/镜仍冻结至 T4.5 后
- [x] 7.2 `pnpm typecheck` + `pnpm test` + `pnpm lint` 全过
- [x] 7.3 亚瑟桌面热键全循环回归（J/U/I/O + 重置）
- [x] 7.4 确认无 `SkillEffectEntity` 被索敌选中（`rg` / 单测哨兵）
- [x] 7.5 确认 `HitShape` 未新增 `projectile` kind（架构 regression）

---

## 并发执行策略

| 工作流 | 执行者 | 允许读/改边界 | 依赖门闩 | 产出 |
|---|---|---|---|---|
| 1.x 快照与 filter | 主 agent | `skills/`、`combat/`、`types.ts` | 无 | 1.6 测试绿 |
| 2.1–2.4 effect 核心 | Sub-agent A | 仅 `world/skill-effects/`、`WorldState.ts`、对应 tests | 1.4 collisionRadius | 2.2 扫掠单测绿 |
| 2.5–2.6 spawn 链 + hero-kit | 主 agent | `hero-kit.ts`、`skill-effects/spawn.ts` | 2.4 | projectile-then-zone 单测 |
| 3.x session | 主 agent | `practice-session.ts`、最小 UI | 2.3 | 3.4 session 测绿 |
| 4.x 妲己 | Sub-agent B | `heroes/daji.*`、妲己相关 tests | 3.3 | 4.3 测绿 |
| 5.x 安琪拉 | Sub-agent C | `heroes/angela.*`、安琪拉相关 tests | 2.5、3.3 | 5.3 测绿 |
| 6.1 beam spike | Sub-agent D | 只读代码 + 写 design 附录 | 可与 5.x 并行 | spike 文档 |
| 7.x 验证 | 主 agent | 全仓库 | 4.x + 5.x | CI 全绿 |

**主 agent 合并职责**：统一 `types.ts` 契约、解决 `WorldState` 与 `skill-book` 冲突、跑全量测试、归档前更新 DEV.md。

**禁止并行**：同一文件的 1.5 与 3.3（`practice-session`）须顺序；`types.ts` BREAKING 变更必须先于各 sub-agent 消费方合并。
