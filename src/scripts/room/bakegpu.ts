// DEV ONLY (used by src/pages/bake.astro, never by the site; the file name
// prefix "bakegpu" is how the build recognises and drops it): a GPU ambient
// occlusion baker. Rays are traced in a fragment shader against a BVH of the
// room's solid meshes (three-mesh-bvh), cosine-weighted around each sample's
// normal, accumulated over many passes.

import * as THREE from 'three';
import { MeshBVH, MeshBVHUniformStruct, BVHShaderGLSL } from 'three-mesh-bvh';

export interface RayScene {
  struct: MeshBVHUniformStruct;
  triangles: number;
}

/** One BVH over the given meshes' world-space triangles. */
export function buildRayScene(meshes: THREE.Mesh[]): RayScene {
  const positions: number[] = [];
  const indices: number[] = [];
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  let base = 0;
  for (const mesh of meshes) {
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position;
    const idx = geo.index;
    const inst = mesh as THREE.InstancedMesh;
    const count = inst.isInstancedMesh ? inst.count : 1;
    for (let k = 0; k < count; k++) {
      m.copy(mesh.matrixWorld);
      if (inst.isInstancedMesh) {
        const local = new THREE.Matrix4();
        inst.getMatrixAt(k, local);
        m.multiply(local);
      }
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        positions.push(v.x, v.y, v.z);
      }
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i++) indices.push(base + (idx ? idx.getX(i) : i));
      base += pos.count;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  const bvh = new MeshBVH(geometry);
  const struct = new MeshBVHUniformStruct();
  struct.updateFrom(bvh);
  return { struct, triangles: indices.length / 3 };
}

const VERT = /* glsl */ `
void main() {
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;

${BVHShaderGLSL.common_functions}
${BVHShaderGLSL.bvh_struct_definitions}
${BVHShaderGLSL.bvh_ray_functions}

layout( location = 0 ) out highp vec4 bakeOut;
uniform BVH bvh;
uniform sampler2D uPos;   // xyz position, w = 1 when the texel is used
uniform sampler2D uNrm;   // xyz normal
uniform sampler2D uAcc;   // running sum of occlusion
uniform int uRays;
uniform uint uPass;
uniform float uMaxDist;
uniform float uBias;

uint pcg( uint v ) {
  uint state = v * 747796405u + 2891336777u;
  uint word = ( ( state >> ( ( state >> 28u ) + 4u ) ) ^ state ) * 277803737u;
  return ( word >> 22u ) ^ word;
}
float rnd( inout uint s ) {
  s = pcg( s );
  return float( s ) * ( 1.0 / 4294967296.0 );
}

void main() {
  ivec2 p = ivec2( gl_FragCoord.xy );
  vec4 P = texelFetch( uPos, p, 0 );
  float acc = texelFetch( uAcc, p, 0 ).r;
  if ( P.w < 0.5 ) {
    bakeOut = vec4( acc, 0.0, 0.0, 1.0 );
    return;
  }
  vec3 N = normalize( texelFetch( uNrm, p, 0 ).xyz );
  vec3 T = normalize( abs( N.y ) < 0.99 ? cross( N, vec3( 0.0, 1.0, 0.0 ) ) : cross( N, vec3( 1.0, 0.0, 0.0 ) ) );
  vec3 B = cross( N, T );

  uint seed = pcg( uint( p.x ) + pcg( uint( p.y ) + pcg( uPass + 17u ) ) );
  float sum = 0.0;
  for ( int i = 0; i < uRays; i ++ ) {
    float r1 = rnd( seed );
    float r2 = rnd( seed );
    float r = sqrt( r1 );
    float phi = 6.2831853 * r2;
    vec3 d = normalize( T * ( r * cos( phi ) ) + B * ( r * sin( phi ) ) + N * sqrt( max( 0.0, 1.0 - r1 ) ) );

    uvec4 faceIndices;
    vec3 faceNormal;
    vec3 barycoord;
    float side;
    float dist;
    if ( bvhIntersectFirstHit( bvh, P.xyz + N * uBias, d, faceIndices, faceNormal, barycoord, side, dist ) && dist > 0.0 && dist < uMaxDist ) {
      sum += 1.0 - dist / uMaxDist;
    }
  }
  bakeOut = vec4( acc + sum, 0.0, 0.0, 1.0 );
}
`;

export interface BakeParams {
  /** Rays per texel in total. */
  spp: number;
  /** Occluders further than this (m) do not count. */
  maxDist: number;
  /** Ray origin offset along the normal (m). */
  bias: number;
  /** Rays per draw call; lower keeps the GPU responsive. */
  raysPerPass?: number;
}

/**
 * Mean occlusion (0..1) for w*h samples. `pos` (xyz + used flag) and `nrm`
 * (xyz) are RGBA float arrays of w*h texels.
 */
