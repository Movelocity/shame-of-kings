// proposal §3.6.4
import {
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const ARENA_SIZE = 32; // 32 x 32 矩形 play space

export interface ArenaObstacleSpec {
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

export interface ArenaConfig {
  size?: number;
  obstacles?: ArenaObstacleSpec[];
}

export interface ArenaHandle {
  group: Group;
  obstacleMeshes: Mesh[];
  halfExtent: number;
  dispose(): void;
}

const DEFAULT_OBSTACLES: ArenaObstacleSpec[] = [
  // 出生点 → 桩之间,2 个柔化圆角障碍,玩家练绕位
  { x: -2.5, z: 4, w: 1.5, h: 1.2, d: 1.5 },
  { x: 2.5, z: 4, w: 1.5, h: 1.2, d: 1.5 },
];

export function createArena(cfg: ArenaConfig = {}): ArenaHandle {
  const size = cfg.size ?? ARENA_SIZE;
  const half = size / 2;
  const specs = cfg.obstacles ?? DEFAULT_OBSTACLES;

  const group = new Group();

  // 平面(地表)
  const floor = new Mesh(
    new PlaneGeometry(size, size),
    new MeshStandardMaterial({ color: 0x141a2e, side: DoubleSide }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // 4 面 Hard Wall —— 可见浅蓝色,实际阻挡由 §3.6.4 逻辑处理
  const wallMat = new MeshStandardMaterial({
    color: 0x2c3550,
    transparent: true,
    opacity: 0.35,
    side: DoubleSide,
  });
  const wallThickness = 0.5;
  const wallHeight = 2;
  const nWall = new Mesh(
    new BoxGeometry(size + wallThickness * 2, wallHeight, wallThickness),
    wallMat,
  );
  nWall.position.set(0, wallHeight / 2, -half - wallThickness / 2);
  nWall.castShadow = true;
  nWall.receiveShadow = true;
  group.add(nWall);
  const sWall = new Mesh(
    new BoxGeometry(size + wallThickness * 2, wallHeight, wallThickness),
    wallMat,
  );
  sWall.position.set(0, wallHeight / 2, half + wallThickness / 2);
  sWall.castShadow = true;
  sWall.receiveShadow = true;
  group.add(sWall);
  const wWall = new Mesh(
    new BoxGeometry(wallThickness, wallHeight, size + wallThickness * 2),
    wallMat,
  );
  wWall.position.set(-half - wallThickness / 2, wallHeight / 2, 0);
  wWall.castShadow = true;
  wWall.receiveShadow = true;
  group.add(wWall);
  const eWall = new Mesh(
    new BoxGeometry(wallThickness, wallHeight, size + wallThickness * 2),
    wallMat,
  );
  eWall.position.set(half + wallThickness / 2, wallHeight / 2, 0);
  eWall.castShadow = true;
  eWall.receiveShadow = true;
  group.add(eWall);

  // 柔化圆角障碍
  const obstacleMat = new MeshStandardMaterial({ color: 0x3a4a6b });
  const obstacleMeshes: Mesh[] = [];
  for (const spec of specs) {
    const geom = new RoundedBoxGeometry(spec.w, spec.h, spec.d, 4, 0.3);
    const mesh = new Mesh(geom, obstacleMat);
    mesh.position.set(spec.x, spec.h / 2, spec.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    obstacleMeshes.push(mesh);
  }

  return {
    group,
    obstacleMeshes,
    halfExtent: half,
    dispose() {
      group.traverse((obj: Object3D) => {
        if (obj instanceof Mesh) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
    },
  };
}
