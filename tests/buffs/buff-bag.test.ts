// T35.1 验收:上 buff → tick 过期 → 属性恢复;下次普攻消费后加成消失
import { describe, expect, it } from 'vitest';
import {
  applyShieldOfPactStyle,
  createBuffBag,
} from '../../src/game/buffs/buff-bag';

describe('BuffBag', () => {
  it('上移速 buff 后倍率上升,tick 过期后恢复为 1', () => {
    const bag = createBuffBag();
    expect(bag.moveSpeedMultiplier()).toBe(1);

    bag.apply({
      id: 'ms',
      kind: 'moveSpeed',
      value: 0.4,
      duration: 3,
    });
    expect(bag.moveSpeedMultiplier()).toBeCloseTo(1.4, 5);
    expect(bag.active).toHaveLength(1);

    bag.tick(1.5);
    expect(bag.moveSpeedMultiplier()).toBeCloseTo(1.4, 5);
    expect(bag.active[0]?.remaining).toBeCloseTo(1.5, 5);

    bag.tick(1.5);
    expect(bag.moveSpeedMultiplier()).toBe(1);
    expect(bag.active).toHaveLength(0);
  });

  it('下次普攻加成可 peek,consume 后摘掉且倍率回 1', () => {
    const bag = createBuffBag();
    bag.apply({
      id: 'aa',
      kind: 'nextAttackBonus',
      value: 1.5,
      duration: 5,
    });
    expect(bag.peekNextAttackBonus()).toBeCloseTo(1.5, 5);

    const mult = bag.consumeNextAttackBonus();
    expect(mult).toBeCloseTo(1.5, 5);
    expect(bag.peekNextAttackBonus()).toBe(1);
    expect(bag.active).toHaveLength(0);

    // 再 consume 不改状态,仍返 1
    expect(bag.consumeNextAttackBonus()).toBe(1);
  });

  it('同 id 再次 apply 刷新 remaining 与 value,不叠层', () => {
    const bag = createBuffBag();
    bag.apply({ id: 'ms', kind: 'moveSpeed', value: 0.2, duration: 1 });
    bag.tick(0.5);
    bag.apply({ id: 'ms', kind: 'moveSpeed', value: 0.4, duration: 3 });

    expect(bag.active).toHaveLength(1);
    expect(bag.moveSpeedMultiplier()).toBeCloseTo(1.4, 5);
    expect(bag.active[0]?.remaining).toBeCloseTo(3, 5);
  });

  it('多个移速 buff 加法叠加', () => {
    const bag = createBuffBag();
    bag.apply({ id: 'a', kind: 'moveSpeed', value: 0.4, duration: 2 });
    bag.apply({ id: 'b', kind: 'moveSpeed', value: 0.15, duration: 2 });
    expect(bag.moveSpeedMultiplier()).toBeCloseTo(1.55, 5);

    bag.tick(2);
    expect(bag.moveSpeedMultiplier()).toBe(1);
  });

  it('下次普攻在 duration 内未消费也会过期', () => {
    const bag = createBuffBag();
    bag.apply({
      id: 'aa',
      kind: 'nextAttackBonus',
      value: 1.5,
      duration: 1,
    });
    bag.tick(1);
    expect(bag.peekNextAttackBonus()).toBe(1);
    expect(bag.consumeNextAttackBonus()).toBe(1);
  });

  it('applyShieldOfPactStyle 同时挂移速与下次普攻;消费普攻不影响移速', () => {
    const bag = createBuffBag();
    applyShieldOfPactStyle(bag, {
      sourceId: 'shield-of-pact',
      moveSpeedBoost: 0.4,
      nextAttackBonus: 1.5,
      duration: 3,
    });
    expect(bag.moveSpeedMultiplier()).toBeCloseTo(1.4, 5);
    expect(bag.consumeNextAttackBonus()).toBeCloseTo(1.5, 5);
    expect(bag.moveSpeedMultiplier()).toBeCloseTo(1.4, 5);
    expect(bag.peekNextAttackBonus()).toBe(1);

    bag.tick(3);
    expect(bag.moveSpeedMultiplier()).toBe(1);
  });

  it('clear 立刻清空全部 buff', () => {
    const bag = createBuffBag();
    bag.apply({ id: 'ms', kind: 'moveSpeed', value: 0.4, duration: 10 });
    bag.clear();
    expect(bag.active).toHaveLength(0);
    expect(bag.moveSpeedMultiplier()).toBe(1);
  });

  it('duration ≤ 0 的 apply 被忽略', () => {
    const bag = createBuffBag();
    bag.apply({ id: 'ms', kind: 'moveSpeed', value: 0.4, duration: 0 });
    bag.apply({ id: 'ms2', kind: 'moveSpeed', value: 0.4, duration: -1 });
    expect(bag.active).toHaveLength(0);
  });
});
