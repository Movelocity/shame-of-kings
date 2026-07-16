import {
  angelaSkillByHotkey,
  getAngelaAutoAttackRanges,
  ANGELA_DATA,
} from './angela';
import {
  arthurSkillByHotkey,
  getArthurAutoAttackRanges,
  getArthurJudgementAcquireRange,
  ARTHUR_DATA,
} from './arthur';
import {
  dajiSkillByHotkey,
  getDajiAutoAttackRanges,
  DAJI_DATA,
} from './daji';
import type { Skill } from '../skills/types';

export type HeroId = 'arthur' | 'daji' | 'angela';

export const HERO_IDS: readonly HeroId[] = ['arthur', 'daji', 'angela'];

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
  switch (heroId) {
    case 'arthur':
      return arthurSkillByHotkey(hotkey);
    case 'daji':
      return dajiSkillByHotkey(hotkey);
    case 'angela':
      return angelaSkillByHotkey(hotkey);
  }
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
