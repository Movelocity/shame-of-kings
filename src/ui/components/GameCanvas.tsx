// proposal §3.3 模块 A + §5.1:把 scene 挂到 canvas + 接入多种输入
// 桌面端:WASD / 方向键 + 鼠标左键点击寻路;J/K/L 普攻,U/I/O/P 技能 1–4
// 移动端:虚拟摇杆
// 通过 ref + 每帧 read 模式给 loop tick,不触发 React 重渲染
//
// M3 T3.5:用 WorldState 替换 M2 临时 DebugWorld;DamageFloaters 走 Three.js Sprite;
// T19:血条挂到角色头上(Sprite + CanvasTexture,billboard 自动面向相机)
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { PerspectiveCamera, WebGLRenderer } from 'three';
import { REQUIRED_SHADOW_MAP } from '../../engine/renderer/lights';
import { createGameScene, type GameSceneHandle } from '../../engine/renderer/scene';
import { createFixedLoop } from '../../engine/loop/gameLoop';
import { resolveDesktopSkillKey, type AutoAttackPriority } from '../../engine/input/desktop-skill-hotkeys';
import { ZERO_JOYSTICK, type JoystickState } from '../../engine/input/joystick';
import { createKeyboardMove } from '../../engine/input/keyboard-move';
import { isMobileUA } from '../../platform/isMobileUA';
import { MobileControls } from './MobileControls';
import type { Skill, SkillDelivery, SkillInstance } from '../../game/skills/types';
import { asUnit } from '../../game/units/as-unit';
import {
  getHeroHpMax,
  getHeroKitSkills,
  heroAimKindByHotkey,
  heroSkillByHotkey,
  HERO_IDS,
  heroDisplayName,
  type HeroId,
} from '../../game/heroes/index';
import {
  createPracticeDummy,
  PRACTICE_DUMMY_ID,
} from '../../game/units/practice-dummy';
import {
  createPracticeSession,
  type PracticeSession,
} from '../../game/world/practice-session';
import { DamageFloaters } from '../../game/world/DamageFloaters';
import { createHitboxVfx, type HitboxVfxHandle } from '../../game/world/HitboxVfx';
import { createAimIndicatorVfx, type AimIndicatorVfxHandle } from '../../game/world/AimIndicatorVfx';
import type { PersistentAreaEffect } from '../../game/world/skill-effects/persistent-area';
import type { ProjectileEffect } from '../../game/world/skill-effects/projectile';
import type { SweptRectEffect } from '../../game/world/skill-effects/swept-rect';
import { createWorldHpBars, FACTION_COLORS } from '../../game/world/WorldHpBars';
import { SkillHud, type SkillHudHandle } from './SkillHud';

function skillHitDelivery(
  skill: Skill,
): Extract<SkillDelivery, { mode: 'instant-hit' | 'interval-hit' }> | null {
  const delivery = skill.delivery.mode === 'composite'
    ? skill.delivery.parts.find(
        (part): part is Extract<SkillDelivery, { mode: 'instant-hit' | 'interval-hit' }> =>
          part.mode === 'instant-hit' || part.mode === 'interval-hit',
      )
    : skill.delivery;
  return delivery && (delivery.mode === 'instant-hit' || delivery.mode === 'interval-hit')
    ? delivery
    : null;
}

const DEFAULT_HERO: HeroId = 'arthur';

function castModesForHero(heroId: HeroId): Readonly<Record<string, Skill['castMode']>> {
  return Object.fromEntries(
    getHeroKitSkills(heroId).map((skill) => [skill.hotkey, skill.castMode ?? 'instant']),
  );
}

function shouldUseHoldRelease(slotHotkey: string, castMode: Skill['castMode'] | undefined): boolean {
  if (slotHotkey === '0') return false;
  if (import.meta.env.DEV) return true;
  return castMode === 'targeted';
}

