// M2 T2.2:5 类命中盒(proposal §5.2 锁的最小集合)
// 纯函数,无副作用,独立单测。
//
// 约定:世界坐标 (x, z),x 向右、z 向深处(玩家前 = world -Z = 0 弧度)。
// 所有命中盒以"施法者"为基准;targeting 测试:单位中心是否在盒内。
//
// 与 M3 / P2 的关系:
//  - M3 T3.2 PracticeDummy 与 T3.1 亚瑟共用(本文件无 Unit 引用)
//  - P2 T5C.3 VisionSystem 把 hit.target 拿去做 canSee 过滤,
//    所以本文件不内置视野判断;留给 settlement。
import { filterTargets } from '../combat/target-filter';
import type { Hit, HitGeometry, TargetFilter, Unit, WorldLike } from './types';
import type { Vec2 } from './vec2';

export interface ResolveHitsOptions {
  origin?: Vec2;
  filter?: TargetFilter;
  /** 锁定目标 id;hitTarget 优先使用,不重新最近邻 */
  lockedTargetId?: string;
}

function eligible(
  candidates: readonly Unit[],
  caster: Unit,
  filter: TargetFilter | undefined,
): Unit[] {
  if (filter) return filterTargets(candidates, filter);
  return candidates.filter((u) => u.id !== caster.id);
}

/** self: 命中施法者自身(主要给治疗 / 增益类技能用) */
export function hitSelf(caster: Unit, origin: Vec2 = caster.position): readonly Hit[] {
  return [{ target: caster, origin, forwardRad: 0 }];
}

/** circle: 以 origin 为圆心,radius 范围内的所有目标 */
export function hitCircle(
  world: WorldLike,
  caster: Unit,
  shape: Extract<HitGeometry, { kind: 'circle' }>,
  origin: Vec2 = caster.position,
  filter?: TargetFilter,
): readonly Hit[] {
  const candidates = eligible(world.unitsNear(origin, shape.radius), caster, filter);
  const hits: Hit[] = [];
  for (const u of candidates) {
    const dx = u.position.x - origin.x;
    const dz = u.position.z - origin.z;
    if (dx * dx + dz * dz <= shape.radius * shape.radius) {
      hits.push({
        target: u,
        origin,
        forwardRad: 0,
      });
    }
  }
  return hits;
}

/** rect: 矩形 AABB,沿施法者朝向 forwardRad。
 *  中心在 caster 位置;halfDepth 沿 forward 方向、halfWidth 沿左/右。
 *  约定:forwardRad=0 ≡ 世界 -Z(玩家前方);localZ 正向 = forward 方向。 */
export function hitRect(
  world: WorldLike,
  caster: Unit,
  shape: Extract<HitGeometry, { kind: 'rect' }>,
  forwardRad: number,
  origin: Vec2 = caster.position,
  filter?: TargetFilter,
): readonly Hit[] {
  const candidates = eligible(
    world.unitsNear(origin, shape.halfDepth + shape.halfWidth),
    caster,
    filter,
  );
  const fx = Math.sin(forwardRad);
  const fz = -Math.cos(forwardRad);
  const rx = -Math.cos(forwardRad);
  const rz = -Math.sin(forwardRad);
  const hits: Hit[] = [];
  for (const u of candidates) {
    const dx = u.position.x - origin.x;
    const dz = u.position.z - origin.z;
    const localZ = dx * fx + dz * fz;
    const localX = dx * rx + dz * rz;
    if (
      localZ >= 0 &&
      localZ <= shape.halfDepth &&
      Math.abs(localX) <= shape.halfWidth
    ) {
      hits.push({ target: u, origin, forwardRad });
    }
  }
  return hits;
}

/** cone: 扇形,前方 + 半径 + 半角。计算"目标向量与 forward 夹角 ≤ halfAngle"
 *  约定:forwardRad=0 ≡ 世界 -Z */
export function hitCone(
  world: WorldLike,
  caster: Unit,
  shape: Extract<HitGeometry, { kind: 'cone' }>,
  forwardRad: number,
  origin: Vec2 = caster.position,
  filter?: TargetFilter,
): readonly Hit[] {
  const candidates = eligible(world.unitsNear(origin, shape.range), caster, filter);
  const hits: Hit[] = [];
  const rawCos = Math.cos(shape.halfAngleRad);
  const cosThreshold = rawCos < 0 ? 0 : Math.max(0, rawCos - 1e-9);
  const fx = Math.sin(forwardRad);
  const fz = -Math.cos(forwardRad);
  for (const u of candidates) {
    const dx = u.position.x - origin.x;
    const dz = u.position.z - origin.z;
    const dist = Math.hypot(dx, dz);
    if (dist > shape.range || dist < 1e-6) continue;
    const cosAngle = (dx * fx + dz * fz) / dist;
    if (cosAngle >= cosThreshold) {
      hits.push({ target: u, origin, forwardRad });
    }
  }
  return hits;
}

/** target: 锁定距离内最近的目标(单一命中);lockedTargetId 优先 */
export function hitTarget(
  world: WorldLike,
  caster: Unit,
  shape: Extract<HitGeometry, { kind: 'target' }>,
  origin: Vec2 = caster.position,
  filter?: TargetFilter,
  lockedTargetId?: string,
): readonly Hit[] {
  if (lockedTargetId) {
    const locked = world.unitsNear(origin, shape.range).find((u) => u.id === lockedTargetId);
    if (!locked) return [];
    if (filter && !filterTargets([locked], filter).length) return [];
    const dx = locked.position.x - origin.x;
    const dz = locked.position.z - origin.z;
    if (Math.hypot(dx, dz) > shape.range) return [];
    return [{ target: locked, origin, forwardRad: 0 }];
  }

  const candidates = eligible(world.unitsNear(origin, shape.range), caster, filter);
  let best: { unit: Unit; dist: number } | null = null;
  for (const u of candidates) {
    const dx = u.position.x - origin.x;
    const dz = u.position.z - origin.z;
    const dist = Math.hypot(dx, dz);
    if (dist > shape.range) continue;
    if (best === null || dist < best.dist) {
      best = { unit: u, dist };
    }
  }
  return best ? [{ target: best.unit, origin, forwardRad: 0 }] : [];
}

/** 统一入口:按 HitGeometry 分派 */
export function resolveHits(
  world: WorldLike,
  caster: Unit,
  shape: HitGeometry,
  forwardRad: number,
  options: ResolveHitsOptions = {},
): readonly Hit[] {
  const origin = options.origin ?? caster.position;
  const filter = options.filter;
  const lockedTargetId = options.lockedTargetId;
  switch (shape.kind) {
    case 'self':
      return hitSelf(caster, origin);
    case 'circle':
      return hitCircle(world, caster, shape, origin, filter);
    case 'rect':
      return hitRect(world, caster, shape, forwardRad, origin, filter);
    case 'cone':
      return hitCone(world, caster, shape, forwardRad, origin, filter);
    case 'target':
      return hitTarget(world, caster, shape, origin, filter, lockedTargetId);
  }
}
