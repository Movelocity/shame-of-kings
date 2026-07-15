// 英雄状态栈：属性叠加 + 指定技能强化 + 持续时间/剩余次数。
// 纯 TS，不依赖 Three / React；BuffBag 名称仅作兼容。
import type {
  ActiveBuff,
  ActiveSkillEnhancement,
  BuffApply,
  BuffKind,
  SkillEnhancementApply,
} from './types';

export interface HeroStateStack {
  /** 挂上或刷新同 id buff */
  apply(buff: BuffApply): void;
  /** 推进剩余时间;过期的摘掉 */
  tick(dt: number): void;
  /**
   * 有效移速倍率。所有 moveSpeed buff 的 value 加法叠加后 +1:
   * 两个 0.4 → 1.8。无 buff 时恒为 1。
   */
  moveSpeedMultiplier(): number;
  /** 有效攻击力倍率；所有 attackPower 加法叠加后 +1 */
  attackPowerMultiplier(): number;
  /** 窥视下次普攻倍率(取所有 nextAttackBonus 的 max);无则 1 */
  peekNextAttackBonus(): number;
  /**
   * 取出下次普攻倍率,并移除 consumeOnAttack 的 nextAttackBonus buff。
   * 无则返回 1(不改状态)。
   */
  consumeNextAttackBonus(): number;
  /** 挂载/刷新针对指定技能的强化状态 */
  applySkillEnhancement(enhancement: SkillEnhancementApply): void;
  /** 查询指定技能当前全部强化，不消耗次数 */
  skillEnhancements(targetSkillId: string): readonly ActiveSkillEnhancement[];
  /** 技能成功启动后各消耗一次，并返回本次生效的快照 */
  consumeSkillEnhancements(targetSkillId: string): readonly ActiveSkillEnhancement[];
  /** 当前仍存活的 buff(只读视图,顺序不稳定) */
  readonly active: readonly ActiveBuff[];
  /** 当前仍存活的技能强化状态 */
  readonly activeEnhancements: readonly ActiveSkillEnhancement[];
  /** 清空(重置链路用) */
  clear(): void;
}

function defaultConsumeOnAttack(kind: BuffKind, explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  return kind === 'nextAttackBonus';
}

