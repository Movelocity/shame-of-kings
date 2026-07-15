## ADDED Requirements

### Requirement: Session owns world lifecycle
系统 SHALL 提供与 React 解耦的练习场 session 边界，负责创建世界单位、SkillBook、Buff 袋、普攻意图，以及统一的 `resetWorld`。

#### Scenario: Create session
- **WHEN** 调用 session 工厂创建练习场
- **THEN** 得到含玩家 Unit、木人桩、SkillBook、Buff 袋的可 tick 会话，且不依赖 React hooks

#### Scenario: Unified reset
- **WHEN** 调用 `resetWorld`（或等价 API）
- **THEN** 玩家回到出生点、木人桩满血、技能 CD/进行中施法清空、Buff 袋清空、普攻意图清空

### Requirement: Fixed-step tick without React
session 的逻辑推进 MUST 可在固定 `dt`（与引擎 `1/60` 一致）下调用，且不触发 React 重渲染。

#### Scenario: Pure tick
- **WHEN** 对 session 连续调用 `tick(1/60)`
- **THEN** 移动/技能/buff 时间推进按既有游戏规则执行，且该调用路径不 import React

### Requirement: Cast entry stays on session
按热键/技能 id 施法（含普攻请求）MUST 经由 session 入口，而不是散落在多个互不相通的闭包中重复实现。

#### Scenario: Hotkey cast
- **WHEN** 通过 session 的 cast/hotkey API 请求亚瑟某主动技能且 CD 允许
- **THEN** SkillBook 开始对应 SkillInstance，行为与抽出前一致

#### Scenario: Auto-attack request
- **WHEN** 通过 session 请求普攻
- **THEN** 走既有 auto-attack intent 锁敌路径，不在 UI 层另写一套结算

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
