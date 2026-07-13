// proposal §5.1 单测覆盖:8 方位 + 静止 + 越界 → 应当换算成方向向量
import { describe, expect, it } from 'vitest';
import { computeJoystick, ZERO_JOYSTICK } from '../src/engine/input/joystick';

const BASE_X = 100;
const BASE_Y = 100; // (base 中心,屏幕坐标系,不需反转)
const R = 50; // base 半径

describe('computeJoystick', () => {
  it('thumb 在 base 中心 → 零向量', () => {
    expect(computeJoystick(BASE_X, BASE_Y, BASE_X, BASE_Y, R)).toEqual(ZERO_JOYSTICK);
  });

  it('8 方位(单位圆):严格的 ±1 和 ±1/√2', () => {
    const cases: { name: string; dx: number; dy: number; x: number; y: number }[] = [
      { name: '右', dx: R, dy: 0, x: 1, y: 0 },
      { name: '左上', dx: -R / Math.SQRT2, dy: -R / Math.SQRT2, x: -1 / Math.SQRT2, y: -1 / Math.SQRT2 },
      { name: '上', dx: 0, dy: -R, x: 0, y: -1 },
      { name: '右上', dx: R / Math.SQRT2, dy: -R / Math.SQRT2, x: 1 / Math.SQRT2, y: -1 / Math.SQRT2 },
      { name: '下', dx: 0, dy: R, x: 0, y: 1 },
      { name: '左下', dx: -R / Math.SQRT2, dy: R / Math.SQRT2, x: -1 / Math.SQRT2, y: 1 / Math.SQRT2 },
      { name: '左', dx: -R, dy: 0, x: -1, y: 0 },
      { name: '右下', dx: R / Math.SQRT2, dy: R / Math.SQRT2, x: 1 / Math.SQRT2, y: 1 / Math.SQRT2 },
    ];
    for (const c of cases) {
      const got = computeJoystick(BASE_X + c.dx, BASE_Y + c.dy, BASE_X, BASE_Y, R);
      expect(got.x, `x for ${c.name}`).toBeCloseTo(c.x, 10);
      expect(got.y, `y for ${c.name}`).toBeCloseTo(c.y, 10);
    }
  });

  it('越界(length > R):clamp 到单位圆', () => {
    // 越界 2 倍
    const dx = 2 * R;
    const dy = 0;
    const got = computeJoystick(BASE_X + dx, BASE_Y + dy, BASE_X, BASE_Y, R);
    expect(got.x).toBeCloseTo(1, 10);
    expect(got.y).toBeCloseTo(0, 10);
    // 越界对角线
    const got2 = computeJoystick(BASE_X + 3 * R, BASE_Y + 3 * R, BASE_X, BASE_Y, R);
    expect(Math.hypot(got2.x, got2.y)).toBeCloseTo(1, 10);
  });

  it('越界对角线:夹到长度 1 单位圆', () => {
    const got = computeJoystick(BASE_X + 100, BASE_Y + 100, BASE_X, BASE_Y, R);
    expect(Math.hypot(got.x, got.y)).toBeCloseTo(1, 10);
    // 单位圆上 45° → x = y
    expect(got.x).toBeCloseTo(got.y, 10);
  });

  it('baseRadius<=0 防退化', () => {
    expect(computeJoystick(150, 100, BASE_X, BASE_Y, 0)).toEqual(ZERO_JOYSTICK);
  });
});