/** 屏幕像素拖拽增量 → 世界 XZ 偏移(视口归一化) */
function screenDeltaToWorldOffset(
  dxPx: number,
  dyPx: number,
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; z: number } {
  const vFov = (camera.fov * Math.PI) / 180;
  const distance = Math.max(camera.position.y, 1);
  const visibleHeight = 2 * Math.tan(vFov / 2) * distance;
  const visibleWidth = visibleHeight * (viewportWidth / Math.max(viewportHeight, 1));
  const scaleX = visibleWidth / Math.max(viewportWidth, 1);
  const scaleZ = visibleHeight / Math.max(viewportHeight, 1);
  return { x: dxPx * scaleX, z: dyPx * scaleZ };
}

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
  const [heroId, setHeroId] = useState<HeroId>(DEFAULT_HERO);
  const heroIdRef = useRef<HeroId>(DEFAULT_HERO);
  const aimStateRef = useRef<{ slotHotkey: string; skill: Skill } | null>(null);
  const hitboxVfxRef = useRef<HitboxVfxHandle | null>(null);
  const aimIndicatorRef = useRef<AimIndicatorVfxHandle | null>(null);
  /** skill-stick 拖拽状态;active 时瞄准优先用 stick,忽略移动摇杆 */
  const skillStickRef = useRef<{
    active: boolean;
    dx: number;
    dy: number;
  }>({ active: false, dx: 0, dy: 0 });
  const setAimState = (next: { slotHotkey: string; skill: Skill } | null): void => {
    aimStateRef.current = next;
    setAiming(next);
  };
  const clearAimVisuals = (): void => {
    hitboxVfxRef.current?.removeBoundEffect('aim-preview');
    aimIndicatorRef.current?.hide();
  };
  const clearSkillStick = (): void => {
    skillStickRef.current = { active: false, dx: 0, dy: 0 };
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
    sessionRef.current?.cancelAim();
    clearSkillStick();
    clearAimVisuals();
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
    const session = sessionRef.current;
    const cur = aimStateRef.current;
    if (!session || !cur) return;
    if (!inside || isInsideCancelRect(clientX, clientY)) {
      session.cancelAim();
      clearSkillStick();
      clearAimVisuals();
      setAimState(null);
      return;
    }
    session.commitAim();
    clearSkillStick();
    clearAimVisuals();
    setAimState(null);
  };
  const onSkillPressStart = (slotHotkey: string): void => {
    if (slotHotkey === '0') {
      requestAutoAttack();
      return;
    }
    const skill = heroSkillByHotkey(heroIdRef.current, slotHotkey);
    const session = sessionRef.current;
    if (!skill || !session) return;
    if (aimStateRef.current || !session.skillBook.canStart(skill.id)) return;
    if (shouldUseHoldRelease(slotHotkey, skill.castMode)) {
      clearSkillStick();
      if (session.beginAim(slotHotkey)) {
        setAimState({ slotHotkey, skill });
      }
    } else {
      tryStartSkillBySlot(slotHotkey);
    }
  };
  const onAttackModePress = (
    priority: Exclude<AutoAttackPriority, 'default'>,
  ): void => {
    requestAutoAttack(priority);
  };
  const onSkillDragMove = (info: { slotHotkey: string; dx: number; dy: number }): void => {
    if (aimStateRef.current?.slotHotkey !== info.slotHotkey) return;
    skillStickRef.current = { active: true, dx: info.dx, dy: info.dy };
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

    const playerUnit = asUnit(gameScene.player, 'player', getHeroHpMax(DEFAULT_HERO), false);
    const dummyUnit = createPracticeDummy();
    const session = createPracticeSession({ playerUnit, dummyUnit });
    sessionRef.current = session;

    const restoreDummyVisual = (): void => {
      if (!gameScene.dummy.root.parent) {
        gameScene.scene.add(gameScene.dummy.root);
      }
      gameScene.dummy.root.visible = true;
      hpBars.register(session.dummyUnit, FACTION_COLORS.enemy, 1.4, 1.8, 0.2);
    };

    const removeDummyVisual = (): void => {
      gameScene.dummy.root.visible = false;
      if (gameScene.dummy.root.parent) {
        gameScene.scene.remove(gameScene.dummy.root);
      }
      hpBars.unregister(PRACTICE_DUMMY_ID);
    };

    const resetWorld = (): void => {
      gameScene.reset();
      session.resetWorld();
      restoreDummyVisual();
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
    hitboxVfxRef.current = hitboxVfx;
    const aimIndicator = createAimIndicatorVfx();
    gameScene.scene.add(aimIndicator.group);
    aimIndicatorRef.current = aimIndicator;
    const shownHitboxActivations = new WeakMap<SkillInstance, number>();
    const heldDesktopSlots = new Set<string>();

    const unsubscribeDamage = session.world.subscribeDamage((results) => {
      for (const r of results) {
        const target = session.world.getUnit(r.targetId);
        if (!target) continue;
        floaters.add(r.targetId, r.payload.damage, target.position, r.payload.isCrit);
      }
    });

    function onResize(): void {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      gameScene.follow.resize(w / h);
    }
    window.addEventListener('resize', onResize);

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && session.getAimingPreview()) {
        e.preventDefault();
        session.cancelAim();
        heldDesktopSlots.clear();
        clearSkillStick();
        clearAimVisuals();
        setAimState(null);
        return;
      }
      const action = resolveDesktopSkillKey(e.key);
      if (!action) {
        // 桌面数字键 1/2/3 → dev 角色切换(被 dev 角色切换条共享同一组快捷键)
        if (import.meta.env.DEV && /^[1-3]$/.test(e.key)) {
          e.preventDefault();
          const slot = Number(e.key) - 1;
          const nextHero = HERO_IDS[slot];
          if (!nextHero || nextHero === heroIdRef.current) return;
          // 切英雄前先清掉可能存在的瞄准/激活技能,避免残影
          session.cancelAim();
          session.cancelAutoAttack();
          heldDesktopSlots.clear();
          clearSkillStick();
          clearAimVisuals();
          setAimState(null);
          heroIdRef.current = nextHero;
          setHeroId(nextHero);
          session.setHero(nextHero);
          return;
        }
        return;
      }
      e.preventDefault();
      if (action.kind === 'attack') {
        session.requestAutoAttack(action.priority);
        return;
      }
      const skill = heroSkillByHotkey(heroIdRef.current, action.slotHotkey);
      if (shouldUseHoldRelease(action.slotHotkey, skill?.castMode)) {
        // 桌面热键进入瞄准:无 skill-stick,WASD fallback
        clearSkillStick();
        if (session.beginAim(action.slotHotkey) && skill) {
          heldDesktopSlots.add(action.slotHotkey);
          setAimState({ slotHotkey: action.slotHotkey, skill });
        }
        return;
      }
      session.tryCastHotkey(action.slotHotkey);
    }

    function onKeyUp(e: KeyboardEvent): void {
      const action = resolveDesktopSkillKey(e.key);
      if (!action || action.kind !== 'cast') return;
      if (!heldDesktopSlots.has(action.slotHotkey)) return;
      heldDesktopSlots.delete(action.slotHotkey);
      if (session.getAimingPreview()?.slotHotkey === action.slotHotkey) {
        session.commitAim();
        clearSkillStick();
        clearAimVisuals();
        setAimState(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

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

        const aimPreviewBefore = session.getAimingPreview();
        if (aimPreviewBefore) {
          const stick = skillStickRef.current;
          if (stick.active) {
            const aimKind = heroAimKindByHotkey(
              session.heroId,
              aimPreviewBefore.slotHotkey,
            );
            if (aimKind === 'area') {
              const worldOffset = screenDeltaToWorldOffset(
                stick.dx,
                stick.dy,
                gameScene.follow.camera,
                window.innerWidth,
                window.innerHeight,
              );
              session.updateAim(ZERO_JOYSTICK, {
                targetPoint: {
                  x: playerUnit.position.x + worldOffset.x,
                  z: playerUnit.position.z + worldOffset.z,
                },
              });
            } else {
              // direction / lock-target:屏幕拖拽方向作 aim move input
              session.updateAim({ x: stick.dx, y: stick.dy });
            }
          } else {
            session.updateAim(merged);
          }
        }

        gameScene.update(dt, pre.suppressManualMove ? ZERO_JOYSTICK : merged);

        const aimPreview = session.getAimingPreview();
        if (aimPreview) {
          const previewGeometry =
            aimPreview.skill.aim?.preview ?? skillHitDelivery(aimPreview.skill)?.geometry;
          if (previewGeometry) hitboxVfx.bindEffect(
            'aim-preview',
            previewGeometry,
            () => playerUnit.position,
            aimPreview.aimForwardRad,
          );
          const aimKind = heroAimKindByHotkey(session.heroId, aimPreview.slotHotkey);
          if (aimKind !== 'none') {
            const lockTarget = aimPreview.previewTargetId
              ? session.world.getUnit(aimPreview.previewTargetId)?.position ?? null
              : null;
            const lockRange =
              aimKind === 'lock-target' && aimPreview.skill.aim?.maxRange !== undefined
                ? aimPreview.skill.aim.maxRange
                : undefined;
            aimIndicator.show({
              aimKind,
              forwardRad: aimPreview.aimForwardRad,
              origin: playerUnit.position,
              lockTarget,
              lockRange,
              targetPoint: aimPreview.aimTargetPoint ?? undefined,
              maxRange: aimPreview.maxRange ?? undefined,
            });
          } else {
            aimIndicator.hide();
          }
          gameScene.controller.setFacingRad(aimPreview.aimForwardRad);
          gameScene.player.setFacingRad(aimPreview.aimForwardRad);
        } else {
          aimIndicator.hide();
        }

        const post = session.postTick({
          dt,
          playerX: gameScene.player.root.position.x,
          playerZ: gameScene.player.root.position.z,
          facingRad: gameScene.controller.facingRad,
        });

        const activeInst = session.skillBook.active;
        const activeHitDelivery = activeInst ? skillHitDelivery(activeInst.skill) : null;
        if (activeInst && activeHitDelivery) {
          const shown = shownHitboxActivations.get(activeInst) ?? 0;
          for (let i = shown; i < activeInst.hitboxActivations; i++) {
            if (activeHitDelivery.hitOrigin === 'cast') {
              hitboxVfx.spawn(
                activeHitDelivery.geometry,
                activeInst.origin,
                activeInst.forwardRad,
              );
            } else {
              hitboxVfx.spawnAttached(
                activeHitDelivery.geometry,
                () => playerUnit.position,
                activeInst.forwardRad,
              );
            }
          }
          shownHitboxActivations.set(activeInst, activeInst.hitboxActivations);
        }

        const activeEffectIds = new Set<string>();
        if (session.getAimingPreview()) {
          activeEffectIds.add('aim-preview');
        }
        for (const [effectId, effect] of session.world.effects) {
          activeEffectIds.add(effectId);
          if (effect.kind === 'projectile') {
            const projectile = effect as ProjectileEffect;
            hitboxVfx.bindEffect(
              effectId,
              { kind: 'circle', radius: projectile.collisionRadius },
              () => projectile.getPosition(),
            );
          } else if (effect.kind === 'persistent-area') {
            const zone = effect as PersistentAreaEffect;
            hitboxVfx.bindEffect(
              effectId,
              { kind: 'circle', radius: zone.config.radius },
              () => zone.position,
            );
          } else if (effect.kind === 'swept-rect') {
            const blade = effect as SweptRectEffect;
            hitboxVfx.bindEffect(
              effectId,
              { kind: 'rect', halfWidth: blade.halfWidth, halfDepth: blade.halfDepth },
              () => blade.getOrigin(),
              blade.getForwardRad(),
            );
          }
        }
        hitboxVfx.pruneBoundEffects(activeEffectIds);

        if (post.dummyRingPulse) {
          gameScene.dummy.setRingPulse(1);
        }
        if (post.dummyRemoved) {
          removeDummyVisual();
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
        aimIndicator.update(dt);
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
      window.removeEventListener('keyup', onKeyUp);
      keyboard.dispose();
      unsubscribeDamage();
      floaters.dispose();
      gameScene.scene.remove(floaters.group);
      hitboxVfx.dispose();
      gameScene.scene.remove(hitboxVfx.group);
      hitboxVfxRef.current = null;
      aimIndicator.dispose();
      gameScene.scene.remove(aimIndicator.group);
      aimIndicatorRef.current = null;
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
        heroSkills={getHeroKitSkills(heroId)}
        inputMode={mobile ? 'mobile' : 'desktop'}
        onPressStart={onSkillPressStart}
        onAttackModePress={onAttackModePress}
        onPressEnd={onSkillPressEnd}
        onDragMove={onSkillDragMove}
        aimingSlotHotkey={aiming?.slotHotkey ?? null}
        castModes={castModesForHero(heroId)}
        devForceHoldRelease={import.meta.env.DEV}
      />
      {import.meta.env.DEV && (
        <div
          className="dev-hero-switcher"
          style={{
            position: 'fixed',
            top: 8,
            left: 8,
            zIndex: 30,
            display: 'flex',
            gap: 4,
            background: 'rgba(0,0,0,0.5)',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          {HERO_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                heroIdRef.current = id;
                setHeroId(id);
                sessionRef.current?.setHero(id);
              }}
              style={{
                padding: '2px 8px',
                background: heroId === id ? '#4a90d9' : '#333',
                color: '#fff',
                border: 'none',
                borderRadius: 3,
                cursor: 'pointer',
              }}
            >
              {heroDisplayName(id)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
