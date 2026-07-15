// proposal §2.2 §3.5-§3.7 整合:scene = camera + lights + arena + entity(亚瑟三棱锥)+ 玩家控制器
import { Color, Scene } from 'three';
import { createFollowCamera, type FollowCameraHandle } from './camera';
import { createGameLights, type GameLightsHandle } from './lights';
import { createArena, type ArenaHandle } from './arena';
import { createEntityVisual, type EntityVisualHandle } from './entity-visuals';
import {
  createPlayerController,
  type PlayerControllerHandle,
} from '../input/player-controller';
import type { JoystickState } from '../input/joystick';

export interface GameSceneConfig {
  width: number;
  height: number;
  playerStart?: { x: number; z: number };
}

export interface GameSceneHandle {
  scene: Scene;
  follow: FollowCameraHandle;
  lights: GameLightsHandle;
  arena: ArenaHandle;
  player: EntityVisualHandle;
  dummy: EntityVisualHandle;
  controller: PlayerControllerHandle;
  /** 每帧调用:由外部喂入摇杆状态 */
  update(dt: number, joystick: JoystickState): void;
  /** 重置玩家回出生点(仅 controller 状态) */
  reset(): void;
  /**
   * 重置整个世界(回出生点 + dummy 满血 + 清空技能)。
   * 由 GameCanvas 注入闭包实现;不实现则 undefined。
   * PlayPage / DebugOverlay 重置按钮通过 sceneRef 直接调到这里。
   */
  resetWorld?: () => void;
  dispose(): void;
}

const PLAYER_Y = 0; // 玩家和敌人都贴地:锥底部 y=0,与场地平齐
const FOV_DEFAULT = 60;

// 桩位置 = 场地中央偏 -Z(地图深处),玩家从 +Z 出生面向 -Z 恰好面对桩
const DUMMY_POSITION: { x: number; z: number } = { x: 0, z: 0 };

export function createGameScene(cfg: GameSceneConfig): GameSceneHandle {
  const scene = new Scene();
  // 亮色调:浅天空蓝灰;地面和墙配套换浅色
  scene.background = new Color(0xc8d6e5);

  const follow = createFollowCamera({
    aspect: cfg.width / cfg.height,
    fov: FOV_DEFAULT,
  });
  const lights = createGameLights();
  scene.add(lights.ambient);
  scene.add(lights.sun);

  const arena = createArena();
  scene.add(arena.group);

  const spawn = cfg.playerStart ?? { x: 0, z: arena.halfExtent - 4 };
  const player = createEntityVisual({
    // 玩家:鲜明蓝锥
    coneColor: 0x3b78ff,
    ringColor: 0x3b78ff,
    triangleColor: 0xffd84a,
  });
  player.setPosition(spawn.x, PLAYER_Y, spawn.z);
  player.setFacingRad(0); // 朝地图深处(-Z,面对桩)
  scene.add(player.root);

  // 木人桩:橘红锥体(亮色,与玩家蓝清晰区分),与玩家共用一套视觉模型
  const dummy = createEntityVisual({
    coneColor: 0xff6a3d,
    ringColor: 0xff6a3d,
    triangleColor: 0xffffff,
  });
  dummy.setPosition(DUMMY_POSITION.x, PLAYER_Y, DUMMY_POSITION.z);
  dummy.setFacingRad(0);
  scene.add(dummy.root);

  const controller = createPlayerController({});

  function update(_dt: number, joystick: JoystickState): void {
    controller.update(_dt, joystick, player, arena);
    follow.follow(
      player.root.position.x,
      player.root.position.z,
    );
  }

  function reset(): void {
    controller.reset(player, arena);
  }

  function dispose(): void {
    follow.dispose();
    lights.dispose();
    arena.dispose();
    player.dispose();
    dummy.dispose();
  }

  return { scene, follow, lights, arena, player, dummy, controller, update, reset, dispose };
}
