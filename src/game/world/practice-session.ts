// 练习场 session:世界生命周期、tick、cast、reset;与 React / Three 解耦
import type { AutoAttackPriority } from '../../engine/input/desktop-skill-hotkeys';
import { createAutoAttackIntent, facingToward, findNearestEnemy } from '../combat/auto-attack-intent';
import { createFaceChargeIntent } from '../combat/face-charge-intent';
import { clearAllCc, tickAllCc } from '../combat/unit-cc';
import { createBuffBag } from '../buffs/buff-bag';
import {
  arthurSkillByHotkey,
  ARTHUR_AUTO_ATTACK_ID,
  ARTHUR_SHIELD_ID,
  getArthurAutoAttackRanges,
  getArthurShieldAcquireRange,
} from '../heroes/arthur';
import { applyDamage } from '../skills/runtime';
import { createSkillBook } from '../skills/skill-book';
import type { DamageResult, SkillInstance, Unit } from '../skills/types';
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

export interface PracticeSession {
  readonly world: WorldStateHandle;
  readonly skillBook: ReturnType<typeof createSkillBook>;
  readonly buffs: ReturnType<typeof createBuffBag>;
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
  const buffs = createBuffBag();
  const aaIntent = createAutoAttackIntent();
  const faceChargeIntent = createFaceChargeIntent();
  const aaRanges = getArthurAutoAttackRanges();
  const shieldAcquireRange = getArthurShieldAcquireRange();

  let dummyAlive = true;

  const allUnits = (): Unit[] =>
    dummyAlive ? [playerUnit, dummyUnit] : [playerUnit];

  const removeDeadDummy = (): boolean => {
    if (!dummyAlive || dummyUnit.hp > 0) return false;
    world.unregister(dummyUnit.id);
    dummyUnit.cc = undefined;
    dummyAlive = false;
    aaIntent.cancel();
    faceChargeIntent.cancel();
    return true;
  };

  const tickDummyRegen = (dt: number): void => {
    if (!dummyAlive || dummyUnit.hp <= 0 || dummyUnit.hp >= dummyUnit.hpMax) return;
    dummyUnit.hp = Math.min(
      dummyUnit.hpMax,
      dummyUnit.hp + PRACTICE_DUMMY_REGEN_PER_SEC * dt,
    );
  };

  return {
    world,
    skillBook,
    buffs,
    playerUnit,
    dummyUnit,

    tryCastHotkey(hotkey) {
      if (hotkey === '0') return this.requestAutoAttack();
      const skill = arthurSkillByHotkey(hotkey);
      if (!skill) return false;

      let forwardRad = playerUnit.facingRad;
      if (skill.castMode === 'targeted' && skill.hit.kind === 'target') {
        const target = findNearestEnemy(world, playerUnit, skill.hit.range);
        if (!target) return false;
        forwardRad = facingToward(playerUnit.position, target.position);
      }

      const inst = skillBook.start(skill, playerUnit, { forwardRad });
      if (!inst) return false;

      if (skill.id === ARTHUR_SHIELD_ID) {
        aaIntent.cancel();
        faceChargeIntent.requestCharge(
          playerUnit,
          world,
          shieldAcquireRange,
        );
      }
      return true;
    },

    requestAutoAttack(priority: AutoAttackPriority = 'default') {
      return aaIntent.requestAttack(playerUnit, world, aaRanges.acquireRange, priority);
    },

    cancelAutoAttack() {
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
      faceChargeIntent.clear();
      clearAllCc(allUnits());
    },

    preTick({ dt, manualMove, playerX, playerZ }) {
      if (manualMove) {
        aaIntent.cancel();
        faceChargeIntent.cancel();
      }

      playerUnit.position.x = playerX;
      playerUnit.position.z = playerZ;

      buffs.tick(dt);
      const speedMultiplier = buffs.moveSpeedMultiplier();

      const aaSkill = arthurSkillByHotkey('0');
      const aaAction = aaIntent.tick({
        caster: playerUnit,
        resolveUnit: (id) => world.getUnit(id),
        canCast: aaSkill !== null && skillBook.canStart(aaSkill.id),
        attackRange: aaRanges.attackRange,
        acquireRange: aaRanges.acquireRange,
        closeEngage: false,
      });

      const fcAction = faceChargeIntent.tick({
        caster: playerUnit,
        resolveUnit: (id) => world.getUnit(id),
        acquireRange: shieldAcquireRange,
      });

      let moveTarget: { x: number; z: number } | null = null;
      let facingRad: number | null = null;
      let clearMoveTarget = manualMove;

      if (fcAction.kind === 'engage') {
        if (fcAction.moveTo) {
          moveTarget = fcAction.moveTo;
          clearMoveTarget = false;
        }
        facingRad = fcAction.forwardRad;
        playerUnit.facingRad = fcAction.forwardRad;
      } else if (aaAction.kind === 'engage') {
        moveTarget = aaAction.moveTo;
        facingRad = aaAction.forwardRad;
        playerUnit.facingRad = aaAction.forwardRad;
        clearMoveTarget = false;
        if (aaAction.shouldCast && aaSkill) {
          skillBook.start(aaSkill, playerUnit, {
            forwardRad: aaAction.forwardRad,
          });
        }
      }

      return {
        speedMultiplier,
        moveTarget,
        clearMoveTarget,
        facingRad,
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
      }

      for (const completed of completedSkills) {
        if (completed !== activeInst) {
          applyFrameDamage(completed);
        }
        if (
          completed.skill.id === ARTHUR_AUTO_ATTACK_ID &&
          completed.damage.length > 0
        ) {
          buffs.consumeNextAttackBonus();
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
