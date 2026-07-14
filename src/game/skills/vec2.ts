// 2D 向量(世界 x/z 平面),不依赖 Three.js
// proposal-v2.md §3 闸口:技能与坐标转换都用此类型,避免 skills 引入 three
export interface Vec2 {
  x: number;
  z: number;
}

export const ZERO_VEC2: Vec2 = { x: 0, z: 0 };

export function vec2(x: number, z: number): Vec2 {
  return { x, z };
}

export function vec2Add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z };
}

export function vec2Sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, z: a.z - b.z };
}

export function vec2Scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, z: a.z * s };
}

export function vec2Len(a: Vec2): number {
  return Math.hypot(a.x, a.z);
}

export function vec2Normalize(a: Vec2): Vec2 {
  const l = vec2Len(a);
  if (l < 1e-6) return ZERO_VEC2;
  return { x: a.x / l, z: a.z / l };
}
