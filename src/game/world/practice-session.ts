// 练习场 session:世界生命周期、tick、cast、reset;与 React / Three 解耦
import type { AutoAttackPriority } from '../../engine/input/desktop-skill-hotkeys';
import {
  beginAimingSession,
  cancelAimingSession,
  createAimingSession,
  isAiming,
  resolveAreaAimMaxRange,
  updateAimingSession,
} from '../input/cast-aiming';
import { aimForwardFromInput } from '../input/aim-forward';
import { createAutoAttackIntent, facingToward, findNearestEnemy } from '../combat/auto-attack-intent';
import { clearAllCc, tickAllCc } from '../combat/unit-cc';
import { applyCombatEvents } from '../combat/settlement';
import { createHeroStateStack } from '../buffs/buff-bag';
import {
  getHeroAutoAttackRanges,
  getHeroJudgementAcquireRange,
  getHeroHpMax,
  heroAimKindByHotkey,
  heroSkillByHotkey,
  type HeroId,
} from '../heroes/index';
import type { AimKind } from '../heroes/hero-kit';
import { createCastSnapshot } from '../skills/cast-snapshot';
import { createSkillBook } from '../skills/skill-book';
import type { CombatEvent, Skill, SkillInstance, Unit } from '../skills/types';
import type { Vec2 } from '../skills/vec2';
import {
  createPracticeDummy,
  PRACTICE_DUMMY_REGEN_PER_SEC,
} from '../units/practice-dummy';
import { createWorldState, type WorldStateHandle } from './WorldState';

export interface PracticeSessionInit {
  playerUnit: Unit;
  dummyUnit?: Unit;
  heroId?: HeroId;
}

export interface PracticePreTickInput {
  dt: number;
  manualMove: boolean;
  playerX: number;
  playerZ: number;
}

export interface PracticePreTickResult {
  speedMultiplier: number;
  moveTarget: { x: number; z: number } | null;
  clearMoveTarget: boolean;
  facingRad: number | null;
  /** dash/强制锁敌追击期间，轮盘输入不得改写位移方向 */
  suppressManualMove: boolean;
}

export interface PracticePostTickInput {
  dt: number;
  playerX: number;
  playerZ: number;
  facingRad: number;
}

export interface PracticePostTickResult {
  completedSkills: readonly SkillInstance[];
  dummyRingPulse: boolean;
  /** 本帧木人桩 hp 归零并从世界移除 */
  dummyRemoved: boolean;
  dashSync: { x: number; z: number } | null;
}

export interface PracticeHudButtonState {
  name: string;
  hotkey: string;
  cooldownRemaining: number;
  cooldownMax: number;
  locked: boolean;
}

export interface AimingPreview {
  readonly slotHotkey: string;
  readonly skill: Skill;
  readonly aimForwardRad: number;
  readonly previewTargetId: string | null;
  readonly aimKind: AimKind;
  readonly aimTargetPoint: Vec2 | null;
  readonly maxRange: number | null;
}

interface ResolvedDashEnhancement {
  distance: number;
  speed: number;
  acquireRange: number;
  targeting: 'locked' | 'forward' | 'locked-or-forward';
}

export interface PracticeSession {
  readonly world: WorldStateHandle;
  readonly skillBook: ReturnType<typeof createSkillBook>;
  readonly heroState: ReturnType<typeof createHeroStateStack>;
  /** @deprecated 兼容旧调用方；与 heroState 为同一实例 */
  readonly buffs: ReturnType<typeof createHeroStateStack>;
  readonly playerUnit: Unit;
  readonly dummyUnit: Unit;
  readonly heroId: HeroId;
  setHero(heroId: HeroId): void;
  preTick(input: PracticePreTickInput): PracticePreTickResult;
  postTick(input: PracticePostTickInput): PracticePostTickResult;
  tryCastHotkey(hotkey: string): boolean;
  beginAim(hotkey: string): boolean;
  updateAim(
    moveInput: { x: number; y: number },
    options?: { targetPoint?: Vec2 },
  ): void;
  commitAim(): boolean;
  cancelAim(): void;
  getAimingPreview(): AimingPreview | null;
  requestAutoAttack(priority?: AutoAttackPriority): boolean;
  cancelAutoAttack(): void;
  resetWorld(): void;
  getHudButtons(): PracticeHudButtonState[];
}

