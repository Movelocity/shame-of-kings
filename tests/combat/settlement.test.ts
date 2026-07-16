import { describe, expect, it } from 'vitest';
import { applyCombatEvents, settleHit } from '../../src/game/combat/settlement';
import type { Unit } from '../../src/game/skills/types';
import { createWorldState } from '../../src/game/world/WorldState';

const unit = (id: string, team: Unit['team']): Unit => ({
  id, team, position: { x: 0, z: 0 }, hp: 100, hpMax: 100,
  isStatic: false, targetable: true, collisionRadius: 0.5, facingRad: 0,
  hidden: { inBush: false, outOfVisionFrom: new Set() },
});

describe('combat settlement', () => {
  it('creates an event without mutating hp, then applies it centrally', () => {
    const caster = unit('caster', 'blue');
    const target = unit('target', 'red');
    const world = createWorldState({ units: [caster, target] });
    const event = settleHit(
      { caster, world, now: 0, castSnapshot: { castId: 'cast-1', casterId: caster.id, skillId: 'skill', origin: caster.position, forwardRad: 0 } },
      { target, origin: caster.position, forwardRad: 0 },
      { baseDamage: 40 },
    );
    expect(target.hp).toBe(100);
    expect(event).toMatchObject({ kind: 'damage', targetId: target.id, payload: { damage: 40, isCrit: false } });
    applyCombatEvents(world, event ? [event] : []);
    expect(target.hp).toBe(60);
  });

  it('filters invisible and non-targetable units', () => {
    const caster = unit('caster', 'blue');
    const target = unit('target', 'red');
    const invisible = createWorldState({ units: [caster, target], canSee: () => false });
    const ctx = { caster, world: invisible, now: 0 };
    const hit = { target, origin: caster.position, forwardRad: 0 };
    expect(settleHit(ctx, hit, { baseDamage: 10 })).toBeNull();
    target.targetable = false;
    expect(settleHit(ctx, hit, { baseDamage: 10, ignoreVisibility: true })).toBeNull();
  });

  it('does not apply damage to an already-dead target', () => {
    const caster = unit('caster', 'blue');
    const target = unit('target', 'red');
    target.hp = 0;
    const world = createWorldState({ units: [caster, target] });
    const event = settleHit(
      { caster, world, now: 0, castSnapshot: { castId: 'cast-1', casterId: caster.id, skillId: 'skill', origin: caster.position, forwardRad: 0 } },
      { target, origin: caster.position, forwardRad: 0 },
      { baseDamage: 40 },
    );
    applyCombatEvents(world, event ? [event] : []);
    expect(target.hp).toBe(0);
  });

  it('applies knockup through the same event stream', () => {
    const target = unit('target', 'red');
    const world = createWorldState({ units: [target] });
    applyCombatEvents(world, [{
      kind: 'knockup', sourceId: 'caster', skillId: 'skill', targetId: target.id,
      payload: { duration: 0.6 },
    }]);
    expect(target.cc).toEqual({ kind: 'knockup', remaining: 0.6 });
  });
});
