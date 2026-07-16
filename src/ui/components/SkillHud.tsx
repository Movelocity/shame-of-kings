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
// Pointer Events 在触摸和鼠标设备上共用；桌面端热键 J/K/L(普攻) + U/I/O/P(技能)。
import {
  desktopLabelForSlot,
  type AutoAttackPriority,
} from '../../engine/input/desktop-skill-hotkeys';
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
  /** 当前已加载英雄的技能配置；英雄技能标签和可见槽位以此为准 */
  heroSkills: readonly SkillHudSkillDefinition[];
  /** 桌面端显示 J/U/I/O/P 与 K/L 普攻方式；移动端显示槽位数字 */
  inputMode?: 'desktop' | 'mobile';
  /** 技能按钮按压回调(slot hotkey: 0–4) */
  onPressStart?: (slotHotkey: string) => void;
  /** 桌面端 K/L 普攻方式 */
  onAttackModePress?: (priority: Exclude<AutoAttackPriority, 'default'>) => void;
  /** 技能按钮抬起；targeted 模式由 GameCanvas 按坐标判定取消或释放 */
  onPressEnd?: (info: {
    slotHotkey: string;
    clientX: number;
    clientY: number;
    inside: boolean;
  }) => void;
  /**
   * skill-stick:超过死区后的拖拽增量(屏幕像素,相对 pointerdown 原点)。
   * 由 GameCanvas 换算为瞄准向量。
   */
  onDragMove?: (info: { slotHotkey: string; dx: number; dy: number }) => void;
  /** 当前正在瞄准的技能 slot hotkey(由 GameCanvas 注入);非空时 .skill-hud__cancel 进入激活态 */
  aimingSlotHotkey?: string | null;
  /** T4 KI-4:每个 slot hotkey 的 castMode;缺省全 'instant'(兼容 M3) */
  castModes?: Readonly<Record<string, 'instant' | 'targeted'>>;
  /** DEV 构建下 hotkey 1–3 强制走 hold-release 样式 */
  devForceHoldRelease?: boolean;
}

export interface SkillHudSkillDefinition {
  hotkey: string;
  name: string;
}

type SkillLayoutMode = 'three' | 'four';

interface SkillHudItem {
  id: string;
  /** 仅通用按钮使用；英雄技能名称来自 heroSkills 配置。 */
  label?: string;
  /** 英雄 kit 内部槽位 hotkey(0–4) */
  slotHotkey: string;
  kind: 'attack' | 'skill' | 'utility';
  x: number;
  y: number;
  size: number;
  upgrade?: boolean;
}

// interface AttackModeHudItem {
//   id: string;
//   label: string;
//   hotkey: string;
//   priority: Exclude<AutoAttackPriority, 'default'>;
//   x: number;
//   y: number;
//   size: number;
// }

const THREE_SKILL_LAYOUT: SkillHudItem[] = [
  { id: 'attack', slotHotkey: '0', kind: 'attack', x: -30, y: -10, size: 90 },
  { id: 'skill-1', slotHotkey: '1', kind: 'skill', x: -162, y: -12, size: 80 },
  { id: 'skill-2', slotHotkey: '2', kind: 'skill', x: -96, y: -102, size: 80 },
  { id: 'skill-3', slotHotkey: '3', kind: 'skill', x: 4, y: -132, size: 80 },
  { id: 'recall', label: '回城', slotHotkey: 'B', kind: 'utility', x: -388, y: -5, size: 46 },
  { id: 'heal', label: '恢复', slotHotkey: 'H', kind: 'utility', x: -324, y: -5, size: 46 },
  { id: 'spell', label: '闪现', slotHotkey: 'F', kind: 'utility', x: -260, y: -5, size: 50 },
];

