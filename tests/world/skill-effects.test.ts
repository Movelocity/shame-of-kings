import { describe, expect, it } from 'vitest';
import { createCastSnapshot } from '../../src/game/skills/cast-snapshot';
import { createWorldState } from '../../src/game/world/WorldState';
import { spawnProjectile, spawnProjectileThenZone } from '../../src/game/world/skill-effects/spawn';
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
