import { useRef, type JSX } from 'react';
import type { GameSceneHandle } from '../../engine/renderer/scene';
import { GameCanvas } from '../components/GameCanvas';
import { DebugOverlay } from '../components/DebugOverlay';

interface PlayPageProps {
  /** 重置信号:由 App 创建 ref 传入,counter+1 触发 GameCanvas 内部重置闭包 */
  resetSignal?: React.MutableRefObject<number>;
}

export function PlayPage({ resetSignal }: PlayPageProps = {}): JSX.Element {
  const sceneRef = useRef<GameSceneHandle | null>(null);
  const handleReset = (): void => {
    if (resetSignal) resetSignal.current += 1;
  };
  return (
    <>
      <GameCanvas sceneRef={sceneRef} resetSignal={resetSignal} />
      <DebugOverlay sceneRef={sceneRef} onReset={handleReset} />
    </>
  );
}
