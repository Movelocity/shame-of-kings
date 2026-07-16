import { filterTargets } from '../../combat/target-filter';
import { facingToward } from '../../combat/auto-attack-intent';
import type { TargetFilter, Team } from '../../skills/types';
import type { Vec2 } from '../../skills/vec2';
import { sweptHitsTarget } from './collision';
import {
  nextEffectId,
  resolveDamageAmount,
  type EffectDamageEvent,
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

function canHitTarget(
  targetId: string,
  hitTargetIds: Set<string>,
  hitCounts: Map<string, number>,
  policy: HitPolicy,
): boolean {
  const maxHits = policy.maxHits ?? 1;
  const maxPerTarget = policy.maxHitsPerTarget ?? 1;
  if (hitTargetIds.size >= maxHits) return false;
  const count = hitCounts.get(targetId) ?? 0;
  return count < maxPerTarget;
}

function recordHit(
  targetId: string,
  hitTargetIds: Set<string>,
  hitCounts: Map<string, number>,
): void {
  hitTargetIds.add(targetId);
  hitCounts.set(targetId, (hitCounts.get(targetId) ?? 0) + 1);
}

export function createProjectileEffect(
  ownerId: string,
  sourceTeam: Team,
  skillId: string,
  config: ProjectileConfig,
): ProjectileEffect {
  const id = nextEffectId('projectile');
  let position: Vec2 = { x: config.origin.x, z: config.origin.z };
  let previousPosition: Vec2 = { x: config.origin.x, z: config.origin.z };
  let distanceTravelled = 0;
  let forwardRad = config.forwardRad;
  let lockedTargetId = config.targetId;
  let homingActive = config.homing === true && !!lockedTargetId;
  const hitTargetIds = new Set<string>();
  const hitCounts = new Map<string, number>();
  const policy: HitPolicy = config.hitPolicy ?? { maxHits: 1 };
  const pierceRemaining = policy.pierce ?? 0;
  let pierceUsed = 0;

  const filter: TargetFilter = {
    casterId: ownerId,
    casterTeam: sourceTeam,
    includeNeutral: true,
  };

  const entity: ProjectileEffect = {
    id,
    ownerId,
    sourceTeam,
    skillId,
    kind: 'projectile',
    expired: false,
    collisionRadius: config.collisionRadius,
    spawnZoneOnExpire: config.spawnZoneOnExpire,
    getPosition() {
      return { x: position.x, z: position.z };
    },
    tick(dt, ctx) {
      if (entity.expired) return [];

      const events: EffectDamageEvent[] = [];
      previousPosition = { x: position.x, z: position.z };

      if (homingActive && lockedTargetId) {
        const target = ctx.world.getUnit(lockedTargetId);
        if (!target || target.hp <= 0) {
          const lostPolicy = config.onTargetLost ?? 'continue-forward';
          if (lostPolicy === 'expire') {
            entity.expired = true;
            return events;
          }
          if (lostPolicy === 'continue-forward') {
            homingActive = false;
          }
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
        ctx.world.unitsNear(position, config.collisionRadius + 2),
        filter,
      );

      for (const target of candidates) {
        if (!sweptHitsTarget(previousPosition, position, config.collisionRadius, target)) {
          continue;
        }
        if (!canHitTarget(target.id, hitTargetIds, hitCounts, policy)) continue;

        recordHit(target.id, hitTargetIds, hitCounts);
        events.push({
          targetId: target.id,
          damage: resolveDamageAmount(config.damage),
          isCrit: config.damage.isCrit ?? false,
        });

        const maxHits = policy.maxHits ?? 1;
        if (hitTargetIds.size >= maxHits) {
          if (pierceUsed < pierceRemaining) {
            pierceUsed += 1;
            hitTargetIds.clear();
            hitCounts.clear();
            hitTargetIds.add(target.id);
            hitCounts.set(target.id, 1);
            continue;
          }
          entity.expired = true;
          break;
        }
      }

      if (!entity.expired && distanceTravelled >= config.maxRange) {
        entity.expired = true;
      }

      return events;
    },
  };

  return entity;
}
