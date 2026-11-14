// The listening room: a small WebGL scene of the corner where the music
// happens, in a Zurich flat. The gear is modelled in its own files after the
// real things (see kit.ts); this file builds the room around it, lights it,
// and handles the pointer: hovering an object shows what it is, clicking a
// record opens it.
//
// Units are metres. The room is 3.6 wide, 2.7 tall and 3.6 deep; x = 0 is
// the middle, z = 1.8 the open front, z = -1.8 the back wall, y = 0 the
// floor. Daylight comes through a deep-set window in the left wall; at night
// (dark mode) the floor lamp in the right corner does the work.

import { THREE, C, std, mesh, box, cyl, canvasTexture, grainTexture, RoundedBoxGeometry } from './kit';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildGuitar } from './guitar';
import { buildAmp } from './amp';
import { buildInterface } from './interface';
import { buildTurntable } from './turntable';
import { buildSpeaker } from './speakers';

export interface RoomRecord {
  title: string;
  artist: string;
  url: string;
}

export interface RoomGear {
  title: string;
  text: string;
}

export interface RoomOptions {
  covers: string[];
  reducedMotion: boolean;
  /** Forces the light; by default it follows prefers-color-scheme. */
  mood?: 'day' | 'night';
  /** Hover labels for the sleeves, in the order of `covers`. */
  records?: RoomRecord[];
  /** Hover labels for the gear, keyed guitar, amp, interface, turntable, speakers. */
  gear?: Record<string, RoomGear>;
  /** Called once, after the first frame is on the canvas. */
  onReady?: () => void;
}

const W = 3.6;
const H = 2.7;
const D = 3.6;
const BACK = -D / 2;
const FRONT = D / 2;
const LEFT = -W / 2;
const RIGHT = W / 2;

// The window in the left wall, set deep into an old, thick wall.
const WIN = { z0: -1.55, z1: -0.4, y0: 0.86, y1: 2.28, wall: 0.34 };
const WIN_MID = (WIN.z0 + WIN.z1) / 2;

// The sideboard against the back wall.
const BOARD = { x: 0.14, w: 1.62, d: 0.42, h: 0.6 };
const BOARD_Z = BACK + 0.02 + BOARD.d / 2;

const OAK = '#b98d5f';

// Small deterministic noise, so every visit draws the same room.
function hash(a: number, b = 0) {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// --------------------------------------------------------------- Textures

// Oak parquet in herringbone (Fischgrat), the floor of most old Zurich flats.
// One canvas covers the whole floor, so nothing repeats.
function parquetTexture() {
  const pw = 2048;
  const ph = Math.round((pw * D) / W);
  const t = canvasTexture(pw, ph, (g) => {
    g.fillStyle = '#6b4a2e';
    g.fillRect(0, 0, pw, ph);
    const ppm = pw / W;
    const c = 0.072 * ppm; // plank width in pixels
    const n = 6; // plank length in widths
    g.translate(pw / 2, ph / 2);
    g.rotate(Math.PI / 4);
    const reach = Math.ceil(Math.hypot(pw, ph) / c / 2) + n * 2;
    const plank = (x: number, y: number, w: number, h: number, i: number, j: number, along: boolean) => {
      const r = hash(i, j);
      const l = 50 + r * 11;
      g.fillStyle = `hsl(${29 + hash(j, i) * 6} ${36 + r * 10}% ${l}%)`;
      g.fillRect(x, y, w, h);
      // A few grain lines along the plank.
      g.lineWidth = 1;
      for (let k = 0; k < 5; k++) {
        g.strokeStyle = `rgba(80 50 25 / ${0.05 + hash(i + k, j) * 0.09})`;
        g.beginPath();
        if (along) {
          const yy = y + h * (0.12 + hash(k, i + j) * 0.76);
          g.moveTo(x, yy);
          g.bezierCurveTo(x + w * 0.35, yy + 2, x + w * 0.65, yy - 2, x + w, yy + 1);
        } else {
          const xx = x + w * (0.12 + hash(k, i + j) * 0.76);
          g.moveTo(xx, y);
          g.bezierCurveTo(xx + 2, y + h * 0.35, xx - 2, y + h * 0.65, xx + 1, y + h);
        }
        g.stroke();
      }
      // A soft sheen toward one end, as light catches lacquer unevenly.
      const sheen = along ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
      sheen.addColorStop(0, 'rgba(255 240 220 / 0)');
      sheen.addColorStop(0.5, `rgba(255 240 220 / ${0.05 * hash(j, i + 3)})`);
      sheen.addColorStop(1, 'rgba(255 240 220 / 0)');
      g.fillStyle = sheen;
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(45 28 14 / 0.55)';
      g.lineWidth = 1.4;
      g.strokeRect(x, y, w, h);
    };
    for (let i = -reach; i <= reach; i++) {
      for (let j = -reach; j <= reach; j++) {
        const m = (((i - j) % (2 * n)) + 2 * n) % (2 * n);
        if (m === 0) plank(i * c, j * c, n * c, c, i, j, true);
        else if (m === 2 * n - 1) plank(i * c, j * c, c, n * c, i, j, false);
      }
    }
  });
  t.anisotropy = 8;
  return t;
}

// Lime plaster: the wall colour with a faint, uneven trowel texture.
function plasterTexture(base: string) {
  const t = canvasTexture(512, 512, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 2400; k++) {
      const x = hash(k, 1) * 512;
      const y = hash(k, 2) * 512;
      const r = 1 + hash(k, 3) * 5;
      g.fillStyle = hash(k, 4) > 0.5 ? 'rgba(255 255 255 / 0.025)' : 'rgba(90 70 50 / 0.012)';
      g.beginPath();
      g.ellipse(x, y, r * 1.6, r, hash(k, 5) * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// A flat-woven wool rug: oatmeal field, charcoal border, one thin ember line.
function rugTexture() {
  return canvasTexture(1024, 720, (g) => {
    const w = 1024;
    const h = 720;
    g.fillStyle = '#cdbfa6';
    g.fillRect(0, 0, w, h);
    // Weave: fine horizontal ribs and a slight mottle.
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = `rgba(110 90 60 / ${0.05 + hash(y) * 0.05})`;
      g.fillRect(0, y, w, 1);
    }
    for (let k = 0; k < 3000; k++) {
      g.fillStyle = hash(k, 7) > 0.5 ? 'rgba(255 250 240 / 0.08)' : 'rgba(80 60 40 / 0.06)';
      g.fillRect(hash(k, 8) * w, hash(k, 9) * h, 4 + hash(k) * 10, 2);
    }
    const band = (inset: number, size: number, color: string) => {
      g.strokeStyle = color;
      g.lineWidth = size;
      g.strokeRect(inset + size / 2, inset + size / 2, w - 2 * inset - size, h - 2 * inset - size);
    };
    band(0, 26, '#3a3530');
    band(40, 4, '#e8693a');
    band(52, 2, '#3a3530');
    // Ribs over the border too.
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = 'rgba(255 255 255 / 0.03)';
      g.fillRect(0, y, w, 1);
    }
  });
}

// What is outside the window: the facade across the street, a lime tree,
// sky. Painted soft, as if slightly out of focus.
function outsideTexture(night: boolean) {
  return canvasTexture(1024, 768, (g) => {
    const w = 1024;
    const h = 768;
    const sky = g.createLinearGradient(0, 0, 0, h);
    if (night) {
      sky.addColorStop(0, '#0c1220');
      sky.addColorStop(1, '#1f2433');
    } else {
      sky.addColorStop(0, '#cfe0ee');
      sky.addColorStop(0.7, '#f4efe4');
      sky.addColorStop(1, '#f7f1e6');
    }
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.filter = 'blur(3px)';
    // The building across the street: plaster, a cornice, rows of windows.
    g.fillStyle = night ? '#23242b' : '#e7d8bf';
    g.fillRect(120, 250, 820, 600);
    g.fillStyle = night ? '#1a1b21' : '#d3c1a3';
    g.fillRect(110, 236, 840, 22);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 6; col++) {
        const x = 160 + col * 135;
        const y = 300 + row * 150;
        const lit = night && hash(row, col) > 0.62;
        g.fillStyle = lit ? '#e9b56c' : night ? '#14161c' : '#8b8f94';
        g.fillRect(x, y, 56, 96);
        // Shutters, as Zurich windows have.
        if (!night) {
          g.fillStyle = hash(col, row) > 0.5 ? '#7d8a74' : '#86917c';
          g.fillRect(x - 24, y - 2, 22, 100);
          g.fillRect(x + 58, y - 2, 22, 100);
        }
      }
    }
    // The top of a lime tree in the street, soft and round.
    g.filter = 'blur(6px)';
    for (let k = 0; k < 40; k++) {
      const cx = 820 + (hash(k, 1) - 0.5) * 300;
      const cy = 600 + (hash(k, 2) - 0.5) * 260;
      const r = 24 + hash(k, 3) * 44;
      const l = night ? 8 + hash(k, 4) * 5 : 48 + hash(k, 4) * 16;
      g.fillStyle = `hsl(${70 + hash(k, 5) * 25} ${night ? 12 : 22}% ${l}% / 0.8)`;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
    }
    g.filter = 'none';
  });
}

