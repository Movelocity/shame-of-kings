import { useMemo, useState, type CSSProperties, type JSX } from 'react';

type SkillLayoutMode = 'three' | 'four';

interface SkillHudItem {
  id: string;
  label: string;
  hotkey: string;
  kind: 'attack' | 'skill' | 'ultimate' | 'utility';
  cooldown?: number;
  ready?: boolean;
  upgrade?: boolean;
  x: number;
  y: number;
  size: number;
}

const THREE_SKILL_LAYOUT: SkillHudItem[] = [
  { id: 'attack', label: '普攻', hotkey: '0', kind: 'attack', x: -30, y: -10, size: 90 },
  { id: 'skill-1', label: '斩击', hotkey: '1', kind: 'skill', x: -162, y: -12, size: 80, ready: true },
  { id: 'skill-2', label: '冲锋', hotkey: '2', kind: 'skill', x: -96, y: -102, size: 80, cooldown: 3.8 },
  { id: 'skill-3', label: '圣裁', hotkey: '3', kind: 'ultimate', x: 4, y: -132, size: 80, ready: true, upgrade: true },
  { id: 'recall', label: '回城', hotkey: 'B', kind: 'utility', x: -388, y: -5, size: 46 },
  { id: 'heal', label: '恢复', hotkey: 'H', kind: 'utility', x: -324, y: -5, size: 46, cooldown: 12.4 },
  { id: 'spell', label: '闪现', hotkey: 'F', kind: 'utility', x: -260, y: -5, size: 50 },
];

const FOUR_SKILL_LAYOUT: SkillHudItem[] = [
  { id: 'attack', label: '普攻', hotkey: '0', kind: 'attack', x: 0, y: 0, size: 82 },
  { id: 'skill-1', label: '斩击', hotkey: '1', kind: 'skill', x: -134, y: -4, size: 60, ready: true },
  { id: 'skill-2', label: '冲锋', hotkey: '2', kind: 'skill', x: -120, y: -76, size: 60, cooldown: 3.8 },
  { id: 'skill-3', label: '护盾', hotkey: '3', kind: 'skill', x: -50, y: -124, size: 60, ready: true },
  { id: 'skill-4', label: '圣裁', hotkey: '4', kind: 'ultimate', x: 42, y: -116, size: 66, ready: true, upgrade: true },
  { id: 'recall', label: '回城', hotkey: 'B', kind: 'utility', x: -388, y: -5, size: 46 },
  { id: 'heal', label: '恢复', hotkey: 'H', kind: 'utility', x: -324, y: -5, size: 46, cooldown: 12.4 },
  { id: 'spell', label: '闪现', hotkey: 'F', kind: 'utility', x: -260, y: -5, size: 50 },
];

export function SkillHud(): JSX.Element {
  const [mode, setMode] = useState<SkillLayoutMode>('three');
  const items = useMemo(
    () => (mode === 'three' ? THREE_SKILL_LAYOUT : FOUR_SKILL_LAYOUT),
    [mode],
  );

  return (
    <section className="skill-hud" aria-label="Skill layout preview">
      <div className="skill-hud__toggle" role="group" aria-label="Skill count">
        <button
          type="button"
          className={mode === 'three' ? 'is-active' : ''}
          onClick={() => setMode('three')}
        >
          3技能
        </button>
        <button
          type="button"
          className={mode === 'four' ? 'is-active' : ''}
          onClick={() => setMode('four')}
        >
          4技能
        </button>
      </div>

      <div className={`skill-hud__pad skill-hud__pad--${mode}`}>
        <div className="skill-hud__cancel">取消</div>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`skill-orb skill-orb--${item.kind}${item.cooldown ? ' is-cooling' : ''}`}
            style={{
              '--skill-x': `${item.x}px`,
              '--skill-y': `${item.y}px`,
              '--skill-size': `${item.size}px`,
            } as CSSProperties}
            aria-label={item.label}
          >
            <span className="skill-orb__icon">{item.hotkey}</span>
            <span className="skill-orb__label">{item.label}</span>
            {/* {item.cooldown && <span className="skill-orb__cooldown">{item.cooldown}</span>} */}
            {item.upgrade && <span className="skill-orb__upgrade">+</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
