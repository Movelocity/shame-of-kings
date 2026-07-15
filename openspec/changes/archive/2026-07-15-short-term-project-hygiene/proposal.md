## Why

当前仓库能跑、测试也绿，但存在三类「会拖垮 M3.5–M4 节奏」的健康问题：组合根 `GameCanvas` 接线过重、明确死债与假入口（未挂载组件、坏 `$schema`、包名仍为 `scaffold`、debug-skills 半死），以及缺少可重复的验证仪式。若边做机制边继续往组合根堆逻辑，碰撞/重置/第二英雄都会改爆。

现在做短期保健，是为了在关闭 M4 退出门之前把债清掉、把 session 边界立住，同时不抢 `docs/DEV.md` 里的机制优先任务；功能排期仍以 DEV 为准，本 change 只吃保健配额。

## What Changes

- 建立仓库级保健契约：验证四件套、死引用清零、单一文档真相、M4 冻结哨兵
- 清债：`package.json` name、未引用 `SkillButton.tsx`、`arthur.json` schema 引用、debug-skills「能用或删除」二选一
- 从 `GameCanvas` 抽出练习场 session 边界（创建 / tick / cast / reset），行为不变；React 只挂 canvas 与读 ref
- 生产路径可点重置，汇入同一 `resetWorld`（对齐 DoD #5 / KI-2）
- **不**引入新依赖；**不**开工元歌/镜/地图；**不**为「将来并行」新增抽象层

## Capabilities

### New Capabilities
- `repo-hygiene`: 验证仪式、死债策略、命名/schema 一致性、文档权威顺序、冻结哨兵
- `practice-session`: 练习场会话生命周期（创建世界、固定步 tick、施法入口、统一 reset）；UI 组合根变薄

### Modified Capabilities
- （无）`openspec/specs/` 尚无基线 capability；本 change 以新增能力建立真相，归档后成为后续 delta 的基准

## Architecture Impact

- 复用：`createWorldState`、`createSkillBook`、`createBuffBag`、`createFixedLoop`、`createGameScene`、亚瑟 Skill 表、现有 Vitest 套件
- 影响模块：`src/ui/components/GameCanvas.tsx`（变薄）、可能新增 `src/game/` 下 session 模块、`PlayPage` / `DebugOverlay` 重置接线、`package.json`、`arthur.json`、`debug-skills/`
- 不改：`src/engine/` 公共接口（除非重置/碰撞接线必需）、技能状态机语义、英雄 JSON 机制字段含义
- 测试：抽出后的 session 纯逻辑应可单测；现有 skills/buffs 单测不得回归

## Impact

- 代码：`GameCanvas`、重置信号链、可选 `SkillButton.tsx` / debug-skills 删除或挂回
- 配置：`package.json` name；`arthur.json` `$schema`
- 文档：`README.md` / `docs/DEV.md` 进度与 OpenSpec 互指；archives / mimocode 旧计划不领任务
- 依赖：无新增；无 BREAKING 对外 API（纯前端 Demo）
