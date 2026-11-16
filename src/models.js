// ===== Low-poly models, materials and procedural textures =====
import * as THREE from 'three';
import { GPU, tintMatGPU, tintStdMatGPU } from './gpu.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const lin = (c) => Math.pow(Math.max(0, c), 2.2);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
export function M(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}
let _seed = 1234;
const rnd = () => ((_seed = (_seed * 16807) % 2147483647) / 2147483647);

// Geometry builder: position + color + aTint (1 = takes instance colour) + aSway (1 = moves with wind)
export class GB {
  constructor() { this.p = []; this.c = []; this.t = []; this.w = []; this.r = []; this.m = []; this.u = []; this.uvs = [1, 1]; }
  add(geo, color, tint, mat, sway = tint, jitter = tint ? 0.14 : 0.04, rough = 0.85, metal = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (mat) g.applyMatrix4(mat);
    const pa = g.attributes.position, ua = g.attributes.uv;
    for (let k = 0; k < pa.count; k++) this.u.push(ua ? ua.getX(k) * this.uvs[0] : 0, ua ? ua.getY(k) * this.uvs[1] : 0);
    for (let i = 0; i < pa.count; i += 3) {
      const j = 1 + (rnd() - 0.5) * jitter * 2;
      const r = lin(color[0] * j), gg = lin(color[1] * j), b = lin(color[2] * j);
      for (let k = i; k < i + 3 && k < pa.count; k++) {
        this.p.push(pa.getX(k), pa.getY(k), pa.getZ(k));
        this.c.push(r, gg, b); this.t.push(tint); this.w.push(sway); this.r.push(rough); this.m.push(metal);
      }
    }
    return this;
  }
  addGB(o, mat) { // merge another builder, transformed
    const v = new THREE.Vector3();
    for (let i = 0; i < o.p.length; i += 3) { v.set(o.p[i], o.p[i + 1], o.p[i + 2]).applyMatrix4(mat); this.p.push(v.x, v.y, v.z); }
    this.c.push(...o.c); this.t.push(...o.t); this.w.push(...o.w); this.r.push(...o.r); this.m.push(...o.m); this.u.push(...o.u);
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.t, 1));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.w, 1));
    if (this.u.length === this.p.length / 3 * 2) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('aRough', new THREE.Float32BufferAttribute(this.r, 1));
    g.setAttribute('aMetal', new THREE.Float32BufferAttribute(this.m, 1));
    g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  }
  // smooth shading on curved surfaces, hard edges on sharp corners
  buildSmooth(angle = 0.6) {
    const g = toCreasedNormals(this.build(), angle);
    g.computeBoundingSphere();
    return g;
  }
}

// PBR version of the tint material (per-vertex roughness / metalness), used for vehicles
export function makeTintStdMat() {
  if (GPU) return tintStdMatGPU();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aTint;\nattribute float aRough;\nattribute float aMetal;\nvarying float vRough;\nvarying float vMetal;\n' + sh.vertexShader
      .replace('#include <color_vertex>', THREE.ShaderChunk.color_vertex.replace('vColor.xyz *= instanceColor.xyz;', 'vColor.xyz = mix(vColor.xyz, vColor.xyz * instanceColor.xyz, aTint);') + '\nvRough = aRough; vMetal = aMetal;');
    sh.fragmentShader = 'varying float vRough;\nvarying float vMetal;\n' + sh.fragmentShader
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * vRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * vMetal;');
  };
  m.customProgramCacheKey = () => 'tintstd';
  return m;
}

// Shared wind clock for all swaying materials
export const wind = { uTime: { value: 0 }, uStrength: { value: 1 } };

// Lambert material: aTint vertices multiplied by instanceColor, aSway vertices move in the wind
// turn a single billboard card around Y so it always faces the camera (in the shadow pass: faces the light)
export const FACE_CAMERA = `
  #ifdef USE_INSTANCING
  {
    vec3 wp = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
    vec3 tc = cameraPosition - wp;
    float th = atan(tc.x, tc.z) - atan(instanceMatrix[2].x, instanceMatrix[2].z);
    float c = cos(th), s = sin(th);
    transformed.xz = vec2(transformed.x * c + transformed.z * s, -transformed.x * s + transformed.z * c);
  }
  #endif`;
