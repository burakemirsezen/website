// Part of the listening room. See kit.ts for the conventions.
//
// Edifier R1280DB powered bookshelf speaker, wood finish, matched to the
// official product shot: 146 W x 234 H x 196 D mm. A honey/teak wood-grain
// wrap (fine vertical grain on the sides, softly rounded edges), the light
// grey woven cloth grille on, covering the whole front with rounded,
// cushioned edges, a thin chrome strip across it a little above the middle
// and the chrome EDIFIER badge near the bottom. The right speaker is the
// active one: the dark recessed control pocket towards the front of its
// outer side (treble, bass, volume/input, LED) and the input panel on its
// back; the left speaker has a spring-clip terminal.
//
//   buildSpeaker('left') / buildSpeaker('right')

import { THREE, std, mesh, canvasTexture, RoundedBoxGeometry } from './kit';
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

// Dimensions (m).
const W = 0.146;
const H = 0.234;
const D = 0.196;
const GRILLE = 0.01; // the cloth grille frame's thickness
const BACK = 0.004; // the black back panel

// Deterministic noise for the drawings.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function roundedRect(w: number, h: number, r: number, path: THREE.Path = new THREE.Shape()) {
  path.moveTo(-w / 2 + r, -h / 2);
  path.lineTo(w / 2 - r, -h / 2);
  path.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  path.lineTo(w / 2, h / 2 - r);
  path.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  path.lineTo(-w / 2 + r, h / 2);
  path.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  path.lineTo(-w / 2, -h / 2 + r);
  path.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return path;
}

