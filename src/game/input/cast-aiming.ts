// 瞄准会话状态机:按住预览、抬起提交;与 SkillBook 施法解耦。
import type { AimKind } from '../heroes/hero-kit';
import type { Skill } from '../skills/types';
import { aimForwardFromInput, type AimMoveInput } from './aim-forward';

export type AimingPhase = 'idle' | 'aiming';

export interface AimingSession {
  phase: AimingPhase;
  slotHotkey: string | null;
  skill: Skill | null;
  aimKind: AimKind;
  aimForwardRad: number;
  previewTargetId: string | null;
}

export function createAimingSession(): AimingSession {
  return {
    phase: 'idle',
    slotHotkey: null,
    skill: null,
    aimKind: 'none',
    aimForwardRad: 0,
    previewTargetId: null,
  };
}

export function isAiming(session: AimingSession): boolean {
  return session.phase === 'aiming';
}

export function beginAimingSession(
  session: AimingSession,
  params: {
    slotHotkey: string;
    skill: Skill;
    aimKind: AimKind;
    initialForwardRad: number;
    initialTargetId?: string | null;
  },
): void {
  session.phase = 'aiming';
  session.slotHotkey = params.slotHotkey;
  session.skill = params.skill;
  session.aimKind = params.aimKind;
  session.aimForwardRad = params.initialForwardRad;
  session.previewTargetId = params.initialTargetId ?? null;
}

export function updateAimingSession(
  session: AimingSession,
  params: {
    moveInput?: AimMoveInput;
    lockTargetId?: string | null;
    fallbackForwardRad?: number;
  },
): void {
  if (!isAiming(session)) return;

  if (session.aimKind === 'direction' && params.moveInput) {
    const base =
      params.fallbackForwardRad !== undefined
        ? aimForwardFromInput(params.moveInput, params.fallbackForwardRad)
        : aimForwardFromInput(params.moveInput, session.aimForwardRad);
    session.aimForwardRad = base;
  }

  if (session.aimKind === 'lock-target' && params.lockTargetId !== undefined) {
    session.previewTargetId = params.lockTargetId;
  }
}

export function cancelAimingSession(session: AimingSession): void {
  session.phase = 'idle';
  session.slotHotkey = null;
  session.skill = null;
  session.aimKind = 'none';
  session.previewTargetId = null;
}
