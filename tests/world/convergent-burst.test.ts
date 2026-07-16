import { describe, expect, it } from 'vitest';
import { createCastSnapshot } from '../../src/game/skills/cast-snapshot';
import {
  computeConvergentSpawnPoints,
  CONVERGENT_SPAWN_BACK_OFFSET,
  createConvergentBurst,
} from '../../src/game/world/skill-effects/convergent-burst';
import { createWorldState } from '../../src/game/world/WorldState';
import type { Unit } from '../../src/game/skills/types';
import { DEFAULT_COLLISION_RADIUS } from '../../src/game/skills/types';

function mkPlayer(): Unit {
  return {
    id: 'player',
    team: 'blue',
    position: { x: 0, z: 0 },
    hp: 1000,
    hpMax: 1000,
    isStatic: false,
    targetable: true,
    collisionRadius: DEFAULT_COLLISION_RADIUS,
    facingRad: 0,
    hidden: { inBush: false, outOfVisionFrom: new Set() },
  };
}

describe('computeConvergentSpawnPoints', () => {
  it('各起点在施法者身后且相邻间距足够分开', () => {
    const P = { x: 0, z: -5 };
    const C = { x: 0, z: 0 };
    const back = CONVERGENT_SPAWN_BACK_OFFSET;
    const points = computeConvergentSpawnPoints(P, C, back, 0.85, 5);
    expect(points).toHaveLength(5);
    // 全部在身后(+Z, 朝向 -Z)
    for (const p of points) {
      expect(p.z).toBeGreaterThan(0.5);
    }
    // 相邻间距应明显大于碰撞直径,避免视觉叠成一团
    const xs = points.map((p) => p.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]! - xs[i - 1]!).toBeGreaterThan(0.7);
    }
  });

  it('扇形关于施法背后轴对称', () => {
    const P = { x: 0, z: -5 };
    const C = { x: 0, z: 0 };
    const points = computeConvergentSpawnPoints(P, C, 1.6, 0.85, 5);
    const mid = points[2]!;
    expect(mid.x).toBeCloseTo(0, 5);
    expect(mid.z).toBeCloseTo(1.6, 5);
    expect(points[0]!.x).toBeCloseTo(-points[4]!.x, 5);
    expect(points[1]!.x).toBeCloseTo(-points[3]!.x, 5);
  });
});

describe('createConvergentBurst', () => {
  it('当帧齐射全部弹道后 expired', () => {
    const player = mkPlayer();
    const world = createWorldState({ units: [player] });
    const snapshot = createCastSnapshot({
      casterId: player.id,
      skillId: 'flame-burst',
      origin: player.position,
      forwardRad: 0,
      targetPoint: { x: 0, z: -5 },
    });

    const burst = createConvergentBurst({
      snapshot,
      sourceTeam: 'blue',
      projectileCount: 5,
      projectileSpeed: 12,
      travelDistance: 12,
      fanHalfAngle: 0.85,
      spawnInterval: 0,
      collisionRadius: 0.4,
      damage: 150,
    });
    world.spawnEffect(burst);

    world.tickEffects(1 / 60);
    const projectiles = [...world.effects.values()].filter(
      (e) => e.kind === 'projectile',
    );
    expect(projectiles.length).toBe(5);
    expect(burst.expired).toBe(true);
    expect(world.effects.has(burst.id)).toBe(false);
  });

  it('交汇点不是灭点:飞过 targetPoint 后弹道仍存活', () => {
    const player = mkPlayer();
    const world = createWorldState({ units: [player] });
    const targetPoint = { x: 0, z: -3 };
    const snapshot = createCastSnapshot({
      casterId: player.id,
      skillId: 'flame-burst',
      origin: player.position,
      forwardRad: 0,
      targetPoint,
    });

    world.spawnEffect(
      createConvergentBurst({
        snapshot,
        sourceTeam: 'blue',
        projectileCount: 5,
        projectileSpeed: 20,
        travelDistance: 14,
        fanHalfAngle: 0.85,
        spawnInterval: 0,
        collisionRadius: 0.4,
        damage: 150,
      }),
    );

    const dt = 1 / 60;
    // 飞过交汇点所需时间约 (身后1.6 + 3) / 20 ≈ 0.23s,再多飞一会
    for (let i = 0; i < 30; i++) {
      world.tickEffects(dt);
    }
    const projectiles = [...world.effects.values()].filter(
      (e) => e.kind === 'projectile',
    );
    expect(projectiles.length).toBe(5);
    // 中心球应已越过交汇点(z < -3)
    const mid = projectiles.find((e) => {
      const p = (e as { getPosition(): { x: number; z: number } }).getPosition();
      return Math.abs(p.x) < 0.3;
    });
    expect(mid).toBeDefined();
    expect(
      (mid as { getPosition(): { z: number } }).getPosition().z,
    ).toBeLessThan(targetPoint.z);
  });

  it('spawnInterval staggers projectiles and preserves castId', () => {
    const player = mkPlayer();
    const world = createWorldState({ units: [player] });
    const snapshot = createCastSnapshot({
      casterId: player.id,
      skillId: 'flame-burst',
      origin: player.position,
      forwardRad: 0,
      targetPoint: { x: 0, z: -5 },
    });
    world.spawnEffect(createConvergentBurst({
      snapshot, sourceTeam: 'blue', projectileCount: 3, projectileSpeed: 12,
      travelDistance: 12, fanHalfAngle: 0.5, spawnInterval: 0.1,
      collisionRadius: 0.4, damage: 150,
    }));
    world.tickEffects(0.01);
    expect([...world.effects.values()].filter((effect) => effect.kind === 'projectile')).toHaveLength(1);
    world.tickEffects(0.1);
    const projectiles = [...world.effects.values()].filter((effect) => effect.kind === 'projectile');
    expect(projectiles).toHaveLength(2);
    expect(projectiles.every((effect) => effect.castId === snapshot.castId)).toBe(true);
  });
});
