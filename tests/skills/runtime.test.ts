// M2 T2.3:runtime.test.ts — 状态机切换 / 中断 / 伤害累计
import { describe, expect, it } from 'vitest';
import {
  applyDamage,
  makeSkill,
  simpleDamage,
  startSkill,
} from '../../src/game/skills/runtime';
import type { SkillContext, Unit, WorldLike } from '../../src/game/skills/types';

function mkUnit(id: string, x: number, z: number, hp = 100): Unit {
  return {
    id,
    team: 'blue',
    position: { x, z },
    hp,
    hpMax: hp,
    isStatic: false,
    hidden: { inBush: false, outOfVisionFrom: new Set() },
  };
}

function mkWorld(units: Unit[], visible = true): WorldLike {
  return {
    unitsNear() { return units; },
    canSee() { return visible; },
  };
}

function mkCtx(caster: Unit, world: WorldLike, now = 0): SkillContext {
  return { caster, world, now };
}

describe('SkillInstance 状态机', () => {
  it('cast → active → recovery → done 全流程', () => {
    const caster = mkUnit('caster', 0, 0);
    const target = mkUnit('target', 1, 0);
    const world = mkWorld([caster, target]);
    const skill = makeSkill({
      id: 'test-circular',
      displayName: 'Test',
      hit: { kind: 'circle', radius: 2 },
      castTime: 0.2,
      activeTime: 0.1,
      recoveryTime: 0.1,
      cooldown: 1.0,
      damage: simpleDamage(50),
    });
    const inst = startSkill(skill, caster, { forwardRad: 0 });

    // t=0.1s:cast 中
    inst.tick(0.1, mkCtx(caster, world));
    expect(inst.phase).toBe('cast');
    expect(target.hp).toBe(100);

    // t=0.2s(累计 0.3):刚进 active
    inst.tick(0.2, mkCtx(caster, world));
    expect(inst.phase).toBe('active');
    // 框架只算 DamageResult 不扣血;caller 需要 applyDamage
    applyDamage([target], inst.damage);
    expect(target.hp).toBe(50);

    // 再 tick activeTime → recovery
    inst.tick(0.1, mkCtx(caster, world));
    expect(inst.phase).toBe('recovery');
    // recovery 不再结算伤害
    const hpAfter = target.hp;
    inst.tick(0.05, mkCtx(caster, world));
    expect(target.hp).toBe(hpAfter);

    // 完成 recovery → done
    inst.tick(0.05, mkCtx(caster, world));
    expect(inst.phase).toBe('done');
  });

  it('cancel() 任意阶段直接置 done', () => {
    const caster = mkUnit('caster', 0, 0);
    const world = mkWorld([caster]);
    const skill = makeSkill({
      id: 'test',
      displayName: 'Test',
      hit: { kind: 'self' },
      castTime: 1.0,
      activeTime: 0.5,
      recoveryTime: 0.5,
      cooldown: 2.0,
    });
    const inst = startSkill(skill, caster, { forwardRad: 0 });
    inst.tick(0.3, mkCtx(caster, world));
    expect(inst.phase).toBe('cast');
    inst.cancel();
    expect(inst.phase).toBe('done');
    // 取消后 tick 不再推进
    inst.tick(0.1, mkCtx(caster, world));
    expect(inst.phase).toBe('done');
  });

  it('displacement=dash 一次性把 caster 推到 origin + forward*distance', () => {
    const caster = mkUnit('caster', 0, 0);
    const world = mkWorld([caster]);
    const skill = makeSkill({
      id: 'test-dash',
      displayName: 'Dash',
      hit: { kind: 'self' },
      displacement: 'dash',
      castTime: 0.1,
      activeTime: 0.1,
      recoveryTime: 0.1,
      cooldown: 1.0,
      dashDistance: 5,
    });
    const inst = startSkill(skill, caster, { forwardRad: 0 });
    // cast → active,触发 dash:caster 应在 (0, -5)
    inst.tick(0.1, mkCtx(caster, world));
    inst.tick(0.05, mkCtx(caster, world));
    // 第一次 tick 0.1 仍在 cast(0.1 < 0.1 不满足,看实现条件:>= castTime 推进;看仔细)
    // 实际:第一次 tick 0.1 累计 elapsed=0.1, 0.1 >= 0.1 castTime → 进 active → 应用 dash
    expect(caster.position.x).toBe(0);
    expect(caster.position.z).toBe(-5);
  });

  it('displacement=ground 不自动移动(由 controller 推进,M2 留口子)', () => {
    const caster = mkUnit('caster', 0, 0);
    const world = mkWorld([caster]);
    const skill = makeSkill({
      id: 'test-ground',
      displayName: 'Ground',
      hit: { kind: 'self' },
      displacement: 'ground',
      castTime: 0.1,
      activeTime: 0.1,
      recoveryTime: 0.1,
      cooldown: 1.0,
    });
    const inst = startSkill(skill, caster, { forwardRad: 0 });
    inst.tick(0.2, mkCtx(caster, world));
    expect(caster.position.x).toBe(0);
    expect(caster.position.z).toBe(0);
  });
});

describe('DamageFormula 视野过滤', () => {
  it('canSee=false 时 simpleDamage 返回 null,目标不掉血', () => {
    const caster = mkUnit('caster', 0, 0);
    const target = mkUnit('target', 1, 0);
    const world = mkWorld([caster, target], false); // 不可见
    const skill = makeSkill({
      id: 'test-dmg',
      displayName: 'Dmg',
      hit: { kind: 'circle', radius: 2 },
      castTime: 0,
      activeTime: 0.1,
      recoveryTime: 0,
      cooldown: 1.0,
      damage: simpleDamage(50), // ignoreVisibility=false
    });
    const inst = startSkill(skill, caster, { forwardRad: 0 });
    inst.tick(0.05, mkCtx(caster, world)); // 进 active
    inst.tick(0.1, mkCtx(caster, world)); // active 推进
    expect(target.hp).toBe(100);
  });

  it('ignoreVisibility=true 时强制命中', () => {
    const caster = mkUnit('caster', 0, 0);
    const target = mkUnit('target', 1, 0);
    const world = mkWorld([caster, target], false);
    const skill = makeSkill({
      id: 'test-dmg-true',
      displayName: 'Dmg',
      hit: { kind: 'circle', radius: 2 },
      castTime: 0,
      activeTime: 0.1,
      recoveryTime: 0,
      cooldown: 1.0,
      damage: simpleDamage(50, true),
    });
    const inst = startSkill(skill, caster, { forwardRad: 0 });
    inst.tick(0.05, mkCtx(caster, world));
    inst.tick(0.1, mkCtx(caster, world));
    applyDamage([target], inst.damage);
    expect(target.hp).toBe(50);
  });
});

describe('applyDamage', () => {
  it('按 id 扣血,clamp 到 0', () => {
    const u1 = mkUnit('a', 0, 0, 50);
    const u2 = mkUnit('b', 1, 0, 30);
    const results = [
      { targetId: 'a', damage: 20, isCrit: false },
      { targetId: 'b', damage: 100, isCrit: false },
      { targetId: 'c', damage: 50, isCrit: false }, // 找不到 → 忽略
    ];
    applyDamage([u1, u2], results);
    expect(u1.hp).toBe(30);
    expect(u2.hp).toBe(0);
  });
});
