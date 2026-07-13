// proposal §3.6.3
import { PerspectiveCamera } from 'three';

export interface FollowCameraConfig {
  fov: number;
  pitchDeg: number; // 俯角(45° = Moba 标准 quarter view)
  yawDeg: number;   // 镜头 yaw 锁死(玩家背向镜头)
  dist: number;     // 相机锚点离玩家距离
  aspect: number;
  near: number;
  far: number;
}

export const DEFAULT_FOLLOW_CAMERA: FollowCameraConfig = {
  fov: 60,
  pitchDeg: 45,
  yawDeg: 0,
  dist: 16,
  aspect: typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 16 / 9,
  near: 0.1,
  far: 200,
};

export interface FollowCameraHandle {
  camera: PerspectiveCamera;
  /** 跟随玩家位置;边界软拉:贴地图边界时把相机沿"贴边方向"推回 */
  follow(playerX: number, playerZ: number, arenaHalf: number, wallPushIn: number): void;
  /** 双指缩放:改变 FOV(40-80) */
  setFov(fov: number): void;
  /** 处理窗口 resize */
  resize(aspect: number): void;
  dispose(): void;
}

export function createFollowCamera(cfg: Partial<FollowCameraConfig> = {}): FollowCameraHandle {
  const c = { ...DEFAULT_FOLLOW_CAMERA, ...cfg };
  const camera = new PerspectiveCamera(c.fov, c.aspect, c.near, c.far);

  const pitchRad = (c.pitchDeg * Math.PI) / 180;
  const yawRad = (c.yawDeg * Math.PI) / 180;
  const horizOffset = -c.dist * Math.cos(pitchRad); // 沿玩家背后(负偏航)的水平距离
  const vertOffset = c.dist * Math.sin(pitchRad);    // Y 抬高

  function clampFov(v: number): number {
    return Math.max(40, Math.min(80, v));
  }

  function follow(
    playerX: number,
    playerZ: number,
    arenaHalf: number,
    wallPushIn: number,
  ): void {
    // yaw 决定"水平偏移"绕 Y 轴旋转
    let cx = playerX + horizOffset * Math.sin(yawRad);
    let cz = playerZ + horizOffset * Math.cos(yawRad);
    // 边界软拉:相机锚点不超出 arena(扣除推回余量)
    if (cx > arenaHalf - wallPushIn) cx = arenaHalf - wallPushIn;
    if (cx < -arenaHalf + wallPushIn) cx = -arenaHalf + wallPushIn;
    if (cz > arenaHalf - wallPushIn) cz = arenaHalf - wallPushIn;
    if (cz < -arenaHalf + wallPushIn) cz = -arenaHalf + wallPushIn;

    camera.position.set(cx, vertOffset, cz);
    camera.lookAt(playerX, 0.5, playerZ);
  }

  return {
    camera,
    follow,
    setFov(v: number) {
      camera.fov = clampFov(v);
      camera.updateProjectionMatrix();
    },
    resize(aspect: number) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },
    dispose() {
      // PerspectiveCamera 没有特殊 dispose
    },
  };
}
