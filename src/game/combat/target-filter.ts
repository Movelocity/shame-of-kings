// 命中粗筛:阵营/存活/可选中;不含视野(由 settlement 结算)
import type { TargetFilter, Unit } from '../skills/types';

/** 默认粗筛:跳过自身、同阵营、hp≤0;中立默认可打 */
export function defaultTargetFilter(caster: Unit): TargetFilter {
  return {
    casterId: caster.id,
    casterTeam: caster.team,
    includeNeutral: true,
    targetableOnly: true,
  };
}

/** 判断单位是否通过粗筛 */
export function passesTargetFilter(unit: Unit, filter: TargetFilter): boolean {
  if (unit.id === filter.casterId) return false;
  if (unit.hp <= 0) return false;
  if (filter.targetableOnly !== false && unit.targetable === false) return false;
  if (unit.team === filter.casterTeam) return false;
  if (unit.team === 'neutral') return filter.includeNeutral !== false;
  return true;
}

/** 从候选列表中过滤出合法目标 */
export function filterTargets(
  candidates: readonly Unit[],
  filter: TargetFilter,
): Unit[] {
  return candidates.filter((u) => passesTargetFilter(u, filter));
}
