import { useRef, type JSX } from 'react';
import type { GameSceneHandle } from '../../engine/renderer/scene';
import { GameCanvas } from '../components/GameCanvas';
import { DebugOverlay } from '../components/DebugOverlay';

export function PlayPage(): JSX.Element {
  const sceneRef = useRef<GameSceneHandle | null>(null);
  const handleReset = (): void => {
    sceneRef.current?.resetWorld?.();
  };
  return (
    <>
      <GameCanvas sceneRef={sceneRef} />
      <button
        type="button"
        onClick={handleReset}
        data-testid="practice-reset"
        aria-label="重置练习场"
        style={{
          position: 'fixed',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 70,
          pointerEvents: 'auto',
          padding: '6px 14px',
          background: 'rgba(255, 255, 255, 0.55)',
          color: '#1a2230',
          border: '1px solid rgba(20, 28, 48, 0.18)',
          boxShadow: '0 2px 6px rgba(20, 28, 48, 0.12)',
          font: '12px ui-monospace, "SF Mono", Menlo, monospace',
          letterSpacing: '0.08em',
          borderRadius: 4,
          cursor: 'pointer',
          touchAction: 'manipulation',
        }}
      >
        重置
      </button>
      <DebugOverlay sceneRef={sceneRef} onReset={handleReset} />
    </>
  );
}
