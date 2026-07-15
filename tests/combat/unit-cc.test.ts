import { describe, expect, it } from 'vitest';
import {
  applyKnockup,
  clearCc,
  tickCc,
} from '../../src/game/combat/unit-cc';
import type { Unit } from '../../src/game/skills/types';

function mkUnit(id = 'dummy'): Unit {
  return {
    id,
    team: 'neutral',
    position: { x: 0, z: 0 },
    hp: 1000,
    hpMax: 1000,
    isStatic: true,
    facingRad: 0,
    hidden: { inBush: false, outOfVisionFrom: new Set() },
  };
}

describe('unit-cc', () => {
  it('applyKnockup 施加击飞状态', () => {
    const u = mkUnit();
    applyKnockup(u, 0.6);
    expect(u.cc?.kind).toBe('knockup');
    expect(u.cc?.remaining).toBeCloseTo(0.6, 5);
  });

  it('tickCc 递减 remaining,过期后清除', () => {
    const u = mkUnit();
    applyKnockup(u, 0.5);
    tickCc(u, 0.2);
    expect(u.cc?.remaining).toBeCloseTo(0.3, 5);
    tickCc(u, 0.4);
    expect(u.cc).toBeUndefined();
  });

  it('clearCc 立即清空', () => {
    const u = mkUnit();
    applyKnockup(u, 1.0);
    clearCc(u);
    expect(u.cc).toBeUndefined();
  });
});
