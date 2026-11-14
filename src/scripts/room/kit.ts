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

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
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
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return c;
}

// Height canvas -> tangent-space normal map (Sobel, wrapping at the edges so
// repeating maps tile). Done once on the CPU at start-up. `strength` is the
// slope per unit of grey; `blur` softens the field first (in 1-2 px passes).
export function normalFromHeight(src: HTMLCanvasElement, strength = 2, wrap = true) {
  const w = src.width;
  const h = src.height;
  const px = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const hf = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) hf[i] = px[i * 4] / 255;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const og = out.getContext('2d')!;
  const img = og.createImageData(w, h);
  const d = img.data;
  const rowOf = (y: number) => (wrap ? (y + h) % h : y < 0 ? 0 : y >= h ? h - 1 : y) * w;
  const colOf = (x: number) => (wrap ? (x + w) % w : x < 0 ? 0 : x >= w ? w - 1 : x);
  for (let y = 0; y < h; y++) {
    const r0 = rowOf(y - 1);
    const r1 = y * w;
    const r2 = rowOf(y + 1);
    for (let x = 0; x < w; x++) {
      const xm = colOf(x - 1);
      const xp = colOf(x + 1);
      const dx = hf[r0 + xp] + 2 * hf[r1 + xp] + hf[r2 + xp] - hf[r0 + xm] - 2 * hf[r1 + xm] - hf[r2 + xm];
      const dy = hf[r2 + xm] + 2 * hf[r2 + x] + hf[r2 + xp] - hf[r0 + xm] - 2 * hf[r0 + x] - hf[r0 + xp];
      // Canvas rows run down, v runs up: +dy (rows) is -dv, so the normal's y is +dy.
      const nx = -dx * strength;
      const ny = dy * strength;
      const il = 0.5 / Math.sqrt(nx * nx + ny * ny + 64);
      const o = (r1 + x) * 4;
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
    for (let k = 0; k < 90; k++) {
      g.strokeStyle = light ? `rgba(0 0 0 / ${0.12 + ((k * 11) % 9) / 40})` : `rgba(255 255 255 / ${0.2 + ((k * 11) % 9) / 30})`;
      g.lineWidth = 1 + (k % 2);
      const y = (k * 47) % 512;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(170, y + 8, 340, y - 8, 512, y + 4);
      g.stroke();
    }
    // Pores: short dashes along the grain.
    for (let k = 0; k < 1400; k++) {
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
      for (let k = 0; k < 520; k++) {
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
export function grainTexture(base: string, lines = 90) {
  return canvasTexture(512, 512, (g) => {
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
}

export const std = (color: number, roughness = 0.8, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], shadows = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

export function box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], r = 0) {
  return mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d), mat);
}

export function cyl(rt: number, rb: number, h: number, mat: THREE.Material, seg = 32) {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
}

export { THREE, RoundedBoxGeometry };
