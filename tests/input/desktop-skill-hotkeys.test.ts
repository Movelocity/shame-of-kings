import { describe, expect, it } from 'vitest';
import {
  desktopLabelForSlot,
  resolveDesktopSkillKey,
} from '../../src/engine/input/desktop-skill-hotkeys';

describe('desktop-skill-hotkeys', () => {
  it('maps J/K/L to attack priorities', () => {
    expect(resolveDesktopSkillKey('J')).toEqual({
      kind: 'attack',
      priority: 'default',
    });
    expect(resolveDesktopSkillKey('k')).toEqual({
      kind: 'attack',
      priority: 'minion',
    });
    expect(resolveDesktopSkillKey('L')).toEqual({
      kind: 'attack',
      priority: 'tower',
    });
  });

  it('maps U/I/O/P to skill slots 1–4', () => {
    expect(resolveDesktopSkillKey('u')).toEqual({
      kind: 'cast',
      slotHotkey: '1',
    });
    expect(resolveDesktopSkillKey('I')).toEqual({
      kind: 'cast',
      slotHotkey: '2',
    });
    expect(resolveDesktopSkillKey('o')).toEqual({
      kind: 'cast',
      slotHotkey: '3',
    });
    expect(resolveDesktopSkillKey('P')).toEqual({
      kind: 'cast',
      slotHotkey: '4',
    });
  });

  it('returns null for unrelated keys', () => {
    expect(resolveDesktopSkillKey('0')).toBeNull();
    expect(resolveDesktopSkillKey('w')).toBeNull();
  });

  it('desktopLabelForSlot returns letter labels', () => {
    expect(desktopLabelForSlot('0')).toBe('J');
    expect(desktopLabelForSlot('3')).toBe('O');
    expect(desktopLabelForSlot('9')).toBe('9');
  });
});
