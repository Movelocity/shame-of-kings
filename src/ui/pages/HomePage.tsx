// proposal §1.5 + §5.5
import { useCallback, type JSX } from 'react';

interface HomePageProps {
  onStart: () => void;
}

export function HomePage({ onStart }: HomePageProps): JSX.Element {
  const handleStart = useCallback(async () => {
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
    onStart();
  }, [onStart]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0b1024',
        color: '#e8ecf5',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ margin: 0, fontSize: 36 }}>Web MOBA</h1>
      <p style={{ opacity: 0.7, marginTop: 8 }}>亚瑟 · 手法练习场</p>
      <button
        type="button"
        onClick={handleStart}
        style={{
          marginTop: 32,
          padding: '14px 36px',
          fontSize: 18,
          borderRadius: 8,
          border: 'none',
          background: '#3b78ff',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        开始游戏
      </button>
    </div>
  );
}
