// 练习场 session:世界生命周期、tick、cast、reset;与 React / Three 解耦
import type { AutoAttackPriority } from '../../engine/input/desktop-skill-hotkeys';
import { createAutoAttackIntent, facingToward, findNearestEnemy } from '../combat/auto-attack-intent';
import { clearAllCc, tickAllCc } from '../combat/unit-cc';
import { createHeroStateStack } from '../buffs/buff-bag';
import {
  arthurSkillByHotkey,
  getArthurAutoAttackRanges,
  getArthurJudgementAcquireRange,
} from '../heroes/arthur';
import { applyDamage } from '../skills/runtime';
import { createSkillBook } from '../skills/skill-book';
import type { DamageResult, Skill, SkillInstance, Unit } from '../skills/types';
import {
  createPracticeDummy,
  PRACTICE_DUMMY_REGEN_PER_SEC,
} from '../units/practice-dummy';
import { createWorldState, type WorldStateHandle } from './WorldState';

export interface PracticeSessionInit {
  playerUnit: Unit;
  dummyUnit?: Unit;
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
  preTick(input: PracticePreTickInput): PracticePreTickResult;
  postTick(input: PracticePostTickInput): PracticePostTickResult;
  tryCastHotkey(hotkey: string): boolean;
  requestAutoAttack(priority?: AutoAttackPriority): boolean;
  cancelAutoAttack(): void;
  resetWorld(): void;
  getHudButtons(): PracticeHudButtonState[];
}

export function createPracticeSession(init: PracticeSessionInit): PracticeSession {
  const playerUnit = init.playerUnit;
  const dummyUnit = init.dummyUnit ?? createPracticeDummy();
  const world = createWorldState({ units: [playerUnit, dummyUnit] });
  const skillBook = createSkillBook();
  const heroState = createHeroStateStack();
  const buffs = heroState;
  const aaIntent = createAutoAttackIntent();
  const aaRanges = getArthurAutoAttackRanges();
  const judgementAcquireRange = getArthurJudgementAcquireRange();

  let dummyAlive = true;
  let aaIntentOverridesManualMove = false;

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
  ): boolean => {
    const base = arthurSkillByHotkey('0');
    if (!base) return false;
    const skill: Skill = dash && dash.distance > 0
      ? {
          ...base,
          displacement: 'dash',
          dashDistance: dash.distance,
          dashSpeed: dash.speed,
        }
      : base;
    const started = skillBook.start(skill, playerUnit, { forwardRad });
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

  return {
    world,
    skillBook,
    heroState,
    buffs,
    playerUnit,
    dummyUnit,

    tryCastHotkey(hotkey) {
      if (hotkey === '0') return this.requestAutoAttack();
      const baseSkill = arthurSkillByHotkey(hotkey);
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

      let forwardRad = playerUnit.facingRad;
      let dashDistance: number | undefined;
      const enhancementNeedsTarget =
        enhancedDash?.targeting === 'locked' ||
        enhancedDash?.targeting === 'locked-or-forward';
      if (skill.castMode === 'targeted' || enhancementNeedsTarget) {
        const acquireRange = skill.id === 'sacred-judgement'
          ? judgementAcquireRange
          : enhancedDash
            ? enhancedDash.acquireRange
            : skill.hit.kind === 'target'
              ? skill.hit.range
              : 0;
        const target = findNearestEnemy(world, playerUnit, acquireRange);
        if (!target && (skill.castMode === 'targeted' || enhancedDash?.targeting === 'locked')) {
          return false;
        }
        if (target) {
          forwardRad = facingToward(playerUnit.position, target.position);
          const dx = target.position.x - playerUnit.position.x;
          const dz = target.position.z - playerUnit.position.z;
          dashDistance = Math.min(skill.dashDistance, Math.hypot(dx, dz));
        }
      }

      const inst = skillBook.start(skill, playerUnit, { forwardRad, dashDistance });
      if (!inst) return false;
      buffs.consumeSkillEnhancements(skill.id);
      return true;
    },

    requestAutoAttack(priority: AutoAttackPriority = 'default') {
      const aaSkill = arthurSkillByHotkey('0');
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
        });
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
      skillBook.reset();
      buffs.clear();
      aaIntent.clear();
      aaIntentOverridesManualMove = false;
      clearAllCc(allUnits());
    },

    preTick({ dt, manualMove, playerX, playerZ }) {
      if (manualMove && !aaIntentOverridesManualMove) {
        aaIntent.cancel();
      }

      playerUnit.position.x = playerX;
      playerUnit.position.z = playerZ;

      buffs.tick(dt);
      const speedMultiplier = buffs.moveSpeedMultiplier();

      const aaSkill = arthurSkillByHotkey('0');
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
        moveTarget = aaAction.moveTo;
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
          startAutoAttack(aaAction.forwardRad, dash);
        }
      } else {
        aaIntentOverridesManualMove = false;
      }

      const suppressManualMove =
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
      });

      let dummyRingPulse = false;
      let dummyRemoved = false;
      let dashSync: { x: number; z: number } | null = null;

      const applyFrameDamage = (inst: SkillInstance): void => {
        const results = inst.damage;
        if (results.length === 0) return;
        const targets = dummyAlive ? [dummyUnit, playerUnit] : [playerUnit];
        applyDamage(targets, results);
        world.notifyDamage(results);
        dummyRingPulse = true;
        if (removeDeadDummy()) dummyRemoved = true;
        (inst as SkillInstance & { damage: DamageResult[] }).damage = [];
      };

      const activeInst = skillBook.active;
      if (activeInst) {
        applyFrameDamage(activeInst);
        if (activeInst.skill.displacement === 'dash') {
          dashSync = { x: playerUnit.position.x, z: playerUnit.position.z };
        }
      }

      for (const completed of completedSkills) {
        if (completed !== activeInst) {
          applyFrameDamage(completed);
        }
        if (completed.skill.displacement === 'dash') {
          dashSync = { x: playerUnit.position.x, z: playerUnit.position.z };
        }
      }

      tickDummyRegen(dt);
      if (removeDeadDummy()) dummyRemoved = true;

      return { completedSkills, dummyRingPulse, dummyRemoved, dashSync };
    },

    getHudButtons() {
      const buttons: PracticeHudButtonState[] = [];
      const active = skillBook.active;
      for (const hotkey of ['0', '1', '2', '3'] as const) {
        const sk = arthurSkillByHotkey(hotkey);
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
