// proposal §3.3 模块 C:JoystickState → player x/z 朝向
import type { EntityVisualHandle } from '../renderer/entity-visuals';
import type { ArenaHandle } from '../renderer/arena';
import type { JoystickState } from './joystick';

export interface PlayerControllerConfig {
  /** 世界单位移动速度 */
  maxSpeed: number;
  /** 玩家 Y,锁定不动 */
  fixedY: number;
}

export const DEFAULT_PLAYER_CONTROLLER: PlayerControllerConfig = {
  maxSpeed: 6.0,
  fixedY: 0.6,
};

export interface PlayerControllerHandle {
  /** 每帧调用:推进玩家位置 + 朝向 */
  update(dt: number, joystick: JoystickState, player: EntityVisualHandle, arena: ArenaHandle): void;
  /** 重置玩家(初始位置 + 朝向) */
  reset(player: EntityVisualHandle, arena: ArenaHandle): void;
}

/** 出生点(出生点 = (0, 0.6, -arenaHalf + 4)) */
export function defaultSpawn(arenaHalf: number): { x: number; z: number } {
  return { x: 0, z: -arenaHalf + 4 };
}

export function createPlayerController(
  cfg: Partial<PlayerControllerConfig> = {},
): PlayerControllerHandle {
  const c = { ...DEFAULT_PLAYER_CONTROLLER, ...cfg };

  function clampToArena(
    x: number,
    z: number,
    arena: ArenaHandle,
  ): { x: number; z: number } {
    const h = arena.halfExtent - 0.6;
    return {
      x: Math.max(-h, Math.min(h, x)),
      z: Math.max(-h, Math.min(h, z)),
    };
  }

  function update(
    dt: number,
    joystick: JoystickState,
    player: EntityVisualHandle,
    arena: ArenaHandle,
  ): void {
    // 摇杆静止:位置冻结,朝向冻结(proposal §5.1 "摇杆 0 向量时冻结")
    const speed = Math.hypot(joystick.x, joystick.y);
    if (speed < 1e-6) {
      return;
    }
    // 速度积分,方向归一
    // JoystickState 坐标系 = DOM 屏幕坐标系:
    //   joystick.x > 0 = thumb 在 base 右 ⇒ 世界 +X
    //   joystick.y < 0 = thumb 在 base 上(屏幕 y 向上) ⇒ 世界 +Z
    // 因此 vx 直接, vz = -joystick.y 翻转屏幕 y → 世界 z
    const vx = (joystick.x / speed) * c.maxSpeed;
    const vz = -(joystick.y / speed) * c.maxSpeed;
    const px = player.root.position.x + vx * dt;
    const pz = player.root.position.z + vz * dt;
    const clamped = clampToArena(px, pz, arena);
    player.setPosition(clamped.x, c.fixedY, clamped.z);
    // 朝向:atan2(vx, vz):摇杆向上(vz>0)= 0 rad,摇杆右(vx>0)= π/2 rad
    player.setFacingRad(Math.atan2(vx, vz));
  }

  function reset(player: EntityVisualHandle, arena: ArenaHandle): void {
    const spawn = defaultSpawn(arena.halfExtent);
    player.setPosition(spawn.x, c.fixedY, spawn.z);
    player.setFacingRad(0); // 朝 +Z
  }

  return { update, reset };
}
