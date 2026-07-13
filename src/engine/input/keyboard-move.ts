// 桌面 + 移动端统一的「屏幕轴」输入向量。
// 约定 (与 joystick 一致):
//   x>0 = 右,y>0 = 屏幕下(屏幕坐标系)。
//   长度 ≤ 1,> 1 时 controller 内部做 clamp。
export interface InputVector {
  x: number;
  y: number;
}

export const ZERO_INPUT: InputVector = { x: 0, y: 0 };

/**
 * 把 WASD 当前按压状态归一为屏幕轴向量。
 * W = 屏幕 y 负方向(上/远离屏幕原点),
 * S = 屏幕 y 正方向,
 * A = 屏幕 x 负方向,
 * D = 屏幕 x 正方向。
 */
const W = 'w';
const A = 'a';
const S = 's';
const D = 'd';
const W_UPPER = 'W';
const A_UPPER = 'A';
const S_UPPER = 'S';
const D_UPPER = 'D';
const ARROW_UP = 'ArrowUp';
const ARROW_DOWN = 'ArrowDown';
const ARROW_LEFT = 'ArrowLeft';
const ARROW_RIGHT = 'ArrowRight';

function isMovementKey(code: string): boolean {
  return (
    code === W ||
    code === A ||
    code === S ||
    code === D ||
    code === W_UPPER ||
    code === A_UPPER ||
    code === S_UPPER ||
    code === D_UPPER ||
    code === ARROW_UP ||
    code === ARROW_DOWN ||
    code === ARROW_LEFT ||
    code === ARROW_RIGHT
  );
}

export interface KeyboardMoveState {
  /** 当前按压对应的屏幕轴向量(归一前)。external 调用时调用 getMoveVector() */
  getMoveVector: () => InputVector;
  /** 释放所有键(防止失焦/标签页切换后残留) */
  release: () => void;
  dispose: () => void;
}

export function createKeyboardMove(): KeyboardMoveState {
  const pressed = new Set<string>();
  function compute(): InputVector {
    let x = 0;
    let y = 0;
    if (pressed.has(W) || pressed.has(W_UPPER) || pressed.has(ARROW_UP)) y -= 1;
    if (pressed.has(S) || pressed.has(S_UPPER) || pressed.has(ARROW_DOWN)) y += 1;
    if (pressed.has(A) || pressed.has(A_UPPER) || pressed.has(ARROW_LEFT)) x -= 1;
    if (pressed.has(D) || pressed.has(D_UPPER) || pressed.has(ARROW_RIGHT)) x += 1;
    if (x === 0 && y === 0) return ZERO_INPUT;
    const len = Math.hypot(x, y);
    return { x: x / len, y: y / len };
  }
  function onKeyDown(e: KeyboardEvent): void {
    if (!isMovementKey(e.key)) return;
    // 阻止上下左右滚动页面
    if (
      e.key === ARROW_UP ||
      e.key === ARROW_DOWN ||
      e.key === ARROW_LEFT ||
      e.key === ARROW_RIGHT ||
      e.key === ' ' ||
      e.key === 'Spacebar'
    ) {
      e.preventDefault();
    }
    pressed.add(e.key);
  }
  function onKeyUp(e: KeyboardEvent): void {
    if (!isMovementKey(e.key)) return;
    pressed.delete(e.key);
  }
  function onBlur(): void {
    pressed.clear();
  }
  function onVisibility(): void {
    if (document.visibilityState === 'visible') pressed.clear();
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  return {
    getMoveVector: compute,
    release(): void {
      pressed.clear();
    },
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
