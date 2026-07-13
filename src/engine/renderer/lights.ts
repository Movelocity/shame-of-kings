// proposal §3.6.1 + §3.6.2
import { AmbientLight, DirectionalLight, PCFSoftShadowMap } from 'three';

export interface GameLightsHandle {
  ambient: AmbientLight;
  sun: DirectionalLight;
  dispose(): void;
}

/**
 * 单 DirectionalLight 从 (5, 8, -3) 投射,产生三棱锥 3 面的亮/中/暗梯度。
 * AmbientLight 兜底,暗面不至于黑死。
 * PCFSoftShadowMap + mapSize=1024,移动端无压力。
 */
export function createGameLights(): GameLightsHandle {
  const ambient = new AmbientLight(0xffffff, 0.3);
  const sun = new DirectionalLight(0xffffff, 1.0);
  sun.position.set(5, 8, -3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;

  // 阴影范围覆盖 32x32 arena + 余量
  const shadowSize = 24;
  sun.shadow.camera.left = -shadowSize;
  sun.shadow.camera.right = shadowSize;
  sun.shadow.camera.top = shadowSize;
  sun.shadow.camera.bottom = -shadowSize;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 50;

  return {
    ambient,
    sun,
    dispose() {
      sun.shadow.map?.dispose();
      sun.shadow.dispose();
    },
  };
}

/** Renderer 应该开启的 shadow map 配置 */
export const REQUIRED_SHADOW_MAP = PCFSoftShadowMap;
