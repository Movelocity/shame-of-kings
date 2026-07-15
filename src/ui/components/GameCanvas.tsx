// proposal §3.3 模块 A + §5.1:把 scene 挂到 canvas + 接入多种输入
// 桌面端:WASD / 方向键 + 鼠标左键点击寻路;J/K/L 普攻,U/I/O/P 技能 1–4
// 移动端:虚拟摇杆
// 通过 ref + 每帧 read 模式给 loop tick,不触发 React 重渲染
//
// M3 T3.5:用 WorldState 替换 M2 临时 DebugWorld;DamageFloaters 走 Three.js Sprite;
// T19:血条挂到角色头上(Sprite + CanvasTexture,billboard 自动面向相机)
import { useCallback, useEffect, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react';
import { Raycaster, Vector2, Vector3, WebGLRenderer } from 'three';
import { REQUIRED_SHADOW_MAP } from '../../engine/renderer/lights';
import { createGameScene, type GameSceneHandle } from '../../engine/renderer/scene';
import { createFixedLoop } from '../../engine/loop/gameLoop';
import { resolveDesktopSkillKey, type AutoAttackPriority } from '../../engine/input/desktop-skill-hotkeys';
import { ZERO_JOYSTICK, type JoystickState } from '../../engine/input/joystick';
import { createKeyboardMove } from '../../engine/input/keyboard-move';
import { isMobileUA } from '../../platform/isMobileUA';
import { MobileControls } from './MobileControls';
import type { Skill, SkillInstance } from '../../game/skills/types';
import { asUnit } from '../../game/units/as-unit';
import {
  arthurSkillByHotkey,
  ARTHUR_DATA,
} from '../../game/heroes/arthur';
import { createPracticeDummy } from '../../game/units/practice-dummy';
import {
  createPracticeSession,
  type PracticeSession,
} from '../../game/world/practice-session';
import { DamageFloaters } from '../../game/world/DamageFloaters';
import { createHitboxVfx } from '../../game/world/HitboxVfx';
import { createWorldHpBars, FACTION_COLORS } from '../../game/world/WorldHpBars';
import { SkillHud, type SkillHudHandle } from './SkillHud';

const ARTHUR_CAST_MODES: Readonly<Record<string, Skill['castMode']>> =
  Object.fromEntries(
    ARTHUR_DATA.skills.map((skill) => [skill.hotkey, skill.castMode ?? 'instant']),
  );

interface GameCanvasProps {
  sceneRef?: React.MutableRefObject<GameSceneHandle | null>;
}

export function GameCanvas({
  sceneRef: externalSceneRef,
}: GameCanvasProps = {}): JSX.Element {
  const skillHudRef = useRef<SkillHudHandle | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localSceneRef = useRef<GameSceneHandle | null>(null);
  const sceneRef = externalSceneRef ?? localSceneRef;
  const joyRef = useRef<JoystickState>(ZERO_JOYSTICK);
  const isMobile = useRef<boolean>(false);
  const sessionRef = useRef<PracticeSession | null>(null);
  // T4 KI-4 移动端"瞄准中"状态:React state 仅用于驱动 .skill-hud__cancel.is-aiming
  const [aiming, setAiming] = useState<{ slotHotkey: string; skill: Skill } | null>(null);
  const aimStateRef = useRef<{ slotHotkey: string; skill: Skill } | null>(null);
  const setAimState = (next: { slotHotkey: string; skill: Skill } | null): void => {
    aimStateRef.current = next;
    setAiming(next);
  };

  const requestAutoAttack = (priority: AutoAttackPriority = 'default'): boolean => {
    const session = sessionRef.current;
    if (!session) return false;
    return session.requestAutoAttack(priority);
  };
  const tryStartSkillBySlot = (slotHotkey: string): boolean => {
    const session = sessionRef.current;
    if (!session) return false;
    return session.tryCastHotkey(slotHotkey);
  };
  const cancelAiming = (): void => {
    setAimState(null);
  };
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
    if (!inside || isInsideCancelRect(clientX, clientY)) {
      setAimState(null);
      return;
    }
    tryStartSkillBySlot(cur.slotHotkey);
    setAimState(null);
  };
  const onSkillPressStart = (slotHotkey: string): void => {
    if (slotHotkey === '0') {
      requestAutoAttack();
      return;
    }
    const skill = arthurSkillByHotkey(slotHotkey);
    const session = sessionRef.current;
    if (!skill || !session) return;
    if (aimStateRef.current || !session.skillBook.canStart(skill.id)) return;
    if (skill.castMode === 'targeted') {
      setAimState({ slotHotkey, skill });
    } else {
      tryStartSkillBySlot(slotHotkey);
    }
  };
  const onAttackModePress = (
    priority: Exclude<AutoAttackPriority, 'default'>,
  ): void => {
    requestAutoAttack(priority);
  };
  const onSkillPressEnd = (info: {
    slotHotkey: string;
    clientX: number;
    clientY: number;
    inside: boolean;
  }): void => {
    if (!info.inside) {
      cancelAiming();
      return;
    }
    if (aimStateRef.current?.slotHotkey === info.slotHotkey) {
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

    const playerUnit = asUnit(gameScene.player, 'player', ARTHUR_DATA.stats.hpMax, false);
    const dummyUnit = createPracticeDummy();
    const session = createPracticeSession({ playerUnit, dummyUnit });
    sessionRef.current = session;

    const resetWorld = (): void => {
      gameScene.reset();
      session.resetWorld();
      gameScene.controller.setSpeedMultiplier(1);
      gameScene.dummy.setRingPulse(0);
      setAimState(null);
    };
    gameScene.resetWorld = resetWorld;

    const hpBars = createWorldHpBars();
    hpBars.register(session.playerUnit, FACTION_COLORS.player, 1.6, 1.6, 0.18);
    hpBars.register(session.dummyUnit, FACTION_COLORS.enemy, 1.4, 1.8, 0.2);
    gameScene.scene.add(hpBars.group);

    const floaters = new DamageFloaters();
    gameScene.scene.add(floaters.group);
    const hitboxVfx = createHitboxVfx();
    gameScene.scene.add(hitboxVfx.group);
    const hitboxFlashed = new WeakSet<SkillInstance>();

    const unsubscribeDamage = session.world.subscribeDamage((results) => {
      for (const r of results) {
        const target = session.world.getUnit(r.targetId);
        if (!target) continue;
        floaters.add(r.targetId, r.damage, target.position, r.isCrit);
      }
    });

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
      session.cancelAutoAttack();
      gameScene.controller.setMoveTarget({ x: hit.x, z: hit.z });
    }
    canvas.addEventListener('click', onCanvasClick as unknown as EventListener);

    function onKeyDown(e: KeyboardEvent): void {
      const action = resolveDesktopSkillKey(e.key);
      if (!action) return;
      e.preventDefault();
      if (action.kind === 'attack') {
        session.requestAutoAttack(action.priority);
        return;
      }
      session.tryCastHotkey(action.slotHotkey);
    }
    window.addEventListener('keydown', onKeyDown);

    const loop = createFixedLoop();

    loop.start(
      (dt: number) => {
        const kv = keyboard.getMoveVector();
        const joy = joyRef.current;
        const merged: JoystickState =
          Math.hypot(kv.x, kv.y) > 0 ? kv : joy;
        const manualMove = Math.hypot(merged.x, merged.y) > 1e-6;

        const pre = session.preTick({
          dt,
          manualMove,
          playerX: gameScene.player.root.position.x,
          playerZ: gameScene.player.root.position.z,
        });

        if (pre.clearMoveTarget) {
          gameScene.controller.setMoveTarget(null);
        }
        gameScene.controller.setSpeedMultiplier(pre.speedMultiplier);
        if (pre.moveTarget) {
          gameScene.controller.setMoveTarget({
            x: pre.moveTarget.x,
            z: pre.moveTarget.z,
          });
        }
        if (pre.facingRad !== null) {
          gameScene.controller.setFacingRad(pre.facingRad);
          gameScene.player.setFacingRad(pre.facingRad);
        }

        gameScene.update(dt, merged);

        const post = session.postTick({
          dt,
          playerX: gameScene.player.root.position.x,
          playerZ: gameScene.player.root.position.z,
          facingRad: gameScene.controller.facingRad,
        });

        const activeInst = session.skillBook.active;
        if (
          activeInst &&
          activeInst.phase === 'active' &&
          !hitboxFlashed.has(activeInst)
        ) {
          hitboxFlashed.add(activeInst);
          hitboxVfx.spawn(
            activeInst.skill.hit,
            activeInst.origin,
            activeInst.forwardRad,
          );
        }
        if (post.dummyRingPulse) {
          gameScene.dummy.setRingPulse(1);
        }
        if (post.dashSync) {
          gameScene.player.setPosition(
            post.dashSync.x,
            0,
            post.dashSync.z,
          );
        }

        const hud = skillHudRef.current;
        if (hud) {
          for (const btn of session.getHudButtons()) {
            hud.updateButton(btn.hotkey, btn);
          }
        }

        floaters.update(dt);
        hitboxVfx.update(dt);
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
      hitboxVfx.dispose();
      gameScene.scene.remove(hitboxVfx.group);
      hpBars.dispose();
      gameScene.scene.remove(hpBars.group);
      gameScene.dispose();
      renderer.dispose();
      session.resetWorld();
      sessionRef.current = null;
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
      <SkillHud
        ref={skillHudRef}
        inputMode={mobile ? 'mobile' : 'desktop'}
        onPressStart={onSkillPressStart}
        onAttackModePress={onAttackModePress}
        onPressEnd={onSkillPressEnd}
        aimingSlotHotkey={aiming?.slotHotkey ?? null}
        castModes={ARTHUR_CAST_MODES}
      />
    </>
  );
}
