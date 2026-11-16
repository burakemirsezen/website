import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { THREE, std, mesh, RoundedBoxGeometry, setMaxAnisotropy } from './kit';
import { buildTurntable, prewarmTurntableTextures, type Turntable } from './turntable';
import { buildGuitar } from './guitar';
import { buildAmp } from './amp';
import { buildInterface } from './interface';
import { buildSpeaker } from './speakers';
import { music } from '../../data/site';
import { decodeProbeTexture, type ProbeJson } from './plate-probe-codec';
import type { AsyncRoomOptions, RoomGear, RoomOptions, RoomRecord, RoomTrack } from './room-types';

export interface PlateGearBox {
  min: [number, number, number];
  max: [number, number, number];
  tipAnchor: [number, number, number];
}

export interface PlateGearMeta {
  id?: string;
  min: [number, number, number];
  max: [number, number, number];
  tipAnchor: [number, number, number];
  dotAt?: [number, number, number];
  boxes?: PlateGearBox[];
}

export interface PlateBakeLight {
  /** Unit vector towards the sun / moon (scene space). */
  toLight: [number, number, number];
  /** Direct irradiance per channel in scene units (colour and strength in one). */
  irradiance: [number, number, number];
  source?: string;
}

export interface PlateBakeMeta {
  /** Plain multiplier (2^ev) the plate's tone pass applied before the tone curve; = renderer.toneMappingExposure. */
  exposure?: number;
  wbGain?: { day?: [number, number, number]; night?: [number, number, number] };
  light?: { day?: PlateBakeLight; night?: PlateBakeLight };
}

export interface PlateMeta {
  width: number;
  height: number;
  eye: [number, number, number];
  target: [number, number, number];
  fov: number;
  dayHour?: number;
  /** meta.bake.tonemap of the plate ('agx' | 'aces' | 'neutral'); undefined = ACES (plates baked before it was recorded). */
  tonemap?: string;
  /** meta.bake: what the live overlay needs to match the plate's tone pass (written by scripts/bake-plates.mjs). */
  bake?: PlateBakeMeta;
  gear: Record<string, PlateGearMeta>;
  /** Responsive plate files (urls already resolved to bundled assets), sorted by width. */
  variants?: PlateVariants;
}

export interface PlateVariant {
  w: number;
  h: number;
  avif?: string;
  webp?: string;
}

export interface PlateVariants {
  day: PlateVariant[];
  night: PlateVariant[];
}

export interface PlateRoomHandle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  dispose: () => void;
  play: (i?: number) => Promise<void>;
  stop: () => Promise<void>;
  flip: (toSide?: 'A' | 'B') => Promise<void>;
  setPlayGate: (gate: () => Promise<unknown>) => void;
  seek: (i: number, sec: number) => { x: number; y: number; z: number; q: [number, number, number, number] };
  hasPlate: boolean;
}

const PLATE_ASSETS = import.meta.glob('../../assets/bake/plate-*', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const PROBE_ASSETS = import.meta.glob('../../assets/bake/probe-*', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const SHADOW_ASSETS = import.meta.glob('../../assets/bake/shadow-*', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function findAsset(list: Record<string, string>, filename: string): string | undefined {
  for (const [key, url] of Object.entries(list)) {
    if (key.endsWith(`/${filename}`) || key.endsWith(`\\${filename}`)) return url;
  }
  return undefined;
}

function findPlateAsset(filename: string): string | undefined {
  for (const [key, url] of Object.entries(PLATE_ASSETS)) {
    if (key.endsWith(`/${filename}`) || key.endsWith(`\\${filename}`)) return url;
  }
  return undefined;
}

const PLATE_DAY_URL = findPlateAsset('plate-day.webp');
const PLATE_NIGHT_URL = findPlateAsset('plate-night.webp');
const PLATE_META_URL = findPlateAsset('plate-meta.json');

function parseVariants(raw: unknown): PlateVariants | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const one = (k: string): PlateVariant[] => {
    const arr = r[k];
    if (!Array.isArray(arr)) return [];
    const out: PlateVariant[] = [];
    for (const it of arr) {
      if (!it || typeof it !== 'object') continue;
      const v = it as Record<string, unknown>;
      const w = Number(v.w);
      const h = Number(v.h);
      const avif = typeof v.avif === 'string' ? findPlateAsset(v.avif) : undefined;
      const webp = typeof v.webp === 'string' ? findPlateAsset(v.webp) : undefined;
      if (!(w > 0) || (!avif && !webp)) continue;
      out.push({ w, h: h > 0 ? h : Math.round((w * 9) / 16), avif, webp });
    }
    return out.sort((a, b) => a.w - b.w);
  };
  const day = one('day');
  const night = one('night');
  return day.length || night.length ? { day, night } : undefined;
}

// One-time AVIF decode feature test (failure just means WebP is used).
const AVIF_PROBE =
  'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
let avifSupport: boolean | undefined;
let avifProbe: Promise<boolean> | undefined;
function detectAvif(): Promise<boolean> {
  avifProbe ??= new Promise<boolean>((resolve) => {
    const img = new Image();
    const done = (ok: boolean) => {
      avifSupport = ok;
      resolve(ok);
    };
    img.onload = () => done(img.width > 0 && img.height > 0);
    img.onerror = () => done(false);
    img.src = AVIF_PROBE;
  });
  return avifProbe;
}

function variantUrl(v: PlateVariant, avif: boolean): string | undefined {
  return (avif ? v.avif : undefined) ?? v.webp;
}

/** Smallest usable variant >= needW, else the largest usable one. */
function pickVariant(list: PlateVariant[], needW: number, avif: boolean): PlateVariant | undefined {
  const usable = list.filter((v) => variantUrl(v, avif));
  return usable.find((v) => v.w >= needW) ?? usable[usable.length - 1];
}

function loadDecoded(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    const ok = () => resolve(img.naturalWidth > 0 ? img : null);
    if (typeof img.decode === 'function') img.decode().then(ok, () => resolve(null));
    else {
      img.onload = ok;
      img.onerror = () => resolve(null);
    }
  });
}

// Baked probes (probe-*.png, written by render_master.py): with one, the live turntable parts are lit by the plate's own
// global illumination, so the rig of cheap realtime lights is turned down to what a probe cannot
// give (the moving sun shadow). PROBE_HEMI is the hemisphere fill that stays (0 = none).
const PROBE_HEMI = 0;
const PROBE_ENV_GAIN = 1;
const PLATE_FADE_MS = 800;
const PLATE_PX_BUDGET = 4_200_000; // overlay canvas backing-store pixel budget

const ROOM_W = 3.6;
const ROOM_H = 2.7;
const ROOM_D = 3.6;
const BACK = -ROOM_D / 2;
const LEFT = -ROOM_W / 2;
const WIN = { z0: -1.55, z1: -0.4, y0: 0.86, y1: 2.28 };
const WIN_MID = (WIN.z0 + WIN.z1) / 2;
const BOARD = { x: 0.14, w: 1.62, d: 0.42, h: 0.6 };
const BOARD_Z = BACK + 0.02 + BOARD.d / 2;

const LEDGE_POS: [number, number, number] = [BOARD.x, 1.36, BACK];
const LEDGE_LEN = 1.95;
const SLEEVE_SIZE = 0.315;
const SLEEVE_GAP = 0.07;
const SLEEVE_ROT_Y = [0.015, -0.01, 0.012, -0.018];

const TT_W = 0.366;
const TT_D = 0.356;
const TT_TOP = 0.058;
const TT_PX = -0.022;
const TT_PZ = -0.004;
const TT_PLATTER_TOP = TT_TOP + 0.014;

interface DayLight {
  sun: string;
  sunI: number;
  y: number;
  skyI: number;
}

const DAY_KEYS: [number, DayLight][] = [
  [6, { sun: '#ffb894', sunI: 2.6, y: -0.3, skyI: 2.6 }],
  [9, { sun: '#ffe2b8', sunI: 3.8, y: -0.75, skyI: 4.2 }],
  [13, { sun: '#fff0d8', sunI: 4.0, y: -0.95, skyI: 4.4 }],
  [17, { sun: '#ffc485', sunI: 4.6, y: -0.58, skyI: 4 }],
  [19.5, { sun: '#ff9f6a', sunI: 3.2, y: -0.24, skyI: 2.6 }],
  [21, { sun: '#9aa6d0', sunI: 1.2, y: -0.2, skyI: 1.2 }],
];

function zurichHour(): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Zurich',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return n('hour') + n('minute') / 60;
  } catch {
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  }
}

function daylight(hour: number): DayLight {
  const h = Math.min(Math.max(hour, DAY_KEYS[0][0]), DAY_KEYS[DAY_KEYS.length - 1][0]);
  let i = 0;
  while (i < DAY_KEYS.length - 2 && h > DAY_KEYS[i + 1][0]) i++;
  const [h0, a] = DAY_KEYS[i];
  const [h1, b] = DAY_KEYS[i + 1];
  const t = (h - h0) / (h1 - h0);
  const mix = (x: string, y: string) => '#' + new THREE.Color(x).lerp(new THREE.Color(y), t).getHexString();
  const num = (x: number, y: number) => x + (y - x) * t;
  return {
    sun: mix(a.sun, b.sun),
    sunI: num(a.sunI, b.sunI),
    y: num(a.y, b.y),
    skyI: num(a.skyI, b.skyI),
  };
}

const DEFAULT_META: PlateMeta = {
  width: 2560,
  height: 1440,
  eye: [0.3, 1.16, 2.45],
  target: [-0.04, 0.86, -1.3],
  fov: 37,
  dayHour: 15,
  gear: {
    guitar: {
      min: [-1.29, -0.02, -1.74],
      max: [-0.73, 1.11, -1.1],
      tipAnchor: [-1.01, 1.09, -1.42],
      dotAt: [-1.01, 0.31, -1.42],
    },
    amp: {
      min: [-0.83, -0.01, -1.15],
      max: [-0.53, 0.21, -0.89],
      tipAnchor: [-0.68, 0.19, -1.02],
      dotAt: [-0.68, 0.15, -1.02],
    },
    interface: {
      min: [0.4, 0.58, -1.6],
      max: [0.6, 0.66, -1.43],
      tipAnchor: [0.5, 0.64, -1.51],
      dotAt: [0.5, 0.63, -1.51],
    },
    turntable: {
      min: [-0.15, 0.58, -1.79],
      max: [0.27, 1.04, -1.33],
      tipAnchor: [0.06, 1.02, -1.56],
      dotAt: [0.06, 0.7, -1.56],
    },
    speakers: {
      min: [-0.63, 0.58, -1.71],
      max: [-0.41, 0.86, -1.45],
      tipAnchor: [-0.52, 0.84, -1.58],
      dotAt: [-0.52, 0.8, -1.58],
      boxes: [
        { min: [-0.63, 0.58, -1.71], max: [-0.41, 0.86, -1.45], tipAnchor: [-0.52, 0.84, -1.58] },
        { min: [0.68, 0.58, -1.73], max: [0.9, 0.86, -1.41], tipAnchor: [0.79, 0.84, -1.57] },
      ],
    },
  },
};

