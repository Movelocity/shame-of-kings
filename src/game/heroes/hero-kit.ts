import type { HitGeometry, Skill } from '../skills/types';

export const HERO_HOTKEYS = ['0', '1', '2', '3'] as const;
export type HeroHotkey = (typeof HERO_HOTKEYS)[number];
export type AimKind = 'none' | 'direction' | 'lock-target' | 'area';
export const AIM_KINDS: readonly AimKind[] = ['none', 'direction', 'lock-target', 'area'];

export interface HeroAimData {
  maxRange?: number;
  preview?: HitGeometry;
}

export interface HeroSkillSlotData {
  id: string;
  name: string;
  hotkey: string;
  displacement: Skill['displacement'];
  castTime: number;
  activeTime: number;
  recoveryTime: number;
  cooldown: number;
  castMode?: Skill['castMode'];
  aimKind?: AimKind;
  aim?: HeroAimData;
  effect: HeroSkillEffectData;
}

export type HeroSkillEffectData =
  | {
      kind: 'move-speed-buff';
      moveSpeedBoost: number;
      duration: number;
      enhancedAttackDashDistance: number;
      enhancedAttackDashSpeed: number;
      enhancedAttackAcquireRange: number;
    }
  | { kind: 'periodic-damage'; radius: number; damage: number; damageInterval: number; damageTicks: number }
  | {
      kind: 'dash-landing-knockup';
      radius: number;
      damage: number;
      dashDistance: number;
      dashSpeed: number;
      acquireRange: number;
      knockupDuration: number;
    }
  | {
      kind: 'attack-damage';
      geometry: HitGeometry;
      attackRange: number;
      autoAcquireRangeMultiplier: number;
      projectileSpeed?: number;
      projectileRangeMultiplier?: number;
      homing?: boolean;
      onTargetLost?: 'expire' | 'continue-forward' | 'retarget';
      projectileCollisionRadius?: number;
    }
  | {
      kind: 'spawn-projectile';
      speed: number;
      maxRange: number;
      collisionRadius?: number;
      homing?: boolean;
      onTargetLost?: 'expire' | 'continue-forward' | 'retarget';
      pierce?: number;
      damage: number;
      projectileCount?: number;
      projectileSpawnInterval?: number;
    }
  | { kind: 'spawn-swept-rect'; speed: number; maxRange: number; halfWidth: number; halfDepth: number; damage: number }
  | {
      kind: 'projectile-then-zone';
      projectileSpeed: number;
      projectileMaxRange: number;
      projectileCollisionRadius?: number;
      projectileDamage: number;
      zoneRadius: number;
      zoneTickInterval: number;
      zoneTicks: number;
      zoneDamage: number;
    }
  | {
      kind: 'convergent-burst';
      projectileCount: number;
      projectileSpeed: number;
      travelDistance: number;
      fanHalfAngle: number;
      spawnInterval: number;
      collisionRadius: number;
      damage: number;
    }
  | {
      kind: 'beam-channel';
      geometry: HitGeometry;
      tickInterval: number;
      ticks: number;
      damage: number;
    };

export interface HeroKitData {
  id: string;
  displayName: string;
  stats: { hpMax: number; attackDamage: number; moveSpeed: number };
  skills: HeroSkillSlotData[];
}

export function resolveAutoAttackRanges(effect: HeroSkillEffectData) {
  if (effect.kind !== 'attack-damage') return null;
  const attackRange = effect.attackRange * (effect.projectileRangeMultiplier ?? 1);
  return { attackRange, acquireRange: attackRange * effect.autoAcquireRangeMultiplier };
}

export function isProjectileAutoAttack(effect: HeroSkillEffectData): boolean {
  return effect.kind === 'attack-damage' && effect.projectileSpeed !== undefined;
}

export function assertFourSkillKit(data: unknown): asserts data is HeroKitData {
  if (!isRecord(data) || typeof data.id !== 'string' || typeof data.displayName !== 'string') {
    throw new Error('hero kit: id and displayName must be strings');
  }
  if (!isRecord(data.stats)) throw new Error(`hero kit "${data.id}": stats required`);
  for (const key of ['hpMax', 'attackDamage', 'moveSpeed']) {
    if (typeof data.stats[key] !== 'number') throw new Error(`hero kit "${data.id}": stats.${key} required`);
  }
  if (!Array.isArray(data.skills) || data.skills.length !== HERO_HOTKEYS.length) {
    throw new Error(`hero kit "${data.id}": must define exactly four skills`);
  }
  for (const slot of data.skills) assertSkillSlot(data.id, slot);
  for (const hotkey of HERO_HOTKEYS) {
    if (data.skills.filter((slot) => slot.hotkey === hotkey).length !== 1) {
      throw new Error(`hero kit "${data.id}": hotkey "${hotkey}" must appear exactly once`);
    }
  }
}

