import { describe, expect, it } from 'vitest';
import { aimForwardFromInput } from '../../src/game/input/aim-forward';

describe('aimForwardFromInput', () => {
  it('无输入时保留当前朝向', () => {
    expect(aimForwardFromInput({ x: 0, y: 0 }, 1.2)).toBe(1.2);
  });

  it('WASD 上方向对应世界 -Z (0)', () => {
    expect(aimForwardFromInput({ x: 0, y: -1 }, 0)).toBeCloseTo(0, 5);
  });

  it('D 键对应世界 +X (π/2)', () => {
    expect(aimForwardFromInput({ x: 1, y: 0 }, 0)).toBeCloseTo(Math.PI / 2, 5);
  });

  it('摇杆右下象限', () => {
    const rad = aimForwardFromInput({ x: 1, y: 1 }, 0);
    expect(rad).toBeCloseTo((3 * Math.PI) / 4, 5);
  });
});
