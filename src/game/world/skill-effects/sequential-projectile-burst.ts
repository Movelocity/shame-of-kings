// 按间隔依次生成多枚弹道;首枚在 onActivate 当帧立即出手。
import type { CastSnapshot, Team } from '../../skills/types';
import { spawnProjectilesFromCast, type SpawnProjectileParams } from './spawn';
import {
  nextEffectId,
  type EffectTickContext,
  type SkillEffectEntity,
} from './types';

export interface SequentialProjectileBurstConfig {
  readonly snapshot: CastSnapshot;
  readonly sourceTeam: Team;
  readonly spawnInterval: number;
  readonly projectileConfigs: readonly Omit<
    SpawnProjectileParams,
    'ownerId' | 'sourceTeam' | 'origin' | 'forwardRad' | 'targetId'
  >[];
}

export interface SequentialProjectileBurstEffect extends SkillEffectEntity {
  readonly kind: 'projectile-burst';
}

export function createSequentialProjectileBurst(
  config: SequentialProjectileBurstConfig,
): SequentialProjectileBurstEffect {
  const id = nextEffectId('projectile-burst');
  const total = config.projectileConfigs.length;
  let spawned = 0;
  let elapsed = 0;

  function spawnNext(ctx: EffectTickContext, index: number): void {
    const entities = spawnProjectilesFromCast(
      config.snapshot,
      config.sourceTeam,
      [config.projectileConfigs[index]!],
    );
    for (const entity of entities) {
      ctx.world.spawnEffect(entity);
    }
  }

  const entity: SequentialProjectileBurstEffect = {
    id,
    castId: config.snapshot.castId,
    ownerId: config.snapshot.casterId,
    sourceTeam: config.sourceTeam,
    skillId: config.projectileConfigs[0]?.skillId ?? 'unknown',
    kind: 'projectile-burst',
    expired: false,
    tick(dt, ctx) {
      if (entity.expired) return [];

      if (spawned === 0) {
        spawnNext(ctx, 0);
        spawned = 1;
        if (spawned >= total) entity.expired = true;
        return [];
      }

      elapsed += dt;
      while (elapsed >= config.spawnInterval && spawned < total) {
        elapsed -= config.spawnInterval;
        spawnNext(ctx, spawned);
        spawned += 1;
      }

      if (spawned >= total) {
        entity.expired = true;
      }
      return [];
    },
  };

  return entity;
}
