// proposal §5.1 + 移动端分区控制
// 屏幕中部纵切:
//   - 左半屏:摇杆(按下时非固定出现,跟随指尖;松开消失)
//   - 右半屏:拖动相机偏移(松手 snap 回玩家相对位置)
// 全屏透明 overlay 收 pointer 事件,按 clientX 分流到左/右处理。
// JoystickVisual 仅渲染视觉,事件由本组件统一管理。
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import {
  computeJoystick,
  ZERO_JOYSTICK,
  type JoystickState,
} from '../../engine/input/joystick';
import { JoystickVisual } from './Joystick';

export interface MobileControlsProps {
  /** 当前摇杆状态,game loop 每帧 read */
  joystickRef: React.MutableRefObject<JoystickState>;
  /** 应用相机偏移(世界 XZ,叠加在玩家相对位置上)。松手回调设 0 即 snap 回玩家 */
  setCameraOffset: (offsetX: number, offsetZ: number) => void;
  /** 摇杆 base 半径 px */
  baseRadius?: number;
  /** 摇杆 thumb 半径 px */
  thumbRadius?: number;
  /** 拖动相机灵敏度:屏幕像素 → 世界单位的换算系数 */
  dragSensitivity?: number;
  /** 相机偏移的最大幅值(世界单位),clamp 到 ±此值 */
  maxOffset?: number;
}

interface JoystickActive {
  pointerId: number;
  centerX: number;
  centerY: number;
}

interface CameraDragActive {
  pointerId: number;
  startX: number;
  startY: number;
}

const DEFAULT_BASE_RADIUS = 70;
const DEFAULT_THUMB_RADIUS = 30;
const DEFAULT_DRAG_SENSITIVITY = 0.03; // 世界单位 / px
const DEFAULT_MAX_OFFSET = 8;

