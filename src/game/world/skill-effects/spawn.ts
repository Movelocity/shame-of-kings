import type { CastSnapshot, DamageSnapshot, Team } from '../../skills/types';
import type { Vec2 } from '../../skills/vec2';
import { createPersistentAreaEffect } from './persistent-area';
import { createProjectileEffect } from './projectile';
import { createSweptRectEffect } from './swept-rect';
import type {
  HitPolicy,
  OnTargetLostPolicy,
  PersistentAreaConfig,
  ProjectileConfig,
  SkillEffectEntity,
} from './types';

export interface SpawnProjectileParams {
  ownerId: string;
  sourceTeam: Team;
  skillId: string;
  origin: Vec2;
  forwardRad: number;
  speed: number;
  maxRange: number;
  collisionRadius?: number;
  homing?: boolean;
  onTargetLost?: OnTargetLostPolicy;
  hitPolicy?: HitPolicy;
  damage: DamageSnapshot;
  targetId?: string;
  spawnZoneOnExpire?: PersistentAreaConfig;
}

export function spawnProjectile(params: SpawnProjectileParams): SkillEffectEntity {
  const config: ProjectileConfig = {
    origin: params.origin,
    forwardRad: params.forwardRad,
    speed: params.speed,
    maxRange: params.maxRange,
    collisionRadius: params.collisionRadius ?? 0.3,
    homing: params.homing,
    onTargetLost: params.onTargetLost,
    hitPolicy: params.hitPolicy,
    damage: params.damage,
    targetId: params.targetId,
    spawnZoneOnExpire: params.spawnZoneOnExpire,
  };

  return createProjectileEffect(
    params.ownerId,
    params.sourceTeam,
    params.skillId,
    config,
  );
}

export interface ProjectileThenZoneParams {
  ownerId: string;
  sourceTeam: Team;
  skillId: string;
  origin: Vec2;
  forwardRad: number;
  projectile: {
    speed: number;
    maxRange: number;
    collisionRadius?: number;
    damage: DamageSnapshot;
    hitPolicy?: HitPolicy;
  };
  zone: PersistentAreaConfig;
}

export function spawnProjectileThenZone(params: ProjectileThenZoneParams): SkillEffectEntity {
  return spawnProjectile({
    ownerId: params.ownerId,
    sourceTeam: params.sourceTeam,
    skillId: params.skillId,
    origin: params.origin,
    forwardRad: params.forwardRad,
    speed: params.projectile.speed,
    maxRange: params.projectile.maxRange,
    collisionRadius: params.projectile.collisionRadius,
    damage: params.projectile.damage,
    hitPolicy: params.projectile.hitPolicy ?? { maxHits: 1 },
    spawnZoneOnExpire: params.zone,
  });
}

export function spawnPeriodicZone(
  ownerId: string,
  sourceTeam: Team,
  skillId: string,
  position: Vec2,
  config: PersistentAreaConfig,
): SkillEffectEntity {
  return createPersistentAreaEffect(ownerId, sourceTeam, skillId, position, config);
}

/** 从 CastSnapshot 构建多枚弹道 */
export function spawnProjectilesFromCast(
  snapshot: CastSnapshot,
  sourceTeam: Team,
  configs: readonly Omit<
    SpawnProjectileParams,
    'ownerId' | 'sourceTeam' | 'origin' | 'forwardRad' | 'targetId'
  >[],
): SkillEffectEntity[] {
  return configs.map((cfg) =>
    spawnProjectile({
      ...cfg,
      ownerId: snapshot.casterId,
      sourceTeam,
      origin: snapshot.origin,
      forwardRad: snapshot.forwardRad,
      targetId: snapshot.targetId,
    }),
  );
}

/** 从 CastSnapshot 生成脱手矩形剑气 */
export function spawnSweptRectFromCast(
  snapshot: CastSnapshot,
  sourceTeam: Team,
  skillId: string,
  params: {
    speed: number;
    maxRange: number;
    halfWidth: number;
    halfDepth: number;
    damage: DamageSnapshot;
  },
): SkillEffectEntity {
  return createSweptRectEffect(snapshot.casterId, sourceTeam, skillId, {
    speed: params.speed,
    maxRange: params.maxRange,
    halfWidth: params.halfWidth,
    halfDepth: params.halfDepth,
    damage: params.damage,
    origin: snapshot.origin,
    forwardRad: snapshot.forwardRad,
  });
}

/** 弹道过期时若配置了 zone,在撞击点生成持续区域 */
export function spawnZoneIfProjectileExpired(
  effect: SkillEffectEntity,
  world: { spawnEffect(e: SkillEffectEntity): void },
): void {
  if (!effect.expired || effect.kind !== 'projectile') return;
  const proj = effect as import('./projectile').ProjectileEffect;
  if (!proj.spawnZoneOnExpire) return;
  world.spawnEffect(
    createPersistentAreaEffect(
      effect.ownerId,
      effect.sourceTeam,
      effect.skillId,
      proj.getPosition(),
      proj.spawnZoneOnExpire,
    ),
  );
}
