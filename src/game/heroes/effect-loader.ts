import type { CastSnapshot, Skill, SkillContext } from '../skills/types';
import {
  spawnProjectile,
  spawnProjectileThenZone,
  spawnProjectilesFromCast,
  spawnSweptRectFromCast,
} from '../world/skill-effects/spawn';
import { createConvergentBurst } from '../world/skill-effects/convergent-burst';
import { createSequentialProjectileBurst } from '../world/skill-effects/sequential-projectile-burst';
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
        const interval = effect.projectileSpawnInterval ?? 0;
        if (interval > 0 && count > 1) {
          world.spawnEffect(
            createSequentialProjectileBurst({
              snapshot: snap,
              sourceTeam,
              spawnInterval: interval,
              projectileConfigs: configs,
            }),
          );
        } else {
          for (const entity of spawnProjectilesFromCast(snap, sourceTeam, configs)) {
            world.spawnEffect(entity);
          }
        }
        return;
      }

      if (effect.kind === 'spawn-swept-rect') {
        world.spawnEffect(
          spawnSweptRectFromCast(snap, sourceTeam, skill.id, {
            speed: effect.speed,
            maxRange: effect.maxRange,
            halfWidth: effect.halfWidth,
            halfDepth: effect.halfDepth,
            damage: { amount: effect.damage },
          }),
        );
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
        return;
      }

      if (effect.kind === 'convergent-burst') {
        world.spawnEffect(
          createConvergentBurst({
            snapshot: snap,
            sourceTeam,
            projectileCount: effect.projectileCount,
            projectileSpeed: effect.projectileSpeed,
            travelDistance: effect.travelDistance,
            fanHalfAngle: effect.fanHalfAngle,
            spawnInterval: effect.spawnInterval,
            collisionRadius: effect.collisionRadius,
            damage: effect.damage,
          }),
        );
      }
    },
  };
}

/** 远程普攻：onActivate 生成索敌弹道，伤害在命中帧结算 */
export function wrapProjectileAutoAttack(
  skill: Skill,
  effect: Extract<HeroSkillEffectData, { kind: 'attack-damage' }>,
  damage: number,
  sourceTeam: import('../skills/types').Team,
): Skill {
  const rangeMult = effect.projectileRangeMultiplier ?? 2;
  const maxRange = effect.attackRange * rangeMult;
  return {
    ...skill,
    damage: undefined,
    onActivate(ctx) {
      skill.onActivate?.(ctx);
      const snap = getSnapshot(ctx);
      const world = ctx.world as WorldStateHandle;
      world.spawnEffect(
        spawnProjectile({
          ownerId: snap.casterId,
          sourceTeam,
          skillId: skill.id,
          origin: snap.origin,
          forwardRad: snap.forwardRad,
          speed: effect.projectileSpeed!,
          maxRange,
          collisionRadius: effect.projectileCollisionRadius,
          homing: effect.homing ?? true,
          onTargetLost: effect.onTargetLost ?? 'continue-forward',
          targetId: snap.targetId,
          damage: { amount: damage, scalesWithAttackPower: true },
          hitPolicy: { maxHits: 1 },
        }),
      );
    },
  };
}
