// Part of the listening room. See kit.ts for the conventions.
//
// Audio-Technica AT-LP60XBT in black, after the owner's photo: 366 × 97.5 ×
// 356 mm with the lid shut. Gunmetal plinth with rounded corners, glossy
// black front fascia with four round buttons, die-cast platter with a
// polished rim and felt mat, straight aluminium tonearm on a black gimbal,
// clear acrylic dust cover on two hinge blocks at the back (shown raised).

import { THREE, C, std, mesh, canvasTexture, RoundedBoxGeometry, sg, bq, bakeQuality, greyCanvas, normalFromHeight, dataTexture, rng, hash } from './kit';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- helpers

type V3 = [number, number, number];

// Bake a transform into a geometry (position, Euler rotation, scale).
function place(geo: THREE.BufferGeometry, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
    new THREE.Vector3(...s),
  );
  return geo.applyMatrix4(m);
}

// Merge geometries of any kind (indexed or not) that share position/normal/uv.
function merge(list: THREE.BufferGeometry[]) {
  const flat = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((n.attributes.position.count) * 2), 2));
    return n;
  });
  return mergeGeometries(flat, false)!;
}

const rbox = (w: number, h: number, d: number, r: number, seg = 2) => new RoundedBoxGeometry(w, h, d, sg(seg), r);
const cylg = (rt: number, rb: number, h: number, seg = 24) => new THREE.CylinderGeometry(rt, rb, h, sg(seg));

// Cylinder whose axis runs from a to b.
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 12, r2 = r) {
  const dir = b.clone().sub(a);
  const geo = new THREE.CylinderGeometry(r2, r, dir.length(), sg(seg));
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  geo.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return geo;
}

// ---------------------------------------------------------------- textures

const REC_R = 0.1524; // 12" record
const LABEL_R = 0.05;

// Vinyl: lead-in rim, grooved bands with gaps between tracks, run-out.
let vinylTex: THREE.Texture | undefined;
function vinylTexture() {
  if (vinylTex) return vinylTex;
  const S = 1024;
  const px = (m: number) => (m / REC_R) * (S / 2);
  return (vinylTex = canvasTexture(S, S, (g) => {
    g.fillStyle = '#0d0d0e';
    g.fillRect(0, 0, S, S);
    const c = S / 2;
    const outer = px(0.1465);
    const inner = px(0.062);
    // Track gaps (smooth, slightly darker and glossier bands).
    const gaps = [0.139, 0.126, 0.111, 0.098, 0.084, 0.072].map(px);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // Bake: grooves at half the pitch, so the 2x canvas keeps hairline rings.
    const step = bq(1, 0.5);
    for (let r = outer; r > inner; r -= step) {
      const inGap = gaps.some((gr) => Math.abs(r - gr) < 2.2);
      g.strokeStyle = inGap ? 'rgba(0 0 0 / 0.55)' : `rgba(255 255 255 / ${0.03 + rnd() * 0.05})`;
      g.lineWidth = step;
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.stroke();
    }
    // Raised lead-in rim catches a little more light.
    g.strokeStyle = 'rgba(255 255 255 / 0.10)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(c, c, px(0.149), 0, Math.PI * 2);
    g.stroke();
    // Run-out spiral area: a few wide, faint rings.
    for (let r = inner; r > px(LABEL_R + 0.002); r -= 6) {
      g.strokeStyle = 'rgba(255 255 255 / 0.025)';
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.stroke();
    }
  }));
}

// Anisotropy direction field: tangential everywhere, so the groove highlight
// streaks radially and stays put while the record turns, like the real thing.
let grooveAnisoTex: THREE.Texture | undefined;
function grooveAnisotropy() {
  if (grooveAnisoTex) return grooveAnisoTex;
  const S = 512;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - S / 2;
      const dy = y + 0.5 - S / 2;
      const l = Math.hypot(dx, dy) || 1;
      const i = (y * S + x) * 4;
      data[i] = Math.round(((-dy / l) * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round(((dx / l) * 0.5 + 0.5) * 255);
      const rr = l / (S / 2);
      data[i + 2] = Math.round(255 * Math.min(1, Math.max(0, (0.985 - rr) / 0.02)) * (rr > 0.3 ? 1 : 0.5));
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = true;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return (grooveAnisoTex = t);
}

// Grey felt mat.
let matTex: THREE.Texture | undefined;
function matTexture() {
  if (matTex) return matTex;
  const K = bq(1, 2);
  return (matTex = canvasTexture(512 * K, 512 * K, (g) => {
    g.scale(K, K);
    g.fillStyle = '#2a2a2b';
    g.fillRect(0, 0, 512, 512);
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 9000; k++) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(255 255 255 / 0.05)' : 'rgba(0 0 0 / 0.12)';
      g.fillRect(rnd() * 512, rnd() * 512, 2, 2);
    }
    g.fillStyle = 'rgba(235 235 235 / 0.9)';
    g.font = '600 34px Helvetica, Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText('audio-technica', 256, 140);
  }));
}

