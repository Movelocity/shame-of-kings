// proposal §3.3 模块 A + §5.1:把 scene 挂到 canvas + 接入多种输入
// 桌面端:WASD / 方向键 + 鼠标左键点击寻路(都要把屏幕轴归一为 JoystickState)
// 移动端:虚拟摇杆(屏幕轴已经是 JoystickState)
// 通过 ref + 每帧 read 模式给 loop tick,不触发 React 重渲染
import { useCallback, useEffect, useRef, type JSX, type MouseEvent as ReactMouseEvent } from 'react';
import { Raycaster, Vector2, Vector3, WebGLRenderer } from 'three';
import { REQUIRED_SHADOW_MAP } from '../../engine/renderer/lights';
import { createGameScene, type GameSceneHandle } from '../../engine/renderer/scene';
import { createFixedLoop } from '../../engine/loop/gameLoop';
import { ZERO_JOYSTICK, type JoystickState } from '../../engine/input/joystick';
import { createKeyboardMove } from '../../engine/input/keyboard-move';
import { isMobileUA } from '../../platform/isMobileUA';
import { Joystick } from './Joystick';

interface GameCanvasProps {
  /** 调试 UI(DebugOverlay)需要观察 scene。dev-only,生产 build 不渲染。 */
  sceneRef?: React.MutableRefObject<GameSceneHandle | null>;
}

export function GameCanvas({ sceneRef: externalSceneRef }: GameCanvasProps = {}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localSceneRef = useRef<GameSceneHandle | null>(null);
  const sceneRef = externalSceneRef ?? localSceneRef;
  const joyRef = useRef<JoystickState>(ZERO_JOYSTICK);
  const isMobile = useRef<boolean>(false);

  const handleJoystickChange = useCallback((s: JoystickState) => {
    joyRef.current = s;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    isMobile.current = isMobileUA();
    const keyboard = createKeyboardMove();
    const raycaster = new Raycaster();
    const groundPlane = new Vector3(0, 0.6, 0);

    const renderer = new WebGLRenderer({ canvas, antialias: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = REQUIRED_SHADOW_MAP;

    const gameScene = createGameScene({
      width: window.innerWidth,
      height: window.innerHeight,
    });
    sceneRef.current = gameScene;

    const loop = createFixedLoop();

    function onResize(): void {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      gameScene.follow.resize(w / h);
    }
    window.addEventListener('resize', onResize);

    // 桌面端:鼠标点击寻路。raycast 落点 → world xz,设 moveTarget
    function onCanvasClick(e: ReactMouseEvent<HTMLCanvasElement>): void {
      if (isMobile.current) return; // 移动端走摇杆
      if (e.button !== 0) return;
      const cam = gameScene.follow.camera;
      const rect = canvas!.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new Vector2(nx, ny), cam);
      // 用「camera → ground plane y=0.6」相交得到世界点
      const from = raycaster.ray.origin;
      const dir = raycaster.ray.direction;
      if (Math.abs(dir.y) < 1e-6) return;
      const t = (groundPlane.y - from.y) / dir.y;
      if (t <= 0) return;
      const hit = new Vector3(from.x + dir.x * t, groundPlane.y, from.z + dir.z * t);
      gameScene.controller.setMoveTarget({ x: hit.x, z: hit.z });
    }
    canvas.addEventListener('click', onCanvasClick as unknown as EventListener);

    loop.start(
      (dt: number) => {
        // 桌面端合并:WASD 优先级高于摇杆(移动端摇杆主导)
        const kv = keyboard.getMoveVector();
        const merged: JoystickState =
          Math.hypot(kv.x, kv.y) > 0 ? kv : joyRef.current;
        // 键盘输入到来时,清除点击寻路目标(类似摇杆主动输入)
        if (Math.hypot(kv.x, kv.y) > 0) {
          gameScene.controller.setMoveTarget(null);
        }
        gameScene.update(dt, merged);
      },
      () => {
        renderer.render(gameScene.scene, gameScene.follow.camera);
      },
    );

    return () => {
      loop.stop();
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('click', onCanvasClick as unknown as EventListener);
      keyboard.dispose();
      gameScene.dispose();
      renderer.dispose();
      sceneRef.current = null;
    };
  }, [sceneRef]);

  const mobile = typeof navigator !== 'undefined' && isMobileUA();

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          display: 'block',
          touchAction: 'none',
          cursor: mobile ? 'default' : 'crosshair',
        }}
      />
      {mobile && <Joystick onChange={handleJoystickChange} />}
    </>
  );
}
