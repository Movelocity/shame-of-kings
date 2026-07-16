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
          effect: {
            kind: 'attack-damage',
            attackRange: 2,
            autoAcquireRangeMultiplier: 1.3,
          },
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
          effect: {
            kind: 'move-speed-buff',
            moveSpeedBoost: 0.4,
            duration: 3,
            enhancedAttackDashDistance: 6,
            enhancedAttackDashSpeed: 30,
            enhancedAttackAcquireRange: 8,
          },
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
          effect: {
            kind: 'periodic-damage',
            damage: 40,
            damageInterval: 0.2,
            damageTicks: 4,
          },
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
          effect: {
            kind: 'dash-landing-knockup',
            damage: 300,
            dashDistance: 6,
            dashSpeed: 30,
            acquireRange: 8,
            knockupDuration: 0.5,
          },
        },
      ],
    };
    expect(() => assertFourSkillKit(stub)).not.toThrow();
  });

  it('缺少 hotkey 0 时抛错', () => {
    const bad: HeroKitData = {
      id: 'bad',
      displayName: 'Bad',
      skills: ARTHUR_DATA.skills.map((s) =>
        s.hotkey === '0' ? { ...s, hotkey: '1' } : s,
      ),
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

  it('远程普攻 attack-damage 校验 projectileSpeed', () => {
    const stub: HeroKitData = {
      id: 'ranged-aa',
      displayName: 'Ranged',
      skills: [
        {
          id: 'aa',
          name: 'AA',
          hotkey: '0',
          hit: { kind: 'target', range: 4 },
          displacement: 'none',
          castTime: 0,
          activeTime: 0.1,
          recoveryTime: 0.1,
          cooldown: 1,
          effect: {
            kind: 'attack-damage',
            attackRange: 2,
            autoAcquireRangeMultiplier: 1.3,
            projectileSpeed: 0,
            projectileRangeMultiplier: 2,
          },
        },
        ...ARTHUR_DATA.skills.filter((s) => s.hotkey !== '0'),
      ],
    };
    expect(() => assertFourSkillKit(stub)).toThrow(/projectileSpeed must be positive/);
  });
});
