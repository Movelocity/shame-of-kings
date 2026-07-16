import { facingToward } from '../../combat/auto-attack-intent';
import { filterTargets } from '../../combat/target-filter';
import { settleHit } from '../../combat/settlement';
import type { CombatEvent, TargetFilter, Team } from '../../skills/types';
import type { Vec2 } from '../../skills/vec2';
import { sweptHitsTarget } from './collision';
import {
  nextEffectId,
  effectOwner,
  settlementFromDamage,
  type HitPolicy,
  type PersistentAreaConfig,
  type ProjectileConfig,
  type SkillEffectEntity,
} from './types';

export interface ProjectileEffect extends SkillEffectEntity {
  readonly kind: 'projectile';
  readonly collisionRadius: number;
  readonly spawnZoneOnExpire?: PersistentAreaConfig;
  getPosition(): Vec2;
}

export function createProjectileEffect(
  ownerId: string,
  sourceTeam: Team,
  skillId: string,
  config: ProjectileConfig,
  castId = `effect-${skillId}`,
): ProjectileEffect {
  const id = nextEffectId('projectile');
  let position = { ...config.origin };
  let previousPosition = { ...config.origin };
  let distanceTravelled = 0;
  let forwardRad = config.forwardRad;
  let lockedTargetId = config.targetId;
  let homingActive = config.homing === true && !!lockedTargetId;
  const hitTargetIds = new Set<string>();
  const hitCounts = new Map<string, number>();
  const policy: HitPolicy = config.hitPolicy ?? { maxHits: 1 };
  let pierceUsed = 0;
  const filter: TargetFilter = {
    casterId: ownerId,
    casterTeam: sourceTeam,
    includeNeutral: true,
    targetableOnly: true,
  };

  const entity: ProjectileEffect = {
    id,
    castId,
    ownerId,
    sourceTeam,
    skillId,
    kind: 'projectile',
    expired: false,
    collisionRadius: config.collision.radius,
    spawnZoneOnExpire: config.spawnZoneOnExpire,
    getPosition: () => ({ ...position }),
    tick(dt, ctx) {
      if (entity.expired) return [];
      const owner = effectOwner(ctx.world, ownerId, sourceTeam, config.origin);
      const events: CombatEvent[] = [];
      previousPosition = { ...position };
      if (homingActive && lockedTargetId) {
        const target = ctx.world.getUnit(lockedTargetId);
        if (!target || target.hp <= 0) {
          const lostPolicy = config.onTargetLost ?? 'continue-forward';
          if (lostPolicy === 'expire') {
            entity.expired = true;
            return events;
          }
          homingActive = false;
        } else {
          forwardRad = facingToward(position, target.position);
        }
      }
      const step = config.speed * dt;
      position = {
        x: position.x + Math.sin(forwardRad) * step,
        z: position.z - Math.cos(forwardRad) * step,
      };
      distanceTravelled += step;
      const candidates = filterTargets(
        ctx.world.unitsNear(position, config.collision.radius + 2),
        filter,
      );
      for (const target of candidates) {
        if (!sweptHitsTarget(previousPosition, position, config.collision.radius, target)) continue;
        const maxPerTarget = policy.maxHitsPerTarget ?? 1;
        if ((hitCounts.get(target.id) ?? 0) >= maxPerTarget) continue;
        const event = settleHit(
          { caster: owner, world: ctx.world, now: ctx.now, castSnapshot: {
            castId, casterId: ownerId, skillId, origin: config.origin, forwardRad: config.forwardRad,
          } },
          { target, origin: position, forwardRad },
          settlementFromDamage(config.damage),
        );
        if (event) events.push(event);
        hitTargetIds.add(target.id);
        hitCounts.set(target.id, (hitCounts.get(target.id) ?? 0) + 1);
        if (hitTargetIds.size >= (policy.maxHits ?? 1)) {
          if (pierceUsed < (policy.pierce ?? 0)) {
            pierceUsed += 1;
            hitTargetIds.clear();
          } else {
            entity.expired = true;
            break;
          }
        }
      }
      if (!entity.expired && distanceTravelled >= config.maxRange) entity.expired = true;
      return events;
    },
  };
  return entity;
}
