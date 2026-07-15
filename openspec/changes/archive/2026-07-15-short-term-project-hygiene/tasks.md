## 1. 表面清债（repo-hygiene）

- [x] 1.1 将 `package.json` 的 `name` 改为 `shame-of-kings`
- [x] 1.2 用 `rg` 确认 `SkillButton` 引用；无挂载则删除 `src/ui/components/SkillButton.tsx`，有挂载则接到真实 HUD
- [x] 1.3 处理 `arthur.json` 的 `$schema`：补最小 `arthur.schema.json` 或删除该字段
- [x] 1.4 核对 README 进度表仅指向 `docs/DEV.md`，并增加 OpenSpec 入口说明

## 2. Debug 入口二选一

- [x] 2.1 评估 DEV 挂回 debug-skills 热键成本；≤30min 则挂键，否则删除/归档目录并改掉「仍可用」类注释
- [x] 2.2 确认 `GameCanvas` 对 `DebugWorld.asUnit` 的依赖：若仅工具函数则内联或迁到 `units/`/`skills/`，避免删目录后断编译

## 3. Practice session 抽出

- [x] 3.1 新增 `src/game/world/practice-session.ts`（或等价单文件），实现 `createPracticeSession` / `tick` / `tryCastHotkey` / `requestAutoAttack` / `resetWorld`
- [x] 3.2 将 `GameCanvas` 内世界创建、技能书、buff、AA intent、每帧逻辑迁入 session；UI 只编排
- [x] 3.3 生产路径增加屏幕中上重置控件，与 DebugOverlay 共用 `session.resetWorld()`
- [x] 3.4 添加 `tests/world/practice-session.test.ts`：reset 不变量（出生点、满血、CD 清、buff 清）+ 热键 cast 可启动 instance

## 4. Architecture Verification

- [x] 4.1 `pnpm typecheck && pnpm test && pnpm lint` 全绿；本 change 收尾再跑 `pnpm build`
- [x] 4.2 手测回归：桌面 0/1/2/3 技能与重置；确认抽出前后可见行为一致
- [x] 4.3 冻结哨兵：审查 diff 无新依赖、无元歌/镜/地图新代码
- [x] 4.4 死债哨兵：`rg` 确认无坏 schema、无未引用 SkillButton、debug-skills 状态符合二选一结果
- [x] 4.5 确认 `GameCanvas` 不再内联拥有完整世界生命周期；session 模块可在不 import React 的情况下被测试导入
