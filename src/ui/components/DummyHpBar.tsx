// M3 T3.4:DummyHpBar — 桩血量条,顶部中央(玩家视野正上方)
// 风格与 HpBar 一致;label = 桩名
import { useEffect, useState, type JSX } from 'react';
import type { Unit } from '../../game/skills/types';

interface DummyHpBarProps {
  unitRef: React.MutableRefObject<Unit | null>;
  syncMs?: number;
  label?: string;
}

export function DummyHpBar({
  unitRef,
  syncMs = 200,
  label = 'Practice Dummy',
}: DummyHpBarProps): JSX.Element {
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
  const barColor = '#1fa4a8';

  return (
    <div
      style={{
        position: 'fixed',
        top: 'max(12px, env(safe-area-inset-top, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 25,
        width: 240,
        padding: '8px 10px',
        background: 'rgba(20, 28, 48, 0.78)',
        color: '#e8ecf5',
        font: '13px system-ui, sans-serif',
        borderRadius: 8,
        pointerEvents: 'none',
      }}
      data-testid="dummy-hpbar"
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
          height: 8,
          background: 'rgba(255, 255, 255, 0.12)',
          borderRadius: 4,
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
