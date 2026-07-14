import { describe, expect, it } from 'vitest';
import { arthurSkillByHotkey } from '../../src/game/heroes/arthur';
import { createSkillBook } from '../../src/game/skills/skill-book';
import { makeSkill } from '../../src/game/skills/runtime';
import type { SkillContext, Unit, WorldLike } from '../../src/game/skills/types';

function makeUnit(id: string): Unit {
  return {
    id,
    team: 'blue',
    position: { x: 0, z: 0 },
    hp: 100,
    hpMax: 100,
    isStatic: false,
    facingRad: 0,
    hidden: { inBush: false, outOfVisionFrom: new Set() },
  };
}

function makeContext(caster: Unit): SkillContext {
  const world: WorldLike = {
    unitsNear: () => [caster],
    canSee: () => true,
  };
  return { caster, world, now: 0 };
}

function makeTestSkill(id: string, cooldown: number) {
  return makeSkill({
    id,
    displayName: id,
    hit: { kind: 'self' },
    castTime: 0.1,
    activeTime: 0.1,
    recoveryTime: 0.1,
    cooldown,
  });
}

describe('SkillBook', () => {
  it('技能 done 后释放施法槽，同时继续推进自己的冷却', () => {
    const caster = makeUnit('caster');
    const context = makeContext(caster);
    const skill = makeTestSkill('skill-a', 1);
    const book = createSkillBook();

    expect(book.start(skill, caster, { forwardRad: 0 })).not.toBeNull();
    book.tick(0.1, context);
    book.tick(0.1, context);
    const completed = book.tick(0.1, context);

    expect(completed).toHaveLength(1);
    expect(book.active).toBeNull();
    expect(book.cooldownRemaining(skill.id)).toBeCloseTo(0.7, 5);

    book.tick(0.7, context);
    expect(book.cooldownRemaining(skill.id)).toBe(0);
    expect(book.canStart(skill.id)).toBe(true);
  });

  it('不同技能冷却互不阻塞，但未完成施法仍占用唯一施法槽', () => {
    const caster = makeUnit('caster');
    const context = makeContext(caster);
    const skillA = makeTestSkill('skill-a', 1);
    const skillB = makeTestSkill('skill-b', 2);
    const book = createSkillBook();

    expect(book.start(skillA, caster, { forwardRad: 0 })).not.toBeNull();
    expect(book.start(skillB, caster, { forwardRad: 0 })).toBeNull();

    book.tick(0.1, context);
    book.tick(0.1, context);
    book.tick(0.1, context);

    expect(book.start(skillA, caster, { forwardRad: 0 })).toBeNull();
    expect(book.start(skillB, caster, { forwardRad: 0 })).not.toBeNull();
  });

  it('reset 同时清空当前施法和全部冷却', () => {
    const caster = makeUnit('caster');
    const skill = makeTestSkill('skill-a', 1);
    const book = createSkillBook();

    book.start(skill, caster, { forwardRad: 0 });
    book.reset();

    expect(book.active).toBeNull();
    expect(book.cooldownRemaining(skill.id)).toBe(0);
    expect(book.canStart(skill.id)).toBe(true);
  });
});

describe('亚瑟 castMode 数据', () => {
  it('普通技能按下即施，锁定目标技能抬起释放', () => {
    expect(arthurSkillByHotkey('0')?.castMode).toBe('instant');
    expect(arthurSkillByHotkey('1')?.castMode).toBe('instant');
    expect(arthurSkillByHotkey('2')?.castMode).toBe('instant');
    expect(arthurSkillByHotkey('3')?.castMode).toBe('targeted');
  });
});
