import { describe, expect, it } from 'vitest';
import { createBuffBag } from '../../src/game/buffs/buff-bag';
import { ARTHUR_AUTO_ATTACK_ID, ARTHUR_DATA, ARTHUR_SHIELD_ID, loadArthurSkills } from '../../src/game/heroes/arthur';
import { startSkill } from '../../src/game/skills/runtime';
import type { Unit } from '../../src/game/skills/types';
import { createWorldState } from '../../src/game/world/WorldState';

const unit = (id: string, team: Unit['team'] = 'blue'): Unit => ({
  id, team, position: { x: 0, z: id === 'dummy' ? -1 : 0 }, hp: 1000, hpMax: 1000,
  isStatic: false, targetable: true, collisionRadius: 0.5, facingRad: 0,
  hidden: { inBush: false, outOfVisionFrom: new Set() },
});
const cast = (caster: Unit, skillId: string) => ({ castId: `cast-${skillId}`, casterId: caster.id, skillId, origin: { ...caster.position }, forwardRad: 0 });

describe('Arthur shield', () => {
  it('applies speed and next-attack dash from JSON', () => {
    const skill = loadArthurSkills().find((value) => value.id === ARTHUR_SHIELD_ID)!;
    const slot = ARTHUR_DATA.skills.find((value) => value.id === skill.id)!;
    if (slot.effect.kind !== 'move-speed-buff') throw new Error('invalid fixture');
    const caster = unit('player');
    const world = createWorldState({ units: [caster] });
    const buffs = createBuffBag();
    startSkill(skill, caster, cast(caster, skill.id)).tick(skill.castTime, { caster, world, now: 0, buffs });
    expect(buffs.moveSpeedMultiplier()).toBeCloseTo(1 + slot.effect.moveSpeedBoost);
    expect(buffs.skillEnhancements(ARTHUR_AUTO_ATTACK_ID)[0]?.effects[0]).toMatchObject({
      kind: 'dash', distance: slot.effect.enhancedAttackDashDistance,
    });
  });

  it('attack-power state scales melee auto attack settlement', () => {
    const skill = loadArthurSkills().find((value) => value.id === ARTHUR_AUTO_ATTACK_ID)!;
    const caster = unit('player');
    const dummy = unit('dummy', 'neutral');
    const world = createWorldState({ units: [caster, dummy] });
    const buffs = createBuffBag();
    buffs.apply({ id: 'attack-up', kind: 'attackPower', value: 0.2, duration: 3 });
    const events = startSkill(skill, caster, cast(caster, skill.id)).tick(0.05, { caster, world, now: 0, buffs });
    expect(events[0]?.kind).toBe('damage');
    if (events[0]?.kind === 'damage') expect(events[0].payload.damage).toBeCloseTo(ARTHUR_DATA.stats.attackDamage * 1.2);
  });

  it('shield uses buff-only delivery', () => {
    expect(loadArthurSkills().find((value) => value.id === ARTHUR_SHIELD_ID)?.delivery.mode).toBe('buff-only');
  });
});
