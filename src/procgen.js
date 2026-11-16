// ===== WebGPU build: plants and ground made entirely in code (no photos, no models) =====
// Trees are grown as real branch structures (smooth tapered tubes) carrying clusters of leaf cards; the leaves
// themselves are drawn by the shader (leaf outlines, needles, palm leaflets), lit as a soft volume, and move in the wind.
import * as THREE from 'three';
import { gpuWind, gpuSun, n3 } from './gpu.js';
const T = THREE;

// ---------------- geometry builder ----------------
class PB {
  constructor(thin = 1) { this.thin = thin; this.cnt = 0; this.p = []; this.n = []; this.c = []; this.u = []; this.t = []; this.w = []; this.l = []; this.i = []; }
  vert(p, n, c, u, tint, sway, leaf) { this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.c.push(c[0], c[1], c[2]); this.u.push(u[0], u[1]); this.t.push(tint); this.w.push(sway); this.l.push(leaf); return this.p.length / 3 - 1; }
  // smooth tapered tube along a path of points
  tube(pts, r0, r1, col, sway = 0, seg = 7) {
    if (this.thin > 1) { if (r0 < (this.thin > 8 ? 0.06 : 0.03)) return; seg = Math.max(3, Math.round(seg / (this.thin > 8 ? 2.5 : 1.6))); }   // distant versions: no twigs, rounder is wasted
    const n = pts.length, base = this.p.length / 3;
    const up = new T.Vector3(0, 1, 0), t = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3(), q = new T.Vector3(), nn = new T.Vector3();
    for (let i = 0; i < n; i++) {
      t.copy(pts[Math.min(n - 1, i + 1)]).sub(pts[Math.max(0, i - 1)]).normalize();
      a.copy(Math.abs(t.y) > 0.95 ? new T.Vector3(1, 0, 0) : up).cross(t).normalize(); b.copy(t).cross(a).normalize();
      const r = r0 + (r1 - r0) * (i / (n - 1)), sw = typeof sway === 'function' ? sway(i / (n - 1)) : sway;
      for (let k = 0; k <= seg; k++) {
        const ang = (k / seg) * Math.PI * 2;
        nn.copy(a).multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
        q.copy(pts[i]).addScaledVector(nn, r);
        this.vert(q, nn, col, [k / seg, i / (n - 1)], 0, sw, 0);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) { const a0 = base + i * (seg + 1) + k, a1 = a0 + seg + 1; this.i.push(a0, a1, a0 + 1, a0 + 1, a1, a1 + 1); }
  }
  // a leaf card (quad) at c, spanned by u / v half-axes, with a shared "volume" normal
  card(c, u, v, nrm, kind, col = [1, 1, 1], sway = 1) {
    const b = this.p.length / 3, q = new T.Vector3();
    for (const [su, sv, uu, vv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) { q.copy(c).addScaledVector(u, su).addScaledVector(v, sv); this.vert(q, nrm, col, [uu, vv], 1, sway, kind); }
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // a curved strip (palm frond / banana / grass-like leaf): spine points, half-width per point
  strip(pts, widths, side, nrmFn, kind, col = [1, 1, 1], sway = 1) {
    const b = this.p.length / 3, q = new T.Vector3();
    for (let i = 0; i < pts.length; i++) {
      const nrm = nrmFn(i / (pts.length - 1));
      for (const s of [-1, 1]) { q.copy(pts[i]).addScaledVector(side, s * widths[i]); this.vert(q, nrm, col, [(s + 1) / 2, i / (pts.length - 1)], 1, sway, kind); }
    }
    for (let i = 0; i < pts.length - 1; i++) { const a = b + i * 2; this.i.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  sphere(c, r, col, seg = 8) { const g = new T.SphereGeometry(r, seg, Math.max(4, seg / 2)); this.merge(g, c, col); }
  merge(g, c, col, tint = 0, sway = 0) {
    const b = this.p.length / 3, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, q = new T.Vector3(), nn = new T.Vector3();
    for (let k = 0; k < P.count; k++) this.vert(q.fromBufferAttribute(P, k).add(c), nn.fromBufferAttribute(N, k), col, U ? [U.getX(k), U.getY(k)] : [0, 0], tint, sway, 0);
    const I = g.index; if (I) for (let k = 0; k < I.count; k++) this.i.push(b + I.getX(k)); else for (let k = 0; k < P.count; k++) this.i.push(b + k);
  }
  build() {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(this.u, 2));
    g.setAttribute('aTint', new T.Float32BufferAttribute(this.t, 1));
    g.setAttribute('aSway', new T.Float32BufferAttribute(this.w, 1));
    g.setAttribute('aLeaf', new T.Float32BufferAttribute(this.l, 1));
    g.setIndex(this.i); g.computeBoundingSphere();
    return g;
  }
}

const lin = (v) => Math.pow(v, 2.2);
const L3 = (r, g, b) => [lin(r), lin(g), lin(b)];
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const V = (x, y, z) => new T.Vector3(x, y, z);

// ---------------- plants: every leaf is real geometry ----------------
// Same idea as the reference scene: no leaf cards or cut-out masks. A tree is a branch skeleton of smooth tubes and
// each leaf is its own small curved, cupped, twisted blade, so silhouettes, parallax and lighting are all true.
const tmpA = new T.Vector3(), tmpB = new T.Vector3();
// one leaf blade: 3 vertices across (so it can cup along the midrib) x rows along a drooping arc
PB.prototype.blade = function (base, dir, side, len, wid, o, out, col, leaf, sway = 1) {
  if (this.thin > 1) { if (this.cnt++ % this.thin) return; wid *= Math.pow(this.thin, 0.6); len *= Math.pow(this.thin, 0.4); }   // distant versions: fewer, larger leaves covering the same area
  const rows = this.thin > 8 ? Math.min(2, o.rows || 4) : o.rows || 4, cup = o.cup ?? 0.25, s0 = o.s0 || 0.75, s1 = o.s1 || 0.7, tw = o.tw || 0, nb = o.nb ?? 0.4;
  const sd = side.clone().addScaledVector(dir, -side.dot(dir)).normalize();
  const N = new T.Vector3().crossVectors(sd, dir).normalize();
  if (N.dot(out) < 0) { sd.negate(); N.negate(); }               // the front of the leaf faces out of the crown
  let kk = (o.k ?? 0.7) * (N.y >= -0.2 ? 1 : -1); if (Math.abs(kk) < 0.05) kk = 0.05;   // tips hang with gravity
  const b = this.p.length / 3, sp = new T.Vector3(), Tv = new T.Vector3(), Nv = new T.Vector3(), S = new T.Vector3(), N2 = new T.Vector3(), q = new T.Vector3(), nn = new T.Vector3();
  for (let i = 0; i <= rows; i++) {
    const v = i / rows, a = kk * v, sn = Math.sin(a), cs = Math.cos(a);
    sp.copy(base).addScaledVector(dir, len * sn / kk).addScaledVector(N, -len * (1 - cs) / kk);
    Nv.copy(N).multiplyScalar(cs).addScaledVector(dir, sn);
    const ta = tw * v; S.copy(sd).multiplyScalar(Math.cos(ta)).addScaledVector(Nv, Math.sin(ta)); N2.copy(Nv).multiplyScalar(Math.cos(ta)).addScaledVector(sd, -Math.sin(ta));
    const w = wid * Math.pow(Math.max(Math.sin(Math.PI * Math.pow(v, s0)), 0), s1);
    for (let u = -1; u <= 1; u++) {
      q.copy(sp).addScaledVector(S, u * w).addScaledVector(N2, cup * w * Math.abs(u));
      nn.copy(N2).addScaledVector(S, -u * cup * 1.6).normalize().multiplyScalar(1 - nb).addScaledVector(out, nb).normalize();
      this.vert(q, nn, col, [u, v], 1, typeof sway === 'function' ? sway(v) : sway, leaf);
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < 2; j++) { const a = b + i * 3 + j; this.i.push(a, a + 1, a + 3, a + 1, a + 4, a + 3); }
};
// a conifer needle: a thin diamond (2 triangles)
PB.prototype.needle = function (base, dir, side, len, wid, out, col, leaf) {
  if (this.thin > 1) { if (this.cnt++ % this.thin) return; wid *= Math.pow(this.thin, 0.7); len *= Math.pow(this.thin, 0.3); }
  const b = this.p.length / 3, sd = tmpA.copy(side).addScaledVector(dir, -side.dot(dir)).normalize(), N = tmpB.crossVectors(sd, dir).normalize();
  if (N.dot(out) < 0) { sd.negate(); N.negate(); }
  const nn = N.clone().multiplyScalar(0.5).addScaledVector(out, 0.5).normalize(), q = new T.Vector3();
  this.vert(base, nn, col, [0, 0], 1, 1, leaf);
  this.vert(q.copy(base).addScaledVector(dir, len * 0.45).addScaledVector(sd, wid), nn, col, [1, 0.45], 1, 1, leaf);
  this.vert(q.copy(base).addScaledVector(dir, len), nn, col, [0, 1], 1, 1, leaf);
  this.vert(q.copy(base).addScaledVector(dir, len * 0.45).addScaledVector(sd, -wid), nn, col, [-1, 0.45], 1, 1, leaf);
  this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
};

// grow a tree skeleton the way real trees branch: every limb carries its children spaced along its length, spiralling
// round it at the golden angle, shorter toward the tip. Returns the twigs (outer two levels) that carry the leaves.
function grow(B, R, o) {
  const { H, r, n, ang, levels = n.length, crown = 0.4, len0 = 0.5, lenR = 0.55, trop = 0.2, wob = 0.2, lean = 0.12, barkCol, shape = (t) => 0.62 + 0.42 * Math.sin(Math.PI * (0.12 + 0.8 * t)) } = o;
  const twigs = [], ax = V(0, 0, 0);
  const branch = (p0, dir, len, rad, lvl, az0, sw0) => {
    const segs = lvl === 0 ? 9 : lvl === 1 ? 6 : 4, pts = [p0.clone()], dirs = [], d = dir.clone(), p = p0.clone(), wk = wob * (lvl ? 1 : 0.35);
    for (let i = 0; i < segs; i++) {
      d.x += (R() - 0.5) * wk; d.z += (R() - 0.5) * wk; d.y += (lvl ? trop * 0.35 : 0.06) + (R() - 0.5) * wk * 0.5; d.normalize();
      p.addScaledVector(d, len / segs); pts.push(p.clone()); dirs.push(d.clone());
    }
    const tip = lvl === 0 ? 0.14 : 0.4;
    B.tube(pts, rad, rad * tip, barkCol, (t) => Math.min(1, sw0 + t * 0.3), lvl === 0 ? 11 : lvl === 1 ? 7 : lvl === 2 ? 5 : 4);
    if (lvl >= levels - 1) twigs.push({ pts });
    if (lvl >= levels) return;
    const cnt = n[lvl], f0 = lvl === 0 ? crown : 0.22;
    for (let k = 0; k < cnt; k++) {
      const t = (k + R() * 0.7) / cnt, f = Math.min(0.999, f0 + (1 - f0) * t), fi = f * segs, i0 = Math.floor(fi), tng = dirs[i0];
      const pos = pts[i0].clone().lerp(pts[i0 + 1], fi - i0);
      ax.set(0, 1, 0); if (Math.abs(tng.y) > 0.92) ax.set(1, 0, 0);
      const p1 = ax.clone().cross(tng).normalize(), p2 = tng.clone().cross(p1), az = az0 + k * 2.39996 + (R() - 0.5) * 0.6;
      const a = (ang[lvl] ?? ang[ang.length - 1]) * (0.82 + R() * 0.36) * (lvl === 0 ? 1.2 - 0.5 * t : 1);
      const nd = tng.clone().multiplyScalar(Math.cos(a)).addScaledVector(p1, Math.cos(az) * Math.sin(a)).addScaledVector(p2, Math.sin(az) * Math.sin(a));
      nd.y += trop; nd.normalize();
      const cl = (lvl === 0 ? H * len0 * shape(t) : len * lenR * (1 - 0.45 * t)) * (0.8 + R() * 0.4);
      branch(pos, nd, cl, Math.max(0.006, rad * (1 - (1 - tip) * f) * (lvl === 0 ? 0.5 : 0.6)), lvl + 1, R() * 6.283, Math.min(1, sw0 + 0.3));
    }
  };
  branch(V(0, -0.3, 0), V((R() - 0.5) * lean, 1, (R() - 0.5) * lean).normalize(), H, r, 0, R() * 6.283, 0);
  return twigs;
}
function crownOf(twigs) {
  const cen = V(0, 0, 0); let n = 0, rad = 0;
  for (const t of twigs) for (const p of t.pts) { cen.add(p); n++; }
  cen.multiplyScalar(1 / Math.max(1, n));
  for (const t of twigs) for (const p of t.pts) rad = Math.max(rad, p.distanceTo(cen));
  return { cen, rad: rad || 1 };
}
// leaves along the twigs, spiralling round them; shaded darker deep inside the crown (baked occlusion)
function leafTwigs(B, R, twigs, cr, { per = 3, len = 0.4, wid = 0.1, from = 1, kind = 1, o = {}, fwd = 0.5, hang = 0, tip = true }) {
  const Tn = V(0, 0, 0), p1 = V(0, 0, 0), p2 = V(0, 0, 0), dir = V(0, 0, 0), side = V(0, 0, 0), out = V(0, 0, 0), base = V(0, 0, 0);
  const one = (p, tng, a) => {
    p1.set(0, 1, 0).cross(tng); if (p1.lengthSq() < 0.01) p1.set(1, 0, 0); p1.normalize(); p2.crossVectors(tng, p1);
    dir.copy(p1).multiplyScalar(Math.cos(a)).addScaledVector(p2, Math.sin(a));
    side.crossVectors(tng, dir).normalize();
    dir.multiplyScalar(0.9).addScaledVector(tng, fwd + R() * 0.3); dir.y -= hang; dir.normalize();
    out.copy(p).sub(cr.cen); const dist = out.length() / cr.rad; out.y += 0.35 * cr.rad; out.normalize();
    const ao = 0.5 + 0.5 * Math.min(1, Math.max(0, (dist - 0.25) / 0.6)) ** 1.3, s = R();
    const col = [ao * (0.92 + 0.2 * s), ao, ao * (1.05 - 0.3 * s)];
    const L = len * (0.7 + R() * 0.6);
    B.blade(base.copy(p), dir, side, L, wid * L / len, { ...o, tw: (o.tw || 0) + (R() - 0.5) * 0.9 }, out, col, kind + R() * 0.9, (v) => 1);
  };
  for (const tw of twigs) {
    const P = tw.pts, n = P.length;
    for (let i = from; i < n; i++) {
      Tn.copy(P[Math.min(n - 1, i + 1)]).sub(P[Math.max(0, i - 1)]).normalize();
      for (let j = 0; j < per; j++) {
        const f = R(), q = i < n - 1 ? P[i].clone().lerp(P[i + 1], f) : P[i];
        one(q, Tn, (j / per) * 6.283 + i * 2.4 + R());
      }
    }
    if (tip) { Tn.copy(P[n - 1]).sub(P[n - 2]).normalize(); for (let j = 0; j < 3; j++) one(P[n - 1], Tn, j * 2.1 + R()); }
  }
}

const BARK = L3(0.5, 0.4, 0.3), BARK_D = L3(0.4, 0.32, 0.25), BIRCH = L3(0.86, 0.84, 0.8), PALMB = L3(0.55, 0.47, 0.36);

export function buildProcPlants(thin = 1) {
  const G = {};
  const broad = (seed, sk, leaf = {}) => {
    const R = rng(seed), B = new PB(thin);
    const twigs = grow(B, R, { barkCol: BARK, ...sk });
    leafTwigs(B, R, twigs, crownOf(twigs), { per: 4, len: 0.36, wid: 0.1, o: { rows: 3, k: 0.8, cup: 0.3 }, ...leaf });
    return B.build();
  };
  G.roundtree = broad(11, { H: 8, r: 0.36, n: [13, 6, 4], ang: [1.1, 0.9, 0.85], crown: 0.3, len0: 0.52, lenR: 0.6 });
  G.sakura = broad(23, { H: 5, r: 0.27, n: [11, 6, 4], ang: [1.3, 0.9, 0.85], crown: 0.28, len0: 0.72, lenR: 0.6, trop: 0.12, barkCol: BARK_D, lean: 0.25 }, { per: 5, len: 0.2, wid: 0.08, kind: 4, o: { rows: 3, k: 0.5, cup: 0.35, s0: 0.6, s1: 0.5 } });
  G.birch = broad(37, { H: 12, r: 0.19, n: [18, 5, 3], ang: [0.8, 0.85, 0.8], crown: 0.28, len0: 0.27, lenR: 0.6, trop: 0.05, barkCol: BIRCH, lean: 0.08 }, { per: 4, len: 0.24, wid: 0.075, hang: 0.7, o: { rows: 3, k: 0.9, cup: 0.2, s0: 0.6 } });
  G.deadtree = (() => { const R = rng(51), B = new PB(thin); grow(B, R, { H: 6.5, r: 0.28, n: [6, 3, 2], ang: [1.0, 0.9, 0.9], crown: 0.35, len0: 0.5, wob: 0.5, trop: 0.1, barkCol: L3(0.5, 0.46, 0.4) }); return B.build(); })();
  // conifer: whorls of drooping boughs with side twigs, every needle its own blade
  const pine = (seed, snow) => {
    const R = rng(seed), B = new PB(thin), H = 12, cen = V(0, H * 0.55, 0), kind = snow ? 3 : 2;
    B.tube([V(0, -0.3, 0), V(0.05, H * 0.3, 0), V(-0.04, H * 0.65, 0.03), V(0, H + 0.5, 0)], 0.3, 0.035, BARK, (t) => t * 0.6, 9);
    const out = V(0, 0, 0), side = V(0, 0, 0), nd = V(0, 0, 0), d2 = V(0, 0, 0);
    const needles = (pts) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], seg = b.clone().sub(a), L = seg.length(), tng = seg.clone().normalize();
        side.set(0, 1, 0).cross(tng).normalize(); const upv = tng.clone().cross(side);
        for (let s = 0; s < L; s += 0.2) for (let j = 0; j < 3; j++) {
          const ang = j * 2.094 + s * 9 + R(), p = a.clone().addScaledVector(tng, s);
          nd.copy(side).multiplyScalar(Math.cos(ang)).addScaledVector(upv, Math.sin(ang) * 0.7 + 0.25).addScaledVector(tng, 0.75).normalize();
          out.copy(p).sub(cen); const dist = Math.hypot(p.x, p.z) / (0.3 + (1 - p.y / H) * 3.8); out.y += 2; out.normalize();
          const ao = 0.3 + 0.7 * Math.min(1, Math.max(0, dist - 0.15) / 0.7), sv = R();
          B.needle(p, nd, d2.crossVectors(nd, tng), 0.42 + R() * 0.2, 0.035, out, [ao * (0.9 + 0.2 * sv), ao, ao * (1 - 0.2 * sv)], kind + R() * 0.9);
        }
      }
    };
    const whorls = 12;
    for (let w = 0; w < whorls; w++) {
      const t = w / whorls, y = 2 + t * (H - 2.6), len = (1 - t) * 3.5 + 0.55, n = 5 + Math.floor(R() * 2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 6.283 + R() * 0.6 + w * 1.1, dx = Math.cos(a), dz = Math.sin(a), pts = [];
        for (let i = 0; i <= 5; i++) { const u = i / 5; pts.push(V(dx * len * u, y + (0.25 * u - 0.5 * u * u) * len * (1.1 - t * 0.6) + (R() - 0.5) * 0.05, dz * len * u)); }
        B.tube(pts, 0.05 * (1.2 - t), 0.012, BARK_D, (u) => 0.4 + 0.6 * u, 4);
        needles(pts);
        for (let i = 1; i < 5; i++) for (const sdn of [1, -1]) {     // flat sprays of side twigs
          const u = i / 5, tl = len * 0.42 * (1 - u * 0.6), p0 = pts[i], e = V(p0.x + (dx * 0.55 - dz * sdn) * tl * 0.75, p0.y - tl * 0.22, p0.z + (dz * 0.55 + dx * sdn) * tl * 0.75);
          if (tl < 0.3) continue;
          const tp = [p0, p0.clone().lerp(e, 0.5).add(V(0, tl * 0.05, 0)), e];
          B.tube(tp, 0.018, 0.007, BARK_D, 0.9, 3); needles(tp);
        }
      }
    }
    return B.build();
  };
  G.pine = pine(61, false);
  G.snowpine = pine(67, true);
  // feather palm: each frond is a curved rib carrying two rows of drooping leaflets
  G.palm = (() => {
    const R = rng(71), B = new PB(thin), H = 9, pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(V(Math.sin(t * 1.4) * H * 0.18, t * H, 0)); }
    B.tube(pts, 0.25, 0.17, PALMB, (t) => t * 0.5, 10);
    const top = pts[pts.length - 1], cen = top.clone();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 6.283 + R() * 0.4, el = -0.1 + R() * 0.95, L = 3.6 + R() * 1.2;
      const dir = V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), sd = V(-Math.sin(a), 0, Math.cos(a)), rib = [];
      for (let i = 0; i <= 9; i++) { const t = i / 9; rib.push(top.clone().addScaledVector(dir, L * t).add(V(0, -t * t * L * (0.42 + 0.2 * R()), 0))); }
      B.tube(rib, 0.04, 0.008, L3(0.42, 0.46, 0.2), (t) => 0.5 + 0.5 * t, 4);
      for (let j = 0; j < 30; j++) for (const s of [1, -1]) {
        const t = 0.1 + 0.9 * (j + 0.5) / 30, fi = t * 9, i0 = Math.min(8, Math.floor(fi)), p = rib[i0].clone().lerp(rib[i0 + 1], fi - i0);
        const tng = rib[i0 + 1].clone().sub(rib[i0]).normalize();
        const ld = sd.clone().multiplyScalar(s).addScaledVector(tng, 0.45 + t * 0.5).add(V(0, -0.25, 0)).normalize();
        const ll = L * (0.1 + 0.26 * Math.sin(Math.PI * Math.pow(t, 0.7))), ao = 0.6 + 0.4 * t, sv = R();
        B.blade(p, ld, tng, ll, 0.05, { rows: 3, k: 1.1 + R() * 0.5, cup: 0.5, s0: 0.45, s1: 0.5, nb: 0.25 }, V(0, 1, 0), [ao * (0.92 + 0.16 * sv), ao, ao * (1 - 0.2 * sv)], 1 + R() * 0.9, (v) => 1);
      }
    }
    for (let k = 0; k < 6; k++) { const a = k * 1.1; B.sphere(top.clone().add(V(Math.cos(a) * 0.3, -0.4, Math.sin(a) * 0.3)), 0.17, L3(0.4, 0.36, 0.15), 10); }
    return B.build();
  })();
  // fan palm (sugar palm): stiff stalks ending in pleated fans of blades
  G.sugarpalm = (() => {
    const R = rng(73), B = new PB(thin), H = 12;
    B.tube([V(0, -0.3, 0), V(0.1, H * 0.5, 0), V(0, H, 0)], 0.33, 0.27, L3(0.44, 0.4, 0.35), (t) => t * 0.4, 10);
    const top = V(0, H, 0);
    for (let k = 0; k < 30; k++) {
      const a = k * 2.4 + R() * 0.3, el = -0.5 + R() * 1.7, st = 0.9 + R() * 0.5;
      const dir = V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), sd = V(-Math.sin(a), 0, Math.cos(a)), upv = sd.clone().cross(dir).normalize();
      const hub = top.clone().addScaledVector(dir, st);
      B.tube([top.clone(), hub], 0.035, 0.025, L3(0.4, 0.42, 0.2), 0.6, 4);
      for (let j = 0; j < 20; j++) {
        const fa = (j / 19 - 0.5) * 3.6, ld = dir.clone().multiplyScalar(Math.cos(fa)).addScaledVector(sd, Math.sin(fa)).normalize(), ao = 0.55 + 0.45 * Math.max(0, el + 0.5) / 1.7, sv = R();
        B.blade(hub, ld, sd.clone().multiplyScalar(Math.cos(fa)).addScaledVector(dir, -Math.sin(fa)), 1.25 + R() * 0.3, 0.085, { rows: 3, k: 0.35 + R() * 0.4, cup: 0.55, s0: 0.5, s1: 0.45, nb: 0.2 }, upv.y < 0 ? upv.clone().negate() : upv, [ao * (0.92 + 0.16 * sv), ao, ao * (1 - 0.2 * sv)], 1 + R() * 0.9, (v) => 0.8);
      }
    }
    return B.build();
  })();
  G.bush = (() => {
    const R = rng(81), B = new PB(thin), twigs = [];
    for (let k = 0; k < 26; k++) {
      const a = k * 2.4 + R(), el = 0.25 + R() * 1.2, L = 0.6 + R() * 0.8, d = V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), pts = [];
      for (let i = 0; i <= 4; i++) pts.push(V(0, -0.1, 0).addScaledVector(d, L * i / 4).add(V((R() - 0.5) * 0.1, i * i * 0.012, (R() - 0.5) * 0.1)));
      B.tube(pts, 0.02, 0.008, BARK_D, 0.5, 4); twigs.push({ pts });
    }
    leafTwigs(B, R, twigs, crownOf(twigs), { per: 6, len: 0.17, wid: 0.055, o: { rows: 3, k: 0.7, cup: 0.3 } });
    return B.build();
  })();
  G.bamboo = (() => {
    const R = rng(91), B = new PB(thin), twigs = [], culm = L3(0.48, 0.58, 0.26);
    for (let k = 0; k < 10; k++) {
      const a = R() * 6.283, rr = R() * 0.7, x = Math.cos(a) * rr, z = Math.sin(a) * rr, H = 6 + R() * 3.5, lx = (R() - 0.5) * 0.3, lz = (R() - 0.5) * 0.3, pts = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(V(x + lx * t * t * H, t * H, z + lz * t * t * H)); }
      B.tube(pts, 0.055, 0.03, culm, (t) => t, 7);
      for (let i = 4; i <= 10; i++) for (let j = 0; j < 2; j++) {
        const ba = R() * 6.283, bl = 0.5 + R() * 0.7, e = pts[i].clone().add(V(Math.cos(ba) * bl, bl * 0.25 - 0.1, Math.sin(ba) * bl));
        const tp = [pts[i], pts[i].clone().lerp(e, 0.5).add(V(0, 0.06, 0)), e];
        B.tube(tp, 0.012, 0.005, culm, 1, 3); twigs.push({ pts: tp });
      }
    }
    leafTwigs(B, R, twigs, crownOf(twigs), { per: 4, len: 0.3, wid: 0.03, hang: 0.5, o: { rows: 3, k: 0.6, cup: 0.3, s0: 0.5, s1: 0.5 } });
    return B.build();
  })();
  G.banana = (() => {
    const R = rng(101), B = new PB(thin), green = L3(0.45, 0.5, 0.28);
    B.tube([V(0, -0.2, 0), V(0.03, 1.3, 0), V(0, 2.4, 0)], 0.2, 0.13, green, (t) => t * 0.4, 9);
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4 + R() * 0.4, el = 0.35 + R() * 0.9, dir = V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), sd = V(-Math.sin(a), 0, Math.cos(a));
      const st = V(0, 2.3, 0), hub = st.clone().addScaledVector(dir, 0.5), ao = 0.6 + 0.4 * R(), sv = R();
      B.tube([st, hub], 0.035, 0.028, green, 0.6, 5);
      B.blade(hub, dir, sd, 2.1 + R() * 0.7, 0.36, { rows: 10, k: 1.0 + R() * 0.7, cup: 0.28, s0: 0.55, s1: 0.32, nb: 0.15, tw: (R() - 0.5) * 0.5 }, V(0, 1, 0), [ao * (0.95 + 0.1 * sv), ao, ao * (1 - 0.15 * sv)], 5 + R() * 0.9, (v) => 0.5 + 0.5 * v);
    }
    return B.build();
  })();
  G.cactus = (() => {
    const B = new PB(thin), col = L3(0.36, 0.5, 0.3);
    B.tube([V(0, -0.2, 0), V(0, 2.5, 0), V(0, 4.6, 0)], 0.36, 0.3, col, 0, 14); B.sphere(V(0, 4.6, 0), 0.3, col, 14);
    for (const [s, y, h] of [[1, 1.6, 1.6], [-1, 2.3, 1.2]]) { const p = [V(0, y, 0), V(s * 0.55, y + 0.02, 0), V(s * 0.8, y + 0.2, 0), V(s * 0.85, y + 0.55, 0), V(s * 0.85, y + h, 0)]; B.tube(p, 0.22, 0.19, col, 0, 12); B.sphere(p[4], 0.19, col, 12); }
    return B.build();
  })();
  return G;
}

