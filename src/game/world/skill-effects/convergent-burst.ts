// 汇聚弹道调度器:多枚弹道在施法者身后扇形齐射,航向穿过 CastSnapshot.targetPoint(交汇点,非灭点)。
import type { CastSnapshot, Team } from '../../skills/types';
import type { Vec2 } from '../../skills/vec2';
import { vec2Len, vec2Normalize, vec2Sub } from '../../skills/vec2';
import { spawnProjectile } from './spawn';
import {
  nextEffectId,
  type EffectTickContext,
  type SkillEffectEntity,
} from './types';

/** 身后生成距离(世界单位 ≈ 一身位多,保证扇形可见分离) */
export const CONVERGENT_SPAWN_BACK_OFFSET = 1.6;

export interface ConvergentBurstConfig {
  readonly snapshot: CastSnapshot;
  readonly sourceTeam: Team;
  readonly projectileCount: number;
  readonly projectileSpeed: number;
  readonly travelDistance: number;
  readonly fanHalfAngle: number;
  readonly spawnInterval: number;
  readonly collisionRadius: number;
  readonly damage: number;
  /** 身后扇形半径;缺省一身位 */
  readonly spawnBackOffset?: number;
}

export interface ConvergentBurstEffect extends SkillEffectEntity {
  readonly kind: 'convergent-burst';
}

/**
 * 计算汇聚弹道起点:以施法者身后 spawnBackOffset 处为弧心,
 * 在垂直于施法朝向的横向按扇形排开(端点半宽 = offset * tan(fanHalfAngle)),
 * 略向后弯成弧,避免五球起点重叠成一团。
 */
export function computeConvergentSpawnPoints(
  convergencePoint: Vec2,
  casterPos: Vec2,
  spawnBackOffset: number,
  fanHalfAngle: number,
  count: number,
): Vec2[] {
  if (count < 1) return [];
  const toP = vec2Sub(convergencePoint, casterPos);
  let forward = vec2Normalize(toP);
  if (vec2Len(toP) < 1e-6) {
    forward = { x: 0, z: -1 };
  }
  // 右手系 XZ:forward=(fx,fz) → right=(-fz, fx)
  const right = { x: -forward.z, z: forward.x };
  const backCenter = {
    x: casterPos.x - forward.x * spawnBackOffset,
    z: casterPos.z - forward.z * spawnBackOffset,
  };
  const halfWidth = spawnBackOffset * Math.tan(fanHalfAngle);

  const points: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const lat = -halfWidth + t * 2 * halfWidth;
    // 轻微后掠:两侧比中心再退后一点,形成扇形弧
    const backExtra = (Math.abs(lat) / Math.max(halfWidth, 1e-6)) * spawnBackOffset * 0.25;
    points.push({
      x: backCenter.x + right.x * lat - forward.x * backExtra,
      z: backCenter.z + right.z * lat - forward.z * backExtra,
    });
  }
  return points;
}

function resolveConvergencePoint(config: ConvergentBurstConfig): Vec2 {
  if (config.snapshot.targetPoint) {
    return {
      x: config.snapshot.targetPoint.x,
      z: config.snapshot.targetPoint.z,
    };
  }
  const origin = config.snapshot.origin;
  const rad = config.snapshot.forwardRad;
  const d = Math.min(config.travelDistance, 7);
  return {
    x: origin.x + Math.sin(rad) * d,
    z: origin.z - Math.cos(rad) * d,
  };
}

export function createConvergentBurst(
  config: ConvergentBurstConfig,
): ConvergentBurstEffect {
  const id = nextEffectId('convergent-burst');
  const convergencePoint = resolveConvergencePoint(config);
  const spawnBackOffset = config.spawnBackOffset ?? CONVERGENT_SPAWN_BACK_OFFSET;
  const spawnPoints = computeConvergentSpawnPoints(
    convergencePoint,
    config.snapshot.origin,
    spawnBackOffset,
    config.fanHalfAngle,
    config.projectileCount,
  );
  const total = spawnPoints.length;
  let spawned = false;

  function spawnAt(ctx: EffectTickContext, index: number): void {
    const origin = spawnPoints[index];
    if (!origin) return;
    const dx = convergencePoint.x - origin.x;
    const dz = convergencePoint.z - origin.z;
    const pathLen = Math.hypot(dx, dz);
    const forwardRad =
      pathLen < 1e-6
        ? config.snapshot.forwardRad
        : Math.atan2(dx, -dz);
    // targetPoint 是航线交汇点:弹道穿过后继续飞,用 travelDistance 作为寿命路程
    ctx.world.spawnEffect(
      spawnProjectile({
        ownerId: config.snapshot.casterId,
        sourceTeam: config.sourceTeam,
        skillId: config.snapshot.skillId,
        origin,
        forwardRad,
        speed: config.projectileSpeed,
        maxRange: config.travelDistance,
        collisionRadius: config.collisionRadius,
        damage: { amount: config.damage },
        hitPolicy: { maxHits: 1 },
      }),
    );
  }

  const entity: ConvergentBurstEffect = {
    id,
    ownerId: config.snapshot.casterId,
    sourceTeam: config.sourceTeam,
    skillId: config.snapshot.skillId,
    kind: 'convergent-burst',
    expired: false,
    tick(_dt, ctx) {
      if (entity.expired) return [];
      // 齐射:当帧一次生成全部弹道
      if (!spawned) {
        for (let i = 0; i < total; i++) {
          spawnAt(ctx, i);
        }
        spawned = true;
        entity.expired = true;
      }
      return [];
    },
  };

  return entity;
}
