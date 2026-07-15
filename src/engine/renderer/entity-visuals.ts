// proposal §3.5 + §3.6 阵营与光照
import {
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
  Shape,
} from 'three';

export type EntityOrientation = 'standing' | 'facing';

export interface EntityVisualConfig {
  // 几何
  radius: number;
  /** 直立三棱锥的"高度比例"(相对于底面):height = radius * heightRatio */
  heightRatio: number;
  /** 朝向指示器形状 */
  indicator: 'triangle' | 'arrow';
  /** 三角形边长(世界单位) */
  triangleSize: number;
  /** 旧:箭头长度(仅 indicator=arrow 时生效,保留兼容) */
  arrowLength: number;
  // 光圈
  ringInner: number;
  ringOuter: number;
  ringAlpha: number;
  // 颜色
  coneColor: number;
  ringColor: number;
  arrowColor: number;
  /** 三角指示器颜色(默认沿用 arrowColor) */
  triangleColor: number;
  /** 三棱锥姿态:standing=贴地顶点朝上;facing=侧躺指 +Z(legacy) */
  orientation: EntityOrientation;
}

export const DEFAULT_ENTITY_VISUAL: EntityVisualConfig = {
  radius: 0.5,
  heightRatio: 2,
  indicator: 'triangle',
  triangleSize: 0.45,
  arrowLength: 1.3, // legacy,indicator=arrow 时才用
  ringInner: 0.6,
  ringOuter: 0.72,
  ringAlpha: 0.45,
  coneColor: 0x3b78ff,
  ringColor: 0x3b78ff,
  arrowColor: 0xffd84a,
  triangleColor: 0xffd84a,
  orientation: 'standing',
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

  // 锥高 = 底面半径 * 比例。standing 时垂直立在地上(顶点朝 +Y);
  // facing 时躺下指向 +Z(legacy)。
  const coneHeight = c.radius * c.heightRatio;
  const coneGeom = new CylinderGeometry(0, c.radius, coneHeight, 3);
  const coneMat = new MeshStandardMaterial({
    color: c.coneColor,
    emissive: c.coneColor,
    emissiveIntensity: 0.05,
  });
  const cone = new Mesh(coneGeom, coneMat);
  if (c.orientation === 'facing') {
    cone.rotation.x = Math.PI / 2; // 顶点指向 +Z
  } else {
    // standing:顶点朝 +Y,几何中心在 y=0。把锥上移半高,让底部贴地。
    cone.position.y = coneHeight / 2;
  }
  cone.castShadow = true;
  cone.receiveShadow = true;

  // 地面圆环(贴地,中心略抬 0.01 防 z-fight)
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

  // 朝向指示器:独立的 Group,挂在 root 下随三棱锥整体旋转。
  // standing 时 indicator 局部 rotation.y 恒为 0,由 root 承担朝向;
  // facing legacy 时同样随 root 转,作为附加箭头指示。
  const indicator = new Group();
  let shaftGeom: CylinderGeometry | undefined;
  let headGeom: ConeGeometry | undefined;
  let triangleGeom: import('three').ExtrudeGeometry | undefined;
  let indicatorMat!: MeshStandardMaterial;
  if (c.indicator === 'triangle') {
    const s = c.triangleSize;
    const shape = new Shape();
    // 等边三角形,质心在原点,尖端朝 +Z。
    shape.moveTo(0, (2 / 3) * (s * Math.sqrt(3) / 2));
    shape.lineTo(s / 2, -(1 / 3) * (s * Math.sqrt(3) / 2));
    shape.lineTo(-s / 2, -(1 / 3) * (s * Math.sqrt(3) / 2));
    shape.closePath();
    triangleGeom = new ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: false,
    });
    indicatorMat = new MeshStandardMaterial({
      color: c.triangleColor,
      emissive: c.triangleColor,
      emissiveIntensity: 0.35,
    });
    const tri = new Mesh(triangleGeom, indicatorMat);
    // Shape 在 XY 平面,尖端朝 +Y(顶点)。绕 X 转 +π/2 把尖端翻到 +Z,
    // 整三角形平躺在 XZ 地面、尖端落在 player 正前方(玩家面向方向,+Z 一侧)。
    // 这是 "远指" 形态:玩家看向地图深处时,箭头从近端指向远方。
    tri.rotation.x = Math.PI / 2;
    // 三角形位在圆环外圈略外。
    const rOffset = c.ringOuter + s * 0.55;
    tri.position.set(0, 0.02, rOffset);
    indicator.add(tri);
  } else {
    // legacy:箭头 = 圆柱身 + 圆锥头
    const shaftLen = c.arrowLength - 0.3;
    shaftGeom = new CylinderGeometry(0.08, 0.08, shaftLen, 8);
    headGeom = new ConeGeometry(0.18, 0.3, 8);
    indicatorMat = new MeshStandardMaterial({
      color: c.arrowColor,
      emissive: c.arrowColor,
      emissiveIntensity: 0.2,
    });
    const shaft = new Mesh(shaftGeom, indicatorMat);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = shaftLen / 2 + 0.2;
    shaft.castShadow = true;
    const head = new Mesh(headGeom, indicatorMat);
    head.rotation.x = Math.PI / 2;
    head.position.z = shaftLen + 0.2 + 0.15;
    head.castShadow = true;
    indicator.add(shaft);
    indicator.add(head);
  }

  const root = new Group();
  root.add(cone);
  root.add(ring);
  root.add(indicator);

  function setFacingRad(r: number): void {
    // 约定:player forward = world -Z, r = 0 表示"玩家朝地图深处(-Z)"。
    // indicator 局部 +Z 为"正前方";整体 root.rotation.y = π - r 把局部 +Z 翻到玩家前进方向,
    // 三棱锥与指示器同步旋转,光照在 3 个侧面上形成亮/中/暗梯度(proposal §3.6.1)。
    //   A(vx<0,vz=0):r=-π/2, θ=3π/2≡-π/2 → +Z → -X(player 朝 -X = 左)
    //   D(vx>0,vz=0):r=+π/2, θ=+π/2 → +Z → +X(player 右)
    //   W(vx=0,vz<0):r=0,    θ=+π    → +Z → -Z(player 前方)
    //   S(vx=0,vz>0):r=π,    θ=0      → +Z stays +Z(player 回退方向)
    // facing legacy(箭头几何在 +Z)整体旋转 r + π,语义同上、自洽。
    if (c.orientation === 'standing') {
      root.rotation.y = Math.PI - r;
      indicator.rotation.y = 0;
    } else {
      root.rotation.y = r + Math.PI;
    }
  }

  let pulseT = 0;
  function setRingPulse(t: number): void {
    pulseT = Math.max(0, Math.min(1, t));
    ringMat.emissiveIntensity = 0.6 + pulseT * 0.8;
    ringMat.opacity = c.ringAlpha + pulseT * 0.5;
    coneMat.emissiveIntensity = 0.05 + pulseT * 0.4;
    indicatorMat.emissiveIntensity = 0.35 + pulseT * 0.4;
  }

  function setPosition(x: number, y: number, z: number): void {
    root.position.set(x, y, z);
  }

  function dispose(): void {
    [coneGeom, ringGeom, shaftGeom, headGeom, triangleGeom].forEach((g) =>
      g?.dispose(),
    );
    coneMat.dispose();
    ringMat.dispose();
    indicatorMat.dispose();
  }

  return { root, setFacingRad, setRingPulse, setPosition, dispose };
}
