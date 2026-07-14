// 普攻自动锁敌意图单测 — 普通停攻击距 / 强化贴身
import { describe, expect, it } from 'vitest';
import {
  createAutoAttackIntent,
  facingToward,
  findNearestEnemy,
} from '../../src/game/combat/auto-attack-intent';
import type { Unit, WorldLike } from '../../src/game/skills/types';

function mkUnit(
  id: string,
  opts: Partial<Unit> & { x?: number; z?: number } = {},
): Unit {
  const { x = 0, z = 0, ...rest } = opts;
  return {
    id,
    team: rest.team ?? 'blue',
    position: { x, z },
    hp: rest.hp ?? 100,
    hpMax: rest.hpMax ?? 100,
    isStatic: rest.isStatic ?? false,
    facingRad: rest.facingRad ?? 0,
    hidden: rest.hidden ?? { inBush: false, outOfVisionFrom: new Set() },
  };
}

function mkWorld(units: Unit[]): WorldLike {
  return {
    unitsNear: () => units,
    canSee: () => true,
  };
}

describe('findNearestEnemy', () => {
  it('返回获取范围内最近敌对单位', () => {
    const caster = mkUnit('p', { x: 0, z: 0 });
    const near = mkUnit('near', { x: 0, z: -3, team: 'neutral', isStatic: true });
    const far = mkUnit('far', { x: 0, z: -6, team: 'neutral', isStatic: true });
    const world = mkWorld([caster, near, far]);
    expect(findNearestEnemy(world, caster, 8)?.id).toBe('near');
  });

  it('获取范围外不锁', () => {
    const caster = mkUnit('p', { x: 0, z: 0 });
    const far = mkUnit('far', { x: 0, z: -10, team: 'neutral' });
    expect(findNearestEnemy(mkWorld([caster, far]), caster, 8)).toBeNull();
  });

  it('跳过同阵营与死亡单位', () => {
    const caster = mkUnit('p', { team: 'blue' });
    const ally = mkUnit('ally', { x: 1, z: 0, team: 'blue' });
    const dead = mkUnit('dead', { x: 0, z: -1, team: 'neutral', hp: 0 });
    expect(findNearestEnemy(mkWorld([caster, ally, dead]), caster, 8)).toBeNull();
  });
});

describe('facingToward', () => {
  it('朝 -Z 为 0', () => {
    expect(facingToward({ x: 0, z: 0 }, { x: 0, z: -1 })).toBeCloseTo(0, 5);
  });
});

