import { describe, expect, it } from 'vitest';
import { loadDajiSkills, dajiSkillByHotkey, getDajiAutoAttackRanges } from '../../src/game/heroes/daji';
import { loadAngelaSkills, angelaSkillByHotkey, getAngelaAutoAttackRanges } from '../../src/game/heroes/angela';
import { heroSkillByHotkey } from '../../src/game/heroes/index';
import { createPracticeDummy } from '../../src/game/units/practice-dummy';
import { createPracticeSession } from '../../src/game/world/practice-session';
import { DAJI_DATA } from '../../src/game/heroes/daji';
import type { Unit } from '../../src/game/skills/types';
import { DEFAULT_COLLISION_RADIUS } from '../../src/game/skills/types';

function makePlayer(spawn = { x: 0, z: 0 }): Unit {
  return {
    id: 'player',
    team: 'blue',
    position: { x: spawn.x, z: spawn.z },
    hp: DAJI_DATA.stats.hpMax,
    hpMax: DAJI_DATA.stats.hpMax,
    isStatic: false,
    collisionRadius: DEFAULT_COLLISION_RADIUS,
    facingRad: 0,
    hidden: { inBush: false, outOfVisionFrom: new Set<string>() },
  };
}

describe('daji hero kit', () => {
  it('四槽位加载成功', () => {
    const skills = loadDajiSkills();
    expect(skills).toHaveLength(4);
    expect(dajiSkillByHotkey('0')).not.toBeNull();
    expect(dajiSkillByHotkey('1')?.castMode).toBe('instant');
    expect(dajiSkillByHotkey('2')?.castMode).toBe('targeted');
  });

  it('一技能为方向脱手矩形剑气', () => {
    const s1 = DAJI_DATA.skills.find((s) => s.hotkey === '1');
    expect(s1?.aimKind).toBe('direction');
    expect(s1?.hit).toEqual({ kind: 'rect', halfWidth: 1.6, halfDepth: 10 });
    expect(s1?.effect).toMatchObject({
      kind: 'spawn-swept-rect',
      maxRange: 10,
      halfWidth: 1.2,
      halfDepth: 0.9,
    });
  });

  it('二技能单枚大爱心追踪弹', () => {
    const s2 = DAJI_DATA.skills.find((s) => s.hotkey === '2');
    expect(s2?.effect).toMatchObject({
      kind: 'spawn-projectile',
      projectileCount: 1,
      collisionRadius: 0.55,
      homing: true,
    });
  });

  it('三技能五枚小爱心依次飞出', () => {
    const s3 = DAJI_DATA.skills.find((s) => s.hotkey === '3');
    expect(s3?.effect).toMatchObject({
      kind: 'spawn-projectile',
      projectileCount: 5,
      collisionRadius: 0.22,
      projectileSpawnInterval: 0.14,
      homing: true,
    });
  });

  it('普攻为索敌弹道，攻击距离为近身 2 倍', () => {
    const aa = dajiSkillByHotkey('0');
    expect(aa?.hit).toEqual({ kind: 'target', range: 4 });
    expect(aa?.damage).toBeUndefined();
    const ranges = getDajiAutoAttackRanges();
    expect(ranges.attackRange).toBe(4);
    expect(ranges.acquireRange).toBeCloseTo(4 * 1.3, 5);
  });
});

describe('angela hero kit', () => {
  it('四槽位加载成功', () => {
    const skills = loadAngelaSkills();
    expect(skills).toHaveLength(4);
    expect(angelaSkillByHotkey('2')?.id).toBe('fireball');
  });

  it('普攻为索敌弹道，攻击距离为近身 2 倍', () => {
    const aa = angelaSkillByHotkey('0');
    expect(aa?.hit).toEqual({ kind: 'target', range: 4 });
    expect(aa?.damage).toBeUndefined();
    const ranges = getAngelaAutoAttackRanges();
    expect(ranges.attackRange).toBe(4);
    expect(ranges.acquireRange).toBeCloseTo(4 * 1.3, 5);
  });
});

describe('hero registry', () => {
  it('英雄无关施法入口', () => {
    expect(heroSkillByHotkey('arthur', '1')?.id).toBe('shield-of-pact');
    expect(heroSkillByHotkey('daji', '1')?.id).toBe('charm-missile');
    expect(heroSkillByHotkey('angela', '2')?.id).toBe('fireball');
  });
});

describe('ranged auto-attack projectile', () => {
  it('妲己普攻出手生成追踪弹道', () => {
    const player = makePlayer({ x: 0, z: 0 });
    const dummy = createPracticeDummy();
    dummy.position = { x: 0, z: -3 };
    const session = createPracticeSession({
      playerUnit: player,
      dummyUnit: dummy,
      heroId: 'daji',
    });

    expect(session.requestAutoAttack()).toBe(true);

    const dt = 1 / 60;
    session.preTick({
      dt,
      manualMove: false,
      playerX: 0,
      playerZ: 0,
    });
    session.postTick({ dt, playerX: 0, playerZ: 0, facingRad: 0 });

    const projectile = [...session.world.effects.values()].find(
      (e) => e.kind === 'projectile',
    );
    expect(projectile).toBeDefined();
    expect(projectile?.skillId).toBe('auto-attack');
  });
});
