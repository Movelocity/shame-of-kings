// T35.2:契约之盾挂 buff + 突脸锁敌(无下次普攻加成)
import { describe, expect, it } from 'vitest';
import {
  arthurSkillByHotkey,
  ARTHUR_AUTO_ATTACK_ID,
  ARTHUR_DATA,
  ARTHUR_SHIELD_ID,
  loadArthurSkills,
} from '../../src/game/heroes/arthur';
import { createBuffBag } from '../../src/game/buffs/buff-bag';
import { applyDamage, startSkill } from '../../src/game/skills/runtime';
import type { SkillContext, Unit, WorldLike } from '../../src/game/skills/types';

function mkUnit(id: string, x = 0, z = 0, hp = 1000): Unit {
  return {
    id,
    team: 'blue',
    position: { x, z },
    hp,
    hpMax: hp,
    isStatic: false,
    facingRad: 0,
    hidden: { inBush: false, outOfVisionFrom: new Set() },
  };
}

function mkWorld(units: Unit[]): WorldLike {
  return {
    unitsNear: () => units,
    canSee: () => true,
  };
}

function mkCtx(caster: Unit, world: WorldLike, buffs = createBuffBag()): SkillContext {
  return { caster, world, now: 0, buffs };
}

function enterActive(
  skill: ReturnType<typeof startSkill>,
  ctx: SkillContext,
  castTime: number,
): void {
  skill.tick(castTime, ctx);
}

describe('T35.2 契约之盾', () => {
  it('进入 active 后仅挂移速 buff(读 JSON 数值)', () => {
    const shield = loadArthurSkills().find((s) => s.id === ARTHUR_SHIELD_ID);
    expect(shield).toBeDefined();
    const json = ARTHUR_DATA.skills.find((s) => s.id === ARTHUR_SHIELD_ID)!;
    const caster = mkUnit('player');
    const world = mkWorld([caster]);
    const buffs = createBuffBag();
    const ctx = mkCtx(caster, world, buffs);
    const inst = startSkill(shield!, caster, { forwardRad: 0 });

    expect(buffs.moveSpeedMultiplier()).toBe(1);
    enterActive(inst, ctx, shield!.castTime);
    expect(inst.phase).toBe('active');
    expect(buffs.moveSpeedMultiplier()).toBeCloseTo(1 + (json.effect.moveSpeedBoost ?? 0), 5);
    expect(buffs.peekNextAttackBonus()).toBe(1);

    buffs.tick(json.effect.duration ?? 0);
    expect(buffs.moveSpeedMultiplier()).toBe(1);
  });

  it('普攻伤害不受契约之盾影响(无 nextAttackBonus)', () => {
    const aa = loadArthurSkills().find((s) => s.id === ARTHUR_AUTO_ATTACK_ID)!;
    const baseDmg = ARTHUR_DATA.skills.find((s) => s.id === ARTHUR_AUTO_ATTACK_ID)!
      .effect.damage!;

    const caster = mkUnit('player', 0, 0);
    const target = mkUnit('dummy', 0, -1);
    target.team = 'neutral';
    const world = mkWorld([caster, target]);
    const buffs = createBuffBag();
    const ctx = mkCtx(caster, world, buffs);
    const inst = startSkill(aa, caster, { forwardRad: 0 });

    inst.tick(0.05, ctx);
    expect(inst.phase).toBe('active');
    expect(inst.damage[0]?.damage).toBe(baseDmg);

    applyDamage([target], inst.damage);
    expect(target.hp).toBe(1000 - baseDmg);
  });

  it('arthurSkillByHotkey(1) 带 onActivate', () => {
    const skill = arthurSkillByHotkey('1');
    expect(skill?.id).toBe(ARTHUR_SHIELD_ID);
    expect(typeof skill?.onActivate).toBe('function');
  });
});