describe('AutoAttackIntent', () => {
  const ranges = { attackRange: 2, acquireRange: 8 };

  function resolveFrom(units: Unit[]) {
    const map = new Map(units.map((u) => [u.id, u]));
    return (id: string) => map.get(id) ?? null;
  }

  function tickOpts(
    caster: Unit,
    units: Unit[],
    extra: { canCast?: boolean; closeEngage?: boolean } = {},
  ) {
    return {
      caster,
      resolveUnit: resolveFrom(units),
      canCast: extra.canCast ?? true,
      closeEngage: extra.closeEngage ?? false,
      ...ranges,
    };
  }

  it('获取范围外 requestAttack 失败', () => {
    const caster = mkUnit('p');
    const far = mkUnit('d', { x: 0, z: -10, team: 'neutral' });
    const intent = createAutoAttackIntent();
    expect(intent.requestAttack(caster, mkWorld([caster, far]), ranges.acquireRange)).toBe(
      false,
    );
    expect(intent.isActive).toBe(false);
  });

  it('普通普攻:攻击外追击,进入攻击距后停步并 shouldCast', () => {
    const caster = mkUnit('p', { x: 0, z: 0 });
    const dummy = mkUnit('d', { x: 0, z: -5, team: 'neutral', isStatic: true });
    const units = [caster, dummy];
    const intent = createAutoAttackIntent();
    expect(intent.requestAttack(caster, mkWorld(units), ranges.acquireRange)).toBe(true);

    const far = intent.tick(tickOpts(caster, units));
    expect(far.kind).toBe('engage');
    if (far.kind === 'engage') {
      expect(far.moveTo).toEqual({ x: 0, z: -5 });
      expect(far.shouldCast).toBe(false);
    }

    caster.position.z = -3.5; // dist 1.5 ≤ 2
    const near = intent.tick(tickOpts(caster, units));
    expect(near.kind).toBe('engage');
    if (near.kind === 'engage') {
      expect(near.moveTo).toBeNull();
      expect(near.shouldCast).toBe(true);
      expect(near.targetId).toBe('d');
    }
  });

  it('普通普攻:攻击内 CD 未好 → 停步不贴身', () => {
    const caster = mkUnit('p', { x: 0, z: 0 });
    const dummy = mkUnit('d', { x: 0, z: -1, team: 'neutral' });
    const units = [caster, dummy];
    const intent = createAutoAttackIntent();
    intent.requestAttack(caster, mkWorld(units), ranges.acquireRange);

    const action = intent.tick(tickOpts(caster, units, { canCast: false }));
    expect(action.kind).toBe('engage');
    if (action.kind === 'engage') {
      expect(action.moveTo).toBeNull();
      expect(action.shouldCast).toBe(false);
    }
  });

  it('强化普攻:攻击距内追到 standoff,不冲进 0', () => {
    const caster = mkUnit('p', { x: 0, z: 0 });
    const dummy = mkUnit('d', { x: 0, z: -1, team: 'neutral' });
    const units = [caster, dummy];
    const intent = createAutoAttackIntent();
    intent.requestAttack(caster, mkWorld(units), ranges.acquireRange);

    const action = intent.tick(
      tickOpts(caster, units, { canCast: false, closeEngage: true }),
    );
    expect(action.kind).toBe('engage');
    if (action.kind === 'engage') {
      // dist=1 > 0.45 → 落点在目标外侧 0.45
      expect(action.moveTo).not.toBeNull();
      expect(action.moveTo!.z).toBeCloseTo(-1 + 0.45, 5);
      expect(action.shouldCast).toBe(false);
    }
  });

  it('强化普攻:已在 standoff 内停步,重合时保持朝向可出手', () => {
    const caster = mkUnit('p', { x: 0, z: -0.2, facingRad: 0.3 });
    const dummy = mkUnit('d', { x: 0, z: 0, team: 'neutral' });
    const units = [caster, dummy];
    const intent = createAutoAttackIntent();
    intent.requestAttack(caster, mkWorld(units), ranges.acquireRange);

    const action = intent.tick(
      tickOpts(caster, units, { closeEngage: true }),
    );
    expect(action.kind).toBe('engage');
    if (action.kind === 'engage') {
      expect(action.moveTo).toBeNull();
      expect(action.shouldCast).toBe(true);
    }
  });

  it('强化普攻:距离近乎 0 时沿用 caster.facingRad 防抖', () => {
    const caster = mkUnit('p', { x: 0, z: 0, facingRad: 1.2 });
    const dummy = mkUnit('d', { x: 0, z: 0, team: 'neutral' });
    const units = [caster, dummy];
    const intent = createAutoAttackIntent();
    intent.requestAttack(caster, mkWorld(units), ranges.acquireRange);

    const action = intent.tick(
      tickOpts(caster, units, { closeEngage: true }),
    );
    expect(action.kind).toBe('engage');
    if (action.kind === 'engage') {
      expect(action.forwardRad).toBeCloseTo(1.2, 5);
      expect(action.moveTo).toBeNull();
    }
  });

  it('cancel 后不再 engage', () => {
    const caster = mkUnit('p');
    const dummy = mkUnit('d', { x: 0, z: -5, team: 'neutral' });
    const units = [caster, dummy];
    const intent = createAutoAttackIntent();
    intent.requestAttack(caster, mkWorld(units), ranges.acquireRange);
    intent.cancel();
    expect(intent.tick(tickOpts(caster, units)).kind).toBe('none');
  });

  it('目标离开获取范围 → 清意图', () => {
    const caster = mkUnit('p', { x: 0, z: 0 });
    const dummy = mkUnit('d', { x: 0, z: -5, team: 'neutral' });
    const units = [caster, dummy];
    const intent = createAutoAttackIntent();
    intent.requestAttack(caster, mkWorld(units), ranges.acquireRange);
    dummy.position.z = -20;
    const action = intent.tick(tickOpts(caster, units));
    expect(action.kind).toBe('none');
    expect(intent.isActive).toBe(false);
  });
});
