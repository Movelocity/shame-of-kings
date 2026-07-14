// M2 T2.3:hits.test.ts — 5 类命中盒的边界/内部/外部用例
import { describe, expect, it } from 'vitest';
import { hitCircle, hitCone, hitRect, hitTarget, resolveHits } from '../../src/game/skills/hits';
import type { Unit, WorldLike } from '../../src/game/skills/types';

function mkUnit(id: string, x: number, z: number): Unit {
  return {
    id,
    team: 'neutral',
    position: { x, z },
    hp: 100,
    hpMax: 100,
    isStatic: true,
    facingRad: 0,
    hidden: { inBush: false, outOfVisionFrom: new Set() },
  };
}

function mkWorld(units: Unit[]): WorldLike {
  return {
    unitsNear(_origin, radius) {
      return units.filter((u) => Math.hypot(u.position.x, u.position.z) <= radius + 1);
    },
    canSee() { return true; },
  };
}

describe('hitCircle', () => {
  const caster = mkUnit('caster', 0, 0);
  const world = mkWorld([
    caster,
    mkUnit('inside', 1, 0),       // 距 1
    mkUnit('boundary', 2, 0),     // 距 2(在 r=2 边界上)
    mkUnit('outside', 3, 0),      // 距 3
  ]);

  it('半径内目标命中(含边界)', () => {
    const hits = hitCircle(world, caster, { kind: 'circle', radius: 2 });
    const ids = hits.map((h) => h.target!.id).sort();
    expect(ids).toEqual(['boundary', 'inside']);
  });

  it('施法者自身不命中(跳过 caster.id)', () => {
    const hits = hitCircle(world, caster, { kind: 'circle', radius: 5 });
    expect(hits.some((h) => h.target!.id === 'caster')).toBe(false);
  });

  it('空世界返回空', () => {
    const hits = hitCircle(mkWorld([caster]), caster, { kind: 'circle', radius: 10 });
    expect(hits).toEqual([]);
  });
});

describe('hitRect', () => {
  const caster = mkUnit('caster', 0, 0);
  // halfWidth=1, halfDepth=2, forwardRad=0(前方 -Z,本地系 localZ ∈ [-2,2])
  const shape = { kind: 'rect' as const, halfWidth: 1, halfDepth: 2 };
  const world = mkWorld([
    caster,
    mkUnit('front-near', 0, -1.5),  // localZ=-1.5, in
    mkUnit('front-edge', 0, -2),    // localZ=-2, 边界 in
    mkUnit('front-far', 0, -3),     // localZ=-3, out
    mkUnit('side', 1.5, 0),         // localX=1.5, out
    mkUnit('back', 0, 1.5),         // localZ=+1.5, out
  ]);

  it('前方矩形内命中', () => {
    const hits = hitRect(world, caster, shape, 0);
    const ids = hits.map((h) => h.target!.id).sort();
    expect(ids).toEqual(['front-edge', 'front-near']);
  });

  it('旋转 90°(forward=+X)后,左右变前后', () => {
    // 旋转后 forwardRad=π/2;forward 沿 +X
    // - front-near(0,-1.5):旋转后 localZ=-1.5*-1=1.5(dx*sin+dz*-cos), localX=-1.5*-1=1.5
    //   halfDepth=2, halfWidth=1 → localX=1.5>1 不命中
    // - side(1.5, 0):localZ=1.5, localX≈0 → 命中
    const hits = hitRect(world, caster, shape, Math.PI / 2);
    const ids = hits.map((h) => h.target!.id).sort();
    expect(ids).toEqual(['side']);
  });
});

describe('hitCone', () => {
  const caster = mkUnit('caster', 0, 0);
  // 半角 45°(π/4), 范围 5, forward=0(世界 -Z)
  const shape = { kind: 'cone' as const, range: 5, halfAngleRad: Math.PI / 4 };
  const world = mkWorld([
    caster,
    mkUnit('center', 0, -3),         // 正前方
    mkUnit('edge-45', 3, -3),         // 45°(距 3√2 ≈ 4.24,在范围内且 cos≈0.707 ≥ cos(45°))
    mkUnit('outside-angle', 4, -1),   // 角度 ~76°(cos≈0.24,小于 cos(45°) → 漏)
    mkUnit('too-far', 0, -6),         // 距 6,超 range
  ]);

  it('半角 45° 扇形内命中', () => {
    const hits = hitCone(world, caster, shape, 0);
    const ids = hits.map((h) => h.target!.id).sort();
    expect(ids).toEqual(['center', 'edge-45']);
  });

  it('forwardRad=π 时朝 +Z', () => {
    // 改用 +Z 方向;'back' 才会进;此 world 没有 back → 空
    const hits = hitCone(world, caster, shape, Math.PI);
    expect(hits.map((h) => h.target!.id)).toEqual([]);
  });
});

describe('hitTarget', () => {
  const caster = mkUnit('caster', 0, 0);
  const world = mkWorld([
    caster,
    mkUnit('near', 1, 0),
    mkUnit('far', 3, 0),
    mkUnit('out-of-range', 10, 0),
  ]);

  it('锁定距离内最近目标', () => {
    const hits = hitTarget(world, caster, { kind: 'target', range: 5 });
    expect(hits.length).toBe(1);
    expect(hits[0].target!.id).toBe('near');
  });

  it('范围内没有目标返回空', () => {
    const hits = hitTarget(world, caster, { kind: 'target', range: 0.5 });
    expect(hits).toEqual([]);
  });
});

describe('resolveHits 统一入口', () => {
  const caster = mkUnit('caster', 0, 0);
  const world = mkWorld([caster, mkUnit('target', 1, 0)]);

  it('self 命中施法者', () => {
    const hits = resolveHits(world, caster, { kind: 'self' }, 0);
    expect(hits.length).toBe(1);
    expect(hits[0].target!.id).toBe('caster');
  });

  it('circle / rect / cone / target 全部命中同一目标', () => {
    expect(resolveHits(world, caster, { kind: 'circle', radius: 2 }, 0).length).toBe(1);
    expect(resolveHits(world, caster, { kind: 'rect', halfWidth: 1, halfDepth: 2 }, 0).length).toBe(1);
    expect(resolveHits(world, caster, { kind: 'cone', range: 3, halfAngleRad: Math.PI / 2 }, 0).length).toBe(1);
    expect(resolveHits(world, caster, { kind: 'target', range: 3 }, 0).length).toBe(1);
  });
});
