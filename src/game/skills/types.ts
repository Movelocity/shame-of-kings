import type { BuffBag } from '../buffs/buff-bag';
import type { Vec2 } from './vec2';

export interface UnitCc {
  kind: 'knockup';
  remaining: number;
}

export type HitGeometry =
  | { kind: 'self' }
  | { kind: 'circle'; radius: number }
  | { kind: 'rect'; halfWidth: number; halfDepth: number }
  | { kind: 'cone'; range: number; halfAngleRad: number }
  | { kind: 'target'; range: number };

export type CollisionShape =
  | { kind: 'circle'; radius: number }
  | { kind: 'rect'; halfWidth: number; halfDepth: number };

export interface AimGeometry {
  readonly maxRange?: number;
  readonly preview?: HitGeometry;
}

export type Displacement = 'ground' | 'dash' | 'teleport' | 'none';
export type HitOrigin = 'caster' | 'cast';
export type Team = 'blue' | 'red' | 'neutral';
export const DEFAULT_COLLISION_RADIUS = 0.5;

export interface CastSnapshot {
  readonly castId: string;
  readonly casterId: string;
  readonly skillId: string;
  readonly origin: Vec2;
  readonly forwardRad: number;
  readonly targetId?: string;
  readonly targetPoint?: Vec2;
  readonly dashDistance?: number;
}

export interface DamageSnapshot {
  readonly amount: number;
  readonly isCrit?: boolean;
  readonly scalesWithAttackPower?: boolean;
}

export interface SettlementSpec {
  readonly baseDamage: number;
  readonly scalesWithAttackPower?: boolean;
  readonly isCrit?: boolean;
  readonly ignoreVisibility?: boolean;
  readonly timing?: 'at-spawn' | 'at-hit';
}

export type CombatEvent =
  | {
      readonly kind: 'damage';
      readonly sourceId: string;
      readonly skillId: string;
      readonly targetId: string;
      readonly payload: { readonly damage: number; readonly isCrit: boolean };
    }
  | {
      readonly kind: 'knockup';
      readonly sourceId: string;
      readonly skillId: string;
      readonly targetId: string;
      readonly payload: { readonly duration: number };
    };

export type SkillDelivery =
  | {
      readonly mode: 'instant-hit';
      readonly geometry: HitGeometry;
      readonly settlement: SettlementSpec;
      readonly hitOrigin?: HitOrigin;
    }
  | {
      readonly mode: 'interval-hit';
      readonly geometry: HitGeometry;
      readonly settlement: SettlementSpec;
      readonly interval: number;
      readonly ticks: number;
      readonly hitOrigin?: HitOrigin;
    }
  | {
      readonly mode: 'spawn-effect';
      readonly effectKind: string;
      readonly effectConfig: unknown;
    }
  | { readonly mode: 'buff-only' }
  | { readonly mode: 'composite'; readonly parts: readonly SkillDelivery[] };

export interface TargetFilter {
  readonly casterId: string;
  readonly casterTeam: Team;
  readonly includeNeutral?: boolean;
  readonly targetableOnly?: boolean;
}

export interface HiddenState {
  inBush: boolean;
  outOfVisionFrom: ReadonlySet<string>;
}

export interface Unit {
  readonly id: string;
  readonly team: Team;
  position: Vec2;
  hp: number;
  hpMax: number;
  isStatic: boolean;
  targetable: boolean;
  collisionRadius: number;
  facingRad: number;
  hidden: HiddenState;
  cc?: UnitCc;
}

export interface TowerUnit extends Unit {
  readonly range: number;
  readonly attackInterval: number;
  lastAttackAt: number;
}

export interface Hit {
  target: Unit | null;
  origin: Vec2;
  forwardRad: number;
}

export interface SkillContext {
  caster: Unit | TowerUnit;
  world: WorldLike;
  now: number;
  buffs?: BuffBag;
  castSnapshot?: CastSnapshot;
}

export interface WorldLike {
  unitsNear(origin: Vec2, radius: number): readonly Unit[];
  canSee(observer: Unit | TowerUnit, target: Unit): boolean;
}

export interface Skill {
  readonly id: string;
  readonly displayName: string;
  readonly delivery: SkillDelivery;
  readonly aim?: AimGeometry;
  readonly displacement: Displacement;
  readonly castTime: number;
  readonly activeTime: number;
  readonly recoveryTime: number;
  readonly cooldown: number;
  readonly dashDistance: number;
  readonly dashSpeed: number;
  readonly castMode: 'instant' | 'targeted';
  readonly onActivate?: (ctx: SkillContext) => void;
  readonly onLand?: (ctx: SkillContext) => readonly CombatEvent[];
}

export interface SkillInstance {
  readonly skill: Skill;
  phase: 'cast' | 'active' | 'recovery' | 'done';
  elapsed: number;
  cooldownTimer: number;
  origin: Vec2;
  forwardRad: number;
  readonly castSnapshot: CastSnapshot;
  cancel(): void;
  events: readonly CombatEvent[];
  hitboxActivations: number;
  dashDistanceTravelled: number;
  readonly dashDistanceTotal: number;
  tick(dt: number, ctx: SkillContext): readonly CombatEvent[];
}
