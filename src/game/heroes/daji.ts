import dajiJson from './daji.json' with { type: 'json' };
import { buildHeroSkills } from './build';
import { assertFourSkillKit, resolveAutoAttackRanges, type HeroKitData } from './hero-kit';

assertFourSkillKit(dajiJson);
export const DAJI_DATA: HeroKitData = dajiJson;
export const DAJI_AUTO_ATTACK_ID = 'auto-attack';
const skills = buildHeroSkills(DAJI_DATA);

export const loadDajiSkills = () => skills;
export const dajiSkillByHotkey = (hotkey: string) => {
  const slot = DAJI_DATA.skills.find((item) => item.hotkey === hotkey);
  return skills.find((skill) => skill.id === slot?.id) ?? null;
};
export function getDajiAutoAttackRanges() {
  const slot = DAJI_DATA.skills.find((item) => item.id === DAJI_AUTO_ATTACK_ID);
  return slot ? resolveAutoAttackRanges(slot.effect) ?? { attackRange: 2, acquireRange: 2.6 } : { attackRange: 2, acquireRange: 2.6 };
}

export type { HeroKitData, HeroSkillSlotData } from './hero-kit';