/** 工厂:每个可吃 buff 的单位挂一个(亚瑟 playerUnit 旁路;木人桩可不挂) */
export function createHeroStateStack(): HeroStateStack {
  const byId = new Map<string, ActiveBuff>();
  const enhancementsById = new Map<string, ActiveSkillEnhancement>();

  function apply(buff: BuffApply): void {
    if (!(buff.duration > 0) || !Number.isFinite(buff.duration)) return;
    byId.set(buff.id, {
      id: buff.id,
      kind: buff.kind,
      value: buff.value,
      remaining: buff.duration,
      consumeOnAttack: defaultConsumeOnAttack(buff.kind, buff.consumeOnAttack),
    });
  }

  function tick(dt: number): void {
    if (!(dt > 0)) return;
    for (const [id, b] of byId) {
      b.remaining -= dt;
      if (b.remaining <= 1e-9) byId.delete(id);
    }
    for (const [id, enhancement] of enhancementsById) {
      enhancement.remaining -= dt;
      if (enhancement.remaining <= 1e-9) enhancementsById.delete(id);
    }
  }

  function moveSpeedMultiplier(): number {
    let sum = 0;
    for (const b of byId.values()) {
      if (b.kind === 'moveSpeed') sum += b.value;
    }
    return 1 + sum;
  }

  function attackPowerMultiplier(): number {
    let sum = 0;
    for (const b of byId.values()) {
      if (b.kind === 'attackPower') sum += b.value;
    }
    return 1 + sum;
  }

  function peekNextAttackBonus(): number {
    let best = 1;
    for (const b of byId.values()) {
      if (b.kind === 'nextAttackBonus' && b.value > best) best = b.value;
    }
    return best;
  }

  function consumeNextAttackBonus(): number {
    let best = 1;
    const toRemove: string[] = [];
    for (const b of byId.values()) {
      if (b.kind !== 'nextAttackBonus') continue;
      if (b.value > best) best = b.value;
      if (b.consumeOnAttack) toRemove.push(b.id);
    }
    for (const id of toRemove) byId.delete(id);
    return best;
  }

  function applySkillEnhancement(enhancement: SkillEnhancementApply): void {
    if (!(enhancement.duration > 0) || !Number.isFinite(enhancement.duration)) return;
    if (!(enhancement.charges > 0) || !Number.isFinite(enhancement.charges)) return;
    if (
      enhancement.effects.some(
        (effect) =>
          effect.kind === 'dash' &&
          (!(effect.speed > 0) ||
            !(effect.distance >= 0) ||
            !(effect.acquireRange >= 0)),
      )
    ) return;
    enhancementsById.set(enhancement.id, {
      ...enhancement,
      effects: enhancement.effects.map((effect) => ({ ...effect })),
      remaining: enhancement.duration,
      charges: Math.floor(enhancement.charges),
    });
  }

  function skillEnhancements(targetSkillId: string): readonly ActiveSkillEnhancement[] {
    return Array.from(enhancementsById.values())
      .filter((enhancement) => enhancement.targetSkillId === targetSkillId)
      .map((enhancement) => ({
        ...enhancement,
        effects: enhancement.effects.map((effect) => ({ ...effect })),
      }));
  }

  function consumeSkillEnhancements(
    targetSkillId: string,
  ): readonly ActiveSkillEnhancement[] {
    const consumed = skillEnhancements(targetSkillId).map((enhancement) => ({
      ...enhancement,
      effects: enhancement.effects.map((effect) => ({ ...effect })),
    }));
    for (const enhancement of enhancementsById.values()) {
      if (enhancement.targetSkillId !== targetSkillId) continue;
      enhancement.charges -= 1;
      if (enhancement.charges <= 0) enhancementsById.delete(enhancement.id);
    }
    return consumed;
  }

  function clear(): void {
    byId.clear();
    enhancementsById.clear();
  }

  return {
    apply,
    tick,
    moveSpeedMultiplier,
    attackPowerMultiplier,
    peekNextAttackBonus,
    consumeNextAttackBonus,
    applySkillEnhancement,
    skillEnhancements,
    consumeSkillEnhancements,
    get active() {
      return Array.from(byId.values());
    },
    get activeEnhancements() {
      return Array.from(enhancementsById.values()).map((enhancement) => ({
        ...enhancement,
        effects: enhancement.effects.map((effect) => ({ ...effect })),
      }));
    },
    clear,
  };
}

/** 旧名称兼容层 */
export type BuffBag = HeroStateStack;
export const createBuffBag = createHeroStateStack;

/** 便利:契约之盾同款 — 移速 + 下次普攻,共用 duration */
export function applyShieldOfPactStyle(
  bag: BuffBag,
  opts: {
    sourceId: string;
    moveSpeedBoost: number;
    nextAttackBonus: number;
    duration: number;
  },
): void {
  const { sourceId, moveSpeedBoost, nextAttackBonus, duration } = opts;
  applyMoveSpeedBuff(bag, { sourceId, moveSpeedBoost, duration });
  bag.apply({
    id: `${sourceId}:nextAttack`,
    kind: 'nextAttackBonus',
    value: nextAttackBonus,
    duration,
    consumeOnAttack: true,
  });
}

/** 仅挂移速 buff；契约之盾的强化普攻由 applyNextAttackDash 另行挂载 */
export function applyMoveSpeedBuff(
  bag: BuffBag,
  opts: {
    sourceId: string;
    moveSpeedBoost: number;
    duration: number;
  },
): void {
  const { sourceId, moveSpeedBoost, duration } = opts;
  bag.apply({
    id: `${sourceId}:moveSpeed`,
    kind: 'moveSpeed',
    value: moveSpeedBoost,
    duration,
  });
}

/** 下一次指定技能改为 dash */
export function applyNextAttackDash(
  bag: BuffBag,
  opts: {
    sourceId: string;
    targetSkillId: string;
    dashDistance: number;
    dashSpeed: number;
    acquireRange: number;
    duration: number;
  },
): void {
  bag.applySkillEnhancement({
    id: `${opts.sourceId}:${opts.targetSkillId}:dash`,
    sourceSkillId: opts.sourceId,
    targetSkillId: opts.targetSkillId,
    duration: opts.duration,
    charges: 1,
    effects: [
      {
        kind: 'dash',
        distance: opts.dashDistance,
        speed: opts.dashSpeed,
        acquireRange: opts.acquireRange,
        targeting: 'locked-or-forward',
      },
    ],
  });
}
