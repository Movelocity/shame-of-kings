import dajiJson from './daji.json' with { type: 'json' };
import { makeSkill, simpleDamage } from '../skills/runtime';
import type { Skill } from '../skills/types';
import { wrapSkillWithEffectSpawn } from './effect-loader';
import {
  assertFourSkillKit,
  type HeroKitData,
  type HeroSkillSlotData,
} from './hero-kit';

export interface DajiData extends HeroKitData {
  stats: { hpMax: number; attackDamage: number; moveSpeed: number };
}

assertFourSkillKit(dajiJson);
const data: DajiData = dajiJson as DajiData;

export function loadDajiSkills(): readonly Skill[] {
  return data.skills.map((s) => {
    const effect = s.effect;
    const base = makeSkill({
      id: s.id,
      displayName: s.name,
      hit: s.hit,
      displacement: s.displacement,
      castTime: s.castTime,
      activeTime: s.activeTime,
      recoveryTime: s.recoveryTime,
      cooldown: s.cooldown,
      castMode: s.castMode ?? 'instant',
      hitOrigin: 'cast',
    });

    if (effect.kind === 'attack-damage') {
      return makeSkill({
        ...base,
        damage: simpleDamage(data.stats.attackDamage),
      });
    }

    if (effect.kind === 'periodic-zone' && effect.ticks === 0) {
      return makeSkill({
        ...base,
        damage: simpleDamage(effect.damage),
      });
    }

    if (effect.kind === 'spawn-projectile') {
      return wrapSkillWithEffectSpawn(base, effect, 'blue');
    }

    return base;
  });
}

export function dajiSkillByHotkey(hotkey: string): Skill | null {
  const skill = data.skills.find((s) => s.hotkey === hotkey);
  if (!skill) return null;
  return loadDajiSkills().find((s) => s.id === skill.id) ?? null;
}

export const DAJI_DATA = data;
export const DAJI_AUTO_ATTACK_ID = 'auto-attack';

export function getDajiAutoAttackRanges(): {
  attackRange: number;
  acquireRange: number;
} {
  const aa = data.skills.find((s) => s.id === DAJI_AUTO_ATTACK_ID);
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

export type { HeroKitData, HeroSkillSlotData };
