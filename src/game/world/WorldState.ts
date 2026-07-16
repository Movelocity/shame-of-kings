import type { CombatEvent, Unit, WorldLike } from '../skills/types';
import type { Vec2 } from '../skills/vec2';
import { spawnZoneIfProjectileExpired } from './skill-effects/spawn';
import type { SkillEffectEntity } from './skill-effects/types';

export type DamageEvent = Extract<CombatEvent, { kind: 'damage' }>;
export type DamageListener = (events: readonly DamageEvent[]) => void;

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
  notifyDamage(events: readonly DamageEvent[]): void;
  spawnEffect(effect: SkillEffectEntity): void;
  tickEffects(dt: number): readonly CombatEvent[];
  clearEffects(): void;
}

export function createWorldState(init: WorldStateInit): WorldStateHandle {
  const units = new Map(init.units.map((unit) => [unit.id, unit]));
  const effects = new Map<string, SkillEffectEntity>();
  const listeners = new Set<DamageListener>();
  const canSee = init.canSee ?? (() => true);
  const effectWorld = {
    unitsNear(_origin: Vec2, _radius: number): readonly Unit[] {
      return [...units.values()];
    },
    getUnit(id: string): Unit | null {
      return units.get(id) ?? null;
    },
    spawnEffect(effect: SkillEffectEntity): void {
      effects.set(effect.id, effect);
    },
    canSee(observer: Unit, target: Unit): boolean {
      return canSee(observer, target);
    },
  };

  return {
    unitsNear: effectWorld.unitsNear,
    canSee: effectWorld.canSee,
    get units() {
      return units;
    },
    get effects() {
      return effects;
    },
    subscribeDamage(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    register(unit) {
      units.set(unit.id, unit);
    },
    unregister(unitId) {
      units.delete(unitId);
    },
    getUnit: effectWorld.getUnit,
    notifyDamage(events) {
      for (const listener of listeners) listener(events);
    },
    spawnEffect: effectWorld.spawnEffect,
    tickEffects(dt) {
      const events: CombatEvent[] = [];
      const expiredIds: string[] = [];
      for (const [id, effect] of effects) {
        if (effect.destroyWhenOwnerGone) {
          const owner = units.get(effect.ownerId);
          if (!owner || owner.hp <= 0) effect.expired = true;
        }
        events.push(...effect.tick(dt, { world: effectWorld, now: 0 }));
        if (effect.expired) {
          spawnZoneIfProjectileExpired(effect, effectWorld);
          expiredIds.push(id);
        }
      }
      for (const id of expiredIds) effects.delete(id);
      return events;
    },
    clearEffects() {
      effects.clear();
    },
  };
}
