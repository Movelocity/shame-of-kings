import { describe, expect, it } from 'vitest';
import {
  beginAimingSession,
  cancelAimingSession,
  clampTargetPointToRange,
  createAimingSession,
  isAiming,
  updateAimingSession,
} from '../../src/game/input/cast-aiming';
import type { Skill } from '../../src/game/skills/types';

function stubSkill(): Skill {
  return {
    id: 'area-skill',
    displayName: 'Area',
    hit: { kind: 'circle', radius: 7 },
    displacement: 'none',
    castTime: 0,
    activeTime: 0.1,
    recoveryTime: 0.1,
    cooldown: 1,
  };
}

describe('cast-aiming area', () => {
  it('begin 初始化 aimTargetPoint 为 null', () => {
    const session = createAimingSession();
    beginAimingSession(session, {
      slotHotkey: '1',
      skill: stubSkill(),
      aimKind: 'area',
      initialForwardRad: 0,
    });
    expect(isAiming(session)).toBe(true);
    expect(session.aimTargetPoint).toBeNull();
  });

  it('范围内 targetPoint 不被钳制', () => {
    const session = createAimingSession();
    beginAimingSession(session, {
      slotHotkey: '1',
      skill: stubSkill(),
      aimKind: 'area',
      initialForwardRad: 0,
    });
    updateAimingSession(session, {
      targetPoint: { x: 3, z: -4 },
      origin: { x: 0, z: 0 },
      maxRange: 7,
    });
    expect(session.aimTargetPoint).toEqual({ x: 3, z: -4 });
  });

  it('超出 maxRange 时钳制到边界', () => {
    const session = createAimingSession();
    beginAimingSession(session, {
      slotHotkey: '1',
      skill: stubSkill(),
      aimKind: 'area',
      initialForwardRad: 0,
    });
    updateAimingSession(session, {
      targetPoint: { x: 0, z: -10 },
      origin: { x: 0, z: 0 },
      maxRange: 7,
    });
    expect(session.aimTargetPoint).not.toBeNull();
    expect(session.aimTargetPoint!.x).toBeCloseTo(0, 5);
    expect(session.aimTargetPoint!.z).toBeCloseTo(-7, 5);
  });

  it('cancel 清空 aimTargetPoint', () => {
    const session = createAimingSession();
    beginAimingSession(session, {
      slotHotkey: '1',
      skill: stubSkill(),
      aimKind: 'area',
      initialForwardRad: 0,
    });
    updateAimingSession(session, {
      targetPoint: { x: 1, z: -1 },
      origin: { x: 0, z: 0 },
      maxRange: 7,
    });
    cancelAimingSession(session);
    expect(session.aimTargetPoint).toBeNull();
    expect(isAiming(session)).toBe(false);
  });

  it('clampTargetPointToRange 纯函数', () => {
    const clamped = clampTargetPointToRange({ x: 0, z: 0 }, { x: 10, z: 0 }, 7);
    expect(clamped.x).toBeCloseTo(7, 5);
    expect(clamped.z).toBeCloseTo(0, 5);
  });
});
