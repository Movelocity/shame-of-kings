import { applyMoveSpeedBuff, applyNextAttackDash } from '../buffs/buff-bag';
import { defaultTargetFilter } from '../combat/target-filter';
import { settleHit } from '../combat/settlement';
import { resolveHits } from '../skills/hits';
import type { CastSnapshot, CombatEvent, Skill, SkillContext } from '../skills/types';
import { createConvergentBurst } from '../world/skill-effects/convergent-burst';
import { createSequentialProjectileBurst } from '../world/skill-effects/sequential-projectile-burst';
import {
  spawnProjectile,
  spawnProjectileThenZone,
  spawnProjectilesFromCast,
  spawnSweptRectFromCast,
} from '../world/skill-effects/spawn';
import type { WorldStateHandle } from '../world/WorldState';
import type { HeroSkillEffectData, HeroSkillSlotData } from './hero-kit';

export type EffectFactory = (
  skill: Skill,
  slot: HeroSkillSlotData,
  snapshot: CastSnapshot,
  ctx: SkillContext,
) => void;

const noop: EffectFactory = () => {};

export const EFFECT_REGISTRY: Record<HeroSkillEffectData['kind'], EffectFactory> = {
  'move-speed-buff'(skill, slot, _snapshot, ctx) {
    if (!ctx.buffs || slot.effect.kind !== 'move-speed-buff') return;
    const effect = slot.effect;
    applyMoveSpeedBuff(ctx.buffs, {
      sourceId: skill.id,
      moveSpeedBoost: effect.moveSpeedBoost,
      duration: effect.duration,
    });
    applyNextAttackDash(ctx.buffs, {
      sourceId: skill.id,
      targetSkillId: 'auto-attack',
      dashDistance: effect.enhancedAttackDashDistance,
      dashSpeed: effect.enhancedAttackDashSpeed,
      acquireRange: effect.enhancedAttackAcquireRange,
      duration: effect.duration,
    });
  },
  'periodic-damage': noop,
  'dash-landing-knockup': noop,
  'beam-channel': noop,
  'attack-damage'(skill, slot, snapshot, ctx) {
    if (slot.effect.kind !== 'attack-damage') return;
    const effect = slot.effect;
    const speed = effect.projectileSpeed;
    if (speed === undefined) return;
    (ctx.world as WorldStateHandle).spawnEffect(spawnProjectile({
      castId: snapshot.castId,
      ownerId: snapshot.casterId,
      sourceTeam: ctx.caster.team,
      skillId: skill.id,
      origin: snapshot.origin,
      forwardRad: snapshot.forwardRad,
      targetId: snapshot.targetId,
      speed,
      maxRange: effect.attackRange * (effect.projectileRangeMultiplier ?? 2),
      collisionRadius: effect.projectileCollisionRadius,
      homing: effect.homing ?? true,
      onTargetLost: effect.onTargetLost ?? 'continue-forward',
      damage: {
        amount: settlementDamage(skill) * (ctx.buffs?.attackPowerMultiplier() ?? 1),
      },
      hitPolicy: { maxHits: 1 },
    }));
  },
  'spawn-projectile'(skill, slot, snapshot, ctx) {
    if (slot.effect.kind !== 'spawn-projectile') return;
    const effect = slot.effect;
    const configs = Array.from({ length: effect.projectileCount ?? 1 }, () => ({
      skillId: skill.id,
      speed: effect.speed,
      maxRange: effect.maxRange,
      collisionRadius: effect.collisionRadius,
      homing: effect.homing,
      onTargetLost: effect.onTargetLost,
      hitPolicy: effect.pierce ? { maxHits: 1, pierce: effect.pierce } : { maxHits: 1 },
      damage: { amount: effect.damage },
    }));
    const world = ctx.world as WorldStateHandle;
    const interval = effect.projectileSpawnInterval ?? 0;
    if (interval > 0 && configs.length > 1) {
      world.spawnEffect(createSequentialProjectileBurst({
        snapshot,
        sourceTeam: ctx.caster.team,
        spawnInterval: interval,
        projectileConfigs: configs,
      }));
    } else {
      for (const entity of spawnProjectilesFromCast(snapshot, ctx.caster.team, configs)) world.spawnEffect(entity);
    }
  },
  'spawn-swept-rect'(skill, slot, snapshot, ctx) {
    if (slot.effect.kind !== 'spawn-swept-rect') return;
    const effect = slot.effect;
    (ctx.world as WorldStateHandle).spawnEffect(spawnSweptRectFromCast(snapshot, ctx.caster.team, skill.id, {
      speed: effect.speed,
      maxRange: effect.maxRange,
      halfWidth: effect.halfWidth,
      halfDepth: effect.halfDepth,
      damage: { amount: effect.damage },
    }));
  },
  'projectile-then-zone'(skill, slot, snapshot, ctx) {
    if (slot.effect.kind !== 'projectile-then-zone') return;
    const effect = slot.effect;
    (ctx.world as WorldStateHandle).spawnEffect(spawnProjectileThenZone({
      castId: snapshot.castId,
      ownerId: snapshot.casterId,
      sourceTeam: ctx.caster.team,
      skillId: skill.id,
      origin: snapshot.origin,
      forwardRad: snapshot.forwardRad,
      projectile: {
        speed: effect.projectileSpeed,
        maxRange: effect.projectileMaxRange,
        collisionRadius: effect.projectileCollisionRadius,
        damage: { amount: effect.projectileDamage },
      },
      zone: {
        radius: effect.zoneRadius,
        tickInterval: effect.zoneTickInterval,
        ticks: effect.zoneTicks,
        damage: { amount: effect.zoneDamage },
      },
    }));
  },
  'convergent-burst'(_skill, slot, snapshot, ctx) {
    if (slot.effect.kind !== 'convergent-burst') return;
    const effect = slot.effect;
    (ctx.world as WorldStateHandle).spawnEffect(createConvergentBurst({
      snapshot,
      sourceTeam: ctx.caster.team,
      projectileCount: effect.projectileCount,
      projectileSpeed: effect.projectileSpeed,
      travelDistance: effect.travelDistance,
      fanHalfAngle: effect.fanHalfAngle,
      spawnInterval: effect.spawnInterval,
      collisionRadius: effect.collisionRadius,
      damage: effect.damage,
    }));
  },
};

