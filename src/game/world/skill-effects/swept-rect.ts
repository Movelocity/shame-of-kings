// 脱手矩形剑气:整块 rect 沿 forwardRad 前移,路径上敌人各命中一次。
import { hitRect } from '../../skills/hits';
import type { HitShape, TargetFilter, Team, Unit } from '../../skills/types';
import type { Vec2 } from '../../skills/vec2';
import {
  nextEffectId,
  resolveDamageAmount,
  type EffectDamageEvent,
  type EffectTickContext,
  type SkillEffectEntity,
} from './types';
import type { DamageSnapshot } from '../../skills/types';

export interface SweptRectConfig {
  readonly speed: number;
  readonly maxRange: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
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
): SweptRectEffect {
  const id = nextEffectId('swept-rect');
  let origin: Vec2 = { x: config.origin.x, z: config.origin.z };
  const forwardRad = config.forwardRad;
  let distanceTravelled = 0;
  const hitTargetIds = new Set<string>();

  const filter: TargetFilter = {
    casterId: ownerId,
    casterTeam: sourceTeam,
    includeNeutral: true,
  };

  const rectShape: Extract<HitShape, { kind: 'rect' }> = {
    kind: 'rect',
    halfWidth: config.halfWidth,
    halfDepth: config.halfDepth,
  };

  const entity: SweptRectEffect = {
    id,
    ownerId,
    sourceTeam,
    skillId,
    kind: 'swept-rect',
    expired: false,
    halfWidth: config.halfWidth,
    halfDepth: config.halfDepth,
    getOrigin() {
      return { x: origin.x, z: origin.z };
    },
    getForwardRad() {
      return forwardRad;
    },
    tick(dt: number, ctx: EffectTickContext): readonly EffectDamageEvent[] {
      if (entity.expired) return [];

      const caster = ctx.world.getUnit(ownerId) as Unit | null;
      if (!caster) {
        entity.expired = true;
        return [];
      }

      const events: EffectDamageEvent[] = [];
      const hits = hitRect(ctx.world, caster, rectShape, forwardRad, origin, filter);
      for (const hit of hits) {
        if (!hit.target || hitTargetIds.has(hit.target.id)) continue;
        hitTargetIds.add(hit.target.id);
        events.push({
          targetId: hit.target.id,
          damage: resolveDamageAmount(config.damage),
          isCrit: config.damage.isCrit ?? false,
        });
      }

      const step = config.speed * dt;
      origin = {
        x: origin.x + Math.sin(forwardRad) * step,
        z: origin.z - Math.cos(forwardRad) * step,
      };
      distanceTravelled += step;

      if (distanceTravelled >= config.maxRange) {
        entity.expired = true;
      }

      return events;
    },
  };

  return entity;
}
