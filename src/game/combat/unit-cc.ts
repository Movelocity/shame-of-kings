// 单位 CC 状态(击飞等);由 practice-session 每帧 tick
import type { Unit, UnitCc } from '../skills/types';

export type CcKind = UnitCc['kind'];

/** 对单位施加击飞 */
export function applyKnockup(unit: Unit, duration: number): void {
  if (!(duration > 0)) return;
  unit.cc = { kind: 'knockup', remaining: duration };
}

/** 推进 CC 计时;remaining 降至 0 时清除 */
export function tickCc(unit: Unit, dt: number): void {
  if (!unit.cc || !(dt > 0)) return;
  unit.cc.remaining -= dt;
  if (unit.cc.remaining <= 1e-9) {
    delete unit.cc;
  }
}

/** 清除单位 CC(重置链路用) */
export function clearCc(unit: Unit): void {
  delete unit.cc;
}

/** 批量 tick 场上所有单位 */
export function tickAllCc(units: Iterable<Unit>, dt: number): void {
  for (const u of units) tickCc(u, dt);
}

/** 批量清空 CC */
export function clearAllCc(units: Iterable<Unit>): void {
  for (const u of units) clearCc(u);
}
