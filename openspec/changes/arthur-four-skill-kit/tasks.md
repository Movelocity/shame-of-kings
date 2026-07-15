## 1. 四技能模版（hero-four-skill-template）

- [x] 1.1 新增 `src/game/heroes/hero-kit.ts`：`HeroKitData`、`assertFourSkillKit`（hotkey 0/1/2/3 各一）
- [x] 1.2 扩展 `arthur.schema.json`：四槽位、`effect` 扩展字段（`aoeRadius`、`damageInterval`、`damageTicks`、`knockupDuration`、`acquireRange`）
- [x] 1.3 `arthur.ts` 装载前调用 `assertFourSkillKit`；导出模版类型供后续英雄复用

## 2. 亚瑟技能数据（arthur-skill-kit）

- [x] 2.1 重写 `arthur.json` 一技能：移速 buff + `enhancedAttackDashDistance`；点击技能本身不位移
- [x] 2.2 重写二技能：`aoeRadius`、`damageInterval`、`damageTicks`；`activeTime` 与间歇 tick 对齐
- [x] 2.3 重写三技能：共享 `aoeRadius`、`knockupDuration`；`stunDuration` 改为击飞语义
- [x] 2.4 普攻槽（hotkey `0`）保持四槽位结构，确认 lock 敌语义未破坏

## 3. 运行时机制

- [x] 3.1 `types.ts`：`Unit.cc` 可选字段；`Skill` 可选 `damageInterval` / `damageTicks` 或等价配置
- [x] 3.2 `runtime.ts`：active 阶段按 interval 间歇 `resolveHits`（二技能）
- [x] 3.3 新增 `src/game/combat/unit-cc.ts`：`applyKnockup`、`tickCc`、`clearCc`
- [x] 3.4 英雄状态栈：属性叠加 + 指定技能/次数/持续时间 + 索敌/非索敌 dash；一技能强化普攻出手时消耗
- [x] 3.6 普通普攻自动追击范围收缩为 `attackRange × 1.3`，超出时空 A
- [x] 3.7 `dash` 按速度逐帧推进且抵达后结算；新增 `teleport` 单帧位移语义；强化普攻独立配置索敌距离
- [x] 3.8 索敌 dash 强制覆盖轮盘移动；非索敌 dash 严格使用释放时朝向与配置距离
- [x] 3.5 三技能落地圈：dash 结束后同 `aoeRadius` 二次 AoE + 对命中单位 `applyKnockup`

## 4. Session 与表现（practice-session + unit-crowd-control）

- [x] 4.1 `practice-session`：每帧 `tickCc`；`resetWorld` 清空 CC
- [x] 4.2 `WorldHpBars`：血条上方显示击飞状态（`remaining > 0`）
- [x] 4.3 `GameCanvas` 仅接线（若需同步突脸位移到 scene）；不内联 CC/间歇逻辑

## 5. 测试与文档

- [x] 5.1 `tests/heroes/hero-kit.test.ts`：四槽位校验通过/失败用例
- [x] 5.2 `tests/combat/unit-cc.test.ts`：击飞施加、tick 过期、reset 清空
- [x] 5.3 单测：空 A、一技能不直接位移/下次普攻 dash、二技能周期伤害盒、三技能落地圈击飞
- [x] 5.4 更新 `docs/DEV.md` T35.4 机制表与亚瑟技能描述
- [ ] 5.5 手测：桌面 0/1/2/3；木人桩血条上方击飞可见

## 6. Architecture Verification

- [x] 6.1 `pnpm typecheck && pnpm test && pnpm lint` 全绿
- [x] 6.2 冻结哨兵：无新 npm 依赖、无元歌/镜/地图新代码
- [x] 6.3 确认四技能模版可被第二份 stub JSON 通过 `assertFourSkillKit`（不实现第二英雄，仅契约测试）
- [x] 6.4 确认 `practice-session` 仍可不 import React 被单测导入
