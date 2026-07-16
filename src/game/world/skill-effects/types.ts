import type {
  CollisionShape,
  CombatEvent,
  DamageSnapshot,
  Team,
  Unit,
} from '../../skills/types';
import type { Vec2 } from '../../skills/vec2';

export type OnTargetLostPolicy = 'expire' | 'continue-forward' | 'retarget';

export interface HitPolicy {
  maxHits?: number;
  maxHitsPerTarget?: number;
  pierce?: number;
}

export interface SkillEffectEntity {
  readonly id: string;
  readonly castId: string;
  readonly ownerId: string;
  readonly sourceTeam: Team;
  readonly skillId: string;
  readonly kind:
    | 'projectile'
    | 'persistent-area'
    | 'swept-rect'
    | 'projectile-burst'
    | 'convergent-burst';
  expired: boolean;
  readonly destroyWhenOwnerGone?: boolean;
  tick(dt: number, ctx: EffectTickContext): readonly CombatEvent[];
}

export interface EffectTickContext {
  readonly world: EffectWorldLike;
  readonly now: number;
}

export interface EffectWorldLike {
  unitsNear(origin: Vec2, radius: number): readonly Unit[];
  getUnit(id: string): Unit | null;
  spawnEffect(effect: SkillEffectEntity): void;
  canSee(observer: Unit, target: Unit): boolean;
}

export interface ProjectileConfig {
  readonly speed: number;
  readonly maxRange: number;
  readonly collision: Extract<CollisionShape, { kind: 'circle' }>;
  readonly homing?: boolean;
  readonly onTargetLost?: OnTargetLostPolicy;
  readonly hitPolicy?: HitPolicy;
  readonly damage: DamageSnapshot;
  readonly targetId?: string;
  readonly forwardRad: number;
  readonly origin: Vec2;
  readonly spawnZoneOnExpire?: PersistentAreaConfig;
}

export interface PersistentAreaConfig {
  readonly radius: number;
  readonly tickInterval: number;
  readonly ticks: number;
  readonly damage: DamageSnapshot;
}

let effectIdCounter = 0;

export function nextEffectId(prefix = 'effect'): string {
  effectIdCounter += 1;
  return `${prefix}-${effectIdCounter}`;
}

export function settlementFromDamage(snapshot: DamageSnapshot) {
  return {
    baseDamage: snapshot.amount,
    scalesWithAttackPower: snapshot.scalesWithAttackPower,
    isCrit: snapshot.isCrit,
    timing: 'at-spawn' as const,
  };
}

export function effectOwner(
  world: EffectWorldLike,
  ownerId: string,
  sourceTeam: Team,
  position: Vec2,
): Unit {
  return world.getUnit(ownerId) ?? {
    id: ownerId,
    team: sourceTeam,
    position: { ...position },
    hp: 1,
    hpMax: 1,
    isStatic: false,
    targetable: false,
    collisionRadius: 0.5,
    facingRad: 0,
    hidden: { inBush: false, outOfVisionFrom: new Set() },
  };
}
