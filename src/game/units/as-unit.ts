// 把 EntityVisualHandle 包装为 Skill 框架的 Unit。
import type { EntityVisualHandle } from '../../engine/renderer/entity-visuals';
import type { Unit } from '../skills/types';

export function asUnit(
  visual: EntityVisualHandle,
  id: string,
  hp = 1000,
  isStatic = false,
): Unit {
  return {
    id,
    team: 'blue',
    position: { x: visual.root.position.x, z: visual.root.position.z },
    hp,
    hpMax: hp,
    isStatic,
    facingRad: 0,
    hidden: { inBush: false, outOfVisionFrom: new Set<string>() },
  };
}
