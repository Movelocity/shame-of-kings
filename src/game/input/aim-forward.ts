// 瞄准期移动输入 → forwardRad;与 player-controller / keyboard-move 屏幕轴约定一致。

export interface AimMoveInput {
  x: number;
  y: number;
}

/**
 * 屏幕轴向量 → 世界 forwardRad(0 ≡ 世界 -Z)。
 * 无输入时保留 currentFacingRad。
 */
export function aimForwardFromInput(
  input: AimMoveInput,
  currentFacingRad: number,
): number {
  const len = Math.hypot(input.x, input.y);
  if (len < 1e-6) return currentFacingRad;
  const dx = input.x / len;
  const dy = input.y / len;
  return Math.atan2(dx, -dy);
}
