import arthurJson from './arthur.json' with { type: 'json' };
import { buildHeroSkills } from './build';
import { assertFourSkillKit, resolveAutoAttackRanges, type HeroKitData } from './hero-kit';
assertFourSkillKit(arthurJson);
export const ARTHUR_DATA: HeroKitData = arthurJson;
export const ARTHUR_AUTO_ATTACK_ID = 'auto-attack';
export const ARTHUR_SHIELD_ID = 'shield-of-pact';
const skills = buildHeroSkills(ARTHUR_DATA);
const effect = (id: string) => ARTHUR_DATA.skills.find((slot) => slot.id === id)?.effect;
const judgement = effect('sacred-judgement');
export const loadArthurSkills = () => skills;
export const arthurSkillByHotkey = (hotkey: string) => {
  const slot = ARTHUR_DATA.skills.find((item) => item.hotkey === hotkey);
  return skills.find((skill) => skill.id === slot?.id) ?? null;
};
export function getArthurAoeRadius() {
  const value = effect('whirlwind-strike');
  if (value?.kind !== 'periodic-damage') throw new Error('arthur whirlwind config missing');
  return value.radius;
}
export const ARTHUR_AOE_RADIUS = getArthurAoeRadius();
export function getArthurAutoAttackRanges() {
  const value = effect(ARTHUR_AUTO_ATTACK_ID);
  return value ? resolveAutoAttackRanges(value) ?? { attackRange: 2, acquireRange: 2.6 } : { attackRange: 2, acquireRange: 2.6 };
}
export function getArthurShieldDashDistance() {
  const value = effect(ARTHUR_SHIELD_ID);
  return value?.kind === 'move-speed-buff' ? value.enhancedAttackDashDistance : 0;
}
export const getArthurJudgementAcquireRange = () => judgement?.kind === 'dash-landing-knockup' ? judgement.acquireRange : 8;
