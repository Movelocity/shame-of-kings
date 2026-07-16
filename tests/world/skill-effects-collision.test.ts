import { describe, expect, it } from 'vitest';
import { segmentCircleDistance, sweptHitsTarget } from '../../src/game/world/skill-effects/collision';
import type { Unit } from '../../src/game/skills/types';
import { DEFAULT_COLLISION_RADIUS } from '../../src/game/skills/types';

function mkUnit(x: number, z: number, radius = DEFAULT_COLLISION_RADIUS): Unit {
  return {
    id: 'target',
    team: 'neutral',
    position: { x, z },
    hp: 100,
    hpMax: 100,
    isStatic: true,
    targetable: true,
    collisionRadius: radius,
    facingRad: 0,
    hidden: { inBush: false, outOfVisionFrom: new Set() },
  };
}

describe('swept capsule collision', () => {
  it('高速弹道不穿透 hurtbox', () => {
    const target = mkUnit(5, 0, 0.5);
    const hit = sweptHitsTarget(
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      0.2,
      target,
    );
    expect(hit).toBe(true);
  });

  it('擦边命中', () => {
    const target = mkUnit(5, 0.6, 0.5);
    const hit = sweptHitsTarget(
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      0.2,
      target,
    );
    expect(hit).toBe(true);
  });

  it('远离路径不命中', () => {
    const target = mkUnit(5, 5, 0.5);
    const hit = sweptHitsTarget(
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      0.2,
      target,
    );
    expect(hit).toBe(false);
  });

  it('segmentCircleDistance 边界为 0 时相交', () => {
    const dist = segmentCircleDistance(0, 0, 10, 0, 5, 0.5, 0.5);
    expect(dist).toBeLessThanOrEqual(0);
  });
});
