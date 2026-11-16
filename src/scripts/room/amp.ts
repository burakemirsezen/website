// Part of the listening room. See kit.ts for the conventions.
//
// Boss Katana-Mini (the original, black): 230 W x 181 H (to the top of the
// handle) x 116 D mm, matched to a front product photo. A black cabinet
// with moulded corner caps, a black perforated metal grille framed by the
// cabinet's bezel, two white strips across the top and bottom of the
// grille, the chrome BOSS badge with the katana (刀) tab below it, seven
// fluted knobs along the front edge of the top (gain, volume, bass, middle,
// treble, delay time and level), the input jack on the left, the type and
// power switches, aux in and phones jacks, an arched carry handle, and
// small feet.

import { THREE, std, mesh, canvasTexture, RoundedBoxGeometry, sg, bq, bakeQuality, greyCanvas, normalFromHeight, dataTexture, rng } from './kit';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Collects static parts per material and merges them into one mesh each.
class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(geo: THREE.BufferGeometry, mat: THREE.Material, pos?: THREE.Vector3Tuple, rot?: THREE.Vector3Tuple) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0])));
    m.compose(new THREE.Vector3(...(pos ?? [0, 0, 0])), q, new THREE.Vector3(1, 1, 1));
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.clearGroups();
    g.applyMatrix4(m);
    const list = this.parts.get(mat) ?? [];
    list.push(g);
    this.parts.set(mat, list);
  }
  flush(into: THREE.Group, shadows = true) {
    for (const [mat, list] of this.parts) into.add(mesh(mergeGeometries(list)!, mat, shadows));
    this.parts.clear();
  }
}

// Dimensions (m), measured off the product photo (230 mm wide).
const W = 0.23;
const D = 0.116;
const FOOT = 0.004;
const H = 0.141; // cabinet, without feet and handle
const TOP = FOOT + H;
const CY = FOOT + H / 2;
const HANDLE_TOP = 0.181;
// Grille opening in the bezel and the white strips over it.
const GW = 0.212;
const GH = 0.125;
// Knob row along the front edge of the top, left to right.
const KZ = 0.036;
const KNOBS = [-0.0635, -0.0386, -0.0163, 0.0051, 0.0275, 0.0498, 0.0721];
const LABELS = ['GAIN', 'VOLUME', 'BASS', 'MIDDLE', 'TREBLE', 'TIME', 'LEVEL'];
const SETTINGS = [0.55, 0.45, 0.5, 0.6, 0.55, 0.35, 0.3];

function roundedRect(w: number, h: number, r: number, dy = 0, path: THREE.Path = new THREE.Shape()) {
  path.moveTo(-w / 2 + r, -h / 2 + dy);
  path.lineTo(w / 2 - r, -h / 2 + dy);
  path.quadraticCurveTo(w / 2, -h / 2 + dy, w / 2, -h / 2 + r + dy);
  path.lineTo(w / 2, h / 2 - r + dy);
  path.quadraticCurveTo(w / 2, h / 2 + dy, w / 2 - r, h / 2 + dy);
  path.lineTo(-w / 2 + r, h / 2 + dy);
  path.quadraticCurveTo(-w / 2, h / 2 + dy, -w / 2, h / 2 - r + dy);
  path.lineTo(-w / 2, -h / 2 + r + dy);
  path.quadraticCurveTo(-w / 2, -h / 2 + dy, -w / 2 + r, -h / 2 + dy);
  return path;
}

// Black perforated metal grille: staggered round holes about 1 mm apart.
const perforatedCache = new Map<boolean, THREE.Texture>();
function perforated(bump: boolean) {
  const hit = perforatedCache.get(bump);
  if (hit) return hit;
  const t = canvasTexture(64, 64, (g) => {
    g.fillStyle = bump ? '#ffffff' : '#3c3c3c';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = bump ? '#000000' : '#050505';
    for (let row = 0; row < 8; row++)
      for (let col = 0; col <= 8; col++) {
        const x = col * 8 + (row % 2 ? 4 : 0);
        const y = row * 8 + 4;
        g.beginPath();
        g.arc(x % 64, y, 2.6, 0, Math.PI * 2);
        g.fill();
      }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(GW / 0.0088, GH / 0.0088);
  if (bump) t.colorSpace = THREE.NoColorSpace;
  perforatedCache.set(bump, t);
  return t;
}

// Fine pebble texture of the black plastic shell, as a bump map.
let pebbleTex: THREE.Texture | undefined;
function pebbleBump() {
  if (pebbleTex) return pebbleTex;
  const t = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 256, 256);
    let s = 12345;
    const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 9000; i++) {
      const v = Math.floor(90 + r() * 80);
      g.fillStyle = `rgb(${v} ${v} ${v})`;
      g.beginPath();
      g.arc(r() * 256, r() * 256, 0.6 + r() * 1.4, 0, Math.PI * 2);
      g.fill();
    }
  });
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return (pebbleTex = t);
}

