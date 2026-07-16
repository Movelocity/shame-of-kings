import { defaultTargetFilter } from '../../combat/target-filter';
import { settleHit } from '../../combat/settlement';
import { hitRect } from '../../skills/hits';
import type { CollisionShape, CombatEvent, DamageSnapshot, Team } from '../../skills/types';
import type { Vec2 } from '../../skills/vec2';
import { effectOwner, nextEffectId, settlementFromDamage, type SkillEffectEntity } from './types';

export interface SweptRectConfig {
  readonly speed: number;
  readonly maxRange: number;
  readonly collision: Extract<CollisionShape, { kind: 'rect' }>;
  readonly damage: DamageSnapshot;
  readonly origin: Vec2;
  readonly forwardRad: number;
}

export interface SweptRectEffect extends SkillEffectEntity {
  readonly kind: 'swept-rect';
  readonly halfWidth: number;
  readonly halfDepth: number;
  getOrigin(): Vec2;
  getForwardRad(): number;
}

export function createSweptRectEffect(
  ownerId: string,
  sourceTeam: Team,
  skillId: string,
  config: SweptRectConfig,
  castId = `effect-${skillId}`,
): SweptRectEffect {
  let origin = { ...config.origin };
  let distanceTravelled = 0;
  const hitTargetIds = new Set<string>();
  const entity: SweptRectEffect = {
    id: nextEffectId('swept-rect'),
    castId,
    ownerId,
    sourceTeam,
    skillId,
    kind: 'swept-rect',
    expired: false,
    halfWidth: config.collision.halfWidth,
    halfDepth: config.collision.halfDepth,
    getOrigin: () => ({ ...origin }),
    getForwardRad: () => config.forwardRad,
    tick(dt, ctx) {
      if (entity.expired) return [];
      const owner = effectOwner(ctx.world, ownerId, sourceTeam, config.origin);
      const events: CombatEvent[] = [];
      const hits = hitRect(
        ctx.world,
        owner,
        config.collision,
        config.forwardRad,
        origin,
        defaultTargetFilter(owner),
      );
      for (const hit of hits) {
        if (!hit.target || hitTargetIds.has(hit.target.id)) continue;
        hitTargetIds.add(hit.target.id);
        const event = settleHit(
          { caster: owner, world: ctx.world, now: ctx.now, castSnapshot: {
            castId, casterId: ownerId, skillId, origin: config.origin, forwardRad: config.forwardRad,
          } },
          hit,
          settlementFromDamage(config.damage),
        );
        if (event) events.push(event);
      }
      const step = config.speed * dt;
      origin = {
        x: origin.x + Math.sin(config.forwardRad) * step,
        z: origin.z - Math.cos(config.forwardRad) * step,
      };
      distanceTravelled += step;
      if (distanceTravelled >= config.maxRange) entity.expired = true;
      return events;
    },
  };
  return entity;
}
