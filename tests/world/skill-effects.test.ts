import { describe, expect, it } from 'vitest';
import { createCastSnapshot } from '../../src/game/skills/cast-snapshot';
import { createWorldState } from '../../src/game/world/WorldState';
import { spawnProjectile, spawnProjectileThenZone, spawnSweptRectFromCast } from '../../src/game/world/skill-effects/spawn';
import { createSequentialProjectileBurst } from '../../src/game/world/skill-effects/sequential-projectile-burst';
import { createConvergentBurst } from '../../src/game/world/skill-effects/convergent-burst';
import type { Unit } from '../../src/game/skills/types';
import { DEFAULT_COLLISION_RADIUS } from '../../src/game/skills/types';
import { createPracticeDummy, PRACTICE_DUMMY_ID } from '../../src/game/units/practice-dummy';

function mkPlayer(): Unit {
  return {
    id: 'player',
    team: 'blue',
    position: { x: 0, z: 8 },
    hp: 1000,
    hpMax: 1000,
    isStatic: false,
    collisionRadius: DEFAULT_COLLISION_RADIUS,
    facingRad: 0,
    hidden: { inBush: false, outOfVisionFrom: new Set() },
  };
}

describe('projectile-then-zone', () => {
  it('火球命中后生成持续区域', () => {
    const player = mkPlayer();
    const dummy = createPracticeDummy();
    dummy.position = { x: 0, z: 0 };
    const world = createWorldState({ units: [player, dummy] });

    const snapshot = createCastSnapshot({
      casterId: player.id,
      skillId: 'fireball',
      origin: player.position,
      forwardRad: 0,
    });

    world.spawnEffect(
      spawnProjectileThenZone({
        ownerId: player.id,
        sourceTeam: 'blue',
        skillId: 'fireball',
        origin: snapshot.origin,
        forwardRad: snapshot.forwardRad,
        projectile: {
          speed: 20,
          maxRange: 15,
          collisionRadius: 0.3,
          damage: { amount: 100 },
        },
        zone: {
          radius: 2,
          tickInterval: 0.1,
          ticks: 2,
          damage: { amount: 50 },
        },
      }),
    );

    let zoneSpawned = false;
    const dt = 1 / 60;
    for (let i = 0; i < 120; i++) {
      const result = world.tickEffects(dt);
      if (world.effects.size > 0) {
        for (const e of world.effects.values()) {
          if (e.kind === 'persistent-area') zoneSpawned = true;
        }
      }
      if (result.damageEvents.length > 0) break;
    }

    expect(zoneSpawned).toBe(true);
  });
});

describe('daji multi-projectile', () => {
  it('多枚弹道独立命中', () => {
    const player = mkPlayer();
    const dummy = createPracticeDummy();
    dummy.position = { x: 0, z: 0 };
    const world = createWorldState({ units: [player, dummy] });

    const snapshot = createCastSnapshot({
      casterId: player.id,
      skillId: 'fox-fire',
      origin: player.position,
      forwardRad: 0,
      targetId: PRACTICE_DUMMY_ID,
    });

    for (let i = 0; i < 3; i++) {
      world.spawnEffect(
        spawnProjectile({
          ownerId: player.id,
          sourceTeam: 'blue',
          skillId: 'fox-fire',
          origin: snapshot.origin,
          forwardRad: snapshot.forwardRad,
          speed: 15,
          maxRange: 12,
          homing: true,
          targetId: snapshot.targetId,
          damage: { amount: 80 },
        }),
      );
    }

    expect(world.effects.size).toBe(3);

    const dt = 1 / 60;
    let totalHits = 0;
    for (let i = 0; i < 200; i++) {
      const result = world.tickEffects(dt);
      totalHits += result.damageEvents.length;
      if (world.effects.size === 0) break;
    }

    expect(totalHits).toBeGreaterThanOrEqual(1);
  });
});

describe('sequential projectile burst', () => {
  it('多枚弹道按间隔依次生成', () => {
    const player = mkPlayer();
    const world = createWorldState({ units: [player] });
    const snapshot = createCastSnapshot({
      casterId: player.id,
      skillId: 'charm-wave',
      origin: player.position,
      forwardRad: 0,
      targetId: PRACTICE_DUMMY_ID,
    });

    world.spawnEffect(
      createSequentialProjectileBurst({
        snapshot,
        sourceTeam: 'blue',
        spawnInterval: 0.1,
        projectileConfigs: Array.from({ length: 5 }, () => ({
          skillId: 'charm-wave',
          speed: 12,
          maxRange: 10,
          collisionRadius: 0.22,
          homing: true,
          damage: { amount: 40 },
        })),
      }),
    );

    const dt = 1 / 60;
    const counts: number[] = [];
    for (let i = 0; i < 40; i++) {
      world.tickEffects(dt);
      counts.push([...world.effects.values()].filter((e) => e.kind === 'projectile').length);
    }

    expect(counts[0]).toBe(1);
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(2);
    expect(counts.at(-1)).toBeGreaterThanOrEqual(4);
  });
});

describe('angela convergent-burst', () => {
  it('5 颗弹道各自碰撞，同一木人桩可受多次命中', () => {
    const player = mkPlayer();
    player.position = { x: 0, z: 0 };
    const dummy = createPracticeDummy();
    dummy.position = { x: 0, z: -5 };
    dummy.hp = 5000;
    dummy.hpMax = 5000;
    const world = createWorldState({ units: [player, dummy] });

    const snapshot = createCastSnapshot({
      casterId: player.id,
      skillId: 'flame-burst',
      origin: player.position,
      forwardRad: 0,
      targetPoint: { x: 0, z: -5 },
    });

    world.spawnEffect(
      createConvergentBurst({
        snapshot,
        sourceTeam: 'blue',
        projectileCount: 5,
        projectileSpeed: 12,
        travelDistance: 9,
        fanHalfAngle: 0.45,
        spawnInterval: 0.06,
        collisionRadius: 0.35,
        damage: 150,
      }),
    );

    const dt = 1 / 60;
    let totalHits = 0;
    for (let i = 0; i < 300; i++) {
      const result = world.tickEffects(dt);
      totalHits += result.damageEvents.filter(
        (e) => e.targetId === PRACTICE_DUMMY_ID,
      ).length;
      if (totalHits >= 5 && world.effects.size === 0) break;
    }

    expect(totalHits).toBe(5);
  });
});

describe('swept-rect blade', () => {
  it('矩形剑气沿路径命中木人桩', () => {
    const player = mkPlayer();
    const dummy = createPracticeDummy();
    dummy.position = { x: 0, z: 2 };
    const world = createWorldState({ units: [player, dummy] });

    const snapshot = createCastSnapshot({
      casterId: player.id,
      skillId: 'charm-missile',
      origin: player.position,
      forwardRad: 0,
    });

    world.spawnEffect(
      spawnSweptRectFromCast(snapshot, 'blue', 'charm-missile', {
        speed: 24,
        maxRange: 10,
        halfWidth: 1.2,
        halfDepth: 0.9,
        damage: { amount: 180 },
      }),
    );

    const dt = 1 / 60;
    let hit = false;
    for (let i = 0; i < 120; i++) {
      const result = world.tickEffects(dt);
      if (result.damageEvents.some((e) => e.targetId === PRACTICE_DUMMY_ID)) {
        hit = true;
        break;
      }
    }
    expect(hit).toBe(true);
    const blade = [...world.effects.values()].find((e) => e.kind === 'swept-rect');
    expect(blade).toBeDefined();
  });
});
