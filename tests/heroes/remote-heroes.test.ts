import { describe, expect, it } from 'vitest';
import { loadDajiSkills, dajiSkillByHotkey } from '../../src/game/heroes/daji';
import { loadAngelaSkills, angelaSkillByHotkey } from '../../src/game/heroes/angela';
import { heroSkillByHotkey } from '../../src/game/heroes/index';

describe('daji hero kit', () => {
  it('四槽位加载成功', () => {
    const skills = loadDajiSkills();
    expect(skills).toHaveLength(4);
    expect(dajiSkillByHotkey('0')).not.toBeNull();
    expect(dajiSkillByHotkey('1')?.castMode).toBe('targeted');
    expect(dajiSkillByHotkey('2')?.castMode).toBe('targeted');
  });
});

describe('angela hero kit', () => {
  it('四槽位加载成功', () => {
    const skills = loadAngelaSkills();
    expect(skills).toHaveLength(4);
    expect(angelaSkillByHotkey('2')?.id).toBe('fireball');
  });
});

describe('hero registry', () => {
  it('英雄无关施法入口', () => {
    expect(heroSkillByHotkey('arthur', '1')?.id).toBe('shield-of-pact');
    expect(heroSkillByHotkey('daji', '1')?.id).toBe('charm-missile');
    expect(heroSkillByHotkey('angela', '2')?.id).toBe('fireball');
  });
});
