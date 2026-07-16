import { describe, expect, it } from 'vitest';
import { arthurSkillByHotkey } from '../../src/game/heroes/arthur';
import { createSkillBook } from '../../src/game/skills/skill-book';
import { makeSkill } from '../../src/game/skills/runtime';
import type { Unit } from '../../src/game/skills/types';

const caster: Unit = {
  id: 'caster', team: 'blue', position: { x: 0, z: 0 }, hp: 100, hpMax: 100,
  isStatic: false, targetable: true, collisionRadius: 0.5, facingRad: 0,
  hidden: { inBush: false, outOfVisionFrom: new Set() },
};
const world = { unitsNear: () => [caster], canSee: () => true };
const ctx = { caster, world, now: 0 };
const skill = (id: string, cooldown = 1) => makeSkill({
  id, displayName: id, delivery: { mode: 'buff-only' },
  castTime: 0.1, activeTime: 0.1, recoveryTime: 0.1, cooldown,
});
const cast = (id: string) => ({ castId: `cast-${id}`, casterId: caster.id, skillId: id, origin: { ...caster.position }, forwardRad: 0 });

describe('SkillBook', () => {
  it('releases cast slot while retaining per-skill cooldown', () => {
    const book = createSkillBook();
    const a = skill('a');
    expect(book.start(a, caster, cast(a.id))).not.toBeNull();
    book.tick(0.1, ctx); book.tick(0.1, ctx); book.tick(0.1, ctx);
    expect(book.active).toBeNull();
    expect(book.cooldownRemaining(a.id)).toBeCloseTo(0.7);
  });

  it('blocks concurrent casts and reset clears all state', () => {
    const book = createSkillBook();
    const a = skill('a');
    const b = skill('b');
    expect(book.start(a, caster, cast(a.id))).not.toBeNull();
    expect(book.start(b, caster, cast(b.id))).toBeNull();
    book.reset();
    expect(book.active).toBeNull();
    expect(book.canStart(a.id)).toBe(true);
  });

  it('Arthur cast modes remain data-driven', () => {
    expect(arthurSkillByHotkey('0')?.castMode).toBe('instant');
    expect(arthurSkillByHotkey('3')?.castMode).toBe('targeted');
  });
});
