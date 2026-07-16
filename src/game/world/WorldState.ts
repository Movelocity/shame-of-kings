// M3 T3.3:WorldState — 替换 M2 临时 DebugWorld
// 内容:unit 注册表 + WorldLike 实现 + onDamage 订阅 + effect 生命周期
import type { DamageResult, Unit, WorldLike } from '../skills/types';
import type { Vec2 } from '../skills/vec2';
import { spawnZoneIfProjectileExpired } from './skill-effects/spawn';
import type { EffectDamageEvent, SkillEffectEntity } from './skill-effects/types';

export type DamageListener = (results: readonly DamageResult[]) => void;

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

export interface EffectTickResult {
  readonly damageEvents: readonly EffectDamageEvent[];
  readonly expiredIds: readonly string[];
}

export interface WorldStateInit {
  units: readonly Unit[];
  canSee?: (observer: Unit, target: Unit) => boolean;
}

export interface WorldStateHandle extends WorldLike {
  readonly units: ReadonlyMap<string, Unit>;
  readonly effects: ReadonlyMap<string, SkillEffectEntity>;
  subscribeDamage(fn: DamageListener): () => void;
  register(unit: Unit): void;
  unregister(unitId: string): void;
  getUnit(id: string): Unit | null;
  notifyDamage(results: readonly DamageResult[]): void;
  spawnEffect(effect: SkillEffectEntity): void;
  tickEffects(dt: number): EffectTickResult;
  clearEffects(): void;
}

export function createWorldState(init: WorldStateInit): WorldStateHandle {
  const unitsMap = new Map<string, Unit>();
  for (const u of init.units) unitsMap.set(u.id, u);
  const effectsMap = new Map<string, SkillEffectEntity>();
  const canSee = init.canSee ?? (() => true);
  const bus = createDamageBus();

  const effectWorld = {
    unitsNear(_origin: Vec2, _radius: number): readonly Unit[] {
      return Array.from(unitsMap.values());
    },
    getUnit(id: string): Unit | null {
      return unitsMap.get(id) ?? null;
    },
    spawnEffect(effect: SkillEffectEntity): void {
      effectsMap.set(effect.id, effect);
    },
    canSee(observer: Unit, target: Unit): boolean {
      return canSee(observer, target);
    },
  };

  const world: WorldLike = {
    unitsNear(_origin: Vec2, _radius: number): readonly Unit[] {
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
    get effects() {
      return effectsMap;
    },
    subscribeDamage(fn) {
      return bus.subscribe(fn);
    },
    register(unit) {
      unitsMap.set(unit.id, unit);
    },
    unregister(unitId) {
      unitsMap.delete(unitId);
    },
    getUnit(id) {
      return unitsMap.get(id) ?? null;
    },
    notifyDamage(results) {
      bus.emit(results);
    },
    spawnEffect(effect) {
      effectsMap.set(effect.id, effect);
    },
    tickEffects(dt) {
      const damageEvents: EffectDamageEvent[] = [];
      const expiredIds: string[] = [];

      for (const [id, effect] of effectsMap) {
        if (effect.destroyWhenOwnerGone) {
          const owner = unitsMap.get(effect.ownerId);
          if (!owner || owner.hp <= 0) {
            effect.expired = true;
          }
        }

        const events = effect.tick(dt, { world: effectWorld, now: 0 });
        damageEvents.push(...events);

        if (effect.expired) {
          spawnZoneIfProjectileExpired(effect, effectWorld);
          expiredIds.push(id);
        }
      }

      for (const id of expiredIds) {
        effectsMap.delete(id);
      }

      return { damageEvents, expiredIds };
    },
    clearEffects() {
      effectsMap.clear();
    },
  };
}

/** effect 伤害事件转 DamageResult */
export function effectEventsToDamageResults(
  events: readonly EffectDamageEvent[],
): DamageResult[] {
  return events.map((e) => ({
    targetId: e.targetId,
    damage: e.damage,
    isCrit: e.isCrit,
  }));
}
