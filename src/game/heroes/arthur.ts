// M3 T3.1:亚瑟 4 技能装载
// 数据驱动:从 arthur.json 读 → 转成 4 个 Skill 实例 + 1 个被动逻辑
// M5 元歌 / M6 镜复用 hero-kit 四槽位契约
import arthurJson from './arthur.json' with { type: 'json' };
import { applyMoveSpeedBuff, applyNextAttackDash } from '../buffs/buff-bag';
import { applyKnockup } from '../combat/unit-cc';
import { defaultTargetFilter } from '../combat/target-filter';
import { resolveHits } from '../skills/hits';
import { makeSkill } from '../skills/runtime';
import type { DamageFormula, DamageResult, Skill } from '../skills/types';
import {
  assertFourSkillKit,
  type HeroKitData,
  type HeroSkillEffectData,
  type HeroSkillSlotData,
} from './hero-kit';

export interface ArthurData extends HeroKitData {
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
}

assertFourSkillKit(arthurJson);
const data: ArthurData = arthurJson as ArthurData;

/** 亚瑟范围技能 canonical 半径(二技能 hit shape) */
export function getArthurAoeRadius(): number {
  const whirl = data.skills.find((s) => s.id === 'whirlwind-strike');
  if (whirl?.hit.kind === 'circle') return (whirl.hit as { radius: number }).radius;
  throw new Error('arthur whirlwind-strike must use a circle hit shape');
}

export const ARTHUR_AOE_RADIUS = getArthurAoeRadius();

function arthurDamage(amount: number, scalesWithAttackPower = false): DamageFormula {
  return (ctx, hit) => {
    if (!hit.target) return null;
    const multiplier = scalesWithAttackPower
      ? ctx.buffs?.attackPowerMultiplier() ?? 1
      : 1;
    return {
      targetId: hit.target.id,
      damage: amount * multiplier,
      isCrit: false,
    };
  };
}

function perTickDamage(totalPerTick: number): DamageFormula {
  return (_ctx, hit) => {
    if (!hit.target) return null;
    return { targetId: hit.target.id, damage: totalPerTick, isCrit: false };
  };
}

function skillSlot(id: string): HeroSkillSlotData {
  const s = data.skills.find((sk) => sk.id === id);
  if (!s) throw new Error(`arthur skill missing: ${id}`);
  return s;
}

/** 装载亚瑟 4 技能:从 JSON 数据 → 运行时 Skill 实例 */
export function loadArthurSkills(): readonly Skill[] {
  const whirlSlot = skillSlot('whirlwind-strike');
  const aoeRadius = ARTHUR_AOE_RADIUS;
  const whirlHit =
    whirlSlot.hit.kind === 'circle'
      ? { kind: 'circle' as const, radius: aoeRadius }
      : whirlSlot.hit;

  return data.skills.map((s) => {
    const effect = s.effect;
    const base = {
      id: s.id,
      displayName: s.name,
      hit: s.id === 'whirlwind-strike' ? whirlHit : s.hit,
      displacement: s.displacement,
      castTime: s.castTime,
      activeTime: s.activeTime,
      recoveryTime: s.recoveryTime,
      cooldown: s.cooldown,
      dashDistance: 'dashDistance' in effect ? effect.dashDistance : 0,
      dashSpeed: 'dashSpeed' in effect ? effect.dashSpeed : 0,
      castMode: s.castMode ?? 'instant',
    };

    if (effect.kind === 'move-speed-buff') {
      return makeSkill({
        ...base,
        onActivate(ctx) {
          if (!ctx.buffs) return;
          applyMoveSpeedBuff(ctx.buffs, {
            sourceId: s.id,
            moveSpeedBoost: effect.moveSpeedBoost,
            duration: effect.duration,
          });
          applyNextAttackDash(ctx.buffs, {
            sourceId: s.id,
            targetSkillId: ARTHUR_AUTO_ATTACK_ID,
            dashDistance: effect.enhancedAttackDashDistance,
            dashSpeed: effect.enhancedAttackDashSpeed,
            acquireRange: effect.enhancedAttackAcquireRange,
            duration: effect.duration,
          });
        },
      });
    }

    if (effect.kind === 'periodic-damage') {
      return makeSkill({
        ...base,
        damageInterval: effect.damageInterval,
        damageTicks: effect.damageTicks,
        damage: perTickDamage(effect.damage),
      });
    }

    if (effect.kind === 'dash-landing-knockup') {
      return makeSkill({
        ...base,
        onLand(ctx) {
          const circleHit = { kind: 'circle' as const, radius: aoeRadius };
          const hits = resolveHits(
            ctx.world,
            ctx.caster,
            circleHit,
            ctx.caster.facingRad,
            { filter: defaultTargetFilter(ctx.caster) },
          );
          const results: DamageResult[] = [];
          for (const h of hits) {
            if (!h.target || h.target.id === ctx.caster.id) continue;
            applyKnockup(h.target, effect.knockupDuration);
            const result = arthurDamage(effect.damage)(ctx, h);
            if (result) results.push(result);
          }
          return results;
        },
      });
    }

    if (effect.kind === 'attack-damage') {
      return makeSkill({
        ...base,
        damage: arthurDamage(data.stats.attackDamage, true),
      });
    }

    return makeSkill(base);
  });
}

/** 按 hotkey 取技能 */
export function arthurSkillByHotkey(hotkey: string): Skill | null {
  const skill = data.skills.find((s) => s.hotkey === hotkey);
  if (!skill) return null;
  return loadArthurSkills().find((s) => s.id === skill.id) ?? null;
}

export const ARTHUR_DATA = data;
export const ARTHUR_AUTO_ATTACK_ID = 'auto-attack';
export const ARTHUR_SHIELD_ID = 'shield-of-pact';

/** 普攻攻击距 / 获取距 */
export function getArthurAutoAttackRanges(): {
  attackRange: number;
  acquireRange: number;
} {
  const aa = data.skills.find((s) => s.id === ARTHUR_AUTO_ATTACK_ID);
  const attackRange =
    aa?.effect.kind === 'attack-damage' ? aa.effect.attackRange : 2;
  return {
    attackRange,
    acquireRange:
      attackRange *
      (aa?.effect.kind === 'attack-damage'
        ? aa.effect.autoAcquireRangeMultiplier
        : 1.3),
  };
}

/** 一技能强化普攻的最大 dash 距离 */
export function getArthurShieldDashDistance(): number {
  const shield = data.skills.find((s) => s.id === ARTHUR_SHIELD_ID);
  return shield?.effect.kind === 'move-speed-buff'
    ? shield.effect.enhancedAttackDashDistance
    : 0;
}

/** 三技能选敌范围与伤害圆半径分开 */
export function getArthurJudgementAcquireRange(): number {
  const judgement = data.skills.find((s) => s.id === 'sacred-judgement');
  return judgement?.effect.kind === 'dash-landing-knockup'
    ? judgement.effect.acquireRange
    : 8;
}

export type { HeroKitData, HeroSkillSlotData, HeroSkillEffectData };