// A soft round blot, for contact shadows under furniture.
let blobTex: THREE.Texture | undefined;
function blobTexture() {
  return (blobTex ??= canvasTexture(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(0 0 0 / 1)');
    r.addColorStop(0.45, 'rgba(0 0 0 / 0.6)');
    r.addColorStop(1, 'rgba(0 0 0 / 0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  }));
}

// A linear fade, for the darkening where walls meet (cheap ambient occlusion).
let fadeTex: THREE.Texture | undefined;
function fadeTexture() {
  return (fadeTex ??= canvasTexture(4, 128, (g) => {
    const r = g.createLinearGradient(0, 0, 0, 128);
    r.addColorStop(0, 'rgba(0 0 0 / 1)');
    r.addColorStop(0.35, 'rgba(0 0 0 / 0.35)');
    r.addColorStop(1, 'rgba(0 0 0 / 0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 4, 128);
  }));
}

function shadowMat(tex: THREE.Texture, opacity: number) {
  return new THREE.MeshBasicMaterial({
    color: 0x1a120a,
    alphaMap: tex,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
}

/** A soft contact shadow on a horizontal surface at height y. */
function blob(w: number, d: number, x: number, y: number, z: number, opacity = 0.5) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), shadowMat(blobTexture(), opacity));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y + 0.002, z);
  m.renderOrder = 1;
  return m;
}

/**
 * A fade strip lying on a surface, dark at the edge where it meets another.
 * `normal` is the surface the strip lies on; `toward` points away from the
 * dark edge, along the surface.
 */
function fade(length: number, width: number, at: THREE.Vector3, normal: THREE.Vector3, toward: THREE.Vector3, opacity = 0.32) {
  const geo = new THREE.PlaneGeometry(length, width);
  // Plane: v (texture y) runs along +y; flip so the dark end is at the edge.
  geo.translate(0, -width / 2, 0);
  const m = new THREE.Mesh(geo, shadowMat(fadeTexture(), opacity));
  const z = normal.clone().normalize();
  const y = toward.clone().normalize().negate();
  const x = new THREE.Vector3().crossVectors(y, z);
  m.matrixAutoUpdate = true;
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  m.position.copy(at).addScaledVector(z, 0.003);
  m.renderOrder = 1;
  return m;
}

// ------------------------------------------------------------ Room shell

function buildShell(scene: THREE.Scene) {
  const wallMap = plasterTexture('#efe7d9');
  wallMap.repeat.set(3, 2);
  const wallMat = std(0xffffff, 0.95, 0, { map: wallMap });
  const paintMat = std(0xf3efe7, 0.5); // the white gloss of skirting and frames

  // Oiled, not lacquered: a soft sheen, so it does not mirror the lamp.
  const floor = mesh(new THREE.PlaneGeometry(W, D), std(0xffffff, 0.6, 0, { map: parquetTexture(), envMapIntensity: 0.55 }), false);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // Ceiling as a slab, so the low sun cannot slip in over the wall.
  const ceiling = box(W + 0.8, 0.1, D + 0.4, std(C.ceiling, 1));
  ceiling.position.set(0, H + 0.05, 0);
  scene.add(ceiling);

  const back = mesh(new THREE.PlaneGeometry(W, H), wallMat);
  back.position.set(0, H / 2, BACK);
  scene.add(back);

  const right = mesh(new THREE.PlaneGeometry(D, H), wallMat);
  right.rotation.y = -Math.PI / 2;
  right.position.set(RIGHT, H / 2, 0);
  scene.add(right);

  // The wall we are standing in: invisible from the camera (its back face is
  // toward us), but it stops the sun coming in at the front, and it gives
  // the reflections a closed room.
  const front = mesh(new THREE.PlaneGeometry(W, H), wallMat);
  front.rotation.y = Math.PI;
  front.position.set(0, H / 2, FRONT);
  scene.add(front);

  // Left wall, thick, built around the window opening.
  const t = WIN.wall;
  const wallPart = (z0: number, z1: number, y0: number, y1: number) => {
    const m = box(t, y1 - y0, z1 - z0, wallMat);
    m.position.set(LEFT - t / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    scene.add(m);
  };
  wallPart(BACK - 0.2, WIN.z0, 0, H + 0.1);
  wallPart(WIN.z1, FRONT, 0, H + 0.1);
  wallPart(WIN.z0, WIN.z1, 0, WIN.y0);
  wallPart(WIN.z0, WIN.z1, WIN.y1, H + 0.1);

  // Skirting all round, painted like the woodwork.
  const sk = 0.1;
  const skirt = (w: number, x: number, z: number, ry: number) => {
    const m = box(w, sk, 0.018, paintMat);
    m.position.set(x, sk / 2, z);
    m.rotation.y = ry;
    scene.add(m);
    const cap = box(w, 0.012, 0.024, paintMat);
    cap.position.set(x, sk + 0.004, z);
    cap.rotation.y = ry;
    scene.add(cap);
  };
  skirt(W, 0, BACK + 0.009, 0);
  skirt(D, RIGHT - 0.009, 0, Math.PI / 2);
  skirt(WIN.z0 - BACK, LEFT + 0.009, (BACK + WIN.z0) / 2, Math.PI / 2);
  skirt(FRONT - WIN.z1, LEFT + 0.009, (WIN.z1 + FRONT) / 2, Math.PI / 2);
  skirt(WIN.z1 - WIN.z0, LEFT + 0.009, WIN_MID, Math.PI / 2);

  // A plaster cornice where the walls meet the ceiling.
  const cornice = (w: number, x: number, z: number, ry: number) => {
    const m = box(w, 0.07, 0.07, std(C.ceiling, 0.9));
    m.position.set(x, H - 0.035, z);
    m.rotation.y = ry;
    scene.add(m);
  };
  cornice(W, 0, BACK + 0.035, 0);
  cornice(D, RIGHT - 0.035, 0, Math.PI / 2);
  cornice(D, LEFT + 0.035, 0, Math.PI / 2);

  // The window: a white double casement with a fanlight, at the outer side
  // of the reveal, and a wide oak sill inside.
  const fx = LEFT - t + 0.1;
  const frame = (w: number, h: number, z: number, y: number, depth = 0.07) => {
    const m = box(depth, h, w, paintMat);
    m.position.set(fx, y, z);
    scene.add(m);
  };
  const wy0 = WIN.y0 + 0.03;
  const wy1 = WIN.y1;
  const ww = WIN.z1 - WIN.z0;
  const transom = wy0 + (wy1 - wy0) * 0.74;
  frame(ww, 0.07, WIN_MID, wy0 + 0.035, 0.09);
  frame(ww, 0.07, WIN_MID, wy1 - 0.035, 0.09);
  frame(0.07, wy1 - wy0, WIN.z0 + 0.035, (wy0 + wy1) / 2, 0.09);
  frame(0.07, wy1 - wy0, WIN.z1 - 0.035, (wy0 + wy1) / 2, 0.09);
  frame(0.09, transom - wy0, WIN_MID, (wy0 + transom) / 2);
  frame(ww, 0.08, WIN_MID, transom);
  // Casement sashes: a thinner inner frame in each lower pane.
  for (const zc of [WIN.z0 + ww * 0.25 + 0.01, WIN.z1 - ww * 0.25 - 0.01]) {
    const pw = ww / 2 - 0.12;
    const ph = transom - wy0 - 0.14;
    const yc = (wy0 + transom) / 2;
    for (const [w, h, dz, dy] of [
      [pw, 0.04, 0, ph / 2],
      [pw, 0.05, 0, -ph / 2],
      [0.04, ph, pw / 2, 0],
      [0.04, ph, -pw / 2, 0],
    ] as const) {
      const m = box(0.05, h, w, paintMat);
      m.position.set(fx + 0.03, yc + dy, zc + dz);
      scene.add(m);
    }
    // A brass handle on the inner sash edge.
    const handle = box(0.02, 0.11, 0.014, std(0xb8955a, 0.35, 0.8));
    handle.position.set(fx + 0.07, yc, zc + (zc < WIN_MID ? pw / 2 : -pw / 2));
    scene.add(handle);
  }
  // Glass: barely there, just a reflection.
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wy1 - wy0), glassMat);
  glass.rotation.y = Math.PI / 2;
  glass.position.set(fx + 0.01, (wy0 + wy1) / 2, WIN_MID);
  scene.add(glass);

  const sill = box(t + 0.06, 0.035, ww + 0.12, std(0xffffff, 0.5, 0, { map: grainTexture('#c9a77c') }), 0.006);
  sill.position.set(LEFT - t / 2 + 0.03 + 0.04, WIN.y0 + 0.0175, WIN_MID);
  scene.add(sill);

  // Outside: the street, far enough away to sit still as we lean.
  const outsideMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: outsideTexture(false) });
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(12, 9), outsideMat);
  outside.rotation.y = Math.PI / 2;
  outside.position.set(LEFT - 3.2, 2.2, WIN_MID - 2.4);
  scene.add(outside);

  // The radiator under the window: a white column radiator on two pipes.
  const radW = ww - 0.2;
  const cols = 22;
  const colGeo = new THREE.BoxGeometry(0.06, 0.52, 0.026);
  const radMat = std(0xf1ede5, 0.45);
  const rad = new THREE.InstancedMesh(colGeo, radMat, cols);
  rad.castShadow = true;
  rad.receiveShadow = true;
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < cols; i++) {
    mtx.makeTranslation(LEFT + 0.11, 0.42, WIN_MID - radW / 2 + (i + 0.5) * (radW / cols));
    rad.setMatrixAt(i, mtx);
  }
  scene.add(rad);
  for (const y of [0.17, 0.67]) {
    const rail = cyl(0.016, 0.016, radW, radMat, 12);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(LEFT + 0.11, y, WIN_MID);
    scene.add(rail);
  }
  const pipeMat = std(0xe9e4da, 0.5);
  for (const dz of [-radW / 2 - 0.04, radW / 2 + 0.04]) {
    const pipe = cyl(0.01, 0.01, 0.17, pipeMat, 10);
    pipe.position.set(LEFT + 0.11, 0.085, WIN_MID + dz);
    scene.add(pipe);
    const elbow = cyl(0.01, 0.01, 0.05, pipeMat, 10);
    elbow.rotation.x = Math.PI / 2;
    elbow.position.set(LEFT + 0.11, 0.17, WIN_MID + dz * 0.97);
    scene.add(elbow);
  }
  const valve = cyl(0.024, 0.024, 0.05, std(0xf6f4ef, 0.4), 20);
  valve.position.set(LEFT + 0.11, 0.72, WIN_MID + radW / 2 + 0.04);
  scene.add(valve);

  // A linen curtain, drawn to the side, hanging from a thin rod.
  const rod = cyl(0.009, 0.009, ww + 0.6, std(0x2e2a27, 0.4, 0.6), 10);
  rod.rotation.x = Math.PI / 2;
  rod.position.set(LEFT + 0.08, WIN.y1 + 0.16, WIN_MID + 0.12);
  scene.add(rod);
  const cw = 0.42;
  const ch = WIN.y1 + 0.14;
  const cgeo = new THREE.PlaneGeometry(cw, ch, 36, 12);
  const pos = cgeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const u = (x + cw / 2) / cw;
    // Deep folds near the rod, opening a little toward the floor.
    const fold = Math.sin(u * Math.PI * 9) * (0.028 + 0.012 * (1 - (y + ch / 2) / ch));
    pos.setZ(i, fold);
    pos.setX(i, x * (0.92 + 0.12 * (1 - (y + ch / 2) / ch)));
  }
  cgeo.computeVertexNormals();
  const curtain = mesh(cgeo, std(0xeee6d6, 1, 0, { side: THREE.DoubleSide }));
  curtain.rotation.y = Math.PI / 2;
  curtain.position.set(LEFT + 0.08, ch / 2 + 0.01, WIN.z1 + cw / 2 + 0.02);
  scene.add(curtain);
  // Its pair, bunched into the narrow strip between window and corner.
  const curtain2 = curtain.clone();
  curtain2.scale.set(0.5, 1, 1.3);
  curtain2.position.z = WIN.z0 - cw * 0.25 - 0.015;
  scene.add(curtain2);

  // The rug in front of the sideboard.
  const rug = box(1.8, 0.01, 1.25, std(0xffffff, 1, 0, { map: rugTexture() }));
  rug.castShadow = false;
  rug.position.set(0.15, 0.005, -0.7);
  scene.add(rug);

  // Where surfaces meet, a little darker.
  const up = new THREE.Vector3(0, 1, 0);
  const vx = new THREE.Vector3(1, 0, 0);
  const vz = new THREE.Vector3(0, 0, 1);
  const down = new THREE.Vector3(0, -1, 0);
  const nx = vx.clone().negate();
  // Floor along each wall.
  scene.add(fade(W, 0.35, new THREE.Vector3(0, 0, BACK), up, vz));
  scene.add(fade(D, 0.35, new THREE.Vector3(RIGHT, 0, 0), up, nx));
  scene.add(fade(D, 0.3, new THREE.Vector3(LEFT, 0, 0), up, vx, 0.25));
  // Walls along the floor.
  scene.add(fade(W, 0.3, new THREE.Vector3(0, 0, BACK), vz, up, 0.22));
  scene.add(fade(D, 0.3, new THREE.Vector3(RIGHT, 0, 0), nx, up, 0.22));
  // Vertical corners.
  scene.add(fade(H, 0.4, new THREE.Vector3(LEFT, H / 2, BACK), vz, vx, 0.28));
  scene.add(fade(H, 0.4, new THREE.Vector3(LEFT, H / 2, BACK), vx, vz, 0.28));
  scene.add(fade(H, 0.4, new THREE.Vector3(RIGHT, H / 2, BACK), vz, nx, 0.28));
  scene.add(fade(H, 0.4, new THREE.Vector3(RIGHT, H / 2, BACK), nx, vz, 0.28));
  // Under the ceiling.
  scene.add(fade(W, 0.3, new THREE.Vector3(0, H - 0.07, BACK), vz, down, 0.18));
  scene.add(fade(D, 0.3, new THREE.Vector3(RIGHT, H - 0.07, 0), nx, down, 0.18));

  return { outsideMat, glass };
}