export function createPracticeSession(init: PracticeSessionInit): PracticeSession {
  const playerUnit = init.playerUnit;
  const playerSpawn = { ...playerUnit.position };
  const dummyUnit = init.dummyUnit ?? createPracticeDummy();
  const world = createWorldState({ units: [playerUnit, dummyUnit] });
  const skillBook = createSkillBook();
  const heroState = createHeroStateStack();
  const buffs = heroState;
  const aaIntent = createAutoAttackIntent();
  let heroId: HeroId = init.heroId ?? 'arthur';
  let aaRanges = getHeroAutoAttackRanges(heroId);
  let judgementAcquireRange = getHeroJudgementAcquireRange(heroId);

  let dummyAlive = true;
  let aaIntentOverridesManualMove = false;
  const aiming = createAimingSession();

  const allUnits = (): Unit[] =>
    dummyAlive ? [playerUnit, dummyUnit] : [playerUnit];

  const removeDeadDummy = (): boolean => {
    if (!dummyAlive || dummyUnit.hp > 0) return false;
    world.unregister(dummyUnit.id);
    dummyUnit.cc = undefined;
    dummyAlive = false;
    aaIntent.cancel();
    aaIntentOverridesManualMove = false;
    return true;
  };

  const tickDummyRegen = (dt: number): void => {
    if (!dummyAlive || dummyUnit.hp <= 0 || dummyUnit.hp >= dummyUnit.hpMax) return;
    dummyUnit.hp = Math.min(
      dummyUnit.hpMax,
      dummyUnit.hp + PRACTICE_DUMMY_REGEN_PER_SEC * dt,
    );
  };

  const startAutoAttack = (
    forwardRad: number,
    dash: { distance: number; speed: number } | null,
    targetId?: string | null,
  ): boolean => {
    const base = heroSkillByHotkey(heroId, '0');
    if (!base) return false;
    const skill: Skill = dash && dash.distance > 0
      ? {
          ...base,
          displacement: 'dash',
          dashDistance: dash.distance,
          dashSpeed: dash.speed,
        }
      : base;
    const snapshot = createCastSnapshot({
      casterId: playerUnit.id,
      skillId: skill.id,
      origin: playerUnit.position,
      forwardRad,
      targetId: targetId ?? undefined,
    });
    const started = skillBook.start(skill, playerUnit, snapshot);
    if (!started) return false;
    aaIntent.cancel();
    aaIntentOverridesManualMove = false;
    buffs.consumeSkillEnhancements(base.id);
    buffs.consumeNextAttackBonus();
    return true;
  };

  const autoAttackDashEnhancement = (
    hasLockedTarget: boolean,
  ): ResolvedDashEnhancement | null => {
    let resolved: ResolvedDashEnhancement | null = null;
    for (const enhancement of buffs.skillEnhancements('auto-attack')) {
      for (const effect of enhancement.effects) {
        if (effect.kind !== 'dash') continue;
        const applies = hasLockedTarget
          ? effect.targeting === 'locked' || effect.targeting === 'locked-or-forward'
          : effect.targeting === 'forward' || effect.targeting === 'locked-or-forward';
        if (applies && (!resolved || effect.acquireRange > resolved.acquireRange)) {
          resolved = effect;
        }
      }
    }
    return resolved;
  };

  const skillDashEnhancement = (
    skillId: string,
  ): ResolvedDashEnhancement | null => {
    let resolved: ResolvedDashEnhancement | null = null;
    for (const enhancement of buffs.skillEnhancements(skillId)) {
      for (const effect of enhancement.effects) {
        if (effect.kind !== 'dash') continue;
        if (!resolved || effect.acquireRange > resolved.acquireRange) {
          resolved = effect;
        }
      }
    }
    return resolved;
  };

  const lockAcquireRange = (skill: Skill, enhancedDash: ResolvedDashEnhancement | null): number => {
    if (skill.id === 'sacred-judgement') return judgementAcquireRange;
    if (enhancedDash) return enhancedDash.acquireRange;
    if (skill.aim?.maxRange !== undefined) return skill.aim.maxRange;
    const delivery = skill.delivery.mode === 'composite'
      ? skill.delivery.parts.find((part) => part.mode === 'instant-hit' || part.mode === 'interval-hit')
      : skill.delivery;
    if (delivery && (delivery.mode === 'instant-hit' || delivery.mode === 'interval-hit') && delivery.geometry.kind === 'target') {
      return delivery.geometry.range;
    }
    return 0;
  };

  const castHotkey = (
    hotkey: string,
    aimOverrides?: {
      aimKind: AimKind;
      forwardRad: number;
      targetId: string | null;
      targetPoint?: Vec2 | null;
    },
  ): boolean => {
    if (hotkey === '0') return false;
    const baseSkill = heroSkillByHotkey(heroId, hotkey);
    if (!baseSkill) return false;
    const enhancedDash = skillDashEnhancement(baseSkill.id);
    const skill: Skill = enhancedDash
      ? {
          ...baseSkill,
          displacement: 'dash',
          dashDistance: enhancedDash.distance,
          dashSpeed: enhancedDash.speed,
        }
      : baseSkill;

    let forwardRad = aimOverrides?.forwardRad ?? playerUnit.facingRad;
    let dashDistance: number | undefined;
    let targetId: string | undefined;
    let targetPoint: Vec2 | undefined;

    if (aimOverrides?.aimKind === 'direction') {
      forwardRad = aimOverrides.forwardRad;
    } else if (aimOverrides?.aimKind === 'lock-target') {
      if (!aimOverrides.targetId) return false;
      targetId = aimOverrides.targetId;
      const target = world.getUnit(targetId);
      if (target) {
        forwardRad = facingToward(playerUnit.position, target.position);
      }
    } else if (aimOverrides?.aimKind === 'area') {
      if (!aimOverrides.targetPoint) return false;
      targetPoint = {
        x: aimOverrides.targetPoint.x,
        z: aimOverrides.targetPoint.z,
      };
      forwardRad = aimOverrides.forwardRad;
    } else {
      const enhancementNeedsTarget =
        enhancedDash?.targeting === 'locked' ||
        enhancedDash?.targeting === 'locked-or-forward';
      if (skill.castMode === 'targeted' || enhancementNeedsTarget) {
        const acquireRange = lockAcquireRange(skill, enhancedDash);
        const target = findNearestEnemy(world, playerUnit, acquireRange);
        if (!target && (skill.castMode === 'targeted' || enhancedDash?.targeting === 'locked')) {
          return false;
        }
        if (target) {
          targetId = target.id;
          forwardRad = facingToward(playerUnit.position, target.position);
          const dx = target.position.x - playerUnit.position.x;
          const dz = target.position.z - playerUnit.position.z;
          dashDistance = Math.min(skill.dashDistance, Math.hypot(dx, dz));
        }
      }
    }

    const snapshot = createCastSnapshot({
      casterId: playerUnit.id,
      skillId: skill.id,
      origin: playerUnit.position,
      forwardRad,
      targetId,
      targetPoint,
      dashDistance,
    });
    const inst = skillBook.start(skill, playerUnit, snapshot);
    if (!inst) return false;
    buffs.consumeSkillEnhancements(skill.id);
    return true;
  };

  const resolveLockTarget = (skill: Skill): string | null => {
    const acquireRange = lockAcquireRange(skill, null);
    const target = findNearestEnemy(world, playerUnit, acquireRange);
    return target?.id ?? null;
  };

  return {
    world,
    skillBook,
    heroState,
    buffs,
    playerUnit,
    dummyUnit,
    get heroId() {
      return heroId;
    },

    setHero(nextHeroId) {
      if (nextHeroId === heroId) return;
      heroId = nextHeroId;
      aaRanges = getHeroAutoAttackRanges(heroId);
      judgementAcquireRange = getHeroJudgementAcquireRange(heroId);
      playerUnit.hpMax = getHeroHpMax(heroId);
      playerUnit.hp = playerUnit.hpMax;
      this.resetWorld();
    },

    tryCastHotkey(hotkey) {
      if (hotkey === '0') return this.requestAutoAttack();
      return castHotkey(hotkey);
    },

    beginAim(hotkey) {
      if (hotkey === '0') return false;
      if (isAiming(aiming) || skillBook.active !== null) return false;
      const baseSkill = heroSkillByHotkey(heroId, hotkey);
      if (!baseSkill || !skillBook.canStart(baseSkill.id)) return false;
      const aimKind = heroAimKindByHotkey(heroId, hotkey);
      const initialTargetId =
        aimKind === 'lock-target' ? resolveLockTarget(baseSkill) : null;
      beginAimingSession(aiming, {
        slotHotkey: hotkey,
        skill: baseSkill,
        aimKind,
        initialForwardRad: playerUnit.facingRad,
        initialTargetId,
      });
      aaIntent.cancel();
      aaIntentOverridesManualMove = false;
      return true;
    },

    updateAim(moveInput, options) {
      if (!isAiming(aiming) || !aiming.skill) return;
      const lockTargetId =
        aiming.aimKind === 'lock-target'
          ? resolveLockTarget(aiming.skill)
          : undefined;

      if (aiming.aimKind === 'area') {
        const maxRange = resolveAreaAimMaxRange(aiming.skill);
        let targetPoint = options?.targetPoint;
        if (!targetPoint) {
          const len = Math.hypot(moveInput.x, moveInput.y);
          if (len > 1e-6) {
            const rad = aimForwardFromInput(moveInput, playerUnit.facingRad);
            const dist = maxRange * 0.6;
            targetPoint = {
              x: playerUnit.position.x + Math.sin(rad) * dist,
              z: playerUnit.position.z - Math.cos(rad) * dist,
            };
          }
        }
        if (targetPoint) {
          updateAimingSession(aiming, {
            targetPoint,
            origin: playerUnit.position,
            maxRange,
          });
        }
      } else {
        updateAimingSession(aiming, {
          moveInput,
          lockTargetId,
          fallbackForwardRad: playerUnit.facingRad,
        });
      }

      if (aiming.aimKind === 'lock-target' && aiming.previewTargetId) {
        const target = world.getUnit(aiming.previewTargetId);
        if (target) {
          aiming.aimForwardRad = facingToward(playerUnit.position, target.position);
        }
      }
      if (
        aiming.aimKind === 'direction' ||
        aiming.aimKind === 'lock-target' ||
        aiming.aimKind === 'area'
      ) {
        playerUnit.facingRad = aiming.aimForwardRad;
      }
    },

    commitAim() {
      if (!isAiming(aiming) || !aiming.slotHotkey) return false;
      const hotkey = aiming.slotHotkey;
      const aimKind = aiming.aimKind;
      const forwardRad = aiming.aimForwardRad;
      const targetId = aiming.previewTargetId;
      const targetPoint = aiming.aimTargetPoint;
      if (aimKind === 'area' && !targetPoint) {
        cancelAimingSession(aiming);
        return false;
      }
      cancelAimingSession(aiming);
      return castHotkey(hotkey, { aimKind, forwardRad, targetId, targetPoint });
    },

    cancelAim() {
      cancelAimingSession(aiming);
    },

    getAimingPreview() {
      if (!isAiming(aiming) || !aiming.skill || !aiming.slotHotkey) return null;
      return {
        slotHotkey: aiming.slotHotkey,
        skill: aiming.skill,
        aimForwardRad: aiming.aimForwardRad,
        previewTargetId: aiming.previewTargetId,
        aimKind: aiming.aimKind,
        aimTargetPoint: aiming.aimTargetPoint,
        maxRange:
          aiming.aimKind === 'area' ? resolveAreaAimMaxRange(aiming.skill) : null,
      };
    },

    requestAutoAttack(priority: AutoAttackPriority = 'default') {
      const aaSkill = heroSkillByHotkey(heroId, '0');
      if (!aaSkill || !skillBook.canStart(aaSkill.id)) return false;
      const lockedDash = autoAttackDashEnhancement(true);
      if (
        lockedDash &&
        aaIntent.requestAttack(
          playerUnit,
          world,
          lockedDash.acquireRange,
          priority,
        )
      ) {
        aaIntentOverridesManualMove = true;
        return true;
      }
      const forwardDash = autoAttackDashEnhancement(false);
      if (forwardDash) {
        return startAutoAttack(playerUnit.facingRad, {
          distance: forwardDash.distance,
          speed: forwardDash.speed,
        }, aaIntent.targetId);
      }
      if (aaIntent.requestAttack(playerUnit, world, aaRanges.acquireRange, priority)) {
        aaIntentOverridesManualMove = false;
        return true;
      }
      // 无可锁目标也要按当前朝向释放普攻。
      return startAutoAttack(playerUnit.facingRad, null);
    },

    cancelAutoAttack() {
      if (aaIntentOverridesManualMove) return;
      aaIntent.cancel();
    },

    resetWorld() {
      if (!dummyAlive) {
        world.register(dummyUnit);
        dummyAlive = true;
      }
      dummyUnit.hp = dummyUnit.hpMax;
      playerUnit.position = { ...playerSpawn };
      playerUnit.hp = playerUnit.hpMax;
      playerUnit.cc = undefined;
      skillBook.reset();
      world.clearEffects();
      buffs.clear();
      aaIntent.clear();
      aaIntentOverridesManualMove = false;
      cancelAimingSession(aiming);
      clearAllCc(allUnits());
    },

    preTick({ dt, manualMove, playerX, playerZ }) {
      if (isAiming(aiming)) {
        aaIntent.cancel();
        aaIntentOverridesManualMove = false;
      } else if (manualMove && !aaIntentOverridesManualMove) {
        aaIntent.cancel();
      }

      playerUnit.position.x = playerX;
      playerUnit.position.z = playerZ;

      buffs.tick(dt);
      const speedMultiplier = buffs.moveSpeedMultiplier();

      const aaSkill = heroSkillByHotkey(heroId, '0');
      const empoweredDash = autoAttackDashEnhancement(true);
      const aaAction = aaIntent.tick({
        caster: playerUnit,
        resolveUnit: (id) => world.getUnit(id),
        canCast: aaSkill !== null && skillBook.canStart(aaSkill.id),
        attackRange: Math.max(
          aaRanges.attackRange,
          empoweredDash?.acquireRange ?? 0,
        ),
        acquireRange: Math.max(
          aaRanges.acquireRange,
          empoweredDash?.acquireRange ?? 0,
        ),
        closeEngage: false,
      });

      let moveTarget: { x: number; z: number } | null = null;
      let facingRad: number | null = null;
      let clearMoveTarget = manualMove;

      if (aaAction.kind === 'engage') {
        // 妲己普攻不带动角色自动追击,只原地转向/释放
        if (heroId !== 'daji') {
          moveTarget = aaAction.moveTo;
        }
        facingRad = aaAction.forwardRad;
        playerUnit.facingRad = aaAction.forwardRad;
        clearMoveTarget = false;
        if (aaAction.shouldCast && aaSkill) {
          const target = world.getUnit(aaAction.targetId);
          const dx = target ? target.position.x - playerUnit.position.x : 0;
          const dz = target ? target.position.z - playerUnit.position.z : 0;
          const targetDistance = Math.hypot(dx, dz);
          const dash = empoweredDash
            ? {
                distance: Math.min(
                  empoweredDash.distance,
                  Math.max(0, targetDistance - 0.45),
                ),
                speed: empoweredDash.speed,
              }
            : null;
          startAutoAttack(aaAction.forwardRad, dash, aaAction.targetId);
        }
      } else {
        aaIntentOverridesManualMove = false;
      }

      const suppressManualMove =
        isAiming(aiming) ||
        aaIntentOverridesManualMove ||
        skillBook.active?.skill.displacement === 'dash';

      return {
        speedMultiplier,
        moveTarget,
        clearMoveTarget,
        facingRad,
        suppressManualMove,
      };
    },

    postTick({ dt, playerX, playerZ, facingRad }) {
      playerUnit.position.x = playerX;
      playerUnit.position.z = playerZ;
      playerUnit.facingRad = facingRad;

      tickAllCc(allUnits(), dt);

      const completedSkills = skillBook.tick(dt, {
        caster: playerUnit,
        world,
        now: 0,
        buffs,
        castSnapshot: skillBook.active?.castSnapshot,
      });

      let dummyRingPulse = false;
      let dummyRemoved = false;
      let dashSync: { x: number; z: number } | null = null;

      const activeInst = skillBook.active;
      if (activeInst) {
        if (activeInst.skill.displacement === 'dash') {
          dashSync = { x: playerUnit.position.x, z: playerUnit.position.z };
        }
      }

      for (const completed of completedSkills) {
        if (completed.skill.displacement === 'dash') {
          dashSync = { x: playerUnit.position.x, z: playerUnit.position.z };
        }
      }

      const skillInstances = new Set<SkillInstance>(completedSkills);
      if (activeInst) skillInstances.add(activeInst);
      const skillEvents: CombatEvent[] = [];
      for (const instance of skillInstances) {
        skillEvents.push(...instance.events);
        instance.events = [];
      }
      const effectEvents = world.tickEffects(dt);
      const frameEvents = [...skillEvents, ...effectEvents];
      applyCombatEvents(world, frameEvents);
      dummyRingPulse = frameEvents.some(
        (event) => event.kind === 'damage' && event.targetId === dummyUnit.id,
      );
      if (removeDeadDummy()) dummyRemoved = true;

      tickDummyRegen(dt);
      if (removeDeadDummy()) dummyRemoved = true;

      return { completedSkills, dummyRingPulse, dummyRemoved, dashSync };
    },

    getHudButtons() {
      const buttons: PracticeHudButtonState[] = [];
      const active = skillBook.active;
      for (const hotkey of ['0', '1', '2', '3'] as const) {
        const sk = heroSkillByHotkey(heroId, hotkey);
        if (!sk) continue;
        buttons.push({
          name: sk.displayName,
          hotkey,
          cooldownRemaining: skillBook.cooldownRemaining(sk.id),
          cooldownMax: sk.cooldown,
          locked: active !== null,
        });
      }
      return buttons;
    },
  };
}
