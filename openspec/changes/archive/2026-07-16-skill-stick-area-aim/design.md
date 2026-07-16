## Context

`cast-aiming-hold-release` 已实现 hold-release 瞄准框架：`AimingSession` 状态机、`AimIndicatorVfx`（`direction` / `lock-target`）、`HitboxVfx.bindEffect('aim-preview')`、桌面 keydown/keyup。但瞄准输入源仅复用左侧移动摇杆/WASD（`suppressManualMove` 屏蔽位移），且 `AimKind` 只有 `none | direction | lock-target`，无法表达"在范围内拾取落点"的区域瞄准语义。

当前安琪拉一技能 `flame-burst` 为 cone 即伤 + `periodic-zone`(ticks=0)，不符合王者荣耀中"五颗法球从背后扇形飞向汇聚点"的设计。

约束：
- 不改变 `SkillInstance` 前摇/active/recovery 状态机
- 复用 `CastSnapshot`、`HitboxVfx`、`AimingSession` 框架
- DEV 优先，生产移动端 targeted 技能也能走 skill-stick
- 桌面端 WASD/鼠标继续作为备选瞄准输入

## Goals / Non-Goals

**Goals:**

- 实现 skill-stick：从技能图标处拖拽产生瞄准向量，替代移动摇杆瞄准
- 新增 `aimKind: 'area'`：落点选择 + 范围钳制 + 圆形指示器预览
- `CastSnapshot` 携带 `targetPoint`，效果层可据此生成汇聚弹道
- 安琪拉一技能改为 convergent-burst：5 颗法球等路程飞向汇聚点
- `AimIndicatorVfx` 扩展 `area` 可视化（范围环 + 落点圆标）
- `direction` 类技能同样可通过 skill-stick 操控

**Non-Goals:**

- 改变 `SkillInstance` 前摇/active 时序
- 弹道飞行期间实时轨迹预览（瞄准态仅显示落点指示器）
- 追踪弹道的区域瞄准（`lock-target` 仍走已有逻辑）
- 安琪拉二/三技能改动（本 change 仅改一技能）
- 多点触控同时瞄准多个技能

## Architecture Assessment

### Existing Design Reuse

| 资产 | 复用方式 |
|---|---|
| `AimingSession`（`cast-aiming.ts`） | 新增 `aimTargetPoint` 字段；`area` 类型在 `updateAimingSession` 中处理 |
| `HitboxVfx.bindEffect('aim-preview')` | 按住期间预览汇聚点处落点几何 |
| `AimIndicatorVfx` | 新增 `area` 分支：范围环 + 落点标 |
| `CastSnapshot` | 新增可选 `targetPoint: Vec2` |
| `SkillHud` pointer capture | skill-stick 在现有 `onPointerDown`/`onPointerUp` 基础上增加 `onPointerMove` |
| `SequentialProjectileBurstEffect` | 参考调度模式，但不直接复用（汇聚弹道需独立起点/方向） |
| `ProjectileConfig` + `spawnProjectilesFromCast` | 每颗法球仍是标准 projectile entity，复用碰撞/伤害逻辑 |

### Boundaries and Ownership

```text
SkillHud (UI 层)
  ├─ 新增 onPointerMove → 计算拖拽增量(屏幕坐标)
  ├─ 上报 dragDelta: {dx, dy} 或 normalized {x, y}
  └─ 松手 / 拖回取消区 → onPressEnd

GameCanvas (集成层)
  ├─ 将 skill-stick dragDelta 转为 aimMoveInput
  │   ├─ direction: dragDelta → forwardRad
  │   └─ area: dragDelta → 世界坐标 targetPoint（施法者位置 + 世界偏移）
  ├─ 优先使用 skill-stick 输入；无 stick 拖拽时 fallback 到移动摇杆/WASD
  └─ 驱动 AimIndicatorVfx + HitboxVfx

cast-aiming.ts
  ├─ AimingSession 新增 aimTargetPoint: Vec2 | null
  ├─ updateAimingSession 对 aimKind='area': 接收 targetPoint, 钳制到 maxRange
  └─ 纯函数/工厂，可单测

practice-session.ts
  ├─ updateAim 新增 targetPoint 通道
  ├─ commitAim 将 aimTargetPoint 写入 CastSnapshot.targetPoint
  └─ area 类型按住期间同样 suppressManualMove

effect-loader.ts / convergent-burst.ts
  ├─ 读取 CastSnapshot.targetPoint 作为汇聚点
  ├─ 计算 5 颗弹道各自起点和方向
  └─ 每颗弹道为标准 ProjectileEffect，复用碰撞/过期逻辑
```

