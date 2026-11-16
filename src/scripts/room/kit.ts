// Shared building blocks for the listening room's models.
//
// Conventions every model follows, so the scene can place them blindly:
// - Units are metres, at real-world size.
// - Each build function returns a THREE.Group whose origin is the centre of
//   the object's footprint, on the surface it stands on (y = 0 is the floor
//   or desk top). +y is up, +z is the object's front.
// - Materials are MeshStandardMaterial / MeshPhysicalMaterial in sRGB;
//   textures are drawn on canvases here (no image files), except the record
//   covers, which come from the page.
// - Meshes cast and receive shadows unless they are tiny or emissive.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Palette, taken from the site's tokens where they exist.
export const C = {
  wall: 0xebe5da,
  ceiling: 0xf2eee7,
  board: 0x2e2a27,
  boardEdge: 0x3a3530,
  frame: 0xd8d0c2,
  glassDay: 0xfffaf0,
  glassNight: 0x1c1f26,
  signal: 0xe8693a,
  cream: 0xf6f3ec,
  chrome: 0xc9c9c9,
  black: 0x161514,
  red: 0xb3202b,
  rosewood: 0x3b2418,
};

// Bake quality: the room is rendered offline into a still, so the page that
// does the bake calls setBakeQuality(true) before building anything. Every
// expensive upgrade (tessellation, texture size, extra detail, physical
// materials) is gated on it, so the runtime path builds what it always did.
let bakeOn = false;
export function setBakeQuality(on: boolean): void {
  bakeOn = on;
}
export function bakeQuality(): boolean {
  return bakeOn;
}
/** `rt` at runtime, `bake` when baking. */
export function bq<T>(rt: T, bake: T): T {
  return bakeOn ? bake : rt;
}
/** A segment count: as given at runtime, finer when baking. */
export function sg(n: number): number {
  if (!bakeOn) return n;
  return Math.min(256, n <= 2 ? n * 3 : Math.round(n * 2.5));
}

// Baked canvases are drawn at this multiple of their nominal size, with the
// 2D context scaled so the drawing code does not change (4096 px at most).
function canvasScale(w: number, h: number) {
  if (!bakeOn) return 1;
  return Math.max(1, Math.min(2, 4096 / Math.max(w, h)));
}

