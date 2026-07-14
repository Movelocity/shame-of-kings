# Shame of Kings · OpenSpec 项目上下文

## 定位

移动端浏览器离线运行的 **MOBA 技能练习场**（纯前端 Demo / 学习项目）。  
MVP：亚瑟在木人桩上反复释放技能 + 一键重置。

## 技术栈

- Vite 8 + TypeScript (strict) + React 19 + Three.js（不用 R3F）
- Vitest + oxlint；包管理 pnpm
- **M4 退出门之前：不引入新依赖**

## 目录边界

| 层 | 路径 | 职责 |
|---|---|---|
| engine | `src/engine/` | 固定步长循环、Three 渲染、输入归一 |
| game | `src/game/` | WorldState、技能/buff、英雄数据、木人桩 |
| ui | `src/ui/` | React HUD；不承载伤害/命中逻辑 |
| platform | `src/platform/` | 移动端 UA / 横屏适配 |

## 架构原则（不妥协）

1. 渲染与逻辑分离；飘字走 Three.js Sprite，不走 React
2. 固定逻辑步长 `1/60`
3. 技能逻辑纯 TS，可单测
4. 数据驱动英雄（JSON + loader）
5. M4 前不大改 `src/engine/` 核心接口（碰撞/重置所需除外）
6. M4 前不写元歌 / 镜 / `map.yaml` / 寻路 / 视野 / Minimap

## 文档权威顺序

1. **`docs/DEV.md`** — 当前任务顺序与退出门（生效）
2. `archives/proposal.md` — MVP 范围、DoD、机制表原文
3. **`openspec/`** — 变更提案与能力规格（本目录）
4. `map-design.md` — P2 地图规格（M4 前冻结）

排期冲突时以 `docs/DEV.md` 为准；行为契约冲突时以已归档进 `openspec/specs/` 的 capability 为准，并用 change 提案更新。

## 验证命令

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

## 当前阶段（2026-07-14）

- M0–M2 ✓；M3 △；优先 **M3.5 机制闭环 + M3.6 练习场手感** → M4 真机验收
- 已知接线债：`GameCanvas` 过重；死引用 / 假入口 / 包名 `scaffold` 等见 active change
