import type { Unit } from '../../skills/types';
import type { Vec2 } from '../../skills/vec2';

/** 线段与圆(hurtbox)最近距离 */
export function segmentCircleDistance(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  radius: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const acx = cx - ax;
  const acz = cz - az;
  const abLenSq = abx * abx + abz * abz;
  if (abLenSq < 1e-12) {
    return Math.hypot(cx - ax, cz - az) - radius;
  }
  const t = Math.max(0, Math.min(1, (acx * abx + acz * abz) / abLenSq));
  const px = ax + abx * t;
  const pz = az + abz * t;
  return Math.hypot(cx - px, cz - pz) - radius;
}

/** 胶囊扫掠:previous→current 与目标 hurtbox 是否相交 */
export function sweptHitsTarget(
  previous: Vec2,
  current: Vec2,
  projectileRadius: number,
  target: Unit,
): boolean {
  const dist = segmentCircleDistance(
    previous.x,
    previous.z,
    current.x,
    current.z,
    target.position.x,
    target.position.z,
    target.collisionRadius + projectileRadius,
  );
  return dist <= 1e-6;
}