// --------------------------------------------------------------- Furniture

// A low oak media sideboard on tapered legs: an open bay of records on the
// left, two doors on the right.
function buildSideboard() {
  const g = new THREE.Group();
  const oakTex = grainTexture(OAK, 110);
  const oak = std(0xffffff, 0.5, 0, { map: oakTex });
  const oakDark = std(0xffffff, 0.6, 0, { map: grainTexture('#8e6744', 80) });
  const legH = 0.16;
  const { w, d, h } = BOARD;
  const bodyH = h - legH;
  const panel = 0.022;

  const top = box(w, panel, d, oak, 0.004);
  top.position.y = h - panel / 2;
  g.add(top);
  const bottom = box(w - 0.02, panel, d - 0.02, oak);
  bottom.position.y = legH + panel / 2;
  g.add(bottom);
  const backPanel = box(w - 0.02, bodyH, 0.01, oakDark);
  backPanel.position.set(0, legH + bodyH / 2, -d / 2 + 0.01);
  g.add(backPanel);
  for (const x of [-w / 2 + panel / 2, w / 2 - panel / 2, -w / 2 + 0.56]) {
    const side = box(panel, bodyH - panel, d - 0.004, oak);
    side.position.set(x, legH + bodyH / 2, 0);
    g.add(side);
  }
  // Two doors with a finger slot along the top.
  const doorW = (w - 0.56 - panel) / 2 - 0.006;
  for (const i of [0, 1]) {
    const door = box(doorW, bodyH - panel - 0.012, 0.018, oak, 0.003);
    door.position.set(-w / 2 + 0.56 + panel / 2 + doorW / 2 + 0.004 + i * (doorW + 0.006), legH + bodyH / 2 - 0.004, d / 2 - 0.012);
    g.add(door);
    const slot = box(0.16, 0.012, 0.02, std(0x3a2a1c, 0.9));
    slot.position.set(door.position.x + (i ? -1 : 1) * (doorW / 2 - 0.12), h - panel - 0.03, d / 2 - 0.004);
    g.add(slot);
  }
  // Tapered legs, splayed a little.
  for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) {
    for (const z of [-d / 2 + 0.07, d / 2 - 0.07]) {
      const leg = cyl(0.018, 0.011, legH + 0.01, oakDark, 12);
      leg.position.set(x, legH / 2, z);
      leg.rotation.z = (x < 0 ? 1 : -1) * 0.06;
      leg.rotation.x = (z < 0 ? -1 : 1) * 0.06;
      g.add(leg);
    }
  }
  // Records standing in the open bay: spines in muted colours.
  const count = 34;
  const spine = new THREE.BoxGeometry(0.0085, 0.315, 0.315);
  const recs = new THREE.InstancedMesh(spine, std(0xffffff, 0.75), count);
  recs.castShadow = true;
  recs.receiveShadow = true;
  const palette = [0x2e2a27, 0xe7e1d5, 0x5c4a3b, 0x8a8177, 0x1c1917, 0x9c5a3c, 0xc2bbaf, 0x3a3530, 0x6d6a5c, 0xd8cfbf];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const bayX0 = -w / 2 + panel + 0.012;
  for (let i = 0; i < count; i++) {
    const lean = i > count - 4 ? 0.22 : (hash(i, 4) - 0.5) * 0.03;
    q.setFromEuler(new THREE.Euler(0, 0, -lean));
    const x = bayX0 + i * 0.0148 + (i > count - 4 ? 0.03 : 0);
    m.compose(new THREE.Vector3(x, legH + panel + 0.158, 0.01), q, new THREE.Vector3(1, 1, 1));
    recs.setMatrixAt(i, m);
    recs.setColorAt(i, col.setHex(palette[Math.floor(hash(i, 9) * palette.length)]));
  }
  g.add(recs);
  return g;
}

