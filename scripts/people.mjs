// Makes engine/assets/people.bin - the figures of the towns' people (render.js: PPL; vsPpl/fsPpl) - from the model "Anime Character Base mesh"
// by Marc Ed (sketchfab.com/marc.edouard.lepine17, CC BY 4.0):   node scripts/people.mjs path/to/anime_character_base_mesh.glb
// The model is one bare, bald figure, unrigged, standing with its arms a little out. From it a man and a woman are made (broader or narrower
// at the shoulder, waist and hip), each 1 high, facing +z: its faces made fewer (the model has 75 000), each vertex told its part from where it
// is on the figure, the arms brought down to the sides and the legs together; then clothes are made round it - a shirt, sleeves, trouser legs,
// a skirt, each a tube standing off the body - and hair: a second skin over the scalp, and a fall of it down the back for those who wear it
// long. Two forms of each: as made, and cut down further for the distance.
// The file: "PPL1", the number of meshes (4: man, man far, woman, woman far); then for each its vertex and index counts, the vertices - nine
// float32 each: place, normal, part (0 body, 1 head, 2/3 upper arms, 4/5 forearms, 6/7 thighs, 8/9 shins, 10 hair, 11/12 feet, 13/14 hands,
// 15 the long hair's fall, 20 shirt, 22-25 sleeves, 26-29 trouser legs, 30 skirt; the even of each pair on -x), how far it goes with its limb
// (or, of the head and hair, with the head) rather than the body, and how far with the limb's lower half (of the hair on the scalp: how far
// it stands off it) - and the indices (uint32).
import { readFileSync, writeFileSync } from 'node:fs';
const src = process.argv[2]; if (!src) { console.error('usage: node scripts/people.mjs model.glb'); process.exit(1); }
const b = readFileSync(src), jl = b.readUInt32LE(12), J = JSON.parse(b.subarray(20, 20 + jl).toString()), BIN = b.subarray(20 + jl + 8), dv = new DataView(BIN.buffer, BIN.byteOffset);
const acc = (i) => { const a = J.accessors[i], bv = J.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], sz = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0), st = bv.byteStride || sz * n, o = new Float64Array(a.count * n);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) { const p = off + k * st + c * sz; o[k * n + c] = a.componentType === 5126 ? dv.getFloat32(p, true) : a.componentType === 5125 ? dv.getUint32(p, true) : a.componentType === 5123 ? dv.getUint16(p, true) : dv.getUint8(p); }
  return o; };
const ss = (a, c, x) => { const t = Math.min(1, Math.max(0, (x - a) / (c - a))); return t * t * (3 - 2 * t); };
// The joints, in the figure's own measure (1 high, x from its middle), read off its outline: where the arm leaves the shoulder and where its
// fingertips are as the model holds it, and how far along that the elbow and wrist come; the hip, the knee. ZSH sets the body's middle at z 0.
const ELB = 0.385, WRIST = 0.8, ARM_DOWN = 0.085, LEG_IN = 0.065, HAIRLINE = 0.55, ZSH = 0.028;      // (ARM_DOWN: how far out from straight down the arm is left to hang, radians; LEG_IN: how far the legs are brought together)
const SH0 = [0.115, 0.8], HAND0 = [0.168, 0.435], HIP = [0.055, 0.52], KNEE_Y = 0.31;
// The two builds: how broad at the hip, waist, chest, shoulder and neck, and the bust.
const SEX = [{ hip: 1.0, waist: 1.13, chest: 1.1, sh: 1.1, neck: 1.12, bust: 0, hang: 0.05 }, { hip: 1.06, waist: 0.94, chest: 0.97, sh: 0.95, neck: 0.96, bust: 0.014, hang: 0.13 }];
// The model: its up is z and it faces -y; made 1 high, y up, facing +z. Its vertices made fewer first - all within a cell of a grid made one,
// the cells small on the head and hands, where the shape is fine.
const RAW = (() => { const pr = J.meshes[0].primitives[0], P0 = acc(pr.attributes.POSITION), I0 = acc(pr.indices), n0 = P0.length / 3; let z0 = 1e9, z1 = -1e9; for (let i = 0; i < n0; i++) { z0 = Math.min(z0, P0[i * 3 + 2]); z1 = Math.max(z1, P0[i * 3 + 2]); }
  const k = 1 / (z1 - z0), key = new Map(), sum = [], map = new Int32Array(n0);
  for (let i = 0; i < n0; i++) { const x = P0[i * 3] * k, y = (P0[i * 3 + 2] - z0) * k, z = -P0[i * 3 + 1] * k + ZSH, rg = y > 0.862 ? 1 : y < 0.515 && Math.abs(x) > 0.135 ? 2 : y < 0.05 ? 3 : 0, cell = [0.015, 0.0066, 0.0055, 0.009][rg];
    const kq = `${rg},${Math.round(x / cell)},${Math.round(y / cell)},${Math.round(z / cell)}`; let j = key.get(kq); if (j === undefined) { j = sum.length; key.set(kq, j); sum.push([0, 0, 0, 0]); } const S = sum[j]; S[0] += x; S[1] += y; S[2] += z; S[3]++; map[i] = j; }
  const P = []; for (const S of sum) P.push(S[0] / S[3], S[1] / S[3], S[2] / S[3]);
  const I = []; for (let t = 0; t < I0.length; t += 3) { const a = map[I0[t]], c = map[I0[t + 1]], d = map[I0[t + 2]]; if (a !== c && c !== d && a !== d) I.push(a, c, d); }
  return { P, I }; })();