function normalizeMeta(raw: unknown): PlateMeta {
  if (!raw || typeof raw !== 'object') return DEFAULT_META;
  const obj = raw as Record<string, unknown>;
  const gearOut: Record<string, PlateGearMeta> = { ...DEFAULT_META.gear };
  const rawGear = obj.gear;

  if (Array.isArray(rawGear)) {
    const grouped: Record<string, PlateGearMeta> = {};
    for (const rawItem of rawGear) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      const item = rawItem as Record<string, unknown>;
      const key =
        typeof item.key === 'string'
          ? item.key
          : typeof item.id === 'string'
            ? item.id
            : undefined;
      const min = Array.isArray(item.boxMin)
        ? (item.boxMin as [number, number, number])
        : Array.isArray(item.min)
          ? (item.min as [number, number, number])
          : undefined;
      const max = Array.isArray(item.boxMax)
        ? (item.boxMax as [number, number, number])
        : Array.isArray(item.max)
          ? (item.max as [number, number, number])
          : undefined;
      if (!key || !min || !max) continue;

      const tipAnchor = Array.isArray(item.tipAnchor)
        ? (item.tipAnchor as [number, number, number])
        : ([
            (min[0] + max[0]) / 2,
            max[1],
            (min[2] + max[2]) / 2,
          ] as [number, number, number]);
      const dotAt = Array.isArray(item.dotAt)
        ? (item.dotAt as [number, number, number])
        : undefined;
      const boxEntry: PlateGearBox = { min, max, tipAnchor };
      const existing = grouped[key];
      if (existing) {
        existing.boxes = [...(existing.boxes ?? []), boxEntry];
        if (dotAt) existing.dotAt = dotAt;
      } else {
        grouped[key] = {
          id: key,
          min,
          max,
          tipAnchor,
          dotAt: dotAt ?? DEFAULT_META.gear[key]?.dotAt,
          boxes: [boxEntry],
        };
      }
    }
    for (const [k, v] of Object.entries(grouped)) {
      gearOut[k] = v;
    }
  } else if (rawGear && typeof rawGear === 'object') {
    for (const [k, v] of Object.entries(rawGear as Record<string, PlateGearMeta>)) {
      if (v && Array.isArray(v.min) && Array.isArray(v.max)) {
        gearOut[k] = {
          ...v,
          boxes: v.boxes ?? [{ min: v.min, max: v.max, tipAnchor: v.tipAnchor }],
        };
      }
    }
  }

  return {
    width: typeof obj.width === 'number' ? obj.width : DEFAULT_META.width,
    height: typeof obj.height === 'number' ? obj.height : DEFAULT_META.height,
    eye: Array.isArray(obj.eye) && obj.eye.length === 3 ? (obj.eye as [number, number, number]) : DEFAULT_META.eye,
    target:
      Array.isArray(obj.target) && obj.target.length === 3
        ? (obj.target as [number, number, number])
        : DEFAULT_META.target,
    fov: typeof obj.fov === 'number' ? obj.fov : DEFAULT_META.fov,
    dayHour: typeof obj.dayHour === 'number' ? obj.dayHour : DEFAULT_META.dayHour,
    tonemap:
      obj.bake && typeof obj.bake === 'object' && typeof (obj.bake as Record<string, unknown>).tonemap === 'string'
        ? String((obj.bake as Record<string, unknown>).tonemap).toLowerCase()
        : undefined,
    bake: parseBake(obj.bake),
    gear: gearOut,
    variants: parseVariants(obj.variants),
  };
}

const vec3Of = (v: unknown): [number, number, number] | undefined =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x))
    ? [v[0] as number, v[1] as number, v[2] as number]
    : undefined;

function parseBake(raw: unknown): PlateBakeMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const b = raw as Record<string, unknown>;
  const out: PlateBakeMeta = {};
  if (typeof b.exposure === 'number' && b.exposure > 0) out.exposure = b.exposure;
  if (b.wbGain && typeof b.wbGain === 'object') {
    const g = b.wbGain as Record<string, unknown>;
    out.wbGain = { day: vec3Of(g.day), night: vec3Of(g.night) };
  }
  if (b.light && typeof b.light === 'object') {
    const l = b.light as Record<string, unknown>;
    const one = (v: unknown): PlateBakeLight | undefined => {
      if (!v || typeof v !== 'object') return undefined;
      const o = v as Record<string, unknown>;
      const toLight = vec3Of(o.toLight);
      const irradiance = vec3Of(o.irradiance);
      return toLight && irradiance ? { toLight, irradiance, source: typeof o.source === 'string' ? o.source : undefined } : undefined;
    };
    out.light = { day: one(l.day), night: one(l.night) };
  }
  return out;
}

function buildProxyEnv(renderer: THREE.WebGLRenderer, night: boolean): THREE.WebGLRenderTarget {
  const envScene = new THREE.Scene();
  const wallColor = night ? 0x26201a : 0xd9cfc2;
  const sideColor = night ? 0x201b16 : 0xcbc2b6;
  const ceilColor = night ? 0x1d1915 : 0xe4ddd2;
  const floorColor = night ? 0x2c2015 : 0x9b764e;

  const mats = [
    new THREE.MeshBasicMaterial({ color: sideColor, side: THREE.BackSide }),
    new THREE.MeshBasicMaterial({ color: night ? 0x1b1a1e : 0xdde5ef, side: THREE.BackSide }),
    new THREE.MeshBasicMaterial({ color: ceilColor, side: THREE.BackSide }),
    new THREE.MeshBasicMaterial({ color: floorColor, side: THREE.BackSide }),
    new THREE.MeshBasicMaterial({ color: wallColor, side: THREE.BackSide }),
    new THREE.MeshBasicMaterial({ color: wallColor, side: THREE.BackSide }),
  ];

  // 12 triangles (room box) + 2 triangles (window opening) = 14 triangles total
  const boxGeo = new THREE.BoxGeometry(ROOM_W, ROOM_H, ROOM_D);
  const roomBox = new THREE.Mesh(boxGeo, mats);
  roomBox.position.set(0, ROOM_H / 2, 0);
  envScene.add(roomBox);

  const winGeo = new THREE.PlaneGeometry(WIN.z1 - WIN.z0, WIN.y1 - WIN.y0);
  const winMat = new THREE.MeshBasicMaterial({
    color: night ? 0x2b3648 : 0xfff8ee,
    side: THREE.DoubleSide,
  });
  const winMesh = new THREE.Mesh(winGeo, winMat);
  winMesh.position.set(LEFT + 0.01, (WIN.y0 + WIN.y1) / 2, WIN_MID);
  winMesh.rotation.y = Math.PI / 2;
  envScene.add(winMesh);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.04, 0.05, 20, { size: 128 });

  boxGeo.dispose();
  for (const m of mats) m.dispose();
  winGeo.dispose();
  winMat.dispose();
  pmrem.dispose();
  return rt;
}

function recordCoverFallbackTexture(label: string, idx: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const palette = ['#b85d3b', '#3b6478', '#687353', '#8b6844'];
  ctx.fillStyle = palette[idx % palette.length];
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(255,250,242,0.88)';
  ctx.font = '600 18px system-ui, sans-serif';
  ctx.fillText(label.slice(0, 22), 20, 44);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function placeGeo(geo: THREE.BufferGeometry, pos: [number, number, number], rot?: [number, number, number]) {
  const q = rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)) : new THREE.Quaternion();
  return geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), q, new THREE.Vector3(1, 1, 1)));
}

function rodGeo(a: THREE.Vector3, b: THREE.Vector3, rTop: number, rBot = rTop, seg = 16) {
  const dir = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(rTop, rBot, dir.length(), seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
}

function mergeGeos(list: THREE.BufferGeometry[]) {
  const flat = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    if (!n.getAttribute('uv')) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.getAttribute('position').count * 2), 2));
    for (const k of Object.keys(n.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    }
    n.clearGroups();
    g.dispose();
    return n;
  });
  const merged = mergeGeometries(flat, false)!;
  for (const n of flat) n.dispose();
  return merged;
}

function buildGuitarStand(guitar: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  const b = new THREE.Box3().setFromObject(guitar);
  const size = b.getSize(new THREE.Vector3());
  const L = size.y;
  const tilt = 0.2;
  const cradleY = 0.13;
  const steel = std(0x1f1d1b, 0.45, 0.6);
  const rubber = std(0x141312, 0.9);
  const steelGeos: THREE.BufferGeometry[] = [];
  const rubberGeos: THREE.BufferGeometry[] = [];
  const tube = (a: THREE.Vector3, c: THREE.Vector3, r = 0.008, isRubber = false) => {
    (isRubber ? rubberGeos : steelGeos).push(rodGeo(a, c, r, r, 12));
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const neckAt = L * 0.6;
  const yoke = V(0, cradleY + neckAt * Math.cos(tilt), 0.07 - neckAt * Math.sin(tilt) - 0.035);
  const hub = V(0, 0.2, -0.06);
  rubberGeos.push(placeGeo(new RoundedBoxGeometry(0.036, 0.042, 0.038, 3, 0.006), [hub.x, hub.y, hub.z]));
  tube(hub, V(-0.17, 0.006, 0.14));
  tube(hub, V(0.17, 0.006, 0.14));
  tube(hub, V(0, 0.006, -0.3));
  for (const x of [-0.17, 0.17]) tube(V(x, 0.006, 0.14), V(x, 0.006, 0.17), 0.012, true);
  tube(V(0, 0.006, -0.3), V(0, 0.006, -0.33), 0.012, true);
  for (const x of [-0.11, 0.11]) {
    const elbow = V(x, cradleY, 0.05);
    tube(hub, elbow);
    tube(hub.clone().lerp(elbow, 0.55), elbow, 0.013, true);
    tube(V(x, cradleY - 0.01, 0.04), V(x, cradleY + 0.04, 0.09), 0.0135, true);
    tube(V(x, cradleY + 0.012, 0.062), V(x, cradleY + 0.038, 0.088), 0.0155, true);
  }
  const postTop = yoke.clone().add(V(0, -0.02, 0));
  tube(hub, postTop);
  const clamp = hub.clone().lerp(postTop, 0.55);
  tube(clamp.clone().add(V(0, -0.018, 0)), clamp.clone().add(V(0, 0.018, 0)), 0.0125, true);
  rubberGeos.push(placeGeo(new THREE.CylinderGeometry(0.0075, 0.0075, 0.014, 12), [clamp.x - 0.018, clamp.y, clamp.z], [0, 0, Math.PI / 2]));
  rubberGeos.push(placeGeo(new THREE.TorusGeometry(0.03, 0.007, 8, 16, Math.PI), [yoke.x, yoke.y + 0.01, yoke.z], [-tilt, 0, 0]));
  g.add(mesh(mergeGeos(steelGeos), steel));
  g.add(mesh(mergeGeos(rubberGeos), rubber));

  const holder = new THREE.Group();
  guitar.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  holder.add(guitar);
  holder.position.set(0, cradleY - 0.01, 0.07);
  holder.rotation.x = -tilt;
  g.add(holder);
  return g;
}

function extractMergedPositionGeometry(roots: THREE.Object3D[], exclude?: Set<THREE.Object3D>): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const r of roots) {
    r.updateMatrixWorld(true);
    r.traverse((o) => {
      if (exclude?.has(o)) return;
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.name.startsWith('led')) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (mats.every((mat) => mat.transparent)) return;
      if (!m.geometry?.attributes?.position || m.geometry.attributes.position.count === 0) return;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(g.attributes)) {
        if (k !== 'position') g.deleteAttribute(k);
      }
      g.clearGroups();
      g.applyMatrix4(m.matrixWorld);
      parts.push(g);
    });
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false) ?? null;
  for (const p of parts) p.dispose();
  return merged;
}

function disposeTempObject(root: THREE.Object3D): void {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    if (Array.isArray(m.material)) m.material.forEach((mat) => mat && mats.add(mat));
    else if (m.material) mats.add(m.material);
  });
  for (const g of geos) g.dispose();
  for (const m of mats) {
    for (const val of Object.values(m as unknown as Record<string, unknown>)) {
      if (val && typeof val === 'object' && 'isTexture' in val && (val as THREE.Texture).isTexture) {
        (val as THREE.Texture).dispose();
      }
    }
    m.dispose();
  }
}

function seat(obj: THREE.Object3D): THREE.Group {
  const wrap = new THREE.Group();
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  obj.position.x -= (b.min.x + b.max.x) / 2;
  obj.position.z -= (b.min.z + b.max.z) / 2;
  obj.position.y -= b.min.y;
  wrap.add(obj);
  return wrap;
}

function isolateDynamicTurntableParts(turntable: Turntable): void {
  const keepSubtrees = new Set<THREE.Object3D>();
  const collectSubtree = (root: THREE.Object3D) => {
    root.traverse((obj) => keepSubtrees.add(obj));
  };
  collectSubtree(turntable.spin);
  collectSubtree(turntable.arm);
  collectSubtree(turntable.lid);

  turntable.group.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(turntable.group.matrixWorld).invert();
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();

  const lidParts = new Set<THREE.Object3D>();
  turntable.lid.traverse((o) => lidParts.add(o));
  turntable.group.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;

    if (keepSubtrees.has(m)) {
      // The clear cover throws no shadow onto the record (the plate's light already passes it).
      m.castShadow = !lidParts.has(m);
      m.receiveShadow = !lidParts.has(m);
      return;
    }

    box.setFromObject(m).applyMatrix4(invRoot);
    box.getCenter(center);
    box.getSize(size);

    const isSpindle =
      Math.hypot(center.x - TT_PX, center.z - TT_PZ) < 0.025 &&
      center.y > TT_TOP &&
      size.x < 0.03 &&
      size.z < 0.03;

    const isArmRest =
      Math.hypot(center.x - 0.148, center.z - 0.04) < 0.04 &&
      center.y > 0.05 &&
      size.x < 0.06 &&
      size.z < 0.06;

    if (isSpindle || isArmRest) {
      // Render spindle & armRest for accurate depth occlusion without double-shadowing the plate.
      m.visible = true;
      m.castShadow = false;
      m.receiveShadow = false;
    } else {
      m.visible = false;
    }
  });
}

