## Why

当前瞄准体系仅支持 `direction`（方向）和 `lock-target`（锁定目标），输入源复用左侧移动摇杆/WASD，瞄准期间完全抑制位移——这对"方向型"技能足够，但无法表达**区域落点**语义。例如安琪拉一技能「火焰冲击」在王者荣耀中是五颗法球从施法者背后散开、向玩家选定的汇聚点飞行，玩家需要在有效范围内**拖拽选择落点**而非仅仅选方向。

同时，瞄准操作的触发方式也需要升级：当前 hold-release 瞄准依赖"按住技能按钮 + 用移动摇杆调整方向"，移动端玩家更习惯**直接从技能图标向外拖拽**来完成瞄准（skill-stick），这在 `cast-aiming-hold-release` 的 design.md 中已被标为 P2 功能。现在是实现它的时机。

## What Changes

- 新增 `aimKind: 'area'`：玩家在有效范围内选择一个落点（`targetPoint`），用圆形指示器预览；`CastSnapshot` 携带 `targetPoint` 坐标
- 新增 **skill-stick** 输入模式：玩家从技能图标处拖拽，拖拽偏移量转换为瞄准向量（方向或落点），替代复用移动摇杆
- `AimIndicatorVfx` 扩展：`area` 类型显示有效范围环 + 汇聚点圆形指示器
- 安琪拉一技能「火焰冲击」从 cone 即伤改为 **convergent-burst** 效果：5 颗法球从背后扇形出发、各沿独立路径飞向汇聚点，路径长度一致
- 新增 effect kind `convergent-burst`：多枚弹道各自路径、共同汇聚点、等路程

## Capabilities

### New Capabilities

- `skill-stick-input`: 从技能图标拖拽产生瞄准向量的输入通道；适用于所有 `aimKind` 非 `none` 的技能
- `area-aim`: `aimKind: 'area'` 的落点选择、范围限制、指示器预览与 `CastSnapshot.targetPoint` 提交
- `convergent-burst-effect`: 多枚弹道从施法者背后扇形发射、沿各自路径飞向指定汇聚点的 effect 实体

### Modified Capabilities

- `practice-session`: 瞄准会话需支持 `area` 类型的 `updateAim`（传入拖拽偏移 → 世界落点）；`commitAim` 需将 `targetPoint` 写入 `CastSnapshot`

## Architecture Impact

- **`AimKind`**（`hero-kit.ts`）：枚举新增 `'area'`；`AIM_KINDS` 与 assertFourSkillKit 校验同步
- **`CastSnapshot`**（`skills/types.ts`）：新增可选 `targetPoint: Vec2`，已有 `forwardRad` 语义不变
- **`AimingSession`**（`cast-aiming.ts`）：新增 `aimTargetPoint` 字段；`updateAimingSession` 对 `area` 类型处理拖拽偏移 → 世界坐标 + 范围钳制
- **`AimIndicatorVfx`**：新增 `area` mesh 组（范围环 + 落点标记）
- **`SkillHud`** / **`GameCanvas`**：skill-stick 需要从 `pointerdown` 位置计算拖拽增量、通过新输入通道传入 `updateAim`；与现有移动摇杆输入互斥
- **`effect-loader.ts`** / **`spawn.ts`**：新增 `convergent-burst` 分支
- **`HeroSkillEffectData`**（`hero-kit.ts`）：新增 `convergent-burst` 变体
- **`SkillEffectEntity`** kind 枚举（`types.ts`）：新增 `'convergent-burst'`

已有 `sequential-projectile-burst` 可参考但不能直接复用——它的多枚弹道共享同一方向和起点，而 convergent-burst 需要**各枚独立起点、独立方向、等路程汇聚**。

## Impact

- `src/game/heroes/hero-kit.ts` — AimKind 枚举、HeroSkillEffectData 联合类型
- `src/game/heroes/angela.json` — S1 effect 从 `periodic-zone` 改为 `convergent-burst`
- `src/game/heroes/angela.ts` — loader 新增 convergent-burst 分支
- `src/game/heroes/effect-loader.ts` — wrapSkillWithEffectSpawn 新增 convergent-burst
- `src/game/input/cast-aiming.ts` — AimingSession 扩展
- `src/game/input/aim-forward.ts` — 可能新增 `aimPointFromDrag` 工具函数
- `src/game/skills/types.ts` — CastSnapshot.targetPoint
- `src/game/world/skill-effects/types.ts` — kind 枚举、ConvergentBurstConfig
- `src/game/world/skill-effects/` — 新增 convergent-burst.ts
- `src/game/world/AimIndicatorVfx.ts` — area 可视化
- `src/game/world/practice-session.ts` — area 瞄准流程
- `src/ui/components/SkillHud.tsx` — skill-stick 拖拽手势
- `src/ui/components/GameCanvas.tsx` — skill-stick 输入通道集成
- `tests/` — 新增 convergent-burst 效果测试、area 瞄准测试、skill-stick 输入测试
