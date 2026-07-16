import { makeSkill } from '../skills/runtime';
import type { Skill, SkillDelivery } from '../skills/types';
import { createDashLandingEvents, EFFECT_REGISTRY } from './effect-registry';
import type { HeroKitData, HeroSkillSlotData } from './hero-kit';

export function resolveDelivery(slot: HeroSkillSlotData, attackDamage = 0): SkillDelivery {
  const effect = slot.effect;
  switch (effect.kind) {
    case 'periodic-damage':
      return {
        mode: 'interval-hit',
        geometry: { kind: 'circle', radius: effect.radius },
        interval: effect.damageInterval,
        ticks: effect.damageTicks,
        settlement: { baseDamage: effect.damage },
      };
    case 'beam-channel':
      return {
        mode: 'interval-hit',
        geometry: effect.geometry,
        interval: effect.tickInterval,
        ticks: effect.ticks,
        hitOrigin: 'caster',
        settlement: { baseDamage: effect.damage },
      };
    case 'attack-damage':
      return effect.projectileSpeed === undefined
        ? {
            mode: 'instant-hit',
            geometry: effect.geometry,
            settlement: { baseDamage: attackDamage, scalesWithAttackPower: true },
          }
        : {
            mode: 'spawn-effect',
            effectKind: effect.kind,
            effectConfig: { ...effect, damage: attackDamage },
          };
    case 'move-speed-buff':
      return { mode: 'buff-only' };
    case 'dash-landing-knockup':
      return { mode: 'buff-only' };
    default:
      return { mode: 'spawn-effect', effectKind: effect.kind, effectConfig: effect };
  }
}

export function buildHeroSkills(heroData: HeroKitData): readonly Skill[] {
  return heroData.skills.map((slot) => {
    let skill!: Skill;
    skill = makeSkill({
      id: slot.id,
      displayName: slot.name,
      delivery: resolveDelivery(slot, heroData.stats.attackDamage),
      aim: slot.aim,
      displacement: slot.displacement,
      castTime: slot.castTime,
      activeTime: slot.activeTime,
      recoveryTime: slot.recoveryTime,
      cooldown: slot.cooldown,
      dashDistance: slot.effect.kind === 'dash-landing-knockup' ? slot.effect.dashDistance : 0,
      dashSpeed: slot.effect.kind === 'dash-landing-knockup' ? slot.effect.dashSpeed : 30,
      castMode: slot.castMode,
      onActivate(ctx) {
        const snapshot = ctx.castSnapshot;
        if (!snapshot) return;
        EFFECT_REGISTRY[slot.effect.kind](skill, slot, snapshot, ctx);
      },
      onLand: slot.effect.kind === 'dash-landing-knockup'
        ? (ctx) => createDashLandingEvents(skill, slot, ctx)
        : undefined,
    });
    return skill;
  });
}