### Options and Rationale

**1. Skill-stick 输入来源（已决：SkillHud 拖拽增量）**

| 方案 | 优点 | 缺点 |
|---|---|---|
| 单独的右侧虚拟摇杆 | 与移动摇杆对称 | 需额外 UI；与技能图标空间冲突 |
| **SkillHud 按钮拖拽 → dragDelta** | 直觉；不新增 UI 元素；pointer capture 已有 | 按钮需要处理 pointermove |
| 移动摇杆复用（现状） | 无新增代码 | 瞄准时无法微移；不自然 |

选择方案 2。SkillHud 已经 setPointerCapture，只需添加 pointermove handler 计算与 pointerdown 位置的增量。

**2. dragDelta → 世界坐标映射（已决：基于视口投射的固定缩放）**

| 方案 | 优点 | 缺点 |
|---|---|---|
| 屏幕像素 → 固定比例世界单位 | 简单一致 | 不同屏幕尺寸手感不同 |
| **屏幕像素 → 视口归一化 → 世界单位** | 与摄像机缩放一致 | 需要摄像机参数 |
| Raycast 到地面平面 | 精确但重 | 3D 投射不必要（俯视固定） |

选择方案 2。俯视视角下从屏幕拖拽偏移通过 viewport-to-world 系数换算为世界单位偏移。系数 = 可视世界宽度 / 视口像素宽度，随摄像机变化自动缩放。

**3. Area 目标点表达（已决：CastSnapshot.targetPoint）**

| 方案 | 优点 | 缺点 |
|---|---|---|
| 将 area 转为 direction + distance 编码 | 复用 forwardRad | 丢失精确坐标；direction 语义混淆 |
| **新增 CastSnapshot.targetPoint: Vec2** | 语义清晰；效果层直接读取 | 新增一个字段 |

选择方案 2。`targetPoint` 为可选字段，`direction` / `lock-target` / `none` 技能不使用。

**4. 汇聚弹道几何模型（已决：等距弧形发射）**

5 颗法球需要从施法者背后扇形出发、各沿独立路径飞向汇聚点 P，且保持**等路程 T** 以同时到达。

几何推导：
- C = 施法者位置，P = 汇聚点（`targetPoint`），d = |C - P|
- D = normalize(P - C)，即施法朝向
- T = 配置中的 `travelDistance`（必须 ≥ d）
- 中心法球起点 S₀ = P - T·D（在 C→P 连线的反方向延长线上，距 P 恰好 T）
- 第 i 颗法球起点 S_i = P - T·rotate(D, θ_i)，其中 θ_i 为关于 D 的角偏移
- 角偏移均匀分布在 [-fanHalfAngle, +fanHalfAngle] 中
- 每颗法球飞行方向 = normalize(P - S_i)，飞行距离 = T
- 等速 → 等时到达

此模型保证了：无论玩家把汇聚点选多近多远，所有法球的路程相同、同时到达、且起点始终在施法者身后形成弧线。

**5. 复用 vs 新建 effect entity（已决：ConvergentBurstEffect 调度 + 标准 ProjectileEffect）**

| 方案 | 优点 | 缺点 |
|---|---|---|
| 扩展 SequentialProjectileBurst | 少写代码 | 它假设所有弹道共享 snapshot origin/forward；汇聚需各自独立 |
| **新建 ConvergentBurstEffect** 调度器 | 清晰分离；各弹道独立配置 | 新增一个文件 |

选择方案 2。`ConvergentBurstEffect` 与 `SequentialProjectileBurstEffect` 结构相似（调度器 + 子弹道），但 spawn 逻辑完全不同（计算各弹道独立起点/方向），不适合强行复用。每颗子弹道仍为标准 `ProjectileEffect`，共享碰撞、伤害、过期逻辑。

### Quality Attributes

