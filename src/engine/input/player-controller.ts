// proposal §3.3 模块 C:JoystickState → player x/z 朝向
import type { EntityVisualHandle } from '../renderer/entity-visuals';
import type { ArenaHandle } from '../renderer/arena';
import type { JoystickState } from './joystick';

export interface PlayerControllerConfig {
  /** 世界单位移动速度 */
  maxSpeed: number;
  /** 玩家 Y,锁定不动 */
  fixedY: number;
  /** 点击寻路到达目标点的「认为到达」距离阈值(世界单位) */
  arriveEpsilon: number;
}

export const DEFAULT_PLAYER_CONTROLLER: PlayerControllerConfig = {
  maxSpeed: 6.0,
  fixedY: 0, // 三棱锥贴地,玩家 y 锁为 0
  arriveEpsilon: 0.3,
};

export interface PlayerControllerHandle {
  /** 每帧调用:推进玩家位置 + 朝向 */
  update(dt: number, joystick: JoystickState, player: EntityVisualHandle, arena: ArenaHandle): void;
  /** 设置点击寻路的目标点(world x,z)。有目标时优先于摇杆 */
  setMoveTarget(target: { x: number; z: number } | null): void;
  /** 重置玩家(初始位置 + 朝向)。同时清空点击目标 */
  reset(player: EntityVisualHandle, arena: ArenaHandle): void;
  /**
   * 当前朝向(世界 -Z = 0,逆时针为正)。KI-3:为元歌/镜的指向性技能 forwardRad 提供
   * 实时读数,只读 getter,不影响现有 update/reset/setMoveTarget 三个写接口。
   * 初始 0(朝 -Z);update 期间由 atan2(vx, -vz) 写入;reset 写回 0。
   */
  readonly facingRad: number;
}

/** 出生点 = (0, 0, +arenaHalf - 4):玩家在场地 +Z 侧,面朝地图深处 -Z */
export function defaultSpawn(arenaHalf: number): { x: number; z: number } {
  return { x: 0, z: arenaHalf - 4 };
}

export function createPlayerController(
  cfg: Partial<PlayerControllerConfig> = {},
): PlayerControllerHandle {
  const c = { ...DEFAULT_PLAYER_CONTROLLER, ...cfg };

  // 鼠标点击寻路的目标点(world x,z)。有目标时,优先级低于摇杆;
  // 玩家主动拨摇杆的瞬间会清除目标。null = 无目标。
  let moveTarget: { x: number; z: number } | null = null;
  // 当前朝向(世界 -Z = 0)。KI-3:为指向性技能 forwardRad 提供 getter。
  let _facingRad = 0;

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
    // 计算屏幕轴移动意图:
    //   优先摇杆(玩家主动输);否则用点击目标(鼠标点击寻路);都没有则冻结姿势。
    const joySpeed = Math.hypot(joystick.x, joystick.y);
    let vx = 0;
    let vz = 0;
    let moved = false;

    if (joySpeed > 1e-6) {
      // 摇杆:屏幕轴 → 世界 XZ
      //   joystick.x>0(屏幕右)= world +X
      //   joystick.y<0(屏幕上)= world -Z(地图深处)
      vx = (joystick.x / joySpeed) * c.maxSpeed;
      vz = (joystick.y / joySpeed) * c.maxSpeed;
      moveTarget = null;
      moved = true;
    } else if (moveTarget) {
      const px = player.root.position.x;
      const pz = player.root.position.z;
      const dx = moveTarget.x - px;
      const dz = moveTarget.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist <= c.arriveEpsilon) {
        moveTarget = null;
      } else {
        vx = (dx / dist) * c.maxSpeed;
        vz = (dz / dist) * c.maxSpeed;
        moved = true;
      }
    }

    if (!moved) return; // 摇杆 0 向量、没目标:位置和朝向冻结

    const px = player.root.position.x + vx * dt;
    const pz = player.root.position.z + vz * dt;
    const clamped = clampToArena(px, pz, arena);
    player.setPosition(clamped.x, c.fixedY, clamped.z);
    // 朝向:让 r = 0 ≡ 玩家朝 world -Z(地图深处,默认 spawn 朝向)。
    //   vx, vz 是世界坐标速度分量。
    //   Math.atan2(vx, -vz) 让 (vx=0,vz=-1)=0、(vx=0,vz=+1)=π、
    //   (vx>0,vz=0)=+π/2(逆时针 +X, 屏幕右)、(vx<0,vz=0)=-π/2(逆时针 -X, 屏幕左)。
    // entity-visuals.setFacingRad 用这个 r 配合 indicator.rotation.y = π - r 把三角形
    // 几何尖端转到玩家前进方向。
    const facing = Math.atan2(vx, -vz);
    _facingRad = facing;
    player.setFacingRad(facing);
  }

  function setMoveTarget(target: { x: number; z: number } | null): void {
    moveTarget = target;
  }

  function reset(player: EntityVisualHandle, arena: ArenaHandle): void {
    const spawn = defaultSpawn(arena.halfExtent);
    player.setPosition(spawn.x, c.fixedY, spawn.z);
    player.setFacingRad(0); // 朝地图深处(-Z)
    _facingRad = 0;
    moveTarget = null;
  }

  return {
    update,
    setMoveTarget,
    reset,
    get facingRad(): number {
      return _facingRad;
    },
  };
}
