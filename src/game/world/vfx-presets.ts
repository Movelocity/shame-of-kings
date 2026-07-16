// 练习场命中盒 / 指示器颜色预设:瞄准淡、施法深,便于区分预览与正式特效。

/** 瞄准期 hit 预览(aim-preview):淡蓝、低透明,避免遮挡战场 */
export const AIM_HITBOX_PRESET = {
  color: 0xb8e4ff,
  opacity: 0.22,
} as const;

/** 脱手 effect / 弹道等持续绑定几何 */
export const SKILL_HITBOX_BOUND_PRESET = {
  color: 0xff9a1a,
  opacity: 0.5,
} as const;

/** 施法瞬间命中盒闪光 */
export const SKILL_HITBOX_FLASH_PRESET = {
  color: 0xff9a1a,
  opacity: 0.52,
} as const;

/** 脚下方向 / 锁定指示器 */
export const AIM_INDICATOR_PRESET = {
  color: 0xb8e4ff,
  opacity: 0.38,
} as const;

export interface VfxColorPreset {
  readonly color: number;
  readonly opacity: number;
}
