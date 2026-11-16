// ===== WebGPU build only: node-material (TSL) versions of the custom shaders =====
// In the WebGPU build `three` resolves to three.webgpu.js, which also exports the TSL node functions used here.
// None of this runs in the WebGL build (every caller checks __GPU__ first).
import * as THREE from 'three';

export const GPU = __GPU__;
const T = THREE;

// shared wind clock (the WebGL materials read wind.uTime / wind.uStrength; the node ones read these uniforms)
export const gpuWind = GPU ? { time: T.uniform(0), strength: T.uniform(1) } : null;
export const gpuSun = GPU ? { dir: T.uniform(new T.Vector3(0, 1, 0)), col: T.uniform(new T.Vector3(1, 1, 1)) } : null;   // light direction and colour x intensity, for leaf translucency

// up-facing normal in view space: foliage cards and grass blades are lit like the ground they stand on
const upNormal = () => T.cameraViewMatrix.mul(T.vec4(0, 1, 0, 0)).xyz.normalize();

// vertex colour, with the per-instance tint applied only where aTint = 1 (trunks keep their colour, leaves take the tint).
// The renderer multiplies an instanced mesh's colour by its instance colour afterwards, so divide that back out where aTint = 0.
function tintColor(geomHasTint = true) {
  return T.Fn((a, b) => {
    const builder = b || a;
    const vc = T.attribute('color', 'vec3');
    if (!builder.object?.instanceColor || !geomHasTint) return vc;
    const ic = T.varyingProperty('vec3', 'vInstanceColor');
    const t = T.attribute('aTint', 'float');
    return T.mix(vc.div(T.max(ic, T.vec3(0.002))), vc, t);
  })();
}

// value noise on the object's own coordinates (the WebGL version's tn3)
const h3 = T.Fn ? T.Fn(([p]) => T.fract(T.sin(T.dot(p, T.vec3(127.1, 311.7, 74.7))).mul(43758.5453))) : null;
const n3 = T.Fn ? T.Fn(([p]) => {
  const i = T.floor(p), f0 = T.fract(p), f = f0.mul(f0).mul(T.float(3).sub(f0.mul(2)));
  const a = T.mix(T.mix(h3(i), h3(i.add(T.vec3(1, 0, 0))), f.x), T.mix(h3(i.add(T.vec3(0, 1, 0))), h3(i.add(T.vec3(1, 1, 0))), f.x), f.y);
  const b = T.mix(T.mix(h3(i.add(T.vec3(0, 0, 1))), h3(i.add(T.vec3(1, 0, 1))), f.x), T.mix(h3(i.add(T.vec3(0, 1, 1))), h3(i.add(T.vec3(1, 1, 1))), f.x), f.y);
  return T.mix(a, b, f.z);
}) : null;
export { h3, n3 };

// Lambert "tint" material: per-instance tint, wind sway, procedural surface grain
export function tintMatGPU({ swayBase = 1.2, swayAmp = 0.022, flat = true, side = T.FrontSide, texScale = 4 } = {}) {
  const m = new T.MeshLambertNodeMaterial({ flatShading: flat, side });
  const p0 = T.attribute('position', 'vec3');
  let col = tintColor();
  if (texScale > 0) {
    const g = n3(p0.mul(texScale)).mul(0.55).add(n3(p0.mul(texScale * 3.1)).mul(0.3)).add(n3(p0.mul(texScale * 9.3)).mul(0.15));
    col = col.mul(g.mul(0.42).add(0.8));
  }
  const base = col;
  m.colorNode = T.Fn((a, b) => { const builder = b || a, mm = builder.material; return mm.map ? base.mul(T.texture(mm.map, T.uv()).rgb) : base; })();   // walls and roofs set .map after creation
  if (swayAmp > 0) {
    m.positionNode = T.Fn((a, b) => {
      const builder = b || a;
      if (!builder.object?.isInstancedMesh) return T.positionLocal;
      const p = T.positionLocal;                                   // already moved by the instance matrix
      const ph = gpuWind.time.mul(1.7).add(p.x.mul(0.11)).add(p.z.mul(0.13));
      const k = T.attribute('aSway', 'float').mul(T.max(p0.y.sub(swayBase), 0)).mul(swayAmp).mul(gpuWind.strength);
      return p.add(T.vec3(T.sin(ph).add(T.sin(ph.mul(2.7)).mul(0.4)).mul(k), 0, T.cos(ph.mul(0.83)).mul(k).mul(0.7)));
    })();
  }
  if (side === T.DoubleSide && !flat) m.normalNode = upNormal();
  return m;
}

// PBR tint material for vehicles: per-vertex roughness / metalness
export function tintStdMatGPU() {
  const m = new T.MeshStandardNodeMaterial({ roughness: 1, metalness: 1 });
  m.colorNode = tintColor();
  m.roughnessNode = T.materialRoughness.mul(T.attribute('aRough', 'float'));
  m.metalnessNode = T.materialMetalness.mul(T.attribute('aMetal', 'float'));
  return m;
}

