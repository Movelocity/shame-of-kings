// proposal §2.2 固定时间步长
export interface FixedLoopConfig {
  /** 逻辑步长(秒) */
  fixedDt: number;
  /** 最大逻辑迭代数(防止切回标签页后爆栈) */
  maxStepsPerFrame: number;
}

export const DEFAULT_FIXED_LOOP: FixedLoopConfig = {
  fixedDt: 1 / 60,
  maxStepsPerFrame: 5,
};

export interface FixedLoopHandle {
  start(onTick: (dt: number) => void, onRender: () => void): void;
  stop(): void;
  /** 外部 rafId 给上层 cancelAnimationFrame 用 */
  isRunning(): boolean;
}

export function createFixedLoop(cfg: Partial<FixedLoopConfig> = {}): FixedLoopHandle {
  const c = { ...DEFAULT_FIXED_LOOP, ...cfg };

  let rafId: number | null = null;
  let lastTime = 0;
  let acc = 0;
  let running = false;

  function tick(now: number, onTick: (dt: number) => void, onRender: () => void): void {
    if (!running) return;
    if (lastTime === 0) lastTime = now;
    const elapsed = Math.min((now - lastTime) / 1000, 0.25); // 钳制最大 250ms,防卡顿爆栈
    lastTime = now;
    acc += elapsed;

    let steps = 0;
    while (acc >= c.fixedDt && steps < c.maxStepsPerFrame) {
      onTick(c.fixedDt);
      acc -= c.fixedDt;
      steps++;
    }
    // 多余的累积让下次处理(不丢失)
    if (steps >= c.maxStepsPerFrame) acc = 0;

    onRender();
    rafId = requestAnimationFrame((t) => tick(t, onTick, onRender));
  }

  return {
    start(onTick, onRender) {
      if (running) return;
      running = true;
      lastTime = 0;
      acc = 0;
      rafId = requestAnimationFrame((t) => tick(t, onTick, onRender));
    },
    stop() {
      running = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
    isRunning() {
      return running;
    },
  };
}
