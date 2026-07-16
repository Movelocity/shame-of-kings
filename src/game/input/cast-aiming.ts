// 瞄准会话状态机:按住预览、抬起提交;与 SkillBook 施法解耦。
import type { AimKind } from '../heroes/hero-kit';
import type { Skill } from '../skills/types';
import type { Vec2 } from '../skills/vec2';
import { aimForwardFromInput, type AimMoveInput } from './aim-forward';

export type AimingPhase = 'idle' | 'aiming';

export interface AimingSession {
  phase: AimingPhase;
  slotHotkey: string | null;
  skill: Skill | null;
  aimKind: AimKind;
  aimForwardRad: number;
  previewTargetId: string | null;
  /** area 瞄准落点;非 area 或未选定为 null */
  aimTargetPoint: Vec2 | null;
}

export function createAimingSession(): AimingSession {
  return {
    phase: 'idle',
    slotHotkey: null,
    skill: null,
    aimKind: 'none',
    aimForwardRad: 0,
    previewTargetId: null,
    aimTargetPoint: null,
  };
}

export function isAiming(session: AimingSession): boolean {
  return session.phase === 'aiming';
}

/** 从 hit shape 解析 area 瞄准最大半径 */
export function resolveAreaAimMaxRange(skill: Skill): number {
  const hit = skill.hit;
  if (hit.kind === 'circle') return hit.radius;
  if (hit.kind === 'cone') return hit.range;
  if (hit.kind === 'target') return hit.range;
  if (hit.kind === 'rect') return Math.max(hit.halfWidth, hit.halfDepth) * 2;
  return 7;
}

/** 将目标点钳制到距 origin ≤ maxRange */
export function clampTargetPointToRange(
  origin: Vec2,
  targetPoint: Vec2,
  maxRange: number,
): Vec2 {
  const dx = targetPoint.x - origin.x;
  const dz = targetPoint.z - origin.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= maxRange || dist < 1e-6) {
    return { x: targetPoint.x, z: targetPoint.z };
  }
  const s = maxRange / dist;
  return { x: origin.x + dx * s, z: origin.z + dz * s };
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
  session.aimTargetPoint = null;
}

export function updateAimingSession(
  session: AimingSession,
  params: {
    moveInput?: AimMoveInput;
    lockTargetId?: string | null;
    fallbackForwardRad?: number;
    /** area: 世界坐标落点(未钳制);与 origin + maxRange 一起使用 */
    targetPoint?: Vec2;
    origin?: Vec2;
    maxRange?: number;
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

  if (
    session.aimKind === 'area' &&
    params.targetPoint &&
    params.origin &&
    params.maxRange !== undefined
  ) {
    session.aimTargetPoint = clampTargetPointToRange(
      params.origin,
      params.targetPoint,
      params.maxRange,
    );
    const dx = session.aimTargetPoint.x - params.origin.x;
    const dz = session.aimTargetPoint.z - params.origin.z;
    if (Math.hypot(dx, dz) > 1e-6) {
      session.aimForwardRad = Math.atan2(dx, -dz);
    }
  }
}

export function cancelAimingSession(session: AimingSession): void {
  session.phase = 'idle';
  session.slotHotkey = null;
  session.skill = null;
  session.aimKind = 'none';
  session.previewTargetId = null;
  session.aimTargetPoint = null;
}
