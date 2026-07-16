import {
  getAngelaAutoAttackRanges,
  loadAngelaSkills,
  ANGELA_DATA,
} from './angela';
import {
  getArthurAutoAttackRanges,
  getArthurJudgementAcquireRange,
  ARTHUR_DATA,
  loadArthurSkills,
} from './arthur';
import {
  getDajiAutoAttackRanges,
  loadDajiSkills,
  DAJI_DATA,
} from './daji';
import type { Skill } from '../skills/types';
import type { AimKind } from './hero-kit';

export type HeroId = 'arthur' | 'daji' | 'angela';

export const HERO_IDS: readonly HeroId[] = ['arthur', 'daji', 'angela'];

const heroSkillCache = new Map<HeroId, readonly Skill[]>();

function heroSkills(heroId: HeroId): readonly Skill[] {
  const cached = heroSkillCache.get(heroId);
  if (cached) return cached;
  const built = heroId === 'arthur'
    ? loadArthurSkills()
    : heroId === 'daji'
      ? loadDajiSkills()
      : loadAngelaSkills();
  heroSkillCache.set(heroId, built);
  return built;
}

export function heroDisplayName(heroId: HeroId): string {
  switch (heroId) {
    case 'arthur':
      return ARTHUR_DATA.displayName;
    case 'daji':
      return DAJI_DATA.displayName;
    case 'angela':
      return ANGELA_DATA.displayName;
  }
}

export function heroSkillByHotkey(heroId: HeroId, hotkey: string): Skill | null {
  const slot = getHeroKitSkills(heroId).find((skill) => skill.hotkey === hotkey);
  return heroSkills(heroId).find((skill) => skill.id === slot?.id) ?? null;
}

export function getHeroAutoAttackRanges(heroId: HeroId): {
  attackRange: number;
  acquireRange: number;
} {
  switch (heroId) {
    case 'arthur':
      return getArthurAutoAttackRanges();
    case 'daji':
      return getDajiAutoAttackRanges();
    case 'angela':
      return getAngelaAutoAttackRanges();
  }
}

export function getHeroJudgementAcquireRange(heroId: HeroId): number {
  if (heroId === 'arthur') return getArthurJudgementAcquireRange();
  return 0;
}

export function getHeroHpMax(heroId: HeroId): number {
  switch (heroId) {
    case 'arthur':
      return ARTHUR_DATA.stats.hpMax;
    case 'daji':
      return DAJI_DATA.stats.hpMax;
    case 'angela':
      return ANGELA_DATA.stats.hpMax;
  }
}

export function getHeroKitSkills(heroId: HeroId): readonly {
  id: string;
  name: string;
  hotkey: string;
  castMode?: Skill['castMode'];
  aimKind?: AimKind;
}[] {
  switch (heroId) {
    case 'arthur':
      return ARTHUR_DATA.skills;
    case 'daji':
      return DAJI_DATA.skills;
    case 'angela':
      return ANGELA_DATA.skills;
  }
}

export function heroAimKindByHotkey(heroId: HeroId, hotkey: string): AimKind {
  const slot = getHeroKitSkills(heroId).find((s) => s.hotkey === hotkey);
  return slot?.aimKind ?? 'none';
}
