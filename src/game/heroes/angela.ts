import angelaJson from './angela.json' with { type: 'json' };
import { buildHeroSkills } from './build';
import { assertFourSkillKit, resolveAutoAttackRanges, type HeroKitData } from './hero-kit';

assertFourSkillKit(angelaJson);
export const ANGELA_DATA: HeroKitData = angelaJson;
export const ANGELA_AUTO_ATTACK_ID = 'auto-attack';
const skills = buildHeroSkills(ANGELA_DATA);

export const loadAngelaSkills = () => skills;
export const angelaSkillByHotkey = (hotkey: string) => {
  const slot = ANGELA_DATA.skills.find((item) => item.hotkey === hotkey);
  return skills.find((skill) => skill.id === slot?.id) ?? null;
};
export function getAngelaAutoAttackRanges() {
  const slot = ANGELA_DATA.skills.find((item) => item.id === ANGELA_AUTO_ATTACK_ID);
  return slot ? resolveAutoAttackRanges(slot.effect) ?? { attackRange: 2, acquireRange: 2.6 } : { attackRange: 2, acquireRange: 2.6 };
}

export type { HeroKitData, HeroSkillSlotData } from './hero-kit';
