## Why

当前练习场施法入口分裂：`castMode: 'instant'` 技能按下即放（含桌面热键），`castMode: 'targeted'` 仅在移动端 SkillHud 支持抬手释放与取消区。远程英雄（妲己、安琪拉）上线后，调试弹道方向、命中盒范围、锁定目标等机制时，无法在按住期间持续预览几何，也无法用摇杆式输入调整朝向。

为提升练习场调试效率，需要统一「按下瞄准 → 持续预览 hitbox → 抬起释放 / 取消区抬起取消」交互；对需要选方向的技能，在按住期间用移动摇杆（或 WASD）控制 `forwardRad`，并在角色脚下渲染方向指示器。亚瑟技能保持无方向指示器，仅沿用抬手释放与预览（DEV 阶段）。

## What Changes

- 引入 `AimKind` 契约（`none` / `direction` / `lock-target`），扩展 `hero-kit` JSON 与校验，与现有 `castMode` 解耦
- 新增 `AimingSession` 状态机：按下进入瞄准、按住每帧更新预览、抬起提交或取消；**不**在瞄准期调用 `startSkill`
- 按住期间通过 `HitboxVfx.bindEffect('aim-preview', ...)` 持续显示技能 `hit` 几何；抬起提交后才走 `CastSnapshot` + `SkillBook.start`
- 新增 `AimIndicatorVfx`：脚下箭头/扇形指示器；仅 `aimKind: 'direction'` 或 `lock-target` 技能显示（亚瑟全部为 `none`）
- 瞄准期间移动输入（左摇杆 / WASD）优先用于更新 `aimForwardRad`，`practice-session` 设置 `suppressManualMove`
- DEV 构建下除普攻外全部技能强制抬手释放；生产构建仍由 JSON `castMode` / `aimKind` 控制
- 桌面端 DEV：热键 `keydown` 进入瞄准、`keyup` 提交；取消区与 `Esc` 取消
- 复用现有 `.skill-hud__cancel` 取消判定与 `SkillHud` pointer 事件

## Capabilities

### New Capabilities

- `cast-aiming`: 瞄准会话状态机、hold-release 输入编排、`aimForwardRad` / `targetId` 预览解析、与 `practice-session` 的 begin/update/commit/cancel API
- `aim-indicator-vfx`: 角色脚下方向指示器 Three.js 渲染，与 `AimKind` 联动

### Modified Capabilities

- `practice-session`: 施法入口拆分为瞄准预览与正式提交；瞄准期抑制移动与普攻追击
- `hero-kit`: 新增 `aimKind` 字段校验与各英雄 JSON 配置

## Architecture Impact

- **复用**：`HitboxVfx.bindEffect` / `pruneBoundEffects`（remote-hero-skill-runtime 已落地）、`computeJoystick`、`CastSnapshot`、`findNearestEnemy`、`SkillHud` pointer + cancel 区、`castMode: 'targeted'` 既有瞄准态 UI
- **扩展**：`practice-session` 增加瞄准 API，不修改 `SkillInstance` 状态机；预览不递增 `hitboxActivations`
- **边界**：`GameCanvas` 编排瞄准输入与 VFX tick；`AimIndicatorVfx` 独立于 `HitboxVfx`；逻辑层 `cast-aiming.ts` 可单测
- **英雄配置**：亚瑟全 `aimKind: none`；妲己 1/2 `lock-target`、3 `direction`；安琪拉 1/2/3 `direction`
- **测试**：瞄准态不施法、取消不扣 CD、方向更新改变预览、提交后 snapshot 含正确 `forwardRad`/`targetId`

## Impact

- `src/game/input/cast-aiming.ts`（新）、`src/game/world/AimIndicatorVfx.ts`（新）
- `src/game/world/practice-session.ts`、`src/game/world/HitboxVfx.ts`（预览绑定）
- `src/game/heroes/hero-kit.ts`、`arthur.json`、`daji.json`、`angela.json`
- `src/ui/components/GameCanvas.tsx`、`SkillHud.tsx`
- `src/engine/input/desktop-skill-hotkeys.ts`（可选 keyup 支持）
- `tests/input/`、`tests/world/` 新增瞄准单测
- `docs/DEV.md` 补充练习场瞄准调试说明
