## Context

Shame of Kings 处于 M3.5/M3.6 → M4 窗口：机制与练习场手感是 `docs/DEV.md` 的 P0，但组合根 `GameCanvas`（约 500 行）已把世界、技能、buff、输入、VFX、瞄准态全部接线在一起。提案曾规划 Zustand / 更重 platform 层，实际用 ref + 固定步循环更贴合练习场——本设计延续该务实路线，只抽 session，不上新状态库。

约束：M4 前无新依赖；不大改 `src/engine/` 公共接口；不写元歌/镜/地图。

## Goals / Non-Goals

**Goals:**
- 清掉误导性死债与包名/schema 不一致
- 立住可单测的 practice session（create / tick / cast / reset）
- 生产与 DEV 共用同一 `resetWorld`
- 固化验证四件套与文档权威顺序

**Non-Goals:**
- 实现完整亚瑟被动/多段/眩晕机制（属 T35.*，可并行但非本 change 范围）
- 障碍碰撞算法本身（属 T36.1；session 只预留调用点若已存在）
- HeroModule 多英雄抽象、Zustand、PWA、CI 大建设
- 扩展 `coords.ts` / 空间哈希 / 真视野

## Architecture Assessment

### Existing Design Reuse

- `createWorldState`、`createSkillBook`、`startSkill` / `applyDamage`、`createBuffBag`、`createAutoAttackIntent`、`createPracticeDummy`、亚瑟 `arthurSkillByHotkey`
- `createFixedLoop` + `createGameScene`：循环与渲染仍归 engine/UI 挂载
- 现有 Vitest：skills / buffs / combat；新增 session 级单测覆盖 reset 与 cast 入口

### Boundaries and Ownership

| 边界 | 所有者 | 职责 |
|---|---|---|
| Practice session | `src/game/`（新建模块，如 `world/practice-session.ts` 或 `session/`） | 世界对象生命周期、tick、cast、reset |
| Composition | `GameCanvas` | canvas、输入 ref、HUD 更新、调用 session、触发 render |
| Input | `engine/input` + UI 控件 | 归一化输入；不直接改 WorldState |
| Reset UX | PlayPage / 生产 Reset 按钮 + DebugOverlay | 只发 reset 请求到 session |
| Hygiene policy | 仓库约定 + 本 spec | 验证/冻结/死债；无运行时模块 |

失败与资源：session `stop`/组件 unmount 时由 `GameCanvas` 停 loop、释 Three 资源（保持现状）；session 不拥有 WebGLRenderer。

### Options and Rationale

1. **抽纯 TS session（选定）** vs 继续堆在 `GameCanvas`：后者短期快，长期每次机制都改 UI 文件。
2. **session 模块** vs 上 Zustand：提案提过 Zustand，但 HUD 已用 imperative ref；M4 前加依赖违反冻结。
3. **debug-skills 挂回** vs 删除：二选一即可；偏好「DEV 挂热键」若成本 ≤30min，否则删除并改注释，避免假入口。

### Quality Attributes

- **可维护性**：组合根变薄，机制任务少碰 React
- **可测试性**：reset/cast 可脱离 jsdom Three 跑
- **可靠性**：单一 reset 路径消除 KI-2 五跳漂移
- **性能**：无额外每帧 React setState；保持 ref 读模式

### Complexity and Exceptions

唯一新增抽象是 **PracticeSession 句柄**（工厂 + 少量方法）。不引入包、不引入事件总线框架（可继续用现有 damage bus）。验证：session 单测 + 全量回归；回滚：恢复 `GameCanvas` 内联（git revert 本 change 相关提交）。

## Decisions

1. **Session API 最小面**：`createPracticeSession` / `tick(dt)` / `tryCastHotkey` / `requestAutoAttack` / `resetWorld` / 只读快照供 HUD。替代：完整 ECS——拒绝，过度。
2. **重置信号**：UI 可保留 `resetSignal` ref，但最终 MUST 调 `session.resetWorld()`。替代：多处各自清状态——拒绝。
3. **清债顺序**：先表面清债（命名/schema/死文件），机制稳定后再抽 session（与保健日历 Day A → Day C 一致），避免边改机制边大搬家。
4. **文档**：`openspec/project.md` + 本 change；排期仍认 `docs/DEV.md`。

## Risks / Trade-offs

- [抽出时行为漂移] -> 先锁行为手测清单（0/1/2/3 + 重置）；session 单测覆盖 reset 不变量；必要时对照抽前 commit
- [与 T35 机制改动冲突] -> session 抽出安排在一技能/buff 已接线之后，或抽时把 buff 袋一并搬入 session 所有权
- [误删仍被间接引用的文件] -> 删前 `rg` 引用；typecheck 兜底
- [保健范围膨胀进机制] -> tasks 明确排除 T35 机制项；DEV.md 仍领 P0 功能

## Migration Plan

1. Day A：清债提交（可独立 merge）
2. Day B：debug-skills 二选一
3. Day C：抽出 session，行为冻结，补单测；生产重置按钮接同一 API
4. 验证四件套全绿后 archive，将 delta 合入 `openspec/specs/`

回滚：按提交粒度 revert；session 抽出与清债分开提交以便单独回滚。

## Open Questions

- debug-skills：挂热键还是删除？（默认：挂回成本高则删）
- session 文件落点：`src/game/world/practice-session.ts` vs `src/game/session/`（默认单文件 world 旁，避免空目录狂欢）
- 生产重置按钮视觉：沿用 DebugOverlay 样式简化，还是最小文本按钮？（默认：屏幕中上最小按钮，满足 DoD #5）
