// M3 T3.2:木人桩(proposal §2.2 commit 守则:永远静止,takes damage only)
//
// 用工厂函数返回 Unit,避免 erasableSyntaxOnly 禁 class 字段简写。
// P2 T5C.4 的 JungleMob 复用 createDummyUnit 作为最小参考实现。
import type { Unit } from '../skills/types';

export const PRACTICE_DUMMY_ID = 'practice-dummy';
export const PRACTICE_DUMMY_HP_MAX = 1000;
/** 存活时每秒自动回复生命值(未满血时生效) */
export const PRACTICE_DUMMY_REGEN_PER_SEC = 50;
export const PRACTICE_DUMMY_POSITION = { x: 0, z: 0 } as const;

/** 创建木人桩 Unit;isStatic=true,hp=hpMax */
export function createPracticeDummy(): Unit {
  return {
    id: PRACTICE_DUMMY_ID,
    team: 'neutral',
    position: { x: PRACTICE_DUMMY_POSITION.x, z: PRACTICE_DUMMY_POSITION.z },
    hp: PRACTICE_DUMMY_HP_MAX,
    hpMax: PRACTICE_DUMMY_HP_MAX,
    isStatic: true,
    facingRad: 0, // 永远静止,朝向不参与计算;占位即可
    hidden: { inBush: false, outOfVisionFrom: new Set<string>() },
  };
}
