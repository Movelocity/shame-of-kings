## 1. 契约与瞄准核心（Phase A）

- [ ] 1.1 `hero-kit.ts` 增加 `aimKind` 类型与 `assertFourSkillKit` 校验
- [ ] 1.2 更新 `arthur.json` / `daji.json` / `angela.json` 的 `aimKind` 配置（见 design D3）
- [ ] 1.3 新建 `src/game/input/cast-aiming.ts`：`AimingSession` 状态机（idle/aiming、forwardRad、targetId）
- [ ] 1.4 新建 `src/game/input/aim-forward.ts`：`joystick`/`WASD` → `forwardRad` 纯函数 + 单测
- [ ] 1.5 `practice-session` 增加 `beginAim` / `updateAim` / `commitAim` / `cancelAim`；commit 复用 snapshot 构建
- [ ] 1.6 瞄准期 `preTick`：`suppressManualMove` + `aaIntent.cancel`

## 2. 预览 VFX（Phase A）

- [ ] 2.1 `GameCanvas` 瞄准循环：`bindEffect('aim-preview')` 每帧更新；commit/cancel 时 `pruneBoundEffects`
- [ ] 2.2 单测：瞄准中 `skillBook.active === null`；commit 后才开始施法

## 3. 抬手释放输入（Phase B）

- [ ] 3.1 `SkillHud`：DEV 下 hotkey 1–3 全部走 pointer hold-release（非仅 `targeted`）
- [ ] 3.2 `GameCanvas`：`onPressStart` → `beginAim`；`onPressEnd` 取消区判定 → `cancelAim` / `commitAim`
- [ ] 3.3 桌面 DEV：`keydown` 进入瞄准、`keyup` 提交；`Escape` 取消
- [ ] 3.4 单测：取消区抬起不消耗 CD；`Escape` 取消不施法

## 4. 脚下方向指示器（Phase C）

- [ ] 4.1 新建 `src/game/world/AimIndicatorVfx.ts`：贴地箭头/扇形，跟随 `aimForwardRad`
- [ ] 4.2 `GameCanvas` 接线：仅 `aimKind !== 'none'` 时显示；亚瑟技能不显示
- [ ] 4.3 `lock-target` 预览：范围环 + 锁定连线（妲己 1/2）
- [ ] 4.4 手测：安琪拉 1/2/3 摇杆改向，脚下指示器与锥形/直线预览一致

## 5. 文档与回归（Phase D）

- [ ] 5.1 修订 `docs/DEV.md`：练习场瞄准调试、DEV 抬手说明
- [ ] 5.2 亚瑟 DEV 抬手 + 无指示器回归（J/U/I/O）
- [ ] 5.3 妲己/安琪拉瞄准提交后弹道与方向一致性
- [ ] 5.4 `pnpm typecheck` + `pnpm test` + `pnpm lint` 全过

---

## 并发执行策略

| 工作流 | 执行者 | 允许读/改边界 | 依赖门闩 | 产出 |
|---|---|---|---|---|
| 1.1–1.2 hero-kit JSON | Sub-agent A | `heroes/*.json`、`hero-kit.ts` | 无 | aimKind 校验测绿 |
| 1.3–1.4 cast-aiming | 主 agent | `input/cast-aiming.ts`、`aim-forward.ts`、tests | 无 | 方向/锁定单测绿 |
| 1.5–1.6 session API | 主 agent | `practice-session.ts` | 1.3 | commit/cancel 单测 |
| 2.x 预览 VFX | Sub-agent B | `GameCanvas.tsx` aim-preview 段 | 1.5 | 预览不施法单测 |
| 3.x 抬手输入 | 主 agent | `SkillHud.tsx`、`GameCanvas` 输入 | 1.5、2.1 | 取消区测绿 |
| 4.x 指示器 | Sub-agent C | `AimIndicatorVfx.ts`、GameCanvas 接线 | 3.1 | 手测矩阵 |
| 5.x 验证 | 主 agent | 全仓库 | 4.x | CI 全绿 |

**主 agent 合并职责**：统一 `practice-session` 瞄准 API、`GameCanvas` 单文件冲突、跑全量测试、更新 DEV.md。

**禁止并行**：`GameCanvas.tsx` 的 2.x 与 3.x 须顺序合并；`practice-session` commit 路径必须先于 UI 接线。
