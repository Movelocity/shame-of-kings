// T35.2:契约之盾挂 buff + 普攻吃下次加成
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

/** 推进到 active 首帧(越过 castTime) */
function enterActive(
  skill: ReturnType<typeof startSkill>,
  ctx: SkillContext,
  castTime: number,
): void {
  skill.tick(castTime, ctx);
}

describe('T35.2 契约之盾', () => {
  it('进入 active 后挂移速 + 下次普攻 buff(读 JSON 数值)', () => {
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
    expect(buffs.peekNextAttackBonus()).toBeCloseTo(json.effect.nextAttackBonus ?? 1, 5);

    buffs.tick(json.effect.duration ?? 0);
    expect(buffs.moveSpeedMultiplier()).toBe(1);
    expect(buffs.peekNextAttackBonus()).toBe(1);
  });

  it('有下次普攻加成时普攻伤害变高,命中后消费', () => {
    const aa = loadArthurSkills().find((s) => s.id === ARTHUR_AUTO_ATTACK_ID)!;
    const baseDmg = ARTHUR_DATA.skills.find((s) => s.id === ARTHUR_AUTO_ATTACK_ID)!.effect
      .damage!;
    const bonus = ARTHUR_DATA.skills.find((s) => s.id === ARTHUR_SHIELD_ID)!.effect
      .nextAttackBonus!;

    const caster = mkUnit('player', 0, 0);
    const target = mkUnit('dummy', 0, -1);
    const world = mkWorld([caster, target]);
    const buffs = createBuffBag();
    // 模拟盾已挂上
    buffs.apply({
      id: 'shield-of-pact:nextAttack',
      kind: 'nextAttackBonus',
      value: bonus,
      duration: 3,
    });
    const ctx = mkCtx(caster, world, buffs);
    const inst = startSkill(aa, caster, { forwardRad: 0 });

    // castTime=0 → 首 tick 即 active
    inst.tick(0.05, ctx);
    expect(inst.phase).toBe('active');
    const expected = Math.round(baseDmg * bonus);
    expect(inst.damage[0]?.damage).toBe(expected);

    applyDamage([target], inst.damage);
    expect(target.hp).toBe(1000 - expected);
    // 与 GameCanvas 一致:命中后再 consume
    buffs.consumeNextAttackBonus();
    expect(buffs.peekNextAttackBonus()).toBe(1);

    // 再打一次应回基础伤害
    const inst2 = startSkill(aa, caster, { forwardRad: 0 });
    inst2.tick(0.05, ctx);
    expect(inst2.damage[0]?.damage).toBe(baseDmg);
  });

  it('arthurSkillByHotkey(1) 带 onActivate', () => {
    const skill = arthurSkillByHotkey('1');
    expect(skill?.id).toBe(ARTHUR_SHIELD_ID);
    expect(typeof skill?.onActivate).toBe('function');
  });
});