// ---------------------------------------------------------------- bake-only detail
// Reached only when bakeQuality() is true (the path tracer's still).

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The record's micro-groove as a normal map, computed analytically from the
// radius: music grooves (a 0.36 mm pitch, ring-to-ring modulation like a
// real cut), smooth gaps between the tracks, a wide shallow lead-in, and a
// run-out spiral that ends in a smooth dead-wax band. 4096 px across the disc.
let vinylNTex: THREE.Texture | undefined;
function vinylNormal() {
  if (vinylNTex) return vinylNTex;
  const S = 4096, L = 8192, GP = 0.00036;
  const gaps = [0.139, 0.126, 0.111, 0.098, 0.084, 0.072];
  const lut = new Float32Array(L + 1);
  for (let i = 0; i <= L; i++) {
    const r = (i / L) * REC_R;
    let t = 0;
    if (r >= 0.062 && r <= 0.1465) {
      let w = 1;
      for (const gp of gaps) w *= sm(0.0014, 0.0022, Math.abs(r - gp));
      const amp = 0.5 + 0.5 * hash(Math.floor(r / GP), 3);
      t = amp * 0.62 * Math.cos((r / GP) * Math.PI * 2) * w * sm(0.062, 0.0635, r) * (1 - sm(0.1455, 0.1465, r));
    } else if (r > 0.1465 && r < 0.1495) {
      t = 0.3 * Math.cos((r / 0.0009) * Math.PI * 2);
    } else if (r >= 0.0545 && r < 0.062) {
      t = 0.28 * Math.cos((r / 0.0007) * Math.PI * 2) * sm(0.0545, 0.056, r);
    }
    lut[i] = t;
  }
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  const d = img.data;
  const k = L / REC_R;
  for (let y = 0; y < S; y++) {
    const v = 0.5 - (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S - 0.5;
      const rr = Math.hypot(u, v) || 1e-9;
      const r = rr * 2 * REC_R;
      const t = r < REC_R ? lut[Math.min(L, (r * k) | 0)] : 0;
      const nx = (-t * u) / rr, ny = (-t * v) / rr;
      const il = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const o = (y * S + x) * 4;
      d[o] = (nx * il * 0.5 + 0.5) * 255;
      d[o + 1] = (ny * il * 0.5 + 0.5) * 255;
      d[o + 2] = (il * 0.5 + 0.5) * 255;
      d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = dataTexture(c, false);
  return (vinylNTex = t);
}

// Fibre height fields on short random strokes: label paper, felt.
function fibreNormal(seed: number, strokes: number, len: [number, number], width: number, strength: number, N = 1024) {
  const R = rng(seed);
  const h = greyCanvas(N, N, (g) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, N, N);
    g.lineCap = 'round';
    g.lineWidth = width;
    for (let k = 0; k < strokes; k++) {
      const v = Math.round(60 + R() * 140);
      g.strokeStyle = `rgba(${v} ${v} ${v} / 0.4)`;
      const x = R() * N, y = R() * N, a = R() * Math.PI * 2, l = len[0] + R() * (len[1] - len[0]);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (R() - 0.5) * l * 0.4, y + Math.sin(a) * l * 0.5 + (R() - 0.5) * l * 0.4, x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
  });
  return dataTexture(normalFromHeight(h, strength, false), false);
}
let paperNTex: THREE.Texture | undefined;
const paperNormal = () => (paperNTex ??= fibreNormal(17, 16000, [2, 10], 0.9, 1.1));
let feltNTex: THREE.Texture | undefined;
const feltNormal = () => (feltNTex ??= fibreNormal(5, 34000, [3, 12], 1.1, 1.5, 1024));

// Plastic's faint stipple on 20 mm tiles (the plinth's UVs are in metres).
let stippleNTex: THREE.Texture | undefined;
function stippleNormal() {
  if (stippleNTex) return stippleNTex;
  const R = rng(29), N = 512;
  const h = greyCanvas(N, N, (g) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, N, N);
    for (let k = 0; k < 3200; k++) {
      const x = R() * N, y = R() * N, r = 3 + R() * 4;
      for (const ox of [-N, 0, N])
        for (const oy of [-N, 0, N]) {
          const cx = x + ox, cy = y + oy;
          if (cx + r < 0 || cx - r > N || cy + r < 0 || cy - r > N) continue;
          const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
          gr.addColorStop(0, R() < 0.5 ? 'rgba(210 210 210 / 0.3)' : 'rgba(50 50 50 / 0.3)');
          gr.addColorStop(1, 'rgba(128 128 128 / 0)');
          g.fillStyle = gr;
          g.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
    }
  });
  const t = dataTexture(normalFromHeight(h, 1.0));
  t.repeat.set(50, 50);
  return (stippleNTex = t);
}

// Strobe marks on the platter's edge: four rows of dots (the usual 33 and 45
// rpm rows at 50 and 60 Hz), cut out of the texture, dark on bare metal.
function strobeTexture() {
  const W = 4096, H = 256;
  return canvasTexture(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#26272a';
    [216, 180, 160, 133].forEach((n, i) => {
      const y0 = i * 64 + 14;
      for (let k = 0; k < n; k++) {
        const w = (W / n) * 0.42;
        g.fillRect(((k + 0.5) / n) * W - w / 2, y0, w, 36);
      }
    });
  });
}

