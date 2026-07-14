// proposal §1.5 + §5.5
//
// HomePage 设计意图:
//   项目命名为 "Shame of Kings" — 荣耀是结果,耻辱是过程;我们讲过程的故事。
//   首页视觉走"极简水墨黑":克制、留白、不做动画;内联 SVG 装饰(断裂王冠)
//   衬线大写标题 + 细金线边框按钮呼应"战损史诗",但配色压暗、不滥用渐变。
//   静态:无任何 @keyframes,跨设备稳定,无 prefers-reduced-motion 顾虑。
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

  // 共享调色板(用 CSS var 让子元素统一引用)
  const palette = {
    bg: '#0a0c10',
    bgRadial: '#1a1d24',
    text: '#e8e2cf',
    textDim: '#888888',
    textMeta: '#555555',
    accent: '#c8a45c', // 古金
  };

  return (
    <div
      data-testid="home-page"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: `radial-gradient(ellipse at center, ${palette.bgRadial} 0%, ${palette.bg} 70%)`,
        color: palette.text,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* 装饰:右上断裂王冠(细线条) */}
      <BrokenCrown
        color={palette.accent}
        size={96}
        style={{
          position: 'absolute',
          top: 'max(36px, env(safe-area-inset-top, 0px))',
          right: 'max(36px, env(safe-area-inset-right, 0px))',
          opacity: 0.35,
        }}
      />

      {/* 装饰:左下断裂王冠(镜像) */}
      <BrokenCrown
        color={palette.accent}
        size={64}
        mirrored
        style={{
          position: 'absolute',
          bottom: 'max(36px, env(safe-area-inset-bottom, 0px))',
          left: 'max(36px, env(safe-area-inset-left, 0px))',
          opacity: 0.22,
        }}
      />

      {/* 主标题 */}
      <h1
        style={{
          margin: 0,
          fontFamily: 'Georgia, "Songti SC", "Source Han Serif SC", serif',
          fontSize: 'clamp(40px, 9vw, 64px)',
          fontWeight: 400,
          letterSpacing: '0.3em',
          textIndent: '0.3em', // 补偿字间距让标题视觉居中
          color: palette.text,
          textShadow: '0 2px 12px rgba(0, 0, 0, 0.5)',
        }}
      >
        SHAME OF KINGS
      </h1>

      {/* 副标题中文 */}
      <p
        style={{
          margin: '12px 0 0',
          fontSize: 13,
          letterSpacing: '0.4em',
          textIndent: '0.4em',
          color: palette.textDim,
          fontWeight: 300,
        }}
      >
        荣耀是结果 · 耻辱是过程
      </p>

      {/* 装饰细线 */}
      <div
        aria-hidden
        style={{
          marginTop: 28,
          width: 48,
          height: 1,
          background: palette.accent,
          opacity: 0.5,
        }}
      />

      {/* 开始按钮 */}
      <button
        type="button"
        onClick={handleStart}
        data-testid="home-start"
        style={{
          marginTop: 36,
          padding: '14px 48px',
          fontSize: 14,
          fontFamily: 'Georgia, "Songti SC", serif',
          letterSpacing: '0.4em',
          textIndent: '0.4em',
          borderRadius: 0,
          border: `1px solid ${palette.accent}`,
          background: 'transparent',
          color: palette.text,
          cursor: 'pointer',
          touchAction: 'manipulation',
          transition: 'background 200ms, color 200ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = palette.accent;
          e.currentTarget.style.color = palette.bg;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = palette.text;
        }}
      >
        开始游戏
      </button>

      {/* 底部 meta */}
      <div
        style={{
          position: 'absolute',
          bottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
          left: 0,
          right: 0,
          textAlign: 'center',
          font: '10px ui-monospace, "SF Mono", monospace',
          letterSpacing: '0.2em',
          color: palette.textMeta,
        }}
      >
        v0.1.0 · MVP
      </div>
    </div>
  );
}

/** 断裂王冠 SVG(细线条,currentColor 描边)
 *  设计:标准王冠(5 尖 + 3 宝石位),中央尖被斜切开;
 *  `mirrored` 翻转用于左下角(对称布局) */
interface BrokenCrownProps {
  color: string;
  size: number;
  mirrored?: boolean;
  style?: React.CSSProperties;
}

function BrokenCrown({ color, size, mirrored, style }: BrokenCrownProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 100 60"
      width={size}
      height={(size * 60) / 100}
      style={{ ...style, transform: mirrored ? 'scaleX(-1)' : undefined }}
      aria-hidden
    >
      {/* 底带 */}
      <line x1="10" y1="50" x2="90" y2="50" stroke={color} strokeWidth="1.5" />
      {/* 5 个尖(左到右);中央尖从中间斜切,留出断口 */}
      <polyline
        points="10,50 18,18 28,40"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <polyline
        points="28,40 35,28 42,35"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* 中央尖被切开:左半尖从 42 上升断于 48 */}
      <polyline
        points="42,35 48,12"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* 中央尖右半从 58 下降接到 60 */}
      <polyline
        points="58,12 60,38"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <polyline
        points="60,38 66,28 72,40"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <polyline
        points="72,40 82,18 90,50"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* 3 个宝石(小圆):左/中/右;中央宝石掉落一点(略偏下) */}
      <circle cx="18" cy="34" r="1.5" fill={color} />
      <circle cx="50" cy="46" r="1.2" fill={color} opacity="0.8" />
      <circle cx="82" cy="34" r="1.5" fill={color} />
    </svg>
  );
}
