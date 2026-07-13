// proposal §3.1 #9 + §5.5 #7:仅 dev 构建展示,FPS / 玩家坐标 / 摇杆向量 / 移动目标
import { useEffect, useRef, useState, type JSX } from 'react';
import type { GameSceneHandle } from '../../engine/renderer/scene';

interface DebugOverlayProps {
  sceneRef: React.MutableRefObject<GameSceneHandle | null>;
}

export function DebugOverlay({ sceneRef }: DebugOverlayProps): JSX.Element | null {
  // 触发组件每帧重渲染,以读取最新 fps.current 值
  const [, setTick] = useState(0);
  const lastT = useRef(performance.now());
  const fps = useRef(0);

  useEffect(() => {
    let raf: number;
    function frame(now: number): void {
      const dt = now - lastT.current;
      lastT.current = now;
      // 平滑 FPS
      const inst = dt > 0 ? 1000 / dt : 0;
      fps.current = fps.current * 0.9 + inst * 0.1;
      setTick((v) => (v + 1) % 1_000_000);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!import.meta.env.DEV) return null;

  const scene = sceneRef.current;
  const player = scene?.player?.root?.position;
  const dummy = scene?.dummy?.root?.position;
  const cam = scene?.follow.camera;
  const camOffset = scene?.follow.getCameraOffset();

  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        zIndex: 20,
        padding: '8px 10px',
        background: 'rgba(20, 28, 48, 0.85)',
        color: '#e8ecf5',
        font: '12px ui-monospace, "SF Mono", Menlo, monospace',
        borderRadius: 6,
        minWidth: 180,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>DEBUG</div>
      <div>FPS: {fps.current.toFixed(0)}</div>
      {player && (
        <>
          <div style={{ marginTop: 4, fontWeight: 700 }}>player</div>
          <div>
            x: {player.x.toFixed(2)}  z: {player.z.toFixed(2)}
          </div>
          <div>
            facing: {(((scene?.player.root.rotation.y ?? 0) * 180) / Math.PI - 180) | 0}°
          </div>
        </>
      )}
      {dummy && (
        <div>
          dummy x: {dummy.x.toFixed(2)}  z: {dummy.z.toFixed(2)}
        </div>
      )}
      {cam && (
        <>
          <div style={{ marginTop: 4, fontWeight: 700 }}>camera</div>
          <div>
            x: {cam.position.x.toFixed(2)}  z: {cam.position.z.toFixed(2)}
          </div>
        </>
      )}
      {camOffset && (
        <>
          <div>
            offset x: {camOffset.x.toFixed(2)}  z: {camOffset.z.toFixed(2)}
          </div>
        </>
      )}
    </div>
  );
}
