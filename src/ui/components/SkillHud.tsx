// M3 视觉基线完整回退版(参考 commit 95bf783):
//   - 容器 .skill-hud / .skill-hud__pad / .skill-hud__toggle / .skill-hud__cancel 完全由 styles.css 决定
//   - 所有按钮(包括亚瑟 4 技能 0/1/2/3)统一用 <button className="skill-orb"> 渲染
//   - 位置走 --skill-x / --skill-y / --skill-size CSS 变量
//   - CD 圆弧用 .skill-orb.is-cooling::after(M3 已锁的 conic-gradient)
//   - CD 数字用 <span className="skill-orb__cooldown">
//   - styles.css 完全不动
//
// T4 增量(KI-4,不破坏 M3 视觉):
//   - .skill-orb 接 onPointerDown / onPointerUp / onPointerCancel / onPointerLeave
//   - castMode='instant' → onPressStart 立即施法
//   - castMode='targeted' → onPressStart 进入瞄准中;onPressEnd(clientX/Y + inside)
//     由 GameCanvas 判定"在 .skill-hud__cancel 内" → 取消;否则 → 释放
//   - 瞄准中态:.skill-hud__cancel 加 'is-aiming' class(M3 styles.css 没定义,GameCanvas
//     通过 prop aimingHotkey 注入;CSS 在 styles.css 里追加一个高亮态)
//   - CD 中 / locked 中 .skill-orb 在事件入口短路
//
// Pointer Events 在触摸和鼠标设备上共用；桌面端同时保留 1/2/3/0 热键。
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';

export interface SkillButtonRuntimeState {
  name: string;
  hotkey: string;
  cooldownRemaining: number;
  cooldownMax: number;
  locked: boolean;
}

export interface SkillHudHandle {
  /** 由 GameCanvas 每帧调用,写入单个按钮的最新 CD/locked 状态 */
  updateButton(hotkey: string, state: SkillButtonRuntimeState): void;
}

export interface SkillHudProps {
  /** 技能按钮按压回调 */
  onPressStart?: (hotkey: string) => void;
  /** 技能按钮抬起；targeted 模式由 GameCanvas 按坐标判定取消或释放 */
  onPressEnd?: (info: {
    hotkey: string;
    clientX: number;
    clientY: number;
    inside: boolean;
  }) => void;
  /** 当前正在瞄准的技能 hotkey(由 GameCanvas 注入);非空时 .skill-hud__cancel 进入激活态 */
  aimingHotkey?: string | null;
  /** T4 KI-4:每个 hotkey 的 castMode;缺省全 'instant'(兼容 M3) */
  castModes?: Readonly<Record<string, 'instant' | 'targeted'>>;
}

type SkillLayoutMode = 'three' | 'four';

interface SkillHudItem {
  id: string;
  label: string;
  hotkey: string;
  kind: 'attack' | 'skill' | 'ultimate' | 'utility';
  x: number;
  y: number;
  size: number;
  upgrade?: boolean;
}

const THREE_SKILL_LAYOUT: SkillHudItem[] = [
  { id: 'attack', label: '普攻', hotkey: '0', kind: 'attack', x: -30, y: -10, size: 90 },
  { id: 'skill-1', label: '斩击', hotkey: '1', kind: 'skill', x: -162, y: -12, size: 80 },
  { id: 'skill-2', label: '冲锋', hotkey: '2', kind: 'skill', x: -96, y: -102, size: 80 },
  { id: 'skill-3', label: '圣裁', hotkey: '3', kind: 'ultimate', x: 4, y: -132, size: 80, upgrade: true },
  { id: 'recall', label: '回城', hotkey: 'B', kind: 'utility', x: -388, y: -5, size: 46 },
  { id: 'heal', label: '恢复', hotkey: 'H', kind: 'utility', x: -324, y: -5, size: 46 },
  { id: 'spell', label: '闪现', hotkey: 'F', kind: 'utility', x: -260, y: -5, size: 50 },
];

const FOUR_SKILL_LAYOUT: SkillHudItem[] = [
  { id: 'attack', label: '普攻', hotkey: '0', kind: 'attack', x: 0, y: 0, size: 82 },
  { id: 'skill-1', label: '斩击', hotkey: '1', kind: 'skill', x: -134, y: -4, size: 60 },
  { id: 'skill-2', label: '冲锋', hotkey: '2', kind: 'skill', x: -120, y: -76, size: 60 },
  { id: 'skill-3', label: '护盾', hotkey: '3', kind: 'skill', x: -50, y: -124, size: 60 },
  { id: 'skill-4', label: '圣裁', hotkey: '4', kind: 'ultimate', x: 42, y: -116, size: 66, upgrade: true },
  { id: 'recall', label: '回城', hotkey: 'B', kind: 'utility', x: -388, y: -5, size: 46 },
  { id: 'heal', label: '恢复', hotkey: 'H', kind: 'utility', x: -324, y: -5, size: 46 },
  { id: 'spell', label: '闪现', hotkey: 'F', kind: 'utility', x: -260, y: -5, size: 50 },
];

const DEFAULT_CAST_MODES: Readonly<Record<string, 'instant' | 'targeted'>> = {
  '0': 'instant',
  '1': 'instant',
  '2': 'instant',
  '3': 'instant',
  '4': 'instant',
};

