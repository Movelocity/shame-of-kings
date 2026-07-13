// proposal §1.5 + §5.5
import { useEffect, useState, type JSX } from 'react';
import { isMobileUA } from '../platform/isMobileUA';
import { HomePage } from './pages/HomePage';
import { PlayPage } from './pages/PlayPage';

type Phase = 'home' | 'play';

export function App(): JSX.Element {
  const [phase, setPhase] = useState<Phase>(() => (isMobileUA() ? 'home' : 'play'));

  useEffect(() => {
    // M0 不强做竖屏检测刷新,留 hook 给 P2.5
  }, []);

  if (phase === 'home') return <HomePage onStart={() => setPhase('play')} />;
  return <PlayPage />;
}
