// proposal §3.3 模块 C + §5.1
// 虚拟摇杆视觉:base + thumb 圆形 + 通过 ref 由父组件驱动 thumb 位移
// 不处理 Pointer Events;事件由 MobileControls 统一收集并分发到左/右分区
import { forwardRef, type CSSProperties, type JSX } from 'react';

export interface JoystickVisualProps {
  /** base 中心(视口 px 坐标);null = 隐藏 */
  center: { x: number; y: number } | null;
  /** base 半径 px */
  baseRadius?: number;
  /** thumb 半径 px */
  thumbRadius?: number;
}

/**
 * 视觉摇杆:base 大圆 + thumb 小圆。
 * 父组件通过 ref 拿到 thumb 节点,直接写 `style.transform = translate3d(...)`,
 * 不触发 React 重渲。
 */
export const JoystickVisual = forwardRef<HTMLDivElement, JoystickVisualProps>(
  function JoystickVisual(
    { center, baseRadius = 70, thumbRadius = 30 },
    thumbRef,
  ): JSX.Element | null {
    if (!center) return null;

    const containerStyle: CSSProperties = {
      position: 'fixed',
      left: center.x - baseRadius,
      top: center.y - baseRadius,
      width: baseRadius * 2,
      height: baseRadius * 2,
      borderRadius: '50%',
      background: 'rgba(61, 84, 124, 0.32)',
      border: '2px solid rgba(34, 48, 78, 0.55)',
      touchAction: 'none',
      userSelect: 'none',
      zIndex: 30,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
    };

    const thumbStyle: CSSProperties = {
      width: thumbRadius * 2,
      height: thumbRadius * 2,
      borderRadius: '50%',
      background: 'rgba(255, 216, 74, 0.85)',
      border: '1px solid rgba(34, 48, 78, 0.6)',
      willChange: 'transform',
      transform: 'translate3d(0, 0, 0)',
    };

    return (
      <div style={containerStyle} data-testid="joystick-base">
        <div
          ref={thumbRef}
          style={thumbStyle}
          data-testid="joystick-thumb"
        />
      </div>
    );
  },
);