// A picture ledge for the four favourite records, leaning on the wall.
function buildLedge(covers: THREE.Texture[]) {
  const g = new THREE.Group();
  const oak = std(0xffffff, 0.5, 0, { map: grainTexture(OAK) });
  const len = 1.95;
  const shelf = box(len, 0.022, 0.1, oak, 0.003);
  shelf.position.set(0, 0, 0.05);
  g.add(shelf);
  const lip = box(len, 0.035, 0.014, oak, 0.003);
  lip.position.set(0, 0.016, 0.093);
  g.add(lip);
  const back = box(len, 0.06, 0.016, oak, 0.003);
  back.position.set(0, -0.02, 0.008);
  g.add(back);

  const records: THREE.Object3D[] = [];
  const size = 0.315;
  const gap = 0.07;
  covers.forEach((cover, i) => {
    const sleeveSide = std(0xe7e1d5, 0.8);
    const front = new THREE.MeshStandardMaterial({ map: cover, roughness: 0.6 });
    const mats = [sleeveSide, sleeveSide, sleeveSide, sleeveSide, front, sleeveSide];
    const sleeve = mesh(new THREE.BoxGeometry(size, size, 0.005), mats);
    sleeve.position.y = size / 2;
    const pivot = new THREE.Group();
    pivot.add(sleeve);
    pivot.position.set(-len / 2 + 0.2 + i * (size + gap), 0.011, 0.075);
    pivot.rotation.x = -0.13;
    pivot.rotation.y = [0.015, -0.01, 0.012, -0.018][i % 4];
    pivot.userData.baseY = pivot.position.y;
    pivot.userData.baseRx = pivot.rotation.x;
    g.add(pivot);
    records.push(pivot);
  });
  const books = buildLedgeBooks();
  books.position.set(len / 2 - 0.27, 0.011, 0.05);
  g.add(books);
  return { group: g, records };
}

// A black A-frame guitar stand, sized to the guitar it holds.
function buildGuitarStand(guitar: THREE.Object3D) {
  const g = new THREE.Group();
  const b = new THREE.Box3().setFromObject(guitar);
  const size = b.getSize(new THREE.Vector3());
  const L = size.y;
  const tilt = 0.2;
  const cradleY = 0.13;
  const steel = std(0x1f1d1b, 0.45, 0.6);
  const rubber = std(0x141312, 0.9);
  const tube = (a: THREE.Vector3, c: THREE.Vector3, r = 0.008, mat = steel) => {
    const len = a.distanceTo(c);
    const m = cyl(r, r, len, mat, 10);
    m.position.copy(a).add(c).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
    g.add(m);
    return m;
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // Guitar: bottom in the cradle, leaning back by `tilt` onto the yoke.
  const neckAt = L * 0.6;
  const yoke = V(0, cradleY + neckAt * Math.cos(tilt), 0.07 - neckAt * Math.sin(tilt) - 0.035);
  const hub = V(0, 0.2, -0.06);
  // Legs: two forward, one back.
  tube(hub, V(-0.17, 0.006, 0.14));
  tube(hub, V(0.17, 0.006, 0.14));
  tube(hub, V(0, 0.006, -0.3));
  for (const x of [-0.17, 0.17]) tube(V(x, 0.006, 0.14), V(x, 0.006, 0.17), 0.012, rubber);
  tube(V(0, 0.006, -0.3), V(0, 0.006, -0.33), 0.012, rubber);
  // Cradle arms with upturned, padded ends.
  tube(hub, V(-0.11, cradleY, 0.05));
  tube(hub, V(0.11, cradleY, 0.05));
  for (const x of [-0.11, 0.11]) tube(V(x, cradleY - 0.01, 0.04), V(x, cradleY + 0.04, 0.09), 0.012, rubber);
  // The neck post and its yoke.
  tube(hub, yoke.clone().add(V(0, -0.02, 0)));
  const fork = mesh(new THREE.TorusGeometry(0.03, 0.007, 8, 16, Math.PI), rubber);
  fork.position.copy(yoke).add(V(0, 0.01, 0));
  fork.rotation.x = -tilt;
  g.add(fork);

  // Seat the guitar.
  const holder = new THREE.Group();
  guitar.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  holder.add(guitar);
  holder.position.set(0, cradleY - 0.01, 0.07);
  holder.rotation.x = -tilt;
  g.add(holder);
  return g;
}

// A tripod floor lamp with a linen drum shade.
function buildFloorLamp() {
  const g = new THREE.Group();
  const wood = std(0xffffff, 0.5, 0, { map: grainTexture('#8e6744') });
  const shadeY = 1.42;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const foot = new THREE.Vector3(Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26);
    const top = new THREE.Vector3(0, 1.18, 0);
    const len = foot.distanceTo(top);
    const leg = cyl(0.011, 0.015, len, wood, 10);
    leg.position.copy(foot).add(top).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
    g.add(leg);
  }
  const stem = cyl(0.008, 0.008, shadeY - 1.18, std(0x2e2a27, 0.4, 0.6), 10);
  stem.position.y = (shadeY + 1.18) / 2;
  g.add(stem);
  const shadeMat = new THREE.MeshStandardMaterial({
    color: 0xf1e8d8,
    emissive: 0xffc890,
    emissiveIntensity: 0,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const shade = mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.3, 48, 1, true), shadeMat, false);
  shade.position.y = shadeY + 0.05;
  g.add(shade);
  // The bulb, seen from below at night.
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1dc }));
  bulb.position.y = shadeY + 0.02;
  g.add(bulb);

  // Light: a soft cone down from the shade (with shadows), and a dimmer
  // glow up onto the ceiling.
  const down = new THREE.SpotLight(0xffc488, 0, 7, 1.2, 1, 1.6);
  down.position.set(0, shadeY - 0.02, 0);
  down.target.position.set(0.6, 0, 0.4);
  down.castShadow = true;
  down.shadow.mapSize.set(1024, 1024);
  down.shadow.bias = -0.0008;
  down.shadow.normalBias = 0.02;
  down.shadow.radius = 4;
  down.shadow.camera.near = 0.1;
  down.shadow.camera.far = 6;
  g.add(down, down.target);
  const upLight = new THREE.PointLight(0xffd2a0, 0, 4, 1.6);
  upLight.position.set(0, shadeY + 0.25, 0);
  g.add(upLight);
  return { group: g, shadeMat, bulb, down, up: upLight };
}

