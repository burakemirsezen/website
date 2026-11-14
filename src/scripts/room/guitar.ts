// Part of the listening room. See kit.ts for the conventions.
//
// The owner's Yamaha Pacifica 112V in Yellow Natural Satin, at real size:
// alder offset double-cutaway body with arm and belly contours, white 3-ply
// guard, HSS pickups (black covers), vintage-style tremolo with block
// saddles, chrome dome knobs, bolt-on maple neck with a rosewood board,
// 22 frets on a 648 mm scale, Pacifica headstock with six in-line tuners.
//
// Origin: the bottom strap button touches y = 0, centred; +y runs up the
// neck, +z is the front of the guitar, z = 0 is the middle of the body.

import { THREE, std, mesh, canvasTexture, RoundedBoxGeometry } from './kit';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V2 = [number, number];
type G = THREE.BufferGeometry;

// ---------------------------------------------------------------- dimensions
const SCALE = 0.648; // 25.5" scale
const T = 0.045; // body thickness
const ZF = T / 2; // body front
const ZB = -T / 2; // body back
const Y_SADDLE = 0.1275; // high-E saddle break point, from the body's bottom edge
const Y_NUT = Y_SADDLE + SCALE;
const ZNT = ZF + 0.0038; // top of the maple neck = headstock face
const FB = 0.0062; // fretboard thickness at the centre
const RADIUS = 0.35; // 13.75" board radius
const sag = (x: number) => (x * x) / (2 * RADIUS);
const boardTop = (x: number) => ZNT + FB - sag(x);
const fretY = (k: number) => Y_NUT - SCALE * (1 - Math.pow(2, -k / 12));
const Y_BOARD_END = fretY(22) - 0.007;
const neckW = (y: number) => 0.041 + 0.0104 * ((Y_NUT - y) / 0.324); // 41 mm nut, 51.4 mm at fret 12
const ZG = ZF + 0.0025; // pickguard top

// Metres per pixel of the official front photo (nut-to-saddle 2567 px = 648 mm).
const PX = 0.0002524;
const HEAD_PX: V2[] = [
  [730, 760],
  [731, 735],
  [741, 700],
  [755, 680],
  [782, 660],
  [816, 643],
  [824, 620],
  [818, 580],
  [812, 540],
  [803, 460],
  [795, 380],
  [792, 300],
  [792, 245],
  [796, 215],
  [804, 182],
  [817, 160],
  [837, 140],
  [851, 120],
  [855, 95],
  [850, 64],
  [840, 40],
  [821, 20],
  [792, 5],
  [765, 2],
  [738, 9],
  [716, 22],
  [699, 40],
  [688, 68],
  [614, 340],
  [541, 610],
  [537, 640],
  [545, 672],
  [557, 700],
  [568, 725],
  [569, 760],
];

// Strings, 0 = low E .. 5 = high E.
const NUT_X = (i: number) => -0.01725 + i * 0.0069;
const SAD_X = (i: number) => -0.02625 + i * 0.0105; // 10.5 mm spacing
const GAUGE = [0.042, 0.032, 0.024, 0.016, 0.011, 0.009].map((g) => (g * 0.0254) / 2);
const COMP = [0.0035, 0.0028, 0.0022, 0.003, 0.0015, 0];
const strX = (i: number, y: number) => {
  const t = (Y_NUT - y) / SCALE;
  return NUT_X(i) + (SAD_X(i) - NUT_X(i)) * t;
};
const Z_SAD = (i: number) => ZF + 0.0144 - sag(SAD_X(i));
const Z_NUT = (i: number) => boardTop(NUT_X(i)) + 0.0016;

// ---------------------------------------------------------------- helpers
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function prep(g: G): G {
  const h = g.index ? g.toNonIndexed() : g;
  if (!h.getAttribute('normal')) h.computeVertexNormals();
  if (!h.getAttribute('uv')) {
    h.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(h.getAttribute('position').count * 2), 2));
  }
  for (const k of Object.keys(h.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') h.deleteAttribute(k);
  h.clearGroups();
  return h;
}
const merge = (list: G[]) => mergeGeometries(list.map(prep), false)!;

function at(g: G, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): G {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  return g.applyMatrix4(m);
}
// Orient a geometry built along +y so +y points along dir, base at `from`.
function along(g: G, from: THREE.Vector3, dir: THREE.Vector3): G {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return g.applyMatrix4(new THREE.Matrix4().compose(from, q, new THREE.Vector3(1, 1, 1)));
}
// A thin cylinder from a to b.
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 6): G {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1, true);
  g.translate(0, d.length() / 2, 0);
  return along(g, a, d);
}
function dome(r: number, h: number, seg = 12): G {
  const g = new THREE.SphereGeometry(r, seg, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, h / r, 1);
  g.rotateX(Math.PI / 2); // dome faces +z
  return g;
}
function planarUV(g: G, su: number, ou: number, sv: number, ov: number) {
  const p = g.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) * su + ou;
    uv[i * 2 + 1] = p.getY(i) * sv + ov;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// Indexed grid surface; f(i, j) gives a point. Normal = dir(j) x dir(i).