// A skin of dust on the cover: fine specks, a few lint fibres, soft smudges
// and a thumb's whorl. Mostly transparent; metres across the cover's top.
function dustTexture() {
  const N = 1024;
  return canvasTexture(N, N, (g) => {
    g.clearRect(0, 0, N, N);
    const R = rng(91);
    for (let k = 0; k < 3200; k++) {
      g.fillStyle = `rgba(236 236 232 / ${0.12 + R() * 0.4})`;
      g.beginPath();
      g.arc(R() * N, R() * N, 0.35 + R() * R() * 1.5, 0, Math.PI * 2);
      g.fill();
    }
    g.lineWidth = 0.6;
    for (let k = 0; k < 170; k++) {
      const x = R() * N, y = R() * N, a = R() * 6.28, l = 8 + R() * 44;
      g.strokeStyle = `rgba(235 235 230 / ${0.14 + R() * 0.25})`;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (R() - 0.5) * 18, y + Math.sin(a) * l * 0.5 + (R() - 0.5) * 18, x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    for (let k = 0; k < 8; k++) {
      const x = R() * N, y = R() * N, r = 50 + R() * 150;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(235 235 232 / 0.05)');
      gr.addColorStop(1, 'rgba(235 235 232 / 0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // A thumb's ridges, on the front edge of the lid where it is lifted.
    g.lineWidth = 1.2;
    for (let k = 0; k < 14; k++) {
      g.strokeStyle = `rgba(240 240 236 / ${0.06 + 0.02 * (k % 3)})`;
      g.beginPath();
      g.ellipse(310, 905, 18 + k * 3.2, 26 + k * 4.2, 0.35, Math.PI * 0.1, Math.PI * 1.7);
      g.stroke();
    }
  });
}

// A straight-knurled cylinder (axis y): `teeth` ridges, `depth` a fraction of the radius.
function knurledCyl(r: number, len: number, teeth: number, depth: number) {
  const geo = new THREE.CylinderGeometry(r, r, len, teeth * 6, 1, false);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    if (Math.hypot(x, z) < 1e-6) continue;
    const f = (((Math.atan2(z, x) / (Math.PI * 2)) * teeth) % 1 + 1) % 1;
    const k = 1 - depth * Math.abs(f - 0.5) * 2;
    p.setXYZ(i, x * k, p.getY(i), z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

export function prewarmTurntableTextures(): (() => void)[] {
  return [
    () => {
      vinylTexture();
    },
    () => {
      grooveAnisotropy();
      matTexture();
    },
  ];
}

// Small legends, white on transparent, drawn in metres on a w × h panel.
function legendTexture(
  w: number,
  h: number,
  ppm: number,
  draw: (g: CanvasRenderingContext2D, X: (m: number) => number, Y: (m: number) => number) => void,
  refPpm = ppm,
) {
  const W = Math.round(w * ppm);
  const H = Math.round(h * ppm);
  const RW = Math.round(w * refPpm);
  const RH = Math.round(h * refPpm);
  return canvasTexture(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    if (W !== RW || H !== RH) g.scale(W / RW, H / RH);
    g.fillStyle = 'rgba(215 215 215 / 0.9)';
    g.strokeStyle = 'rgba(215 215 215 / 0.9)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    draw(g, (m) => (m / w + 0.5) * RW, (m) => (0.5 - m / h) * RH);
  });
}

// ---------------------------------------------------------------- model

export interface Turntable {
  group: THREE.Group;
  /** The record on the platter; turn it about y. */
  spin: THREE.Object3D;
  /** The tonearm, pivoting about y at its base; rest is rotation 0, y 0. */
  arm: THREE.Object3D;
  /** The arm's rotation.y that puts the stylus over the outer lead-in groove. */
  armPlay: number;
  /** The arm's rotation.y at the inner run-out groove near the label. */
  armEnd: number;
  /** Changes the label on the record. */
  setLabel(tex: THREE.Texture): void;
  /** The dust cover, hinged at the back: rotation.x is -lidOpen raised (as built), 0 shut. */
  lid: THREE.Object3D;
  lidOpen: number;
}

export function buildTurntable(cover: THREE.Texture): Turntable {
  const g = new THREE.Group();

  // Dimensions (m).
  const W = 0.366;
  const D = 0.356;
  const FOOT = 0.012;
  const TOP = 0.058; // deck surface
  const CR = 0.012; // plan corner radius
  const bev = 0.0025;

  // Materials: gunmetal satin deck, glossier black front fascia.
  const plinthMat = bakeQuality()
    ? std(0x404145, 0.55, 0.2, { normalMap: stippleNormal(), normalScale: new THREE.Vector2(0.45, 0.45) })
    : std(0x404145, 0.55, 0.2);
  const fasciaMat = std(0x2f3034, 0.3, 0.3);
  const darkPlastic = std(0x151516, 0.42, 0.1);
  const rubber = std(0x101010, 0.9, 0);
  const polished = std(0xd9dadc, 0.16, 1);
  const silver = std(0xcfd0d2, 0.22, 0.95);
  const chrome = std(C.chrome, 0.15, 1);

  // ---- Plinth: plan outline with rounded corners, extruded up, edges eased.
  {
    const s = new THREE.Shape();
    const hw = W / 2 - bev;
    const hd = D / 2 - bev;
    const r = CR - bev;
    s.moveTo(-hw + r, -hd);
    s.lineTo(hw - r, -hd);
    s.quadraticCurveTo(hw, -hd, hw, -hd + r);
    s.lineTo(hw, hd - r);
    s.quadraticCurveTo(hw, hd, hw - r, hd);
    s.lineTo(-hw + r, hd);
    s.quadraticCurveTo(-hw, hd, -hw, hd - r);
    s.lineTo(-hw, -hd + r);
    s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
    const h = TOP - FOOT - 2 * bev;
    const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: sg(3), curveSegments: sg(8) });
    // Shape x/y -> world x/z; extrusion -> +y.
    geo.rotateX(Math.PI / 2);
    geo.translate(0, FOOT + bev + h, 0);
    g.add(mesh(geo, plinthMat));
  }

  // ---- Front fascia: a glossy black band under a thin groove, carrying the
  // round buttons in recessed bezels.
  const FY0 = FOOT + 0.004;
  const FY1 = TOP - 0.0095;
  const FZ = D / 2 + 0.0006;
  {
    const fw = W - 2 * CR + 0.006;
    g.add(mesh(place(rbox(fw, FY1 - FY0, 0.004, 0.0015), [0, (FY0 + FY1) / 2, FZ - 0.002]), fasciaMat));
    // Groove line between the deck edge and the fascia.
    g.add(mesh(place(new THREE.BoxGeometry(W - 2 * CR, 0.0012, 0.002), [0, FY1 + 0.0012, D / 2 - 0.0006]), std(0x050505, 0.9), false));
  }
  const BY = (FY0 + FY1) / 2 - 0.001;
  const frontButtons = [-0.143, 0.088, 0.116, 0.144];
  {
    const bezels: THREE.BufferGeometry[] = [];
    const caps: THREE.BufferGeometry[] = [];
    for (const x of frontButtons) {
      // Dished bezel: a short cone opening towards the viewer.
      bezels.push(place(new THREE.CylinderGeometry(0.0108, 0.0085, 0.0018, sg(32), 1, true).rotateX(Math.PI / 2), [x, BY, FZ + 0.0009]));
      bezels.push(place(new THREE.CircleGeometry(0.0085, sg(32)), [x, BY, FZ + 0.0001]));
      caps.push(place(new THREE.CylinderGeometry(0.0064, 0.0066, 0.004, sg(28)).rotateX(Math.PI / 2), [x, BY, FZ + 0.002]));
      caps.push(place(new THREE.SphereGeometry(0.0066, sg(28), sg(4), 0, Math.PI * 2, 0, 0.45).rotateX(Math.PI / 2), [x, BY, FZ + 0.0026]));
    }
    g.add(mesh(merge(bezels), std(0x0b0b0c, 0.35, 0.3), false));
    g.add(mesh(merge(caps), std(0x4a4c50, 0.22, 0.55), false));
    // Legends: speed above the left button, transport above the right ones,
    // the brand in the middle.
    const lw = W - 0.03;
    const lh = FY1 - FY0;
    const tex = legendTexture(lw, lh, bq(3600, 7800), (c, X, Y) => {
      c.font = '600 44px Helvetica, Arial, sans-serif';
      const ly = Y(lh / 2 - 0.0035);
      c.fillText('33  45', X(-0.143), ly);
      c.fillText('STOP', X(0.088), ly);
      c.fillText('START', X(0.116), ly);
      c.fillText('UP/DOWN', X(0.144), ly);
      // Brand mark: circled tri-wave, then the wordmark and model.
      const bx = X(-0.03);
      const by = Y(0.004);
      c.lineWidth = 7;
      c.beginPath();
      c.arc(bx, by, 52, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(bx - 34, by + 30);
      c.lineTo(bx - 8, by - 34);
      c.lineTo(bx + 8, by + 6);
      c.lineTo(bx + 18, by - 14);
      c.lineTo(bx + 34, by + 30);
      c.stroke();
      c.textAlign = 'left';
      c.font = '600 92px Helvetica, Arial, sans-serif';
      c.fillText('audio-technica', bx + 72, by + 4);
      c.textAlign = 'center';
      c.font = '500 42px Helvetica, Arial, sans-serif';
      c.fillText('AT-LP60XBT', X(0.01), Y(-0.009));
    }, 9000);
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(lw, lh),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    decal.position.set(0, (FY0 + FY1) / 2, FZ + 0.0001);
    g.add(decal);
  }

  // ---- Rubber feet: wide discs under the corners.
  {
    const feet: THREE.BufferGeometry[] = [];
    for (const fx of [-0.135, 0.135])
      for (const fz of [-0.125, 0.125]) {
        if (bakeQuality()) {
          // Moulded foot: eased sole edge, a slight taper, a rounded shoulder.
          const prof: [number, number][] = [[0, 0], [0.0225, 0], [0.0239, 0.0012], [0.0214, 0.0105], [0.0206, 0.012], [0, 0.012]];
          feet.push(place(new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), 72), [fx, 0, fz]));
        } else feet.push(place(cylg(0.021, 0.024, FOOT, 32), [fx, FOOT / 2, fz]));
      }
    g.add(mesh(merge(feet), rubber));
  }

  // ---- On the deck: Bluetooth button with its LED at front left, the lift
  // lever at front right, the 45 adapter at back left.
  {
    const bt = mesh(
      merge([
        place(cylg(0.0068, 0.0068, 0.0012, 28), [-0.141, TOP + 0.0006, 0.146]),
        place(cylg(0.0052, 0.0055, 0.0032, 28), [-0.141, TOP + 0.0016, 0.146]),
      ]),
      std(0x1d1e20, 0.3, 0.4),
    );
    g.add(bt);
    g.add(
      mesh(
        place(cylg(0.0009, 0.0009, 0.0006, 10), [-0.141, TOP + 0.0003, 0.135]),
        new THREE.MeshStandardMaterial({ color: 0x3a7bff, emissive: 0x2a6cff, emissiveIntensity: bq(2, 10) }),
        false,
      ),
    );
    // Lift lever: a sloped black block.
    const lv = new THREE.Shape();
    lv.moveTo(-0.007, 0);
    lv.lineTo(0.007, 0);
    lv.lineTo(0.006, 0.006);
    lv.lineTo(-0.007, 0.0085);
    lv.closePath();
    const lever = new THREE.ExtrudeGeometry(lv, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: sg(2) });
    lever.translate(0, 0, -0.015);
    lever.rotateY(Math.PI / 2); // shape x -> -z (towards the back)
    lever.translate(0.12, TOP, 0.146);
    g.add(mesh(lever, darkPlastic));
    if (bakeQuality()) {
      // A dark slot round the lever's base, and fine grip ridges across its sloped top.
      g.add(mesh(place(rbox(0.036, 0.0004, 0.02, 0.0008), [0.12, TOP + 0.0002, 0.146]), std(0x060607, 0.7), false));
      const ridges: THREE.BufferGeometry[] = [];
      for (let i = -6; i <= 6; i++) ridges.push(place(new THREE.BoxGeometry(0.0004, 0.00035, 0.0095), [0.12 + i * 0.0021, TOP + 0.00715 + 0.0002, 0.146], [-0.19, 0, 0]));
      g.add(mesh(merge(ridges), std(0x0a0a0b, 0.5), false));
    }
    // 45 rpm adapter in its well.
    g.add(
      mesh(
        merge([place(cylg(0.0165, 0.0165, 0.0012, 32), [-0.152, TOP + 0.0006, -0.146])]),
        std(0x0c0c0c, 0.6),
        false,
      ),
    );
    g.add(
      mesh(
        merge([
          place(new THREE.TorusGeometry(0.0105, 0.003, sg(8), sg(32)).rotateX(Math.PI / 2), [-0.152, TOP + 0.0035, -0.146]),
          place(cylg(0.0035, 0.0035, 0.004, 12), [-0.152, TOP + 0.002, -0.146]),
        ]),
        silver,
      ),
    );
    // Legends on the deck: Bluetooth glyph under the button, UP DOWN by the lever.
    const lw = 0.36;
    const ld = 0.03;
    const tex = legendTexture(lw, ld, bq(3600, 7800), (c, X, Y) => {
      c.font = '600 40px Helvetica, Arial, sans-serif';
      // Bluetooth rune.
      const bx = X(-0.141);
      const by = Y(-0.0105);
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(bx - 14, by - 14);
      c.lineTo(bx + 14, by + 14);
      c.lineTo(bx, by + 28);
      c.lineTo(bx, by - 28);
      c.lineTo(bx + 14, by - 14);
      c.lineTo(bx - 14, by + 14);
      c.stroke();
      c.fillText('UP', X(0.143), Y(0.004));
      c.fillText('DOWN', X(0.162), Y(0.004));
      c.fillText('▼', X(0.12), Y(-0.011));
    }, 9000);
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(lw, ld),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(0, TOP + 0.0002, 0.146);
    g.add(decal);
  }

  // ---- Platter (polished chamfered rim), felt mat, record.
  const PX = -0.022;
  const PZ = -0.004;
  const PR = 0.143;
  const PLATTER_TOP = TOP + 0.014;
  {
    const pts = [
      [0.004, TOP + 0.003],
      [0.11, TOP + 0.003],
      [PR - 0.006, TOP + 0.0035],
      [PR - 0.001, TOP + 0.005],
      [PR, TOP + 0.0065],
      [PR, PLATTER_TOP - 0.004],
      [PR - 0.0045, PLATTER_TOP - 0.0003],
      [PR - 0.0055, PLATTER_TOP],
      [0.004, PLATTER_TOP],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const platter = mesh(new THREE.LatheGeometry(pts, sg(112)), polished);
    platter.position.set(PX, 0, PZ);
    g.add(platter);
    if (bakeQuality()) {
      // The strobe band round the rim's vertical face.
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(PR + 0.00006, PR + 0.00006, PLATTER_TOP - 0.004 - (TOP + 0.0065), 360, 1, true),
        new THREE.MeshStandardMaterial({ map: strobeTexture(), alphaTest: 0.5, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }),
      );
      band.position.set(PX, (PLATTER_TOP - 0.004 + TOP + 0.0065) / 2, PZ);
      g.add(band);
    }
    const sub = mesh(cylg(0.1, 0.1, 0.003, 40), rubber, false);
    sub.position.set(PX, TOP + 0.0015, PZ);
    g.add(sub);
    const mat = mesh(
      cylg(PR - 0.0055, PR - 0.0055, 0.002, 112),
      [
        std(0x232324, 0.95),
        bakeQuality()
          ? // Felt: the loose fibres show as sheen at grazing angles.
            new THREE.MeshPhysicalMaterial({ map: matTexture(), roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(0x8a8a8c), sheenRoughness: 0.6, normalMap: feltNormal(), normalScale: new THREE.Vector2(0.7, 0.7) })
          : new THREE.MeshStandardMaterial({ map: matTexture(), roughness: 0.95 }),
        rubber,
      ],
    );
    mat.position.set(PX, PLATTER_TOP + 0.001, PZ);
    g.add(mat);
  }

  let labelMat!: THREE.MeshStandardMaterial;
  const spin = new THREE.Group();
  spin.position.set(PX, PLATTER_TOP + 0.002, PZ);
  {
    const recH = 0.0018;
    const vinylMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: vinylTexture(),
      roughness: 0.34,
      metalness: 0,
      anisotropy: 0.85,
      anisotropyMap: grooveAnisotropy(),
      clearcoat: 0.25,
      clearcoatRoughness: 0.35,
    });
    // Black PVC: one specular layer at a lower intensity, so the record
    // reads black rather than mirroring the pale wall grey at this grazing view.
    vinylMat.clearcoat = 0;
    vinylMat.specularIntensity = 0.55;
    if (bakeQuality()) {
      // Groove rings as fine relief.
      vinylMat.roughness = 0.3;
      vinylMat.normalMap = vinylNormal();
      vinylMat.normalScale = new THREE.Vector2(1, 1);
    }
    const edgeMat = std(0x0c0c0c, 0.45);
    const record = mesh(new THREE.CylinderGeometry(REC_R, REC_R, recH, sg(160), 1), [edgeMat, vinylMat, vinylMat]);
    record.position.y = recH / 2;
    spin.add(record);
    labelMat = new THREE.MeshStandardMaterial({ map: cover, roughness: 0.55 });
    if (bakeQuality()) {
      // Matte offset-printed paper: fibres in the surface.
      labelMat.normalMap = paperNormal();
      labelMat.normalScale.set(0.55, 0.55);
      labelMat.roughness = 0.7;
    }
    // The label is a ring: the spindle hole is a real hole, so the record can
    // be seen to line up with the spindle as it is lowered onto it.
    const HOLE = 0.0039;
    const label = mesh(new THREE.RingGeometry(HOLE, LABEL_R, sg(72)), labelMat);
    label.rotation.x = -Math.PI / 2;
    label.position.y = recH + 0.0002;
    spin.add(label);
    const labelBottom = mesh(new THREE.RingGeometry(HOLE, LABEL_R, sg(72)), labelMat);
    labelBottom.rotation.x = Math.PI / 2;
    labelBottom.position.y = -0.0002;
    spin.add(labelBottom);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const holeTop = mesh(new THREE.CircleGeometry(HOLE + 0.0003, sg(20)), holeMat, false);
    holeTop.rotation.x = -Math.PI / 2;
    holeTop.position.y = recH + 0.0001;
    spin.add(holeTop);
    const holeBottom = mesh(new THREE.CircleGeometry(HOLE + 0.0003, sg(20)), holeMat, false);
    holeBottom.rotation.x = Math.PI / 2;
    holeBottom.position.y = -0.0001;
    spin.add(holeBottom);
    if (bakeQuality()) {
      // Extra, bake-only children of the record: the raised rim bead on both
      // faces, and a hair-fine ridge round the label. (The disc, label and
      // holes above are unchanged in both modes.)
      const pvc = new THREE.MeshPhysicalMaterial({ color: 0x0e0e0f, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.1 });
      for (const [y, flip] of [[recH, 1], [0, -1]] as const) {
        const bead = mesh(new THREE.TorusGeometry(REC_R - 0.0006, 0.0003, 8, 256).rotateX(Math.PI / 2).scale(1, 0.7, 1), pvc, false);
        bead.position.y = y + flip * 0.00005;
        bead.name = 'bake-bead';
        spin.add(bead);
      }
      const ridge = mesh(new THREE.TorusGeometry(LABEL_R + 0.0001, 0.00013, 6, 160).rotateX(Math.PI / 2), pvc, false);
      ridge.position.y = recH + 0.0002;
      ridge.name = 'bake-ridge';
      spin.add(ridge);
    }
  }
  // The spindle stays on the platter, whatever record is on it.
  {
    const spindle = mesh(
      merge([
        place(cylg(0.0036, 0.0036, 0.017, 16), [0, 0.0055, 0]),
        place(new THREE.SphereGeometry(0.0036, sg(16), sg(8), 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.014, 0]),
      ]),
      chrome,
    );
    spindle.position.copy(spin.position);
    g.add(spindle);
  }
  g.add(spin);

  // ---- Tonearm: straight aluminium tube on a black gimbal over a round
  // base plate, black counterweight, black headshell, cartridge with a
  // silver nameplate, silver finger lift.
  const arm = new THREE.Group();
  let armPlay = 0;
  let armEnd = 0;
  {
    const ARM_Y = TOP + 0.033;
    const pivot = new THREE.Vector3(0.128, ARM_Y, -0.108);
    const tip = new THREE.Vector3(0.152, ARM_Y - 0.002, 0.07);
    const dir = tip.clone().sub(pivot).setY(0).normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    // The moving parts hang off a group at the pivot, so the arm can swing.
    arm.position.copy(pivot);
    g.add(arm);
    const armAdd = (o: THREE.Object3D) => {
      o.position.sub(pivot);
      arm.add(o);
    };

    // Base plate and gimbal housing.
    g.add(
      mesh(
        merge([
          place(cylg(0.036, 0.037, 0.0025, 48), [pivot.x - 0.004, TOP + 0.00125, pivot.z + 0.004]),
          place(cylg(0.011, 0.013, ARM_Y - TOP - 0.008, 24), [pivot.x, (ARM_Y + TOP - 0.008) / 2, pivot.z]),
        ]),
        darkPlastic,
      ),
    );
    const gimbal = mesh(
      merge([
        place(rbox(0.026, 0.019, 0.03, 0.004), [0, 0, 0]),
        place(rbox(0.03, 0.006, 0.012, 0.002), [0, -0.0075, 0]),
      ]),
      darkPlastic,
    );
    gimbal.position.copy(pivot);
    gimbal.rotation.y = yaw;
    armAdd(gimbal);

    // Tube, from the stub behind the gimbal to the headshell.
    const tail = pivot.clone().addScaledVector(dir, -0.03);
    armAdd(mesh(merge([rod(tail, tip, 0.0034, 14)]), silver));

    // Counterweight: black barrel with a fine front ring.
    const cwA = pivot.clone().addScaledVector(dir, -0.022);
    const cwB = pivot.clone().addScaledVector(dir, -0.05);
    armAdd(
      mesh(
        merge([rod(cwA, cwB, 0.014, 32), rod(cwB, cwB.clone().addScaledVector(dir, -0.002), 0.014, 32, 0.0125)]),
        std(0x111112, 0.35, 0.4),
      ),
    );

    // Headshell, angled inward from the tube.
    const head = new THREE.Group();
    head.position.copy(tip);
    head.rotation.y = yaw - THREE.MathUtils.degToRad(24);
    {
      // Collar where the shell plugs onto the tube, then the shell body.
      const collar = place(cylg(0.0048, 0.0048, 0.012, 16), [0, 0, 0.002], [Math.PI / 2, 0, 0]);
      const shell = place(rbox(0.017, 0.006, 0.034, 0.0015), [0, -0.0005, 0.024]);
      head.add(mesh(merge([collar, shell]), darkPlastic));
      // Cartridge body under the shell, nameplate on its front.
      const cart = mesh(
        merge([
          place(rbox(0.0155, 0.011, 0.02, 0.0012), [0, -0.0085, 0.026]),
          place(rbox(0.011, 0.004, 0.008, 0.001), [0, -0.0155, 0.032]),
        ]),
        std(0x121213, 0.45, 0.1),
      );
      head.add(cart);
      const plate = mesh(
        place(new THREE.PlaneGeometry(0.0145, 0.0095), [0, -0.0085, 0.0361]),
        new THREE.MeshStandardMaterial({
          map: canvasTexture(128, 84, (c) => {
            c.fillStyle = '#d8d8d8';
            c.fillRect(0, 0, 128, 84);
            c.strokeStyle = '#333';
            c.lineWidth = 5;
            c.beginPath();
            c.arc(64, 42, 22, 0, Math.PI * 2);
            c.stroke();
            c.beginPath();
            c.moveTo(48, 56);
            c.lineTo(60, 26);
            c.lineTo(68, 46);
            c.lineTo(72, 38);
            c.lineTo(80, 56);
            c.stroke();
          }),
          roughness: 0.35,
          metalness: 0.4,
        }),
        false,
      );
      head.add(plate);
      // Finger lift: a thin silver wire out to the right, bent up.
      const fl = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.007, 0.001, 0.034),
        new THREE.Vector3(0.02, 0.001, 0.036),
        new THREE.Vector3(0.026, 0.004, 0.037),
      ]);
      head.add(mesh(new THREE.TubeGeometry(fl, sg(12), 0.0008, sg(6), false), silver, false));
      head.add(mesh(place(cylg(0.0004, 0.0002, 0.003, 6), [0, -0.0185, 0.034]), chrome, false));
      if (bakeQuality()) {
        // Bake-only: a tapered cantilever running out of the stylus holder to a
        // diamond tip (kept above the existing stylus's lowest point), the
        // cartridge's two mounting screws and the headshell's cross-hatched grip.
        const cant = rod(new THREE.Vector3(0, -0.0178, 0.0328), new THREE.Vector3(0, -0.0196, 0.0348), 0.00022, 10, 0.00009);
        head.add(mesh(cant, std(0xb8b9bb, 0.25, 1), false));
        const tipM = mesh(new THREE.SphereGeometry(0.00013, 12, 8), new THREE.MeshPhysicalMaterial({ color: 0xf4f6f8, roughness: 0.02, transmission: 0.9, ior: 2.4, thickness: 0.0002 }), false);
        tipM.position.set(0, -0.01985, 0.0349);
        head.add(tipM);
        for (const sx of [-1, 1]) {
          head.add(mesh(place(cylg(0.0013, 0.0013, 0.0007, 20), [sx * 0.0062, 0.00285, 0.0195]), std(0xc9cacc, 0.25, 1), false));
          head.add(mesh(place(new THREE.BoxGeometry(0.0021, 0.0002, 0.00045), [sx * 0.0062, 0.00325, 0.0195], [0, sx * 0.7, 0]), std(0x0a0a0b, 0.8), false));
        }
        const grip: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 9; i++) grip.push(place(new THREE.BoxGeometry(0.0155, 0.0003, 0.0004), [0, 0.0027, 0.0125 + i * 0.0012]));
        head.add(mesh(merge(grip), std(0x0d0d0e, 0.4), false));
      }
    }
    armAdd(head);
    if (bakeQuality()) {
      // Bake-only extras on the arm: a knurled ring and engraved scale rings on the
      // counterweight, and silver collars on the tube. Built in the same absolute
      // coordinates as the parts above (armAdd moves them into the arm's frame).
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone());
      const abs = (geo: THREE.BufferGeometry, at: THREE.Vector3) => geo.applyMatrix4(new THREE.Matrix4().compose(at, q, new THREE.Vector3(1, 1, 1)));
      const cwDark = std(0x111112, 0.35, 0.4);
      armAdd(mesh(abs(knurledCyl(0.0143, 0.008, 72, 0.03), pivot.clone().addScaledVector(dir, -0.04)), cwDark, false));
      const rings: THREE.BufferGeometry[] = [];
      for (const d of [-0.0275, -0.0315, -0.0455]) rings.push(abs(new THREE.TorusGeometry(0.01405, 0.00018, 6, 96).rotateX(Math.PI / 2), pivot.clone().addScaledVector(dir, d)));
      armAdd(mesh(merge(rings), std(0xcfd0d2, 0.3, 0.9), false));
      for (const d of [0.019, 0.075]) armAdd(mesh(abs(new THREE.CylinderGeometry(0.0043, 0.0043, 0.003, 32), pivot.clone().addScaledVector(dir, d).setY(pivot.y - (0.002 * (d + 0.03)) / 0.208)), silver, false));
    }

    // Where the stylus lands: swing the arm in from the outer lead-in groove
    // (armPlay) across the grooved band to the inner run-out groove (armEnd).
    {
      const stylus = new THREE.Vector2(
        tip.x + Math.sin(head.rotation.y) * 0.034 - pivot.x,
        tip.z + Math.cos(head.rotation.y) * 0.034 - pivot.z,
      );
      const outer = 0.145;
      const inner = 0.062;
      for (let a = 0; a > -1.2; a -= 0.002) {
        const c = Math.cos(a);
        const s = Math.sin(a);
        const x = pivot.x + stylus.x * c + stylus.y * s;
        const z = pivot.z - stylus.x * s + stylus.y * c;
        const d = Math.hypot(x - PX, z - PZ);
        if (d >= outer) armPlay = a;
        armEnd = a;
        if (d < inner) break;
      }
    }

    // Arm rest: black post with a clip that holds the tube.
    const rz = 0.04;
    const rp = pivot.clone().addScaledVector(dir, (rz - pivot.z) / dir.z);
    const cradleY = ARM_Y - 0.0034 - 0.0015 - (0.002 * (rz - pivot.z)) / (tip.z - pivot.z);
    g.add(
      mesh(
        merge([
          place(cylg(0.0075, 0.009, 0.003, 24), [rp.x, TOP + 0.0015, rp.z]),
          place(rbox(0.007, cradleY - TOP, 0.007, 0.0015), [rp.x, (cradleY + TOP) / 2, rp.z]),
          place(rbox(0.013, 0.003, 0.008, 0.001), [rp.x, cradleY, rp.z]),
          place(rbox(0.0025, 0.01, 0.008, 0.001), [rp.x + 0.0062, cradleY + 0.0045, rp.z]),
          place(rbox(0.0025, 0.007, 0.008, 0.001), [rp.x - 0.0062, cradleY + 0.003, rp.z]),
        ]),
        darkPlastic,
      ),
    );

    // Lift bar: the black cueing bar under the tube, on its post.
    const lp = pivot.clone().addScaledVector(dir, 0.06);
    g.add(
      mesh(
        merge([
          place(cylg(0.004, 0.005, ARM_Y - TOP - 0.008, 14), [lp.x + 0.013, (ARM_Y + TOP - 0.008) / 2, lp.z]),
          place(rbox(0.02, 0.003, 0.007, 0.001), [lp.x + 0.007, ARM_Y - 0.0065, lp.z]),
        ]),
        darkPlastic,
      ),
    );
  }

  // ---- Clear dust cover on two hinges at the back, raised.
  let lid!: THREE.Group;
  let lidOpen = 0;
  {
    const LW = W - 0.004;
    const LD = D - 0.01;
    const LH = 0.04;
    const t = 0.0025;
    const OPEN = THREE.MathUtils.degToRad(91);
    lidOpen = OPEN;
    const hingeY = TOP + 0.012;
    const hingeZ = -D / 2 + 0.006;

    // Hinge blocks standing on the deck at the back.
    const fixed: THREE.BufferGeometry[] = [];
    for (const hx of [-0.11, 0.11]) {
      fixed.push(place(rbox(0.036, 0.02, 0.014, 0.003), [hx, TOP + 0.01, -D / 2 + 0.008]));
    }
    g.add(mesh(merge(fixed), darkPlastic));
    if (bakeQuality()) {
      // Bake-only: the hinge pins' capped ends on the blocks' outer faces, a
      // pair of screws in the top of each block, and a rubber stop on the deck.
      const sc = std(0xc9cacc, 0.25, 1);
      const bits: THREE.BufferGeometry[] = [];
      const slots: THREE.BufferGeometry[] = [];
      for (const hx of [-0.11, 0.11]) {
        for (const sx of [-1, 1]) {
          const x = hx + sx * 0.0181;
          bits.push(place(new THREE.CylinderGeometry(0.0034, 0.0036, 0.0009, 28).rotateZ(Math.PI / 2), [x + sx * 0.00045, hingeY, hingeZ]));
          slots.push(place(new THREE.BoxGeometry(0.0003, 0.0046, 0.0004), [x + sx * 0.001, hingeY, hingeZ], [hx * 3, 0, 0]));
        }
        for (const dz of [-0.003, 0.003]) {
          bits.push(place(new THREE.CylinderGeometry(0.0018, 0.0018, 0.0006, 20), [hx + (hx > 0 ? 0.009 : -0.009), TOP + 0.0203, -D / 2 + 0.008 + dz]));
        }
        bits.push(place(new THREE.CylinderGeometry(0.0035, 0.004, 0.0012, 24), [hx, TOP + 0.0006, -D / 2 + 0.025]));
      }
      g.add(mesh(merge(bits), sc, false));
      g.add(mesh(merge(slots), std(0x050506, 0.8), false));
    }

    lid = new THREE.Group();
    lid.position.set(0, hingeY, hingeZ);
    lid.rotation.x = -OPEN;
    const z0 = 0.002;
    const rr = 0.006;
    // Panels; the vertical corners are rounded quarter-tubes.
    const parts: THREE.BufferGeometry[] = [
      place(rbox(LW, t, LD, 0.0012, 1), [0, LH - t / 2, z0 + LD / 2]),
      place(rbox(LW - 2 * rr, LH - t, t, 0.0012, 1), [0, (LH - t) / 2, z0 + LD - t / 2]),
      place(rbox(LW - 2 * rr, LH - t, t, 0.0012, 1), [0, (LH - t) / 2, z0 + t / 2]),
      place(rbox(t, LH - t, LD - 2 * rr, 0.0012, 1), [-LW / 2 + t / 2, (LH - t) / 2, z0 + LD / 2]),
      place(rbox(t, LH - t, LD - 2 * rr, 0.0012, 1), [LW / 2 - t / 2, (LH - t) / 2, z0 + LD / 2]),
    ];
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const corner = new THREE.CylinderGeometry(rr, rr, LH - t, sg(6), 1, true, Math.atan2(sx, sz) - Math.PI / 4, Math.PI / 2);
      parts.push(place(corner, [sx * (LW / 2 - rr), (LH - t) / 2, z0 + LD / 2 + sz * (LD / 2 - rr)]));
    }
    const plastic = new THREE.MeshPhysicalMaterial(
      bakeQuality()
        ? // Real acrylic for the path tracer: transmissive, IOR 1.49, faint tint.
          { color: 0xf4f8fb, roughness: 0.03, metalness: 0, transmission: 1, ior: 1.49, thickness: 0.003, side: THREE.DoubleSide, specularIntensity: 1 }
        : {
            color: 0xe9eef2,
            roughness: 0.04,
            metalness: 0,
            transparent: true,
            opacity: 0.13,
            depthWrite: false,
            side: THREE.DoubleSide,
            clearcoat: 1,
            clearcoatRoughness: 0.04,
            specularIntensity: 1,
          },
    );
    const shellMesh = mesh(merge(parts), plastic, false);
    shellMesh.receiveShadow = false;
    shellMesh.renderOrder = 5;
    lid.add(shellMesh);
    // Light catching the cut edges of the acrylic.
    const edgeBox = new THREE.EdgesGeometry(place(rbox(LW, LH, LD, rr, 2), [0, LH / 2, z0 + LD / 2]), 40);
    const edges = new THREE.LineSegments(edgeBox, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    edges.renderOrder = 6;
    edges.visible = !bakeQuality(); // line primitives: not traced
    lid.add(edges);
    const sheen = new THREE.Mesh(
      new THREE.PlaneGeometry(LW - 0.006, LD - 0.006),
      new THREE.MeshBasicMaterial({
        map: canvasTexture(256, 256, (c) => {
          const gr = c.createLinearGradient(0, 0, 256, 256);
          gr.addColorStop(0, 'rgba(255 255 255 / 0.0)');
          gr.addColorStop(0.3, 'rgba(255 255 255 / 0.08)');
          gr.addColorStop(0.38, 'rgba(255 255 255 / 0.28)');
          gr.addColorStop(0.46, 'rgba(255 255 255 / 0.05)');
          gr.addColorStop(0.62, 'rgba(255 255 255 / 0.0)');
          gr.addColorStop(0.7, 'rgba(255 255 255 / 0.12)');
          gr.addColorStop(0.76, 'rgba(255 255 255 / 0.0)');
          c.fillStyle = gr;
          c.fillRect(0, 0, 256, 256);
        }),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.5,
      }),
    );
    sheen.rotation.x = -Math.PI / 2;
    sheen.position.set(0, LH + 0.0003, z0 + LD / 2);
    sheen.renderOrder = 7;
    sheen.visible = !bakeQuality(); // fake additive glint: the real glass reflects instead
    lid.add(sheen);
    if (bakeQuality()) {
      const dust = new THREE.Mesh(
        new THREE.PlaneGeometry(LW - 0.006, LD - 0.006),
        new THREE.MeshStandardMaterial({ map: dustTexture(), transparent: true, roughness: 0.75, metalness: 0, depthWrite: false }),
      );
      dust.rotation.x = -Math.PI / 2;
      dust.position.set(0, LH + 0.00014, z0 + LD / 2);
      dust.name = 'bake-dust';
      lid.add(dust);
    }
    // Hinge leaves clamped on the lid's back wall, dropping into the blocks.
    const leaves: THREE.BufferGeometry[] = [];
    for (const hx of [-0.11, 0.11]) leaves.push(place(rbox(0.03, 0.03, 0.007, 0.002), [hx, 0.012, z0 + 0.001]));
    lid.add(mesh(merge(leaves), darkPlastic));
    if (bakeQuality()) {
      const sc: THREE.BufferGeometry[] = [];
      for (const hx of [-0.11, 0.11]) for (const sx of [-1, 1]) for (const y of [0.005, 0.019]) sc.push(place(new THREE.CylinderGeometry(0.0021, 0.0023, 0.0008, 24).rotateX(Math.PI / 2), [hx + sx * 0.009, y, z0 - 0.0028]));
      lid.add(mesh(merge(sc), std(0xc9cacc, 0.25, 1), false));
    }
    g.add(lid);
  }

  return { group: g, spin, arm, armPlay, armEnd, lid, lidOpen, setLabel: (tex) => ((labelMat.map = tex), (labelMat.needsUpdate = true)) };
}