const lerpT = (T, y) => { if (y <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (y <= T[i][0]) { const u = (y - T[i - 1][0]) / (T[i][0] - T[i - 1][0]); return T[i - 1][1] + (T[i][1] - T[i - 1][1]) * u; } return T[T.length - 1][1]; };
function figure(sex) {
  const B = SEX[sex], wide = (y) => lerpT([[0.4, 1], [0.5, B.hip], [0.54, B.hip], [0.63, B.waist], [0.72, B.chest], [0.8, B.sh], [0.855, B.neck], [0.9, 1]], y);
  const SH = [SH0[0] * B.sh, SH0[1]], P = RAW.P, n = P.length / 3, I = RAW.I.slice(), V = [], AW = [], AT = [];
  const al = Math.hypot(HAND0[0] - SH0[0], HAND0[1] - SH0[1]), ax = [(HAND0[0] - SH0[0]) / al, (HAND0[1] - SH0[1]) / al], turn = Math.atan2(ax[0], -ax[1]) - ARM_DOWN;      // (how far the arm is turned to hang)
  for (let i = 0; i < n; i++) { let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const sg = x < 0 ? -1 : 1, a = Math.abs(x), t = ((a - SH0[0]) * ax[0] + (y - SH0[1]) * ax[1]) / al, perp = Math.abs((a - SH0[0]) * -ax[1] + (y - SH0[1]) * ax[0]);      // (t: how far along the arm, 0 at the shoulder, 1 at the fingertips; perp: how far off its line)
    let part = 0, wL = 0, wLo = 0;
    const arm = ss(0.062, 0.042, perp) * ss(-0.16, 0.08, t) * ss(0.078, 0.098, a), lw = 1 - ss(HIP[1] - 0.05, HIP[1] + 0.04, y);
    if (arm > 0.5) { wL = arm; wLo = ss(ELB - 0.07, ELB + 0.07, t); part = (t > WRIST ? 13 : t > ELB ? 4 : 2) + (sg > 0 ? 1 : 0); }
    else if (y > 0.868) { part = 1; wL = ss(0.845, 0.89, y); }
    else if (y < HIP[1] - 0.03) { wL = lw; wLo = 1 - ss(KNEE_Y - 0.04, KNEE_Y + 0.04, y); part = (y < 0.05 ? 11 : y < KNEE_Y ? 8 : 6) + (sg > 0 ? 1 : 0); }
    else { wL = arm > 0.001 ? arm : y < 0.6 ? lw : ss(0.845, 0.89, y); }
    // (the build: the trunk made broader or narrower at each height, the arms moved out or in with the shoulders; the bust)
    { const w = wide(y), xt = x * w, xa = x + sg * SH0[0] * (B.sh - 1); x = xt + (xa - xt) * arm; z *= 1 + (w - 1) * 0.6 * (1 - arm);
      if (B.bust && arm < 0.5 && z > 0) { const u = (a - 0.043) / 0.034, v = (y - 0.728) / 0.036; z += B.bust * Math.exp(-u * u - v * v) * (1 - arm); } }
    // (the arm brought down: turned about the shoulder, in the plane the figure stands in, by as much as the vertex is the arm's; and the legs
    // brought together a little, turned about the hips)
    if (arm > 0) { const an = -turn * arm * sg, c = Math.cos(an), s = Math.sin(an), dx = x - sg * SH[0], dy = y - SH[1]; x = sg * SH[0] + dx * c - dy * s; y = SH[1] + dx * s + dy * c; }
    else if (lw > 0) { const an = -LEG_IN * lw * sg, c = Math.cos(an), s = Math.sin(an), dx = x - sg * HIP[0], dy = y - HIP[1]; x = sg * HIP[0] + dx * c - dy * s; y = HIP[1] + dx * s + dy * c; }
    V.push(x, y, z, 0, 0, 0, part, wL, wLo); AW.push(arm); AT.push(t); }
  for (let t = 0; t < I.length; t += 3) { const A = I[t] * 9, B2 = I[t + 1] * 9, C = I[t + 2] * 9, ux = V[B2] - V[A], uy = V[B2 + 1] - V[A + 1], uz = V[B2 + 2] - V[A + 2], vx = V[C] - V[A], vy = V[C + 1] - V[A + 1], vz = V[C + 2] - V[A + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz2 = ux * vy - uy * vx; for (const o of [A, B2, C]) { V[o + 3] += fx; V[o + 4] += fy; V[o + 5] += fz2; } }
  for (let i = 0; i < n; i++) { const o = i * 9, l = Math.hypot(V[o + 3], V[o + 4], V[o + 5]) || 1; V[o + 3] /= l; V[o + 4] /= l; V[o + 5] /= l; }
  // (the faces' winding may run either way: the normals are turned outward - away from the figure's middle line at the chest)
  { let out = 0; for (let i = 0; i < n; i++) { const o = i * 9; if (V[o + 1] > 0.6 && V[o + 1] < 0.72 && Math.abs(V[o]) < 0.07) out += V[o + 3] * V[o] + V[o + 5] * V[o + 2]; } if (out < 0) for (let i = 0; i < n; i++) { const o = i * 9; V[o + 3] *= -1; V[o + 4] *= -1; V[o + 5] *= -1; } }
  const nB = n, lwOf = (y) => 1 - ss(HIP[1] - 0.05, HIP[1] + 0.04, y);
  // ---- The clothes: made round the body, standing off it, so that they hang as cloth and not as paint (parts 20 and up: 20 the shirt's
  // body, 22-25 its sleeves, 26-29 the trouser legs, 30 a skirt; each moving as the part 20 below it does). A garment is a tube of rings.
  // hull: the convex outline of the points of a slice, as its distance from (cx, cz) in each of N directions - cloth spans the hollows.
  const dirA = (j, N, asp) => { const a = j / N * 2 * Math.PI; return Math.atan2(Math.sin(a), Math.cos(a) * asp); };
  const hullR = (pts, cx, cz, N, asp = 1) => { const q = pts.map(([x, z]) => [x - cx, z - cz]).sort((u, v) => u[0] - v[0] || u[1] - v[1]), cr = (o, u, v) => (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]), lo = [], up = [];
    for (const e of q) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], e) <= 0) lo.pop(); lo.push(e); }
    for (let i = q.length - 1; i >= 0; i--) { const e = q[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], e) <= 0) up.pop(); up.push(e); }
    const h = lo.slice(0, -1).concat(up.slice(0, -1)), R = [];
    for (let j = 0; j < N; j++) { const a = dirA(j, N, asp), dx = Math.cos(a), dz = Math.sin(a); let r = 0;
      for (let e = 0; e < h.length; e++) { const A = h[e], B = h[(e + 1) % h.length], ex = B[0] - A[0], ez = B[1] - A[1], den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue; const rr = (A[0] * ez - A[1] * ex) / den, sv = (A[0] * dz - A[1] * dx) / den; if (rr > 0 && sv >= -1e-6 && sv <= 1 + 1e-6) r = Math.max(r, rr); }
      if (!r) for (const e of q) r = Math.max(r, e[0] * dx + e[1] * dz); R.push(r); }
    return R; };
  const slice = (y, dy, ok) => { const o = []; for (let i = 0; i < nB; i++) { const v = i * 9; if (Math.abs(V[v + 1] - y) < dy && ok(i, V[v], V[v + 1], V[v + 2])) o.push([V[v], V[v + 2]]); } return o; };
  const meanOf = (pts) => { let x = 0, z = 0, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const e of pts) { x0 = Math.min(x0, e[0]); x1 = Math.max(x1, e[0]); z0 = Math.min(z0, e[1]); z1 = Math.max(z1, e[1]); } return [(x0 + x1) / 2, (z0 + z1) / 2]; };
  // nearest: the weights of the body's vertices nearest a place (those that ok passes)
  const nearW = (x, y, z, ok) => { const best = []; for (let i = 0; i < nB; i++) { const v = i * 9; if (!ok(i, V[v + 6])) continue; const d = (V[v] - x) ** 2 + (V[v + 1] - y) ** 2 + (V[v + 2] - z) ** 2; if (best.length < 4 || d < best[3][0]) { best.push([d, i]); best.sort((u, w) => u[0] - w[0]); if (best.length > 4) best.pop(); } }
    let a = 0, c = 0, w = 0; for (const [d, i] of best) { const kq = 1 / (d + 1e-5); a += V[i * 9 + 7] * kq; c += V[i * 9 + 8] * kq; w += kq; } return [a / w, c / w]; };
  // tube: rings (each N places, with part and weights) joined; the normals from its faces, turned outward from each ring's middle
  const tube = (rings, N) => { const b0 = V.length / 9; for (const rg of rings) for (const e of rg.p) V.push(e[0], e[1], e[2], 0, 0, 0, e[3], e[4], e[5]);
    const T = []; for (let j = 0; j + 1 < rings.length; j++) for (let q = 0; q < N; q++) { const a = b0 + j * N + q, c = b0 + j * N + (q + 1) % N; T.push(a, c, a + N, c, c + N, a + N); }
    for (let t = 0; t < T.length; t += 3) { const A = T[t] * 9, B = T[t + 1] * 9, C = T[t + 2] * 9, ux = V[B] - V[A], uy = V[B + 1] - V[A + 1], uz = V[B + 2] - V[A + 2], vx = V[C] - V[A], vy = V[C + 1] - V[A + 1], vz = V[C + 2] - V[A + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz2 = ux * vy - uy * vx; for (const o of [A, B, C]) { V[o + 3] += fx; V[o + 4] += fy; V[o + 5] += fz2; } }
    rings.forEach((rg, j) => { for (let q = 0; q < N; q++) { const o = (b0 + j * N + q) * 9, l = Math.hypot(V[o + 3], V[o + 4], V[o + 5]) || 1, sgn = ((V[o] - rg.c[0]) * V[o + 3] + (V[o + 1] - rg.c[1]) * V[o + 4] * 0 + (V[o + 2] - rg.c[2]) * V[o + 5]) < 0 ? -1 : 1; V[o + 3] *= sgn / l; V[o + 4] *= sgn / l; V[o + 5] *= sgn / l; } });
    for (const e of T) I.push(e); };
  // (the fork of the legs: the lowest of the body on its middle line)
  let crotch = 1; for (let i = 0; i < nB; i++) { const v = i * 9; if (Math.abs(V[v]) < 0.012 && V[v + 1] > 0.3 && V[v + 1] < 0.6) crotch = Math.min(crotch, V[v + 1]); }
  const isTorso = (i) => V[i * 9 + 6] === 0 && AW[i] < 0.35, NT = 20;
  // the shirt: from its hem at the fork up to the collar; below the chest it hangs - no ring may be much narrower than the one above it
  { const HEM = crotch - 0.034, YS = [0.859, 0.852, 0.845, 0.834], rings = []; let prev = null; for (let j = 1; j <= 17; j++) YS.push(0.834 + (HEM - 0.834) * j / 17);
    for (const y of YS) { const ys = y;
      const pts = slice(ys, 0.014, (i, x, yy) => (yy > 0.745 ? (V[i * 9 + 6] === 0 || ((V[i * 9 + 6] === 2 || V[i * 9 + 6] === 3) && AT[i] < 0.17)) : yy < 0.56 ? AW[i] < 0.3 && V[i * 9 + 6] !== 13 && V[i * 9 + 6] !== 14 && Math.abs(x) < 0.16 : isTorso(i)));
      const c = meanOf(pts), off = y > 0.855 ? 0.004 : y > 0.84 ? 0.006 : y > 0.75 ? 0.008 : 0.013 + 0.005 * ss(0.6, 0.5, y); let R = hullR(pts, 0, c[1], NT, 1.7).map((r) => r + off);
      if (prev && y < 0.72) R = R.map((r, q) => Math.max(r, prev[q] - B.hang * (prev.y - y)));
      if (y < 0.62) R = R.map((r, q) => r + 0.002 * ss(0.62, 0.48, y) * Math.sin(q / NT * 2 * Math.PI * 5 + 1.3 + 2 * Math.sin(q * 1.7)));
      R.y = y; prev = R; rings.push({ y, c: [0, y, c[1]], R }); }
    for (const rg of rings) rg.p = rg.R.map((r, q) => { const a = dirA(q, NT, 1.7), x = Math.cos(a) * r, z = rg.c[2] + Math.sin(a) * r, w = nearW(x, rg.y, z, (i, part) => part === 0 || (rg.y > 0.745 && (part === 2 || part === 3))); return [x, rg.y, z, 20, w[0], w[1]]; });
    tube(rings, NT); }
  // the sleeves: round each arm as it hangs, from inside the shoulder to the wrist (the shader ends the short ones above the elbow)
  for (const sg of [-1, 1]) { const NA = 10, rings = [], dx = Math.sin(ARM_DOWN) * sg, dy = -Math.cos(ARM_DOWN); let rp = 0;
    for (let j = 0; j < 13; j++) { const t = -0.03 + 0.8 * j / 12; let cxm = 0, czm = 0, cnt = 0; const sel = [];
      for (let i = 0; i < nB; i++) if (AW[i] > 0.5 && Math.abs(AT[i] - Math.max(t, 0.06)) < 0.045 && AT[i] < WRIST - 0.015 && V[i * 9] * sg > 0) { sel.push(i); czm += V[i * 9 + 2]; cnt++; }
      czm /= cnt || 1; const ax = sg * SH[0] + dx * t * al, ay = SH[1] + dy * t * al; let r = 0;
      // (the arm's own middle: its vertices' mean off the line)
      let ox = 0; for (const i of sel) ox += (V[i * 9] - ax) * -dy + (V[i * 9 + 1] - ay) * dx; ox /= cnt || 1; const mx = ax + ox * -dy, my = ay + ox * dx;
      for (const i of sel) { const px = V[i * 9] - mx, py = V[i * 9 + 1] - my, along = px * dx + py * dy; r = Math.max(r, Math.hypot(px - along * dx, py - along * dy, V[i * 9 + 2] - czm)); }
      r = Math.max(Math.min(r, 0.028) * 0.92 + (t < 0.36 ? 0.007 + 0.012 * Math.max(t, 0) : 0.006), rp - 0.012); rp = r; if (j === 0) r *= 0.75;
      rings.push({ c: [mx, my, czm], p: Array.from({ length: NA }, (_, q) => { const a = q / NA * 2 * Math.PI, u = Math.cos(a) * r, w = Math.sin(a) * r; return [mx + u * -dy, my + u * dx, czm + w, (t > ELB ? 24 : 22) + (sg > 0 ? 1 : 0), ss(-0.16, 0.08, t), ss(ELB - 0.07, ELB + 0.07, t)]; }) }); }
    tube(rings, NA); }
  // the trouser legs: from the fork to the ankle, cut straight - no ring much narrower than the one above
  for (const sg of [-1, 1]) { const NL = 12, rings = [], TOPL = crotch + 0.004, BOT = 0.036, NR = 16; let prev = null;
    for (let j = 0; j < NR; j++) { const y = TOPL + (BOT - TOPL) * j / (NR - 1), pts = slice(Math.max(Math.min(y, crotch - 0.012), 0.06), 0.014, (i, x) => x * sg > 0.002 && V[i * 9 + 6] !== 13 && V[i * 9 + 6] !== 14 && AW[i] < 0.3 && Math.abs(x) < 0.16);
      const c = meanOf(pts); let R = hullR(pts, c[0], c[1], NL).map((r) => r + 0.009 + 0.003 * ss(KNEE_Y, 0.1, y));
      if (prev) { R = R.map((r, q) => Math.max(r, prev[q] - 0.06 * (prev.y - y))); c[0] = c[0] * 0.6 + prev.c[0] * 0.4; c[1] = c[1] * 0.6 + prev.c[1] * 0.4; }
      R.y = y; R.c = c; prev = R; rings.push({ y, c: [c[0], y, c[1]], R }); }
    for (const rg of rings) { const R = rg.R.slice(); for (let q = 0; q < NL; q++) rg.R[q] = (R[(q + NL - 1) % NL] + 2 * R[q] + R[(q + 1) % NL]) / 4; }
    for (const rg of rings) rg.p = rg.R.map((r, q) => { const a = q / NL * 2 * Math.PI; return [rg.c[0] + Math.cos(a) * r, rg.y, rg.c[2] + Math.sin(a) * r, (rg.y < KNEE_Y ? 28 : 26) + (sg > 0 ? 1 : 0), lwOf(rg.y), 1 - ss(KNEE_Y - 0.04, KNEE_Y + 0.04, rg.y)]; });
    tube(rings, NL); }
  // a skirt: one bell round both legs from the waist to the calf, widening as it falls (the shader ends it at the wearer's length)
  { const TOPS = HIP[1] + 0.035, BOT = 0.17, NR = 11, rings = []; let prev = null;
    for (let j = 0; j < NR; j++) { const y = TOPS + (BOT - TOPS) * j / (NR - 1), pts = slice(y, 0.016, (i, x) => V[i * 9 + 6] !== 13 && V[i * 9 + 6] !== 14 && AW[i] < 0.3 && Math.abs(x) < 0.16);
      const c = meanOf(pts); let R = hullR(pts, 0, c[1], NT, 1.4).map((r) => r + 0.005);
      if (prev) R = R.map((r, q) => Math.max(r, prev[q] + (y < crotch - 0.03 ? 0.12 : 0) * (prev.y - y)));
      R.y = y; prev = R; rings.push({ y, c: [0, y, c[1]], R }); }
    for (const rg of rings) { const R = rg.R.slice(); for (let q = 0; q < NT; q++) rg.R[q] = (R[(q + NT - 1) % NT] + 2 * R[q] + R[(q + 1) % NT]) / 4; }
    for (const rg of rings) rg.p = rg.R.map((r, q) => { const a = dirA(q, NT, 1.4); return [Math.cos(a) * r, rg.y, rg.c[2] + Math.sin(a) * r, 30, lwOf(rg.y), 0]; });
    tube(rings, NT); }
  // (the body under the shirt is never seen: its faces are left out)
  { const hid = (i) => { const v = i * 9; return i < nB && V[v + 6] === 0 && AW[i] < 0.2 && V[v + 1] > crotch + 0.035 && V[v + 1] < 0.76 && Math.abs(V[v]) < 0.14; }; const K = [];
    for (let t = 0; t < I.length; t += 3) if (!(hid(I[t]) && hid(I[t + 1]) && hid(I[t + 2]))) K.push(I[t], I[t + 1], I[t + 2]); I.length = 0; for (const e of K) I.push(e); }
  // ---- The hair. On the scalp, a second skin of the head itself (part 10): every face of the head within the hairline again, to be stood off
  // the skull by the shader as far as the wearer's hair is thick - by the third number, which falls to nothing at the hairline, so that the
  // hair thins into the skin there. The hairline, from the head's middle: high over the brow, down past the temples, over the ears, low at
  // the nape. And for those who wear it long, a fall of it down the back (part 15): rings from behind the ears to the shoulder blades.
  let hx = 0, fz = -1e9, bz = 1e9, hy = 0; for (let i = 0; i < nB; i++) { const y = V[i * 9 + 1]; if (y > hy) hy = y; }
  for (let i = 0; i < nB; i++) { const y = V[i * 9 + 1], z = V[i * 9 + 2]; if (y > hy - 0.06) hx = Math.max(hx, Math.abs(V[i * 9])); if (y > hy - 0.065 && y < hy - 0.025) fz = Math.max(fz, z); if (y > hy - 0.1) bz = Math.min(bz, z); }
  const zc = (fz + bz) / 2, HC = [0, hy - 0.065, zc];
  const hairOf = (i) => { const v = i * 9; if (V[v + 6] !== 1) return -1; const dx = V[v] - HC[0], dy = V[v + 1] - HC[1], dz = V[v + 2] - HC[2], l = Math.hypot(dx, dy, dz) || 1, fwd = dz / (Math.hypot(dx, dz) || 1);
    const lim = fwd > 0 ? 0.02 + (HAIRLINE - 0.02) * ss(0.25, 0.9, fwd) : 0.02 - 0.72 * ss(0.0, 0.75, -fwd); return dy / l - lim; };
  { const map = new Map(), hv = (i) => { let j = map.get(i); if (j === undefined) { const v = i * 9; j = V.length / 9; map.set(i, j); V.push(V[v], V[v + 1], V[v + 2], V[v + 3], V[v + 4], V[v + 5], 10, V[v + 7], ss(0, 0.16, hairOf(i))); } return j; };
    const nI = I.length; for (let t = 0; t < nI; t += 3) { const a = I[t], c = I[t + 1], d = I[t + 2]; if (a < nB && c < nB && d < nB && Math.max(hairOf(a), hairOf(c), hairOf(d)) > 0 && Math.min(hairOf(a), hairOf(c), hairOf(d)) > -0.5) I.push(hv(a), hv(c), hv(d)); } }
  { const NS = 12, R = [[-0.05, 0.9, bz + 0.012, zc - 0.005], [-0.075, 1.12, bz - 0.012, zc + 0.004], [-0.105, 1.1, bz - 0.014, zc - 0.012], [-0.14, 1.0, bz - 0.012, zc - 0.03], [-0.185, 0.9, bz - 0.008, zc - 0.04], [-0.225, 0.72, bz - 0.002, zc - 0.045], [-0.24, 0.3, bz + 0.004, zc - 0.045]];
    const rings = R.map(([dy, rk, zb, zf]) => { const rx = hx * rk, rz = (zf - zb) / 2, zm = (zf + zb) / 2; return { c: [0, hy + dy, zm], p: Array.from({ length: NS }, (_, q) => { const a = q / NS * 2 * Math.PI; return [Math.cos(a) * rx, hy + dy, zm + Math.sin(a) * rz, 15, 1, 0]; }) }; });
    tube(rings, NS); }
  return { V, I, info: { top: hy, hx, fz, bz, crotch, body: nB, elbowY: SH[1] - ELB * al * Math.cos(ARM_DOWN), wristY: SH[1] - WRIST * al * Math.cos(ARM_DOWN) } };
}
// cut down: every vertex within a cell of the grid made one (places, normals and weights averaged; the part that of the first), and the
// triangles that close up left out
function fewer(M, cell) { const key = new Map(), acc2 = [], cnt = [], map = new Int32Array(M.V.length / 9);
  for (let i = 0; i < map.length; i++) { const o = i * 9, part = M.V[o + 6], kq = `${Math.round(M.V[o] / cell)},${Math.round(M.V[o + 1] / cell)},${Math.round(M.V[o + 2] / cell)},${part >= 10 && part !== 11 && part !== 12 && part !== 13 && part !== 14 ? 'p' + part : part >= 2 ? (M.V[o] < 0 ? 'l' : 'r') + (part === 6 || part === 7 || part === 8 || part === 9 || part === 11 || part === 12 ? 'g' : part === 0 ? '' : 'a') : ''}`;
    let j = key.get(kq); if (j === undefined) { j = acc2.length; key.set(kq, j); acc2.push(Array.from(M.V.slice(o, o + 9))); cnt.push(1); } else { const A = acc2[j]; for (const c of [0, 1, 2, 3, 4, 5, 7, 8]) A[c] += M.V[o + c]; cnt[j]++; } map[i] = j; }
  const V = []; acc2.forEach((A, j) => { const c = cnt[j], l = Math.hypot(A[3], A[4], A[5]) || 1; V.push(A[0] / c, A[1] / c, A[2] / c, A[3] / l, A[4] / l, A[5] / l, A[6], A[7] / c, A[8] / c); });
  const I = []; for (let t = 0; t < M.I.length; t += 3) { const a = map[M.I[t]], c = map[M.I[t + 1]], d = map[M.I[t + 2]]; if (a !== c && c !== d && a !== d) I.push(a, c, d); }
  return { V, I }; }
const man = figure(0), woman = figure(1), all = [man, fewer(man, 0.027), woman, fewer(woman, 0.027)];
console.log('man', JSON.stringify(man.info), 'woman', JSON.stringify(woman.info)); all.forEach((m, i) => console.log(' mesh', i, m.V.length / 9, 'vertices', m.I.length / 3, 'triangles'));
const parts = [Buffer.from('PPL1'), Buffer.from(new Uint32Array([all.length]).buffer)];
for (const m of all) parts.push(Buffer.from(new Uint32Array([m.V.length / 9, m.I.length]).buffer), Buffer.from(new Float32Array(m.V).buffer), Buffer.from(new Uint32Array(m.I).buffer));
const out = new URL('../engine/assets/people.bin', import.meta.url); writeFileSync(out, Buffer.concat(parts)); console.log('wrote', out.pathname, Buffer.concat(parts).length, 'bytes');