function mountCore(
  stage: HTMLElement,
  options: RoomOptions,
  initialMeta: PlateMeta,
  onReady?: () => void,
): { handle: PlateRoomHandle; applyMeta: (nextMeta: PlateMeta) => void } {
  const recordInfo: RoomRecord[] = options.records ?? music.records;
  const gearInfo: Record<string, RoomGear> =
    options.gear ?? Object.fromEntries(music.photos.map(({ id, title, text }) => [id, { title, text }]));

  const createdNodes: HTMLElement[] = [];
  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const disposableTex: THREE.Texture[] = [];
  const envTargets = new Map<'day' | 'night', THREE.WebGLRenderTarget>();

  // Baked lighting probe per mood: PMREM of the HDR the plate was lit with, and a soft shadow map
  // of the disc + arm at rest (an alpha-mapped black plane over the plinth).
  interface LiveProbe {
    json: ProbeJson;
    env: THREE.WebGLRenderTarget;
    shadow?: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; geo: THREE.BufferGeometry; tex: THREE.Texture };
  }
  const probes: { day?: LiveProbe; night?: LiveProbe } = {};
  let moodE = 0; // smoothed mood blend, 0 day .. 1 night (set by applyMoodBlend)
  let catcherBase = 0.22;

  const dark = matchMedia('(prefers-color-scheme: dark)');
  const currentNight = () => (options.mood ? options.mood === 'night' : dark.matches);

  // Background plate <img> (when baked plates exist) or clean missing-plate notice
  // Responsive variants (AVIF/WebP) with crossfade; legacy single files are the fallback.
  let variants: PlateVariants | undefined = initialMeta.variants;
  const variantsHave = (v?: PlateVariants) => Boolean(v && v.day.length && v.night.length);
  const hasPlate = Boolean((PLATE_DAY_URL && PLATE_NIGHT_URL) || variantsHave(variants));
  let plateImg: HTMLImageElement | null = null;
  let plateW = 0; // width (px) of the variant currently shown; 0 = legacy file
  let plateToken = 0;
  let plateNight: boolean | null = null;

  if (!hasPlate) {
    stage.classList.add('is-plate-missing');
    const noticeEl = document.createElement('div');
    noticeEl.className = 'room-plate-notice';
    noticeEl.innerHTML = 'Room plate not baked yet &mdash; run <code>npm run bake:plates</code>';
    stage.appendChild(noticeEl);
    createdNodes.push(noticeEl);
  }

  const plateNeedW = () => (stage.clientWidth || 1280) * Math.min(window.devicePixelRatio || 1, 2);

  /** Candidate urls (best first) for a mood, plus the width of the best variant. */
  function plateCandidates(night: boolean, minW = 0, lqip = false): { urls: string[]; w: number } {
    const legacy = night ? PLATE_NIGHT_URL : PLATE_DAY_URL;
    const list = variants ? (night ? variants.night : variants.day) : [];
    const avif = avifSupport === true;
    const v = lqip ? pickVariant(list, 0, avif) : pickVariant(list, Math.max(plateNeedW(), minW), avif);
    const urls: string[] = [];
    if (v) urls.push(variantUrl(v, avif)!);
    if (legacy) urls.push(legacy);
    return { urls, w: v?.w ?? 0 };
  }

  /** Decode, then dissolve the new plate in over the current one. Resolves once the fade has started. */
  async function showPlate(urls: string[], w: number, instant: boolean): Promise<boolean> {
    const token = ++plateToken;
    let img: HTMLImageElement | null = null;
    for (const u of urls) {
      img = await loadDecoded(u);
      if (disposed || token !== plateToken) return false;
      if (img) break;
    }
    if (!img) return false;
    img.className = 'room-plate';
    img.alt = '';
    img.draggable = false;
    const old = plateImg;
    const noFade = instant || !old;
    if (noFade) img.style.transition = 'none';
    if (old) old.after(img);
    else stage.prepend(img);
    createdNodes.push(img);
    void img.offsetWidth;
    img.classList.add('is-on');
    if (noFade) requestAnimationFrame(() => (img!.style.transition = ''));
    plateImg = img;
    plateW = w;
    if (old) window.setTimeout(() => old.remove(), instant ? 0 : PLATE_FADE_MS + 100);
    return true;
  }

  /** Make the plate match the mood. Resolves when that mood's first plate is on screen. */
  async function syncPlate(night: boolean): Promise<void> {
    if (!hasPlate) return;
    if (avifSupport === undefined) await detectAvif();
    if (disposed) return;
    const first = !plateImg;
    plateNight = night;
    if (first && variantsHave(variants)) {
      // LQIP: smallest variant first, then the properly sized one.
      const lq = plateCandidates(night, 0, true);
      const full = plateCandidates(night);
      if (lq.urls[0] !== full.urls[0]) {
        if (await showPlate(lq.urls, lq.w, true)) void showPlate(full.urls, full.w, false);
        return;
      }
    }
    const c = plateCandidates(night, plateW);
    await showPlate(c.urls, c.w, first);
  }

  let upgradeTimer = 0;
  function maybeUpgradePlate() {
    if (!variants || !plateImg || plateNight === null || !stage.clientWidth) return;
    window.clearTimeout(upgradeTimer);
    upgradeTimer = window.setTimeout(() => {
      if (disposed || plateNight === null || avifSupport === undefined) return;
      const c = plateCandidates(plateNight, plateW);
      if (c.w > plateW) void showPlate(c.urls, c.w, false);
    }, 200);
  }

  // WebGLRenderer with alpha: true so the room plate shows directly behind
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const applyToneMap = (name?: string) => {
    renderer.toneMapping =
      name === 'agx'
        ? THREE.AgXToneMapping
        : name === 'neutral'
          ? THREE.NeutralToneMapping
          : THREE.ACESFilmicToneMapping;
  };
  applyToneMap(initialMeta.tonemap);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const canvas = renderer.domElement;
  canvas.className = 'room-canvas';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(initialMeta.fov, 16 / 9, 0.05, 40);
  camera.position.set(...initialMeta.eye);
  camera.lookAt(...initialMeta.target);
  camera.updateMatrixWorld(true);

  for (const fn of prewarmTurntableTextures()) fn();

  // Cover textures (valid THREE.Texture synchronously even before images finish decoding)
  const texLoader = new THREE.TextureLoader();
  let coverCount = options.covers.length > 0 ? Math.min(4, options.covers.length) : Math.min(4, recordInfo.length);
  let onCoverLoadRender = () => {};
  const covers: THREE.Texture[] =
    options.covers.length > 0
      ? options.covers.slice(0, coverCount).map((src) => {
          const t = texLoader.load(src, () => onCoverLoadRender(), undefined, () => onCoverLoadRender());
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 4;
          disposableTex.push(t);
          return t;
        })
      : recordInfo.slice(0, coverCount).map((rec, i) => {
          const t = recordCoverFallbackTexture(rec.title ?? `Record ${i + 1}`, i);
          disposableTex.push(t);
          return t;
        });

  if (covers.length === 0) {
    const t = recordCoverFallbackTexture('Record 1', 0);
    disposableTex.push(t);
    covers.push(t);
  }

  // Lighting matched to the plate, keeping strictly one active shadow-casting light per mood
  const hemi = new THREE.HemisphereLight(0xffeedb, 0x6b5640, 0.45);
  scene.add(hemi);

  const ttKey = new THREE.DirectionalLight(0xfff0dd, 0.55);
  ttKey.target.position.set(0.06, 0.66, -1.56);
  ttKey.position.set(-0.35, 1.85, -1.15);
  ttKey.castShadow = true;
  ttKey.shadow.mapSize.set(1024, 1024);
  ttKey.shadow.camera.left = -0.35;
  ttKey.shadow.camera.right = 0.35;
  ttKey.shadow.camera.top = 0.35;
  ttKey.shadow.camera.bottom = -0.35;
  ttKey.shadow.camera.near = 0.3;
  ttKey.shadow.camera.far = 2.5;
  ttKey.shadow.bias = -0.0005;
  ttKey.shadow.normalBias = 0.01;
  ttKey.shadow.radius = 4;
  ttKey.shadow.camera.updateProjectionMatrix();
  scene.add(ttKey, ttKey.target);

  const sky = new THREE.SpotLight(0xe8eef5, 0, 7, 1.3, 1, 1.2);
  sky.position.set(LEFT - 0.1, WIN.y1 - 0.1, WIN_MID);
  sky.target.position.set(0.8, 0.3, WIN_MID - 0.2);
  sky.castShadow = false;
  scene.add(sky, sky.target);

  const lampDown = new THREE.SpotLight(0xffc488, 0, 7, 1.2, 1, 1.6);
  lampDown.position.set(-1.48, 1.4, -1.5);
  lampDown.target.position.set(-1.48 + 0.6, 0, -1.5 + 0.4);
  lampDown.castShadow = false;
  lampDown.visible = false;
  lampDown.shadow.mapSize.set(1024, 1024);
  lampDown.shadow.bias = -0.0008;
  lampDown.shadow.normalBias = 0.02;
  lampDown.shadow.radius = 4;
  lampDown.shadow.camera.near = 0.1;
  lampDown.shadow.camera.far = 6;
  scene.add(lampDown, lampDown.target);

  const lampUp = new THREE.PointLight(0xffd2a0, 0, 4, 1.6);
  lampUp.position.set(-1.48, 1.67, -1.5);
  scene.add(lampUp);

  const tableLight = new THREE.PointLight(0xffc285, 0, 5, 1.7);
  tableLight.position.set(1.19, 0.77, -1.57);
  scene.add(tableLight);

  // Platter-only shadow catcher so disc and tonearm cast shadows cleanly onto the mat
  const matShadowMat = new THREE.ShadowMaterial({
    color: 0x000000,
    opacity: 0.22,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  disposableMats.push(matShadowMat);

  // Ledge: depth-only front lip occluder and 4 interactive sleeves
  const ledgeGroup = new THREE.Group();
  ledgeGroup.position.set(...LEDGE_POS);
  scene.add(ledgeGroup);

  const lipGeo = new THREE.BoxGeometry(LEDGE_LEN, 0.035, 0.014);
  const lipMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true });
  disposableGeos.push(lipGeo);
  disposableMats.push(lipMat);
  const lipOccluder = new THREE.Mesh(lipGeo, lipMat);
  lipOccluder.position.set(0, 0.016, 0.093);
  lipOccluder.renderOrder = -1;
  ledgeGroup.add(lipOccluder);

  // Gear 3D highlight shells: 2-pass EqualDepth + additive #ffb27a overlay over the background plate
  const depthPrimeMat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
  });
  disposableMats.push(depthPrimeMat);

  interface GearHighlightShell {
    group: THREE.Group;
    glowMesh: THREE.Mesh;
    glowMat: THREE.MeshBasicMaterial;
    hitMesh: THREE.Mesh;
  }
  const gearShells = new Map<string, GearHighlightShell>();
  const turntableEmissives: { mat: THREE.MeshStandardMaterial; base: THREE.Color; baseI: number }[] = [];

  function createGearHighlightShell(key: string, geo: THREE.BufferGeometry): void {
    disposableGeos.push(geo);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffb27a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      depthFunc: THREE.EqualDepth,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.ZeroFactor,
    });
    disposableMats.push(glowMat);

    // Every gear's depth is always in the buffer (it draws no colour), so one gear's glow
    // is hidden where another stands in front of it (the guitar's stand behind the amp), and
    // the record is hidden behind gear it passes; only the glow itself is switched on hover.
    const group = new THREE.Group();
    const depthMesh = new THREE.Mesh(geo, depthPrimeMat);
    depthMesh.renderOrder = 10;
    depthMesh.castShadow = false;
    depthMesh.receiveShadow = false;
    const glowMesh = new THREE.Mesh(geo, glowMat);
    glowMesh.renderOrder = 11;
    glowMesh.castShadow = false;
    glowMesh.receiveShadow = false;
    glowMesh.visible = false;
    group.add(depthMesh, glowMesh);
    group.updateMatrixWorld(true);
    scene.add(group);
    gearShells.set(key, { group, glowMesh, glowMat, hitMesh: depthMesh });
  }

  // Turntable: seated where it stands in the master scene, build highlight shell, isolate dynamic parts
  const turntable = buildTurntable(covers[0]);
  const tt = seat(turntable.group);
  tt.position.set(BOARD.x - 0.08, BOARD.h, BOARD_Z + 0.01);
  tt.rotation.y = 0.04;
  scene.add(tt);

  const dynamicSet = new Set<THREE.Object3D>();
  const seenTtMats = new Set<THREE.MeshStandardMaterial>();
  turntable.lid.traverse((o) => dynamicSet.add(o)); // moves: not part of the hover glow
  for (const dynRoot of [turntable.spin, turntable.arm]) {
    dynRoot.traverse((o) => {
      dynamicSet.add(o);
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.name.startsWith('led')) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const stdMat = mat as THREE.MeshStandardMaterial;
        if (stdMat?.isMeshStandardMaterial && !seenTtMats.has(stdMat)) {
          seenTtMats.add(stdMat);
          turntableEmissives.push({
            mat: stdMat,
            base: stdMat.emissive.clone(),
            baseI: stdMat.emissiveIntensity,
          });
        }
      }
    });
  }

  const ttShellGeo = extractMergedPositionGeometry([tt], dynamicSet);
  if (ttShellGeo) createGearHighlightShell('turntable', ttShellGeo);
  isolateDynamicTurntableParts(turntable);

  const platterCatchGeo = new THREE.CylinderGeometry(0.148, 0.148, 0.001, 48);
  disposableGeos.push(platterCatchGeo);
  const platterCatcher = new THREE.Mesh(platterCatchGeo, matShadowMat);
  platterCatcher.position.set(TT_PX, TT_PLATTER_TOP + 0.0014, TT_PZ);
  platterCatcher.receiveShadow = true;
  turntable.group.add(platterCatcher);

  // Soft contact shadow / AO under the disc: a blurred radial sprite that follows the record,
  // tightening and darkening as it settles on the mat, fading as it lifts or leaves the platter.
  const contactCanvas = document.createElement('canvas');
  contactCanvas.width = contactCanvas.height = 128;
  {
    const cctx = contactCanvas.getContext('2d')!;
    const grad = cctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.95)');
    grad.addColorStop(0.62, 'rgba(0,0,0,0.85)');
    grad.addColorStop(0.78, 'rgba(0,0,0,0.38)');
    grad.addColorStop(0.9, 'rgba(0,0,0,0.1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    cctx.fillStyle = grad;
    cctx.fillRect(0, 0, 128, 128);
  }
  const contactTex = new THREE.CanvasTexture(contactCanvas);
  contactTex.colorSpace = THREE.SRGBColorSpace;
  disposableTex.push(contactTex);
  const contactMat = new THREE.MeshBasicMaterial({
    map: contactTex,
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  disposableMats.push(contactMat);
  const CONTACT_R = 0.172;
  const contactGeo = new THREE.PlaneGeometry(CONTACT_R * 2, CONTACT_R * 2);
  contactGeo.rotateX(-Math.PI / 2);
  disposableGeos.push(contactGeo);
  const contactShadow = new THREE.Mesh(contactGeo, contactMat);
  contactShadow.position.set(TT_PX, TT_PLATTER_TOP + 0.0021, TT_PZ);
  contactShadow.renderOrder = 1;
  contactShadow.visible = false;
  turntable.group.add(contactShadow);

  const pendingGearBuilders: Array<() => void> = [
    () => {
      const g = seat(buildInterface());
      g.position.set(BOARD.x + 0.36, BOARD.h, BOARD_Z + 0.06);
      g.rotation.y = -0.22;
      const geo = extractMergedPositionGeometry([g]);
      if (geo) createGearHighlightShell('interface', geo);
      disposeTempObject(g);
    },
    () => {
      const spL = seat(buildSpeaker('left'));
      spL.position.set(BOARD.x - 0.66, BOARD.h, BOARD_Z - 0.01);
      spL.rotation.y = 0.2;
      const spR = seat(buildSpeaker('right'));
      spR.position.set(BOARD.x + 0.66, BOARD.h, BOARD_Z - 0.01);
      spR.rotation.y = -0.2;
      const geo = extractMergedPositionGeometry([spL, spR]);
      if (geo) createGearHighlightShell('speakers', geo);
      disposeTempObject(spL);
      disposeTempObject(spR);
    },
    () => {
      const g = buildGuitarStand(buildGuitar());
      g.position.set(-0.98, 0, BACK + 0.45);
      g.rotation.y = 0.38;
      const geo = extractMergedPositionGeometry([g]);
      if (geo) createGearHighlightShell('guitar', geo);
      disposeTempObject(g);
    },
    () => {
      const g = seat(buildAmp());
      g.position.set(-0.68, 0.01, -1.02);
      g.rotation.y = 0.55;
      const geo = extractMergedPositionGeometry([g]);
      if (geo) createGearHighlightShell('amp', geo);
      disposeTempObject(g);
    },
  ];
  let gearTimer = 0;

  // Ledge record sleeves, where they stand in the master scene (without inter-sleeve shadows)
  const recordRoots: THREE.Object3D[] = [];
  const slitMat = std(0x1b1917, 0.9);
  const sleeveGeo = new THREE.BoxGeometry(SLEEVE_SIZE, SLEEVE_SIZE, 0.005);
  const slitGeo = new THREE.BoxGeometry(0.0008, SLEEVE_SIZE - 0.006, 0.0022);
  disposableGeos.push(sleeveGeo, slitGeo);
  disposableMats.push(slitMat);

  const emissives = new Map<THREE.Object3D, { mat: THREE.MeshStandardMaterial; base: THREE.Color; baseI: number }[]>();
  const glow = new THREE.Color(0xffb27a);

  for (let i = 0; i < covers.length; i++) {
    const sleeveSide = std(0xe7e1d5, 0.8);
    const front = new THREE.MeshStandardMaterial({ map: covers[i], roughness: 0.6 });
    disposableMats.push(front, sleeveSide);
    const mats = [sleeveSide, sleeveSide, sleeveSide, sleeveSide, front, sleeveSide];
    const sleeve = mesh(sleeveGeo, mats, false);
    sleeve.castShadow = false;
    sleeve.receiveShadow = false;
    sleeve.position.y = SLEEVE_SIZE / 2;
    const slit = mesh(slitGeo, slitMat, false);
    slit.castShadow = false;
    slit.receiveShadow = false;
    slit.position.set(SLEEVE_SIZE / 2 - 0.0001, SLEEVE_SIZE / 2, 0);

    const pivot = new THREE.Group();
    pivot.add(sleeve, slit);
    pivot.position.set(-LEDGE_LEN / 2 + 0.2 + i * (SLEEVE_SIZE + SLEEVE_GAP), 0.011, 0.075);
    pivot.rotation.x = -0.13;
    pivot.rotation.y = SLEEVE_ROT_Y[i % 4];
    pivot.userData.baseY = pivot.position.y;
    pivot.userData.baseRx = pivot.rotation.x;
    pivot.userData.baseRy = pivot.rotation.y;
    ledgeGroup.add(pivot);
    recordRoots.push(pivot);

    emissives.set(pivot, [
      { mat: front, base: front.emissive.clone(), baseI: front.emissiveIntensity },
      { mat: sleeveSide, base: sleeveSide.emissive.clone(), baseI: sleeveSide.emissiveIntensity },
    ]);
  }

  // Hoverables & plate-meta gear hitboxes
  interface Hoverable {
    key: string;
    info?: { title: string; text: string; url?: string };
    record?: number;
    root?: THREE.Object3D;
    boxes: { box: THREE.Box3; tipAnchor: THREE.Vector3 }[];
    dotAt?: THREE.Vector3;
  }

  let currentMeta = initialMeta;
  const hoverables: Hoverable[] = [];
  const box3 = new THREE.Box3();
  const v3 = new THREE.Vector3();

  // Create tooltip & HUD DOM
  const tip = document.createElement('div');
  tip.className = 'room-tip';
  const tipTitle = document.createElement('strong');
  const tipText = document.createElement('span');
  const tipListen = document.createElement('span');
  tipListen.className = 'listen';
  tipListen.hidden = true;
  tipListen.textContent = 'Click to play';
  tip.append(tipTitle, tipText, tipListen);

  const now = document.createElement('div');
  now.className = 'room-now';
  const nowText = document.createElement('div');
  const nowLabel = document.createElement('span');
  nowLabel.className = 'room-now-label';
  nowLabel.textContent = 'On the turntable';
  const nowTitle = document.createElement('strong');
  const nowArtist = document.createElement('span');
  nowText.append(nowLabel, nowTitle, nowArtist);
  const nowActions = document.createElement('div');
  nowActions.className = 'room-now-actions';
  const nowPrev = document.createElement('button');
  nowPrev.type = 'button';
  nowPrev.tabIndex = -1;
  nowPrev.textContent = 'Prev';
  const nowNext = document.createElement('button');
  nowNext.type = 'button';
  nowNext.tabIndex = -1;
  nowNext.textContent = 'Next';
  const nowStop = document.createElement('button');
  nowStop.type = 'button';
  nowStop.tabIndex = -1;
  nowStop.textContent = 'Stop';
  const nowLink = document.createElement('a');
  nowLink.tabIndex = -1;
  nowLink.textContent = 'Listen on Spotify';
  nowActions.append(nowPrev, nowNext, nowStop, nowLink);
  now.append(nowText, nowActions);

  const dots = document.createElement('div');
  dots.className = 'room-dots';
  const dotAnchors: { el: HTMLElement; at: THREE.Vector3 }[] = [];

  const rebuildHoverables = (m: PlateMeta) => {
    currentMeta = m;
    hoverables.length = 0;
    dotAnchors.length = 0;
    dots.replaceChildren();
    scene.updateMatrixWorld(true);

    recordRoots.forEach((root, i) => {
      box3.setFromObject(root);
      const bounds = box3.clone();
      bounds.min.y -= 0.01;
      bounds.max.y += 0.06;
      bounds.max.z += 0.04;
      const tipAnchor = new THREE.Vector3((box3.min.x + box3.max.x) / 2, box3.max.y, (box3.min.z + box3.max.z) / 2);
      const dotAt = new THREE.Vector3();
      box3.getCenter(dotAt);
      hoverables.push({
        key: `record-${i}`,
        record: i,
        root,
        info: recordInfo[i] && { title: recordInfo[i].title, text: recordInfo[i].artist, url: recordInfo[i].url },
        boxes: [{ box: bounds, tipAnchor }],
        dotAt,
      });
    });

    for (const key of ['guitar', 'amp', 'interface', 'turntable', 'speakers'] as const) {
      const gm = m.gear[key];
      const info = gearInfo[key];
      if (!gm || !info) continue;
      const rawBoxes = gm.boxes?.length ? gm.boxes : [{ min: gm.min, max: gm.max, tipAnchor: gm.tipAnchor }];
      const dotAt = gm.dotAt ? new THREE.Vector3(...gm.dotAt) : undefined;
      hoverables.push({
        key,
        info,
        boxes: rawBoxes.map((b) => ({
          box: new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max)),
          tipAnchor: new THREE.Vector3(...b.tipAnchor),
        })),
        dotAt,
      });
    }

    for (const h of hoverables) {
      if (!h.dotAt) continue;
      const el = document.createElement('span');
      el.className = 'room-dot';
      dots.append(el);
      dotAnchors.push({ el, at: h.dotAt });
    }
  };
  rebuildHoverables(initialMeta);

  // Playback & Record Choreography
  const TAU = Math.PI * 2;
  const RPM = (33.333 / 60) * TAU;
  const lerp = THREE.MathUtils.lerp;
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const inOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const outQuad = (t: number) => 1 - (1 - t) * (1 - t);
  const outCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  const armHomeY = turntable.arm.position.y;
  const SEAT = turntable.spin.position.clone();
  const ARM_UP = 0.012;
  const ARM_DOWN = 0.0055;
  const HOVER = 0.075;
  const SLIDE = 0.335;
  const MISALIGN = new THREE.Vector3(0.0075, 0, 0.005);

  let held = 0;
  let playing = false;
  let discSide: 'A' | 'B' = 'A';
  let discFlip = 0;
  let spinSpeed = 0;
  let spinAngle = 0;
  let armYaw = 0;
  let armLift = 0;

  const disc = { p: SEAT.clone(), q: new THREE.Quaternion() };
  let busy = false;
  let pendingAct: (() => Promise<void>) | undefined;
  /** How much faster the running animation plays while another click waits for it. */
  const HURRY = 4;
  let playGate: () => Promise<unknown> = () => Promise.resolve();

  const AUDIO_VOLUME = 0.25;
  const audio = new Audio();
  audio.preload = 'auto';
  audio.volume = AUDIO_VOLUME;
  const nextAudio = new Audio();
  nextAudio.preload = 'auto';
  let audioRecord = -1;
  let trackIndex = 0;
  let needleDown = false;
  let fadeTimer = 0;
  let playPromise: Promise<void> | undefined;

  let disposed = false;
  let mounted = false;

  const tracksOf = (i: number): RoomTrack[] => recordInfo[i]?.tracks ?? [];
  const sideOf = (i: number, t: number): 'A' | 'B' => {
    const list = tracksOf(i);
    return list[t]?.side ?? (t < Math.ceil(list.length / 2) ? 'A' : 'B');
  };

  function sideTrackLabel(i: number, t: number): string {
    const list = tracksOf(i);
    const track = list[t];
    if (!track) return '';
    const side = sideOf(i, t);
    let sideNum = 0;
    for (let k = 0; k <= t; k++) {
      if (sideOf(i, k) === side) sideNum++;
    }
    return `${side}${sideNum} · ${track.title}`;
  }

  function preloadNext(i: number, t: number) {
    const next = tracksOf(i)[t + 1];
    if (next && nextAudio.src !== next.url) {
      nextAudio.src = next.url;
      nextAudio.load();
    }
  }

  function albumProgress(i: number): number {
    const list = tracksOf(i);
    if (!list.length) return 0;
    const curSide = sideOf(i, trackIndex);
    let total = 0;
    let before = 0;
    for (let k = 0; k < list.length; k++) {
      if (sideOf(i, k) !== curSide) continue;
      const d = list[k].duration || 240;
      if (k < trackIndex) before += d;
      total += d;
    }
    const cur = audioRecord === i && Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    return total > 0 ? clamp01((before + cur) / total) : 0;
  }

  const grooveYaw = (i: number) => lerp(turntable.armPlay, turntable.armEnd, albumProgress(i));

  function primeAudio(i: number) {
    const list = tracksOf(i);
    if (!list.length || (needleDown && audioRecord >= 0)) return;
    if (audioRecord !== i) {
      trackIndex = 0;
      audio.src = list[0].url;
      audio.currentTime = 0;
      audioRecord = i;
    }
    preloadNext(i, trackIndex);
    audio.muted = true;
    playPromise = audio.play().then(
      () => {
        playPromise = undefined;
        if (!needleDown || held !== i) {
          audio.pause();
          if (held !== i || !playing) audio.currentTime = 0;
          audio.muted = false;
        } else {
          audio.muted = false;
        }
      },
      () => {
        playPromise = undefined;
        audio.muted = false;
      },
    );
  }

  function fadeInAudio() {
    clearInterval(fadeTimer);
    fadeTimer = 0;
    audio.volume = 0;
    const t0 = performance.now();
    fadeTimer = window.setInterval(() => {
      if (disposed || !needleDown) {
        clearInterval(fadeTimer);
        fadeTimer = 0;
        return;
      }
      const k = clamp01((performance.now() - t0) / 450);
      audio.volume = AUDIO_VOLUME * k * k;
      if (k >= 1) {
        clearInterval(fadeTimer);
        fadeTimer = 0;
      }
    }, 16);
  }

  function startAudio(i: number) {
    const list = tracksOf(i);
    if (!list.length) return;
    if (audioRecord !== i || trackIndex >= list.length) {
      trackIndex = 0;
      audio.src = list[0].url;
      audio.currentTime = 0;
      audioRecord = i;
    } else if (audio.ended) {
      audio.currentTime = 0;
    }
    preloadNext(i, trackIndex);
    refreshTip();
    fadeInAudio();
    audio.muted = false;
    if (!playPromise && audio.paused) {
      playPromise = audio.play().then(
        () => {
          playPromise = undefined;
          if (!needleDown || held !== i) audio.pause();
        },
        () => {
          playPromise = undefined;
        },
      );
    }
  }

  function stopAudio() {
    clearInterval(fadeTimer);
    fadeTimer = 0;
    if (playPromise) audio.muted = true;
    else audio.pause();
  }

  // Tooltip + Now Playing placement and updates
  let tipFor: Hoverable | undefined;
  let tipAnchorFor: THREE.Vector3 | undefined;
  let stageW = 0;
  let stageH = 0;
  let tipW = 0;
  let tipH = 0;
  const lift = new Map<string, number>();
  const nudges = new Map<THREE.Object3D, number>();

  function placeTip(h: Hoverable, anchor: THREE.Vector3) {
    if (!stageW || !stageH) return;
    const l = h.record !== undefined && h.root ? (lift.get(h.key) ?? 0) : 0;
    v3.set(anchor.x, anchor.y + l * 0.05, anchor.z + l * 0.03).project(camera);
    const x = ((v3.x + 1) / 2) * stageW;
    const y = ((1 - v3.y) / 2) * stageH;
    const half = tipW / 2;
    const cx = Math.min(Math.max(x, half + 8), stageW - half - 8);
    tip.style.transform = `translate(${cx - half}px, ${Math.max(y - tipH - 12, 8)}px)`;
  }

  function actionFor(h: Hoverable): string | undefined {
    if (h.record !== undefined) return playing && held === h.record ? 'Click to stop' : 'Click to play';
    if (h.key === 'turntable' && held >= 0) return playing ? 'Click to stop' : 'Click to play';
    return undefined;
  }

  function showTip(h: Hoverable | undefined, anchor?: THREE.Vector3) {
    if (h === tipFor && anchor === tipAnchorFor) return;
    tipFor = h;
    tipAnchorFor = anchor;
    if (!h?.info || !anchor) {
      tip.classList.remove('is-on');
      return;
    }
    tipTitle.textContent = h.info.title;
    tipText.textContent = h.info.text;
    if (held >= 0 && recordInfo[held] && playing) {
      const r = recordInfo[held];
      const idx = audioRecord === held ? trackIndex : 0;
      if (h.key === 'turntable') {
        tipText.textContent = `${r.title} (${r.artist}) — ${sideTrackLabel(held, idx)}`;
      } else if (h.record !== undefined && h.record === held) {
        tipText.textContent = `${r.artist} · Playing ${sideTrackLabel(held, idx)}`;
      }
    }
    const act = actionFor(h);
    tipListen.textContent = act ?? '';
    tipListen.hidden = !act;
    tip.classList.add('is-on');
    tipW = tip.offsetWidth;
    tipH = tip.offsetHeight;
    placeTip(h, anchor);
  }

  function fmtTime(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function updateNowTime() {
    if (!playing || held < 0 || !recordInfo[held]) return;
    const r = recordInfo[held];
    const list = r.tracks ?? [];
    const idx = audioRecord === held ? trackIndex : 0;
    const track = list[idx]?.title;
    if (!track) return;
    const cur = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (list[idx]?.duration ?? 0);
    nowArtist.textContent = `${r.title} — ${r.artist} · ${idx + 1}/${list.length} · ${fmtTime(cur)} / ${fmtTime(dur)}`;
  }

  function refreshTip() {
    const wasH = tipFor;
    const wasAnchor = tipAnchorFor;
    tipFor = undefined;
    tipAnchorFor = undefined;
    showTip(wasH, wasAnchor);
    now.classList.toggle('is-on', held >= 0 && (playing || discSide === 'B' || trackIndex > 0));
    if (held >= 0 && recordInfo[held]) {
      const r = recordInfo[held];
      const list = r.tracks ?? [];
      const idx = audioRecord === held ? trackIndex : 0;
      const track = list[idx]?.title;
      const side = sideOf(held, idx);
      nowLabel.textContent = playing ? `Now playing · Side ${side}` : `On the turntable · Side ${side}`;
      nowTitle.textContent = track ? sideTrackLabel(held, idx) : r.title;
      if (track) {
        if (playing) updateNowTime();
        else nowArtist.textContent = `${r.title} — ${r.artist} (${idx + 1}/${list.length})`;
      } else {
        nowArtist.textContent = r.artist;
      }
      nowLink.href = r.url;
      nowPrev.hidden = list.length <= 1;
      nowNext.hidden = list.length <= 1;
      nowPrev.disabled = idx <= 0;
      nowNext.disabled = idx >= list.length - 1;
      nowStop.textContent = playing ? 'Stop' : 'Play';
    }
  }

  function applyLift(h: Hoverable, l: number) {
    lift.set(h.key, l);
    if (h.record !== undefined && h.root) {
      const list = emissives.get(h.root);
      if (list) {
        for (const e of list) {
          e.mat.emissive
            .copy(e.base)
            .lerp(glow, Math.min(l, 1) * 0.08 * (h.record === held && l <= 0.45 ? 0 : 1));
          e.mat.emissiveIntensity = l > 0.5 ? Math.max(e.baseI, 1) : e.baseI;
        }
      }
      const n = nudges.get(h.root) ?? 0;
      h.root.position.y = h.root.userData.baseY + l * 0.05 + n * 0.006;
      h.root.position.z = 0.075 + l * 0.03 + n * 0.038;
      h.root.rotation.x = h.root.userData.baseRx * (1 - l * 0.6) + n * 0.02;
      h.root.rotation.y = h.root.userData.baseRy - n * 0.22;
    } else {
      const shell = gearShells.get(h.key);
      if (shell) {
        shell.glowMesh.visible = l > 0.002;
        shell.glowMat.opacity = Math.min(l, 1) * 0.16;
      }
      if (h.key === 'turntable') {
        for (const e of turntableEmissives) {
          e.mat.emissive.copy(e.base).lerp(glow, Math.min(l, 1) * 0.14);
          e.mat.emissiveIntensity = l > 0.5 ? Math.max(e.baseI, 1) : e.baseI;
        }
      }
    }
  }

  function nudge(i: number, n: number) {
    const root = recordRoots[i];
    if (!root) return;
    nudges.set(root, n);
    const h = hoverables.find((x) => x.record === i);
    if (h) applyLift(h, lift.get(h.key) ?? 0);
  }

  interface Tween {
    t: number;
    dur: number;
    fn: (e: number) => void;
    done: () => void;
  }
  const tweens = new Set<Tween>();
  let requestRender = () => {};

  function tween(dur: number, fn: (e: number) => void) {
    return new Promise<void>((done) => {
      if (options.reducedMotion || disposed) {
        fn(1);
        requestRender();
        done();
        return;
      }
      tweens.add({ t: 0, dur, fn, done });
      requestRender();
    });
  }

  const sf = { s0: new THREE.Vector3(), e: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(), q: new THREE.Quaternion() };
  const sfMat = new THREE.Matrix4();
  const sfInv = new THREE.Matrix4();
  const sfPos = new THREE.Vector3();
  const sfScale = new THREE.Vector3();
  const quarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

  function sleeveFrame(i: number) {
    const root = recordRoots[i];
    root.updateWorldMatrix(true, false);
    turntable.group.updateWorldMatrix(true, false);
    sfInv.copy(turntable.group.matrixWorld).invert();
    sfMat.multiplyMatrices(sfInv, root.matrixWorld);
    sfMat.decompose(sfPos, sf.q, sfScale);
    sf.right.set(1, 0, 0).applyQuaternion(sf.q);
    sf.up.set(0, 1, 0).applyQuaternion(sf.q);
    sf.fwd.set(0, 0, 1).applyQuaternion(sf.q);
    sf.s0.set(0, 0.1575, -0.0009).applyMatrix4(sfMat);
    sf.e.copy(sf.s0).addScaledVector(sf.right, SLIDE);
    return sf;
  }

  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const qw = new THREE.Quaternion();
  const eu = new THREE.Euler();
  const hoverAt = SEAT.clone().add(new THREE.Vector3(0, HOVER, 0));
  const hoverOff = hoverAt.clone().add(MISALIGN);
  const carryPath = new THREE.CatmullRomCurve3(
    Array.from({ length: 5 }, () => new THREE.Vector3()),
    false,
    'centripetal',
  );
  const touch = () => {
    renderer.shadowMap.needsUpdate = true;
  };

  function slideStep(i: number, e: number) {
    const k = smooth(e);
    nudge(i, outCubic(k));
    const f = sleeveFrame(i);
    disc.p.lerpVectors(f.s0, f.e, k);
    disc.q.copy(f.q).multiply(quarter);
    touch();
  }

  function carryStep(i: number, e: number, back: boolean) {
    nudge(i, 1 - smooth(span(e, 0.08, 0.5)));
    const f = sleeveFrame(i);
    const c = smoother(Math.pow(e, 0.8));
    const side = Math.sign(f.e.x - hoverAt.x) || 1;
    const wp = carryPath.points;
    wp[0].copy(f.e);
    wp[1].copy(f.e).addScaledVector(f.right, 0.08).addScaledVector(f.fwd, 0.22).addScaledVector(f.up, 0.04);
    wp[2].set(lerp(f.e.x, hoverAt.x, 0.6), hoverAt.y + 0.45, lerp(wp[1].z, hoverAt.z, 0.6));
    wp[3].set(hoverOff.x + side * 0.05, hoverOff.y + 0.22, hoverOff.z);
    wp[4].copy(hoverOff);
    carryPath.updateArcLengths();
    carryPath.getPointAt(c, disc.p);
    qa.copy(f.q).multiply(quarter);
    qb.identity();
    qa.slerp(qb, smoother(span(c, 0.4, 0.85)));
    const bell = Math.sin(Math.PI * c);
    eu.set(0.05 * bell * Math.sin(5 * c), 0.09 * bell * Math.sin(3.2 * c + 0.5), 0.11 * bell * Math.sin(4.2 * c + 0.8));
    qw.setFromEuler(eu);
    disc.q.copy(qw).multiply(qa);
    touch();
  }

  function hoverStep(e: number) {
    const m = 1 - outCubic(e);
    disc.p.copy(hoverAt).addScaledVector(MISALIGN, m);
    disc.q.setFromEuler(eu.set(discFlip, 0, 0));
    touch();
  }

  function dropStep(e: number) {
    const k = 0.5 * smooth(e) + 0.5 * e;
    disc.p.lerpVectors(hoverAt, SEAT, k);
    disc.q.setFromEuler(eu.set(discFlip, 0, 0));
    touch();
  }

  const SETTLE = 0.5;
  function settleStep(e: number) {
    const t = e * SETTLE;
    const fade = 1 - smooth(span(e, 0.8, 1));
    const decay = Math.exp(-7.5 * t) * fade;
    const rx = 0.009 * decay * Math.sin(TAU * 3.6 * t + 0.3);
    const rz = 0.006 * decay * Math.cos(TAU * 3.1 * t);
    const bounce = Math.max(-0.0004, 0.0022 * Math.exp(-7.5 * t) * Math.sin(TAU * 4.4 * t)) * fade;
    disc.p.copy(SEAT);
    disc.p.y += bounce + Math.max(Math.abs(rx), Math.abs(rz)) * 0.152 * 0.9;
    disc.q.setFromEuler(eu.set(discFlip + rx, 0, rz));
    touch();
  }

  async function placeRecord(i: number) {
    await lidTo(true);
    turntable.setLabel(covers[i]);
    turntable.spin.visible = true;
    held = i;
    discSide = 'A';
    discFlip = 0;
    spinAngle = 0;
    spinSpeed = 0;
    refreshTip();
    await tween(0.45, (e) => slideStep(i, e));
    await tween(0.95, (e) => carryStep(i, e, false));
    await tween(0.2, hoverStep);
    await tween(0.38, dropStep);
    return { settled: tween(SETTLE, settleStep) };
  }

  async function removeRecord(i: number) {
    const a0 = spinAngle;
    const a1 = Math.round(a0 / TAU) * TAU;
    const flip0 = discFlip;
    await tween(0.34, (e) => dropStep(1 - e));
    await tween(0.2, (e) => hoverStep(1 - e));
    if (discFlip !== 0) {
      discSide = 'A';
      discFlip = 0;
    }
    await Promise.all([
      tween(0.95, (e) => {
        carryStep(i, 1 - e, true);
        if (flip0 !== 0) {
          const qFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lerp(flip0, 0, smooth(e)));
          disc.q.multiply(qFlip);
        }
      }),
      tween(0.95, (e) => (spinAngle = lerp(a0, a1, smooth(e)))),
    ]);
    await tween(0.45, (e) => slideStep(i, 1 - e));
    nudge(i, 0);
    turntable.spin.visible = false;
    if (audioRecord === i) {
      trackIndex = 0;
      const first = tracksOf(i)[0];
      if (first && audio.src !== first.url) audio.src = first.url;
      audio.currentTime = 0;
    }
    held = -1;
    refreshTip();
  }

  async function armTo(yaw: number, liftAmt: number, dur: number, curve = smooth) {
    const y0 = armYaw;
    const l0 = armLift;
    await tween(dur, (e) => {
      const k = curve(e);
      armYaw = lerp(y0, yaw, k);
      armLift = lerp(l0, liftAmt, k);
      touch();
    });
  }

  // The dust cover: raised as built; shut once the needle is down, raised again before the arm
  // lifts. Shutting, it eases down on its damped hinges and settles; raising is a quicker lift.
  const lidRaised = -turntable.lidOpen;
  async function lidTo(open: boolean) {
    const r0 = turntable.lid.rotation.x;
    const r1 = open ? lidRaised : 0;
    if (Math.abs(r1 - r0) < 1e-4) return;
    await tween(open ? 0.55 : 1.1, (e) => {
      const k = open ? inOut(e) : 1 - Math.pow(1 - e, 3) * (1 - 0.15 * Math.sin(Math.PI * e));
      turntable.lid.rotation.x = lerp(r0, r1, clamp01(k));
      touch();
    });
  }

  function spinTo(goal: number, dur: number, curve: (e: number) => number) {
    const s0 = spinSpeed;
    return tween(dur, (e) => (spinSpeed = e >= 1 ? goal : lerp(s0, goal, curve(e))));
  }
  const spinUp = (e: number) => e * e;
  const spinDown = (e: number) => 1 - Math.exp(-4.2 * e) * (1 - e);

  async function flipRecord(toSide: 'A' | 'B') {
    if (discSide === toSide) return;
    if (armYaw !== 0 || needleDown || spinSpeed > 0) {
      needleDown = false;
      stopAudio();
      await lidTo(true);
      await armTo(armYaw, ARM_UP, 0.24, outCubic);
      const braking = spinTo(0, 1.1, spinDown);
      await armTo(0, ARM_UP, 0.7, inOut);
      await armTo(0, 0, 0.25, outQuad);
      await braking;
    }
    const fromFlip = discFlip;
    const toFlip = toSide === 'B' ? Math.PI : 0;
    await tween(0.32, (e) => {
      const k = smooth(e);
      disc.p.lerpVectors(SEAT, hoverAt, k);
      disc.q.setFromEuler(eu.set(fromFlip, 0, 0));
      touch();
    });
    await tween(0.78, (e) => {
      const k = smoother(e);
      const bell = Math.sin(Math.PI * k);
      disc.p.copy(hoverAt);
      disc.p.y += 0.095 * bell;
      disc.p.z += 0.025 * bell;
      eu.set(lerp(fromFlip, toFlip, k), 0.12 * bell, 0.08 * Math.sin(TAU * k));
      disc.q.setFromEuler(eu);
      touch();
    });
    discSide = toSide;
    discFlip = toFlip;
    refreshTip();
    await tween(0.35, dropStep);
    await tween(SETTLE, settleStep);
  }

  async function startPlayback() {
    playing = true;
    if (audioRecord !== held) trackIndex = 0;
    refreshTip();
    await playGate();
    if (disposed) return;
    if (held >= 0 && sideOf(held, trackIndex) !== discSide) {
      await flipRecord(sideOf(held, trackIndex));
    }
    const targetYaw = audioRecord === held ? grooveYaw(held) : turntable.armPlay;
    const turning = spinTo(1, 1.05, spinUp);
    await armTo(0, ARM_UP, 0.16, outQuad);
    await armTo(targetYaw, ARM_UP, 0.7, inOut);
    await armTo(targetYaw, ARM_DOWN, 0.85, outCubic);
    needleDown = true;
    startAudio(held);
    await tween(0.22, (e) => {
      armLift = ARM_DOWN + 0.0006 * Math.exp(-9 * e) * Math.sin(Math.PI * 3 * e) * (1 - e);
      touch();
    });
    await Promise.all([turning, pendingAct ? undefined : lidTo(false)]);
  }

  async function stopPlayback() {
    playing = false;
    needleDown = false;
    stopAudio();
    refreshTip();
    await lidTo(true);
    await armTo(armYaw, ARM_UP, 0.28, outCubic);
    const braking = spinTo(0, 1.5, spinDown);
    await armTo(0, ARM_UP, 0.95, inOut);
    await armTo(0, 0, 0.3, outQuad);
    await braking;
  }

  async function choose(i: number) {
    if (i < 0 || i >= recordRoots.length) return;
    if (held === i) {
      if (playing) await stopPlayback();
      else await startPlayback();
      return;
    }
    if (playing || armYaw !== 0 || spinSpeed > 0) await stopPlayback();
    if (held >= 0) await removeRecord(held);
    const { settled } = await placeRecord(i);
    // Another album was clicked meanwhile: no needle drop on this one, it is coming off again.
    if (pendingAct) {
      await settled;
      return;
    }
    await Promise.all([settled, startPlayback()]);
  }

  async function act(run: () => Promise<void>) {
    if (busy) {
      pendingAct = run;
      return;
    }
    busy = true;
    try {
      await run();
    } finally {
      busy = false;
    }
    const next = pendingAct;
    pendingAct = undefined;
    if (next && !disposed) void act(next);
  }

  function toggleTurntable() {
    if (held < 0) return;
    if (!playing) primeAudio(held);
    void act(() => (playing ? stopPlayback() : startPlayback()));
  }

  async function cueCurrentTrack() {
    if (held < 0 || !playing) return;
    if (held >= 0 && sideOf(held, trackIndex) !== discSide) {
      await flipRecord(sideOf(held, trackIndex));
      await startPlayback();
      return;
    }
    needleDown = false;
    stopAudio();
    refreshTip();
    await lidTo(true);
    if (armLift < ARM_UP * 0.9) {
      await armTo(armYaw, ARM_UP, 0.2, outQuad);
    }
    await armTo(grooveYaw(held), ARM_UP, 0.4, inOut);
    if (Math.abs(armYaw - grooveYaw(held)) > 0.002) {
      await armTo(grooveYaw(held), ARM_UP, 0.25, inOut);
    }
    await armTo(grooveYaw(held), ARM_DOWN, 0.45, outCubic);
    needleDown = true;
    startAudio(held);
    await tween(0.18, (e) => {
      armLift = ARM_DOWN + 0.0005 * Math.exp(-9 * e) * Math.sin(Math.PI * 3 * e) * (1 - e);
      touch();
    });
    if (!pendingAct) await lidTo(false);
  }

  function skipTrack(delta: number) {
    if (held < 0) return;
    const list = tracksOf(held);
    if (!list.length) return;
    if (audioRecord !== held) {
      audioRecord = held;
      trackIndex = 0;
    }
    const next = Math.min(list.length - 1, Math.max(0, trackIndex + delta));
    if (next === trackIndex) return;
    trackIndex = next;
    needleDown = false;
    stopAudio();
    audio.src = list[trackIndex].url;
    audio.currentTime = 0;
    preloadNext(held, trackIndex);
    primeAudio(held);
    refreshTip();
    void act(() => (playing ? cueCurrentTrack() : startPlayback()));
  }

  function seek(i: number, sec: number) {
    tweens.clear();
    if (i >= 0 && i < covers.length) {
      turntable.setLabel(covers[i]);
    }
    turntable.spin.visible = true;
    held = i;
    discSide = 'A';
    discFlip = 0;
    spinAngle = 0;
    spinSpeed = 0;
    armYaw = 0;
    armLift = 0;
    turntable.lid.rotation.x = lidRaised;
    const stages: [number, (e: number) => void][] = [
      [0.45, (e) => slideStep(i, e)],
      [0.95, (e) => carryStep(i, e, false)],
      [0.2, hoverStep],
      [0.38, dropStep],
      [SETTLE, settleStep],
      [0.16, (e) => (armLift = lerp(0, ARM_UP, outQuad(e)))],
      [0.7, (e) => (armYaw = lerp(0, turntable.armPlay, inOut(e)))],
      [0.85, (e) => (armLift = lerp(ARM_UP, ARM_DOWN, outCubic(e)))],
    ];
    let left = sec;
    for (const [d, fn] of stages) {
      if (left >= d) {
        fn(1);
        left -= d;
      } else {
        fn(left / d);
        break;
      }
    }
    refreshTip();
    touch();
    requestRender();
    return { x: disc.p.x, y: disc.p.y, z: disc.p.z, q: [disc.q.x, disc.q.y, disc.q.z, disc.q.w] as [number, number, number, number] };
  }

  const onEnded = () => {
    if (!playing || !needleDown || held < 0) return;
    const list = tracksOf(held);
    if (trackIndex + 1 < list.length) {
      if (sideOf(held, trackIndex + 1) !== discSide) {
        trackIndex++;
        needleDown = false;
        audio.src = list[trackIndex].url;
        audio.currentTime = 0;
        preloadNext(held, trackIndex);
        refreshTip();
        void act(async () => {
          await flipRecord(sideOf(held, trackIndex));
          await startPlayback();
        });
      } else {
        clearInterval(fadeTimer);
        fadeTimer = 0;
        audio.volume = AUDIO_VOLUME;
        trackIndex++;
        audio.src = list[trackIndex].url;
        audio.currentTime = 0;
        preloadNext(held, trackIndex);
        refreshTip();
        playPromise = audio.play().then(
          () => {
            playPromise = undefined;
            if (!needleDown) audio.pause();
          },
          () => {
            playPromise = undefined;
          },
        );
      }
    } else {
      trackIndex = 0;
      void act(() => stopPlayback());
    }
  };
  audio.addEventListener('ended', onEnded);
  audio.addEventListener('timeupdate', updateNowTime);
  audio.addEventListener('loadedmetadata', updateNowTime);

  nowPrev.addEventListener('click', () => skipTrack(-1));
  nowNext.addEventListener('click', () => skipTrack(1));
  nowStop.addEventListener('click', () => toggleTurntable());

  // Mood synchronization (day/night plate + lights + PMREM environment)
  function getEnv(night: boolean): THREE.WebGLRenderTarget {
    const key = night ? 'night' : 'day';
    let rt = envTargets.get(key);
    if (!rt) {
      rt = buildProxyEnv(renderer, night);
      envTargets.set(key, rt);
    }
    return rt;
  }

  // moodT: 0 = day, 1 = night. Animated in frame() so the live lights/exposure dissolve in step
  // with the plate crossfade (the blend only starts once the new plate is decoded and fading in).
  let moodT = 0;
  let moodGoal = 0;
  let moodTok = 0;
  let moodDl: DayLight = daylight(12);
  const MOOD_SECS = PLATE_FADE_MS / 1000;
  const cDayHemi = new THREE.Color(0xffeedb);
  const cNightHemi = new THREE.Color(0x8a6a50);
  const cDayGround = new THREE.Color(0x6b5640);
  const cNightGround = new THREE.Color(0x3a281a);

  const ttKeyDir = new THREE.Vector3();
  function applyMoodBlend() {
    const e = moodT * moodT * (3 - 2 * moodT);
    const L = (a: number, b: number) => a + (b - a) * e;
    moodE = e;
    const pr = e >= 0.5 ? probes.night : probes.day;
    ttKey.visible = e < 1;
    ttKey.castShadow = e < 1;
    hemi.color.copy(cDayHemi).lerp(cNightHemi, e);
    hemi.groundColor.copy(cDayGround).lerp(cNightGround, e);
    lampDown.visible = e > 0;
    lampDown.castShadow = e > 0;
    if (pr) {
      // The probe carries the room's light. What is left is one key light (the sun, aimed and
      // scaled like the plate's and only as strong as it reaches the platter there) for the moving
      // shadow and the glint, plus lights held at zero so the night shadow still casts.
      // Direction and strength come from the plate's own sun (meta.bake.light.day), the probe's
      // recorded sun is the fallback. The plate's white balance is applied to the key colour here
      // and was baked into the probe's pixels, so the two stay in step.
      const bk = currentMeta.bake;
      const lt = bk?.light?.day;
      const sun = probes.day?.json.sun;
      const wbg = bk?.wbGain?.day ?? [1, 1, 1];
      if (lt) {
        ttKeyDir.set(lt.toLight[0], lt.toLight[1], lt.toLight[2]).normalize();
        ttKey.position.copy(ttKey.target.position).addScaledVector(ttKeyDir, 1.4);
        // irradiance is per channel in scene units: colour and strength in one.
        ttKey.color.setRGB(lt.irradiance[0] * wbg[0], lt.irradiance[1] * wbg[1], lt.irradiance[2] * wbg[2]);
        ttKey.intensity = L(sun?.vis ?? 1, 0);
      } else if (sun) {
        ttKeyDir.set(sun.dir[0], sun.dir[1], sun.dir[2]).normalize();
        ttKey.position.copy(ttKey.target.position).addScaledVector(ttKeyDir, 1.4);
        ttKey.color.set(sun.color);
        ttKey.color.r *= wbg[0];
        ttKey.color.g *= wbg[1];
        ttKey.color.b *= wbg[2];
        ttKey.intensity = L(sun.intensity * sun.vis, 0);
      } else {
        ttKey.color.set(moodDl.sun);
        ttKey.intensity = L(0.55, 0);
      }
      sky.intensity = 0;
      hemi.intensity = PROBE_HEMI;
      lampDown.intensity = 0;
      lampUp.intensity = 0;
      tableLight.intensity = 0;
      scene.environment = pr.env.texture;
      // One environment at a time: dip while the two probes swap so the swap is not seen.
      const both = Boolean(probes.day && probes.night);
      scene.environmentIntensity = PROBE_ENV_GAIN * (both ? 0.55 + 0.45 * Math.abs(2 * e - 1) : 1);
      const sunVis = probes.day?.json.sun?.vis ?? 1;
      catcherBase = L(0.22, 0.26) * (0.45 + 0.55 * L(sunVis, 1));
    } else {
      ttKey.color.set(moodDl.sun);
      ttKey.intensity = L(0.55, 0);
      sky.intensity = L(moodDl.skyI * 0.85, 0);
      hemi.intensity = 0.45;
      lampDown.intensity = L(0, 9);
      lampUp.intensity = L(0, 4);
      tableLight.intensity = L(0, 2.6);
      scene.environment = getEnv(e >= 0.5).texture;
      scene.environmentIntensity = L(0.5, 0.6);
      catcherBase = L(0.22, 0.26);
    }
    matShadowMat.opacity = catcherBase;
    // The plate's tone pass multiplies by 2^ev and then runs three's own tone curve code (ACES's
    // internal 1/0.6 included), so the same number on the renderer reproduces it exactly.
    renderer.toneMappingExposure =
      currentMeta.bake?.exposure ?? L(probes.day?.json.exposure ?? 1.02, probes.night?.json.exposure ?? 1.12);
    renderer.shadowMap.needsUpdate = true;
  }

  async function loadProbe(mood: 'day' | 'night'): Promise<void> {
    const jsonUrl = findAsset(PROBE_ASSETS, `probe-${mood}.json`);
    const pngUrl = findAsset(PROBE_ASSETS, `probe-${mood}.png`);
    if (!jsonUrl || !pngUrl) return;
    try {
      const json = (await (await fetch(jsonUrl)).json()) as ProbeJson;
      if (!json || json.encoding !== 'logpeak-rgb-png' || !(json.max > 0)) return;
      const sh = json.shadow;
      const shUrl = sh ? findAsset(SHADOW_ASSETS, sh.file) : undefined;
      const [tex, shTex] = await Promise.all([
        decodeProbeTexture(pngUrl, json),
        shUrl ? new THREE.TextureLoader().loadAsync(shUrl).catch(() => null) : Promise.resolve(null),
      ]);
      if (disposed) {
        tex.dispose();
        shTex?.dispose();
        return;
      }
      const pmrem = new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromEquirectangular(tex);
      pmrem.dispose();
      tex.dispose();
      const lp: LiveProbe = { json, env };
      if (sh && shTex) {
        shTex.generateMipmaps = false;
        shTex.minFilter = THREE.LinearFilter;
        shTex.magFilter = THREE.LinearFilter;
        const b = sh.bounds;
        const geo = new THREE.PlaneGeometry(b.x1 - b.x0, b.z1 - b.z0);
        geo.rotateX(-Math.PI / 2); // image top (v = 1) = z0
        const mat = new THREE.MeshBasicMaterial({
          color: 0x000000,
          alphaMap: shTex,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          toneMapped: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set((b.x0 + b.x1) / 2, sh.y, (b.z0 + b.z1) / 2);
        mesh.renderOrder = 1;
        mesh.visible = false;
        scene.add(mesh);
        lp.shadow = { mesh, mat, geo, tex: shTex };
      } else shTex?.dispose();
      probes[mood] = lp;
    } catch (err) {
      console.warn('[room] lighting probe unavailable', err);
    }
  }

  async function loadProbes(): Promise<void> {
    const first = currentNight() ? 'night' : 'day';
    const second = first === 'night' ? 'day' : 'night';
    for (const m of [first, second] as const) {
      await loadProbe(m);
      if (disposed) return;
      if (probes[m]) {
        applyMoodBlend();
        requestRender();
      }
    }
  }

  function setMood(first = false) {
    if (disposed) return;
    const night = currentNight();
    moodDl = daylight(options.hour ?? currentMeta.dayHour ?? zurichHour());
    const goal = night ? 1 : 0;
    const tok = ++moodTok;
    if (first || options.reducedMotion) {
      moodT = moodGoal = goal;
      applyMoodBlend();
      void syncPlate(night);
      requestRender();
      return;
    }
    void syncPlate(night).then(() => {
      if (disposed || tok !== moodTok) return;
      moodGoal = goal;
      requestRender();
    });
  }

  // Picking & Dots layout
  let dotsGone = false;
  let dotsDirty = true;
  function placeDots() {
    if (dotsGone || !dotsDirty || !stageW || !stageH) return;
    dotsDirty = false;
    for (const a of dotAnchors) {
      v3.copy(a.at).project(camera);
      a.el.style.transform = `translate(${((v3.x + 1) / 2) * stageW}px, ${((1 - v3.y) / 2) * stageH}px)`;
    }
  }

  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2(9, 9);
  const rayHit = new THREE.Vector3();
  let pointerDirty = false;

  function flushPendingGearShells() {
    clearTimeout(gearTimer);
    gearTimer = 0;
    while (!disposed && pendingGearBuilders.length > 0) {
      pendingGearBuilders.shift()!();
    }
  }

  function scheduleNextGearShell() {
    if (disposed || gearTimer || pendingGearBuilders.length === 0) return;
    gearTimer = window.setTimeout(() => {
      gearTimer = 0;
      if (disposed) return;
      pendingGearBuilders.shift()?.();
      if (pendingGearBuilders.length > 0) scheduleNextGearShell();
      else if (pointerDirty) requestRender();
    }, 0);
  }

  function pick(): { h: Hoverable; anchor: THREE.Vector3 } | undefined {
    if (pointer.x > 2) return undefined;
    ray.setFromCamera(pointer, camera);

    // First test record sleeve meshes when ray hits any record bounding box
    const sleeveCandidates: THREE.Object3D[] = [];
    for (const h of hoverables) {
      if (h.record === undefined || !h.root) continue;
      if (h.boxes.some((b) => ray.ray.intersectsBox(b.box))) {
        sleeveCandidates.push(h.root);
      }
    }
    if (sleeveCandidates.length > 0) {
      const hits = ray.intersectObjects(sleeveCandidates, true);
      if (hits.length > 0) {
        let cur: THREE.Object3D | null = hits[0].object;
        while (cur) {
          const found = hoverables.find((h) => h.root === cur);
          if (found) return { h: found, anchor: found.boxes[0].tipAnchor };
          cur = cur.parent;
        }
      }
    }

    // Test pre-baked gear boxes + exact 3D highlight-shell silhouettes
    let bestH: Hoverable | undefined;
    let bestAnchor: THREE.Vector3 | undefined;
    let bestDist = Infinity;
    for (const h of hoverables) {
      if (h.record !== undefined) continue;
      const shell = gearShells.get(h.key);
      for (const b of h.boxes) {
        const hitPt = ray.ray.intersectBox(b.box, rayHit);
        if (!hitPt) continue;
        let d: number;
        if (shell && h.key !== 'turntable') {
          const hits = ray.intersectObject(shell.hitMesh, false);
          if (hits.length === 0) continue;
          d = hits[0].distance;
        } else {
          d = hitPt.distanceTo(camera.position);
        }
        if (d < bestDist) {
          bestDist = d;
          bestH = h;
          bestAnchor = b.tipAnchor;
        }
      }
    }
    return bestH && bestAnchor ? { h: bestH, anchor: bestAnchor } : undefined;
  }

  let hovered: Hoverable | undefined;
  const onPointerMove = (e: PointerEvent) => {
    flushPendingGearShells();
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    pointerDirty = true;
    requestRender();
  };
  const onPointerLeave = () => {
    pointer.set(9, 9);
    pointerDirty = true;
    requestRender();
  };
  const onStageClick = (e: MouseEvent) => {
    if (disposed || (e.target as Element).closest('.room-now')) return;
    const hit = pick();
    if (!hit) return;
    const h = hit.h;
    if (h.record !== undefined) {
      const i = h.record;
      if (held !== i || !playing) primeAudio(i);
      void act(() => choose(i));
    } else if (h.key === 'turntable') {
      toggleTurntable();
    }
  };

  function resize() {
    const w = Math.max(stage.clientWidth, 1);
    const h = Math.max(Math.round((w * 9) / 16), 1);
    stageW = w;
    stageH = h;
    dotsDirty = true;
    if (tipFor) {
      tipW = tip.offsetWidth;
      tipH = tip.offsetHeight;
    }
    // Cap the backing store by pixel budget as well as DPR (keeps 4K / hi-DPI cheap).
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(Math.max(1, Math.min(dpr, Math.sqrt(PLATE_PX_BUDGET / (w * h)))));
    renderer.setSize(w, h, false);
    maybeUpgradePlate();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  }
  const sizeWatch = new ResizeObserver(resize);

  // True 0-FPS Idle Animation Loop
  let visible = true;
  let running = false;
  let renderRequested = false;
  let liftMoving = false;
  let moodMoving = false;
  let rafId = 0;
  let readyCalled = false;
  const clock = new THREE.Clock();
  const qSpin = new THREE.Quaternion();
  const Y_AXIS = new THREE.Vector3(0, 1, 0);

  function frame() {
    rafId = 0;
    if (disposed) {
      running = false;
      return;
    }
    renderRequested = false;

    const dt = Math.min(clock.getDelta(), 0.05);

    if (pointerDirty) {
      pointerDirty = false;
      const picked = pick();
      hovered = picked?.h;
      stage.style.cursor = hovered ? 'pointer' : '';
      showTip(picked?.h, picked?.anchor);
      if (picked && !dotsGone) {
        dotsGone = true;
        dots.classList.add('is-gone');
      }
    }

    let moving = false;
    const k = options.reducedMotion ? 1 : 1 - Math.pow(0.0005, dt);
    for (const h of hoverables) {
      const on = !!hovered && hovered.key === h.key;
      const goal = on ? 1 : h.record !== undefined && h.record === held ? 0.45 : 0;
      const nowLift = lift.get(h.key) ?? 0;
      if (nowLift === goal) continue;
      let next = nowLift + (goal - nowLift) * k;
      if (Math.abs(goal - next) < 0.002) next = goal;
      else moving = true;
      applyLift(h, next);
    }
    liftMoving = moving;
    if (moodT !== moodGoal) {
      const step = dt / MOOD_SECS;
      moodT = moodGoal > moodT ? Math.min(moodT + step, moodGoal) : Math.max(moodT - step, moodGoal);
      applyMoodBlend();
      moodMoving = moodT !== moodGoal;
    } else moodMoving = false;
    if (tipFor && tipAnchorFor) placeTip(tipFor, tipAnchorFor);
    placeDots();

    // A click is waiting (another album, say): what is running hurries to its end.
    const pace = pendingAct ? HURRY : 1;
    for (const tw of tweens) {
      tw.t += dt * pace;
      const e = Math.min(tw.t / tw.dur, 1);
      tw.fn(e);
      if (e >= 1) {
        tweens.delete(tw);
        tw.done();
      }
    }

    if (!options.reducedMotion) spinAngle += dt * RPM * spinSpeed;
    if (needleDown && held >= 0) armYaw = grooveYaw(held);
    turntable.spin.position.copy(disc.p);
    turntable.spin.quaternion
      .copy(disc.q)
      .multiply(qSpin.setFromAxisAngle(Y_AXIS, (discSide === 'B' ? 1 : -1) * spinAngle));
    turntable.arm.rotation.y = armYaw;
    turntable.arm.position.y = armHomeY + armLift;

    // Baked shadow of disc + arm (valid only while both sit at rest); the realtime shadow and the
    // radial contact shadow take over as soon as either moves.
    let cover = 0;
    {
      const dp = probes.day?.shadow;
      const np = probes.night?.shadow;
      const wd = dp ? 1 - moodE : 0;
      const wn = np ? moodE : 0;
      const avail = wd + wn;
      let rest = 0;
      if (avail > 0) {
        const dd = disc.p.distanceTo(SEAT);
        const discRest = 1 - smooth(span(dd, 0.003, 0.012));
        const armRest = (1 - smooth(span(armLift, 0.0006, 0.004))) * (1 - smooth(span(Math.abs(armYaw), 0.004, 0.03)));
        rest = discRest * armRest;
        cover = rest * avail;
      }
      if (dp) {
        dp.mat.opacity = rest * wd;
        dp.mesh.visible = dp.mat.opacity > 0.004;
      }
      if (np) {
        np.mat.opacity = rest * wn;
        np.mesh.visible = np.mat.opacity > 0.004;
      }
      matShadowMat.opacity = catcherBase * (1 - cover);
    }

    // Contact shadow follows the disc: only while it is over the platter, softer/fainter with height.
    {
      const dx = disc.p.x - TT_PX;
      const dz = disc.p.z - TT_PZ;
      const off = Math.hypot(dx, dz);
      const height = Math.max(disc.p.y - SEAT.y, 0);
      const near = Math.min(Math.max(1 - (off - 0.04) / 0.1, 0), 1);
      const air = Math.min(Math.max(1 - height / 0.07, 0), 1);
      const a = near * air * (0.1 + 0.32 * air) * (0.9 + 0.3 * moodT) * (1 - 0.92 * cover);
      contactShadow.visible = a > 0.004;
      contactMat.opacity = a;
      contactShadow.position.x = TT_PX + dx;
      contactShadow.position.z = TT_PZ + dz;
      const sc = 1 + Math.min(height * 5, 0.5);
      contactShadow.scale.set(sc, 1, sc);
    }

    renderer.render(scene, camera);
    if (!readyCalled) {
      readyCalled = true;
      onReady?.();
    }

    const active = tweens.size > 0 || spinSpeed > 0 || liftMoving || moodMoving || pointerDirty || renderRequested;
    if (active && visible && !document.hidden) {
      rafId = requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  requestRender = () => {
    if (disposed) return;
    renderRequested = true;
    if (running) return;
    running = true;
    clock.getDelta();
    rafId = requestAnimationFrame(frame);
  };
  onCoverLoadRender = () => requestRender();

  const viewWatch = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible && !document.hidden && (tweens.size > 0 || spinSpeed > 0 || liftMoving || renderRequested)) {
      requestRender();
    }
  });
  const onVisibilityChange = () => {
    if (!document.hidden && visible && (tweens.size > 0 || spinSpeed > 0 || liftMoving || renderRequested)) {
      requestRender();
    }
  };
  const ac = new AbortController();

  function activate() {
    if (disposed || mounted) return;
    mounted = true;
    stage.append(tip, now, dots, canvas);
    createdNodes.push(tip, now, dots, canvas);
    sizeWatch.observe(stage);
    viewWatch.observe(stage);
    stage.addEventListener('pointermove', onPointerMove, { signal: ac.signal });
    stage.addEventListener('pointerleave', onPointerLeave, { signal: ac.signal });
    stage.addEventListener('click', onStageClick, { signal: ac.signal });
    document.addEventListener('visibilitychange', onVisibilityChange, { signal: ac.signal });
    if (!options.mood) dark.addEventListener('change', () => setMood(), { signal: ac.signal });
    for (const h of hoverables) if (h.record === held) applyLift(h, 0.45);
    resize();
    setMood(true);
    frame();
  }

  activate();
  scheduleNextGearShell();
  window.setTimeout(() => void loadProbes(), 250);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    mounted = false;
    clearTimeout(gearTimer);
    gearTimer = 0;
    pendingGearBuilders.length = 0;
    cancelAnimationFrame(rafId);
    window.clearTimeout(upgradeTimer);
    ac.abort();
    sizeWatch.disconnect();
    viewWatch.disconnect();
    tweens.clear();
    needleDown = false;
    clearInterval(fadeTimer);
    fadeTimer = 0;
    audio.removeEventListener('ended', onEnded);
    audio.removeEventListener('timeupdate', updateNowTime);
    audio.removeEventListener('loadedmetadata', updateNowTime);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    nextAudio.removeAttribute('src');
    nextAudio.load();
    stage.style.cursor = '';
    stage.classList.remove('is-plate-missing');

    for (const el of createdNodes) el.remove();
    for (const rt of envTargets.values()) rt.dispose();
    for (const p of [probes.day, probes.night]) {
      if (!p) continue;
      p.env.dispose();
      if (p.shadow) {
        scene.remove(p.shadow.mesh);
        p.shadow.geo.dispose();
        p.shadow.mat.dispose();
        p.shadow.tex.dispose();
      }
    }
    for (const g of disposableGeos) g.dispose();
    for (const m of disposableMats) m.dispose();
    for (const t of disposableTex) t.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  const applyMeta = (nextMeta: PlateMeta) => {
    if (disposed) return;
    if (!variants && variantsHave(nextMeta.variants)) {
      variants = nextMeta.variants;
      if (plateNight !== null) maybeUpgradePlate();
    }
    if (nextMeta.tonemap !== initialMeta.tonemap) {
      applyToneMap(nextMeta.tonemap);
      for (const m of seenTtMats) m.needsUpdate = true;
    }
    rebuildHoverables(nextMeta);
    applyMoodBlend(); // exposure, key light and white balance come from the meta
    dotsDirty = true;
    placeDots();
    refreshTip();
    requestRender();
  };

  return {
    handle: {
      renderer,
      scene,
      camera,
      dispose,
      play: (i = 0) => act(() => choose(i)),
      stop: () => act(async () => void (playing && (await stopPlayback()))),
      flip: (toSide?: 'A' | 'B') => act(() => flipRecord(toSide ?? (discSide === 'A' ? 'B' : 'A'))),
      setPlayGate: (gate: () => Promise<unknown>) => void (playGate = gate),
      seek,
      hasPlate,
    },
    applyMeta,
  };
}

