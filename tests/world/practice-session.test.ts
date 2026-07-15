// practice-session:reset 不变量 + 热键 cast 可启动 instance
import { describe, expect, it } from 'vitest';
import { ARTHUR_DATA } from '../../src/game/heroes/arthur';
import { createPracticeDummy, PRACTICE_DUMMY_REGEN_PER_SEC } from '../../src/game/units/practice-dummy';
import { createPracticeSession } from '../../src/game/world/practice-session';
import type { Unit } from '../../src/game/skills/types';

function makePlayer(spawn = { x: 2, z: 10 }): Unit {
  return {
    id: 'player',
    team: 'blue',
    position: { x: spawn.x, z: spawn.z },
    hp: ARTHUR_DATA.stats.hpMax,
    hpMax: ARTHUR_DATA.stats.hpMax,
    isStatic: false,
    facingRad: 0.5,
    hidden: { inBush: false, outOfVisionFrom: new Set<string>() },
  };
}

describe('createPracticeSession', () => {
  it('resetWorld 恢复满血、清 CD/buff/普攻意图', () => {
    const player = makePlayer();
    const dummy = createPracticeDummy();
    const session = createPracticeSession({ playerUnit: player, dummyUnit: dummy });

    dummy.hp = 400;
    session.tryCastHotkey('1');
    expect(session.skillBook.active).not.toBeNull();
    session.buffs.apply({
      id: 'ms',
      kind: 'moveSpeed',
      value: 0.4,
      duration: 3,
    });
    session.requestAutoAttack();
    expect(session.buffs.active.length).toBeGreaterThan(0);

    session.resetWorld();

    expect(dummy.hp).toBe(dummy.hpMax);
    expect(session.skillBook.active).toBeNull();
    expect(session.buffs.active).toHaveLength(0);
    expect(session.buffs.moveSpeedMultiplier()).toBe(1);
    expect(session.dummyUnit.cc).toBeUndefined();
  });

  it('tryCastHotkey 在 CD 允许时启动 SkillInstance', () => {
    const session = createPracticeSession({ playerUnit: makePlayer() });

    const started = session.tryCastHotkey('1');
    expect(started).toBe(true);
    expect(session.skillBook.active).not.toBeNull();
    expect(session.skillBook.active?.skill.id).toBe('shield-of-pact');
  });

  it('普攻一次出手在 active/recovery 多帧内只扣一次血', () => {
    const player = makePlayer({ x: 0, z: -1.5 });
    const dummy = createPracticeDummy();
    const session = createPracticeSession({ playerUnit: player, dummyUnit: dummy });
    const aaDamage =
      ARTHUR_DATA.skills.find((s) => s.id === 'auto-attack')?.effect.damage ?? 0;

    session.requestAutoAttack();

    const hpBefore = dummy.hp;
    const dt = 1 / 60;
    const frameCount = 20;
    for (let i = 0; i < frameCount; i++) {
      session.preTick({
        dt,
        manualMove: false,
        playerX: player.position.x,
        playerZ: player.position.z,
      });
      session.postTick({
        dt,
        playerX: player.position.x,
        playerZ: player.position.z,
        facingRad: 0,
      });
    }

    const regenAmount = PRACTICE_DUMMY_REGEN_PER_SEC * dt * frameCount;
    expect(hpBefore - dummy.hp).toBeCloseTo(aaDamage - regenAmount, 5);
  });

  it('postTick 在固定 dt 下可推进技能阶段', () => {
    const session = createPracticeSession({ playerUnit: makePlayer() });
    session.tryCastHotkey('1');

    session.preTick({
      dt: 1 / 60,
      manualMove: false,
      playerX: 2,
      playerZ: 10,
    });
    session.postTick({
      dt: 1 / 60,
      playerX: 2,
      playerZ: 10,
      facingRad: 0,
    });

    expect(session.skillBook.active?.phase).not.toBe('done');
  });

  it('木人桩未满血时每帧自动回血', () => {
    const session = createPracticeSession({ playerUnit: makePlayer() });
    const dummy = session.dummyUnit;
    dummy.hp = 500;

    session.postTick({
      dt: 1,
      playerX: 2,
      playerZ: 10,
      facingRad: 0,
    });

    expect(dummy.hp).toBe(500 + PRACTICE_DUMMY_REGEN_PER_SEC);
  });

  it('木人桩 hp 归零时从世界移除', () => {
    const session = createPracticeSession({ playerUnit: makePlayer() });
    const dummy = session.dummyUnit;
    dummy.hp = 0;

    const post = session.postTick({
      dt: 1 / 60,
      playerX: 2,
      playerZ: 10,
      facingRad: 0,
    });

    expect(post.dummyRemoved).toBe(true);
    expect(session.world.getUnit(dummy.id)).toBeNull();
  });

  it('resetWorld 可恢复已死亡木人桩', () => {
    const session = createPracticeSession({ playerUnit: makePlayer() });
    const dummy = session.dummyUnit;
    dummy.hp = 0;
    session.postTick({
      dt: 1 / 60,
      playerX: 2,
      playerZ: 10,
      facingRad: 0,
    });
    expect(session.world.getUnit(dummy.id)).toBeNull();

    session.resetWorld();

    expect(session.world.getUnit(dummy.id)).toBe(dummy);
    expect(dummy.hp).toBe(dummy.hpMax);
  });
});