// A rubber plant in a white pot: glossy oval leaves up a single stem.
function buildPlant() {
  const g = new THREE.Group();
  const pot = cyl(0.15, 0.12, 0.34, std(0x8a6a52, 0.8), 32);
  pot.position.y = 0.17;
  g.add(pot);
  const soil = cyl(0.14, 0.14, 0.01, std(0x2d2118, 1), 24);
  soil.position.y = 0.325;
  g.add(soil);
  const stemMat = std(0x4c3b28, 0.8);
  const leafGeos: THREE.BufferGeometry[] = [];
  const stems: [number, number][] = [
    [0.0, 1.05],
    [0.05, 0.82],
    [-0.06, 0.7],
  ];
  stems.forEach(([dx, top], s) => {
    const stem = cyl(0.008, 0.011, top - 0.3, stemMat, 8);
    stem.position.set(dx, 0.3 + (top - 0.3) / 2, dx * 0.5);
    stem.rotation.z = -dx * 1.2;
    g.add(stem);
    const leaves = 7 + s;
    for (let i = 0; i < leaves; i++) {
      const t = i / (leaves - 1);
      const len = 0.13 + 0.07 * Math.sin(t * Math.PI) + hash(i, s) * 0.03;
      const wid = len * 0.42;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.bezierCurveTo(wid, len * 0.15, wid * 0.9, len * 0.8, 0, len);
      shape.bezierCurveTo(-wid * 0.9, len * 0.8, -wid, len * 0.15, 0, 0);
      const geo = new THREE.ShapeGeometry(shape, 8);
      // Cup the leaf and let it droop.
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k);
        const y = p.getY(k);
        p.setZ(k, (x * x) * 2.2 - (y * y) * 0.9);
      }
      geo.computeVertexNormals();
      const y = 0.4 + t * (top - 0.42);
      const a = i * 2.4 + s;
      const m4 = new THREE.Matrix4().compose(
        new THREE.Vector3(dx - dx * 1.2 * (y - 0.3) * 0.3, y, dx * 0.5),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.0 + t * 0.6, a, 0, 'YXZ')),
        new THREE.Vector3(1, 1, 1),
      );
      geo.applyMatrix4(m4);
      leafGeos.push(geo);
    }
  });
  const leaves = mesh(mergeGeometries(leafGeos), std(0x2f4a2c, 0.62, 0, { side: THREE.DoubleSide, envMapIntensity: 0.5 }));
  g.add(leaves);
  return g;
}

// Wool upholstery: a fine, slightly uneven weave.
function woolTexture(base: string, fleck: string) {
  const t = canvasTexture(256, 256, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 5000; k++) {
      g.fillStyle = hash(k, 11) > 0.5 ? fleck : 'rgba(0 0 0 / 0.06)';
      g.fillRect(hash(k, 12) * 256, hash(k, 13) * 256, 1 + hash(k, 14) * 2, 1);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

// Chunky knit: rows of little V stitches.
function knitTexture() {
  const t = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#e6dccb';
    g.fillRect(0, 0, 256, 256);
    g.lineWidth = 3;
    for (let y = 0; y < 256; y += 16) {
      for (let x = 0; x < 256; x += 16) {
        g.strokeStyle = `rgba(120 100 75 / ${0.25 + hash(x, y) * 0.1})`;
        g.beginPath();
        g.moveTo(x + 1, y + 2);
        g.lineTo(x + 8, y + 14);
        g.lineTo(x + 15, y + 2);
        g.stroke();
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  return t;
}

// An easy chair: oak legs, wool body, a rust cushion and a knitted throw
// over one arm. Origin at the centre of its footprint, +z its front.
function buildArmchair() {
  const g = new THREE.Group();
  const wool = std(0xffffff, 0.95, 0, { map: woolTexture('#7a6c5f', 'rgba(255 240 220 / 0.08)') });
  const oak = std(0xffffff, 0.55, 0, { map: grainTexture('#8e6744', 60) });
  const rb = (w: number, h: number, d: number, r: number, mat: THREE.Material) => mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
  for (const x of [-0.31, 0.31]) {
    for (const z of [-0.31, 0.31]) {
      const leg = cyl(0.018, 0.013, 0.15, oak, 10);
      leg.position.set(x, 0.075, z);
      leg.rotation.z = x < 0 ? 0.12 : -0.12;
      leg.rotation.x = z < 0 ? -0.12 : 0.12;
      g.add(leg);
    }
  }
  const base = rb(0.76, 0.2, 0.76, 0.05, wool);
  base.position.y = 0.24;
  g.add(base);
  const seatC = rb(0.56, 0.12, 0.6, 0.05, wool);
  seatC.position.set(0, 0.39, 0.05);
  seatC.rotation.x = -0.03;
  g.add(seatC);
  const back = rb(0.76, 0.5, 0.16, 0.06, wool);
  back.position.set(0, 0.58, -0.3);
  back.rotation.x = -0.14;
  g.add(back);
  for (const x of [-0.33, 0.33]) {
    const arm = rb(0.11, 0.26, 0.7, 0.045, wool);
    arm.position.set(x, 0.46, 0.02);
    g.add(arm);
  }
  // The one bright thing in the corner: a rust cushion, a little askew.
  const cushion = rb(0.4, 0.36, 0.12, 0.06, std(0xffffff, 0.95, 0, { map: woolTexture('#b9532c', 'rgba(255 200 160 / 0.1)') }));
  cushion.position.set(-0.08, 0.6, -0.17);
  cushion.rotation.set(-0.32, 0.12, 0.12);
  g.add(cushion);

  // The throw: lying on the seat, over the right arm and down its side.
  const path = [
    new THREE.Vector2(0.06, 0.455),
    new THREE.Vector2(0.27, 0.6),
    new THREE.Vector2(0.4, 0.6),
    new THREE.Vector2(0.41, 0.18),
  ];
  const lens = path.slice(1).map((p, i) => p.distanceTo(path[i]));
  const total = lens.reduce((a, b) => a + b, 0);
  const tw = 0.46;
  const geo = new THREE.PlaneGeometry(total, tw, 40, 8);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let s = pos.getX(i) + total / 2;
    const z = pos.getY(i);
    let k = 0;
    while (k < lens.length - 1 && s > lens[k]) s -= lens[k++];
    const p = path[k].clone().lerp(path[k + 1], Math.min(s / lens[k], 1));
    // Folds, deeper where it hangs.
    const hang = k === 2 ? s / lens[2] : 0;
    const wob = Math.sin(z * 26 + k) * 0.012 * (0.3 + hang);
    pos.setXYZ(i, p.x + 0.012 + (k === 2 ? wob + hang * 0.02 : 0), p.y + 0.012 + (k < 2 ? wob * 0.5 : 0), z * (1 + hang * 0.12) + 0.06);
  }
  geo.computeVertexNormals();
  g.add(mesh(geo, std(0xffffff, 1, 0, { map: knitTexture(), side: THREE.DoubleSide })));
  return g;
}

// A round oak side table with a ceramic lamp, a mug and a few books.
function buildSideTable() {
  const g = new THREE.Group();
  const oak = std(0xffffff, 0.5, 0, { map: grainTexture('#a77c52', 70) });
  const topY = 0.52;
  const top = cyl(0.23, 0.23, 0.025, oak, 40);
  top.position.y = topY - 0.0125;
  g.add(top);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = cyl(0.014, 0.012, topY - 0.02, oak, 8);
    leg.position.set(Math.cos(a) * 0.15, (topY - 0.02) / 2, Math.sin(a) * 0.15);
    leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    g.add(leg);
  }
  // Books, stacked a little crooked.
  const colors = [0x2e2a27, 0x9c5a3c, 0xd8cfbf];
  let y = topY;
  colors.forEach((c, i) => {
    const h = 0.025 + i * 0.006;
    const b = box(0.2 - i * 0.02, h, 0.14 - i * 0.01, std(c, 0.8), 0.003);
    b.position.set(0.05, y + h / 2, 0.06);
    b.rotation.y = 0.3 - i * 0.25;
    y += h;
    g.add(b);
  });
  // A mug of tea.
  const glaze = std(0xefe8dc, 0.35, 0, { side: THREE.DoubleSide });
  const mug = mesh(new THREE.CylinderGeometry(0.04, 0.037, 0.095, 24, 1, true), glaze);
  mug.position.set(-0.1, topY + 0.0475, 0.1);
  g.add(mug);
  const bottom = cyl(0.037, 0.037, 0.006, glaze, 24);
  bottom.position.set(-0.1, topY + 0.003, 0.1);
  g.add(bottom);
  const tea = cyl(0.037, 0.037, 0.002, std(0x4a2c18, 0.2), 24);
  tea.position.set(-0.1, topY + 0.06, 0.1);
  g.add(tea);
  const handle = mesh(new THREE.TorusGeometry(0.024, 0.006, 8, 16, Math.PI), glaze);
  handle.position.set(-0.1 + 0.04, topY + 0.05, 0.1);
  handle.rotation.z = -Math.PI / 2;
  g.add(handle);
  // The table lamp: a ceramic base and a small linen shade.
  const base = mesh(new THREE.SphereGeometry(0.07, 24, 16), std(0x3a3530, 0.4));
  base.scale.set(1, 1.25, 1);
  base.position.set(-0.04, topY + 0.085, -0.09);
  g.add(base);
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xf1e8d8, emissive: 0xffc890, emissiveIntensity: 0, roughness: 1, side: THREE.DoubleSide });
  const shade = mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.16, 32, 1, true), shadeMat, false);
  shade.position.set(-0.04, topY + 0.27, -0.09);
  g.add(shade);
  const light = new THREE.PointLight(0xffc285, 0, 5, 1.7);
  light.position.set(-0.04, topY + 0.25, -0.09);
  g.add(light);
  return { group: g, shadeMat, light };
}