// The chrome BOSS badge: outlined letters with a black fill, on transparent.
let badgeTex: THREE.Texture | undefined;
function bossBadge() {
  if (badgeTex) return badgeTex;
  return (badgeTex = canvasTexture(512, 140, (g) => {
    g.clearRect(0, 0, 512, 140);
    g.font = '900 128px Arial Black, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.save();
    g.translate(256, 74);
    g.scale(1.02, 0.92);
    const grad = g.createLinearGradient(0, -60, 0, 60);
    grad.addColorStop(0, '#f4f4f4');
    grad.addColorStop(0.45, '#c4c4c4');
    grad.addColorStop(0.55, '#d8d8d8');
    grad.addColorStop(1, '#a8a8a8');
    g.lineJoin = 'miter';
    g.lineWidth = 18;
    g.strokeStyle = grad;
    g.strokeText('BOSS', 0, 0);
    g.fillStyle = '#141414';
    g.fillText('BOSS', 0, 0);
    // The thin inner chrome line of the real badge.
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(200 200 200 / 0.5)';
    g.strokeText('BOSS', 0, 0);
    g.restore();
  }));
}

// The katana (刀) tab under the badge.
let tabTex: THREE.Texture | undefined;
function katanaTab() {
  if (tabTex) return tabTex;
  return (tabTex = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#121212';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#3a3a3a';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, 61, 61);
    g.fillStyle = '#d6d6d6';
    g.font = 'bold 46px "Yu Gothic", "MS Gothic", "Noto Sans CJK JP", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('刀', 32, 35);
  }));
}

// Top panel print (white on transparent), for x in [-PW/2, PW/2] and z in
// [Z0, Z1]; the canvas top is toward the back, so it reads from the front.
const PW = 0.22;
const Z0 = -0.055;
const Z1 = 0.056;
const PX = 1400 / PW;
let panelTex: THREE.Texture | undefined;
function panelTexture() {
  if (panelTex) return panelTex;
  const ph = Math.round((Z1 - Z0) * PX);
  // Bake: the same drawing on a 1.46x canvas (4096 px wide once the kit doubles it).
  const BK = bq(1, 2048 / 1400);
  return (panelTex = canvasTexture(Math.round(1400 * BK), Math.round(ph * BK), (g) => {
    g.scale(BK, BK);
    g.clearRect(0, 0, 1400, ph);
    const cx = (x: number) => (x + PW / 2) * PX;
    const cz = (z: number) => (z - Z0) * PX;
    g.fillStyle = '#d9d9d6';
    g.strokeStyle = '#d9d9d6';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 19px Arial, sans-serif';
    KNOBS.forEach((x, i) => {
      g.fillText(LABELS[i], cx(x), cz(KZ - 0.0128));
      for (let k = 0; k <= 10; k++) {
        const a = THREE.MathUtils.degToRad(-135 + k * 27);
        const r = 0.0098 * PX;
        g.beginPath();
        g.arc(cx(x) + Math.sin(a) * r, cz(KZ) - Math.cos(a) * r, k % 5 === 0 ? 2.6 : 1.6, 0, Math.PI * 2);
        g.fill();
      }
    });
    const bracket = (x0: number, x1: number, text: string) => {
      const y = cz(KZ - 0.0168);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx(x0), y + 6);
      g.lineTo(cx(x0), y);
      g.lineTo(cx(x1), y);
      g.lineTo(cx(x1), y + 6);
      g.stroke();
      g.font = 'bold 17px Arial, sans-serif';
      const w = g.measureText(text).width + 14;
      g.clearRect((cx(x0) + cx(x1)) / 2 - w / 2, y - 12, w, 24);
      g.fillText(text, (cx(x0) + cx(x1)) / 2, y);
    };
    bracket(-0.0233, 0.0345, 'EQUALIZER');
    bracket(0.0408, 0.0811, 'DELAY');
    g.font = 'bold 15px Arial, sans-serif';
    g.fillText('INPUT', cx(-0.089), cz(KZ - 0.0105));
    g.fillText('POWER', cx(0.091), cz(KZ - 0.0095));
    // Amp type switch, behind the gain knob.
    g.fillText('TYPE', cx(-0.0505), cz(0.0115));
    g.font = 'bold 12px Arial, sans-serif';
    g.textAlign = 'left';
    ['BROWN', 'CRUNCH', 'CLEAN'].forEach((t, i) => g.fillText(t, cx(-0.0455), cz(0.0045 + i * 0.0045)));
    // Model name and the jacks at the back of the top.
    g.textAlign = 'left';
    g.font = 'italic 900 30px Arial Black, Arial, sans-serif';
    g.fillText('KATANA-MINI', cx(-0.104), cz(-0.044));
    g.textAlign = 'center';
    g.font = 'bold 13px Arial, sans-serif';
    g.fillText('AUX IN', cx(0.062), cz(-0.033));
    g.fillText('PHONES/REC OUT', cx(0.09), cz(-0.033));
  }));
}