// ---------------- material: bark and leaves, lit like thin living tissue ----------------
// aLeaf: 0 bark / solid; otherwise floor = kind (1 leaf, 2 needle, 3 snowy needle, 4 petal, 5 banana), fraction = a random per leaf
export function plantMaterial() {
  const m = new T.MeshPhongNodeMaterial({ side: T.DoubleSide });
  m.specular = new T.Color(0x2c2c2c); m.shininess = 24;
  const al = T.attribute('aLeaf', 'float'), kind = T.floor(al), rnd = T.fract(al).mul(1.11), uvv = T.uv(), p0 = T.attribute('position', 'vec3');
  const isLeaf = kind.greaterThan(0.5), au = uvv.x.abs(), v = uvv.y;
  const albedo = T.Fn((a, b) => {
    const builder = b || a;
    const vc = T.attribute('color', 'vec3');
    let base = vc;
    if (builder.object?.instanceColor) { const ic = T.varyingProperty('vec3', 'vInstanceColor'); base = T.mix(vc.div(T.max(ic, T.vec3(0.002))), vc, T.attribute('aTint', 'float')); }
    // bark: long vertical ridges and fine speckle
    const grain = n3(p0.mul(T.vec3(9, 0.9, 9))).mul(0.4).add(n3(p0.mul(T.vec3(30, 4, 30))).mul(0.22)).add(0.66);
    // leaf: darker at the stalk, a pale midrib, side veins, and every leaf its own shade
    const veins = T.smoothstep(0.55, 1.0, T.sin(v.mul(34).sub(au.mul(6)).add(rnd.mul(40)))).mul(0.2).oneMinus();
    const rib = T.smoothstep(0.0, 0.16, au).mul(0.22).add(0.78);
    const leaf = T.mix(T.float(0.7), T.float(1.4), T.smoothstep(0.0, 0.8, v)).mul(rib).mul(veins).mul(rnd.mul(0.4).add(0.8));
    const c = T.select(isLeaf, base.mul(leaf), base.mul(grain)).toVar();
    c.assign(T.select(kind.greaterThan(1.5).and(kind.lessThan(3.5)), c.mul(0.8), c));                      // needles are darker
    const snow = T.smoothstep(0.3, 0.7, n3(p0.mul(2.5)).add(T.normalLocal.y.mul(0.5)));
    c.assign(T.select(kind.greaterThan(2.5).and(kind.lessThan(3.5)), T.mix(c, T.vec3(0.86, 0.89, 0.95), snow.mul(0.85)), c));
    return c;
  })();
  m.colorNode = albedo;
  // light shining through the leaves from behind: the warm glow that makes foliage look alive
  m.emissiveNode = T.Fn((a, b) => {
    const builder = b || a;
    const n = T.normalWorld.mul(T.faceDirection), L = gpuSun.dir, Vd = T.cameraPosition.sub(T.positionWorld).normalize();
    const back = T.max(n.dot(L).negate(), 0).mul(0.75).add(T.pow(T.max(Vd.negate().dot(L), 0), 4).mul(0.6));
    const thin = T.select(kind.greaterThan(1.5).and(kind.lessThan(3.5)), T.float(0.35), T.float(1));
    const ao = T.attribute('color', 'vec3').g;
    const tint = builder.object?.instanceColor ? T.varyingProperty('vec3', 'vInstanceColor') : T.vec3(1, 1, 1);
    const bounce = gpuSun.col.mul(0.07);                                   // light thrown back up by the ground: shaded trunks are never black
    return T.select(isLeaf, albedo.mul(tint).mul(T.vec3(1.45, 1.35, 0.7).mul(gpuSun.col).mul(back).mul(thin).mul(ao).mul(0.3183).add(bounce.mul(ao))), albedo.mul(tint).mul(bounce.mul(1.6)));
  })();
  // wind: the whole tree bends with height, each leaf flutters from its stalk
  m.positionNode = T.Fn((a, b) => {
    const builder = b || a;
    if (!builder.object?.isInstancedMesh) return T.positionLocal;
    const p = T.positionLocal, t = gpuWind.time, st = gpuWind.strength;
    const ph = t.mul(1.3).add(p.x.mul(0.07)).add(p.z.mul(0.09));
    const sw = T.attribute('aSway', 'float'), hgt = T.max(p0.y, 0);
    const bend = hgt.mul(hgt).mul(0.0035).mul(st).mul(sw);
    const fl = T.select(isLeaf, T.sin(t.mul(5).add(rnd.mul(60)).add(p.x.mul(0.5))).mul(0.03).mul(st).mul(v.add(0.3)), T.float(0));
    return p.add(T.vec3(T.sin(ph).add(T.sin(ph.mul(2.3)).mul(0.3)).mul(bend).add(fl), fl.mul(0.8), T.cos(ph.mul(0.8)).mul(bend).mul(0.7).add(fl.mul(0.5))));
  })();
  return m;
}

