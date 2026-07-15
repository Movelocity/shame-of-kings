## Why

当前亚瑟技能与产品意图不一致：`arthur.json` 一技能只有自 buff、二技能是单帧多段结算、三技能有 `stunDuration` 字段但 runtime 未落地，也没有击飞状态与血条上方反馈。M3.5 机制闭环（`docs/DEV.md` T35.*）因此无法验收。

同时元歌/镜等后续英雄都需要统一的 **四槽位模版**（0 普攻 + 1/2/3 主动），应在亚瑟重做时把数据契约与 loader 一次定好，避免每个英雄各写一套热键与 HUD 接线。

## What Changes

- 确立 **四技能模版**（hotkey `0` 普攻 + `1/2/3` 主动）：JSON schema、loader 契约、预留字段；亚瑟为首个实现，其它英雄后续复用
- **一技能**：加速 buff + **锁最近敌人突脸**（复用锁敌/追击语义，非玩家选方向 dash）
- **二技能**：以自身为圆心的范围伤害，**active 阶段内间歇 tick**（非单帧多段）
- **三技能**：指向性 **瞬间突脸**目标附近 → 落地 **与二技能同半径** 的圈伤 → 对命中敌人施加 **击飞**
- 新增最小 **CC 状态**（击飞）：挂在 `Unit`，由 `practice-session` tick 递减；`resetWorld` 清空
- **血条上方状态条**：击飞时在木人桩（及未来单位）血条上方显示状态文案/图标
- 更新 `arthur.json` 与 `arthur.ts` loader；**BREAKING** 相对旧「契约之盾仅自 buff」的一技能语义
- **不**引入新 npm 依赖；**不**开工元歌/镜/地图；碰撞（T36.1）本 change 不实现，但 dash 形态为后续碰撞预留

## Capabilities

### New Capabilities

- `hero-four-skill-template`: 英雄四槽位数据模版（0 普攻 + 1/2/3 主动）、共享 JSON 字段与 loader 契约，供多英雄复用
- `arthur-skill-kit`: 亚瑟三主动 + 普攻的具体机制（突脸锁敌、间歇圈伤、落地圈 + 击飞）
- `unit-crowd-control`: 单位 CC 状态（击飞）、session tick、reset 清空、与技能施加入口

### Modified Capabilities

- `practice-session`: session tick 需推进单位 CC 计时；三技能落地圈伤与击飞经 session/world 路径结算

## Architecture Impact

- **复用**：`createSkillBook`、`startSkill`/`SkillInstance`、`createBuffBag`、`createAutoAttackIntent`（一技能锁敌可参考）、`findNearestEnemy`、`practice-session` pre/post tick、`WorldHpBars`
- **扩展**：`Unit` 增加可选 `status`/`cc` 字段；`Skill`/`SkillInstance` 支持 active 内 **周期性** 命中（二技能）；三技能 **落地二次 AoE**（共享 `aoeRadius`）
- **影响模块**：`src/game/heroes/arthur.json`、`arthur.ts`、`arthur.schema.json`；`src/game/skills/types.ts`、`runtime.ts`；`src/game/world/practice-session.ts`；`src/game/world/WorldHpBars.ts`；可选 `src/game/combat/` 下小模块（锁敌突脸 / CC 袋）
- **不改**：`src/engine/` 除后续碰撞 change 外；React HUD 热键布局仍为 0–3
- **测试**：CC tick、二技能间歇伤害 tick 数、三技能击飞施加、一技能锁最近敌人突脸 intent；现有 buff/普攻单测不回归

## Impact

- 数据：`arthur.json`、`arthur.schema.json`、新增或扩展 `hero-kit` 类型定义
- 代码：heroes loader、skills runtime、practice-session、WorldHpBars
- 文档：`docs/DEV.md` T35.4 验收描述与机制表对齐本提案
- UI：木人桩血条上方击飞状态；SkillHud 显示名可随 JSON 更新
- 依赖：无新增
