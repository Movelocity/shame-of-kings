import angelaJson from './angela.json' with { type: 'json' };
import { makeSkill, simpleDamage } from '../skills/runtime';
import type { Skill } from '../skills/types';
import { spawnPeriodicZone } from '../world/skill-effects/spawn';
import type { WorldStateHandle } from '../world/WorldState';
import { wrapProjectileAutoAttack, wrapSkillWithEffectSpawn } from './effect-loader';
import {
  assertFourSkillKit,
  isProjectileAutoAttack,
  resolveAutoAttackRanges,
  type HeroKitData,
  type HeroSkillSlotData,
} from './hero-kit';

export interface AngelaData extends HeroKitData {
  stats: { hpMax: number; attackDamage: number; moveSpeed: number };
}

assertFourSkillKit(angelaJson);
const data: AngelaData = angelaJson as AngelaData;

export function loadAngelaSkills(): readonly Skill[] {
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
      if (isProjectileAutoAttack(effect)) {
        return wrapProjectileAutoAttack(base, effect, data.stats.attackDamage, 'blue');
      }
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

    if (effect.kind === 'periodic-zone' && effect.ticks > 0) {
      return {
        ...base,
        onActivate(ctx) {
          const world = ctx.world as WorldStateHandle;
          world.spawnEffect(
            spawnPeriodicZone(
              ctx.caster.id,
              ctx.caster.team,
              s.id,
              { x: ctx.caster.position.x, z: ctx.caster.position.z },
              {
                radius: effect.radius,
                tickInterval: effect.tickInterval,
                ticks: effect.ticks,
                damage: { amount: effect.damage },
              },
            ),
          );
        },
      };
    }

    if (effect.kind === 'projectile-then-zone') {
      return wrapSkillWithEffectSpawn(base, effect, 'blue');
    }

    return base;
  });
}

export function angelaSkillByHotkey(hotkey: string): Skill | null {
  const skill = data.skills.find((s) => s.hotkey === hotkey);
  if (!skill) return null;
  return loadAngelaSkills().find((s) => s.id === skill.id) ?? null;
}

export const ANGELA_DATA = data;
export const ANGELA_AUTO_ATTACK_ID = 'auto-attack';

export function getAngelaAutoAttackRanges(): {
  attackRange: number;
  acquireRange: number;
} {
  const aa = data.skills.find((s) => s.id === ANGELA_AUTO_ATTACK_ID);
  if (aa?.effect.kind === 'attack-damage') {
    const ranges = resolveAutoAttackRanges(aa.effect);
    if (ranges) return ranges;
  }
  return { attackRange: 2, acquireRange: 2.6 };
}

export type { HeroKitData, HeroSkillSlotData };
