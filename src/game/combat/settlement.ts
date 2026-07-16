import { applyKnockup } from './unit-cc';
import type {
  CombatEvent,
  Hit,
  SettlementSpec,
  SkillContext,
  Unit,
} from '../skills/types';

export type { CombatEvent, SettlementSpec } from '../skills/types';

export function settleHit(
  ctx: SkillContext,
  hit: Hit,
  spec: SettlementSpec,
): CombatEvent | null {
  const target = hit.target;
  if (!target || target.hp <= 0 || !target.targetable) return null;
  if (!spec.ignoreVisibility && !ctx.world.canSee(ctx.caster, target)) return null;
  const attackPowerMultiplier = spec.scalesWithAttackPower
    ? ctx.buffs?.attackPowerMultiplier() ?? 1
    : 1;
  return {
    kind: 'damage',
    sourceId: ctx.caster.id,
    skillId: ctx.castSnapshot?.skillId ?? 'unknown',
    targetId: target.id,
    payload: {
      damage: spec.baseDamage * attackPowerMultiplier,
      isCrit: spec.isCrit ?? false,
    },
  };
}

export interface CombatEventWorld {
  getUnit(id: string): Unit | null;
  notifyDamage?(events: readonly Extract<CombatEvent, { kind: 'damage' }>[]): void;
}

export function applyCombatEvents(
  world: CombatEventWorld,
  events: readonly CombatEvent[],
): void {
  const damageEvents: Extract<CombatEvent, { kind: 'damage' }>[] = [];
  for (const event of events) {
    const target = world.getUnit(event.targetId);
    if (!target) continue;
    if (event.kind === 'damage') {
      target.hp = Math.max(0, target.hp - event.payload.damage);
      damageEvents.push(event);
    } else if (event.kind === 'knockup') {
      applyKnockup(target, event.payload.duration);
    }
  }
  if (damageEvents.length > 0) world.notifyDamage?.(damageEvents);
}
