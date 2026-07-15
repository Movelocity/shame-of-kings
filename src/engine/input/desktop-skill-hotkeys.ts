// 桌面端技能热键:物理键 → 英雄 kit 内部槽位 / 普攻优先级
// 内部槽位仍为 hero-kit 约定的 0(普攻) + 1/2/3(主动);此处只做 UI 与键盘映射。

export type AutoAttackPriority = 'default' | 'minion' | 'tower';

/** 槽位 hotkey → 桌面端显示标签 */
export const DESKTOP_SLOT_LABELS: Readonly<Record<string, string>> = {
  '0': 'J',
  '1': 'U',
  '2': 'I',
  '3': 'O',
  '4': 'P',
};

export type DesktopSkillAction =
  | { kind: 'cast'; slotHotkey: string }
  | { kind: 'attack'; priority: AutoAttackPriority };

const DESKTOP_KEY_TO_ACTION: Readonly<Record<string, DesktopSkillAction>> = {
  j: { kind: 'attack', priority: 'default' },
  k: { kind: 'attack', priority: 'minion' },
  l: { kind: 'attack', priority: 'tower' },
  u: { kind: 'cast', slotHotkey: '1' },
  i: { kind: 'cast', slotHotkey: '2' },
  o: { kind: 'cast', slotHotkey: '3' },
  p: { kind: 'cast', slotHotkey: '4' },
};

/** 解析桌面端技能/普攻键;未识别返回 null */
export function resolveDesktopSkillKey(key: string): DesktopSkillAction | null {
  return DESKTOP_KEY_TO_ACTION[key.toLowerCase()] ?? null;
}

/** 槽位 hotkey 的桌面显示标签;缺省回退原槽位字符串 */
export function desktopLabelForSlot(slotHotkey: string): string {
  return DESKTOP_SLOT_LABELS[slotHotkey] ?? slotHotkey;
}
