// proposal-v2.md §3 G1 闸口
// 坐标系转换:连续世界单位 (x, z) ↔ 离散寻路格 (i, j)
//
// 设计要点:
//  - tileSize = 1,与 map-design.md:44 对齐(后续可参数化,现在固定 1)
//  - 原点约定:世界 (0, 0) 对应格 (0, 0);不偏移(后续 P2 加载 map.yaml 时
//    可以扩展为带 (originX, originZ) 的 affine 转换)
//  - 转换用 floor 而不是 round:让"世界 +0.5 → 格 0"和"世界 -0.5 → 格 -1"
//    行为一致(左闭右开),便于碰撞/寻路
//  - inBounds 用半开区间 [0, width) × [0, height):与 floor 转换自洽

export const TILE_SIZE = 1;

export interface TileCoord {
  i: number;
  j: number;
}

export interface MapSize {
  width: number;
  height: number;
}

/** 连续世界坐标 (x, z) → 离散格坐标 (i, j)。x 向右, z 向深处(世界 z 正向) */
export function worldToTile(x: number, z: number): TileCoord {
  return {
    i: Math.floor(x / TILE_SIZE),
    j: Math.floor(z / TILE_SIZE),
  };
}

/** 离散格坐标 (i, j) → 连续世界坐标(格中心) */
export function tileToWorld(i: number, j: number): { x: number; z: number } {
  return {
    x: i * TILE_SIZE + TILE_SIZE / 2,
    z: j * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** 格 (i, j) 是否在地图 [0, width) × [0, height) 内 */
export function inBounds(coord: TileCoord, size: MapSize): boolean {
  return (
    coord.i >= 0 &&
    coord.j >= 0 &&
    coord.i < size.width &&
    coord.j < size.height
  );
}
