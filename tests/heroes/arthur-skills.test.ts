import { describe, expect, it } from 'vitest';
import { applyCombatEvents } from '../../src/game/combat/settlement';
import { ARTHUR_AOE_RADIUS, ARTHUR_DATA, getArthurAutoAttackRanges, loadArthurSkills } from '../../src/game/heroes/arthur';
import { startSkill } from '../../src/game/skills/runtime';
import type { Unit } from '../../src/game/skills/types';
import { createWorldState } from '../../src/game/world/WorldState';

function unit(id: string, z = 0, team: Unit['team'] = 'blue'): Unit {
  return {
    id, team, position: { x: 0, z }, hp: 1000, hpMax: 1000,
    isStatic: id === 'dummy', targetable: true, collisionRadius: 0.5, facingRad: 0,
    hidden: { inBush: false, outOfVisionFrom: new Set() },
  };
}
const cast = (caster: Unit, skillId: string) => ({
  castId: `cast-${skillId}`, casterId: caster.id, skillId,
  origin: { ...caster.position }, forwardRad: 0,
});

describe('Arthur unified kit', () => {
  it('uses effect geometry as the authoritative AOE radius', () => {
    const whirlwind = loadArthurSkills().find((skill) => skill.id === 'whirlwind-strike')!;
    expect(whirlwind.delivery).toMatchObject({
      mode: 'interval-hit', geometry: { kind: 'circle', radius: ARTHUR_AOE_RADIUS },
    });
  });

  it('auto attack acquire range remains 1.3x attack range', () => {
    const ranges = getArthurAutoAttackRanges();
    expect(ranges.acquireRange).toBeCloseTo(ranges.attackRange * 1.3);
  });

  it('whirlwind emits four periodic damage events', () => {
    const skill = loadArthurSkills().find((value) => value.id === 'whirlwind-strike')!;
    const slot = ARTHUR_DATA.skills.find((value) => value.id === skill.id)!;
    if (slot.effect.kind !== 'periodic-damage') throw new Error('invalid fixture');
    const caster = unit('player');
    const dummy = unit('dummy', -1, 'neutral');
    const world = createWorldState({ units: [caster, dummy] });
    const instance = startSkill(skill, caster, cast(caster, skill.id));
    instance.tick(skill.castTime, { caster, world, now: 0 });
    const events = [];
    for (let i = 0; i < slot.effect.damageTicks; i++) {
      events.push(...instance.tick(slot.effect.damageInterval, { caster, world, now: 0 }));
    }
    expect(events).toHaveLength(slot.effect.damageTicks);
    expect(events.every((event) => event.kind === 'damage' && event.payload.damage === slot.effect.damage)).toBe(true);
  });

  it('whirlwind re-evaluates geometry each interval', () => {
    const skill = loadArthurSkills().find((value) => value.id === 'whirlwind-strike')!;
    const delivery = skill.delivery;
    if (delivery.mode !== 'interval-hit') throw new Error('invalid fixture');
    const caster = unit('player');
    const dummy = unit('dummy', -10, 'neutral');
    const world = createWorldState({ units: [caster, dummy] });
    const instance = startSkill(skill, caster, cast(caster, skill.id));
    instance.tick(skill.castTime, { caster, world, now: 0 });
    expect(instance.tick(delivery.interval, { caster, world, now: 0 })).toEqual([]);
    dummy.position.z = -1;
    expect(instance.tick(delivery.interval, { caster, world, now: 0 })).toHaveLength(1);
  });

  it('landing damage and knockup are both applied through combat events', () => {
    const skill = loadArthurSkills().find((value) => value.id === 'sacred-judgement')!;
    const caster = unit('player');
    const dummy = unit('dummy', -5, 'neutral');
    const world = createWorldState({ units: [caster, dummy] });
    const instance = startSkill(skill, caster, { ...cast(caster, skill.id), dashDistance: 5 });
    instance.tick(skill.castTime, { caster, world, now: 0 });
    const events = instance.tick(skill.activeTime, { caster, world, now: 0 });
    expect(events.map((event) => event.kind)).toEqual(['damage', 'knockup']);
    expect(dummy.cc).toBeUndefined();
    applyCombatEvents(world, events);
    expect(dummy.hp).toBeLessThan(dummy.hpMax);
    expect(dummy.cc?.kind).toBe('knockup');
  });
});
