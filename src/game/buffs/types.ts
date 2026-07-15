// T35.1:最小 Buff 契约
// 覆盖亚瑟一技能 / 被动需要的两类:移速加成、下次普攻加成。
// 挂点由 caller 决定(Unit 旁路 HeroStateStack、或 WorldState 按 unitId 持有);
// 本文件只定数据形状,不碰 Skill / Unit 闸口。

/** Buff 效果种类 */
export type BuffKind = 'moveSpeed' | 'attackPower' | 'nextAttackBonus';

/** dash 强化如何选择方向/目标 */
export type DashTargeting = 'locked' | 'forward' | 'locked-or-forward';

/** 可挂在指定技能上的特效；后续强化二/三技能可继续扩展联合 */
export type SkillEnhancementEffect = {
  kind: 'dash';
  /** 最大位移距离 */
  distance: number;
  /** 独立索敌距离，不与普攻自动追击范围共用 */
  acquireRange: number;
  /** 世界单位/秒 */
  speed: number;
  targeting: DashTargeting;
};

export interface SkillEnhancementApply {
  id: string;
  sourceSkillId: string;
  targetSkillId: string;
  duration: number;
  /** 可消耗次数；同 id 重新 apply 会刷新 */
  charges: number;
  effects: readonly SkillEnhancementEffect[];
}

export interface ActiveSkillEnhancement extends SkillEnhancementApply {
  remaining: number;
  charges: number;
}

/**
 * 一次 apply 的输入。
 *  - moveSpeed: value = 加成比例(0.4 → ×1.4)
 *  - attackPower: value = 攻击力加成比例(0.2 → ×1.2)
 *  - nextAttackBonus: value = 伤害倍率(1.5 → 伤害 ×1.5);consumeOnAttack 默认 true
 */
export interface BuffApply {
  /** 同 id 再次 apply 会刷新 remaining / value(不叠层) */
  id: string;
  kind: BuffKind;
  value: number;
  /** 持续秒;≤0 视为立刻过期 */
  duration: number;
  /**
   * 普攻效果 buff 有意义:true 时普攻出手会摘掉该 buff。
   * 缺省:nextAttackBonus → true,其余 → false。
   */
  consumeOnAttack?: boolean;
}

/** 运行中的 buff 实例(可变 remaining) */
export interface ActiveBuff {
  readonly id: string;
  readonly kind: BuffKind;
  readonly value: number;
  /** 剩余秒;tick 递减,≤0 移除 */
  remaining: number;
  readonly consumeOnAttack: boolean;
}
