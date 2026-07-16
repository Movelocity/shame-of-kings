import { startSkill } from './runtime';
import type { CastSnapshot, Skill, SkillContext, SkillInstance, Unit } from './types';

/**
 * 统一管理当前施法与每个技能自己的冷却。
 *
 * 约定:
 * - 同一时刻只推进一个未完成的施法实例；
 * - 技能进入 done 后立即释放施法槽，但实例继续留在冷却表中倒计时；
 * - 冷却按 skill.id 隔离，不阻塞其他技能。
 */
export interface SkillBook {
  readonly active: SkillInstance | null;
  canStart(skillId: string): boolean;
  start(skill: Skill, caster: Unit, snapshot: CastSnapshot): SkillInstance | null;
  cooldownRemaining(skillId: string): number;
  tick(dt: number, context: SkillContext): readonly SkillInstance[];
  reset(): void;
}

export function createSkillBook(): SkillBook {
  const cooldowns = new Map<string, SkillInstance>();
  let active: SkillInstance | null = null;
  const canStart = (skillId: string): boolean =>
    active === null && (cooldowns.get(skillId)?.cooldownTimer ?? 0) <= 0;

  return {
    get active() {
      return active;
    },

    canStart(skillId) {
      return canStart(skillId);
    },

    start(skill, caster, options) {
      if (!canStart(skill.id)) return null;
      const instance = startSkill(skill, caster, options);
      cooldowns.set(skill.id, instance);
      active = instance;
      return instance;
    },

    cooldownRemaining(skillId) {
      return cooldowns.get(skillId)?.cooldownTimer ?? 0;
    },

    tick(dt, context) {
      const completed: SkillInstance[] = [];
      for (const [skillId, instance] of cooldowns) {
        const wasActive = instance === active;
        const ctxWithSnapshot: SkillContext = active === instance
          ? { ...context, castSnapshot: instance.castSnapshot }
          : context;
        instance.tick(dt, ctxWithSnapshot);

        if (wasActive && instance.phase === 'done') {
          completed.push(instance);
          active = null;
        }
        if (instance.phase === 'done' && instance.cooldownTimer <= 0) {
          cooldowns.delete(skillId);
        }
      }
      return completed;
    },

    reset() {
      for (const instance of cooldowns.values()) {
        instance.cancel();
        instance.cooldownTimer = 0;
      }
      cooldowns.clear();
      active = null;
    },
  };
}
