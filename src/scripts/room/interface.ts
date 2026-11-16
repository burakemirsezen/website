// Part of the listening room. See kit.ts for the conventions.
//
// Focusrite Scarlett Solo (3rd gen), after the owner's photo: 144 × 43 × 96
// mm. A red anodised aluminium sleeve with rounded corners, open at both ends,
// holding black front and rear panels. Front, left to right: the Neutrik
// combo input, gain 1 with its halo over the 48V and AIR buttons, the
// instrument jack, gain 2 with its halo over INST, a divider, the large
// silver MONITOR knob, then DIRECT MONITOR over the headphone socket.
// The Focusrite logo is etched into the top.

import { THREE, std, mesh, canvasTexture, RoundedBoxGeometry, brushedParams, sg, bq, bakeQuality, greyCanvas, normalFromHeight, dataTexture } from './kit';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V3 = [number, number, number];

function place(geo: THREE.BufferGeometry, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0]) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
    new THREE.Vector3(1, 1, 1),
  );
  return geo.applyMatrix4(m);
}

function merge(list: THREE.BufferGeometry[]) {
  const flat = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    return n;
  });
  return mergeGeometries(flat, false)!;
}

const rbox = (w: number, h: number, d: number, r: number, seg = 2) => new RoundedBoxGeometry(w, h, d, sg(seg), r);
// A cylinder lying along +z (towards the viewer), from z = 0 to z = len.
const zcyl = (r: number, len: number, seg = 24, r2 = r, open = false) =>
  new THREE.CylinderGeometry(r2, r, len, sg(seg), 1, open).rotateX(Math.PI / 2).translate(0, 0, len / 2);

