// 一技能突脸意图:锁最近敌人,追到 standoff 落点(与 aaIntent 独立)
import { findNearestEnemy } from './auto-attack-intent';
import {
  DEFAULT_CLOSE_ENGAGE_STANDOFF,
  facingToward,
  pointAtStandoff,
} from './auto-attack-intent';
import type { Unit, WorldLike } from '../skills/types';

export type FaceChargeAction =
  | { kind: 'none' }
  | {
      kind: 'engage';
      moveTo: { x: number; z: number } | null;
      forwardRad: number;
      targetId: string;
    };

export interface FaceChargeTickCtx {
  caster: Unit;
  resolveUnit: (id: string) => Unit | null;
  acquireRange: number;
  standoff?: number;
}

export interface FaceChargeIntent {
  readonly targetId: string | null;
  readonly isActive: boolean;
  /** 锁最近敌并进入突脸意图;无目标返回 false */
  requestCharge(
    caster: Unit,
    world: WorldLike,
    acquireRange: number,
  ): boolean;
  cancel(): void;
  clear(): void;
  tick(ctx: FaceChargeTickCtx): FaceChargeAction;
}

export function createFaceChargeIntent(): FaceChargeIntent {
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

    requestCharge(caster, world, acquireRange) {
      const enemy = findNearestEnemy(world, caster, acquireRange);
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
      const standoff = Math.max(
        0.05,
        ctx.standoff ?? DEFAULT_CLOSE_ENGAGE_STANDOFF,
      );

      if (dist <= standoff) {
        clear();
        return {
          kind: 'engage',
          moveTo: null,
          forwardRad,
          targetId,
        };
      }

      return {
        kind: 'engage',
        moveTo: pointAtStandoff(
          ctx.caster.position,
          target.position,
          standoff,
        ),
        forwardRad,
        targetId,
      };
    },
  };
}
