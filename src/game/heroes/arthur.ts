// M3 T3.1:亚瑟 4 技能装载
// 数据驱动:从 arthur.json 读 → 转成 4 个 Skill 实例 + 1 个被动逻辑
// M5 元歌 / M6 镜复用此模式(每个英雄一个 .json + .ts)
import arthurJson from './arthur.json' with { type: 'json' };
import { makeSkill } from '../skills/runtime';
import type { DamageFormula, Hit, Skill, SkillContext } from '../skills/types';

export interface ArthurData {
  id: string;
  displayName: string;
  stats: { hpMax: number; attackDamage: number; moveSpeed: number };
  passive: {
    id: string;
    name: string;
    description: string;
    triggerChance: number;
    healRatio: number;
    outOfCombatSpeedBoost: number;
    outOfCombatWindow: number;
  };
  skills: Array<{
    id: string;
    name: string;
    hotkey: string;
    hit: Skill['hit'];
    displacement: Skill['displacement'];
    castTime: number;
    activeTime: number;
    recoveryTime: number;
    cooldown: number;
    effect: {
      damage?: number;
      hits?: number;
      dashDistance?: number;
      moveSpeedBoost?: number;
      duration?: number;
      nextAttackBonus?: number;
      stunDuration?: number;
    };
  }>;
}

const data: ArthurData = arthurJson as ArthurData;

/** 简单伤害公式(借鉴 simpleDamage,但内联避免循环依赖) */
function arthurDamage(amount: number): DamageFormula {
  return (_ctx: SkillContext, hit: Hit) => {
    if (!hit.target) return null;
    return { targetId: hit.target.id, damage: amount, isCrit: false };
  };
}

/** 多段伤害公式(hits 段;M3 阶段都按单段结算,M5 镜连段时再扩) */
function arthurMultiHit(
  totalDamage: number,
  hits: number,
  passiveBonus: number,
): DamageFormula {
  const perHit = Math.round((totalDamage * passiveBonus) / hits);
  return (_ctx, hit) => {
    if (!hit.target) return null;
    return { targetId: hit.target.id, damage: perHit, isCrit: false };
  };
}

/** 装载亚瑟 4 技能:从 JSON 数据 → 运行时 Skill 实例 */
export function loadArthurSkills(): readonly Skill[] {
  return data.skills.map((s) => {
    const base = {
      id: s.id,
      displayName: s.name,
      hit: s.hit,
      displacement: s.displacement,
      castTime: s.castTime,
      activeTime: s.activeTime,
      recoveryTime: s.recoveryTime,
      cooldown: s.cooldown,
      dashDistance: s.effect.dashDistance ?? 0,
    };
    if (s.id === 'whirlwind-strike' && s.effect.damage) {
      return makeSkill({
        ...base,
        damage: arthurMultiHit(
          s.effect.damage,
          s.effect.hits ?? 1,
          1.0, // 暂不乘被动加成
        ),
      });
    }
    if (s.id === 'sacred-judgement' && s.effect.damage) {
      return makeSkill({ ...base, damage: arthurDamage(s.effect.damage) });
    }
    if (s.id === 'auto-attack' && s.effect.damage) {
      return makeSkill({ ...base, damage: arthurDamage(s.effect.damage) });
    }
    return makeSkill(base);
  });
}

/** 按 hotkey 取技能(M2 调试技能的 1/2/3/4 模式) */
export function arthurSkillByHotkey(hotkey: string): Skill | null {
  const skill = data.skills.find((s) => s.hotkey === hotkey);
  if (!skill) return null;
  return loadArthurSkills().find((s) => s.id === skill.id) ?? null;
}

export const ARTHUR_DATA = data;
