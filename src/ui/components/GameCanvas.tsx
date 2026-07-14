// proposal §3.3 模块 A + §5.1:把 scene 挂到 canvas + 接入多种输入
// 桌面端:WASD / 方向键 + 鼠标左键点击寻路
// 移动端:虚拟摇杆
// 通过 ref + 每帧 read 模式给 loop tick,不触发 React 重渲染
//
// M3 T3.5:用 WorldState 替换 M2 临时 DebugWorld;DamageFloaters 走 Three.js Sprite;
// 1/2/3 键触发亚瑟 3 个主动技能,0 键普攻
// T19:血条挂到角色头上(Sprite + CanvasTexture,billboard 自动面向相机)
import { useCallback, useEffect, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react';
import { Raycaster, Vector2, Vector3, WebGLRenderer } from 'three';
import { REQUIRED_SHADOW_MAP } from '../../engine/renderer/lights';
import { createGameScene, type GameSceneHandle } from '../../engine/renderer/scene';
import { createFixedLoop } from '../../engine/loop/gameLoop';
import { ZERO_JOYSTICK, type JoystickState } from '../../engine/input/joystick';
import { createKeyboardMove } from '../../engine/input/keyboard-move';
import { isMobileUA } from '../../platform/isMobileUA';
import { MobileControls } from './MobileControls';
import { applyDamage } from '../../game/skills/runtime';
import type { Skill, Unit } from '../../game/skills/types';
import { createSkillBook } from '../../game/skills/skill-book';
import { asUnit } from '../../game/skills/debug-skills/DebugWorld';
import { arthurSkillByHotkey, ARTHUR_DATA } from '../../game/heroes/arthur';
import { createPracticeDummy } from '../../game/units/practice-dummy';
import { createWorldState } from '../../game/world/WorldState';
import { DamageFloaters } from '../../game/world/DamageFloaters';
import { createWorldHpBars, FACTION_COLORS } from '../../game/world/WorldHpBars';
import { SkillHud, type SkillHudHandle } from './SkillHud';

const ARTHUR_CAST_MODES: Readonly<Record<string, Skill['castMode']>> =
  Object.fromEntries(
    ARTHUR_DATA.skills.map((skill) => [skill.hotkey, skill.castMode ?? 'instant']),
  );

interface GameCanvasProps {
  sceneRef?: React.MutableRefObject<GameSceneHandle | null>;
  /** 重置信号:每次 .current 变化触发一次世界重置(回出生点 + dummy 满血 + 清空 activeSkill) */
  resetSignal?: React.MutableRefObject<number>;
}

export function GameCanvas({
  sceneRef: externalSceneRef,
  resetSignal,
}: GameCanvasProps = {}): JSX.Element {
  const skillHudRef = useRef<SkillHudHandle | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localSceneRef = useRef<GameSceneHandle | null>(null);
  const sceneRef = externalSceneRef ?? localSceneRef;
  const joyRef = useRef<JoystickState>(ZERO_JOYSTICK);
  const isMobile = useRef<boolean>(false);
  // T4 KI-4 移动端"瞄准中"状态:React state 仅用于驱动 .skill-hud__cancel.is-aiming
  // 视觉切换(不新建浮层,沿用 M3 .skill-hud__cancel 区域)
  const [aiming, setAiming] = useState<{ hotkey: string; skill: Skill } | null>(null);
  // 双写:state 触发 render,ref 供外层回调同步读最新值
  const aimStateRef = useRef<{ hotkey: string; skill: Skill } | null>(null);
  // 把 SkillBook / playerUnit 提升为组件级 useRef,
  // 让外层 onMobilePressStart / onMobilePressEnd 也能读到 (而不是 useEffect 闭包内的局部变量)
  const skillBookRef = useRef(createSkillBook());
  const playerUnitRef = useRef<Unit | null>(null);
  const setAimState = (next: { hotkey: string; skill: Skill } | null): void => {
    aimStateRef.current = next;
    setAiming(next);
  };
  const tryStartSkillByHotkey = (hotkey: string): boolean => {
    const skill = arthurSkillByHotkey(hotkey);
    const pu = playerUnitRef.current;
    if (!skill || !pu) return false;
    return skillBookRef.current.start(skill, pu, { forwardRad: pu.facingRad }) !== null;
  };
  const cancelAiming = (): void => {
    setAimState(null);
  };
  // 判定 (clientX, clientY) 是否落在 .skill-hud__cancel DOMRect 内
  // (沿用 M3 已锁的取消区,不另建浮层)
  function isInsideCancelRect(clientX: number, clientY: number): boolean {
    const el = document.querySelector('.skill-hud__cancel');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return (
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    );
  }
  const commitAimingFromPointer = (clientX: number, clientY: number, inside: boolean): void => {
    const cur = aimStateRef.current;
    if (!cur) return;
    // 抬起点在 .skill-hud__cancel 内 → 视为取消;否则 → 释放
    if (!inside || isInsideCancelRect(clientX, clientY)) {
      setAimState(null);
      return;
    }
    tryStartSkillByHotkey(cur.hotkey);
    setAimState(null);
  };
  const onSkillPressStart = (hotkey: string): void => {
    const skill = arthurSkillByHotkey(hotkey);
    if (!skill) return;
    if (aimStateRef.current || !skillBookRef.current.canStart(skill.id)) return;
    if (skill.castMode === 'targeted') {
      setAimState({ hotkey, skill });
    } else {
      tryStartSkillByHotkey(hotkey);
    }
  };
  const onSkillPressEnd = (info: {
    hotkey: string;
    clientX: number;
    clientY: number;
    inside: boolean;
  }): void => {
    if (!info.inside) {
      // 手指 / 鼠标滑出按钮 → 视为 cancel
      cancelAiming();
      return;
    }
    if (aimStateRef.current?.hotkey === info.hotkey) {
      commitAimingFromPointer(info.clientX, info.clientY, true);
    }
  };

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
    const skillBook = skillBookRef.current;

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
      // 3. 清空当前施法和每技能冷却
      skillBook.reset();
      // 4. dummy setRingPulse(0) 关闭残留闪烁
      gameScene.dummy.setRingPulse(0);
      // 5. T4:清掉瞄准中态(玩家在 targeted 技能按住时按"重置",应一起清)
      setAimState(null);
    };

    // M3 T3.3:WorldState 替换 M2 DebugWorld
    const playerUnit: Unit = asUnit(gameScene.player, 'player', ARTHUR_DATA.stats.hpMax, false);
    const dummyUnit: Unit = createPracticeDummy();
    // 把 playerUnit 写入组件级 ref,
    // 让外层 onMobilePressStart / onMobilePressEnd 也能访问
    playerUnitRef.current = playerUnit;
    const world = createWorldState({ units: [playerUnit, dummyUnit] });

    // T19:世界空间血条(billboard 跟随单位)
    const hpBars = createWorldHpBars();
    hpBars.register(playerUnit, FACTION_COLORS.player, 1.6, 1.6, 0.18);
    hpBars.register(dummyUnit, FACTION_COLORS.enemy, 1.4, 1.8, 0.2);
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

    // KI-3 预防:playerUnit.facingRad 由 controller 在每帧 update 末尾写入;
    // 技能 forwardRad 直接读 playerUnit.facingRad,这样元歌 23 连 / 镜飞雷神
    // 拿到的是"实时朝向",而不是写死的 0。

    // window 端 pointerup / pointercancel 兜底:
    // 瞄准中态兜底:
    //  - .skill-orb 走 onPointerUp 触发 cancel / 释放
    //  - .skill-hud__cancel 走自己的 onPointerUp(M3 区域)直接 cancel
    //  - 系统级 pointercancel / 切后台:用 aimStateRef 在 resetWorld + 自身 cleanup 中清

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
    // 桌面热键沿用按下即施；SkillBook 统一处理当前施法槽和每技能独立冷却。
    function onKeyDown(e: KeyboardEvent): void {
      if (!['1', '2', '3', '0'].includes(e.key)) return;
      const skill = arthurSkillByHotkey(e.key);
      if (!skill) return;
      skillBook.start(skill, playerUnit, {
        forwardRad: playerUnit.facingRad,
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

        // 同步 player position + facing 到 Unit(KI-3:实时朝向给元歌/镜用)
        playerUnit.position.x = gameScene.player.root.position.x;
        playerUnit.position.z = gameScene.player.root.position.z;
        playerUnit.facingRad = gameScene.controller.facingRad;

        // 统一推进当前施法与所有技能冷却；done 后释放施法槽，冷却继续独立倒计时。
        const completedSkills = skillBook.tick(dt, {
          caster: playerUnit,
          world,
          now: 0,
        });
        for (const completed of completedSkills) {
          const results = completed.damage;
          applyDamage([dummyUnit, playerUnit], results);
          world.notifyDamage(results);
          if (results.length > 0) {
            gameScene.dummy.setRingPulse(1);
          }
          if (completed.skill.displacement === 'dash') {
            gameScene.player.setPosition(
              playerUnit.position.x,
              0,
              playerUnit.position.z,
            );
          }
        }

        // KI-1:每帧把 4 技能的 cooldownTimer / locked 写到 SkillHud HUD
        // (M3 阶段热键 0/1/2/3 → 4 个技能,固定写入)
        const hud = skillHudRef.current;
        if (hud) {
          for (const hotkey of ['0', '1', '2', '3'] as const) {
            const sk = arthurSkillByHotkey(hotkey);
            if (!sk) continue;
            const active = skillBook.active;
            hud.updateButton(hotkey, {
              name: sk.displayName,
              hotkey,
              cooldownRemaining: skillBook.cooldownRemaining(sk.id),
              cooldownMax: sk.cooldown,
              locked: active !== null,
            });
          }
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
      skillBook.reset();
      playerUnitRef.current = null;
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
      {/* T4 KI-4:技能栏 + 瞄准中(沿用 M3 .skill-hud__cancel 区域,
          aimingHotkey 非空时该区域加 .is-aiming class) */}
      <SkillHud
        ref={skillHudRef}
        onPressStart={onSkillPressStart}
        onPressEnd={onSkillPressEnd}
        aimingHotkey={aiming?.hotkey ?? null}
        castModes={ARTHUR_CAST_MODES}
      />
    </>
  );
}