export function mountPlateRoom(stage: HTMLElement, options: Partial<RoomOptions> = {}): PlateRoomHandle {
  const opts: RoomOptions = { covers: [], reducedMotion: false, ...options };
  const { handle, applyMeta } = mountCore(stage, opts, DEFAULT_META, opts.onReady);
  if (PLATE_META_URL) {
    void fetch(PLATE_META_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (raw) applyMeta(normalizeMeta(raw));
      })
      .catch(() => {});
  }
  return handle;
}

export async function mountPlateRoomAsync(
  stage: HTMLElement,
  options: Partial<AsyncRoomOptions> = {},
): Promise<PlateRoomHandle | undefined> {
  if (options.signal?.aborted) return undefined;
  const opts: AsyncRoomOptions = { covers: [], reducedMotion: false, ...options };

  let meta = DEFAULT_META;
  const loads: Array<Promise<unknown>> = [];

  if (PLATE_META_URL) {
    loads.push(
      fetch(PLATE_META_URL, { signal: opts.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((raw) => {
          if (raw) meta = normalizeMeta(raw);
        })
        .catch(() => {}),
    );
  }

  loads.push(detectAvif());
  await Promise.all(loads);
  if (opts.signal?.aborted) return undefined;

  // Warm the browser cache with the smallest (LQIP) variant, or the legacy plate, so first paint is quick.
  const night = opts.mood ? opts.mood === 'night' : matchMedia('(prefers-color-scheme: dark)').matches;
  const list = meta.variants ? (night ? meta.variants.night : meta.variants.day) : [];
  const lq = pickVariant(list, 0, avifSupport === true);
  const warmUrl = (lq && variantUrl(lq, avifSupport === true)) || (night ? PLATE_NIGHT_URL : PLATE_DAY_URL);
  if (warmUrl) await loadDecoded(warmUrl);
  if (opts.signal?.aborted) return undefined;

  return mountCore(stage, opts, meta, opts.onReady).handle;
}