function settlementDamage(skill: Skill): number {
  const delivery = skill.delivery.mode === 'composite'
    ? skill.delivery.parts.find((part) => part.mode === 'instant-hit' || part.mode === 'interval-hit')
    : skill.delivery;
  if (!delivery) return 0;
  if (delivery.mode === 'instant-hit' || delivery.mode === 'interval-hit') {
    return delivery.settlement.baseDamage;
  }
  if (delivery.mode === 'spawn-effect' && typeof delivery.effectConfig === 'object' && delivery.effectConfig !== null) {
    const damage = (delivery.effectConfig as { damage?: unknown }).damage;
    return typeof damage === 'number' ? damage : 0;
  }
  return 0;
}

export function createDashLandingEvents(
  skill: Skill,
  slot: HeroSkillSlotData,
  ctx: SkillContext,
): readonly CombatEvent[] {
  if (slot.effect.kind !== 'dash-landing-knockup') return [];
  const effect = slot.effect;
  const hits = resolveHits(
    ctx.world,
    ctx.caster,
    { kind: 'circle', radius: effect.radius },
    ctx.caster.facingRad,
    { filter: defaultTargetFilter(ctx.caster) },
  );
  const events: CombatEvent[] = [];
  for (const hit of hits) {
    const damage = settleHit(ctx, hit, { baseDamage: effect.damage });
    if (!damage || !hit.target) continue;
    events.push(damage, {
      kind: 'knockup',
      sourceId: ctx.caster.id,
      skillId: skill.id,
      targetId: hit.target.id,
      payload: { duration: effect.knockupDuration },
    });
  }
  return events;
}