- **可测试性**：skill-stick dragDelta → aim 映射为纯函数可单测；convergent-burst 起点/方向计算可脱离 Three.js 测试
- **可维护性**：`aimKind` 数据驱动，新增 `area` 不需改动 `direction` / `lock-target` 路径
- **性能**：指示器仅 2 个 mesh（范围环 + 落点标）；弹道复用已有逐帧碰撞循环，5 颗弹道 ≤ 10μs/tick

### Complexity and Exceptions

新增模块：
- `convergent-burst.ts`（~80 行调度器）— 真实复杂度，不是 speculative
- `AimIndicatorVfx` area 分支（~30 行 mesh 构建）— 同类已有 direction/lock-target

不新增服务、存储、协议或外部依赖。

## Decisions

### D1: skill-stick 优先级高于移动摇杆

- **选择**：瞄准期间如果存在 skill-stick dragDelta 输入，忽略移动摇杆；无 stick 输入时 fallback 到移动摇杆/WASD（桌面兼容）
- **替代**：两者合并向量 — 拒绝，混合两个方向源会导致不可预期的瞄准抖动

### D2: area 范围钳制在 AimingSession 层

- **选择**：`updateAimingSession` 对 `area` 类型将 `targetPoint` 到施法者距离钳制为 `[0, maxRange]`
- **替代**：UI 层钳制 — 拒绝，session 层是瞄准状态的 single source of truth
- maxRange 来源：`skill.hit` 如果有 `range` 则用之；否则从 effect config 取（如 `convergent-burst.travelDistance`）

### D3: 安琪拉一技能 aimKind 改为 area

- **选择**：`angela.json` 中 `flame-burst` 的 `aimKind` 从 `direction` 改为 `area`
- effect kind 从 `periodic-zone`(ticks=0) 改为 `convergent-burst`
- hit shape 保持 `cone`(用于 aim-preview 扇形预览)，实际伤害由 5 颗弹道各自碰撞结算

### D4: convergent-burst 弹道不追踪

- **选择**：每颗法球为直线弹道（非 homing），命中首敌停止（`maxHits: 1`）
- **替代**：追踪汇聚点 — 拒绝，直线更符合王者荣耀手感；追踪弹道已有 `lock-target` 承载

### D5: 桌面端 area 瞄准映射

- **选择**：桌面端 WASD 对 area 技能同样有效：WASD 产生方向向量 × 默认距离（如 maxRange × 0.6）作为偏移量
- **替代**：鼠标光标位置 raycast — P2 可选，当前 DEV 阶段 WASD 足够

## Risks / Trade-offs

- **[Risk] skill-stick 拖拽与技能按钮点击冲突** → 设死区（≥ 8px 位移才视为拖拽）；在死区内的短按仍走 instant cast
- **[Risk] area 钳制半径与 hit preview 不一致** → 两者共享同一个 `maxRange` 来源，保证一致
- **[Risk] convergent-burst 5 颗弹道短时间内密集碰撞** → 每颗独立 hitTargetIds；同一目标最多被命中 5 次（如需限制可后续加 cap）
- **[Risk] 安琪拉一技能手感变化大** → 属于能力重设计（从 cone 即伤变弹道），需回归测试确认数值平衡

## Migration Plan

1. **Phase A**：类型基础 — `AimKind` 新增 `area`；`CastSnapshot.targetPoint`；`AimingSession.aimTargetPoint`
2. **Phase B**：skill-stick 输入 — SkillHud pointermove + GameCanvas 映射；对 direction/area 均可用
3. **Phase C**：area 指示器 — `AimIndicatorVfx` area 分支（范围环 + 落点标）
4. **Phase D**：convergent-burst effect — 新增 `convergent-burst.ts` + effect-loader 分支 + `angela.json` 更新
5. **Phase E**：测试 + 文档

回滚：`aimKind: 'area'` 改回 `'direction'`；skill-stick 输入可通过 fallback 透传移动摇杆恢复。

## Open Questions

### Q1: travelDistance 是否可配置或始终等于 maxRange？

建议作为 `convergent-burst` effect config 的显式字段。如果 travelDistance > maxRange（允许），弹道从更远处出发飞向汇聚点，视觉上更有"包抄"感。默认可设为 maxRange × 1.2。

### Q2: 安琪拉一技能弹道是否穿透？

当前设计为首敌停止（`maxHits: 1`）。如需穿透可后续在 `HitPolicy.pierce` 上调整，不影响架构。