function grid(ni: number, nj: number, f: (i: number, j: number) => [number, number, number], flip = false): G {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= ni; i++) for (let j = 0; j <= nj; j++) pos.push(...f(i, j));
  for (let i = 0; i < ni; i++)
    for (let j = 0; j < nj; j++) {
      const a = i * (nj + 1) + j, b = a + 1, c = a + nj + 2, d = a + nj + 1;
      if (flip) idx.push(a, c, b, a, d, c);
      else idx.push(a, b, c, a, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function closedCurve(pts: V2[], n: number): V2[] {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal');
  const out = c.getSpacedPoints(n).slice(0, n).map((p) => [p.x, p.y] as V2);
  if (THREE.ShapeUtils.isClockWise(out.map(([x, y]) => new THREE.Vector2(x, y)))) out.reverse();
  return out;
}
function outward(p: V2[]): V2[] {
  const n = p.length;
  return p.map((_, i) => {
    const a = p[(i - 1 + n) % n], b = p[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dy / l, -dx / l];
  });
}
function stadium(len: number, wid: number) {
  const s = new THREE.Shape();
  const r = wid / 2, hl = len / 2 - r;
  s.moveTo(-hl, -r);
  s.lineTo(hl, -r);
  s.absarc(hl, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-hl, r);
  s.absarc(-hl, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  return s;
}
function lathe(profile: V2[], seg: number): G {
  return new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), seg);
}

// ---------------------------------------------------------------- textures
function alderTexture() {
  const R = rng(11);
  return canvasTexture(1024, 1024, (g) => {
    g.fillStyle = '#c79d68';
    g.fillRect(0, 0, 1024, 1024);
    // Three-piece body: each board a touch different.
    const seams = [0, 352, 706, 1024];
    const tints = ['rgba(255 238 196 / 0.10)', 'rgba(176 128 62 / 0.07)', 'rgba(255 232 180 / 0.06)'];
    for (let b = 0; b < 3; b++) {
      g.fillStyle = tints[b];
      g.fillRect(seams[b], 0, seams[b + 1] - seams[b], 1024);
    }
    // Soft figure.
    for (let k = 0; k < 70; k++) {
      const x = R() * 1024, y = R() * 1024, r = 40 + R() * 120;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = R() < 0.5;
      grd.addColorStop(0, dark ? 'rgba(150 98 40 / 0.07)' : 'rgba(255 240 205 / 0.08)');
      grd.addColorStop(1, 'rgba(0 0 0 / 0)');
      g.save();
      g.translate(x, y);
      g.scale(0.35, 1.6);
      g.translate(-x, -y);
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
      g.restore();
    }
    // Broad growth bands.
    for (let k = 0; k < 40; k++) {
      const x0 = R() * 1024, w = 6 + R() * 26, ph = R() * 6.28;
      g.strokeStyle = `rgba(120 75 30 / ${0.03 + R() * 0.06})`;
      g.lineWidth = w;
      g.beginPath();
      for (let y = -8; y <= 1032; y += 16) {
        const x = x0 + 10 * Math.sin(y * 0.004 + ph);
        if (y < 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    // Grain lines, running along the body's length.
    for (let k = 0; k < 520; k++) {
      const x0 = R() * 1024;
      const amp = 1 + R() * 7, freq = 0.002 + R() * 0.007, ph = R() * 6.28, drift = (R() - 0.5) * 30;
      g.strokeStyle = `rgba(${115 + R() * 30} ${72 + R() * 22} 32 / ${0.04 + R() * R() * 0.26})`;
      g.lineWidth = 0.5 + R() * R() * 2.2;
      g.beginPath();
      for (let y = -8; y <= 1032; y += 12) {
        const x = x0 + amp * Math.sin(y * freq + ph) + (drift * y) / 1024;
        if (y < 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    // Glue seams.
    g.strokeStyle = 'rgba(120 80 35 / 0.35)';
    g.lineWidth = 1;
    for (const s of [352, 706]) {
      g.beginPath();
      g.moveTo(s, 0);
      g.lineTo(s + 1.5, 1024);
      g.stroke();
    }
  });
}
function mapleTexture() {
  const R = rng(5);
  const t = canvasTexture(256, 1024, (g) => {
    g.fillStyle = '#e2c99d';
    g.fillRect(0, 0, 256, 1024);
    for (let k = 0; k < 140; k++) {
      const x0 = R() * 256, amp = R() * 3, ph = R() * 6;
      g.strokeStyle = `rgba(165 115 55 / ${0.03 + R() * 0.1})`;
      g.lineWidth = 0.5 + R();
      g.beginPath();
      for (let y = 0; y <= 1024; y += 16) g[y ? 'lineTo' : 'moveTo'](x0 + amp * Math.sin(y * 0.01 + ph), y);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function rosewoodTexture() {
  const R = rng(3);
  return canvasTexture(256, 1024, (g) => {
    g.fillStyle = '#463a32';
    g.fillRect(0, 0, 256, 1024);
    for (let k = 0; k < 220; k++) {
      const x0 = R() * 256, amp = R() * 4, ph = R() * 6;
      const dark = R() < 0.6;
      g.strokeStyle = dark ? `rgba(22 10 5 / ${0.1 + R() * 0.35})` : `rgba(110 92 76 / ${0.05 + R() * 0.2})`;
      g.lineWidth = 0.6 + R() * 2.5;
      g.beginPath();
      for (let y = 0; y <= 1024; y += 16) g[y ? 'lineTo' : 'moveTo'](x0 + amp * Math.sin(y * 0.008 + ph), y);
      g.stroke();
    }
    for (let k = 0; k < 900; k++) {
      g.fillStyle = `rgba(15 6 2 / ${0.2 + R() * 0.4})`;
      g.fillRect(R() * 256, R() * 1024, 1, 2 + R() * 5);
    }
  });
}
function logoTexture() {
  // Headstock decal: covers x -0.034..0.056 and 0..0.195 above the nut;
  // drawn in metres with y up.
  const kx = 512 / 0.09, ky = 1024 / 0.195;
  return canvasTexture(512, 1024, (g) => {
    g.clearRect(0, 0, 512, 1024);
    g.setTransform(kx, 0, 0, -ky, 0.034 * kx, 0.195 * ky);
    const ink = '#17130f';
    // Tuning-fork badge near the tip.
    const cx = 0.036, cy = 0.1665, r = 0.0093;
    g.strokeStyle = ink;
    g.lineWidth = 0.0011;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 0.00075;
    for (let k = 0; k < 3; k++) {
      g.save();
      g.translate(cx, cy);
      g.rotate((k * Math.PI * 2) / 3 + Math.PI / 2);
      g.beginPath();
      g.moveTo(0, -r * 0.1);
      g.lineTo(r * 0.35, 0);
      g.moveTo(r * 0.85, -r * 0.2);
      g.lineTo(r * 0.45, -r * 0.2);
      g.quadraticCurveTo(r * 0.33, -r * 0.2, r * 0.33, 0);
      g.quadraticCurveTo(r * 0.33, r * 0.2, r * 0.45, r * 0.2);
      g.lineTo(r * 0.85, r * 0.2);
      g.stroke();
      g.restore();
    }
    // PACIFICA, reading up the treble side, with the small line beside it.
    const text = (t: string, x: number, y: number, len: number, font: string) => {
      g.save();
      g.translate(x, y);
      g.rotate(Math.PI / 2);
      g.scale(0.001, -0.001);
      g.font = font;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const w = g.measureText(t).width || 1;
      g.scale((len * 1000) / w, 1);
      g.fillStyle = ink;
      g.fillText(t, 0, 0);
      g.restore();
    };
    text('PACIFICA', 0.0303, 0.081, 0.061, '600 12px "Century Gothic", "Futura", "Trebuchet MS", sans-serif');
    text('Yamaha Guitar Development', 0.0372, 0.0745, 0.048, '3.2px Arial, sans-serif');
  });
}
let studio: THREE.Texture | null = null;
function studioEnv() {
  if (studio) return studio;
  studio = canvasTexture(512, 256, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#fbf7f0');
    grd.addColorStop(0.45, '#d6cec2');
    grd.addColorStop(0.55, '#7d7062');
    grd.addColorStop(1, '#2e2822');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#ffffff';
    g.fillRect(50, 34, 100, 48);
    g.fillRect(320, 26, 130, 40);
    g.fillStyle = 'rgba(30 26 22 / 0.7)';
    g.fillRect(190, 70, 50, 70);
  });
  studio.mapping = THREE.EquirectangularReflectionMapping;
  return studio;
}
// Metals get a small studio reflection when the scene has no environment.
function metal(color: number, roughness: number) {
  const m = std(color, roughness, 1);
  return m;
}
function useStudioWhenNeeded(o: THREE.Mesh) {
  o.onBeforeRender = (_r, scene, _c, _g, mat) => {
    const m = mat as THREE.MeshStandardMaterial;
    const want = scene.environment ? null : studioEnv();
    if (m.envMap !== want) {
      m.envMap = want;
      m.needsUpdate = true;
    }
  };
}

// ---------------------------------------------------------------- body
// Pacifica outline, counter-clockwise from the bottom; x > 0 is the treble side.
const BODY_PTS: V2[] = [
  [-0.0284, 0.3705],
  [-0.01, 0.356],
  [0.01, 0.34],
  [0.0287, 0.3255],
  [0.0305, 0.3215],
  [0.0381, 0.3145],
  [0.0514, 0.3102],
  [0.0659, 0.3105],
  [0.0785, 0.316],
  [0.0888, 0.3245],
  [0.0949, 0.3363],
  [0.1007, 0.3486],
  [0.1035, 0.3615],
  [0.1095, 0.3705],
  [0.1172, 0.3718],
  [0.1242, 0.3682],
  [0.1302, 0.3581],
  [0.1343, 0.3461],
  [0.1363, 0.3305],
  [0.1353, 0.314],
  [0.1323, 0.2995],
  [0.1262, 0.2881],
  [0.122, 0.2749],
  [0.1161, 0.2628],
  [0.1121, 0.2497],
  [0.1102, 0.2364],
  [0.1141, 0.2222],
  [0.1181, 0.2113],
  [0.1248, 0.1991],
  [0.1323, 0.188],
  [0.1381, 0.1759],
  [0.1444, 0.1637],
  [0.1493, 0.1509],
  [0.1545, 0.1387],
  [0.1585, 0.1246],
  [0.16, 0.1086],
  [0.16, 0.0912],
  [0.1585, 0.0751],
  [0.154, 0.061],
  [0.1483, 0.0487],
  [0.1403, 0.0386],
  [0.1295, 0.0305],
  [0.1181, 0.0238],
  [0.1068, 0.0167],
  [0.0939, 0.0117],
  [0.081, 0.0067],
  [0.0664, 0.0038],
  [0.0535, 0.0016],
  [0.0376, 0.0004],
  [0.0203, 0],
  [0.003, 0],
  [-0.0141, 0.0003],
  [-0.0297, 0.0023],
  [-0.0452, 0.0043],
  [-0.0588, 0.0069],
  [-0.0722, 0.0103],
  [-0.0831, 0.0162],
  [-0.0956, 0.0224],
  [-0.1077, 0.0286],
  [-0.1194, 0.035],
  [-0.1295, 0.043],
  [-0.1396, 0.0512],
  [-0.1465, 0.0608],
  [-0.1535, 0.0715],
  [-0.1598, 0.083],
  [-0.1631, 0.0978],
  [-0.1631, 0.1152],
  [-0.162, 0.1316],
  [-0.1598, 0.1464],
  [-0.1537, 0.159],
  [-0.1477, 0.1711],
  [-0.1416, 0.182],
  [-0.1355, 0.1943],
  [-0.1288, 0.2055],
  [-0.1225, 0.2176],
  [-0.1153, 0.2288],
  [-0.1103, 0.2418],
  [-0.1053, 0.255],
  [-0.1032, 0.2697],
  [-0.105, 0.2814],
  [-0.1085, 0.2955],
  [-0.1133, 0.309],
  [-0.1194, 0.3213],
  [-0.1253, 0.3334],
  [-0.1301, 0.3453],
  [-0.1335, 0.3587],
  [-0.1371, 0.3721],
  [-0.1393, 0.3873],
  [-0.1396, 0.4011],
  [-0.1376, 0.4166],
  [-0.1328, 0.4295],
  [-0.1254, 0.4405],
  [-0.1165, 0.4483],
  [-0.1065, 0.4512],
  [-0.0995, 0.4465],
  [-0.0962, 0.435],
  [-0.0941, 0.4191],
  [-0.0924, 0.4053],
  [-0.0861, 0.3931],
  [-0.08, 0.3809],
  [-0.0717, 0.371],
  [-0.0624, 0.365],
  [-0.0483, 0.3609],
  [-0.0363, 0.3655],
  [-0.031, 0.3695],
];

// Forearm contour on the front, bass side of the lower bout (negative z).
function armCut(x: number, y: number) {
  // A broad, nearly flat bevel, as on the photo's lower bass bout.
  const u = Math.max(0, (-x - 0.07) / 0.09);
  const w = smooth(0.0, 0.07, y) * (1 - smooth(0.2, 0.3, y));
  return -0.0125 * Math.pow(u, 1.25) * w;
}
// Belly cut on the back, bass side of the upper bout (positive z).
function bellyCut(x: number, y: number) {
  const u = Math.max(0, (-x - 0.045) / 0.1);
  const w = smooth(0.25, 0.34, y) * (1 - smooth(0.43, 0.49, y));
  return 0.0095 * Math.pow(u, 1.5) * w;
}
const E = 1e-4;
function nFront(x: number, y: number) {
  const dx = (armCut(x + E, y) - armCut(x - E, y)) / (2 * E);
  const dy = (armCut(x, y + E) - armCut(x, y - E)) / (2 * E);
  return new THREE.Vector3(-dx, -dy, 1).normalize();
}
function nBack(x: number, y: number) {
  const dx = (bellyCut(x + E, y) - bellyCut(x - E, y)) / (2 * E);
  const dy = (bellyCut(x, y + E) - bellyCut(x, y - E)) / (2 * E);
  return new THREE.Vector3(dx, dy, -1).normalize();
}

// Midpoint subdivision of cap triangles that touch a contour region.
function subdivide(p0: V2[], f0: number[][], reg: number[], levels: number) {
  const pts = p0.slice();
  let tris = f0.map((f) => [f[0], f[1], f[2]]);
  for (let l = 0; l < levels; l++) {
    const cache = new Map<string, number>();
    const mid = (a: number, b: number) => {
      const k = a < b ? a + '_' + b : b + '_' + a;
      let m = cache.get(k);
      if (m === undefined) {
        m = pts.length;
        pts.push([(pts[a][0] + pts[b][0]) / 2, (pts[a][1] + pts[b][1]) / 2]);
        cache.set(k, m);
      }
      return m;
    };
    const next: number[][] = [];
    for (const t of tris) {
      const [a, b, c] = t;
      const xs = [pts[a][0], pts[b][0], pts[c][0]], ys = [pts[a][1], pts[b][1], pts[c][1]];
      const hit = Math.max(...xs) >= reg[0] && Math.min(...xs) <= reg[2] && Math.max(...ys) >= reg[1] && Math.min(...ys) <= reg[3];
      if (hit) {
        const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      } else next.push(t);
    }
    tris = next;
  }
  return { pts, tris };
}

function buildBody() {
  const N = 220;
  const P = closedCurve(BODY_PTS, N);
  const NO = outward(P);
  const r = 0.0095; // edge roundover
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const U = (x: number, y: number) => [(x + 0.18) / 0.36, y / 0.48];
  const S = 6;
  const prof: [number, boolean][] = [];
  for (let k = 0; k <= S; k++) prof.push([-Math.PI / 2 + (k / S) * (Math.PI / 2), false]);
  for (let k = 0; k <= S; k++) prof.push([(k / S) * (Math.PI / 2), true]);
  for (const [phi, front] of prof) {
    const inset = r * (1 - Math.cos(phi));
    const c = Math.cos(phi), s = Math.sin(phi);
    for (let i = 0; i < N; i++) {
      const [ox, oy] = NO[i];
      const x = P[i][0] - ox * inset, y = P[i][1] - oy * inset;
      let z: number, n: THREE.Vector3;
      if (front) {
        z = ZF - r + r * s + armCut(x, y);
        n = nFront(x, y).multiplyScalar(s).add(new THREE.Vector3(ox * c, oy * c, 0)).normalize();
      } else {
        z = ZB + r + r * s + bellyCut(x, y);
        n = nBack(x, y).multiplyScalar(-s).add(new THREE.Vector3(ox * c, oy * c, 0)).normalize();
      }
      pos.push(x, y, z);
      nor.push(n.x, n.y, n.z);
      uv.push(...U(x, y));
    }
  }
  const RN = prof.length;
  for (let j = 0; j < RN - 1; j++)
    for (let i = 0; i < N; i++) {
      const a = j * N + i, b = j * N + ((i + 1) % N), c = (j + 1) * N + ((i + 1) % N), d = (j + 1) * N + i;
      idx.push(a, b, c, a, c, d);
    }
  // Caps.
  const inner = P.map(([px, py], i) => [px - NO[i][0] * r, py - NO[i][1] * r] as V2);
  const faces = THREE.ShapeUtils.triangulateShape(inner.map(([x, y]) => new THREE.Vector2(x, y)), []);
  for (const front of [true, false]) {
    const reg = front ? [-0.2, -0.01, -0.068, 0.31] : [-0.2, 0.24, -0.045, 0.5];
    const { pts, tris } = subdivide(inner, faces, reg, 3);
    const base = pos.length / 3;
    for (const [x, y] of pts) {
      const z = front ? ZF + armCut(x, y) : ZB + bellyCut(x, y);
      const n = front ? nFront(x, y) : nBack(x, y);
      pos.push(x, y, z);
      nor.push(n.x, n.y, n.z);
      uv.push(...U(x, y));
    }
    for (const [a, b, c] of tris) {
      const area = (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[c][0] - pts[a][0]) * (pts[b][1] - pts[a][1]);
      if (area > 0 === front) idx.push(base + a, base + b, base + c);
      else idx.push(base + a, base + c, base + b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return { geo: g, outline: P, normals: NO };
}

// ---------------------------------------------------------------- pickguard
const GUARD_PTS: V2[] = [
  [0.1136, 0.3592],
  [0.1212, 0.3506],
  [0.1248, 0.3389],
  [0.1257, 0.326],
  [0.1239, 0.3135],
  [0.1204, 0.3018],
  [0.1159, 0.2904],
  [0.1106, 0.2794],
  [0.1053, 0.2684],
  [0.1017, 0.2566],
  [0.0997, 0.2442],
  [0.0997, 0.2312],
  [0.1015, 0.2188],
  [0.1048, 0.2069],
  [0.1094, 0.1972],
  [0.1153, 0.1869],
  [0.121, 0.176],
  [0.1263, 0.1653],
  [0.1296, 0.1536],
  [0.1265, 0.1425],
  [0.1169, 0.1375],
  [0.1063, 0.1426],
  [0.0974, 0.152],
  [0.088, 0.1603],
  [0.0778, 0.1671],
  [0.0666, 0.1719],
  [0.0549, 0.1754],
  [0.0465, 0.1785],
  [0.0455, 0.192],
  [0.04, 0.1975],
  [0, 0.1975],
  [-0.042, 0.1975],
  [-0.0485, 0.1925],
  [-0.0563, 0.1999],
  [-0.0603, 0.2115],
  [-0.0601, 0.2246],
  [-0.0575, 0.2367],
  [-0.0537, 0.2484],
  [-0.0502, 0.2602],
  [-0.0477, 0.2723],
  [-0.0464, 0.285],
  [-0.0462, 0.2981],
  [-0.0465, 0.3112],
  [-0.0477, 0.3239],
  [-0.049, 0.3364],
  [-0.0465, 0.346],
  [-0.0375, 0.3425],
  [-0.0302, 0.335],
  [-0.0296, 0.316],
  [-0.0283, 0.3065],
  [-0.023, 0.2992],
  [-0.012, 0.2975],
  [0.012, 0.2975],
  [0.023, 0.2992],
  [0.0283, 0.3065],
  [0.0298, 0.3062],
  [0.0379, 0.3016],
  [0.0497, 0.2981],
  [0.0626, 0.2973],
  [0.0748, 0.2997],
  [0.0858, 0.3052],
  [0.0953, 0.3136],
  [0.1024, 0.3238],
  [0.1075, 0.3349],
  [0.1108, 0.3466],
];

// ---------------------------------------------------------------- build
export function buildGuitar(): THREE.Group {
  const root = new THREE.Group();
  const g = new THREE.Group();
  root.add(g);

  // Materials.
  const alder = alderTexture();
  const wood = new THREE.MeshPhysicalMaterial({
    map: alder,
    bumpMap: alder,
    bumpScale: 0.4,
    roughness: 0.52,
    // Satin finish: a thin clearcoat that sheens but never mirrors.
    clearcoat: 0.45,
    clearcoatRoughness: 0.42,
  });
  const mapleTex = mapleTexture();
  mapleTex.repeat.set(1, 1);
  const maple = std(0xffffff, 0.55, 0, { map: mapleTex });
  const rosewood = std(0xffffff, 0.75, 0, { map: rosewoodTexture() });
  const guardWhite = std(0xf2f0e9, 0.38);
  const guardBlack = std(0x141312, 0.4);
  const blackPlastic = std(0x151413, 0.42);
  const chrome = metal(0xe6e6e6, 0.16);
  const nickel = metal(0xd9d4c8, 0.28);
  const steel = metal(0xdcdcdc, 0.25);
  const wound = metal(0xc8bba0, 0.38);
  const pearl = std(0xf1eee6, 0.3);
  const nutMat = std(0xefe9da, 0.45);
  const dark = std(0x0d0c0b, 0.6);
  const logo = new THREE.MeshStandardMaterial({ map: logoTexture(), transparent: true, roughness: 0.4, depthWrite: false });

  const chromeG: G[] = [], blackG: G[] = [], darkG: G[] = [], nickelG: G[] = [], whiteG: G[] = [], poleG: G[] = [];

  // Body ------------------------------------------------------------------
  const body = buildBody();
  g.add(mesh(body.geo, wood));
  const P = body.outline, NO = body.normals;

  // Pickguard: white / black / white.
  const gShape = new THREE.Shape(closedCurve(GUARD_PTS, 200).map(([x, y]) => new THREE.Vector2(x, y)));
  const layer = (z0: number, th: number, bevel: boolean) => {
    const geo = new THREE.ExtrudeGeometry(gShape, {
      depth: bevel ? th - 0.0006 : th,
      bevelEnabled: bevel,
      bevelThickness: 0.0006,
      bevelSize: 0.0007,
      bevelOffset: -0.0007,
      bevelSegments: 2,
      curveSegments: 4,
    });
    geo.translate(0, 0, z0 + (bevel ? 0 : 0));
    return geo;
  };
  g.add(mesh(layer(ZF, 0.001, false), guardWhite, false));
  g.add(mesh(layer(ZF + 0.001, 0.0004, false), guardBlack, false));
  g.add(mesh(layer(ZF + 0.0014, 0.0011, true), guardWhite, false));
  // Guard screws, evenly round the edge, inset.
  {
    const gp = closedCurve(GUARD_PTS, 200);
    const gn = outward(gp);
    const picks = [6, 22, 38, 56, 74, 98, 116, 136, 150, 168, 186];
    for (const k of picks) {
      const x = gp[k][0] - gn[k][0] * 0.0045, y = gp[k][1] - gn[k][1] * 0.0045;
      chromeG.push(at(dome(0.0027, 0.0012), x, y, ZG));
    }
  }

  // Neck and middle pickups: white single-coil covers on the guard.
  const singleCoil = (y: number) => {
    const cover = new THREE.ExtrudeGeometry(stadium(0.071, 0.0168), {
      depth: 0.0042,
      bevelEnabled: true,
      bevelThickness: 0.0014,
      bevelSize: 0.0014,
      bevelOffset: -0.0014,
      bevelSegments: 3,
      curveSegments: 12,
    });
    whiteG.push(at(cover, 0, y, ZG + 0.0014));
    const top = ZG + 0.0014 + 0.0042 + 0.0014;
    for (let i = 0; i < 6; i++) {
      const p = new THREE.CylinderGeometry(0.00235, 0.00235, 0.0006, 10);
      poleG.push(at(p, strX(i, y), y, top - 0.0002, Math.PI / 2));
    }
    for (const s of [-1, 1]) chromeG.push(at(dome(0.0021, 0.0009), s * 0.0392, y, ZG));
  };
  const Y_NECK_PU = 0.2829;
  const Y_MID_PU = 0.236;
  const Y_HUM = 0.1748;
  singleCoil(Y_NECK_PU);
  singleCoil(Y_MID_PU);

  // Bridge humbucker: white open bobbins in a black mounting ring.
  {
    const rw = 0.0876, rh = 0.0442;
    const ring = new THREE.Shape();
    const rr = 0.003;
    ring.moveTo(-rw / 2 + rr, -rh / 2);
    ring.lineTo(rw / 2 - rr, -rh / 2);
    ring.quadraticCurveTo(rw / 2, -rh / 2, rw / 2, -rh / 2 + rr);
    ring.lineTo(rw / 2, rh / 2 - rr);
    ring.quadraticCurveTo(rw / 2, rh / 2, rw / 2 - rr, rh / 2);
    ring.lineTo(-rw / 2 + rr, rh / 2);
    ring.quadraticCurveTo(-rw / 2, rh / 2, -rw / 2, rh / 2 - rr);
    ring.lineTo(-rw / 2, -rh / 2 + rr);
    ring.quadraticCurveTo(-rw / 2, -rh / 2, -rw / 2 + rr, -rh / 2);
    const hole = new THREE.Path();
    const hw2 = 0.0352, hh2 = 0.0172;
    hole.moveTo(-hw2, -hh2);
    hole.lineTo(hw2, -hh2);
    hole.lineTo(hw2, hh2);
    hole.lineTo(-hw2, hh2);
    hole.lineTo(-hw2, -hh2);
    ring.holes.push(hole);
    const ringGeo = new THREE.ExtrudeGeometry(ring, {
      depth: 0.0026,
      bevelEnabled: true,
      bevelThickness: 0.0006,
      bevelSize: 0.0006,
      bevelOffset: -0.0006,
      bevelSegments: 2,
      curveSegments: 4,
    });
    blackG.push(at(ringGeo, 0, Y_HUM, ZF + 0.0006));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) chromeG.push(at(dome(0.0019, 0.0008), sx * 0.0395, Y_HUM + sy * 0.0175, ZF + 0.0038));
    darkG.push(at(new THREE.BoxGeometry(0.07, 0.034, 0.002), 0, Y_HUM, ZF + 0.001));
    for (const s of [-1, 1]) {
      const bob = new THREE.ExtrudeGeometry(stadium(0.0666, 0.0164), {
        depth: 0.0054,
        bevelEnabled: true,
        bevelThickness: 0.0009,
        bevelSize: 0.0009,
        bevelOffset: -0.0009,
        bevelSegments: 2,
        curveSegments: 10,
      });
      const by = Y_HUM + s * 0.00885;
      whiteG.push(at(bob, 0, by, ZF + 0.0018));
      const top = ZF + 0.0018 + 0.0054 + 0.0009;
      for (let i = 0; i < 6; i++) {
        const x = strX(i, by);
        if (s < 0) {
          // Adjustable screw poles on the bridge-side coil.
          poleG.push(at(new THREE.CylinderGeometry(0.0021, 0.0021, 0.0012, 14), x, by, top + 0.0002, Math.PI / 2));
          darkG.push(at(new THREE.BoxGeometry(0.003, 0.0005, 0.0003), x, by, top + 0.0009));
        } else {
          poleG.push(at(new THREE.CylinderGeometry(0.0024, 0.0024, 0.0006, 14), x, by, top - 0.0002, Math.PI / 2));
        }
      }
    }
  }

  // Vintage-style tremolo: plate with the arm tab, six bent-steel saddles,
  // pivot screws, intonation screws and springs. No arm is fitted.
  {
    const front = 0.1418, back = 0.1015, w = 0.071;
    chromeG.push(at(new RoundedBoxGeometry(w, front - back, 0.0022, 2, 0.0008), -0.0015, (front + back) / 2, ZF + 0.0011));
    chromeG.push(at(new RoundedBoxGeometry(0.012, 0.022, 0.0034, 2, 0.0012), 0.0375, 0.1125, ZF + 0.0017));
    chromeG.push(at(new RoundedBoxGeometry(w - 0.004, 0.0019, 0.0085, 2, 0.0007), -0.0015, back + 0.001, ZF + 0.0042));
    for (let k = 0; k < 6; k++) chromeG.push(at(dome(0.0027, 0.0012), -0.0275 + k * 0.011, 0.1368, ZF + 0.0022));
    for (let i = 0; i < 6; i++) {
      const x = SAD_X(i), ys = Y_SADDLE - COMP[i];
      const top = Z_SAD(i) - GAUGE[i];
      const bottom = ZF + 0.0022;
      const len = 0.0175;
      const cy = ys - len / 2 + 0.0018;
      // Bent-steel saddle: a low base with a raised front lip the string breaks over.
      chromeG.push(at(new RoundedBoxGeometry(0.0098, len, 0.0022, 2, 0.0006), x, cy, bottom + 0.0011));
      chromeG.push(at(new RoundedBoxGeometry(0.0098, 0.0035, top - bottom, 2, 0.001), x, ys - 0.0005, (top + bottom) / 2));
      chromeG.push(at(new RoundedBoxGeometry(0.0098, 0.0028, (top - bottom) * 0.75, 2, 0.0008), x, cy - len / 2 + 0.0014, bottom + (top - bottom) * 0.375));
      for (const s of [-1, 1]) {
        nickelG.push(at(new THREE.CylinderGeometry(0.0013, 0.0013, top - bottom - 0.001, 8), x + s * 0.0027, cy - 0.002, bottom + (top - bottom - 0.001) / 2, Math.PI / 2));
        darkG.push(at(new THREE.CylinderGeometry(0.0008, 0.0008, 0.0002, 6), x + s * 0.0027, cy - 0.002, top - 0.0009, Math.PI / 2));
      }
      const ya = cy - len / 2, yb = back + 0.002;
      chromeG.push(rod(new THREE.Vector3(x, ya, bottom + 0.0028), new THREE.Vector3(x, yb, bottom + 0.0028), 0.0011, 8));
      nickelG.push(rod(new THREE.Vector3(x, ya - 0.0003, bottom + 0.0028), new THREE.Vector3(x, ya - 0.0055, bottom + 0.0028), 0.0019, 8));
    }
  }

  // Controls: chrome dome knobs on the body, 5-way lever on the guard.
  {
    const knob = () => {
      const k = lathe(
        [
          [0, 0],
          [0.0094, 0],
          [0.0096, 0.0006],
          [0.0096, 0.0035],
          [0.0096, 0.0112],
          [0.0093, 0.0127],
          [0.0084, 0.0138],
          [0.0068, 0.0145],
          [0.0038, 0.0149],
          [0, 0.015],
        ],
        48,
      );
      const p = k.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y > 0.001 && y < 0.0113) {
          const f = 1 + 0.035 * Math.cos(24 * Math.atan2(p.getX(i), p.getZ(i)));
          p.setX(i, p.getX(i) * f);
          p.setZ(i, p.getZ(i) * f);
        }
      }
      k.computeVertexNormals();
      k.rotateX(Math.PI / 2);
      return k;
    };
    chromeG.push(at(knob(), 0.0684, 0.1512, ZF));
    chromeG.push(at(knob(), 0.0994, 0.0989, ZF));
    const sx = 0.107, sy = 0.1714, a = 0.42;
    darkG.push(at(new RoundedBoxGeometry(0.0045, 0.025, 0.0004, 2, 0.0015), sx, sy, ZG + 0.0001, 0, 0, a));
    // Lever in the middle position.
    const base = new THREE.Vector3(sx, sy, ZG);
    chromeG.push(rod(base, base.clone().add(new THREE.Vector3(0, 0, 0.0075)), 0.0011, 6));
    const tip = new RoundedBoxGeometry(0.0062, 0.0078, 0.0095, 2, 0.0028);
    tip.rotateZ(a);
    whiteG.push(tip.translate(sx, sy, ZG + 0.011));
  }

  // Output jack on the treble-side edge, strap buttons at the bottom and horn.
  const ptNear = (f: (p: V2) => number) => {
    let best = 0;
    for (let i = 1; i < P.length; i++) if (f(P[i]) < f(P[best])) best = i;
    return best;
  };
  {
    const j = ptNear(([x, y]) => (x < 0 ? 9 : Math.abs(y - 0.042)));
    const o = new THREE.Vector3(P[j][0], P[j][1], 0), n = new THREE.Vector3(NO[j][0], NO[j][1], 0);
    chromeG.push(along(new THREE.CylinderGeometry(0.0115, 0.0115, 0.0012, 32).translate(0, 0.0006, 0), o, n));
    chromeG.push(along(new THREE.CylinderGeometry(0.0062, 0.0062, 0.0034, 6).translate(0, 0.0017, 0), o, n));
    darkG.push(along(new THREE.CylinderGeometry(0.0033, 0.0033, 0.0002, 16).translate(0, 0.0035, 0), o, n));
  }
  const strapButton = () =>
    lathe(
      [
        [0, 0],
        [0.0058, 0],
        [0.0058, 0.0014],
        [0.0031, 0.0021],
        [0.0033, 0.006],
        [0.0058, 0.0084],
        [0.006, 0.0096],
        [0.0045, 0.0114],
        [0, 0.0118],
      ],
      20,
    );
  const jb = ptNear(([, y]) => y);
  chromeG.push(along(strapButton(), new THREE.Vector3(P[jb][0], P[jb][1], 0), new THREE.Vector3(0, -1, 0)));
  const jh = ptNear(([x, y]) => (x > 0 ? 9 : -y));
  chromeG.push(along(strapButton(), new THREE.Vector3(P[jh][0], P[jh][1], 0), new THREE.Vector3(NO[jh][0], NO[jh][1], 0)));

  // Back: neck plate with four bolts, tremolo cavity cover.
  {
    const ny = 0.298;
    chromeG.push(at(new RoundedBoxGeometry(0.051, 0.05, 0.0012, 2, 0.005), 0, ny, ZB - 0.0006));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) chromeG.push(at(dome(0.0035, 0.0016), sx * 0.0185, ny + sy * 0.0175, ZB - 0.0012, Math.PI));
    blackG.push(at(new RoundedBoxGeometry(0.075, 0.088, 0.0016, 2, 0.008), 0, Y_SADDLE - 0.002, ZB - 0.0008));
    for (let i = 0; i < 6; i++) darkG.push(at(new RoundedBoxGeometry(0.0042, 0.0075, 0.0008, 2, 0.0018), SAD_X(i) * 0.9, Y_SADDLE - 0.02, ZB - 0.0018));
  }

  // Neck -----------------------------------------------------------------
  {
    const y0 = Y_BOARD_END - 0.0004, y1 = Y_NUT + 0.012;
    const NS = 64, K = 26;
    const neck = grid(NS, K, (i, k) => {
      const y = y0 + ((y1 - y0) * i) / NS;
      const d = Y_NUT - y;
      const w = y > Y_NUT ? 0.041 : neckW(y);
      let D = y > Y_NUT ? 0.0145 : 0.0147 + 0.002 * Math.min(1, d / 0.324) + Math.max(0, d - 0.324) * 0.004;
      let n = 2.5;
      const heel = smooth(0.4, 0.372, y);
      n += heel * 8;
      const hs = smooth(Y_NUT - 0.012, Y_NUT + 0.008, y);
      n += hs * 6;
      D = D * (1 - hs) + 0.0145 * hs;
      const phi = (Math.PI * k) / K;
      const c = Math.cos(phi), s = Math.sin(phi);
      return [(w / 2) * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), y, ZNT - D * Math.pow(Math.abs(s), 2 / n)];
    });
    planarUV(neck, 4, 0.5, 0.9, 0);
    g.add(mesh(neck, maple));

    // Headstock.
    const H: V2[] = HEAD_PX.map(([x, y]) => [(x - 649.5) * PX, (755 - y) * PX] as V2);
    const hs = new THREE.Shape(closedCurve(H, 150).map(([x, y]) => new THREE.Vector2(x, y + Y_NUT)));
    const head = new THREE.ExtrudeGeometry(hs, {
      depth: 0.0115,
      bevelEnabled: true,
      bevelThickness: 0.0015,
      bevelSize: 0.0015,
      bevelOffset: -0.0015,
      bevelSegments: 2,
      curveSegments: 4,
    });
    head.translate(0, 0, ZNT - 0.013);
    planarUV(head, 4, 0.5, 0.9, 0);
    g.add(mesh(head, maple));
    const decal = new THREE.PlaneGeometry(0.09, 0.195);
    g.add(mesh(at(decal, 0.011, Y_NUT + 0.0975, ZNT + 0.0002), logo, false));
    // Truss-rod cover just above the nut.
    blackG.push(at(new RoundedBoxGeometry(0.0088, 0.019, 0.0008, 2, 0.0036), 0, Y_NUT + 0.0125, ZNT + 0.0004));
    chromeG.push(at(dome(0.0016, 0.0006), 0, Y_NUT + 0.0165, ZNT + 0.0008));

    // Fretboard: radiused rosewood.
    const NB = 40, KB = 12;
    const bw = (y: number) => neckW(y) - 0.0004;
    const by = (i: number) => Y_BOARD_END + ((Y_NUT - Y_BOARD_END) * i) / NB;
    const top = grid(NB, KB, (i, k) => {
      const y = by(i), w = bw(y), x = -w / 2 + (w * k) / KB;
      return [x, y, boardTop(x)];
    });
    const sideL = grid(NB, 1, (i, k) => {
      const y = by(i), x = -bw(y) / 2;
      return [x, y, k ? boardTop(x) : ZNT];
    });
    const sideR = grid(
      NB,
      1,
      (i, k) => {
        const y = by(i), x = bw(y) / 2;
        return [x, y, k ? boardTop(x) : ZNT];
      },
      true,
    );
    const endW = bw(Y_BOARD_END);
    const end = grid(KB, 1, (k, j) => {
      const x = -endW / 2 + (endW * k) / KB;
      return [x, Y_BOARD_END, j ? ZNT : boardTop(x)];
    });
    const board = merge([top, sideL, sideR, end]);
    planarUV(board, 1 / 0.06, 0.5, 1 / 0.5, -Y_BOARD_END / 0.5);
    g.add(mesh(board, rosewood));

    // Frets (medium), dots, side dots, nut.
    const frets: G[] = [];
    for (let k = 1; k <= 22; k++) {
      const y = fretY(k), w = bw(y) - 0.0006;
      const f = new THREE.CylinderGeometry(0.00115, 0.00115, w, 8, 8);
      f.rotateZ(Math.PI / 2);
      f.scale(1, 1, 0.95);
      const p = f.getAttribute('position');
      for (let v = 0; v < p.count; v++) {
        const x = p.getX(v);
        const end = smooth(w / 2 - 0.0012, w / 2, Math.abs(x));
        p.setZ(v, p.getZ(v) * (1 - end * 0.6) + boardTop(x) - 0.0001);
        p.setY(v, p.getY(v) + y);
      }
      f.computeVertexNormals();
      frets.push(f);
    }
    g.add(mesh(merge(frets), nickel));
    const dots: G[] = [];
    const between = (k: number) => (fretY(k) + fretY(k - 1)) / 2;
    for (const k of [3, 5, 7, 9, 12, 15, 17, 19, 21]) {
      const y = between(k);
      const xs = k === 12 ? [-0.0105, 0.0105] : [0];
      for (const x of xs) dots.push(at(new THREE.CylinderGeometry(0.003, 0.003, 0.0006, 20), x, y, boardTop(x) - 0.00025, Math.PI / 2));
      const sx = -bw(y) / 2 - 0.0002;
      const sdy = k === 12 ? [-0.0035, 0.0035] : [0];
      for (const dy of sdy) dots.push(at(new THREE.CylinderGeometry(0.001, 0.001, 0.0006, 10), sx, y + dy, ZNT + 0.0036, 0, 0, Math.PI / 2));
    }
    g.add(mesh(merge(dots), pearl, false));
    const hN = FB + 0.0024;
    const nut = new THREE.BoxGeometry(0.0412, 0.0034, hN, 10, 1, 1);
    const np = nut.getAttribute('position');
    for (let v = 0; v < np.count; v++) if (np.getZ(v) > 0) np.setZ(v, np.getZ(v) - sag(np.getX(v)));
    nut.computeVertexNormals();
    g.add(mesh(at(nut, 0, Y_NUT + 0.0017, ZNT + hN / 2), nutMat));
  }

  // Tuners, string trees and strings ------------------------------------
  const POSTS_PX: V2[] = [
    [565, 590],
    [593, 503],
    [620, 412],
    [648, 320],
    [678, 228],
    [708, 140],
  ];
  const postX = (i: number) => (POSTS_PX[i][0] - 649.5) * PX;
  const postY = (i: number) => Y_NUT + (755 - POSTS_PX[i][1]) * PX;
  {
    const zBack = ZNT - 0.0145;
    for (let i = 0; i < 6; i++) {
      const x = postX(i), y = postY(i);
      chromeG.push(at(new THREE.CylinderGeometry(0.0056, 0.0056, 0.0005, 20), x, y, ZNT + 0.00025, Math.PI / 2));
      chromeG.push(at(new THREE.CylinderGeometry(0.0055, 0.006, 0.0022, 24), x, y, ZNT + 0.0016, Math.PI / 2));
      chromeG.push(at(new THREE.CylinderGeometry(0.0029, 0.0029, 0.0105, 16), x, y, ZNT + 0.0023 + 0.00525, Math.PI / 2));
      chromeG.push(at(dome(0.0029, 0.001, 10), x, y, ZNT + 0.0128));
      darkG.push(at(new THREE.BoxGeometry(0.0062, 0.0009, 0.0016), x, y, ZNT + 0.0082));
      // Sealed housing behind, shaft and key out past the bass edge.
      const d = new THREE.Vector2(-0.95, 0.31);
      const rz = Math.atan2(d.y, d.x);
      const zc = zBack - 0.005;
      chromeG.push(at(new RoundedBoxGeometry(0.019, 0.0145, 0.0095, 2, 0.0025), x + d.x * 0.003, y + d.y * 0.003, zBack - 0.00475, 0, 0, rz));
      chromeG.push(rod(new THREE.Vector3(x + d.x * 0.012, y + d.y * 0.012, zc), new THREE.Vector3(x + d.x * 0.017, y + d.y * 0.017, zc), 0.0017, 10));
      chromeG.push(at(new RoundedBoxGeometry(0.0165, 0.0155, 0.0055, 3, 0.0026), x + d.x * 0.0235, y + d.y * 0.0235, zc, 0, 0, rz));
      chromeG.push(at(new THREE.CylinderGeometry(0.0031, 0.0027, 0.005, 12), x + d.x * 0.0155, y + d.y * 0.0155, zc, 0, 0, rz + Math.PI / 2));
    }
  }
  const plain: G[] = [], wnd: G[] = [];
  const treeY = Y_NUT + 0.096;
  {
    for (let i = 0; i < 6; i++) {
      const r = GAUGE[i];
      const ys = Y_SADDLE - COMP[i];
      const pts: THREE.Vector3[] = [];
      // From the plate hole, over the saddle, to the nut and the tuner post.
      pts.push(new THREE.Vector3(SAD_X(i), Y_SADDLE - 0.024, ZF + 0.0024));
      pts.push(new THREE.Vector3(SAD_X(i), ys - 0.012, Z_SAD(i) - 0.0004));
      pts.push(new THREE.Vector3(SAD_X(i), ys, Z_SAD(i)));
      pts.push(new THREE.Vector3(NUT_X(i), Y_NUT, Z_NUT(i)));
      const post = new THREE.Vector3(postX(i) + 0.0029 + r, postY(i), ZNT + (i >= 4 ? 0.0052 : 0.0068));
      if (i >= 4) {
        const t = (treeY - Y_NUT) / (post.y - Y_NUT);
        pts.push(new THREE.Vector3(NUT_X(i) + (post.x - NUT_X(i)) * t, treeY, ZNT + 0.0033 - r));
      }
      pts.push(post);
      for (let k = 0; k < pts.length - 1; k++) (i < 3 ? wnd : plain).push(rod(pts[k], pts[k + 1], r, i < 3 ? 6 : 5));
      // A few wraps round the post.
      (i < 3 ? wnd : plain).push(
        at(new THREE.TorusGeometry(0.0029 + r, r, 4, 16), postX(i), postY(i), post.z - 0.0012, 0, 0, 0).applyMatrix4(new THREE.Matrix4()),
        at(new THREE.TorusGeometry(0.0029 + r, r, 4, 16), postX(i), postY(i), post.z - 0.0012 - 2.2 * r - 0.0002),
      );
    }
    // Butterfly string tree for the B and E strings.
    const tx = (strTreeX(4) + strTreeX(5)) / 2;
    function strTreeX(i: number) {
      const px = postX(i) + 0.0029 + GAUGE[i];
      return NUT_X(i) + (px - NUT_X(i)) * ((treeY - Y_NUT) / (postY(i) - Y_NUT));
    }
    chromeG.push(at(new THREE.CylinderGeometry(0.0016, 0.0016, 0.0034, 10), tx, treeY, ZNT + 0.0017, Math.PI / 2));
    chromeG.push(at(new RoundedBoxGeometry(0.0125, 0.0045, 0.0011, 2, 0.0004), tx, treeY, ZNT + 0.0039));
    chromeG.push(at(dome(0.0018, 0.0008), tx, treeY, ZNT + 0.0044));
  }
  const sPlain = mesh(merge(plain), steel, false);
  const sWound = mesh(merge(wnd), wound, false);
  g.add(sPlain, sWound);

  // Merged hardware.
  const hw = [
    mesh(merge(chromeG), chrome),
    mesh(merge(nickelG), nickel),
    mesh(merge(blackG), blackPlastic),
    mesh(merge(darkG), dark, false),
    mesh(merge(whiteG), std(0xf3f1ea, 0.4)),
    mesh(merge(poleG), metal(0x8a8780, 0.35), false),
  ];
  g.add(...hw);
  for (const o of [...hw, sPlain, sWound]) useStudioWhenNeeded(o);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material === nickel) useStudioWhenNeeded(o as THREE.Mesh);
  });

  // Strap button touches y = 0.
  const minY = P[jb][1];
  g.position.y = 0.0118 - minY;


  return root;
}
