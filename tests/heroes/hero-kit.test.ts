import { describe, expect, it } from 'vitest';
import { ANGELA_DATA } from '../../src/game/heroes/angela';
import { ARTHUR_DATA } from '../../src/game/heroes/arthur';
import { buildHeroSkills } from '../../src/game/heroes/build';
import { DAJI_DATA } from '../../src/game/heroes/daji';
import { EFFECT_REGISTRY } from '../../src/game/heroes/effect-registry';
import { assertFourSkillKit } from '../../src/game/heroes/hero-kit';

describe('hero kit schema', () => {
  it('validates all shipped four-slot kits', () => {
    for (const data of [ARTHUR_DATA, DAJI_DATA, ANGELA_DATA]) {
      expect(() => assertFourSkillKit(data)).not.toThrow();
      expect(data.skills.map((slot) => slot.hotkey).sort()).toEqual(['0', '1', '2', '3']);
    }
  });

  it('rejects the removed top-level geometry field', () => {
    const bad = {
      ...ARTHUR_DATA,
      skills: ARTHUR_DATA.skills.map((slot, index) =>
        index === 0 ? { ...slot, hit: { kind: 'self' } } : slot,
      ),
    };
    expect(() => assertFourSkillKit(bad)).toThrow(/must not define top-level hit/);
  });

  it('rejects unknown effects', () => {
    const bad = {
      ...ARTHUR_DATA,
      skills: ARTHUR_DATA.skills.map((slot, index) =>
        index === 0 ? { ...slot, effect: { kind: 'mystery' } } : slot,
      ),
    };
    expect(() => assertFourSkillKit(bad)).toThrow(/unknown effect/);
  });

  it('registry covers every shipped effect kind', () => {
    const kinds = new Set(
      [ARTHUR_DATA, DAJI_DATA, ANGELA_DATA].flatMap((data) =>
        data.skills.map((slot) => slot.effect.kind),
      ),
    );
    expect([...kinds].every((kind) => typeof EFFECT_REGISTRY[kind] === 'function')).toBe(true);
  });

  it('generic builder creates all three heroes', () => {
    for (const data of [ARTHUR_DATA, DAJI_DATA, ANGELA_DATA]) {
      expect(buildHeroSkills(data)).toHaveLength(4);
    }
  });
});
