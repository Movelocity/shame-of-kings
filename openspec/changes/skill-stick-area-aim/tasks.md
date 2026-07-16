## 1. 类型基础与数据层

- [x] 1.1 `AimKind` 枚举新增 `'area'`；同步 `AIM_KINDS` 数组与 `assertFourSkillKit` 中的校验逻辑（`hero-kit.ts`）
- [x] 1.2 `CastSnapshot`（`skills/types.ts`）新增可选字段 `targetPoint?: Vec2`
- [x] 1.3 `AimingSession`（`cast-aiming.ts`）新增 `aimTargetPoint: Vec2 | null` 字段；`createAimingSession` 初始化为 null；`cancelAimingSession` 清空
- [x] 1.4 `updateAimingSession` 新增 `area` 分支：接收 `targetPoint` + `maxRange` + `origin`，将 targetPoint 距 origin 钳制到 `[0, maxRange]` 后写入 `aimTargetPoint`
- [x] 1.5 `HeroSkillEffectData`（`hero-kit.ts`）新增 `convergent-burst` 联合变体，字段：`projectileCount`、`projectileSpeed`、`travelDistance`、`fanHalfAngle`、`spawnInterval`、`collisionRadius`、`damage`
- [x] 1.6 `assertEffect` 新增 `convergent-burst` 必需字段校验
- [x] 1.7 `SkillEffectEntity.kind` 枚举新增 `'convergent-burst'`（`skill-effects/types.ts`）

## 2. Skill-stick 输入

- [x] 2.1 `SkillHud` 新增 `onDragMove` 回调 prop（上报 `{ slotHotkey, dx, dy }`）；技能按钮 pointerdown 记录 `originClientX/Y`；pointermove 计算增量并在超过 8px 死区后调用 `onDragMove`
- [x] 2.2 `GameCanvas` 接入 `onDragMove`：将屏幕增量 `(dx, dy)` 通过视口归一化系数换算为世界偏移；对 `direction` 调用 `aimForwardFromInput`，对 `area` 计算 `targetPoint = origin + worldOffset`
- [x] 2.3 `GameCanvas` 瞄准帧循环中增加优先级：skill-stick dragDelta 存在时忽略移动摇杆/WASD 输入；无 stick 输入时 fallback 到现有通道
- [x] 2.4 桌面端 keydown 进入瞄准时标记 `stickActive = false`，确保 WASD fallback 正常工作

## 3. Practice-session area 瞄准流程

- [x] 3.1 `practice-session.ts` 的 `beginAim` 对 `area` 类型初始化 `aimTargetPoint = null`，`suppressManualMove = true`
- [x] 3.2 `updateAim` 新增 `targetPoint` 参数通道；对 `area` 类型调用 `updateAimingSession` 传入 targetPoint、maxRange、origin
- [x] 3.3 `commitAim` 对 `area` 类型将 `aimTargetPoint` 写入 `CastSnapshot.targetPoint`；`targetPoint` 为 null 时 commit 失败（不施法）
- [x] 3.4 确认 `cancelAim` 对 `area` 类型清空 `aimTargetPoint`，不施法、不消耗 CD

## 4. Area 瞄准指示器

- [x] 4.1 `AimIndicatorVfx` 新增 `area` 分支：构建范围环（半径 = maxRange，施法者脚下）+ 落点圆形标记（小半径 ~0.5）
- [x] 4.2 `refreshPose` 对 `area`：范围环跟随施法者位置，落点标记跟随 `aimTargetPoint`
- [x] 4.3 `AimIndicatorState` 新增 `targetPoint?: Vec2` 和 `maxRange?: number` 字段
- [x] 4.4 `GameCanvas` 瞄准帧循环中对 `area` 类型调用 `AimIndicatorVfx.show` 传入 targetPoint 和 maxRange

## 5. Convergent-burst 效果实体

- [x] 5.1 新建 `src/game/world/skill-effects/convergent-burst.ts`：`ConvergentBurstConfig`（snapshot、sourceTeam、projectileCount、projectileSpeed、travelDistance、fanHalfAngle、spawnInterval、collisionRadius、damage）
- [x] 5.2 实现起点几何计算函数 `computeConvergentSpawnPoints(convergencePoint, casterPos, travelDistance, fanHalfAngle, count)`：返回 count 个起点坐标，各距 convergencePoint 恰好 travelDistance，弧中心在施法者到汇聚点反方向延长线上
- [x] 5.3 实现 `createConvergentBurst(config)` 调度器：按 spawnInterval 依次 spawn 标准 ProjectileEffect（首颗当帧出手），每颗使用独立 origin/forwardRad、共享 speed/maxRange(=travelDistance)/collisionRadius/damage；全部 spawn 后 expired = true
- [x] 5.4 `effect-loader.ts` 的 `wrapSkillWithEffectSpawn` 新增 `convergent-burst` 分支：从 JSON config 构建 `ConvergentBurstConfig`，在 `onActivate` 中调用 `createConvergentBurst` 并 spawnEffect

