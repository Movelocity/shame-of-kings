// 普攻自动锁敌意图:
//  - 普通普攻:追到 attackRange 停步再出手(不贴身)
//  - 强化普攻(closeEngage):朝目标中心贴身/可重合后再/同时出手
// 出伤仍走命中盒(hits),本模块只给出手门槛与追击点。
import type { AutoAttackPriority } from '../../engine/input/desktop-skill-hotkeys';
import type { Unit, WorldLike } from '../skills/types';
import type { Vec2 } from '../skills/vec2';

export interface AutoAttackRanges {
  attackRange: number;
  acquireRange: number;
}

/**
 * none: 无意图
 * engage: 粘性锁敌中
 *  - moveTo 非空 → 继续追(普通追攻击距边缘 / 强化追中心)
 *  - moveTo 空 → 已在攻击距内停步(仅普通普攻)
 */
export type AutoAttackAction =
  | { kind: 'none' }
  | {
      kind: 'engage';
      moveTo: { x: number; z: number } | null;
      forwardRad: number;
      shouldCast: boolean;
      targetId: string;
    };

export interface AutoAttackTickCtx {
  caster: Unit;
  /** 解析已锁定单位;WorldState.getUnit 即可 */
  resolveUnit: (id: string) => Unit | null;
  /** 施法槽空闲且普攻 CD 就绪 */
  canCast: boolean;
  attackRange: number;
  acquireRange: number;
  /**
   * 强化普攻贴身索敌(契约之盾下次普攻加成等)。
   * false = 普通普攻,只追到 attackRange。
   */
  closeEngage: boolean;
  /**
   * 强化贴身停距(世界单位)。不可为 0,否则重合时 facing 抖动。
   * 缺省见 DEFAULT_CLOSE_ENGAGE_STANDOFF。
   */
  closeEngageStandoff?: number;
}

/** 强化普攻默认停在目标外这么远,避免距离 0 时朝向抖动 */
export const DEFAULT_CLOSE_ENGAGE_STANDOFF = 0.45;

/** 目标外侧 standoff 处的落点(沿 caster→target) */
export function pointAtStandoff(
  caster: Vec2,
  target: Vec2,
  standoff: number,
): { x: number; z: number } {
  const dx = target.x - caster.x;
  const dz = target.z - caster.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return { x: caster.x, z: caster.z };
  const ux = dx / dist;
  const uz = dz / dist;
  return {
    x: target.x - ux * standoff,
    z: target.z - uz * standoff,
  };
}

/** 世界 -Z = 0 时,从 from 指向 to 的朝向(与 player-controller 一致) */
export function facingToward(from: Vec2, to: Vec2): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.hypot(dx, dz) < 1e-6) return 0;
  return Math.atan2(dx, -dz);
}

/**
 * 获取范围内最近可攻击单位。
 * 跳过自身、同阵营、hp≤0;neutral(木人桩)可打。
 * priority 为 minion/tower 时,待 P2 单位类型落地后再过滤;当前练习场等同 default。
 */
export function findNearestEnemy(
  world: WorldLike,
  caster: Unit,
  acquireRange: number,
  _priority: AutoAttackPriority = 'default',
): Unit | null {
  const candidates = world.unitsNear(caster.position, acquireRange);
  let best: { unit: Unit; dist: number } | null = null;
  for (const u of candidates) {
    if (u.id === caster.id) continue;
    if (u.hp <= 0) continue;
    if (u.team === caster.team) continue;
    const dx = u.position.x - caster.position.x;
    const dz = u.position.z - caster.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > acquireRange) continue;
    if (best === null || dist < best.dist) {
      best = { unit: u, dist };
    }
  }
  return best?.unit ?? null;
}

export interface AutoAttackIntent {
  readonly targetId: string | null;
  readonly isActive: boolean;
  /**
   * 尝试锁最近敌。成功返回 true 并进入粘性意图;
   * 获取范围内无目标返回 false。
   */
  requestAttack(
    caster: Unit,
    world: WorldLike,
    acquireRange: number,
    priority?: AutoAttackPriority,
  ): boolean;
  /** 手动移动等取消 */
  cancel(): void;
  /** 重置链路 */
  clear(): void;
  /** 每帧:engage / none */
  tick(ctx: AutoAttackTickCtx): AutoAttackAction;
}

export function createAutoAttackIntent(): AutoAttackIntent {
  let targetId: string | null = null;
  let active = false;

  function clear(): void {
    targetId = null;
    active = false;
  }

  return {
    get targetId() {
      return targetId;
    },
    get isActive() {
      return active;
    },

    requestAttack(caster, world, acquireRange, priority = 'default') {
      const enemy = findNearestEnemy(world, caster, acquireRange, priority);
      if (!enemy) return false;
      targetId = enemy.id;
      active = true;
      return true;
    },

    cancel: clear,
    clear,

    tick(ctx) {
      if (!active || targetId === null) return { kind: 'none' };

      const target = ctx.resolveUnit(targetId);
      if (!target || target.hp <= 0) {
        clear();
        return { kind: 'none' };
      }

      const dx = target.position.x - ctx.caster.position.x;
      const dz = target.position.z - ctx.caster.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist > ctx.acquireRange) {
        clear();
        return { kind: 'none' };
      }

      const forwardRad =
        dist < 1e-3
          ? ctx.caster.facingRad
          : facingToward(ctx.caster.position, target.position);
      const inAttackRange = dist <= ctx.attackRange;
      const shouldCast = inAttackRange && ctx.canCast;
      const standoff = Math.max(
        0.05,
        ctx.closeEngageStandoff ?? DEFAULT_CLOSE_ENGAGE_STANDOFF,
      );

      // 强化普攻:追到 standoff 落点,不冲进距离 0(防朝向抖动)
      if (ctx.closeEngage) {
        return {
          kind: 'engage',
          moveTo:
            dist > standoff
              ? pointAtStandoff(ctx.caster.position, target.position, standoff)
              : null,
          forwardRad,
          shouldCast,
          targetId,
        };
      }

      // 普通普攻:只追到攻击距,进入后停步面向出手
      if (!inAttackRange) {
        return {
          kind: 'engage',
          moveTo: { x: target.position.x, z: target.position.z },
          forwardRad,
          shouldCast: false,
          targetId,
        };
      }

      return {
        kind: 'engage',
        moveTo: null,
        forwardRad,
        shouldCast,
        targetId,
      };
    },
  };
}
