// M3 T3.5:飘字(proposal §3.6.6 + commit 守则:走 Three.js Sprite,不走 React)
// 每个 floater 是一个 Sprite,Canvas 2D 画"红色数字",向上飘 0.6s 后淡出销毁
import { CanvasTexture, Group, Sprite, SpriteMaterial, SRGBColorSpace } from 'three';

interface Floater {
  sprite: Sprite;
  material: SpriteMaterial;
  age: number;
  life: number;
  vy: number;
  text: string;
  color: string;
}

const DEFAULT_LIFE = 0.8;
const DEFAULT_VY = 1.2;
const SCALE = 0.6;

export class DamageFloaters {
  readonly group: Group;
  private floaters: Floater[] = [];
  private textureCache = new Map<string, CanvasTexture>();

  constructor() {
    this.group = new Group();
    this.group.name = 'damage-floaters';
  }

  /** 添加一条飘字:目标 (x, z) + 伤害值;可标记暴击 */
  add(_targetId: string, amount: number, position: { x: number; z: number }, isCrit = false): void {
    const text = amount > 0 ? `-${Math.round(amount)}` : 'miss';
    const color = isCrit ? '#ffd84a' : '#ff5151';
    const tex = this.getOrCreateTexture(text, color, isCrit);
    const material = new SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false, // 飘字总是可见
      depthWrite: false,
    });
    const sprite = new Sprite(material);
    sprite.scale.set(SCALE * (isCrit ? 1.4 : 1), SCALE * (isCrit ? 0.7 : 0.5), 1);
    // y 抬高一点避免贴地
    sprite.position.set(position.x, 1.2, position.z);
    this.group.add(sprite);
    this.floaters.push({
      sprite,
      material,
      age: 0,
      life: DEFAULT_LIFE,
      vy: DEFAULT_VY,
      text,
      color,
    });
  }

  /** 每帧推进:位置上移、age 增加、超过 life 就销毁 */
  update(dt: number): void {
    const survivors: Floater[] = [];
    for (const f of this.floaters) {
      f.age += dt;
      if (f.age >= f.life) {
        // 销毁
        this.group.remove(f.sprite);
        f.material.dispose();
        // 共享 CanvasTexture 不在这里 dispose(下次复用)
        continue;
      }
      // 上移
      f.sprite.position.y += f.vy * dt;
      // 淡出:后半段从 1 → 0
      const t = f.age / f.life;
      f.material.opacity = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
      survivors.push(f);
    }
    this.floaters = survivors;
  }

  dispose(): void {
    for (const f of this.floaters) {
      this.group.remove(f.sprite);
      f.material.dispose();
    }
    for (const tex of this.textureCache.values()) tex.dispose();
    this.textureCache.clear();
  }

  private getOrCreateTexture(text: string, color: string, bold: boolean): CanvasTexture {
    const key = `${text}|${color}|${bold}`;
    const cached = this.textureCache.get(key);
    if (cached) return cached;
    const size = bold ? 192 : 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = Math.round(size * 0.5);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${bold ? 'bold ' : ''}${bold ? 72 : 52}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 描边
      ctx.lineWidth = bold ? 6 : 4;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
      // 填充
      ctx.fillStyle = color;
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.needsUpdate = true;
    this.textureCache.set(key, tex);
    return tex;
  }
}
