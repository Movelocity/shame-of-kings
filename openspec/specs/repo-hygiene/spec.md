# repo-hygiene

仓库级保健契约：验证仪式、死债策略、命名/schema 一致性、文档权威顺序、M4 冻结哨兵。

## Requirements

### Requirement: Verification four-pack stays green
每次完成一块保健或接线任务后，仓库 MUST 能通过 `pnpm typecheck`、`pnpm test`、`pnpm lint`；关闭本 change 前 MUST 额外通过 `pnpm build`。

#### Scenario: Post-task verification
- **WHEN** 开发者完成一项本 change 的 tasks 条目
- **THEN** `pnpm typecheck`、`pnpm test`、`pnpm lint` 均以退出码 0 结束

#### Scenario: Change exit gate
- **WHEN** 本 change 准备 archive
- **THEN** `pnpm typecheck`、`pnpm test`、`pnpm lint`、`pnpm build` 全部通过

### Requirement: No misleading dead entries
仓库 MUST NOT 保留「文件存在但未挂载、坏引用、或注释声称可用却不可达」的入口；死组件要么删除，要么接到真实路径。

#### Scenario: Orphan SkillButton resolved
- **WHEN** 检查 `src/ui/components/SkillButton.tsx`
- **THEN** 该文件要么被生产/DEV UI 引用，要么已从仓库删除

#### Scenario: Arthur schema reference valid
- **WHEN** 读取 `src/game/heroes/arthur.json` 的 `$schema`
- **THEN** 指向的 schema 文件存在且可读，或该字段已移除

#### Scenario: Debug skills binary choice
- **WHEN** 检查 `src/game/skills/debug-skills/`
- **THEN** DEV 构建下存在可触发热键路径，或目录已删除/归档且注释不再声称可用

### Requirement: Package identity matches project
`package.json` 的 `name` MUST 标识本项目（`shame-of-kings`），不得保留脚手架默认名。

#### Scenario: Package name corrected
- **WHEN** 读取根目录 `package.json`
- **THEN** `"name"` 为 `shame-of-kings`

### Requirement: Single planning source of truth
任务排期 MUST 以 `docs/DEV.md` 为生效文档；OpenSpec change 描述行为契约与本保健范围。archives 与 `.mimocode/plans` 中的过时并行计划 MUST NOT 作为领任务依据。

#### Scenario: Conflicting plan ignored
- **WHEN** archives 或 mimocode 旧计划与 `docs/DEV.md` 冲突
- **THEN** 以 `docs/DEV.md` 为准开工，且 README 进度表指向 DEV

### Requirement: M4 freeze sentinel
在 M4 退出门关闭前，本 change 与并行工作 MUST NOT 引入新 npm 依赖，MUST NOT 新增元歌/镜/`map.yaml`/寻路/视野/Minimap 实现代码。

#### Scenario: No new dependency
- **WHEN** 审查本 change 的 `package.json` / lockfile diff
- **THEN** 无新增 runtime 或 devDependency（仅为既有版本解析的 lock 噪声除外）

#### Scenario: No premature content branches
- **WHEN** 搜索 `src/` 是否出现元歌、镜、三路地图数据加载或 A* 实现
- **THEN** 无本 change 引入的此类新代码
