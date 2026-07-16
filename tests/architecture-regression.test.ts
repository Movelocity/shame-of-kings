import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { findNearestEnemy } from '../src/game/combat/auto-attack-intent';
import type { HitGeometry, Unit } from '../src/game/skills/types';
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
    targetable: true,
    collisionRadius: DEFAULT_COLLISION_RADIUS,
    facingRad: 0,
    hidden: { inBush: false, outOfVisionFrom: new Set() },
  };
}

describe('architecture regression', () => {
  it('removed skill architecture symbols do not return in src', () => {
    const files: string[] = [];
    const visit = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) visit(path);
        else if (/\.(ts|tsx|json)$/.test(path)) files.push(path);
      }
    };
    visit(join(process.cwd(), 'src'));
    const source = files.map((path) => readFileSync(path, 'utf8')).join('\n');
    for (const removed of ['Damage' + 'Formula', 'Cast' + 'Options', 'Effect' + 'DamageEvent', 'effect-' + 'loader', 'apply' + 'Damage']) {
      expect(source).not.toContain(removed);
    }
    expect(source).not.toMatch(/sourceTeam:\s*['"]blue['"]/);
  });

  it('HitGeometry 不含 projectile kind', () => {
    const shapes: HitGeometry[] = [
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
        sourceTeam: player.team,
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
