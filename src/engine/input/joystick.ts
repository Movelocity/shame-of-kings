// proposal §3.3 模块 C + §5.1
// 摇杆纯逻辑层:输入 base 中心 + thumb 位置;输出归一化方向向量
// 解耦 DOM,允许 Node 端单测

export interface JoystickState {
  /** 归一化的 thumb 偏移量,长度 ≤ 1 */
  x: number;
  y: number;
}

export const ZERO_JOYSTICK: JoystickState = { x: 0, y: 0 };

/**
 * 输入:base 中心 (px)、thumb 位置 (px)、base 半径 (px)。
 * 输出:归一化的 JoystickState(length > 1 时 clamp 到单位圆)。
 *
 * 注意:屏幕坐标 y 向下,本函数输出 y 向上为正——joystick UI 应当把屏幕 dy 取反
 * 再传入(详见 Joystick.tsx 实现)。
 */
export function computeJoystick(
  thumbX: number,
  thumbY: number,
  baseX: number,
  baseY: number,
  baseRadius: number,
): JoystickState {
  if (baseRadius <= 0) return ZERO_JOYSTICK;
  const dx = thumbX - baseX;
  const dy = thumbY - baseY;
  const len = Math.hypot(dx, dy);
  if (len === 0) return ZERO_JOYSTICK;
  const k = len > baseRadius ? baseRadius / len : 1;
  return {
    x: (dx / baseRadius) * k,
    y: (dy / baseRadius) * k,
  };
}
