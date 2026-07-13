// proposal §3.3 模块 C + §5.1
// 虚拟摇杆 UI: 左下角 base + thumb;Pointer Events;touch-action: none
import { useEffect, useRef } from 'react';
import type { CSSProperties, JSX } from 'react';
import { computeJoystick, ZERO_JOYSTICK, type JoystickState } from '../../engine/input/joystick';

interface JoystickProps {
  /** base 半径 px */
  baseRadius?: number;
  /** thumb 半径 px */
  thumbRadius?: number;
  /** 初始归位中心(base 中心 CSS 位置相对视口左下角的偏移) */
  anchor?: { bottom: number; left: number };
  /** 摇杆状态变化回调(归一化后的向量) */
  onChange: (state: JoystickState) => void;
}

export function Joystick({
  baseRadius = 70,
  thumbRadius = 30,
  anchor = { bottom: 28, left: 28 },
  onChange,
}: JoystickProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);

  // 跟踪 pointerId → base center(px),确保 pointermove 不依赖 container 位置
  const activeRef = useRef<{
    pointerId: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  // 仅用于视觉 thumb 位置;真正的状态回传 computeJoystick 算
  // (thumb 用 transform 改位置,不需要触发 React 重渲染)

  function setThumb(px: number, py: number, baseX: number, baseY: number): void {
    const node = thumbRef.current;
    if (!node) return;
    const relX = px - baseX;
    const relY = py - baseY;
    const len = Math.hypot(relX, relY);
    const k = len > baseRadius ? baseRadius / len : 1;
    const tx = relX * k;
    const ty = relY * k;
    node.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
  }

  function resetThumb(): void {
    const node = thumbRef.current;
    if (!node) return;
    node.style.transform = 'translate3d(0, 0, 0)';
  }

  function emit(px: number, py: number, baseX: number, baseY: number): void {
    // JoystickState 的语义跟 DOM 屏幕坐标系一致:x = screen.dx / baseRadius,y = screen.dy / baseRadius
    // (player-controller 负责把屏幕 y 翻到世界 z)
    const state = computeJoystick(px, py, baseX, baseY, baseRadius);
    onChange(state);
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function getBaseCenter(): { x: number; y: number } | null {
      const rect = container?.getBoundingClientRect();
      if (!rect) return null;
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }

    function onPointerDown(e: PointerEvent): void {
      // 仅当 pointerdown 在 base 内才接(简化:任何 down 都接受,因为整个 div 是 base)
      if (activeRef.current !== null) return;
      const center = getBaseCenter();
      if (!center) return;
      e.preventDefault();
      try {
        container!.setPointerCapture(e.pointerId);
      } catch {
        // 某些平台 setPointerCapture 在 down 上不接受,继续也能 work
      }
      activeRef.current = {
        pointerId: e.pointerId,
        baseX: center.x,
        baseY: center.y,
      };
      setThumb(e.clientX, e.clientY, center.x, center.y);
      emit(e.clientX, e.clientY, center.x, center.y);
    }

    function onPointerMove(e: PointerEvent): void {
      const active = activeRef.current;
      if (!active || active.pointerId !== e.pointerId) return;
      e.preventDefault();
      setThumb(e.clientX, e.clientY, active.baseX, active.baseY);
      emit(e.clientX, e.clientY, active.baseX, active.baseY);
    }

    function endPointer(e: PointerEvent): void {
      const active = activeRef.current;
      if (!active || active.pointerId !== e.pointerId) return;
      activeRef.current = null;
      try {
        container!.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      resetThumb();
      onChange(ZERO_JOYSTICK);
    }

    function onVisibilityChange(): void {
      // 切回标签页时强制归零
      if (document.visibilityState === 'visible' && activeRef.current) {
        activeRef.current = null;
        resetThumb();
        onChange(ZERO_JOYSTICK);
      }
    }

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', endPointer);
    container.addEventListener('pointercancel', endPointer);
    container.addEventListener('pointerleave', endPointer);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', endPointer);
      container.removeEventListener('pointercancel', endPointer);
      container.removeEventListener('pointerleave', endPointer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [baseRadius, onChange]);

  // 视觉 base: 大圆 + 中心点;thumb: 内部小圆,默认居中
  // 亮色调:底圈半透深蓝灰避免吃掉地面色;thumb 用鲜明的金色保持可视化
  const containerStyle: CSSProperties = {
    position: 'fixed',
    left: anchor.left,
    bottom: anchor.bottom,
    width: baseRadius * 2,
    height: baseRadius * 2,
    borderRadius: '50%',
    background: 'rgba(61, 84, 124, 0.32)',
    border: '2px solid rgba(34, 48, 78, 0.55)',
    touchAction: 'none',
    userSelect: 'none',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const thumbBaseStyle: CSSProperties = {
    width: thumbRadius * 2,
    height: thumbRadius * 2,
    borderRadius: '50%',
    background: 'rgba(255, 216, 74, 0.85)',
    border: '1px solid rgba(34, 48, 78, 0.6)',
    willChange: 'transform',
  };

  return (
    <div ref={containerRef} style={containerStyle} data-testid="joystick-base">
      <div ref={thumbRef} style={thumbBaseStyle} data-testid="joystick-thumb" />
    </div>
  );
}
