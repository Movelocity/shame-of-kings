// 命中盒短暂闪光:技能进入 active 时画一次,淡出后销毁
// 与 hits.ts 几何约定一致:forwardRad=0 ≡ 世界 -Z;rect 在施法者前方。
import {
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Shape,
  ShapeGeometry,
  BoxGeometry,
} from 'three';
import type { HitShape } from '../skills/types';
import type { Vec2 } from '../skills/vec2';

const DEFAULT_LIFE = 0.35;
const Y = 0.06;
const COLOR = 0xffc14a;
const OPACITY = 0.45;
const BOUND_OPACITY = 0.3;

interface Flash {
  mesh: Mesh;
  material: MeshBasicMaterial;
  age: number;
  life: number;
  originProvider?: () => Vec2;
  forwardRad: number;
}

interface BoundFlash {
  mesh: Mesh;
  material: MeshBasicMaterial;
  originProvider: () => Vec2;
  forwardRad: number;
}

export interface HitboxVfxHandle {
  readonly group: Group;
  /** 在 origin 处以 forwardRad 朝向画一次命中盒 */
  spawn(shape: HitShape, origin: Vec2, forwardRad: number): void;
  /** 在短暂显示期间持续贴住 originProvider 返回的位置 */
  spawnAttached(shape: HitShape, originProvider: () => Vec2, forwardRad: number): void;
  /** 绑定 effect 几何,直到 pruneBoundEffects 移除 */
  bindEffect(
    id: string,
    shape: HitShape,
    originProvider: () => Vec2,
    forwardRad?: number,
  ): void;
  /** 移除已过期 effect 的绑定几何 */
  pruneBoundEffects(activeIds: ReadonlySet<string>): void;
  update(dt: number): void;
  dispose(): void;
}

function makeMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: COLOR,
    transparent: true,
    opacity: OPACITY,
    depthWrite: false,
    side: DoubleSide,
  });
}

/** Three Y 旋转:0 时局部 -Z = 世界 -Z(与 facingRad 一致) */
function applyPose(mesh: Mesh, origin: Vec2, forwardRad: number): void {
  mesh.position.set(origin.x, Y, origin.z);
  mesh.rotation.y = -forwardRad;
}

function buildSelf(): Mesh {
  const geo = new RingGeometry(0.35, 0.55, 24);
  geo.rotateX(-Math.PI / 2);
  return new Mesh(geo, makeMaterial());
}

function buildCircle(radius: number): Mesh {
  const geo = new CircleGeometry(radius, 32);
  geo.rotateX(-Math.PI / 2);
  const mat = makeMaterial();
  mat.opacity = OPACITY * 0.85;
  return new Mesh(geo, mat);
}

function buildRect(halfWidth: number, halfDepth: number): Mesh {
  // 盒子中心放在前方 halfDepth/2,覆盖 localZ ∈ [0, halfDepth]
  const geo = new BoxGeometry(halfWidth * 2, 0.05, halfDepth);
  geo.translate(0, 0, -halfDepth / 2);
  return new Mesh(geo, makeMaterial());
}

function buildCone(range: number, halfAngleRad: number): Mesh {
  const shape = new Shape();
  shape.moveTo(0, 0);
  const segments = 16;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = -halfAngleRad + t * halfAngleRad * 2;
    // Shape 在 XY:本地 +Y 当作前方(-Z),再整体旋转到 XZ
    shape.lineTo(Math.sin(a) * range, Math.cos(a) * range);
  }
  shape.closePath();
  const geo = new ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  // Shape 的 +Y 旋到 -Z 后需再绕 Y 转 π? rotateX(-90°) 把 +Y→-Z, +X 仍 +X。
  // facing 0 时期望扇形朝 -Z:当前几何已朝 -Z。OK
  const mat = makeMaterial();
  mat.opacity = OPACITY * 0.8;
  return new Mesh(geo, mat);
}

function buildTarget(range: number): Mesh {
  // 细环示意锁定距离
  const geo = new RingGeometry(Math.max(0.2, range - 0.15), range, 48);
  geo.rotateX(-Math.PI / 2);
  const mat = makeMaterial();
  mat.opacity = OPACITY * 0.35;
  return new Mesh(geo, mat);
}

function buildMesh(shape: HitShape): Mesh {
  switch (shape.kind) {
    case 'self':
      return buildSelf();
    case 'circle':
      return buildCircle(shape.radius);
    case 'rect':
      return buildRect(shape.halfWidth, shape.halfDepth);
    case 'cone':
      return buildCone(shape.range, shape.halfAngleRad);
    case 'target':
      return buildTarget(shape.range);
  }
}

export function createHitboxVfx(): HitboxVfxHandle {
  const group = new Group();
  group.name = 'hitbox-vfx';
  const flashes: Flash[] = [];
  const bound = new Map<string, BoundFlash>();

  function spawn(shape: HitShape, origin: Vec2, forwardRad: number): void {
    const mesh = buildMesh(shape);
    applyPose(mesh, origin, forwardRad);
    group.add(mesh);
    flashes.push({
      mesh,
      material: mesh.material as MeshBasicMaterial,
      age: 0,
      life: DEFAULT_LIFE,
      forwardRad,
    });
  }

  function spawnAttached(
    shape: HitShape,
    originProvider: () => Vec2,
    forwardRad: number,
  ): void {
    const mesh = buildMesh(shape);
    applyPose(mesh, originProvider(), forwardRad);
    group.add(mesh);
    flashes.push({
      mesh,
      material: mesh.material as MeshBasicMaterial,
      age: 0,
      life: DEFAULT_LIFE,
      originProvider,
      forwardRad,
    });
  }

  function bindEffect(
    id: string,
    shape: HitShape,
    originProvider: () => Vec2,
    forwardRad = 0,
  ): void {
    let entry = bound.get(id);
    if (!entry) {
      const mesh = buildMesh(shape);
      const material = mesh.material as MeshBasicMaterial;
      material.opacity = BOUND_OPACITY;
      applyPose(mesh, originProvider(), forwardRad);
      group.add(mesh);
      entry = { mesh, material, originProvider, forwardRad };
      bound.set(id, entry);
    }
    applyPose(entry.mesh, entry.originProvider(), entry.forwardRad);
  }

  function pruneBoundEffects(activeIds: ReadonlySet<string>): void {
    for (const [id, entry] of bound) {
      if (activeIds.has(id)) continue;
      group.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.material.dispose();
      bound.delete(id);
    }
  }

  function update(dt: number): void {
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]!;
      f.age += dt;
      if (f.age >= f.life) {
        group.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.material.dispose();
        flashes.splice(i, 1);
        continue;
      }
      if (f.originProvider) {
        applyPose(f.mesh, f.originProvider(), f.forwardRad);
      }
      const t = f.age / f.life;
      // 前段保持,后段淡出
      f.material.opacity =
        t < 0.45 ? OPACITY : Math.max(0, OPACITY * (1 - (t - 0.45) / 0.55));
    }

    for (const entry of bound.values()) {
      applyPose(entry.mesh, entry.originProvider(), entry.forwardRad);
    }
  }

  function dispose(): void {
    for (const f of flashes) {
      group.remove(f.mesh);
      f.mesh.geometry.dispose();
      f.material.dispose();
    }
    flashes.length = 0;
    for (const entry of bound.values()) {
      group.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.material.dispose();
    }
    bound.clear();
  }

  return { group, spawn, spawnAttached, bindEffect, pruneBoundEffects, update, dispose };
}
