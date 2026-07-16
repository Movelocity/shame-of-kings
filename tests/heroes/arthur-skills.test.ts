import { describe, expect, it } from 'vitest';
import {
  ARTHUR_AOE_RADIUS,
  ARTHUR_DATA,
  ARTHUR_SHIELD_ID,
  getArthurAutoAttackRanges,
  loadArthurSkills,
} from '../../src/game/heroes/arthur';
import { createBuffBag } from '../../src/game/buffs/buff-bag';
import { applyDamage, startSkill } from '../../src/game/skills/runtime';
import type { SkillContext, Unit, WorldLike } from '../../src/game/skills/types';
import { DEFAULT_COLLISION_RADIUS } from '../../src/game/skills/types';

function mkUnit(
  id: string,
  x = 0,
  z = 0,
  team: Unit['team'] = 'blue',
  hp = 1000,
): Unit {
  return {
    id,
    team,
    position: { x, z },
    hp,
    hpMax: hp,
    isStatic: id === 'dummy',
    collisionRadius: DEFAULT_COLLISION_RADIUS,
    facingRad: 0,
    hidden: { inBush: false, outOfVisionFrom: new Set() },
  };
}

function mkWorld(units: Unit[]): WorldLike {
  return {
    unitsNear: (origin, radius) =>
      units.filter((u) => {
        const dx = u.position.x - origin.x;
        const dz = u.position.z - origin.z;
        return Math.hypot(dx, dz) <= radius;
      }),
    canSee: () => true,
  };
}

function mkCtx(caster: Unit, world: WorldLike, buffs = createBuffBag()): SkillContext {
  return { caster, world, now: 0, buffs };
}

describe('亚瑟技能机制', () => {
  it('普攻自动获取范围恒为攻击范围的 1.3 倍', () => {
    const ranges = getArthurAutoAttackRanges();
    expect(ranges.acquireRange).toBeCloseTo(ranges.attackRange * 1.3, 5);
    const shield = ARTHUR_DATA.skills.find((s) => s.id === ARTHUR_SHIELD_ID)!;
    expect(shield.effect.enhancedAttackAcquireRange).toBeGreaterThan(
      ranges.acquireRange,
    );
  });

  it('一技能无目标时挂移速和下次普攻 dash，自身不位移', () => {
    const shield = loadArthurSkills().find((s) => s.id === ARTHUR_SHIELD_ID)!;
    const json = ARTHUR_DATA.skills.find((s) => s.id === ARTHUR_SHIELD_ID)!;
    const caster = mkUnit('player');
    const world = mkWorld([caster]);
    const buffs = createBuffBag();
    const ctx = mkCtx(caster, world, buffs);
    const inst = startSkill(shield, caster, { forwardRad: 0 });

    inst.tick(shield.castTime, ctx);
    expect(inst.phase).toBe('active');
    expect(caster.position).toEqual({ x: 0, z: 0 });
    expect(buffs.moveSpeedMultiplier()).toBeCloseTo(
      1 + (json.effect.moveSpeedBoost ?? 0),
      5,
    );
    expect(buffs.peekNextAttackBonus()).toBe(1);
    expect(buffs.skillEnhancements('auto-attack')[0]?.effects[0]).toEqual({
      kind: 'dash',
      distance: json.effect.enhancedAttackDashDistance,
      speed: json.effect.enhancedAttackDashSpeed,
      acquireRange: json.effect.enhancedAttackAcquireRange,
      targeting: 'locked-or-forward',
    });
  });

  it('二技能 active 内按 interval 间歇 tick 4 次', () => {
    const whirl = loadArthurSkills().find((s) => s.id === 'whirlwind-strike')!;
    const json = ARTHUR_DATA.skills.find((s) => s.id === 'whirlwind-strike')!;
    const interval = json.effect.damageInterval ?? 0.2;
    const ticks = json.effect.damageTicks ?? 4;
    const perTick = json.effect.damage ?? 45;

    const caster = mkUnit('player', 0, 0);
    const dummy = mkUnit('dummy', 0, -1, 'neutral');
    const world = mkWorld([caster, dummy]);
    const ctx = mkCtx(caster, world);
    const inst = startSkill(whirl, caster, { forwardRad: 0 });

    inst.tick(whirl.castTime, ctx);
    expect(inst.phase).toBe('active');

    let totalDamage = 0;
    for (let i = 0; i < ticks; i++) {
      inst.tick(interval, ctx);
      expect(inst.damage.length).toBeGreaterThan(0);
      totalDamage += inst.damage.reduce((sum, d) => sum + d.damage, 0);
    }

    expect(totalDamage).toBe(perTick * ticks);
    expect(inst.hitboxActivations).toBe(ticks);
    applyDamage([dummy], [{ targetId: 'dummy', damage: totalDamage, isCrit: false }]);
    expect(dummy.hp).toBe(1000 - totalDamage);
  });

  it('二技能每个周期重新生成圆形伤害盒，不把持续伤害挂在目标上', () => {
    const whirl = loadArthurSkills().find((s) => s.id === 'whirlwind-strike')!;
    const caster = mkUnit('player', 0, 0);
    const dummy = mkUnit('dummy', 0, -10, 'neutral');
    const world = mkWorld([caster, dummy]);
    const ctx = mkCtx(caster, world);
    const inst = startSkill(whirl, caster, { forwardRad: 0 });

    inst.tick(whirl.castTime, ctx);
    inst.tick(whirl.damageInterval!, ctx);
    expect(inst.damage).toHaveLength(0);

    dummy.position.z = -1;
    inst.tick(whirl.damageInterval!, ctx);
    expect(inst.damage.some((d) => d.targetId === dummy.id)).toBe(true);

    dummy.position.z = -10;
    inst.tick(whirl.damageInterval!, ctx);
    expect(inst.damage).toHaveLength(0);
  });

  it('三技能落地圈击飞圈内敌人', () => {
    const judgement = loadArthurSkills().find((s) => s.id === 'sacred-judgement')!;
    const json = ARTHUR_DATA.skills.find((s) => s.id === 'sacred-judgement')!;
    const knockupDuration = json.effect.knockupDuration ?? 0.6;

    const caster = mkUnit('player', 0, 0);
    const dummy = mkUnit('dummy', 0, -5, 'neutral');
    const outside = mkUnit('outside', 0, -10, 'neutral');
    const world = mkWorld([caster, dummy, outside]);
    const ctx = mkCtx(caster, world);
    const inst = startSkill(judgement, caster, { forwardRad: 0 });

    inst.tick(judgement.castTime, ctx);
    expect(inst.phase).toBe('active');
    inst.tick(judgement.activeTime, ctx);
    expect(inst.phase).toBe('recovery');
    expect(dummy.cc?.kind).toBe('knockup');
    expect(dummy.cc?.remaining).toBeCloseTo(knockupDuration, 5);
    expect(inst.damage.some((d) => d.targetId === dummy.id)).toBe(true);
    expect(outside.cc).toBeUndefined();
    expect(inst.damage.some((d) => d.targetId === outside.id)).toBe(false);
    expect(inst.hitboxActivations).toBe(1);
    expect(judgement.hit).toEqual({ kind: 'circle', radius: ARTHUR_AOE_RADIUS });
  });
});