// A tiny deterministic generator (mulberry32), for seeded jitter and wear.
export function rng(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bake only: nudge an object by a hair (metres / radians), deterministically. */
export function jitter<T extends THREE.Object3D>(o: T, seed: number, pos = 0.0004, rot = 0.012): T {
  if (!bakeOn) return o;
  const r = rng(seed);
  o.position.x += (r() - 0.5) * 2 * pos;
  o.position.z += (r() - 0.5) * 2 * pos;
  o.rotation.y += (r() - 0.5) * 2 * rot;
  return o;
}

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const k = canvasScale(w, h);
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const g0 = c.getContext('2d')!;
  if (k !== 1) g0.scale(k, k);
  draw(g0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

// Anisotropic filtering for every texture made after this call: the GPU's
// limit, capped at 8. The room sets it once, right after making the renderer.
let maxAniso = 8;
export function setMaxAnisotropy(n: number) {
  maxAniso = Math.max(1, Math.min(8, n));
}
export const anisotropy = () => maxAniso;

// Linear (non-colour) data texture from a canvas: normal and roughness maps.
// Mipmapped, repeating by default.
export function dataTexture(c: HTMLCanvasElement, wrap = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// A canvas to draw a height field or roughness map on (grey: white = high or
// rough). Plain 2D drawing, no texture yet.
export function greyCanvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const k = canvasScale(w, h);
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const g = c.getContext('2d')!;
  if (k !== 1) g.scale(k, k);
  draw(g);
  // Remembered so normalFromHeight keeps the same slopes at the finer scale.
  (c as HTMLCanvasElement & { bakeScale?: number }).bakeScale = k;
  return c;
}

// Height canvas -> tangent-space normal map (Sobel, wrapping at the edges so
// repeating maps tile). Done once on the CPU at start-up. `strength` is the
// slope per unit of grey; `blur` softens the field first (in 1-2 px passes).
export function normalFromHeight(src: HTMLCanvasElement, strength = 2, wrap = true) {
  const w = src.width;
  const h = src.height;
  const px = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const og = out.getContext('2d')!;
  const img = og.createImageData(w, h);
  const d = img.data;
  const stride = w * 4;
  const rowOf = (y: number) => (wrap ? (y + h) % h : y < 0 ? 0 : y >= h ? h - 1 : y) * stride;
  const colOf = (x: number) => (wrap ? (x + w) % w : x < 0 ? 0 : x >= w ? w - 1 : x) * 4;
  const colXm = new Int32Array(w);
  const colXp = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    colXm[x] = colOf(x - 1);
    colXp[x] = colOf(x + 1);
  }
  const s = (strength * ((src as HTMLCanvasElement & { bakeScale?: number }).bakeScale ?? 1)) / 255;
  for (let y = 0; y < h; y++) {
    const r0 = rowOf(y - 1);
    const r1 = y * stride;
    const r2 = rowOf(y + 1);
    for (let x = 0; x < w; x++) {
      const cx = x * 4;
      const xm = colXm[x];
      const xp = colXp[x];
      const dx = px[r0 + xp] + 2 * px[r1 + xp] + px[r2 + xp] - px[r0 + xm] - 2 * px[r1 + xm] - px[r2 + xm];
      const dy = px[r2 + xm] + 2 * px[r2 + cx] + px[r2 + xp] - px[r0 + xm] - 2 * px[r0 + cx] - px[r0 + xp];
      // Canvas rows run down, v runs up: +dy (rows) is -dv, so the normal's y is +dy.
      const nx = -dx * s;
      const ny = dy * s;
      const il = 0.5 / Math.sqrt(nx * nx + ny * ny + 64);
      const o = r1 + cx;
      d[o] = (nx * il + 0.5) * 255;
      d[o + 1] = (ny * il + 0.5) * 255;
      d[o + 2] = (8 * il + 0.5) * 255;
      d[o + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

// Convenience: draw a height field, get a normal-map texture back.
export function normalTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, strength = 2, wrap = true) {
  return dataTexture(normalFromHeight(greyCanvas(w, h, draw), strength, wrap), wrap);
}

export function roughTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, wrap = true) {
  return dataTexture(greyCanvas(w, h, draw), wrap);
}

// Small deterministic noise.
export function hash(a: number, b = 0) {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Oak grain detail shared by every wooden thing: a normal map (pores and
// grain lines running along x) and a roughness map (the pores are rougher
// than the lacquered fibre). Made once, used with each wood's own colour map.
let woodDetailCache: { normal: THREE.Texture; rough: THREE.Texture } | undefined;
export function woodDetail() {
  if (woodDetailCache) return woodDetailCache;
  const lines = (g: CanvasRenderingContext2D, light: boolean) => {
    for (let k = 0; k < bq(90, 170); k++) {
      g.strokeStyle = light ? `rgba(0 0 0 / ${0.12 + ((k * 11) % 9) / 40})` : `rgba(255 255 255 / ${0.2 + ((k * 11) % 9) / 30})`;
      g.lineWidth = 1 + (k % 2);
      const y = bakeOn ? hash(k, 4) * 512 : (k * 47) % 512;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(170, y + 8, 340, y - 8, 512, y + 4);
      g.stroke();
    }
    // Pores: short dashes along the grain.
    for (let k = 0; k < bq(1400, 5200); k++) {
      g.strokeStyle = light ? 'rgba(0 0 0 / 0.22)' : 'rgba(255 255 255 / 0.35)';
      g.lineWidth = 1;
      const x = hash(k, 1) * 512;
      const y = hash(k, 2) * 512;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 3 + hash(k, 3) * 12, y);
      g.stroke();
    }
  };
  const normal = normalTexture(
    512,
    512,
    (g) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, 512, 512);
      lines(g, true);
    },
    1.6,
  );
  // Roughness: the product with the material's own value, so it runs
  // 0.65-1.0 of it: dark grain lines are the rough bits.
  const rough = roughTexture(512, 512, (g) => {
    g.fillStyle = '#b8b8b8';
    g.fillRect(0, 0, 512, 512);
    g.globalCompositeOperation = 'lighter';
    lines(g, false);
  });
  return (woodDetailCache = { normal, rough });
}

// Material parameters that give a standard wood its grain relief.
export function woodParams(normalScale = 0.5): THREE.MeshStandardMaterialParameters {
  const d = woodDetail();
  return { normalMap: d.normal, normalScale: new THREE.Vector2(normalScale, normalScale), roughnessMap: d.rough };
}

// Fine brushing for anodised or spun aluminium: hair-thin streaks running
// down the canvas (the v direction), as a normal map and a roughness map.
// One pair, made once; give each material its own repeat via brushedParams.
let brushedCache: { nc: HTMLCanvasElement; rc: HTMLCanvasElement } | undefined;
export function brushedParams(rx: number, ry: number, strength = 0.35, rough = 1): THREE.MeshStandardMaterialParameters {
  if (!brushedCache) {
    const streaks = (g: CanvasRenderingContext2D, light: boolean) => {
      for (let k = 0; k < bq(520, 2400); k++) {
        const x = hash(k, 7) * 256;
        const y = hash(k, 8) * 256;
        const l = 20 + hash(k, 9) * 120;
        const v = Math.round(hash(k, 10) * 255);
        g.strokeStyle = light ? `rgba(${v} ${v} ${v} / 0.5)` : `rgba(${v} ${v} ${v} / 0.28)`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (hash(k, 11) - 0.5) * 2, y + l);
        // Wrapped copy, so the tile has no seam.
        g.moveTo(x, y - 256);
        g.lineTo(x + (hash(k, 11) - 0.5) * 2, y - 256 + l);
        g.stroke();
      }
    };
    brushedCache = {
      nc: normalFromHeight(
        greyCanvas(256, 256, (g) => {
          g.fillStyle = '#808080';
          g.fillRect(0, 0, 256, 256);
          streaks(g, true);
        }),
        1.4,
      ),
      rc: greyCanvas(256, 256, (g) => {
        g.fillStyle = '#d0d0d0';
        g.fillRect(0, 0, 256, 256);
        streaks(g, false);
      }),
    };
  }
  const normalMap = dataTexture(brushedCache.nc);
  const roughnessMap = dataTexture(brushedCache.rc);
  for (const t of [normalMap, roughnessMap]) t.repeat.set(rx, ry);
  return { normalMap, normalScale: new THREE.Vector2(strength, strength), roughnessMap, roughness: rough };
}

// A woven cloth height field: over-under threads in a tile of `n` x `n`
// threads, drawn at `px` pixels a tile. Shared by every fabric.
export function weaveHeight(g: CanvasRenderingContext2D, px: number, n: number) {
  const t = px / n;
  g.fillStyle = '#404040';
  g.fillRect(0, 0, px, px);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const over = (i + j) % 2 === 0;
      const x = i * t;
      const y = j * t;
      // A thread is a rounded bump: horizontal where it is on top, vertical where it is not.
      const gr = over ? g.createLinearGradient(0, y, 0, y + t) : g.createLinearGradient(x, 0, x + t, 0);
      const lo = over ? 'rgb(120 120 120)' : 'rgb(100 100 100)';
      const hi = over ? 'rgb(230 230 230)' : 'rgb(210 210 210)';
      gr.addColorStop(0, lo);
      gr.addColorStop(0.5, hi);
      gr.addColorStop(1, lo);
      g.fillStyle = gr;
      g.fillRect(x, y, t, t);
    }
  }
}

