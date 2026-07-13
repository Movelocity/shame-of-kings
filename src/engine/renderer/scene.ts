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
  controller: PlayerControllerHandle;
  /** 每帧调用:由外部喂入摇杆状态 */
  update(dt: number, joystick: JoystickState): void;
  dispose(): void;
}

const PLAYER_Y = 0.6; // §3.6.4 锁定位置 y=0.6
const FOV_DEFAULT = 60;

export function createGameScene(cfg: GameSceneConfig): GameSceneHandle {
  const scene = new Scene();
  scene.background = new Color(0x0b1024);

  const follow = createFollowCamera({
    aspect: cfg.width / cfg.height,
    fov: FOV_DEFAULT,
  });
  const lights = createGameLights();
  scene.add(lights.ambient);
  scene.add(lights.sun);

  const arena = createArena();
  scene.add(arena.group);

  const spawn = cfg.playerStart ?? { x: 0, z: -arena.halfExtent + 4 };
  const player = createEntityVisual({});
  player.setPosition(spawn.x, PLAYER_Y, spawn.z);
  player.setFacingRad(0); // 朝 +Z(面对桩)
  scene.add(player.root);

  const controller = createPlayerController({});

  function update(_dt: number, joystick: JoystickState): void {
    controller.update(_dt, joystick, player, arena);
    follow.follow(
      player.root.position.x,
      player.root.position.z,
      arena.halfExtent,
      2.5,
    );
  }

  function dispose(): void {
    follow.dispose();
    lights.dispose();
    arena.dispose();
    player.dispose();
  }

  return { scene, follow, lights, arena, player, controller, update, dispose };
}
