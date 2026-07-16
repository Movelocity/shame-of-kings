import type { CastSnapshot, Skill, SkillContext } from '../skills/types';
import { spawnProjectileThenZone, spawnProjectilesFromCast } from '../world/skill-effects/spawn';
import type { WorldStateHandle } from '../world/WorldState';
import type { HeroSkillEffectData } from './hero-kit';

function getSnapshot(ctx: SkillContext): CastSnapshot {
  if (ctx.castSnapshot) return ctx.castSnapshot;
  return {
    castId: `cast-fallback`,
    casterId: ctx.caster.id,
    skillId: 'unknown',
    origin: { x: ctx.caster.position.x, z: ctx.caster.position.z },
    forwardRad: ctx.caster.facingRad,
  };
}

/** 在 active 开始时 spawn effect 的技能包装 */
export function wrapSkillWithEffectSpawn(
  skill: Skill,
  effect: HeroSkillEffectData,
  sourceTeam: import('../skills/types').Team,
): Skill {
  return {
    ...skill,
    onActivate(ctx) {
      skill.onActivate?.(ctx);
      const snap = getSnapshot(ctx);
      const world = ctx.world as WorldStateHandle;

      if (effect.kind === 'spawn-projectile') {
        const count = effect.projectileCount ?? 1;
        const configs = Array.from({ length: count }, () => ({
          skillId: skill.id,
          speed: effect.speed,
          maxRange: effect.maxRange,
          collisionRadius: effect.collisionRadius,
          homing: effect.homing,
          onTargetLost: effect.onTargetLost,
          hitPolicy: effect.pierce ? { maxHits: 1, pierce: effect.pierce } : { maxHits: 1 },
          damage: { amount: effect.damage },
        }));
        for (const entity of spawnProjectilesFromCast(snap, sourceTeam, configs)) {
          world.spawnEffect(entity);
        }
        return;
      }

      if (effect.kind === 'projectile-then-zone') {
        const entity = spawnProjectileThenZone({
          ownerId: snap.casterId,
          sourceTeam,
          skillId: skill.id,
          origin: snap.origin,
          forwardRad: snap.forwardRad,
          projectile: {
            speed: effect.projectileSpeed,
            maxRange: effect.projectileMaxRange,
            collisionRadius: effect.projectileCollisionRadius,
            damage: { amount: effect.projectileDamage },
            hitPolicy: { maxHits: 1 },
          },
          zone: {
            radius: effect.zoneRadius,
            tickInterval: effect.zoneTickInterval,
            ticks: effect.zoneTicks,
            damage: { amount: effect.zoneDamage },
          },
        });
        world.spawnEffect(entity);
      }
    },
  };
}
