## Context

练习场当前施法分两路：`instant` 按下即 `tryCastHotkey`；`targeted` 仅在移动端 SkillHud 走「按下瞄准 → 抬起释放/取消」。`HitboxVfx` 仅在 `SkillInstance.hitboxActivations` 递增时闪一次，remote-hero-skill-runtime 已为 effect 增加 `bindEffect` 持续几何，但瞄准阶段仍无预览。

约束：不大改 `SkillInstance` 状态机；复用 `CastSnapshot`、`HitboxVfx`、`computeJoystick`；亚瑟无方向指示器；DEV 优先全技能抬手便于调试。

## Goals / Non-Goals

**Goals:**

- 统一 hold-release 瞄准会话（DEV 全技能；生产按 JSON）
- 按住期间持续预览 `skill.hit` 几何（不施法、不进 CD）
- 取消区抬起取消；`Esc` 桌面取消
- `aimKind: direction` 技能用摇杆/WASD 更新朝向 + 脚下指示器
- `aimKind: lock-target` 技能按住显示锁定预览（妲己 1/2）
- 亚瑟全 `aimKind: none`，无脚下箭头

**Non-Goals:**

- 技能钮向外拖（skill-stick）作为首选输入（P2 可选）
- 改变 `SkillInstance` 前摇/active 时序
- 瞄准态模拟弹道飞行轨迹
- 生产环境默认强制全技能抬手（仅 DEV）

## Architecture Assessment

### Existing Design Reuse

| 资产 | 复用方式 |
|---|---|
| `SkillHud` pointer + `.skill-hud__cancel` | 抬起判定、瞄准高亮 |
| `HitboxVfx.bindEffect('aim-preview')` | 按住期间持续 hit 几何 |
| `computeJoystick` / WASD | `aimForwardRad` 计算 |
| `CastSnapshot` + `createCastSnapshot` | 抬起提交时冻结 origin/forward/targetId |
| `findNearestEnemy` | `lock-target` 抬起时锁 `targetId` |
| `practice-session.preTick` `suppressManualMove` | 瞄准期抑制位移 |

### Boundaries and Ownership

```text
GameCanvas / SkillHud
  ├─ 输入：pointer down/up、desktop keydown/keyup、cancel 区
  └─ 每帧：读摇杆 → updateAim → 驱动 VFX

cast-aiming.ts (新)
  ├─ AimingSession 状态：idle | aiming
  ├─ 持有 slotHotkey、skill、aimForwardRad、previewTargetId
  └─ 纯函数 + 工厂，可单测

practice-session
  ├─ beginAim / updateAim / commitAim / cancelAim
  ├─ commit 内部调用既有 tryCastHotkey 逻辑（构建 snapshot）
  └─ aiming 期间 aaIntent.cancel、suppressManualMove

AimIndicatorVfx (新)
  └─ 脚下箭头/扇形；仅 direction / lock-target 显示

HitboxVfx
  └─ aim-preview 绑定；commit/cancel 时 prune
```

- **取消**：`cancelAim` 不调用 `SkillBook.start`，不消耗 CD
- **并发**：单线程；瞄准与施法互斥（已有 SkillBook 单槽）

### Options and Rationale

**1. 预览通道（已决：独立 aim-preview，不用 hitboxActivations）**

| 方案 | 优点 | 缺点 |
|---|---|---|
| 递增 `hitboxActivations` | 复用 GameCanvas 现有循环 | 污染 runtime 语义；瞄准即进 CD 风险 |
| **`bindEffect('aim-preview')`** | 与 effect 预览一致；语义清晰 | 需 GameCanvas 每帧更新 |

**2. 方向输入源（已决：移动摇杆 / WASD）**

用户明确要求「像移动 joystick」。按住技能期间左摇杆与 WASD 优先用于 `aimForwardRad`，不驱动 `controller.setMoveTarget`。

**3. DEV 全技能抬手（已决：DEV flag 覆盖）**

`import.meta.env.DEV && slot !== '0'` 时强制 hold-release，不改生产 JSON 默认值。

### Quality Attributes

- **可测试性**：`cast-aiming.ts` 单测方向/锁定/取消；session 测 commit 后才 `skillBook.active`
- **可维护性**：`aimKind` 数据驱动，避免 GameCanvas 英雄 if-else
- **兼容性**：亚瑟 `aimKind: none` 仅多 DEV 抬手延迟，无指示器

### Complexity and Exceptions

新增 `cast-aiming.ts` + `AimIndicatorVfx` 属于练习场输入真实复杂度。控制：指示器仅两种 mesh（箭头 + 扇形）；逻辑与 Three 解耦通过 `AimIndicatorVfxHandle` 接口。

## Decisions

### D1: `aimKind` 与 `castMode` 分离

- **选择**：`aimKind: none | direction | lock-target`；`castMode` 仍表 instant/targeted
- **替代**：扩展 `castMode` 枚举 — 拒绝，瞄准方式与释放时机正交

### D2: 抬起才提交施法

- **选择**：`commitAim` → `createCastSnapshot` → `skillBook.start`
- **替代**：按下即 cast + 按住只预览 — 拒绝，会进 CD 且无法取消

### D3: 英雄指示器策略

| 英雄 | aimKind 配置 |
|---|---|
| 亚瑟 0–3 | 全部 `none` |
| 妲己 1、2 | `lock-target` |
| 妲己 3 | `direction` |
| 安琪拉 1、2、3 | `direction` |
| 普攻 0 | `none`（可保持 instant 不按抬手） |

### D4: 桌面热键 hold-release（DEV）

- **选择**：`keydown` → `beginAim`，`keyup` → `commitAim`（非 cancel）
- **替代**：仅移动端 — 拒绝，调试需要桌面一致

## Risks / Trade-offs

- **[Risk] 瞄准期无法移动** → `suppressManualMove`；松开技能键恢复
- **[Risk] DEV 抬手改变亚瑟手感** → 仅 DEV；文档注明
- **[Risk] lock-target 无目标时抬起** → commit 失败，不施法，轻提示（P2）
- **[Risk] 与 targeted 移动端双重瞄准** → DEV 统一一条路径；生产保留 castMode 分支

## Migration Plan

1. Phase A：`AimingSession` + aim-preview VFX + DEV hold-release（无指示器）
2. Phase B：`AimIndicatorVfx` + `aimKind` JSON + 方向/锁定预览
3. Phase C：桌面 keyup + 文档 + 全英雄回归

回滚：关闭 DEV 抬手 flag；`aimKind` 默认 `none` 时指示器不显示。

## Open Questions

### Q1: 普攻是否走抬手释放？

建议普攻保持 `instant`（按 0 即放），减少调试摩擦。若需一致可后续改。

### Q2: 妲己 1 `lock-target` 是否显示脚下箭头？

建议仅显示 `target` 范围环 + 可选连线，不显示方向箭头（与「一技能」描述一致）。
