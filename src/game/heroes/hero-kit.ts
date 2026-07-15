// 四槽位英雄 kit 契约:hotkey 0(普攻) + 1/2/3(主动)
// 元歌 / 镜等后续英雄复用 assertFourSkillKit + HeroKitData
import type { HitShape, Skill } from '../skills/types';

export const HERO_HOTKEYS = ['0', '1', '2', '3'] as const;
export type HeroHotkey = (typeof HERO_HOTKEYS)[number];

/** 英雄 JSON 中单个技能槽位(数据层) */
export interface HeroSkillSlotData {
  id: string;
  name: string;
  hotkey: string;
  hit: HitShape;
  displacement: Skill['displacement'];
  castTime: number;
  activeTime: number;
  recoveryTime: number;
  cooldown: number;
  castMode?: Skill['castMode'];
  effect: HeroSkillEffectData;
}

/** effect 可扩展字段;各英雄 loader 按需读取 */
export type HeroSkillEffectData =
  | {
      kind: 'move-speed-buff';
      moveSpeedBoost: number;
      duration: number;
      acquireRange: number;
    }
  | {
      kind: 'periodic-damage';
      damage: number;
      damageInterval: number;
      damageTicks: number;
    }
  | {
      kind: 'dash-landing-knockup';
      damage: number;
      dashDistance: number;
      knockupDuration: number;
    }
  | {
      kind: 'attack-damage';
      attackRange: number;
      acquireRange: number;
    };

/** 英雄 kit JSON 顶层契约 */
export interface HeroKitData {
  id: string;
  displayName: string;
  skills: HeroSkillSlotData[];
}

/**
 * 校验四槽位 hotkey 完整且不重复。
 * 失败抛 Error;通过则静默返回。
 */
export function assertFourSkillKit(data: unknown): asserts data is HeroKitData {
  if (!isRecord(data) || typeof data.id !== 'string' || typeof data.displayName !== 'string') {
    throw new Error('hero kit: id and displayName must be strings');
  }
  if (!Array.isArray(data.skills) || data.skills.length !== HERO_HOTKEYS.length) {
    throw new Error(`hero kit "${data.id}": must define exactly four skills`);
  }
  for (const skill of data.skills) assertSkillSlot(data.id, skill);

  const hotkeys = data.skills.map((s) => s.hotkey);
  for (const hk of HERO_HOTKEYS) {
    const count = hotkeys.filter((h) => h === hk).length;
    if (count !== 1) {
      throw new Error(
        `hero kit "${data.id}": hotkey "${hk}" must appear exactly once, got ${count}`,
      );
    }
  }
}

function assertSkillSlot(heroId: string, value: unknown): asserts value is HeroSkillSlotData {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    throw new Error(`hero kit "${heroId}": skill id and name must be strings`);
  }
  if (!HERO_HOTKEYS.includes(value.hotkey as HeroHotkey)) {
    throw new Error(`hero kit "${heroId}": invalid hotkey for skill "${value.id}"`);
  }
  if (!isHitShape(value.hit) || !['ground', 'dash', 'none'].includes(value.displacement as string)) {
    throw new Error(`hero kit "${heroId}": invalid targeting for skill "${value.id}"`);
  }
  for (const key of ['castTime', 'activeTime', 'recoveryTime', 'cooldown'] as const) {
    if (typeof value[key] !== 'number' || value[key] < 0) {
      throw new Error(`hero kit "${heroId}": ${key} must be a non-negative number`);
    }
  }
  if (value.castMode !== undefined && value.castMode !== 'instant' && value.castMode !== 'targeted') {
    throw new Error(`hero kit "${heroId}": invalid castMode for skill "${value.id}"`);
  }
  assertEffect(heroId, value.id, value.effect);
}

function assertEffect(heroId: string, skillId: string, effect: unknown): asserts effect is HeroSkillEffectData {
  if (!isRecord(effect) || typeof effect.kind !== 'string') {
    throw new Error(`hero kit "${heroId}": skill "${skillId}" requires an effect.kind`);
  }
  const numericFields: Record<HeroSkillEffectData['kind'], readonly string[]> = {
    'move-speed-buff': ['moveSpeedBoost', 'duration', 'acquireRange'],
    'periodic-damage': ['damage', 'damageInterval', 'damageTicks'],
    'dash-landing-knockup': ['damage', 'dashDistance', 'knockupDuration'],
    'attack-damage': ['attackRange', 'acquireRange'],
  };
  const fields = numericFields[effect.kind as HeroSkillEffectData['kind']];
  if (!fields) throw new Error(`hero kit "${heroId}": unknown effect "${effect.kind}"`);
  for (const field of fields) {
    if (typeof effect[field] !== 'number' || effect[field] < 0) {
      throw new Error(`hero kit "${heroId}": effect.${field} must be a non-negative number`);
    }
  }
}

function isHitShape(value: unknown): value is HitShape {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'self') return true;
  if (value.kind === 'circle') return typeof value.radius === 'number' && value.radius >= 0;
  if (value.kind === 'rect') {
    return typeof value.halfWidth === 'number' && value.halfWidth >= 0 && typeof value.halfDepth === 'number' && value.halfDepth >= 0;
  }
  if (value.kind === 'cone') {
    return typeof value.range === 'number' && value.range >= 0 && typeof value.halfAngleRad === 'number' && value.halfAngleRad >= 0;
  }
  return value.kind === 'target' && typeof value.range === 'number' && value.range >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
