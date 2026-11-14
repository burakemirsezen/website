// Part of the listening room. See kit.ts for the conventions.
//
// Audio-Technica AT-LP60XBT in black, after the owner's photo: 366 × 97.5 ×
// 356 mm with the lid shut. Gunmetal plinth with rounded corners, glossy
// black front fascia with four round buttons, die-cast platter with a
// polished rim and felt mat, straight aluminium tonearm on a black gimbal,
// clear acrylic dust cover on two hinge blocks at the back (shown raised).

import { THREE, C, std, mesh, canvasTexture, RoundedBoxGeometry } from './kit';
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

const rbox = (w: number, h: number, d: number, r: number, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, r);
const cylg = (rt: number, rb: number, h: number, seg = 24) => new THREE.CylinderGeometry(rt, rb, h, seg);

// Cylinder whose axis runs from a to b.
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 12, r2 = r) {
  const dir = b.clone().sub(a);
  const geo = new THREE.CylinderGeometry(r2, r, dir.length(), seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  geo.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return geo;
}

// ---------------------------------------------------------------- textures

const REC_R = 0.1524; // 12" record
const LABEL_R = 0.05;

// Vinyl: lead-in rim, grooved bands with gaps between tracks, run-out.
function vinylTexture() {
  const S = 1024;
  const px = (m: number) => (m / REC_R) * (S / 2);
  return canvasTexture(S, S, (g) => {
    g.fillStyle = '#0d0d0e';
    g.fillRect(0, 0, S, S);
    const c = S / 2;
    const outer = px(0.1465);
    const inner = px(0.062);
    // Track gaps (smooth, slightly darker and glossier bands).
    const gaps = [0.139, 0.126, 0.111, 0.098, 0.084, 0.072].map(px);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let r = outer; r > inner; r -= 1) {
      const inGap = gaps.some((gr) => Math.abs(r - gr) < 2.2);
      g.strokeStyle = inGap ? 'rgba(0 0 0 / 0.55)' : `rgba(255 255 255 / ${0.03 + rnd() * 0.05})`;
      g.lineWidth = 1;
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
  });
}

// Anisotropy direction field: tangential everywhere, so the groove highlight
// streaks radially and stays put while the record turns, like the real thing.
function grooveAnisotropy() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - S / 2;
      const dy = y + 0.5 - S / 2;
      const l = Math.hypot(dx, dy) || 1;
      const i = (y * S + x) * 4;
      img.data[i] = Math.round(((-dy / l) * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round(((dx / l) * 0.5 + 0.5) * 255);
      const rr = l / (S / 2);
      img.data[i + 2] = Math.round(255 * Math.min(1, Math.max(0, (0.985 - rr) / 0.02)) * (rr > 0.3 ? 1 : 0.5));
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// Grey felt mat.
function matTexture() {
  return canvasTexture(512, 512, (g) => {
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
  });
}

// Small legends, white on transparent, drawn in metres on a w × h panel.
function legendTexture(w: number, h: number, ppm: number, draw: (g: CanvasRenderingContext2D, X: (m: number) => number, Y: (m: number) => number) => void) {
  const W = Math.round(w * ppm);
  const H = Math.round(h * ppm);
  return canvasTexture(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(215 215 215 / 0.9)';
    g.strokeStyle = 'rgba(215 215 215 / 0.9)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    draw(g, (m) => (m / w + 0.5) * W, (m) => (0.5 - m / h) * H);
  });
}

// ---------------------------------------------------------------- model

export interface Turntable {
  group: THREE.Group;
  /** The record on the platter; turn it about y. */
  spin: THREE.Object3D;
  /** The tonearm, pivoting about y at its base; rest is rotation 0, y 0. */
  arm: THREE.Object3D;
  /** The arm's rotation.y that puts the stylus over the groove. */
  armPlay: number;
  /** Changes the label on the record. */
  setLabel(tex: THREE.Texture): void;
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
  const plinthMat = std(0x404145, 0.55, 0.2);
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
    const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 8 });
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
      bezels.push(place(new THREE.CylinderGeometry(0.0108, 0.0085, 0.0018, 32, 1, true).rotateX(Math.PI / 2), [x, BY, FZ + 0.0009]));
      bezels.push(place(new THREE.CircleGeometry(0.0085, 32), [x, BY, FZ + 0.0001]));
      caps.push(place(new THREE.CylinderGeometry(0.0064, 0.0066, 0.004, 28).rotateX(Math.PI / 2), [x, BY, FZ + 0.002]));
      caps.push(place(new THREE.SphereGeometry(0.0066, 28, 4, 0, Math.PI * 2, 0, 0.45).rotateX(Math.PI / 2), [x, BY, FZ + 0.0026]));
    }
    g.add(mesh(merge(bezels), std(0x0b0b0c, 0.35, 0.3), false));
    g.add(mesh(merge(caps), std(0x4a4c50, 0.22, 0.55), false));
    // Legends: speed above the left button, transport above the right ones,
    // the brand in the middle.
    const lw = W - 0.03;
    const lh = FY1 - FY0;
    const tex = legendTexture(lw, lh, 9000, (c, X, Y) => {
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
    });
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
      for (const fz of [-0.125, 0.125]) feet.push(place(cylg(0.021, 0.024, FOOT, 32), [fx, FOOT / 2, fz]));
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
        new THREE.MeshStandardMaterial({ color: 0x3a7bff, emissive: 0x2a6cff, emissiveIntensity: 2 }),
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
    const lever = new THREE.ExtrudeGeometry(lv, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 2 });
    lever.translate(0, 0, -0.015);
    lever.rotateY(Math.PI / 2); // shape x -> -z (towards the back)
    lever.translate(0.12, TOP, 0.146);
    g.add(mesh(lever, darkPlastic));
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
          place(new THREE.TorusGeometry(0.0105, 0.003, 8, 32).rotateX(Math.PI / 2), [-0.152, TOP + 0.0035, -0.146]),
          place(cylg(0.0035, 0.0035, 0.004, 12), [-0.152, TOP + 0.002, -0.146]),
        ]),
        silver,
      ),
    );
    // Legends on the deck: Bluetooth glyph under the button, UP DOWN by the lever.
    const lw = 0.36;
    const ld = 0.03;
    const tex = legendTexture(lw, ld, 9000, (c, X, Y) => {
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
    });
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
    const platter = mesh(new THREE.LatheGeometry(pts, 112), polished);
    platter.position.set(PX, 0, PZ);
    g.add(platter);
    const sub = mesh(cylg(0.1, 0.1, 0.003, 40), rubber, false);
    sub.position.set(PX, TOP + 0.0015, PZ);
    g.add(sub);
    const mat = mesh(
      cylg(PR - 0.0055, PR - 0.0055, 0.002, 112),
      [std(0x232324, 0.95), new THREE.MeshStandardMaterial({ map: matTexture(), roughness: 0.95 }), rubber],
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
    const edgeMat = std(0x0c0c0c, 0.45);
    const record = mesh(new THREE.CylinderGeometry(REC_R, REC_R, recH, 160, 1), [edgeMat, vinylMat, edgeMat]);
    record.position.y = recH / 2;
    spin.add(record);
    labelMat = new THREE.MeshStandardMaterial({ map: cover, roughness: 0.55 });
    // The label is a ring: the spindle hole is a real hole, so the record can
    // be seen to line up with the spindle as it is lowered onto it.
    const HOLE = 0.0039;
    const label = mesh(new THREE.RingGeometry(HOLE, LABEL_R, 72), labelMat);
    label.rotation.x = -Math.PI / 2;
    label.position.y = recH + 0.0002;
    spin.add(label);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const holeTop = mesh(new THREE.CircleGeometry(HOLE + 0.0003, 20), holeMat, false);
    holeTop.rotation.x = -Math.PI / 2;
    holeTop.position.y = recH + 0.0001;
    spin.add(holeTop);
    const holeBottom = mesh(new THREE.CircleGeometry(HOLE + 0.0003, 20), holeMat, false);
    holeBottom.rotation.x = Math.PI / 2;
    holeBottom.position.y = -0.0001;
    spin.add(holeBottom);
  }
  // The spindle stays on the platter, whatever record is on it.
  {
    const spindle = mesh(
      merge([
        place(cylg(0.0036, 0.0036, 0.017, 16), [0, 0.0055, 0]),
        place(new THREE.SphereGeometry(0.0036, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.014, 0]),
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
      head.add(mesh(new THREE.TubeGeometry(fl, 12, 0.0008, 6, false), silver, false));
      head.add(mesh(place(cylg(0.0004, 0.0002, 0.003, 6), [0, -0.0185, 0.034]), chrome, false));
    }
    armAdd(head);

    // Where the stylus lands: swing the arm in until it is over the record,
    // a third of the way from the rim to the label.
    {
      const stylus = new THREE.Vector2(
        tip.x + Math.sin(head.rotation.y) * 0.034 - pivot.x,
        tip.z + Math.cos(head.rotation.y) * 0.034 - pivot.z,
      );
      const goal = LABEL_R + (REC_R - LABEL_R) * 0.62;
      for (let a = 0; a > -1.2; a -= 0.002) {
        const c = Math.cos(a);
        const s = Math.sin(a);
        const x = pivot.x + stylus.x * c + stylus.y * s;
        const z = pivot.z - stylus.x * s + stylus.y * c;
        armPlay = a;
        if (Math.hypot(x - PX, z - PZ) < goal) break;
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
  {
    const LW = W - 0.004;
    const LD = D - 0.01;
    const LH = 0.04;
    const t = 0.0025;
    const OPEN = THREE.MathUtils.degToRad(91);
    const hingeY = TOP + 0.012;
    const hingeZ = -D / 2 + 0.006;

    // Hinge blocks standing on the deck at the back.
    const fixed: THREE.BufferGeometry[] = [];
    for (const hx of [-0.11, 0.11]) {
      fixed.push(place(rbox(0.036, 0.02, 0.014, 0.003), [hx, TOP + 0.01, -D / 2 + 0.008]));
    }
    g.add(mesh(merge(fixed), darkPlastic));

    const lid = new THREE.Group();
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
      const corner = new THREE.CylinderGeometry(rr, rr, LH - t, 6, 1, true, Math.atan2(sx, sz) - Math.PI / 4, Math.PI / 2);
      parts.push(place(corner, [sx * (LW / 2 - rr), (LH - t) / 2, z0 + LD / 2 + sz * (LD / 2 - rr)]));
    }
    const plastic = new THREE.MeshPhysicalMaterial({
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
    });
    const shellMesh = mesh(merge(parts), plastic, false);
    shellMesh.receiveShadow = false;
    shellMesh.renderOrder = 5;
    lid.add(shellMesh);
    // Light catching the cut edges of the acrylic.
    const edgeBox = new THREE.EdgesGeometry(place(rbox(LW, LH, LD, rr, 2), [0, LH / 2, z0 + LD / 2]), 40);
    const edges = new THREE.LineSegments(edgeBox, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    edges.renderOrder = 6;
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
    lid.add(sheen);
    // Hinge leaves clamped on the lid's back wall, dropping into the blocks.
    const leaves: THREE.BufferGeometry[] = [];
    for (const hx of [-0.11, 0.11]) leaves.push(place(rbox(0.03, 0.03, 0.007, 0.002), [hx, 0.012, z0 + 0.001]));
    lid.add(mesh(merge(leaves), darkPlastic));
    g.add(lid);
  }

  return { group: g, spin, arm, armPlay, setLabel: (tex) => ((labelMat.map = tex), (labelMat.needsUpdate = true)) };
}