// A plain black frame with a soft abstract print: colour fields, no text.
function buildPrint(w: number, h: number, seedN: number) {
  const g = new THREE.Group();
  const cw = 256;
  const ch = Math.round((256 * h) / w);
  const tex = canvasTexture(cw, ch, (c) => {
    c.fillStyle = '#f1eadc';
    c.fillRect(0, 0, cw, ch);
    const pal = ['#2e2a27', '#c9b79a', '#9c5a3c', '#8a8177', '#d9cdb8'];
    for (let k = 0; k < 3; k++) {
      c.fillStyle = pal[Math.floor(hash(seedN, k) * pal.length)];
      c.globalAlpha = 0.85;
      if (hash(seedN + 1, k) > 0.5) {
        c.beginPath();
        c.arc(cw * (0.3 + hash(k, seedN) * 0.4), ch * (0.3 + hash(seedN, k + 5) * 0.4), cw * (0.12 + hash(k, 2) * 0.15), 0, Math.PI * 2);
        c.fill();
      } else {
        c.fillRect(cw * 0.18, ch * (0.2 + k * 0.22), cw * (0.4 + hash(k, seedN) * 0.4), ch * 0.14);
      }
    }
    c.globalAlpha = 1;
  });
  g.add(box(w, h, 0.022, std(0x2a2724, 0.6), 0.003));
  const passe = mesh(new THREE.PlaneGeometry(w - 0.03, h - 0.03), std(0xf6f2ea, 0.9), false);
  passe.position.z = 0.0115;
  g.add(passe);
  const art = mesh(new THREE.PlaneGeometry(w - 0.11, h - 0.11), std(0xffffff, 0.9, 0, { map: tex }), false);
  art.position.z = 0.0118;
  g.add(art);
  return g;
}

// A small trailing plant in a terracotta pot, for the sideboard.
function buildSmallPlant() {
  const g = new THREE.Group();
  const pot = cyl(0.055, 0.045, 0.09, std(0xc08a62, 0.85), 20);
  pot.position.y = 0.045;
  g.add(pot);
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 20; i++) {
    const shape = new THREE.Shape();
    const l = 0.045 + hash(i, 3) * 0.02;
    shape.moveTo(0, 0);
    shape.bezierCurveTo(l * 0.6, l * 0.2, l * 0.5, l * 0.9, 0, l);
    shape.bezierCurveTo(-l * 0.5, l * 0.9, -l * 0.6, l * 0.2, 0, 0);
    const geo = new THREE.ShapeGeometry(shape, 4);
    const a = i * 2.4;
    const r = 0.02 + hash(i, 1) * 0.04;
    // Some leaves trail over the rim and down.
    const trail = i % 3 === 0;
    const yy = trail ? 0.08 - hash(i, 2) * 0.07 : 0.095 + hash(i, 2) * 0.05;
    geo.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(a) * (trail ? 0.06 : r), yy, Math.sin(a) * (trail ? 0.06 : r)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(trail ? 2.0 : -0.8, a, 0, 'YXZ')),
        new THREE.Vector3(1, 1, 1),
      ),
    );
    geos.push(geo);
  }
  g.add(mesh(mergeGeometries(geos), std(0x4c6b3a, 0.5, 0, { side: THREE.DoubleSide }), false));
  return g;
}

// Spare sleeves leaning together: plain card in muted colours.
function buildLeaningRecords(n: number) {
  const geo = new THREE.BoxGeometry(0.315, 0.315, 0.004);
  geo.translate(0, 0.1575, 0);
  const im = new THREE.InstancedMesh(geo, std(0xffffff, 0.8), n);
  im.castShadow = true;
  im.receiveShadow = true;
  const cols = [0xd8cfbf, 0x9c5a3c, 0xe7e1d5, 0x3a3530, 0x6d6a5c];
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    m.compose(
      new THREE.Vector3(i * 0.035 + (hash(i, 21) - 0.5) * 0.03, 0, i * 0.012),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.22 + i * 0.012, (i - n / 2) * 0.06, (hash(i, 22) - 0.5) * 0.06)),
      new THREE.Vector3(1, 1, 1),
    );
    im.setMatrixAt(i, m);
    im.setColorAt(i, c.setHex(cols[i % cols.length]));
  }
  return im;
}

// Books standing at the end of the ledge, the last one leaning on the rest.
function buildLedgeBooks() {
  const n = 9;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const im = new THREE.InstancedMesh(geo, std(0xffffff, 0.8), n);
  im.castShadow = true;
  im.receiveShadow = true;
  const cols = [0x2e2a27, 0xd8cfbf, 0x5c4a3b, 0x8a8177, 0xe7e1d5, 0x9c5a3c, 0x3a3530, 0xc2bbaf, 0x6d6a5c];
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  let x = 0;
  for (let i = 0; i < n; i++) {
    const th = 0.018 + hash(i, 31) * 0.022;
    const h = 0.17 + hash(i, 32) * 0.07;
    const last = i === n - 1;
    m.compose(
      new THREE.Vector3(x + th / 2 + (last ? 0.035 : 0), last ? 0.004 : 0, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, last ? 0.3 : 0)),
      new THREE.Vector3(th, h, 0.075 + hash(i, 33) * 0.02),
    );
    x += th + 0.001;
    im.setMatrixAt(i, m);
    im.setColorAt(i, c.setHex(cols[i]));
  }
  return im;
}

// -------------------------------------------------------------- Helpers

/** Wraps a model so its footprint sits centred on y = 0, whatever its origin. */
function seat(obj: THREE.Object3D) {
  const wrap = new THREE.Group();
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  obj.position.x -= (b.min.x + b.max.x) / 2;
  obj.position.z -= (b.min.z + b.max.z) / 2;
  obj.position.y -= b.min.y;
  wrap.add(obj);
  return wrap;
}

interface Hoverable {
  root: THREE.Object3D;
  key: string;
  info?: { title: string; text: string; url?: string };
  /** Index into the records, for sleeves. */
  record?: number;
  /** Other objects that light up with it (the second speaker). */
  partners?: THREE.Object3D[];
}

// ----------------------------------------------------------------- Mount