export function prewarmAmpTextures(): (() => void)[] {
  return [
    () => {
      pebbleBump();
      perforated(false);
      perforated(true);
      bossBadge();
      katanaTab();
      panelTexture();
    },
  ];
}

// ---------------------------------------------------------------- bake-only detail

// Box-projected UVs in tiles of 1/s metres: each vertex takes the plane its
// normal faces, so a tiling micro-normal keeps one scale on every face.
function boxUV(g: THREE.BufferGeometry, s: number) {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (az >= ax && az >= ay) {
      uv[i * 2] = x * s;
      uv[i * 2 + 1] = y * s;
    } else if (ax >= ay) {
      uv[i * 2] = z * s;
      uv[i * 2 + 1] = y * s;
    } else {
      uv[i * 2] = x * s;
      uv[i * 2 + 1] = z * s;
    }
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// A soft blob on a height canvas, repeated across the edges so tiles wrap.
function wrapBlob(g: CanvasRenderingContext2D, x: number, y: number, r: number, N: number, inner: string) {
  for (const ox of [-N, 0, N])
    for (const oy of [-N, 0, N]) {
      const cx = x + ox, cy = y + oy;
      if (cx + r < 0 || cx - r > N || cy + r < 0 || cy - r > N) continue;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, inner);
      gr.addColorStop(1, 'rgba(128 128 128 / 0)');
      g.fillStyle = gr;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
}

// The cabinet's moulded leather-grain: irregular pebbles ~0.5 mm across, on
// 12 mm tiles (see boxUV).
let pebbleNTex: THREE.Texture | undefined;
function pebbleNormal() {
  if (pebbleNTex) return pebbleNTex;
  const R = rng(5), N = 512;
  const h = greyCanvas(N, N, (g) => {
    g.fillStyle = '#7c7c7c';
    g.fillRect(0, 0, N, N);
    for (let k = 0; k < 1900; k++) wrapBlob(g, R() * N, R() * N, 8 + R() * 7, N, 'rgba(225 225 225 / 0.45)');
    for (let k = 0; k < 2200; k++) wrapBlob(g, R() * N, R() * N, 2 + R() * 3, N, 'rgba(20 20 20 / 0.4)');
  });
  return (pebbleNTex = dataTexture(normalFromHeight(h, 1.5)));
}

// The perforated grille as a true cut-out: round holes you can see the
// speaker through. alpha: white = metal, black = hole. 8 x 8 holes a tile,
// one tile per 8.8 mm, drawn with wrap-around so the tiles join.
function perforatedBake() {
  const N = 512, pitch = N / 8, rr = pitch * 0.325;
  const holes = (g: CanvasRenderingContext2D, fill: string) => {
    g.fillStyle = fill;
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++) {
        const x = col * pitch + (row % 2 ? pitch / 2 : 0);
        const y = row * pitch + pitch / 2;
        for (const ox of [-N, 0, N]) {
          g.beginPath();
          g.arc(x + ox, y, rr, 0, Math.PI * 2);
          g.fill();
        }
      }
  };
  const alpha = dataTexture(
    greyCanvas(N, N, (g) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, N, N);
      holes(g, '#000');
    }),
  );
  const map = canvasTexture(N, N, (g) => {
    g.fillStyle = '#2b2b2c';
    g.fillRect(0, 0, N, N);
    const R = rng(8);
    for (let k = 0; k < 900; k++) {
      g.fillStyle = `rgba(255 255 255 / ${0.02 + R() * 0.04})`;
      g.fillRect(R() * N, R() * N, 2, 1 + R() * 3);
    }
  });
  for (const t of [alpha, map]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(GW / 0.0088, GH / 0.0088);
  }
  return { alpha, map };
}

