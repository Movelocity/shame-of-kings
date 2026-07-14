// M2 T2.5 临时桥接:把 scene.ts 的 player / dummy EntityVisualHandle
// 适配为 Skill 框架的 Unit + WorldLike。
//
// ⚠️ 这是 M2 调试期最小桥接;M3 T3.3 将替换为正式的 WorldState.ts。
// 不要把此文件当长期 API,只服务于"按键触发调试技能 + 命中/扣血验证"。
import type { Unit, WorldLike } from '../../skills/types';
import type { Vec2 } from '../../skills/vec2';
import type { EntityVisualHandle } from '../../../engine/renderer/entity-visuals';

/** 把 EntityVisualHandle 包装为 Unit。
 *  hp/hpMax 在 M2 阶段固定值,M3 接入正式血量系统时由 WorldState 替换。 */
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
    hidden: { inBush: false, outOfVisionFrom: new Set<string>() },
  };
}

/** 简化 WorldLike:固定一个 caster + 一个 dummy target
 *  用函数式对象(避开 erasableSyntaxOnly 禁的 class 字段简写) */
export function createDebugWorld(caster: Unit, target: Unit | null): WorldLike {
  const unitsList: Unit[] = target ? [caster, target] : [caster];
  return {
    unitsNear(_origin: Vec2, _radius: number): readonly Unit[] {
      // M2 阶段不做 AABB 预过滤,直接返回所有 unit
      return unitsList;
    },
    canSee(_observer: Unit, _target: Unit): boolean {
      // M2 阶段总是可见;P2 T5C.3 起实现草丛/墙后
      return true;
    },
  };
}

// 兼容旧 export 名(避免 .ts 调用点改太多)
export const DebugWorld = { create: createDebugWorld };