// Brown wood-grain vinyl: grain runs along the canvas x. `len` and
// `across` are the face size in metres, so the grain has the same scale on
// every face. Long, nearly straight streaks of open grain over colour
// bands, as on the real wrap.
const woodCache = new Map<string, THREE.Texture>();
function woodGrain(len: number, across: number, seed: number, kind: 'map' | 'bump') {
  const key = `${len}:${across}:${seed}:${kind}`;
  const hit = woodCache.get(key);
  if (hit) return hit;
  const px = 2600; // px per metre
  const w = Math.round(len * px);
  const h = Math.round(across * px);
  const t = canvasTexture(w, h, (g) => {
    const r = rng(seed);
    const bump = kind === 'bump';
    g.fillStyle = bump ? '#808080' : '#b8784a';
    g.fillRect(0, 0, w, h);
    // Broad colour bands.
    if (!bump)
      for (let i = 0; i < 30; i++) {
        const y = r() * h;
        const bh = 4 + r() * 70;
        const c = 0.5 + r() * 0.5;
        g.fillStyle = r() < 0.55 ? `rgba(130 74 30 / ${0.12 * c})` : `rgba(226 176 120 / ${0.14 * c})`;
        g.fillRect(0, y, w, bh);
      }
    // Long grain lines, gently wavy.
    const lines = Math.round(h / 2.4);
    for (let i = 0; i < lines; i++) {
      const y0 = r() * h;
      const amp = 0.4 + r() * 1.6;
      const freq = (0.3 + r() * 0.7) / w;
      const ph = r() * 10;
      const dark = r();
      g.strokeStyle = bump
        ? `rgba(0 0 0 / ${0.12 + dark * 0.3})`
        : dark < 0.78
          ? `rgba(122 66 26 / ${0.04 + dark * 0.12})`
          : `rgba(222 168 112 / ${0.12 + (dark - 0.78) * 0.6})`;
      g.lineWidth = 0.6 + r() * (dark > 0.92 ? 2.2 : 1.1);
      g.beginPath();
      const x0 = r() < 0.3 ? r() * w * 0.6 : 0;
      const x1 = x0 === 0 ? w : Math.min(w, x0 + w * (0.3 + r() * 0.7));
      for (let x = x0; x <= x1; x += 12) {
        const y = y0 + Math.sin(x * freq * Math.PI * 2 + ph) * amp + Math.sin(x * 0.011 + ph) * 0.8;
        if (x === x0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    // Open-grain streaks: short dark dashes along the grain.
    for (let i = 0; i < w * h * 0.0007; i++) {
      const a = 0.1 + r() * 0.25;
      g.fillStyle = bump ? `rgba(0 0 0 / ${a + 0.2})` : `rgba(110 56 20 / ${a * 0.5})`;
      g.fillRect(r() * w, r() * h, 3 + r() * 14, 0.6 + r() * 0.7);
    }
    // A couple of soft cathedral figures.
    for (let k = 0; k < 2; k++) {
      const cx = r() * w;
      const cy = r() * h;
      const n = 5 + Math.floor(r() * 5);
      for (let j = 0; j < n; j++) {
        const s = 1 + j * (5 + r() * 3);
        g.strokeStyle = bump ? 'rgba(0 0 0 / 0.25)' : `rgba(110 56 20 / ${0.1 + r() * 0.1})`;
        g.lineWidth = 0.8 + r();
        g.beginPath();
        g.ellipse(cx, cy, s * 9, s, 0, Math.PI * 0.08, Math.PI * 0.92);
        g.stroke();
      }
    }
  });
  if (kind === 'bump') t.colorSpace = THREE.NoColorSpace;
  woodCache.set(key, t);
  return t;
}

// Wood material for one face; `rotate` turns the grain 90 degrees (for
// faces whose u axis is not along the grain). len runs along the grain.
function woodMat(len: number, across: number, seed: number, rotate = false) {
  const map = woodGrain(len, across, seed, 'map').clone();
  const bump = woodGrain(len, across, seed, 'bump').clone();
  for (const t of [map, bump]) {
    t.needsUpdate = true;
    if (rotate) {
      t.center.set(0.5, 0.5);
      t.rotation = Math.PI / 2;
    }
  }
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.3, roughness: 0.6 });
}

// Fine stipple for the matte black plastic and MDF faces.
function stipple() {
  const t = canvasTexture(128, 128, (g) => {
    const r = rng(99);
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2500; i++) {
      const v = Math.floor(100 + r() * 60);
      g.fillStyle = `rgb(${v} ${v} ${v})`;
      g.fillRect(r() * 128, r() * 128, 1 + r(), 1 + r());
    }
  });
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

// Mid grey woven grille cloth. Tiles every 3.3 cm (the extruded grille's
// UVs are in metres).
const FABRIC = 158; // cloth albedo (0-255), tuned against the photo
function fabric(bump: boolean) {
  const t = canvasTexture(256, 256, (g) => {
    const r = rng(11);
    g.fillStyle = bump ? '#808080' : `rgb(${FABRIC} ${FABRIC} ${FABRIC})`;
    g.fillRect(0, 0, 256, 256);
    // Fine basket weave of 2 px threads, with random fibre speckle.
    for (let y = 0; y < 256; y += 2)
      for (let x = 0; x < 256; x += 2) {
        const on = ((x >> 1) + (y >> 1)) % 2 === 0;
        const v = (on ? 16 : -16) + (r() - 0.5) * 44;
        const c = bump ? 128 + v * 2 : FABRIC + v;
        g.fillStyle = `rgb(${c} ${c} ${c})`;
        g.fillRect(x, y, 2, 2);
      }
    // Coarser pebbly slubs, as in the photo's cloth.
    for (let i = 0; i < 700; i++) {
      const a = 0.04 + r() * 0.08;
      g.fillStyle = r() < 0.5 ? `rgba(0 0 0 / ${a})` : `rgba(255 255 255 / ${a})`;
      g.beginPath();
      g.arc(r() * 256, r() * 256, 1 + r() * 2.2, 0, Math.PI * 2);
      g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(30, 30);
  if (bump) t.colorSpace = THREE.NoColorSpace;
  return t;
}

// EDIFIER in bold condensed, wide-tracked silver capitals with a thin dark
// edge, on a transparent 1024 x 205 canvas (crisp at close range).
function wordmarkTexture() {
  return canvasTexture(1024, 205, (g) => {
    g.clearRect(0, 0, 1024, 205);
    g.font = 'bold 200px Arial, Helvetica, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '44px';
    // Condense the bold face horizontally, as on the real wordmark.
    const w = g.measureText('EDIFIER').width;
    const sx = Math.min(0.74, 980 / w);
    g.save();
    g.translate(512 + 22 * sx, 178);
    g.scale(sx, 1);
    g.lineJoin = 'round';
    g.lineWidth = 15;
    g.strokeStyle = 'rgba(25 25 25 / 0.7)';
    g.strokeText('EDIFIER', 0, 0);
    const grad = g.createLinearGradient(0, -145, 0, 0);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, '#e2e2e2');
    grad.addColorStop(0.62, '#c4c4c4');
    grad.addColorStop(1, '#f2f2f2');
    g.fillStyle = grad;
    // A stroke in the fill gradient thickens the strokes to the badge's weight.
    g.lineWidth = 7;
    g.strokeStyle = grad;
    g.strokeText('EDIFIER', 0, 0);
    g.fillText('EDIFIER', 0, 0);
    g.restore();
  });
}

function labelTexture(text: string, w: number, h: number, font: string, color = '#c9c9c6') {
  return canvasTexture(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2);
  });
}

// Print on the control pocket's insert: scales, labels, LED legend, with
// shading for the scooped top and bottom. PW x PH metres, canvas x = -z
// (toward the back when seen from the right), canvas y = down.
const PKW = 0.062;
const PKH = 0.112;
const KNOB_D = [0.05, 0.073, 0.096]; // knob centres below the cabinet top
function pocketTexture() {
  const s = 4000; // px per metre
  const w = Math.round(PKW * s);
  const h = Math.round(PKH * s);
  return canvasTexture(w, h, (g) => {
    g.fillStyle = '#3e3e3e';
    g.fillRect(0, 0, w, h);
    // Scooped top and bottom: sloped faces, the lower one catching light.
    g.fillStyle = '#262626';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(w, 0);
    g.lineTo(w * 0.8, 62);
    g.lineTo(w * 0.2, 62);
    g.closePath();
    g.fill();
    let gr = g.createLinearGradient(0, h - 70, 0, h);
    gr.addColorStop(0, '#5a5a5a');
    gr.addColorStop(1, '#6c6c6c');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(w * 0.2, h - 70);
    g.lineTo(w * 0.8, h - 70);
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.closePath();
    g.fill();
    // Side walls of the pocket, lit from the front.
    gr = g.createLinearGradient(0, 0, 26, 0);
    gr.addColorStop(0, '#2c2c2c');
    gr.addColorStop(1, 'rgba(27 27 27 / 0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 26, h);
    gr = g.createLinearGradient(w - 26, 0, w, 0);
    gr.addColorStop(0, 'rgba(27 27 27 / 0)');
    gr.addColorStop(1, '#0c0c0c');
    g.fillStyle = gr;
    g.fillRect(w - 26, 0, 26, h);

    g.fillStyle = '#a9a9a6';
    g.strokeStyle = '#a9a9a6';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const kx = w * 0.43;
    const knobs = [
      { y: KNOB_D[0], label: 'treble', eq: true },
      { y: KNOB_D[1], label: 'bass', eq: true },
      { y: KNOB_D[2], label: 'volume / input', eq: false },
    ];
    for (const k of knobs) {
      const ky = k.y * s - 0.022 * s;
      const rr = 0.0098 * s;
      g.lineWidth = 2;
      for (let i = 0; i <= 12; i++) {
        const a = THREE.MathUtils.degToRad(-135 + i * 22.5);
        if (!k.eq) continue;
        g.beginPath();
        g.moveTo(kx + Math.sin(a) * rr, ky - Math.cos(a) * rr);
        g.lineTo(kx + Math.sin(a) * (rr + 6), ky - Math.cos(a) * (rr + 6));
        g.stroke();
      }
      g.font = '11px Arial, sans-serif';
      if (k.eq) {
        [
          ['-6', -135],
          ['-4', -90],
          ['-2', -45],
          ['0', 0],
          ['+2', 45],
          ['+4', 90],
          ['+6', 135],
        ].forEach(([t, deg]) => {
          const a = THREE.MathUtils.degToRad(Number(deg));
          g.fillText(String(t), kx + Math.sin(a) * (rr + 12), ky - Math.cos(a) * (rr + 10));
        });
      } else {
        g.fillText('−', kx - rr - 2, ky + rr + 6);
        g.fillText('+', kx + rr + 2, ky + rr + 6);
      }
      g.font = '14px Arial, sans-serif';
      g.fillText(k.label, kx, ky + rr + 13);
    }
    // LED legend label near the bottom.
    g.fillStyle = '#7a7a78';
    g.fillRect(kx - 56, h - 52, 112, 36);
    g.fillStyle = '#1b1b1b';
    g.font = 'bold 9px Arial, sans-serif';
    g.fillText('Input indicator (LED)', kx, h - 46);
    ['RED   OPT/COA', 'BLUE   BT', 'GREEN   Line in1/2'].forEach((t, i) => g.fillText(t, kx, h - 37 + i * 9));
  });
}

// Print on the active speaker's back plate.
function backPlateTexture(w: number, h: number) {
  const s = 4000;
  const cw = Math.round(w * s);
  const ch = Math.round(h * s);
  return canvasTexture(cw, ch, (g) => {
    g.fillStyle = '#151515';
    g.fillRect(0, 0, cw, ch);
    g.strokeStyle = '#2a2a2a';
    g.lineWidth = 3;
    g.strokeRect(2, 2, cw - 4, ch - 4);
    g.fillStyle = '#8c8c8a';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.font = 'bold 40px Arial, sans-serif';
    g.fillText('EDIFIER', 26, 36);
    g.textAlign = 'center';
    g.font = '20px Arial, sans-serif';
    g.fillText('R1280DB', cw * 0.76, 30);
    g.font = '14px Arial, sans-serif';
    g.fillText('Multimedia Speaker', cw * 0.76, 50);
    // Grey label panels behind the speaker-out clips and the line inputs.
    g.fillStyle = '#3c3c3c';
    g.fillRect(24, 66, cw * 0.47, 95);
    g.fillRect(cw * 0.55, 66, cw * 0.4, 112);
    g.fillStyle = '#9a9a98';
    g.font = '15px Arial, sans-serif';
    g.fillText('L  Speaker Out', 24 + cw * 0.235, 78);
    g.fillText('LINE1', cw * 0.9, 96);
    g.fillText('LINE2', cw * 0.9, 150);
    g.fillText('OPT', cw * 0.88, 210);
    g.fillText('COX', cw * 0.88, 258);
    g.fillText('Power', cw * 0.3, 214);
    g.fillText('Off', cw * 0.15, 252);
    g.fillText('On', cw * 0.45, 252);
    g.font = '13px Arial, sans-serif';
    g.fillText('100-240V~ 50/60Hz 300mA', cw * 0.6, ch - 92);
    g.fillText('Edifier International Limited', cw * 0.6, ch - 40);
  });
}

// Side control knob (around +y; turned to face +x).
function knobGeometry() {
  const pts = [
    new THREE.Vector2(0, 0.0095),
    new THREE.Vector2(0.0058, 0.0095),
    new THREE.Vector2(0.0067, 0.0089),
    new THREE.Vector2(0.0069, 0.0081),
    new THREE.Vector2(0.0069, 0.003),
    new THREE.Vector2(0.0082, 0.0028),
    new THREE.Vector2(0.0084, 0),
  ];
  return new THREE.LatheGeometry(pts, 32);
}

export function buildSpeaker(side: 'left' | 'right' = 'left'): THREE.Group {
  const g = new THREE.Group();
  const batch = new Batch();
  const right = side === 'right';
  const seed = right ? 7 : 3;

  // Materials.
  const ds = { side: THREE.DoubleSide };
  const bump = stipple();
  const baffle = std(0x1c1c1c, 0.78, 0, { bumpMap: bump, bumpScale: 0.12 });
  const backMat = std(0x181818, 0.8, 0, { bumpMap: bump, bumpScale: 0.12 });
  const rubber = std(0x121212, 0.7, 0, ds);
  const satin = std(0x151515, 0.45, 0, ds);
  const knobMat = std(0x141414, 0.55);
  const metal = std(0xb8b9ba, 0.3, 0.5);

  // Cabinet: the wrap over sides, top and bottom; black back. Box face
  // order: +x, -x, +y, -y, +z, -z. Grain runs vertically on the sides and
  // left to right on the top and bottom, as one continuous wrap.
  const CD = D - GRILLE;
  const mats = [
    woodMat(H, CD, seed + 1, true),
    woodMat(H, CD, seed + 2, true),
    woodMat(W, CD, seed + 3),
    woodMat(W, CD, seed + 4),
    baffle,
    backMat,
  ];
  const cab = mesh(new RoundedBoxGeometry(W, H, CD, 4, 0.008), mats);
  cab.position.set(0, H / 2, -GRILLE / 2);
  g.add(cab);
  // Black back panel inset in the wrap's rear edge.
  batch.add(new RoundedBoxGeometry(W - 0.006, H - 0.006, BACK, 2, 0.006), backMat, [0, H / 2, -D / 2 + BACK / 2 - 0.0006]);

  // The cloth grille over the whole front: a rounded-rectangle frame with
  // a soft cushioned edge, covered in light grey woven fabric.
  const zf = D / 2;
  {
    const bev = 0.0035;
    const r = 0.011;
    const s = roundedRect(W - 0.0016 - 2 * bev, H - 0.0016 - 2 * bev, r - bev) as THREE.Shape;
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: GRILLE - 2 * bev,
      bevelEnabled: true,
      bevelThickness: bev,
      bevelSize: bev,
      bevelSegments: 4,
      curveSegments: 8,
    });
    const cloth = new THREE.MeshStandardMaterial({
      map: fabric(false),
      bumpMap: fabric(true),
      bumpScale: 0.5,
      roughness: 0.95,
    });
    const m = mesh(geo, [cloth, cloth]);
    m.position.set(0, H / 2, zf - GRILLE + bev);
    g.add(m);
  }
  // Thin chrome strip across the grille, a little above the middle.
  const stripMat = std(0xf6f6f4, 0.15, 0.1);
  const strip = mesh(new RoundedBoxGeometry(W * 0.78, 0.0028, 0.0018, 1, 0.0009), stripMat, false);
  strip.receiveShadow = false;
  strip.position.set(0, 0.125, zf + 0.0002);
  g.add(strip);
  // The EDIFIER wordmark, chrome letters straight on the cloth near the
  // bottom: about 30% of the grille width, letters about 6.5 mm tall.
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.046, 0.0092),
    new THREE.MeshStandardMaterial({
      map: wordmarkTexture(),
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      roughness: 0.35,
      metalness: 0.1,
    }),
  );
  logo.position.set(0, 0.027, zf + 0.0004);
  g.add(logo);

  const zb = -D / 2 - 0.0006;
  if (!right) {
    // Passive speaker: spring-clip terminal plate low on the back.
    batch.add(new RoundedBoxGeometry(0.036, 0.024, 0.003, 1, 0.001), satin, [0.004, 0.045, zb - 0.0015]);
    batch.add(new RoundedBoxGeometry(0.026, 0.012, 0.007, 1, 0.0015), satin, [0.006, 0.047, zb - 0.0045]);
    batch.add(new THREE.BoxGeometry(0.008, 0.005, 0.005), satin, [0.0, 0.039, zb - 0.007]);
    batch.add(new THREE.BoxGeometry(0.008, 0.005, 0.005), std(0xd42a1e, 0.5), [0.012, 0.039, zb - 0.007]);
  } else {
    // Active speaker: the input plate on the back.
    const PW = 0.112;
    const PH = 0.15;
    const PY = 0.12;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(PW, PH),
      new THREE.MeshStandardMaterial({ map: backPlateTexture(PW, PH), roughness: 0.6 }),
    );
    plate.rotation.y = Math.PI;
    plate.position.set(0, PY, zb - 0.0016);
    g.add(plate);
    batch.add(new RoundedBoxGeometry(PW + 0.002, PH + 0.002, 0.0015, 1, 0.003), satin, [0, PY, zb - 0.0008]);
    // Positions in plate coordinates (u right as seen from behind, v up).
    const at = (u: number, v: number, d: number): THREE.Vector3Tuple => [-(u - PW / 2), PY + PH / 2 - v, zb - d];
    const back: THREE.Vector3Tuple = [-Math.PI / 2, 0, 0];
    // RCA pairs (LINE1, LINE2): white left, red right.
    const rca = new THREE.CylinderGeometry(0.0046, 0.0046, 0.009, 16);
    const insul = new THREE.CylinderGeometry(0.0028, 0.0028, 0.0092, 12);
    const pin = new THREE.CylinderGeometry(0.0009, 0.0009, 0.0094, 6);
    const whiteM = std(0xe6e6e2, 0.5);
    const redM = std(0xc0201a, 0.5);
    for (const v of [0.028, 0.0405])
      [0.072, 0.088].forEach((u, i) => {
        batch.add(rca, metal, at(u, v, 0.0045), back);
        batch.add(insul, i === 0 ? whiteM : redM, at(u, v, 0.0047), back);
        batch.add(pin, metal, at(u, v, 0.0049), back);
      });
    // Optical (square, shuttered) and coaxial (yellow).
    batch.add(new RoundedBoxGeometry(0.009, 0.0085, 0.006, 1, 0.001), satin, at(0.085, 0.052, 0.003));
    batch.add(rca, metal, at(0.085, 0.064, 0.0045), back);
    batch.add(insul, std(0xe8c21a, 0.5), at(0.085, 0.064, 0.0047), back);
    // Speaker-out spring clips.
    batch.add(new RoundedBoxGeometry(0.03, 0.013, 0.008, 1, 0.0015), satin, at(0.031, 0.031, 0.004));
    batch.add(new THREE.BoxGeometry(0.008, 0.005, 0.009), satin, at(0.025, 0.037, 0.0045));
    batch.add(new THREE.BoxGeometry(0.008, 0.005, 0.009), redM, at(0.038, 0.037, 0.0045));
    // Power rocker.
    batch.add(new RoundedBoxGeometry(0.017, 0.011, 0.004, 1, 0.001), satin, at(0.034, 0.061, 0.002));
    batch.add(new RoundedBoxGeometry(0.013, 0.008, 0.004, 1, 0.001), std(0x0a0a0a, 0.35), at(0.034, 0.061, 0.004), [0, 0.18, 0]);
    // Mains cord through its grommet, dropping to the desk.
    batch.add(new THREE.CylinderGeometry(0.005, 0.0055, 0.004, 16), satin, at(0.034, 0.093, 0.002), back);
    const cordCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(...at(0.034, 0.093, 0.003)),
      new THREE.Vector3(...at(0.034, 0.096, 0.02)),
      new THREE.Vector3(...at(0.03, 0.12, 0.04)),
      new THREE.Vector3(...at(0.03, 0.135, 0.045)),
      new THREE.Vector3(-(0.03 - PW / 2), 0.003, zb - 0.06),
      new THREE.Vector3(-(0.02 - PW / 2), 0.003, zb - 0.075),
    ]);
    batch.add(new THREE.TubeGeometry(cordCurve, 24, 0.0026, 8), std(0x0c0c0c, 0.5));

    // Control pocket on the outer (+x) side: a black moulded frame around a
    // recessed insert carrying treble, bass and volume/input, and the LED.
    const xs = W / 2;
    const PZ = zf - 0.042 - PKW / 2; // centre z of the pocket
    const PCY = H - 0.022 - PKH / 2;
    {
      const frame = roundedRect(PKW + 0.006, PKH + 0.006, 0.01) as THREE.Shape;
      frame.holes.push(roundedRect(PKW, PKH, 0.008, new THREE.Path()));
      const geo = new THREE.ExtrudeGeometry(frame, {
        depth: 0.0012,
        bevelEnabled: true,
        bevelThickness: 0.0006,
        bevelSize: 0.0006,
        bevelSegments: 1,
        curveSegments: 6,
      });
      // Shape x -> -z, shape y -> y, extrude +z -> +x.
      batch.add(geo, satin, [xs - 0.0004, PCY, PZ], [0, Math.PI / 2, 0]);
    }
    const insert = new THREE.Mesh(
      new THREE.PlaneGeometry(PKW, PKH),
      new THREE.MeshStandardMaterial({ map: pocketTexture(), roughness: 0.7 }),
    );
    insert.rotation.y = Math.PI / 2;
    insert.position.set(xs + 0.0003, PCY, PZ);
    insert.receiveShadow = true;
    g.add(insert);
    // Knobs: at 43% across the insert from its front edge.
    const kz = PZ + PKW / 2 - PKW * 0.43;
    const knob = knobGeometry();
    const tick = new THREE.BoxGeometry(0.0003, 0.0026, 0.0006);
    const angles = [0.1, -0.25, 0.6];
    KNOB_D.forEach((d, i) => {
      const y = H - d;
      batch.add(knob, knobMat, [xs + 0.0003, y, kz], [0, 0, -Math.PI / 2]);
      // Thin ring around the knob's base.
      batch.add(new THREE.TorusGeometry(0.009, 0.0005, 6, 32), satin, [xs + 0.0006, y, kz], [0, Math.PI / 2, 0]);
      // Indicator notch on the knob face.
      const a = angles[i];
      batch.add(tick, std(0x4a4a48, 0.6), [xs + 0.0097, y + Math.cos(a) * 0.0038, kz + Math.sin(a) * 0.0038], [a, 0, 0]);
    });
    // The input LED below the volume knob (green: line in).
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.0016, 12, 6, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x0f3b1a, emissive: 0x2bff6a, emissiveIntensity: 0.9, roughness: 0.3 }),
    );
    led.rotation.y = Math.PI / 2;
    led.position.set(xs + 0.0003, H - 0.1095, kz);
    g.add(led);
  }

  // Four small rubber pads under the cabinet.
  const pad = new THREE.CylinderGeometry(0.006, 0.006, 0.0015, 14);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.add(pad, rubber, [sx * (W / 2 - 0.015), -0.0007, sz * (D / 2 - 0.02)]);

  batch.flush(g);
  // Lift so the pads stand on y = 0.
  for (const c of g.children) c.position.y += 0.0015;
  return g;
}