function assertSkillSlot(heroId: string, value: unknown): asserts value is HeroSkillSlotData {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    throw new Error(`hero kit "${heroId}": skill id and name must be strings`);
  }
  if ('hit' in value) throw new Error(`hero kit "${heroId}": skill "${value.id}" must not define top-level hit`);
  if (!HERO_HOTKEYS.includes(value.hotkey as HeroHotkey)) throw new Error(`hero kit "${heroId}": invalid hotkey`);
  if (!['ground', 'dash', 'teleport', 'none'].includes(value.displacement as string)) throw new Error(`hero kit "${heroId}": invalid displacement`);
  for (const key of ['castTime', 'activeTime', 'recoveryTime', 'cooldown'] as const) {
    if (typeof value[key] !== 'number' || value[key] < 0) throw new Error(`hero kit "${heroId}": ${key} must be non-negative`);
  }
  if (value.aimKind !== undefined && !AIM_KINDS.includes(value.aimKind as AimKind)) throw new Error(`hero kit "${heroId}": invalid aimKind`);
  if (value.aim !== undefined) {
    if (!isRecord(value.aim)) throw new Error(`hero kit "${heroId}": invalid aim`);
    if (value.aim.maxRange !== undefined && (!(value.aim.maxRange as number > 0))) throw new Error(`hero kit "${heroId}": aim.maxRange must be positive`);
    if (value.aim.preview !== undefined && !isHitGeometry(value.aim.preview)) throw new Error(`hero kit "${heroId}": invalid aim.preview`);
  }
  assertEffectConfig(value.effect, heroId, value.id);
}

export function assertEffectConfig(
  effect: unknown,
  heroId = 'unknown',
  skillId = 'unknown',
): asserts effect is HeroSkillEffectData {
  if (!isRecord(effect) || typeof effect.kind !== 'string') throw new Error(`hero kit "${heroId}": skill "${skillId}" requires effect.kind`);
  const fields: Record<HeroSkillEffectData['kind'], readonly string[]> = {
    'move-speed-buff': ['moveSpeedBoost', 'duration', 'enhancedAttackDashDistance', 'enhancedAttackDashSpeed', 'enhancedAttackAcquireRange'],
    'periodic-damage': ['radius', 'damage', 'damageInterval', 'damageTicks'],
    'dash-landing-knockup': ['radius', 'damage', 'dashDistance', 'dashSpeed', 'acquireRange', 'knockupDuration'],
    'attack-damage': ['attackRange', 'autoAcquireRangeMultiplier'],
    'spawn-projectile': ['speed', 'maxRange', 'damage'],
    'spawn-swept-rect': ['speed', 'maxRange', 'halfWidth', 'halfDepth', 'damage'],
    'projectile-then-zone': ['projectileSpeed', 'projectileMaxRange', 'projectileDamage', 'zoneRadius', 'zoneTickInterval', 'zoneTicks', 'zoneDamage'],
    'convergent-burst': ['projectileCount', 'projectileSpeed', 'travelDistance', 'fanHalfAngle', 'spawnInterval', 'collisionRadius', 'damage'],
    'beam-channel': ['tickInterval', 'ticks', 'damage'],
  };
  const required = fields[effect.kind as HeroSkillEffectData['kind']];
  if (!required) throw new Error(`hero kit "${heroId}": unknown effect "${effect.kind}"`);
  for (const field of required) {
    if (typeof effect[field] !== 'number' || (effect[field] as number) < 0) throw new Error(`hero kit "${heroId}": effect.${field} must be non-negative`);
  }
  if ((effect.kind === 'attack-damage' || effect.kind === 'beam-channel') && !isHitGeometry(effect.geometry)) throw new Error(`hero kit "${heroId}": effect.geometry required`);
  if (['spawn-projectile', 'spawn-swept-rect', 'projectile-then-zone', 'convergent-burst'].includes(effect.kind)) {
    const speed = effect.speed ?? effect.projectileSpeed;
    if (typeof speed !== 'number' || speed <= 0) throw new Error(`hero kit "${heroId}": effect speed must be positive`);
  }
  if (effect.kind === 'convergent-burst' && effect.projectileCount < 1) throw new Error(`hero kit "${heroId}": projectileCount must be >= 1`);
}

function isHitGeometry(value: unknown): value is HitGeometry {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'self') return true;
  if (value.kind === 'circle') return typeof value.radius === 'number' && value.radius >= 0;
  if (value.kind === 'rect') return typeof value.halfWidth === 'number' && value.halfWidth >= 0 && typeof value.halfDepth === 'number' && value.halfDepth >= 0;
  if (value.kind === 'cone') return typeof value.range === 'number' && value.range >= 0 && typeof value.halfAngleRad === 'number' && value.halfAngleRad >= 0;
  return value.kind === 'target' && typeof value.range === 'number' && value.range >= 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}
