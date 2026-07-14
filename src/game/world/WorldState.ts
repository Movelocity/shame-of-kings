// M3 T3.3:WorldState — 替换 M2 临时 DebugWorld
// 内容:unit 注册表 + WorldLike 实现 + onDamage 订阅
// P2 T5C.4 加 JungleMob / TowerUnit 也走 register
import type { DamageResult, Unit, WorldLike } from '../skills/types';
import type { Vec2 } from '../skills/vec2';

export type DamageListener = (results: readonly DamageResult[]) => void;

/** 简易事件总线:Damage 结算时通知订阅者(飘字、HUD 等) */
function createDamageBus(): {
  emit(results: readonly DamageResult[]): void;
  subscribe(fn: DamageListener): () => void;
} {
  const listeners = new Set<DamageListener>();
  return {
    emit(results) {
      for (const fn of listeners) fn(results);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export interface WorldStateInit {
  units: readonly Unit[];
  /** 视野检测(M2 阶段总返 true;P2 T5C.3 接真实视野系统) */
  canSee?: (observer: Unit, target: Unit) => boolean;
}

export interface WorldStateHandle extends WorldLike {
  /** unit 注册表(只读视图) */
  readonly units: ReadonlyMap<string, Unit>;
  /** 订阅 damage 事件;返回 unsubscribe */
  subscribeDamage(fn: DamageListener): () => void;
  /** 注册新 unit(M2 阶段 P2 之前不需要;留接口) */
  register(unit: Unit): void;
  /** 拿 unit(找不到返 null) */
  getUnit(id: string): Unit | null;
  /** 维护 damageListener 通知 */
  notifyDamage(results: readonly DamageResult[]): void;
}

export function createWorldState(init: WorldStateInit): WorldStateHandle {
  const unitsMap = new Map<string, Unit>();
  for (const u of init.units) unitsMap.set(u.id, u);
  const canSee = init.canSee ?? (() => true);
  const bus = createDamageBus();

  const world: WorldLike = {
    unitsNear(_origin: Vec2, _radius: number): readonly Unit[] {
      // M2 阶段不做 AABB 预过滤,直接返回所有 unit
      // P2 T5C.2 接 NavigationGrid 时换成 spatial hash
      return Array.from(unitsMap.values());
    },
    canSee(observer: Unit, target: Unit): boolean {
      return canSee(observer, target);
    },
  };

  return {
    ...world,
    get units() {
      return unitsMap;
    },
    subscribeDamage(fn) {
      return bus.subscribe(fn);
    },
    register(unit) {
      unitsMap.set(unit.id, unit);
    },
    getUnit(id) {
      return unitsMap.get(id) ?? null;
    },
    notifyDamage(results) {
      bus.emit(results);
    },
  };
}