// A fluted knob built as a turned part: filleted skirt, 20 flutes, a
// chamfered top edge and a very shallow dished face.
function knobGeometryBake() {
  const prof: [number, number][] = [
    [0, 0], [0.0079, 0], [0.0082, 0.0004], [0.0082, 0.0018], [0.0079, 0.0024], [0.0071, 0.0027],
    [0.0069, 0.003], [0.0069, 0.0112], [0.0067, 0.0118], [0.0062, 0.0125], [0.0056, 0.0128],
    [0.0036, 0.01262], [0, 0.0125],
  ];
  // More rows up the flutes, so the fluted sides have vertices to carry them.
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, h0] = prof[i], [r1, h1] = prof[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(r1 - r0, h1 - h0) / 0.0012));
    for (let k = 0; k < n; k++) pts.push(new THREE.Vector2(r0 + ((r1 - r0) * k) / n, h0 + ((h1 - h0) * k) / n));
  }
  pts.push(new THREE.Vector2(prof[prof.length - 1][0], prof[prof.length - 1][1]));
  const geo = new THREE.LatheGeometry(pts, 200);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const sm = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const w = sm(0.0027, 0.0038, y) * (1 - sm(0.0112, 0.0122, y)) * sm(0.004, 0.0066, Math.hypot(x, z));
    if (!w) continue;
    const k = 1 + 0.05 * w * Math.cos(Math.atan2(z, x) * 20);
    p.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

// A knob as in the photo: a wide base skirt and a fluted cap with a flat top.
function knobGeometry() {
  const base = new THREE.CylinderGeometry(0.0079, 0.0082, 0.0026, sg(32));
  base.translate(0, 0.0013, 0);
  const cap = new THREE.CylinderGeometry(0.0066, 0.0069, 0.0098, sg(40), 1);
  const p = cap.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.006) continue; // cap centre vertices
    const a = Math.atan2(z, x);
    const k = 1 + 0.045 * Math.cos(a * 20);
    p.setXYZ(i, x * k, p.getY(i), z * k);
  }
  cap.computeVertexNormals();
  cap.translate(0, 0.0026 + 0.0049, 0);
  // Chamfer ring on the top edge.
  const top = new THREE.CylinderGeometry(0.0058, 0.0066, 0.0008, sg(40));
  top.translate(0, 0.0124 + 0.0004, 0);
  return mergeGeometries([base.toNonIndexed(), cap.toNonIndexed(), top.toNonIndexed()])!;
}
const KH = 0.0128;

// The arched carry handle: a superellipse arch, flat band extruded across
// its width, with thicker feet where it meets the top.
function handleGeometry(halfSpan: number, rise: number, thick: number, width: number) {
  const p = 2.6;
  const arc = (a: number, b: number, n: number) => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= n; i++) {
      const t = (Math.PI * i) / n;
      const c = Math.cos(t);
      const s = Math.sin(t);
      pts.push(new THREE.Vector2(a * Math.sign(c) * Math.pow(Math.abs(c), 2 / p), b * Math.pow(s, 2 / p)));
    }
    return pts;
  };
  const outer = arc(halfSpan, rise, 48);
  const inner = arc(halfSpan - thick * 1.25, rise - thick, 48).reverse();
  const shape = new THREE.Shape([...outer, ...inner]);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.0015,
    bevelSize: 0.0012,
    bevelSegments: sg(2),
    curveSegments: sg(4),
  });
  geo.translate(0, 0, -width / 2);
  return geo;
}

