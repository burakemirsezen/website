// Shared by the bake (scripts/blender/render_master.py) and the live room (plate-room.ts):
// the on-disk format of the baked lighting probe.
//
// The probe is an equirect HDR image of the room as seen from the turntable.
// It is stored as an ordinary opaque PNG (no alpha, so nothing is premultiplied
// and every byte survives a canvas round trip):
//
//   PNG size  : w x 2h
//   top half  : RGB mantissa, c / peak, 8 bit per channel (zenith at the top)
//   bottom    : peak, as a 16 bit log2 value, R = high byte, G = low byte
//
//   peak = max * 2^( m16 / 65535 * LOG_RANGE - LOG_RANGE )     (max = json.max)
//   rgb  = mantissa * peak
//
// Row order of the decoded texture matches an equirect DataTexture with
// flipY = false (row 0 is straight down), which is also what the path tracer's
// EquirectCamera produces.
//
// This module must stay free of heavy imports: it ships in the site bundle.
import * as THREE from 'three';

export const PROBE_VERSION = 1;
export const LOG_RANGE = 20;

export interface ProbeSunJson {
  /** Unit vector from the probe towards the sun. */
  dir: [number, number, number];
  /** Sun colour, '#rrggbb'. */
  color: string;
  /** Luminance of the direct light's irradiance (what the plate was lit with); colour is normalised to luminance 1. */
  intensity: number;
  /** 0..1: fraction of the (soft) sun disc that reaches the platter. */
  vis: number;
}

export interface ShadowJson {
  /** File name next to the json (grayscale PNG, value = how dark: 0 none, 255 black). */
  file: string;
  /** World-space rectangle the map covers (image top = z0, left = x0). */
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** World height of the receiving plane. */
  y: number;
  size: number;
}

export interface ProbeJson {
  version: number;
  mood: 'day' | 'night';
  file: string;
  encoding: 'logpeak-rgb-png';
  width: number;
  height: number;
  /** Largest value the image can hold (linear radiance). */
  max: number;
  /** Where the probe was rendered from (world space). */
  position: [number, number, number];
  /**
   * The plate's exposure multiplier (2^ev, what its tone pass applied; = meta.bake.exposure). The
   * stored radiance is pre-exposure: the live renderer applies this itself via toneMappingExposure.
   */
  exposure?: number;
  /** White balance gain of this mood, already multiplied into the probe's pixels (the key light needs it applied at runtime). */
  wbGain?: [number, number, number];
  sun?: ProbeSunJson | null;
  shadow?: ShadowJson | null;
  spp?: number;
}

/** Bake side: linear float RGBA (row 0 = bottom, as read from a render target) -> PNG blob. */
export async function encodeProbePng(rgba: Float32Array, w: number, h: number, peakMax: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h * 2;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h * 2);
  const d = img.data;
  const floor = peakMax * Math.pow(2, -LOG_RANGE);
  for (let j = 0; j < h; j++) {
    const row = h - 1 - j; // file row for GL row j (zenith on top)
    for (let i = 0; i < w; i++) {
      const s = (j * w + i) * 4;
      const r = Math.max(rgba[s], 0);
      const g = Math.max(rgba[s + 1], 0);
      const b = Math.max(rgba[s + 2], 0);
      const mx = Math.max(r, g, b);
      let m16 = 0;
      if (mx > floor) m16 = Math.round(65535 * Math.min(Math.max((Math.log2(mx / peakMax) + LOG_RANGE) / LOG_RANGE, 0), 1));
      const peak = peakMax * Math.pow(2, (m16 / 65535) * LOG_RANGE - LOG_RANGE);
      const inv = mx > floor ? 1 / peak : 0;
      const o = (row * w + i) * 4;
      d[o] = Math.min(255, Math.round(r * inv * 255));
      d[o + 1] = Math.min(255, Math.round(g * inv * 255));
      d[o + 2] = Math.min(255, Math.round(b * inv * 255));
      d[o + 3] = 255;
      const o2 = ((row + h) * w + i) * 4;
      d[o2] = m16 >> 8;
      d[o2 + 1] = m16 & 255;
      d[o2 + 2] = 0;
      d[o2 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
}

/** Bake side: 8 bit gray image (row 0 = bottom GL row) -> PNG blob. */
export async function encodeGrayPng(gray: Uint8Array, w: number, h: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    const row = h - 1 - j;
    for (let i = 0; i < w; i++) {
      const v = gray[j * w + i];
      const o = (row * w + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
}

async function loadBitmap(url: string): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    const blob = await (await fetch(url)).blob();
    if (typeof createImageBitmap === 'function') {
      return await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    }
  } catch {
    // fall through to <img>
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('probe image failed to load'));
    img.src = url;
  });
}

/** Runtime: decode the probe PNG into a half-float equirect texture (not yet uploaded). */
export async function decodeProbeTexture(url: string, meta: ProbeJson): Promise<THREE.DataTexture> {
  const bmp = await loadBitmap(url);
  const w = bmp.width;
  const h = Math.floor(bmp.height / 2);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h * 2;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  (bmp as ImageBitmap).close?.();
  const px = ctx.getImageData(0, 0, w, h * 2).data;
  const out = new Uint16Array(w * h * 4);
  const one = THREE.DataUtils.toHalfFloat(1);
  const toH = THREE.DataUtils.toHalfFloat;
  for (let j = 0; j < h; j++) {
    const row = h - 1 - j;
    for (let i = 0; i < w; i++) {
      const o = (row * w + i) * 4;
      const o2 = ((row + h) * w + i) * 4;
      const m16 = (px[o2] << 8) | px[o2 + 1];
      const peak = meta.max * Math.pow(2, (m16 / 65535) * LOG_RANGE - LOG_RANGE);
      const k = (j * w + i) * 4;
      const s = peak / 255;
      out[k] = toH(px[o] * s);
      out[k + 1] = toH(px[o + 1] * s);
      out[k + 2] = toH(px[o + 2] * s);
      out[k + 3] = one;
    }
  }
  const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}