// photo-tree / bush sprites: texture with the magenta chroma-key spill removed
export function spriteMatGPU(map, despill) {
  const m = new T.MeshLambertNodeMaterial({ side: T.DoubleSide, alphaTest: 0.5, transparent: false });
  m.map = map;
  const tx = T.texture(map, T.uv());
  let c = tx.rgb;
  if (despill) { const sp = T.max(T.min(c.r, c.b).sub(c.g), 0); c = T.vec3(c.r.sub(sp), c.g.add(sp.mul(0.3)), c.b.sub(sp)); }
  m.colorNode = T.vec4(c.mul(tintColor(false)), tx.a);
  m.opacityNode = tx.a;
  m.normalNode = upNormal();
  // turn each card about its own upright axis to face the camera (in the shadow pass: the light)
  m.positionNode = T.Fn((a, b) => {
    const builder = b || a, obj = builder.object;
    if (!obj?.isInstancedMesh) return T.positionLocal;
    let ib = obj.userData.ibuf; if (!ib) ib = obj.userData.ibuf = new T.InstancedInterleavedBuffer(obj.instanceMatrix.array, 16, 1);
    const c0 = T.instancedBufferAttribute(ib, 'vec4', 16, 0), c3 = T.instancedBufferAttribute(ib, 'vec4', 16, 12);
    const sc = c0.xyz.length(), ctr = c3.xyz;
    const cw = T.modelWorldMatrix.mul(T.vec4(ctr, 1)).xyz, tc = T.cameraPosition.sub(cw);
    const th = T.atan2(tc.x, tc.z), p0 = T.attribute('position', 'vec3');
    return ctr.add(T.vec3(p0.x.mul(T.cos(th)), p0.y, p0.x.mul(T.sin(th)).negate()).mul(sc));
  })();
  return m;
}

// terrain without image textures: vertex colours x procedural grass / rock detail
export function terrainMatGPU(detailTex, rockTex) {
  const m = new T.MeshLambertNodeMaterial();
  const u = T.uv();
  const g = T.texture(detailTex, u).rgb.mul(T.texture(detailTex, u.mul(0.173).add(T.vec2(0.31, 0.57))).rgb).mul(1.95);
  const r = T.texture(rockTex, u.mul(0.55)).rgb.mul(T.texture(rockTex, u.mul(0.083).add(T.vec2(0.2, 0.7))).rgb).mul(1.95);
  m.colorNode = T.attribute('color', 'vec3').mul(T.mix(g, r, T.attribute('aRock', 'float')));
  return m;
}

// terrain with the generated ground photos: 8 layers blended by per-vertex weights, cliffs mapped from three sides
export function splatMatGPU(texs, scales) {
  const m = new T.MeshLambertNodeMaterial();
  const wp = T.positionWorld, P = wp.xz;
  const nw = T.normalWorld.abs().pow(4), tn = nw.div(nw.x.add(nw.y).add(nw.z));
  const flatS = (t, s) => T.mix(T.texture(t, P.div(s)).rgb, T.texture(t, P.div(s * 3.7).add(T.vec2(0.37, 0.71))).rgb, 0.33);
  const triS = (t, s) => T.texture(t, wp.xz.div(s)).rgb.mul(tn.y).add(T.texture(t, wp.xy.div(s)).rgb.mul(tn.z)).add(T.texture(t, wp.zy.div(s)).rgb.mul(tn.x));
  const w0 = T.attribute('aW0', 'vec4'), w1 = T.attribute('aW1', 'vec4');
  const acc = flatS(texs[0], scales[0]).mul(w0.x).add(flatS(texs[1], scales[1]).mul(w0.y)).add(flatS(texs[2], scales[2]).mul(w0.z)).add(flatS(texs[3], scales[3]).mul(w0.w))
    .add(flatS(texs[4], scales[4]).mul(w1.x)).add(triS(texs[5], scales[5]).mul(w1.y)).add(triS(texs[6], scales[6]).mul(w1.z)).add(flatS(texs[7], scales[7]).mul(w1.w));
  m.colorNode = T.attribute('color', 'vec3').mul(acc);
  return m;
}

// Blender car body: the inside faces read as dark trim from the cockpit
export function innerDarkGPU(mat) {
  mat.colorNode = T.select(T.frontFacing, T.materialColor, T.vec3(0.05, 0.048, 0.046));
  return mat;
}