// Fine wood grain on a base colour, running along x.
const grainCache = new Map<string, THREE.Texture>();
export function grainTexture(base: string, lines = 90) {
  lines = bq(lines, lines * 2);
  const key = `${base}:${lines}`;
  const hit = grainCache.get(key);
  if (hit) return hit;
  const t = canvasTexture(512, 512, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    for (let k = 0; k < lines; k++) {
      g.strokeStyle = `rgba(120 80 40 / ${0.05 + ((k * 11) % 9) / 120})`;
      g.lineWidth = 1 + (k % 2);
      const y = (k * 47) % 512;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(170, y + 8, 340, y - 8, 512, y + 4);
      g.stroke();
    }
  });
  grainCache.set(key, t);
  return t;
}

// Bake only: a faint, tiling roughness mottling (fingerprints, uneven wear)
// that every plain material picks up, so no surface is a flat CG constant.
let mottleCache: THREE.Texture | undefined;
export function mottleMap() {
  return mottle();
}
function mottle() {
  return (mottleCache ??= dataTexture(
    greyCanvas(512, 512, (g) => {
      g.fillStyle = '#e6e6e6';
      g.fillRect(0, 0, 512, 512);
      for (let k = 0; k < 260; k++) {
        const x = hash(k, 91) * 512;
        const y = hash(k, 92) * 512;
        const r = 10 + hash(k, 93) * 46;
        const v = Math.round(150 + hash(k, 94) * 105);
        for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
          const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          gr.addColorStop(0, `rgba(${v} ${v} ${v} / 0.5)`);
          gr.addColorStop(1, `rgba(${v} ${v} ${v} / 0)`);
          g.fillStyle = gr;
          g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
      }
    }),
  ));
}

