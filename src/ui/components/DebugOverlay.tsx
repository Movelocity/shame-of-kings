// proposal §3.1 #9 + §5.5 #7:仅 dev 构建展示,FPS / 玩家坐标 / 摇杆向量 / 移动目标
//
// 2026-07-16 改:
//   - 默认**折叠**(useState 初始 true),让出左上角给 dev 角色切换条
//   - 面板位置:**右上**(top: 8,right: 8)——左上被 dev 角色切换条占用,
//     调试面板与其错开避免互遮
//   - 折叠态:右上角独立"展开"按钮;展开态:内部右内沿折叠按钮
//
// 点击穿透修复(2026-07-14 b):
//   容器设 zIndex:70(高于 SkillHud 的 60 与 MobileControls 的 25),
//   容器默认 pointerEvents:'none'(信息区不抢 pointer,canvas 的点击寻路 / 移动端摇杆不受影响),
//   仅折叠按钮 + 重置按钮 + 折叠态展开按钮 pointerEvents:'auto'。
import { useEffect, useRef, useState, type JSX } from 'react';
import type { GameSceneHandle } from '../../engine/renderer/scene';

interface DebugOverlayProps {
  sceneRef: React.MutableRefObject<GameSceneHandle | null>;
  /** 重置回调(由父组件提供:回出生点 + dummy 满血 + 清空 activeSkill) */
  onReset?: () => void;
}

export function DebugOverlay({ sceneRef, onReset }: DebugOverlayProps): JSX.Element | null {
  // 触发组件每帧重渲染,以读取最新 fps.current 值
  const [, setTick] = useState(0);
  const lastT = useRef(performance.now());
  const fps = useRef(0);
  // 默认折叠,避免跟左上角 dev 角色切换条互遮
  const [collapsed, setCollapsed] = useState<boolean>(true);

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

  // 折叠态:只显示一个独立"展开"小按钮(贴在 panel 顶位,right 8)
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        data-testid="debug-expand"
        aria-label="展开调试面板"
        style={{
          position: 'fixed',
          top: 8, // 与展开态顶端对齐
          right: 8,
          zIndex: 70,
          width: 24,
          height: 24,
          padding: 0,
          background: 'rgba(255, 255, 255, 0.5)',
          color: '#1a2230',
          border: '1px solid rgba(20, 28, 48, 0.18)',
          boxShadow: '0 2px 6px rgba(20, 28, 48, 0.12)',
          font: '11px ui-monospace, "SF Mono", Menlo, monospace',
          borderRadius: 4,
          cursor: 'pointer',
          touchAction: 'manipulation',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ▶
      </button>
    );
  }

  // 展开态:面板(右上角) + 内部右内沿折叠按钮
  return (
    <div
      data-testid="debug-overlay"
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        zIndex: 70,
        padding: '8px 28px 8px 10px', // 右 padding 28 给内部折叠按钮留位
        background: 'rgba(255, 255, 255, 0.5)',
        color: '#1a2230',
        border: '1px solid rgba(20, 28, 48, 0.18)',
        boxShadow: '0 2px 6px rgba(20, 28, 48, 0.12)',
        font: '12px ui-monospace, "SF Mono", Menlo, monospace',
        borderRadius: 6,
        minWidth: 180,
        pointerEvents: 'none', // 容器透 pointer,只按钮区显式 auto
      }}
    >
      {/* 内部折叠按钮(贴右内沿) */}
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        data-testid="debug-collapse"
        aria-label="折叠调试面板"
        style={{
          position: 'absolute',
          top: 6, // 与 panel 内边距对齐
          right: 6,
          width: 18,
          height: 18,
          padding: 0,
          background: 'transparent',
          border: '1px solid rgba(20, 28, 48, 0.35)',
          borderRadius: 3,
          color: '#1a2230',
          cursor: 'pointer',
          font: '700 12px ui-monospace, "SF Mono", Menlo, monospace',
          lineHeight: 1,
          touchAction: 'manipulation',
          pointerEvents: 'auto', // 显式开启(父容器是 none)
        }}
      >
        −
      </button>

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
      {dummy && <div>dummy x: {dummy.x.toFixed(2)}  z: {dummy.z.toFixed(2)}</div>}
      {cam && (
        <>
          <div style={{ marginTop: 4, fontWeight: 700 }}>camera</div>
          <div>
            x: {cam.position.x.toFixed(2)}  z: {cam.position.z.toFixed(2)}
          </div>
        </>
      )}
      {camOffset && (
        <div>
          offset x: {camOffset.x.toFixed(2)}  z: {camOffset.z.toFixed(2)}
        </div>
      )}
      {onReset && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: '1px solid rgba(20,28,48,0.12)',
          }}
        >
          <button
            type="button"
            onClick={onReset}
            data-testid="debug-reset"
            style={{
              width: '100%',
              padding: '4px 0',
              background: 'transparent',
              border: '1px solid rgba(20, 28, 48, 0.35)',
              borderRadius: 3,
              color: '#1a2230',
              cursor: 'pointer',
              font: '11px ui-monospace, "SF Mono", Menlo, monospace',
              letterSpacing: '0.1em',
              touchAction: 'manipulation',
              pointerEvents: 'auto', // 显式开启(父容器是 none)
            }}
          >
            重置
          </button>
        </div>
      )}
    </div>
  );
}
