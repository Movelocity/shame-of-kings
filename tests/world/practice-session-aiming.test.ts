import { describe, expect, it } from 'vitest';
import { DAJI_DATA } from '../../src/game/heroes/daji';
import { ANGELA_DATA } from '../../src/game/heroes/angela';
import { ARTHUR_DATA } from '../../src/game/heroes/arthur';
import { createPracticeDummy } from '../../src/game/units/practice-dummy';
import { createPracticeSession } from '../../src/game/world/practice-session';
import type { Unit } from '../../src/game/skills/types';
import { DEFAULT_COLLISION_RADIUS } from '../../src/game/skills/types';

function makePlayer(spawn = { x: 0, z: 0 }, hpMax = ARTHUR_DATA.stats.hpMax): Unit {
  return {
    id: 'player',
    team: 'blue',
    position: { x: spawn.x, z: spawn.z },
    hp: hpMax,
    hpMax,
    isStatic: false,
    collisionRadius: DEFAULT_COLLISION_RADIUS,
    facingRad: 0,
    hidden: { inBush: false, outOfVisionFrom: new Set<string>() },
  };
}

describe('practice-session aiming', () => {
  it('瞄准中 skillBook.active 为 null', () => {
    const session = createPracticeSession({ playerUnit: makePlayer() });
    expect(session.beginAim('1')).toBe(true);
    expect(session.skillBook.active).toBeNull();
    expect(session.getAimingPreview()?.skill.id).toBe('shield-of-pact');
  });

  it('commitAim 后才开始施法', () => {
    const session = createPracticeSession({ playerUnit: makePlayer() });
    session.beginAim('1');
    expect(session.commitAim()).toBe(true);
    expect(session.skillBook.active?.skill.id).toBe('shield-of-pact');
    expect(session.getAimingPreview()).toBeNull();
  });

  it('cancelAim 不施法且 CD 未启动', () => {
    const session = createPracticeSession({ playerUnit: makePlayer() });
    session.beginAim('1');
    session.cancelAim();
    expect(session.skillBook.active).toBeNull();
    expect(session.skillBook.cooldownRemaining('shield-of-pact')).toBe(0);
  });

  it('瞄准期 updateAim 可改变方向', () => {
    const session = createPracticeSession({
      playerUnit: makePlayer(),
      heroId: 'angela',
    });
    // 安琪拉二技能仍为 direction
    session.beginAim('2');
    session.updateAim({ x: 1, y: 0 });
    expect(session.getAimingPreview()?.aimForwardRad).toBeCloseTo(Math.PI / 2, 5);
  });

  it('area 瞄准 begin → updateAim(targetPoint) → commit 写入 CastSnapshot.targetPoint', () => {
    const session = createPracticeSession({
      playerUnit: makePlayer({ x: 0, z: 0 }, ANGELA_DATA.stats.hpMax),
      heroId: 'angela',
    });
    expect(session.beginAim('1')).toBe(true);
    expect(session.getAimingPreview()?.aimKind).toBe('area');
    expect(session.getAimingPreview()?.aimTargetPoint).toBeNull();
    session.updateAim({ x: 0, y: 0 }, { targetPoint: { x: 3, z: -5 } });
    expect(session.getAimingPreview()?.aimTargetPoint).toEqual({ x: 3, z: -5 });
    expect(session.commitAim()).toBe(true);
    expect(session.skillBook.active?.skill.id).toBe('flame-burst');
    expect(session.skillBook.active?.castSnapshot?.targetPoint).toEqual({
      x: 3,
      z: -5,
    });
  });

  it('area 瞄准无 targetPoint 时 commit 失败', () => {
    const session = createPracticeSession({
      playerUnit: makePlayer({ x: 0, z: 0 }, ANGELA_DATA.stats.hpMax),
      heroId: 'angela',
    });
    session.beginAim('1');
    expect(session.commitAim()).toBe(false);
    expect(session.skillBook.active).toBeNull();
    expect(session.skillBook.cooldownRemaining('flame-burst')).toBe(0);
  });

  it('lock-target 无目标时 commit 失败', () => {
    const player = makePlayer({ x: 0, z: 20 }, DAJI_DATA.stats.hpMax);
    const session = createPracticeSession({
      playerUnit: player,
      heroId: 'daji',
    });
    session.beginAim('2');
    expect(session.commitAim()).toBe(false);
    expect(session.skillBook.active).toBeNull();
    expect(session.skillBook.cooldownRemaining('fox-fire')).toBe(0);
  });

  it('lock-target 有目标时 commit 含 targetId', () => {
    const player = makePlayer({ x: 0, z: 0 }, DAJI_DATA.stats.hpMax);
    const dummy = createPracticeDummy();
    dummy.position = { x: 0, z: -5 };
    const session = createPracticeSession({
      playerUnit: player,
      dummyUnit: dummy,
      heroId: 'daji',
    });
    session.beginAim('2');
    session.updateAim({ x: 0, y: 0 });
    expect(session.getAimingPreview()?.previewTargetId).toBe(dummy.id);
    expect(session.commitAim()).toBe(true);
    expect(session.skillBook.active?.castSnapshot?.targetId).toBe(dummy.id);
  });

  it('妲己一技能 direction 提交后 snapshot 无 targetId', () => {
    const player = makePlayer({ x: 0, z: 0 }, DAJI_DATA.stats.hpMax);
    const session = createPracticeSession({
      playerUnit: player,
      heroId: 'daji',
    });
    session.beginAim('1');
    session.updateAim({ x: 1, y: 0 });
    expect(session.commitAim()).toBe(true);
    expect(session.skillBook.active?.castSnapshot?.targetId).toBeUndefined();
    expect(session.skillBook.active?.castSnapshot?.forwardRad).toBeCloseTo(
      Math.PI / 2,
      5,
    );
  });

  it('瞄准期 preTick 抑制移动', () => {
    const session = createPracticeSession({ playerUnit: makePlayer() });
    session.beginAim('2');
    const pre = session.preTick({
      dt: 1 / 60,
      manualMove: true,
      playerX: 0,
      playerZ: 0,
    });
    expect(pre.suppressManualMove).toBe(true);
  });
});

describe('hero aimKind config', () => {
  it('亚瑟全技能 aimKind 为 none', () => {
    for (const skill of ARTHUR_DATA.skills) {
      expect(skill.aimKind ?? 'none').toBe('none');
    }
  });

  it('安琪拉一技能 area，二/三技能 direction', () => {
    expect(ANGELA_DATA.skills.find((s) => s.hotkey === '1')?.aimKind).toBe('area');
    expect(ANGELA_DATA.skills.find((s) => s.hotkey === '2')?.aimKind).toBe('direction');
    expect(ANGELA_DATA.skills.find((s) => s.hotkey === '3')?.aimKind).toBe('direction');
  });

  it('妲己 1 direction、2/3 lock-target', () => {
    expect(DAJI_DATA.skills.find((s) => s.hotkey === '1')?.aimKind).toBe('direction');
    expect(DAJI_DATA.skills.find((s) => s.hotkey === '2')?.aimKind).toBe('lock-target');
    expect(DAJI_DATA.skills.find((s) => s.hotkey === '3')?.aimKind).toBe('lock-target');
  });
});