/**
 * Bake only: keep a plain colour physically plausible. Nothing in the real
 * world reflects more than ~0.85 of the light in any channel (fresh white
 * paint, paper) and even black rubber and felt sit near 0.03; the path tracer
 * shows it when a surface is brighter or darker than that. Dielectrics only.
 */
export function plausibleAlbedo(hex: number, metalness = 0): number {
  if (metalness > 0.3 || hex === 0) return hex;
  const c = new THREE.Color(hex); // linear
  const hi = Math.max(c.r, c.g, c.b);
  if (hi > 0.85) c.multiplyScalar(0.85 / hi);
  else if (hi < 0.03) c.multiplyScalar(0.03 / hi);
  else return hex;
  return c.getHex();
}

export const std = (color: number, roughness = 0.8, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) => {
  if (!bakeOn) return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  // Textured / vertex-coloured materials carry their own albedo; plain ones are clamped.
  if (!extra.map && !extra.vertexColors && !extra.emissiveMap && !(extra.emissive && extra.emissiveIntensity)) color = plausibleAlbedo(color, metalness);
  const p: THREE.MeshPhysicalMaterialParameters = { color, roughness, metalness, ...extra };
  if (!p.roughnessMap && !p.transparent && roughness >= 0.12) {
    p.roughnessMap = mottle();
    // The map multiplies the value (it averages about 0.85): keep the mean.
    p.roughness = Math.min(1, roughness / 0.85);
  }
  // Glossy non-metals (lacquer, glazed plastic) get a thin clear layer.
  if (p.clearcoat === undefined && !p.transparent && metalness < 0.3 && roughness <= 0.4 && roughness > 0.05) {
    p.clearcoat = 0.45;
    p.clearcoatRoughness = 0.08;
  }
  return new THREE.MeshPhysicalMaterial(p);
};

/** A small slotted screw head facing +z at the origin; rotate and place it. */
export function screw(r: number, mat: THREE.Material, seed = 0) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, r * 0.5, sg(14)), mat);
  head.rotation.x = Math.PI / 2;
  head.castShadow = true;
  g.add(head);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(r * 1.5, r * 0.22, r * 0.2), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 }));
  slot.position.z = r * 0.22;
  slot.rotation.z = hash(seed, 5) * Math.PI;
  g.add(slot);
  return g;
}

/** A cable: a smooth tube through the points. */
export function cable(points: THREE.Vector3[], r: number, mat: THREE.Material) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, points.length * 16), r, bq(8, 20), false), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], shadows = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

export function box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], r = 0) {
  return mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, sg(3), r) : new THREE.BoxGeometry(w, h, d), mat);
}

export function cyl(rt: number, rb: number, h: number, mat: THREE.Material, seg = 32) {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, sg(seg)), mat);
}

export { THREE, RoundedBoxGeometry };