## 6. 安琪拉一技能数据更新

- [x] 6.1 `angela.json` 中 `flame-burst` 的 `aimKind` 改为 `'area'`，`effect` 改为 `{ kind: 'convergent-burst', projectileCount: 5, projectileSpeed: 12, travelDistance: 9, fanHalfAngle: 0.45, spawnInterval: 0.06, collisionRadius: 0.35, damage: 150 }`
- [x] 6.2 `angela.json` 中 `flame-burst` 的 `hit` 改为 `{ kind: 'circle', radius: 7 }`（用于 aim-preview 范围指示，实际伤害由弹道结算）
- [x] 6.3 `angela.ts` loader 中新增 `convergent-burst` 读取路径（若 loader 有 effect-specific 处理）

## 7. 测试

- [x] 7.1 `cast-aiming.ts` 单测：`area` 类型的 begin/update/cancel/commit 流程；targetPoint 钳制到 maxRange
- [x] 7.2 `convergent-burst.ts` 单测：`computeConvergentSpawnPoints` 返回的坐标到汇聚点距离均等于 travelDistance（误差 < 0.01）；弧形对称性
- [x] 7.3 `convergent-burst.ts` 单测：`createConvergentBurst` 按 spawnInterval 依次 spawn，首颗当帧，全部 spawn 后 expired
- [x] 7.4 `hero-kit.test.ts` 新增 `convergent-burst` 效果校验和 `aimKind: 'area'` 校验
- [x] 7.5 `practice-session-aiming.test.ts` 新增 area 瞄准场景：begin → updateAim(targetPoint) → commitAim 写入 CastSnapshot.targetPoint
- [x] 7.6 `skill-effects.test.ts` 新增安琪拉一技能 convergent-burst 集成测试：5 颗弹道各自碰撞；同一木人桩可受多次命中

## 8. 文档更新

- [x] 8.1 `docs/DEV.md` 新增 §8.3 说明 skill-stick 输入与 area 瞄准操作方式
- [x] 8.2 `docs/DEV.md` 或 `blueprint-skills-caster.md` 补充 `convergent-burst` 效果说明

## 9. 架构验证

- [x] 9.1 验证回滚路径：将 `aimKind: 'area'` 改回 `'direction'` 后，安琪拉一技能仍可通过方向瞄准施法（fallback 到旧 cone 行为需保留或显式删除）
- [x] 9.2 验证 skill-stick 与现有移动摇杆瞄准互不干扰：无 stick 拖拽时 direction/lock-target 技能通过移动摇杆正常工作
- [x] 9.3 验证已有英雄（亚瑟全 `none`、妲己 `direction`/`lock-target`）在新增 `area` 枚举后行为不变
- [x] 9.4 验证 CastSnapshot.targetPoint 为 undefined 时现有 effect spawn 路径不受影响

## 并发执行策略

以下任务可由 sub-agent 并行执行：

| 工作流 | 任务 | 可并行条件 |
|---|---|---|
| **A: 类型基础** | 1.1–1.7 | 无外部依赖，可独立完成 |
| **B: convergent-burst 几何** | 5.2 (`computeConvergentSpawnPoints`) + 7.2 | 仅依赖 Vec2，可与 A 并行 |
| **C: AimIndicatorVfx area** | 4.1–4.3 | 仅依赖 AimKind 类型（A 完成后） |

以下任务必须主 agent 顺序执行：

- **2.x (skill-stick 输入)** 和 **3.x (practice-session)** 修改 `GameCanvas.tsx` 和 `practice-session.ts`，存在同文件写入冲突
- **5.3–5.4 (调度器 + loader)** 依赖 5.2 几何函数和 1.x 类型定义
- **6.x (angela.json 更新)** 依赖 1.5–1.6 effect 校验
- **7.5–7.6 (集成测试)** 依赖 3.x + 5.x + 6.x 全部完成
- **9.x (架构验证)** 在所有实现和测试完成后执行

主 agent 负责在 A/B 完成后合并类型变更，再顺序推进 2→3→4→5→6→7→8→9。
