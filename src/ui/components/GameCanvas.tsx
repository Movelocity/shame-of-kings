// proposal §3.3 模块 A + §5.1:把 scene 挂到 canvas + 接入多种输入
// 桌面端:WASD / 方向键 + 鼠标左键点击寻路
// 移动端:虚拟摇杆
// 通过 ref + 每帧 read 模式给 loop tick,不触发 React 重渲染
//
// M3 T3.5:用 WorldState 替换 M2 临时 DebugWorld;DamageFloaters 走 Three.js Sprite;
// 1/2/3 键触发亚瑟 3 个主动技能,0 键普攻(proposal §3.2 亚瑟 4 技能)
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
import { asUnit } from '../../game/skills/debug-skills/DebugWorld';
import { arthurSkillByHotkey, ARTHUR_DATA } from '../../game/heroes/arthur';
import { createPracticeDummy } from '../../game/units/practice-dummy';
import { createWorldState } from '../../game/world/WorldState';
import { DamageFloaters } from '../../game/world/DamageFloaters';
import { HpBar } from './HpBar';
import { DummyHpBar } from './DummyHpBar';

interface GameCanvasProps {
  sceneRef?: React.MutableRefObject<GameSceneHandle | null>;
}

export function GameCanvas({ sceneRef: externalSceneRef }: GameCanvasProps = {}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localSceneRef = useRef<GameSceneHandle | null>(null);
  const sceneRef = externalSceneRef ?? localSceneRef;
  const joyRef = useRef<JoystickState>(ZERO_JOYSTICK);
  const isMobile = useRef<boolean>(false);
  // HUD 订阅的 unit ref(M3 起不再走 useState,避免每帧 React 重渲)
  const playerRef = useRef<Unit | null>(null);
  const dummyRef = useRef<Unit | null>(null);

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

    // M3 T3.3:WorldState 替换 M2 DebugWorld
    const playerUnit: Unit = asUnit(gameScene.player, 'player', ARTHUR_DATA.stats.hpMax, false);
    const dummyUnit: Unit = createPracticeDummy();
    const world = createWorldState({ units: [playerUnit, dummyUnit] });
    playerRef.current = playerUnit;
    dummyRef.current = dummyUnit;

    // M3 T3.5:飘字(Sprite)挂到 scene
    const floaters = new DamageFloaters();
    gameScene.scene.add(floaters.group);

    // damage 事件 → 飘字
    const unsubscribeDamage = world.subscribeDamage((results) => {
      for (const r of results) {
        const target = world.getUnit(r.targetId);
        if (!target) continue;
        floaters.add(r.targetId, r.damage, target.position, r.isCrit);
      }
    });

    const activeSkillRef = { current: null as SkillInstance | null };
    // 朝向:由 controller 在 update 里设;M3 阶段先用 0(玩家朝 -Z)
    const FACING_RAD = 0;

    function onResize(): void {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      gameScene.follow.resize(w / h);
    }
    window.addEventListener('resize', onResize);

    function onCanvasClick(e: ReactMouseEvent<HTMLCanvasElement>): void {
      if (isMobile.current) return;
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

    // 1/2/3 键触发亚瑟 3 个主动技能;0 普攻
    function onKeyDown(e: KeyboardEvent): void {
      if (!['1', '2', '3', '0'].includes(e.key)) return;
      // CD 检查:cooldownTimer > 0 不允许
      if (activeSkillRef.current && activeSkillRef.current.phase !== 'done') return;
      const skill = arthurSkillByHotkey(e.key);
      if (!skill) return;
      // 进入施法:activeSkillRef 设新实例;cooldown 已由 startSkill 初始化
      activeSkillRef.current = startSkill(skill, playerUnit, {
        forwardRad: FACING_RAD,
      });
    }
    window.addEventListener('keydown', onKeyDown);

    const loop = createFixedLoop();

    loop.start(
      (dt: number) => {
        // 桌面端合并输入
        const kv = keyboard.getMoveVector();
        const merged: JoystickState =
          Math.hypot(kv.x, kv.y) > 0 ? kv : joyRef.current;
        if (Math.hypot(kv.x, kv.y) > 0) {
          gameScene.controller.setMoveTarget(null);
        }
        gameScene.update(dt, merged);

        // 同步 player position 到 Unit(controller 改写了 visual.root.position)
        playerUnit.position.x = gameScene.player.root.position.x;
        playerUnit.position.z = gameScene.player.root.position.z;
        // dummy 位置固定,不需要同步(但保留以防未来 dummy 移动)

        // 推进 active skill
        const active = activeSkillRef.current;
        if (active && active.phase !== 'done') {
          active.tick(dt, { caster: playerUnit, world, now: 0 });
          if (activeSkillRef.current?.phase === 'done') {
            // 命中结算
            const results = active.damage;
            applyDamage([dummyUnit, playerUnit], results);
            world.notifyDamage(results);
            if (results.length > 0) {
              gameScene.dummy.setRingPulse(1);
            }
            // dash:把 Unit 位置写回 visual
            if (active.skill.displacement === 'dash') {
              gameScene.player.setPosition(
                playerUnit.position.x,
                0,
                playerUnit.position.z,
              );
            }
          }
        } else if (active && active.phase === 'done') {
          // 推进完后自然 done → 释放引用
          activeSkillRef.current = null;
        }

        // 飘字推进
        floaters.update(dt);
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
      unsubscribeDamage();
      floaters.dispose();
      gameScene.scene.remove(floaters.group);
      gameScene.dispose();
      renderer.dispose();
      sceneRef.current = null;
      playerRef.current = null;
      dummyRef.current = null;
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
      <HpBar unitRef={playerRef} label={ARTHUR_DATA.displayName} />
      <DummyHpBar unitRef={dummyRef} />
      {mobile && (
        <MobileControls
          joystickRef={joyRef}
          setCameraOffset={handleSetCameraOffset}
        />
      )}
    </>
  );
}
