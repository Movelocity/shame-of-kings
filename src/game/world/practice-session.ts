// 练习场 session:世界生命周期、tick、cast、reset;与 React / Three 解耦
import { createAutoAttackIntent } from '../combat/auto-attack-intent';
import { createBuffBag } from '../buffs/buff-bag';
import {
  arthurSkillByHotkey,
  ARTHUR_AUTO_ATTACK_ID,
  getArthurAutoAttackRanges,
} from '../heroes/arthur';
import { applyDamage } from '../skills/runtime';
import { createSkillBook } from '../skills/skill-book';
import type { SkillInstance, Unit } from '../skills/types';
import { createPracticeDummy } from '../units/practice-dummy';
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
  requestAutoAttack(): boolean;
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
  const aaRanges = getArthurAutoAttackRanges();

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
      return skillBook.start(skill, playerUnit, { forwardRad: playerUnit.facingRad }) !== null;
    },

    requestAutoAttack() {
      return aaIntent.requestAttack(playerUnit, world, aaRanges.acquireRange);
    },

    cancelAutoAttack() {
      aaIntent.cancel();
    },

    resetWorld() {
      dummyUnit.hp = dummyUnit.hpMax;
      skillBook.reset();
      buffs.clear();
      aaIntent.clear();
    },

    preTick({ dt, manualMove, playerX, playerZ }) {
      if (manualMove) {
        aaIntent.cancel();
      }

      playerUnit.position.x = playerX;
      playerUnit.position.z = playerZ;

      buffs.tick(dt);
      const speedMultiplier = buffs.moveSpeedMultiplier();

      const aaSkill = arthurSkillByHotkey('0');
      const closeEngage = buffs.peekNextAttackBonus() > 1 + 1e-6;
      const aaAction = aaIntent.tick({
        caster: playerUnit,
        resolveUnit: (id) => world.getUnit(id),
        canCast: aaSkill !== null && skillBook.canStart(aaSkill.id),
        attackRange: aaRanges.attackRange,
        acquireRange: aaRanges.acquireRange,
        closeEngage,
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

      const completedSkills = skillBook.tick(dt, {
        caster: playerUnit,
        world,
        now: 0,
        buffs,
      });

      let dummyRingPulse = false;
      let dashSync: { x: number; z: number } | null = null;

      for (const completed of completedSkills) {
        const results = completed.damage;
        applyDamage([dummyUnit, playerUnit], results);
        world.notifyDamage(results);
        if (
          completed.skill.id === ARTHUR_AUTO_ATTACK_ID &&
          results.length > 0
        ) {
          buffs.consumeNextAttackBonus();
        }
        if (results.length > 0) {
          dummyRingPulse = true;
        }
        if (completed.skill.displacement === 'dash') {
          dashSync = { x: playerUnit.position.x, z: playerUnit.position.z };
        }
      }

      return { completedSkills, dummyRingPulse, dashSync };
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
