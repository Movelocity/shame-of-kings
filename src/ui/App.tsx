// proposal §1.5 + §5.5
//
// 阶段机:
//   home → play → play-portrait-fallback
// 移动端流程:
//   1. 进入应用 → home,点"开始游戏"→ screen.orientation.lock('landscape') + fullscreen → play
//   2. play 中若竖屏 → 显示遮罩 + 恢复横屏按钮,不渲染 Three.js
//   3. play 中按系统返回 → 弹确认对话框
//   4. 确认离开 → screen.orientation.unlock() + exitFullscreen() → 回 home
//   5. 回 home 后不再限制横竖屏(无遮罩、无监听)
// 桌面端:跳过 home 直接 play;不挂 popstate 监听(无系统返回键拦截意义)
import { useCallback, useEffect, useState, type JSX } from 'react';
import { isMobileUA } from '../platform/isMobileUA';
import { HomePage } from './pages/HomePage';
import { PlayPage } from './pages/PlayPage';

type Phase = 'home' | 'play' | 'play-portrait-fallback';

function detectPortrait(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(orientation: portrait)').matches;
  }
  return window.innerWidth < window.innerHeight;
}

export function App(): JSX.Element {
  const [phase, setPhase] = useState<Phase>(() => (isMobileUA() ? 'home' : 'play'));
  const [isPortrait, setIsPortrait] = useState<boolean>(detectPortrait);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState<boolean>(false);

  const isMobile = isMobileUA();

  // 监听竖/横屏切换(只在移动端 play 阶段生效;home 不限制)
  useEffect(() => {
    if (!isMobile) return;
    if (phase === 'home') return; // home 不再限制
    function update(): void {
      setIsPortrait(detectPortrait());
    }
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);
    const mql = window.matchMedia('(orientation: portrait)');
    const onMqlChange = (): void => update();
    mql.addEventListener('change', onMqlChange);
    return () => {
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
      mql.removeEventListener('change', onMqlChange);
    };
  }, [isMobile, phase]);

  // 移动端拦截系统返回键(play 阶段)
  // 实现:进入 play 时 pushState 占位 → popstate 触发时阻止默认 + 弹确认
  useEffect(() => {
    if (!isMobile) return;
    if (phase === 'home') return; // home 不拦截
    // 占位一条 history,让 popstate 有事件可触发
    window.history.pushState({ game: 'play' }, '');
    function onPopState(_e: PopStateEvent): void {
      // 用户按了返回:阻止历史回退,改弹确认
      window.history.pushState({ game: 'play' }, '');
      setShowLeaveConfirm(true);
    }
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [isMobile, phase]);

  // 锁横屏 + 全屏(进入 play 时)
  const requestLandscape = useCallback(async () => {
    try {
      const so = window.screen.orientation as { lock?: (o: string) => Promise<void> };
      if (so?.lock) await so.lock('landscape');
    } catch {
      // 软降级:CSS 横屏兜底
    }
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // 软降级
    }
  }, []);

  // 解锁横屏 + 退出全屏(离开 play 时)
  const releaseLandscape = useCallback(() => {
    try {
      const so = window.screen.orientation as { unlock?: () => void };
      if (so?.unlock) so.unlock();
    } catch {
      // 某些平台(桌面)无 orientation API,忽略
    }
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        void document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  }, []);

  // 确认离开
  const handleConfirmLeave = useCallback(() => {
    setShowLeaveConfirm(false);
    releaseLandscape();
    setPhase('home');
  }, [releaseLandscape]);

  // 取消离开(继续游戏)
  const handleCancelLeave = useCallback(() => {
    setShowLeaveConfirm(false);
  }, []);

  // 阶段决策
  if (phase === 'home') {
    return <HomePage onStart={() => setPhase('play')} />;
  }

  if (isMobile && isPortrait) {
    return (
      <>
        <PortraitOverlay onRequestLandscape={requestLandscape} onContinueInLandscape={() => {}} />
        {showLeaveConfirm && (
          <LeaveConfirmDialog onConfirm={handleConfirmLeave} onCancel={handleCancelLeave} />
        )}
      </>
    );
  }

  return (
    <>
      <PlayPage />
      {showLeaveConfirm && (
        <LeaveConfirmDialog onConfirm={handleConfirmLeave} onCancel={handleCancelLeave} />
      )}
    </>
  );
}

interface PortraitOverlayProps {
  onRequestLandscape: () => Promise<void>;
  onContinueInLandscape: () => void;
}

function PortraitOverlay({ onRequestLandscape }: PortraitOverlayProps): JSX.Element {
  return (
    <div
      data-testid="portrait-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a2230',
        color: '#e8ecf5',
        fontFamily: 'system-ui, sans-serif',
        padding: '0 24px',
        textAlign: 'center',
        zIndex: 1000,
      }}
    >
      <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 16 }} aria-hidden>
        📱↻
      </div>
      <h2 style={{ margin: 0, fontSize: 22 }}>请将设备旋转为横屏</h2>
      <p style={{ opacity: 0.7, marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>
        本游戏需要横屏才能正常游玩。
        <br />
        请旋转设备后继续。
      </p>
      <button
        type="button"
        onClick={() => void onRequestLandscape()}
        style={{
          marginTop: 24,
          padding: '12px 28px',
          fontSize: 16,
          borderRadius: 8,
          border: 'none',
          background: '#3b78ff',
          color: '#fff',
          cursor: 'pointer',
          touchAction: 'manipulation',
        }}
      >
        恢复横屏全屏
      </button>
    </div>
  );
}

interface LeaveConfirmDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

function LeaveConfirmDialog({ onConfirm, onCancel }: LeaveConfirmDialogProps): JSX.Element {
  return (
    <div
      data-testid="leave-confirm"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1100,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: 'min(360px, calc(100vw - 48px))',
          background: '#fff',
          color: '#1a2230',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          textAlign: 'center',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 18 }}>返回主页面?</h3>
        <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5, opacity: 0.78 }}>
          即将退出游戏,横屏锁定也会解除。
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '10px 0',
              fontSize: 15,
              borderRadius: 8,
              border: '1px solid rgba(20,28,48,0.18)',
              background: '#fff',
              color: '#1a2230',
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            继续游戏
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '10px 0',
              fontSize: 15,
              borderRadius: 8,
              border: 'none',
              background: '#3b78ff',
              color: '#fff',
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            确认返回
          </button>
        </div>
      </div>
    </div>
  );
}
