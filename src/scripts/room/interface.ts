// Part of the listening room. See kit.ts for the conventions.
//
// Focusrite Scarlett Solo (3rd gen), after the owner's photo: 144 × 43 × 96
// mm. A red anodised aluminium sleeve with rounded corners, open at both ends,
// holding black front and rear panels. Front, left to right: the Neutrik
// combo input, gain 1 with its halo over the 48V and AIR buttons, the
// instrument jack, gain 2 with its halo over INST, a divider, the large
// silver MONITOR knob, then DIRECT MONITOR over the headphone socket.
// The Focusrite logo is etched into the top.

import { THREE, std, mesh, canvasTexture, RoundedBoxGeometry, brushedParams } from './kit';
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

const rbox = (w: number, h: number, d: number, r: number, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, r);
// A cylinder lying along +z (towards the viewer), from z = 0 to z = len.
const zcyl = (r: number, len: number, seg = 24, r2 = r, open = false) =>
  new THREE.CylinderGeometry(r2, r, len, seg, 1, open).rotateX(Math.PI / 2).translate(0, 0, len / 2);

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
  return canvasTexture(256, 256, (g) => {
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
  return canvasTexture(128, 128, (g) => {
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
      bevelSegments: 2,
      curveSegments: 10,
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
    const plate = new THREE.ExtrudeGeometry(s, { depth: D - 0.0024, bevelEnabled: false, curveSegments: 8 });
    plate.translate(0, CY, -(D - 0.0024) / 2);
    g.add(mesh(plate, panelMat));
  }

  // ---- Feet.
  {
    const feet: THREE.BufferGeometry[] = [];
    for (const fx of [-0.058, 0.058]) for (const fz of [-0.036, 0.036]) feet.push(place(new THREE.CylinderGeometry(0.006, 0.006, FOOT + 0.0004, 16), [fx, (FOOT + 0.0004) / 2, fz]));
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
    const ppm = 11000;
    const TW = Math.round(PW * ppm);
    const TH = Math.round(PH * ppm);
    const X = (m: number) => (m / PW + 0.5) * TW;
    const Y = (m: number) => (1 - (m - (CY - PH / 2)) / PH) * TH; // m = world y
    const tex = canvasTexture(TW, TH, (c) => {
      c.clearRect(0, 0, TW, TH);
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
          const r0 = 0.0078 * ppm;
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
        const r0 = 0.0136 * ppm;
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
    const tex = canvasTexture(1000, 200, (c) => {
      c.clearRect(0, 0, 1000, 200);
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
  {
    const p = P.xlr;
    g.add(
      mesh(
        merge([
          place(zcyl(0.0094, 0.0016, 48, 0.0092, true), [p.x, p.y, FZ]),
          place(new THREE.RingGeometry(0.0082, 0.0093, 48), [p.x, p.y, FZ + 0.0016]),
          place(zcyl(0.0083, 0.0008, 48, 0.0083, true), [p.x, p.y, FZ + 0.0008]),
        ]),
        black,
      ),
    );
    const face = mesh(new THREE.CircleGeometry(0.0086, 48), new THREE.MeshStandardMaterial({ map: comboTexture(), roughness: 0.55 }), false);
    face.position.set(p.x, p.y, FZ + 0.0008);
    g.add(face);
  }

  // ---- 1/4" sockets: black rimmed holes, slightly proud.
  const socket = (p: { x: number; y: number }, r: number) => {
    g.add(mesh(merge([place(zcyl(r, 0.0012, 32), [p.x, p.y, FZ]), place(new THREE.TorusGeometry(r * 0.85, r * 0.13, 6, 32), [p.x, p.y, FZ + 0.0012])]), black, false));
    const hole = mesh(new THREE.CircleGeometry(r * 0.72, 24), std(0x020202, 0.9), false);
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
    const body = mesh(new THREE.CylinderGeometry(r * 0.98, r, len * 0.8, 40, 1, true), side);
    body.position.y = (len * 0.8) / 2;
    k.add(body);
    const cham = mesh(new THREE.CylinderGeometry(r * 0.84, r * 0.98, len * 0.2, 40, 1, true), std(0x1e1e1e, 0.32, 0.2));
    cham.position.y = len * 0.9;
    k.add(cham);
    const cap = mesh(new THREE.CircleGeometry(r * 0.84, 40), new THREE.MeshStandardMaterial({ map: knobTop, roughness: 0.4 }));
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
      const m = new THREE.MeshStandardMaterial({ color, emissive: glow, emissiveIntensity: 0.8, roughness: 0.3 });
      const ring = mesh(place(new THREE.RingGeometry(0.0055, 0.0068, 48), [p.x, p.y, FZ + 0.0003]), m, false);
      ring.name = glow === 0x10c03a ? 'led-signal' : 'led-clip';
      g.add(ring);
      g.add(mesh(place(new THREE.RingGeometry(0.0051, 0.0072, 48), [p.x, p.y, FZ + 0.0002]), std(0x080808, 0.3), false));
    };
    halo(P.gain1, 0x0a7a25, 0x10c03a);
    halo(P.gain2, 0x9a1010, 0xe8201c);
  }

  // Monitor: a black knurled skirt behind a big spun-aluminium knob.
  {
    const p = P.monitor;
    const k = new THREE.Group();
    const skirt = mesh(new THREE.CylinderGeometry(0.0124, 0.0128, 0.004, 56), [
      new THREE.MeshStandardMaterial({ map: knurlTexture('#121212'), roughness: 0.5 }),
      black,
      black,
    ]);
    skirt.position.y = 0.002;
    k.add(skirt);
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xc2c5c9, roughness: 0.3, metalness: 0.5 });
    const body = mesh(new THREE.CylinderGeometry(0.0112, 0.0114, 0.0075, 64, 1, true), sideMat);
    body.position.y = 0.004 + 0.00375;
    k.add(body);
    const edge = mesh(new THREE.CylinderGeometry(0.0106, 0.0112, 0.0008, 64, 1, true), sideMat);
    edge.position.y = 0.0119;
    k.add(edge);
    const face = mesh(new THREE.CircleGeometry(0.0106, 64), new THREE.MeshStandardMaterial({ map: spunTexture(), roughness: 0.3, metalness: 0.45 }));
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
      caps.push(place(new THREE.SphereGeometry(0.0023, 28, 3, 0, Math.PI * 2, 0, 0.5).rotateX(Math.PI / 2), [p.x, p.y, FZ + 0.0024 - 0.0023 * Math.cos(0.5)]));
    }
    g.add(mesh(merge(bezels), black, false));
    g.add(mesh(merge(caps), std(0x3a3b3f, 0.2, 0.45), false));
  }

  // ---- Rear: USB-C, Kensington slot, two RCA line outputs, legends.
  {
    const BZ = -FZ;
    const midY = CY;
    g.add(mesh(place(rbox(0.0094, 0.0036, 0.001, 0.0012), [-0.045, midY, BZ - 0.0002]), std(0x050505, 0.8), false));
    g.add(mesh(place(rbox(0.0068, 0.0032, 0.001, 0.0008), [-0.058, midY, BZ - 0.0002]), std(0x050505, 0.8), false));
    const rcas: THREE.BufferGeometry[] = [];
    const holes: THREE.BufferGeometry[] = [];
    for (const x of [0.03, 0.048]) {
      rcas.push(place(zcyl(0.0042, 0.006, 20), [x, midY, BZ - 0.006]));
      holes.push(place(new THREE.CircleGeometry(0.0016, 12), [x, midY, BZ - 0.0061], [0, Math.PI, 0]));
    }
    g.add(mesh(merge(rcas), std(0xc9c6c0, 0.32, 0.6), false));
    g.add(mesh(merge(holes), std(0x020202, 0.9), false));
    const tex = canvasTexture(1200, 160, (c) => {
      c.clearRect(0, 0, 1200, 160);
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
