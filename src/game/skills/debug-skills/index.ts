// M2 T2.4:4 个调试技能,仅 dev-only 守卫
// 提供 1/2/3/4 键触发(由 GameCanvas 在 import.meta.env.DEV 下接)。
//
// 4 个技能覆盖 proposal §5.2 锁的"5 类命中盒"中的关键 4 类:
//   1. passive:hit=self(给自己加 buff,无位移)
//   2. dash:   displacement=dash,hit=self(突进 + 自命中)
//   3. circle: hit=circle,radius=3,AOE(回旋打击,亚瑟 2 技能原型)
//   4. target: hit=target,range=8(圣剑裁决,亚瑟 3 技能原型)
//
// M3 亚瑟技能会基于这 4 个调试技能"扩成 JSON 数据驱动";T2.4 只做最小可跑版。
import { makeSkill, simpleDamage } from '../runtime';
import type { Skill } from '../types';

/** 1. 被动 / 增益:命中自身,无伤害,无位移(用来验证 cast/active/recovery 状态机) */
export const DEBUG_PASSIVE_SKILL: Skill = makeSkill({
  id: 'debug-passive',
  displayName: 'Passive',
  hit: { kind: 'self' },
  castTime: 0.2,
  activeTime: 0.3,
  recoveryTime: 0.2,
  cooldown: 2.0,
});

/** 2. 突进:displacement=dash,5 单位一次性推进(玩家前方) */
export const DEBUG_DASH_SKILL: Skill = makeSkill({
  id: 'debug-dash',
  displayName: 'Dash',
  hit: { kind: 'self' },
  displacement: 'dash',
  castTime: 0.15,
  activeTime: 0.1,
  recoveryTime: 0.2,
  cooldown: 3.0,
  dashDistance: 5,
});

/** 3. 圆形 AOE:半径 3,造成 100 伤害(回旋打击原型) */
export const DEBUG_CIRCLE_SKILL: Skill = makeSkill({
  id: 'debug-circle',
  displayName: 'Spin',
  hit: { kind: 'circle', radius: 3 },
  castTime: 0.1,
  activeTime: 0.2,
  recoveryTime: 0.3,
  cooldown: 4.0,
  damage: simpleDamage(100),
});

/** 4. 目标锁定:range 8,最近目标造成 200 伤害(圣剑裁决原型) */
export const DEBUG_TARGET_SKILL: Skill = makeSkill({
  id: 'debug-target',
  displayName: 'Strike',
  hit: { kind: 'target', range: 8 },
  castTime: 0.3,
  activeTime: 0.1,
  recoveryTime: 0.4,
  cooldown: 5.0,
  damage: simpleDamage(200),
});

/** 调试技能数组,GameCanvas 在 DEV 下导入这 4 个 */
export const DEBUG_SKILLS: readonly Skill[] = [
  DEBUG_PASSIVE_SKILL,
  DEBUG_DASH_SKILL,
  DEBUG_CIRCLE_SKILL,
  DEBUG_TARGET_SKILL,
];

/** 1/2/3/4 键到调试技能的映射(M3 亚瑟可继续沿用这套绑定) */
export function debugSkillByHotkey(key: '1' | '2' | '3' | '4'): Skill | null {
  const idx = Number(key) - 1;
  return DEBUG_SKILLS[idx] ?? null;
}
