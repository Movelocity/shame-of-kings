import { describe, expect, it } from 'vitest';
import {
  defaultTargetFilter,
  filterTargets,
  passesTargetFilter,
} from '../../src/game/combat/target-filter';
import type { Unit } from '../../src/game/skills/types';
import { DEFAULT_COLLISION_RADIUS } from '../../src/game/skills/types';

function mkUnit(
  id: string,
  team: Unit['team'] = 'blue',
  hp = 100,
): Unit {
  return {
    id,
    team,
    position: { x: 0, z: 0 },
    hp,
    hpMax: 100,
    isStatic: false,
    targetable: true,
    collisionRadius: DEFAULT_COLLISION_RADIUS,
    facingRad: 0,
    hidden: { inBush: false, outOfVisionFrom: new Set() },
  };
}

describe('TargetFilter', () => {
  const caster = mkUnit('caster', 'blue');

  it('排除友军', () => {
    const ally = mkUnit('ally', 'blue');
    const enemy = mkUnit('enemy', 'red');
    const filter = defaultTargetFilter(caster);
    expect(passesTargetFilter(ally, filter)).toBe(false);
    expect(passesTargetFilter(enemy, filter)).toBe(true);
  });

  it('排除尸体', () => {
    const dead = mkUnit('dead', 'red', 0);
    const filter = defaultTargetFilter(caster);
    expect(passesTargetFilter(dead, filter)).toBe(false);
  });

  it('中立默认可打', () => {
    const neutral = mkUnit('dummy', 'neutral');
    const filter = defaultTargetFilter(caster);
    expect(passesTargetFilter(neutral, filter)).toBe(true);
  });

  it('targetableOnly 默认排除不可选中单位', () => {
    const enemy = mkUnit('untargetable', 'red');
    enemy.targetable = false;
    expect(passesTargetFilter(enemy, defaultTargetFilter(caster))).toBe(false);
    expect(passesTargetFilter(enemy, {
      ...defaultTargetFilter(caster),
      targetableOnly: false,
    })).toBe(true);
  });

  it('filterTargets 批量过滤', () => {
    const units = [
      caster,
      mkUnit('ally', 'blue'),
      mkUnit('enemy', 'red'),
      mkUnit('dead', 'red', 0),
      mkUnit('dummy', 'neutral'),
    ];
    const filtered = filterTargets(units, defaultTargetFilter(caster));
    expect(filtered.map((u) => u.id).sort()).toEqual(['dummy', 'enemy']);
  });
});