export function makeTintMat({ swayBase = 1.2, swayAmp = 0.022, flat = true, side = THREE.FrontSide, texScale = 4, face = false } = {}) {
  if (GPU) return tintMatGPU({ swayBase, swayAmp, flat, side, texScale });
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: flat, side });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind.uTime; sh.uniforms.uStrength = wind.uStrength;
    sh.vertexShader = 'attribute float aTint;\nattribute float aSway;\nuniform float uTime;\nuniform float uStrength;\nvarying vec3 vObj;\n' + sh.vertexShader
      .replace('#include <color_vertex>', THREE.ShaderChunk.color_vertex.replace('vColor.xyz *= instanceColor.xyz;', 'vColor.xyz = mix(vColor.xyz, vColor.xyz * instanceColor.xyz, aTint);'))
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      ${face ? FACE_CAMERA : ''}
      vObj = position;
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float ph = uTime * 1.7 + ip.x * 0.11 + ip.z * 0.13;
        float k = aSway * max(position.y - ${swayBase.toFixed(2)}, 0.0) * ${swayAmp.toFixed(4)} * uStrength;
        transformed.x += (sin(ph) + 0.4 * sin(ph * 2.7)) * k;
        transformed.z += cos(ph * 0.83) * k * 0.7;
      #endif`);
  };
  // cards (grass blades, photo trees) have up-facing normals; don't flip them on back faces or they go black
  if (side === THREE.DoubleSide && !flat) { const p0 = m.onBeforeCompile; m.onBeforeCompile = (sh) => { p0(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize( vNormal );'); }; }
  const prev = m.onBeforeCompile;
  if (texScale > 0) m.onBeforeCompile = (sh) => {
    prev(sh);
    sh.fragmentShader = `varying vec3 vObj;
      float th3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float tn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(th3(i), th3(i + vec3(1,0,0)), f.x), mix(th3(i + vec3(0,1,0)), th3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(th3(i + vec3(0,0,1)), th3(i + vec3(1,0,1)), f.x), mix(th3(i + vec3(0,1,1)), th3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      ` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float tex = tn3(vObj * ${texScale.toFixed(2)}) * 0.55 + tn3(vObj * ${(texScale * 3.1).toFixed(2)}) * 0.3 + tn3(vObj * ${(texScale * 9.3).toFixed(2)}) * 0.15;
        diffuseColor.rgb *= 0.8 + 0.42 * tex;`);
  };
  m.customProgramCacheKey = () => `tint-${swayBase}-${swayAmp}-${flat}-${side}-${texScale}-${face}`;
  return m;
}

const W = [1, 1, 1];
const TRUNK = [0.38, 0.26, 0.16];
const Cyl = (a, b, h, n = 6) => new THREE.CylinderGeometry(a, b, h, n);
const Cone = (r, h, n = 8) => new THREE.ConeGeometry(r, h, n);
const Ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const Box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
function lumpy(geo, amt) { // randomly displace vertices for organic shapes
  const g = geo.index ? geo.toNonIndexed() : geo; const p = g.attributes.position;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let d = map.get(key); if (!d) { d = 1 + (rnd() - 0.5) * amt * 2; map.set(key, d); }
    p.setXYZ(i, p.getX(i) * d, p.getY(i) * d, p.getZ(i) * d);
  }
  return g;
}


// hip roof: rectangle 2a x 2b at y=0, ridge along x at height h (planar UVs in metres)
function hipRoof(a, b, h) {
  const c = Math.max(0, a - b), P = [];
  const q = (p1, p2, p3) => P.push(...p1, ...p2, ...p3);
  const A = [-a, 0, b], B = [a, 0, b], C = [a, 0, -b], D = [-a, 0, -b], R1 = [-c, h, 0], R2 = [c, h, 0];
  q(A, B, R2); q(A, R2, R1); q(C, D, R1); q(C, R1, R2); q(B, C, R2); q(D, A, R1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const uv = []; for (let i = 0; i < P.length; i += 3) { const y = P[i + 1], z = P[i + 2]; uv.push(P[i], Math.hypot(z, y) * Math.sign(z || 1)); }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
// Buildings split into texture groups so generated wall / roof textures can be applied
export function buildBuildingParts() {
  const P = {};
  const T = (tex, f) => { const b = new GB(); f(b); return { tex, geo: b.build() }; };
  const wood = [0.42, 0.28, 0.17];
  // Thai-style raised wooden house: stilts, gable roof with deep eaves, front veranda with railing, side stairs
  P.house = (() => {
    const FL = 2.1, RW = 6.2, RD = 4.6, WH = 2.5, top = FL + 0.08 + WH, pitch = 0.62, run = 3.0, rise = Math.tan(pitch) * run;
    const timber = [0.95, 0.9, 0.85], dark = [0.16, 0.11, 0.07];
    return [
      T('wood_wall', (b) => {
        b.uvs = [0.25, 1.2];
        for (const x of [-3, -1, 1, 3]) for (const z of [-2.2, 0, 2.2, 3.7]) b.add(Box(0.24, FL, 0.24), timber, 0, M(x, FL / 2, z), 0);
        for (const x of [-3.1, 3.1]) b.add(Box(0.18, WH + 0.4, 0.18), timber, 0, M(x, FL + (WH + 0.4) / 2, 3.7), 0); // veranda roof posts
        b.uvs = [3, 3]; b.add(Box(6.8, 0.16, 6.3), [0.85, 0.78, 0.7], 0, M(0, FL, 0.75), 0);
        b.uvs = [2.6, 1.0]; b.add(Box(RW, WH, RD), timber, 0, M(0, FL + 0.08 + WH / 2, 0), 0, 0.02);
        // gable ends
        const g = new THREE.Shape(); g.moveTo(-RD / 2, 0); g.lineTo(RD / 2, 0); g.lineTo(0, rise * RD / 2 / run); g.closePath();
        b.uvs = [0.4, 0.45];
        for (const sx of [-1, 1]) { const tg = new THREE.ShapeGeometry(g); tg.rotateY(Math.PI / 2); b.add(tg, timber, 0, M(sx * RW / 2, top, 0, 0, sx > 0 ? 0 : Math.PI, 0), 0); }
        // veranda railing
        b.uvs = [2, 0.1];
        b.add(Box(5.2, 0.08, 0.08), timber, 0, M(-0.6, FL + 0.95, 3.82), 0); b.add(Box(5.2, 0.06, 0.06), timber, 0, M(-0.6, FL + 0.5, 3.82), 0);
        for (const sx of [-1, 1]) if (sx < 0) { b.add(Box(0.08, 0.08, 1.5), timber, 0, M(-3.32, FL + 0.95, 3.05), 0); }
        b.uvs = [0.1, 0.4];
        for (let x = -3.15; x <= 1.9; x += 0.42) b.add(Box(0.05, 0.9, 0.05), timber, 0, M(x, FL + 0.5, 3.82), 0);
      }),
      T('roof_tiles', (b) => {
        const slope = run / Math.cos(pitch) + 0.15;
        b.uvs = [6, 3];
        for (const sz of [-1, 1]) b.add(Box(RW + 1.4, 0.1, slope), W, 0.55, M(0, top + rise / 2 + 0.05, sz * run / 2, sz * pitch, 0, 0), 0, 0.03);
        b.uvs = [6, 0.3]; b.add(Box(RW + 1.5, 0.16, 0.3), W, 0.4, M(0, top + rise + 0.07, 0), 0, 0.03);
        // lean-to over the veranda
        const lp = 0.3, ll = 2.1;
        b.uvs = [6, 1.8]; b.add(Box(RW + 1.2, 0.08, ll), W, 0.55, M(0, top - 0.25 - Math.sin(lp) * ll / 2 + 0.1, 2.6 + Math.cos(lp) * ll / 2, lp, 0, 0), 0, 0.03);
      }),
      T(null, (b) => {
        const zf = RD / 2 + 0.03;
        b.add(Box(1.0, 1.95, 0.05), [0.3, 0.19, 0.1], 0, M(0.7, FL + 0.08 + 0.98, zf), 0);                      // door
        for (const x of [-2.0, 2.2]) {                                                                         // front windows + open shutters
          b.add(Box(0.9, 0.9, 0.04), [0.08, 0.07, 0.06], 0, M(x, FL + 1.5, zf), 0);
          for (const s of [-1, 1]) b.add(Box(0.45, 0.92, 0.04), [0.36, 0.22, 0.12], 0, M(x + s * 0.7, FL + 1.5, zf + 0.02), 0);
        }
        for (const sx of [-1, 1]) { b.add(Box(0.04, 0.9, 1.0), [0.08, 0.07, 0.06], 0, M(sx * (RW / 2 + 0.02), FL + 1.5, -0.6), 0); }
        for (const z of [-RD / 2, RD / 2]) b.add(Box(RW + 0.1, 0.1, 0.06), dark, 0, M(0, FL + 0.1, z), 0);    // sill beams
        // stairs down from the veranda on the right
        for (let k = 0; k < 8; k++) b.add(Box(1.0, 0.06, 0.32), [0.45, 0.32, 0.2], 0, M(2.65, FL - 0.25 - k * 0.24, 4.05 + k * 0.27), 0);
        for (const sx of [-1, 1]) { const len = 2.9; b.add(Box(0.06, 0.2, len), [0.38, 0.26, 0.16], 0, M(2.65 + sx * 0.52, FL / 2 + 0.1, 4.9, 0.72, 0, 0), 0); }
        // big glazed water jar by the stairs
        b.add(new THREE.SphereGeometry(0.42, 14, 10), [0.32, 0.17, 0.08], 0, M(1.6, 0.42, 4.6, 0, 0, 0, 1, 1.15, 1), 0, 0.02, 0.35, 0.1);
        b.add(Cyl(0.24, 0.27, 0.12, 14), [0.28, 0.15, 0.07], 0, M(1.6, 0.92, 4.6), 0);
      }),
    ];
  })();

  // ground-level Thai house in concrete: hip tile roof, front porch, fence with a gate, water tank, AC unit
  P.house2 = (() => {
    const wallW = 8.6, wallD = 7.0, wallH = 3.0, base = 0.25, top = base + wallH;
    const concrete = [0.72, 0.71, 0.68], frame = [0.92, 0.92, 0.9];
    return [
      T('stucco', (b) => {
        b.uvs = [3, 1.2]; b.add(Box(wallW, wallH, wallD), W, 1, M(0, base + wallH / 2, 0), 0, 0.03);              // walls take the instance colour
        b.uvs = [3, 3]; b.add(Box(wallW + 0.8, base, wallD + 1.4), concrete, 0, M(0, base / 2, 0.3), 0);
        b.uvs = [0.3, 1]; for (const x of [-1.6, 1.6]) b.add(Box(0.3, wallH, 0.3), W, 1, M(x, base + wallH / 2, wallD / 2 + 1.3), 0, 0.03); // porch columns
        b.uvs = [1.5, 0.6]; b.add(Box(4.2, 0.18, 1.8), frame, 0, M(0, top - 0.05, wallD / 2 + 0.9), 0);           // porch slab
        // front fence with a gate gap
        b.uvs = [3, 0.4];
        for (const [x, w] of [[-3.25, 3.1], [3.25, 3.1]]) b.add(Box(w, 0.9, 0.18), W, 1, M(x, 0.45, wallD / 2 + 3.6), 0, 0.03);
        for (const sx of [-1, 1]) b.add(Box(0.18, 0.9, 3.6), W, 1, M(sx * 4.8, 0.45, wallD / 2 + 1.8), 0, 0.03);
        b.uvs = [0.4, 0.4]; for (const x of [-1.7, 1.7, -4.8, 4.8]) b.add(Box(0.32, 1.5, 0.32), W, 1, M(x, 0.75, wallD / 2 + 3.6), 0, 0.03);
      }),
      T('roof_tiles', (b) => {
        b.uvs = [1.1, 1.1]; b.add(hipRoof(wallW / 2 + 0.7, wallD / 2 + 0.7, 2.1), [0.62, 0.3, 0.2], 0, M(0, top, 0), 0, 0.03);
        b.add(hipRoof(2.3, 1.1, 0.55), [0.62, 0.3, 0.2], 0, M(0, top + 0.1, wallD / 2 + 0.95), 0, 0.03);
      }),
      T(null, (b) => {
        const zf = wallD / 2 + 0.03;
        b.add(Box(1.6, 2.2, 0.05), [0.42, 0.27, 0.15], 0, M(0, base + 1.1, zf), 0);                             // double door
        b.add(Box(0.02, 2.2, 0.06), [0.2, 0.13, 0.08], 0, M(0, base + 1.1, zf + 0.01), 0);
        for (const x of [-2.9, 2.9]) {                                                                            // windows with frames + grilles
          b.add(Box(1.6, 1.3, 0.05), [0.12, 0.16, 0.2], 0, M(x, base + 1.7, zf), 0, 0, 0.1, 0.3);
          b.add(Box(1.7, 0.08, 0.08), frame, 0, M(x, base + 2.38, zf + 0.02), 0); b.add(Box(1.7, 0.08, 0.08), frame, 0, M(x, base + 1.02, zf + 0.02), 0);
          for (let k = -2; k <= 2; k++) b.add(Box(0.03, 1.3, 0.03), [0.85, 0.85, 0.85], 0, M(x + k * 0.36, base + 1.7, zf + 0.05), 0, 0, 0.4, 0.8);
        }
        for (const sx of [-1, 1]) b.add(Box(0.05, 1.2, 1.4), [0.12, 0.16, 0.2], 0, M(sx * (wallW / 2 + 0.02), base + 1.7, -1), 0, 0, 0.1, 0.3);
        b.add(Box(0.9, 0.6, 0.3), [0.9, 0.9, 0.88], 0, M(wallW / 2 + 0.2, base + 2.2, -2.2), 0);                    // AC compressor
        b.add(Cyl(0.55, 0.55, 1.3, 16), [0.2, 0.4, 0.75], 0, M(-wallW / 2 - 0.9, 1.6 + 0.65, -2.4), 0, 0, 0.5, 0.2); // water tank on a stand
        for (const [dx, dz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) b.add(Box(0.08, 1.6, 0.08), [0.3, 0.3, 0.32], 0, M(-wallW / 2 - 0.9 + dx, 0.8, -2.4 + dz), 0);
        // steel gate (left half open)
        for (let k = 0; k < 7; k++) b.add(Box(0.03, 1.2, 0.03), [0.2, 0.2, 0.22], 0, M(-1.5 + k * 0.25, 0.65, wallD / 2 + 3.6), 0, 0, 0.4, 0.8);
        b.add(Box(1.6, 0.05, 0.05), [0.2, 0.2, 0.22], 0, M(-0.75, 1.22, wallD / 2 + 3.6), 0, 0, 0.4, 0.8);
      }),
    ];
  })();
  // row of four 3-storey shophouses: roller shutters, shop signs, awning, balconies, flat roof with parapet
  P.shophouse = (() => {
    const U = 4.2, N = 4, Wt = U * N, D = 12, FH = 3.2, H = FH * 3, zf = D / 2;
    const band = [0.75, 0.74, 0.72], signs = [[0.8, 0.12, 0.1], [0.12, 0.3, 0.7], [0.95, 0.75, 0.1], [0.1, 0.55, 0.3]];
    return [
      T('stucco', (b) => {
        b.uvs = [5, 3]; b.add(Box(Wt, H, D), W, 1, M(0, H / 2, 0), 0, 0.03);
        b.uvs = [5, 0.1]; for (const y of [FH, FH * 2]) b.add(Box(Wt + 0.1, 0.25, D + 0.1), band, 0, M(0, y, 0), 0);
        b.uvs = [5, 0.2]; b.add(Box(Wt + 0.1, 0.7, 0.25), W, 1, M(0, H + 0.35, zf - 0.1), 0, 0.03);              // parapet
        b.uvs = [0.2, 3]; for (let k = 0; k <= N; k++) b.add(Box(0.3, H, 0.25), band, 0, M(-Wt / 2 + k * U, H / 2, zf + 0.05), 0); // party walls / pilasters
        b.uvs = [1.5, 0.4]; for (let k = 0; k < N; k++) b.add(Box(U - 0.4, 0.15, 1.0), band, 0, M(-Wt / 2 + (k + 0.5) * U, FH + 0.05, zf + 0.5), 0); // balconies
      }),
      T('roof_metal', (b) => {
        b.uvs = [3, 0.6];
        for (let k = 0; k < N; k++) {
          const x = -Wt / 2 + (k + 0.5) * U;
          if (k !== 1) b.add(Box(U - 0.5, FH - 0.5, 0.06), [0.72, 0.74, 0.76], 0, M(x, (FH - 0.5) / 2 + 0.05, zf + 0.02), 0, 0, 0.5, 0.6); // shutters (one shop open)
        }
        b.add(Box(Wt, 0.06, 1.6), [0.55, 0.6, 0.62], 0, M(0, FH - 0.35, zf + 0.75, 0.22, 0, 0), 0, 0, 0.5, 0.5); // awning
      }),
      T(null, (b) => {
        for (let k = 0; k < N; k++) {
          const x = -Wt / 2 + (k + 0.5) * U;
          if (k === 1) { b.add(Box(U - 0.5, FH - 0.5, 0.06), [0.06, 0.05, 0.05], 0, M(x, (FH - 0.5) / 2 + 0.05, zf - 0.3), 0); // open shop: dark inside + counter
            b.add(Box(1.6, 0.9, 0.6), [0.55, 0.45, 0.35], 0, M(x, 0.45, zf + 0.2), 0); }
          b.add(Box(U - 0.6, 0.55, 0.12), signs[k], 0, M(x, FH - 0.05 + 0.32, zf + 1.08), 0, 0, 0.6, 0);           // shop sign
          b.add(Box(U - 0.9, 0.18, 0.13), [0.95, 0.95, 0.92], 0, M(x, FH + 0.27, zf + 1.09), 0);
          for (const fy of [FH * 1.5, FH * 2.5]) for (const s of [-1, 1]) {                                        // upper windows
            b.add(Box(1.1, 1.4, 0.05), [0.12, 0.15, 0.2], 0, M(x + s * 0.95, fy + 0.15, zf + 0.03), 0, 0, 0.1, 0.3);
            b.add(Box(1.2, 0.07, 0.08), [0.85, 0.85, 0.82], 0, M(x + s * 0.95, fy - 0.58, zf + 0.06), 0);
          }
          b.add(Box(U - 0.4, 0.9, 0.04), [0.25, 0.25, 0.27], 0, M(x, FH + 0.6, zf + 1.0), 0, 0, 0.4, 0.7);       // balcony grille
          b.add(Box(0.8, 0.5, 0.3), [0.9, 0.9, 0.88], 0, M(x + 1.2, FH * 2 + 0.6, zf + 0.25), 0);                  // AC unit
        }
        b.add(Box(Wt, 0.16, 2.2), [0.6, 0.6, 0.58], 0, M(0, 0.08, zf + 1.1), 0);                                     // sidewalk apron
      }),
    ];
  })();
  P.cabin = [
    T('log_wall', (b) => { b.uvs = [2.2, 1.2]; b.add(Box(5, 2.6, 4), W, 0, M(0, 1.3, 0), 0, 0.02); }),
    T('roof_metal', (b) => {
      b.uvs = [2.5, 1.4]; const roofL = new THREE.BoxGeometry(5.6, 0.18, 2.8);
      b.add(roofL, W, 1, M(0, 3.25, 1.1, 0.6), 0, 0.03); b.add(roofL.clone(), W, 1, M(0, 3.25, -1.1, -0.6), 0, 0.03);
    }),
    T(null, (b) => {
      b.add(Box(0.8, 0.8, 0.05), [0.95, 0.75, 0.4], 0, M(-1.2, 1.5, 2.02), 0, 0.02);
      b.add(Box(0.9, 1.7, 0.05), [0.28, 0.18, 0.1], 0, M(1.0, 0.85, 2.02), 0);
      b.add(Box(0.5, 1.2, 0.5), [0.45, 0.42, 0.4], 0, M(1.6, 3.9, -0.6), 0);
    }),
  ];
  P.chedi = [
    T('stucco', (b) => {
      b.uvs = [3, 0.6]; b.add(Box(6, 0.8, 6), W, 0, M(0, 0.4, 0), 0);
      b.uvs = [2.4, 0.6]; b.add(Box(4.6, 0.8, 4.6), W, 0, M(0, 1.2, 0), 0);
      b.uvs = [4, 0.6]; b.add(Cyl(1.9, 2.2, 0.9, 16), W, 0, M(0, 2.05, 0), 0);
      b.uvs = [4, 1.5]; b.add(new THREE.SphereGeometry(1.8, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), W, 1, M(0, 2.5, 0, 0, 0, 0, 1, 1.3, 1), 0, 0.02);
      b.uvs = [1, 0.5]; b.add(Box(1.1, 0.6, 1.1), W, 1, M(0, 5.0, 0), 0, 0.02);
      for (let k = 0; k < 6; k++) b.add(Cyl(0.5 - k * 0.07, 0.55 - k * 0.07, 0.35, 12), W, 1, M(0, 5.5 + k * 0.38, 0), 0, 0.02);
    }),
    T(null, (b) => b.add(Cone(0.12, 2.2, 8), [0.95, 0.78, 0.3], 0, M(0, 9.0, 0), 0, 0.02, 0.3, 0.9)),
  ];
  return P;
}

export function buildPropGeos() {
  const G = {};
  // pine (5 tiers)
  let b = new GB();
  b.add(Cyl(0.16, 0.3, 2.4, 6), TRUNK, 0, M(0, 1.2, 0));
  [[2.4, 2.6, 2.6], [2.0, 2.4, 3.8], [1.6, 2.2, 5.0], [1.15, 2.0, 6.1], [0.7, 1.8, 7.1]].forEach(([r, h, y], i) =>
    b.add(lumpy(Cone(r, h, 9), 0.1), [0.85 + i * 0.05, 0.85 + i * 0.05, 0.85 + i * 0.05], 1, M(0, y, 0, 0, i * 0.6)));
  G.pine = b.build();
  // snowy pine
  b = new GB();
  b.add(Cyl(0.16, 0.3, 2.4, 6), TRUNK, 0, M(0, 1.2, 0));
  [[2.4, 2.6, 2.6], [2.0, 2.4, 3.8], [1.6, 2.2, 5.0], [1.15, 2.0, 6.1], [0.7, 1.8, 7.1]].forEach(([r, h, y], i) => {
    b.add(lumpy(Cone(r, h, 9), 0.1), [0.9, 0.9, 0.9], 1, M(0, y, 0, 0, i * 0.6));
    b.add(Cone(r * 0.72, h * 0.45, 9), [0.95, 0.97, 1.0], 0, M(0, y + h * 0.3, 0, 0, i * 0.6), 1, 0.05);
  });
  G.snowpine = b.build();
  // broadleaf tree: several lumpy blobs
  b = new GB();
  b.add(Cyl(0.18, 0.32, 2.6, 6), TRUNK, 0, M(0, 1.3, 0));
  b.add(Cyl(0.08, 0.14, 1.6, 5), TRUNK, 0, M(0.5, 2.6, 0.1, 0, 0, -0.6));
  b.add(Cyl(0.08, 0.13, 1.4, 5), TRUNK, 0, M(-0.45, 2.5, -0.2, 0.3, 0, 0.6));
  [[0, 3.9, 0, 2.0, 0.92], [1.2, 4.1, 0.4, 1.4, 0.85], [-1.1, 3.8, -0.5, 1.45, 1.05], [0.3, 4.9, -0.4, 1.3, 1.12], [-0.4, 3.4, 1.0, 1.2, 0.95]]
    .forEach(([x, y, z, r, c]) => b.add(lumpy(Ico(r, 1), 0.12), [c, c, c], 1, M(x, y, z, 0, 0, 0, 1, 0.88, 1)));
  G.roundtree = b.build();
  // sakura: wide flat crown, dark trunk
  b = new GB();
  b.add(Cyl(0.18, 0.32, 2.0, 6), [0.3, 0.2, 0.18], 0, M(0, 1.0, 0));
  b.add(Cyl(0.08, 0.14, 1.9, 5), [0.3, 0.2, 0.18], 0, M(0.7, 2.4, 0, 0, 0, -0.75));
  b.add(Cyl(0.08, 0.14, 1.8, 5), [0.3, 0.2, 0.18], 0, M(-0.65, 2.3, 0.2, 0, 0, 0.75));
  [[0, 3.2, 0, 2.1, 1], [1.5, 3.3, 0.3, 1.5, 0.92], [-1.4, 3.2, -0.4, 1.5, 1.06], [0.2, 3.8, 1.1, 1.3, 1.1], [-0.3, 3.7, -1.2, 1.2, 0.95]]
    .forEach(([x, y, z, r, c]) => b.add(lumpy(Ico(r, 1), 0.14), [c, c, c], 1, M(x, y, z, 0, 0, 0, 1.15, 0.7, 1.15)));
  G.sakura = b.build();
  // coconut palm
  b = new GB();
  let tx = 0, ty = 0;
  for (let i = 0; i < 7; i++) {
    const x = i * i * 0.04;
    b.add(Cyl(0.16, 0.21, 1.3, 6), [0.52 - (i % 2) * 0.05, 0.42, 0.3], 0, M(x, i * 1.22 + 0.65, 0, 0, 0, -i * 0.045), 1, 0.02);
    tx = x; ty = i * 1.22 + 1.3;
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rnd() * 0.3;
    for (let s = 0; s < 3; s++) { // three segments per frond -> drooping curve
      const m = new THREE.Matrix4().makeTranslation(tx, ty, 0)
        .multiply(new THREE.Matrix4().makeRotationY(a))
        .multiply(new THREE.Matrix4().makeRotationZ(0.25 - s * 0.38 - (i % 2) * 0.15))
        .multiply(new THREE.Matrix4().makeTranslation(0.6 + s * 1.25 * 0.8, -s * s * 0.25, 0));
      b.add(Box(1.3, 0.04, 0.85 - s * 0.2), [0.95 - s * 0.05, 0.95, 0.95], 1, m);
    }
  }
  b.add(Ico(0.22), [0.42, 0.32, 0.15], 0, M(tx + 0.3, ty - 0.3, 0.2));
  b.add(Ico(0.22), [0.42, 0.32, 0.15], 0, M(tx - 0.2, ty - 0.35, -0.25));
  b.add(Ico(0.22), [0.42, 0.32, 0.15], 0, M(tx + 0.05, ty - 0.32, 0.3));
  G.palm = b.build();
  // sugar palm (ต้นตาล)
  b = new GB();
  b.add(Cyl(0.2, 0.3, 11, 7), [0.3, 0.27, 0.24], 0, M(0, 5.5, 0), 0);
  b.add(lumpy(Ico(1.5, 1), 0.15), [0.75, 0.75, 0.75], 1, M(0, 11.6, 0, 0, 0, 0, 1.1, 0.85, 1.1));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, up = (i % 3) * 0.35 - 0.3;
    const m = new THREE.Matrix4().makeTranslation(0, 11.7, 0)
      .multiply(new THREE.Matrix4().makeRotationY(a))
      .multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2 + up))
      .multiply(new THREE.Matrix4().makeTranslation(0, 1.7, 0))
      .multiply(new THREE.Matrix4().makeScale(1, 1, 0.25));
    b.add(Cone(0.9, 2.4, 6), [0.95, 0.95, 0.95], 1, m);
  }
  G.sugarpalm = b.build();
  // bush
  b = new GB();
  b.add(lumpy(Ico(1.1, 1), 0.15), W, 1, M(0, 0.6, 0, 0, 0, 0, 1.3, 0.75, 1.3), 0.4);
  b.add(lumpy(Ico(0.8, 1), 0.15), [0.88, 0.88, 0.88], 1, M(0.9, 0.5, 0.3), 0.4);
  b.add(lumpy(Ico(0.7, 1), 0.15), [1.08, 1.08, 1.08], 1, M(-0.7, 0.45, -0.4), 0.4);
  G.bush = b.build();
  // cactus
  b = new GB();
  b.add(Cyl(0.35, 0.4, 4.5, 9), W, 1, M(0, 2.25, 0), 0);
  b.add(new THREE.SphereGeometry(0.35, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2), W, 1, M(0, 4.5, 0), 0);
  b.add(Cyl(0.2, 0.2, 1.0, 7), W, 1, M(0.6, 2.2, 0, 0, 0, Math.PI / 2), 0);
  b.add(Cyl(0.2, 0.22, 1.6, 7), W, 1, M(1.05, 2.9, 0), 0);
  b.add(Cyl(0.18, 0.18, 0.8, 7), W, 1, M(-0.5, 1.6, 0, 0, 0, Math.PI / 2), 0);
  b.add(Cyl(0.18, 0.2, 1.2, 7), W, 1, M(-0.85, 2.1, 0), 0);
  G.cactus = b.build();
  // rock
  b = new GB();
  b.add(lumpy(new THREE.DodecahedronGeometry(1.5, 1), 0.18), W, 1, M(0, 0.4, 0, 0.3, 0.5, 0.2, 1.3, 0.75, 1.1), 0);
  b.add(lumpy(new THREE.DodecahedronGeometry(0.8, 0), 0.15), [0.9, 0.9, 0.9], 1, M(1.4, 0.2, 0.6, 0.5, 0, 0.4), 0);
  G.rock = b.build();
  // house on stilts (Thai style)
  b = new GB();
  const wall = [0.86, 0.78, 0.64], wood = [0.42, 0.28, 0.17];
  for (const [x, z] of [[-2.6, -2], [2.6, -2], [-2.6, 2], [2.6, 2], [0, -2], [0, 2]]) b.add(Box(0.22, 1.7, 0.22), wood, 0, M(x, 0.85, z), 0);
  b.add(Box(6.4, 0.15, 5.0), wood, 0, M(0, 1.7, 0), 0);
  b.add(Box(6, 2.4, 4.6), wall, 0, M(0, 2.95, 0), 0);
  b.add(Box(1, 1.6, 0.05), [0.35, 0.22, 0.12], 0, M(0.8, 2.6, 2.31), 0);
  b.add(Box(0.9, 0.8, 0.05), [0.2, 0.25, 0.32], 0, M(-1.6, 3.0, 2.31), 0);
  b.add(Box(0.9, 0.8, 0.05), [0.2, 0.25, 0.32], 0, M(2.1, 3.0, 2.31), 0);
  b.add(Box(1.2, 0.08, 1.4), wood, 0, M(0.8, 1.0, 3.1, -0.6), 0);
  b.add(Cone(4.8, 2.9, 4), W, 1, M(0, 5.6, 0, 0, Math.PI / 4, 0, 1.0, 1, 0.8), 0, 0.06);
  G.house = b.build();
  // bamboo clump
  b = new GB();
  for (let i = 0; i < 11; i++) {
    const a = rnd() * 6.28, r = rnd() * 0.7, h = 5 + rnd() * 4, lean = (rnd() - 0.5) * 0.25;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    b.add(Cyl(0.05, 0.07, h, 5), [0.62, 0.7, 0.3], 0, M(x + lean * h / 2, h / 2, z, 0, 0, -lean), 1, 0.08);
    for (let k = 0; k < 4; k++) b.add(lumpy(Ico(0.55, 0), 0.25), [0.9, 0.9, 0.9], 1, M(x + lean * h * (0.6 + k * 0.12) + (rnd() - 0.5) * 0.8, h * (0.6 + k * 0.12), z + (rnd() - 0.5) * 0.8, 0, 0, 0, 1.3, 0.5, 1.3));
  }
  G.bamboo = b.build();
  // banana plant
  b = new GB();
  b.add(Cyl(0.14, 0.2, 2.2, 7), [0.5, 0.55, 0.3], 0, M(0, 1.1, 0), 0.3);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.4;
    for (let s = 0; s < 2; s++) {
      const mm = new THREE.Matrix4().makeTranslation(0, 2.1, 0).multiply(new THREE.Matrix4().makeRotationY(a))
        .multiply(new THREE.Matrix4().makeRotationZ(0.9 - s * 0.7)).multiply(new THREE.Matrix4().makeTranslation(0.55 + s * 1.0, 0, 0));
      b.add(Box(1.1, 0.03, 0.55 - s * 0.1), W, 1, mm);
    }
  }
  G.banana = b.build();
  // birch: white trunk with dark marks, light airy crown
  b = new GB();
  b.add(Cyl(0.13, 0.2, 5.2, 7), [0.92, 0.9, 0.86], 0, M(0, 2.6, 0), 0);
  for (let k = 0; k < 7; k++) b.add(Box(0.27, 0.06, 0.05), [0.12, 0.12, 0.12], 0, M(0, 0.6 + k * 0.65, 0.12, 0, rnd() * 6, 0), 0);
  [[0, 5.2, 0, 1.4], [0.7, 4.4, 0.3, 1.1], [-0.6, 4.6, -0.4, 1.15], [0.1, 6.1, 0.2, 1.0], [-0.2, 3.7, 0.6, 0.9]].forEach(([x, y, z, r]) => b.add(lumpy(Ico(r, 1), 0.15), [0.95 + rnd() * 0.1, 0.95, 0.95], 1, M(x, y, z, 0, 0, 0, 0.9, 1.2, 0.9)));
  G.birch = b.build();
  // dead tree
  b = new GB();
  b.add(Cyl(0.1, 0.25, 3.5, 6), W, 1, M(0, 1.75, 0), 0);
  for (let k = 0; k < 5; k++) { const a = rnd() * 6.28, y = 1.8 + rnd() * 1.6; b.add(Cyl(0.03, 0.08, 1.6, 4), W, 1, M(Math.cos(a) * 0.5, y + 0.4, Math.sin(a) * 0.5, Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7), 0); }
  G.deadtree = b.build();
  // log cabin (roof tinted: snow or green)
  b = new GB();
  b.add(Box(5, 2.6, 4), [0.45, 0.3, 0.18], 0, M(0, 1.3, 0), 0);
  for (let k = 0; k < 6; k++) b.add(Box(5.1, 0.06, 4.1), [0.32, 0.2, 0.12], 0, M(0, 0.3 + k * 0.42, 0), 0);
  b.add(Box(0.8, 0.8, 0.05), [0.95, 0.75, 0.4], 0, M(-1.2, 1.5, 2.02), 0, 0.02);
  b.add(Box(0.9, 1.7, 0.05), [0.28, 0.18, 0.1], 0, M(1.0, 0.85, 2.02), 0);
  const roofL = new THREE.BoxGeometry(5.6, 0.18, 2.8);
  b.add(roofL, W, 1, M(0, 3.25, 1.1, 0.6), 0, 0.03); b.add(roofL.clone(), W, 1, M(0, 3.25, -1.1, -0.6), 0, 0.03);
  b.add(Box(0.5, 1.2, 0.5), [0.45, 0.42, 0.4], 0, M(1.6, 3.9, -0.6), 0);
  G.cabin = b.build();
  // Thai chedi (stupa)
  b = new GB();
  b.add(Box(6, 0.8, 6), [0.93, 0.92, 0.88], 0, M(0, 0.4, 0), 0);
  b.add(Box(4.6, 0.8, 4.6), [0.93, 0.92, 0.88], 0, M(0, 1.2, 0), 0);
  b.add(Cyl(1.9, 2.2, 0.9, 16), [0.93, 0.92, 0.88], 0, M(0, 2.05, 0), 0);
  b.add(new THREE.SphereGeometry(1.8, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), W, 1, M(0, 2.5, 0, 0, 0, 0, 1, 1.3, 1), 0, 0.02);
  b.add(Box(1.1, 0.6, 1.1), W, 1, M(0, 5.0, 0), 0, 0.02);
  for (let k = 0; k < 6; k++) b.add(Cyl(0.5 - k * 0.07, 0.55 - k * 0.07, 0.35, 12), W, 1, M(0, 5.5 + k * 0.38, 0), 0, 0.02, 0.4, 0.6);
  b.add(Cone(0.12, 2.2, 8), [0.95, 0.78, 0.3], 0, M(0, 9.0, 0), 0, 0.02, 0.3, 0.9);
  G.chedi = b.build();
  // fishing boat (hull tinted)
  b = new GB();
  const hull = new THREE.BoxGeometry(2.2, 0.9, 7); const hp = hull.attributes.position;
  for (let i = 0; i < hp.count; i++) { const z = hp.getZ(i), y = hp.getY(i); if (y < 0) hp.setX(i, hp.getX(i) * 0.45); if (z > 3) hp.setX(i, hp.getX(i) * 0.15); if (z > 3 && y > 0) hp.setY(i, y + 0.5); }
  b.add(hull, W, 1, M(0, 0.25, 0), 0, 0.03);
  b.add(Box(1.6, 1.3, 2.2), [0.92, 0.92, 0.9], 0, M(0, 1.2, -1.5), 0);
  b.add(Box(1.8, 0.1, 2.5), [0.3, 0.45, 0.6], 0, M(0, 1.9, -1.5), 0);
  b.add(Cyl(0.05, 0.05, 4, 5), [0.6, 0.55, 0.5], 0, M(0, 2.5, 0.8), 0);
  G.boat = b.build();
  return G;
}
// Wind turbine: tower + nacelle (static) and a rotor (animated)
export function buildTurbine() {
  const t = new GB();
  t.add(Cyl(0.9, 1.6, 50, 14), [0.94, 0.95, 0.96], 0, M(0, 25, 0), 0, 0.02, 0.5, 0.1);
  t.add(Box(1.8, 1.9, 5.2), [0.94, 0.95, 0.96], 0, M(0, 50.8, -0.4), 0, 0.02, 0.5, 0.1);
  const r = new GB();
  r.add(new THREE.SphereGeometry(1.0, 12, 8), [0.94, 0.95, 0.96], 0, M(0, 0, 0, 0, 0, 0, 1, 1, 1.5), 0, 0.02);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const blade = new THREE.BoxGeometry(1.1, 22, 0.25); blade.translate(0, 11.5, 0);
    const bp = blade.attributes.position; for (let i = 0; i < bp.count; i++) if (bp.getY(i) > 5) bp.setX(i, bp.getX(i) * 0.45);
    r.add(blade, [0.95, 0.96, 0.97], 0, M(0, 0, 0.3, 0, 0, a), 0, 0.02);
  }
  return { tower: t.buildSmooth(0.7), rotor: r.buildSmooth(0.7) };
}
// Road sign textures
function signCanvas(draw, w = 128, h = 128) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
export function signTextures() {
  const curve = (dir) => signCanvas((g) => {
    g.translate(64, 64); g.rotate(Math.PI / 4);
    g.fillStyle = '#111'; g.fillRect(-44, -44, 88, 88); g.fillStyle = '#f2c018'; g.fillRect(-40, -40, 80, 80);
    g.rotate(-Math.PI / 4); g.strokeStyle = '#111'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(dir * 10, 34); g.lineTo(dir * 10, 4); g.quadraticCurveTo(dir * 10, -18, -dir * 14, -22); g.stroke();
    g.fillStyle = '#111'; g.beginPath(); g.moveTo(-dir * 30, -22); g.lineTo(-dir * 10, -36); g.lineTo(-dir * 10, -8); g.fill();
  });
  const speed = signCanvas((g) => {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d0141e'; g.lineWidth = 12; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#111'; g.font = 'bold 50px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('90', 64, 68);
  });
  return { left: curve(1), right: curve(-1), speed };
}
export function kmTexture(km) {
  return signCanvas((g, w, h) => {
    g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8141c'; g.fillRect(0, 0, w, 34);
    g.fillStyle = '#111'; g.font = 'bold 44px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(km), w / 2, 82);
    g.font = '18px system-ui,sans-serif'; g.fillText('กม.', w / 2, 116);
  }, 96, 128);
}

// Grass clump & flower clump geometries (per-vertex gradient, sway)
export function buildGrassGeos() {
  const mk = (blades, flowers) => {
    const p = [], c = [], t = [], w = [];
    for (let i = 0; i < blades; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 0.35, h = 0.18 + rnd() * 0.38, wdt = 0.035 + rnd() * 0.035;
      const bx = Math.cos(a) * r, bz = Math.sin(a) * r, lean = (rnd() - 0.5) * 0.22, ra = rnd() * Math.PI;
      const dx = Math.cos(ra) * wdt, dz = Math.sin(ra) * wdt;
      const tipx = bx + Math.cos(a) * lean, tipz = bz + Math.sin(a) * lean;
      const g0 = lin(0.6), g1 = lin(1.0 + rnd() * 0.15);
      p.push(bx - dx, 0, bz - dz, bx + dx, 0, bz + dz, tipx, h, tipz);
      c.push(g0, g0, g0, g0, g0, g0, g1, g1, g1); t.push(1, 1, 1); w.push(1, 1, 1);
    }
    for (let i = 0; i < flowers; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 0.35, h = 0.3 + rnd() * 0.25;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      // stem
      const sg = lin(0.3);
      p.push(x - 0.012, 0, z, x + 0.012, 0, z, x, h, z); c.push(lin(0.2), lin(0.35), lin(0.12), lin(0.2), lin(0.35), lin(0.12), lin(0.25), lin(0.45), lin(0.15)); t.push(0, 0, 0); w.push(1, 1, 1);
      // head: small octahedron (tinted)
      const o = new THREE.OctahedronGeometry(0.07, 0); o.translate(x, h, z);
      const pa = o.attributes.position;
      for (let k = 0; k < pa.count; k++) { p.push(pa.getX(k), pa.getY(k), pa.getZ(k)); c.push(1, 1, 1); t.push(1); w.push(1); }
      void sg;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(t, 1));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(w, 1));
    // grass normals point up so blades are lit like the ground
    const n = new Float32Array(p.length); for (let i = 0; i < n.length; i += 3) { n[i + 1] = 1; }
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    g.computeBoundingSphere();
    return g;
  };
  // flower clump: blades green-tinted by instance colour would tint flowers, so flowers use their own instance colours
  const flower = (() => {
    const g = mk(0, 5);
    // make stems not tinted, heads tinted
    return g;
  })();
  return { grass: mk(9, 0), flower };
}

// ===== Vehicles (forward +z). Paint is tinted per instance; glass/chrome/tyres fixed. =====
const GLASS = [0.06, 0.08, 0.1], TYRE = [0.05, 0.05, 0.055], RIM = [0.72, 0.74, 0.77], CHROME = [0.85, 0.86, 0.88], BLACKTRIM = [0.07, 0.07, 0.075];
// extrude a side profile (points as [z, y]) across the car width
function profile(pts, width, bevel = 0.07) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, width - bevel * 2), bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(-Math.PI / 2);
  return g;
}
export function wheelGeo(r = 0.34, w = 0.24, rim = RIM) {
  const b = new GB();
  b.add(new THREE.CylinderGeometry(r, r, w, 22), TYRE, 0, M(0, 0, 0, 0, 0, Math.PI / 2), 0, 0, 0.92, 0);
  b.add(new THREE.TorusGeometry(r * 0.9, 0.035, 6, 22), TYRE, 0, M(w / 2, 0, 0, 0, Math.PI / 2, 0), 0, 0, 0.9, 0);
  b.add(new THREE.TorusGeometry(r * 0.9, 0.035, 6, 22), TYRE, 0, M(-w / 2, 0, 0, 0, Math.PI / 2, 0), 0, 0, 0.9, 0);
  for (const sd of [1, -1]) {
    b.add(new THREE.CylinderGeometry(r * 0.64, r * 0.64, 0.02, 20), rim, 0, M(sd * (w / 2 + 0.005), 0, 0, 0, 0, Math.PI / 2), 0, 0, 0.3, 0.9);
    b.add(new THREE.CylinderGeometry(r * 0.16, r * 0.16, 0.03, 10), CHROME, 0, M(sd * (w / 2 + 0.015), 0, 0, 0, 0, Math.PI / 2), 0, 0, 0.2, 1);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      b.add(new THREE.BoxGeometry(0.03, r * 0.5, 0.06), rim, 0, M(sd * (w / 2 + 0.02), Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36, a, 0, 0), 0, 0, 0.4, 0.8);
    }
  }
  return b;
}
let wheelCapture = null; // when set, wheels are recorded instead of merged (player car animates its own)
function addWheels(b, pos, r, w) {
  if (wheelCapture) { wheelCapture.push({ pos, r, w }); return; }
  const wg = wheelGeo(r, w);
  for (const [x, z] of pos) b.addGB(wg, M(x, r, z));
}
function lightsFront(b, z, y, x, w = 0.4) {
  for (const sd of [1, -1]) {
    b.add(new THREE.BoxGeometry(w, 0.13, 0.06), [1, 0.98, 0.9], 0, M(sd * x, y, z), 0, 0, 0.1, 0);
    b.add(new THREE.BoxGeometry(w * 0.3, 0.06, 0.07), [1, 0.55, 0.1], 0, M(sd * (x + w * 0.45), y - 0.02, z - 0.01), 0, 0, 0.2, 0);
  }
}
function lightsRear(b, z, y, x, w = 0.42) {
  for (const sd of [1, -1]) b.add(new THREE.BoxGeometry(w, 0.14, 0.06), [0.75, 0.04, 0.04], 0, M(sd * x, y, z), 0, 0, 0.15, 0);
}
function plate(b, z, y, dir) { b.add(new THREE.BoxGeometry(0.42, 0.13, 0.02), [0.95, 0.95, 0.92], 0, M(0, y, z + dir * 0.01), 0, 0, 0.5, 0); }
function mirrorsExt(b, z, y, x) { for (const sd of [1, -1]) { b.add(new THREE.BoxGeometry(0.2, 0.12, 0.08), W, 1, M(sd * x, y, z, 0, sd * 0.25, 0), 0, 0.02, 0.3, 0.3); } }
// car with separate greenhouse (glass) and painted roof/pillars
function sedanLike(o) {
  const b = new GB();
  const { L, Wd, belt, roofY, wb, r } = o;
  const hl = L / 2;
  // lower body (paint) with gentle nose/tail slopes
  b.add(profile([[-hl, 0.32], [-hl - 0.04, 0.62], [-hl + 0.08, belt - 0.02], [-hl + o.trunkLen, belt + 0.04], [hl - o.hoodLen, belt], [hl - 0.12, belt - 0.12], [hl + 0.02, 0.66], [hl, 0.32]], Wd, 0.09), W, 1, null, 0, 0.0, 0.32, 0.45);
  // greenhouse (glass) – trapezoid in side view
  const g0 = -hl + o.trunkLen - 0.05, g1 = hl - o.hoodLen + 0.05;
  if (o.open) { openTop(b, o, g0, g1); return b; }
  b.add(profile([[g0, belt - 0.01], [g0 + o.rearRake, roofY - 0.04], [g1 - o.frontRake, roofY - 0.04], [g1, belt - 0.01]], Wd - 0.22, 0.05), GLASS, 0, null, 0, 0, 0.06, 0.2);
  // roof (paint)
  b.add(profile([[g0 + o.rearRake - 0.05, roofY - 0.05], [g0 + o.rearRake, roofY + 0.02], [g1 - o.frontRake, roofY + 0.02], [g1 - o.frontRake + 0.08, roofY - 0.05]], Wd - 0.2, 0.05), W, 1, null, 0, 0, 0.32, 0.45);
  // pillars (paint) A, B, C on both sides
  for (const sd of [1, -1]) {
    const x = sd * (Wd / 2 - 0.115);
    const beam = (za, ya, zb, yb, t) => { const A = new THREE.Vector3(x, ya, za), B = new THREE.Vector3(x, yb, zb); const g = new THREE.BoxGeometry(0.06, t, A.distanceTo(B)); const mm = new THREE.Matrix4().lookAt(B, A, new THREE.Vector3(0, 1, 0)); mm.setPosition(A.clone().add(B).multiplyScalar(0.5)); b.add(g, W, 1, mm, 0, 0, 0.32, 0.45); };
    beam(g1, belt, g1 - o.frontRake, roofY, 0.07);
    beam(g0, belt, g0 + o.rearRake, roofY, 0.12);
    const zb = (g0 + g1) / 2 + 0.1; beam(zb, belt, zb, roofY, 0.08);
    // door seams & handles
    b.add(new THREE.BoxGeometry(0.01, belt - 0.4, 0.012), BLACKTRIM, 0, M(sd * (Wd / 2 + 0.002), (belt + 0.4) / 2, zb), 0, 0, 0.5, 0);
    b.add(new THREE.BoxGeometry(0.02, 0.03, 0.14), CHROME, 0, M(sd * (Wd / 2 + 0.01), belt - 0.1, zb + 0.35), 0, 0, 0.2, 1);
    b.add(new THREE.BoxGeometry(0.02, 0.03, 0.14), CHROME, 0, M(sd * (Wd / 2 + 0.01), belt - 0.1, zb - 0.55), 0, 0, 0.2, 1);
    // side skirt
    b.add(new THREE.BoxGeometry(0.04, 0.08, wb - 0.9), BLACKTRIM, 0, M(sd * (Wd / 2 - 0.01), 0.34, 0), 0, 0, 0.7, 0);
    // wheel-arch shadows
    for (const z of [wb / 2, -wb / 2]) b.add(new THREE.CylinderGeometry(r + 0.06, r + 0.06, 0.02, 16, 1, false, -Math.PI / 2, Math.PI), [0.02, 0.02, 0.02], 0, M(sd * (Wd / 2 + 0.005), r, z, 0, 0, Math.PI / 2), 0, 0, 0.9, 0);
  }
  mirrorsExt(b, g1 - o.frontRake * 0.6, belt + 0.06, Wd / 2 + 0.07);
  // bumpers, grille, lights, plates
  b.add(new THREE.BoxGeometry(Wd - 0.1, 0.18, 0.14), BLACKTRIM, 0, M(0, 0.4, hl + 0.01), 0, 0, 0.6, 0);
  b.add(new THREE.BoxGeometry(Wd - 0.1, 0.18, 0.14), BLACKTRIM, 0, M(0, 0.4, -hl - 0.01), 0, 0, 0.6, 0);
  b.add(new THREE.BoxGeometry(Wd * 0.42, 0.14, 0.05), [0.1, 0.1, 0.11], 0, M(0, 0.6, hl + 0.02), 0, 0, 0.5, 0.3);
  b.add(new THREE.BoxGeometry(Wd * 0.42, 0.02, 0.06), CHROME, 0, M(0, 0.68, hl + 0.03), 0, 0, 0.15, 1);
  lightsFront(b, hl - 0.02, 0.7, Wd / 2 - 0.3);
  lightsRear(b, -hl - 0.02, belt - 0.12, Wd / 2 - 0.26);
  plate(b, hl + 0.08, 0.43, 1); plate(b, -hl - 0.08, 0.45, -1);
  if (!o.noWheels) addWheels(b, [[Wd / 2 - 0.12, wb / 2], [-Wd / 2 + 0.12, wb / 2], [Wd / 2 - 0.12, -wb / 2], [-Wd / 2 + 0.12, -wb / 2]], r, 0.24);
  return b;
}
function boxy(o) { // SUV / van: tall, upright
  const b = new GB();
  const { L, Wd, belt, roofY, wb, r } = o, hl = L / 2;
  b.add(profile([[-hl, 0.38], [-hl, belt], [hl - o.hoodLen, belt + 0.02], [hl - 0.1, belt - 0.12], [hl + 0.02, 0.72], [hl, 0.38]], Wd, 0.1), W, 1, null, 0, 0, 0.35, 0.4);
  const g0 = -hl + 0.06, g1 = hl - o.hoodLen + 0.04;
  b.add(profile([[g0, belt - 0.01], [g0 + 0.08, roofY - 0.04], [g1 - o.frontRake, roofY - 0.04], [g1, belt - 0.01]], Wd - 0.2, 0.05), GLASS, 0, null, 0, 0, 0.06, 0.2);
  b.add(profile([[g0 + 0.02, roofY - 0.05], [g0 + 0.06, roofY + 0.03], [g1 - o.frontRake, roofY + 0.03], [g1 - o.frontRake + 0.08, roofY - 0.05]], Wd - 0.16, 0.05), W, 1, null, 0, 0, 0.35, 0.4);
  for (const sd of [1, -1]) {
    const x = sd * (Wd / 2 - 0.105);
    for (const z of o.pillars) b.add(new THREE.BoxGeometry(0.06, roofY - belt, 0.1), W, 1, M(x, (roofY + belt) / 2, z), 0, 0, 0.35, 0.4);
    b.add(new THREE.BoxGeometry(0.06, roofY - belt, 0.08), W, 1, M(x, (roofY + belt) / 2, g0 + 0.06), 0, 0, 0.35, 0.4);
    b.add(new THREE.BoxGeometry(0.04, 0.1, L - 1.2), BLACKTRIM, 0, M(sd * (Wd / 2), 0.42, 0), 0, 0, 0.7, 0);
    for (const z of [wb / 2, -wb / 2]) b.add(new THREE.CylinderGeometry(r + 0.07, r + 0.07, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), [0.04, 0.04, 0.04], 0, M(sd * (Wd / 2 + 0.01), r, z, 0, 0, Math.PI / 2), 0, 0, 0.9, 0);
    if (o.rails) b.add(new THREE.BoxGeometry(0.05, 0.05, L * 0.55), [0.2, 0.2, 0.2], 0, M(sd * (Wd / 2 - 0.25), roofY + 0.07, -0.2), 0, 0, 0.4, 0.5);
  }
  mirrorsExt(b, g1 - 0.1, belt + 0.08, Wd / 2 + 0.07);
  b.add(new THREE.BoxGeometry(Wd - 0.08, 0.22, 0.14), BLACKTRIM, 0, M(0, 0.48, hl + 0.01), 0, 0, 0.6, 0);
  b.add(new THREE.BoxGeometry(Wd - 0.08, 0.22, 0.14), BLACKTRIM, 0, M(0, 0.48, -hl - 0.01), 0, 0, 0.6, 0);
  b.add(new THREE.BoxGeometry(Wd * 0.5, 0.2, 0.05), [0.12, 0.12, 0.13], 0, M(0, 0.72, hl + 0.02), 0, 0, 0.4, 0.4);
  lightsFront(b, hl - 0.02, 0.8, Wd / 2 - 0.28);
  lightsRear(b, -hl - 0.02, belt - 0.05, Wd / 2 - 0.15, 0.22);
  plate(b, hl + 0.08, 0.5, 1); plate(b, -hl - 0.08, 0.6, -1);
  if (o.spare) b.add(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 18), TYRE, 0, M(0, 1.0, -hl - 0.13, Math.PI / 2), 0, 0, 0.9, 0);
  addWheels(b, [[Wd / 2 - 0.13, wb / 2], [-Wd / 2 + 0.13, wb / 2], [Wd / 2 - 0.13, -wb / 2], [-Wd / 2 + 0.13, -wb / 2]], r, 0.26);
  return b;
}
function pickup() { // Thai-style 1-ton pickup with open bed
  const L = 5.3, Wd = 1.85, belt = 1.08, roofY = 1.78, wb = 3.1, r = 0.38, hl = L / 2;
  const b = new GB();
  const cabBack = -0.3;
  b.add(profile([[cabBack, 0.42], [cabBack, belt], [hl - 1.1, belt + 0.02], [hl - 0.12, belt - 0.12], [hl + 0.02, 0.76], [hl, 0.42]], Wd, 0.09), W, 1, null, 0, 0, 0.33, 0.4);
  b.add(profile([[cabBack + 0.04, belt - 0.01], [cabBack + 0.1, roofY - 0.04], [hl - 1.75, roofY - 0.04], [hl - 1.08, belt - 0.01]], Wd - 0.2, 0.05), GLASS, 0, null, 0, 0, 0.06, 0.2);
  b.add(profile([[cabBack + 0.06, roofY - 0.05], [cabBack + 0.1, roofY + 0.03], [hl - 1.75, roofY + 0.03], [hl - 1.66, roofY - 0.05]], Wd - 0.16, 0.05), W, 1, null, 0, 0, 0.33, 0.4);
  // bed: floor + 3 walls
  b.add(new THREE.BoxGeometry(Wd, 0.08, hl + cabBack - 0.02), [0.15, 0.15, 0.16], 0, M(0, 0.82, (-hl + cabBack) / 2), 0, 0, 0.8, 0);
  b.add(new THREE.BoxGeometry(Wd, 0.62, hl + cabBack), W, 1, M(0, 0.6, (-hl + cabBack) / 2, 0, 0, 0, 1, 1, 1), 0, 0, 0.33, 0.4); // lower bed body
  for (const sd of [1, -1]) b.add(new THREE.BoxGeometry(0.08, 0.36, hl + cabBack), W, 1, M(sd * (Wd / 2 - 0.04), 1.08, (-hl + cabBack) / 2), 0, 0, 0.33, 0.4);
  b.add(new THREE.BoxGeometry(Wd, 0.36, 0.08), W, 1, M(0, 1.08, -hl + 0.04), 0, 0, 0.33, 0.4);
  for (const sd of [1, -1]) {
    b.add(new THREE.BoxGeometry(0.06, roofY - belt, 0.09), W, 1, M(sd * (Wd / 2 - 0.105), (roofY + belt) / 2, cabBack + 0.08), 0, 0, 0.33, 0.4);
    b.add(new THREE.BoxGeometry(0.06, roofY - belt, 0.08), W, 1, M(sd * (Wd / 2 - 0.105), (roofY + belt) / 2, 0.75), 0, 0, 0.33, 0.4);
    for (const z of [wb / 2 - 0.1, -wb / 2 - 0.1]) b.add(new THREE.CylinderGeometry(r + 0.08, r + 0.08, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), [0.03, 0.03, 0.03], 0, M(sd * (Wd / 2 + 0.01), r, z, 0, 0, Math.PI / 2), 0, 0, 0.9, 0);
    b.add(new THREE.BoxGeometry(0.12, 0.05, 1.2), [0.2, 0.2, 0.2], 0, M(sd * (Wd / 2 + 0.03), 0.48, 0.6), 0, 0, 0.6, 0.3); // step
  }
  mirrorsExt(b, hl - 1.25, belt + 0.1, Wd / 2 + 0.08);
  b.add(new THREE.BoxGeometry(Wd * 0.62, 0.3, 0.06), [0.75, 0.76, 0.78], 0, M(0, 0.86, hl + 0.02), 0, 0, 0.2, 0.9);
  b.add(new THREE.BoxGeometry(Wd - 0.05, 0.2, 0.16), [0.6, 0.61, 0.63], 0, M(0, 0.48, hl + 0.02), 0, 0, 0.3, 0.8);
  b.add(new THREE.BoxGeometry(Wd - 0.05, 0.16, 0.14), [0.6, 0.61, 0.63], 0, M(0, 0.48, -hl - 0.02), 0, 0, 0.3, 0.8);
  lightsFront(b, hl - 0.02, 0.92, Wd / 2 - 0.26);
  lightsRear(b, -hl - 0.02, 1.0, Wd / 2 - 0.08, 0.14);
  plate(b, hl + 0.1, 0.5, 1); plate(b, -hl - 0.1, 0.55, -1);
  addWheels(b, [[Wd / 2 - 0.15, wb / 2 - 0.1], [-Wd / 2 + 0.15, wb / 2 - 0.1], [Wd / 2 - 0.15, -wb / 2 - 0.1], [-Wd / 2 + 0.15, -wb / 2 - 0.1]], r, 0.26);
  return b;
}
function truck() { // 6-wheel box truck
  const b = new GB();
  const Wd = 2.3, hl = 4.2;
  // cab
  b.add(profile([[hl - 2.0, 0.6], [hl - 2.0, 2.75], [hl - 0.35, 2.75], [hl, 2.0], [hl, 0.6]], Wd, 0.08), W, 1, null, 0, 0, 0.4, 0.3);
  b.add(new THREE.BoxGeometry(Wd - 0.1, 0.8, 0.04), GLASS, 0, M(0, 2.3, hl - 0.16, -0.43), 0, 0, 0.06, 0.2);
  for (const sd of [1, -1]) b.add(new THREE.BoxGeometry(0.04, 0.7, 1.0), GLASS, 0, M(sd * (Wd / 2 + 0.01), 2.2, hl - 1.0), 0, 0, 0.06, 0.2);
  b.add(new THREE.BoxGeometry(Wd * 0.7, 0.5, 0.05), [0.15, 0.15, 0.16], 0, M(0, 1.2, hl + 0.02), 0, 0, 0.5, 0.3);
  // cargo box (white/grey, not tinted)
  b.add(new THREE.BoxGeometry(Wd + 0.1, 2.6, 5.9), [0.88, 0.88, 0.86], 0, M(0, 2.25, hl - 2.1 - 2.95 - 0.1), 0, 0.02, 0.5, 0.1);
  b.add(new THREE.BoxGeometry(Wd + 0.12, 0.1, 5.9), [0.75, 0.25, 0.1], 0, M(0, 1.3, hl - 2.1 - 2.95 - 0.1), 0, 0, 0.5, 0);
  b.add(new THREE.BoxGeometry(Wd - 0.2, 0.25, 7.8), [0.12, 0.12, 0.13], 0, M(0, 0.75, -0.0), 0, 0, 0.8, 0);
  b.add(new THREE.BoxGeometry(Wd, 0.2, 0.15), [0.6, 0.6, 0.62], 0, M(0, 0.6, hl + 0.05), 0, 0, 0.3, 0.8);
  lightsFront(b, hl + 0.02, 0.85, Wd / 2 - 0.3, 0.35);
  lightsRear(b, -hl - 0.02, 0.95, Wd / 2 - 0.2, 0.25);
  addWheels(b, [[Wd / 2 - 0.2, hl - 1.1], [-Wd / 2 + 0.2, hl - 1.1], [Wd / 2 - 0.2, -hl + 1.5], [-Wd / 2 + 0.2, -hl + 1.5], [Wd / 2 - 0.2, -hl + 2.6], [-Wd / 2 + 0.2, -hl + 2.6]], 0.5, 0.3);
  return b;
}
export const VEHICLES = {
  sedan: { L: 4.6, w: 1.82, build: () => sedanLike({ L: 4.6, Wd: 1.82, belt: 0.98, roofY: 1.44, wb: 2.7, r: 0.33, hoodLen: 1.3, trunkLen: 0.95, frontRake: 0.75, rearRake: 0.55 }) },
  hatch: { L: 4.0, w: 1.74, build: () => sedanLike({ L: 4.0, Wd: 1.74, belt: 0.98, roofY: 1.48, wb: 2.5, r: 0.31, hoodLen: 1.05, trunkLen: 0.15, frontRake: 0.7, rearRake: 0.2 }) },
  pickup: { L: 5.3, w: 1.85, build: pickup },
  suv: { L: 4.75, w: 1.9, build: () => boxy({ L: 4.75, Wd: 1.9, belt: 1.12, roofY: 1.78, wb: 2.8, r: 0.38, hoodLen: 1.15, frontRake: 0.55, pillars: [0.05, -1.0], rails: true, spare: false }) },
  van: { L: 5.0, w: 1.9, build: () => boxy({ L: 5.0, Wd: 1.9, belt: 1.15, roofY: 2.0, wb: 3.0, r: 0.34, hoodLen: 0.55, frontRake: 0.55, pillars: [0.9, -0.4, -1.5], rails: false, spare: false }) },
  truck: { L: 8.4, w: 2.4, build: truck },
};
export function buildVehicleGeo(type, withWheels = true) {
  const b = VEHICLES[type].build();
  void withWheels;
  return b.buildSmooth(0.55);
}
// Original low fastback sports coupe (player car)
function coupe() {
  const b = new GB();
  const Wd = 1.78, wb = 2.45, r = 0.32, belt = 0.82, roofY = 1.24;
  const PAINT_R = 0.28, PAINT_M = 0.4;
  // lower body: low nose, long hood, short ducktail rear deck
  b.add(profile([[-2.15, 0.3], [-2.2, 0.6], [-2.12, 0.87], [-1.5, 0.86], [0.8, belt], [1.65, 0.68], [2.1, 0.55], [2.17, 0.42], [2.13, 0.28]], Wd, 0.1), W, 1, null, 0, 0.0, PAINT_R, PAINT_M);
  // fastback glasshouse
  const g0 = -1.52, g1 = 0.82, rr = -0.22, rf = 0.22;
  b.add(profile([[g0, 0.85], [rr, roofY - 0.03], [rf, roofY - 0.03], [g1, belt - 0.01]], Wd - 0.3, 0.05), GLASS, 0, null, 0, 0, 0.05, 0.2);
  b.add(profile([[rr - 0.06, roofY - 0.05], [rr, roofY + 0.02], [rf, roofY + 0.02], [rf + 0.07, roofY - 0.05]], Wd - 0.3, 0.05), W, 1, null, 0, 0, PAINT_R, PAINT_M);
  for (const sd of [1, -1]) {
    const x = sd * (Wd / 2 - 0.15);
    const beam = (za, ya, zb, yb, t, col = W, tint = 1) => { const A = new THREE.Vector3(x, ya, za), B = new THREE.Vector3(x, yb, zb); const g = new THREE.BoxGeometry(0.06, t, A.distanceTo(B)); const mm = new THREE.Matrix4().lookAt(B, A, new THREE.Vector3(0, 1, 0)); mm.setPosition(A.clone().add(B).multiplyScalar(0.5)); b.add(g, col, tint, mm, 0, 0, PAINT_R, PAINT_M); };
    beam(g1, belt, rf, roofY, 0.06, BLACKTRIM, 0);          // A-pillar (black)
    beam(g0 + 0.1, 0.86, rr, roofY, 0.1);                   // sail panel
    // flared fenders
    b.add(new THREE.BoxGeometry(0.1, 0.36, 1.05), W, 1, M(sd * (Wd / 2 + 0.02), 0.62, -wb / 2, 0, 0, 0), 0, 0, PAINT_R, PAINT_M);
    b.add(new THREE.BoxGeometry(0.07, 0.3, 0.95), W, 1, M(sd * (Wd / 2 + 0.01), 0.6, wb / 2), 0, 0, PAINT_R, PAINT_M);
    // side intake + door seam + handle + skirt
    b.add(new THREE.BoxGeometry(0.02, 0.12, 0.36), BLACKTRIM, 0, M(sd * (Wd / 2 + 0.07), 0.6, -wb / 2 + 0.75), 0, 0, 0.6, 0);
    b.add(new THREE.BoxGeometry(0.01, 0.42, 0.012), BLACKTRIM, 0, M(sd * (Wd / 2 + 0.002), 0.56, -0.55), 0, 0, 0.5, 0);
    b.add(new THREE.BoxGeometry(0.02, 0.025, 0.12), BLACKTRIM, 0, M(sd * (Wd / 2 + 0.01), 0.74, -0.42), 0, 0, 0.4, 0.3);
    b.add(new THREE.BoxGeometry(0.06, 0.08, wb - 0.8), BLACKTRIM, 0, M(sd * (Wd / 2 + 0.01), 0.3, 0), 0, 0, 0.7, 0);
    for (const z of [wb / 2, -wb / 2]) b.add(new THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.03, 18, 1, false, -Math.PI / 2, Math.PI), [0.02, 0.02, 0.02], 0, M(sd * (Wd / 2 + 0.07), r, z, 0, 0, Math.PI / 2), 0, 0, 0.9, 0);
    // rear wing stands
    b.add(new THREE.BoxGeometry(0.04, 0.2, 0.1), BLACKTRIM, 0, M(sd * 0.58, 0.97, -1.98), 0, 0, 0.5, 0.3);
  }
  // rear wing blade
  b.add(new THREE.BoxGeometry(1.62, 0.035, 0.3), W, 1, M(0, 1.08, -2.0, 0.06), 0, 0, PAINT_R, PAINT_M);
  for (const sd of [1, -1]) b.add(new THREE.BoxGeometry(0.03, 0.12, 0.34), BLACKTRIM, 0, M(sd * 0.81, 1.08, -2.0), 0, 0, 0.5, 0);
  mirrorsExt(b, 0.58, belt + 0.07, Wd / 2 + 0.06);
  // front: slim headlights, centre intake, splitter
  for (const sd of [1, -1]) {
    b.add(new THREE.BoxGeometry(0.46, 0.07, 0.08), [1, 0.98, 0.92], 0, M(sd * 0.56, 0.6, 2.07, -0.35), 0, 0, 0.05, 0.2);
    b.add(new THREE.BoxGeometry(0.5, 0.02, 0.09), BLACKTRIM, 0, M(sd * 0.56, 0.645, 2.06, -0.35), 0, 0, 0.4, 0);
    b.add(new THREE.BoxGeometry(0.14, 0.06, 0.04), [1, 0.55, 0.1], 0, M(sd * 0.72, 0.4, 2.15), 0, 0, 0.2, 0);
  }
  b.add(new THREE.BoxGeometry(0.9, 0.14, 0.05), [0.04, 0.04, 0.045], 0, M(0, 0.4, 2.16), 0, 0, 0.6, 0);
  b.add(new THREE.BoxGeometry(Wd - 0.1, 0.04, 0.22), BLACKTRIM, 0, M(0, 0.26, 2.08), 0, 0, 0.6, 0);
  // rear: full-width light bar, diffuser, single big exhaust
  b.add(new THREE.BoxGeometry(Wd - 0.34, 0.07, 0.05), [0.75, 0.04, 0.04], 0, M(0, 0.76, -2.17), 0, 0, 0.12, 0);
  b.add(new THREE.BoxGeometry(Wd - 0.2, 0.12, 0.12), BLACKTRIM, 0, M(0, 0.33, -2.16), 0, 0, 0.6, 0);
  b.add(new THREE.CylinderGeometry(0.065, 0.065, 0.14, 14), CHROME, 0, M(0.45, 0.33, -2.22, Math.PI / 2), 0, 0, 0.2, 1);
  b.add(new THREE.CylinderGeometry(0.045, 0.045, 0.15, 12), [0.02, 0.02, 0.02], 0, M(0.45, 0.33, -2.225, Math.PI / 2), 0, 0, 0.9, 0);
  plate(b, 2.2, 0.42, 1); plate(b, -2.22, 0.5, -1);
  return { b, Wd, wb, r };
}

// ----- player cars: original designs per class (no real model is copied) -----
const PR = 0.28, PM = 0.42; // paint roughness / metalness
// thin panel that follows the hood line; built separately so it can take its own colour
function hoodPanel(o) {
  const b = new GB(), hl = o.L / 2, z0 = hl - o.hoodLen + 0.06, z1 = hl - 0.14;
  const y = o.belt + 0.075; // sits on the body's bevelled top surface
  b.add(profile([[z0, y - 0.03], [z0, y + 0.01], [z1, y - 0.11], [z1 + 0.02, y - 0.14]], o.Wd - 0.34, 0.03), W, 1, null, 0, 0, PR, PM);
  return b;
}
// open cockpit for the roadster: windscreen + frame, tub, seats and roll hoops
function openTop(b, o, g0, g1) {
  const { Wd, belt, wb, r } = o, hl = o.L / 2;
  const ws = new THREE.BoxGeometry(Wd - 0.34, 0.42, 0.03);
  b.add(ws, GLASS, 0, M(0, belt + 0.18, g1 - 0.12, -0.95), 0, 0, 0.06, 0.2);
  b.add(new THREE.BoxGeometry(Wd - 0.3, 0.035, 0.05), BLACKTRIM, 0, M(0, belt + 0.37, g1 - 0.27, -0.95), 0, 0, 0.5, 0);
  for (const sd of [1, -1]) b.add(new THREE.BoxGeometry(0.045, 0.46, 0.05), BLACKTRIM, 0, M(sd * (Wd / 2 - 0.17), belt + 0.18, g1 - 0.12, -0.95), 0, 0, 0.5, 0);
  // cockpit tub (dark) sunk into the body
  b.add(new THREE.BoxGeometry(Wd - 0.34, 0.04, g1 - g0 - 0.35), [0.05, 0.05, 0.055], 0, M(0, belt + 0.012, (g0 + g1) / 2 - 0.05), 0, 0, 0.9, 0);
  for (const sd of [1, -1]) {
    b.add(new THREE.BoxGeometry(0.44, 0.42, 0.1), [0.14, 0.11, 0.09], 0, M(sd * 0.36, belt + 0.06, g0 + 0.4, -0.2), 0, 0, 0.8, 0);
    b.add(new THREE.BoxGeometry(0.22, 0.14, 0.09), [0.14, 0.11, 0.09], 0, M(sd * 0.36, belt + 0.33, g0 + 0.36), 0, 0, 0.8, 0);
    // roll hoop behind each seat
    b.add(new THREE.TorusGeometry(0.19, 0.025, 6, 14, Math.PI), [0.2, 0.2, 0.21], 0, M(sd * 0.36, belt + 0.14, g0 + 0.2), 0, 0, 0.3, 0.8);
    for (const x of [-0.2, 0.2]) b.add(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 6), [0.2, 0.2, 0.21], 0, M(sd * 0.36 + x * 0.95, belt + 0.06, g0 + 0.2), 0, 0, 0.3, 0.8);
    b.add(new THREE.BoxGeometry(0.02, 0.03, 0.14), CHROME, 0, M(sd * (Wd / 2 + 0.01), belt - 0.1, (g0 + g1) / 2), 0, 0, 0.2, 1);
    for (const z of [wb / 2, -wb / 2]) b.add(new THREE.CylinderGeometry(r + 0.06, r + 0.06, 0.02, 16, 1, false, -Math.PI / 2, Math.PI), [0.02, 0.02, 0.02], 0, M(sd * (Wd / 2 + 0.005), r, z, 0, 0, Math.PI / 2), 0, 0, 0.9, 0);
  }
  mirrorsExt(b, g1 - 0.25, belt + 0.06, Wd / 2 + 0.07);
  // slim lights, small grille opening
  for (const sd of [1, -1]) {
    b.add(new THREE.BoxGeometry(0.38, 0.08, 0.1), [1, 0.98, 0.92], 0, M(sd * (Wd / 2 - 0.32), 0.66, hl - 0.07, -0.45), 0, 0, 0.05, 0.2);
    b.add(new THREE.BoxGeometry(0.36, 0.08, 0.05), [0.75, 0.04, 0.04], 0, M(sd * (Wd / 2 - 0.3), belt - 0.1, -hl - 0.02), 0, 0, 0.12, 0);
  }
  b.add(new THREE.BoxGeometry(0.62, 0.16, 0.05), [0.04, 0.04, 0.045], 0, M(0, 0.44, hl + 0.02), 0, 0, 0.6, 0);
  b.add(new THREE.BoxGeometry(Wd - 0.1, 0.12, 0.12), BLACKTRIM, 0, M(0, 0.34, -hl - 0.01), 0, 0, 0.6, 0);
  for (const sd of [1, -1]) b.add(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 12), CHROME, 0, M(sd * 0.3, 0.32, -hl - 0.06, Math.PI / 2), 0, 0, 0.2, 1);
  plate(b, hl + 0.08, 0.36, 1); plate(b, -hl - 0.08, 0.5, -1);
  addWheels(b, [[Wd / 2 - 0.12, wb / 2], [-Wd / 2 + 0.12, wb / 2], [Wd / 2 - 0.12, -wb / 2], [-Wd / 2 + 0.12, -wb / 2]], r, 0.22);
}
const PLAYER = {
  // 4-door rally sedan: hood scoop, tall rear wing, mud flaps, fog lamps
  rally: { o: { L: 4.45, Wd: 1.76, belt: 0.98, roofY: 1.45, wb: 2.62, r: 0.33, hoodLen: 1.25, trunkLen: 0.9, frontRake: 0.72, rearRake: 0.55 }, extra(b, o) {
    const hl = o.L / 2;
    b.add(profile([[hl - 1.0, o.belt + 0.0], [hl - 0.95, o.belt + 0.11], [hl - 0.62, o.belt + 0.1], [hl - 0.55, o.belt - 0.04]], 0.62, 0.03), W, 1, null, 0, 0, PR, PM);
    b.add(new THREE.BoxGeometry(0.5, 0.06, 0.03), [0.03, 0.03, 0.035], 0, M(0, o.belt + 0.07, hl - 0.55), 0, 0, 0.8, 0);
    for (const sd of [1, -1]) {
      b.add(new THREE.BoxGeometry(0.05, 0.3, 0.06), BLACKTRIM, 0, M(sd * 0.55, o.belt + 0.2, -hl + 0.35, -0.2), 0, 0, 0.5, 0);
      b.add(new THREE.BoxGeometry(0.03, 0.18, 0.36), BLACKTRIM, 0, M(sd * 0.78, o.belt + 0.36, -hl + 0.3), 0, 0, 0.5, 0);
      b.add(new THREE.BoxGeometry(0.22, 0.26, 0.015), [0.06, 0.06, 0.065], 0, M(sd * (o.Wd / 2 - 0.15), 0.2, -o.wb / 2 - 0.4), 0, 0, 0.9, 0);
      b.add(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 14), [1, 0.97, 0.85], 0, M(sd * 0.6, 0.38, hl + 0.06, Math.PI / 2), 0, 0, 0.05, 0.2);
    }
    b.add(new THREE.BoxGeometry(1.58, 0.04, 0.32), W, 1, M(0, o.belt + 0.45, -hl + 0.3, 0.08), 0, 0, PR, PM);
    b.add(new THREE.BoxGeometry(o.Wd - 0.1, 0.05, 0.2), BLACKTRIM, 0, M(0, 0.26, hl - 0.02), 0, 0, 0.6, 0);
    b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 14), CHROME, 0, M(-0.5, 0.32, -hl - 0.06, Math.PI / 2), 0, 0, 0.2, 1);
  }, rim: [0.78, 0.6, 0.18], hood: false },
  // 2+2 rear-drive coupe: long hood, low roof, short fastback, ducktail lip
  fastback: { o: { L: 4.25, Wd: 1.78, belt: 0.86, roofY: 1.3, wb: 2.57, r: 0.32, hoodLen: 1.42, trunkLen: 0.5, frontRake: 0.8, rearRake: 0.9 }, extra(b, o) {
    const hl = o.L / 2;
    b.add(new THREE.BoxGeometry(o.Wd - 0.4, 0.05, 0.16), W, 1, M(0, o.belt + 0.05, -hl + 0.14, -0.25), 0, 0, PR, PM);
    for (const sd of [1, -1]) {
      b.add(new THREE.BoxGeometry(0.02, 0.12, 0.3), BLACKTRIM, 0, M(sd * (o.Wd / 2 + 0.03), 0.62, o.wb / 2 - 0.55), 0, 0, 0.6, 0);
      b.add(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 14), CHROME, 0, M(sd * 0.55, 0.3, -hl - 0.06, Math.PI / 2), 0, 0, 0.2, 1);
    }
    b.add(new THREE.BoxGeometry(o.Wd - 0.1, 0.04, 0.2), BLACKTRIM, 0, M(0, 0.26, hl - 0.02), 0, 0, 0.6, 0);
  }, rim: [0.2, 0.21, 0.23], hood: true },
  // compact crossover: raised, rounded hatch, black arch cladding, roof rails
  cross: { o: { L: 4.4, Wd: 1.8, belt: 1.1, roofY: 1.6, wb: 2.65, r: 0.36, hoodLen: 1.1, trunkLen: 0.16, frontRake: 0.72, rearRake: 0.4 }, extra(b, o) {
    const hl = o.L / 2;
    for (const sd of [1, -1]) {
      for (const z of [o.wb / 2, -o.wb / 2]) b.add(new THREE.TorusGeometry(o.r + 0.1, 0.07, 6, 18, Math.PI), [0.05, 0.05, 0.055], 0, M(sd * (o.Wd / 2 + 0.01), o.r, z, 0, sd * Math.PI / 2, 0), 0, 0, 0.9, 0);
      b.add(new THREE.BoxGeometry(0.06, 0.16, o.wb - 0.85), [0.05, 0.05, 0.055], 0, M(sd * (o.Wd / 2 + 0.01), 0.38, 0), 0, 0, 0.9, 0);
      b.add(new THREE.BoxGeometry(0.05, 0.05, o.L * 0.5), [0.15, 0.15, 0.16], 0, M(sd * (o.Wd / 2 - 0.28), o.roofY + 0.07, -0.25), 0, 0, 0.4, 0.5);
    }
    b.add(new THREE.BoxGeometry(o.Wd - 0.2, 0.2, 0.05), [0.05, 0.05, 0.055], 0, M(0, 0.42, hl + 0.06), 0, 0, 0.9, 0);
  }, rim: [0.45, 0.46, 0.48], hood: false },
  // small two-seat roadster, open top
  roadster: { o: { L: 3.95, Wd: 1.73, belt: 0.82, roofY: 1.15, wb: 2.31, r: 0.31, hoodLen: 1.35, trunkLen: 0.78, frontRake: 0.6, rearRake: 0.5, open: true }, extra() {}, rim: [0.68, 0.7, 0.73], hood: false },
};
// fabric soft top for an open car (shown when the top is closed)
function softTop(o) {
  const b = new GB(), { Wd, belt } = o, hl = o.L / 2;
  const g0 = -hl + o.trunkLen - 0.05, g1 = hl - o.hoodLen + 0.05, top = belt + 0.5, cloth = [0.07, 0.07, 0.08];
  b.add(profile([[g1 - 0.3, belt + 0.36], [g1 - 0.42, top], [g0 + 0.62, top + 0.01], [g0 + 0.12, belt + 0.08], [g0 + 0.02, belt + 0.01], [g1 - 0.3, belt + 0.01]], Wd - 0.3, 0.06), cloth, 0, null, 0, 0, 0.95, 0);
  // small rear window and the frame bows showing through the fabric
  const ang = Math.atan2(top - (belt + 0.08), (g0 + 0.62) - (g0 + 0.12));
  b.add(new THREE.BoxGeometry(Wd - 0.75, 0.22, 0.02), GLASS, 0, M(0, (top + belt + 0.08) / 2 + 0.04, (g0 + 0.62 + g0 + 0.12) / 2 - 0.03, -(Math.PI / 2 - ang)), 0, 0, 0.06, 0.2);
  for (const z of [g1 - 0.7, (g1 + g0) / 2, g0 + 0.75]) b.add(new THREE.BoxGeometry(Wd - 0.26, 0.012, 0.03), [0.05, 0.05, 0.055], 0, M(0, top + 0.065, z), 0, 0, 0.9, 0);
  return b;
}
export function playerCarDefaults(type) { const P = PLAYER[type]; return P ? { rim: P.rim, hood: P.hood } : { rim: RIM, hood: false }; }
export function buildPlayerCar(type = 'coupe', rim = null) {
  if (type === 'coupe') {
    const { b, Wd, wb, r } = coupe();
    return { body: b.buildSmooth(0.55), wheel: wheelGeo(r, 0.25, rim || [0.22, 0.23, 0.25]).buildSmooth(0.6), wheelPos: [[Wd / 2 - 0.1, wb / 2], [-Wd / 2 + 0.1, wb / 2], [Wd / 2 - 0.1, -wb / 2], [-Wd / 2 + 0.1, -wb / 2]], r, L: 4.35, W: 1.85 };
  }
  if (PLAYER[type]) {
    const P = PLAYER[type], o = P.o;
    wheelCapture = [];
    const b = sedanLike(o); P.extra(b, o);
    const cap = wheelCapture[0]; wheelCapture = null;
    return { body: b.buildSmooth(0.55), softTop: o.open ? softTop(o).buildSmooth(0.55) : null, hood: P.hood ? hoodPanel(o).buildSmooth(0.55) : null, wheel: wheelGeo(cap.r, cap.w, rim || P.rim).buildSmooth(0.6), wheelPos: cap.pos, r: cap.r, L: o.L, W: o.Wd, open: !!o.open };
  }
  wheelCapture = [];
  const body = VEHICLES[type].build().buildSmooth(0.55);
  const cap = wheelCapture[0]; wheelCapture = null;
  return { body, wheel: wheelGeo(cap.r, cap.w, rim || RIM).buildSmooth(0.6), wheelPos: cap.pos, r: cap.r, L: VEHICLES[type].L, W: VEHICLES[type].w };
}

// Shadow-only proxy for the player car (body + pillars + roof, windows open)
export function buildCarShadowGeo() {
  const b = new GB();
  b.add(Box(1.8, 0.45, 4.3), W, 0, M(0, 0.52, 0), 0, 0);   // lower body (below the dash)
  b.add(Box(1.78, 0.2, 1.3), W, 0, M(0, 0.85, 1.55), 0, 0); // hood
  b.add(Box(1.78, 0.2, 0.9), W, 0, M(0, 0.85, -1.7), 0, 0); // boot
  b.add(Box(1.38, 0.06, 1.5), W, 0, M(0, 1.58, -0.35), 0, 0);
  for (const s of [1, -1]) {
    b.add(Box(0.08, 0.6, 0.08), W, 0, M(s * 0.74, 1.22, 0.55, -0.9), 0, 0);
    b.add(Box(0.08, 0.6, 0.12), W, 0, M(s * 0.78, 1.22, -0.55), 0, 0);
    b.add(Box(0.08, 0.6, 0.2), W, 0, M(s * 0.74, 1.2, -1.3, 0.6), 0, 0);
  }
  return b.build();
}

// Road-side furniture
export function buildRoadsideGeos() {
  const post = new GB().add(Box(0.12, 1.0, 0.12), [0.92, 0.92, 0.92], 0, M(0, 0.5, 0), 0, 0).add(Box(0.13, 0.12, 0.13), [0.12, 0.12, 0.12], 0, M(0, 0.95, 0), 0, 0).build();
  const lamp = new GB()
    .add(Cyl(0.08, 0.14, 8, 8), [0.55, 0.57, 0.6], 0, M(0, 4, 0), 0, 0)
    .add(Cyl(0.05, 0.05, 2.2, 6), [0.55, 0.57, 0.6], 0, M(-1.05, 7.9, 0, 0, 0, Math.PI / 2 + 0.08), 0, 0)
    .add(Box(0.7, 0.16, 0.32), [0.35, 0.35, 0.37], 0, M(-2.05, 7.78, 0), 0, 0).build();
  const bulb = new THREE.BoxGeometry(0.55, 0.05, 0.25); bulb.translate(-2.05, 7.68, 0);
  const refl = new THREE.BoxGeometry(0.06, 0.16, 0.14); refl.translate(0, 0.82, 0);
  const powerPole = new GB()
    .add(Cyl(0.11, 0.17, 9.2, 8), [0.72, 0.71, 0.68], 0, M(0, 4.6, 0), 0, 0)
    .add(Box(0.12, 0.12, 2.2), [0.6, 0.6, 0.58], 0, M(0, 8.6, 0, 0, Math.PI / 2, 0), 0, 0)
    .add(Cyl(0.05, 0.05, 0.18, 6), [0.85, 0.85, 0.8], 0, M(0.85, 8.72, 0), 0, 0)
    .add(Cyl(0.05, 0.05, 0.18, 6), [0.85, 0.85, 0.8], 0, M(0, 8.72, 0), 0, 0)
    .add(Cyl(0.05, 0.05, 0.18, 6), [0.85, 0.85, 0.8], 0, M(-0.85, 8.72, 0), 0, 0)
    .add(Cyl(0.25, 0.25, 0.7, 8), [0.45, 0.47, 0.5], 0, M(0.3, 7.6, 0.25), 0, 0).build();
  const railPost = new GB().add(Box(0.1, 0.8, 0.1), [0.62, 0.64, 0.66], 0, M(0, 0.4, 0), 0, 0).build();
  return { post, lamp, bulb, refl, railPost, powerPole };
}

function noiseCanvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }

export function roadTexture(renderer, asphalt = null) {
  const c = noiseCanvas(1024, 2048, (g, w, h) => {
    g.fillStyle = '#313234'; g.fillRect(0, 0, w, h);
    if (asphalt) { // generated asphalt photo tiled at ~2.5 m (canvas is 11 m x 12 m)
      const tw = Math.round(w / 11 * 2.5), th = Math.round(h / 12 * 2.5);
      for (let y = 0; y < h; y += th) for (let x = 0; x < w; x += tw) g.drawImage(asphalt, x, y, tw, th);
      g.fillStyle = 'rgba(30,30,32,0.18)'; g.fillRect(0, 0, w, h);
    }
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 60 + Math.random() * 260;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); const v = Math.random() < 0.5 ? 0 : 255;
      gr.addColorStop(0, `rgba(${v},${v},${v},0.045)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
    for (let i = 0; i < (asphalt ? 0 : 260000); i++) {
      const v = 28 + Math.random() * 62 | 0; g.fillStyle = `rgba(${v},${v},${v + 3},0.75)`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    for (let i = 0; i < 6000; i++) { // light chippings
      const v = 105 + Math.random() * 60 | 0; g.fillStyle = `rgba(${v},${v},${v - 4},0.6)`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    const px = (m) => (m / 11) * w;
    g.fillStyle = 'rgba(120,120,115,0.1)'; g.fillRect(0, 0, px(1.9), h); g.fillRect(w - px(1.9), 0, px(1.9), h);
    for (const m of [2.6, 4.3, 6.7, 8.4]) {
      const gr = g.createLinearGradient(px(m) - 28, 0, px(m) + 28, 0);
      gr.addColorStop(0, 'rgba(15,15,17,0)'); gr.addColorStop(0.5, 'rgba(15,15,17,0.3)'); gr.addColorStop(1, 'rgba(15,15,17,0)');
      g.fillStyle = gr; g.fillRect(px(m) - 28, 0, 56, h);
    }
    // oil drips in the middle of each lane
    for (let i = 0; i < 70; i++) { const m = Math.random() < 0.5 ? 3.5 : 7.5; g.fillStyle = 'rgba(10,10,12,0.12)'; g.beginPath(); g.ellipse(px(m) + (Math.random() - 0.5) * 50, Math.random() * h, 6 + Math.random() * 14, 10 + Math.random() * 30, 0, 0, Math.PI * 2); g.fill(); }
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '24,24,26' : '68,68,70'},0.35)`; g.fillRect(px(2 + Math.random() * 6), Math.random() * h, 80 + Math.random() * 160, 60 + Math.random() * 240); }
    g.strokeStyle = 'rgba(10,10,10,0.6)'; g.lineWidth = 1.6;
    for (let i = 0; i < 40; i++) {
      let x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 10; k++) { x += (Math.random() - 0.5) * 50; y += Math.random() * 40; g.lineTo(x, y); } g.stroke();
    }
    // sealed joint (tar) lines across the road
    g.strokeStyle = 'rgba(8,8,9,0.5)'; g.lineWidth = 4;
    for (const y of [h * 0.37, h * 0.88]) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + (Math.random() - 0.5) * 6); g.stroke(); }
    const line = (x0, wd, col, y0 = 0, y1 = h) => {
      g.fillStyle = col; g.fillRect(x0, y0, wd, y1 - y0);
      // glass-bead sparkle and wear
      for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.6 ? 'rgba(45,45,47,0.55)' : 'rgba(255,255,255,0.5)'; g.fillRect(x0 + Math.random() * wd, y0 + Math.random() * (y1 - y0), 2, 2 + Math.random() * 4); }
    };
    line(px(1.9) - 12, 18, '#e8e8e1'); line(w - px(1.9) - 6, 18, '#e8e8e1');
    line(w / 2 - 10, 20, '#e2b51e', 0, h / 3);
  });
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function roadBumpTexture(renderer) {
  const c = noiseCanvas(512, 512, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) { const v = Math.random() * 255 | 0; g.fillStyle = `rgba(${v},${v},${v},0.8)`; const s = 1 + Math.random() * 3; g.fillRect(Math.random() * w, Math.random() * h, s, s); }
  });
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6.5);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
// value-noise helper for tileable textures
function tileNoise(S, octs) {
  const val = new Float32Array(S * S);
  for (const [f, a] of octs) {
    const grid = []; for (let i = 0; i < f * f; i++) grid.push(Math.random());
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const gx = x / S * f, gy = y / S * f, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
      const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const a0 = grid[(iy % f) * f + ix % f], a1 = grid[(iy % f) * f + (ix + 1) % f], a2 = grid[((iy + 1) % f) * f + ix % f], a3 = grid[((iy + 1) % f) * f + (ix + 1) % f];
      val[y * S + x] += a * (a0 + (a1 - a0) * ux + (a2 - a0) * uy + (a0 - a1 - a2 + a3) * ux * uy);
    }
  }
  return val;
}
// Ground detail: soil grain, tiny pebbles and grass strokes (grayscale, mean ~0.72)
export function detailTexture(renderer) {
  const S = 512;
  const c = noiseCanvas(S, S, (g) => {
    const val = tileNoise(S, [[4, 0.3], [8, 0.25], [16, 0.2], [32, 0.13], [64, 0.08], [128, 0.04]]);
    const img = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = Math.max(0, Math.min(255, (0.72 + (val[i] - 0.5) * 0.6 + (Math.random() - 0.5) * 0.1) * 255));
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // grass strokes (wrap around edges to stay tileable)
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * S, y = Math.random() * S, len = 3 + Math.random() * 7, a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const v = Math.random() < 0.5 ? 70 + Math.random() * 50 : 200 + Math.random() * 55;
      g.strokeStyle = `rgba(${v},${v},${v},0.35)`; g.lineWidth = 1;
      for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * len, y + dy + Math.sin(a) * len); g.stroke(); }
    }
    for (let i = 0; i < 700; i++) { // pebbles
      const x = Math.random() * S, y = Math.random() * S, r = 1 + Math.random() * 2.5;
      g.fillStyle = 'rgba(60,60,60,0.4)'; g.beginPath(); g.arc(x + 0.8, y + 0.8, r, 0, 7); g.fill();
      g.fillStyle = 'rgba(225,225,225,0.55)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
// Rock detail: cracks, strata and lichen (grayscale, mean ~0.72)
export function rockTexture(renderer) {
  const S = 512;
  const c = noiseCanvas(S, S, (g) => {
    const val = tileNoise(S, [[3, 0.3], [6, 0.25], [12, 0.2], [24, 0.14], [48, 0.08], [96, 0.05]]);
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const strata = Math.sin((y + val[i] * 60) / S * Math.PI * 2 * 9) * 0.06;
      const v = Math.max(0, Math.min(255, (0.72 + (val[i] - 0.5) * 0.75 + strata + (Math.random() - 0.5) * 0.08) * 255));
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) { // cracks
      let x = Math.random() * S, y = Math.random() * S; const w = 0.8 + Math.random() * 2;
      g.strokeStyle = 'rgba(25,25,25,0.6)'; g.lineWidth = w; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 12; k++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.3) * 30; g.lineTo(x, y); }
      g.stroke();
      g.strokeStyle = 'rgba(230,230,230,0.25)'; g.lineWidth = w * 0.6; g.translate(1, 1); g.stroke(); g.translate(-1, -1);
    }
    for (let i = 0; i < 260; i++) { const x = Math.random() * S, y = Math.random() * S; g.fillStyle = `rgba(${Math.random() < 0.5 ? '235,235,235' : '90,90,90'},0.18)`; g.beginPath(); g.arc(x, y, 2 + Math.random() * 7, 0, 7); g.fill(); }
  });
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

export function glowTexture() {
  const c = noiseCanvas(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.15, 'rgba(255,255,255,0.7)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Clouds with baked shading (bright tops, grey bellies)
export function cloudTextures(n = 4) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const c = noiseCanvas(512, 256, (g, w, h) => {
      const puffs = [];
      const cnt = 18 + Math.random() * 16;
      for (let i = 0; i < cnt; i++) {
        const u = Math.random();
        puffs.push([60 + u * 392, 150 - Math.sin(u * Math.PI) * (40 + Math.random() * 50) + Math.random() * 25, 25 + Math.random() * 45 * Math.sin(u * Math.PI + 0.3)]);
      }
      for (const [x, y, r] of puffs) {
        const gr = g.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      // shade bottoms
      g.globalCompositeOperation = 'source-atop';
      const sh = g.createLinearGradient(0, 60, 0, 190);
      sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.55, 'rgba(150,160,175,0.35)'); sh.addColorStop(1, 'rgba(110,118,135,0.75)');
      g.fillStyle = sh; g.fillRect(0, 0, w, h);
      // soft bottom fade
      g.globalCompositeOperation = 'destination-out';
      const fd = g.createLinearGradient(0, 165, 0, 215); fd.addColorStop(0, 'rgba(0,0,0,0)'); fd.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = fd; g.fillRect(0, 0, w, h);
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; out.push(t);
  }
  return out;
}
export function overcastTexture() {
  const c = noiseCanvas(512, 512, (g, w, h) => {
    g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 30 + Math.random() * 90;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function dropsTexture() {
  const c = noiseCanvas(512, 320, (g, w, h) => {
    for (let i = 0; i < 650; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 1 + Math.random() * Math.random() * 4;
      const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(200,210,220,0.35)'); gr.addColorStop(0.9, 'rgba(40,40,50,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * (1 + Math.random() * 0.4), 0, 0, Math.PI * 2); g.fill();
    }
  });
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Interior of the player car (right-hand drive; driver at x = -0.37)
export function buildInterior(paint) {
  const grp = new THREE.Group();
  const sideMirrors = [], roof = [], boxy = [], shell = []; let tag = null; // boxy: replaced by the smooth cabin model; shell: replaced by the car body seen from inside
  const mat = (c, rough = 0.85) => { const col = new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); return new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: 0, emissive: col.clone().multiplyScalar(0.06), envMapIntensity: 0.35 }); };
  const dark = mat([0.2, 0.2, 0.21]), trim = mat([0.34, 0.33, 0.32]), seat = mat([0.38, 0.32, 0.27], 0.95), head = mat([0.7, 0.68, 0.64]);
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.8 });
  const wood = mat([0.36, 0.22, 0.12], 0.5);
  const paintM = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(paint[0], paint[1], paint[2], THREE.SRGBColorSpace), roughness: 0.32, metalness: 0.35 });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; grp.add(o); if (tag) tag.push(o); return o; };
  const beam = (a, b, t, m) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const o = new THREE.Mesh(new THREE.CylinderGeometry(t / 2, t / 2, A.distanceTo(B), 8).rotateX(Math.PI / 2), m);
    o.position.copy(A).add(B).multiplyScalar(0.5); o.lookAt(B); o.castShadow = true; o.receiveShadow = true; grp.add(o); if (tag) tag.push(o); return o;
  };
  // dashboard: body + rounded top + wood trim strip
  tag = boxy;
  add(Box(1.62, 0.2, 0.5), dark, 0, 0.78, 0.9);
  const top = new THREE.CylinderGeometry(0.16, 0.16, 1.62, 16, 1, false, 0, Math.PI); top.rotateZ(Math.PI / 2);
  add(top, dark, 0, 0.86, 0.86, 0, Math.PI / 2 * 0, 0).scale.set(1, 0.55, 1.1);
  tag = null; add(Box(1.5, 0.035, 0.02), wood, 0.1, 0.8, 0.645); tag = boxy;
  add(Box(1.62, 0.04, 0.32), trim, 0, 0.93, 1.1, 0.22);
  // gauge binnacle
  const bin = new THREE.CylinderGeometry(0.17, 0.17, 0.2, 16, 1, true, -Math.PI / 2, Math.PI); bin.rotateX(Math.PI / 2);
  add(bin, dark, -0.37, 0.88, 0.74).scale.set(1.35, 0.55, 1);
  add(Box(0.46, 0.012, 0.22), dark, -0.37, 0.975, 0.76);
  tag = null;
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  add(new THREE.CircleGeometry(0.075, 24), glowMat, -0.47, 0.885, 0.66, -0.25, Math.PI);
  add(new THREE.CircleGeometry(0.075, 24), glowMat, -0.27, 0.885, 0.66, -0.25, Math.PI);
  // centre console, gear lever, vents, screen
  tag = boxy; add(Box(0.26, 0.3, 0.9), trim, 0, 0.55, 0.3);
  add(Box(0.3, 0.32, 0.06), dark, 0, 0.74, 0.66, -0.15); tag = null;
  const screen = new THREE.MeshBasicMaterial({ color: 0x0b1420 }); add(Box(0.22, 0.13, 0.01), screen, 0, 0.78, 0.627, -0.15);
  beam([0.0, 0.72, 0.15], [0.0, 0.86, 0.12], 0.025, chrome);
  add(new THREE.SphereGeometry(0.035, 10, 8), dark, 0, 0.87, 0.12);
  for (const x of [-0.65, 0.65, 0.12, -0.12]) add(Box(0.16, 0.06, 0.02), dark, x, 0.84, 0.645);
  tag = shell;
  for (const s of [1, -1]) {
    add(Box(0.08, 0.5, 2.4), trim, s * 0.86, 0.64, -0.25);
    add(Box(0.14, 0.04, 2.4), dark, s * 0.83, 0.9, -0.25);
    add(Box(0.03, 0.03, 0.18), chrome, s * 0.81, 0.78, 0.35);
    beam([s * 0.79, 0.92, 1.02], [s * 0.72, 1.52, 0.3], 0.07, dark);   // A-pillar
    roof.push(beam([s * 0.85, 0.9, -0.55], [s * 0.76, 1.54, -0.55], 0.09, trim)); // B-pillar
    roof.push(beam([s * 0.85, 0.9, -1.38], [s * 0.66, 1.52, -1.0], 0.12, trim));  // C-pillar
    roof.push(beam([s * 0.72, 1.53, 0.3], [s * 0.7, 1.53, -1.0], 0.06, trim));    // roof rail
    // side mirror: housing + reflective face angled between the driver's eye and the road behind
    {
      const mp = new THREE.Vector3(s * 1.03, 0.99, 0.8);
      const toEye = new THREE.Vector3(-0.37, 1.22, -0.05).sub(mp).normalize();
      const back = new THREE.Vector3(s * 0.22, 0, -1).normalize();
      const gm = new THREE.Group(); gm.position.copy(mp); gm.lookAt(mp.clone().add(toEye).add(back));
      const hs = new THREE.Mesh(Box(0.25, 0.155, 0.085), paintM); hs.position.z = -0.048; hs.castShadow = true; gm.add(hs); shell.push(hs);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.225, 0.13), new THREE.MeshBasicMaterial({ color: 0x8a96a3 }));
      face.position.z = -0.004; gm.add(face);
      grp.add(gm);
      beam([s * 0.86, 0.93, 0.86], [s * 0.96, 0.97, 0.83], 0.035, dark);
      sideMirrors.push({ face, pos: mp, side: s });
    }
    roof.push(add(Box(0.3, 0.02, 0.16), head, s * 0.42, 1.53, 0.2, -0.15)); // sun visors
  }
  roof.push(beam([-0.72, 1.52, 0.3], [0.72, 1.52, 0.3], 0.06, dark));
  roof.push(add(Box(1.5, 0.05, 1.32), head, 0, 1.57, -0.36));
  tag = boxy;
  add(Box(1.5, 0.04, 0.35), dark, 0, 0.98, -1.55);
  add(Box(1.5, 0.42, 0.5), seat, 0, 0.55, -1.1);
  add(Box(1.5, 0.55, 0.12), seat, 0, 0.98, -1.38, -0.15);
  add(Box(0.5, 0.15, 0.52), seat, 0.37, 0.45, -0.15);
  add(Box(0.52, 0.68, 0.12), seat, 0.37, 0.88, -0.47, -0.12);
  add(Box(0.26, 0.18, 0.1), seat, 0.37, 1.3, -0.53);
  tag = null;
  // steering wheel
  const wheel = new THREE.Group();
  wheel.position.set(-0.37, 0.86, 0.5); wheel.rotation.x = -0.38;
  const wm = mat([0.06, 0.06, 0.06], 0.6);
  const wiperMat = new THREE.MeshLambertMaterial({ color: 0x050505 }); // matte black, no sky reflection
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.024, 10, 36), wm); rim.castShadow = true; wheel.add(rim);
  const hub = new THREE.Mesh(Cyl(0.06, 0.07, 0.06, 16), wm); hub.rotation.x = Math.PI / 2; wheel.add(hub);
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.025, 16), chrome); logo.position.z = -0.032; logo.rotation.y = Math.PI; wheel.add(logo);
  for (const a of [0, Math.PI, -Math.PI / 2]) {
    const sp = new THREE.Mesh(Box(0.17, 0.035, 0.02), wm);
    sp.position.set(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0); sp.rotation.z = a; wheel.add(sp);
  }
  grp.add(wheel); boxy.push(...wheel.children);
  tag = boxy; beam([-0.37, 0.82, 0.6], [-0.37, 0.76, 0.85], 0.05, wm); tag = null;
  // wipers
  const wipers = [];
  for (const x of [-0.45, 0.2]) {
    const piv = new THREE.Group(); piv.position.set(x, 0.93, 1.16); piv.rotation.x = -1.0;
    const arm = new THREE.Mesh(Box(0.6, 0.008, 0.012), wiperMat); arm.position.x = 0.3; piv.add(arm);
    const blade = new THREE.Mesh(Box(0.5, 0.014, 0.01), wiperMat); blade.position.set(0.33, 0.01, 0.006); piv.add(blade);
    grp.add(piv); wipers.push(piv);
  }
  // windshield rain drops
  const drops = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.95), new THREE.MeshBasicMaterial({ map: dropsTexture(), transparent: true, opacity: 0, depthWrite: false, color: 0x9aa4ae }));
  drops.position.set(0, 1.22, 0.64); drops.lookAt(0, 1.22 - 0.72, 0.64 - 0.6); drops.material.side = THREE.DoubleSide;
  grp.add(drops);
  // hood
  const hood = new THREE.Group();
  const hoodM = paintM.clone();
  const h1 = new THREE.Mesh(Box(1.72, 0.08, 1.8), hoodM); h1.position.set(0, 0.9, 1.95); h1.rotation.x = 0.07; h1.receiveShadow = true; hood.add(h1);
  return { grp, wheel, wipers, hood, glowMat, drops, screen, sideMirrors, paintM, hoodM, roof, boxy, shell, mats: { idark: dark, itrim: trim, iseat: seat, igrip: wm, chrome } };
}

// Crossed-quad billboard for a plant sprite: 3 vertical quads at 60 degrees, pivot at the base
export function billboardGeo(height, aspect) {
  const w = height * aspect, p = [], uv = [], n = [], c = [], t = [], s = [], idx = [];
  for (let q = 0; q < 1; q++) { // one card; the shader turns it to face the camera (crossed cards showed the trunk 3 times)
    const a = (q / 3) * Math.PI, cx = Math.cos(a) * w / 2, cz = Math.sin(a) * w / 2, b = p.length / 3;
    p.push(-cx, -0.15, -cz, cx, -0.15, cz, cx, height, cz, -cx, height, -cz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    // normals lean up/outward so the foliage is lit like a volume rather than a flat card
    for (let k = 0; k < 4; k++) { n.push(0, 1, 0); c.push(1, 1, 1); t.push(1); s.push(k < 2 ? 0 : 1); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(t, 1));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(s, 1));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}
