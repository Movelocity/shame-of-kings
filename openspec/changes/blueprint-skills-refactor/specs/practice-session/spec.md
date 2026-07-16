## MODIFIED Requirements

### Requirement: Fixed-step tick without React
session 的逻辑推进 MUST 可在固定 `dt`（与引擎 `1/60` 一致）下调用，且不触发 React 重渲染。`postTick` MUST 按固定顺序执行：`tickCc` → `skillBook.tick` → `world.tickEffects` → `applyCombatEvents` → 移除死亡单位 → dash 位置同步。

#### Scenario: Pure tick
- **WHEN** 对 session 连续调用 `postTick({ dt: 1/60, ... })`
- **THEN** 移动/技能/buff/effect 时间推进按游戏规则执行，且该调用路径不 import React

#### Scenario: Combat events unified in postTick
- **WHEN** 同一帧技能 instant 伤害与弹道命中均产生 events
- **THEN** `applyCombatEvents` 在单次调用中处理全部 events，而非分散 `applyDamage` 调用

## ADDED Requirements

### Requirement: Reset clears combat event state
`resetWorld` MUST 清空 pending combat 副作用：effects、进行中施法、CD、Buff、CC 状态，确保无跨 reset 的 event 残留。

#### Scenario: Reset after mid-cast beam
- **WHEN** 三技能 beam active 期间调用 `resetWorld`
- **THEN** 周期伤害立即停止，玩家与木人桩状态恢复初始