export function MobileControls({
  joystickRef,
  setCameraOffset,
  baseRadius = DEFAULT_BASE_RADIUS,
  thumbRadius = DEFAULT_THUMB_RADIUS,
  dragSensitivity = DEFAULT_DRAG_SENSITIVITY,
  maxOffset = DEFAULT_MAX_OFFSET,
}: MobileControlsProps): JSX.Element {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);

  // joystick 状态:激活态 + 当前 base 中心
  const [joyCenter, setJoyCenter] = useState<{ x: number; y: number } | null>(null);
  const joyActiveRef = useRef<JoystickActive | null>(null);

  // camera drag 状态
  const camActiveRef = useRef<CameraDragActive | null>(null);

  // 把 thumb 视觉对齐到当前 thumb 像素偏移
  const setThumb = useCallback(
    (px: number, py: number, baseX: number, baseY: number): void => {
      const node = thumbRef.current;
      if (!node) return;
      const relX = px - baseX;
      const relY = py - baseY;
      const len = Math.hypot(relX, relY);
      const k = len > baseRadius ? baseRadius / len : 1;
      node.style.transform = `translate3d(${relX * k}px, ${relY * k}px, 0)`;
    },
    [baseRadius],
  );

  const resetThumb = useCallback((): void => {
    const node = thumbRef.current;
    if (!node) return;
    node.style.transform = 'translate3d(0, 0, 0)';
  }, []);

  useEffect(() => {
    function isLeftZone(clientX: number): boolean {
      return clientX < window.innerWidth / 2;
    }

    function clamp(v: number, max: number): number {
      return Math.max(-max, Math.min(max, v));
    }

    function emitJoystick(
      px: number,
      py: number,
      baseX: number,
      baseY: number,
    ): void {
      joystickRef.current = computeJoystick(px, py, baseX, baseY, baseRadius);
    }

    function endJoystick(pointerId: number): void {
      const active = joyActiveRef.current;
      if (!active || active.pointerId !== pointerId) return;
      joyActiveRef.current = null;
      setJoyCenter(null);
      joystickRef.current = ZERO_JOYSTICK;
      resetThumb();
    }

    function endCameraDrag(pointerId: number): void {
      const active = camActiveRef.current;
      if (!active || active.pointerId !== pointerId) return;
      camActiveRef.current = null;
      // snap 回玩家相对位置
      setCameraOffset(0, 0);
    }

    function onPointerDown(e: PointerEvent): void {
      if (e.pointerType === 'mouse') {
        // 桌面调试用,鼠标右键 / 中键都不接管;左键在 GameCanvas 里走 raycaster
        if (e.button !== 0) return;
      }
      // 命中穿透:如果点击点真实落点是 .skill-orb / .skill-hud__cancel / .skill-hud__toggle
      // (T4 技能栏的祖先链),完全跳过本层处理,让子元素自己接 pointer 事件。
      // 否则 setPointerCapture 会把 pointer 锁到 overlay 上,绕过 .skill-orb.onPointerDown。
      const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (hit?.closest('.skill-hud')) return;
      const target = e.currentTarget as HTMLElement | null;
      if (!target) return;
      e.preventDefault();
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // 部分平台 down 上不接受 capture,后续仍可工作
      }

      if (isLeftZone(e.clientX)) {
        // 左区:非固定摇杆。已在按下状态则忽略新的左区 pointer
        if (joyActiveRef.current !== null) return;
        const cx = e.clientX;
        const cy = e.clientY;
        joyActiveRef.current = { pointerId: e.pointerId, centerX: cx, centerY: cy };
        setJoyCenter({ x: cx, y: cy });
        setThumb(cx, cy, cx, cy);
        emitJoystick(cx, cy, cx, cy);
      } else {
        // 右区:相机拖动。已在拖动状态则忽略
        if (camActiveRef.current !== null) return;
        camActiveRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
        };
        // 起始偏移为 0
        setCameraOffset(0, 0);
      }
    }

    function onPointerMove(e: PointerEvent): void {
      const joy = joyActiveRef.current;
      if (joy && joy.pointerId === e.pointerId) {
        e.preventDefault();
        setThumb(e.clientX, e.clientY, joy.centerX, joy.centerY);
        emitJoystick(e.clientX, e.clientY, joy.centerX, joy.centerY);
        return;
      }
      const cam = camActiveRef.current;
      if (cam && cam.pointerId === e.pointerId) {
        e.preventDefault();
        // 相机跟随手指:dragDelta * sens 直接叠加到相机位置
        const dx = e.clientX - cam.startX;
        const dy = e.clientY - cam.startY;
        setCameraOffset(
          clamp(dx * dragSensitivity, maxOffset),
          clamp(dy * dragSensitivity, maxOffset),
        );
      }
    }

    function onPointerEnd(e: PointerEvent): void {
      const target = e.currentTarget as HTMLElement | null;
      if (target) {
        try {
          target.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
      if (joyActiveRef.current?.pointerId === e.pointerId) {
        endJoystick(e.pointerId);
      } else if (camActiveRef.current?.pointerId === e.pointerId) {
        endCameraDrag(e.pointerId);
      }
    }

    function onVisibilityChange(): void {
      if (document.visibilityState !== 'visible') return;
      if (joyActiveRef.current) {
        joyActiveRef.current = null;
        setJoyCenter(null);
        joystickRef.current = ZERO_JOYSTICK;
        resetThumb();
      }
      if (camActiveRef.current) {
        camActiveRef.current = null;
        setCameraOffset(0, 0);
      }
    }

    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.addEventListener('pointerdown', onPointerDown);
    overlay.addEventListener('pointermove', onPointerMove);
    overlay.addEventListener('pointerup', onPointerEnd);
    overlay.addEventListener('pointercancel', onPointerEnd);
    overlay.addEventListener('pointerleave', onPointerEnd);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      overlay.removeEventListener('pointerdown', onPointerDown);
      overlay.removeEventListener('pointermove', onPointerMove);
      overlay.removeEventListener('pointerup', onPointerEnd);
      overlay.removeEventListener('pointercancel', onPointerEnd);
      overlay.removeEventListener('pointerleave', onPointerEnd);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [
    baseRadius,
    dragSensitivity,
    joystickRef,
    maxOffset,
    resetThumb,
    setCameraOffset,
    setThumb,
  ]);

  // 全屏透明 overlay:拦截 pointer,按 clientX 分流
  const overlayStyle = {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 25,
    touchAction: 'none',
    background: 'transparent',
  };

  return (
    <>
      <div ref={overlayRef} style={overlayStyle} data-testid="mobile-overlay" />
      <JoystickVisual
        ref={thumbRef}
        center={joyCenter}
        baseRadius={baseRadius}
        thumbRadius={thumbRadius}
      />
    </>
  );
}