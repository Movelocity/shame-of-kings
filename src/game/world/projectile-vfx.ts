// 弹道视觉:为妲己的弹道/普攻替换默认 hitbox 圆环,
// 使用 ShapeGeometry 绘制的平面爱心,垂直地面,飞行时匀速自转。
import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  Shape,
  ShapeGeometry,
} from 'three';
import type { ProjectileEffect } from './skill-effects/projectile';
import type { SkillEffectEntity } from './skill-effects/types';

/** 需要渲染为爱心平面的 projectile skillId */
const HEART_SKILL_IDS = new Set(['fox-fire', 'charm-wave']);

const SPIN_SPEED = Math.PI * 1.5; // 每秒转 0.75 圈

function shouldRenderAsHeart(skillId: string, heroId: string): boolean {
  if (HEART_SKILL_IDS.has(skillId)) return true;
  // 妲己普攻也用爱心
  return heroId === 'daji' && skillId === 'auto-attack';
}

function createHeartShape(size: number): Shape {
  const s = size;
  const shape = new Shape();
  shape.moveTo(0, s * 0.25);
  shape.bezierCurveTo(-s * 0.15, s * 0.6, -s * 0.6, s * 0.55, -s * 0.6, s * 0.05);
  shape.bezierCurveTo(-s * 0.6, -s * 0.35, 0, -s * 0.65, 0, -s);
  shape.bezierCurveTo(0, -s * 0.65, s * 0.6, -s * 0.35, s * 0.6, s * 0.05);
  shape.bezierCurveTo(s * 0.6, s * 0.55, s * 0.15, s * 0.6, 0, s * 0.25);
  shape.closePath();
  return shape;
}

function createHeartMesh(color: number, size: number): Mesh {
  const geo = new ShapeGeometry(createHeartShape(size));
  // ShapeGeometry 默认在 XY 平面,是垂直地面的;正面朝 +Z
  const mat = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.98,
    side: DoubleSide,
    depthWrite: false,
  });
  return new Mesh(geo, mat);
}

function configForSkill(skillId: string): { color: number; size: number } {
  if (skillId === 'fox-fire') {
    // 二技能「狐火」:较大亮粉爱心
    return { color: 0xff4da6, size: 1.5 };
  }
  if (skillId === 'charm-wave') {
    // 三技能「灵魂冲击」(大招):较小浅粉爱心
    return { color: 0xff85c0, size: 0.55 };
  }
  // 妲己普攻:小爱心
  return { color: 0xff69b4, size: 0.45 };
}

export interface ProjectileVfxHandle {
  update(
    effects: Iterable<[string, SkillEffectEntity]>,
    camera: PerspectiveCamera,
    heroId: string,
    dt: number,
  ): void;
  dispose(): void;
}

export function createProjectileVfx(scene: Scene): ProjectileVfxHandle {
  const visuals = new Map<string, { mesh: Mesh; spin: number }>();

  function ensureVisual(effectId: string, effect: ProjectileEffect): Mesh {
    let entry = visuals.get(effectId);
    if (!entry) {
      const cfg = configForSkill(effect.skillId);
      const mesh = createHeartMesh(cfg.color, cfg.size);
      mesh.name = `projectile-heart-${effect.skillId}`;
      scene.add(mesh);
      entry = { mesh, spin: 0 };
      visuals.set(effectId, entry);
    }
    return entry.mesh;
  }

  return {
    update(effects, _camera, heroId, dt) {
      const activeIds = new Set<string>();
      for (const [id, effect] of effects) {
        if (effect.kind !== 'projectile') continue;
        if (!shouldRenderAsHeart(effect.skillId, heroId)) continue;
        activeIds.add(id);
        const projectile = effect as ProjectileEffect;
        const mesh = ensureVisual(id, projectile);
        const pos = projectile.getPosition();
        const forwardRad = (projectile as { getForwardRad?(): number }).getForwardRad?.() ?? 0;

        // 垂直地面 + 朝向飞行方向 + 匀速自转;抬高位置避免被地面/单位模型遮挡
        mesh.position.set(pos.x, 1.2, pos.z);
        const entry = visuals.get(id);
        if (entry) {
          entry.spin += SPIN_SPEED * dt;
          // XY 平面爱心正面朝 +Z;forwardRad=0 是世界 -Z,转 PI 对齐前方,再叠加自转
          mesh.rotation.y = -forwardRad + Math.PI + entry.spin;
        }
      }

      for (const [id, entry] of visuals) {
        if (activeIds.has(id)) continue;
        scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        (entry.mesh.material as MeshBasicMaterial).dispose();
        visuals.delete(id);
      }
    },

    dispose() {
      for (const entry of visuals.values()) {
        scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        (entry.mesh.material as MeshBasicMaterial).dispose();
      }
      visuals.clear();
    },
  };
}