const FOUR_SKILL_LAYOUT: SkillHudItem[] = [
  { id: 'attack', slotHotkey: '0', kind: 'attack', x: -30, y: -10, size: 90 },
  { id: 'skill-1', slotHotkey: '1', kind: 'skill', x: -162, y: -12, size: 80 },
  { id: 'skill-2', slotHotkey: '2', kind: 'skill', x: -96, y: -102, size: 80 },
  { id: 'skill-3', slotHotkey: '3', kind: 'skill', x: 4, y: -132, size: 80 },
  { id: 'skill-4', slotHotkey: '4', kind: 'skill', x: 12, y: -166, size: 80 },
  { id: 'recall', label: '回城', slotHotkey: 'B', kind: 'utility', x: -388, y: -5, size: 46 },
  { id: 'heal', label: '恢复', slotHotkey: 'H', kind: 'utility', x: -324, y: -5, size: 46 },
  { id: 'spell', label: '闪现', slotHotkey: 'F', kind: 'utility', x: -260, y: -5, size: 50 },
];

// const DESKTOP_ATTACK_MODE_LAYOUT: AttackModeHudItem[] = [
//   { id: 'attack-minion', label: '', hotkey: 'K', priority: 'minion', x: -110, y: 22, size: 40 },
//   { id: 'attack-tower', label: '', hotkey: 'L', priority: 'tower', x: 22, y: -70, size: 40 },
// ];

const DEFAULT_CAST_MODES: Readonly<Record<string, 'instant' | 'targeted'>> = {
  '0': 'instant',
  '1': 'instant',
  '2': 'instant',
  '3': 'instant',
  '4': 'instant',
};

/** skill-stick 死区(px):小于此位移不产生瞄准输入 */
const SKILL_STICK_DEADZONE_PX = 8;