// ---------------- ground: no textures, everything from noise ----------------
// vertex colour carries the biome (grass / soil / sand / snow) and aRock the cliff weight; the shader adds
// patchy grass, soil, pebbles and rock strata at several scales and bumps the normal so the ground has relief
export function proceduralTerrainMat() {
  const m = new T.MeshLambertNodeMaterial();
  const wp = T.positionWorld, P = wp.xz;
  const rock = T.attribute('aRock', 'float');
  const fbm = (p, oct) => T.mx_fractal_noise_float(p, oct, 2.0, 0.5);
  const big = fbm(P.mul(0.012), 3), mid = fbm(P.mul(0.09), 3), fine = fbm(P.mul(0.8), 3), micro = T.mx_noise_float(P.mul(5.5));
  const vc = T.attribute('color', 'vec3');
  // grass: clumpy light/dark patches, yellowed tips, bare soil showing through
  const soil = T.vec3(0.23, 0.17, 0.11);
  const grassCol = vc.mul(T.float(1).add(big.mul(0.22)).add(mid.mul(0.18)).add(fine.mul(0.1)).add(micro.mul(0.06)));
  const bare = T.smoothstep(0.25, 0.6, mid.add(fine.mul(0.5)).add(big.mul(0.3)));
  const ground = T.mix(grassCol, T.mix(grassCol, soil.mul(vc.length().mul(0.8).add(0.4)), 0.55), bare.mul(0.5));
  // rock: layered strata + speckle, from world position so cliffs aren't stretched
  const strata = T.sin(wp.y.mul(2.2).add(fbm(wp.mul(0.25), 2).mul(3))).mul(0.5).add(0.5);
  const rockCol = T.vec3(0.42, 0.39, 0.35).mul(T.float(0.75).add(strata.mul(0.25)).add(T.mx_noise_float(wp.mul(3)).mul(0.12))).mul(vc.length().mul(0.35).add(0.75));
  m.colorNode = T.mix(ground, rockCol, T.smoothstep(0.2, 0.8, rock));
  // relief: bump the normal with the same noise (surface-gradient method)
  m.normalNode = T.Fn(() => {
    const h = fine.mul(0.06).add(micro.mul(0.02)).add(T.smoothstep(0.2, 0.8, rock).mul(strata.mul(0.12)));
    const pv = T.positionView, N = T.normalView;
    const dpx = T.dFdx(pv), dpy = T.dFdy(pv), dhx = T.dFdx(h), dhy = T.dFdy(h);
    const r1 = T.cross(dpy, N), r2 = T.cross(N, dpx), det = T.dot(dpx, r1);
    const grad = r1.mul(dhx).add(r2.mul(dhy)).mul(T.sign(det));
    return T.normalize(N.mul(det.abs()).sub(grad));
  })();
  return m;
}