// ----- glowing points (lamp halos, cat's eyes, rain, fireflies...) -----
// WebGPU draws points one pixel wide, so each point becomes a camera-facing sprite, all of a cloud in one instanced draw.
// glowDef() stands in for a shared PointsMaterial (color / opacity / visible are shared by every cloud made from it);
// glowPoints() wraps a BufferGeometry: change its position / color arrays and set needsUpdate as before.
export function glowDef(pm) {
  const color = T.uniform(new T.Color(pm.color ?? 0xffffff)), op = T.uniform(pm.opacity ?? 1), size = T.uniform(pm.size ?? 1);
  return { isGlowDef: true, pm, color: color.value, opacityU: op, colorU: color, sizeU: size, get opacity() { return op.value; }, set opacity(v) { op.value = v; }, get size() { return size.value; }, set size(v) { size.value = v; }, visible: true };
}
export function glowPoints(geo, def) {
  const pm = def.pm;
  const m = new T.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: pm.blending ?? T.NormalBlending, fog: pm.fog ?? true });
  const pos = geo.attributes.position, col = geo.attributes.color;
  m.positionNode = T.instancedDynamicBufferAttribute(pos, 'vec3');
  let c = def.colorU;
  if (pm.vertexColors && col) c = c.mul(T.instancedDynamicBufferAttribute(col, 'vec3'));
  const tx = pm.map ? T.texture(pm.map) : null;
  m.colorNode = tx ? T.vec4(c.mul(tx.rgb), tx.a.mul(def.opacityU)) : T.vec4(c, def.opacityU);
  m.scaleNode = def.sizeU.mul(pm.sizeAttenuation === false ? 1 : 0.73);
  const sp = new T.Sprite(m);
  sp.count = pos.count; sp.frustumCulled = false; sp.isGlow = true; sp.srcGeo = geo;
  sp.onBeforeRender = () => { sp.count = Math.min(pos.count, geo.drawRange.count); if (!def.visible) sp.count = 0; };
  return sp;
}

// ---------------- building surfaces drawn in the shader (no texture images) ----------------
// uv is in "texture repeats" as laid out by the building models; each kind paints its own pattern over the tint.
export function surfaceMatGPU(kind) {
  const m = new T.MeshLambertNodeMaterial({ flatShading: true });
  const uv = T.uv(), u = uv.x, v = uv.y, p0 = T.attribute('position', 'vec3');
  const hash = (x) => T.fract(T.sin(x.mul(127.1)).mul(43758.5453));
  const fine = n3(p0.mul(9)).mul(0.6).add(n3(p0.mul(31)).mul(0.4));          // 0..1 speckle
  let pat;
  if (kind === 'wood_wall') {            // upright boards: each its own shade, dark joints, long grain
    const n = u.mul(9), id = T.floor(n), f = T.fract(n);
    const joint = T.smoothstep(0.0, 0.06, f).mul(T.smoothstep(1.0, 0.94, f));
    const grain = T.sin(v.mul(60).add(T.sin(u.mul(140).add(id.mul(9))).mul(2.5))).mul(0.06).add(n3(T.vec3(u.mul(90), v.mul(5), id)).mul(0.22));
    pat = T.vec3(0.5, 0.33, 0.2).mul(hash(id).mul(0.3).add(0.72).add(grain)).mul(joint.mul(0.75).add(0.25));
  } else if (kind === 'log_wall') {      // stacked round logs
    const n = v.mul(7), id = T.floor(n), f = T.fract(n);
    const round = T.sin(f.mul(3.14159)).pow(0.5);
    const grain = n3(T.vec3(u.mul(6), id, v.mul(60))).mul(0.25);
    pat = T.vec3(0.46, 0.31, 0.18).mul(round.mul(0.75).add(0.25)).mul(hash(id).mul(0.25).add(0.8).add(grain));
  } else if (kind === 'roof_tiles') {    // overlapping rows of curved clay tiles
    const r = v.mul(6), row = T.floor(r), fr = T.fract(r);
    const c = u.mul(9).add(row.mul(0.5)), col = T.floor(c), fc = T.fract(c);
    const barrel = T.sin(fc.mul(3.14159)).mul(0.45).add(0.55);
    const lap = T.smoothstep(0.0, 0.22, fr).mul(0.55).add(0.45);                 // shadow under the row above
    pat = T.vec3(0.66, 0.27, 0.16).mul(barrel).mul(lap).mul(hash(col.add(row.mul(17.3))).mul(0.35).add(0.75)).mul(fine.mul(0.2).add(0.9));
  } else if (kind === 'roof_metal') {    // corrugated sheet with streaks of weathering
    const rib = T.sin(u.mul(75)).mul(0.5).add(0.5);
    const streak = n3(T.vec3(u.mul(30), v.mul(1.5), 3)).mul(0.25);
    pat = T.vec3(0.8, 0.8, 0.82).mul(rib.mul(0.35).add(0.65)).mul(T.float(0.85).add(streak));
  } else {                               // painted render: soft blotches, grime rising from the ground
    const blot = n3(p0.mul(0.9)).mul(0.12).add(fine.mul(0.08));
    const grime = T.smoothstep(1.2, 0.0, p0.y).mul(0.18);
    pat = T.vec3(0.95, 0.94, 0.9).mul(T.float(0.9).add(blot).sub(grime));
  }
  m.colorNode = tintColor().mul(pat);
  return m;
}
