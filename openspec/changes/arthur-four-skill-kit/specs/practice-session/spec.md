## MODIFIED Requirements

### Requirement: Session owns world lifecycle
系统 SHALL 提供与 React 解耦的练习场 session 边界，负责创建世界单位、SkillBook、Buff 袋、普攻意图，以及统一的 `resetWorld`；并负责推进场上单位的 CC 计时。

#### Scenario: Create session
- **WHEN** 调用 session 工厂创建练习场
- **THEN** 得到含玩家 Unit、木人桩、SkillBook、Buff 袋的可 tick 会话，且不依赖 React hooks

#### Scenario: Unified reset
- **WHEN** 调用 `resetWorld`（或等价 API）
- **THEN** 玩家回到出生点、木人桩满血、技能 CD/进行中施法清空、Buff 袋清空、普攻意图清空、单位 CC 清空

### Requirement: Fixed-step tick without React
session 的逻辑推进 MUST 可在固定 `dt`（与引擎 `1/60` 一致）下调用，且不触发 React 重渲染；CC 计时 MUST 在同一 tick 路径推进。

#### Scenario: Pure tick
- **WHEN** 对 session 连续调用 `tick(1/60)`
- **THEN** 移动/技能/buff/CC 时间推进按既有游戏规则执行，且该调用路径不 import React

#### Scenario: CC tick in session
- **WHEN** session 每帧 postTick 或专用 `tickCc` 被调用
- **THEN** 所有单位击飞剩余时间递减
