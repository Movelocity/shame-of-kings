// T35.1:最小 Buff 袋 — 移速 / 下次普攻加成 / 持续时长
// 纯 TS,可单测;不依赖 Three / React。
// 验收:上 buff → tick 过期 → moveSpeedMultiplier / peekNextAttackBonus 回 1。
import type { ActiveBuff, BuffApply, BuffKind } from './types';

export interface BuffBag {
  /** 挂上或刷新同 id buff */
  apply(buff: BuffApply): void;
  /** 推进剩余时间;过期的摘掉 */
  tick(dt: number): void;
  /**
   * 有效移速倍率。所有 moveSpeed buff 的 value 加法叠加后 +1:
   * 两个 0.4 → 1.8。无 buff 时恒为 1。
   */
  moveSpeedMultiplier(): number;
  /** 窥视下次普攻倍率(取所有 nextAttackBonus 的 max);无则 1 */
  peekNextAttackBonus(): number;
  /**
   * 取出下次普攻倍率,并移除 consumeOnAttack 的 nextAttackBonus buff。
   * 无则返回 1(不改状态)。
   */
  consumeNextAttackBonus(): number;
  /** 当前仍存活的 buff(只读视图,顺序不稳定) */
  readonly active: readonly ActiveBuff[];
  /** 清空(重置链路用) */
  clear(): void;
}

function defaultConsumeOnAttack(kind: BuffKind, explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  return kind === 'nextAttackBonus';
}

/** 工厂:每个可吃 buff 的单位挂一个(亚瑟 playerUnit 旁路;木人桩可不挂) */
export function createBuffBag(): BuffBag {
  const byId = new Map<string, ActiveBuff>();

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
  }

  function moveSpeedMultiplier(): number {
    let sum = 0;
    for (const b of byId.values()) {
      if (b.kind === 'moveSpeed') sum += b.value;
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

  function clear(): void {
    byId.clear();
  }

  return {
    apply,
    tick,
    moveSpeedMultiplier,
    peekNextAttackBonus,
    consumeNextAttackBonus,
    get active() {
      return Array.from(byId.values());
    },
    clear,
  };
}

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
  bag.apply({
    id: `${sourceId}:moveSpeed`,
    kind: 'moveSpeed',
    value: moveSpeedBoost,
    duration,
  });
  bag.apply({
    id: `${sourceId}:nextAttack`,
    kind: 'nextAttackBonus',
    value: nextAttackBonus,
    duration,
    consumeOnAttack: true,
  });
}
