// proposal §3.5 + §3.6 阵营与光照
import {
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
} from 'three';

export interface EntityVisualConfig {
  // 几何
  radius: number;
  arrowLength: number;
  // 光圈
  ringInner: number;
  ringOuter: number;
  ringAlpha: number;
  // 颜色
  coneColor: number;
  ringColor: number;
  arrowColor: number;
}

export const DEFAULT_ENTITY_VISUAL: EntityVisualConfig = {
  radius: 0.4,
  arrowLength: 1.3,
  ringInner: 0.45,
  ringOuter: 0.55,
  ringAlpha: 0.45,
  coneColor: 0x3b78ff,
  ringColor: 0x3b78ff,
  arrowColor: 0xffd84a,
};

export interface EntityVisualHandle {
  root: Group;
  /** 0 弧度 = 朝地图深处(世界 -Z,MOBA 标配);逆时针为正(rad) */
  setFacingRad(r: number): void;
  /** 0..1 闪烁强度(被打反应) */
  setRingPulse(t: number): void;
  /** 整体姿态归位 + 设位置 */
  setPosition(x: number, y: number, z: number): void;
  dispose(): void;
}

export function createEntityVisual(cfg: Partial<EntityVisualConfig> = {}): EntityVisualHandle {
  const c = { ...DEFAULT_ENTITY_VISUAL, ...cfg };

  // 三棱锥 —— CylinderGeometry 顶圆=0 + radialSegments=3 得三棱锥
  // height = 3 * radius 即 直径的 1.5 倍
  const coneHeight = 3 * c.radius;
  const coneGeom = new CylinderGeometry(0, c.radius, coneHeight, 3);
  const coneMat = new MeshStandardMaterial({
    color: c.coneColor,
    emissive: c.coneColor,
    emissiveIntensity: 0.05,
  });
  const cone = new Mesh(coneGeom, coneMat);
  // 顶点对应实体正方向(玩家朝 +Z,顶点默认朝 +Y)
  // 旋转:让顶点朝 +Z:绕 X 转 -90°,但是 Three.js CylinderGeometry 顶点是 +Y
  // 需要的姿态:三棱锥立在地上,顶点(原 +Y)转为朝向 +Z
  // (a) 让它躺下:绕 X 转 -π/2 让高度方向对齐 +Y→-Z
  // 想要顶点朝 +Z,转 +π/2 让 +Y → +Z
  cone.rotation.x = Math.PI / 2;
  // 经过 π/2 旋转,中心 (0,0,0) 不变,顶点 (+Z 半 height 处)
  // 为了让底部接在 y=0,锥几何中心偏离;再下移 coneHeight/2
  // rotation 后局部坐标变化 → 直接把 group 定位 y=0 即可
  cone.castShadow = true;
  cone.receiveShadow = true;

  // 光圈
  const ringGeom = new RingGeometry(c.ringInner, c.ringOuter, 32);
  const ringMat = new MeshStandardMaterial({
    color: c.ringColor,
    emissive: c.ringColor,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: c.ringAlpha,
    side: DoubleSide,
  });
  const ring = new Mesh(ringGeom, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;

  // 箭头:柱身 + 圆锥头
  const shaftLen = c.arrowLength - 0.3;
  const shaftGeom = new CylinderGeometry(0.08, 0.08, shaftLen, 8);
  const arrowMat = new MeshStandardMaterial({
    color: c.arrowColor,
    emissive: c.arrowColor,
    emissiveIntensity: 0.2,
  });
  const shaft = new Mesh(shaftGeom, arrowMat);
  // 柱身定位:从三棱锥出发沿 +Z 方向伸出 shaftLen/2
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = shaftLen / 2 + 0.2;
  shaft.castShadow = true;

  const headGeom = new ConeGeometry(0.18, 0.3, 8);
  const head = new Mesh(headGeom, arrowMat);
  head.rotation.x = Math.PI / 2;
  head.position.z = shaftLen + 0.2 + 0.15;
  head.castShadow = true;

  const arrow = new Group();
  arrow.add(shaft);
  arrow.add(head);

  // 默认 forward = +Z(MOBA 标配:玩家面向地图深处 = -Z,通过下面 setFacingRad 增加 π 偏移实现)。
  const root = new Group();
  // 三棱锥本体:旋转后底部应在 y=0,中心在 y = coneHeight/2
  // 但旋转后,几何的"底部"已变为 -Z 方向,所以 y 中心 = 0,顶点朝 +Z,
  // **这里我把 cone 的中心放回 y=0**(因为是程序上放置,不需要"立在地上")
  // 实际玩家三棱锥脚下要贴地:让锥的最薄端贴近 y=0,最厚端朝 +Z (forward)
  // 已通过 rotation.x = π/2 让顶点指向 +Z;中心位于原点。
  // 玩家的 y 由调用者 setPosition 设;三棱锥根部 y 应贴地
  cone.position.y = 0; // 不再下移;调用者保证 setPos.y = 0
  root.add(cone);
  root.add(ring);
  root.add(arrow);

  function setFacingRad(r: number): void {
    // 0 弧度对应"玩家朝地图深处" = 世界 -Z。
    // 内部几何的 +Z 作为 forward,所以外层 root 偏移 π。
    root.rotation.y = r + Math.PI;
  }

  let pulseT = 0;
  function setRingPulse(t: number): void {
    pulseT = Math.max(0, Math.min(1, t));
    // 应用闪烁:ringMat 的 emissiveIntensity 临时增加
    ringMat.emissiveIntensity = 0.6 + pulseT * 0.8;
    ringMat.opacity = c.ringAlpha + pulseT * 0.5;
    coneMat.emissiveIntensity = 0.05 + pulseT * 0.4;
  }

  function setPosition(x: number, y: number, z: number): void {
    root.position.set(x, y, z);
  }

  function dispose(): void {
    [coneGeom, ringGeom, shaftGeom, headGeom].forEach((g) => g.dispose());
    coneMat.dispose();
    ringMat.dispose();
    arrowMat.dispose();
  }

  return { root, setFacingRad, setRingPulse, setPosition, dispose };
}
