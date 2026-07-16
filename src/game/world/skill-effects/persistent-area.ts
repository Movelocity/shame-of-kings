import { resolveHits } from '../../skills/hits';
import type { TargetFilter, Team, Unit } from '../../skills/types';
import {
  nextEffectId,
  resolveDamageAmount,
  type EffectDamageEvent,
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
): PersistentAreaEffect {
  const id = nextEffectId('zone');
  let elapsed = 0;
  let ticksDone = 0;

  const filter: TargetFilter = {
    casterId: ownerId,
    casterTeam: sourceTeam,
    includeNeutral: true,
  };

  const entity: PersistentAreaEffect = {
    id,
    ownerId,
    sourceTeam,
    skillId,
    kind: 'persistent-area',
    position: { x: position.x, z: position.z },
    config,
    expired: false,
    tick(dt, ctx) {
      if (entity.expired) return [];

      elapsed += dt;
      const events: EffectDamageEvent[] = [];

      while (
        ticksDone < config.ticks &&
        elapsed >= (ticksDone + 1) * config.tickInterval
      ) {
        const caster = ctx.world.getUnit(ownerId);
        const dummyCaster: Unit = caster ?? {
          id: ownerId,
          team: sourceTeam,
          position,
          hp: 1,
          hpMax: 1,
          isStatic: false,
          collisionRadius: 0.5,
          facingRad: 0,
          hidden: { inBush: false, outOfVisionFrom: new Set() },
        };

        const hits = resolveHits(
          ctx.world,
          dummyCaster,
          { kind: 'circle', radius: config.radius },
          0,
          { origin: position, filter },
        );

        for (const hit of hits) {
          if (!hit.target) continue;
          events.push({
            targetId: hit.target.id,
            damage: resolveDamageAmount(config.damage),
            isCrit: config.damage.isCrit ?? false,
          });
        }
        ticksDone += 1;
      }

      if (ticksDone >= config.ticks) {
        entity.expired = true;
      }

      return events;
    },
  };

  return entity;
}
