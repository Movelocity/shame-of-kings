# Web MOBA 手法练习场

> 移动端浏览器离线运行的 Moba 技能练习场,纯前端 Demo / 学习项目。
> MVP 第一刀:亚瑟 + 木人桩.

## 技术栈

- **构建** Vite 8 + TypeScript 6 (strict)
- **UI** React 19
- **3D** Three.js (`OrthographicCamera` → `PerspectiveCamera` 决策见 `proposal.md`)
- **测试** Vitest
- **包管理** pnpm

## 开发

```bash
pnpm install        # 安装依赖
pnpm dev            # 启动开发服务器
pnpm build          # 类型检查 + 生产构建
pnpm test           # 跑单测
pnpm lint           # oxlint
```

## 设计文档

项目核心方案见 [`proposal.md`](./proposal.md)。包含:

- 项目定位与边界
- 技术决策与理由(含"为什么不用 React Three Fiber")
- MVP DoD
- 9 个里程碑(M0–M7)+ P2 路线图(元歌/镜扩展)
- 关键技术细节(锁横屏全屏、技能框架、相机视角)

新增架构决策前请先读 `proposal.md`。**不要在元歌/镜之前的 milestone 引入新依赖或重构 `src/engine/` 核心接口**,这一原则在 §2.2 写明。

## 目录结构

```
src/
├── engine/                 # 与英雄/地图无关的底层
│   ├── loop/               # 固定时间步长调度器
│   ├── renderer/           # 场景 / 相机 / 光照 / Arena / Entity / 玩家控制器
│   └── input/              # 摇杆逻辑 + 玩家控制器
├── game/                   # 内容层(MVP 内为空,M2+ 启用)
│   ├── world/              # WorldState
│   ├── units/              # Unit 基类、Hero、PracticeDummy
│   ├── skills/             # Skill 框架
│   └── heroes/             # 亚瑟 / 元歌 / 镜
├── ui/                     # React HUD
│   ├── pages/              # HomePage / PlayPage
│   ├── components/         # Joystick / GameCanvas
│   └── store/              # Zustand stores(M2+ 启用)
├── platform/               # 移动端适配
└── styles.css
```

## 目前进度(M0-M1 已完成,M2 技能框架起步)

| 里程碑 | 状态 |
|---|---|
| M0 引擎可见 + 横屏骨架 | ✓ |
| M1 地图与摇杆 | ✓(控制器 + 虚拟摇杆 + 玩家移动) |
| M2 技能框架 | 待启动 |
| M3 亚瑟成型 | 待启动 |

校验脚本:

```bash
pnpm typecheck   # 或 pnpm exec tsc -b --force
pnpm test        # vitest
pnpm build       # tsc + vite build
```

期望全部通过。
