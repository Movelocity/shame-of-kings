// M2 T2.2:5 类命中盒(proposal §5.2 锁的最小集合)
// 纯函数,无副作用,独立单测。
//
// 约定:世界坐标 (x, z),x 向右、z 向深处(玩家前 = world -Z = 0 弧度)。
// 所有命中盒以"施法者"为基准;targeting 测试:单位中心是否在盒内。
//
// 与 M3 / P2 的关系:
//  - M3 T3.2 PracticeDummy 与 T3.1 亚瑟共用(本文件无 Unit 引用)
//  - P2 T5C.3 VisionSystem 把 hit.target 拿去做 canSee 过滤,
//    所以本文件不内置视野判断;留给 DamageFormula。
import type { Hit, HitShape, Unit, WorldLike } from './types';
import type { Vec2 } from './vec2';

/** self: 命中施法者自身(主要给治疗 / 增益类技能用) */
export function hitSelf(caster: Unit, origin: Vec2 = caster.position): readonly Hit[] {
  return [{ target: caster, origin, forwardRad: 0 }];
}

/** circle: 以 origin 为圆心,radius 范围内的所有目标 */
export function hitCircle(
  world: WorldLike,
  caster: Unit,
  shape: Extract<HitShape, { kind: 'circle' }>,
  origin: Vec2 = caster.position,
): readonly Hit[] {
  const candidates = world.unitsNear(origin, shape.radius);
  const hits: Hit[] = [];
  for (const u of candidates) {
    if (u.id === caster.id) continue;
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
  shape: Extract<HitShape, { kind: 'rect' }>,
  forwardRad: number,
  origin: Vec2 = caster.position,
): readonly Hit[] {
  const candidates = world.unitsNear(origin, shape.halfDepth + shape.halfWidth);
  // forward 单位向量(f=0 → (0, -1));right 单位向量(f=0 → (-1, 0))
  const fx = Math.sin(forwardRad);
  const fz = -Math.cos(forwardRad);
  const rx = -Math.cos(forwardRad);
  const rz = -Math.sin(forwardRad);
  const hits: Hit[] = [];
  for (const u of candidates) {
    if (u.id === caster.id) continue;
    const dx = u.position.x - origin.x;
    const dz = u.position.z - origin.z;
    // localZ = 点积(d, forward);localX = 点积(d, right)
    // 矩形是"前方的 AABB",localZ 必须 ≥ 0 才算命中(后方不命中)
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
  shape: Extract<HitShape, { kind: 'cone' }>,
  forwardRad: number,
  origin: Vec2 = caster.position,
): readonly Hit[] {
  const candidates = world.unitsNear(origin, shape.range);
  const hits: Hit[] = [];
  // Math.cos(π/2) 浮点误差 ≈ 6e-17,会误判"半角 90° 不命中"。
  // 同时 cos(45°) 也有 ~1e-16 误差会让边缘样本漏掉;统一夹 1e-9 容差
  const rawCos = Math.cos(shape.halfAngleRad);
  const cosThreshold = rawCos < 0 ? 0 : Math.max(0, rawCos - 1e-9);
  // forward 单位向量(f=0 → (0, -1))
  const fx = Math.sin(forwardRad);
  const fz = -Math.cos(forwardRad);
  for (const u of candidates) {
    if (u.id === caster.id) continue;
    const dx = u.position.x - origin.x;
    const dz = u.position.z - origin.z;
    const dist = Math.hypot(dx, dz);
    if (dist > shape.range || dist < 1e-6) continue;
    // 点积(d, forward) / |d| = cosAngle
    const cosAngle = (dx * fx + dz * fz) / dist;
    if (cosAngle >= cosThreshold) {
      hits.push({ target: u, origin, forwardRad });
    }
  }
  return hits;
}

/** target: 锁定距离内最近的目标(单一命中) */
export function hitTarget(
  world: WorldLike,
  caster: Unit,
  shape: Extract<HitShape, { kind: 'target' }>,
  origin: Vec2 = caster.position,
): readonly Hit[] {
  const candidates = world.unitsNear(origin, shape.range);
  let best: { unit: Unit; dist: number } | null = null;
  for (const u of candidates) {
    if (u.id === caster.id) continue;
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

/** 统一入口:按 HitShape 分派。M2 阶段 T2.4 调试技能和 M3 亚瑟都用它
 *  forwardRad 由调用方传(从 SkillInstance.forwardRad 来),不放在 shape 上
 *  是为了让 HitShape 保持"静态配置"语义,避免每次施法都要克隆 shape。 */
export function resolveHits(
  world: WorldLike,
  caster: Unit,
  shape: HitShape,
  forwardRad: number,
  originOverride?: Vec2,
): readonly Hit[] {
  const origin = originOverride ?? caster.position;
  switch (shape.kind) {
    case 'self':
      return hitSelf(caster, origin);
    case 'circle':
      return hitCircle(world, caster, shape, origin);
    case 'rect':
      return hitRect(world, caster, shape, forwardRad, origin);
    case 'cone':
      return hitCone(world, caster, shape, forwardRad, origin);
    case 'target':
      return hitTarget(world, caster, shape, origin);
  }
}