// ---------------- grass blades ----------------
// curved, tapering blades in 4 segments; colour darkens at the root and yellows at the tip; they bend with the wind
export function buildProcGrass() {
  const R = rng(5), B = new PB();
  for (let k = 0; k < 26; k++) {
    const a = R() * 6.28, rr = Math.sqrt(R()) * 0.4, x = Math.cos(a) * rr, z = Math.sin(a) * rr, H = 0.25 + R() * 0.45, W = 0.012 + R() * 0.012;
    const ba = R() * 6.28, side = V(Math.cos(ba), 0, Math.sin(ba)), lean = V(-Math.sin(ba), 0, Math.cos(ba)).multiplyScalar(0.12 + R() * 0.25);
    const pts = [], wd = [];
    for (let i = 0; i <= 4; i++) { const t = i / 4; pts.push(V(x, t * H, z).addScaledVector(lean, t * t * H)); wd.push(W * (1 - t * 0.92)); }
    B.strip(pts, wd, side, () => V(0, 1, 0), 0, [1, 1, 1], 1);
  }
  const g = B.build();
  return g;
}
export function grassMaterial() {
  const m = new T.MeshLambertNodeMaterial({ side: T.DoubleSide });
  const t = T.uv().y;
  m.colorNode = T.Fn((a, b) => {
    const builder = b || a;
    let base = T.vec3(1, 1, 1);
    if (!builder.object?.instanceColor) base = T.vec3(0.3, 0.5, 0.2);
    return base.mul(T.mix(T.float(0.45), T.float(1.15), t)).mul(T.mix(T.vec3(1, 1, 1), T.vec3(1.15, 1.08, 0.75), t.mul(t)));
  })();
  m.normalNode = T.cameraViewMatrix.mul(T.vec4(0, 1, 0, 0)).xyz.normalize();
  m.positionNode = T.Fn((a, b) => {
    const builder = b || a;
    if (!builder.object?.isInstancedMesh) return T.positionLocal;
    const p = T.positionLocal, tm = gpuWind.time, st = gpuWind.strength;
    const ph = tm.mul(2.1).add(p.x.mul(0.35)).add(p.z.mul(0.27)), gust = T.sin(tm.mul(0.6).add(p.x.mul(0.05))).mul(0.5).add(0.5);
    const k = t.mul(t).mul(0.12).mul(st).mul(gust.mul(0.7).add(0.3));
    return p.add(T.vec3(T.sin(ph).mul(k), k.mul(-0.3), T.cos(ph.mul(0.9)).mul(k).mul(0.6)));
  })();
  return m;
}
