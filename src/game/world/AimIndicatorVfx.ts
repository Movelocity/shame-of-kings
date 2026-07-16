// 脚下瞄准方向指示器:贴地箭头/扇形;lock-target 显示锁定连线;area 显示范围环+落点标。
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Shape,
  ShapeGeometry,
} from 'three';
import type { AimKind } from '../heroes/hero-kit';
import type { Vec2 } from '../skills/vec2';
import { AIM_INDICATOR_PRESET } from './vfx-presets';

const Y = 0.06;
const AREA_MARKER_RADIUS = 0.5;

export interface AimIndicatorState {
  aimKind: AimKind;
  forwardRad: number;
  origin: Vec2;
  lockTarget: Vec2 | null;
  lockRange?: number;
  /** area: 落点世界坐标 */
  targetPoint?: Vec2;
  /** area: 有效范围半径 */
  maxRange?: number;
}

export interface AimIndicatorVfxHandle {
  readonly group: Group;
  show(state: AimIndicatorState): void;
  hide(): void;
  update(dt: number): void;
  dispose(): void;
}

function makeMaterial(opacity: number = AIM_INDICATOR_PRESET.opacity): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: AIM_INDICATOR_PRESET.color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: DoubleSide,
  });
}

function applyPose(mesh: Mesh, origin: Vec2, forwardRad: number): void {
  mesh.position.set(origin.x, Y, origin.z);
  mesh.rotation.y = -forwardRad;
}

function buildArrow(): Mesh {
  const shape = new Shape();
  shape.moveTo(0, 0.2);
  shape.lineTo(-0.35, -0.55);
  shape.lineTo(0, -0.35);
  shape.lineTo(0.35, -0.55);
  shape.closePath();
  const geo = new ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  return new Mesh(geo, makeMaterial(AIM_INDICATOR_PRESET.opacity * 0.72));
}

function buildWedge(): Mesh {
  const shape = new Shape();
  shape.moveTo(0, 0);
  const range = 1.1;
  const half = 0.35;
  shape.lineTo(-Math.sin(half) * range, Math.cos(half) * range);
  shape.lineTo(Math.sin(half) * range, Math.cos(half) * range);
  shape.closePath();
  const geo = new ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  return new Mesh(geo, makeMaterial(AIM_INDICATOR_PRESET.opacity * 0.55));
}

function buildLockLine(from: Vec2, to: Vec2): Mesh {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const positions = new Float32Array([0, Y, 0, dx, Y, dz]);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const mat = makeMaterial(AIM_INDICATOR_PRESET.opacity * 0.35);
  const mesh = new Mesh(geo, mat);
  mesh.position.set(from.x, 0, from.z);
  return mesh;
}

function buildLockRing(range: number): Mesh {
  const geo = new RingGeometry(Math.max(0.2, range - 0.12), range, 48);
  geo.rotateX(-Math.PI / 2);
  const mat = makeMaterial(AIM_INDICATOR_PRESET.opacity * 0.55);
  return new Mesh(geo, mat);
}

function buildAreaMarker(): Mesh {
  const geo = new RingGeometry(
    Math.max(0.08, AREA_MARKER_RADIUS - 0.1),
    AREA_MARKER_RADIUS,
    32,
  );
  geo.rotateX(-Math.PI / 2);
  return new Mesh(geo, makeMaterial(AIM_INDICATOR_PRESET.opacity * 0.85));
}

export function createAimIndicatorVfx(): AimIndicatorVfxHandle {
  const group = new Group();
  group.name = 'aim-indicator-vfx';
  let visible = false;
  let state: AimIndicatorState | null = null;
  const meshes: Mesh[] = [];

  function clearMeshes(): void {
    for (const mesh of meshes) {
      group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
    meshes.length = 0;
  }

  function rebuild(): void {
    clearMeshes();
    if (!state || state.aimKind === 'none') return;

    if (state.aimKind === 'direction') {
      const arrow = buildArrow();
      applyPose(arrow, state.origin, state.forwardRad);
      group.add(arrow);
      meshes.push(arrow);
      const wedge = buildWedge();
      applyPose(wedge, state.origin, state.forwardRad);
      group.add(wedge);
      meshes.push(wedge);
    }

    if (state.aimKind === 'lock-target') {
      if (state.lockRange !== undefined && state.lockRange > 0) {
        const ring = buildLockRing(state.lockRange);
        applyPose(ring, state.origin, 0);
        group.add(ring);
        meshes.push(ring);
      }
      if (state.lockTarget) {
        const line = buildLockLine(state.origin, state.lockTarget);
        group.add(line);
        meshes.push(line);
      }
    }

    if (state.aimKind === 'area') {
      const maxRange = state.maxRange ?? 7;
      const ring = buildLockRing(maxRange);
      applyPose(ring, state.origin, 0);
      group.add(ring);
      meshes.push(ring);
      const marker = buildAreaMarker();
      const tp = state.targetPoint ?? state.origin;
      applyPose(marker, tp, 0);
      group.add(marker);
      meshes.push(marker);
    }
  }

  function refreshPose(): void {
    if (!state) return;
    let meshIdx = 0;
    if (state.aimKind === 'direction') {
      const arrow = meshes[meshIdx++];
      const wedge = meshes[meshIdx++];
      if (arrow) applyPose(arrow, state.origin, state.forwardRad);
      if (wedge) applyPose(wedge, state.origin, state.forwardRad);
    }
    if (state.aimKind === 'lock-target') {
      if (state.lockRange !== undefined && state.lockRange > 0) {
        const ring = meshes[meshIdx++];
        if (ring) applyPose(ring, state.origin, 0);
      }
      if (state.lockTarget) {
        const line = meshes[meshIdx];
        if (line) {
          line.geometry.dispose();
          const next = buildLockLine(state.origin, state.lockTarget);
          group.remove(line);
          (line.material as MeshBasicMaterial).dispose();
          meshes[meshIdx] = next;
          group.add(next);
        }
      }
    }
    if (state.aimKind === 'area') {
      const ring = meshes[meshIdx++];
      const marker = meshes[meshIdx++];
      if (ring) applyPose(ring, state.origin, 0);
      if (marker) {
        const tp = state.targetPoint ?? state.origin;
        applyPose(marker, tp, 0);
      }
    }
  }

  return {
    group,
    show(next) {
      const structureChanged =
        state?.aimKind !== next.aimKind ||
        state?.maxRange !== next.maxRange ||
        (state?.aimKind === 'lock-target' && state?.lockRange !== next.lockRange);
      state = next;
      visible = next.aimKind !== 'none';
      group.visible = visible;
      if (structureChanged) {
        rebuild();
      } else {
        refreshPose();
      }
    },
    hide() {
      visible = false;
      state = null;
      group.visible = false;
      clearMeshes();
    },
    update() {
      if (!visible || !state) return;
      refreshPose();
    },
    dispose() {
      clearMeshes();
    },
  };
}
