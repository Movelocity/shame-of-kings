# Shame of Kings 练习场

> 移动端浏览器离线运行的 MOBA 技能练习场，纯前端 Demo / 学习项目。  
> 荣耀是结果，耻辱是过程 —— 我们选择讲过程的故事。

## 技术栈

- **构建** Vite 8 + TypeScript 6 (strict)
- **UI** React 19
- **3D** Three.js（未使用 React Three Fiber；理由见归档提案）
- **测试** Vitest
- **包管理** pnpm

## 开发

```bash
pnpm install        # 安装依赖
pnpm dev            # 启动开发服务器
pnpm build          # 类型检查 + 生产构建
pnpm test           # 跑单测
pnpm lint           # oxlint
pnpm typecheck      # tsc -b
```

## 设计文档

| 文档 | 用途 |
|---|---|
| **[`docs/DEV.md`](./docs/DEV.md)** | **当前生效：优先级、任务顺序、M4 退出门** |
| [`archives/proposal.md`](./archives/proposal.md) | MVP 范围、DoD 原文、架构原则、技能机制表 |
| [`archives/proposal-v2.md`](./archives/proposal-v2.md) | 已归档的并行演进提案（勿按此排期） |
| [`map-design.md`](./map-design.md) | P2 三路地图规格（M4 退出前不实施） |

新增架构决策前请先读 `docs/DEV.md` 与 `archives/proposal.md` §2。  
**M4 退出门之前**：不引入新依赖、不写元歌/镜/MOBA 地图代码、不大改 `src/engine/` 核心接口（碰撞/重置所需除外）。

## 目录结构

```
src/
├── engine/                 # 与英雄/地图无关的底层
│   ├── loop/               # 固定时间步长调度器
│   ├── renderer/           # 场景 / 相机 / 光照 / Arena / Entity
│   └── input/              # 摇杆逻辑 + 玩家控制器
├── game/                   # 内容层
│   ├── world/              # WorldState / coords / 飘字 / 血条
│   ├── units/              # 木人桩等
│   ├── skills/             # Skill 框架 + SkillBook
│   └── heroes/             # 亚瑟（元歌/镜：M4 后）
├── ui/                     # React HUD
│   ├── pages/              # HomePage / PlayPage
│   └── components/         # GameCanvas / SkillHud / Joystick / …
├── platform/               # 移动端适配
└── styles.css
```

## 目前进度

| 里程碑 | 状态 |
|---|---|
| M0 引擎可见 + 横屏骨架 | ✓ |
| M1 地图与摇杆 | ✓ |
| M2 技能框架 | ✓（大半；debug 技能挂键可选） |
| M3 亚瑟成型 | △ 半成型（伤害管线有；机制/被动未闭环） |
| M3.5 机制闭环 + M3.6 练习场手感 | **当前优先** → 见 `docs/DEV.md` |
| M4 MVP 验收 | 未关退出门 |
| M5+ / P2 | 冻结至 M4 退出 |

校验脚本期望全部通过：

```bash
pnpm typecheck
pnpm test
pnpm build
```
