import { describe, expect, it } from 'vitest';
import { assertFourSkillKit, type HeroKitData } from '../../src/game/heroes/hero-kit';
import { ARTHUR_DATA } from '../../src/game/heroes/arthur';

describe('assertFourSkillKit', () => {
  it('arthur.json 四槽位校验通过', () => {
    expect(() => assertFourSkillKit(ARTHUR_DATA)).not.toThrow();
    expect(ARTHUR_DATA.skills.map((s) => s.hotkey).sort()).toEqual([
      '0',
      '1',
      '2',
      '3',
    ]);
  });

  it('stub 英雄 JSON 可通过契约测试', () => {
    const stub: HeroKitData = {
      id: 'stub-hero',
      displayName: 'Stub',
      skills: [
        {
          id: 'aa',
          name: 'AA',
          hotkey: '0',
          hit: { kind: 'rect', halfWidth: 1, halfDepth: 1 },
          displacement: 'none',
          castTime: 0,
          activeTime: 0.1,
          recoveryTime: 0.1,
          cooldown: 1,
          effect: { damage: 50 },
        },
        {
          id: 's1',
          name: 'S1',
          hotkey: '1',
          hit: { kind: 'self' },
          displacement: 'none',
          castTime: 0.1,
          activeTime: 0.1,
          recoveryTime: 0.1,
          cooldown: 2,
          effect: {},
        },
        {
          id: 's2',
          name: 'S2',
          hotkey: '2',
          hit: { kind: 'circle', radius: 2 },
          displacement: 'none',
          castTime: 0.1,
          activeTime: 0.2,
          recoveryTime: 0.1,
          cooldown: 3,
          effect: { aoeRadius: 2 },
        },
        {
          id: 's3',
          name: 'S3',
          hotkey: '3',
          hit: { kind: 'target', range: 5 },
          displacement: 'dash',
          castTime: 0.2,
          activeTime: 0.1,
          recoveryTime: 0.2,
          cooldown: 4,
          effect: { knockupDuration: 0.5 },
        },
      ],
    };
    expect(() => assertFourSkillKit(stub)).not.toThrow();
  });

  it('缺少 hotkey 0 时抛错', () => {
    const bad: HeroKitData = {
      id: 'bad',
      displayName: 'Bad',
      skills: ARTHUR_DATA.skills.filter((s) => s.hotkey !== '0'),
    };
    expect(() => assertFourSkillKit(bad)).toThrow(/hotkey "0"/);
  });

  it('重复 hotkey 时抛错', () => {
    const dup = ARTHUR_DATA.skills.map((s) =>
      s.hotkey === '3' ? { ...s, hotkey: '2' as const } : s,
    );
    expect(() =>
      assertFourSkillKit({ ...ARTHUR_DATA, skills: dup }),
    ).toThrow(/hotkey "2"/);
  });
});
