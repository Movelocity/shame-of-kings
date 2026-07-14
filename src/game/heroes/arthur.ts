// M3 T3.1:亚瑟 4 技能装载
// 数据驱动:从 arthur.json 读 → 转成 4 个 Skill 实例 + 1 个被动逻辑
// M5 元歌 / M6 镜复用此模式(每个英雄一个 .json + .ts)
// T35.2:一技能契约之盾 onActivate 挂 Buff;普攻 peek 下次普攻加成
import arthurJson from './arthur.json' with { type: 'json' };
import { applyShieldOfPactStyle } from '../buffs/buff-bag';
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
    castMode?: Skill['castMode'];
    effect: {
      damage?: number;
      hits?: number;
      dashDistance?: number;
      moveSpeedBoost?: number;
      duration?: number;
      nextAttackBonus?: number;
      stunDuration?: number;
      /** 普攻出手距离(世界单位);到位后才 start */
      attackRange?: number;
      /** 普攻获取/粘性锁定距离 */
      acquireRange?: number;
    };
  }>;
}

const data: ArthurData = arthurJson as ArthurData;

/** 简单伤害公式。applyNextAttackBonus=true 时用 buff 袋 peek(消费由 caller 在命中后做) */
function arthurDamage(
  amount: number,
  opts?: { applyNextAttackBonus?: boolean },
): DamageFormula {
  return (ctx: SkillContext, hit: Hit) => {
    if (!hit.target) return null;
    let damage = amount;
    if (opts?.applyNextAttackBonus && ctx.buffs) {
      damage = Math.round(damage * ctx.buffs.peekNextAttackBonus());
    }
    return { targetId: hit.target.id, damage, isCrit: false };
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
      castMode: s.castMode ?? 'instant',
    };
    if (s.id === 'shield-of-pact') {
      const moveSpeedBoost = s.effect.moveSpeedBoost ?? 0;
      const nextAttackBonus = s.effect.nextAttackBonus ?? 1;
      const duration = s.effect.duration ?? 0;
      return makeSkill({
        ...base,
        onActivate(ctx) {
          if (!ctx.buffs) return;
          applyShieldOfPactStyle(ctx.buffs, {
            sourceId: s.id,
            moveSpeedBoost,
            nextAttackBonus,
            duration,
          });
        },
      });
    }
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
      return makeSkill({
        ...base,
        damage: arthurDamage(s.effect.damage, { applyNextAttackBonus: true }),
      });
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
export const ARTHUR_AUTO_ATTACK_ID = 'auto-attack';
export const ARTHUR_SHIELD_ID = 'shield-of-pact';

/** 普攻攻击距 / 获取距(缺省与 JSON 建议值一致) */
export function getArthurAutoAttackRanges(): {
  attackRange: number;
  acquireRange: number;
} {
  const aa = data.skills.find((s) => s.id === ARTHUR_AUTO_ATTACK_ID);
  return {
    attackRange: aa?.effect.attackRange ?? 2,
    acquireRange: aa?.effect.acquireRange ?? 8,
  };
}