// Rounded-rectangle outline centred on the origin.
function roundRect(w: number, h: number, r: number, path: THREE.Path = new THREE.Shape()) {
  const x = -w / 2;
  const y = -h / 2;
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

// ---------------------------------------------------------------- textures

// Neutrik combo face: XLR pin holes around the 1/4" socket, brand on top.
function comboTexture() {
  const K = bq(1, 2);
  return canvasTexture(256 * K, 256 * K, (g) => {
    g.scale(K, K);
    g.fillStyle = '#121212';
    g.fillRect(0, 0, 256, 256);
    const ring = g.createRadialGradient(128, 128, 90, 128, 128, 128);
    ring.addColorStop(0, 'rgba(255 255 255 / 0)');
    ring.addColorStop(1, 'rgba(255 255 255 / 0.08)');
    g.fillStyle = ring;
    g.fillRect(0, 0, 256, 256);
    const hole = (x: number, y: number, r: number) => {
      g.fillStyle = '#000';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255 255 255 / 0.18)';
      g.lineWidth = 2;
      g.stroke();
    };
    hole(128 - 52, 140, 13);
    hole(128 + 52, 140, 13);
    hole(128, 196, 13);
    // 1/4" socket.
    g.fillStyle = '#2a2a2a';
    g.beginPath();
    g.arc(128, 132, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#030303';
    g.beginPath();
    g.arc(128, 132, 21, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(200 200 200 / 0.55)';
    g.font = '700 22px Helvetica, Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText('NEUTRIK', 128, 70);
    g.font = '600 15px Helvetica, Arial, sans-serif';
    g.fillText('2', 128 - 52, 172);
    g.fillText('1', 128 + 52, 172);
    g.fillText('3', 128 + 26, 214);
  });
}

// Gain knob top: matte black with a white pointer to the edge.
function knobTopTexture() {
  const K = bq(1, 2);
  return canvasTexture(128 * K, 128 * K, (g) => {
    g.scale(K, K);
    g.fillStyle = '#151515';
    g.fillRect(0, 0, 128, 128);
    const gr = g.createRadialGradient(50, 40, 4, 64, 64, 70);
    gr.addColorStop(0, 'rgba(255 255 255 / 0.10)');
    gr.addColorStop(1, 'rgba(255 255 255 / 0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#f2f2f2';
    g.fillRect(60, 2, 8, 46);
  });
}

// Monitor knob face: spun aluminium with a white pointer.
function spunTexture() {
  return canvasTexture(512, 512, (g) => {
    g.fillStyle = '#c4c7cb';
    g.fillRect(0, 0, 512, 512);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let r = 2; r < 256; r += 1.5) {
      const v = Math.round(130 + rnd() * 70);
      g.strokeStyle = `rgba(${v} ${v} ${v + 4} / 0.35)`;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(256, 256, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#ffffff';
    g.fillRect(250, 14, 12, 120);
  });
}

// Knob sides: fine knurling, wraps once around.
function knurlTexture(base: string) {
  return canvasTexture(256, 16, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 16);
    for (let i = 0; i < 256; i += 3) {
      g.fillStyle = 'rgba(255 255 255 / 0.06)';
      g.fillRect(i, 0, 1, 16);
    }
  });
}

// ---------------------------------------------------------------- bake-only detail

// A cylinder with straight knurling: `teeth` triangular ridges, `depth` deep
// (a fraction of the radius), with enough segments to carry them.
function knurled(rt: number, rb: number, h: number, teeth: number, depth: number, open = false) {
  const geo = new THREE.CylinderGeometry(rt, rb, h, teeth * 6, 1, open);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    if (Math.hypot(x, z) < 1e-6) continue;
    const f = ((Math.atan2(z, x) / (Math.PI * 2)) * teeth) % 1;
    const tri = Math.abs(((f + 1) % 1) - 0.5) * 2; // 0..1 sawtooth-free triangle
    const k = 1 - depth * tri;
    p.setXYZ(i, x * k, p.getY(i), z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

// Turned aluminium: concentric tooling marks, as a normal map and a mask
// (white = bare metal, black = the painted pointer line).
function spunNormal() {
  let seed = 23;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const N = 1024;
  const h = greyCanvas(N, N, (g) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, N, N);
    for (let r = 2; r < N / 2; r += 1.1) {
      const v = Math.round(110 + rnd() * 70);
      g.strokeStyle = `rgba(${v} ${v} ${v} / 0.6)`;
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(N / 2, N / 2, r, 0, Math.PI * 2);
      g.stroke();
    }
  });
  return dataTexture(normalFromHeight(h, 0.9, false), false);
}
function spunMask() {
  const c = greyCanvas(512, 512, (g) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#000';
    g.fillRect(250, 14, 12, 120);
  });
  return dataTexture(c, false);
}

// A lathe ring about +z: profile = [radius, height above z = 0] points.
const zlathe = (prof: [number, number][], seg = 48) =>
  new THREE.LatheGeometry(
    prof.map(([r, h]) => new THREE.Vector2(r, h)),
    seg,
  ).rotateX(Math.PI / 2);

// ---------------------------------------------------------------- model

export function buildInterface(): THREE.Group {
  const g = new THREE.Group();

  const W = 0.144;
  const H = 0.043;
  const D = 0.096;
  const FOOT = 0.0015;
  const R = 0.0065; // sleeve corner radius (front view)
  const WALL = 0.0024; // sleeve wall seen around the front panel
  const caseH = H - FOOT;
  const CY = FOOT + caseH / 2;
  const FZ = D / 2 - 0.0012; // front panel face, set back in the sleeve

  const red = new THREE.MeshPhysicalMaterial({
    color: 0xc4111c,
    // Anodised aluminium, finely brushed along the case: the extrusion's UVs
    // are in metres, so the tile repeats about once a centimetre.
    ...brushedParams(90, 90, 0.3, 0.42),
    metalness: 0.3,
    clearcoat: 0.3,
    clearcoatRoughness: 0.35,
    anisotropy: 0.35,
  });
  if (bakeQuality()) {
    // Dyed anodising over bare aluminium: a metal, so no clear coat; the dye
    // tints the reflection, and the brushing stretches it along the case.
    red.clearcoat = 0;
    red.metalness = 0.86;
    red.roughness = 0.34;
    red.anisotropy = 0.55;
    red.color.set(0xbf0f1a);
    if (red.normalScale) red.normalScale.set(0.45, 0.45);
  }
  const panelMat = std(0x141516, 0.38, 0.25);
  const black = std(0x0d0d0d, 0.5, 0.1);
  const metal = std(0xc4c4c6, 0.3, 0.75);
  const rubber = std(0x0a0a0a, 0.95);

  // ---- Sleeve: rounded-rect tube along z, with small eased lips.
  {
    const outer = roundRect(W, caseH, R) as THREE.Shape;
    outer.holes.push(roundRect(W - 2 * WALL, caseH - 2 * WALL, R - WALL, new THREE.Path()));
    const depth = D - 0.0012;
    const geo = new THREE.ExtrudeGeometry(outer, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.0006,
      bevelSize: 0.0004,
      bevelSegments: sg(2),
      curveSegments: sg(10),
    });
    geo.translate(0, CY, -depth / 2);
    // The sleeve casts but does not receive shadows: on a small, glossy,
    // flat-topped part, shadow acne (diagonal bands) costs more than the
    // contact shadows it would gain.
    const sleeve = mesh(geo, red);
    sleeve.receiveShadow = false;
    g.add(sleeve);
  }

  // ---- Front and rear panels inside the sleeve.
  const PW = W - 2 * WALL;
  const PH = caseH - 2 * WALL;
  {
    const s = roundRect(PW + 0.0004, PH + 0.0004, R - WALL);
    // Bake: the front 3.5 mm is a separate plate, cut through for the sockets
    // (see below), so they have real depth.
    const plate = new THREE.ExtrudeGeometry(s, { depth: D - 0.0024 - bq(0, 0.0035), bevelEnabled: false, curveSegments: sg(8) });
    plate.translate(0, CY, -(D - 0.0024) / 2);
    g.add(mesh(plate, panelMat));
  }

  // ---- Feet.
  {
    const feet: THREE.BufferGeometry[] = [];
    for (const fx of [-0.058, 0.058])
      for (const fz of [-0.036, 0.036]) {
        if (bakeQuality()) {
          // Moulded foot: eased edge, and a shallow dish in the sole.
          const prof: [number, number][] = [[0, 0.0003], [0.0042, 0.0003], [0.0047, 0], [0.0055, 0.0001], [0.006, 0.0007], [0.006, 0.0013], [0.0056, 0.0019], [0, 0.0019]];
          feet.push(place(new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), 40), [fx, 0, fz]));
        } else feet.push(place(new THREE.CylinderGeometry(0.006, 0.006, FOOT + 0.0004, sg(16)), [fx, (FOOT + 0.0004) / 2, fz]));
      }
    g.add(mesh(merge(feet), rubber, false));
  }

  // Front layout, measured off the photo: x across, y above the case bottom.
  const at = (x: number, y: number) => ({ x: x / 1000 + 0.0007, y: FOOT + y / 1000 });
  const P = {
    xlr: at(-53, 19.4),
    gain1: at(-31.5, 28.6),
    b48: at(-35.4, 9.3),
    air: at(-23.8, 9.3),
    jack: at(-9.5, 13.8),
    gain2: at(4.4, 29),
    inst: at(4.6, 9.3),
    monitor: at(32.6, 18),
    direct: at(54.2, 29.7),
    phones: at(54.2, 14.5),
  };

  // ---- Printed legends on the front panel.
  {
    const refPpm = 11000;
    const ppm = bq(4500, 14000);
    const TW0 = Math.round(PW * refPpm);
    const TH0 = Math.round(PH * refPpm);
    const TW = Math.round(PW * ppm);
    const TH = Math.round(PH * ppm);
    const X = (m: number) => (m / PW + 0.5) * TW0;
    const Y = (m: number) => (1 - (m - (CY - PH / 2)) / PH) * TH0; // m = world y
    const tex = canvasTexture(TW, TH, (c) => {
      c.clearRect(0, 0, TW, TH);
      c.scale(TW / TW0, TH / TH0);
      const white = 'rgba(240 240 240 / 0.95)';
      c.fillStyle = white;
      c.strokeStyle = white;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const font = (px: number, w = 500) => (c.font = `${w} ${px}px Helvetica, Arial, sans-serif`);
      const yy = (mm: number) => Y(FOOT + mm / 1000);
      const xx = (mm: number) => X(mm / 1000 + 0.0007);
      font(22);
      c.fillText('1', xx(-37.9), yy(35.7));
      c.fillText('2', xx(-3.4), yy(35.7));
      font(29);
      c.fillText('GAIN', xx(-28.5), yy(19.4));
      c.fillText('GAIN', xx(7.4), yy(19.4));
      // Small scale ticks either side of the gain legends.
      c.lineWidth = 3;
      for (const [gx, gy] of [
        [P.gain1.x, P.gain1.y],
        [P.gain2.x, P.gain2.y],
      ]) {
        for (const sx of [-1, 1]) {
          const r0 = 0.0078 * refPpm;
          const dx = sx * Math.SQRT1_2;
          const dy = Math.SQRT1_2; // canvas y runs down
          c.beginPath();
          c.moveTo(X(gx) + dx * r0, Y(gy) + dy * r0);
          c.lineTo(X(gx) + dx * (r0 + 16), Y(gy) + dy * (r0 + 16));
          c.stroke();
        }
      }
      font(26, 600);
      c.fillStyle = '#ff4a3d';
      c.fillText('48V', xx(-35.4), yy(15.6));
      c.fillText('INST', xx(4.6), yy(15.6));
      c.fillStyle = '#ff8f3a';
      c.fillText('AIR', xx(-23.8), yy(15.6));
      c.fillStyle = white;
      font(29);
      c.fillText('MONITOR', xx(31.5), yy(35.8));
      font(23);
      c.fillText('DIRECT', xx(54.2), yy(37.3));
      c.fillText('MONITOR', xx(54.2), yy(34.6));
      // Monitor tick, lower left.
      c.lineWidth = 3;
      {
        const ang = THREE.MathUtils.degToRad(225);
        const r0 = 0.0136 * refPpm;
        const mx = X(P.monitor.x);
        const my = Y(P.monitor.y);
        c.beginPath();
        c.moveTo(mx + Math.cos(ang) * r0, my - Math.sin(ang) * r0);
        c.lineTo(mx + Math.cos(ang) * (r0 + 14), my - Math.sin(ang) * (r0 + 14));
        c.stroke();
      }
      // USB glyph, green.
      {
        const ux = xx(44);
        const uy = yy(35.8);
        c.strokeStyle = '#2fdc5a';
        c.fillStyle = '#2fdc5a';
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(ux - 26, uy);
        c.lineTo(ux + 22, uy);
        c.moveTo(ux - 12, uy);
        c.lineTo(ux - 2, uy - 11);
        c.lineTo(ux + 10, uy - 11);
        c.moveTo(ux - 4, uy);
        c.lineTo(ux + 4, uy + 10);
        c.lineTo(ux + 12, uy + 10);
        c.stroke();
        c.beginPath();
        c.arc(ux - 28, uy, 6, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.moveTo(ux + 30, uy);
        c.lineTo(ux + 20, uy - 7);
        c.lineTo(ux + 20, uy + 7);
        c.fill();
        c.fillRect(ux + 9, uy - 15, 7, 7);
        c.beginPath();
        c.arc(ux + 15, uy + 10, 4, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = white;
      c.fillStyle = white;
      // Headphone glyph.
      {
        const hx = xx(54.2);
        const hy = yy(5.4);
        c.lineWidth = 5;
        c.beginPath();
        c.arc(hx, hy + 4, 16, Math.PI, 0);
        c.stroke();
        c.fillRect(hx - 19, hy + 2, 8, 14);
        c.fillRect(hx + 11, hy + 2, 8, 14);
      }
      // Divider.
      c.fillStyle = 'rgba(240 240 240 / 0.35)';
      c.fillRect(xx(16.3) - 1.5, yy(36.6), 3, yy(5.5) - yy(36.6));
      // "Scarlett Solo" with the boxed model name.
      c.fillStyle = white;
      c.textAlign = 'left';
      font(38, 700);
      c.fillText('Scarlett', xx(-64.2), yy(5));
      const sx = xx(-64.2) + c.measureText('Scarlett').width + 8;
      font(34, 500);
      const sw = c.measureText('Solo').width;
      c.fillRect(sx, yy(5) - 21, sw + 14, 42);
      c.fillStyle = '#141516';
      c.fillText('Solo', sx + 7, yy(5) + 1);
    });
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(PW, PH),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    decal.position.set(0, CY, FZ + 0.0001);
    g.add(decal);
  }

  // ---- Top: the Focusrite logo, etched (a paler, matte tone of the red).
  {
    const tw = 0.06;
    const td = 0.012;
    const LW = bq(512, 1024);
    const LH = Math.round((LW * 102) / 512);
    const tex = canvasTexture(LW, LH, (c) => {
      c.clearRect(0, 0, LW, LH);
      c.scale(LW / 1000, LH / 200);
      c.fillStyle = 'rgba(236 205 205 / 0.75)';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '400 150px Georgia, "Times New Roman", serif';
      c.fillText('Focusrite', 500, 108);
    });
    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(tw, td),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.set(0.002, H + 0.0006, 0.026);
    g.add(top);
  }

  // ---- Neutrik combo input.
  if (bakeQuality()) {
    // Neutrik combo with real depth: a turned body in the cut-out, the
    // XLR / 1/4" face sunk 2 mm, nickel contact rims, a TRS sleeve rising from it.
    const p = P.xlr;
    const at3 = (z: number) => [p.x, p.y, FZ + z] as [number, number, number];
    g.add(mesh(place(zlathe([[0.0092, -0.0034], [0.0092, 0.0012], [0.0088, 0.0014], [0.0084, 0.0011], [0.0083, 0.0008], [0.0083, -0.0021]]), at3(0)), black, false));
    const face = mesh(new THREE.CircleGeometry(0.0083, 64), new THREE.MeshStandardMaterial({ map: comboTexture(), roughness: 0.55 }), false);
    face.position.set(p.x, p.y, FZ - 0.0021);
    g.add(face);
    const rims: THREE.BufferGeometry[] = [];
    for (const [hx, hy] of [[-0.0035, -0.0008], [0.0035, -0.0008], [0, -0.0046]]) {
      rims.push(place(new THREE.TorusGeometry(0.00087, 0.00014, 6, 20), [p.x + hx, p.y + hy, FZ - 0.0020]));
      rims.push(place(zlathe([[0.00087, -0.0005], [0.00087, 0]], 16), [p.x + hx, p.y + hy, FZ - 0.0021]));
    }
    rims.push(place(zlathe([[0.0034, 0], [0.0034, 0.0016], [0.0030, 0.0017], [0.0027, 0.0014], [0.0027, 0]], 32), [p.x, p.y - 0.0004, FZ - 0.0021]));
    g.add(mesh(merge(rims), std(0xc9c9cb, 0.28, 0.9), false));
  } else {
    const p = P.xlr;
    g.add(
      mesh(
        merge([
          place(zcyl(0.0094, 0.0016, 48, 0.0092, true), [p.x, p.y, FZ]),
          place(new THREE.RingGeometry(0.0082, 0.0093, sg(48)), [p.x, p.y, FZ + 0.0016]),
          place(zcyl(0.0083, 0.0008, 48, 0.0083, true), [p.x, p.y, FZ + 0.0008]),
        ]),
        black,
      ),
    );
    const face = mesh(new THREE.CircleGeometry(0.0086, sg(48)), new THREE.MeshStandardMaterial({ map: comboTexture(), roughness: 0.55 }), false);
    face.position.set(p.x, p.y, FZ + 0.0008);
    g.add(face);
  }

  // Bake: the front plate, cut for the combo and the two 1/4" sockets.
  if (bakeQuality()) {
    const s = roundRect(PW + 0.0004, PH + 0.0004, R - WALL) as THREE.Shape;
    for (const [q, r] of [[P.xlr, 0.0094], [P.jack, 0.0046 * 1.22], [P.phones, 0.0044 * 1.22]] as const) {
      const hole = new THREE.Path();
      hole.absarc(q.x, q.y - CY, r, 0, Math.PI * 2, true);
      s.holes.push(hole);
    }
    const front = new THREE.ExtrudeGeometry(s, { depth: 0.0035, bevelEnabled: false, curveSegments: 12 });
    front.translate(0, CY, FZ - 0.0035);
    g.add(mesh(front, panelMat));
  }

  // ---- 1/4" sockets: black rimmed holes, slightly proud.
  const socket = (p: { x: number; y: number }, r: number) => {
    if (bakeQuality()) {
      // A black ferrule with a rolled lip, a bore 3 mm deep with a nickel
      // contact sleeve, and a dark floor.
      g.add(mesh(place(zlathe([[r * 1.21, -0.0034], [r * 1.21, 0.001], [r * 1.0, 0.0012], [r * 0.86, 0.0009], [r * 0.84, 0.0006], [r * 0.84, -0.003]], 40), [p.x, p.y, FZ]), black, false));
      g.add(mesh(place(zlathe([[r * 0.5, 0], [r * 0.5, 0.0016], [r * 0.34, 0.0017], [r * 0.32, 0]], 24), [p.x, p.y, FZ - 0.003]), std(0xc9c9cb, 0.3, 0.9), false));
      const floor = mesh(new THREE.CircleGeometry(r * 0.84, 32), std(0x020202, 0.9), false);
      floor.position.set(p.x, p.y, FZ - 0.0031);
      g.add(floor);
      return;
    }
    g.add(mesh(merge([place(zcyl(r, 0.0012, 32), [p.x, p.y, FZ]), place(new THREE.TorusGeometry(r * 0.85, r * 0.13, sg(6), sg(32)), [p.x, p.y, FZ + 0.0012])]), black, false));
    const hole = mesh(new THREE.CircleGeometry(r * 0.72, sg(24)), std(0x020202, 0.9), false);
    hole.position.set(p.x, p.y, FZ + 0.0013);
    g.add(hole);
  };
  socket(P.jack, 0.0046);
  socket(P.phones, 0.0044);

  // ---- Knobs.
  const knobTop = knobTopTexture();
  const gainKnob = (p: { x: number; y: number }, angle: number) => {
    const k = new THREE.Group();
    const r = 0.005;
    const len = 0.0095;
    const side = new THREE.MeshStandardMaterial({ map: knurlTexture('#141414'), roughness: 0.5 });
    const body = mesh(bakeQuality() ? knurled(r * 0.98, r, len * 0.8, 48, 0.035, true) : new THREE.CylinderGeometry(r * 0.98, r, len * 0.8, sg(40), 1, true), side);
    body.position.y = (len * 0.8) / 2;
    k.add(body);
    const cham = mesh(new THREE.CylinderGeometry(r * 0.84, r * 0.98, len * 0.2, sg(40), 1, true), std(0x1e1e1e, 0.32, 0.2));
    cham.position.y = len * 0.9;
    k.add(cham);
    const cap = mesh(new THREE.CircleGeometry(r * 0.84, sg(40)), new THREE.MeshStandardMaterial({ map: knobTop, roughness: 0.4 }));
    cap.rotation.x = -Math.PI / 2;
    cap.rotation.z = angle;
    cap.position.y = len;
    k.add(cap);
    k.rotation.x = Math.PI / 2;
    k.position.set(p.x, p.y, FZ);
    g.add(k);
  };
  gainKnob(P.gain1, 0.35);
  gainKnob(P.gain2, 0.1);

  // Gain halos: glowing rings round the knob bases (green: signal; red: clip,
  // as in the photo).
  {
    const halo = (p: { x: number; y: number }, color: number, glow: number) => {
      const m = new THREE.MeshStandardMaterial({ color, emissive: glow, emissiveIntensity: bq(0.8, 6), roughness: 0.3 });
      const ring = mesh(place(new THREE.RingGeometry(0.0055, 0.0068, sg(48)), [p.x, p.y, FZ + 0.0003]), m, false);
      ring.name = glow === 0x10c03a ? 'led-signal' : 'led-clip';
      g.add(ring);
      g.add(mesh(place(new THREE.RingGeometry(0.0051, 0.0072, sg(48)), [p.x, p.y, FZ + 0.0002]), std(0x080808, 0.3), false));
    };
    halo(P.gain1, 0x0a7a25, 0x10c03a);
    halo(P.gain2, 0x9a1010, 0xe8201c);
    if (bakeQuality()) {
      // A clear, tinted light-pipe over each glowing ring.
      for (const [p, tint] of [[P.gain1, 0x66ff8e], [P.gain2, 0xff7068]] as const) {
        const lens = mesh(
          place(new THREE.TorusGeometry(0.00615, 0.00068, 10, 72).scale(1, 1, 0.5), [p.x, p.y, FZ + 0.0004]),
          new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.12, transmission: 0.85, thickness: 0.0007, ior: 1.5, attenuationColor: new THREE.Color(tint), attenuationDistance: 0.004 }),
          false,
        );
        lens.name = 'lens-halo';
        g.add(lens);
      }
    }
  }

  // Monitor: a black knurled skirt behind a big spun-aluminium knob.
  {
    const p = P.monitor;
    const k = new THREE.Group();
    const skirt = mesh(bakeQuality() ? knurled(0.0124, 0.0128, 0.004, 96, 0.03) : new THREE.CylinderGeometry(0.0124, 0.0128, 0.004, sg(56)), [
      new THREE.MeshStandardMaterial({ map: knurlTexture('#121212'), roughness: 0.5 }),
      black,
      black,
    ]);
    skirt.position.y = 0.002;
    k.add(skirt);
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xc2c5c9, roughness: 0.3, metalness: 0.5 });
    const body = mesh(new THREE.CylinderGeometry(0.0112, 0.0114, 0.0075, sg(64), 1, true), sideMat);
    body.position.y = 0.004 + 0.00375;
    k.add(body);
    const edge = mesh(new THREE.CylinderGeometry(0.0106, 0.0112, 0.0008, sg(64), 1, true), sideMat);
    edge.position.y = 0.0119;
    k.add(edge);
    const face = mesh(
      new THREE.CircleGeometry(0.0106, sg(64)),
      bakeQuality()
        ? new THREE.MeshPhysicalMaterial({ map: spunTexture(), normalMap: spunNormal(), normalScale: new THREE.Vector2(0.6, 0.6), metalnessMap: spunMask(), metalness: 1, roughness: 0.27, anisotropy: 0.6 })
        : new THREE.MeshStandardMaterial({ map: spunTexture(), roughness: 0.3, metalness: 0.45 }),
    );
    face.rotation.x = -Math.PI / 2;
    face.rotation.z = 0.25;
    face.position.y = 0.0123;
    k.add(face);
    k.rotation.x = Math.PI / 2;
    k.position.set(p.x, p.y, FZ);
    g.add(k);
  }

  // ---- Round push buttons: 48V, AIR, INST, DIRECT MONITOR.
  {
    const bezels: THREE.BufferGeometry[] = [];
    const caps: THREE.BufferGeometry[] = [];
    for (const p of [P.b48, P.air, P.inst, P.direct]) {
      bezels.push(place(zcyl(0.0029, 0.0008, 32), [p.x, p.y, FZ]));
      caps.push(place(zcyl(0.0023, 0.0022, 28), [p.x, p.y, FZ + 0.0002]));
      caps.push(place(new THREE.SphereGeometry(0.0023, sg(28), sg(3), 0, Math.PI * 2, 0, 0.5).rotateX(Math.PI / 2), [p.x, p.y, FZ + 0.0024 - 0.0023 * Math.cos(0.5)]));
    }
    g.add(mesh(merge(bezels), black, false));
    g.add(mesh(merge(caps), std(0x3a3b3f, 0.2, 0.45), false));
    if (bakeQuality()) {
      // A pinhead LED above each button, a die under a transmissive dome: AIR
      // is lit (amber), the others are off and show only their tinted lens.
      const lit: Record<string, number> = { b48: 0, air: 1, inst: 0 };
      for (const [key, p, tint, glow] of [
        ['b48', P.b48, 0xff3b2e, 0xff2a20],
        ['air', P.air, 0xffa23a, 0xff8f2a],
        ['inst', P.inst, 0xff3b2e, 0xff2a20],
      ] as const) {
        const cx = p.x, cy = p.y + 0.0039;
        g.add(mesh(place(zlathe([[0.00095, -0.0003], [0.00095, 0.0003]], 14), [cx, cy, FZ]), black, false));
        const lens = mesh(
          new THREE.SphereGeometry(0.0008, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2),
          new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.05, transmission: 0.88, thickness: 0.0008, ior: 1.52, attenuationColor: new THREE.Color(tint), attenuationDistance: 0.002, side: THREE.DoubleSide }),
          false,
        );
        lens.position.set(cx, cy, FZ + 0.0003);
        lens.name = 'lens-' + key;
        g.add(lens);
        const die = mesh(
          new THREE.SphereGeometry(0.00033, 10, 6),
          new THREE.MeshStandardMaterial({ color: tint, emissive: glow, emissiveIntensity: lit[key] ? 12 : 0.15, roughness: 0.4 }),
          false,
        );
        die.position.set(cx, cy, FZ + 0.0004);
        die.name = 'lamp-' + key;
        g.add(die);
      }
    }
  }

  // ---- Rear: USB-C, Kensington slot, two RCA line outputs, legends.
  {
    const BZ = -FZ;
    const midY = CY;
    g.add(mesh(place(rbox(0.0094, 0.0036, 0.001, 0.0012), [-0.045, midY, BZ - 0.0002]), std(0x050505, 0.8), false));
    g.add(mesh(place(rbox(0.0068, 0.0032, 0.001, 0.0008), [-0.058, midY, BZ - 0.0002]), std(0x050505, 0.8), false));
    if (bakeQuality()) {
      // USB-C: the plug shell's stainless rim, a dark cavity and the contact tongue.
      const ss = std(0xc7c8ca, 0.26, 0.95);
      g.add(mesh(place(rbox(0.0092, 0.0034, 0.0003, 0.0016, 3), [-0.045, midY, BZ - 0.0008]), ss, false));
      g.add(mesh(place(rbox(0.0082, 0.0024, 0.0004, 0.0011, 3), [-0.045, midY, BZ - 0.00095]), std(0x030303, 0.9), false));
      g.add(mesh(place(new THREE.BoxGeometry(0.0062, 0.0006, 0.0005), [-0.045, midY, BZ - 0.0011]), std(0x2a2a2c, 0.5, 0.4), false));
      // Kensington slot: a stamped steel rim round the slot.
      g.add(mesh(place(rbox(0.0070, 0.0034, 0.0003, 0.0012, 3), [-0.058, midY, BZ - 0.0008]), ss, false));
      g.add(mesh(place(rbox(0.0058, 0.0020, 0.0004, 0.0008, 3), [-0.058, midY, BZ - 0.00095]), std(0x020202, 0.9), false));
      // Panel screws, one near each rear corner (round heads with a cross).
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
          const x = sx * (PW / 2 - 0.0042), y = midY + sy * (PH / 2 - 0.0042);
          g.add(mesh(place(new THREE.CylinderGeometry(0.0021, 0.0023, 0.0007, 24).rotateX(Math.PI / 2), [x, y, BZ - 0.00035]), ss, false));
          g.add(mesh(place(new THREE.BoxGeometry(0.003, 0.00045, 0.0001), [x, y, BZ - 0.0008], [0, 0, sx * 0.5]), std(0x050505, 0.8), false));
          g.add(mesh(place(new THREE.BoxGeometry(0.00045, 0.003, 0.0001), [x, y, BZ - 0.0008], [0, 0, sx * 0.5]), std(0x050505, 0.8), false));
        }
    }
    const rcas: THREE.BufferGeometry[] = [];
    const holes: THREE.BufferGeometry[] = [];
    for (const x of [0.03, 0.048]) {
      rcas.push(place(zcyl(0.0042, 0.006, 20), [x, midY, BZ - 0.006]));
      holes.push(place(new THREE.CircleGeometry(0.0016, sg(12)), [x, midY, BZ - 0.0061], [0, Math.PI, 0]));
    }
    g.add(mesh(merge(rcas), std(0xc9c6c0, 0.32, 0.6), false));
    if (bakeQuality()) {
      // RCA: thread ribs on the barrel, a white insulator ring, a gold centre pin.
      const ribs: THREE.BufferGeometry[] = [];
      const gold: THREE.BufferGeometry[] = [];
      const white: THREE.BufferGeometry[] = [];
      for (const x of [0.03, 0.048]) {
        for (let k = 0; k < 4; k++) ribs.push(place(new THREE.TorusGeometry(0.0042, 0.00022, 6, 32), [x, midY, BZ - 0.0012 - k * 0.0012]));
        white.push(place(new THREE.RingGeometry(0.0017, 0.0027, 28), [x, midY, BZ - 0.00608], [0, Math.PI, 0]));
        gold.push(place(zlathe([[0.0011, 0], [0.0011, 0.0009], [0.0008, 0.001], [0.0007, 0]], 16).rotateX(Math.PI), [x, midY, BZ - 0.0061]));
      }
      g.add(mesh(merge(ribs), std(0xc9c6c0, 0.32, 0.6), false));
      g.add(mesh(merge(white), std(0xe8e5de, 0.5), false));
      g.add(mesh(merge(gold), std(0xc9a24a, 0.22, 1), false));
    }
    g.add(mesh(merge(holes), std(0x020202, 0.9), false));
    const tex = canvasTexture(600, 80, (c) => {
      c.clearRect(0, 0, 600, 80);
      c.scale(0.5, 0.5);
      c.fillStyle = 'rgba(245 240 238 / 0.9)';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '600 22px Helvetica, Arial, sans-serif';
      const X = (m: number) => ((-m + PW / 2) / PW) * 1200;
      c.fillText('USB', X(-0.045), 40);
      c.fillText('LINE OUTPUTS', X(0.039), 30);
      c.fillText('L', X(0.048), 60);
      c.fillText('R', X(0.03), 60);
      c.font = '500 18px Helvetica, Arial, sans-serif';
      c.fillText('Designed by Focusrite in the UK', X(0.0), 130);
    });
    const rear = new THREE.Mesh(
      new THREE.PlaneGeometry(PW, 0.016),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    rear.rotation.y = Math.PI;
    rear.position.set(0, midY + 0.004, BZ - 0.0001);
    g.add(rear);
  }

  return g;
}
