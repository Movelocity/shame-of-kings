// T19:世界空间血条(Three.js Sprite + CanvasTexture)
// 跟随单位位置每帧更新;sprite 本身是 billboard,自动面向相机
// 性能:每色一张"全满"贴图缓存;填充宽度用 scale.x 表达百分比
// 旧 HpBar.tsx / DummyHpBar.tsx(DOM 固定角落)废弃
import {
  CanvasTexture,
  Group,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three';
import type { Unit } from '../skills/types';

interface BarVisual {
  group: Group;
  bg: Sprite;
  fill: Sprite;
  status: Sprite | null;
  bgMat: SpriteMaterial;
  fillMat: SpriteMaterial;
  statusMat: SpriteMaterial | null;
  follow: Unit;
  offsetY: number;
  width: number;
  height: number;
  baseColor: string;
  lastFillKey: string;
  statusVisible: boolean;
}

const TEXTURE_SIZE = 256;
const BAR_HEIGHT_PX = 28;
const BAR_PADDING_PX = 4;
const STATUS_HEIGHT_PX = 22;
const STATUS_OFFSET_Y = 0.28;

const statusLabelCache = new Map<string, CanvasTexture>();

function getOrCreateStatusLabel(text: string): CanvasTexture {
  const cached = statusLabelCache.get(text);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = STATUS_HEIGHT_PX;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 200, 60, 0.95)';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  statusLabelCache.set(text, tex);
  return tex;
}

export interface WorldHpBarsHandle {
  readonly group: Group;
  register(
    unit: Unit,
    color: string,
    offsetY?: number,
    width?: number,
    height?: number,
  ): void;
  unregister(unitId: string): void;
  update(): void;
  dispose(): void;
}

const fullFillCache = new Map<string, CanvasTexture>();
let bgTexture: CanvasTexture | null = null;

function getOrCreateFullFill(color: string): CanvasTexture {
  const cached = fullFillCache.get(color);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = BAR_HEIGHT_PX;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const innerX = BAR_PADDING_PX;
    const innerY = BAR_PADDING_PX;
    const innerW = canvas.width - BAR_PADDING_PX * 2;
    const innerH = BAR_HEIGHT_PX - BAR_PADDING_PX * 2;
    ctx.fillStyle = color;
    roundRect(ctx, innerX, innerY, innerW, innerH, 4);
    ctx.fill();
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  fullFillCache.set(color, tex);
  return tex;
}

function getOrCreateBg(): CanvasTexture {
  if (bgTexture) return bgTexture;
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = BAR_HEIGHT_PX;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(20, 28, 48, 0.92)';
    roundRect(ctx, 0, 0, canvas.width, BAR_HEIGHT_PX, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    roundRect(ctx, 0.5, 0.5, canvas.width - 1, BAR_HEIGHT_PX - 1, 6);
    ctx.stroke();
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  bgTexture = tex;
  return tex;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// 阵营基色:玩家 = 蓝,敌人 = 红。register 时传入,在缓存里独立成图。
export const FACTION_COLORS = {
  player: '#3b78ff',
  enemy: '#ff4d4f',
} as const;

// 按当前血量百分比,在阵营基色上调一档暗色,作为"残血警示"。
// 低血量统一加深红调,保留原"危险"信号,与阵营色叠加不冲突。
function pickFillColor(baseColor: string, pct: number): string {
  if (pct > 0.3) return baseColor;
  return '#ff5151';
}

export function createWorldHpBars(): WorldHpBarsHandle {
  const root = new Group();
  root.name = 'world-hp-bars';
  const bars = new Map<string, BarVisual>();

  return {
    group: root,

    register(
      unit,
      color,
      offsetY = 1.5,
      width = 1.6,
      height = 0.18,
    ) {
      if (bars.has(unit.id)) return;
      const bgMat = new SpriteMaterial({
        map: getOrCreateBg(),
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const fillMat = new SpriteMaterial({
        map: getOrCreateFullFill(color),
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const bg = new Sprite(bgMat);
      const fill = new Sprite(fillMat);
      // 背景 + 填充都用"左侧锚点",position 错位 -width/2 让血条居中于单位
      bg.center.set(0, 0.5);
      fill.center.set(0, 0.5);
      bg.scale.set(width, height, 1);
      fill.scale.set(width, height, 1);
      bg.position.set(-width / 2, 0, 0);
      fill.position.set(-width / 2, 0, 0);
      bg.renderOrder = 998;
      fill.renderOrder = 999;
      const group = new Group();
      group.add(bg);
      group.add(fill);
      group.position.set(unit.position.x, offsetY, unit.position.z);
      root.add(group);
      bars.set(unit.id, {
        group,
        bg,
        fill,
        status: null,
        bgMat,
        fillMat,
        statusMat: null,
        follow: unit,
        offsetY,
        width,
        height,
        baseColor: color,
        lastFillKey: color,
        statusVisible: false,
      });
    },

    unregister(unitId) {
      const b = bars.get(unitId);
      if (!b) return;
      root.remove(b.group);
      b.bgMat.dispose();
      b.fillMat.dispose();
      if (b.statusMat) b.statusMat.dispose();
      bars.delete(unitId);
    },

    update() {
      for (const b of bars.values()) {
        const u = b.follow;
        b.group.position.set(u.position.x, b.offsetY, u.position.z);
        const pct = u.hpMax > 0 ? u.hp / u.hpMax : 0;
        b.fill.scale.x = Math.max(0, b.width * pct);
        const fillKey = pickFillColor(b.baseColor, pct);
        if (fillKey !== b.lastFillKey) {
          b.fillMat.map = getOrCreateFullFill(fillKey);
          b.fillMat.needsUpdate = true;
          b.lastFillKey = fillKey;
        }
        b.bg.visible = u.hp > 0;
        b.fill.visible = u.hp > 0;

        const showKnockup =
          u.cc?.kind === 'knockup' && (u.cc.remaining ?? 0) > 0;
        if (showKnockup && !b.status) {
          const statusMat = new SpriteMaterial({
            map: getOrCreateStatusLabel('击飞'),
            transparent: true,
            depthTest: false,
            depthWrite: false,
          });
          const status = new Sprite(statusMat);
          status.center.set(0.5, 0.5);
          status.scale.set(b.width * 0.55, b.height * 1.1, 1);
          status.position.set(0, STATUS_OFFSET_Y, 0);
          status.renderOrder = 1000;
          b.group.add(status);
          b.status = status;
          b.statusMat = statusMat;
          b.statusVisible = true;
        } else if (!showKnockup && b.status) {
          b.group.remove(b.status);
          b.statusMat?.dispose();
          b.status = null;
          b.statusMat = null;
          b.statusVisible = false;
        } else if (b.status) {
          b.status.visible = u.hp > 0;
        }
      }
    },

    dispose() {
      for (const b of bars.values()) {
        root.remove(b.group);
        b.bgMat.dispose();
        b.fillMat.dispose();
        if (b.statusMat) b.statusMat.dispose();
      }
      for (const t of fullFillCache.values()) t.dispose();
      fullFillCache.clear();
      for (const t of statusLabelCache.values()) t.dispose();
      statusLabelCache.clear();
      if (bgTexture) {
        bgTexture.dispose();
        bgTexture = null;
      }
      bars.clear();
    },
  };
}