export function mountRoom(stage: HTMLElement, options: RoomOptions) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  // Plain PCF, because it honours shadow.radius: soft window edges.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Shadows are drawn again only when something that casts them moves.
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.className = 'room-canvas';

  const scene = new THREE.Scene();
  // Sitting on the arm of the sofa, a little in from the door.
  const camera = new THREE.PerspectiveCamera(37, 16 / 9, 0.05, 40);
  const eye = new THREE.Vector3(0.3, 1.16, 2.45);
  const target = new THREE.Vector3(-0.04, 0.86, -1.3);

  const loader = new THREE.TextureLoader();
  // Once every cover is in, the reflections are captured again with them.
  let coversLeft = options.covers.length;
  const covers = options.covers.map((src) => {
    const t = loader.load(src, () => {
      if (--coversLeft === 0) bakeEnvironment();
      requestRender();
    });
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });

  const shell = buildShell(scene);

  // Sideboard against the back wall, the ledge of records above it.
  const sideboard = buildSideboard();
  sideboard.position.set(BOARD.x, 0, BOARD_Z);
  scene.add(sideboard);
  scene.add(blob(BOARD.w + 0.3, BOARD.d + 0.3, BOARD.x, 0, BOARD_Z, 0.55));

  const ledge = buildLedge(covers);
  ledge.group.position.set(BOARD.x, 1.36, BACK);
  scene.add(ledge.group);
  const records = ledge.records;

  const top = BOARD.h;
  const turntable = buildTurntable(covers[0]);
  const tt = seat(turntable.group);
  tt.position.set(BOARD.x - 0.08, top, BOARD_Z + 0.01);
  tt.rotation.y = 0.04;
  scene.add(tt);
  scene.add(blob(0.5, 0.48, tt.position.x, top, tt.position.z, 0.45));

  const iface = seat(buildInterface());
  iface.position.set(BOARD.x + 0.36, top, BOARD_Z + 0.06);
  iface.rotation.y = -0.22;
  scene.add(iface);
  scene.add(blob(0.24, 0.17, iface.position.x, top, iface.position.z, 0.4));

  // The speakers stand at either end of the sideboard, toed in a little.
  const speakers: THREE.Object3D[] = [];
  for (const [side, dx, turn] of [
    ['left', -0.66, 0.2],
    ['right', 0.66, -0.2],
  ] as const) {
    const sp = seat(buildSpeaker(side));
    sp.position.set(BOARD.x + dx, top, BOARD_Z - 0.01);
    sp.rotation.y = turn;
    scene.add(sp);
    scene.add(blob(0.24, 0.28, sp.position.x, top, sp.position.z, 0.45));
    speakers.push(sp);
  }

  // A small plant between the left speaker and the turntable.
  const smallPlant = buildSmallPlant();
  smallPlant.position.set(BOARD.x - 0.4, top, BOARD_Z - 0.06);
  scene.add(smallPlant);

  // Spare records leaning on the sideboard doors, as if just put down.
  const spare = buildLeaningRecords(5);
  spare.position.set(BOARD.x + 0.36, 0, BOARD_Z + BOARD.d / 2 + 0.07);
  spare.rotation.y = -0.12;
  scene.add(spare);

  // The guitar on its stand, to the left of the sideboard, turned to the room.
  const guitarStand = buildGuitarStand(buildGuitar());
  guitarStand.position.set(-0.98, 0, BACK + 0.45);
  guitarStand.rotation.y = 0.38;
  scene.add(guitarStand);
  scene.add(blob(0.6, 0.55, -0.98, 0, BACK + 0.43, 0.5));

  // The amp on the floor by the guitar, angled toward where you would sit.
  const amp = seat(buildAmp());
  amp.position.set(-0.68, 0.01, -1.02);
  amp.rotation.y = 0.55;
  scene.add(amp);
  scene.add(blob(0.36, 0.3, amp.position.x, 0.01, amp.position.z, 0.6));

  // The floor lamp in the corner behind the guitar; the big plant by the
  // window, where the light is.
  const lamp = buildFloorLamp();
  lamp.group.position.set(-1.52, 0, BACK + 0.24);
  lamp.down.target.position.set(0.9, 0, 0.5);
  scene.add(lamp.group);
  scene.add(blob(0.6, 0.6, -1.52, 0, BACK + 0.24, 0.35));

  const plant = buildPlant();
  plant.position.set(-1.42, 0, -0.62);
  plant.rotation.y = 2.2;
  plant.scale.setScalar(1.15);
  scene.add(plant);
  scene.add(blob(0.55, 0.55, -1.42, 0, -0.62, 0.5));

  // The armchair in the right-hand corner, turned toward the music, with
  // its side table and lamp tucked behind.
  const chair = buildArmchair();
  chair.position.set(1.4, 0, -0.72);
  chair.rotation.y = -0.72;
  scene.add(chair);
  scene.add(blob(1.0, 1.0, 1.4, 0, -0.72, 0.55));

  const table = buildSideTable();
  table.group.position.set(1.22, 0, BACK + 0.3);
  table.group.rotation.y = -0.4;
  scene.add(table.group);
  scene.add(blob(0.55, 0.55, 1.22, 0, BACK + 0.3, 0.4));

  // Frames on the wall: two over the guitar, one over the side table.
  for (const [w, h, x, y, seedN, tilt] of [
    [0.4, 0.5, -1.02, 1.76, 3, 0.01],
    [0.36, 0.46, 1.48, 1.36, 11, 0.008],
  ] as const) {
    const f = buildPrint(w, h, seedN);
    f.position.set(x, y, BACK + 0.012);
    f.rotation.z = tilt;
    scene.add(f);
  }

  // ------------------------------------------------------------ Light

  // Fill: a hemisphere for the base, and reflections from a blurred capture
  // of the room itself (redone when the mood changes).
  const hemi = new THREE.HemisphereLight(0xfff4e6, 0x6b5640, 0.6);
  scene.add(hemi);

  // The sun, low through the window.
  const sun = new THREE.DirectionalLight(0xffe8c8, 3.4);
  const sunDir = new THREE.Vector3(1, -0.58, -0.16).normalize();
  sun.target.position.set(-0.4, 0, -1.0);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, -7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -3.2;
  sc.right = 3.2;
  sc.top = 3.2;
  sc.bottom = -3.2;
  sc.near = 1;
  sc.far = 14;
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 5;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // Skylight through the window: soft and cool-white, without shadows.
  const sky = new THREE.SpotLight(0xe8eef5, 0, 7, 1.3, 1, 1.2);
  sky.position.set(LEFT - 0.1, WIN.y1 - 0.1, WIN_MID);
  sky.target.position.set(0.8, 0.3, WIN_MID - 0.2);
  scene.add(sky, sky.target);

  // The capture is lit by a dim, flat warm seed rather than by no
  // environment at all: some models swap in their own reflection map when
  // the scene has none, and converting that mid-capture would nest one PMREM
  // pass inside another (they share state and leave the wrong target bound).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const seedScene = new THREE.Scene();
  seedScene.background = new THREE.Color(0x3a322a);
  const seed = pmrem.fromScene(seedScene, 0, 0.1, 1, { size: 16 });
  let envTarget: THREE.WebGLRenderTarget | undefined;
  function bakeEnvironment() {
    scene.environment = seed.texture;
    renderer.shadowMap.needsUpdate = true;
    const next = pmrem.fromScene(scene, 0.04, 0.05, 20, { size: 128, position: new THREE.Vector3(0.2, 1.1, 0.2) });
    renderer.setRenderTarget(null);
    envTarget?.dispose();
    envTarget = next;
    scene.environment = next.texture;
    renderer.shadowMap.needsUpdate = true;
  }

  // Day by default; night when the reader's system is in dark mode, unless
  // the caller says otherwise.
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const dayOutside = shell.outsideMat.map!;
  let nightOutside: THREE.Texture | undefined;
  function setMood() {
    const night = options.mood ? options.mood === 'night' : dark.matches;
    // At night the same light is the street and the moon: faint and cool.
    // By day: late afternoon, low golden sun.
    sun.color.setHex(night ? 0x8ea3c8 : 0xffc485);
    sun.intensity = night ? 0.35 : 4.6;
    sky.intensity = night ? 0 : 4;
    // A warm floor of fill, so nothing goes black at night.
    hemi.intensity = night ? 0.45 : 0.45;
    hemi.color.setHex(night ? 0x8a6a50 : 0xffeedb);
    hemi.groundColor.setHex(night ? 0x3a281a : 0x6b5640);
    lamp.down.visible = night;
    lamp.down.intensity = night ? 9 : 0;
    lamp.up.intensity = night ? 4 : 0;
    lamp.shadeMat.emissiveIntensity = night ? 0.9 : 0;
    table.light.intensity = night ? 2.6 : 0;
    table.shadeMat.emissiveIntensity = night ? 0.9 : 0;
    (lamp.bulb.material as THREE.MeshBasicMaterial).color.setHex(night ? 0xfff1dc : 0xd8d2c8);
    if (night) nightOutside ??= outsideTexture(true);
    shell.outsideMat.map = night ? nightOutside! : dayOutside;
    shell.outsideMat.color.setScalar(night ? 0.8 : 1.15);
    shell.outsideMat.needsUpdate = true;
    scene.environmentIntensity = night ? 0.6 : 0.5;
    renderer.toneMappingExposure = night ? 1.12 : 1.02;
    bakeEnvironment();
    requestRender();
  }
  if (!options.mood) dark.addEventListener('change', setMood);

  // ------------------------------------------------------------ Hover

  const recordInfo = options.records ?? [];
  const gear = options.gear ?? {};
  const hoverables: Hoverable[] = [
    ...records.map((root, i) => ({
      root,
      key: `record-${i}`,
      record: i,
      info: recordInfo[i] && { title: recordInfo[i].title, text: recordInfo[i].artist, url: recordInfo[i].url },
    })),
    { root: guitarStand, key: 'guitar', info: gear.guitar },
    { root: amp, key: 'amp', info: gear.amp },
    { root: iface, key: 'interface', info: gear.interface },
    { root: tt, key: 'turntable', info: gear.turntable },
    { root: speakers[0], key: 'speakers', info: gear.speakers, partners: [speakers[1]] },
    { root: speakers[1], key: 'speakers', info: gear.speakers, partners: [speakers[0]] },
  ];

  // Each hoverable gets its own materials, so lighting one up leaves the rest.
  const glow = new THREE.Color(0xffb27a);
  const emissives = new Map<THREE.Object3D, { mat: THREE.MeshStandardMaterial; base: THREE.Color; baseI: number }[]>();
  for (const h of hoverables) {
    const list: { mat: THREE.MeshStandardMaterial; base: THREE.Color; baseI: number }[] = [];
    h.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const cloned = mats.map((mat) => {
        if (!(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) return mat;
        const c = (mat as THREE.MeshStandardMaterial).clone();
        list.push({ mat: c, base: c.emissive.clone(), baseI: c.emissiveIntensity });
        return c;
      });
      m.material = Array.isArray(m.material) ? cloned : cloned[0];
    });
    emissives.set(h.root, list);
  }
  const roots = hoverables.map((h) => h.root);
  const lift = new Map<THREE.Object3D, number>(); // 0..1 per root

  function hoverableOf(o: THREE.Object3D | null) {
    while (o) {
      const h = hoverables.find((x) => x.root === o);
      if (h) return h;
      o = o.parent;
    }
    return undefined;
  }

  // The label: a small note next to the object, drawn in HTML.
  const tip = document.createElement('div');
  tip.className = 'room-tip';
  const tipTitle = document.createElement('strong');
  const tipText = document.createElement('span');
  const tipListen = document.createElement('span');
  tipListen.className = 'listen';
  tipListen.hidden = true;
  tipListen.textContent = 'Listen on Spotify';
  tip.append(tipTitle, tipText, tipListen);
  stage.append(tip);
  let tipFor: Hoverable | undefined;
  const box3 = new THREE.Box3();
  const v3 = new THREE.Vector3();

  function placeTip(h: Hoverable) {
    box3.setFromObject(h.root);
    v3.set((box3.min.x + box3.max.x) / 2, box3.max.y, (box3.min.z + box3.max.z) / 2).project(camera);
    const r = renderer.domElement;
    const x = ((v3.x + 1) / 2) * r.clientWidth;
    const y = ((1 - v3.y) / 2) * r.clientHeight;
    const half = tip.offsetWidth / 2;
    const cx = Math.min(Math.max(x, half + 8), r.clientWidth - half - 8);
    tip.style.transform = `translate(${cx - half}px, ${Math.max(y - tip.offsetHeight - 12, 8)}px)`;
  }

  function showTip(h: Hoverable | undefined) {
    if (h === tipFor) return;
    tipFor = h;
    if (!h?.info) {
      tip.classList.remove('is-on');
      return;
    }
    tipTitle.textContent = h.info.title;
    tipText.textContent = h.info.text;
    tipListen.hidden = !h.info.url;
    tip.classList.add('is-on');
    placeTip(h);
  }

  // Hotspots: a small ember dot on each thing that can be hovered, until the
  // visitor has hovered one (then they know, and the dots go for good).
  // HTML, so they stay crisp; placed each frame like the label.
  const dots = document.createElement('div');
  dots.className = 'room-dots';
  const anchors: { el: HTMLElement; at: THREE.Vector3 }[] = [];
  scene.updateMatrixWorld(true);
  const seen = new Set<string>();
  for (const h of hoverables) {
    if (seen.has(h.key)) continue; // one dot for the pair of speakers
    seen.add(h.key);
    box3.setFromObject(h.root);
    const at = new THREE.Vector3();
    box3.getCenter(at);
    // Sleeves: the middle of the cover. Gear: just below its top.
    // Gear: just below its top, but on the body of the tall things (the
    // guitar's body, the turntable's deck rather than its raised lid).
    if (h.record === undefined) {
      const top = box3.max.y - Math.min(0.04, (box3.max.y - box3.min.y) * 0.25);
      at.y = Math.min(top, box3.min.y + (h.key === 'turntable' ? 0.1 : 0.32));
    }
    const el = document.createElement('span');
    el.className = 'room-dot';
    dots.append(el);
    anchors.push({ el, at });
  }
  stage.append(dots);
  let dotsGone = false;
  function placeDots() {
    if (dotsGone) return;
    const r = renderer.domElement;
    for (const a of anchors) {
      v3.copy(a.at).project(camera);
      a.el.style.transform = `translate(${((v3.x + 1) / 2) * r.clientWidth}px, ${((1 - v3.y) / 2) * r.clientHeight}px)`;
    }
  }

  // ------------------------------------------------------------ Loop

  // Size to the stage: full width, 16:9.
  function resize() {
    const w = stage.clientWidth;
    const h = Math.round((w * 9) / 16);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  }
  const sizeWatch = new ResizeObserver(resize);
  sizeWatch.observe(stage);

  // The camera leans toward the pointer, a little, and eases back.
  const lean = new THREE.Vector2();
  const leanTo = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2(9, 9);
  let pointerDirty = false;
  stage.addEventListener('pointermove', (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (!options.reducedMotion) leanTo.set(pointer.x / 2, -pointer.y / 2);
    pointerDirty = true;
    requestRender();
  });
  stage.addEventListener('pointerleave', () => {
    pointer.set(9, 9);
    leanTo.set(0, 0);
    pointerDirty = true;
    requestRender();
  });

  let hovered: Hoverable | undefined;
  function pick() {
    if (pointer.x > 2) return undefined;
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(roots, true)[0];
    return hit ? hoverableOf(hit.object) : undefined;
  }

  // Render only while the room is on screen; the record turns at 33 rpm.
  let visible = false;
  let running = false;
  const clock = new THREE.Clock();
  let disposed = false;
  let readyCalled = false;
  function frame() {
    if (disposed) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    lean.lerp(leanTo, 1 - Math.pow(0.002, dt));
    camera.position.set(eye.x + lean.x * 0.5, eye.y - lean.y * 0.18, eye.z);
    camera.lookAt(target);

    if (pointerDirty) {
      pointerDirty = false;
      hovered = pick();
      stage.style.cursor = hovered ? 'pointer' : '';
      showTip(hovered);
      if (hovered && !dotsGone) {
        dotsGone = true;
        dots.classList.add('is-gone');
      }
    }

    // Ease the hovered object (and its partner) up, everything else down.
    let moving = false;
    const k = options.reducedMotion ? 1 : 1 - Math.pow(0.0005, dt);
    for (const h of hoverables) {
      const on = !!hovered && (hovered.root === h.root || !!hovered.partners?.includes(h.root));
      const goal = on ? 1 : 0;
      const now = lift.get(h.root) ?? 0;
      if (now === goal) continue;
      let next = now + (goal - now) * k;
      if (Math.abs(goal - next) < 0.002) next = goal;
      else moving = true;
      lift.set(h.root, next);
      const l = lift.get(h.root)!;
      for (const e of emissives.get(h.root)!) {
        e.mat.emissive.copy(e.base).lerp(glow, l * (h.record !== undefined ? 0.06 : 0.14));
        e.mat.emissiveIntensity = l > 0 ? Math.max(e.baseI, 1) : e.baseI;
      }
      if (h.record !== undefined) {
        // Pulled forward and up off the ledge, as if to look at it.
        h.root.position.y = h.root.userData.baseY + l * 0.05;
        h.root.position.z = 0.075 + l * 0.03;
        h.root.rotation.x = h.root.userData.baseRx * (1 - l * 0.6);
        renderer.shadowMap.needsUpdate = true;
      }
    }
    if (tipFor) placeTip(tipFor);
    placeDots();

    if (!options.reducedMotion) turntable.spin.rotation.y -= dt * ((33.3 / 60) * Math.PI * 2);
    renderer.render(scene, camera);
    if (!readyCalled) {
      readyCalled = true;
      options.onReady?.();
    }

    const settling = moving || lean.distanceTo(leanTo) > 0.001;
    if (visible && (!options.reducedMotion || settling)) requestAnimationFrame(frame);
    else running = false;
  }
  function requestRender() {
    if (running || disposed) return;
    running = true;
    clock.getDelta();
    requestAnimationFrame(frame);
  }

  // A click on a sleeve opens the album, same as the list below.
  stage.addEventListener('click', () => {
    if (disposed) return;
    const h = pick();
    const url = h?.record !== undefined ? recordInfo[h.record]?.url : undefined;
    if (url) window.open(url, '_self');
  });

  const viewWatch = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible) requestRender();
  });
  viewWatch.observe(stage);

  stage.append(renderer.domElement);
  resize();
  setMood();

  // Takes the room down again (the page gives up on a room that loads too
  // slowly, and must not let it appear later).
  function dispose() {
    disposed = true;
    sizeWatch.disconnect();
    viewWatch.disconnect();
    if (!options.mood) dark.removeEventListener('change', setMood);
    renderer.domElement.remove();
    tip.remove();
    dots.remove();
    stage.style.cursor = '';
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return { renderer, scene, camera, dispose };
}
