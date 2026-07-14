// M3 T3.4:SkillButton — 右下角技能按钮 + CD 转圈
// 用 conic-gradient 实现 CD 圆弧(避免 SVG 重渲)
// 内部维护 cooldownTimer,通过 ref 由 GameCanvas 每帧写
import { forwardRef, useImperativeHandle, useState, type CSSProperties, type JSX } from 'react';

export interface SkillButtonState {
  /** 技能名(显示) */
  name: string;
  /** 键位(显示在按钮上) */
  hotkey: string;
  /** 当前 CD 剩余(秒) */
  cooldownRemaining: number;
  /** 技能总 CD(秒) */
  cooldownMax: number;
  /** 锁定中(进 cast/active 期间不能放) */
  locked: boolean;
}

export interface SkillButtonHandle {
  /** 由 GameCanvas 每帧调用更新状态 */
  update(state: SkillButtonState): void;
}

interface SkillButtonProps {
  state: SkillButtonState;
}

export const SkillButton = forwardRef<SkillButtonHandle, SkillButtonProps>(
  function SkillButton({ state }, ref): JSX.Element {
    // 内部用 local state 触发 React 重渲(M3 阶段每 ~100ms 同步一次)
    const [tick, setTick] = useState(0);
    useImperativeHandle(ref, () => ({
      update(next) {
        // 不直接 setState,避免太频繁;只在 cooldownRemaining 整数化变化时刷新
        const oldInt = Math.ceil(state.cooldownRemaining * 10);
        const newInt = Math.ceil(next.cooldownRemaining * 10);
        if (oldInt !== newInt || state.locked !== next.locked) {
          Object.assign(state, next);
          setTick((v) => (v + 1) % 1_000_000);
        } else {
          Object.assign(state, next);
        }
      },
    }));

    const cdRatio =
      state.cooldownMax > 0
        ? Math.max(0, Math.min(1, state.cooldownRemaining / state.cooldownMax))
        : 0;
    const angle = cdRatio * 360;
    const isReady = state.cooldownRemaining <= 0 && !state.locked;

    const style: CSSProperties = {
      width: 64,
      height: 64,
      borderRadius: 12,
      background: isReady
        ? 'rgba(59, 120, 255, 0.85)'
        : state.locked
          ? 'rgba(140, 140, 140, 0.85)'
          : 'rgba(40, 52, 80, 0.85)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      font: '700 18px system-ui, sans-serif',
      border: '2px solid rgba(255, 255, 255, 0.45)',
      pointerEvents: 'none',
      position: 'relative',
      // CD 圆弧覆盖层
      backgroundImage:
        cdRatio > 0
          ? `conic-gradient(transparent 0deg ${angle}deg, rgba(0,0,0,0.55) ${angle}deg 360deg)`
          : undefined,
      transition: 'background-color 200ms',
    };

    return (
      <div style={style} data-testid="skill-button" data-hotkey={state.hotkey}>
        <div style={{ fontSize: 22, lineHeight: 1 }}>{state.hotkey}</div>
        <div style={{ fontSize: 10, marginTop: 2, opacity: 0.85 }}>{state.name}</div>
        {!isReady && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              font: '700 16px ui-monospace, monospace',
              color: '#fff',
              textShadow: '0 1px 2px rgba(0,0,0,0.6)',
            }}
          >
            {state.cooldownRemaining > 0
              ? state.cooldownRemaining.toFixed(1)
              : '·'}
          </div>
        )}
        {/* 借用 tick 触发 React 重渲,避免 lint unused */}
        <span style={{ display: 'none' }}>{tick}</span>
      </div>
    );
  },
);
