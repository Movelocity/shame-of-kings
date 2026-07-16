import { defaultTargetFilter } from '../combat/target-filter';
import { settleHit } from '../combat/settlement';
import { resolveHits } from './hits';
import type {
  CastSnapshot,
  CombatEvent,
  HitOrigin,
  Skill,
  SkillContext,
  SkillDelivery,
  SkillInstance,
  Unit,
} from './types';
import { vec2Add, type Vec2 } from './vec2';

export function startSkill(skill: Skill, caster: Unit, snapshot: CastSnapshot): SkillInstance {
  const origin = snapshot.origin;
  const forward = snapshot.forwardRad;
  const dashDistanceTotal = snapshot.dashDistance ?? skill.dashDistance;
  let dashDistanceTravelled = 0;
  let intervalElapsed = 0;
  let instantResolved = false;
  const intervalTicks = new Map<SkillDelivery, number>();
  const filter = defaultTargetFilter(caster);
  const leaves = flattenDelivery(skill.delivery);
  const inst: SkillInstance = {
    skill,
    phase: 'cast',
    elapsed: 0,
    cooldownTimer: skill.cooldown,
    origin,
    forwardRad: forward,
    castSnapshot: snapshot,
    events: [],
    hitboxActivations: 0,
    dashDistanceTravelled: 0,
    dashDistanceTotal,
    cancel() {
      inst.phase = 'done';
      inst.elapsed = 0;
      inst.events = [];
    },
    tick(dt, ctx) {
      if (inst.cooldownTimer > 0) {
        const remaining = inst.cooldownTimer - dt;
        inst.cooldownTimer = remaining <= 1e-9 ? 0 : remaining;
      }
      inst.events = [];
      if (inst.phase === 'done') return inst.events;
      inst.elapsed += dt;
      const castCtx: SkillContext = { ...ctx, castSnapshot: snapshot };

      if (inst.phase === 'cast' && inst.elapsed >= skill.castTime) {
        inst.phase = 'active';
        inst.elapsed = 0;
        intervalElapsed = 0;
        instantResolved = false;
        if (skill.displacement === 'teleport' && dashDistanceTotal > 0) {
          applyDisplacement(caster, origin, forward, dashDistanceTotal);
          dashDistanceTravelled = dashDistanceTotal;
          inst.dashDistanceTravelled = dashDistanceTotal;
        }
        skill.onActivate?.(castCtx);
      }

      if (inst.phase === 'active') {
        if (skill.displacement === 'dash' && dashDistanceTravelled < dashDistanceTotal) {
          const step = Math.min(dashDistanceTotal - dashDistanceTravelled, skill.dashSpeed * dt);
          dashDistanceTravelled += step;
          inst.dashDistanceTravelled = dashDistanceTravelled;
          applyDisplacement(caster, origin, forward, dashDistanceTravelled);
        }
        const displacementComplete =
          skill.displacement !== 'dash' || dashDistanceTravelled >= dashDistanceTotal - 1e-9;
        const events: CombatEvent[] = [];

        if (displacementComplete && !instantResolved) {
          for (const delivery of leaves) {
            if (delivery.mode !== 'instant-hit') continue;
            inst.hitboxActivations += 1;
            events.push(...resolveDeliveryHits(delivery, castCtx, inst, caster, filter));
          }
          instantResolved = true;
        }

        intervalElapsed += dt;
        for (const delivery of leaves) {
          if (delivery.mode !== 'interval-hit') continue;
          let ticksDone = intervalTicks.get(delivery) ?? 0;
          while (
            ticksDone < delivery.ticks &&
            intervalElapsed + 1e-9 >= (ticksDone + 1) * delivery.interval
          ) {
            inst.hitboxActivations += 1;
            events.push(...resolveDeliveryHits(delivery, castCtx, inst, caster, filter));
            ticksDone += 1;
          }
          intervalTicks.set(delivery, ticksDone);
        }
        inst.events = events;

        if (inst.elapsed >= skill.activeTime && displacementComplete) {
          if (skill.onLand) {
            inst.hitboxActivations += 1;
            inst.events = [...inst.events, ...skill.onLand(castCtx)];
          }
          inst.phase = 'recovery';
          inst.elapsed = 0;
        }
      }
      if (inst.phase === 'recovery' && inst.elapsed >= skill.recoveryTime) {
        inst.phase = 'done';
        inst.elapsed = 0;
      }
      return inst.events;
    },
  };
  return inst;
}

function flattenDelivery(delivery: SkillDelivery): SkillDelivery[] {
  return delivery.mode === 'composite' ? delivery.parts.flatMap(flattenDelivery) : [delivery];
}

function resolveDeliveryHits(
  delivery: Extract<SkillDelivery, { mode: 'instant-hit' | 'interval-hit' }>,
  ctx: SkillContext,
  inst: SkillInstance,
  caster: Unit,
  filter: ReturnType<typeof defaultTargetFilter>,
): CombatEvent[] {
  const origin = resolveHitOrigin(delivery.hitOrigin, inst, caster);
  const hits = resolveHits(ctx.world, caster, delivery.geometry, inst.forwardRad, {
    origin,
    filter,
    lockedTargetId: inst.castSnapshot.targetId,
  });
  const events: CombatEvent[] = [];
  for (const hit of hits) {
    const event = settleHit(ctx, hit, delivery.settlement);
    if (event) events.push(event);
  }
  return events;
}

function resolveHitOrigin(hitOrigin: HitOrigin | undefined, inst: SkillInstance, caster: Unit): Vec2 {
  return hitOrigin === 'cast' ? inst.origin : caster.position;
}

function applyDisplacement(caster: Unit, origin: Vec2, forwardRad: number, distance: number): void {
  caster.position = vec2Add(origin, {
    x: Math.sin(forwardRad) * distance,
    z: -Math.cos(forwardRad) * distance,
  });
}

export function makeSkill(partial: {
  id: string;
  displayName: string;
  delivery: SkillDelivery;
  aim?: Skill['aim'];
  displacement?: Skill['displacement'];
  castTime: number;
  activeTime: number;
  recoveryTime: number;
  cooldown: number;
  dashDistance?: number;
  dashSpeed?: number;
  castMode?: Skill['castMode'];
  onActivate?: Skill['onActivate'];
  onLand?: Skill['onLand'];
}): Skill {
  return {
    id: partial.id,
    displayName: partial.displayName,
    delivery: partial.delivery,
    aim: partial.aim,
    displacement: partial.displacement ?? 'none',
    castTime: partial.castTime,
    activeTime: partial.activeTime,
    recoveryTime: partial.recoveryTime,
    cooldown: partial.cooldown,
    dashDistance: partial.dashDistance ?? 0,
    dashSpeed: partial.dashSpeed ?? 30,
    castMode: partial.castMode ?? 'instant',
    onActivate: partial.onActivate,
    onLand: partial.onLand,
  };
}