export const SkillHud = forwardRef<SkillHudHandle, SkillHudProps>(function SkillHud(
  { onPressStart, onPressEnd, aimingHotkey = null, castModes = DEFAULT_CAST_MODES },
  ref: Ref<SkillHudHandle>,
): JSX.Element {
  const [mode, setMode] = useState<SkillLayoutMode>('three');
  const items = useMemo(
    () => (mode === 'three' ? THREE_SKILL_LAYOUT : FOUR_SKILL_LAYOUT),
    [mode],
  );

  // 4 个亚瑟技能的 CD/locked 状态:用 useState 持有(频率闸 ~10Hz)
  const [buttonStates, setButtonStates] = useState<
    Map<string, SkillButtonRuntimeState>
  >(() => new Map());
  // 频率闸:0.1s 分辨率 + locked 翻转
  const lastEmitted = useRef<Map<string, { cdInt: number; locked: boolean }>>(
    new Map(),
  );

  useImperativeHandle(
    ref,
    (): SkillHudHandle => ({
      updateButton(hotkey, state) {
        const newCdInt = Math.ceil(state.cooldownRemaining * 10);
        const newLocked = state.locked;
        const last = lastEmitted.current.get(hotkey);
        const needSetState =
          !last || last.cdInt !== newCdInt || last.locked !== newLocked;
        lastEmitted.current.set(hotkey, { cdInt: newCdInt, locked: newLocked });
        if (!needSetState) {
          // 频率闸外:仅同步 lastEmitted,React state 不动
          return;
        }
        setButtonStates((prev) => {
          const next = new Map(prev);
          next.set(hotkey, state);
          return next;
        });
      },
    }),
    [],
  );

  // 工具:渲染单个亚瑟技能按钮
  function renderArthurOrb(item: SkillHudItem): JSX.Element {
    const state = buttonStates.get(item.hotkey);
    const cdRemaining = state?.cooldownRemaining ?? 0;
    const isLocked = state?.locked ?? false;
    const isReady = cdRemaining <= 0 && !isLocked;
    const castMode = castModes[item.hotkey] ?? 'instant';
    const isCooling = !isReady;
    const cooldownRatio =
      state && state.cooldownMax > 0
        ? Math.max(0, Math.min(1, cdRemaining / state.cooldownMax))
        : isLocked
          ? 1
          : 0;
    const cls = [
      'skill-orb',
      `skill-orb--${item.kind}`,
      isCooling ? 'is-cooling' : '',
      castMode === 'targeted' ? 'is-targeted' : '',
      aimingHotkey === item.hotkey ? 'is-aiming' : '',
    ]
      .filter(Boolean)
      .join(' ');

    function onDown(e: ReactPointerEvent<HTMLButtonElement>): void {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!isReady) return;
      e.preventDefault();
      // setPointerCapture 让手指 / 鼠标滑出按钮也能收到 onPointerUp
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 部分平台 down 上不接受 capture,后续仍可工作
      }
      onPressStart?.(item.hotkey);
    }
    function onUp(e: ReactPointerEvent<HTMLButtonElement>): void {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      onPressEnd?.({
        hotkey: item.hotkey,
        clientX: e.clientX,
        clientY: e.clientY,
        inside: true,
      });
    }
    function onCancel(e: ReactPointerEvent<HTMLButtonElement>): void {
      onPressEnd?.({
        hotkey: item.hotkey,
        clientX: e.clientX,
        clientY: e.clientY,
        inside: false,
      });
    }

    return (
      <button
        key={item.id}
        type="button"
        className={cls}
        style={
          {
            '--skill-x': `${item.x}px`,
            '--skill-y': `${item.y}px`,
            '--skill-size': `${item.size}px`,
            '--cooldown-angle': `${cooldownRatio * 360}deg`,
          } as CSSProperties
        }
        aria-label={item.label}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
      >
        <span className="skill-orb__icon">{item.hotkey}</span>
        <span className="skill-orb__label">{item.label}</span>
        {item.upgrade && <span className="skill-orb__upgrade">+</span>}
        {isCooling && (
          <span className="skill-orb__cooldown">
            {cdRemaining > 0 ? cdRemaining.toFixed(1) : '·'}
          </span>
        )}
      </button>
    );
  }

  return (
    <section className="skill-hud" aria-label="Skill layout preview">
      <div className="skill-hud__toggle" role="group" aria-label="Skill count">
        <button
          type="button"
          className={mode === 'three' ? 'is-active' : ''}
          onClick={() => setMode('three')}
        >
          3技能
        </button>
        <button
          type="button"
          className={mode === 'four' ? 'is-active' : ''}
          onClick={() => setMode('four')}
        >
          4技能
        </button>
      </div>

      <div className={`skill-hud__pad skill-hud__pad--${mode}`}>
        <div
          className={`skill-hud__cancel${aimingHotkey ? ' is-aiming' : ''}`}
          onPointerUp={
            aimingHotkey
              ? (e) =>
                  onPressEnd?.({
                    hotkey: aimingHotkey,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    inside: true,
                  })
              : undefined
          }
          data-testid="skill-hud-cancel"
          aria-hidden={!aimingHotkey}
        >
          取消
        </div>
        {items.map((item) => {
          const isArthur = /^[0-4]$/.test(item.hotkey);
          if (isArthur) return renderArthurOrb(item);
          // utility 按钮走 M3 原版静态 JSX
          return (
            <button
              key={item.id}
              type="button"
              className={`skill-orb skill-orb--${item.kind}`}
              style={
                {
                  '--skill-x': `${item.x}px`,
                  '--skill-y': `${item.y}px`,
                  '--skill-size': `${item.size}px`,
                } as CSSProperties
              }
              aria-label={item.label}
            >
              <span className="skill-orb__icon">{item.hotkey}</span>
              <span className="skill-orb__label">{item.label}</span>
              {item.upgrade && <span className="skill-orb__upgrade">+</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
});
