// proposal-v2.md §3 G1 闸口
// coords.ts 单元测试:覆盖 floor 转换语义、半开区间、对称翻转(给后续 P2 镜像生成用)
import { describe, expect, it } from 'vitest';
import { inBounds, tileToWorld, worldToTile } from '../../src/game/world/coords';

describe('worldToTile', () => {
  it('正格内:整数坐标映射到自己', () => {
    expect(worldToTile(0, 0)).toEqual({ i: 0, j: 0 });
    expect(worldToTile(1, 1)).toEqual({ i: 1, j: 1 });
    expect(worldToTile(3, 5)).toEqual({ i: 3, j: 5 });
  });

  it('左闭右开:格边界 0/1/2 的归属', () => {
    // 约定:格 i 占据世界 [i, i+1)
    expect(worldToTile(0, 0)).toEqual({ i: 0, j: 0 });
    expect(worldToTile(0.999, 0.999)).toEqual({ i: 0, j: 0 });
    expect(worldToTile(1, 1)).toEqual({ i: 1, j: 1 });
  });

  it('负坐标:floor 把 -0.5 落到 -1,0 落到 0', () => {
    expect(worldToTile(-0.5, -0.5)).toEqual({ i: -1, j: -1 });
    expect(worldToTile(-1, -1)).toEqual({ i: -1, j: -1 });
    expect(worldToTile(-3, -2)).toEqual({ i: -3, j: -2 });
  });

  it('对称翻转:把 (i, j) 翻到 (width-1-i, height-1-j) 后转换坐标', () => {
    // 给 P2 蓝方→红方镜像做契约测试:如果 A 在 (3, 4),镜像到 (6, 5) 应当等价于
    // "A 的世界坐标 (3.5, 4.5) 翻成 (sizeW - 3.5, sizeH - 4.5)"的格坐标。
    const sizeW = 10;
    const sizeH = 10;
    const blue = worldToTile(3.5, 4.5); // 蓝方 (i=3, j=4)
    // 红方位置 = (sizeW - 3.5, sizeH - 4.5) = (6.5, 5.5)
    const red = worldToTile(sizeW - 3.5, sizeH - 4.5); // floor → (6, 5)
    expect({ i: sizeW - 1 - blue.i, j: sizeH - 1 - blue.j }).toEqual(red);
  });
});

describe('tileToWorld', () => {
  it('返回格中心(tileSize=1 时,格 i 中心 = i + 0.5)', () => {
    expect(tileToWorld(0, 0)).toEqual({ x: 0.5, z: 0.5 });
    expect(tileToWorld(3, 5)).toEqual({ x: 3.5, z: 5.5 });
    expect(tileToWorld(-2, -1)).toEqual({ x: -1.5, z: -0.5 });
  });

  it('worldToTile ∘ tileToWorld 不恒等(落到 floor 的格)', () => {
    // 给定世界 (3.7, 5.7) → 格 (3, 5) → 世界 (3.5, 5.5)
    const tile = worldToTile(3.7, 5.7);
    expect(tile).toEqual({ i: 3, j: 5 });
    expect(tileToWorld(tile.i, tile.j)).toEqual({ x: 3.5, z: 5.5 });
  });
});

describe('inBounds', () => {
  const size = { width: 10, height: 8 };

  it('内部格:true', () => {
    expect(inBounds({ i: 0, j: 0 }, size)).toBe(true);
    expect(inBounds({ i: 9, j: 7 }, size)).toBe(true);
    expect(inBounds({ i: 5, j: 4 }, size)).toBe(true);
  });

  it('边界:等于 width/height 时 false(半开区间)', () => {
    expect(inBounds({ i: 10, j: 0 }, size)).toBe(false);
    expect(inBounds({ i: 0, j: 8 }, size)).toBe(false);
  });

  it('越界:负坐标或超界 false', () => {
    expect(inBounds({ i: -1, j: 0 }, size)).toBe(false);
    expect(inBounds({ i: 0, j: -1 }, size)).toBe(false);
    expect(inBounds({ i: 100, j: 100 }, size)).toBe(false);
  });
});
