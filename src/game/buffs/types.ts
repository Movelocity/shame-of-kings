// T35.1:最小 Buff 契约
// 覆盖亚瑟一技能 / 被动需要的两类:移速加成、下次普攻加成。
// 挂点由 caller 决定(Unit 旁路 BuffBag、或 WorldState 按 unitId 持有);
// 本文件只定数据形状,不碰 Skill / Unit 闸口。

/** Buff 效果种类 */
export type BuffKind = 'moveSpeed' | 'nextAttackBonus';

/**
 * 一次 apply 的输入。
 *  - moveSpeed: value = 加成比例(0.4 → ×1.4)
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
   * 仅 nextAttackBonus 有意义:true 时 consumeNextAttackBonus() 会摘掉该 buff。
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
