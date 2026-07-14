// proposal §3.3 模块 A + §5.1:把 scene 挂到 canvas + 接入多种输入
// 桌面端:WASD / 方向键 + 鼠标左键点击寻路(都要把屏幕轴归一为 JoystickState)
// 移动端:虚拟摇杆(屏幕轴已经是 JoystickState)
// 通过 ref + 每帧 read 模式给 loop tick,不触发 React 重渲染
//
// M2 T2.5:dev-only,1/2/3/4 键触发 4 个调试技能,把 scene 的 player/dummy
// 桥接到 Skill 框架的 Unit/WorldLike。M3 起由 WorldState.ts 替换 DebugWorld。
import { useCallback, useEffect, useRef, type JSX, type MouseEvent as ReactMouseEvent } from 'react';
import { Raycaster, Vector2, Vector3, WebGLRenderer } from 'three';
import { REQUIRED_SHADOW_MAP } from '../../engine/renderer/lights';
import { createGameScene, type GameSceneHandle } from '../../engine/renderer/scene';
import { createFixedLoop } from '../../engine/loop/gameLoop';
import { ZERO_JOYSTICK, type JoystickState } from '../../engine/input/joystick';
import { createKeyboardMove } from '../../engine/input/keyboard-move';
import { isMobileUA } from '../../platform/isMobileUA';
import { MobileControls } from './MobileControls';
import { applyDamage, startSkill } from '../../game/skills/runtime';
import type { SkillInstance, Unit } from '../../game/skills/types';
import { debugSkillByHotkey } from '../../game/skills/debug-skills';
import { createDebugWorld, asUnit } from '../../game/skills/debug-skills/DebugWorld';

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

  const handleSetCameraOffset = useCallback(
    (x: number, z: number) => {
      const scene = sceneRef.current;
      scene?.follow.setCameraOffset(x, z);
    },
    [sceneRef],
  );

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

    // M2 T2.5:把 scene 的 visual 桥到 Skill 框架
    // 用 ref 而不是 useState:hot state 不需要触发 React 渲染
    const playerUnit: Unit = asUnit(gameScene.player, 'player', 1000, false);
    const dummyUnit: Unit = asUnit(gameScene.dummy, 'dummy', 1000, true);
    const world = createDebugWorld(playerUnit, dummyUnit);
    const activeSkillRef = { current: null as SkillInstance | null };
    // M2 调试阶段朝向固定 world -Z(玩家面朝地图深处)
    // M3 T3.1 亚瑟上线后,从 controller 读实时 facing
    const FACING_RAD = 0;

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
      const from = raycaster.ray.origin;
      const dir = raycaster.ray.direction;
      if (Math.abs(dir.y) < 1e-6) return;
      const t = (groundPlane.y - from.y) / dir.y;
      if (t <= 0) return;
      const hit = new Vector3(from.x + dir.x * t, groundPlane.y, from.z + dir.z * t);
      gameScene.controller.setMoveTarget({ x: hit.x, z: hit.z });
    }
    canvas.addEventListener('click', onCanvasClick as unknown as EventListener);

    // DEV-only:1/2/3/4 键触发调试技能
    function onKeyDown(e: KeyboardEvent): void {
      if (!import.meta.env.DEV) return;
      if (!['1', '2', '3', '4'].includes(e.key)) return;
      // 同帧已有 active → 不重入,避免覆盖未完结的实例(proposal §5.2:可中断但不该自动覆盖)
      if (activeSkillRef.current && activeSkillRef.current.phase !== 'done') return;
      const skill = debugSkillByHotkey(e.key as '1' | '2' | '3' | '4');
      if (!skill) return;
      activeSkillRef.current = startSkill(skill, playerUnit, {
        forwardRad: FACING_RAD,
      });
    }
    window.addEventListener('keydown', onKeyDown);

    const loop = createFixedLoop();

    loop.start(
      (dt: number) => {
        // 桌面端合并:WASD 优先级高于摇杆(移动端摇杆主导)
        const kv = keyboard.getMoveVector();
        const merged: JoystickState =
          Math.hypot(kv.x, kv.y) > 0 ? kv : joyRef.current;
        if (Math.hypot(kv.x, kv.y) > 0) {
          gameScene.controller.setMoveTarget(null);
        }
        gameScene.update(dt, merged);

        // 同步 player/dummy 的位置到 Unit(每帧读最新)
        playerUnit.position.x = gameScene.player.root.position.x;
        playerUnit.position.z = gameScene.player.root.position.z;
        dummyUnit.position.x = gameScene.dummy.root.position.x;
        dummyUnit.position.z = gameScene.dummy.root.position.z;

        // 读 controller 设的 facing(如果 controller 暴露了接口;否则用 0)
        // proposal v2:player-controller 暂未导出 facing;fallback 用 last known
        // 简单做法:activeSkill forward 用 facingRadRef;初始 0(玩家朝 -Z)
        // 这里不读 controller 的 facing,沿用 onKeyDown 时的 forwardRad 已够调试

        // 推进 active skill
        const active = activeSkillRef.current;
        if (active && active.phase !== 'done') {
          active.tick(dt, { caster: playerUnit, world, now: 0 });
          // tick 后 phase 可能是 done;用 ref 重读
          if (activeSkillRef.current?.phase === 'done') {
            // 命中结算:把 damage 扣到 dummy
            applyDamage([dummyUnit], active.damage);
            if (active.damage.length > 0) {
              gameScene.dummy.setRingPulse(1); // dummy 闪烁反馈
            }
          }
        }

        // dash:playerUnit.position 已被 applyDash 改写,写回 visual
        if (active && active.skill.displacement === 'dash' && active.phase === 'recovery') {
          // 一次性突进:applyDash 在 active 起始已经执行;这里做兜底
          gameScene.player.setPosition(
            playerUnit.position.x,
            0,
            playerUnit.position.z,
          );
        }
      },
      () => {
        renderer.render(gameScene.scene, gameScene.follow.camera);
      },
    );

    return () => {
      loop.stop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
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
      {mobile && (
        <MobileControls
          joystickRef={joyRef}
          setCameraOffset={handleSetCameraOffset}
        />
      )}
    </>
  );
}
