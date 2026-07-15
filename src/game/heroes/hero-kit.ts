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
export interface HeroSkillEffectData {
  damage?: number;
  hits?: number;
  dashDistance?: number;
  moveSpeedBoost?: number;
  duration?: number;
  nextAttackBonus?: number;
  stunDuration?: number;
  attackRange?: number;
  acquireRange?: number;
  aoeRadius?: number;
  damageInterval?: number;
  damageTicks?: number;
  knockupDuration?: number;
}

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
export function assertFourSkillKit(data: HeroKitData): void {
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
