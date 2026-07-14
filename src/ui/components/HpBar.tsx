// M3 T3.4:HpBar — 玩家血量条,左上角
// 风格与 Joystick/DebugOverlay 一致:内联 style + rgba 半透明
// 通过 ref 订阅血量,每 ~200ms 同步一次,避免每帧 React 重渲
import { useEffect, useState, type JSX } from 'react';
import type { Unit } from '../../game/skills/types';

interface HpBarProps {
  /** Unit ref(从 WorldState.getUnit('player') 拿) */
  unitRef: React.MutableRefObject<Unit | null>;
  /** 同步间隔 ms;默认 200 */
  syncMs?: number;
  /** label */
  label?: string;
}

export function HpBar({ unitRef, syncMs = 200, label = 'Player' }: HpBarProps): JSX.Element {
  const [hp, setHp] = useState(0);
  const [hpMax, setHpMax] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      const u = unitRef.current;
      if (!u) return;
      setHp(u.hp);
      setHpMax(u.hpMax);
    }, syncMs);
    return () => window.clearInterval(id);
  }, [unitRef, syncMs]);

  const pct = hpMax > 0 ? (hp / hpMax) * 100 : 0;
  const barColor = pct > 60 ? '#3b78ff' : pct > 30 ? '#ffb84a' : '#ff5151';

  return (
    <div
      style={{
        position: 'fixed',
        top: 'max(12px, env(safe-area-inset-top, 0px))',
        left: 'max(12px, env(safe-area-inset-left, 0px))',
        zIndex: 25,
        width: 220,
        padding: '8px 10px',
        background: 'rgba(20, 28, 48, 0.78)',
        color: '#e8ecf5',
        font: '13px system-ui, sans-serif',
        borderRadius: 8,
        pointerEvents: 'none',
      }}
      data-testid="hpbar"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontWeight: 700 }}>{label}</span>
        <span style={{ font: '12px ui-monospace, monospace' }}>
          {hp} / {hpMax}
        </span>
      </div>
      <div
        style={{
          width: '100%',
          height: 10,
          background: 'rgba(255, 255, 255, 0.12)',
          borderRadius: 5,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: barColor,
            transition: 'width 200ms ease-out',
          }}
        />
      </div>
    </div>
  );
}
