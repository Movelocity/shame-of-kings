# practice-session

## Purpose
定义练习场会话的完整生命周期与固定步编排：创建世界、解析英雄施法、推进技能和效果、统一结算及 reset，并保持 UI 组合根不承载战斗规则。
## Requirements
### Requirement: Session owns world lifecycle
系统 SHALL 提供与 React 解耦的练习场 session 边界，负责创建世界单位、SkillBook、Buff 袋、普攻意图，以及统一的 `resetWorld`；`resetWorld` MUST 同时清空 `WorldState.effects`。

#### Scenario: Create session
- **WHEN** 调用 session 工厂创建练习场
- **THEN** 得到含玩家 Unit、木人桩、SkillBook、Buff 袋、空 effects 集合的可 tick 会话，且不依赖 React hooks

#### Scenario: Unified reset
- **WHEN** 调用 `resetWorld`（或等价 API）
- **THEN** 玩家回到出生点、木人桩满血、技能 CD/进行中施法清空、Buff 袋清空、普攻意图清空、所有 skill effects 移除

### Requirement: Fixed-step tick without React
session 的逻辑推进 MUST 可在固定 `dt`（与引擎 `1/60` 一致）下调用，且不触发 React 重渲染。

#### Scenario: Pure tick
- **WHEN** 对 session 连续调用 `tick(1/60)`
- **THEN** 移动/技能/buff 时间推进按既有游戏规则执行，且该调用路径不 import React

### Requirement: Cast entry stays on session
按热键/技能 id 施法（含普攻请求）MUST 经由 session 入口；入口 MUST 英雄无关，根据当前选中 hero loader 解析技能，而不是硬编码 `arthurSkillByHotkey`。

#### Scenario: Hotkey cast
- **WHEN** 通过 session 的 cast/hotkey API 请求当前英雄某主动技能且 CD 允许
- **THEN** SkillBook 开始对应 SkillInstance，行为与英雄数据一致

#### Scenario: Auto-attack request
- **WHEN** 通过 session 请求普攻
- **THEN** 走既有 auto-attack intent 锁敌路径，使用当前英雄普攻技能定义

### Requirement: GameCanvas is composition only
`GameCanvas` SHALL 负责挂载 canvas、绑定输入/HUD、调用 session 与渲染；MUST NOT 继续内联拥有完整世界生命周期实现（抽出后目标显著变短，逻辑单测覆盖 session）。

#### Scenario: Thin composition root
- **WHEN** 完成接线收口
- **THEN** 世界创建/tick/cast/reset 的实现位于 session 模块，`GameCanvas` 仅编排调用

#### Scenario: Behavior freeze
- **WHEN** 抽出前后用既有桌面热键 0/1/2/3 与重置做回归
- **THEN** 可见行为与抽出前一致（允许内部函数边界变化）

### Requirement: Production reset control
生产构建 MUST 提供屏幕可达的重置控件（非仅 DEV DebugOverlay），并调用同一 `resetWorld`。

#### Scenario: Production reset visible
- **WHEN** 以非 DEV 构建进入练习场
- **THEN** 玩家可点击重置控件完成统一重置

#### Scenario: Dev overlay shares reset
- **WHEN** DEV 下使用 DebugOverlay 重置
- **THEN** 与生产重置控件调用同一 session `resetWorld`

### Requirement: Multi-hero practice session
练习场 session MUST 支持在亚瑟、妲己、安琪拉之间切换（最小 UI 或 DEV 开关均可）；切换时重置技能 CD、buff、effects 与进行中的施法。

#### Scenario: Switch hero clears combat state
- **WHEN** 玩家从亚瑟切换到妲己
- **THEN** `SkillBook`、buff 袋、world effects 清空，单位技能集换为妲己 loader 产物

### Requirement: Session ticks world effects
session 的 `postTick`（或等价路径）MUST 调用 world effects tick，将 effect 产生的 `DamageResult` 走与技能相同的 `applyDamage` / `notifyDamage` 路径。

#### Scenario: Fireball damage via session tick
- **WHEN** 安琪拉火球在 postTick 中命中木人桩
- **THEN** 木人桩 hp 减少且触发飘字，无需依赖 React 层逻辑