export async function bakeSamples(
  renderer: THREE.WebGLRenderer,
  scene: RayScene,
  w: number,
  h: number,
  pos: Float32Array,
  nrm: Float32Array,
  params: BakeParams,
  onProgress?: (done: number) => void,
): Promise<Float32Array> {
  const mkData = (a: Float32Array) => {
    const t = new THREE.DataTexture(a, w, h, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  };
  const posTex = mkData(pos);
  const nrmTex = mkData(nrm);
  const mkTarget = () =>
    new THREE.WebGLRenderTarget(w, h, {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
    });
  const targets = [mkTarget(), mkTarget()];
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      bvh: { value: scene.struct },
      uPos: { value: posTex },
      uNrm: { value: nrmTex },
      uAcc: { value: targets[0].texture },
      uRays: { value: 1 },
      uPass: { value: 0 },
      uMaxDist: { value: params.maxDist },
      uBias: { value: params.bias },
    },
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const scn = new THREE.Scene();
  scn.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const gl = renderer.getContext();

  // Start from zero.
  renderer.setRenderTarget(targets[0]);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.setRenderTarget(targets[1]);
  renderer.clear();

  const per = Math.max(1, Math.min(params.raysPerPass ?? 4, params.spp));
  const passes = Math.ceil(params.spp / per);
  let cur = 0;
  for (let pass = 0; pass < passes; pass++) {
    material.uniforms.uAcc.value = targets[cur].texture;
    material.uniforms.uPass.value = pass;
    material.uniforms.uRays.value = per;
    renderer.setRenderTarget(targets[1 - cur]);
    renderer.render(scn, cam);
    cur = 1 - cur;
    gl.finish();
    onProgress?.((pass + 1) / passes);
    // Let the page breathe (and the GPU watchdog stay quiet).
    await new Promise((r) => setTimeout(r, 0));
  }

  const out = new Float32Array(w * h * 4);
  renderer.readRenderTargetPixels(targets[cur], 0, 0, w, h, out);
  renderer.setRenderTarget(null);

  const total = passes * per;
  const occ = new Float32Array(w * h);
  for (let i = 0; i < occ.length; i++) occ[i] = out[i * 4] / total;

  posTex.dispose();
  nrmTex.dispose();
  targets.forEach((t) => t.dispose());
  material.dispose();
  quad.geometry.dispose();
  return occ;
}

// ------------------------------------------------------------------ Driver

import {
  PATCH_PAD,
  WHITE_BLOCK,
  BAKE_VERSION,
  type Collected,
  type BakeManifest,
  type PatchRect,
} from './lightbake-common';

export interface RunOptions {
  spp: number;
  /** Atlas texels per metre. */
  density: number;
  maxDist: number;
  /** Multiplies occlusion before it is stored. */
  strength: number;
  /** AO never goes below this (1 = none, 0 = black). */
  minAo: number;
  bias: number;
  progress: (label: string, fraction: number) => void;
  log?: (line: string) => void;
}

export interface BakeResult {
  manifest: BakeManifest;
  /** Greyscale, w*h bytes, row 0 at the top. */
  atlas: Uint8Array;
  vertex: Uint8Array;
}

const ATLAS_W = 2048;

function stats(a: Float32Array) {
  let max = 0;
  let sum = 0;
  for (const v of a) {
    max = Math.max(max, v);
    sum += v;
  }
  return `occlusion mean ${(sum / a.length).toFixed(4)}, max ${max.toFixed(3)}`;
}

function layoutPatches(collected: Collected, density: number) {
  const items = collected.patches.map((p) => ({
    p,
    w: Math.min(ATLAS_W - WHITE_BLOCK, Math.max(8, Math.ceil((p.a1 - p.a0) * density) + 2 * PATCH_PAD)),
    h: Math.min(1024, Math.max(8, Math.ceil((p.b1 - p.b0) * density) + 2 * PATCH_PAD)),
  }));
  items.sort((a, b) => b.h - a.h);
  const rects: PatchRect[] = [];
  let x = WHITE_BLOCK;
  let y = 0;
  let shelf = WHITE_BLOCK;
  for (const it of items) {
    if (x + it.w > ATLAS_W) {
      y += shelf;
      x = 0;
      shelf = 0;
    }
    rects.push({ key: it.p.key, x, y, w: it.w, h: it.h });
    x += it.w;
    shelf = Math.max(shelf, it.h);
  }
  const h = Math.max(8, Math.ceil((y + shelf) / 4) * 4);
  return { rects, w: ATLAS_W, h };
}

