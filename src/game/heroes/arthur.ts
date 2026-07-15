// M3 T3.1:亚瑟 4 技能装载
// 数据驱动:从 arthur.json 读 → 转成 4 个 Skill 实例 + 1 个被动逻辑
// M5 元歌 / M6 镜复用 hero-kit 四槽位契约
import arthurJson from './arthur.json' with { type: 'json' };
import { applyMoveSpeedBuff } from '../buffs/buff-bag';
import { applyKnockup } from '../combat/unit-cc';
import { resolveHits } from '../skills/hits';
import { makeSkill } from '../skills/runtime';
import type { DamageFormula, Skill } from '../skills/types';
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

const data: ArthurData = arthurJson as ArthurData;
assertFourSkillKit(data);

/** 亚瑟范围技能 canonical 半径(二技能 JSON) */
export function getArthurAoeRadius(): number {
  const whirl = data.skills.find((s) => s.id === 'whirlwind-strike');
  if (whirl?.effect.aoeRadius !== undefined) return whirl.effect.aoeRadius;
  if (whirl?.hit.kind === 'circle') return (whirl.hit as { radius: number }).radius;
  return 3;
}

export const ARTHUR_AOE_RADIUS = getArthurAoeRadius();

function arthurDamage(amount: number): DamageFormula {
  return (_ctx, hit) => {
    if (!hit.target) return null;
    return { targetId: hit.target.id, damage: amount, isCrit: false };
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

function effectOf(id: string): HeroSkillEffectData {
  return skillSlot(id).effect;
}

/** 装载亚瑟 4 技能:从 JSON 数据 → 运行时 Skill 实例 */
export function loadArthurSkills(): readonly Skill[] {
  const shieldFx = effectOf('shield-of-pact');
  const whirlFx = effectOf('whirlwind-strike');
  const whirlSlot = skillSlot('whirlwind-strike');
  const judgementFx = effectOf('sacred-judgement');
  const aaFx = effectOf('auto-attack');

  const aoeRadius = whirlFx.aoeRadius ?? ARTHUR_AOE_RADIUS;
  const whirlHit =
    whirlSlot.hit.kind === 'circle'
      ? { kind: 'circle' as const, radius: aoeRadius }
      : whirlSlot.hit;

  return data.skills.map((s) => {
    const base = {
      id: s.id,
      displayName: s.name,
      hit: s.id === 'whirlwind-strike' ? whirlHit : s.hit,
      displacement: s.displacement,
      castTime: s.castTime,
      activeTime: s.activeTime,
      recoveryTime: s.recoveryTime,
      cooldown: s.cooldown,
      dashDistance: s.effect.dashDistance ?? 0,
      castMode: s.castMode ?? 'instant',
    };

    if (s.id === 'shield-of-pact') {
      const moveSpeedBoost = shieldFx.moveSpeedBoost ?? 0;
      const duration = shieldFx.duration ?? 0;
      return makeSkill({
        ...base,
        onActivate(ctx) {
          if (!ctx.buffs) return;
          applyMoveSpeedBuff(ctx.buffs, {
            sourceId: s.id,
            moveSpeedBoost,
            duration,
          });
        },
      });
    }

    if (s.id === 'whirlwind-strike' && whirlFx.damage) {
      const interval = whirlFx.damageInterval ?? 0.2;
      const ticks = whirlFx.damageTicks ?? 4;
      return makeSkill({
        ...base,
        damageInterval: interval,
        damageTicks: ticks,
        damage: perTickDamage(whirlFx.damage),
      });
    }

    if (s.id === 'sacred-judgement' && judgementFx.damage) {
      const knockupDuration = judgementFx.knockupDuration ?? 0.6;
      const landRadius = judgementFx.aoeRadius ?? aoeRadius;
      return makeSkill({
        ...base,
        damage: arthurDamage(judgementFx.damage),
        onLand(ctx) {
          const circleHit = { kind: 'circle' as const, radius: landRadius };
          const hits = resolveHits(
            ctx.world,
            ctx.caster,
            circleHit,
            ctx.caster.facingRad,
          );
          for (const h of hits) {
            if (!h.target || h.target.id === ctx.caster.id) continue;
            applyKnockup(h.target, knockupDuration);
          }
          return [];
        },
      });
    }

    if (s.id === 'auto-attack' && aaFx.damage) {
      return makeSkill({
        ...base,
        damage: arthurDamage(aaFx.damage),
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
  return {
    attackRange: aa?.effect.attackRange ?? 2,
    acquireRange: aa?.effect.acquireRange ?? 8,
  };
}

/** 一技能突脸锁敌范围 */
export function getArthurShieldAcquireRange(): number {
  const shield = data.skills.find((s) => s.id === ARTHUR_SHIELD_ID);
  return shield?.effect.acquireRange ?? 8;
}

export type { HeroKitData, HeroSkillSlotData, HeroSkillEffectData };
