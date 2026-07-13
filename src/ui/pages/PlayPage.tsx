import { useRef, type JSX } from 'react';
import type { GameSceneHandle } from '../../engine/renderer/scene';
import { GameCanvas } from '../components/GameCanvas';
import { DebugOverlay } from '../components/DebugOverlay';

export function PlayPage(): JSX.Element {
  const sceneRef = useRef<GameSceneHandle | null>(null);
  return (
    <>
      <GameCanvas sceneRef={sceneRef} />
      <DebugOverlay sceneRef={sceneRef} />
    </>
  );
}