export async function runBake(renderer: THREE.WebGLRenderer, collected: Collected, o: RunOptions): Promise<BakeResult> {
  const occluders = collected.meshes.filter((m) => m.occluder).map((m) => m.mesh);
  o.progress('Building BVH', 0);
  await new Promise((r) => setTimeout(r, 20));
  const rayScene = buildRayScene(occluders);
  const params: BakeParams = { spp: o.spp, maxDist: o.maxDist, bias: o.bias };

  // ---- Atlas of flat faces.
  const lay = layoutPatches(collected, o.density);
  const AW = lay.w;
  const AH = lay.h;
  const apos = new Float32Array(AW * AH * 4);
  const anrm = new Float32Array(AW * AH * 4);
  const patchOf = new Int32Array(AW * AH).fill(-1);
  collected.patches.forEach((p, pi) => {
    const r = lay.rects.find((q) => q.key === p.key)!;
    for (let py = r.y; py < r.y + r.h; py++) {
      for (let px = r.x; px < r.x + r.w; px++) {
        const s = Math.min(1, Math.max(0, (px + 0.5 - r.x - PATCH_PAD) / (r.w - 2 * PATCH_PAD)));
        const t = Math.min(1, Math.max(0, 1 - (py + 0.5 - r.y - PATCH_PAD) / (r.h - 2 * PATCH_PAD)));
        const i = (py * AW + px) * 4;
        // Atlas rows run top-down but GL rows bottom-up: store flipped.
        const gi = ((AH - 1 - py) * AW + px) * 4;
        const q = [0, 0, 0];
        q[p.ua] = p.a0 + s * (p.a1 - p.a0);
        q[p.ub] = p.b0 + t * (p.b1 - p.b0);
        q[p.axis] = p.plane;
        apos.set([q[0], q[1], q[2], 1], gi);
        const nn = [0, 0, 0];
        nn[p.axis] = p.sign;
        anrm.set([nn[0], nn[1], nn[2], 0], gi);
        patchOf[py * AW + px] = pi;
        void i;
      }
    }
  });
  const atlasOcc = await bakeSamples(renderer, rayScene, AW, AH, apos, anrm, params, (f) => o.progress('Flat surfaces', f));
  o.log?.(`Flat surfaces: ${stats(atlasOcc)}`);
  const atlas = new Uint8Array(AW * AH).fill(255);
  for (let py = 0; py < AH; py++) {
    for (let px = 0; px < AW; px++) {
      if (patchOf[py * AW + px] < 0) continue;
      const occ = atlasOcc[(AH - 1 - py) * AW + px];
      atlas[py * AW + px] = Math.round(255 * Math.min(1, Math.max(o.minAo, 1 - occ * o.strength)));
    }
  }

  // ---- Per-vertex occlusion for everything else.
  const onPatch = new Map<number, Set<number>>();
  for (const p of collected.patches) {
    let s = onPatch.get(p.info.index);
    if (!s) onPatch.set(p.info.index, (s = new Set()));
    p.verts.forEach((v) => s!.add(v));
  }
  const recv = collected.meshes.filter((m) => m.receiver);
  let total = 0;
  for (const m of recv) total += m.wpos!.length / 3;
  const VW = 2048;
  const VH = Math.max(1, Math.ceil(total / VW));
  const vpos = new Float32Array(VW * VH * 4);
  const vnrm = new Float32Array(VW * VH * 4);
  let at = 0;
  const starts: number[] = [];
  for (const m of recv) {
    starts.push(at);
    const skip = onPatch.get(m.index);
    const n = m.wpos!.length / 3;
    for (let i = 0; i < n; i++, at++) {
      vpos.set([m.wpos![i * 3], m.wpos![i * 3 + 1], m.wpos![i * 3 + 2], skip?.has(i) ? 0 : 1], at * 4);
      vnrm.set([m.wnrm![i * 3], m.wnrm![i * 3 + 1], m.wnrm![i * 3 + 2], 0], at * 4);
    }
  }
  const vocc = await bakeSamples(renderer, rayScene, VW, VH, vpos, vnrm, params, (f) => o.progress('Vertices', f));
  o.log?.(`Vertices: ${stats(vocc)}`);
  const maxOcc = 1 - o.minAo;
  const chunks: Uint8Array[] = [];
  const meshes: BakeManifest['meshes'] = [];
  let offset = 0;
  recv.forEach((m, k) => {
    const n = m.wpos!.length / 3;
    const bytes = new Uint8Array(n);
    let max = 0;
    for (let i = 0; i < n; i++) {
      // The GL rows are bottom-up but this data texture was filled linearly,
      // and read back the same way, so the index is direct.
      const occ = Math.min(maxOcc, vocc[starts[k] + i] * o.strength);
      bytes[i] = Math.round(occ * 255);
      max = Math.max(max, bytes[i]);
    }
    if (max < 4) return;
    meshes.push({ index: m.index, fp: m.fp, offset, count: n });
    chunks.push(bytes);
    offset += n;
  });
  const vertex = new Uint8Array(offset);
  let w = 0;
  for (const c of chunks) {
    vertex.set(c, w);
    w += c.length;
  }

  const manifest: BakeManifest = {
    version: BAKE_VERSION,
    sceneFp: collected.sceneFp,
    params: { spp: o.spp, density: o.density, maxDist: o.maxDist, strength: o.strength, minAo: o.minAo, bias: o.bias, triangles: rayScene.triangles },
    atlas: { file: 'ao-atlas.webp', w: AW, h: AH },
    vertex: { file: 'ao-vertex.bin' },
    patches: lay.rects,
    meshes,
  };
  return { manifest, atlas, vertex };
}
