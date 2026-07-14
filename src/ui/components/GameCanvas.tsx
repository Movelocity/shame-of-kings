// proposal §3.3 模块 A + §5.1:把 scene 挂到 canvas + 接入多种输入
// 桌面端:WASD / 方向键 + 鼠标左键点击寻路
// 移动端:虚拟摇杆
// 通过 ref + 每帧 read 模式给 loop tick,不触发 React 重渲染
//
// M3 T3.5:用 WorldState 替换 M2 临时 DebugWorld;DamageFloaters 走 Three.js Sprite;
// 1/2/3 键触发亚瑟 3 个主动技能,0 键普攻
// T19:血条挂到角色头上(Sprite + CanvasTexture,billboard 自动面向相机)
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
import { createWorldHpBars } from '../../game/world/WorldHpBars';

interface GameCanvasProps {
  sceneRef?: React.MutableRefObject<GameSceneHandle | null>;
  /** 重置信号:每次 .current 变化触发一次世界重置(回出生点 + dummy 满血 + 清空 activeSkill) */
  resetSignal?: React.MutableRefObject<number>;
}

export function GameCanvas({
  sceneRef: externalSceneRef,
  resetSignal,
}: GameCanvasProps = {}): JSX.Element {
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

    // T25:注入 resetWorld 闭包(DebugOverlay 的"重置"按钮通过 resetSignal 调到这里)
    gameScene.resetWorld = () => {
      // 1. 玩家回出生点(controller.reset 走 player-controller)
      gameScene.reset();
      // 2. dummy 满血
      dummyUnit.hp = dummyUnit.hpMax;
      // 3. 清空 activeSkill(避免中途的技能继续推进)
      activeSkillRef.current = null;
      // 4. dummy setRingPulse(0) 关闭残留闪烁
      gameScene.dummy.setRingPulse(0);
    };

    // M3 T3.3:WorldState 替换 M2 DebugWorld
    const playerUnit: Unit = asUnit(gameScene.player, 'player', ARTHUR_DATA.stats.hpMax, false);
    const dummyUnit: Unit = createPracticeDummy();
    const world = createWorldState({ units: [playerUnit, dummyUnit] });

    // T19:世界空间血条(billboard 跟随单位)
    const hpBars = createWorldHpBars();
    hpBars.register(playerUnit, '#3b78ff', 1.6, 1.6, 0.18);
    hpBars.register(dummyUnit, '#1fa4a8', 1.4, 1.8, 0.2);
    gameScene.scene.add(hpBars.group);

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
      if (activeSkillRef.current && activeSkillRef.current.phase !== 'done') return;
      const skill = arthurSkillByHotkey(e.key);
      if (!skill) return;
      activeSkillRef.current = startSkill(skill, playerUnit, {
        forwardRad: FACING_RAD,
      });
    }
    window.addEventListener('keydown', onKeyDown);

    const loop = createFixedLoop();

    loop.start(
      (dt: number) => {
        const kv = keyboard.getMoveVector();
        const merged: JoystickState =
          Math.hypot(kv.x, kv.y) > 0 ? kv : joyRef.current;
        if (Math.hypot(kv.x, kv.y) > 0) {
          gameScene.controller.setMoveTarget(null);
        }
        gameScene.update(dt, merged);

        // 同步 player position 到 Unit
        playerUnit.position.x = gameScene.player.root.position.x;
        playerUnit.position.z = gameScene.player.root.position.z;

        // 推进 active skill
        const active = activeSkillRef.current;
        if (active && active.phase !== 'done') {
          active.tick(dt, { caster: playerUnit, world, now: 0 });
          if (activeSkillRef.current?.phase === 'done') {
            const results = active.damage;
            applyDamage([dummyUnit, playerUnit], results);
            world.notifyDamage(results);
            if (results.length > 0) {
              gameScene.dummy.setRingPulse(1);
            }
            if (active.skill.displacement === 'dash') {
              gameScene.player.setPosition(
                playerUnit.position.x,
                0,
                playerUnit.position.z,
              );
            }
          }
        } else if (active && active.phase === 'done') {
          activeSkillRef.current = null;
        }

        // 飘字推进
        floaters.update(dt);
        // 血条推进(每帧读 unit 位置 + 百分比)
        hpBars.update();
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
      hpBars.dispose();
      gameScene.scene.remove(hpBars.group);
      gameScene.dispose();
      renderer.dispose();
      sceneRef.current = null;
    };
  }, [sceneRef]);

  // T25:监听 resetSignal 触发 resetWorld 闭包
  useEffect(() => {
    if (!resetSignal) return;
    const current = resetSignal.current;
    if (current === 0) return; // 初始 0 不触发
    const scene = sceneRef.current;
    scene?.resetWorld?.();
    // 故意不写 effect deps,只读 current 一次;counter 由 App 维护
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal?.current]);

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