export function buildAmp(): THREE.Group {
  const g = new THREE.Group();
  const batch = new Batch();

  // Materials.
  const shell = bakeQuality()
    ? std(0x191919, 0.58, 0, { normalMap: pebbleNormal(), normalScale: new THREE.Vector2(0.9, 0.9) })
    : std(0x181818, 0.62, 0, { bumpMap: pebbleBump(), bumpScale: 0.15 });
  const capMat = std(0x111111, 0.5);
  const darkPlastic = std(0x0c0c0c, 0.45);
  const rubber = std(0x0a0a0a, 0.95);
  const nickel = std(0xc8c8c4, 0.25, 0.55);
  const knobMat = std(0x141414, 0.5);
  const white = std(0xe8e8e4, 0.6);
  const strip = std(0xf4f4f1, 0.45, 0);
  const grille = bakeQuality()
    ? (() => {
        const pb = perforatedBake();
        return new THREE.MeshPhysicalMaterial({ map: pb.map, alphaMap: pb.alpha, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.42, metalness: 0.55 });
      })()
    : new THREE.MeshStandardMaterial({
        map: perforated(false),
        bumpMap: perforated(true),
        bumpScale: 0.5,
        roughness: 0.55,
        metalness: 0.35,
      });

  // Cabinet, with moulded corner caps proud of every corner.
  if (bakeQuality()) {
    // Bake: the cabinet is a back block and a hollow front frame, so the
    // grille's holes open on a real cavity: baffle, cone, magnet.
    const ZB0 = 0.0265; // front of the back block (the frame overlaps it, hiding its rounded edge)
    const zBack = -0.0027 - (D - 0.007) / 2; // its rear face, as before
    batch.add(boxUV(new RoundedBoxGeometry(W - 0.0016, H - 0.0016, ZB0 - zBack, sg(3), 0.005), 1 / 0.012), shell, [0, CY, (ZB0 + zBack) / 2]);
    const ringShape = roundedRect(W - 0.0016, H - 0.0016, 0.005) as THREE.Shape;
    ringShape.holes.push(roundedRect(GW + 0.002, GH + 0.002, 0.0015, 0, new THREE.Path()));
    batch.add(boxUV(new THREE.ExtrudeGeometry(ringShape, { depth: 0.0518 - 0.0215, bevelEnabled: false, curveSegments: sg(6) }), 1 / 0.012), shell, [0, CY, 0.0215]);
    const baffle = roundedRect(GW + 0.004, GH + 0.004, 0.0015) as THREE.Shape;
    const bh = new THREE.Path();
    bh.absarc(0, 0, 0.0455, 0, Math.PI * 2, true);
    baffle.holes.push(bh);
    batch.add(new THREE.ExtrudeGeometry(baffle, { depth: 0.003, bevelEnabled: false, curveSegments: 64 }), std(0x101010, 0.6), [0, CY, 0.043]);
    // Driver: surround, paper cone, dust cap (profile = [radius, height from the rear]).
    const cone: [number, number][] = [
      [0.0455, 0.0156], [0.0448, 0.0164], [0.0438, 0.0172], [0.0425, 0.017], [0.0412, 0.0152], [0.0405, 0.015],
      [0.0112, 0.003], [0.0105, 0.0034], [0.0095, 0.0042], [0.0072, 0.0058], [0.0035, 0.0069], [0, 0.0072],
    ];
    const dm = new THREE.MeshPhysicalMaterial({ color: 0x1e1e1f, roughness: 0.72, side: THREE.DoubleSide, sheen: 0.3, sheenColor: new THREE.Color(0x555555), sheenRoughness: 0.6 });
    const rm = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0c, roughness: 0.85, side: THREE.DoubleSide });
    const lathe = (pp: [number, number][]) => new THREE.LatheGeometry(pp.map(([r, h]) => new THREE.Vector2(r, h)), 96).rotateX(Math.PI / 2);
    batch.add(lathe(cone.slice(5)), dm, [0, CY, 0.0274]);
    batch.add(lathe(cone.slice(0, 6)), rm, [0, CY, 0.0274]);
    batch.add(new THREE.CylinderGeometry(0.027, 0.027, 0.0035, 48).rotateX(Math.PI / 2), std(0x151515, 0.5, 0.6), [0, CY, 0.0283]);
    batch.add(new THREE.TorusGeometry(0.0462, 0.0012, 8, 96), std(0x151515, 0.5, 0.6), [0, CY, 0.0435]);
  } else {
    batch.add(new RoundedBoxGeometry(W - 0.0016, H - 0.0016, D - 0.007, sg(3), 0.005), shell, [0, CY, -0.0027]);
  }
  const cap = bakeQuality()
    ? boxUV(new RoundedBoxGeometry(0.016, 0.016, 0.016, sg(2), 0.0035), 1 / 0.012)
    : new RoundedBoxGeometry(0.016, 0.016, 0.016, sg(2), 0.0035);
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) batch.add(cap, capMat, [sx * (W / 2 - 0.0078), CY + sy * (H / 2 - 0.0078), sz * (D / 2 - 0.0078)]);

  // Front bezel: the cabinet's front frame around the grille opening.
  const zf = D / 2;
  const GY = CY;
  {
    const outer = roundedRect(W - 0.004, H - 0.004, 0.004) as THREE.Shape;
    outer.holes.push(roundedRect(GW, GH, 0.0015, 0, new THREE.Path()));
    const bez = new THREE.ExtrudeGeometry(outer, {
      depth: 0.0058,
      bevelEnabled: true,
      bevelThickness: 0.0006,
      bevelSize: 0.0006,
      bevelSegments: sg(1),
      curveSegments: sg(4),
    });
    batch.add(bakeQuality() ? boxUV(bez, 1 / 0.012) : bez, shell, [0, CY, zf - 0.0064]);
  }
  // Grille, recessed a few millimetres.
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), grille);
  cloth.position.set(0, GY, zf - 0.0025);
  cloth.receiveShadow = true;
  g.add(cloth);
  // Reveal walls between bezel and grille.
  for (const s of [-1, 1]) {
    batch.add(new THREE.BoxGeometry(GW, 0.0004, 0.0035), darkPlastic, [0, GY + s * (GH / 2 - 0.0002), zf - 0.0008]);
    batch.add(new THREE.BoxGeometry(0.0004, GH, 0.0035), darkPlastic, [s * (GW / 2 - 0.0002), GY, zf - 0.0008]);
  }
  // The two white strips across the top and bottom of the grille.
  const stripGeo = new RoundedBoxGeometry(GW - 0.0008, 0.0043, 0.0016, sg(1), 0.0006);
  for (const y of [TOP - 0.0117, FOOT + 0.0108]) {
    const m = mesh(stripGeo, strip, false);
    m.receiveShadow = false; // too thin for clean shadow-map self-shadowing
    m.position.set(0, y, zf - 0.0018);
    g.add(m);
  }

  // BOSS badge and the katana tab below it.
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.0455, 0.0124),
    new THREE.MeshStandardMaterial({ map: bossBadge(), transparent: true, roughness: 0.35, metalness: 0.1 }),
  );
  badge.position.set(0, TOP - 0.0275, zf - 0.0015);
  g.add(badge);
  batch.add(new THREE.BoxGeometry(0.0064, 0.0064, 0.0012), darkPlastic, [0, TOP - 0.0378, zf - 0.0019]);
  const tab = new THREE.Mesh(
    new THREE.PlaneGeometry(0.006, 0.006),
    new THREE.MeshStandardMaterial({ map: katanaTab(), roughness: 0.4, metalness: 0.3 }),
  );
  tab.position.set(0, TOP - 0.0378, zf - 0.0012);
  g.add(tab);

  // Top panel print.
  const print = new THREE.Mesh(
    new THREE.PlaneGeometry(PW, Z1 - Z0),
    new THREE.MeshStandardMaterial({ map: panelTexture(), roughness: 0.55, transparent: true, depthWrite: false }),
  );
  print.rotation.x = -Math.PI / 2;
  print.position.set(0, TOP + 0.0002, (Z0 + Z1) / 2);
  g.add(print);

  // Knobs, with white pointer lines on their tops.
  const knob = bakeQuality() ? knobGeometryBake() : knobGeometry();
  const pointer = new THREE.BoxGeometry(0.0008, 0.0004, 0.0034);
  KNOBS.forEach((x, i) => {
    batch.add(knob, knobMat, [x, TOP, KZ]);
    const a = THREE.MathUtils.degToRad(135 - SETTINGS[i] * 270);
    const r = 0.0026;
    batch.add(pointer, white, [x - Math.sin(a) * r, TOP + KH, KZ - Math.cos(a) * r], [0, a, 0]);
    // Bake: the moulded bezel ring each knob sits in, with a hair gap round the skirt.
    if (bakeQuality()) {
      batch.add(new THREE.TorusGeometry(0.0089, 0.0006, 6, 48).rotateX(Math.PI / 2), darkPlastic, [x, TOP + 0.0003, KZ]);
      batch.add(new THREE.CylinderGeometry(0.0092, 0.0092, 0.0006, 48, 1, true), darkPlastic, [x, TOP + 0.0001, KZ]);
    }
  });

  // Jacks: a nickel nut and a black hole.
  const jack = (x: number, z: number, r: number) => {
    if (bakeQuality()) {
      // Hex nut, turned ferrule with a rolled lip, and a bore with a dark floor.
      batch.add(new THREE.CylinderGeometry(r * 1.55, r * 1.55, 0.0018, 6), nickel, [x, TOP + 0.0009, z], [0, x * 40, 0]);
      const prof: [number, number][] = [[r * 1.2, 0], [r * 1.2, 0.0026], [r * 0.95, 0.0028], [r * 0.82, 0.0025], [r * 0.78, 0.0021], [r * 0.78, 0.0002]];
      batch.add(new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 64), nickel, [x, TOP, z]);
      batch.add(new THREE.CylinderGeometry(r * 0.77, r * 0.77, 0.0001, 32), rubber, [x, TOP + 0.00025, z]);
      batch.add(new THREE.TorusGeometry(r * 0.36, r * 0.1, 6, 20).rotateX(Math.PI / 2), nickel, [x, TOP + 0.0006, z]);
      return;
    }
    batch.add(new THREE.CylinderGeometry(r * 1.55, r * 1.55, 0.0018, sg(6)), nickel, [x, TOP + 0.0009, z]);
    batch.add(new THREE.CylinderGeometry(r * 1.2, r * 1.2, 0.0026, sg(20)), nickel, [x, TOP + 0.0013, z]);
    batch.add(new THREE.CylinderGeometry(r * 0.75, r * 0.75, 0.0001, sg(16)), rubber, [x, TOP + 0.0027, z]);
  };
  jack(-0.089, KZ, 0.006);
  jack(0.062, -0.043, 0.0033);
  jack(0.09, -0.043, 0.0033);

  // Type switch: a 3-position slide in a slot.
  batch.add(new RoundedBoxGeometry(0.0035, 0.0012, 0.0145, sg(1), 0.0005), darkPlastic, [-0.0505, TOP + 0.0003, 0.009]);
  batch.add(new RoundedBoxGeometry(0.0032, 0.0045, 0.0045, sg(2), 0.0008), knobMat, [-0.0505, TOP + 0.0022, 0.009]);

  // Power: a small black slide switch at the right end, LED beside it.
  batch.add(new RoundedBoxGeometry(0.009, 0.0012, 0.0045, sg(1), 0.0005), darkPlastic, [0.091, TOP + 0.0004, KZ]);
  batch.add(new RoundedBoxGeometry(0.0042, 0.0034, 0.0034, sg(1), 0.0007), knobMat, [0.0928, TOP + 0.0017, KZ]);
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.0014, sg(12), sg(6), 0, Math.PI * 2, 0, Math.PI / 2),
    bakeQuality()
      ? // A red jewel lens: transmissive, tinted through its depth, glowing from within.
        new THREE.MeshPhysicalMaterial({
          color: 0xff3a2a,
          roughness: 0.04,
          transmission: 0.9,
          thickness: 0.0014,
          ior: 1.55,
          attenuationColor: new THREE.Color(0xff1a10),
          attenuationDistance: 0.003,
          emissive: 0xff2010,
          emissiveIntensity: 1.2,
          side: THREE.DoubleSide,
        })
      : new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2010, emissiveIntensity: bq(1.6, 8), roughness: 0.3 }),
  );
  led.name = 'led-power';
  led.position.set(0.091, TOP, KZ + 0.0085);
  g.add(led);
  if (bakeQuality()) {
    // The LED die inside the jewel, much brighter than the lens, and a nickel bezel round its base.
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.0007, 14, 8),
      new THREE.MeshStandardMaterial({ color: 0xff5040, emissive: 0xff2a1a, emissiveIntensity: 14, roughness: 0.4 }),
    );
    core.name = 'led-core';
    core.position.set(0.091, TOP + 0.0006, KZ + 0.0085);
    g.add(core);
    batch.add(new THREE.TorusGeometry(0.00165, 0.00032, 6, 32).rotateX(Math.PI / 2), nickel, [0.091, TOP + 0.00028, KZ + 0.0085]);
  }

  // Arched carry handle behind the knobs, its feet on the top.
  const HZ = -0.012;
  const HW = 0.02;
  batch.add(handleGeometry(0.087, HANDLE_TOP - TOP - 0.0012, 0.0055, HW), darkPlastic, [0, TOP, HZ]);
  for (const s of [-1, 1]) {
    batch.add(new RoundedBoxGeometry(0.016, 0.006, HW + 0.006, sg(2), 0.002), darkPlastic, [s * 0.081, TOP + 0.003, HZ]);
  }
  // Grip ribs on the top of the arch.
  const rib = new THREE.BoxGeometry(0.0012, 0.0008, HW + 0.002);
  for (let i = -5; i <= 5; i++) batch.add(rib, capMat, [i * 0.0034, HANDLE_TOP - 0.0006, HZ]);
  if (bakeQuality()) {
    // Bake: a moulded parting seam along each edge of the handle's arch.
    for (const sz of [-1, 1]) {
      const seam = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(Array.from({ length: 41 }, (_, i) => {
          const t = (Math.PI * i) / 40;
          const c = Math.cos(t), sn = Math.sin(t);
          return new THREE.Vector3(0.0865 * Math.sign(c) * Math.pow(Math.abs(c), 2 / 2.6), (HANDLE_TOP - TOP - 0.0012 - 0.0006) * Math.pow(sn, 2 / 2.6), sz * (HW / 2 + 0.0015));
        })),
        120,
        0.00035,
        6,
        false,
      );
      batch.add(seam, capMat, [0, TOP, HZ]);
    }
  }

  // Back: DC in jack.
  batch.add(new THREE.CylinderGeometry(0.004, 0.004, 0.002, sg(16)), darkPlastic, [0.07, CY + 0.035, -D / 2 - 0.001], [Math.PI / 2, 0, 0]);
  batch.add(new THREE.CylinderGeometry(0.0013, 0.0013, 0.0022, sg(10)), nickel, [0.07, CY + 0.035, -D / 2 - 0.0012], [Math.PI / 2, 0, 0]);
  // Battery cover on the base.
  batch.add(new THREE.BoxGeometry(0.11, 0.0006, 0.07), std(0x1c1c1c, 0.8), [0, FOOT - 0.0003, 0]);
  if (bakeQuality()) {
    // Battery-cover screws, with their crosses.
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        batch.add(new THREE.CylinderGeometry(0.0021, 0.0021, 0.0006, 20), nickel, [sx * 0.0505, FOOT - 0.0009, sz * 0.032]);
        batch.add(new THREE.BoxGeometry(0.0029, 0.0002, 0.0006), darkPlastic, [sx * 0.0505, FOOT - 0.0012, sz * 0.032], [0, sx * 0.6, 0]);
        batch.add(new THREE.BoxGeometry(0.0006, 0.0002, 0.0029), darkPlastic, [sx * 0.0505, FOOT - 0.0012, sz * 0.032], [0, sx * 0.6, 0]);
      }
  }

  // Small rubber feet near the corners.
  const foot = new RoundedBoxGeometry(0.016, FOOT + 0.001, 0.012, sg(1), 0.0015);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.add(foot, rubber, [sx * 0.102, (FOOT + 0.001) / 2, sz * (D / 2 - 0.016)]);

  batch.flush(g);
  return g;
}
