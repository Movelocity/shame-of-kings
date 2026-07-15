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
    const aaDamage = ARTHUR_DATA.stats.attackDamage;

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

  it('无可锁目标时也能空放普攻', () => {
    const player = makePlayer({ x: 0, z: 20 });
    const session = createPracticeSession({ playerUnit: player });

    expect(session.requestAutoAttack()).toBe(true);
    expect(session.skillBook.active?.skill.id).toBe('auto-attack');
  });

  it('普攻只在攻击范围 1.3 倍内自动锁敌追击，超出则空 A', () => {
    const player = makePlayer({ x: 0, z: 0 });
    const dummy = createPracticeDummy();
    dummy.position = { x: 0, z: -3 };
    const session = createPracticeSession({ playerUnit: player, dummyUnit: dummy });

    expect(session.requestAutoAttack()).toBe(true);
    // 攻击距离 2，自动获取距离 2.6；3 单位处的目标不会建立追击意图。
    expect(session.skillBook.active?.skill.id).toBe('auto-attack');
    const pre = session.preTick({
      dt: 1 / 60,
      manualMove: false,
      playerX: 0,
      playerZ: 0,
    });
    expect(pre.moveTarget).toBeNull();
  });

  it('一技能本身不 dash，下一次普攻改为 dash 并消耗强化', () => {
    const player = makePlayer({ x: 0, z: 0 });
    const dummy = createPracticeDummy();
    dummy.position = { x: 0, z: -5 };
    const session = createPracticeSession({ playerUnit: player, dummyUnit: dummy });

    expect(session.tryCastHotkey('1')).toBe(true);
    session.postTick({ dt: 0.15, playerX: 0, playerZ: 0, facingRad: 0 });
    expect(player.position).toEqual({ x: 0, z: 0 });
    expect(session.heroState.skillEnhancements('auto-attack')).toHaveLength(1);

    // 让一技能结束，再请求锁敌普攻。
    session.postTick({ dt: 0.2, playerX: 0, playerZ: 0, facingRad: 0 });
    session.postTick({ dt: 0.2, playerX: 0, playerZ: 0, facingRad: 0 });
    expect(session.requestAutoAttack()).toBe(true);
    session.preTick({ dt: 1 / 60, manualMove: false, playerX: 0, playerZ: 0 });
    session.postTick({ dt: 1 / 60, playerX: 0, playerZ: 0, facingRad: 0 });

    expect(player.position.z).toBeLessThan(0);
    expect(session.skillBook.active?.skill.displacement).toBe('dash');
    expect(session.heroState.skillEnhancements('auto-attack')).toHaveLength(0);
  });

  it('英雄状态栈可将 dash 强化挂给任意技能并按次数消耗', () => {
    const player = makePlayer({ x: 0, z: 0 });
    const session = createPracticeSession({ playerUnit: player });
    session.heroState.applySkillEnhancement({
      id: 'test:s2-dash',
      sourceSkillId: 'test-source',
      targetSkillId: 'whirlwind-strike',
      duration: 5,
      charges: 1,
      effects: [
        {
          kind: 'dash',
          distance: 1.5,
          speed: 15,
          acquireRange: 1.5,
          targeting: 'forward',
        },
      ],
    });

    expect(session.tryCastHotkey('2')).toBe(true);
    expect(session.skillBook.active?.skill.displacement).toBe('dash');
    expect(session.skillBook.active?.skill.dashDistance).toBe(1.5);
    expect(session.skillBook.active?.skill.dashSpeed).toBe(15);
    expect(session.heroState.skillEnhancements('whirlwind-strike')).toHaveLength(0);
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
