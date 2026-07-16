import type { DamageSnapshot, Team } from '../../skills/types';
import type { Vec2 } from '../../skills/vec2';

export type OnTargetLostPolicy = 'expire' | 'continue-forward' | 'retarget';

/** 弹道/区域命中策略 */
export interface HitPolicy {
  /** 总命中次数上限;1 = 首敌停止 */
  maxHits?: number;
  /** 同一目标最多命中次数 */
  maxHitsPerTarget?: number;
  /** 穿透次数(额外穿过目标继续飞) */
  pierce?: number;
}

export interface SkillEffectEntity {
  readonly id: string;
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
  /** 施法者离场后是否销毁;默认 false */
  readonly destroyWhenOwnerGone?: boolean;
  tick(dt: number, ctx: EffectTickContext): readonly EffectDamageEvent[];
}

export interface EffectDamageEvent {
  readonly targetId: string;
  readonly damage: number;
  readonly isCrit: boolean;
}

export interface EffectTickContext {
  readonly world: EffectWorldLike;
  readonly now: number;
}

export interface EffectWorldLike {
  unitsNear(origin: Vec2, radius: number): readonly import('../../skills/types').Unit[];
  getUnit(id: string): import('../../skills/types').Unit | null;
  spawnEffect(effect: SkillEffectEntity): void;
  canSee(observer: import('../../skills/types').Unit, target: import('../../skills/types').Unit): boolean;
}

export interface ProjectileConfig {
  readonly speed: number;
  readonly maxRange: number;
  readonly collisionRadius: number;
  readonly homing?: boolean;
  readonly onTargetLost?: OnTargetLostPolicy;
  readonly hitPolicy?: HitPolicy;
  readonly damage: DamageSnapshot;
  readonly targetId?: string;
  readonly forwardRad: number;
  readonly origin: Vec2;
  /** 命中或寿命终点生成持续区域 */
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

/** 从 DamageSnapshot 结算数值 */
export function resolveDamageAmount(
  snapshot: DamageSnapshot,
  attackPowerMultiplier = 1,
): number {
  const mult = snapshot.scalesWithAttackPower ? attackPowerMultiplier : 1;
  return snapshot.amount * mult;
}
