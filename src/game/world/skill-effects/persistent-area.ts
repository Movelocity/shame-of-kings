import { defaultTargetFilter } from '../../combat/target-filter';
import { settleHit } from '../../combat/settlement';
import { resolveHits } from '../../skills/hits';
import type { CombatEvent, Team } from '../../skills/types';
import {
  nextEffectId,
  effectOwner,
  settlementFromDamage,
  type PersistentAreaConfig,
  type SkillEffectEntity,
} from './types';

export interface PersistentAreaEffect extends SkillEffectEntity {
  readonly kind: 'persistent-area';
  readonly position: { x: number; z: number };
  readonly config: PersistentAreaConfig;
}

export function createPersistentAreaEffect(
  ownerId: string,
  sourceTeam: Team,
  skillId: string,
  position: { x: number; z: number },
  config: PersistentAreaConfig,
  castId = `effect-${skillId}`,
): PersistentAreaEffect {
  let elapsed = 0;
  let ticksDone = 0;
  const entity: PersistentAreaEffect = {
    id: nextEffectId('zone'),
    castId,
    ownerId,
    sourceTeam,
    skillId,
    kind: 'persistent-area',
    position: { ...position },
    config,
    expired: false,
    tick(dt, ctx) {
      if (entity.expired) return [];
      const owner = effectOwner(ctx.world, ownerId, sourceTeam, position);
      elapsed += dt;
      const events: CombatEvent[] = [];
      while (ticksDone < config.ticks && elapsed + 1e-9 >= (ticksDone + 1) * config.tickInterval) {
        const hits = resolveHits(
          ctx.world,
          owner,
          { kind: 'circle', radius: config.radius },
          0,
          { origin: position, filter: defaultTargetFilter(owner) },
        );
        for (const hit of hits) {
          const event = settleHit(
            { caster: owner, world: ctx.world, now: ctx.now, castSnapshot: {
              castId, casterId: ownerId, skillId, origin: position, forwardRad: 0,
            } },
            hit,
            settlementFromDamage(config.damage),
          );
          if (event) events.push(event);
        }
        ticksDone += 1;
      }
      if (ticksDone >= config.ticks) entity.expired = true;
      return events;
    },
  };
  return entity;
}
