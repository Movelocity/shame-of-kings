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
  // T21:相机向玩家靠近 + 降低高度(原 dist=12/pitch=65° 太高太远)
  // dist=9,pitch=55°:水平距离 ~5.2(几乎不变),相机高度 ~7.4(原 ~10.9,降 32%)
  // yaw/pitch 完全锁死,只有 position 跟随玩家平移
  fov: 60,
  pitchDeg: 55,
  yawDeg: 0,
  dist: 9,
  aspect: typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 16 / 9,
  near: 0.1,
  far: 200,
};

export interface FollowCameraHandle {
  camera: PerspectiveCamera;
  /** 跟随玩家位置；相机与玩家的世界空间偏移、pitch、yaw 始终不变 */
  follow(playerX: number, playerZ: number): void;
  /**
   * 设置临时相机偏移(世界 XZ,叠加在玩家相对位置之上)。
   * 用于右侧拖动相机观察周围;松开归零即可「snap 回玩家相对位置」。
   */
  setCameraOffset(offsetX: number, offsetZ: number): void;
  /** 读取当前临时相机偏移(用于 DebugOverlay 等调试面板) */
  getCameraOffset(): { x: number; z: number };
  /** 双指缩放:改变 FOV(40-80) */
  setFov(fov: number): void;
  /** 处理窗口 resize */
  resize(aspect: number): void;
  dispose(): void;
}

export function createFollowCamera(cfg: Partial<FollowCameraConfig> = {}): FollowCameraHandle {
  const c = { ...DEFAULT_FOLLOW_CAMERA, ...cfg };
  const camera = new PerspectiveCamera(c.fov, c.aspect, c.near, c.far);

  // 相机位于玩家「面前」的背后 (=MOBA 标配:玩家面向地图深处)。
  // 约定玩家面对世界 -Z,所以相机的 z 偏玩家 +Z 侧(「玩家背后」),
  // 此时相机看向 -Z,up × z 的 x 分量为 +X → 相机的 right 指向世界 +X。
  // 这让 joystick.x>0(屏幕右)= world +X,刚好对应相机画面里的「右」,左右不反。
  const pitchRad = (c.pitchDeg * Math.PI) / 180;
  const yawRad = (c.yawDeg * Math.PI) / 180;
  const horizOffset = c.dist * Math.cos(pitchRad); // 沿玩家背后(玩家面对 -Z,即 +Z 方向)
  const vertOffset = c.dist * Math.sin(pitchRad);  // Y 抬高
  const offsetX = horizOffset * Math.sin(yawRad);
  const offsetZ = horizOffset * Math.cos(yawRad);

  camera.position.set(offsetX, vertOffset, offsetZ);
  camera.lookAt(0, 0.5, 0);

  // 临时相机偏移(右侧拖动相机用)。xz,叠加在玩家相对位置上;松开时归零即 snap 回玩家。
  let dragOffsetX = 0;
  let dragOffsetZ = 0;

  function clampFov(v: number): number {
    return Math.max(40, Math.min(80, v));
  }

  function follow(playerX: number, playerZ: number): void {
    camera.position.set(
      playerX + offsetX + dragOffsetX,
      vertOffset,
      playerZ + offsetZ + dragOffsetZ,
    );
  }

  return {
    camera,
    follow,
    setCameraOffset(x: number, z: number) {
      dragOffsetX = x;
      dragOffsetZ = z;
    },
    getCameraOffset() {
      return { x: dragOffsetX, z: dragOffsetZ };
    },
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
