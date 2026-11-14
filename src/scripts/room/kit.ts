// Shared building blocks for the listening room's models.
//
// Conventions every model follows, so the scene can place them blindly:
// - Units are metres, at real-world size.
// - Each build function returns a THREE.Group whose origin is the centre of
//   the object's footprint, on the surface it stands on (y = 0 is the floor
//   or desk top). +y is up, +z is the object's front.
// - Materials are MeshStandardMaterial / MeshPhysicalMaterial in sRGB;
//   textures are drawn on canvases here (no image files), except the record
//   covers, which come from the page.
// - Meshes cast and receive shadows unless they are tiny or emissive.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Palette, taken from the site's tokens where they exist.
export const C = {
  wall: 0xebe5da,
  ceiling: 0xf2eee7,
  board: 0x2e2a27,
  boardEdge: 0x3a3530,
  frame: 0xd8d0c2,
  glassDay: 0xfffaf0,
  glassNight: 0x1c1f26,
  signal: 0xe8693a,
  cream: 0xf6f3ec,
  chrome: 0xc9c9c9,
  black: 0x161514,
  red: 0xb3202b,
  rosewood: 0x3b2418,
};

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Fine wood grain on a base colour, running along x.
export function grainTexture(base: string, lines = 90) {
  return canvasTexture(512, 512, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    for (let k = 0; k < lines; k++) {
      g.strokeStyle = `rgba(120 80 40 / ${0.05 + ((k * 11) % 9) / 120})`;
      g.lineWidth = 1 + (k % 2);
      const y = (k * 47) % 512;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(170, y + 8, 340, y - 8, 512, y + 4);
      g.stroke();
    }
  });
}

export const std = (color: number, roughness = 0.8, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], shadows = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

export function box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], r = 0) {
  return mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d), mat);
}

export function cyl(rt: number, rb: number, h: number, mat: THREE.Material, seg = 32) {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
}

export { THREE, RoundedBoxGeometry };
