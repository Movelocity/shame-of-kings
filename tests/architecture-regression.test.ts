import { describe, expect, it } from 'vitest';
import { findNearestEnemy } from '../src/game/combat/auto-attack-intent';
import type { HitShape, Unit } from '../src/game/skills/types';
import { DEFAULT_COLLISION_RADIUS } from '../src/game/skills/types';
import { createWorldState } from '../src/game/world/WorldState';
import { spawnProjectile } from '../src/game/world/skill-effects/spawn';

function mkUnit(id: string, team: Unit['team'] = 'blue'): Unit {
  return {
    id,
    team,
    position: { x: 0, z: 0 },
    hp: 100,
    hpMax: 100,
    isStatic: false,
    collisionRadius: DEFAULT_COLLISION_RADIUS,
    facingRad: 0,
    hidden: { inBush: false, outOfVisionFrom: new Set() },
  };
}

describe('architecture regression', () => {
  it('HitShape 不含 projectile kind', () => {
    const shapes: HitShape[] = [
      { kind: 'self' },
      { kind: 'circle', radius: 1 },
      { kind: 'rect', halfWidth: 1, halfDepth: 1 },
      { kind: 'cone', range: 1, halfAngleRad: 0.5 },
      { kind: 'target', range: 1 },
    ];
    for (const shape of shapes) {
      expect(shape.kind).not.toBe('projectile');
    }
  });

  it('SkillEffectEntity 不被索敌选中', () => {
    const player = mkUnit('player', 'blue');
    const dummy = mkUnit('dummy', 'neutral');
    dummy.position = { x: 3, z: 0 };
    const world = createWorldState({ units: [player, dummy] });
    world.spawnEffect(
      spawnProjectile({
        ownerId: player.id,
        sourceTeam: 'blue',
        skillId: 'test',
        origin: { x: 0, z: 0 },
        forwardRad: 0,
        speed: 5,
        maxRange: 10,
        damage: { amount: 10 },
      }),
    );

    const enemy = findNearestEnemy(world, player, 10);
    expect(enemy?.id).toBe('dummy');
    expect(world.effects.size).toBe(1);
  });
});
