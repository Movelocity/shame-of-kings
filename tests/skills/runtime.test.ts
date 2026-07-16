import { describe, expect, it } from 'vitest';
import { applyCombatEvents } from '../../src/game/combat/settlement';
import { makeSkill, startSkill } from '../../src/game/skills/runtime';
import type { SkillContext, Unit, WorldLike } from '../../src/game/skills/types';

function unit(id: string, x = 0, z = 0, team: Unit['team'] = 'red'): Unit {
  return {
    id, team, position: { x, z }, hp: 100, hpMax: 100,
    isStatic: false, targetable: true, collisionRadius: 0.5, facingRad: 0,
    hidden: { inBush: false, outOfVisionFrom: new Set() },
  };
}

function world(units: Unit[], visible = true) {
  const byId = new Map(units.map((value) => [value.id, value]));
  return {
    unitsNear: () => units,
    canSee: () => visible,
    getUnit: (id: string) => byId.get(id) ?? null,
  };
}

function snapshot(caster: Unit, skillId: string) {
  return { castId: `cast-${skillId}`, casterId: caster.id, skillId, origin: { ...caster.position }, forwardRad: 0 };
}

function context(caster: Unit, value: WorldLike): SkillContext {
  return { caster, world: value, now: 0 };
}

describe('SkillInstance delivery runtime', () => {
  it('instant-hit emits once and advances phases', () => {
    const caster = unit('caster', 0, 0, 'blue');
    const target = unit('target', 1, 0);
    const value = world([caster, target]);
    const skill = makeSkill({
      id: 'instant', displayName: 'Instant', castTime: 0.1, activeTime: 0.1,
      recoveryTime: 0.1, cooldown: 1,
      delivery: { mode: 'instant-hit', geometry: { kind: 'circle', radius: 2 }, settlement: { baseDamage: 50 } },
    });
    const instance = startSkill(skill, caster, snapshot(caster, skill.id));
    expect(instance.tick(0.1, context(caster, value))).toHaveLength(1);
    applyCombatEvents(value, instance.events);
    expect(target.hp).toBe(50);
    expect(instance.tick(0.05, context(caster, value))).toHaveLength(0);
    instance.tick(0.05, context(caster, value));
    expect(instance.phase).toBe('recovery');
    instance.tick(0.1, context(caster, value));
    expect(instance.phase).toBe('done');
  });

  it('interval-hit emits configured ticks', () => {
    const caster = unit('caster', 0, 0, 'blue');
    const target = unit('target', 1, 0);
    const value = world([caster, target]);
    const skill = makeSkill({
      id: 'interval', displayName: 'Interval', castTime: 0, activeTime: 1,
      recoveryTime: 0, cooldown: 1,
      delivery: { mode: 'interval-hit', geometry: { kind: 'circle', radius: 2 }, interval: 0.2, ticks: 3, settlement: { baseDamage: 10 } },
    });
    const instance = startSkill(skill, caster, snapshot(caster, skill.id));
    let count = 0;
    for (let i = 0; i < 3; i++) count += instance.tick(0.2, context(caster, value)).length;
    expect(count).toBe(3);
    expect(instance.hitboxActivations).toBe(3);
  });

  it('settlement filters invisible targets unless explicitly ignored', () => {
    const caster = unit('caster', 0, 0, 'blue');
    const target = unit('target', 1, 0);
    const hiddenWorld = world([caster, target], false);
    const create = (ignoreVisibility = false) => makeSkill({
      id: `vision-${ignoreVisibility}`, displayName: 'Vision', castTime: 0, activeTime: 0.1,
      recoveryTime: 0, cooldown: 1,
      delivery: { mode: 'instant-hit', geometry: { kind: 'circle', radius: 2 }, settlement: { baseDamage: 10, ignoreVisibility } },
    });
    const blocked = create();
    expect(startSkill(blocked, caster, snapshot(caster, blocked.id)).tick(0.01, context(caster, hiddenWorld))).toHaveLength(0);
    const forced = create(true);
    expect(startSkill(forced, caster, snapshot(caster, forced.id)).tick(0.01, context(caster, hiddenWorld))).toHaveLength(1);
  });

  it('dash moves incrementally before resolving hit', () => {
    const caster = unit('caster', 0, 0, 'blue');
    const target = unit('target', 0, -5);
    const value = world([caster, target]);
    const skill = makeSkill({
      id: 'dash', displayName: 'Dash', displacement: 'dash', dashDistance: 5, dashSpeed: 10,
      castTime: 0, activeTime: 0.1, recoveryTime: 0, cooldown: 1,
      delivery: { mode: 'instant-hit', geometry: { kind: 'circle', radius: 1 }, settlement: { baseDamage: 10 } },
    });
    const instance = startSkill(skill, caster, snapshot(caster, skill.id));
    expect(instance.tick(0.2, context(caster, value))).toHaveLength(0);
    expect(caster.position.z).toBe(-2);
    expect(instance.tick(0.3, context(caster, value))).toHaveLength(1);
    expect(caster.position.z).toBe(-5);
  });

  it('cancel stops future events but preserves cooldown', () => {
    const caster = unit('caster', 0, 0, 'blue');
    const value = world([caster]);
    const skill = makeSkill({
      id: 'cancel', displayName: 'Cancel', castTime: 1, activeTime: 1, recoveryTime: 1, cooldown: 2,
      delivery: { mode: 'buff-only' },
    });
    const instance = startSkill(skill, caster, snapshot(caster, skill.id));
    instance.tick(0.2, context(caster, value));
    const remaining = instance.cooldownTimer;
    instance.cancel();
    expect(instance.phase).toBe('done');
    expect(instance.cooldownTimer).toBe(remaining);
    expect(instance.tick(0.1, context(caster, value))).toEqual([]);
  });
});
