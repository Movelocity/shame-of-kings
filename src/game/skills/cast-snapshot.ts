import type { CastSnapshot } from './types';
import type { Vec2 } from './vec2';

let castIdCounter = 0;

export function nextCastId(): string {
  castIdCounter += 1;
  return `cast-${castIdCounter}`;
}

/** 构建不可变施法快照 */
export function createCastSnapshot(params: {
  casterId: string;
  skillId: string;
  origin: Vec2;
  forwardRad: number;
  targetId?: string;
  targetPoint?: Vec2;
  dashDistance?: number;
  castId?: string;
}): CastSnapshot {
  return {
    castId: params.castId ?? nextCastId(),
    casterId: params.casterId,
    skillId: params.skillId,
    origin: { x: params.origin.x, z: params.origin.z },
    forwardRad: params.forwardRad,
    targetId: params.targetId,
    targetPoint: params.targetPoint
      ? { x: params.targetPoint.x, z: params.targetPoint.z }
      : undefined,
    dashDistance: params.dashDistance,
  };
}