export const SkillHud = forwardRef<SkillHudHandle, SkillHudProps>(function SkillHud(
  {
    heroSkills,
    inputMode = 'mobile',
    onPressStart,
    // onAttackModePress,
    onPressEnd,
    onDragMove,
    aimingSlotHotkey = null,
    castModes = DEFAULT_CAST_MODES,
    devForceHoldRelease = false,
  },
  ref: Ref<SkillHudHandle>,
): JSX.Element {
  const [mode, setMode] = useState<SkillLayoutMode>('three');
  const items = useMemo(
    () =>
      (mode === 'three' ? THREE_SKILL_LAYOUT : FOUR_SKILL_LAYOUT).filter(
        (item) =>
          !/^[0-4]$/.test(item.slotHotkey) ||
          heroSkills.some((skill) => skill.hotkey === item.slotHotkey),
      ),
    [heroSkills, mode],
  );

  // 4 个亚瑟技能的 CD/locked 状态:用 useState 持有(频率闸 ~10Hz)
  const [buttonStates, setButtonStates] = useState<
    Map<string, SkillButtonRuntimeState>
  >(() => new Map());
  // 频率闸:0.1s 分辨率 + locked 翻转
  const lastEmitted = useRef<Map<string, { cdInt: number; locked: boolean }>>(
    new Map(),
  );
  /** skill-stick:pointerdown 屏幕原点 */
  const dragOriginRef = useRef<{
    slotHotkey: string;
    clientX: number;
    clientY: number;
  } | null>(null);

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

  function displayHotkeyForSlot(slotHotkey: string): string {
    if (inputMode === 'desktop' && /^[0-4]$/.test(slotHotkey)) {
      return desktopLabelForSlot(slotHotkey);
    }
    return slotHotkey;
  }

  // 英雄技能按钮的名称与可见槽位均由加载的英雄配置决定。
  function renderHeroSkillOrb(item: SkillHudItem): JSX.Element | null {
    const heroSkill = heroSkills.find((skill) => skill.hotkey === item.slotHotkey);
    if (!heroSkill) return null;
    const state = buttonStates.get(item.slotHotkey);
    const cdRemaining = state?.cooldownRemaining ?? 0;
    const isLocked = state?.locked ?? false;
    const isReady = cdRemaining <= 0 && !isLocked;
    const castMode = castModes[item.slotHotkey] ?? 'instant';
    const useHoldRelease =
      devForceHoldRelease && /^[1-3]$/.test(item.slotHotkey)
        ? true
        : castMode === 'targeted';
    const displayHotkey = displayHotkeyForSlot(item.slotHotkey);
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
      useHoldRelease ? 'is-targeted' : '',
      aimingSlotHotkey === item.slotHotkey ? 'is-aiming' : '',
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
      dragOriginRef.current = {
        slotHotkey: item.slotHotkey,
        clientX: e.clientX,
        clientY: e.clientY,
      };
      onPressStart?.(item.slotHotkey);
    }
    function onMove(e: ReactPointerEvent<HTMLButtonElement>): void {
      const origin = dragOriginRef.current;
      if (!origin || origin.slotHotkey !== item.slotHotkey) return;
      const dx = e.clientX - origin.clientX;
      const dy = e.clientY - origin.clientY;
      if (Math.hypot(dx, dy) < SKILL_STICK_DEADZONE_PX) return;
      onDragMove?.({ slotHotkey: item.slotHotkey, dx, dy });
    }
    function onUp(e: ReactPointerEvent<HTMLButtonElement>): void {
      dragOriginRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      onPressEnd?.({
        slotHotkey: item.slotHotkey,
        clientX: e.clientX,
        clientY: e.clientY,
        inside: true,
      });
    }
    function onCancel(e: ReactPointerEvent<HTMLButtonElement>): void {
      dragOriginRef.current = null;
      onPressEnd?.({
        slotHotkey: item.slotHotkey,
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
        aria-label={heroSkill.name}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
      >
        <span className="skill-orb__icon">{displayHotkey}</span>
        {item.upgrade && <span className="skill-orb__upgrade">+</span>}
        {isCooling && (
          <span className="skill-orb__cooldown">
            {cdRemaining > 0
              ? cdRemaining >= 1
                ? Math.ceil(cdRemaining).toString()
                : cdRemaining.toFixed(1)
              : '·'}
          </span>
        )}
        <span className="skill-orb__label">{heroSkill.name}</span>
      </button>
    );
  }

  // function renderAttackModeOrb(item: AttackModeHudItem): JSX.Element {
  //   return (
  //     <button
  //       key={item.id}
  //       type="button"
  //       className="skill-orb skill-orb--attack"
  //       style={
  //         {
  //           '--skill-x': `${item.x}px`,
  //           '--skill-y': `${item.y}px`,
  //           '--skill-size': `${item.size}px`,
  //         } as CSSProperties
  //       }
  //       aria-label={item.label}
  //       onPointerDown={(e) => {
  //         if (e.pointerType === 'mouse' && e.button !== 0) return;
  //         e.preventDefault();
  //         onAttackModePress?.(item.priority);
  //       }}
  //     >
  //       <span className="skill-orb__icon">{item.hotkey}</span>
  //       <span className="skill-orb__label">{item.label}</span>
  //     </button>
  //   );
  // }

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
          className={`skill-hud__cancel${aimingSlotHotkey ? ' is-aiming' : ''}`}
          onPointerUp={
            aimingSlotHotkey
              ? (e) =>
                  onPressEnd?.({
                    slotHotkey: aimingSlotHotkey,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    inside: true,
                  })
              : undefined
          }
          data-testid="skill-hud-cancel"
          aria-hidden={!aimingSlotHotkey}
        >
          取消
        </div>
        {/* {inputMode === 'desktop' &&
          DESKTOP_ATTACK_MODE_LAYOUT.map((item) => renderAttackModeOrb(item))} */}
        {items.map((item) => {
          const isHeroSkill = /^[0-4]$/.test(item.slotHotkey);
          if (isHeroSkill) return renderHeroSkillOrb(item);
          const displayHotkey = item.slotHotkey;
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
              <span className="skill-orb__icon">{displayHotkey}</span>
              <span className="skill-orb__label">{item.label}</span>
              {item.upgrade && <span className="skill-orb__upgrade">+</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
});
