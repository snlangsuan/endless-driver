// --------------------------------------------------------------------------------------------------------- world chunks
const CH = 64, GN = 32, GS = CH / GN;   // chunk size (m), cells per side, cell size
const gridI = new Uint16Array(GN * GN * 6);
for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { const a = j * (GN + 1) + i, b = a + 1, c = a + GN + 1, d = c + 1; gridI.set([a, c, b, b, c, d], (j * GN + i) * 6); }
const ibGrid = vbuf(gridI, GPUBufferUsage.INDEX);
const chunks = new Map(), HUTS = [];
const hg = new Float32Array((GN + 3) * (GN + 3)), hwet = new Float32Array((GN + 3) * (GN + 3)), LBUF = new Float32Array(12 * 260000);
// A sculpted figure. Made of tubes end to end a figure is jointed - every limb a row of pieces, every piece meeting the next at a seam. So the
// same pieces (each a round length from a to b, radius ra to rb) are instead melted into one skin: the space round them is measured on a fine
// grid - how far each point is from the nearest piece, pieces close together flowing into one another (smin) - and the surface where that distance
// is nothing is drawn as a mesh (a vertex in every cell the surface crosses, set where it crosses; a quad across every grid edge it cuts).
// segs: [ax, ay, az, ra, bx, by, bz, rb] ..., in the figure's own measure (its height 1). Returns { v: place and normal of each vertex, i }.
// Made once for each figure and kept (SCULPT).
const SCULPT = new Map();
// The sculpted parts of a step-through motorcycle, in metres (x across, y up from the ground, z forward; the axles at z = ±0.62, 0.28 up):
// body - the front mudguard, the leg shield curving back to the footboard, the head cowl and the handlebar's shroud, the spine dipping to the
// step-through and rising again, the side covers under the seat drawn out into the tail, the rear mudguard; seat; eng - crankcase and cylinder;
// helm - a helmet left on the seat. Made once (see sculpt).
// The parked scooter's model (assets/scooter.bin, made from the original by a script outside the game): "SCT1", the number of vertices and of
// indices, then for each vertex its place (three int16, metres x 2/32767: x across, y up from the ground, z forward), its normal (three int8)
// and what it is made of (a byte: 0 paint, 1 black plastic, 2 seat, 3 tyre, 4 dark metal, 5 metal, 6 bright metal, 7 lamp glass, 8 red lamp,
// 9 amber, 10 white, 11 the shock absorber's spring, 12 paint in shadow, 13 window glass); then the triangles (uint16). Read once into the form sculpt() gives.
const SCMAT = [40, 1, 25, 17, 18, 4, 19, 20, 21, 22, 23, 24, 50, 26];      // (13: window glass)
function scooter(lo) { return assetMesh(lo ? 'scooterLo' : 'scooter'); }
// SCT2 (assets/pickup.bin): the same, but each vertex 14 bytes - place (int16, metres x 4/32767), normal, whether it is body paint, its colour
// (three bytes, the square root of the colour as the model's texture has it there), a byte to spare. Its material is then the colour itself:
// 100 + red + 32 green + 1024 blue (five bits each), and 32768 more if it is paint (see fsBranch).
function assetMesh(key) { if (SCULPT[key]) return SCULPT[key]; const B0 = ASSET[key], d0 = new DataView(B0);
  if (d0.getUint8(3) === 50) { const nv = d0.getUint32(4, true), ni = d0.getUint32(8, true), v = new Float32Array(nv * 6), c = new Float32Array(nv);
    for (let i = 0, o = 12; i < nv; i++, o += 14) { for (let k = 0; k < 3; k++) { v[i * 6 + k] = d0.getInt16(o + k * 2, true) * 4 / 32767; v[i * 6 + 3 + k] = d0.getInt8(o + 6 + k) / 127; }
      c[i] = 100 + (d0.getUint8(o + 10) >> 3) + 32 * (d0.getUint8(o + 11) >> 3) + 1024 * (d0.getUint8(o + 12) >> 3) + (d0.getUint8(o + 9) ? 32768 : 0); }
    const ix = new Uint32Array(ni); ix.set(new Uint16Array(B0, 12 + nv * 14, ni)); return SCULPT[key] = { v, i: ix, c }; }
  // (SCT4: as SCT1, but its places in metres x 4/32767 - for a thing longer than 4 m, a Ranger)
  const B = B0, dv = d0, nv = dv.getUint32(4, true), ni = dv.getUint32(8, true), v = new Float32Array(nv * 6), c = new Uint8Array(nv), RG = dv.getUint8(3) === 52 ? 4 : 2;
  for (let i = 0, o = 12; i < nv; i++, o += 10) { for (let k = 0; k < 3; k++) { v[i * 6 + k] = dv.getInt16(o + k * 2, true) * RG / 32767; v[i * 6 + 3 + k] = dv.getInt8(o + 6 + k) / 127; } c[i] = dv.getUint8(o + 9); }
  const ix = new Uint32Array(ni), I16 = new Uint16Array(B, 12 + nv * 10, ni); ix.set(I16); return SCULPT[key] = { v, i: ix, c }; }
function bikeParts() { if (SCULPT.bike) return SCULPT.bike; const ch = (P) => { const o = []; for (let i = 0; i + 1 < P.length; i++) o.push(...P[i], ...P[i + 1]); return o; };
  const arc = (y0, z0, R, a0, a1, n, x, r) => { const P = []; for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * PI / 180; P.push([x, y0 + R * sin(a), z0 + R * cos(a), r]); } return ch(P); };
  const body = [];
  // (a sheet is made of ribs set closer than they are thick, so that they close into one skin)
  for (const x of [-0.045, -0.015, 0.015, 0.045]) { body.push(arc(0.28, 0.62, 0.32, 25, 150, 7, x, 0.024)); body.push(arc(0.28, -0.62, 0.32, 70, 168, 6, x, 0.024)); }
  for (let q = -6; q <= 6; q++) { const x = q * 0.03, k = 1 - abs(x) / 0.18; body.push(ch([[x, 0.97, 0.33 + 0.03 * k, 0.03], [x, 0.74, 0.35 + 0.05 * k, 0.03], [x, 0.5, 0.32 + 0.04 * k, 0.03], [x * 0.9, 0.38, 0.26, 0.03], [x * 0.85, 0.355, 0.08, 0.028]])); }
  body.push(ch([[0, 0.97, 0.36, 0.1], [0, 0.98, 0.47, 0.095], [0, 0.96, 0.535, 0.065]])); body.push(ch([[-0.21, 1.03, 0.35, 0.034], [0, 1.045, 0.37, 0.05], [0.21, 1.03, 0.35, 0.034]]));
  body.push(ch([[0, 0.94, 0.33, 0.07], [0, 0.62, 0.28, 0.08], [0, 0.45, 0.14, 0.095], [0, 0.47, -0.04, 0.12]]));
  for (const e of [-1, 1]) { body.push(ch([[e * 0.07, 0.5, -0.02, 0.12], [e * 0.1, 0.58, -0.28, 0.135], [e * 0.1, 0.64, -0.56, 0.115], [e * 0.07, 0.71, -0.8, 0.07], [e * 0.04, 0.76, -0.94, 0.04]])); body.push(ch([[e * 0.09, 0.42, -0.1, 0.09], [e * 0.1, 0.46, -0.45, 0.08]])); }
  const seat = []; for (const e of [-1, 0, 1]) seat.push(ch([[e * 0.08, 0.75, 0.03, 0.06], [e * 0.1, 0.79, -0.2, 0.07], [e * 0.1, 0.81, -0.5, 0.07], [e * 0.07, 0.84, -0.72, 0.05]]));
  const eng = [ch([[0, 0.3, 0.14, 0.11], [0, 0.3, -0.04, 0.1]]), ch([[0, 0.33, 0.16, 0.07], [0, 0.4, 0.33, 0.06]])];
  const helm = [ch([[0, 0.99, -0.12, 0.125], [0, 0.985, -0.08, 0.125]]), ch([[0, 0.93, -0.1, 0.11], [0, 0.9, -0.1, 0.1]])];
  return SCULPT.bike = { body: sculpt('mb_body', body, 0.026, 0.035), seat: sculpt('mb_seat', seat, 0.028, 0.03), eng: sculpt('mb_eng', eng, 0.03, 0.03), helm: sculpt('mb_helm', helm, 0.028, 0.02) }; }
// (chains: the pieces come in runs, each run one limb. Within a run the distance is simply to the nearest piece - melting a limb's own pieces
// into each other swelled it at every joint, a row of lumps; it is run with run that are melted together.)
function sculpt(key, chains, cell = 0.006, K = 0.011) {
  let M = SCULPT.get(key); if (M) return M; const segs = [].concat(...chains), T0 = performance.now();
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (let i = 0; i < segs.length; i += 8) for (const o of [0, 4]) { const r = segs[i + o + 3] + K + cell * 2; x0 = min(x0, segs[i + o] - r); x1 = max(x1, segs[i + o] + r); y0 = min(y0, segs[i + o + 1] - r); y1 = max(y1, segs[i + o + 1] + r); z0 = min(z0, segs[i + o + 2] - r); z1 = max(z1, segs[i + o + 2] + r); }
  const nx = Math.ceil((x1 - x0) / cell) + 1, ny = Math.ceil((y1 - y0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1, F = new Float32Array(nx * ny * nz).fill(1), id = (i, j, q) => (q * ny + j) * nx + i;
  const Tm = new Float32Array(F.length).fill(1);
  for (const ch of chains) { let ci0 = nx, ci1 = 0, cj0 = ny, cj1 = 0, cq0 = nz, cq1 = 0;
    for (let s = 0; s < ch.length; s += 8) { const ax = ch[s], ay = ch[s + 1], az = ch[s + 2], ra = ch[s + 3], bx = ch[s + 4], by = ch[s + 5], bz = ch[s + 6], rb = ch[s + 7], ux = bx - ax, uy = by - ay, uz = bz - az, L2 = ux * ux + uy * uy + uz * uz || 1e-9, R = max(ra, rb) + K + cell;
      const i0 = max(0, floor((min(ax, bx) - R - x0) / cell)), i1 = min(nx - 1, Math.ceil((max(ax, bx) + R - x0) / cell)), j0 = max(0, floor((min(ay, by) - R - y0) / cell)), j1 = min(ny - 1, Math.ceil((max(ay, by) + R - y0) / cell)), q0 = max(0, floor((min(az, bz) - R - z0) / cell)), q1 = min(nz - 1, Math.ceil((max(az, bz) + R - z0) / cell));
      ci0 = min(ci0, i0); ci1 = max(ci1, i1); cj0 = min(cj0, j0); cj1 = max(cj1, j1); cq0 = min(cq0, q0); cq1 = max(cq1, q1);
      for (let q = q0; q <= q1; q++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const px = x0 + i * cell - ax, py = y0 + j * cell - ay, pz = z0 + q * cell - az, t = clamp((px * ux + py * uy + pz * uz) / L2, 0, 1), d = hypot(px - ux * t, py - uy * t, pz - uz * t) - (ra + (rb - ra) * t), n = id(i, j, q); if (d < Tm[n]) Tm[n] = d; } }
    for (let q = cq0; q <= cq1; q++) for (let j = cj0; j <= cj1; j++) for (let i = ci0; i <= ci1; i++) { const n = id(i, j, q), d = Tm[n]; if (d < 1) { const f = F[n], h = max(K - abs(f - d), 0) / K; F[n] = min(f, d) - h * h * K * 0.25; Tm[n] = 1; } } }
  const vid = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), cid = (i, j, q) => (q * (ny - 1) + j) * (nx - 1) + i, V = [], I = [];
  const EC = [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1], [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1], [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]];
  const G = (i, j, q) => F[id(clamp(i, 0, nx - 1), clamp(j, 0, ny - 1), clamp(q, 0, nz - 1))];
  for (let q = 0; q < nz - 1; q++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const n0 = id(i, j, q), b0 = F[n0] < 0; if (F[n0] > cell * 2 || F[n0] < -cell * 2) continue;
    if (b0 === (F[n0 + 1] < 0) && b0 === (F[n0 + nx] < 0) && b0 === (F[n0 + nx + 1] < 0) && b0 === (F[n0 + nx * ny] < 0) && b0 === (F[n0 + nx * ny + 1] < 0) && b0 === (F[n0 + nx * ny + nx] < 0) && b0 === (F[n0 + nx * ny + nx + 1] < 0)) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const e of EC) { const a = F[id(i + e[0], j + e[1], q + e[2])], b = F[id(i + e[3], j + e[4], q + e[5])]; if ((a < 0) === (b < 0)) continue; const t = a / (a - b); sx += e[0] + (e[3] - e[0]) * t; sy += e[1] + (e[4] - e[1]) * t; sz += e[2] + (e[5] - e[2]) * t; n++; }
    if (!n) continue; const fx = i + sx / n, fy = j + sy / n, fz = q + sz / n, ri = Math.round(fx), rj = Math.round(fy), rq = Math.round(fz);
    let gx = G(ri + 1, rj, rq) - G(ri - 1, rj, rq), gy = G(ri, rj + 1, rq) - G(ri, rj - 1, rq), gz = G(ri, rj, rq + 1) - G(ri, rj, rq - 1); const gl = hypot(gx, gy, gz) || 1;
    vid[cid(i, j, q)] = V.length / 6; V.push(x0 + fx * cell, y0 + fy * cell, z0 + fz * cell, gx / gl, gy / gl, gz / gl); }
  const quad = (a, b, c, d) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; I.push(a, b, c, a, c, d); };
  for (let q = 1; q < nz - 1; q++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const f = F[id(i, j, q)] < 0;
    if (f !== (F[id(i + 1, j, q)] < 0)) quad(vid[cid(i, j - 1, q - 1)], vid[cid(i, j, q - 1)], vid[cid(i, j, q)], vid[cid(i, j - 1, q)]);
    if (f !== (F[id(i, j + 1, q)] < 0)) quad(vid[cid(i - 1, j, q - 1)], vid[cid(i, j, q - 1)], vid[cid(i, j, q)], vid[cid(i - 1, j, q)]);
    if (f !== (F[id(i, j, q + 1)] < 0)) quad(vid[cid(i - 1, j - 1, q)], vid[cid(i, j - 1, q)], vid[cid(i, j, q)], vid[cid(i - 1, j, q)]); }
  M = { v: new Float32Array(V), i: new Uint32Array(I) }; SCULPT.set(key, M); SCULPT.ms = (SCULPT.ms || 0) + performance.now() - T0; return M;
}
// A shop's hours, as they are kept in a country town: open from early morning, and by six to eight in the evening shut, its shutters down and
// its lights and its board out - a grocery stays open a little later, to nine or ten; the convenience store never shuts (it carries no hours).
// Each shop its own times, to the half hour, from those of its trade (r1, r2: its own random numbers). The shader reads them back from the
// box's shape slot (common.wgsl hrsOpen): 1000 * H, H = 1 + c + 12 o, opening at 5.5 + o / 2 o'clock and shutting at 17 + c / 2; and +128000
// on a shutter, which is there only while the shop is shut. kind: -1 shut for good (to let), 1-5 a shophouse's (sk), 10 a showroom, 11 a store.
const HRS = (kind, r1 = 0, r2 = 0) => { const [o0, o1, c0, c1] = { [-1]: [9.5, 9.5, 17, 17], 1: [5.5, 6.5, 20, 22.5], 2: [6, 7, 17, 21], 3: [8.5, 9.5, 17, 18], 4: [8, 9, 18, 21], 5: [8, 8.5, 17, 18.5], 10: [8.5, 9.5, 17.5, 19], 11: [7, 8, 17, 18] }[kind];
  const q = (a, b, r) => a + Math.round(r * (b - a) * 2) / 2; return 1000 * (1 + Math.round((q(c0, c1, r1) - 17) * 2) + 12 * Math.round((q(o0, o1, r2) - 5.5) * 2)); };
// A convenience store's car park (see the street's blocks in buildChunk): the store stands CONV_BACK further back than the row it replaces, and
// has two ways in across the footpath, one at each end of its apron. convOf(blk, side): the store's width if block blk has one on that side, else 0
// (the same lots drawn as there - kind, the twelve-block spacing, the small kind - and the same tests of town and river at its middle unit);
// convDr(z, side, h): does a kerb stone h either side of z stand in one of its ways in? (asked by the kerb, and by the posts set along it)
// (where along the road a point lies: the z of the road's point it stands square out from, near enough - the measure the footpath is laid by)
const rparam = (x, z) => { const sl = roadSl(z); return z + sl * (x - roadX(z)) / (1 + sl * sl); };
const CONV_BACK = 8, CVC = new Map();
const convOf = (blk, side) => { const key = blk * 2 + (side > 0 ? 1 : 0); let v = CVC.get(key); if (v !== undefined) return v; v = null;
  const tw0 = twS, keep = Object.assign({}, RV), z3 = (blk * 9 + 3.5) * 4;
  if (townW(z3) >= 0.5 && !nearRiv(z3, 9)) { const seg = twS, tch = ph(seg, 300), bq = blk * 2 + (side > 0 ? 1 : 0), bt = ph(bq, 310 + seg);
    let kind = bt < 0.13 ? 1 : bt < 0.27 ? 2 : bt < 0.27 + (tch < 0.6 ? 0.13 : 0.04) ? 3 : bt > 0.94 ? 5 : 0;
    if (((blk % 24) + 24) % 24 === floor(tch * 24) && (side > 0) === (ph(seg, 301) < 0.5)) kind = 4;
    const sg = floor(blk / 12);
    if ((kind === 0 || kind === 2) && blk - sg * 12 === 2 + floor(ph(sg, 346 + seg) * 7.99) && (side > 0) === (ph(sg, 348 + seg) < 0.5)) {
      const Wb = ph(bq, 346 + seg) < 0.5 ? 11 : 20, sb = 8 + floor(ph(bq, 330 + seg) * 3) * 1.3 + (udOf(blk * 36 + 18) && abs(blk * 36 + 18 - UD.zc) < 130 ? SVW : 0) + CONV_BACK;
      const a = atan2(roadX(z3 + 1) - roadX(z3 - 1), 2), nx = cos(a) * side, nz = -sin(a) * side, cz = z3 + nz * (sb + 6), yaw = atan2(-nx, -nz), c = cos(yaw), sn = sin(yaw), X = 2 * side, fwd = sb + 6;
      // (where each way in meets the kerb, along z: the local place (X +- (Wa/2 - 2.3), fwd - 3.88) turned out into the world as the builder does)
      // (kept as places along the road - rparam - not world z: the kerb, the footpath and the way in's own slab are all laid square to the
      // road, and on a slanting street a way in reckoned by world z lay a metre and more askew of the gap left for it)
      const gx0 = roadX(z3) + nx * (sb + 6); v = [-1, 1].map((e) => { const lx = X + e * ((Wb + 9.4) / 2 - 2.3), lz = fwd - 3.88; return rparam(gx0 + lx * c + lz * sn, cz - lx * sn + lz * c); });
      // (a way in that would fall on a bridge's approach, or where the ground beside the street is not its level, is not made: there the kerb
      // and the footpath run on - see footOK; it is the same test, asked across the way in's width)
      const zr = [min(v[0], v[1]), max(v[0], v[1])]; v = v.filter((zd) => [-CONV_DW, 0, CONV_DW].every((e) => footOK(roadX(zd + e) + side * 6, zd + e))); v.zr = zr;
      // (and, kept with them, the car park's own rectangle for convIn: the unit's middle, its turn, the apron's middle along and half its width, its depth)
      v.geo = [roadX(z3) + nx * (sb + 6), cz, c, sn, X, (Wb + 9.4) / 2, 5.1, fwd - 8.05]; } }
  twS = tw0; Object.assign(RV, keep); if (CVC.size > 4000) CVC.clear(); CVC.set(key, v); return v; };
// A town's school and its football field (โรงเรียน, สนามฟุตบอล): every town has one or the other, or both. Each takes the far part of the
// lots between two lanes, b and b + 1, on one side of the street - 75 to 160 m out along lane b, the whole width across to lane b + 1 - in
// place of the houses there. civSites(seg): the town's sites [b, side, kind (1 school, 2 field)], chosen near its middle where the lanes run
// full length, clear of cross streets and rivers; civAt(b, side): the kind of the site between lanes b and b + 1, or 0; civIn(x, z): the kind
// of the site a point is in (trees and grass keep off it), or 0.
const CIVS = new Map(), CIV_T0 = 75, CIV_T1 = 160;
const civSites = (seg) => { let v = CIVS.get(seg); if (v) return v; v = []; const tw0 = twS, keep = Object.assign({}, RV);
  const r = ph(seg, 700), want = r < 0.4 ? [1, 2] : r < 0.7 ? [1] : [2], bc = floor(((seg + 0.5) * SEG - 34) / 36) + floor((ph(seg, 701) - 0.5) * 8);
  const okL = (b, side) => { const zl = b * 36 + 34; if (townW(zl) < 0.9 || twS !== seg || xroad(b) || laneRiv(b) || nearRiv(zl, 40)) return false; const sd = laneSd(b); return !sd || sd === side; };
  for (const kind of want) { let done = false;
    for (let d = 0; d < 24 && !done; d++) { const b = bc + (d & 1 ? -(d + 1) / 2 : d / 2) * (kind === 2 ? -1 : 1) + (kind === 2 ? 3 : 0);
      for (const side of ph(seg, 702 + kind) < 0.5 ? [1, -1] : [-1, 1]) { if (done || v.some((q) => abs(q[0] - b) < 3 && q[1] === side) || !okL(b, side) || !okL(b + 1, side)) continue; v.push([b, side, kind]); done = true; } } }
  twS = tw0; Object.assign(RV, keep); if (CIVS.size > 200) CIVS.clear(); CIVS.set(seg, v); return v; };
const civAt = (b, side) => { const zl = b * 36 + 34, tw0 = twS; if (townW(zl) < 0.5) { twS = tw0; return 0; } const seg = twS; twS = tw0; for (const q of civSites(seg)) if (q[0] === b && q[1] === side) return q[2]; return 0; };
// the lane a site's ground belongs to, and how far across it a point lies: [zl of lane b, l] for a point on a site or in the step beyond its far edge, else null
const civLane = (x, z) => { if (townW(z) < 0.5) return null; const tw0 = twS, s0 = roadX(z + 0.5) - roadX(z - 0.5), b = floor((z + s0 * (x - roadX(z)) - 34) / 36); let o = null;
  for (const bb of [b + 1, b, b - 1, b - 2]) { const zl = bb * 36 + 34, s = (roadX(zl + 1) - roadX(zl - 1)) / 2, n = Math.sqrt(1 + s * s), t = ((x - roadX(zl)) - (z - zl) * s) / n, l = ((x - roadX(zl)) * s + z - zl) / n;
    if (abs(t) > CIV_T0 - 3 && abs(t) < CIV_T1 + 3 && l > -0.5 && l < 36.5 && civAt(bb, t > 0 ? 1 : -1)) { o = [zl, l]; break; } }
  twS = tw0; return o; };
const civIn = (x, z) => { if (townW(z) < 0.5) return 0; const s0 = roadX(z + 0.5) - roadX(z - 0.5), b = floor((z + s0 * (x - roadX(z)) - 34) / 36);
  for (const bb of [b + 1, b, b - 1, b - 2]) { const zl = bb * 36 + 34, s = (roadX(zl + 1) - roadX(zl - 1)) / 2, n = Math.sqrt(1 + s * s), t = ((x - roadX(zl)) - (z - zl) * s) / n, l = ((x - roadX(zl)) * s + z - zl) / n;
    if (abs(t) > CIV_T0 - 1 && abs(t) < CIV_T1 + 1 && l > 1.5 && l < 34.5) { const k = civAt(bb, t > 0 ? 1 : -1); if (k) return k; } } return 0; };
// A town's footpath stands FOOT_H above the road, flush with the top of its kerb stones (they stand 15 cm up: see the kerb in buildChunk) -
// built as paving slabs from the kerb back to the shop fronts, 4.0 to 8.0 m out (as the ground's paving is painted), except across a lane's mouth
// and a convenience store's ways in, where the lane's surface or the road's level runs through. footK(x, z): 1 on the raised footpath, else 0;
// walkY(x, z): the height to stand a person or a thing on - the ground's, or the footpath's top over it.
const FOOT_H = 0.15;
// The raised footpath is 8 m out from the road's middle everywhere, one width the length of the street: let reach back to each block's own
// front it stepped at every block's end, and on a bend the steps cut across it. Where a row of shophouses stands further back than that, the
// strip between is the row's own concrete apron, at the footpath's height (built with the row, unit by unit: buildChunk).
const footR = () => 8;
// footOK(x, z): may the kerb and the raised footpath stand here at all - in town, not beside an underpass, not on a bridge (up to its deck's
// end: they run on to it, as they did not, stopping 12 m short and leaving a strip of painted paving at the road's level), and only where the
// ground is the street's level (on a bridge's approach the bank may fall away beside the road: there they stop)
// (the street's frontage reaches a little past where townW falls under a half: the last unit of a row is built by the town's measure at its
// middle, and stands on for its width and more where the road slants - the footpath and the kerb go on 6 m further, past its corner)
const townF = (z) => { const t0 = twS, v = max(townW(z - 6), townW(z), townW(z + 6)) >= 0.5; twS = t0; return v; };
const footOK = (x, z) => { if (!townF(z)) return false; const keep = Object.assign({}, RV);
  const deck = rivOf(z) && abs(z - RV.zb) < RV.W / 2 + 7.5; Object.assign(RV, keep); if (deck) return false; return abs(ground(x, z) - roadYs(z)) < 0.12; };
const footK = (x, z) => { if (!townF(z)) return 0; const dx = x - roadX(z), d = abs(dx), w = svW(z); if (d < 4.0 + w || d > footR(z, dx > 0 ? 1 : -1) + w) return 0;
  const tw0 = twS; let k = footOK(roadX(z) + (dx > 0 ? 6 + w : -6 - w), z) ? 1 : 0;
  if (k && soiD(x, z) < 2.05) k = 0; if (k && convDr(rparam(x, z), dx > 0 ? 1 : -1, 0)) k = 0; twS = tw0; return k; };
// (footK is asked for every walker every frame - render.js STROLL - and goes through lanes, rivers and car parks: so its answer is kept, by
// the 25 cm square a point falls in)
const FKC = new Map(), footKc = (x, z) => { const key = Math.round(x * 4) * 1e6 + Math.round(z * 4); let v = FKC.get(key); if (v === undefined) { v = footK(x, z); if (FKC.size > 200000) FKC.clear(); FKC.set(key, v); } return v; };
const walkY = (x, z) => ground(x, z) + FOOT_H * footKc(x, z);
// is z along the front of a convenience store on that side (its apron and both ways in)?
const convFront = (z, side) => { if (townW(z) < 0.5) return false; const b0 = floor(z / 36); for (let blk = b0 - 1; blk <= b0 + 1; blk++) { const v = convOf(blk, side); if (v && z > v.zr[0] - 4 && z < v.zr[1] + 4) return true; } return false; };
// (each way in is CONV_DW either side of its middle along the street: the kerb, the raised footpath and the car park's own kerb all stop at
// exactly that line - drvCut gives what is left of a stretch za..zb once the ways in are taken out of it - so that their ends meet square)
const CONV_DW = 2.1;
// is a point on a convenience store's car park (or its ways in)? - nothing is planted there, whichever chunk plants it
const convIn = (x, z) => { if (townW(z) < 0.5) return false; const side = x > roadX(z) ? 1 : -1, b0 = floor(z / 36);
  for (let blk = b0 - 1; blk <= b0 + 1; blk++) { const v = convOf(blk, side); if (!v) continue; const [gx, gz, c, sn, X, hw, z0, z1] = v.geo, dx = x - gx, dz = z - gz;
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c; if (abs(lx - X) < hw + 1 && lz > z0 - 1 && lz < z1 + 4.5) return true; } return false; };
const convDr = (z, side, h) => { if (townW(z) < 0.5) return false; const b0 = floor(z / 36);
  for (let blk = b0 - 1; blk <= b0 + 1; blk++) { const v = convOf(blk, side); if (v) for (const zd of v) if (abs(z - zd) < CONV_DW + h) return true; } return false; };
// the stretches of za..zb where ok(z) holds, found to 5 cm and split at the blocks' ends (every 36 m): where the kerb and the raised footpath
// stop at a lane's mouth or a way in, both stop at the same line, square across
const runsBy = (za, zb, ok) => { const o = []; let a = null; const n = Math.max(1, Math.round((zb - za) / 0.05));
  for (let i = 0; i <= n; i++) { const z = za + (zb - za) * i / n, k = i < n && ok(z + (zb - za) / n / 2), cut = a !== null && floor((z - 1e-6) / 36) !== floor((a + 1e-6) / 36);
    if (a !== null && (!k || cut)) { o.push([a, z]); a = null; } if (k && a === null && i < n) a = z; }
  return o.filter(([p, q]) => q - p > 0.04); };
const drvCut = (za, zb, side) => { let runs = [[za, zb]]; if (townW((za + zb) / 2) < 0.5) return runs; const b0 = floor((za + zb) / 72);
  for (let blk = b0 - 1; blk <= b0 + 1; blk++) { const v = convOf(blk, side); if (!v) continue;
    for (const zd of v) { const c0 = zd - CONV_DW, c1 = zd + CONV_DW, o = []; for (const [a, b] of runs) { if (b <= c0 || a >= c1) { o.push([a, b]); continue; } if (a < c0) o.push([a, c0]); if (b > c1) o.push([c1, b]); } runs = o; } }
  return runs.filter(([a, b]) => b - a > 0.05); };
// A sack's shape (a rice sack, a feed or fertiliser sack, a five-kilo bag): a pillow - flat-sided, its corners and edges rounded, puffed at the
// middle - as a superellipsoid of half-extents 1, 9 rings of 16. SACKT: [unit place, unit normal direction] for each vertex, and the triangles.
const SACKT = (() => { const P = [], N = [], I = [], nt = 8, np = 16, sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e), e1 = 0.28, e2 = 0.55;
  for (let i = 0; i <= nt; i++) { const th = -Math.PI / 2 + Math.PI * i / nt; for (let j = 0; j < np; j++) { const f = 2 * Math.PI * j / np, ct = Math.cos(th), st = Math.sin(th);
    P.push(sp(ct, e2) * sp(Math.cos(f), e1), sp(st, e2), sp(ct, e2) * sp(Math.sin(f), e1)); N.push(sp(ct, 2 - e2) * sp(Math.cos(f), 2 - e1), sp(st, 2 - e2), sp(ct, 2 - e2) * sp(Math.sin(f), 2 - e1)); } }
  for (let i = 0; i < nt; i++) for (let j = 0; j < np; j++) { const a = i * np + j, b = i * np + (j + 1) % np, c = a + np, d = b + np; I.push(a, c, b, b, c, d); }
  return { P, N, I: new Uint32Array(I) }; })();
// (and a rounder one - an open sack standing, baggy, its neck rolled down; the rice heaped in its mouth)
const SACKR = (() => { const P = [], N = [], I = [], nt = 8, np = 16, sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e), e1 = 0.75, e2 = 0.45;
  for (let i = 0; i <= nt; i++) { const th = -Math.PI / 2 + Math.PI * i / nt; for (let j = 0; j < np; j++) { const f = 2 * Math.PI * j / np, ct = Math.cos(th), st = Math.sin(th);
    P.push(sp(ct, e2) * sp(Math.cos(f), e1), sp(st, e2), sp(ct, e2) * sp(Math.sin(f), e1)); N.push(sp(ct, 2 - e2) * sp(Math.cos(f), 2 - e1), sp(st, 2 - e2), sp(ct, 2 - e2) * sp(Math.sin(f), 2 - e1)); } }
  for (let i = 0; i < nt; i++) for (let j = 0; j < np; j++) { const a = i * np + j, b = i * np + (j + 1) % np, c = a + np, d = b + np; I.push(a, c, b, b, c, d); }
  return { P, N, I: new Uint32Array(I) }; })();
// A tyre (TYRET): a ring of half-extents 1 - outer radius 1, the hole 0.56 across where the rim goes - its tread flat and its walls rounded,
// turned round its own y; 20 round by 10 about the section. (For the tyre shop: drawn whole, the hole through it seen.)
const TYRET = (() => { const P = [], N = [], I = [], nr = 20, ns = 10;
  for (let i = 0; i < nr; i++) { const a = 2 * Math.PI * i / nr, ca = Math.cos(a), sa = Math.sin(a);
    for (let j = 0; j < ns; j++) { const t = 2 * Math.PI * j / ns, ct = Math.cos(t), st = Math.sin(t), sq = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
      const rr = 0.78 + 0.22 * sq(ct, 0.45), yy = sq(st, 0.6); P.push(rr * ca, yy, rr * sa); const nx = sq(ct, 1.55), ny = sq(st, 1.4), nl = Math.hypot(nx, ny) || 1; N.push(nx / nl * ca, ny / nl, nx / nl * sa); } }
  for (let i = 0; i < nr; i++) for (let j = 0; j < ns; j++) { const a = i * ns + j, b = i * ns + (j + 1) % ns, c = ((i + 1) % nr) * ns + j, d = ((i + 1) % nr) * ns + (j + 1) % ns; I.push(a, b, c, b, d, c); }
  return { P, N, I: new Uint32Array(I) }; })();
// A pickup with one wheel off, for the tyre shop's bay: the Carry's triangles less those of its wheel at the front on the -x side (the side the bay's turn shows to the street) (found from
// the model itself: the lowest points out at that side, toward its front). WHL: [x, y, z] of that wheel's middle, for the hub left showing.
let PKW = null;
const pickupNoWheel = () => { if (PKW) return PKW; const M = assetMesh('pickup'); if (!M || !M.v) return M; const V = M.v; let zs = 0, n = 0, xs = 0;
  for (let k = 0; k < V.length; k += 6) if (V[k + 1] < 0.06 && V[k] < -0.4 && V[k + 2] > 0.3) { zs += V[k + 2]; xs += V[k]; n++; }
  const zc = n ? zs / n : 0.9, xc = n ? xs / n : -0.61, R = 0.34, I0 = M.i, I = [];
  const inW = (q) => V[q * 6] < xc + 0.25 && V[q * 6 + 1] < 2 * R + 0.02 && Math.abs(V[q * 6 + 2] - zc) < R + 0.04;
  for (let t = 0; t < I0.length; t += 3) if (!(inW(I0[t]) && inW(I0[t + 1]) && inW(I0[t + 2]))) I.push(I0[t], I0[t + 1], I0[t + 2]);
  PKW = Object.assign({}, M, { i: new Uint32Array(I), whl: [xc, R, zc] }); return PKW; };
// Boats, sculpted (they were a few boxes each). Built once each, in their own measure - x across, y up from the waterline, z toward the bow -
// and set in the world by buildChunk's boat(). bMesh: a small builder - points with a material, quads, tubes, boxes; the normals are worked
// out from the faces when it is done. Colours are materials 100 + five bits each of red, green and blue (fsBranch); 3 is weathered wood,
// 4 grey metal, 1 black rubber.
const bMesh = () => { const P = [], M = [], I = [], B = { P, M, I };
  B.v = (x, y, z, m) => { P.push(x, y, z); M.push(m); return P.length / 3 - 1; };
  B.quad = (a, b, c, d) => { I.push(a, b, c, a, c, d); };
  // (a sheet through rows of points, each row a list of [x, y, z])
  B.sheet = (rows, m) => { const n = rows[0].length, b0 = P.length / 3; for (const r of rows) for (const q of r) B.v(q[0], q[1], q[2], m); for (let i = 0; i + 1 < rows.length; i++) for (let j = 0; j + 1 < n; j++) { const a = b0 + i * n + j; B.quad(a, a + 1, a + n + 1, a + n); } };
  B.tube = (a, b, r0, r1, m, n = 6) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]) || 1, u = Math.abs(d[1]) / L > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const e1 = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]], l1 = Math.hypot(e1[0], e1[1], e1[2]) || 1, f1 = e1.map((q) => q / l1), f2 = [(d[1] * f1[2] - d[2] * f1[1]) / L, (d[2] * f1[0] - d[0] * f1[2]) / L, (d[0] * f1[1] - d[1] * f1[0]) / L];
    const ring = (c, r) => Array.from({ length: n + 1 }, (_, k) => { const t = k / n * Math.PI * 2, cs = Math.cos(t) * r, sn = Math.sin(t) * r; return [c[0] + f1[0] * cs + f2[0] * sn, c[1] + f1[1] * cs + f2[1] * sn, c[2] + f1[2] * cs + f2[2] * sn]; }); B.sheet([ring(a, r0), ring(b, r1)], m); };
  B.box = (cx, cy, cz, sx, sy, sz, m) => { const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    for (const f of [[[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [[x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]], [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [[x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0]]]) { const k = f.map((q) => B.v(q[0], q[1], q[2], m)); B.quad(k[0], k[1], k[2], k[3]); } };
  B.done = () => { const n = P.length / 3, N = new Float32Array(n * 3); for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const q of [a, b, c]) { N[q] += nx; N[q + 1] += ny; N[q + 2] += nz; } }
    for (let k = 0; k < n; k++) { const l = Math.hypot(N[k * 3], N[k * 3 + 1], N[k * 3 + 2]) || 1; N[k * 3] /= l; N[k * 3 + 1] /= l; N[k * 3 + 2] /= l; } return { P: new Float32Array(P), N, M: new Float32Array(M), I: new Uint32Array(I), n }; };
  return B; };
const bCol = (r, g, b) => 100 + Math.round(Math.sqrt(r) * 31) + 32 * Math.round(Math.sqrt(g) * 31) + 1024 * Math.round(Math.sqrt(b) * 31);
// (a hull: stations from stern to bow; at each the half beam, the keel's and the sheer's height, and its place along the boat; the skin in
// bands from keel to gunwale, each its own colour - so the bottom paint, the boot stripe and the topsides part cleanly)
const bHull = (B, N, st, prof, bands) => { const sm2 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const S = Array.from({ length: N + 1 }, (_, i) => st(i / N, sm2));
  const pt = (q, j, sd) => [sd * q.b * prof[j][0], q.k + (q.h - q.k) * prof[j][1], q.z];
  for (const sd of [-1, 1]) for (const [j0, j1, m] of bands) { const rows = S.map((q) => Array.from({ length: j1 - j0 + 1 }, (_, k) => pt(q, sd > 0 ? j0 + k : j1 - k, sd))); B.sheet(sd > 0 ? rows : rows, m); }
  return S; };
const BOATS = {};
// The long-tail (เรือหางยาว): 8 m of narrow wooden hull, flat-bottomed and flared, its sheer sweeping up into a tall upturned prow bound with
// cloths of three colours and a garland; plank seats, bottom boards; on some a canopy of striped canvas on a frame; at the stern, on its
// pivot, a car's engine with its long shaft and propeller trailing out behind, and the tiller reaching forward. Varnished wood, a painted
// band along the gunwale, each boat its own.
const longTail = (v) => { const key = 'lt' + v; if (BOATS[key]) return BOATS[key]; const B = bMesh(), L = 8.2, wood = bCol(0.30, 0.17, 0.07), dark = bCol(0.14, 0.075, 0.03);
  const trim = [bCol(0.05, 0.22, 0.55), bCol(0.55, 0.05, 0.04), bCol(0.04, 0.34, 0.16), bCol(0.62, 0.42, 0.03)][v % 4];
  const st = (t, sm2) => { const bow = sm2(0.62, 1, t); return { z: -L / 2 + L * t + 0.5 * bow * bow, b: 0.66 * (0.74 + 0.26 * sm2(0, 0.28, t)) * (1 - 0.97 * Math.pow(bow, 1.35)), k: -0.16 + 1.55 * Math.pow(sm2(0.78, 1, t), 2.2), h: 0.44 + 0.07 * sm2(0.2, 0, t) + 1.38 * Math.pow(sm2(0.66, 1, t), 2) }; };
  const prof = [[0, 0], [0.5, 0.02], [0.8, 0.3], [0.94, 0.72], [1, 1]], S = bHull(B, 18, st, prof, [[0, 2, dark], [2, 3, wood], [3, 4, trim]]);
  for (const sd of [-1, 1]) for (let i = 0; i < S.length - 1; i++) B.tube([sd * S[i].b, S[i].h, S[i].z], [sd * S[i + 1].b, S[i + 1].h, S[i + 1].z], 0.035, 0.035, wood, 5);      // the gunwales
  { const q = S[0], k = [[-q.b, q.h], [-q.b * 0.8, q.k + 0.1], [0, q.k], [q.b * 0.8, q.k + 0.1], [q.b, q.h]].map((e) => B.v(e[0], e[1], q.z, wood)); B.quad(k[0], k[1], k[2], k[4]); B.quad(k[2], k[3], k[4], k[4]); }      // the transom
  B.sheet([[[-0.42, 0.0, -3.6], [0.42, 0.0, -3.6]], [[-0.5, 0.0, 0], [0.5, 0.0, 0]], [[-0.3, 0.02, 2.2], [0.3, 0.02, 2.2]]], 3);      // bottom boards
  for (const z of [-2.5, -1.0, 0.5, 1.9]) B.box(0, 0.33, z, 1.12 - 0.1 * Math.abs(z), 0.04, 0.26, 3);      // thwarts
  // the prow: the stem carried on up, and round it the cloths - red, white, blue, yellow - and a garland hanging
  { const tip = S[S.length - 1], a = [0, tip.h - 0.04, tip.z], b = [0, tip.h + 0.42, tip.z + 0.2]; B.tube(a, b, 0.05, 0.03, wood, 6);
    [bCol(0.6, 0.04, 0.04), bCol(0.7, 0.7, 0.66), bCol(0.05, 0.12, 0.5), bCol(0.7, 0.5, 0.03), bCol(0.6, 0.2, 0.4)].forEach((c, k) => { const y0 = tip.h - 0.62 + k * 0.12, q0 = S[S.length - 2]; B.tube([0, y0, tip.z - 0.2 + k * 0.05], [0, y0 + 0.1, tip.z - 0.17 + k * 0.05], 0.085 - k * 0.006, 0.085 - k * 0.006, c, 8);
      B.sheet([[[-0.03, y0, tip.z - 0.26], [0.03, y0, tip.z - 0.26]], [[-0.05, y0 - 0.5 - 0.06 * k, tip.z - 0.4 - 0.03 * k], [0.05, y0 - 0.5 - 0.06 * k, tip.z - 0.4 - 0.03 * k]]], c); });
    for (let k = 0; k < 9; k++) { const a0 = k / 9 * Math.PI, a1 = (k + 1) / 9 * Math.PI; B.tube([0.16 * Math.cos(a0), tip.h - 0.7 - 0.22 * Math.sin(a0), tip.z - 0.12], [0.16 * Math.cos(a1), tip.h - 0.7 - 0.22 * Math.sin(a1), tip.z - 0.12], 0.03, 0.03, k % 2 ? bCol(0.7, 0.45, 0.03) : bCol(0.72, 0.72, 0.66), 5); } }
  if (v % 2 === 0) {      // the canopy: a frame of four posts and two hoops, canvas stretched over them in a low arch, striped
    for (const sd of [-1, 1]) for (const z of [-1.9, 1.0]) B.tube([sd * 0.56, 0.42, z], [sd * 0.56, 1.5, z], 0.022, 0.022, 4, 5);
    const cA = bCol(0.62, 0.62, 0.58), cB = [bCol(0.05, 0.2, 0.5), bCol(0.05, 0.3, 0.15), bCol(0.5, 0.06, 0.05), bCol(0.1, 0.1, 0.12)][(v >> 1) % 4];
    for (let k = 0; k < 8; k++) { const z0 = -2.15 + k * 0.425, z1 = z0 + 0.425; B.sheet([-1, -0.6, -0.2, 0.2, 0.6, 1].map((u) => [[u * 0.62, 1.5 + 0.2 * (1 - u * u), z0], [u * 0.62, 1.5 + 0.2 * (1 - u * u), z1]]), k % 2 ? cA : cB); } }
  // the engine on its pivot at the stern: block, head, exhaust, the tank; the shaft away aft and down to the propeller; the tiller forward
  { const pz = -3.75, py = 0.78; B.tube([0, 0.4, pz], [0, py, pz], 0.04, 0.04, 4, 6); B.box(0, py + 0.2, pz - 0.15, 0.36, 0.34, 0.6, 4); B.box(0, py + 0.42, pz - 0.15, 0.3, 0.1, 0.5, bCol(0.5, 0.06, 0.04)); B.tube([0.2, py + 0.3, pz - 0.3], [0.26, py + 0.75, pz - 0.35], 0.03, 0.03, bCol(0.1, 0.09, 0.08), 5);
    B.box(-0.22, py + 0.1, pz + 0.3, 0.18, 0.22, 0.3, bCol(0.55, 0.3, 0.03)); B.tube([0, py + 0.12, pz - 0.45], [0, -0.22, pz - 3.5], 0.03, 0.025, 4, 6);
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; B.sheet([[[0, -0.22, pz - 3.5], [0, -0.22, pz - 3.56]], [[0.13 * Math.cos(a), -0.22 + 0.13 * Math.sin(a), pz - 3.47], [0.13 * Math.cos(a + 0.5), -0.22 + 0.13 * Math.sin(a + 0.5), pz - 3.56]]], bCol(0.5, 0.36, 0.1)); }
    B.tube([0, py + 0.3, pz + 0.15], [0, py + 0.5, pz + 1.5], 0.022, 0.018, 4, 5); }
  return (BOATS[key] = Object.assign(B.done(), { half: [0.7, 4.2], top: 0.6 })); };
// The fishing boat (เรือประมง): 11 m, deep and beamy, a high flared bow; bottom paint red to above the water, a white boot stripe, topsides in
// one strong colour, a bulwark and its cap; a planked deck; the wheelhouse aft, white with the hull's colour for trim, windows all round and a
// roof that overhangs; a mast with a crosstree and two booms, stays down to the rails; old tyres hung along the sides for fenders; a heap of
// green net on the foredeck, a row of floats; a flag at the masthead.
const fisher = (v) => { const key = 'fb' + v; if (BOATS[key]) return BOATS[key]; const B = bMesh(), L = 11, white = bCol(0.66, 0.66, 0.62), red = bCol(0.38, 0.05, 0.04);
  const hue = [bCol(0.03, 0.22, 0.5), bCol(0.03, 0.34, 0.3), bCol(0.03, 0.3, 0.12), bCol(0.5, 0.2, 0.03)][v % 4];
  const st = (t, sm2) => { const bow = sm2(0.6, 1, t); return { z: -L / 2 + L * t + 0.7 * bow * bow, b: 1.72 * (0.8 + 0.2 * sm2(0, 0.25, t)) * (1 - 0.96 * Math.pow(bow, 1.5)), k: -0.62 + 1.5 * Math.pow(sm2(0.84, 1, t), 2.4), h: 1.28 + 0.12 * sm2(0.25, 0, t) + 1.05 * Math.pow(sm2(0.55, 1, t), 1.8) }; };
  const prof = [[0, 0], [0.45, 0.06], [0.8, 0.3], [0.93, 0.42], [0.96, 0.5], [1.0, 0.86], [1.0, 1]], S = bHull(B, 20, st, prof, [[0, 3, red], [3, 4, white], [4, 5, hue], [5, 6, white]]);
  for (const sd of [-1, 1]) for (let i = 0; i < S.length - 1; i++) B.tube([sd * S[i].b, S[i].h, S[i].z], [sd * S[i + 1].b, S[i + 1].h, S[i + 1].z], 0.05, 0.05, 3, 5);
  { const q = S[0], k = [[-q.b, q.h], [-q.b * 0.8, q.k + 0.35], [0, q.k], [q.b * 0.8, q.k + 0.35], [q.b, q.h]].map((e) => B.v(e[0], e[1], q.z, hue)); B.quad(k[0], k[1], k[2], k[4]); B.quad(k[2], k[3], k[4], k[4]); }
  B.sheet(S.filter((_, i) => i % 2 === 0).map((q) => [[-q.b * 0.97, q.k + (q.h - q.k) * 0.84, q.z], [q.b * 0.97, q.k + (q.h - q.k) * 0.84, q.z]]), 3);      // the deck
  // the wheelhouse
  { const z = -2.6, y0 = 1.02, w = 2.3, d = 3.0, hh = 1.9; B.box(0, y0 + hh / 2, z, w, hh, d, white); B.box(0, y0 + 0.12, z, w + 0.03, 0.22, d + 0.03, hue); B.box(0, y0 + hh + 0.05, z + 0.15, w + 0.5, 0.09, d + 0.8, hue);
    const gl = bCol(0.02, 0.035, 0.05); for (const x of [-0.72, 0, 0.72]) B.box(x, y0 + 1.3, z + d / 2 + 0.01, 0.56, 0.5, 0.03, gl); for (const sd of [-1, 1]) for (const dz of [-0.8, 0.5]) B.box(sd * (w / 2 + 0.01), y0 + 1.3, z + dz, 0.03, 0.5, 0.8, gl);
    B.box(0.5, y0 + 0.9, z - d / 2 - 0.01, 0.62, 1.7, 0.03, bCol(0.2, 0.12, 0.06)); B.tube([-0.7, y0 + hh, z - 0.9], [-0.7, y0 + hh + 0.9, z - 0.9], 0.07, 0.06, bCol(0.08, 0.08, 0.08), 6); }
  // mast, crosstree, booms, stays, the flag
  { const mz = 0.9, top = 6.6; B.tube([0, 1.0, mz], [0, top, mz], 0.085, 0.05, 3, 6); B.tube([-1.1, 4.9, mz], [1.1, 4.9, mz], 0.035, 0.035, 3, 5);
    for (const sd of [-1, 1]) { B.tube([0, 2.4, mz], [sd * 1.5, 3.9, mz + 3.3], 0.04, 0.03, 3, 5); B.tube([0, top - 0.2, mz], [sd * 1.6, 1.45, mz - 0.4], 0.012, 0.012, 1, 4); B.tube([sd * 1.1, 4.9, mz], [sd * 1.5, 3.9, mz + 3.3], 0.01, 0.01, 1, 4); }
    B.tube([0, top - 0.2, mz], [0, S[S.length - 1].h, S[S.length - 1].z - 0.1], 0.012, 0.012, 1, 4); B.tube([0, top - 0.2, mz], [0, 3.05, -1.4], 0.012, 0.012, 1, 4);
    B.sheet([[[0, top, mz], [0, top - 0.42, mz]], [[0.02, top - 0.03, mz - 0.75], [0.02, top - 0.4, mz - 0.7]]], bCol(0.6, 0.05, 0.05)); }
  // fenders: tyres hung on ropes; nets and floats forward
  for (const sd of [-1, 1]) for (const z of [-3.6, -1.2, 1.4, 3.4]) { const q = S[Math.round((z + L / 2) / L * 20)], x = sd * (q.b + 0.09), T = TYRET, b0 = B.P.length / 3; for (let k = 0; k < T.P.length; k += 3) B.v(x + T.P[k + 1] * 0.09 * sd, 0.72 + T.P[k] * 0.3, z + T.P[k + 2] * 0.3, 1); for (let k = 0; k < T.I.length; k += 3) B.I.push(b0 + T.I[k], b0 + T.I[k + 1], b0 + T.I[k + 2]); B.tube([x, 1.0, z], [sd * q.b, q.h, z], 0.012, 0.012, 3, 4); }
  { const net = bCol(0.03, 0.2, 0.12); for (const [x, z, r] of [[0.3, 3.2, 0.6], [-0.4, 2.6, 0.5], [0.1, 3.9, 0.42]]) B.sheet(Array.from({ length: 5 }, (_, i) => Array.from({ length: 9 }, (_, j) => { const el = i / 4 * Math.PI / 2, a = j / 8 * Math.PI * 2; return [x + r * Math.cos(el) * Math.cos(a), 1.12 + r * 0.55 * Math.sin(el), z + r * Math.cos(el) * Math.sin(a)]; })), net);
    for (let k = 0; k < 7; k++) B.box(-1.05 + k * 0.05, 1.22, 1.9 + k * 0.42, 0.2, 0.2, 0.2, bCol(0.65, 0.3, 0.03)); }
  return (BOATS[key] = Object.assign(B.done(), { half: [1.8, 5.8], top: 2.9 })); };
function buildChunk(cx, cz) {
  const ox = cx * CH, oz = cz * CH, N = GN + 1, M = GN + 3;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) { hg[j * M + i] = ground(ox + (i - 1) * GS, oz + (j - 1) * GS); hwet[j * M + i] = gw[0]; }
  const v = new Float32Array(N * N * 7);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = (j + 1) * M + i + 1, nx = hg[k - 1] - hg[k + 1], nz = hg[k - M] - hg[k + M], l = hypot(nx, 2 * GS, nz);
    v.set([ox + i * GS, hg[k], oz + j * GS, nx / l, 2 * GS / l, nz / l, hwet[k]], (j * N + i) * 7);
  }
  const wetAt = (x, z) => hwet[(floor((z - oz) / GS + 1.5)) * M + floor((x - ox) / GS + 1.5)] > 0.5;
  const hAt = (x, z) => { const fx = (x - ox) / GS + 1, fz = (z - oz) / GS + 1, ix = floor(fx), iz = floor(fz), u = fx - ix, w = fz - iz, k = iz * M + ix; return mix(mix(hg[k], hg[k + 1], u), mix(hg[k + M], hg[k + M + 1], u), w); };
  const R = rng((cx * 73856093) ^ (cz * 19349663) ^ 0x5bd1e995);
  // what stands on this piece of land
  const segs = [], far = [], boxes = []; let nSegFar = 0; const po = [0, 0];
  // The people of the chunk (drawn by their own pipeline: render.js PPL, vsPpl/fsPpl): each twelve numbers - where it stands and which way it
  // faces; its height, its own number (which gives it its clothes, hair and ways), how fast it walks (0: it stands) and how far before it turns
  // back; the ground's height where its walk ends, and its girth. Or, given lb, it walks round and round a ring instead - a rectangle with
  // rounded corners about (x, z), R by lb in half-size, turned by yaw - stopping now and then (the vertex stage: vsPpl). addP keeps only
  // those that stand in this chunk.
  // (and a market's fruit, each a round thing of its own - vsFruit/fsFruit: where it is, its radius, its kind and its own number)
  const fruit = [], bigShops = [];      // (bigShops: where each big shop's front is, its turn and its sort - for looking at them)
  const ppl = [], pplW = [], addP = (x, z, yaw, h1, sd, spd = 0, R = 0, lb = 0) => { if (!(x >= ox && x < ox + CH && z >= oz && z < oz + CH) || ppl.length + pplW.length > 12 * 400) return; const y = walkY(x, z) + 0.015; let ye = y;
    if (spd > 0 && !lb) ye = ground(x + sin(yaw) * R, z + cos(yaw) * R) + 0.015; if (gw[0] > 0 || abs(ye - y) > 1.2) return;
    const wm = ph(floor(sd * 9999), 78) < 0.5; (wm ? pplW : ppl).push(x, y, z, yaw, (wm ? 1.5 : 1.6) + 0.2 * h1, sd, spd, R, ye, wm ? 1 : 0, 0.92 + 0.2 * ph(floor(sd * 9999), 77), lb); };      // (women in a list of their own: they are another figure)
  // leaves are written straight into one long array kept for the purpose (LBUF): a wooded chunk has tens of thousands of them, and gathering them in an
  // ordinary list first, then copying, then shuffling leaf by leaf took most of the time a chunk takes to build - time taken out of a frame
  const leaves = { n: 0, get length() { return this.n; }, push(...v) { if (this.n + v.length <= LBUF.length) { LBUF.set(v, this.n); this.n += v.length; } } };
  // thin: every n-th sprig only, each made wider. twigs false: the finest twigs, hidden in the leaves anyway, are left out. farN: how much of the tree still shows from far off.
  // The fishing village on an island (built further down): where its houses stand, so that no tree is planted through one.
  const vil = [], pr0 = pierOf(oz + CH / 2), BRC = [5.18, 1.25];
  if (isOf(oz + CH / 2) && abs(oz + CH / 2 - IS.zc) < 240) { const zc = IS.zc, hv = (i, j) => ph(IS.s * 16 + i, 700 + j); vil.zc = zc;
    for (let i = 0; i < 9; i++) { const row = i < 5 ? 0 : 1; let z = Math.round((zc + 38 + (row ? (i - 5) * 23 + 11 : i * 19) + hv(i, 1) * 5) / GS) * GS;      // (on a line of the ground's grid, for its path: see drive, below)
      // (a house of the front row has its path out to the road: its mouth is kept 4.5 m from where the nearest power pole really stands)
      if (!row) { const p = rp(Math.round(z / 40) * 40, 5.6)[1]; if (abs(z - p) < 4.5) z = Math.round((p + (z >= p ? 4.5 : -4.5)) / GS + (z >= p ? 0.5 : -0.5)) * GS; }
      const x =
        roadX(z) + (row ? 47 : 19) + hv(i, 2) * 9;
      if (ism(x, z) < -52) vil.push([x, z, -PI / 2 + (hv(i, 4) - 0.5) * 0.3, hv(i, 3) < 0.7, hv(i, 5), hv(i, 6)]); } }
  // Trees are not grown as they are asked for but at the end, once every building of the chunk stands: a tree whose crown would sink into a building
  // (its trunk inside it, or nearer its wall than most of the crown's reach) is left out. Beside a building, in front of it, over a low wall: all fine.
  // nbFoot: the buildings of a neighbouring chunk that stand over the border, for the trees on this side ([x, z, yaw, width, depth, foot, top]); and the
  // ways in that must be kept open, from a gate to the lane or road it gives onto (clear: the same, standing from far below to far above).
  // watFeet: the halls of town temples in or beside this chunk [x, z, yaw]; watNear: is this place within one's ground (the hall, its steps and
  // boundary stones, and room for a house's yard beside it)? A temple and a house of the lanes behind it once stood in one another: the temple stays.
  const watFeet = [], watNear = (x, z) => { for (let i = 0; i < watFeet.length; i += 3) { const dx = x - watFeet[i], dz = z - watFeet[i + 1], c = cos(watFeet[i + 2]), sn = sin(watFeet[i + 2]); if (abs(dx * c - dz * sn) < 21 && abs(dx * sn + dz * c) < 16) return true; } return false; };
  let watSpot = null, watRound = false;      // (where a town temple's hall stands in this chunk, if one does)
  const lowFix = [0, 0];      // (trees stood back from the road for a low bough, and of those the ones not planted at all)
  const pend = [], nbFoot = [], clear = (q, yaw, w, d) => nbFoot.push(q[0], q[1], yaw, w, d, -1e9, 1e9), homes = [];
  const plant = (...a) => { pend.push(a); };
  // A length of deck - a bridge's, a tunnel's road - laid from road point 0 to road point 1: its top through both, so that neighbours' tops meet
  // in one line whatever their slopes, and long enough to close the wedge between neighbours where the road bends (half its width times the
  // turn, each end). (Each was turned about its own middle, half its thickness down: where the slope changed from one length to the next their
  // top edges stood a few millimetres apart, and through the slit the pale concrete of the ends showed - a white line across the road at every
  // joint, plain to see driving over a bridge or through a tunnel.) Returns [x, y, z, length] for the box.
  const deckBox = (x0, y0, z0, x1, y1, z1, th, w) => { const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, hl = Math.hypot(dx, dz) || 1, L = Math.hypot(hl, dy), ux = -dy * dx / hl / L, uy = hl / L, uz = -dy * dz / hl / L;
    const turn = abs(Math.atan(roadSl(z1)) - Math.atan(roadSl(z0))); return [(x0 + x1) / 2 - th / 2 * ux, (y0 + y1) / 2 + 0.03 - th / 2 * uy, (z0 + z1) / 2 - th / 2 * uz, L + 0.03 + w * turn]; };
  const hpT = (z) => sm(0, 0.2, hpW(z));      // (0 to 1 as the switchbacks begin: the guard rail and what stands behind it ease out with it)
  const plantNow = (T, x, z, turn, sc, thin = 1, twigs = true, farN = T.nSegFar) => {
    if (wetAt(x, z)) return;
    { const sv = svW(z); if (sv > 0.05) { const sl = roadSl(z), d = abs(x - roadX(z)) / Math.sqrt(1 + sl * sl); if (d < 3.88 + sv + (udip(z) > 0.1 ? 1.4 : 0.9)) return; } }          // nothing grows in an underpass's cutting, nor on the frontage roads beside it and leading to it (measured square to the road, as they are built)
    for (const v of vil) if (abs(x - v[0]) < 8.5 && abs(z - v[1]) < 8.5) return;
    // (no banana within 70 m of the sea, on the coast or round the island: it will not stand the salt wind - the coastal scrub had this rule
    // already, but a yard or a hedge by the shore planted them on the beach)
    if (T === TREES[7] && (ism(x, z) > -70 || (seaW(z) > 0.05 && shoreX(z) - (x - roadX(z)) < 70))) return;
    if (hpW(z) > 0.05 && abs(rdist(x, z)) < 8.2) return;          // (round the switchbacks none in front of the guard rail nor close behind it, 6.4 m out: its trunk and crown would grow through it)
    if (pr0 && abs(x - pr0[0]) < 4.5 && z > pr0[1] - 30 && z < pr0[2]) return;          // (nor on the way down to the pier)
    const y = hAt(x, z), c = cos(turn), sn = sin(turn), S = T.segs, Lf = T.leaves;
    const tr = (px, py, pz, o) => { o.push(x + (px * c - pz * sn) * sc, y + py * sc, z + (px * sn + pz * c) * sc); };
    const enc = (h, r) => Math.round(min(max(h, 0), 60) * 32) + min(r, 31.9) / 32;       // height above the foot (whole part / 32) and reach out from the trunk (fraction * 32), in one number
    const nS = twigs ? T.nSeg : (T.nSegMid || T.nSeg), lw = [1, 1, 1.5, 1.8, 2.1][thin], SPK = (T.sp || 0) * 4096;      // (a tree's species goes with its pieces' heights, in 4096s: branchV takes it off again, for the bark)
    for (let i = 0; i < nS; i++) {
      const o = i < farN ? far : segs, k = i * 10, made = S[k + 8] < -0.5;
      tr(S[k], S[k + 1], S[k + 2], o); o.push(S[k + 3] * sc); tr(S[k + 4], S[k + 5], S[k + 6], o); o.push(S[k + 7] * sc, made ? (S[k + 8] < -1.5 ? -2 - (-S[k + 8] - 2) * sc : -1) : SPK + enc(S[k + 8] * sc, hypot(S[k], S[k + 2]) * sc), made ? S[k + 9] : SPK + enc(S[k + 9] * sc, hypot(S[k + 4], S[k + 6]) * sc));
    }
    { let o = leaves.n; const wk = sc * lw, nl = T.nLeaf; if (o + Math.ceil(nl / thin) * 12 > LBUF.length) return;
      for (let i = 0; i < nl; i += thin) { const k = i * 12, px = Lf[k], py = Lf[k + 1], pz = Lf[k + 2], hh = min(max(Lf[k + 11] * sc, 0), 60), rr = min(Math.sqrt(px * px + pz * pz) * sc, 31.9);
        LBUF[o] = x + (px * c - pz * sn) * sc; LBUF[o + 1] = y + py * sc; LBUF[o + 2] = z + (px * sn + pz * c) * sc; LBUF[o + 3] = Lf[k + 3] * sc; LBUF[o + 4] = Lf[k + 4] + turn; LBUF[o + 5] = Lf[k + 5];
        LBUF[o + 6] = Lf[k + 6] * wk; LBUF[o + 7] = Lf[k + 7]; LBUF[o + 8] = Lf[k + 8]; LBUF[o + 9] = Lf[k + 9]; LBUF[o + 10] = Lf[k + 10]; LBUF[o + 11] = Math.round(hh * 32) + rr / 32; o += 12; }
      leaves.n = o; }
  };
  const inside = (x, z) => x >= ox && x < ox + CH && z >= oz && z < oz + CH;
  if (DEMO >= 0 && TREES[DEMO]) for (let k = Math.ceil(oz / 14); k * 14 < oz + CH; k++) { const z = k * 14, x = roadX(z) + 7.5; if (inside(x, z)) plant(TREES[DEMO], x, z, k * 1.7, 1); }      // ?plant=N lines the road with plant N, for looking at one kind closely
  const twc = townW(oz + CH / 2); let dbgHouse = null, reach = 0;      // reach: how far (m) this chunk's longest wire runs on beyond a pole's ordinary span
  // (a boat: kind 0 a long-tail, 1 a fishing boat; set where the boxes of the old ones were - y their old base - afloat (fl) at the waterline, or
  // drawn up on the sand, heeled a little on its bilge; one of four of each, by its seed; solid to the car)
  const boat = (kind, x, y, z, yaw, s1, s2, fl = 0) => { const Bt = kind ? fisher(floor(s1 * 3.999)) : longTail(floor(s1 * 7.999)), c = cos(yaw), sn = sin(yaw), yb = fl ? y + 0.14 : y + 0.26, hl = fl ? 0 : (s2 - 0.5) * 0.36, ch = cos(hl), sh = sin(hl);
    const O = new Float32Array(Bt.n * 7); for (let k = 0; k < Bt.n; k++) { const px = Bt.P[k * 3], py = Bt.P[k * 3 + 1], pz = Bt.P[k * 3 + 2], nx = Bt.N[k * 3], ny = Bt.N[k * 3 + 1], nz = Bt.N[k * 3 + 2], rx = px * ch - py * sh, ry = px * sh + py * ch, mx = nx * ch - ny * sh, my = nx * sh + ny * ch, o = k * 7;
      O[o] = x + rx * c + pz * sn; O[o + 1] = yb + ry; O[o + 2] = z - rx * sn + pz * c; O[o + 3] = mx * c + nz * sn; O[o + 4] = my; O[o + 5] = -mx * sn + nz * c; O[o + 6] = Bt.M[k]; }
    meshP.push([O, Bt.I, 0]); xcol.push(x, z, yaw, Bt.half[0], Bt.half[1], yb - 0.6, yb + Bt.top); };
  const stamp = (B, x, y, z, yaw, s1, s2, fl = 0) => { const c = cos(yaw), sn = sin(yaw); for (const b of B) boxes.push(x + b[0] * c + b[2] * sn, y + b[1], z - b[0] * sn + b[2] * c, yaw, b[3], b[4], b[5], b[6], b[7], b[7] === 1 || b[7] === 9 ? s2 : b[7] === 17 ? ph(floor(x * 7 + b[0] * 13), floor(z * 5 + b[1] * 11)) : s1, b[4], fl ? 2 : b[8] || 0); };
  // ---- temples. A temple is built in a frame of its own: lx across, lz toward its front, from (x, y, z) turned by yaw. put: a box (ya turns it
  // further about the upright; h: what the material is told its height is); tube: a round piece between two points [lx, ly, lz] (mat 6 whitewash,
  // 7 gilding); chain: a run of such pieces through points [lx, ly, lz, radius].
  // (putD, tubeD, chainD: the same, for fine detail that is only made out from near to - drawn within about 100 m and not otherwise.)
  // Two-wheelers standing about a town. Wf(lx, lz): the place in the world of a point of the frame they stand in; yw: that frame's turn; y: the
  // ground under the wheels; (bx, bz): where in the frame, nose toward +z; s2: a number for the colour and the fittings. Their bodies are boxes
  // and tubes seen from any distance; what is small (mirrors, lamps, number plate, shock absorbers, pedals, racks) only from near to.
  // mbike: a step-through motorcycle of the kind everyone rides - wire wheels, telescopic forks, a leg shield and a head cowl with its lamp,
  // handlebar and mirrors, a long seat, engine and silencer, a tail with its lamp and plate, a grab rail; some carry a basket, some a helmet.
  // (A made tube's material is one less than the step that paints it in fsBranch: 1 black, 4 steel.)
  const twList = [], xcol = [], trkAt = [], trkPend = [];      // (trkAt: where the chunk's pickups stand, so that no two are parked into each other)      // (xcol: solid things made of no box - a sculpted pickup - as [x, z, yaw, half width, half length, foot, top])      // (where they stand, for whoever wants to look at them: kept on the chunk as tw)
  // They lean on their side stands (lean: toward -x, about the line the tyres stand on). Wh: a wire wheel, leaning with the rest; M: a sculpted part.
  const twoW = (Wf, yw, y, bx, bz, lean = 0) => { const cl = cos(lean), sl = sin(lean), P = (lx, ly, lz) => { const q = Wf(bx + lx * cl - ly * sl, bz + lz); return [q[0], y + lx * sl + ly * cl, q[1]]; };
    return { B: (D, lx, ly, lz, sx, sy, sz, mat, seed = 0, tilt = 0) => { const q = P(lx, ly, lz); (D ? boxesD : boxes).push(q[0], q[1], q[2], yw, sx, sy, sz, tilt, mat, seed, sy, 0); },
      T: (D, a, b, r, mat) => { const p = P(a[0], a[1], a[2]), q = P(b[0], b[1], b[2]); (D ? segs : far).push(p[0], p[1], p[2], r, q[0], q[1], q[2], r, -1, mat); },
      Wh: (lz, d, w, seed) => { const q = P(0, d / 2, lz); boxes.push(q[0], q[1], q[2], yw + PI / 2, d, d, w, -lean, 39, seed, d, 0); },
      M: (Mh, mat, dy = 0, lod = 1) => { const q = Wf(bx, bz), cy = cos(yw), sy = sin(yw), V = Mh.v, O = new Float32Array(V.length / 6 * 7), mf = typeof mat === 'function';
        for (let i = 0, o = 0; i < V.length; i += 6, o += 7) { const vx = V[i] * cl - (V[i + 1] + dy) * sl, vy = V[i] * sl + (V[i + 1] + dy) * cl, nx = V[i + 3] * cl - V[i + 4] * sl, ny = V[i + 3] * sl + V[i + 4] * cl;
          O[o] = q[0] + vx * cy + V[i + 2] * sy; O[o + 1] = y + vy; O[o + 2] = q[1] - vx * sy + V[i + 2] * cy; O[o + 3] = nx * cy + V[i + 5] * sy; O[o + 4] = ny; O[o + 5] = -nx * sy + V[i + 5] * cy; O[o + 6] = mf ? mat(Mh.c[i / 6]) : mat; }
        meshP.push([O, Mh.i, lod]); } }; };
  // mbike: a 125 cc automatic scooter, the model "125cc Scooter - Motorcycle" by T.Arun (sketchfab.com/T.Arun, CC BY 4.0), cut down from 3.2
  // million triangles to some 19 000 and parted by what it is made of (assets/scooter.bin: see scooter() below). Its paint is in one of eight
  // colours, red and black the commonest; it leans on its side stand. Within 75 m the model itself; beyond, a copy of it cut to 1800 triangles.
  const SCPAL = [0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 5, 5, 6, 7], SCRGB = [[16, 1, 1], [5, 16, 25], [1, 1, 1], [25, 25, 24], [2, 4, 15], [19, 19, 20], [3, 13, 6], [26, 20, 2]];
  // (each two-wheeler solid, as the pickups are (xcol): 0.7 m wide, 1.9 long, to its saddle - a car sliding by on the footpath swept its tail
  // through the row of them)
  const mbike = (Wf, yw, y, bx, bz, s2) => { twList.push([...Wf(bx, bz), y, yw, 0]); { const q = Wf(bx, bz); xcol.push(q[0], q[1], yw, 0.35, 0.95, y, y + 1.15); } const { B, M } = twoW(Wf, yw, y, bx, bz, 0.12), k = SCPAL[floor(s2 * SCPAL.length) % SCPAL.length], SM = scooter();
    const mt = (cl) => cl === 0 ? 40 + k : cl === 12 ? 50 + k : SCMAT[cl]; M(SM, mt); M(scooter(true), mt, 0, 2);
  };
  // bicycle: the model "Mini bicycle" by Absolute Pen (sketchfab.com/absolutepen, CC BY 4.0), cut down from 112 000 triangles to some 12 000
  // (assets/bicycle.bin) - a step-through town bicycle with a basket on the front, a rack behind, mudguards, a chain case and a stand; its
  // frame and mudguards painted in one of eight colours, black the commonest. It leans a little on its stand. The same model at any distance:
  // its tyres and tubes are too thin to be cut down further without falling apart, and there are few bicycles.
  const BIPAL = [2, 2, 2, 0, 0, 1, 3, 4, 5, 6];
  const bicycle = (Wf, yw, y, bx, bz, s2) => { twList.push([...Wf(bx, bz), y, yw, 1]); { const q = Wf(bx, bz); xcol.push(q[0], q[1], yw, 0.3, 0.85, y, y + 1.0); } const { M } = twoW(Wf, yw, y, bx, bz, 0.1), k = BIPAL[floor(s2 * BIPAL.length) % BIPAL.length];
    M(assetMesh('bicycle'), (cl) => cl === 0 ? 40 + k : SCMAT[cl], 0, 0); };
  const boxesD = [], meshP = [];      // (meshV, meshI: the sculpted things of the chunk - seven numbers a vertex: place, normal, material)
  const frame = (x, y, z, yaw) => { const c = cos(yaw), sn = sin(yaw), W = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
    const put = (lx, ly, lz, sx, sy, sz, mat, seed = 0, tilt = 0, fl = 0, ya = 0, h = sy) => { const q = W(lx, lz); boxes.push(q[0], y + ly, q[1], yaw + ya, sx, sy, sz, tilt, mat, seed, h, fl); };
    const putD = (lx, ly, lz, sx, sy, sz, mat, seed = 0, tilt = 0, fl = 0, ya = 0, h = sy) => { const q = W(lx, lz); boxesD.push(q[0], y + ly, q[1], yaw + ya, sx, sy, sz, tilt, mat, seed, h, fl); };
    const tube = (a, ra, b, rb, mat, o = far) => { const p = W(a[0], a[2]), q = W(b[0], b[2]); o.push(p[0], y + a[1], p[1], ra, q[0], y + b[1], q[1], rb, -1, mat); };
    const chain = (P, mat, ox = 0, oy = 0, oz2 = 0, k = 1, o = far) => { for (let i = 0; i + 1 < P.length; i++) tube([ox + P[i][0] * k, oy + P[i][1] * k, oz2 + P[i][2] * k], P[i][3] * k, [ox + P[i + 1][0] * k, oy + P[i + 1][1] * k, oz2 + P[i + 1][2] * k], P[i + 1][3] * k, mat, o); };
    const tubeD = (a, ra, b, rb, mat) => tube(a, ra, b, rb, mat, segs), chainD = (P, mat, ox = 0, oy = 0, oz2 = 0, k = 1) => chain(P, mat, ox, oy, oz2, k, segs);
    return { put, putD, tube, tubeD, chain, chainD, W, x, y, z, yaw, sub: (lx, lz, ya, ly = 0) => { const q = W(lx, lz); return frame(q[0], y + ly, q[1], yaw + ya); } }; };
  // The ordination hall (อุโบสถ), its ridge along lx: a stepped white base; walls behind a colonnade, shuttered windows in red and gold between
  // the columns; a roof in three tiers, each end lower than the middle, the gables filled with gold, gilded bargeboards down their edges and a
  // finial (ช่อฟ้า) curling up from every ridge end; a skirt of roof over the colonnade; a door and a flight of steps between naga rails at each
  // end; and round it the eight boundary stones (ใบเสมา) that mark consecrated ground.
  const watHall = (F) => { const put = F.put;
    put(0, 0.35, 0, 17, 0.7, 11, 41); put(0, 0.95, 0, 15.5, 0.7, 9.5, 41); put(0, 4.0, 0, 12.5, 5.4, 6.6, 41);
    for (let i = 0; i < 6; i++) for (const ez of [-1, 1]) { put(-6 + i * 2.4, 3.7, ez * 3.9, 0.5, 4.8, 0.5, 41); put(-6 + i * 2.4, 6.2, ez * 3.9, 0.7, 0.25, 0.7, 15); if (i < 5) { put(-4.8 + i * 2.4, 3.6, ez * 3.32, 1.0, 2.6, 0.08, 14); put(-4.8 + i * 2.4, 5.05, ez * 3.33, 1.25, 0.3, 0.1, 15); put(-4.8 + i * 2.4, 2.2, ez * 3.33, 1.25, 0.14, 0.14, 15); } }
    put(0, 9.05, 0, 9.0, 4.7, 7.6, 9, 0.05, 0, 1); put(0, 9.9, 0, 5.0, 5.0, 6.8, 9, 0.05, 0, 1);
    for (const ex of [-1, 1]) { put(ex * 5.9, 8.55, 0, 3.2, 3.7, 6.4, 9, 0.05, 0, 1); put(ex * 7.53, 8.45, 0, 0.06, 3.3, 5.6, 15, 0, 0, 1); put(ex * 4.52, 9.2, 0, 0.06, 4.2, 6.9, 15, 0, 0, 1); put(ex * 2.52, 10.1, 0, 0.06, 4.5, 6.3, 15, 0, 0, 1);
      for (const [fx, fy] of [[7.5, 10.4], [4.5, 11.4], [2.5, 12.4]]) { put(ex * (fx + 0.2), fy + 0.4, 0, 0.1, 0.95, 0.1, 15, 0, ex * 0.45, 0, PI / 2); put(ex * (fx + 0.62), fy + 0.98, 0, 0.08, 0.6, 0.08, 15, 0, ex * 0.95, 0, PI / 2); }
      for (const ez of [-1, 1]) { put(ex * 7.58, 8.62, ez * 1.6, 0.12, 0.2, 4.95, 15, 0, ez * 0.857); put(ex * 8.5, 1.05, ez * 1.75, 2.6, 0.34, 0.34, 33, 0.63); put(ex * 9.85, 1.2, ez * 1.75, 0.34, 0.9, 0.34, 15); }
      put(ex * 6.27, 3.3, 0, 0.08, 3.4, 1.7, 14); put(ex * 6.29, 5.2, 0, 0.1, 0.36, 2.2, 15); put(ex * 8.5, 0.65, 0, 2.0, 1.3, 3.1, 41); put(ex * 9.9, 0.3, 0, 1.0, 0.6, 3.1, 41); }
    for (const ez of [-1, 1]) { put(0, 6.2, ez * 4.5, 15.4, 0.08, 2.5, 9, 0.05, ez * 0.5); put(0, 5.62, ez * 5.62, 15.4, 0.1, 0.28, 33, 0.63); }
    for (const [px, pz] of [[-9.6, -6.2], [9.6, -6.2], [-9.6, 6.2], [9.6, 6.2], [0, -6.6], [0, 6.6], [-11.4, 0], [11.4, 0]]) { put(px, 0.35, pz, 0.8, 0.7, 0.8, 41); put(px, 1.15, pz, 0.5, 0.9, 0.16, 41); put(px, 1.7, pz, 0.3, 0.3, 0.12, 15); }
    // From near to (putD): a bracket (คันทวย) under the eaves at every column, a moulded foot to each column; every window framed in gold under a
    // pointed gilded hood; a gilded crest along each ridge; a red panel in the gold of the gables; a hooded doorway with gilded leaves at each
    // end, the treads of its steps; a low balustrade round the terrace; a lantern on a post at each corner.
    const D = F.putD;
    for (let i = 0; i < 6; i++) for (const ez of [-1, 1]) { D(-6 + i * 2.4, 5.55, ez * 4.4, 0.12, 1.3, 0.12, 15, 0, ez * 0.7); D(-6 + i * 2.4, 1.5, ez * 3.9, 0.66, 0.4, 0.66, 41);
      if (i < 5) { const wx = -4.8 + i * 2.4; for (const e of [-1, 1]) D(wx + e * 0.58, 3.6, ez * 3.35, 0.1, 2.8, 0.12, 15); D(wx, 5.55, ez * 3.35, 1.4, 0.7, 0.12, 15, 0, 0, 1); D(wx, 3.6, ez * 3.37, 0.05, 2.6, 0.05, 15); } }
    D(0, 11.47, 0, 8.6, 0.14, 0.14, 15); D(0, 12.47, 0, 4.7, 0.14, 0.14, 15);
    for (const ex of [-1, 1]) { D(ex * 5.9, 10.45, 0, 3.0, 0.12, 0.12, 15); D(ex * 7.57, 8.0, 0, 0.05, 1.5, 2.2, 14); D(ex * 6.34, 5.95, 0, 2.3, 1.0, 0.12, 15, 0, 0, 1, PI / 2);
      for (const e of [-1, 1]) { D(ex * 6.33, 3.3, e * 0.43, 0.05, 3.0, 0.62, 15); D(ex * 6.3, 3.3, e * 1.0, 0.16, 3.5, 0.16, 15); }
      for (let j = 0; j < 4; j++) D(ex * (7.7 + 0.55 * j), 1.28 - 0.3 * j, 0, 0.55, 0.06, 3.1, 2);
      for (const ez of [-1, 1]) { D(ex * 7.68, 1.6, ez * 3.15, 0.14, 0.6, 3.0, 41); D(ex * 8.6, 3.0, ez * 5.3, 0.34, 0.45, 0.34, 10); F.tubeD([ex * 8.6, 0.7, ez * 5.3], 0.07, [ex * 8.6, 2.8, ez * 5.3], 0.05, 0); } }
    for (const ez of [-1, 1]) { D(0, 1.6, ez * 4.68, 15.4, 0.6, 0.14, 41); D(0, 1.93, ez * 4.68, 15.5, 0.08, 0.2, 15); }
    clear([F.x, F.z], F.yaw, 22, 13); };
  // A chedi: a bell-shaped tower, whitewashed, on a square stepped base, ringed mouldings between base and bell, a gilded spire of rings
  // tapering to a point. s: how big (1 = 10.5 m high).
  const watChedi = (F, lx, lz, s) => { F.put(lx, 0.3 * s, lz, 7.6 * s, 0.6 * s, 7.6 * s, 41); F.put(lx, 0.85 * s, lz, 6.6 * s, 0.5 * s, 6.6 * s, 41);
    F.chain([[0, 1.1, 0, 3.0], [0, 1.7, 0, 3.1], [0, 1.9, 0, 2.5], [0, 2.4, 0, 2.6], [0, 2.6, 0, 2.2], [0, 3.1, 0, 2.3], [0, 3.4, 0, 2.05], [0, 4.4, 0, 1.75], [0, 5.3, 0, 0.9], [0, 5.5, 0, 1.0], [0, 6.0, 0, 0.55]], 6, lx, 0, lz, s);
    F.chain([[0, 6.0, 0, 0.62], [0, 6.3, 0, 0.4], [0, 6.5, 0, 0.52], [0, 6.8, 0, 0.33], [0, 7.0, 0, 0.44], [0, 7.3, 0, 0.27], [0, 7.5, 0, 0.36], [0, 7.8, 0, 0.2], [0, 8.2, 0, 0.26], [0, 10.6, 0, 0.03]], 7, lx, 0, lz, s);
    // (from near to: a band of gold cloth tied round the bell, a little chedi on each corner of the base, a niche on each face)
    F.chainD([[0, 3.55, 0, 2.08], [0, 3.8, 0, 2.03]], 7, lx, 0, lz, s);
    for (const [ex, ez] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) F.chainD([[0, 1.1, 0, 0.42], [0, 1.6, 0, 0.36], [0, 2.0, 0, 0.16], [0, 2.9, 0, 0.01]].map((p) => [ex * 2.9, p[1], ez * 2.9, p[3]]), 6, lx, 0, lz, s);
    for (const [ex, ez] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { F.putD(lx + ex * 3.2 * s, 1.7 * s, lz + ez * 3.2 * s, (ez ? 1.0 : 0.3) * s, 1.2 * s, (ex ? 1.0 : 0.3) * s, 15); }
    const q = F.W(lx, lz); clear(q, F.yaw, 8 * s, 8 * s); };
  // A Buddha image. H: its height without its base; mat: 7 gilded or 6 white. pose 0: seated in meditation (ปางสมาธิ, both hands in the lap);
  // 1: seated, calling the earth to witness (ปางมารวิชัย, the right hand down over the knee); 2: standing, the right hand raised palm outward
  // (ปางประทานอภัย); 3: walking (ปางลีลา, one arm swinging, the body swayed); 4: reclining on the right side, head on the hand (ปางไสยาสน์, H its length).
  const watBuddha = (F, lx, lz, H, mat, pose) => { const SM = (P) => { if (P.length < 3) return P; const o = [], g = (i) => P[clamp(i, 0, P.length - 1)]; for (let i = 0; i + 1 < P.length; i++) { const a = g(i - 1), b = g(i), c2 = g(i + 1), d = g(i + 2); for (let t = 0; t < 3; t++) { const u = t / 3; o.push([0, 1, 2, 3].map((j) => j === 3 ? max(0.002, mix(b[3], c2[3], u) + 0.5 * u * (1 - u) * (b[3] - a[3] + c2[3] - d[3]) * 0.5) : 0.5 * (2 * b[j] + (c2[j] - a[j]) * u + (2 * a[j] - 5 * b[j] + 4 * c2[j] - d[j]) * u * u + (3 * b[j] - a[j] - 3 * c2[j] + d[j]) * u * u * u))); } } o.push(P[P.length - 1]); return o; };      // (a smooth curve through the points, three pieces to each span: the body's outline is rounded, not jointed)
    // (The body's pieces - everything C is given in the image's own material - are not drawn as tubes but gathered in SG and sculpted into one skin.)
    // (petal: a lotus petal is thin - three slender ribs side by side, spread to the width w at its belly and meeting at root and tip, of thickness r.)
    const petal = (P, an, zs, w, r) => { const sx = sin(an), cz = cos(an), W = [0.25, 1, 0.7, 0], R = [0.8, 1, 0.85, 0.35]; for (const d of [-1, 0, 1]) C(P.map((p, i) => [sx * p[0] + cz * d * w * W[i], p[1], (cz * p[0] - sx * d * w * W[i]) * zs, r * R[i]])); };
    // (CM: several strokes gathered in one chain - within a chain pieces meet in a crease instead of melting together, which keeps fingers and toes apart.)
    const CM = (L) => { const ch = []; SG.push(ch); for (const P of L) { const Q = SM(P); for (let i = 0; i + 1 < Q.length; i++) ch.push(Q[i][0], Q[i][1], Q[i][2], Q[i][3], Q[i + 1][0], Q[i + 1][1], Q[i + 1][2], Q[i + 1][3]); } };
    // (hand: from the wrist w, pointing along d, the thumb's side toward a, its length s; curl bends the fingers toward the palm. A flat palm of
    // three ribs, four fingers of their own lengths and a thumb standing off from its heel; a small image has the fingers as one flat piece.)
    const hand = (w, d, a, s, curl = 0) => { const ld = hypot(d[0], d[1], d[2]), la = hypot(a[0], a[1], a[2]); d = d.map((v) => v / ld); a = a.map((v) => v / la); const n = [d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0]];
      const P = (u, v, t, r) => [w[0] + (d[0] * u + a[0] * v + n[0] * t) * s, w[1] + (d[1] * u + a[1] * v + n[1] * t) * s, w[2] + (d[2] * u + a[2] * v + n[2] * t) * s, r * s];
      CM([-0.17, 0, 0.17].map((v) => [P(0, v * 0.6, 0, 0.07), P(0.25, v, 0, 0.078), P(0.5, v, 0, 0.068)]));
      if (!fine) { CM([-0.15, 0, 0.15].map((v) => [P(0.45, v, 0, 0.07), P(0.7, v, curl * 0.3, 0.066), P(0.9, v * 0.8, curl, 0.05)])); return; }
      const FL = [0.33, 0.42, 0.46, 0.4], FV = [-0.171, -0.057, 0.057, 0.171], Lf = FV.map((v, i) => [P(0.46, v, 0, 0.058), P(0.5 + FL[i] * 0.5, v, curl * 0.3, 0.054), P(0.5 + FL[i], v, curl, 0.042)]);
      Lf.push([P(0.06, 0.2, 0.02, 0.068), P(0.28, 0.34, 0.04, 0.06), P(0.5, 0.39, 0.05, 0.042)]); CM(Lf); };
    // (foot: of a standing image - the instep sloping down from the ankle, a flat sole of two ribs, five toes; e: which foot, the great toe inward.)
    const foot = (cx, cz, e) => { C([[cx, 0.052, cz, 0.036], [cx, 0.031, cz + 0.035, 0.026], [cx, 0.018, cz + 0.078, 0.016]]);
      CM([-1, 1].map((g) => [[cx + g * 0.01, 0.015, cz - 0.02, 0.015], [cx + g * 0.016, 0.013, cz + 0.05, 0.013], [cx + g * 0.019, 0.011, cz + 0.09, 0.011]]));
      if (fine) CM([0, 1, 2, 3, 4].map((t) => { const tx = cx - e * 0.0195 + e * t * 0.0096, r = t ? 0.005 - 0.0003 * t : 0.0064, z1 = cz + 0.127 - 0.0045 * t; return [[tx, 0.01, cz + 0.092, r], [tx, 0.009, (cz + 0.092 + z1) / 2, r], [tx, 0.007, z1, r * 0.8]]; })); };
    const SG = [], C = (P, m = mat) => { if (m !== mat) { F.chain(SM(P), m, lx, y0, lz, H); return; } const Q = SM(P), ch = []; SG.push(ch); for (let i = 0; i + 1 < Q.length; i++) ch.push(Q[i][0], Q[i][1], Q[i][2], Q[i][3], Q[i + 1][0], Q[i + 1][1], Q[i + 1][2], Q[i + 1][3]); }, CD = (P, m = mat) => F.chainD(P, m, lx, y0, lz, H); let y0 = 0;      // (CD: what is only made out from near to - the face, the curls of the hair, fingers and toes, the folds of the robe, the petals of the lotus seat)
    // (head: lie turns it over toward +x by that angle - 1.57 would lay it flat - for a reclining image.)
    // The head is sculpted by itself, twice as finely as the body (HEADS: its pieces, in its own measure - the neck's foot at 0, the hair's top
    // at 0.28, the flame's tip at 0.39): a full oval face on a rounded skull; the hair rising in a cone to the mound on the crown, the flame
    // above it; arched brow ridges running into the bridge of a straight nose with its wings; heavy lids over lowered eyes, the lower lid
    // and the cheek under each; lips, the corners lifted in the faint smile; a round chin; ears whose lobes hang nearly to the shoulders.
    const fine = H > 5, pendM = [], head = (hx, hy, hz, k, lie = 0) => { const G = [], L = (P) => { const Q = SM(P), ch = []; G.push(ch); for (let i = 0; i + 1 < Q.length; i++) ch.push(Q[i][0], Q[i][1], Q[i][2], Q[i][3], Q[i + 1][0], Q[i + 1][1], Q[i + 1][2], Q[i + 1][3]); };
      if (!SCULPT.has(fine ? 'head' : 'headc')) { L([[0, 0, 0, 0.062], [0, 0.035, 0, 0.058], [0, 0.06, 0, 0.082], [0, 0.11, 0, 0.098], [0, 0.16, 0, 0.099], [0, 0.2, 0, 0.09], [0, 0.235, 0, 0.068], [0, 0.262, 0, 0.044], [0, 0.28, 0, 0.02]]);
        L([[0, 0.276, 0, 0.012], [0, 0.298, 0, 0.03], [0, 0.328, 0, 0.022], [0, 0.39, 0, 0.002]]); L([[0, 0.05, 0.03, 0.05], [0, 0.085, 0.036, 0.068], [0, 0.125, 0.034, 0.074], [0, 0.165, 0.024, 0.062]]); L([[0, 0.04, 0.06, 0.022], [0, 0.052, 0.068, 0.028], [0, 0.06, 0.07, 0.02]]);
        L([[0, 0.158, 0.094, 0.008], [0, 0.125, 0.106, 0.011], [0, 0.104, 0.115, 0.015], [0, 0.1, 0.11, 0.008]]);
        L([[-0.027, 0.081, 0.092, 0.003], [-0.011, 0.08, 0.102, 0.007], [0.011, 0.08, 0.102, 0.007], [0.027, 0.081, 0.092, 0.003]]); L([[-0.021, 0.07, 0.095, 0.003], [0, 0.066, 0.102, 0.008], [0.021, 0.07, 0.095, 0.003]]);
        for (const e of [-1, 1]) { L([[e * 0.012, 0.1, 0.105, 0.009], [e * 0.017, 0.098, 0.099, 0.005]]); L([[e * 0.01, 0.166, 0.097, 0.004], [e * 0.045, 0.178, 0.091, 0.006], [e * 0.082, 0.166, 0.066, 0.003]]);
          L([[e * 0.02, 0.147, 0.097, 0.005], [e * 0.044, 0.151, 0.094, 0.009], [e * 0.07, 0.147, 0.078, 0.004]]); L([[e * 0.022, 0.131, 0.097, 0.003], [e * 0.044, 0.128, 0.093, 0.005], [e * 0.068, 0.133, 0.078, 0.003]]); L([[e * 0.04, 0.105, 0.068, 0.03], [e * 0.05, 0.085, 0.058, 0.027]]);
          L([[e * 0.1, 0.172, -0.006, 0.01], [e * 0.108, 0.135, -0.003, 0.022], [e * 0.107, 0.08, 0, 0.016], [e * 0.102, 0.015, 0, 0.014], [e * 0.099, -0.025, 0.002, 0.007]]); } }
      pendM.push([fine ? sculpt('head', G, 0.0021, 0.004) : sculpt('headc', G, 0.006, 0.006), hx, hy, hz, k, lie]);
      // (and only from near to: the line of each lowered eye, the mark between the brows, the folds of the neck, and the curls of the hair - small,
      // close-set, in ten rings up the cone, the lowest drawn back from the brow to make the hairline)
      const ca = cos(lie), sa = sin(lie), HD = (P, m = mat) => CD(P.map((p) => [hx + (p[0] * ca + p[1] * sa) * k, hy + (-p[0] * sa + p[1] * ca) * k, hz + p[2] * k, p[3] * k]), m);
      if (H > 3) { for (const e of [-1, 1]) HD([[e * 0.027, 0.139, 0.0985, 0.0014], [e * 0.045, 0.1375, 0.097, 0.0018], [e * 0.063, 0.14, 0.085, 0.0012]], 1);
        HD([[0, 0.184, 0.094, 0.004], [0, 0.185, 0.099, 0.005], [0, 0.186, 0.101, 0.001]]);
        for (let r = 0; r < 3; r++) HD([[0, 0.004 + 0.012 * r, 0, 0.066], [0, 0.009 + 0.012 * r, 0, 0.069], [0, 0.014 + 0.012 * r, 0, 0.066]]);
        const RR = [0.1, 0.101, 0.1, 0.097, 0.092, 0.084, 0.074, 0.062, 0.05, 0.037];
        for (let r = 0; r < 10; r++) { const nq = 28 - r * 2; for (let q = 0; q < nq; q++) { const an = (q + 0.5 * r) / nq * TAU, yy = 0.158 + 0.0135 * r, rr = RR[r], sx = sin(an), cz2 = cos(an); if (cz2 > [0.3, 0.55, 0.8][r] ) continue;
            HD([[sx * rr * 0.94, yy, cz2 * rr * 0.94, 0.0078], [sx * rr * 1.05, yy + 0.004, cz2 * rr * 1.05, 0.0068], [sx * rr * 1.085, yy + 0.007, cz2 * rr * 1.085, 0.002]]); } } } };
    if (pose < 2) { const bh = 0.16 * H; F.put(lx, bh * 0.3, lz, 1.1 * H, bh * 0.6, 0.95 * H, 41); F.put(lx, bh * 0.8, lz, 0.96 * H, bh * 0.4, 0.82 * H, 41);
      F.put(lx, bh * 0.6, lz, 1.115 * H, bh * 0.07, 0.965 * H, 15); F.put(lx, bh * 0.99, lz, 0.975 * H, bh * 0.07, 0.835 * H, 15); F.put(lx, bh * 0.3, lz, 1.105 * H, bh * 0.22, 0.955 * H, 14);      // (the throne: a gilded moulding round each tier, a red band round the lower)
      if (H > 5) for (let q = 0; q < 14; q++) for (const e of [-1, 1]) { F.putD(lx + (q - 6.5) * 0.074 * H, bh * 0.8, lz + e * 0.412 * H, 0.03 * H, bh * 0.22, 0.01 * H, 15); if (q < 12) F.putD(lx + e * 0.482 * H, bh * 0.8, lz + (q - 5.5) * 0.066 * H, 0.01 * H, bh * 0.22, 0.03 * H, 15); }
      // (gilded panels along the upper tier; then the cushion of the lotus seat, on which the image is raised)
      F.chain([[0, bh, 0, 0.44 * H], [0, bh + 0.05 * H, 0, 0.4 * H], [0, bh + 0.07 * H, 0, 0.43 * H]], mat, lx, 0, lz, 1); y0 = bh + 0.06 * H;
      // The figure, proportioned after the great seated images of Thailand (as at Wat Muang): from the seat to the tip of the flame is 1; the
      // crossed legs are a broad low mass, 0.89 across the knees and 0.17 high - the widest thing in the figure, which is what makes it sit;
      // the body rises from them broad-shouldered (0.48 across the arms) and narrow at the waist, upright; heavy arms hang a little out from
      // it; a short neck; a large head (chin at 0.6, the hair rising in a cone to 0.875) under its flame.
      C([[-0.445, 0.07, 0.07, 0.03], [-0.4, 0.08, 0.075, 0.085], [-0.16, 0.085, 0.15, 0.092], [0.16, 0.085, 0.15, 0.092], [0.4, 0.08, 0.075, 0.085], [0.445, 0.07, 0.07, 0.03]]);      // the legs: the front of them, knee to knee
      C([[-0.34, 0.085, -0.03, 0.05], [-0.25, 0.095, -0.04, 0.115], [0.25, 0.095, -0.04, 0.115], [0.34, 0.085, -0.03, 0.05]]);      // and the hips behind
      C([[0.39, 0.1, 0.09, 0.07], [0.14, 0.125, 0.165, 0.058], [-0.1, 0.13, 0.185, 0.048], [-0.2, 0.128, 0.19, 0.036], [-0.26, 0.122, 0.17, 0.016]]);      // the right shin lying over the left, its foot sole-up on the left thigh
      C([[0, 0.1, 0, 0.15], [0, 0.25, 0, 0.122], [0, 0.38, 0, 0.145], [0, 0.48, 0, 0.13], [0, 0.535, 0, 0.07], [0, 0.6, 0, 0.062]]);      // the body, and the neck
      for (const e of [-1, 1]) C([[e * 0.07, 0.1, 0, 0.12], [e * 0.062, 0.24, 0, 0.094], [e * 0.095, 0.38, 0.004, 0.114], [e * 0.13, 0.47, 0, 0.085], [e * 0.165, 0.505, 0, 0.05]]);      // (broader than deep: wide at the chest, drawn in at the waist)
      for (const e of [-1, 1]) { C([[e * 0.175, 0.505, 0, 0.058], [e * 0.2, 0.49, 0, 0.066], [e * 0.228, 0.4, 0.005, 0.06], [e * 0.238, 0.31, 0.015, 0.054], [e * 0.24, 0.27, 0.03, 0.054]]);      // shoulder, upper arm, elbow
        if (pose === 1 && e > 0) { C([[e * 0.24, 0.27, 0.03, 0.052], [e * 0.27, 0.2, 0.13, 0.044], [e * 0.3, 0.158, 0.218, 0.032]]); hand([0.3, 0.158, 0.226], [0, -1, -0.1], [-1, 0, 0], 0.155, -0.06); }      // the forearm down over the knee, the hand hanging on it, fingers to the ground
        else { const hy = 0.186 + (pose === 0 && e > 0 ? 0.02 : 0); C([[e * 0.24, 0.27, 0.03, 0.052], [e * 0.2, 0.2, 0.13, 0.044], [e * 0.12, hy - 0.006, 0.2, 0.032]]); hand([e * 0.115, hy, 0.205], [-e, 0, 0.06], [0, 0, 1], 0.155, 0.04 * e); } }      // the forearm across the lap, the hand lying open in it
      C([[-0.15, 0.5, 0.06, 0.028], [-0.13, 0.36, 0.115, 0.038], [-0.115, 0.2, 0.13, 0.034], [-0.11, 0.165, 0.14, 0.02]]);      // the folded cloth over the left shoulder, hanging to the waist (สังฆาฏิ)
      C([[-0.185, 0.49, 0.04, 0.012], [-0.06, 0.4, 0.125, 0.014], [0.07, 0.33, 0.12, 0.014], [0.19, 0.3, 0.035, 0.012]]);      // the robe's edge, from the left shoulder across under the right arm: a ridge in the skin
      C([[-0.42, 0.105, 0.11, 0.012], [-0.16, 0.13, 0.215, 0.013], [0.16, 0.13, 0.215, 0.013], [0.42, 0.105, 0.11, 0.012]]);      // and its hem, across the shins
      head(0, 0.585, 0, 1.06);
      // The lotus seat: a ring of small pointed petals set close together and turned up, and a ring turned down between them.
      for (let q = 0; q < 44; q++) for (const dn of [0, 1]) { const an = (q + dn * 0.5) / 44 * TAU, sx = sin(an), cz2 = cos(an) * 0.91, P = dn ? [[0.45, -0.06, 0.014], [0.485, -0.072, 0.026], [0.51, -0.094, 0.019], [0.522, -0.116, 0.004]] : [[0.44, -0.045, 0.014], [0.475, -0.035, 0.027], [0.5, -0.012, 0.02], [0.512, 0.012, 0.004]];
        petal(P, an, 0.91, 0.02, 0.0085); }
      }
    else if (pose < 4) { const bh = 0.06 * H, sw = pose === 3 ? 0.012 : 0; F.chain([[0, 0, 0, 0.21 * H], [0, bh * 0.45, 0, 0.18 * H], [0, bh * 0.55, 0, 0.2 * H], [0, bh, 0, 0.175 * H], [0, bh + 0.02 * H, 0, 0.155 * H]], mat, lx, 0, lz, 1); y0 = bh + 0.02 * H;
      // The standing image, proportioned after a Thai one (as at Hat Yai): from the soles to the tip of the flame is 1. Tall and straight:
      // the head small on it (chin at 0.77), shoulders 0.29 across the arms, the waist at 0.53, and from the waist down the robe a straight
      // column to the ankles - the two legs showing through it, a flat pleat hanging down the middle of the front (ชายผ้าหน้านาง), a girdle at
      // the waist - with the outer robe standing out behind in a wing at each side, widest at the hem. The right arm is bent up, the hand
      // raised at the shoulder, palm outward (ปางประทานอภัย), or swings forward in walking (ปางลีลา); the left hangs straight at the side.
      C([[sw * 2, 0.47, 0, 0.085], [sw, 0.53, 0, 0.074], [0, 0.62, 0, 0.085], [0, 0.7, 0, 0.078], [0, 0.735, 0, 0.045], [0, 0.775, 0, 0.038]]);      // the body and the neck
      for (const e of [-1, 1]) { C([[e * 0.045 + sw * 2, 0.47, 0, 0.074], [e * 0.04 + sw, 0.53, 0, 0.06], [e * 0.06, 0.63, 0, 0.07], [e * 0.085, 0.7, 0, 0.054], [e * 0.1, 0.722, 0, 0.034]]);
        C([[e * 0.045 + sw * 2, 0.47, 0, 0.062], [e * 0.045 + sw * 2, 0.3, e * sw * 2, 0.054], [e * 0.043 + sw, 0.1, e * sw * 4, 0.045], [e * 0.042, 0.04, e * sw * 4, 0.04]]);      // the legs, under the robe
        foot(e * 0.044, e * sw * 4, e);
        C([[e * 0.085, 0.44, -0.035, 0.026], [e * 0.092, 0.25, -0.035, 0.022], [e * 0.105, 0.06, -0.035, 0.018]]); C([[e * 0.112, 0.45, -0.035, 0.018], [e * 0.128, 0.25, -0.035, 0.016], [e * 0.148, 0.065, -0.035, 0.013], [e * 0.158, 0.045, -0.03, 0.008]]); }      // the robe's wing at each side
      C([[sw * 2, 0.46, 0, 0.07], [sw, 0.25, 0, 0.055], [0, 0.06, 0, 0.05]]); C([[sw * 2, 0.48, 0.045, 0.03], [sw, 0.25, 0.05, 0.027], [0, 0.055, 0.046, 0.025]]);      // the robe between the legs, and the pleat down the front
      C([[-0.085, 0.502, 0.03, 0.012], [0, 0.498, 0.082, 0.014], [0.085, 0.502, 0.03, 0.012]]); C([[0, 0.498, 0.09, 0.018], [0, 0.488, 0.094, 0.012]]);      // the girdle and its clasp
      C([[-0.055, 0.737, 0.045, 0.016], [-0.05, 0.62, 0.076, 0.02], [-0.046, 0.52, 0.074, 0.017]]); C([[0.09, 0.722, 0.03, 0.01], [0.02, 0.66, 0.078, 0.011], [-0.05, 0.62, 0.08, 0.011]]);      // the cloth over the left shoulder; the robe's edge to it from the right
      C([[-0.105, 0.725, 0, 0.036], [-0.13, 0.71, 0, 0.04], [-0.145, 0.6, 0, 0.035], [-0.15, 0.5, 0.005, 0.032], [-0.153, 0.4, 0.01, 0.027], [-0.155, 0.37, 0.013, 0.02]]); hand([-0.156, 0.368, 0.013], [0, -1, 0], [0, 0, 1], 0.09, -0.05);      // the left arm hanging, the hand open against the thigh
      if (pose === 2) { C([[0.105, 0.725, 0, 0.036], [0.13, 0.71, 0, 0.04], [0.14, 0.63, 0.005, 0.036], [0.143, 0.55, 0.02, 0.034], [0.141, 0.6, 0.07, 0.03], [0.138, 0.66, 0.1, 0.025]]);      // the right arm bent up at the elbow
        hand([0.138, 0.662, 0.103], [0, 1, 0.06], [-1, 0, 0], 0.1, 0.03); }
      else { C([[0.105, 0.725, 0, 0.036], [0.13, 0.71, 0, 0.04], [0.146, 0.61, 0.02, 0.035], [0.152, 0.52, 0.05, 0.03], [0.154, 0.44, 0.085, 0.022]]); hand([0.155, 0.438, 0.086], [0, -1, 0.35], [0, 0, 1], 0.09, 0.05); }
      head(0, 0.755, 0, 0.59);
      // The lotus under the feet: small pointed petals set close together, a ring turned up round the top of the pedestal and a ring turned down between them.
      if (H > 5) { for (let q = 0; q < 28; q++) for (const dn of [0, 1]) { const an = (q + dn * 0.5) / 28 * TAU, sx = sin(an), cz2 = cos(an), P = dn ? [[0.175, -0.026, 0.008], [0.2, -0.034, 0.016], [0.218, -0.048, 0.012], [0.228, -0.062, 0.003]] : [[0.16, -0.016, 0.008], [0.18, -0.01, 0.016], [0.197, 0.004, 0.012], [0.206, 0.018, 0.003]];
          petal(P, an, 1, 0.0115, 0.0058); }
      } }
    else { const bh = 1.3; F.put(lx, bh / 2, lz, H * 1.08, bh, H * 0.34, 41); F.put(lx, bh + 0.15, lz, H * 1.04, 0.3, H * 0.31, 15); F.put(lx, bh * 0.55, lz, H * 1.085, bh * 0.3, H * 0.345, 14); y0 = bh + 0.3;
      // The reclining image, proportioned after a Thai one (its length 1, head toward +x, lying on its right side, facing +z): the body is
      // propped - the shoulders stand 0.22 high, one above the other, and the line of it falls away through the hip (0.2) and the knees
      // (0.13) to the ankles, the two legs lying one on the other, the feet together at the end with their soles square to it. The right
      // arm is folded under: elbow on the couch, forearm upright, the hand under the cheek, a bolster in the angle; the left arm lies along
      // the upper side, hand on the thigh. The head is raised on that hand, tilted, its flame pointing up and away.
      C([[0.245, 0.15, 0, 0.088], [0.08, 0.104, 0, 0.068], [-0.07, 0.1, 0, 0.082]]);      // the body's middle
      C([[0.228, 0.2, 0, 0.06], [0.085, 0.132, 0, 0.048], [-0.07, 0.142, 0, 0.066]]); C([[0.24, 0.098, 0, 0.066], [0.08, 0.066, 0, 0.058], [-0.07, 0.062, 0, 0.066]]);      // its upper side - dipping at the waist, rising over the hip - and its under side
      C([[-0.07, 0.12, 0, 0.062], [-0.26, 0.087, 0, 0.048], [-0.41, 0.07, 0, 0.036], [-0.468, 0.07, 0, 0.03]]); C([[-0.07, 0.06, 0, 0.06], [-0.26, 0.045, 0, 0.046], [-0.41, 0.036, 0, 0.035], [-0.468, 0.036, 0, 0.03]]);      // the upper leg and the under one
      // The feet, as the body lies on its side: one upon the other at the end, the soles flat and upright facing it, heels to the back and the
      // toes to the front in two rows, the great toes meeting in the middle. Each: an instep from the ankle, a sole of two ribs, five toes.
      for (const up of [0, 1]) { const fy = up ? 0.077 : 0.034, g = up ? 1 : -1; C([[-0.468, fy, 0, 0.029], [-0.477, fy, 0.04, 0.022], [-0.485, fy, 0.082, 0.014]]);
        CM([-1, 1].map((q) => [[-0.486, fy + q * 0.008, -0.028, 0.015], [-0.489, fy + q * 0.0105, 0.035, 0.013], [-0.49, fy + q * 0.0125, 0.088, 0.0105]]));
        CM([0, 1, 2, 3, 4].map((t) => { const ty = fy - g * 0.0185 + g * t * 0.0091, r = t ? 0.0047 - 0.0002 * t : 0.006, z1 = 0.126 - 0.004 * t; return [[-0.491, ty, 0.09, r], [-0.492, ty, (0.09 + z1) / 2, r], [-0.493, ty, z1, r * 0.8]]; })); }
      C([[0.215, 0.224, 0.03, 0.044], [0.05, 0.186, 0.062, 0.036], [-0.1, 0.178, 0.064, 0.03]]); hand([-0.1, 0.177, 0.066], [-1, -0.22, 0], [0, -0.8, 0.6], 0.088, -0.03);      // the left arm along the upper side, a little to the front, its hand on the thigh
      C([[0.24, 0.11, 0.04, 0.046], [0.31, 0.05, 0.06, 0.042], [0.38, 0.022, 0.068, 0.04]]); C([[0.38, 0.022, 0.068, 0.038], [0.362, 0.09, 0.056, 0.032], [0.347, 0.15, 0.043, 0.024]]); hand([0.346, 0.158, 0.04], [0.875, 0.485, -0.1], [0, 0, 1], 0.088, 0.02);      // the right arm: down to the elbow on the couch, and the forearm up to the cheek
      C([[0.24, 0.165, 0, 0.052], [0.27, 0.178, 0.004, 0.044], [0.295, 0.188, 0.008, 0.036]]);      // the neck
      C([[0.265, 0.025, -0.035, 0.05], [0.3, 0.06, -0.035, 0.046], [0.33, 0.095, -0.035, 0.022]]);      // the bolster
      // the robe, as ridges in the skin: the folded cloth from the upper shoulder down the chest; its edge across the chest to under the lower
      // arm; two long folds down the front of the legs; the hem round the ankles
      C([[0.222, 0.212, 0.056, 0.015], [0.13, 0.165, 0.076, 0.017], [0.04, 0.128, 0.076, 0.014]]); C([[0.198, 0.216, 0.05, 0.011], [0.2, 0.15, 0.088, 0.012], [0.22, 0.082, 0.072, 0.011]]);
      C([[-0.06, 0.125, 0.064, 0.008], [-0.26, 0.09, 0.05, 0.008], [-0.43, 0.073, 0.038, 0.007]]); C([[-0.06, 0.062, 0.064, 0.008], [-0.26, 0.046, 0.05, 0.008], [-0.43, 0.038, 0.037, 0.007]]);
      C([[-0.445, 0.018, 0.0, 0.011], [-0.445, 0.055, 0.042, 0.012], [-0.445, 0.098, 0.0, 0.011]]);
      // (from near to: the couch's edge is a band of lotus petals, turned up over turned down, all round)
      // (each petal thin, of three ribs like those of the lotus seats, and small, set close: 37 along each side and 11 across each end)
      { const W = [0.25, 1, 0.7, 0], R = [0.8, 1, 0.85, 0.35], pet = (px, pz, ox, oz) => { for (const dn of [0, 1]) { const P = dn ? [[0, -0.042], [0.5, -0.056], [0.85, -0.07], [1, -0.084]] : [[0, -0.032], [0.5, -0.02], [0.85, -0.004], [1, 0.012]];
            for (const d of [-1, 0, 1]) C(P.map((p, i) => [px + ox * p[0] * 0.03 - oz * d * 0.0085 * W[i], p[1], pz + oz * p[0] * 0.03 + ox * d * 0.0085 * W[i], 0.0052 * R[i]])); } };
        for (let q = 0; q < 37; q++) for (const e of [-1, 1]) pet((q - 18) * 0.028, e * 0.146, 0, e); for (let q = 0; q < 11; q++) for (const e of [-1, 1]) pet(e * 0.511, (q - 5) * 0.027, e, 0); }
      head(0.286, 0.182, 0.012, 0.48, 1.065); }
    // (A great image is sculpted finely - a grid of 3.6 thousandths of its height, some 350 000 triangles; the small ones on the altars coarsely.)
    pendM.push([fine ? sculpt('buddha' + pose, SG, pose >= 2 ? 0.003 : 0.0036, 0.007) : sculpt('buddhac' + pose, SG, 0.011, 0.012), 0, 0, 0, 1]);
    for (const [Mh, ox, oy, oz2, sc, lie] of pendM) { const cy = cos(F.yaw), sy = sin(F.yaw), V = Mh.v, O = new Float32Array(V.length / 6 * 7), ca = cos(lie || 0), sa = sin(lie || 0);
      for (let i = 0, o = 0; i < V.length; i += 6, o += 7) { const vx = V[i] * ca + V[i + 1] * sa, vy = -V[i] * sa + V[i + 1] * ca, nx2 = V[i + 3] * ca + V[i + 4] * sa, ny2 = -V[i + 3] * sa + V[i + 4] * ca, px = lx + (ox + vx * sc) * H, pz = lz + (oz2 + V[i + 2] * sc) * H;
        O[o] = F.x + px * cy + pz * sy; O[o + 1] = F.y + y0 + (oy + vy * sc) * H; O[o + 2] = F.z - px * sy + pz * cy; O[o + 3] = nx2 * cy + V[i + 5] * sy; O[o + 4] = ny2; O[o + 5] = -nx2 * sy + V[i + 5] * cy; O[o + 6] = mat; }
      meshP.push([O, Mh.i]); }
    const q = F.W(lx, lz); clear(q, F.yaw, pose === 4 ? H * 1.1 : H * 1.1, pose === 4 ? H * 0.34 : H); };
  const swc = seaW(oz + CH / 2);
  if (twc > 0.2 || swc > 0.3) {
    if (twc > 0.2) {
    // Rows of shophouses (ตึกแถว) along both sides of the street. Proportions as they are really built: a unit 4 m wide and
    // 12 m deep; a tall ground floor with a mezzanine (5 m), upper floors of 3 m; mostly three storeys; a canopy over the
    // footpath. Blocks of eight units with a lane between; each block is one build (same height and style), each unit its own colour.
    const UW = 4, DEP = 12;
    // (A unit belongs to the chunk its middle stands in, and where the road slants that middle lies up to 10 m along z from the unit's place on the
    // road: so the units of the next 28 m either way are gone through as well. Without this, buildings went missing at chunk borders.)
    for (let k = Math.ceil((oz - 28) / UW - 0.5); (k + 0.5) * UW < oz + CH + 28; k++) {
      const z = (k + 0.5) * UW, um = ((k % 9) + 9) % 9; if (townW(z) < 0.5 || (um === 8 && !laneSd(floor(k / 9))) || nearRiv(z, 9)) continue; const tseg = twS;      // (slot 8 is the lane's - but where it goes off on one side only, the other side has a lot there instead: see below)
      if ((um === 7 && xroad(floor(k / 9))) || (um === 0 && xroad(floor(k / 9) - 1))) continue;      // the corners of a crossroads are left open
      const a = atan2(roadX(z + 1) - roadX(z - 1), 2), blk = floor(k / 9);
      for (const side of [1, -1]) {
        if (um === 8 && laneSd(blk) === side) continue;      // (the lane's own side)
        // Every town has its own character (tch: old market town ... newer concrete town), and every block of the street is drawn by lot:
        // a row of shophouses of its own length and setback, or an open square with trees, a single large shop, a market, a temple, a filling station.
        const seg = tseg, tch = ph(seg, 300), bq = blk * 2 + (side > 0 ? 1 : 0), bt = ph(bq, 310 + seg), len = 4 + floor(ph(bq, 320 + seg) * 5), sb0 = 8 + floor(ph(bq, 330 + seg) * 3) * 1.3 + (udOf(blk * 36 + 18) && abs(blk * 36 + 18 - UD.zc) < 130 ? SVW : 0);      // (back beyond the frontage road, beside an underpass)
        let kind = bt < 0.13 ? 1 : bt < 0.27 ? 2 : bt < 0.27 + (tch < 0.6 ? 0.13 : 0.04) ? 3 : bt > 0.94 ? 5 : 0;
        if (((blk % 24) + 24) % 24 === floor(tch * 24) && (side > 0) === (ph(seg, 301) < 0.5)) kind = 4;
        // convenience stores are spaced out: one to every twelve blocks of street (about 430 m), on one side or the other, and never in the first or
        // last two blocks of its twelve, so two of them are at least 180 m apart. It takes the place of a row of shophouses or of a large shop.
        const sg = floor(blk / 12), store = (kind === 0 || kind === 2) && blk - sg * 12 === 2 + floor(ph(sg, 346 + seg) * 7.99) && (side > 0) === (ph(sg, 348 + seg) < 0.5);
        if (store) kind = 2;
        const sb = store ? sb0 + CONV_BACK : sb0;      // (a convenience store stands further back, behind its car park)
        const nx = cos(a) * side, nz = -sin(a) * side, cx = roadX(z) + nx * (sb + DEP / 2), cz = z + nz * (sb + DEP / 2); const own = inside(cx, cz); if (!own && !(cx >= ox - 18 && cx < ox + CH + 18 && cz >= oz - 18 && cz < oz + CH + 18)) continue;
        const hb = ph(blk, side + 7 + seg), stB = hb < (tch < 0.4 ? 0.62 : tch > 0.75 ? 0.08 : 0.2) ? 2 : hb < (tch > 0.75 ? 0.6 : 0.85) ? 3 : 4, old = stB === 2 && ph(blk, side + 11) < 0.7, balc = ph(blk, side + 13) < 0.55;
        const uv_ = ph(k * 7 + 60, side + 40), st = old ? 2 : clamp(stB + (uv_ < 0.22 ? 1 : uv_ > 0.86 ? -1 : 0), 2, 5);          // units in a newer row are not all one height
        const Hh = 5 + (st - 1) * 3 + 0.3, yaw = atan2(-nx, -nz), y = roadYs(z) - 0.3, sd = ph(k, side * 3 + 1), bs = ph(blk, side + 21), c = cos(yaw), sn = sin(yaw), F = DEP / 2;
        const put = (lx, ly, lz, sx, sy, sz, mat, seed = sd, tilt = 0, shape = 0) => boxes.push(cx + lx * c + lz * sn, y + ly, cz - lx * sn + lz * c, yaw, sx, sy, sz, tilt, mat, seed, sy, shape);
        const u = (i) => ph(k * 7 + i, side + 40);          // this unit's own random numbers
        const Wd = (lx, lz) => [cx + lx * c + lz * sn, cz - lx * sn + lz * c], tree = (lx, lz, sc, h) => { const q = Wd(lx, lz); if (inside(q[0], q[1])) plant(TREES[BL[floor(h * 8)]], q[0], q[1], h * 6, sc); };
        const fwd = sb + F;                                                                          // from this unit's middle out to the middle of the road
        if (!own) {                    // a neighbouring chunk's unit: nothing of it is built here but those of its trees that stand on this side of the border
          if (!kind && um < len) nbFoot.push(cx, cz, yaw, UW + 0.4, DEP, y, y + Hh);                  // (and where its body stands, so that no tree of ours grows into it)
          else if (kind === 2 && um === 3) { const q = Wd(2 * side, -1.5); nbFoot.push(q[0], q[1], yaw, 20 + floor(ph(bq, 340 + seg) * 3) * 3, 9, y, y + 8); }
          if (kind) { if (um === 3) { const X = 2 * side, s1 = ph(bq, 340 + seg), s2 = ph(bq, 350 + seg);
            if (kind === 1) for (let i = 0; i < 5; i++) tree(X - 12 + i * 6 + (ph(bq, 360 + i) - 0.5) * 3, 2 - ph(bq, 370 + i) * 9, 0.7 + ph(bq, 380 + i) * 0.5, ph(bq, 390 + i));
            else if (kind === 2 && !store) tree(X + (20 + floor(s1 * 3) * 3) / 2 + 2.5, 3, 0.6, s2);      // (none beside a convenience store: it would stand in its car park)
            else if (kind === 4) { tree(X + 3, 0, 0.9, s1); tree(X + 14, 3, 0.8, s2); tree(X - 15, 3.5, 0.7, ph(bq, 450)); } } }
          else if (um >= len) { if (um === len && ph(bq, 460) < 0.6) tree(1, 1, 0.7 + ph(bq, 461) * 0.4, ph(bq, 462)); }
          else if (tch > 0.25 && (um === 1 || um === 5) && ph(k, side + 470) < 0.55) tree(0, fwd - 7.1 - svW(z), 0.5 + ph(k, side + 471) * 0.2, ph(k, side + 472));
          continue;
        }
        if (kind) {
          if (um !== 3) continue; const X = 2 * side, s1 = ph(bq, 340 + seg), s2 = ph(bq, 350 + seg);       // X: the middle of the block along the street
          if (kind === 1) {            // a small square: shade trees, benches, a pavilion (its edge toward the street is the raised footpath's own)
            for (let i = 0; i < 5; i++) tree(X - 12 + i * 6 + (ph(bq, 360 + i) - 0.5) * 3, 2 - ph(bq, 370 + i) * 9, 0.7 + ph(bq, 380 + i) * 0.5, ph(bq, 390 + i));
            for (const bx of [-8, 0, 8]) { put(X + bx, 0.72, 4.6, 1.7, 0.07, 0.45, 0); put(X + bx, 1.0, 4.36, 1.7, 0.4, 0.06, 0); put(X + bx - 0.7, 0.5, 4.6, 0.08, 0.4, 0.4, 2); put(X + bx + 0.7, 0.5, 4.6, 0.08, 0.4, 0.4, 2); }
            { const q = Wd(X - 11, 4.2); far.push(q[0], y, q[1], 0.06, q[0], y + 8.3, q[1], 0.045, -1, 0); for (let i = 0; i < 9; i++) put(X - 10.95 + (i + 0.5) * 0.2, 7.6, 4.2, 0.2, 1.2, 0.02, 38, (i + 0.5) * 0.2); }      // the flag: nine strips of cloth (the vertex stage waves them as one)
            { const q = Wd(X + 4, -4); stamp(SALA, q[0], y + 0.3, q[1], yaw, 0.7, s1); }
          } else if (kind === 2) {     // one large shop set back behind its forecourt: an open or glazed front, a long sign, a pylon sign at the kerb
            let shopW = s1, shopH = 0; const conv = store, Wt = 20 + floor(s1 * 3) * 3, small = conv && ph(bq, 346 + seg) < 0.5, Wb = conv ? (small ? 11 : 20) : Wt, Hb = conv ? (small ? 3.7 : 5.1) : s2 < 0.5 ? 4.6 : 8;
            if (!conv) {               // the forecourt poured in concrete, level with the road, from the shop's front out to the footpath (in strips along
              // the street, each tilted to the street's grade, as the convenience store's car park is laid)
              const frF = fwd - 8.0 - svW(z), WF = Wb + 4, Wc2 = (px, pz) => [cx + px * c + pz * sn, cz - px * sn + pz * c];
              for (let ax = -WF / 2; ax < WF / 2 - 0.01; ax += 3) { const xa = X + ax, xb = X + min(ax + 3, WF / 2), zm = (3.0 + frF) / 2, qa = Wc2(xa, zm), qb = Wc2(xb, zm), q = Wc2((xa + xb) / 2, zm), ga = ground(qa[0], qa[1]), gb = ground(qb[0], qb[1]);
                boxes.push(q[0], (ga + gb) / 2 + 0.012 - 0.35, q[1], yaw + PI / 2, frF + 0.6 - 3.0, 0.7, Math.hypot(xb - xa, gb - ga) + 0.004, -atan2(gb - ga, xb - xa), 2, 11, 0.7, 0); } }
            if (conv) {                // The car park in front of a convenience store, as they all have one: a concrete apron from the shop's front to the
              // footpath, level with the road, bays marked in yellow square to the shop (cars and pickups go in nose first), a few of them taken - a pickup, a row of
              // motorcycles in the bay by the door - and at each end a way in and out across the footpath, the kerb left out there (see convDr)
              // so that a car can drive up onto it. (fr: the footpath's inner edge, the apron's front; fwd - 4: the kerb's inner edge.)
              const fr = fwd - 8.05 - svW(z), Wc = (px, pz) => [cx + px * c + pz * sn, cz - px * sn + pz * c], top = 0.31, Wa = Wb + 9.4;
              // (the apron level with the road, and as smooth: laid in strips 3 m wide along the street, each from its full depth, tilted from the
              // ground's level at one end to its level at the other, so that the strips meet edge to edge as one plane following the road's grade -
              // set flat, each at its middle's level, they stood in steps of a few centimetres, one above the next)
              const gP = (lx, lz, sx, sz, ht, mat, seed) => { const q = Wc(lx, lz); boxes.push(q[0], ground(q[0], q[1]) + ht - 0.35, q[1], yaw, sx, 0.7, sz, 0, mat, seed, 0.7, 0); };
              const slab = (xa, xb, za, zb) => { const zm = (za + zb) / 2, qa = Wc(xa, zm), qb = Wc(xb, zm), q = Wc((xa + xb) / 2, zm), ga = ground(qa[0], qa[1]), gb = ground(qb[0], qb[1]), w = xb - xa;
                boxes.push(q[0], (ga + gb) / 2 + 0.012 - 0.35, q[1], yaw + PI / 2, zb - za, 0.7, Math.hypot(w, gb - ga) + 0.004, -atan2(gb - ga, w), 2, 11, 0.7, 0); };
              // (only as far along as the ground is the street's level: by a canal the bank falls away at one end, and the apron and its last
              // bay went on out over it - lo..hi, the stretch of the front that is level, found from the middle outward)
              const okX = (lx) => [5.3, 8, fr - 0.3].every((lz) => { const q = Wc(lx, lz); return abs(ground(q[0], q[1]) - roadYs(q[1])) < 0.12; });      // (the street's level where it stands: the street climbs along the front)
              let lo = X, hi = X; while (lo > X - Wa / 2 && okX(lo - 0.25)) lo -= 0.25; while (hi < X + Wa / 2 && okX(hi + 0.25)) hi += 0.25;
              for (let ax = lo; ax < hi - 0.01; ax += 3) slab(ax, min(ax + 3, hi), 5.1, fr + 0.8);      // (on under the footpath's back edge a little, so that on a bend no strip of ground shows between them)
              clear(Wc(X, (5.1 + fr) / 2), yaw, Wa, fr - 5.1);      // (no tree grows up through the car park)
              // The footpath goes on along the front at its own height - the car park let down into it as a square hole at the road's level, its
              // back edge the car park's kerb - and is cut through only by the two ways in.
              // (the ways in across the footpath, and the footpath's own edge toward the car park, are laid along the street, not the shop: on a
              // bend the shop's square frame runs off the street's line - the way in went out over the kerb onto the road, the edge in across the
              // footpath. So both are the street's: the way in in the footpath's loop beside the kerb, the edge the raised footpath's own back.)
              const nb = floor((Wb + 3.6) / 2.6), x0 = X - nb * 1.3;
              const bayOK = (i) => i >= 0 && i < nb && x0 + i * 2.6 >= lo - 0.05 && x0 + (i + 1) * 2.6 <= hi + 0.05;
              for (let i = 0; i <= nb; i++) if (bayOK(i) || bayOK(i - 1)) for (const lz2 of [6.1, 7.3, 8.5, 9.7]) gP(x0 + i * 2.6, lz2, 0.1, 1.2, 0.02, 33, 0.3);
              // (only the lines either side of each bay, none across its mouth: so they are marked here)
              for (let i = 0; i < nb; i++) { if (!bayOK(i)) continue; const bx = x0 + (i + 0.5) * 2.6, r = ph(bq, 600 + i), s3 = ph(bq, 620 + i);
                if (i === nb - 1) { for (let m = 0; m < 3; m++) if (ph(bq, 640 + m) < 0.75) { const s2 = ph(bq, 650 + m); const qm = Wc(bx - 0.8 + m * 0.8, 7.2), ym = ground(qm[0], qm[1]) + 0.002; if (s2 > 0.85) bicycle(Wc, yaw, ym, bx - 0.8 + m * 0.8, 7.2, s2); else mbike(Wc, yaw, ym, bx - 0.8 + m * 0.8, 7.2, s2); } continue; }
                if (r > 0.3) continue;
                const k5 = [3, 3, 3, 3, 3, 3, 5, 5, 2, 4, 0, 1][floor(s3 * 12) % 12], big = s3 < 0.4, q = Wc(bx, 7.9), yt = ground(q[0], q[1]) + 0.012, M = twoW(Wc, yaw + (r < 0.15 ? 0 : PI), yt, bx, 7.9, 0).M, len = big ? 5.3 : 3.4;
                trkPend.push([q[0], q[1], yaw, big ? 1.05 : 0.9, len / 2, yt, () => {
                  if (big) { const mt = (cl) => cl === 0 ? 40 + k5 : cl === 12 ? 50 + k5 : SCMAT[cl]; M(assetMesh('ranger'), mt); M(assetMesh('rangerLo'), mt, 0, 2); xcol.push(q[0], q[1], yaw, 0.95, 2.65, yt, yt + 1.85); }
                  else { M(assetMesh('pickup'), (cd) => cd >= 32768 ? cd + 32768 * 3 : cd, 0, 0); xcol.push(q[0], q[1], yaw, 0.85, 1.7, yt, yt + 1.6); } }]); }
            }
            if (conv) {                // The shop itself is a real room, not a picture on the glass: floor, walls, roof and a lit ceiling, and inside it rows of low
              // white shelves end-on to the street, a wall of drinks chillers across the back, and the counter by the door. The front has its frames
              // and a frosted band at waist height but no pane (nothing here is drawn see-through), so the inside is seen as it really stands.
              const gh = small ? 3.1 : 3.35, wm = small ? 41 : 2, IN = 3, cx = small ? 2.2 : 6.4;      // top of the glass, wall material, "lit indoors" (see the shader), where the door is
              put(X, 0.34, -1.5, Wb, 0.08, 9, 19, 0, 0, IN); put(X, Hb + 0.27, -1.5, Wb + 0.1, 0.14, 9.1, 2); put(X, Hb / 2 + 0.3, -5.9, Wb, Hb, 0.2, wm, s1);
              for (const d of [-1, 1]) { put(X + d * (Wb / 2 - 0.1), Hb / 2 + 0.3, -1.5, 0.2, Hb, 9, wm, s1); put(X + d * (Wb / 2 - 0.24), 1.85, -1.45, 0.05, 3.0, 8.7, 19, 0, 0, IN); }
              put(X, (gh + Hb + 0.3) / 2, 2.9, Wb, Hb + 0.3 - gh, 0.2, wm, s1); put(X, gh - 0.04, -1.45, Wb - 0.5, 0.06, 8.7, 44, 0, 0, IN);
              put(X, 1.5, -5.74, Wb - 0.6, 2.3, 0.1, 43, s1, 0, IN); put(X, 2.9, -5.76, Wb - 0.6, 0.5, 0.06, 19, 0, 0, IN);
              for (let gx = -Wb / 2 + 1.9, j = 0; gx < cx - 2.2; gx += 2.4, j++) put(X + gx, 1.08, -1.9, 0.9, 1.4, 5.0, 42, ph(bq, 351 + j), 0, IN);
              put(X + cx + 0.2, 0.86, 0.5, 2.8, 0.95, 0.7, 19, 0, 0, IN); put(X + cx + 0.9, 1.5, 0.5, 0.4, 0.34, 0.4, 3, 0, 0, IN); put(X + cx + 0.2, 1.7, -1.2, 2.8, 2.6, 0.35, 42, s2, 0, IN);
              put(X, 1.2, 3.03, Wb - 0.8, 0.2, 0.02, 19, 0, 0, IN);
            }
            if (small) {               // the small kind: a white box with a white sloping canopy and, above it, a raised front carrying the board; two bays of glass between white piers, the door in the right-hand one
              for (const px of [-Wb / 2 + 0.25, -0.9, Wb / 2 - 0.25]) put(X + px, 1.85, 3.06, 0.5, 3.1, 0.16, 19);
              for (const fx of [-4.95, -3.0, -1.2, -0.6, 1.4, 3.0, 4.95]) put(X + fx, 1.75, 3.1, fx === 1.4 || fx === 3.0 ? 0.09 : 0.05, 2.7, 0.07, 3);          // black frames; the door between the two thick ones
              put(X, 3.08, 3.1, Wb - 0.8, 0.06, 0.07, 3); put(X, 0.42, 3.1, Wb - 0.8, 0.06, 0.07, 3); put(X, 0.36, 4.3, Wb + 1.0, 0.12, 2.7, 2);
              put(X, 3.55, 4.25, Wb + 1.4, 0.06, 2.7, 41, s1, 0.17); put(X, 4.55, 3.35, Wb + 0.5, 1.45, 0.5, 41, s2); put(X, 4.55, 3.63, Wb - 0.4, 0.95, 0.08, 23, 2);
              for (let i = 0; i < 4; i++) { const bx = X - 3.6 + i * 1.9; put(bx, 0.82, 5.5, 0.17, 0.8, 0.17, 19); put(bx, 1.28, 5.5, 0.18, 0.14, 0.18, 33, 0.3); }      // white posts with yellow caps
              for (let i = 0; i < 4; i++) put(X + Wb / 2 - 0.65, 0.62 + i * 0.3, 3.55, 0.6, 0.28, 0.4, 33, 0.9);                                              // a stack of orange crates by the door
              put(X - 2, Hb + 0.75, -3, 2.4, 0.9, 1.2, 22);
            } else if (conv) {         // the long kind: a long low grey box with a tall plain front above a thin flat canopy, glass from end
              // to end with the lit shop behind it, the door toward one end, a row of white posts along the front, the name on a board in the middle of the wall above
              put(X, 4.3, 3.06, Wb - 0.6, 0.95, 0.12, 23, 2);      // (the chain's board the whole width of the front, as they are)
              put(X, 3.42, 3.9, Wb + 0.7, 0.13, 2.1, 2); put(X, 3.42, 4.96, Wb + 0.7, 0.2, 0.05, 3); put(X, 5.36, 3.02, Wb + 0.1, 0.1, 0.12, 19);
              for (let i = 0; i <= 12; i++) put(X - (Wb - 0.6) / 2 + i * (Wb - 0.6) / 12, 1.85, 3.08, i === 9 || i === 11 ? 0.13 : 0.05, 3.0, 0.1, 19);          // the frames of the glass; the door is between the thicker ones
              put(X, 0.4, 3.07, Wb - 0.6, 0.12, 0.1, 19); put(X, 2.55, 3.07, Wb - 0.6, 0.05, 0.1, 19); put(X + (Wb - 0.6) / 12 * 4, 1.5, 3.1, 0.06, 0.5, 0.06, 2);
              for (let i = 0; i <= 10; i++) put(X - Wb / 2 + 0.6 + i * (Wb - 1.2) / 10, 0.75, 5.0, 0.13, 0.9, 0.13, 19);                                    // the posts that keep cars off the pavement
              put(X - Wb / 2 + 1.4, 0.8, 3.72, 1.7, 1.0, 0.8, 19, s1); put(X - Wb / 2 + 1.4, 1.34, 3.72, 1.74, 0.08, 0.84, 2); put(X + Wb / 2 - 0.9, 0.75, 3.75, 0.5, 0.9, 0.5, 2);
              put(X + 4, Hb + 0.75, -3, 2.4, 0.9, 1.2, 22); put(X - 4, Hb + 0.75, -2, 2.4, 0.9, 1.2, 22);
            } else {
              // The big shop is a real room as the convenience store is, its front open to it - there was one dark pane across the whole front,
              // and in a grey light it read as a blank board. Of three sorts, each with its own goods and its own words on the board (render.js
              // SIGNS): a showroom behind aluminium-framed glass (no pane is drawn - its frames, and what is inside, are what is seen): electrical
              // goods, furniture, or tyres; a store open to the street, its steel shutters rolled up - building materials, wholesale, fertiliser,
              // animal feed, rice; or, now and then, a shop to let, its shutters down.
              const gh = 3.4, tA = ph(bq, 360 + seg), sort = tA < 0.42 ? 0 : tA < 0.9 ? 1 : 2, kW = sort === 0 ? [33, 34, 38][floor(ph(bq, 361 + seg) * 2.999)] : sort === 1 ? [8, 28, 44, 45, 40][floor(ph(bq, 361 + seg) * 4.999)] : 27, sw = (hc) => 100 + kW + 0.01 + 0.98 * hc;
              // (its hours - HRS: a showroom keeps a shop's, a store open to the street a trader's; inside, lit by its own lamps (shape 3) only while it is open)
              const hB = sort === 2 ? HRS(-1) : HRS(sort === 0 && kW !== 38 ? 10 : 11, ph(bq, 375 + seg), ph(bq, 376 + seg)), IN = 3 + hB, SHUT = hB + 128000;
              put(X, 0.34, -1.5, Wb, 0.08, 9, 19, 0, 0, IN); put(X, gh / 2 + 0.3, -5.9, Wb, gh, 0.2, 18, s1); for (const d of [-1, 1]) put(X + d * (Wb / 2 - 0.1), gh / 2 + 0.3, -1.5, 0.2, gh, 9, 18, s1);
              put(X, gh + 0.26, -1.5, Wb - 0.4, 0.06, 8.8, 44, 0, 0, IN); put(X, (gh + Hb) / 2 + 0.3, -1.5, Wb, Hb - gh, 9, 18, s1); put(X, (3.2 + gh + 0.3) / 2, 2.92, Wb, gh + 0.3 - 3.2, 0.16, 18, s1);
              const ow = Wb - 0.4, x0 = X - ow / 2;
              const cyl = (lx, ly, lz, r, lx1, ly1, lz1, r1, m) => { const p0 = Wd(lx, lz), p1 = Wd(lx1, lz1); far.push(p0[0], y + ly, p0[1], r, p1[0], y + ly1, p1[1], r1, -1, m); };
              if (sort === 0 && kW === 38) {      // A tyre shop (ร้านยาง), as they are: no glass - the whole front open, rolled-up shutters' boxes over the
                // bays, the floor bare concrete stained with oil. Along the back and one side, steel racks three tiers high full of tyres standing on
                // their treads side by side; columns of tyres laid flat out on the floor; in one bay a pickup up on a jack with a wheel off, beside it
                // the tyre changer (its turntable and arm) and the wheel balancer, an air compressor's red tank with its hose, a few alloy wheels
                // leaning by the wall, and the brands' banners hung across the back.
                const cyT = cos(yaw), syT = sin(yaw);
                // (a tyre: TYRET, r its outer radius, w its width; laid flat, or standing - its axle along the shop's x, or along its z (axZ))
                const tyre = (lx, ly, lz, r, w, flat, axZ = false) => { const q0 = Wd(lx, lz), T = TYRET, n = T.P.length / 3, O = new Float32Array(n * 7);
                  for (let k = 0; k < n; k++) { let ux = T.P[k * 3] * r, uy = T.P[k * 3 + 1] * w / 2, uz = T.P[k * 3 + 2] * r, nx = T.N[k * 3], ny = T.N[k * 3 + 1], nz = T.N[k * 3 + 2];
                    if (!flat) { if (axZ) { [uy, uz] = [uz, uy]; [ny, nz] = [nz, ny]; } else { [ux, uy] = [uy, ux]; [nx, ny] = [ny, nx]; } }
                    O[k * 7] = q0[0] + ux * cyT + uz * syT; O[k * 7 + 1] = y + ly + uy; O[k * 7 + 2] = q0[1] - ux * syT + uz * cyT; O[k * 7 + 3] = nx * cyT + nz * syT; O[k * 7 + 4] = ny; O[k * 7 + 5] = -nx * syT + nz * cyT; O[k * 7 + 6] = 1; }
                  meshP.push([O, T.I, 0]); };
                const nbT = 3 + floor(ph(bq, 362 + seg) * 2); for (let i = 0; i <= nbT; i++) put(x0 + i * ow / nbT, 1.79, 2.9, 0.35, 2.82, 0.3, 18, s1);
                for (let i = 0; i < nbT; i++) put(x0 + (i + 0.5) * ow / nbT, 3.08, 2.98, ow / nbT - 0.3, 0.22, 0.2, 32, s2);
                put(X, 0.385, -1.5, Wb - 0.4, 0.012, 8.6, 2, 11, 0, IN);      // the concrete floor, oil-stained (the car park's concrete)
                // the racks: posts and three shelves of steel, tyres upright on each, along the back wall and down the left side
                for (const [rx0, rx1, rz, alongX] of [[x0 + 0.4, x0 + ow - 0.4, -5.35, true], [-5.0, 1.2, x0 + 0.55, false]]) { const L = rx1 - rx0;
                  for (let k = 0; k <= Math.round(L / 2.2); k++) { const t = rx0 + k * L / Math.round(L / 2.2); if (alongX) put(t, 1.6, rz, 0.06, 2.5, 0.6, 19, 0, 0, IN); else put(rz, 1.6, t, 0.6, 2.5, 0.06, 19, 0, 0, IN); }
                  for (let tier = 0; tier < 3; tier++) { const ty2 = 0.45 + tier * 0.8; if (alongX) put((rx0 + rx1) / 2, ty2, rz, L, 0.05, 0.62, 19, 0, 0, IN); else put(rz, ty2, (rx0 + rx1) / 2, 0.62, 0.05, L, 19, 0, 0, IN);
                    for (let t = rx0 + 0.2; t < rx1 - 0.15; t += 0.24) { const r = 0.3 + 0.04 * ph(bq + floor(t * 9), 390 + tier); if (ph(bq + floor(t * 11), 391 + tier) < 0.12) continue;
                      tyre(alongX ? t : rz, ty2 + 0.03 + r, alongX ? rz : t, r, 0.2, false, !alongX); } } }
                // columns of tyres laid flat on the floor
                for (let i = 0; i < 4; i++) { const gx = x0 + ow * 0.55 + i * 0.75, gz = -3.6 + (i % 2) * 0.8; for (let j = 0, n = 4 + floor(ph(bq + i, 392) * 5); j < n; j++) tyre(gx, 0.49 + j * 0.21, gz, 0.31, 0.2, true); }
                // the bay: a pickup on its jack, one front wheel off and lying by it; the changer, the balancer, the compressor
                { const bx = x0 + ow * 0.3, bz = -0.6, M = twoW(Wd, yaw + PI / 2, y + 0.38 + 0.14, bx, bz, 0.03).M, PK = pickupNoWheel(); M(PK, (cd) => cd >= 32768 ? cd + 32768 * 3 : cd, 0, 0);
                  // (where the wheel was: the brake drum on its hub, grey - the car turned a quarter round, its +x side toward the shop's front)
                  if (PK && PK.whl) { const [wx, wr, wz] = PK.whl, hx = bx + wz, hz = bz - wx; const p0 = Wd(hx, hz + 0.05), p1 = Wd(hx, hz - 0.1); far.push(p0[0], y + 0.52 + wr, p0[1], 0.15, p1[0], y + 0.52 + wr, p1[1], 0.13, -1, 4); }
                  put(bx - 1.2, 0.5, bz + 0.9, 0.5, 0.2, 0.25, 50, 0.0985, 0, IN); tyre(bx - 1.6, 0.5, bz + 1.7, 0.31, 0.2, true);
                  const cx2 = bx + 2.6; put(cx2, 0.85, bz - 1.4, 0.75, 0.95, 0.9, 50, 0.0985, 0, IN); { const p0 = Wd(cx2, bz - 1.4); far.push(p0[0], y + 1.32, p0[1], 0.36, p0[0], y + 1.38, p0[1], 0.36, -1, 4); }
                  put(cx2 + 0.3, 1.6, bz - 1.75, 0.1, 1.5, 0.1, 50, 0.0985, 0, IN); put(cx2 + 0.05, 2.3, bz - 1.5, 0.6, 0.1, 0.1, 50, 0.0985, 0, IN);      // the changer: body, turntable, column, arm
                  put(cx2 + 1.4, 0.8, bz - 1.4, 0.6, 0.85, 0.6, 50, 0.7619, 0, IN); put(cx2 + 1.4, 1.45, bz - 1.55, 0.7, 0.35, 0.35, 50, 0.7619, 0, IN); { const p0 = Wd(cx2 + 1.4, bz - 0.95), p1 = Wd(cx2 + 1.4, bz - 0.75); far.push(p0[0], y + 1.2, p0[1], 0.05, p1[0], y + 1.2, p1[1], 0.05, -1, 20); }      // the balancer
                  { const p0 = Wd(x0 + ow - 1.8, -4.4), p1 = Wd(x0 + ow - 0.6, -4.4); far.push(p0[0], y + 0.75, p0[1], 0.28, p1[0], y + 0.75, p1[1], 0.28, -1, 21); put(x0 + ow - 1.2, 1.15, -4.4, 0.4, 0.3, 0.35, 3, 0, 0, IN); } }      // the compressor's tank
                for (let i = 0; i < 4; i++) { const ax = x0 + ow * 0.62 + i * 0.6, p0 = Wd(ax, -4.85), p1 = Wd(ax, -4.95); far.push(p0[0], y + 0.68, p0[1], 0.3, p1[0], y + 0.66, p1[1], 0.3, -1, 20); }      // alloy wheels leaning by the rack
                for (let i = 0; i < 3; i++) put(x0 + 2 + i * (ow - 4) / 2, 3.0, -5.7, 2.4, 0.6, 0.03, 23, sw(ph(bq, 393 + i)), 0, hB);      // banners
                put(X, 1.675, 2.92, ow, 2.59, 0.05, 32, s2, 0, SHUT);      // (out of hours its shutters down across the whole front)
              } else if (sort === 0) {         // aluminium frames: posts every 1.8 m or so, a rail at the foot and one at the door's head, the door a wider bay of two leaves
                const nb = Math.round(ow / 1.8); for (let i = 0; i <= nb; i++) put(x0 + i * ow / nb, 1.79, 2.95, i === floor(nb / 2) || i === floor(nb / 2) + 1 ? 0.1 : 0.06, 2.82, 0.1, 19);
                put(X, 0.42, 2.95, ow, 0.1, 0.1, 19); put(X, 2.55, 2.95, ow, 0.06, 0.08, 19); put(X, 3.17, 2.95, ow, 0.06, 0.1, 19); put(x0 + (floor(nb / 2) + 0.5) * ow / nb, 1.5, 2.98, 0.03, 0.3, 0.05, 3);
                if (kW === 33) for (let i = 0; i < 9; i++) { const gx = x0 + 1 + i * (ow - 2) / 8, k = ph(bq * 3 + i, 365); if (k < 0.4) put(gx, 0.38 + 0.85, -4.4, 0.7, 1.7, 0.65, 19, 0, 0, IN); else if (k < 0.75) put(gx, 0.38 + 0.43, -1.0 - (i % 2) * 2.2, 0.6, 0.86, 0.6, 19, 0, 0, IN); else { put(gx, 1.0, -5.75, 1.3, 0.75, 0.05, 3, 0, 0, IN); put(gx, 0.7, -5.4, 1.1, 0.6, 0.5, 57, k); } }      // (fridges along the back, washing machines on the floor, televisions on the wall over their boxes)
                else if (kW === 34) for (let i = 0; i < 6; i++) { const gx = x0 + 1.6 + i * (ow - 3.2) / 5, k = ph(bq * 3 + i, 366), z1 = -1.2 - (i % 2) * 2.6; if (k < 0.5) { put(gx, 0.62, z1, 1.9, 0.44, 0.85, 50, [0.1024, 0.3555, 0.6345, 0.0313][i % 4], 0, IN); put(gx, 0.95, z1 - 0.36, 1.9, 0.5, 0.14, 50, [0.1024, 0.3555, 0.6345, 0.0313][i % 4], 0, IN); }
                  else { put(gx, 0.78, z1, 1.4, 0.06, 0.8, 0, 0.3, 0, IN); for (const e of [-0.62, 0.62]) put(gx + e, 0.56, z1, 0.06, 0.4, 0.6, 0, 0.3, 0, IN); } put(gx, 1.3, -5.45, 1.2, 2.0, 0.55, 0, 0.3 + 0.3 * k, 0, IN); }      // (sofas and dining tables on the floor; wardrobes along the back)
                else for (let i = 0; i < 7; i++) { const gx = x0 + 1.2 + i * (ow - 2.4) / 6; for (let j = 0, n = 3 + floor(ph(bq + i, 367) * 4); j < n; j++) cyl(gx, 0.38 + j * 0.22, -3.4 - (i % 2) * 1.6, 0.33, gx, 0.6 + j * 0.22, -3.4 - (i % 2) * 1.6, 0.33, 1); }      // (tyres stacked in columns)
              } else if (sort === 1) {  // open to the street: the rolled-up shutters' boxes along the top of each bay, a pier between bays; one bay with its shutter half down
                const nb = 3 + floor(ph(bq, 362 + seg) * 2); for (let i = 0; i <= nb; i++) put(x0 + i * ow / nb, 1.79, 2.9, 0.35, 2.82, 0.3, 18, s1);
                for (let i = 0; i < nb; i++) { const bx = x0 + (i + 0.5) * ow / nb, half = ph(bq + i, 368) < 0.3; put(bx, 3.08, 2.98, ow / nb - 0.3, 0.22, 0.2, 32, s2); if (half) put(bx, 2.55, 2.96, ow / nb - 0.35, 1.2, 0.05, 32, s2); put(bx, 1.675, 2.92, ow / nb - 0.3, 2.59, 0.05, 32, s2, 0, SHUT); }      // (and out of hours every bay's shutter down)
                // inside: what it sells, stacked on the floor and on steel racks along the back
                const sackShop = kW === 40 || kW === 44 || kW === 45, cmS = kW === 40 ? 0.7137 : kW === 44 ? 0.9022 : 0.3973;
                if (!sackShop) for (let i = 0; i < 6; i++) put(x0 + 1.4 + i * (ow - 2.8) / 5, 1.6, -5.5, ow / 7, 2.5, 0.6, 31, ph(bq + i, 369), 0, IN);
                else {
                  // A shop of goods sold by the sack - rice (ร้านข้าวสาร), fertiliser, animal feed - as they are in Thai towns: no shelves of packets,
                  // but the sacks themselves. Along the back wall, on wooden pallets, a wall of them laid flat and criss-crossed course on course to
                  // well over head height; more stacked on pallets out on the floor; each a pale woven sack with its maker's printed band across
                  // the face. (Rice shops, below, add the open sacks out at the front.)
                  // (rice is sold under its millers' brands, each sack printed all over in its colours - red, yellow, purple, green, orange, blue -
                  // and the stacks stand brand by brand, so a rice shop is a wall of colour; fertiliser and feed come in pale sacks with a band)
                  const BR = [0.0985, 0.1493, 0.6313, 0.2697, 0.1083, 0.7619, 0.9999], brand = (sd0) => BR[floor(ph(sd0, 385) * 6.99)];
                  let stB = 0;      // (the brand of the stack being laid: each stack is one miller's)
                  // (each sack a pillow - SACKT - printed in its colour, with a white label: on its top face when it lies in a stack, on its front
                  // when it stands; colours as RGB555 codes, the mesh's material 100 + the code)
                  const c555 = (sd2) => Math.round(sd2 * 32768), cyw = cos(yaw), syw = sin(yaw);
                  const sackM = (lx, ly, lz, ax, ay, az, col, front, sd2, lab0 = true, T = SACKT) => { const q0 = Wd(lx, lz), n = T.P.length / 3, O = new Float32Array(n * 7), tw = (sd2 - 0.5) * 0.5;
                    for (let k = 0; k < n; k++) { const ux = T.P[k * 3], uy = T.P[k * 3 + 1], uz = T.P[k * 3 + 2], ex = ux * cos(tw * 0.15) - uz * sin(tw * 0.15), ez = ux * sin(tw * 0.15) + uz * cos(tw * 0.15);
                      const px = ex * ax, py = uy * ay, pz = ez * az, nx0 = T.N[k * 3] / ax, ny0 = T.N[k * 3 + 1] / ay, nz0 = T.N[k * 3 + 2] / az, nl = Math.hypot(nx0, ny0, nz0) || 1;
                      O[k * 7] = q0[0] + px * cyw + pz * syw; O[k * 7 + 1] = y + ly + py; O[k * 7 + 2] = q0[1] - px * syw + pz * cyw;
                      O[k * 7 + 3] = (nx0 * cyw + nz0 * syw) / nl; O[k * 7 + 4] = ny0 / nl; O[k * 7 + 5] = (-nx0 * syw + nz0 * cyw) / nl; O[k * 7 + 6] = col < 0 ? -col : 100 + c555(col); }      // (col below zero: a material of fsBranch's own - 33 woven sack, 34 rice)
                    meshP.push([O, T.I, 0]);
                    // (a brand panel on the face was tried - a coloured square a third of the sack's size - and looked wrong: plain white sacks)
                    if (false && lab0) { if (front) put(lx, ly, lz + az - 0.004, ax * 2 / 3, ay * 2 / 3, 0.012, 50, BR[floor(sd2 * 5.99)], 0, IN); else put(lx, ly + ay - 0.008, lz, ax * 2 / 3 * (abs(tw) < 9 ? 1 : 1), 0.014, az * 2 / 3, 50, BR[floor(sd2 * 5.99)], 0, IN); } };
                  // an open sack standing (r: its half width, h: its height): the sack, baggy, its neck rolled down into a fat rim at the top, and in
                  // its mouth the rice heaped up a little above the rim
                  const openS = (lx, ly, lz, r, h, sd2) => { sackM(lx, ly + h * 0.46, lz, r, h * 0.47, r, -33, true, sd2, false, SACKR);
                    sackM(lx, ly + h * 0.9, lz, r * 1.12, h * 0.075, r * 1.12, -33, true, sd2, false, SACKR); sackM(lx, ly + h * 0.93, lz, r * 0.94, h * 0.11, r * 0.94, -34, true, sd2, false, SACKR); };
                  const sack = (lx, ly, lz, along, sd2) => kW === 40 ? sackM(lx, ly, lz, along ? 0.46 : 0.28, 0.11, along ? 0.28 : 0.46, -33, false, stB) : sackM(lx, ly, lz, along ? 0.46 : 0.28, 0.11, along ? 0.28 : 0.46, cmS, false, sd2);
                  const stack = (sx0, sz0, nx, nz, layers, sd0) => { stB = ph(sd0, 385); put(sx0 + nx * 0.48 - 0.48, 0.45, sz0 + nz * 0.48 - 0.48, nx * 0.96 + 0.05, 0.13, nz * 0.96 + 0.05, 4, 0.4, 0, IN);
                    for (let L = 0; L < layers; L++) { const al = (L & 1) === 0; for (let a2 = 0; a2 < (al ? nx : nx * 2); a2++) for (let b2 = 0; b2 < (al ? nz * 2 : nz); b2++) {
                      const hx = ph(sd0 + L * 37 + a2 * 7 + b2, 380); if (L === layers - 1 && hx < 0.25) continue;
                      sack(sx0 + (al ? a2 * 0.96 : a2 * 0.48 + 0.24 - 0.24) + (al ? 0 : 0), 0.62 + L * 0.2, sz0 + (al ? b2 * 0.48 : b2 * 0.96), al, hx); } } };
                  for (let sx = x0 + 0.8; sx < x0 + ow - 1.6; sx += 2.0) stack(sx, -5.3, 2, 1, 9 + floor(ph(bq + floor(sx), 381) * 4), bq * 11 + floor(sx * 3));
                  for (let i = 0; i < 3; i++) stack(x0 + 2 + i * (ow - 4) / 2.4, -2.6, 2, 2, 3 + floor(ph(bq + i, 382) * 4), bq * 13 + i * 101);
                  if (kW === 40) {
                    // Out at the front, filling the shop's mouth, the retail display: three steps of stands, and on them the five-kilo bags of every
                    // brand standing upright side by side, face out, each printed in its colours with a white label; along the foot of it, on the
                    // floor, a few big white sacks open at the neck with the rice heaped in them, a scoop and a price card on a stick in each.
                    for (let st = 0; st < 3; st++) { const zS = 1.55 - st * 0.55, yS = 0.38 + st * 0.3; put(X, yS + 0.06, zS, ow - 1.4, 0.12 + st * 0.6 * 0, 0.5, 4, 0.45, 0, IN); if (st) put(X, 0.38 + st * 0.15, zS, ow - 1.4, st * 0.3, 0.46, 4, 0.4, 0, IN);
                      for (let i = 0, n = floor((ow - 1.6) / 0.34); i < n; i++) { const bx = x0 + 0.95 + i * 0.34, bc = BR[floor(ph(bq * 31 + st * 97 + i, 386) * 5.99)], hgt = 0.42 + 0.12 * ph(bq + i, 387 + st);
                        openS(bx, yS + 0.12, zS, 0.15, hgt * 0.8, ph(bq * 31 + st * 97 + i, 386)); } }
                    for (let i = 0, n = floor((ow - 1.6) / 1.6); i < n; i++) { const sx = x0 + 1.4 + i * 1.6, q0 = Wd(sx, 2.25), hr = ph(bq * 7 + i, 383);
                      // (a big white sack standing open, its neck rolled down to a fat rim, the rice heaped up inside it)
                      openS(sx, 0.38, 2.25, 0.26, 0.74, hr);
                      put(sx + 0.14, 1.1, 2.0, 0.012, 0.4, 0.012, 4, 0.4, 0, IN); put(sx + 0.14, 1.34, 2.0, 0.26, 0.18, 0.01, 50, 0.9999, 0, IN); put(sx - 0.1, 0.82, 2.37, 0.08, 0.06, 0.16, 19, 0, 0, IN); }      // (scoop, price card)
                    put(X + ow / 2 - 1.6, 0.5, 0.5, 0.6, 0.12, 0.5, 2, 0.3, 0, IN); put(X + ow / 2 - 1.6, 0.85, 0.28, 0.08, 0.6, 0.06, 3, 0, 0, IN); put(X + ow / 2 - 1.6, 1.22, 0.28, 0.3, 0.3, 0.12, 19, 0, 0, IN);      // the scale
                    put(X - ow / 2 + 1.4, 0.86, 0.2, 1.6, 0.95, 0.6, 4, 0.45, 0, IN); put(X - ow / 2 + 1.2, 1.4, 0.2, 0.4, 0.14, 0.3, 3, 0, 0, IN);      // the counter
                    for (let L = 0; L < 6; L++) for (let j = 0; j < 3; j++) put(X + ow / 2 - 0.6 - j * 0.42, 0.48 + L * 0.13, -0.6, 0.38, 0.12, 0.26, 50, [0.7137, 0.0313, 0.3555][(j + L) % 3], 0, IN);      // five-kilo bags
                  }
                }
                if (!sackShop) for (let i = 0; i < 10; i++) { const gx = x0 + 1 + (i % 5) * (ow - 2) / 4 + (ph(bq + i, 370) - 0.5) * 0.6, gz = i < 5 ? -0.6 : -2.9, n = 2 + floor(ph(bq + i, 371) * 4), cm = kW === 8 ? 0.5494 : kW === 40 ? 0.7137 : kW === 44 ? 0.9022 : 0.3973;
                  for (let j = 0; j < n; j++) put(gx + (j % 2) * 0.04, 0.38 + 0.13 + j * 0.25, gz, 1.0, 0.24, 0.6, kW === 28 ? 57 : 50, kW === 28 ? ph(bq + i, 372 + j) : cm, 0, IN); }      // (sacks - cement, rice, fertiliser, feed - laid in piles; boxes, for the wholesaler)
                if (kW === 8) for (let i = 0; i < 8; i++) cyl(x0 + 2, 0.45 + i * 0.07, -4.3 + (i % 3) * 0.08, 0.04, x0 + 2 + 5.5, 0.45 + i * 0.07, -4.3 + (i % 3) * 0.08, 0.04, 4);      // (lengths of pipe)
              } else {                  // to let: shutters down across it, the board says so
                put(X, 1.79, 2.96, ow, 2.82, 0.06, 32, s2); }
              put(X, 3.75, 3.1, Wb - 1, 1.0, 0.16, 23, sw(s2), 0, hB); put(X, 3.2, 4.0, Wb, 0.12, 2.0, 2);
              // (upstairs, where there is one: five windows, each in its frame with a bar across the middle, a sill under it)
              if (Hb > 5) for (let i = 0; i < 5; i++) { const wx = X - Wb / 2 + (i + 0.5) * Wb / 5, ww = Wb / 5 - 1.2; put(wx, 6.2, 3.0, ww + 0.16, 1.66, 0.08, 19); put(wx, 6.2, 3.06, ww, 1.5, 0.04, 17, ph(bq, 400 + i)); put(wx, 6.2, 3.09, 0.05, 1.5, 0.03, 19); put(wx, 6.55, 3.09, ww, 0.04, 0.03, 19); put(wx, 5.38, 3.14, ww + 0.3, 0.07, 0.22, 2); put(wx, 7.1, 3.2, Wb / 5 - 0.9, 0.07, 0.45, 2); }
              put(X + Wb / 2 - 3, Hb + 0.75, -3, 2.4, 0.9, 1.2, 22); put(X - Wb / 2 + 3, Hb + 0.75, -2, 2.4, 0.9, 1.2, 22);
              shopW = sw(s1); shopH = hB; { const q = Wd(X, 3); bigShops.push(q[0], q[1], yaw, sort); } }
            { const q = Wd(X - Wb / 2 - 1.5, 5.4); far.push(q[0], y, q[1], 0.11, q[0], y + 6.2, q[1], 0.09, -1, 0); } put(X - Wb / 2 - 1.5, 6.0, 5.4, 1.9, 2.3, 0.28, 23, conv ? 2 : shopW, 0, conv ? 0 : shopH);
            if (!conv) tree(X + Wt / 2 + 2.5, 3, 0.6, s2); { const q = Wd(X - Wb / 2 - 2.4, 1.2); if (soiD(q[0], q[1]) > 3.9) stamp(SHRINE_B, q[0], y + 0.3, q[1], yaw, 0, 0); }      // the shop's spirit houses at the corner of its forecourt
          } else if (kind === 3) {     // the market: tin roofs on posts, tables of goods under them, stalls with umbrellas out at the kerb
            // The goods, on a table at height y0, in a place w by d: what the seed says, of twelve kinds. Fruit - oranges, mangoes, limes, rose
            // apples, mangosteens, watermelons, young coconuts: a plastic crate (the box shader's 54) heaped with them, each a ball of its own
            // (ball, below: vsFruit/fsFruit), a mound of them packed as round things pack, lying just over the heap's painted steps (55) - which
            // are what is seen from far off, where the balls are not drawn. Greens in bundles and fish on ice (54, painted). Sacks of dry goods,
            // their mouths rolled open - chillies, rice, beans, turmeric. Eggs, on a stack of their trays. And cloth: lengths of it hung from a
            // rail over the table, more folded flat beneath (56).
            const ball = (lx, ly, lz, r, ty, hq) => { const q = Wd(lx, lz); if (q[0] >= ox && q[0] < ox + CH && q[1] >= oz && q[1] < oz + CH) fruit.push(q[0], y + ly, q[1], r, ty, hq, 0, 0); };
            // (what a table sells is drawn from its roof's line - zone: 0 fresh food (fruit, greens, fish, eggs), 1 cooked food and dry goods (pots
            // of curry, sacks, garlands, a little fruit), 2 household things and clothes (plastic basins, cloth, sandals), 3 the stalls at the kerb, a mix -
            // so a market is not all fruit. And more kinds: 20 pots of curry, 21 stacked plastic basins, 22 jasmine and marigold garlands, 23 sandals.)
            const ZONE = [[0, 1, 2, 3, 4, 7, 10, 5, 5, 6, 6, 9], [20, 20, 20, 8, 8, 8, 22, 22, 5, 9, 2, 23], [21, 21, 21, 11, 11, 11, 23, 23, 22, 8, 21, 11], [0, 1, 3, 4, 10, 5, 6, 20, 22, 22, 9, 2]];
            const goods = (gx, y0, gz, w, d, sdG, zone = 3) => { let K = ZONE[zone][floor(sdG * 11.99)]; const h2 = (sdG * 97.3) % 1, k = w / 0.9, bs = (t) => (t + 0.1 + 0.8 * h2) / 7.99, sI = floor(sdG * 99999);
              if (w < 0.8 && (K === 8 || K === 9 || K === 11 || K === 21 || K === 23)) K = [0, 20, 22, 5, 1][floor(h2 * 4.999)];
              const ball = (lx, ly, lz, r, ty, hq) => { const q = Wd(lx, lz); if (q[0] >= ox && q[0] < ox + CH && q[1] >= oz && q[1] < oz + CH) fruit.push(q[0], y + ly, q[1], r, ty, hq, 0, 0); };
              if (K === 20) { const n = w > 0.8 ? 2 : 1; for (let a = 0; a < n; a++) { const r = 0.17 + 0.03 * ph(a, 640 + sI); ball(gx + (n > 1 ? (a - 0.5) * 0.44 : 0), y0 + 0.75 * r + 0.005, gz + (ph(a, 641 + sI) - 0.5) * 0.15, r, 18, ph(a, 642 + sI)); }
                put(gx + w * 0.38, y0 + 0.08, gz + d * 0.3, 0.12, 0.16, 0.08, 50, 0.8064); return; }      // (and a stack of plastic bags for taking it away)
              if (K === 21) { for (let a = 0; a < 2; a++) { const hc = ph(a, 650 + sI); for (let j = 0, n = 3 + floor(ph(a, 651 + sI) * 3); j < n; j++) ball(gx + (a - 0.5) * 0.45, y0 + 0.06 + j * 0.055, gz, 0.2, 19, hc); } return; }
              if (K === 22) { put(gx, y0 + 0.01, gz, w * 0.9, 0.02, d * 0.85, 19); for (let a = 0; a < 3; a++) for (let b2 = 0; b2 < 2; b2++) { const cx2 = gx + (a - 1) * w * 0.28, cz2 = gz + (b2 - 0.5) * d * 0.4, hc = ph(a * 2 + b2, 660 + sI) < 0.3 ? 0.1 : 0.5;
                  for (let k2 = 0; k2 < 14; k2++) { const an = k2 / 14 * TAU; ball(cx2 + Math.cos(an) * 0.06, y0 + 0.035, cz2 + Math.sin(an) * 0.06, 0.014, 20, hc); } ball(cx2 + 0.06, y0 + 0.04, cz2, 0.02, 20, 0.95); } return; }
              if (K === 23) { const SC = [0.1024, 0.6345, 0.0313, 0.3973, 0.8064, 0.2300]; for (let a = 0; a < 4; a++) for (let b2 = 0; b2 < 2; b2++) { const sc = SC[floor(ph(a * 2 + b2, 670 + sI) * 5.999)]; for (const e of [-0.045, 0.045]) put(gx + (a - 1.5) * w * 0.22 + e, y0 + 0.014, gz + (b2 - 0.5) * d * 0.5, 0.075, 0.025, 0.24, 50, sc); } return; }
              if (K <= 4 || K === 7 || K === 10) { const ty = K === 10 ? 2 : K, r = [0.044, 0.052, 0.031, 0.034, 0.038, 0, 0, 0.1, 0, 0, 0.085][K], st = r * 1.92, nx = floor((w - 2 * r) / st), nz = floor((d - 2 * r) / (st * 0.866));
                put(gx, y0 + 0.1, gz, w, 0.2, d, 54, bs(ty));
                if (K === 7 || K === 10) put(gx, y0 + 0.26, gz, w * 0.7, 0.12, d * 0.68, 55, bs(ty));
                else { put(gx, y0 + 0.225, gz, w * 0.86, 0.05, d * 0.84, 55, bs(ty)); put(gx + 0.02 * k, y0 + 0.275, gz, w * 0.66, 0.05, d * 0.64, 55, bs(ty)); put(gx + 0.04 * k, y0 + 0.32, gz, w * 0.42, 0.045, d * 0.4, 55, bs(ty)); }
                if (ph(sI, 603) < 0.75) { const q = Wd(gx + w * 0.32, gz - d * 0.3); far.push(q[0], y + y0 + 0.2, q[1], 0.004, q[0], y + y0 + 0.5, q[1], 0.004, -1, 0); put(gx + w * 0.32, y0 + 0.56, gz - d * 0.3, 0.17, 0.12, 0.01, 19); }      // (a price card on a stick)
                for (let b = 0; b <= nz; b++) for (let a = 0; a <= nx - (b & 1); a++) { const lx = (a - nx / 2 + (b & 1) * 0.5) * st, lz = (b - nz / 2) * st * 0.866, m = max(abs(lx) / (w / 2), abs(lz) / (d / 2)), hq = ph(a * 37 + b, 600 + sI);
                  ball(gx + lx + (hq - 0.5) * r * 0.3, y0 + 0.2 + 0.165 * (1 - Math.pow(m, 1.5)) + r * (0.25 + 0.5 * hq), gz + lz + (ph(a * 37 + b, 601 + sI) - 0.5) * r * 0.3, r * (0.9 + 0.2 * ph(a * 37 + b, 602 + sI)), K, hq); } }
              else if (K === 5 || K === 6) { put(gx, y0 + 0.1, gz, w, 0.2, d, 54, bs(K)); if (K === 5) put(gx, y0 + 0.235, gz, w * 0.9, 0.07, d * 0.88, 55, bs(5)); }
              else if (K === 8) { for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) { const hq = ph(a * 2 + b, 610 + sI); ball(gx + (a - 1) * 0.3, y0 + 0.125 + 0.03 * hq, gz + (b - 0.5) * 0.38, 0.15 + 0.02 * hq, 8, hq); } }
              else if (K === 9) { const hT = 0.08 + 0.12 * h2; put(gx, y0 + hT / 2, gz, w * 0.92, hT, d * 0.9, 18, 0.5);
                for (let a = 0; a < 14; a++) for (let b = 0; b < 12; b++) ball(gx + (a - 6.5) * 0.057, y0 + hT + 0.014, gz + (b - 5.5) * 0.057, 0.023, 9, h2 < 0.5 ? 0.2 + 0.3 * ph(a * 13 + b, 620 + sI) : 0.6 + 0.4 * ph(a * 13 + b, 620 + sI)); }
              else { for (const e of [-1, 1]) put(gx + e * 0.42, y0 + 0.68, gz, 0.035, 1.36, 0.035, 4); put(gx, y0 + 1.36, gz, 0.9, 0.03, 0.03, 4);
                for (let a = 0; a < 3; a++) { const hc = ph(a, 630 + sI), L = 0.75 + 0.3 * ph(a, 631 + sI); put(gx + (a - 1) * 0.28, y0 + 1.35 - L / 2, gz + (a - 1) * 0.012, 0.25, L, 0.025, 56, hc); }
                for (let a = 0; a < 3; a++) put(gx + (a - 1) * 0.29, y0 + 0.03 + 0.02 * (a % 2), gz + 0.1, 0.26, 0.06 + 0.04 * (a % 2), 0.42, 56, ph(a, 635 + sI)); } };
            for (const bx of [-10.5, 0, 10.5]) {
              put(X + bx, 3.5, -0.5, 9.4, 0.08, 9.5, 1, ph(bq, 410 + bx), bx ? 0.1 : -0.1);
              for (const px of [-4.3, 4.3]) for (const pz of [-4.8, 3.8]) put(X + bx + px, 1.7, pz, 0.12, 3.4, 0.12, 4);
              // Each row of tables as a market's are: a top on steel legs, a plastic sheet laid over it and hanging down in front and behind, in
              // the seller's colour; under it, in the shade, the stock - cardboard boxes and plastic baskets; on one table of the roof the scales.
              // (each table set on the ground where it stands - the lot's own level is 0.3 m or so under it, and it varies)
              const gAt = (lx, lz) => { const q = Wd(lx, lz); return ground(q[0], q[1]) + 0.005 - y; };
              const TC = [0.6369, 0.3284, 0.1939, 0.7117, 0.5786];      // (the sheets' colours, worn: blue, green, dark red, white gone grey, grey-blue)
              for (let i = 0; i < 3; i++) { const tz = -3.4 + i * 3, tc = TC[floor(ph(bq * 7 + i, 412 + bx) * 4.999)], g0 = gAt(X + bx, tz), T0 = g0 + 0.7;      // (T0: the table's top, 70 cm up)
                put(X + bx, T0 - 0.035, tz, 6.6, 0.07, 1.1, 0, 0.7); for (const lx of [-3.1, 3.1]) for (const lz of [-0.46, 0.46]) { const gl = gAt(X + bx + lx, tz + lz); put(X + bx + lx, (gl + T0 - 0.07) / 2, tz + lz, 0.05, T0 - 0.07 - gl, 0.05, 19); }
                put(X + bx, T0 + 0.007, tz, 6.72, 0.014, 1.2, 50, tc); for (const e of [-1, 1]) put(X + bx, T0 - 0.13, tz + e * 0.6, 6.72, 0.26, 0.012, 50, tc);
                for (let j = 0; j < 4; j++) { const ux = X + bx - 2.4 + j * 1.6 + (ph(bq + j, 413 + i) - 0.5) * 0.4; if (ph(bq + j, 414 + i) < 0.55) put(ux, g0 + 0.17, tz, 0.5, 0.34, 0.4, 57, ph(bq + j, 415 + i)); else put(ux, g0 + 0.14, tz, 0.48, 0.28, 0.36, 33, ph(bq + j, 416 + i)); }
                for (let j = 0; j < 5; j++) goods(X + bx - 2.6 + j * 1.3, T0 + 0.015, tz, 0.9, 0.8, ph(bq * 5 + j, 420 + i + bx), (floor(ph(bq, 408) * 3) + (bx < 0 ? 0 : bx > 0 ? 2 : 1)) % 3); }
              { const sx = X + bx + (ph(bq, 417 + bx) < 0.5 ? -3.05 : 3.05), sz = -3.4 + 3 * floor(ph(bq, 418 + bx) * 2.999) + 0.25, T1 = gAt(X + bx, sz) + 0.715; put(sx, T1 + 0.085, sz, 0.26, 0.17, 0.26, 50, 0.1296); put(sx, T1 + 0.085, sz + 0.131, 0.15, 0.13, 0.01, 19); put(sx, T1 + 0.18, sz, 0.32, 0.02, 0.3, 19); }      // (the scales: red, a white dial, the pan)
              // under the roof: bulbs hung on their wires over the aisles, lit; bunches of bananas hung from the roof's front edge
              for (const az of [-1.9, 1.1]) for (const ax of [-2.6, 0, 2.6]) { const q = Wd(X + bx + ax, az); far.push(q[0], y + 3.46, q[1], 0.006, q[0], y + 2.92, q[1], 0.006, -1, 3); if (inside(q[0], q[1])) fruit.push(q[0], y + 2.86, q[1], 0.06, 12, ph(bq + ax * 3, 419), 0, 0); }
              for (const ex of [-3.4, 3.4]) if (ph(bq + ex, 409 + bx) < 0.6) { const q0 = Wd(X + bx + ex, 3.7); far.push(q0[0], y + 3.46, q0[1], 0.012, q0[0], y + 2.45, q0[1], 0.01, -1, 0);
                for (let k = 0; k < 14; k++) { const a = k * 2.4, hy = 2.25 + (k % 5) * 0.08, r0 = 0.07 + 0.02 * (k % 3), q = Wd(X + bx + ex + Math.cos(a) * r0, 3.7 + Math.sin(a) * r0); if (inside(q[0], q[1])) fruit.push(q[0], y + hy, q[1], 0.055, 13, (a % TAU) / TAU, 0, 0); } }
            }
            for (const bx of [-5.25, 5.25]) put(X + bx, 3.05, 3.6, 3.6, 0.04, 3.2, 33, 0.48, 0.22);                         // blue tarpaulins strung between the roofs
            // The floor of the market: a concrete slab, darker and wet where it has been washed down, a drain along its front;
            // and at each roof's front, a roll of plastic bags and a bunch of them hung on a hook.
            { const gF = (ground(cx, cz) - y) + 0.012; put(X, gF, -0.4, 31.5, 0.02, 10.4, 19); const dz = 4.55; put(X, gF + 0.001, dz, 31.5, 0.02, 0.28, 3); for (let k = -15; k <= 15; k++) put(X + k, gF + 0.012, dz, 0.04, 0.008, 0.3, 19); }
            // (no name board: a market is known by its stalls, its umbrellas and its crowd - a sign saying so was one thing too many)
            for (const bx of [-10.5, 0, 10.5]) { const ex = X + bx + (ph(bq, 405 + bx) < 0.5 ? -4.1 : 4.1); put(ex, 2.6, 3.7, 0.02, 0.5, 0.02, 4); for (let k = 0; k < 5; k++) put(ex + (k - 2) * 0.05, 2.25 - (k % 2) * 0.05, 3.72, 0.07, 0.3, 0.012, 50, [0.8064, 0.6345, 0.8064, 0.3973, 0.8064][k]); }
            for (let i = 0; i < 6; i++) { const bx = X - 12 + i * 4.6 + ph(bq, 470 + i) * 2, n = 1 + floor(ph(bq, 480 + i) * 3); for (let j = 0; j < n; j++) put(bx + (ph(bq, 492 + i + j) - 0.5) * 0.06, 0.5 + j * 0.34, 3.5, 0.56, 0.32, 0.42, 57, ph(bq, 490 + i + j * 7)); }      // stacks of cardboard boxes
            // (a round woven tray - กระด้ง - of what is sold by the handful: dried chillies, garlic, shallots, fresh chillies; each a small thing of its own)
            const tray = (gx, y0, gz, kd) => { const q0 = Wd(gx, gz); if (inside(q0[0], q0[1])) fruit.push(q0[0], y + y0 + 0.03, q0[1], 0.27, 17, kd, 0, 0); const ty = [14, 15, 16, 16][floor(kd * 3.999)], r = ty === 16 ? 0.016 : ty === 14 ? 0.022 : 0.02, st = r * 1.9;
              for (let a = -7; a <= 7; a++) for (let b2 = -7; b2 <= 7; b2++) { const lx = a * st + (b2 & 1) * st * 0.5, lz = b2 * st * 0.87, rr = Math.hypot(lx, lz); if (rr > 0.21) continue; const hq = ph(a * 31 + b2 + 400, floor(kd * 9999)), q = Wd(gx + lx, gz + lz); if (inside(q[0], q[1])) fruit.push(q[0], y + y0 + 0.05 + (0.035 - rr * 0.12) + r * 0.6, q[1], r * (0.85 + 0.3 * hq), ty, hq, 0, 0); } };
            for (let i = 0; i < 5; i++) { const bx = X - 13 + i * 6.5 + ph(bq, 430 + i) * 2, qk = Wd(bx, 5.3), gk = ground(qk[0], qk[1]) + 0.005 - y, TK = gk + 0.85; put(bx, (gk + 0.12 + TK) / 2, 5.3, 1.5, TK - gk - 0.12, 0.8, 0, 0.3); put(bx, gk + 0.06, 5.3, 1.38, 0.12, 0.68, 3); put(bx, gk + 0.004, 5.3, 1.62, 0.008, 0.92, 3); if (ph(bq, 497 + i) < 0.4) { for (let j = 0; j < 3; j++) tray(bx - 0.5 + j * 0.5, TK, 5.3 + (j % 2 ? 0.1 : -0.1), ph(bq * 3 + j, 498 + i)); } else for (let j = 0; j < 3; j++) goods(bx - 0.48 + j * 0.48, TK, 5.3, 0.44, 0.64, ph(bq * 3 + j, 495 + i)); put(bx, gk + 1.1, 5.76, 0.05, 2.2, 0.05, 19); put(bx, gk + 2.2, 5.3, 3.0, 0.06, 3.0, 29, ph(bq, 440 + i)); }      // (the counter on the ground, on a dark plinth set back under it, and a dark rim on the ground round its foot - the sun's shadow
            // starts a hand's breadth off anything standing, and a solid box flat on the ground looked to hover; its umbrella's pole close behind it -
            // it had stood up through the goods)
            // The people of the market: shoppers in the aisles between the tables and at the stalls by the kerb, standing as people do - facing
            // the goods, or one another in twos (addP, above; h: the figure's own numbers).
            { const person = (lx, lz, face, h) => { const q = Wd(lx, lz); addP(q[0], q[1], yaw + face, h(1), h(2)); };
              let np = 0; const hh = (i) => (j) => ph(bq * 131 + i * 17 + j, 700 + side);
              for (const bx of [-10.5, 0, 10.5]) for (const az of [-1.9, 1.1]) for (let i = 0; i < 4; i++) { const h = hh(np++), lx = X + bx - 3 + i * 2 + (h(11) - 0.5) * 1.2; if (h(12) < 0.5) continue;
                const tb = h(14) < 0.42 ? 0.55 : h(14) < 0.84 ? -0.55 : 0;      // (those looking at the goods stand up to the table, leaving the middle of the aisle to those walking)
                person(lx, az + tb + (h(13) - 0.5) * 0.2, h(14) < 0.42 ? 0 : h(14) < 0.84 ? PI : (h(15) < 0.5 ? 1 : -1) * PI / 2, h);
                if (h(16) < 0.35) person(lx + 0.5, az + tb + (h(13) - 0.5) * 0.2, (h(14) < 0.42 ? 0 : PI) + (h(17) - 0.5) * 0.8, hh(np++)); }      // a companion beside
              for (let i = 0; i < 5; i++) { const bx = X - 13 + i * 6.5 + ph(bq, 430 + i) * 2; for (let j = 0, n = 1 + floor(ph(bq, 520 + i) * 2.99); j < n; j++) { const h = hh(np++); person(bx - 0.7 + j * 0.7 + (h(11) - 0.5) * 0.3, 4.55 + (h(13) - 0.5) * 0.12, (h(15) - 0.5) * 0.7, h); } }      // at the stalls by the kerb, facing them
              // And those walking round it, as people go round a market: each on a ring of its own through the aisles - round one table, round
              // a roof's tables and out past the crates in front, or the long way round two or all three roofs - stopping at a table now and then.
              const ring = (lx, lz, la, lb, n) => { for (let i = 0; i < n; i++) { const h = hh(np++); if (h(21) < 0.2) continue; const q = Wd(lx, lz); addP(q[0], q[1], yaw, h(1), h(2), 0.7 + 0.5 * h(22), la, lb); } };
              for (const bx of [-10.5, 0, 10.5]) { ring(X + bx, -0.4, 4.85, 1.5, 2); ring(X + bx, 1.05, 4.85, 2.95, 2); }
              ring(X, -0.4, 15.4, 1.5, 3); ring(X - 5.25, 1.05, 10.1, 2.95, 2); ring(X + 5.25, 1.05, 10.1, 2.95, 2); ring(X, 1.05, 15.4, 2.95, 2);
              // And in and out of it: rings that run along the footpath before it (sb - 0.4 out from the lot's middle line is the footpath's
              // middle), in through a gap between the kerb's stalls, along before the tables and out by another gap; and some straight in from
              // the footpath, down the way between two roofs to the aisles, and back.
              // (the ways in: one in each of the two ways between the roofs, wherever in it is clearest of this market's own kerb stalls and crates)
              { const fp = sb - 0.4, lane = (x0, x1) => { let bx2 = (x0 + x1) / 2, bc = -1; for (let x = x0; x <= x1 + 1e-6; x += 0.1) { let cl = 9; for (let i = 0; i < 5; i++) cl = min(cl, abs(x - (-13 + i * 6.5 + ph(bq, 430 + i) * 2)) - 0.75); for (let i = 0; i < 6; i++) cl = min(cl, abs(x - (-12 + i * 4.6 + ph(bq, 470 + i) * 2)) - 0.3); if (cl > bc) { bc = cl; bx2 = x; } } return bx2; };
                const xa = lane(4.1, 6.5), xb = lane(-6.5, -4.1);
                ring(X + (xa + xb) / 2, (fp + 1.1) / 2, (xa - xb) / 2, (fp - 1.1) / 2, 4);
                for (const xl of [xa, xb]) for (let i = 0; i < 2; i++) { const h = hh(np++); if (h(21) < 0.3) continue; const q = Wd(X + xl + (h(23) - 0.5) * 0.3, fp); addP(q[0], q[1], yaw + PI, h(1), h(2), 0.75 + 0.4 * h(22), fp + 1.9); } }
              // And those who sell, sitting: on a plastic stool at one end of a row of tables, and behind a stall at the kerb.
              { const seat = (lx, lz, face, h) => { const sc = h(31), qg = Wd(lx, lz), g0 = ground(qg[0], qg[1]) + 0.015 - y;      // (the stool stands on the ground where the seller sits, not on the lot's own level: the market's floor is 0.3 m above it)
                put(lx, g0 + 0.425, lz, 0.31, 0.035, 0.31, 33, sc); for (const ex2 of [-0.12, 0.12]) for (const ez2 of [-0.12, 0.12]) put(lx + ex2, g0 + 0.205, lz + ez2, 0.035, 0.41, 0.035, 33, sc);      // (a plastic stool: its seat and four legs)
                const q = Wd(lx, lz); addP(q[0], q[1], yaw + face, h(1), h(2), -1); };
                for (const bx of [-10.5, 0, 10.5]) for (let i = 0; i < 3; i++) { const h = hh(np++); if (h(32) < 0.35) continue; const e = h(33) < 0.5 ? -1 : 1; seat(X + bx + e * 3.55, -3.4 + i * 3 + (h(34) - 0.5) * 0.3, -e * PI / 2 + (h(35) - 0.5) * 0.5, h); }
                for (let i = 0; i < 5; i++) { const h = hh(np++); if (h(32) < 0.3) continue; seat(X - 13 + i * 6.5 + ph(bq, 430 + i) * 2 + (h(34) - 0.5) * 0.6, 6.05, PI + (h(35) - 0.5) * 0.5, h); } }
            }
          } else if (kind === 4) {     // the temple: a white wall and roofed gate, the hall with its stepped roofs and gilded finials, a white chedi
            put(X - 9.5, 0.75, 5.5, 13, 1.3, 0.3, 41); put(X + 9.5, 0.75, 5.5, 13, 1.3, 0.3, 41);
            for (const gx of [-2.6, 2.6]) put(X + gx, 1.6, 5.5, 0.7, 3.0, 0.7, 41); put(X, 3.9, 5.5, 6.6, 1.9, 2.4, 9, 0.05, 0, 1); put(X, 5.2, 5.5, 0.1, 0.8, 0.1, 15);
            // (the hall: built as the country temples' are - watHall above)
            { const q = Wd(X - 5.5, -2); watFeet.push(q[0], q[1], yaw); }      // (where the hall stands, whoever builds it: no house of the lanes behind is built into it - see watNear)
            if (own) { const q = Wd(X - 5.5, -2); watSpot = [q[0], q[1]]; watRound = true; watHall(frame(q[0], y, q[1], yaw)); }      // (no great image out in the court of a town temple: it stood out over the lane beside it)
            { const q = Wd(X + 9, -2); far.push(q[0], y, q[1], 3.2, q[0], y + 1.4, q[1], 3.0, -1, 6, q[0], y + 1.4, q[1], 2.2, q[0], y + 2.5, q[1], 2.55, -1, 6, q[0], y + 2.5, q[1], 2.55, q[0], y + 3.6, q[1], 2.0, -1, 6, q[0], y + 3.6, q[1], 2.0, q[0], y + 4.6, q[1], 0.9, -1, 6, q[0], y + 4.6, q[1], 0.9, q[0], y + 5.6, q[1], 0.5, -1, 6, q[0], y + 5.6, q[1], 0.42, q[0], y + 10.5, q[1], 0.04, -1, 7); }
            tree(X + 3, 0, 0.9, s1); tree(X + 14, 3, 0.8, s2); tree(X - 15, 3.5, 0.7, ph(bq, 450));
          } else {                     // the filling station: a flat canopy on four columns over the pumps, the kiosk behind, a price board by the road
            put(X, 5.4, 1.5, 17, 0.6, 9, 18, s1); put(X, 5.4, 6.02, 17, 0.6, 0.06, 23, s2);
            for (const px of [-5.5, 5.5]) for (const pz of [-1.2, 4.2]) put(X + px, 2.7, pz, 0.4, 5.1, 0.4, 2);
            for (const px of [-5.5, 0, 5.5]) { put(X + px, 0.42, 1.5, 1.3, 0.24, 3.6, 2); put(X + px, 1.2, 0.7, 0.6, 1.4, 0.5, 18, s2); put(X + px, 1.2, 2.3, 0.6, 1.4, 0.5, 18, s2); put(X + px, 1.6, 0.7, 0.42, 0.3, 0.52, 3); put(X + px, 1.6, 2.3, 0.42, 0.3, 0.52, 3); }
            put(X, 2.0, -4.2, 13, 3.6, 4.5, 18, s2); put(X, 1.6, -1.93, 10, 2.3, 0.08, 17, s1); put(X, 3.35, -1.9, 12, 0.7, 0.14, 23, s1);
            { const q = Wd(X - 12.5, 5.4); far.push(q[0], y, q[1], 0.13, q[0], y + 5, q[1], 0.11, -1, 0); } put(X - 12.5, 5.2, 5.4, 2.0, 3.0, 0.3, 23, s2); { const q = Wd(X + 13, 4.4); stamp(SHRINE_B, q[0], y + 0.3, q[1], yaw, 0, 0); }
          }
          continue;
        }
        if (um >= len) {               // the row stops short: the gap is a yard with a tree, or a food cart under an umbrella
          if (um === len || um === 8) { if (ph(bq, 460) < 0.6) tree(1, 1, 0.7 + ph(bq, 461) * 0.4, ph(bq, 462)); else { put(0, 0.85, 4.6, 1.6, 0.9, 0.8, 0, 0.3); put(0, 1.5, 4.6, 0.05, 1.6, 0.05, 19); put(0, 2.3, 4.6, 2.1, 0.06, 2.1, 29, ph(bq, 463)); } }
          continue;
        }
        if (tch > 0.25 && (um === 1 || um === 5) && ph(k, side + 470) < 0.55) tree(0, fwd - 7.1 - svW(z), 0.5 + ph(k, side + 471) * 0.2, ph(k, side + 472));      // trees along the footpath
        // The unit. The shop is a real room open to the street, 4 m deep under the floors above: you look into it past its goods.
        // What is sold is drawn by lot: shut behind a roller shutter, a grocery, an eating place, a gold shop, a glass-fronted shop, a motorcycle workshop.
        // Older two-storey rows in the old towns are timber (ห้องแถวไม้): weatherboard above, folding doors below, a tin roof.
        // On a straight road running along z a unit's place is 4 m wide. Where the road slants or bends it is wider (and wider still at the back, on the
        // outside of a bend), so the unit is made as wide as its place really is: Wf across the front, Ww for the body, measured to its neighbours.
        // Alternate units are a hair shallower and taller, so that where two of a height meet no two faces lie in one plane.
        const nbr = (kk) => { const zz = (kk + 0.5) * UW, aa = atan2(roadX(zz + 1) - roadX(zz - 1), 2), rx = roadX(zz), qx = cos(aa) * side, qz = -sin(aa) * side; return [rx + qx * (sb + DEP / 2), zz + qz * (sb + DEP / 2), rx + qx * sb, zz + qz * sb, aa]; };
        const nA = nbr(k), nB = nbr(k + 1), nC = nbr(k - 1), par = k & 1;
        const Ww = max(hypot(nB[0] - nA[0], nB[1] - nA[1]), hypot(nC[0] - nA[0], nC[1] - nA[1])) + DEP / 2 * max(abs(nB[4] - nA[4]), abs(nC[4] - nA[4])) + 0.01, Wf = max(hypot(nB[2] - nA[2], nB[3] - nA[3]), hypot(nC[2] - nA[2], nC[3] - nA[3]));
        const GF = 3.05, SD = 4.2, zb = F - SD + 0.06, wood = old && tch < 0.55 && ph(blk, side + 17 + seg) < 0.6, last = um === 7 || um === len - 1, endU = side > 0 ? last : um === 0;      // endU: this unit's +lx side is the open end of the row
        const wc = wood || u(141) < 0.38 ? sd : bs + (sd - 0.5) * 0.012;      // (the row's colour, nudged so that each unit still lights its own windows and wears its own stains)      // the wall's colour: the row's, or (four units in ten, and all timber ones) this unit's own
        const sk0 = u(60) < 0.22 ? 0 : 1 + floor(u(61) * 4.999), sk = sk0 === 3 && u(140) > 0.2 ? 1 : sk0, wm = wood ? 16 : 18;
        const cyl = (lx, ly, lz, r, lx1, ly1, lz1, r1, m) => { const p0 = Wd(lx, lz), p1 = Wd(lx1, lz1); far.push(p0[0], y + ly, p0[1], r, p1[0], y + ly1, p1[1], r1, -1, m); };
        // (parked two-wheelers: mostly motorcycles, now and then a bicycle - see mbike and bicycle above)
        const Wtw = (lx, lz) => [cx + lx * c + lz * sn, cz - lx * sn + lz * c], bike = (lx, lz, s2) => { const qb = Wtw(lx, lz), yb = walkY(qb[0], qb[1]) - 0.01; if ((s2 * 31.7) % 1 < 0.22) bicycle(Wtw, yaw, yb, lx, lz, s2); else mbike(Wtw, yaw, yb, lx, lz, s2); };      // (on the raised footpath where they stand on it: walkY)
        // a pickup truck drawn up before a shut shop where the row stands back from the footpath: white, silver or black
        // The pickup: two kinds. A Suzuki Carry, the model "Carry Pickup | Suzuki | Game ready" by by__Rx (sketchfab.com/by__Rx, CC BY 4.0), its
        // colours taken from its textures onto its 23 000 triangles (assets/pickup.bin), white all over, its wheels black, its windows dark, headlamps clear and tail lamps red; or, one in three, a
        // Ford Ranger, the model "Ford Ranger Next-Gen 2023 Sport" by Asadawut.Kaewma (sketchfab.com/Asadawut.Kaewma, CC BY 4.0), cut down
        // from 790 000 triangles to some 29 000 (assets/ranger.bin; beyond 75 m a copy of 16 000), its maker's badges left off. Painted white most often, else silver, black,
        // dark blue, red or sky blue; nose toward +x along the kerb. Solid: the car stops at it.
        const truck = (lx, lz, s2) => { const k = [3, 3, 3, 3, 3, 3, 5, 5, 2, 4, 0, 1][floor(s2 * 12) % 12], q = Wtw(lx, lz), yt = ground(q[0], q[1]) + FOOT_H, big = (s2 * 7.31) % 1 < 0.34, M = twoW(Wtw, yaw + PI / 2, yt, lx, lz, 0).M;
          // (the shops' units are narrower than a Ranger is long: one is parked only where the last stands clear of it, its length and a metre's gap)
          const len = big ? 5.3 : 3.4; for (let i = 0; i < trkAt.length; i += 3) if (hypot(q[0] - trkAt[i], q[1] - trkAt[i + 1]) < (len + trkAt[i + 2]) / 2 + 1) return; trkAt.push(q[0], q[1], len);
          // (made only once the whole chunk is built, and only if nothing stands where it would: see trkPend)
          trkPend.push([q[0], q[1], yaw + PI / 2, big ? 1.05 : 0.9, len / 2, yt, () => {
          if (big) { const mt = (cl) => cl === 0 ? 40 + k : cl === 12 ? 50 + k : SCMAT[cl]; M(assetMesh('ranger'), mt); M(assetMesh('rangerLo'), mt, 0, 2); xcol.push(q[0], q[1], yaw + PI / 2, 0.95, 2.65, yt, yt + 1.85); }
          else { M(assetMesh('pickup'), (cd) => cd >= 32768 ? cd + 32768 * 3 : cd, 0, 0);      // (a Carry is always white: wheels black, windows dark, headlamps clear, tail lamps red)
            xcol.push(q[0], q[1], yaw + PI / 2, 0.85, 1.7, yt, yt + 1.6); } }]); };
        const table = (lx, lz, s2) => { put(lx, 1.04, lz, 0.75, 0.05, 0.75, 34); put(lx, 0.68, lz, 0.06, 0.7, 0.06, 34); for (const d of [-0.62, 0.62]) put(lx + d, 0.53, lz, 0.3, 0.46, 0.3, 33, s2); };
        put(0, (Hh + GF) / 2 + par * 0.01, par * 0.015, Ww, Hh - GF + par * 0.02, DEP - par * 0.03, wood ? 16 : 6, wc, 0, HRS(sk || -1, u(160), u(161)));      // (its underside the shop's ceiling, lit while the shop is open)                            // the floors over the shop
        put(0, GF / 2, -SD / 2 + par * 0.015, Ww, GF, DEP - SD - par * 0.03, wm, wc);                                    // behind the shop: store room, kitchen, stair
        put(-Wf / 2, GF / 2 + 0.01, F - SD / 2, 0.16, GF + 0.02, SD, wood ? 0 : 18, bs); if (endU) put(Wf / 2, GF / 2 + 0.01, F - SD / 2, 0.16, GF + 0.02, SD, wood ? 0 : 18, bs);      // party walls
        put(0, 0.3, F - SD / 2 + 0.2, Wf, 0.12, SD + 0.4, 2);                                        // the shop floor, a step above the footpath
        if (sk === 0 || u(64) < 0.12) put(0, sk === 0 ? 1.7 : 2.62, F - 0.14, Wf - 0.3, sk === 0 ? 2.7 : 0.86, 0.06, wood ? 35 : 32, u(63));      // the shutter: down, or left half way
        else if (wood) for (const d of [-1, 1]) put(d * (Wf / 2 - 0.36), 1.7, F - 0.16, 0.5, 2.7, 0.14, 35, u(63));                              // folding doors pushed back to the sides
        // (what the shop's boards say is what the shop is - render.js SIGNS by number: a shut one is to let, or was anything; sgn: that word, in
        // the colours of the seed given - the box shader's 23 reads a seed of 100 and over as 100 + the word + the colour's seed)
        // (and its hours - HRS: a shut one is dark at night, sign and all; the others pull a shutter down - or close the folding doors - at their hour, and put out their lights)
        const hU = HRS(sk || -1, u(160), u(161)), SHUT = hU + 128000; if (sk) put(0, 1.7, F + 0.04, wood ? Wf - 0.1 : Wf - 0.3, 2.7, 0.06, wood ? 35 : 32, u(63), 0, SHUT);
        const SW = [u(141) < 0.4 ? [27, 26] : [11, 0, 5, 24, 25, 32, 33, 34, 41, 8], [11, 28, 29, 40, 45, 44, 11, 11], [0, 1, 2, 9, 22, 23, 30, 31, 21], [4], [3, 13, 14, 12, 20, 35, 19, 7, 6, 24, 25], [5, 16, 38]][sk], sWord = SW[floor(u(4) * SW.length * 0.999)], sgn = (hc) => 100 + sWord + 0.01 + 0.98 * hc;
        if (sk === 1) {                // grocery (โชห่วย): shelves on three walls, a drinks fridge, cardboard boxes of stock out in front
          put(0, 1.72, zb, Wf - 0.3, 2.6, 0.08, 31, u(62), 0, hU); for (const d of [-1, 1]) put(d * (Wf / 2 - 0.36), 1.45, F - SD / 2 - 0.4, 0.5, 2.1, SD - 1.4, 31, u(65 + d), 0, hU);
          put(1.22, 1.3, F - 0.55, 0.7, 1.9, 0.66, 19); put(1.22, 1.38, F - 0.2, 0.58, 1.55, 0.03, 17, 0.9, 0, hU);
          for (let i = 0; i < 3; i++) { put(-1.45 + i * 0.6, 0.56, F + 0.5, 0.5 + 0.08 * u(70 + i), 0.4, 0.42, 57, u(70 + i)); if (u(73 + i) < 0.5) put(-1.45 + i * 0.6 + (u(76 + i) - 0.5) * 0.08, 0.93, F + 0.5, 0.46, 0.34, 0.38, 57, u(76 + i)); }
        } else if (sk === 2) {         // eating place: steel tables and plastic stools, the menu on the wall, the cook's cabinet out at the front
          put(0, 2.3, zb, 2.4, 0.8, 0.06, 23, sgn(u(62)), 0, hU); put(0, 1.0, zb, Wf - 0.3, 1.2, 0.05, 19);
          table(-0.95, F - 1.3, u(65)); table(0.95, F - 2.9, u(66)); table(-0.95, F - 2.9, u(65)); if (u(67) < 0.6) table(0.6, F + 1.5, u(66));
          put(1.15, 0.86, F - 0.3, 1.2, 0.9, 0.62, 34); put(1.15, 1.6, F - 0.3, 1.1, 0.58, 0.52, 17, 0.9, 0, hU); put(1.15, 1.92, F - 0.3, 1.16, 0.05, 0.6, 34);
        } else if (sk === 3) {         // gold shop (ร้านทอง): everything red and gold, glass counters
          put(0, 1.72, zb, Wf - 0.3, 2.6, 0.08, 14); for (const d of [-1, 1]) put(d * (Wf / 2 - 0.14), 1.72, F - SD / 2, 0.06, 2.6, SD - 0.3, 14);
          put(0, 0.8, F - 1.3, 3.0, 0.9, 0.6, 14); put(0, 1.4, F - 1.3, 3.0, 0.3, 0.6, 17, 0.9, 0, hU); put(0, 2.84, F - 0.1, Wf - 0.3, 0.42, 0.08, 14);
        } else if (sk === 4) {         // glass-fronted and air-conditioned: a clinic, a pharmacy, a minimart, a phone shop
          put(0, 1.7, F - 0.12, Wf - 0.34, 2.68, 0.05, 17, 0.5 + u(66) * 0.5, 0, hU); put(0, 0.56, F - 0.07, Wf - 0.3, 0.4, 0.09, 19); put(0, 2.45, F - 0.09, Wf - 0.3, 0.07, 0.07, 19);
          for (const mx of [-0.62, 0.62]) put(mx, 1.7, F - 0.09, 0.06, 2.68, 0.07, 19);
        } else if (sk === 5) {         // motorcycle workshop: parts on the wall, a machine up on the floor, an oil drum, tyres
          put(0, 1.72, zb, Wf - 0.3, 2.6, 0.08, 31, u(62), 0, hU); bike(-0.9, F - 1.6, u(68)); cyl(1.3, 0.36, F - 0.7, 0.29, 1.3, 1.25, F - 0.7, 0.29, u(69) < 0.5 ? 4 : 2);
          for (let i = 0; i < 3; i++) cyl(1.2, 0.42 + i * 0.2, F - 2.2, 0.3, 1.2, 0.6 + i * 0.2, F - 2.2, 0.3, 1);
        }
        // the row's apron, from its front out to the footpath (8 m from the road's middle) at the footpath's height, tilted along the street to
        // its grade so that unit meets unit without a step (footR)
        if (sb - svW(z) > 8.05) { const lz0 = F, lz1 = sb - 1.9 - svW(z), zm2 = (lz0 + lz1) / 2, qa = Wd(-UW / 2, zm2), qb = Wd(UW / 2, zm2), q = Wd(0, zm2), ga = roadYs(qa[1]), gb = roadYs(qb[1]);
          boxes.push(q[0], (ga + gb) / 2 + FOOT_H - 0.201, q[1], yaw + PI / 2, lz1 - lz0, 0.4, Math.hypot(UW, gb - ga) + 0.03, -atan2(gb - ga, UW), 2, 11, 0.4, 0); }
        const trk = sk === 0 && sb > 10 && um > 0 && um < 7 && u(142) < 0.45; if (trk) truck(0, F + 1.45, u(143));
        const kz = F + sb - 4.75 - svW(z);                                                        // just inside the kerb (which, where frontage roads leave the main road for an underpass, stands out beyond them: at 4.75 m from the road's middle these stood in the frontage road's way)
        if (u(81) < 0.3) bike(u(82) * 2.8 - 1.4, kz, u(83)); if (u(84) < 0.12) bike(u(85) * 2.8 - 1.4, kz, u(86));      // motorcycles left at the kerb
        if (sk && u(87) < 0.2) put(u(88) * 2 - 1, 0.78, F + 2.3, 0.6, 0.95, 0.05, 23, sgn(u(89)), 0.18, hU);                       // a board standing on the footpath
        if (wood) {
          put(-Wf / 2, Hh / 2, F + 0.05, 0.18, Hh, 0.18, 4); if (endU) put(Wf / 2, Hh / 2, F + 0.05, 0.18, Hh, 0.18, 4);      // posts (one between each pair of units, not two in the same place)
          put(0, 3.1, F + 1.05, Wf, 0.05, 2.3, 1, bs, 0.2);                                                                // tin lean-to over the footpath
          put(0, 5.0, F + 0.45, Wf, 0.08, 0.95, 0); put(0, 5.92, F + 0.9, Wf, 0.06, 0.07, 4); for (let x = -1.8; x <= 1.81; x += 0.4) put(x * Wf / UW, 5.48, F + 0.9, 0.04, 0.82, 0.04, 4);      // the long balcony
          put(-0.95, 6.15, F + 0.03, 0.85, 2.0, 0.06, u(90) < 0.5 ? 3 : 35, bs); for (const d of [-1, 1]) put(-0.95 + d * 0.66, 6.15, F + 0.05, 0.42, 2.0, 0.05, 35, bs);          // a door on to it, its leaves open
          put(0.95, 6.5, F + 0.03, 0.9, 1.2, 0.06, 3); for (const d of [-1, 1]) put(0.95 + d * 0.68, 6.5, F + 0.05, 0.44, 1.2, 0.05, 35, bs);                                     // a shuttered window
          if (u(3) < (sk ? 0.6 : 0.3)) put(0, 4.2, F + 0.12, UW * 0.8, 0.8, 0.08, 23, sgn(u(9)), 0, hU);
        } else {
        put(-Wf / 2, Hh / 2, F + 0.1, 0.3, Hh, 0.32, 18, bs); if (endU) put(Wf / 2, Hh / 2, F + 0.1, 0.3, Hh, 0.32, 18, bs);   // party-wall piers
        put(0, 3.2, F + 0.85, Wf, 0.12, 1.7, 2); put(0, 3.05, F + 1.66, Wf, 0.3, 0.08, 2);            // concrete canopy with a downstand
        if (u(1) < 0.45) put(0, 2.72, F + 2.2, UW * 0.92, 0.04, 1.3, u(8) < 0.5 ? 36 : 1, u(8) < 0.5 ? [0.63, 0.63, 0.48, 0.48, 0.1][floor(u(2) * 4.99)] : u(2), 0.3);  // extra awning out over the footpath: tin, or striped canvas
        if (u(3) < (sk ? 0.78 : 0.4)) put(0, 4.05, F + 0.12, UW * (0.5 + 0.34 * (u(10) < 0.6 ? 1 : u(10))), 0.6 + 0.45 * u(11), 0.1, 23, sgn(u(9)), 0, hU);                     // the shop's sign across the front
        if (u(5) < 0.1) put((u(6) < 0.5 ? -1 : 1) * (UW / 2 - 0.25), 3.98, F + 1.0, 0.14, 0.8, 1.2, 23, sgn(u(7)), 0, hU);   // now and then a small lightbox standing out from the wall above the canopy
        for (let f = 1; f < st; f++) {
          const yb = 5 + (f - 1) * 3;
          if (balc) {         // a balcony: slab, parapet or bars, a glazed door and a window behind
            put(0, yb + 0.05, F + 0.5, Wf - 0.3, 0.1, 1.0, 2);
            if (bs < 0.5) put(0, yb + 0.55, F + 0.97, Wf - 0.3, 0.9, 0.08, 18, bs);
            else { put(0, yb + 1.0, F + 0.97, Wf - 0.3, 0.05, 0.05, 4); put(0, yb + 0.25, F + 0.97, Wf - 0.3, 0.04, 0.04, 4); for (let x = -1.75; x <= 1.76; x += 0.35) put(x * Wf / UW, yb + 0.6, F + 0.97, 0.03, 0.8, 0.03, 4); }
            put(-0.85, yb + 1.15, F + 0.02, 1.0, 2.2, 0.08, 19); put(-0.85, yb + 1.13, F + 0.075, 0.86, 2.06, 0.04, 17, u(10 + f));
            put(0.95, yb + 1.55, F + 0.02, 1.4, 1.3, 0.08, 19); put(0.95, yb + 1.55, F + 0.075, 1.26, 1.16, 0.04, 17, u(20 + f)); put(0.95, yb + 1.55, F + 0.115, 0.04, 1.16, 0.02, 19);
            if (u(92 + f) < 0.3) { put(0, yb + 1.95, F + 0.98, Wf - 0.3, 1.85, 0.04, 27, bs); for (const d of [-1, 1]) put(d * (Wf / 2 - 0.17), yb + 1.95, F + 0.5, 0.04, 1.85, 0.95, 4); }      // caged in with steel bars (เหล็กดัด)
            else if (u(96 + f) < 0.35) { put(0, yb + 2.02, F + 0.8, Wf - 0.6, 0.025, 0.025, 4); for (let i = 0; i < 5; i++) { const L = 0.45 + u(100 + i + f * 4) * 0.45; put(-1.4 + i * 0.68 + (u(104 + i + f * 4) - 0.5) * 0.15, yb + 2.0 - L / 2, F + 0.8, 0.34 + 0.2 * u(110 + i + f), L, 0.02, 56, u(104 + i + f * 4)); } }     // washing hung out on a rail: cloth, each piece its own length
          } else {            // a flat front: two windows, each under a concrete sunshade
            for (const wx of [-0.95, 0.95]) {
              put(wx, yb + 1.55, F + 0.02, 1.35, 1.4, 0.08, 19); put(wx, yb + 1.55, F + 0.075, 1.2, 1.26, 0.04, 17, u(30 + f + (wx > 0 ? 5 : 0))); put(wx, yb + 1.55, F + 0.115, 0.04, 1.26, 0.02, 19);
              put(wx, yb + 2.35, F + 0.22, 1.6, 0.07, 0.45, 2); put(wx, yb + 0.82, F + 0.08, 1.5, 0.06, 0.16, 2);
              if (u(92 + f) < 0.3) put(wx, yb + 1.55, F + 0.3, 1.5, 1.5, 0.04, 27, bs);                 // a cage of steel bars over the window
            }
          }
          if (u(40 + f) < 0.5) { const ax = balc ? 1.2 : (u(45 + f) < 0.5 ? -0.95 : 0.95); put(ax, yb + (balc ? 2.55 : 0.42), F + 0.24, 0.8, 0.55, 0.32, 22); }    // air conditioner
        }
        }
        if (old) put(0, Hh + 0.85 + par * 0.02, 0, Ww, 1.7, DEP + 0.8, wood ? 1 : 9, bs, 0, 1);              // older two-storey rows keep a pitched roof: tiles, or tin on the timber ones
        else {
          put(0, Hh + 0.35, F - 0.08, Wf, 0.7, 0.15, 18, bs);                                          // parapet
          if (u(50) < 0.3) put(-0.7, Hh + 1.2, -3, 2.2, 2.4, 2.8, 18, bs);                              // stair head on the roof
          if (u(51) < 0.55) { const tx = cx + 0.9 * c - 1.5 * sn, tz = cz - 0.9 * sn - 1.5 * c; far.push(tx, y + Hh + 0.5, tz, 0.52, tx, y + Hh + 1.9, tz, 0.52, -1, u(52) < 0.5 ? 4 : 0, tx, y + Hh, tz, 0.4, tx, y + Hh + 0.5, tz, 0.4, -1, 0); }   // water tank
          if (u(57) < 0.25) { put(0, Hh + 2.45, 2.2, Wf - 0.3, 0.05, 5.4, 1, u(58), 0.1); for (const d of [-1, 1]) { put(d * 1.7, Hh + 1.45, 4.7, 0.08, 2.9, 0.08, 4); put(d * 1.7, Hh + 1.0, -0.3, 0.08, 2.0, 0.08, 4); } }      // a tin roof put up over the flat roof
          if (u(59) < 0.3) { cyl(-1.5, Hh, -4.5, 0.025, -1.5, Hh + 3.4, -4.5, 0.02, 1); for (let i = 0; i < 3; i++) cyl(-2.0 + i * 0.08, Hh + 3.3 - i * 0.3, -4.5, 0.012, -1.0 - i * 0.08, Hh + 3.3 - i * 0.3, -4.5, 0.012, 1); }   // television aerial
          if (u(55) < 0.14) { put(1.0, Hh + 1.25, -4.3, 1.5, 0.05, 1.5, 3, 0, 0.6); cyl(1.0, Hh, -4.3, 0.04, 1.0, Hh + 1.2, -4.3, 0.04, 0); }        // a black mesh satellite dish
        }
        // (what runs down a front: a rainwater pipe from the roof beside the pier; the electricity meter in its grey box on the pier at head
        // height, its wire up to the canopy)
        if (!wood && u(120) < 0.6) put(Wf / 2 - 0.28, (Hh + 3.3) / 2, F + 0.16, 0.09, Hh - 3.3, 0.09, u(121) < 0.5 ? 19 : 50, 0.77);
        if (!wood && sk && u(122) < 0.7) { put(-Wf / 2 + 0.2, 1.9, F + 0.29, 0.2, 0.3, 0.1, 19); put(-Wf / 2 + 0.2, 2.6, F + 0.27, 0.02, 1.1, 0.02, 3); }
        if (u(93) < 0.45) { put(0.3, 1.45, -F - 1.25, UW - 0.8, 2.3, 2.5, 18, u(94)); put(0.3, 2.78, -F - 1.4, UW - 0.3, 0.05, 3.1, 1, u(95), -0.13); }      // a kitchen built on at the back under a tin roof
        else { put(-0.9, 1.33, -F - 0.03, 0.9, 2.0, 0.06, 4); if (u(94) < 0.5) cyl(0.9, 0.3, -F - 0.7, 0.42, 0.9, 1.3, -F - 0.7, 0.36, 4); }                 // or just the back door and a water jar
        if (!wood && (last || um === 0) && u(97) < 0.3 && st > 2) put((last ? side : -side) * (Ww / 2 + 0.07), 8.2, 0.5, 0.08, 2.6, 6, 23, 200 + floor(u(99) * 3.999) + 0.01 + 0.98 * u(98), 0, 16);                   // a big advertisement on the end wall (render.js: ADS; the shape number, 10 + its width)
        if (u(53) < 0.22 && !trk) { put(u(54) < 0.5 ? -1.5 : 1.5, 0.52, F + 0.7, 0.5, 0.45, 0.5, 2); const px = (u(54) < 0.5 ? -1.5 : 1.5), wx = cx + px * c + (F + 0.7) * sn, wz = cz - px * sn + (F + 0.7) * c; if (inside(wx, wz)) plant(TREES[8 + (u(55) < 0.4 ? 1 : 0)], wx, wz, u(56) * 6, 0.45); }   // a potted shrub by the door
      }
    }
    // the kerb: a line of stones standing 15 cm above the road, 3.88 m from its middle measured along x (as the ground's own kerb paint is),
    // in pieces 2.5 m long that stop clear of the lanes' mouths and of the bridge
    for (let k = Math.ceil(oz / 2.5 - 0.5); (k + 0.5) * 2.5 < oz + CH; k++) {
      const z = (k + 0.5) * 2.5; if (!townF(z)) continue;
      // (Beside an underpass, the frontage road's outer kerb - set out by exactly the rule the ground's kerb paint follows (rq in terrain.wgsl): at
      // the same z, out along x by the distance divided by how far it is measured square there. Set out by svSide - along the square from the
      // road, which moves it along z too - it parted from its paint where the measure turns from along x to square, the painted kerb on the road.)
      for (const side of [1, -1]) { const kp = (zz) => { const w = svQ(zz), sl = roadSl(zz), ca = 1 / Math.sqrt(1 + sl * sl); return [roadX(zz) + side * (3.88 + svW(zz)) / mix(1, ca, w), zz]; }, [x, zk] = kp(z); if (!inside(x, zk)) continue;
        const p0 = kp(z - 1), p1 = kp(z + 1), a = atan2(p1[0] - p0[0], p1[1] - p0[1]), len = 1.25 * hypot(p1[0] - p0[0], p1[1] - p0[1]) + 0.04;
        // (in four short pieces, each laid along its own stretch of the line: by a lane's mouth, where they stop short of it; and all along an
        // underpass, where the line bends - there whole 2.5 m stones, made long enough to close their joints, stuck out at each end in a saw-tooth)
        // (each tilted to the street's slope along it: laid level, on a climbing street they went up in steps)
        // (a stone that would cross a convenience store's way in is cut to stop exactly at its edge: drvCut)
        // (and near a bridge: up to its deck, where the ground is the street's - footOK, the raised footpath's test, asked at its middle)
        const okF = (zz) => footOK(roadX(zz) + side * (6.0 + svW(zz)), zz);
        if (svQ(z) <= 0 && !okF(z - 1.25) && !okF(z) && !okF(z + 1.25)) continue;
        if (svQ(z) <= 0 && (convDr(rparam(x, zk), side, len / 2 + 0.3) || soiD(x, zk) < 2.25 + len / 2 || !okF(z - 1.25) || !okF(z + 1.25))) { for (const [za, zb] of runsBy(z - 1.25, z + 1.25, (zz) => { const qq = kp(zz); return soiD(qq[0], qq[1]) > 2.05 && !convDr(rparam(qq[0], qq[1]), side, 0) && okF(zz); })) { const qa = kp(za), qb = kp(zb), qm = kp((za + zb) / 2);
            const ya = roadYs(za), yb = roadYs(zb), L = hypot(qb[0] - qa[0], qb[1] - qa[1]); boxes.push(qm[0], (ya + yb) / 2 + 0.05, qm[1], atan2(qb[0] - qa[0], qb[1] - qa[1]), 0.25, 0.2, L + 0.02, -atan2(yb - ya, L), 40, 0, 0.2, 0); } }
        else if (soiD(x, zk) > 2.15 + len / 2 && svQ(z) <= 0) boxes.push(x, (roadYs(z - 1) + roadYs(z + 1)) / 2 + 0.05, zk, a, 0.25, 0.2, len, -atan2(roadYs(z + 1) - roadYs(z - 1), hypot(p1[0] - p0[0], p1[1] - p0[1])), 40, 0, 0.2, 0);
        else for (let j = 0; j < 4; j++) { const zq = z + (j - 1.5) * 0.625, q = kp(zq), qa = kp(zq - 0.3125), qb = kp(zq + 0.3125), aq = atan2(qb[0] - qa[0], qb[1] - qa[1]), lq = hypot(qb[0] - qa[0], qb[1] - qa[1]) + 0.02;
          if (soiD(q[0], q[1]) > 2.15 + lq / 2 && !convDr(rparam(q[0], q[1]), side, lq / 2)) { const ya = roadYs(zq - 0.3125), yb = roadYs(zq + 0.3125); boxes.push(q[0], (ya + yb) / 2 + 0.05, q[1], aq, 0.25, 0.2, lq, -atan2(yb - ya, lq - 0.02), 40, 0, 0.2, 0); } } }
      // the footpath itself, raised flush with the kerb's top (FOOT_H): slabs from the kerb back to 8 m out, each 0.625 m along the street (a
      // quarter of a kerb stone, to stop clean at a lane's mouth or a way in - footK), tilted to the street's slope; beside an underpass none
      // (the raised footpath itself, and a convenience store's ways in across it, are surfaces laid along the street: see FOOTMESH below)
    }
    // FOOTMESH. The raised footpath (FOOT_H, flush with the kerb's top): one surface along the street for each stretch of it, not slabs - laid
    // as slabs, however overlapped or offset, every joint showed, a hairline of light or a flicker or a step. Set out square to the road
    // (rp), from just under the kerb's inner edge to 8 m out (as footK reckons it), every half metre, its top at the street's level + FOOT_H,
    // its edges carried down to the ground; cut where a lane's mouth or a way in opens and where the footpath may not stand (footOK) - those
    // ends square across, as the lanes leave the road. Material 31: fsBranch paints its top as the paving blocks, its edges as concrete.
    for (const side of [1, -1]) {
      // (beside an underpass too: there the kerb and the footpath stand out beyond the frontage road, svW further from the middle - left out
      // there, the kerb stood alone over paving painted on the ground at the road's level)
      const okP = (zz) => { if (!townF(zz)) return false; const q = rp(zz, side * (6.0 + svW(zz))); return inside(roadX(zz) + side * 6.0, zz) && soiD(q[0], q[1]) > 2.05 && !convDr(zz, side, 0) && footOK(roadX(zz) + side * (6.0 + svW(zz)), zz); };
      // (a stretch belongs to the chunk its place along the road, zz, falls in - not the square-out point's, which on a slanting road lies
      // metres along z from it: by that, at each chunk's border a strip of footpath was nobody's, a gap down to the ground)
      for (const [za, zb] of runsBy(oz, oz + CH, okP)) {
        const V = [], I = [], zs = []; for (let zz = za; zz < zb - 0.01; zz += 0.5) zs.push(zz); zs.push(zb);
        const P = zs.map((zz) => { const sl = roadSl(zz), ca = 1 / Math.sqrt(1 + sl * sl), sv = svW(zz), kq = mix(ca, 1, svQ(zz)), f = rp(zz, side * ((3.88 + sv) * kq + 0.065)), bk = rp(zz, side * (8 + sv) * kq);
          return { f, bk, yf: roadYs(f[1]) + FOOT_H, yb: roadYs(bk[1]) + FOOT_H, gf: ground(f[0], f[1]) - 0.06, gb: ground(bk[0], bk[1]) - 0.06, nx: side * ca, nz: -side * sl * ca, tx: sl * ca, tz: ca }; });
        const vtx = (x, y, z, nx, ny, nz) => { V.push(x, y, z, nx, ny, nz, 31); return V.length / 7 - 1; };
        const quad = (a, b, c, d) => I.push(a, b, c, b, d, c);
        for (let i2 = 0; i2 + 1 < P.length; i2++) { const p0 = P[i2], p1 = P[i2 + 1];
          quad(vtx(p0.f[0], p0.yf, p0.f[1], 0, 1, 0), vtx(p0.bk[0], p0.yb, p0.bk[1], 0, 1, 0), vtx(p1.f[0], p1.yf, p1.f[1], 0, 1, 0), vtx(p1.bk[0], p1.yb, p1.bk[1], 0, 1, 0));
          quad(vtx(p0.f[0], p0.yf, p0.f[1], -p0.nx, 0, -p0.nz), vtx(p0.f[0], p0.gf, p0.f[1], -p0.nx, 0, -p0.nz), vtx(p1.f[0], p1.yf, p1.f[1], -p1.nx, 0, -p1.nz), vtx(p1.f[0], p1.gf, p1.f[1], -p1.nx, 0, -p1.nz));
          quad(vtx(p0.bk[0], p0.yb, p0.bk[1], p0.nx, 0, p0.nz), vtx(p0.bk[0], p0.gb, p0.bk[1], p0.nx, 0, p0.nz), vtx(p1.bk[0], p1.yb, p1.bk[1], p1.nx, 0, p1.nz), vtx(p1.bk[0], p1.gb, p1.bk[1], p1.nx, 0, p1.nz)); }
        for (const [pe, e] of [[P[0], -1], [P[P.length - 1], 1]]) quad(vtx(pe.f[0], pe.yf, pe.f[1], e * pe.tx, 0, e * pe.tz), vtx(pe.f[0], pe.gf, pe.f[1], e * pe.tx, 0, e * pe.tz), vtx(pe.bk[0], pe.yb, pe.bk[1], e * pe.tx, 0, e * pe.tz), vtx(pe.bk[0], pe.gb, pe.bk[1], e * pe.tx, 0, e * pe.tz));
        meshP.push([new Float32Array(V), new Uint32Array(I), 0]); }
      // a convenience store's ways in: the car park's concrete across the footpath's line at the road's level, from the kerb's line back to
      // the car park - set out exactly as the footpath is (the same places along the road, square to it), so it fills the gap left for it
      const okD = (zz) => townF(zz) && svW(zz) <= 0.02 && inside(roadX(zz) + side * 6.0, zz) && convDr(zz, side, 0);
      for (const [za, zb] of runsBy(oz, oz + CH, okD)) { const V = [], I = [], zs = []; for (let zz = za; zz < zb - 0.01; zz += 0.5) zs.push(zz); zs.push(zb);
        zs.forEach((zz, i2) => { const sl = roadSl(zz), ca = 1 / Math.sqrt(1 + sl * sl), f = rp(zz, side * 3.46 * ca), bk = rp(zz, side * 9.2 * ca);      // (from the asphalt's edge: the kerb's red and white is painted on the ground under the stones, from 3.5 m out, and showed in the way in)
          V.push(f[0], roadYs(f[1]) + 0.012, f[1], 0, 1, 0, 35, bk[0], ground(bk[0], bk[1]) + 0.012, bk[1], 0, 1, 0, 35); if (i2) { const k = i2 * 2; I.push(k - 2, k - 1, k, k - 1, k + 1, k); } });
        meshP.push([new Float32Array(V), new Uint32Array(I), 0]); } }
    // the tangle of cables every Thai street has: a thick bundle strung along the shopfronts on slim posts 20 m apart. No post stands in the
    // canal: there the cables run on in one span of 40 m to the post beyond. They end at a post, never in mid-air.
    for (let k = Math.ceil(oz / 20) - 1; (k - 1) * 20 < oz + CH; k++) {
      const z = k * 20, postAt = (zz) => townW(zz) >= 0.5 && !(rivOf(zz) && abs(zz - RV.zr - rivM(roadX(zz) - 7.7)) < RV.W / 2 + 6); if (!postAt(z)) continue;      // (measured to where the water really runs at the post)
      let span = 0; for (let j = 1; j <= 4 && !span; j++) { if (townW(z + 20 * j) < 0.5) break; if (postAt(z + 20 * j)) span = 20 * j; }      // on to the next post that stands, up to 80 m (a river)
      for (const side of [-1]) {                        // (the other side's cables hang on the electricity poles)
        const za = clearZ(z, side, 7.7), zb = clearZ(z + span, side, 7.7), x = roadX(za) + side * (7.7 + svW(za)); if (!inside(x, za)) continue;      // (a post steps aside from a lane's mouth)
        const y = roadYs(za), y1 = roadYs(zb), x1 = roadX(zb) + side * (7.7 + svW(zb)), wx = (t) => mix(x, x1, t);      // (straight from post to post, as a stretched cable hangs)
        far.push(x, y - 0.2, za, 0.07, x, y + 6.2, za, 0.06, -1, 0);
        if (span) { reach = max(reach, span - 14); const n = span / 5; for (let w = 0; w < 4; w++) for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, sg = (t) => -(0.35 + w * 0.12) * min(span / 20, 2) * 4 * t * (1 - t), hh = 5.5 + w * 0.17, off = (w - 1.5) * 0.06;
          far.push(wx(t0) + off, mix(y, y1, t0) + hh + sg(t0), mix(za, zb, t0), 0.022, wx(t1) + off, mix(y, y1, t1) + hh + sg(t1), mix(za, zb, t1), 0.022, -1, 1); } }
      }
    }
    // Behind the rows: lanes (ซอย) leave the street every 36 m, square to it, and the houses stand along both sides of each lane in lots
    // 17 m wide, facing it. What a lot holds is drawn by lot: a two-storey house, a one-storey house behind its wall and sliding gate,
    // an old timber house under its trees, a block of flats, or nothing yet but banana and weeds. Further from the street more lots are empty.
    for (let b = Math.floor((oz - 200) / 36); b * 36 + 34 < oz + CH + 200; b++) {
      const zl = b * 36 + 34; if (townW(zl) < 0.5 || nearRiv(zl, 6) || laneRiv(b)) continue;
      townW(zl); const seg = twS, sl = (roadX(zl + 1) - roadX(zl - 1)) / 2, ca = 1 / sqrt(1 + sl * sl), sa = sl * ca, ox0 = roadX(zl);
      for (const side of [1, -1]) for (let i = 0; i < 8; i++) for (const ls of [1, -1]) {
        if (laneSd(b) && laneSd(b) !== side) continue;      // (a lane that goes off on the other side only has no houses on this)
        const t = side * (32.5 + i * 17), x = ox0 + t * ca + ls * 11 * sa, z = zl - t * sa + ls * 11 * ca; const own = inside(x, z); if ((!own && !(x >= ox - 12 && x < ox + CH + 12 && z >= oz - 12 && z < oz + CH + 12)) || townW(z) < 0.45 || nearRiv(z, 16) || abs(rdist(x, z)) < 29 || abs(t) + 8.5 > laneLen(zl)) continue;      // own: the house is this chunk's; a neighbour's lot is gone through too, for the trees of it that stand on this side
        let ok = true; for (const b2 of [b - 1, b + 1]) { const z2 = b2 * 36 + 34, s2 = (roadX(z2 + 1) - roadX(z2 - 1)) / 2; if (abs(((x - roadX(z2)) * s2 + z - z2) / sqrt(1 + s2 * s2)) < 20) ok = false; }
        if (!ok) continue;                                     // where the road bends the lanes close up: no room for a house
        if (watNear(x, z)) continue;
        if (abs(t) + 8.5 > CIV_T0 && civAt(ls > 0 ? b : b - 1, side)) continue;      // (the school's or the football field's ground: civSites)
        const hq = b * 64 + i * 4 + (side > 0 ? 2 : 0) + (ls > 0 ? 1 : 0), u = ph(hq, 500 + seg), h = (j) => ph(hq, 510 + j + seg), yaw = atan2(-ls * sa, -ls * ca), c = cos(yaw), sn = sin(yaw), y = ground(x, z) - 0.05;
        const W2 = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c], tree = (T, lx, lz, sc, thin = 1) => { const q = W2(lx, lz); if (inside(q[0], q[1])) plant(T, q[0], q[1], h(lx + 20) * 6, sc, thin); };
        const put = (lx, ly, lz, sx, sy, sz, mat, seed = 0) => { const dn = ly - sy / 2 < 0.1 && sy > 0.7 && mat === 18 ? 1.3 : 0;      // (a wall or a post that stands on the ground goes on down into it: at the back of a lot the land steps to the next lane's level, and nothing may show daylight under it)
          if (own) boxes.push(x + lx * c + lz * sn, y + ly - dn / 2, z - lx * sn + lz * c, yaw, sx, sy + dn, sz, 0, mat, seed, sy + dn, 0); else if (sy > 1.8 && max(sx, sz) > 1.5) nbFoot.push(x + lx * c + lz * sn, z - lx * sn + lz * c, yaw, sx, sz, y + ly - sy / 2, y + ly + sy / 2); };      // (a neighbour's house: only where it stands, for our trees)
        if (u < 0.08 || h(0) < (i - 3) * 0.1) {               // an empty lot
          if (h(1) < 0.7) tree(TREES[8 + (h(2) < 0.4 ? 1 : 0)], -3 + h(2) * 6, -2 + h(3) * 5, 0.8 + h(4) * 0.3); if (h(5) < 0.5) tree(TREES[BL[floor(h(6) * 8)]], 4 - h(7) * 8, 1 - h(8) * 5, 0.6 + h(9) * 0.4, 2); if (h(10) < 0.4) tree(TREES[8], 5, 5, 0.9);
          continue;
        }
        if (u < 0.11 && i > 1) {                                // a block of flats
          const fl = 3 + floor(h(1) * 3), Hh = fl * 3.2, sd = h(2), Y = -0.25, pt = (lx, ly, lz, sx, sy, sz, mat, seed = sd) => put(lx, ly + Y, lz - 0.6, sx, sy, sz, mat, seed);
          pt(0, Hh / 2, 0, 15, Hh, 13, 7);
          for (let f = 1; f < fl; f++) { pt(0, f * 3.2 + 0.05, 7.05, 15, 0.1, 1.1, 2); pt(0, f * 3.2 + 0.55, 7.56, 15, 0.9, 0.07, 18); }      // a balcony along every floor
          for (const fx of [-7.5, -2.5, 2.5, 7.5]) pt(fx, Hh / 2, 7.05, 0.22, Hh, 1.15, 18);                                             // fins dividing the flats
          pt(0, 3.3, 8.2, 6, 0.14, 2.4, 2); pt(0, Hh + 0.4, 6.42, 15, 0.8, 0.16, 18); pt(0, Hh + 0.4, -6.42, 15, 0.8, 0.16, 18); pt(-7.42, Hh + 0.4, 0, 0.16, 0.8, 13, 18); pt(7.42, Hh + 0.4, 0, 0.16, 0.8, 13, 18);
          pt(3, Hh + 1.5, -2, 4, 3, 4.5, 18); pt(-4, Hh + 2.2, 4, 5.5, 1.5, 0.12, 23, h(3));                                                 // lift room, and the building's name up top
          for (let f = 1; f < fl; f++) for (let j = 0; j < 3; j++) if (h(20 + f * 3 + j) < 0.4) pt(-5 + j * 5, f * 3.2 + 2.5, 7.3, 0.8, 0.55, 0.32, 22);     // air conditioners
          continue;
        }
        const fs = h(11), gs = h(12), wh = fs < 0.45 ? 0.8 : 1.75, wallB = (lx, lz, sx, sz) => { put(lx, wh / 2, lz, sx, wh, sz, 18, fs); put(lx, wh + 0.03, lz, sx + 0.08, 0.06, sz + 0.08, 19); if (wh < 1) put(lx, wh + 0.5, lz, sx > sz ? sx : 0.04, 0.9, sx > sz ? 0.04 : sz, 27, gs); };
        const post = (lx, lz) => { put(lx, 1.0, lz, 0.32, 2.0, 0.32, 18, fs); put(lx, 2.03, lz, 0.4, 0.07, 0.4, 19); };
        if (u < 0.55) {                                         // the two-storey house; its own low wall, and a gate between the posts
          if (own) stamp(HOUSE2, x, y, z, yaw, h(13), h(14)); put(0, 0.8, 8, 1.6, 1.45, 0.05, 27, gs);
          // (what each family adds: washing on a rail along the balcony; a satellite dish at its corner)
          if (own && h(30) < 0.6) { put(0, 5.0, 5.55, 5.6, 0.025, 0.025, 4); for (let k = 0; k < 6; k++) { const L = 0.45 + 0.5 * h(40 + k); put(-2.4 + k * 0.95 + (h(46 + k) - 0.5) * 0.2, 5.0 - L / 2, 5.55, 0.36 + 0.25 * h(52 + k), L, 0.02, 56, h(58 + k)); } }
          if (own && h(31) < 0.5) { put(3.1, 3.9, 5.5, 0.05, 1.6, 0.05, 4); { const q = W2(3.1, 5.4); boxes.push(q[0], y + 4.75, q[1], yaw, 0.8, 0.04, 0.8, -0.9, h(32) < 0.6 ? 50 : 3, 0.8064, 0.04, 0); } }
          if (h(15) < 0.6) tree(TREES[BL[floor(h(16) * 8)]], h(17) < 0.5 ? -6.6 : 6.6, -1 + h(18) * 5, 0.5 + h(19) * 0.3, 2); if (h(20) < 0.5) tree(TREES[8 + (h(21) < 0.5 ? 1 : 0)], h(17) < 0.5 ? 6.3 : -6.3, 6.5, 0.8);
          if (h(22) < 0.35) tree(TREES[9], h(17) < 0.5 ? 6.5 : -6.5, -3, 0.75);
          clear(W2(0, 6.5), yaw, 2.4, 9);          // the path from the door out through the gate to the lane
        } else {                                                // the one-storey house, or the old timber one, in a walled yard with a sliding gate across the drive
          const old = u > 0.88; if (own) stamp(old ? HOUSE : HOUSE3, x, y, z, yaw, h(13), h(14));
          // What each family adds in its yard: a washing line between two posts, the day's washing on it; the big glazed water jars
          // (โอ่ง) by the kitchen - always at the old houses; a satellite dish on a pole; a gas cylinder outside the kitchen wall.
          if (own) { const jar = (lx, lz, r, hq) => { const q = W2(lx, lz); fruit.push(q[0], y + r * 1.05, q[1], r, 11, hq, 0, 0); };
            if (h(30) < 0.65) { const lx = old ? 5.6 : 6.5, z0 = old ? -2.5 : -1.8; for (const e of [0, 3.6]) put(lx, 0.95, z0 + e, 0.07, 1.9, 0.07, 4); put(lx, 1.86, z0 + 1.8, 0.02, 0.02, 3.6, 3);
              for (let k = 0; k < 6; k++) { const L = 0.45 + 0.55 * h(40 + k); if (h(64 + k) < 0.2) continue; put(lx, 1.85 - L / 2, z0 + 0.4 + k * 0.56, 0.02, L, 0.34 + 0.18 * h(52 + k), 56, h(58 + k)); } }
            if (old || h(31) < 0.6) { const jx = old ? 1.3 : 0.6, jz = old ? 3.4 : -3.95; jar(jx, jz, 0.4, h(33)); if (h(34) < 0.7) jar(jx + 0.9, jz + (old ? 0.1 : 0), 0.34, h(35)); if (old && h(36) < 0.6) jar(jx + 0.45, jz + 0.75, 0.3, h(37)); }
            if (!old && h(32) < 0.45) { put(5.2, 1.7, -2.6, 0.06, 3.4, 0.06, 4); { const q = W2(5.2, -2.7); boxes.push(q[0], y + 3.5, q[1], yaw, 0.85, 0.04, 0.85, -0.9, h(38) < 0.6 ? 50 : 3, 0.8064, 0.04, 0); } }
            if (!old && h(39) < 0.5) { put(-1.9, 0.33, -3.5, 0.3, 0.66, 0.3, 50, 0.3555); put(-1.9, 0.72, -3.5, 0.14, 0.12, 0.14, 4); } }
          for (const [lx, lz, sx, sz] of [[0, -6.7, 16.7, 0.16], [-8.3, 0.8, 0.16, 15], [8.3, 0.8, 0.16, 15]]) { put(lx, 0.875, lz, sx, 1.75, sz, 18, fs); put(lx, 1.78, lz, sx + 0.08, 0.06, sz + 0.08, 19); } wallB(1.85, 8.3, 12.9, 0.16);
          post(-4.6, 8.3); post(-8.3, 8.3); post(8.3, 8.3); put(-6.45, 0.85, 8.3, 3.5, 1.6, 0.05, 27, gs);
          if (h(15) < 0.7) tree(TREES[BL[floor(h(16) * 8)]], 5.5 + h(17), old ? 5.5 : -4.2 - h(18), 0.5 + h(19) * 0.35, 2); if (h(20) < 0.6) tree(TREES[8 + (h(21) < 0.5 ? 1 : 0)], 6.8, 6.6, 0.8);
          if (h(22) < 0.4) tree(TREES[9], -6.2, -4.8, 0.75); if (old) tree(TREES[3], 6.3, -4.6, 0.8);          // (the palm in the back corner, not on the drive)
          clear(W2(-6.45, 5.5), yaw, 3.4, 11);          // the drive, from the carport out through the gate to the lane
          if (own && h(20) >= 0.6 && h(23) < 0.85) { const q = W2(6.2, 6.7); stamp(old ? SHRINE_A : SHRINE_B, q[0], y, q[1], yaw, 0.2, 0); }      // the household's spirit houses in the front corner of the yard
        }
      }
    }
    }
    // street lamps every 32 m on the side without the power line
    for (let k = Math.ceil((oz - 16) / 32) - 1; (k - 1) * 32 + 16 < oz + CH; k++) {
      const z0 = clearZ(k * 32 + 16, -1, 4.6), cst = seaW(z0) > 0.4, dpl = udip(z0), sv = svW(z0), [x, z] = svSide(z0, -1, cst ? 6.3 : 4.6 + sv); if (!inside(x, z) || (townW(z0) < 0.4 && !cst) || nearRiv(z0, 7)) continue;
      if (dpl > 0.2 && abs(z0 - UD.zc) < 17) continue;                                 // (none through the slab of an underpass)
      const y = sv > 0 ? roadYs(z0) : ground(x, z);                                     // (along an underpass they stand on the footpath beyond the frontage road)
      far.push(x, y - 0.2, z, 0.07, x, y + 7, z, 0.05, -1, 0, x, y + 6.9, z, 0.04, x + 1.5, y + 7.15, z, 0.035, -1, 0);
      if (cst) boxes.push(x, y + 0.45, z, 0, 0.17, 0.9, 0.17, 0, 13, 0, 0.9, 0, x, y + 1.3, z, 0, 0.165, 0.8, 0.165, 0, 13, 0, 0.8, 0);      // red and white bands round the foot of the pole
      boxes.push(x + 1.5, y + 7.08, z, 0, 0.6, 0.1, 0.26, 0, 10, 0, 0, 0);
    }
  }
  // The tunnel: floor (the road), walls, roof and lights in lengths of about 6 m that follow the road, lit inside all the time; and at each mouth a
  // concrete front - two piers and a deep beam across - standing against the hillside.
  if (tunOf(oz + CH / 2) && abs(oz + CH / 2 - TN.zc) < TN.hl + CH) {
    const zc = TN.zc, HL = TN.hl, n = Math.ceil(2 * HL / 6), sl = 2 * HL / n, IN = 5;
    // the arch in cross-section: half as wide as the road and its margins at the springing 3.4 m up, 2.7 m higher at the crown. Each slab: [how far
    // to the side its middle is, how high, how long it is across, its tilt]; a slab's box is turned to lie along the tunnel and tilted about that length.
    const ARCH = []; for (let i = 0; i < 6; i++) { const f0 = i * PI / 6, f1 = f0 + PI / 6, fm = f0 + PI / 12, z0 = 5.2 * cos(f0), y0 = 3.4 + 2.7 * sin(f0), z1 = 5.2 * cos(f1), y1 = 3.4 + 2.7 * sin(f1);
      ARCH.push([(z0 + z1) / 2 + 0.25 * cos(fm), (y0 + y1) / 2 + 0.25 * sin(fm), hypot(z1 - z0, y1 - y0) + 0.3, -atan2(y1 - y0, z1 - z0), cos(fm), sin(fm)]); }
    for (let j = 0; j < n; j++) {
      const z0 = zc - HL + j * sl, z1 = z0 + sl, x0 = roadX(z0), x1 = roadX(z1), y0 = roadY(z0), y1 = roadY(z1), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, my = (y0 + y1) / 2;
      if (!inside(mx, mz)) continue;
      // (each length runs exactly from one end point to the next, measured along its own slope, so that the tops of neighbours meet in one line with
      // neither a step nor an overlap: a seam shows as soon as two lengths differ in height or lie one over the other)
      const hl2 = hypot(x1 - x0, sl), len = hypot(hl2, y1 - y0) + 0.004, yw = atan2(x1 - x0, sl), tl = -atan2(y1 - y0, hl2), c = cos(yw), sn = sin(yw);
      { const D = deckBox(x0, y0, z0, x1, y1, z1, 1.0, 10.7); boxes.push(D[0], D[1], D[2], yw, 10.7, 1.0, D[3], tl, 30, 0, 1.0, 0); }
      for (const sd of [-1, 1]) {
        const px = mx + sd * 5.35 * c, pz = mz - sd * 5.35 * sn;
        boxes.push(px, my + 1.85, pz, yw, 0.6, 3.9, len, tl, 48, 0, 3.9, IN);
        boxes.push(mx + sd * 4.45 * c, my + 0.1, mz - sd * 4.45 * sn, yw, 1.3, 0.3, len, tl, 48, 0, 0.3, IN);          // a raised walkway of the same old concrete along the foot of each wall
        boxes.push(mx + sd * 1.7 * c, my + 5.7, mz - sd * 1.7 * sn, yw, 0.45, 0.07, len * 0.45, tl, 10, 0, 0.07, 4);          // a lamp (shape 4: on by day too)
      }
    }
    // the vault: six flat slabs round a low arch, in lengths of 2 m (a slab cannot be pitched to the road's slope, so short lengths keep the steps between them small)
    const n2 = Math.ceil(HL), s2 = 2 * HL / n2;
    for (let j = 0; j < n2; j++) {
      const z0 = zc - HL + j * s2, z1 = z0 + s2, x0 = roadX(z0), x1 = roadX(z1), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, my = (roadY(z0) + roadY(z1)) / 2; if (!inside(mx, mz)) continue;
      const len = hypot(x1 - x0, s2) + 0.03, yw = atan2(x1 - x0, s2), c = cos(yw), sn = sin(yw);
      for (const A of ARCH) boxes.push(mx + A[0] * c, my + A[1], mz - A[0] * sn, yw + PI / 2, len, 0.5, A[2], A[3], 48, 0, 0.5, IN);
    }
    for (const e of [-1, 1]) {
      const zp = zc + e * (HL + 0.4), a = atan2(roadX(zp + 1) - roadX(zp - 1), 2), x = roadX(zp), y = roadY(zp); if (!inside(x, zp)) continue;
      const c = cos(a), sn = sin(a);
      boxes.push(x, y + 8.6, zp, a, 21, 3.6, 1.5, 0, 48, 0, 3.6, 0);
      for (const A of ARCH) boxes.push(x + (A[0] + 1.05 * A[4]) * c, y + A[1] + 1.05 * A[5], zp - (A[0] + 1.05 * A[4]) * sn, a + PI / 2, 1.5, 2.6, A[2] + 0.5, A[3], 48, 0, 2.6, 0);      // the arch's ring in the front, filling up to the beam
      for (const sd of [-1, 1]) boxes.push(x + sd * 8.0 * c, y + 3.4, zp - sd * 8.0 * sn, a, 5.0, 7.4, 1.5, 0, 48, 0, 7.4, 0);
    }
    // An apron at each mouth: the road's slab carried out 4.5 m in front of the piers and as wide as they stand apart. The ground is not drawn
    // where it lies inside the tunnel's opening, and the edge of that hole, following the ground's 2 m squares, comes out a little in front of
    // the portal and wider than the road: without the apron there was a gap in the world beside the road there, with the sky showing through.
    // (Like a bridge's approach slab its outer end dips 6 cm into the road, so that no pale edge lies across it.)
    for (const e of [-1, 1]) {
      const zi = zc + e * (HL - 1.5), zo = zc + e * (HL + 4.5), z0 = min(zi, zo), z1 = max(zi, zo), x0 = roadX(z0), x1 = roadX(z1), y0 = roadY(z0) - (z0 === zo ? 0.06 : 0), y1 = roadY(z1) - (z1 === zo ? 0.06 : 0);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; if (!inside(mx, mz)) continue;
      const hl2 = hypot(x1 - x0, z1 - z0), yw = atan2(x1 - x0, z1 - z0);
      boxes.push(mx, (y0 + y1) / 2 - 0.475, mz, yw, 17, 1.0, hypot(hl2, y1 - y0), -atan2(y1 - y0, hl2), 30, 0, 1.0, 0);
    }
  }
  // The underpass (in town, at a crossroads): retaining walls down both sides of the cutting, as deep as the road is below the street and a parapet
  // higher; beyond each parapet a frontage road at street level (svW in land.js); over the middle a concrete slab 32 m long carrying the cross street and
  // the crossings of the frontage roads, with a rail along each edge of the cutting and lamps underneath.
  // (every underpass whose walls reach into the chunk - two can be close enough for both to; each length of wall built for the one nearest it)
  const udHere = []; for (let g = floor((oz - 140 - 34) / 360) - 1; g <= floor((oz + CH + 140 - 34) / 360) + 1; g++) { const v = udG(g); if (v && abs(oz + CH / 2 - v) < 100 + CH) udHere.push(v); }
  for (const zc of udHere) {
    for (let j = -20; j < 20; j++) {
      const z0 = zc + j * 5, z1 = z0 + 5, zm = z0 + 2.5, dp = udip(zm); if (dp < 0.003) continue;
      if (!udOf(zm) || UD.zc !== zc) continue;
      const x0 = roadX(z0), x1 = roadX(z1), mx = (x0 + x1) / 2, my = (roadY(z0) + roadY(z1)) / 2; if (!inside(mx, zm)) continue;
      // (Where the cross street goes over - the two lengths either side of the middle, 10 m - the walls stop at the street's level, under the slab's
      // top: carried up into a parapet there as everywhere else, they stood as a wall across the street on both sides of the slab.)
      const len = hypot(x1 - x0, 5) + 0.08, yw = atan2(x1 - x0, 5), c = cos(yw), sn = sin(yw), H = dp + (j === -1 || j === 0 ? 0.45 : 1.5);
      const tl = -atan2((roadY(z1) - roadY(z0)) * 0.5 + (roadY(z1) + udip(z1) - roadY(z0) - udip(z0)) * 0.5, len);
      const tr = -atan2(roadY(z1) - roadY(z0), len);
      // (The frontage road's surface starts where the road first begins to sink, not where the walls do, and its outermost length dips 10 cm into
      // the ground at its far end: begun level, with the walls, its square end stood a hand high across the lane - a step in the road.)
      // (Only beside the walls - where the road is 20 cm down and more. Before that the frontage road is the ground's own asphalt, kept at the
      // street's level (land.js); and the first slab's near end is sunk 10 cm into it, so that no square end stands across the lane.)
      if (dp < 0.2) continue;
      const first = udip(zm - 5) < 0.2, last = udip(zm + 5) < 0.2;
      const ya = roadYs(z0) - (first ? 0.12 : 0), yb = roadYs(z1) - (last ? 0.12 : 0), ys = (ya + yb) / 2, ts = -atan2(yb - ya, len);
      for (const sd of [-1, 1]) boxes.push(mx + sd * 7.175 * c, ys - 0.16, zm - sd * 7.175 * sn, yw, 3.95, 0.36, len + 0.1 + 11 * abs(Math.atan(roadSl(z1)) - Math.atan(roadSl(z0))), ts, 49, sd, 0.36, 0);      // (longer where the road bends: on the outside of the bend the lengths would otherwise gape apart in wedges)      // (5.2 to 10.6 m out: the lane, its kerb line and the near strip of the footpath - the seed says which side it is on)          // the frontage road beyond the parapet, level with the street (the ground under it is still on its way up)
      for (const sd of [-1, 1]) boxes.push(mx + sd * 4.85 * c, my + H / 2 - 0.45, zm - sd * 4.85 * sn, yw, 0.7, H, len, tl, 2, 0, H, 0,
        mx + sd * 4.2 * c, my + 0.2, zm - sd * 4.2 * sn, yw, 0.9, 0.55, len, tr, 2, 0, 0.55, 0);          // the wall, and a kerb along its foot (the ground's mesh is too coarse to meet the wall cleanly)
    }
    // (The slab lies along the street's own slope: laid level, on a street that climbs it stood a hand or two proud of the frontage roads at
    // one end - a step across them, the road seeming to float - and sank under them at the other. sy: the street's height lz metres along it.)
    const x = roadX(zc), a = atan2(roadX(zc + 1) - roadX(zc - 1), 2), c = cos(a), sn = sin(a), ya = roadYs(zc - 16 * c), yb = roadYs(zc + 16 * c), sy = (lz) => (ya + yb) / 2 + (yb - ya) * lz / 32, st = -atan2(yb - ya, 32);
    if (inside(x, zc)) {
      boxes.push(x, sy(0) - 0.4, zc, a, 18.4, 0.9, hypot(32, yb - ya), st, 47, 0, 0.9, 0);      // (out over the frontage roads too, which cross the cross street on it)
      for (const e of [-1, 1]) { const yd = sy(e * 15.9); boxes.push(x + e * 15.9 * sn, yd + 0.55, zc + e * 15.9 * c, a, 10.4, 1.0, 0.24, 0, 19, 0, 1.0, 0); boxes.push(x + e * 15.9 * sn, yd + 1.1, zc + e * 15.9 * c, a, 10.5, 0.14, 0.34, 0, 19, 0, 0.14, 0); }
      for (const lz of [-10, 0, 10]) for (const sd of [-1, 1]) boxes.push(x + sd * 2.6 * c + lz * sn, sy(lz) - 0.9, zc - sd * 2.6 * sn + lz * c, a, 0.45, 0.07, 2.4, st, 10, 0, 0.07, 4);
    }
  }
  // The fishing village on the island, east of the road in the half toward the far bridge: timber houses in two loose rows; beside the bridge's landing a
  // wooden pier 50 m out into the sea, starting on the beach so that it can be driven onto, with long-tail boats tied up along it, a fishing boat at anchor off its end,
  // boats drawn up on the shore and coconut palms along the top of the bank.
  if (isOf(oz + CH / 2) && abs(oz + CH / 2 - IS.zc) < 330) {
    const zc = IS.zc, hv = (i, j) => ph(IS.s * 16 + i, 720 + j);
    for (const v of vil) if (inside(v[0], v[1])) { stamp(v[3] ? HOUSE : HOUSE3, v[0], ground(v[0], v[1]) - 0.05, v[1], v[2], v[4], v[5]);
      if (v[4] < 0.6) { const qx = v[0] - 10, qz = v[1] + 9.5; if (inside(qx, qz)) plant(TREES[3 + (v[5] < 0.5 ? 1 : 0)], qx, qz, v[4] * 6, 0.9 + v[5] * 0.4); } }
    const pr = pierOf(zc), xP = pr[0], zs = pr[3], yd = PIERY;
    for (let j = 0; j < 20; j++) {          // the pier: boards on piles, a rail down one side, the head wider
      const z = pr[1] + 1.5 + j * 3, wd = j > 16 ? 7 : 3.6, hw2 = wd / 2 - 0.2; if (!inside(xP, z)) continue;
      boxes.push(xP, yd, z, 0, wd, 0.12, 3.04, 0, 0, 0.7, 0.12, 0);
      const gl = ground(xP, z), yb = min(gl, SEA) - 1.4; if (gl > yd - 0.25) continue;
      for (const sd of [-1, 1]) far.push(xP + sd * hw2, yb, z, 0.1, xP + sd * hw2, yd + (sd < 0 || j % 2 ? 0 : 0.9), z, 0.09, -1, 3);
      if (j < 19 && j !== 16) far.push(xP + hw2, yd + 0.85, z, 0.03, xP + (j + 1 > 16 ? 3.3 : 1.6), yd + 0.85, z + 3, 0.03, -1, 3);
      if (j === 18) boxes.push(xP - 2.7, yd + 0.4, z, 0.3, 0.9, 0.7, 0.7, 0, 0, 0.3, 0.7, 0, xP - 2.5, yd + 0.3, z + 1.1, 0.9, 0.6, 0.5, 0.6, 0, 0, 0.5, 0.5, 0);      // fish boxes
    }
    for (let i = 0; i < 4; i++) { const x = xP + (i % 2 ? 3.3 : -3.3), z = zs + 9 + i * 8.5; if (inside(x, z)) boat(0, x, SEA - 0.14, z, (hv(i, 1) - 0.5) * 0.3 + (i % 2 ? 0 : PI), hv(i, 2), hv(i, 3), 1); }
    { const x = xP + 19, z = zs + 66; if (inside(x, z)) boat(1, x, SEA - 0.5, z, 0.5 + hv(5, 1), hv(5, 2), hv(5, 3), 1); }
    for (let i = 0; i < 5; i++) {          // boats on the shore, palms on the bank
      const x = xP + (i < 2 ? 10 + i * 7 : -(9 + (i - 2) * 6.5)); let z = zc + 110; while (z < zc + 230 && ism(x, z) < -1.2) z += 0.5;
      if (i < 3 && inside(x, z)) boat(0, x, ground(x, z) - 0.1, z, (hv(i, 6) - 0.5) * 0.5, hv(i, 7), hv(i, 8));
      const zp = z - 30 - hv(i, 9) * 12, xp = x + 2; if (inside(xp, zp)) plant(TREES[3 + (hv(i, 10) < 0.5 ? 1 : 0)], xp, zp, hv(i, 11) * 6, 1 + hv(i, 12) * 0.4);
    }
  }
  // The suspension bridges to the island, two to a crossing: each 370 m from abutment to abutment with towers 70 m in from either end. The deck in
  // lengths of 6 m with a steel rail each side; two concrete towers of two legs joined by beams, standing in the sea; a main cable down each side
  // from anchorage to tower top, hanging in a curve to just above the deck at the middle of the span, and up again; hangers from it every 6 m.
  if (isOf(oz + CH / 2) && abs(oz + CH / 2 - IS.zc) < 520 + CH) {
    const zc = IS.zc, TOP = 40, yD = (z) => roadY(z);
    for (const e of [-1, 1]) {
      const zA = zc + e * 150, dir = e, L = 370, zOf = (t) => zA + dir * t;                       // t: metres along the bridge from the island end
      const cab = (t) => { const zt = zOf(t), u = t < 70 ? t / 70 : t > 300 ? (370 - t) / 70 : 1 - 4 * ((t - 185) / 230) ** 2;        // the cable's height above the deck: straight up the side spans, a parabola between the towers
        return t < 70 || t > 300 ? 1.2 + (TOP - 1.2) * u : 2.2 + (TOP - 2.2) * (1 - u); };
      for (let j = -1; j < 63; j++) {          // (one more length at each end lies on the road's bank as an approach slab, so the deck's square end never hangs beside the land)
        const ap = j < 0 || j > 61, t0 = j < 0 ? -4.5 : j > 61 ? L : j * L / 62, t1 = j < 0 ? 0 : j > 61 ? L + 4.5 : t0 + L / 62, z0 = zOf(t0), z1 = zOf(t1), x0 = roadX(z0), x1 = roadX(z1);
        // (an approach slab's outer end dips 6 cm into the road it lies on: left level, the 3 cm of its square end showed as a pale line across the road)
        const y0 = yD(z0) - (j < 0 ? 0.06 : 0), y1 = yD(z1) - (j > 61 ? 0.06 : 0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, my = (y0 + y1) / 2;
        if (!inside(mx, mz)) continue;
        const hl2 = hypot(x1 - x0, z1 - z0), len = hypot(hl2, y1 - y0) + 0.004, yw = atan2(x1 - x0, z1 - z0), tl = -atan2(y1 - y0, hl2), c = cos(yw), sn = sin(yw);
        { const D = deckBox(x0, y0, z0, x1, y1, z1, 1.4, 10.4); boxes.push(D[0], D[1], D[2], yw, 10.4, 1.4, D[3], tl, 30, 0, 1.4, 0); }
        // (the approach slabs carry no rail or kerb: those end with the bridge itself - run on along the slab they stood out 4.5 m past the
        // bridge's end, beyond the pole that stands there, over the grass)
        if (!ap) for (const sd of [-1, 1]) {
          const px = mx + sd * 4.9 * c, pz = mz - sd * 4.9 * sn;
          boxes.push(px, my + 0.2, pz, yw, 0.3, 0.34, len, tl, 2, 0, 0.34, 0, px, my + 1.05, pz, yw, 0.1, 0.1, len, tl, 34, 0, 0.1, 0, px, my + 0.66, pz, yw, 0.06, 0.06, len, tl, 34, 0, 0.06, 0);
          // (the rail stops a car, its whole length: its kerb and its two bars are each too slight to count as solid by themselves (see col,
          // below), and only its posts did, 6 m apart - a car went out between them, off the deck's edge and down beside it)
          xcol.push(px, pz, yw, 0.15, len / 2 + 0.02, my, my + 1.15);
          boxes.push(mx + sd * 4.9 * c - (z1 - z0) / 2 * 0, my + 0.6, pz, yw, 0.09, 0.9, 0.09, 0, 34, 0, 0.9, 0);
          const cx0 = x0 + sd * 5.6 * c, cz0 = z0 - sd * 5.6 * sn, cx1 = x1 + sd * 5.6 * c, cz1 = z1 - sd * 5.6 * sn, h0 = cab(t0), h1 = cab(t1);
          // the main cable (each length run on a little past both its ends, into the next: it turns at every hanger, and cut square there
          // the two ends stood open on the outside of the turn - a gap in the cable at every joint)
          { const ax = cx1 - cx0, ay = y1 + h1 - y0 - h0, az = cz1 - cz0, al = hypot(ax, ay, az) || 1, e = 0.16 / al; far.push(cx0 - ax * e, y0 + h0 - ay * e, cz0 - az * e, 0.2, cx1 + ax * e, y1 + h1 + ay * e, cz1 + az * e, 0.2, -1, 4); }
          if (h0 > 2.6 && j % 1 === 0) far.push(cx0, y0 + 0.2, cz0, 0.045, cx0, y0 + h0, cz0, 0.045, -1, 4);                    // a hanger
          // the power line crosses on the bridge: one thick black cable clipped along the outside of the rail on the side the poles stand, on a
          // bracket every few lengths (BRC: how far out, how high - the poles at each end bring their line down to it, below)
          if (sd > 0) { far.push(x0 + BRC[0] * c, y0 + BRC[1], z0 - BRC[0] * sn, 0.04, x1 + BRC[0] * c, y1 + BRC[1], z1 - BRC[0] * sn, 0.04, -1, 1);
            if (j % 3 === 0) boxes.push(x0 + (BRC[0] - 0.13) * c, y0 + BRC[1] - 0.07, z0 - (BRC[0] - 0.13) * sn, yw, 0.36, 0.06, 0.07, 0, 34, 0, 0, 0); }
        }
      }
      for (const tt of [70, 300]) {
        const zt = zOf(tt), x = roadX(zt), y = yD(zt), a = atan2(roadX(zt + 1) - roadX(zt - 1), 2), c = cos(a), sn = sin(a); if (!inside(x, zt)) continue;
        const H = y + TOP - (SEA - 3);
        for (const sd of [-1, 1]) boxes.push(x + sd * 5.6 * c, SEA - 3 + H / 2, zt - sd * 5.6 * sn, a, 1.5, H, 2.6, 0, 2, 0, H, 0, x + sd * 5.6 * c, SEA + 0.6, zt - sd * 5.6 * sn, a, 4.0, 3.2, 6.0, 0, 2, 0, 3.2, 0);
        boxes.push(x, y + TOP - 1.4, zt, a, 11.2, 2.2, 2.2, 0, 2, 0, 2.2, 0, x, y + TOP * 0.52, zt, a, 11.2, 1.6, 2.0, 0, 2, 0, 1.6, 0, x, y - 2.4, zt, a, 11.2, 2.0, 2.4, 0, 2, 0, 2.0, 0);
        reach = max(reach, 20);
      }
      for (const tt of [-1.0, 371.0]) {          // anchorages: a block of concrete on the bank at each end of each main cable, which runs down into it
        const zt = zOf(tt), a = atan2(roadX(zt + 1) - roadX(zt - 1), 2), c = cos(a), sn = sin(a);
        // (broad enough to take the rail's end as well as the cable's: from 4.55 m out - the rail and its kerb stand at 4.9 - to 6.5. Under the
        // cable alone, the rail ran on beside it and stopped in the air a hand's breadth off its face.)
        for (const sd of [-1, 1]) { const x = roadX(zt) + sd * 5.525 * c, z = zt - sd * 5.525 * sn; if (inside(x, z)) boxes.push(x, yD(zt) + 0.1, z, a, 1.95, 3.6, 3.4, 0, 2, 0, 3.6, 0); }
      }
      // A steel guard rail along both sides of the road for the last 40 m before each end of the bridge, running into the anchorage: there the
      // road stands on its own bank, falling away to the shore on either hand, and a car that left it rolled down beside the bridge's end and
      // under its deck. Posts every 4 m, a beam at bumper height; solid all along (xcol).
      for (const [ta, tb] of [[-42.7, -2.7], [372.7, 412.7]]) for (let g = 0; g < 10; g++) { const t0 = ta + g * 4, t1 = t0 + 4, z0 = zOf(t0), z1 = zOf(t1);
        for (const sd of [-1, 1]) { const a0 = atan2(roadX(z0 + 1) - roadX(z0 - 1), 2), a1 = atan2(roadX(z1 + 1) - roadX(z1 - 1), 2), x0 = roadX(z0) + sd * 4.9 * cos(a0), q0 = z0 - sd * 4.9 * sin(a0), x1 = roadX(z1) + sd * 4.9 * cos(a1), q1 = z1 - sd * 4.9 * sin(a1), mx = (x0 + x1) / 2, mz = (q0 + q1) / 2;
          if (!inside(mx, mz)) continue; const y0 = yD(z0), y1 = yD(z1), my = (y0 + y1) / 2, hl = hypot(x1 - x0, q1 - q0), yw = atan2(x1 - x0, q1 - q0), tl = -atan2(y1 - y0, hl);
          boxes.push(mx, my + 0.62, mz, yw, 0.06, 0.3, hl + 0.04, tl, 34, 0, 0.3, 0); boxes.push(x0, y0 + 0.2, q0, yw, 0.12, 1.1, 0.1, 0, 34, 0, 1.1, 0);
          xcol.push(mx, mz, yw, 0.12, hl / 2 + 0.02, my - 0.3, my + 1.0); } }
      for (const tt of [2.3, 367.7]) {          // abutments: a block of concrete under each end of the deck, its top below the deck, closing the end of the road's bank
        const zt = zOf(tt), x = roadX(zt), a = atan2(roadX(zt + 1) - roadX(zt - 1), 2); if (inside(x, zt)) boxes.push(x, yD(zt) - 7.4, zt, a, 14, 12, 4.4, 0, 2, 0, 12, 0);
      }
    }
  }
  // bridges: the deck in short lengths that follow the road, a white concrete balustrade each side, piers standing in a river
  for (const zq of [oz - 20, oz + CH / 2, oz + CH + 20]) {
    if (!rivOf(zq) || (zq !== oz + CH / 2 && rivOf(oz + CH / 2) && abs(RV.zr - (rivOf(zq), RV.zr)) < 1)) continue;
    rivOf(zq); const zb = RV.zb, W = RV.W, Lb = W + 14, wl = RV.wl, n = Math.ceil(Lb / 4), sl = Lb / n, river = RV.amp > 0.5;
    for (let j = 0; j < n; j++) {
      const z0 = zb - Lb / 2 + j * sl, z1 = z0 + sl, x0 = roadX(z0), x1 = roadX(z1), y0 = roadY(z0), y1 = roadY(z1), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, my = (y0 + y1) / 2;
      if (!inside(mx, mz)) continue;
      const len = hypot(x1 - x0, sl), yw = atan2(x1 - x0, sl), tl = -atan2(y1 - y0, len), c = cos(yw), sn = sin(yw);
      { const D = deckBox(x0, y0, z0, x1, y1, z1, 1.0, 9.4); boxes.push(D[0], D[1], D[2], yw, 9.4, 1.0, D[3] + 0.03, tl, 30, 0, 1.0, 0); }
      for (const sd of [-1, 1]) {
        const px = mx + sd * 4.5 * c, pz = mz - sd * 4.5 * sn;
        boxes.push(px, my + 0.16, pz, yw, 0.36, 0.26, len + 0.06, tl, 19, 0, 0.26, 0, px, my + 0.62, pz, yw, 0.14, 0.12, len + 0.06, tl, 19, 0, 0.12, 0, px, my + 1.0, pz, yw, 0.22, 0.16, len + 0.06, tl, 19, 0, 0.16, 0);
        xcol.push(px, pz, yw, 0.18, len / 2 + 0.03, my, my + 1.1);      // (the balustrade stops a car all along it, not only at its posts)
        for (const e of [-0.5, 0]) boxes.push(px + e * sl * sn, my + 0.6 + (e ? (y0 - y1) / 2 : 0), pz + e * sl * c, yw, 0.24, 0.9, 0.24, 0, 19, 0, 0.9, 0);
        if (j === 0 || j === n - 1) { const e = j === 0 ? -0.5 : 0.5; boxes.push(px + e * sl * sn, my + 0.7, pz + e * sl * c, yw, 0.5, 1.4, 0.5, 0, 18, 0.25, 1.4, 0); }       // end pillars
      }
    }
    if (river) { const np = Math.max(1, Math.round(W / 11) - 1); for (let i = 1; i <= np; i++) {
      const z = zb - W / 2 + W * i / (np + 1), x = roadX(z), y = roadY(z); if (!inside(x, z)) continue;
      const yw = atan2(roadX(z + 1) - roadX(z - 1), 2), c = cos(yw);
      for (const sd of [-2.7, 2.7]) far.push(x + sd * c, wl - 2.5, z, 0.5, x + sd * c, y - 1.5, z, 0.45, -1, 0);
      boxes.push(x, y - 1.25, z, yw, 8.6, 0.6, 1.1, 0, 2, 0, 0.6, 0);
    } }
    // trees and bananas crowd the banks
    for (let t = 0; t < 7; t++) { const x = ox + R() * CH, sd = R() < 0.5 ? -1 : 1, z = RV.zr + rivM(x) + sd * (W / 2 + 3.5 + R() * 7), pk = R(), tn = R() * TAU, sc = 0.8 + R() * 0.5; if (inside(x, z) && abs(x - roadX(z)) > 9) plant(TREES[pk < 0.5 ? BL[floor(pk * 16)] : pk < 0.7 ? 7 : pk < 0.82 ? 3 : 8], x, z, tn, sc); rivOf(zq); }
    for (let t = 0; t < 2; t++) { const x = ox + R() * CH, z = RV.zr + rivM(x) + (R() - 0.5) * W * 0.45, yw = PI / 2 + (R() - 0.5) * 0.5 + (R() < 0.5 ? PI : 0), s1 = R(), s2 = R(), pk = R(); if (river && pk < 0.3 && inside(x, z) && abs(x - roadX(z)) > 14) boat(0, x, wl - 0.14, z, yw, s1, s2, 1); }
  }
  // a house now and then, set back from the road and facing it, with coconut palms and bananas in the yard
  const hwc = hillW(oz + CH / 2), snc = snowW(oz + CH / 2);
  // Along a coast stretch, and for as far each way as the sea is felt at all (the paddies stop where it begins to be), the flat land beside the road
  // was bare turf with a sugar palm here and there - most of all toward the ends of the stretch, where the shore draws away up to half a kilometre.
  // It is coastal scrub: coconut groves with clearings between them, bushes everywhere, bananas and the odd shade tree, and casuarinas along the
  // back of the beach; on the landward side the same, thinner. (As many to a chunk wherever the sea is felt: not fewer where it is felt less.)
  // What is planted follows what grows on Thai shores (beach forest: casuarina, pandanus and other scrub at the back of the beach, where the wind
  // and the salt spray are; coconut everywhere; shade trees and bananas only further in, in the lee): tw is metres inland from the top of the beach.
  if (seaZ(oz + CH / 2) > 0.5 && twc < 0.3) { const isl = isOf(oz + CH / 2); for (let t = 0; t < 34; t++) {
    const x = ox + R() * CH, z = oz + R() * CH, dx = x - roadX(z), pick = R(), turn = R() * TAU, sc = 0.8 + R() * 0.6, sb = R();
    const tw = isl ? -ism(x, z) - 18 : dx > 0 ? shoreX(z) - 23 - dx : 400;      // (the trees stand at the back of the beach, behind the line of the umbrellas - which are kept clear of trunks: see the beach, below)
         // (the landward side of the coast road is all 'far in')
    if (tw < 0 || (isl ? abs(dx) < 9 : dx > -32 && dx < mix(26, 16, beachW(z)) + 3) || (!isl && dx < 0 && pick > 0.55)) continue;      // (not on the strip by the road, which has its own planting; half as many inland of the coast road)
    if (pn(x * 0.021 + 5, z * 0.021) < 0.4) { if (pick < 0.16) plant(TREES[8 + (sb < 0.25 ? 1 : 0)], x, z, turn, 1.2 + sb * 0.8, 2); continue; }      // a clearing: only a bush now and then
    const q = !isl && dx < 0 ? pick / 0.55 : pick;
    if (tw < 30 && q < 0.45) plant(TREES[12 + (sb < 0.5 ? 1 : 0)], x, z, turn, sc, 2, false, 7);
    else if (q < 0.5) plant(TREES[3 + (sb < 0.5 ? 1 : 0)], x, z, turn, sc);
    else if (q < 0.76 || tw < 60) plant(TREES[8 + (sb < 0.25 ? 1 : 0)], x, z, turn, 1.3 + sb * 0.9, 2);
    else if (q < 0.84 && tw > 120) plant(TREES[7], x, z, turn, 0.9 + sb * 0.4);
    else plant(TREES[BL[floor(sb * 7.99)]], x, z, turn, sc, 2, false, 7);
  } }
  if (swc > 0.3) {
    // the coast road: a steel rail along the sea side, raised red-and-white kerbs, a stone retaining wall along the bank, warning signs
    for (let k = Math.ceil(oz / 4); k * 4 < oz + CH; k++) {
      const z = k * 4; if (seaW(z) < 0.35 || pineWt(z) > 0.35) continue;
      const rx0 = roadX(z), rx1 = roadX(z + 4), y = roadY(z), y1 = roadY(z + 4), len = hypot(rx1 - rx0, 4), yw = atan2(rx1 - rx0, 4), tl = -atan2(y1 - y, len), mx = (rx0 + rx1) / 2, my = (y + y1) / 2;
      if (inside(rx0 + 4.35, z)) {
        const gap = railGap(k);
        if (!gap || !railGap(k - 1)) boxes.push(rx0 + 4.35, y + 0.3, z, 0, 0.1, 0.75, 0.12, 0, 12, 0, 0, 0);
        if (!gap) boxes.push(mx + 4.28, my + 0.55, z + 2, yw, 0.05, 0.3, len + 0.05, tl, 12, 0, 0, 0);
        boxes.push(mx + 3.9, my + 0.06, z + 2, yw, 0.3, 0.2, len + 0.04, tl, 26, 0, 0, 0);
      }
      if (inside(rx0 - 5.92, z)) boxes.push(mx - 5.92, my + 0.06, z + 2, yw, 0.3, 0.2, len + 0.04, tl, 26, 0, 0, 0);
      if (inside(mx - 6.9, z + 2)) boxes.push(mx - 6.9, my + 1.0, z + 2, yw, 0.7, 3.6, len + 0.1, 0, 24, 0, 3.6, 0);
    }
    for (let k = Math.ceil(oz / 240); k * 240 < oz + CH; k++) {
      const z = k * 240 + 30, x = roadX(z) + 4.9; if (!inside(x, z) || seaW(z) < 0.4) continue;
      const y = ground(x, z);
      far.push(x, y - 0.2, z, 0.035, x, y + 2.1, z, 0.035, -1, 0);
      boxes.push(x, y + 2.25, z, PI / 2, 0.03, 0.72, 0.72, PI / 4, 5, ph(k, 61) < 0.5 ? 0.5 : 0.9, 0, 0);
    }
    for (let t = 0; t < 16 * swc; t++) {
      const x = ox + R() * CH, z = oz + R() * CH, dx = x - roadX(z);
      if (dx > 5.5 && dx < mix(26, 16, beachW(z))) plant(TREES[dx < 13 && R() < 0.3 ? 3 + (R() < 0.5 ? 1 : 0) : 8 + (R() < 0.2 ? 1 : 0)], x, z, R() * TAU, 0.8 + R() * 0.8);
      else if (dx < -9.5) plant(TREES[R() < 0.25 ? 3 + (R() < 0.5 ? 1 : 0) : BL[floor(R() * 8)]], x, z, R() * TAU, 0.75 + R() * 0.6, 2);
    }
    // the casuarina avenue: a row each side close to the road leaning in over it, a looser row behind
    for (let k = Math.ceil(oz / 5); k * 5 < oz + CH; k++) {
      const z = k * 5; if (!pineAt(z)) continue;
      for (const sd of [1, -1]) for (let row = 0; row < 2; row++) {
        if (ph(k * 4 + row, 11 + sd) < (row ? 0.45 : 0.12)) continue;
        const off = sd * (5.4 + row * 5 + ph(k, 7 + row + (sd > 0 ? 0 : 2)) * 3.5), x = roadX(z) + off; if (!inside(x, z)) continue;
        plant(TREES[12 + (ph(k, 5 + sd + row) < 0.5 ? 1 : 0)], x, z, (sd > 0 ? PI : 0) + (ph(k, 13 + row) - 0.5) * 0.7, 0.8 + ph(k, 15 + sd + row * 3) * 0.45);
      }
    }
    // the beach: coconut palms along its top, umbrellas and loungers, long-tail boats drawn up on the sand and moored in the shallows, a wooden pier
    for (let t = 0; t < 9; t++) { const z = oz + R() * CH, x = roadX(z) + 17 + R() * 11; if (inside(x, z) && seaW(z) > 0.6 && beachW(z) > 0.45) plant(TREES[3 + (R() < 0.5 ? 1 : 0)], x, z, R() * TAU, 0.9 + R() * 0.5); }
    for (let t = 0; t < 3; t++) {
      const z = oz + R() * CH, b = beachW(z), sx = shoreX(z), rx = roadX(z), a = atan2(roadX(z + 2) - roadX(z - 2), 4); if (seaW(z) < 0.7 || b < 0.6) { R(); R(); R(); continue; }
      let x = rx + sx - 13 - R() * 9; if (inside(x, z) && t < 2) { for (let j = 0; j < 3; j++) { const zz = z + j * 3.6; stamp(UMBRELLA, x, ground(x, zz) - 0.03, zz, a + PI / 2, ph(floor(z), j), 0); } clear([x, z + 3.6], 0, 7, 13); }
      x = rx + sx - 2.5 - R() * 4; const z2 = z + 14; if (inside(x, z2) && R() < 0.7) boat(0, x, ground(x, z2) - 0.1, z2, a + PI / 2 + (R() - 0.5) * 0.5, R(), R());
    }
    for (let t = 0; t < 2; t++) { const x = ox + R() * CH, z = oz + R() * CH, u = x - roadX(z) - shoreX(z), yw = R() * TAU, s1 = R(), s2 = R(); if (seaW(z) > 0.7 && u > 5 && u < 26 && beachW(z) > 0.5) boat(0, x, SEA - 0.14, z, yw, s1, s2, 1); }
    { const x = ox + R() * CH, z = oz + R() * CH, u = x - roadX(z) - shoreX(z), yw = R() * TAU, s1 = R(), s2 = R(); if (R() < 0.45 && seaW(z) > 0.75 && u > 35 && u < 200) boat(1, x, SEA - 0.5, z, yw, s1, s2, 1); }
    for (let k = Math.ceil(oz / 256); k * 256 < oz + CH; k++) {
      const z = k * 256 + 40; if (seaW(z) < 0.8 || beachW(z) < 0.7) continue;
      const x0 = roadX(z) + shoreX(z) - 12, yd = SEA + 1.25;
      for (let j = 0; j < 17; j++) {
        const x = x0 + j * 3; if (!inside(x, z)) continue;
        boxes.push(x, yd, z, 0, 3.04, 0.1, j > 13 ? 5 : 2.2, 0, 0, 0.7, 0.1, 0);
        const hw2 = j > 13 ? 2.4 : 1.0, yb = Math.min(ground(x, z), SEA) - 1.2;
        far.push(x, yb, z - hw2, 0.09, x, yd + (j % 2 ? 0 : 0.9), z - hw2, 0.08, -1, 3, x, yb, z + hw2, 0.09, x, yd, z + hw2, 0.08, -1, 3);
        if (j < 16) far.push(x, yd + 0.85, z - hw2, 0.03, x + 3, yd + 0.85, z - (j + 1 > 13 ? 2.4 : 1.0), 0.03, -1, 3);
      }
    }
  }
  // A house in the fields, beside the road. Where it stands is drawn by lot from the chunk's own place alone (plainHouse), so that the chunk next to
  // this one can know it too: the house's drive runs out to the road and may cross into that chunk, which has to paint its part of it.
  // The drive is beaten earth - two wheel tracks worn bare, thin grass between them: it is marked in the ground's own grid (the number that says
  // 'water' when positive: negative, it says how far it is to the middle of a drive, -0.45 on it .. -0.05 at 4 m), which the ground's paint reads
  // (terrain.wgsl) and the grass keeps off (growGrass). The house stands on a line of the grid, so that this distance comes out exact.
  const plainRow = hwc < 0.4 && twc < 0.15 && swc < 0.1 && snc < 0.1 && flwW(oz + CH / 2) < 0.05;      // (no houses where the flower fields come up to the road)
  const plainHouse = (qx) => { const H = rng(ph(qx, cz + 7717) * 4294967296), ok = H() < 0.34, z0 = Math.round((oz + 8 + H() * (CH - 16)) / GS) * GS, side = H() < 0.5 ? 1 : -1; let z = z0;
    // (on the side the power line runs down, the mouth of the drive is kept 4 m clear of the poles - one every 40 m - and of the kilometre stone)
    if (side > 0) { const p0 = Math.round(z / 40) * 40, p = rp(p0, 5.6)[1]; if (abs(z - p) < 4.5) z = Math.round((p + (z >= p ? 4.5 : -4.5)) / GS + (z >= p ? 0.5 : -0.5)) * GS;      // (measured where the pole really stands: on a bend square off the road it is carried along z)
      const s = Math.round((z - 3) / 1000) * 1000 + 3; if (abs(z - s) < 4) z = s + 5; }
    let x = roadX(z) + side * (17 + H() * 13);
    // (the yard's wall reaches 9 m toward the road and 10 m along it each way of the house: where the road bends toward the yard, a corner or the
    // wall along the side stood on the road. Every point of the wall is kept 7 m from the road's middle - the house moves back as far as it must.)
    for (let it = 0; it < 4; it++) { let dm = 1e9;
      for (let lx = -10; lx <= 10; lx += 2.5) for (const lz of [9, 1, -7]) { const wx = x - side * lz, wz = z + side * lx; dm = min(dm, side * (wx - roadX(wz))); }
      if (dm >= 7) break; x += side * (7 - dm + 0.5); }
    return ok && plainRow && x > qx * CH + 11 && x < qx * CH + CH - 11 && !(rivOf(z) && abs(z - RV.zr) < RV.W / 2 + 48) && ism(x, z) < -50 ? [x, z, side] : null; };      // (and not in the sea, nor on the shore of the island crossing)
  // (a path is a straight run from a to b; what is marked is the distance to it, the least where several meet)
  const pathSeg = (ax, az, bx, bz) => { const ux = bx - ax, uz = bz - az, L2 = ux * ux + uz * uz || 1;
    for (let j = 0; j < M; j++) { const pz = oz + (j - 1) * GS; if (pz < min(az, bz) - 4 || pz > max(az, bz) + 4) continue;
      for (let i = 0; i < M; i++) { const px = ox + (i - 1) * GS, t = clamp(((px - ax) * ux + (pz - az) * uz) / L2, 0, 1), dl = hypot(px - ax - ux * t, pz - az - uz * t), k = j * M + i; if (dl >= 4 || hwet[k] > 0) continue;
        hwet[k] = min(hwet[k], -(0.05 + 0.4 * (1 - dl / 4))); if (i > 0 && i <= N && j > 0 && j <= N) v[((j - 1) * N + i - 1) * 7 + 6] = hwet[k]; } } };
  const drive = (h) => pathSeg(roadX(h[1]) + h[2] * 3.9, h[1], h[0] - h[2] * 3, h[1]);
  const myHouse = plainHouse(cx), drives = [];      // drives: [z, side] of every drive that reaches this chunk; onDrive: is this place at the road's edge in the mouth of one (no post stands there)
  // (a drive's mouth is 2.8 m each way of its middle; a temple's way, with its verges and its rows of trees, 7.5 m - its third number; m: more room still)
  const onDrive = (z, sd, m = 0) => { for (const d of drives) if (d[1] * sd > 0 && abs(z - d[0]) < (d[2] || 2.8) + m) return true; return false; };
  for (const q of [cx - 1, cx + 1]) { const h = plainHouse(q); if (h && !isOf(h[1])) { drive(h); drives.push([h[1], h[2]]); homes.push(h[1], h[2]);      // (and its length is kept clear of trees and of the roadside fence here too)
    const d0 = abs(h[0] - roadX(h[1])), sn = -h[2]; clear([h[0] + (3 + d0 - 4.6) / 2 * sn, h[1]], -h[2] * PI / 2, 4.4, d0 - 7.6); } }      // (on the island crossing a house may yet be left out, below: there only its own chunk paints the drive)
  // The fishing village on the island has its paths too: each house of the row by the road its own, straight out to the road; behind that row a
  // lane the houses of the back row give onto, which comes out to the road before the first house.
  if (vil.length) { const zc = vil.zc, lx = (z) => roadX(z) + 37.5, z0 = zc + 29; let zb = -1e9;
    for (const h of vil) { const z = h[1], front = h[0] - roadX(z) < 36, xa = front ? roadX(z) + 3.9 : lx(z), xb = h[0] - 3; pathSeg(xa, z, xb, z); clear([(xa + xb) / 2, z], -PI / 2, 3.2, xb - xa);
      if (front) drives.push([z, 1]); else zb = max(zb, z); }
    if (zb > z0) { for (let z = z0; z < zb; z += 6) { const z1 = min(z + 6, zb); pathSeg(lx(z), z, lx(z1), z1); clear([lx((z + z1) / 2), (z + z1) / 2], 0, 3.2, z1 - z); }
      pathSeg(roadX(z0) + 3.9, z0, lx(z0), z0); clear([roadX(z0) + 20.7, z0], -PI / 2, 3.2, 33.6); drives.push([z0, 1]); } }
  // A temple in the country (watOf in land.js). Every chunk it reaches marks its ground - swept earth all over the compound (-0.48 in the grid's
  // mark: bare, nothing grows, no paddy is painted there) and an earth track from the road to its gate - and keeps its own trees off the
  // buildings; the chunk its middle stands in builds it. Within the wall: the ordination hall, gable to the road; an open preaching hall; a
  // bell tower; a chedi; monks' houses on stilts at the back; flagpoles at the gate; and its great image at the far end, raised to be seen from
  // the road over wall and trees - a seated, standing or reclining Buddha, or a great chedi. On a hill the image stands on a higher plinth.
  for (const sg of new Set([floor(oz / SEG), floor((oz + CH) / SEG)])) { const T = watOf(sg); if (!T) continue; const ty = watY(T), rxT = roadX(T.z), xm = ox + CH / 2; if (T.dead || xm < min(rxT, T.x) - CH / 2 - 62 || xm > max(rxT, T.x) + CH / 2 + 62 || abs(T.z - (oz + CH / 2)) > CH / 2 + 46) continue;      // (every chunk from the road to the temple: its track crosses them all)
    for (let j = 0; j < M; j++) { const pz = oz + (j - 1) * GS; if (abs(pz - T.z) > 26) continue; for (let i = 0; i < M; i++) { const px = ox + (i - 1) * GS; if (abs(px - T.x) > 31) continue; const q = j * M + i; hwet[q] = -0.48; if (i > 0 && i <= N && j > 0 && j <= N) v[((j - 1) * N + i - 1) * 7 + 6] = -0.48; } }
    pathSeg(roadX(T.z) + T.side * 3.9, T.z, T.x - T.side * 30, T.z); drives.push([T.z, T.side, 7.5]);
    // (Some are reached by a made road, not an earth track: asphalt laid in lengths of 2 m - the ground's own grid - along the bank, following
    // its rise; each is a deep block sunk in the ground with only its top 2.5 cm proud, so none stands clear of it. It never lies on the main
    // road: its first 6 m are 23 strips 20 cm wide (so that its end is a clean line along a road that runs askew, not a flight of steps), each beginning where the road's own asphalt ends at its place - the road may curve and
    // tilt there - and each following the ground under itself.)
    if (T.paved) { const xr = roadX(T.z), slab = (x0, x1, z, w) => { const xm = (x0 + x1) / 2; if (!inside(xm, z)) return; const ya = ground(x0, z), yb = ground(x1, z), d = abs(x1 - x0);
        boxes.push(xm, (ya + yb) / 2 - 0.275, z, T.side * PI / 2, w, 0.6, hypot(d, yb - ya) + 0.04, -atan2(yb - ya, d), 52, 0, 0.12, 0); };
      // (the strips are only as long as the road's edge is askew across the way's width, and 2 m more for its tilt: beyond that one slab the whole width)
      let ext = 0; for (let q = 0; q < 23; q++) ext = max(ext, abs(roadX(T.z + (q - 11) * 0.2) - xr)); const aS = 3.6 + ext + 2;
      for (let q = 0; q < 23; q++) { const zq = T.z + (q - 11) * 0.2, x0 = roadX(zq) + T.side * 3.6, x1 = xr + T.side * aS; slab(x0, (x0 + x1) / 2, zq, 0.2); slab((x0 + x1) / 2, x1, zq, 0.2); }
      const xa = xr + T.side * aS, L = abs(T.x - T.side * 28.5 - xa), n = Math.ceil(L / 2), d = L / n; for (let i = 0; i < n; i++) slab(xa + T.side * i * d, xa + T.side * (i + 1) * d, T.z, 4.6); }
    clear([(roadX(T.z) + T.x) / 2, T.z], T.yaw, 19, abs(T.x - roadX(T.z)));
    // The way to a temple is made, not just laid across the fields: it has a grass verge 5 m wide down each side (the ground there is marked
    // -0.03 - grass, and no crop: see terrain.wgsl and growGrass), raised with it on the same bank, and a row of trees along each verge, one
    // every 6.5 m (their heads meet along the row), the two rows facing - an avenue from the road to the gate. Slender trees among the flowers, shade trees elsewhere.
    { const xa = rxT + T.side * 4.5, xb = T.x - T.side * 29, lo = min(xa, xb), hi = max(xa, xb);
      for (let j = 0; j < M; j++) { const pz = oz + (j - 1) * GS; if (abs(pz - T.z) > 9.1) continue; for (let i = 0; i < M; i++) { const px = ox + (i - 1) * GS, q = j * M + i; if (px < lo || px > hi || hwet[q] !== 0) continue; hwet[q] = -0.03; if (i > 0 && i <= N && j > 0 && j <= N) v[((j - 1) * N + i - 1) * 7 + 6] = -0.03; } }
      const L = abs(T.x - rxT), fl = flwS(T.s); for (let a = 12; a < L - 32; a += 6.5) for (const e of [-1, 1]) { const x = rxT + T.side * a, z = T.z + e * 5.4, h = ph(floor(a) * 7 + e, T.s + 8900); if (!inside(x, z)) continue;
          pend.push([fl ? TREES[19 + (h < 0.5 ? 1 : 0)] : TREES[BL[floor(h * 3)]], x, z, h * 40, fl ? 1.5 + 0.25 * h : T.hill ? 0.95 + 0.15 * h : 0.78 + 0.16 * h, 1, true, undefined, true, undefined, true]); } }
    clear([T.x, T.z], T.yaw, 48, 58);      // (no wild tree inside the wall: the temple plants its own, below)
    // (and on a hill, where the woods would hide it, the land between the road and the temple is open for 35 m either side of the track -
    // cleared ground, as a temple keeps its approach: its image is meant to be seen from the road)
    if (T.hill) clear([(rxT + T.x) / 2, T.z], T.yaw, 70, abs(T.x - rxT) + 10);
    if (!inside(T.x, T.z)) continue; reach = max(reach, 60); watRound = true;
    const F = frame(T.x, ty, T.z, T.yaw), put = F.put, hw = (m) => ph(T.s * 31 + m, 8800), gold = hw(1) < 0.72 ? 7 : 6;
    for (const e of [-1, 1]) { put(e * 13.1, 0.8, 28, 19.8, 1.6, 0.35, 41); put(e * 13.1, 1.68, 28, 20.0, 0.16, 0.55, 9, 0.05); put(e * 23, 0.8, 0, 0.35, 1.6, 56, 41); put(e * 2.9, 2.0, 28, 0.9, 4.0, 0.9, 41); put(e * 2.9, 4.2, 28, 1.2, 0.4, 1.2, 15);
      put(e * 4.6, 0.6, 29.2, 0.9, 1.2, 1.4, 41); put(e * 4.6, 1.5, 29.3, 0.6, 0.7, 0.7, 15);      // a guardian lion on its block, each side of the gate
      { const q = F.W(e * 6.2, 30); far.push(q[0], ty, q[1], 0.05, q[0], ty + 7.5, q[1], 0.035, -1, 0); 
        // (the flag is cloth, made as the town's is: six strips, each 20 cm, hung out from the pole by its own distance from it - the seed - which the
        // vertex stage uses to stream it downwind and wave it; a single board through the pole stood stiff in any wind)
        for (let i = 0; i < 6; i++) { const d = (i + 0.5) * 0.2; boxes.push(q[0] + cos(T.yaw) * d, ty + 6.95, q[1] - sin(T.yaw) * d, T.yaw, 0.2, 0.8, 0.02, 0, 38, d, 0.8, 0); } } }
    put(0, 0.8, -28, 46, 1.6, 0.35, 41); put(0, 5.0, 28, 7.6, 2.2, 2.8, 9, 0.05, 0, 1); put(0, 5.9, 28, 4.4, 2.0, 2.2, 9, 0.05, 0, 1); put(0, 7.2, 28, 0.12, 1.0, 0.12, 15); put(0, 3.55, 28.5, 3.2, 0.75, 0.06, 23, 3 + 2 + 0.63, 0, 0, 0, -0.75);
    watHall(F.sub(-10, 8, PI / 2));
    { const S = F.sub(13, 6, PI / 2), p = S.put; p(0, 0.3, 0, 11, 0.6, 7.6, 41); for (let i = 0; i < 4; i++) for (const ez of [-1, 1]) p(-4.5 + i * 3, 2.3, ez * 3.1, 0.34, 3.4, 0.34, 41);      // the open hall (ศาลาการเปรียญ)
      p(0, 5.2, 0, 8.0, 2.8, 7.4, 9, 0.3, 0, 1); for (const ex of [-1, 1]) { p(ex * 4.9, 4.9, 0, 2.2, 2.2, 6.4, 9, 0.3, 0, 1); p(ex * 6.02, 4.9, 0, 0.06, 2.0, 5.6, 15, 0, 0, 1); p(ex * 6.2, 6.2, 0, 0.1, 0.8, 0.1, 15, 0, ex * 0.5, 0, PI / 2); } for (const ez of [-1, 1]) p(0, 4.0, ez * 4.2, 11.4, 0.08, 1.6, 9, 0.3, ez * 0.45);
      p(-3.6, 1.1, 0, 1.6, 1.0, 1.6, 15); clear([S.x, S.z], S.yaw, 13, 10); }
    { const S = F.sub(-18.5, 23.4, 0), p = S.put; p(0, 0.3, 0, 3.6, 0.6, 3.6, 41); for (const ex of [-1, 1]) for (const ez of [-1, 1]) p(ex * 1.25, 3.7, ez * 1.25, 0.32, 6.2, 0.32, 41); p(0, 3.5, 0, 3.0, 0.22, 3.0, 41); p(0, 6.7, 0, 3.4, 0.22, 3.4, 41);      // the bell tower
      p(0, 7.8, 0, 4.2, 1.9, 4.2, 9, 0.05, 0, 1); p(0, 7.8, 0, 4.2, 1.9, 4.2, 9, 0.05, 0, 1, PI / 2); S.chain([[0, 8.6, 0, 0.3], [0, 9.2, 0, 0.16], [0, 10.6, 0, 0.02]], 7); S.chain([[0, 5.9, 0, 0.14], [0, 5.5, 0, 0.3], [0, 4.9, 0, 0.42], [0, 4.85, 0, 0.46]], 7); clear([S.x, S.z], S.yaw, 5, 5); }
    { const q = F.W(15.5, 21); stamp(HOUSE, q[0], ty - 0.05, q[1], T.yaw - PI / 2, hw(20), hw(30)); clear(q, T.yaw, 12, 12); }      // the monks' house, by the gate
    // (On a hill the image is raised on a tall terrace and is larger: the woods there stand 10 to 17 m high, and from the road it has to show over them.)
    // Everything has its own ground (they were set down by fixed places once, whatever the size of the image, and stood in one another): the hall
    // on the left of the way in, the open hall on the right, the monks' house and the bell tower by the gate; the whole back of the court is the
    // image's. Its size is drawn by lot within what the court (or, on a hill, its terrace) holds; wI is half its breadth, zf where its front
    // comes to - and what stands before it and beside it is placed from those.
    // A standing image stands high even on the plain, as the great ones do: on a terrace of two tiers (on a hill every image has one, taller).
    // The terrace: grey stone below, each tier edged with a white balustrade - a rail on small posts between square piers - and at every corner
    // of both tiers a gilded bell-shaped finial on a pier; a flight of steps up the front of each tier, the upper between low side walls.
    const lift = T.hill ? 11 : T.kind === 1 ? 5.5 : 0, B = lift ? F.sub(0, -17, 0, lift) : F.sub(0, -17, 0), TW = T.hill ? 24 : 13, TD = T.hill ? 18 : 13;
    const HI = T.kind === 0 ? (T.hill ? 17 + 3 * hw(42) : 13 + 5 * hw(42)) : T.kind === 1 ? (19 + 6 * hw(42)) * (T.hill ? 1.3 : 1) : T.kind === 2 ? 24 + 6 * hw(42) : T.hill ? 2.6 + 0.4 * hw(40) : 2.3 + 0.5 * hw(40);
    const wI = lift ? TW / 2 + 2 : [0.55, 0.25, 0.54, 3.8][T.kind] * HI, zf = lift ? -17 + TD / 2 + 2 + 5 : -17 + [0.5, 0.27, 0.17, 3.9][T.kind] * HI, zA = zf + 1.6;
    if (lift) { const h1 = lift * 0.6, zF = -17 + TD / 2 + 2;
      put(0, lift / 2, -17, TW, lift, TD, 2); put(0, h1 / 2, -17, TW + 4, h1, TD + 4, 2); put(0, h1 + 0.05, -17, TW + 4.3, 0.22, TD + 4.3, 41); put(0, lift + 0.05, -17, TW + 0.3, 0.22, TD + 0.3, 41);
      for (let i = 0; i < 8; i++) { const hs = (i + 1) * h1 / 8; put(0, hs / 2, zF + (8 - i) * 0.6 - 0.3, 5, hs, 0.6, 41); }      // the lower flight
      for (let i = 0; i < 5; i++) { const hs = h1 + (i + 1) * (lift - h1) / 5; put(0, (h1 + hs) / 2, zF - 2 + (5 - i) * 0.4 - 0.2, 3.6, hs - h1, 0.4, 41); }      // the upper one, across the lower tier's walk
      for (const [w, d, yb, gap] of [[TW + 4, TD + 4, h1, 5.4], [TW, TD, lift, 4]]) { const hx2 = w / 2 - 0.25, hz2 = d / 2 - 0.25;
        for (const [ex, ez] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { put(ex * hx2, yb + 0.75, -17 + ez * hz2, 0.6, 1.3, 0.6, 41); F.chain([[0, yb + 1.4, 0, 0.36], [0, yb + 1.75, 0, 0.5], [0, yb + 2.2, 0, 0.44], [0, yb + 2.55, 0, 0.16], [0, yb + 3.3, 0, 0.02]].map((p) => [ex * hx2, p[1], -17 + ez * hz2, p[3]]), 7); }
        for (const ez of [-1, 1]) for (const e of [-1, 1]) { const x0 = ez > 0 ? gap / 2 : 0, len = hx2 - x0 - 0.3; if (len <= 0) continue; put(e * (x0 + len / 2 + (ez > 0 ? 0 : 0)), yb + 0.95, -17 + ez * hz2, len, 0.14, 0.2, 41); put(e * (x0 + len / 2), yb + 0.2, -17 + ez * hz2, len, 0.14, 0.24, 41);
            if (ez > 0) put(e * x0, yb + 0.6, -17 + ez * hz2, 0.4, 1.1, 0.4, 41); for (let q = 0.5; q < len; q += 0.55) F.putD(e * (x0 + q), yb + 0.57, -17 + ez * hz2, 0.12, 0.62, 0.12, 41); }
        for (const ex of [-1, 1]) { put(ex * hx2, yb + 0.95, -17, 0.2, 0.14, d - 1.1, 41); put(ex * hx2, yb + 0.2, -17, 0.24, 0.14, d - 1.1, 41); for (let q = -hz2 + 0.8; q < hz2 - 0.5; q += 0.55) F.putD(ex * hx2, yb + 0.57, -17 + q, 0.12, 0.62, 0.12, 41); } } }
    if (T.kind === 3) { watChedi(B, 0, 0, HI); if (!lift) for (const e of [-1, 1]) watChedi(F, e * (wI + 2.6), zf - 2, 0.5); }
    else { const pose = T.kind === 0 ? (hw(41) < 0.5 ? 1 : 0) : T.kind === 1 ? (hw(41) < 0.6 ? 2 : 3) : 4; watBuddha(B, 0, 0, HI, gold, pose); if (!lift && wI + 4.2 < 19.5) watChedi(F, wI + 4.2, -17, 0.75); }
    // (in front of the image: a low altar with a smaller gilded image seated on it, and an incense urn)
    if (T.kind !== 3) { watBuddha(F, 0, zA, 1.6, 7, 1); put(0, 0.5, zA + 1.6, 0.9, 1.0, 0.9, 15); }
    for (const [lx, lz, kt, sc] of [[20, 15, 19, 1.3], [-20, 3, 20, 1.3], [-4.6, 23.6, 19, 1.2], [5, 24.6, 20, 1.2], [4.8, 3, 19, 1.1], [-20.5, -25, 20, 1.3], [20.5, -25, 19, 1.3]]) { const q = F.W(lx, lz); if (inside(q[0], q[1])) pend.push([TREES[kt], q[0], q[1], hw(60 + lx) * 6, sc, 1, true, undefined, true, undefined, true]); }
    // From near to (putD): a paved way from the gate past the hall to the image; posts with gilded lotus caps along the wall; before the
    // image an urn for incense on its stand, racks of candles, offering boxes; stone benches under the trees; potted shrubs along the way; a
    // rack of small bells to be rung in passing; yellow flags of the faith on short poles.
    { const D = F.putD, zi = T.kind === 3 ? zf + 0.5 : zA + 2.0; for (let lz2 = 26.5; lz2 > zi; lz2 -= 3) { D(0, 0.03, lz2, 3.0, 0.06, 2.92, 2); if (lz2 < 25 && lz2 > zi + 2 && (floor(lz2) & 1)) for (const e of [-1, 1]) { F.chainD([[e * 2.1, 0, lz2, 0.17], [e * 2.1, 0.42, lz2, 0.27], [e * 2.1, 0.46, lz2, 0.3], [e * 2.1, 0.47, lz2, 0.2]], 3); const q = F.W(e * 2.1, lz2); if (inside(q[0], q[1])) pend.push([TREES[9], q[0], q[1], lz2 * 3 + e, 0.34, 2, true, undefined, true, undefined, true]); } }      // a clay pot with a flowering shrub in it
      for (let i = 0; i < 13; i++) { const p = -27 + i * 4.5; for (const e of [-1, 1]) { D(e * 23, 1.0, p, 0.5, 2.0, 0.5, 41); D(e * 23, 2.15, p, 0.34, 0.3, 0.34, 15); } if (i < 11 && abs(-22.5 + i * 4.5) > 4) { D(-22.5 + i * 4.5, 1.0, 28, 0.5, 2.0, 0.5, 41); D(-22.5 + i * 4.5, 2.15, 28, 0.34, 0.3, 0.34, 15); } }
      F.chainD([[0, 0, zi + 2.2, 0.28], [0, 0.5, zi + 2.2, 0.16], [0, 0.75, zi + 2.2, 0.42], [0, 1.05, zi + 2.2, 0.5], [0, 1.1, zi + 2.2, 0.44]], 7); for (let q = 0; q < 7; q++) F.tubeD([(q - 3) * 0.09, 1.08, zi + 2.2 + ((q * 37) % 5 - 2) * 0.06], 0.006, [(q - 3) * 0.1, 1.5, zi + 2.2 + ((q * 37) % 5 - 2) * 0.07], 0.005, 9);
      for (const e of [-1, 1]) { D(e * 2.0, 0.55, zi + 1.6, 0.5, 1.1, 0.5, 14); D(e * 2.0, 1.13, zi + 1.6, 0.56, 0.08, 0.56, 15); D(e * 3.4, 0.9, zi + 2.4, 1.6, 0.06, 0.5, 34); for (const g of [-0.7, 0.7]) D(e * 3.4 + g, 0.45, zi + 2.4, 0.06, 0.9, 0.06, 34); for (let q = 0; q < 6; q++) F.tubeD([e * 3.4 - 0.6 + q * 0.24, 0.93, zi + 2.4], 0.012, [e * 3.4 - 0.6 + q * 0.24, 1.15, zi + 2.4], 0.01, 6); }
      for (const [bx, bz, ya] of [[6.4, 3, PI / 2], [-20.3, 8, PI / 2], [20.4, 10, PI / 2]]) { D(bx, 0.45, bz, 1.9, 0.1, 0.55, 2, 0, 0, 0, ya); for (const g of [-0.7, 0.7]) D(bx + (ya ? 0 : g), 0.2, bz + (ya ? g : 0), 0.14, 0.4, 0.4, 2, 0, 0, 0, ya); }
      { const R = F.sub(4.4, 19.2, PI / 2); for (const g of [-2, 2]) R.tubeD([g, 0, 0], 0.06, [g, 2.2, 0], 0.05, 0); R.tubeD([-2.1, 2.1, 0], 0.04, [2.1, 2.1, 0], 0.04, 0); for (let q = 0; q < 7; q++) R.chainD([[-1.65 + q * 0.55, 2.06, 0, 0.03], [-1.65 + q * 0.55, 1.95, 0, 0.09], [-1.65 + q * 0.55, 1.72, 0, 0.14], [-1.65 + q * 0.55, 1.7, 0, 0.15]], 7); }
      for (const [fx, fz] of [[-21, 26], [21, 26], [-21, 10], [21, 10], [-21, -8], [21, -8]]) { F.tubeD([fx, 0, fz], 0.035, [fx, 3.6, fz], 0.025, 0); D(fx + 0.36, 3.25, fz, 0.7, 0.45, 0.02, 33, 0.3); } }
    // the board by the road that says a temple is this way
    // (the sign stands 5.5 m up the road from the way's middle, measured along z - not square off the road, which on a skew road would carry it into the way)
    { const zs = T.z + 5.5, q = [roadX(zs) + T.side * 5.6, zs], yb = ground(q[0], q[1]), yw = atan2(roadSl(zs), 1); for (const d of [-0.9, 0.9]) far.push(q[0] + d * sin(yw), yb, q[1] + d * cos(yw), 0.045, q[0] + d * sin(yw), yb + 2.9, q[1] + d * cos(yw), 0.045, -1, 0); boxes.push(q[0], yb + 2.4, q[1], yw + PI / 2, 2.3, 0.9, 0.06, 0, 23, 3 + 2 + 0.63, -0.9, 0); }
  }
  if (R() < 0.34 && plainRow) { R(); R(); R(); }      // (the lots that used to place the house: still drawn, so that everything after them falls as it did)
  if (myHouse) {
    const z = myHouse[1], side = myHouse[2], x = myHouse[0];
    if (!(vil.length && side > 0 && z > IS.zc + 15)) { drive(myHouse); drives.push([z, side]);
      const yaw = side > 0 ? -PI / 2 : PI / 2, c = cos(yaw), sn = sin(yaw), y = hAt(x, z) - 0.05, wall = R(), roof = R();
      const old = R() < 0.25; stamp(old ? HOUSE : HOUSE3, x, y, z, yaw, wall, roof); dbgHouse = [x, y, z, yaw];      // mostly ground-level block houses; the old stilt house is the rarer one
      { const d0 = abs(x - roadX(z)), l0 = 3, l1 = d0 - 4.6; clear([x + (l0 + l1) / 2 * sn, z + (l0 + l1) / 2 * c], yaw, 4.4, l1 - l0); homes.push(z, side); }      // the drive: from the front of the house out through the gate to the road's edge
      // the yard: a post-and-rail fence with a gap for the gate, a spirit house in the front corner, flowering shrubs along the fence
      const L2W = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
      const side2 = (ax, az, bx, bz) => {
        const n = Math.max(1, Math.round(hypot(bx - ax, bz - az) / 2.2)); let px, py, pz;
        for (let i = 0; i <= n; i++) { const [wx, wz] = L2W(mix(ax, bx, i / n), mix(az, bz, i / n)), wy = ground(wx, wz); far.push(wx, wy - 0.2, wz, 0.05, wx, wy + 1.1, wz, 0.045, -1, 3);
          if (i) for (const hh of [0.5, 0.95]) far.push(px, py + hh, pz, 0.028, wx, wy + hh, wz, 0.028, -1, 3); px = wx; py = wy; pz = wz; }
      };
      // Most newer houses stand behind a masonry wall (รั้วปูน): rendered block between square posts with caps, about 1.8 m high -
      // solid, or a low wall with steel bars above, or topped with ventilation blocks - and a sliding steel gate. Old houses keep the wooden rails.
      const fk = old ? 0 : R() < 0.72 ? 1 + floor(R() * 2.999) : 0, fs = R(), gs = R();
      const wallSide = (ax, az, bx, bz) => {
        const n = Math.max(1, Math.round(hypot(bx - ax, bz - az) / 2.6)); let px, py, pz;
        for (let i = 0; i <= n; i++) {
          const [wx, wz] = L2W(mix(ax, bx, i / n), mix(az, bz, i / n)), wy = ground(wx, wz);
          boxes.push(wx, wy + 0.9, wz, yaw, 0.26, 2.2, 0.26, 0, 18, fs, 2.2, 0, wx, wy + 2.03, wz, yaw, 0.34, 0.07, 0.34, 0, 19, 0, 0.07, 0);
          if (i) {
            const mx = (wx + px) / 2, my = Math.min(wy, py), mz = (wz + pz) / 2, len = hypot(wx - px, wz - pz) - 0.24, pw = atan2(-(wz - pz), wx - px);
            if (fk === 1) boxes.push(mx, my + 0.8, mz, pw, len, 2.0, 0.12, 0, 18, fs, 2.0, 0, mx, my + 1.83, mz, pw, len, 0.06, 0.2, 0, 19, 0, 0.06, 0);
            else if (fk === 2) boxes.push(mx, my + 0.3, mz, pw, len, 1.0, 0.14, 0, 18, fs, 1.0, 0, mx, my + 1.3, mz, pw, len, 1.0, 0.03, 0, 27, gs, 1.0, 0);
            else boxes.push(mx, my + 0.4, mz, pw, len, 1.2, 0.14, 0, 18, fs, 1.2, 0, mx, my + 1.3, mz, pw, len, 0.6, 0.1, 0, 28, 0, 0.6, 0, mx, my + 1.63, mz, pw, len, 0.06, 0.2, 0, 19, 0, 0.06, 0);
          }
          px = wx; py = wy; pz = wz;
        }
      };
      if (fk === 0) { side2(-10, -7, 10, -7); side2(-10, -7, -10, 9); side2(10, -7, 10, 9); side2(-10, 9, -1.6, 9); side2(1.6, 9, 10, 9); }
      else {
        wallSide(-10, -7, 10, -7); wallSide(-10, -7, -10, 9); wallSide(10, -7, 10, 9); wallSide(-10, 9, -1.9, 9); wallSide(1.9, 9, 10, 9);
        const [gx, gz] = L2W(4.2, 9.2), gy = ground(gx, gz); boxes.push(gx, gy + 0.9, gz, yaw, 3.9, 1.7, 0.05, 0, 27, gs, 1.7, 0);       // the sliding gate, on its track - run back open behind the wall, for the drive goes through
        const [tx, tz] = L2W(1.2, 9.14); boxes.push(tx, ground(tx, tz) + 0.02, tz, yaw, 7.4, 0.04, 0.08, 0, 12, 0, 0, 0);
      }
      { const [sx, sz] = L2W(7.6, 6.9); stamp(old ? SHRINE_A : SHRINE_B, sx, ground(sx, sz) - 0.05, sz, yaw, old ? 0.2 : 0, 0); }
      for (let k = 0; k < 6; k++) { const [bx2, bz2] = L2W(-9 + R() * 18, R() < 0.5 ? 8.3 : -6.3); if (inside(bx2, bz2)) plant(TREES[8 + (R() < 0.6 ? 1 : 0)], bx2, bz2, R() * TAU, 0.8 + R() * 0.5); }
      for (let k = 0; k < 5; k++) { const a = R() * TAU, rr = 6 + R() * 6, px = x + cos(a) * rr, pz = z + sin(a) * rr; if (inside(px, pz) && abs(px - roadX(pz)) > 8) plant(TREES[k < 2 ? 3 + (R() < 0.5 ? 1 : 0) : k < 4 ? 7 : BL[floor(R() * 8)]], px, pz, R() * TAU, 0.8 + R() * 0.4); }
    }
  }
  // hill country: forest in broad patches, right down to the roadside
  // The hill forest stands in patches with clearings between (the terrain shader darkens the ground under it by the same rule). Inside a patch
  // it is close woodland, about 70 trees to the hectare; the trees by the road are drawn whole, those further back with fewer, broader sprigs
  // and without their finest twigs. Under them, by the road, big shrubs and wild banana.
  // (And here and there the wood is old and close - a grove where it was never cut, half as many trees again and as many more, their heads
  // run together into one roof: the extra trees are planted only where a broad slow noise says this is such a grove, ~a third of the hills.)
  for (let t = 0, nT = 42 * hwc * (1 - twc), nX = nT + 34 * hwc * (1 - twc); t < nX; t++) {
    const x = ox + R() * CH, z = oz + R() * CH, d = abs(rdist(x, z));
    if (t >= nT && vnoise(x * 0.004 + 77, z * 0.004 + 13) < 0.56) continue;
    if ((d < (tunOf(z) && abs(abs(z - TN.zc) - TN.hl) < 24 ? 13 : 8.5) && !(inTun(z) && abs(z - TN.zc) < TN.hl - 24)) || fbm(x * 0.012 + 40, z * 0.012, 2) < 0.4) continue;      // (over a tunnel the wood closes across the line of the road)
    const T = chyAt(z) === 1 && R() < 0.72 ? TREES[14 + (R() < 0.5 ? 1 : 0)] : TREES[BL[floor(R() * 8)]], turn = R() * TAU, sz = R();      // on a cherry hill most of the wood is cherry
    // (Further back a tree is drawn from far off as its trunk alone - 7 lengths - under its leaves, which hide that the boughs are missing. A cherry
    // in flower has hardly a leaf: its trunk stood apart under a head of blossom hanging in the air. So a cherry keeps its boughs at any distance.)
    const fN = T === TREES[14] || T === TREES[15] ? undefined : 7;
    if (d < 22) plant(T, x, z, turn, 0.75 + sz * 0.7, 2); else if (d < 60) plant(T, x, z, turn, 0.75 + sz * 0.7, 3, false, fN); else plant(T, x, z, turn, 0.9 + sz * 0.6, 4, false, fN);
  }
  // the cherry road: a tree every eight or nine metres down both sides. The trunks are clear to four metres and the heads are big enough to
  // meet over the middle of the road, so the two rows make an arch of blossom that the car drives through, with nothing hanging in its way
  for (let k = Math.ceil(oz / 8.5) - 2; k * 8.5 < oz + CH + 17; k++) for (const sd of [-1, 1]) {
    const z0 = k * 8.5 + ph(k, 300 + sd) * 4, c = chyAt(z0); if (!c || townW(z0) > 0.05 || nearRiv(z0, 14) || (tunOf(z0) && abs(z0 - TN.zc) < TN.hl + 6)) continue;      // (none over a tunnel or in its mouth)
    const q = z0 / SEG - floor(z0 / SEG); if (ph(k, 310 + sd) > sm(0, 0.07, q) * sm(1, 0.93, q) * 0.95) continue;      // thinning out toward the ends of the stretch, and a gap here and there
    const offA = 6.3 + ph(k, 320 + sd) * 0.9, [x, z] = rp(z0, sd * offA); if (!inside(x, z) || abs(rdist(x, z)) < 5.6 || onDrive(z, sd, 1.5)) continue;      // (none in a drive's mouth)
    const TA = TREES[14 + (ph(k, 330 + sd) < 0.5 ? 1 : 0)], turnA = ph(k, 340 + sd) * TAU, scA = 1.08 + ph(k, 350 + sd) * 0.27;
    // (The arch and the petals belong to the tree: they are made only if the tree itself is planted - a tree may yet be refused, for a house or
    // water or an underpass where it stands, and its boughs were left hanging in the air with no trunk under them.)
    const arch = () => {
    // Where the trunk really is at a given height (it leans and wanders: the first eight lengths of the tree are its trunk), so that a bough of
    // the arch can spring from the trunk itself: begun on the upright line through the tree's foot, it hung in the air beside the trunk.
    const trunkAt = (h) => { const S = TA.segs, hs = h / scA, cT = cos(turnA), sT = sin(turnA); let px = 0, pz = 0;
      for (let i = 0; i < 8; i++) { const j = i * 10; if (hs <= S[j + 5] || i === 7) { const f = clamp((hs - S[j + 1]) / max(S[j + 5] - S[j + 1], 1e-3), 0, 1); px = mix(S[j], S[j + 4], f); pz = mix(S[j + 2], S[j + 6], f); break; } }
      return [(px * cT - pz * sT) * scA, (px * sT + pz * cT) * scA, hypot(px, pz) * scA]; };
    // The arch: from each trunk three long boughs climb out over the road, highest above the near lane, and end a little past the middle,
    // where they meet those from the other side. They carry blossom all along. Nothing of them is lower than five metres over the road.
    const gy0 = surf(x, z), E = (h, r) => Math.round(clamp(h, 0, 60) * 32) + min(r, 5) / 32;
    for (let b = 0; b < 3; b++) {
      const hb = (m) => ph(k * 8 + b, 410 + m + sd), dz = (b - 1) * 2.7 + (hb(0) - 0.5) * 1.6, y0 = 4.3 + hb(1) * 1.2, rise = 3.0 + hb(2) * 1.0, past = 0.3 + hb(3) * 1.5;
      const tk = trunkAt(y0), pt = (u) => { const off = offA - (offA + past) * u, q = rp(z0 + dz * u, sd * off), w = (1 - u) * (1 - u); return [q[0] + tk[0] * w, surf(q[0], q[1]) + y0 + rise * sin(u * 2.0), q[1] + tk[1] * w, offA - off + tk[2] * w]; };      // (from the trunk, easing onto its own line)
      let a = pt(0);
      for (let i = 1; i <= 6; i++) {
        const q = pt(i / 6); far.push(a[0], a[1], a[2], 0.115 - 0.016 * (i - 1), q[0], q[1], q[2], 0.115 - 0.016 * i, E(a[1] - gy0, a[3]), E(q[1] - gy0, q[3]));
        for (let j = 0; j < 22; j++) {
          const hj = (m) => ph((k * 8 + b) * 256 + i * 32 + j, 430 + m + sd), f = hj(0), L = 0.5 + hj(4) * 0.25, y = mix(a[1], q[1], f) + (hj(2) - 0.55) * 1.5;
          leaves.push(mix(a[0], q[0], f) + (hj(1) - 0.5) * 1.9, y, mix(a[2], q[2], f) + (hj(3) - 0.5) * 1.9, L, hj(5) * TAU, -0.35 + hj(6) * 1.1, L * 0.36, 0.5 + hj(7), 10, hj(8), 0.55 + 0.45 * hj(9), E(y - gy0, mix(a[3], q[3], f)));
        }
        a = q;
      }
    }
    for (let j = 0; j < 16; j++) {          // petals coming down round it, some of them over the road (leaf kind 11: yaw slot = where in its fall it starts, elevation slot = the height it falls)
      const a = ph(k * 16 + j, 360 + sd) * TAU, r = ph(k * 16 + j, 370 + sd) * 6.5, px = x + cos(a) * r, pz = z + sin(a) * r, gy = surf(px, pz), hh = 2.5 + ph(k * 16 + j, 380 + sd) * 4.5;
      leaves.push(px, gy + hh, pz, 0.085, ph(k * 16 + j, 390 + sd), hh, 0.032, 0, 11, ph(k * 16 + j, 400 + sd), 1, 0);
    }
    };
    plant(TA, x, z, turnA, scA, 2, true, undefined, true, arch);      // (true: it stays where it is put - its arch is built from that place)
  }
  // The golden shower road (ราชพฤกษ์): a tree every nine metres or so down both sides, well back on the verge, thinning toward the ends of the
  // stretch; none in a town, by a river, nor in the mouth of a drive.
  for (let k = Math.ceil(oz / 9) - 2; k * 9 < oz + CH + 18; k++) for (const sd of [-1, 1]) {
    const z0 = k * 9 + ph(k, 500 + sd) * 3; if (!kunAt(z0) || townW(z0) > 0.05 || nearRiv(z0, 14)) continue;
    const q = z0 / SEG - floor(z0 / SEG); if (ph(k, 510 + sd) > sm(0, 0.06, q) * sm(1, 0.94, q) * 0.93) continue;
    const [x, z] = rp(z0, sd * (7 + ph(k, 520 + sd) * 1.2)); if (!inside(x, z) || onDrive(z, sd, 1.5)) continue;
    // (and petals coming down round it, as round the cherries - only if the tree is planted, and where it stands once planted: a[1], a[2])
    const a = [TREES[21 + (ph(k, 530 + sd) < 0.5 ? 1 : 0)], x, z, ph(k, 540 + sd) * TAU, 0.95 + ph(k, 550 + sd) * 0.25, 2];
    a[9] = () => { for (let j = 0; j < 14; j++) { const n = k * 16 + j, an = ph(n, 560 + sd) * TAU, r = ph(n, 570 + sd) * 5.5, px = a[1] + cos(an) * r, pz = a[2] + sin(an) * r, hh = 2.5 + ph(n, 580 + sd) * 4;
      leaves.push(px, surf(px, pz) + hh, pz, 0.08, ph(n, 590 + sd), hh, 0.03, 1, 11, ph(n, 600 + sd), 1, 0); } };
    pend.push(a);
  }
  for (let t = 0; t < 10 * hwc * (1 - twc); t++) {
    const x = ox + R() * CH, z = oz + R() * CH, d = abs(rdist(x, z)), u = R(), sz = R(), turn = R() * TAU;
    if (d < 7 || d > 50 || fbm(x * 0.012 + 40, z * 0.012, 2) < 0.4) continue;
    if (u < 0.15 && townW(z) < 0.03) plant(TREES[7], x, z, turn, 1 + sz * 0.4); else plant(TREES[8], x, z, turn, 1.6 + sz, 2);
  }
  // The school and the football field (civSites): laid out along lane b, tt metres out from the road and l across toward lane b + 1; each
  // piece is this chunk's if it stands in it.
  if (twc > 0.2) for (let b = Math.floor((oz - 200) / 36); b * 36 + 34 < oz + CH + 200; b++) for (const side of [1, -1]) {
    const kind = civAt(b, side); if (!kind) continue;
    const zl = b * 36 + 34, sl = (roadX(zl + 1) - roadX(zl - 1)) / 2, ca = 1 / sqrt(1 + sl * sl), sa = sl * ca, ox0 = roadX(zl), Y = atan2(side * ca, -side * sa), hb = (j) => ph(b * 4 + (side > 0 ? 1 : 0), 7100 + j);
    const P = (tt, l) => [ox0 + side * tt * ca + l * sa, zl - side * tt * sa + l * ca], tm = (CIV_T0 + CIV_T1) / 2, [mx, mz] = P(tm, 18), y0 = ground(mx, mz);
    // (a box: along the lane by al, across it by ac, from its foot at yb over the ground's level here, h high)
    const B = (tt, l, yb, al, ac, h, mat, seed = 0, own = true) => { const q = P(tt, l); if (!inside(q[0], q[1])) return; boxes.push(q[0], (own ? y0 : ground(q[0], q[1])) + yb + h / 2, q[1], Y, ac, h, al, 0, mat, seed, h, 0); };
    const Pole = (tt, l, h, r, mat = -1) => { const q = P(tt, l); if (!inside(q[0], q[1])) return; const g = ground(q[0], q[1]); far.push(q[0], g - 0.2, q[1], r, q[0], g + h, q[1], r * 0.8, -1, mat === -1 ? 0 : mat); };
    clear(P(tm, 18), Y, 31, CIV_T1 - CIV_T0);
    // the fence round it: a rendered wall head high with a coping (a school), or a wire fence on posts (the field); the way in from lane b
    for (let tt = CIV_T0 + 1; tt < CIV_T1; tt += 3) { const gate = tt > tm - 8 && tt < tm - 2;
      if (!gate) { if (kind === 1) { B(tt + 1.5, 3.2, -0.6, 3, 0.2, 2.4, 18, 0.4, false); B(tt + 1.5, 3.2, 1.8, 3.02, 0.28, 0.08, 2, 0, false); } else Pole(tt, 3.2, 2.4, 0.04); }
      if (kind === 1) { B(tt + 1.5, 32.8, -0.6, 3, 0.2, 2.4, 18, 0.4, false); B(tt + 1.5, 32.8, 1.8, 3.02, 0.28, 0.08, 2, 0, false); } else Pole(tt, 32.8, 2.4, 0.04); }
    for (let l = 3.2; l < 32.8; l += 3) for (const tt of [CIV_T0 + 1, CIV_T1]) { if (kind === 1) { B(tt, l + 1.5, -0.6, 0.2, 3, 2.4, 18, 0.4, false); B(tt, l + 1.5, 1.8, 0.28, 3.02, 0.08, 2, 0, false); } else Pole(tt, l, 2.4, 0.04); }
    if (kind === 1) {
      for (const g of [tm - 8, tm - 2]) B(g, 3.2, -0.6, 0.5, 0.5, 2.4, 18, 0.4, false);      // the gate's piers
      // the main building: three floors, a long block along the lane at the back of the ground, its corridors facing the yard, a hipped tin roof
      const t0 = CIV_T1 - 44, t1 = CIV_T1 - 4, L = t1 - t0, tc = (t0 + t1) / 2, fl = 3, H = fl * 3.4, col = hb(1);
      B(tc, 26, -0.5, L, 10, H + 0.5, 7, col);
      for (let f = 1; f <= fl; f++) { B(tc, 19.9, f * 3.4 - 3.4 + (f > 1 ? 0 : 0.3), L, 2.2, 0.15, 2); if (f > 1) B(tc, 18.85, (f - 1) * 3.4 + 0.15, L, 0.08, 0.95, 18, 0.9); }
      for (let k = 0; k <= 10; k++) B(t0 + k * L / 10, 18.9, 0, 0.3, 0.3, H, 18, col);      // the corridor's columns
      B(tc, 22, H - 0.2, L, 5.6, 0.25, 2); B(tc, 23, H + 0.05, L + 1.2, 9.4, 1.3, 1, hb(2)); B(tc, 23, H + 1.35, L - 2, 4.2, 0.8, 1, hb(2));
      B(tc, 22.2, 0, 6, 2.2, 3.6, 3); B(tc, 18.4, 0, 8, 1.2, 0.3, 2);      // the stair hall's dark mouth, and its step
      // the yard in front: a concrete court for the morning line-up, the flag on its pole at the head of it, a basketball post each end
      for (let tt = CIV_T0 + 3; tt < t0 - 1; tt += 6) for (let l = 6; l < 31; l += 6) B(tt + 3, l + 3, -0.3, 6, 6, 0.33, 2, 11);
      { const tq = (CIV_T0 + t0) / 2; Pole(tq, 9, 9, 0.05); const q = P(tq, 9.6); if (inside(q[0], q[1])) { const g = ground(q[0], q[1]); for (let i2 = 0; i2 < 9; i2++) { const qq = P(tq, 9.15 + (i2 + 0.5) * 0.2); boxes.push(qq[0], g + 8.2, qq[1], Y + PI / 2, 0.2, 1.2, 0.02, 0, 38, (i2 + 0.5) * 0.2, 1.2, 0); } } }
      for (const tt of [CIV_T0 + 6, t0 - 5]) { Pole(tt, 18, 3.0, 0.06); B(tt + (tt < tm ? 0.2 : -0.2), 18, 2.75, 0.05, 1.8, 1.05, 19, 0); }
      for (let i2 = 0; i2 < 7; i2++) { const q = P(CIV_T0 + 8 + hb(10 + i2) * (t0 - CIV_T0 - 14), 7 + hb(20 + i2) * 22); addP(q[0], q[1], hb(30 + i2) * TAU, hb(40 + i2), hb(50 + i2)); }
      for (let i2 = 0; i2 < 4; i2++) plant(TREES[BL[floor(hb(60 + i2) * 8)]], ...P(CIV_T0 + 4 + i2 * 9, 5.2), hb(64 + i2) * 6, 0.8 + hb(68 + i2) * 0.3, 2, false, undefined, true);
    } else {
      // the pitch: mown turf in stripes, its white lines, two goals; a few playing and some watching from the side
      const pt0 = CIV_T0 + 6, pt1 = CIV_T1 - 6, pl0 = 6, pl1 = 30, PL = pt1 - pt0, pc = (pt0 + pt1) / 2, lc = (pl0 + pl1) / 2;
      for (let tt = CIV_T0 + 2; tt < CIV_T1 - 1; tt += 5) for (let l = 4; l < 32; l += 4) B(tt + 2.5, l + 2, -0.25, 5.02, 4.02, 0.28, 2, 12 + (floor((tt - CIV_T0) / 5) & 1) * 0.5, false);
      const ln = (tt, l, al, ac) => B(tt, l, 0.031, al, ac, 0.01, 19, 0, false);
      for (let tt = pt0; tt < pt1; tt += 2) { ln(tt + 1, pl0, 2, 0.1); ln(tt + 1, pl1, 2, 0.1); }
      for (let l = pl0; l < pl1; l += 2) { ln(pt0, l + 1, 0.1, 2); ln(pt1, l + 1, 0.1, 2); ln(pc, l + 1, 0.1, 2); }
      for (let k = 0; k < 16; k++) { const a0 = k / 16 * TAU, a1 = (k + 1) / 16 * TAU, r = 4.5; const tt = pc + r * (cos(a0) + cos(a1)) / 2, l = lc + r * (sin(a0) + sin(a1)) / 2; const q0 = P(pc + r * cos(a0), lc + r * sin(a0)), q1 = P(pc + r * cos(a1), lc + r * sin(a1)), qm = P(tt, l);
        if (inside(qm[0], qm[1])) boxes.push(qm[0], ground(qm[0], qm[1]) + 0.036, qm[1], atan2(q1[0] - q0[0], q1[1] - q0[1]), 0.1, 0.01, hypot(q1[0] - q0[0], q1[1] - q0[1]) + 0.04, 0, 19, 0, 0.01, 0); }
      for (const [ga, dir] of [[pt0, 1], [pt1, -1]]) { for (let l = lc - 7; l < lc + 7; l += 2) ln(ga + dir * 7, l + 1, 0.1, 2); ln(ga + dir * 3.5, lc - 7, 7, 0.1); ln(ga + dir * 3.5, lc + 7, 7, 0.1);
        for (const e of [-1, 1]) Pole(ga, lc + e * 2.5, 2.0, 0.05, 19); B(ga, lc, 2.0, 0.1, 5.1, 0.1, 19, 0, false); for (const e of [-1, 1]) { const q0 = P(ga, lc + e * 2.5), q1 = P(ga - dir * 1.6, lc + e * 2.5); if (inside(q0[0], q0[1])) { const g = ground(q0[0], q0[1]); far.push(q0[0], g + 2.0, q0[1], 0.035, q1[0], g + 0.05, q1[1], 0.03, -1, 19); far.push(q1[0], g + 0.05, q1[1], 0.03, q0[0], g + 0.05, q0[1], 0.03, -1, 19); } } }      // (the frame the net hangs from, back to the ground behind each post)
      for (let i2 = 0; i2 < 10; i2++) { const q = P(pt0 + 6 + hb(10 + i2) * (PL - 12), pl0 + 3 + hb(20 + i2) * (pl1 - pl0 - 6)); addP(q[0], q[1], 0, hb(40 + i2), hb(50 + i2), 1.6 + hb(30 + i2) * 1.6, 2.5 + hb(35 + i2) * 4, 2 + hb(45 + i2) * 3); }
      for (let i2 = 0; i2 < 6; i2++) { const q = P(pt0 + hb(70 + i2) * PL, pl0 - 1.8); addP(q[0], q[1], Y - side * PI / 2 * 0 + PI / 2 * side, hb(80 + i2), hb(90 + i2)); }
    }
  }
  // The town's green belt: behind the lanes' last houses and out beyond them, the town stands in trees - groves of shade trees and mango,
  // bananas and coconuts by the back fences, scrub and bushes between - thickening the further one goes from the street, so that from the road
  // or from above the town is ringed by green rather than by bare earth. (Each one is still refused where it would stand in a house or a wall -
  // see pend, below - and kept off the lanes.)
  if (twc > 0.2) for (let t = 0; t < 70 * twc; t++) {
    const x = ox + R() * CH, z = oz + R() * CH, d = abs(rdist(x, z)), u = R(), sz = R(), turn = R() * TAU;
    if (d < 34 || townW(z) < 0.3 || soiD(x, z) < 3.4 || nearRiv(z, 12)) continue;
    const gv = vnoise(x * 0.02 + 61, z * 0.02 + 17); if (u > sm(34, 130, d) * (0.3 + 0.9 * gv)) continue;
    const k = R(), lod = d < 60 ? 2 : d < 140 ? 3 : 4, T = k < 0.5 ? TREES[BL[floor(R() * 8)]] : k < 0.62 ? TREES[7] : k < 0.72 ? TREES[3 + (R() < 0.5 ? 1 : 0)] : TREES[8 + (R() < 0.3 ? 1 : 0)];
    if (k < 0.5) plant(T, x, z, turn, 0.8 + sz * 0.6, lod, false, lod > 2 ? 7 : undefined); else if (k < 0.72) plant(T, x, z, turn, 0.85 + sz * 0.4); else plant(T, x, z, turn, 1.4 + sz * 1.1, 2);
  }
  // and now and then a warning sign: wild animals cross here
  if (hwc > 0.6 && twc < 0.1) for (let k = Math.ceil(oz / 320) - 1; k * 320 < oz + CH + 320; k++) {
    const zs = k * 320 + 11, [x, z] = rp(zs, -(4.9 + 2.1 * hpT(zs))); if (!inside(x, z)) continue;      // (on switchbacks just behind the rail)
    const y = ground(x, z);
    far.push(x, y - 0.2, z, 0.035, x, y + 2.1, z, 0.035, -1, 0);
    boxes.push(x, y + 2.25, z, PI / 2, 0.03, 0.72, 0.72, PI / 4, 5, hpW(z) > 0 || hpW(z + 160) > 0 ? 0.5 : 0, 0, 0);     // before the switchbacks: winding road
  }
  for (let t = 0; t < 30 * (1 - hwc) * (1 - twc) * (1 - swc); t++) {
    let x = ox + R() * CH, z = oz + R() * CH; const pick = R(), turn = R() * TAU, sc = 0.8 + R() * 0.5, d = abs(rdist(x, z));
    if (d < 9 || (d > 10.5 && plantW(z) > 0.5)) continue;      // (a plantation is its own crop and nothing else: no shade trees, palms or bananas among its rows)
    if (snc > 0.3) { if (pick < 0.5) plant(TREES[pick < 0.4 ? 12 + (R() < 0.5 ? 1 : 0) : BL[floor(R() * 8)]], x, z, turn, sc * (pick < 0.4 ? 0.8 : 1)); }      // snowfield: conifers and the odd bare-looking tree
    else if (flwAt(z)) { if (d < vergeAt(z) - 2 && pick < 0.3) plant(TREES[19 + (R() < 0.5 ? 1 : 0)], x, z, turn, sc * 1.1, d < 30 ? 1 : 2); }      // a flower stretch: only small slender trees (no palms, no bananas), and none out among the flowers - those have their hedgerows, below
    else if (d < vergeAt(z) - 2) { if (pick < 0.6) { if (pick < 0.32) { const T = TREES[BL[floor(R() * 8)]]; if (d < 30) plant(T, x, z, turn, sc); else plant(T, x, z, turn, sc, 2, false, 7); } else plant(TREES[pick < 0.47 ? 3 + (R() < 0.5 ? 1 : 0) : 7], x, z, turn, sc); } }      // verge: shade trees, coconuts, bananas
    else if (d > vergeAt(z) + 6 && pick < 0.45 && seaZ(z) < 0.5 && plantW(z) < 0.5) {                                                 // paddies: sugar palms and the odd tree standing on the bunds
      if (R() < 0.5) x = Math.round(x / PLX) * PLX + (R() - 0.5) * 0.5; else z = Math.round(z / PLZ) * PLZ + (R() - 0.5) * 0.5;
      if (inside(x, z)) { if (pick < 0.36) plant(TREES[5 + (R() < 0.5 ? 1 : 0)], x, z, turn, sc); else plant(TREES[BL[floor(R() * 8)]], x, z, turn, sc, 2, false, 7); }
    }
  }
  // here and there a hedge of scrub, banana and young trees has grown up along the back of the verge, where it meets the fields
  for (let t = 0; t < 8 * (1 - hwc) * (1 - twc) * (1 - swc) * (snc > 0.3 ? 0 : 1); t++) {
    const z = oz + R() * CH, side = R() < 0.5 ? -1 : 1, off = R(), u = R(), sz = R(), turn = R() * TAU, d = vergeAt(z) - 3 - 8 * off, x = roadX(z) + side * d;
    if (d < 9.5 || !inside(x, z) || pn(z * 0.01, 3 + side) < 0.45 || plantW(z) > 0.5) continue;
    if (u < 0.55) plant(TREES[8 + (sz < 0.25 ? 1 : 0)], x, z, turn, 1.5 + sz * 0.9, 2); else if (flwAt(z)) plant(TREES[19 + (sz < 0.5 ? 1 : 0)], x, z, turn, 0.9 + sz * 0.4, 2); else if (u < 0.75 && townW(z) < 0.03) plant(TREES[7], x, z, turn, 0.9 + sz * 0.4); else plant(TREES[BL[floor(sz * 7.99)]], x, z, turn, 0.55 + sz * 0.3, 2, false, 7);
  }
  // The rubber plantation: trees in straight rows, a tree every few metres along the row (the rows run square to the road's general line, so
  // that driving past they open and close one after another); here and there a gap where a tree has died. On each trunk near the road, at the
  // height of a hand, the tapper's cup. The trees by the road are drawn whole, those further in with fewer, broader sprigs and without twigs.
  // (Set out from the lattice itself - not by lot - so the rows run on unbroken from one chunk to the next.)
  // (7 m between the rows and 3.5 m along them, near what a Thai plantation is planted at. Back beyond 110 m from the road - past where the near
  // rows hide everything - only every other tree is set, a little larger: a plantation as deep as the eye goes, at the cost of one half as deep.)
  if (rubW(oz) > 0.4 || rubW(oz + CH) > 0.4) { const T = TREES[16], S = T.segs;
    for (let j = Math.ceil(oz / 7); j * 7 < oz + CH; j++) { const zr = j * 7; if (rubW(zr) < 0.5 || nearRiv(zr, 26)) continue;
      for (let i = Math.ceil(ox / 3.5); i * 3.5 < ox + CH; i++) { const h = (m) => ph(i * 131 + m, j * 17 + 900), xr = i * 3.5; if (h(0) < 0.06 || !inside(xr, zr)) continue;
        const x = xr + (h(1) - 0.5) * 0.5, z = zr + (h(2) - 0.5) * 0.5, dd = rdist(x, z), d = abs(dd); if (d < 11 || !inside(x, z) || (d > 110 && ((i + j) & 1))) continue;
        const sc = (0.85 + h(3) * 0.3) * (d > 110 ? 1.15 : 1), turn = h(4) * TAU;
        // The tapping, on the trees near enough for it to be seen: a band of the trunk where the bark has been pared away year after year, dark
        // red-brown; along its top the cut, slanting down round the side that faces the road, white with latex; from the cut's low end a dribble
        // down to the cup - a black bowl held to the trunk. (tk: where the trunk, which does not stand quite upright, is at that height.)
        const tap = d < 45 ? () => { const sg = dd > 0 ? -1 : 1, y = ground(x, z), cT = cos(turn), sT = sin(turn);
          const tk = (hh) => { const f = clamp((hh / sc - S[1]) / max(S[5] - S[1], 1e-3), 0, 1), px = mix(S[0], S[4], f), pz = mix(S[2], S[6], f); return [x + (px * cT - pz * sT) * sc, z + (px * sT + pz * cT) * sc, mix(S[3], S[7], f) * sc]; };
          const p0 = tk(0.82), p1 = tk(1.38), pc = tk(1.38), rt = pc[2] * 1.03, zc = pc[1] + rt * 0.78, xc = pc[0] + sg * rt * 0.7;
          far.push(p0[0], y + 0.82, p0[1], p0[2] * 1.035, p1[0], y + 1.38, p1[1], p1[2] * 1.035, -102 - 1.1, 3);      // (-102 - height: it sways as the trunk does at that height - see branchV)
          far.push(pc[0] + sg * rt * 0.7, y + 1.52, pc[1] - rt * 0.78, 0.011, pc[0] + sg * rt * 1.05, y + 1.38, pc[1], 0.011, -102 - 1.4, 6, pc[0] + sg * rt * 1.05, y + 1.38, pc[1], 0.011, xc, y + 1.24, zc, 0.011, -102 - 1.3, 6);
          far.push(xc, y + 1.24, zc, 0.008, xc + sg * 0.02, y + 1.02, zc + 0.01, 0.008, -102 - 1.13, 6, xc + sg * 0.06, y + 0.9, zc + 0.03, 0.05, xc + sg * 0.06, y + 1.02, zc + 0.03, 0.075, -102 - 0.96, 1); } : undefined;
        if (d < 22) plant(T, x, z, turn, sc, 2, false, undefined, true, tap); else if (d < 60) plant(T, x, z, turn, sc, 3, false, 7, true, tap); else plant(T, x, z, turn, sc, 4, false, 7, true);
      } } }
  // The oil palm plantation: palms 9 m apart on a three-cornered lattice (each row set half a step along from the last, 7.8 m between rows), as
  // they are planted - from any side the eye runs down straight lanes between them. Round each foot a ring of bare trodden earth (painted by
  // terrain.wgsl on this same lattice). Those by the road are drawn whole, those further in with fewer, broader leaflets.
  // The fronds cut from the palms at each harvest are laid in a long heap down the middle of every other lane between the rows, and left to rot:
  // dry brown ribs lying along the lane, their leaflets crumpled about them. (Within 90 m of the road; the ground under the heaps is painted
  // brown by terrain.wgsl, on the same lines.)
  if (oilW(oz) > 0.4 || oilW(oz + CH) > 0.4) { const E0 = Math.round(0.2 * 32);
    for (let j = Math.ceil((oz - 3.9) / 15.6); j * 15.6 + 3.9 < oz + CH; j++) { const zp = j * 15.6 + 3.9; if (oilW(zp) < 0.5 || nearRiv(zp, 26)) continue;
      for (let i = Math.ceil(ox / 4.5); i * 4.5 < ox + CH; i++) { const h = (m) => ph(i * 149 + m, j * 23 + 960), x = i * 4.5 + (h(0) - 0.5) * 2, z = zp + (h(1) - 0.5) * 1.3, d = abs(rdist(x, z)); if (d < 12 || d > 90 || !inside(x, z) || h(2) < 0.2) continue;
        const y = ground(x, z), a = (h(3) - 0.5) * 0.5, L = 3.2 + h(4) * 1.6, dx = cos(a) * L / 2, dz = sin(a) * L / 2, yy = y + 0.12 + h(5) * 0.22;
        far.push(x - dx, yy, z - dz, 0.045, x + dx, yy + (h(6) - 0.5) * 0.15, z + dz, 0.02, -1, 3);
        for (let q = 0; q < 16; q++) { const t = h(10 + q), s = h(30 + q) < 0.5 ? 1 : -1; leaves.push(x - dx + 2 * dx * t, yy + 0.05, z - dz + 2 * dz * t, 0.75 + h(50 + q) * 0.5, PI / 2 - a + s * (1.2 + h(70 + q) * 0.5), 0.04 + h(90 + q) * 0.28, 0.07, 1.6, 7, h(110 + q), 0.8, E0); }      // (its leaflets, lying out to both sides and a little up off the ground)
      } }
    for (let j = Math.ceil(oz / 7.8); j * 7.8 < oz + CH; j++) { const zr = j * 7.8, off = (((j % 2) + 2) % 2) * 4.5; if (oilW(zr) < 0.5 || nearRiv(zr, 26)) continue;
      for (let i = Math.ceil((ox - off) / 9); i * 9 + off < ox + CH; i++) { const h = (m) => ph(i * 137 + m, j * 19 + 940), xr = i * 9 + off; if (h(0) < 0.04 || !inside(xr, zr)) continue;
        const x = xr + (h(1) - 0.5) * 0.3, z = zr + (h(2) - 0.5) * 0.3, d = abs(rdist(x, z)); if (d < 11.5 || !inside(x, z)) continue;
        const T = TREES[17 + (h(5) < 0.5 ? 1 : 0)], sc = 0.9 + h(3) * 0.25, turn = h(4) * TAU;
        if (d < 24) plant(T, x, z, turn, sc, 1, true, undefined, true); else if (d < 55) plant(T, x, z, turn, sc, 2, true, undefined, true); else if (d < 110) plant(T, x, z, turn, sc * 1.04, 3, true, T.nSegFar - 60, true); else plant(T, x, z, turn, sc * 1.08, 4, true, T.nSegFar - 96, true);      // (far back: every other rib of the fronds, then only the trunk's lower ones - the leaflets carry the shape)
      } } }
  // roadside shelter with a bench, now and then on the plain
  if (hwc < 0.4 && twc < 0.1 && swc < 0.1) for (let k = Math.ceil(oz / 520); k * 520 < oz + CH; k++) {
    const z = k * 520 + 140, x = roadX(z) - 7.5; if (inside(x, z) && !(rivOf(z) && abs(z - RV.zr) < RV.W / 2 + 30) && !nearRiv(z, 24)) stamp(SALA, x, ground(x, z), z, PI / 2, 0.7, ph(k, 3));
  }
  if (twc < 0.2) {
    // stretches of barbed-wire fence on concrete posts along the field side, shrubs growing through it
    // (fenceAt: is there a span of it from z to z + 3 - not where the stretch has none, by the sea, on the switchbacks, across the front of a
    // house on this side (its own wall and gate are there), across the way to a temple with its verges and rows of trees, over water or a river.
    // A span has its post at its near end; where the next span is wanting, it has one at its far end too - no wire ends in the air.)
    const fenceAt = (z) => { if (ph(floor(z / 96), 5) < 0.5 || seaW(z) > 0.15 || hpW(z) > 0 || (isOf(z) && nearRiv(z, 20))) return false;
      for (let i = 0; i < homes.length; i += 2) if (homes[i + 1] < 0 && abs(z + 1.5 - homes[i]) < 13) return false;
      const T = watOf(floor(z / SEG)); if (T && T.side < 0 && abs(z + 1.5 - T.z) < 10.5) return false;
      ground(roadX(z) - 9, z); return !(gw[0] || (rivOf(z) && abs(z - RV.zr) < RV.W / 2 + 22)); };
    for (let k = Math.ceil(oz / 3); k * 3 < oz + CH; k++) {
      const z = k * 3, x = roadX(z) - 9, x1 = roadX(z + 3) - 9; if (!inside(x, z) || !fenceAt(z)) continue;
      const y = ground(x, z), y1 = ground(x1, z + 3);
      far.push(x, y - 0.2, z, 0.05, x, y + 1.3, z, 0.045, -1, 0); if (!fenceAt(z + 3)) far.push(x1, y1 - 0.2, z + 3, 0.05, x1, y1 + 1.3, z + 3, 0.045, -1, 0);
      for (const hh of [0.45, 0.8, 1.15]) far.push(x, y + hh, z, 0.007, x1, y1 + hh, z + 3, 0.007, -1, 1);
      if (R() < 0.08) plant(TREES[8 + (R() < 0.3 ? 1 : 0)], x + 0.4, z + 1, R() * TAU, 0.8 + R() * 0.6);
    }
    // on bends: white marker posts with red reflectors on both edges
    for (let k = Math.ceil(oz / 8) - 1; k * 8 < oz + CH + 8; k++) {
      const z = k * 8 + 5; if ((k % 3 && hpW(z) <= 0) || abs(roadX(z + 6) - 2 * roadX(z) + roadX(z - 6)) < 0.11) continue;        // every 24 m; every 8 m round the switchbacks
      for (const sd0 of [-4.15, 4.15]) { const sd = Math.sign(sd0) * (4.15 + 2.75 * hpT(z)), [x, zp] = rp(z, sd);      // (on switchbacks the +x posts stand beyond the gutter)
        if (inside(x, zp) && !brSpan(zp) && !inTun(zp) && !onDrive(zp, sd, 0.4)) boxes.push(x, ground(x, zp) + 0.4, zp, 0, 0.1, 0.85, 0.1, 0, 13, 0, 0, 0); }
    }
  }
  // (The roadside signs are put up once every drive of the chunk is known - see onDrive - so that none stands in a drive's mouth.)
  const roadSigns = () => {
  // Speed limit signs: wherever the limit changes there is one for each direction of travel, on the driver's left, facing the traffic that is about
  // to come under it and showing the limit that begins there.
  for (let zq = Math.ceil((oz - 8) / 4) * 4; zq < oz + CH + 8; zq += 4) {
    const la = zlim(zq - 2), lb = zlim(zq + 2); if (la === lb || nearRiv(zq, 14)) continue;
    for (const e of [-1, 1]) {          // e = -1: for traffic going up the road (+z), which meets lb; e = 1: for traffic coming down, which meets la
      let zs = zq; for (let i = 0; i < 6 && onDrive(zs, -e, 1.2); i++) zs -= e * 2;      // (stepped back toward the traffic it faces, out of a drive's mouth)
      const a = atan2(roadX(zs + 1) - roadX(zs - 1), 2), so = 5.2 + 1.8 * hpT(zs) + svW(zs), x = roadX(zs) - e * so * cos(a), zz = zs + e * so * sin(a); if (!inside(x, zz)) continue;      // (so: out beyond a frontage road, beside an underpass)
      const yaw = a + (e > 0 ? 0 : PI), c = cos(yaw), sn = sin(yaw), y = ground(x, zz);
      boxes.push(x - 0.06 * sn, y + 1.2, zz - 0.06 * c, yaw, 0.07, 2.4, 0.07, 0, 34, 0, 2.4, 0, x, y + 2.4, zz, yaw, 0.75, 0.75, 0.04, 0, 37, 0, e < 0 ? lb : la, 0);
    }
  }
  // Traffic lights (see tlOf in land.js), at a crossroads. For each direction: a stop line across its lane before the zebra crossing, and beyond the corner, on the
  // driver's left, a steel post with an arm reaching out over the lane; one signal head hangs from the arm's end and a second is on the post.
  for (let g = floor((oz - 60) / 360); g <= floor((oz + CH + 30) / 360); g++) {
    const zs = tlOf(g); if (zs === null) continue; const off = ph(g, 521);
    for (const e of [-1, 1]) {          // e = -1: for traffic going up the road (+z); e = 1: for traffic coming down
      const zp = zs - e * 5, a = atan2(roadX(zp + 1) - roadX(zp - 1), 2), ca = cos(a), sa = sin(a), x = roadX(zp) - e * 5.0 * ca, zz = zp + e * 5.0 * sa;
      if (inside(x, zz)) {
        const yaw = a + (e > 0 ? 0 : PI), y = ground(x, zz), hx = roadX(zp) - e * 1.9 * ca, hz = zp + e * 1.9 * sa;
        far.push(x, y, zz, 0.11, x, y + 5.9, zz, 0.08, -1, 4, x, y + 5.75, zz, 0.06, hx, y + 5.95, hz, 0.045, -1, 4);
        // the post carries two heads on different faces and at different heights, as they are bolted on: the drivers' one (2.65-3.75 m) on the side the
        // traffic comes from, facing it; the one for people crossing (1.67-2.33 m) below it on the road side, facing the far kerb
        boxes.push(hx, y + 5.3, hz, yaw, 0.38, 1.1, 0.26, 0, 45, off, 1.1, 0, x + e * 0.3 * sa, y + 3.2, zz + e * 0.3 * ca, yaw, 0.38, 1.1, 0.26, 0, 45, off, 1.1, 0);
        boxes.push(x - e * 0.3 * ca, y + 2.0, zz + e * 0.3 * sa, a + e * PI / 2, 0.3, 0.66, 0.2, 0, 46, off, 0.66, 0);
      }
      // the side street: its own signal head on a short post at the far corner (green inside the main road's red)
      const a0 = atan2(roadX(zs + 1) - roadX(zs - 1), 2), jx = roadX(zs);
      if (inside(jx, zs)) {
        const yw = e < 0 ? a0 : a0 + PI, cy = cos(yw), sy = sin(yw), fx = cy, fz = -sy, lx2 = -sy, lz2 = -cy;      // the way traffic out of that side street goes (f) and its left (l)
        const px = jx + fx * 5.4 + lx2 * 4.9, pz = zs + fz * 5.4 + lz2 * 4.9, py = ground(px, pz);
        far.push(px, py, pz, 0.07, px, py + 3.7, pz, 0.055, -1, 4); boxes.push(px - fx * 0.22, py + 3.1, pz - fz * 0.22, yw - PI / 2, 0.38, 1.1, 0.26, 0, 45, 1 + off, 1.1, 0);
      }
      const zl = zs + e * 8.7, a2 = atan2(roadX(zl + 1) - roadX(zl - 1), 2), lx = roadX(zl) - e * 1.8 * cos(a2), lz = zl + e * 1.8 * sin(a2);
      if (inside(lx, lz)) boxes.push(lx, surf(lx, lz) + 0.012, lz, a2, 3.3, 0.02, 0.45, 0, 19, 0, 0.02, 0);
    }
  }
  // Nothing stands across the road where a town begins. What tells the driver is at the roadside, on the left as you come in: first the
  // speed limit (50, a white disc ringed in red), then the green board that says a built-up area begins, on two steel posts.
  for (let s0 = floor(oz / SEG), s = s0 - 2; s <= s0 + 2; s++) {
    const sp = townSpan(s); if (!sp) continue;
    for (const e of [-1, 1]) {
      const z0 = (s + 0.5 + e * ((e < 0 ? sp[0] : sp[1]) - 0.045)) * SEG; if (townW(z0 + e * 80) > 0.5) continue;      // (two towns grown together have no edge here)
      for (const [dz, off, kind] of [[30, 6.8, 0]]) {          // (the 50 sign is put up with all the other limit signs, below)
        let z = z0 + e * dz; for (let i = 0; i < 8 && onDrive(z, -e, 2.2); i++) z += e * 2;      // (out of a drive's mouth: further in)
        const a = atan2(roadX(z + 1) - roadX(z - 1), 2), x = roadX(z) - e * off * cos(a), zz = z + e * off * sin(a); if (!inside(x, zz) || nearRiv(z, 14)) continue;
        const yaw = a + (e > 0 ? 0 : PI), c = cos(yaw), sn = sin(yaw), y = ground(x, zz);            // turned to face the traffic coming in
        const put = (lx, ly, lz, sx, sy, sz, mat, seed = 0, h = sy) => boxes.push(x + lx * c + lz * sn, y + ly, zz - lx * sn + lz * c, yaw, sx, sy, sz, 0, mat, seed, h, 0);
        if (kind === 0) { for (const d of [-1, 1]) put(d, 1.3, -0.08, 0.09, 2.6, 0.09, 34); put(0, 2.25, 0, 2.6, 1.1, 0.06, 23, 3 + 8 + 0.63, -1.1); }      // (green, white letters, as guide signs are; it reads เขตชุมชน, 'built-up area': the ninth of the road words in render.js - left to chance it read วัด, 'temple', where there is none)
        else { put(0, 1.2, -0.06, 0.07, 2.4, 0.07, 34); put(0, 2.4, 0, 0.75, 0.75, 0.04, 37, 0, 50); }
      }
    }
  }
  };
  roadSigns();
  // The gutters of a mountain road (ร่องน้ำ): a shallow open concrete channel along both edges of the switchbacks, right against the asphalt -
  // 3.85 to 4.45 m out, 60 cm wide and 10 deep - shallow, a wheel's rim's depth, so that a low car's underside clears the edge with a wheel down
  // in it (at 20 cm a GR86 would have grounded its sill on the edge) and the wheel is still held by its sides (drive.js lets it drop in): a thin face down from the road's edge, a floor, a low lip on the outer side, in lengths of 2 m that follow the road, closed at each end.
  // The ground is not drawn over it (terrain.wgsl), so the channel is open to the sky.
  { const gw = (z) => hpW(z) > 0.15 && !inTun(z);      // (wherever the ground is opened for it - terrain.wgsl asks only hpw: gated on the chunk being hill country as well, the gutter was left out where a pass runs on into the plain, and the open channel showed the sky)
    // (a length is this chunk's if its middle is - and on a bend, 4.15 m out square to the road, that middle is up to 4 m along z from the road's
    // own z: lengths of road from 6 m before the chunk to 6 m after it are gone through, or those whose middle fell over the edge were nobody's)
    for (let k = Math.ceil(oz / 2) - 4; k * 2 < oz + CH + 6; k++) { const z0 = k * 2, z1 = z0 + 2, zm = z0 + 1; if (!gw(zm)) continue;
      const ya = roadY(z0), yb = roadY(z1), my = (ya + yb) / 2;
      for (const sd of [-1, 1]) { const G = sd * 4.15, [x0, za] = rp(z0, G), [x1, zb] = rp(z1, G), mx = (x0 + x1) / 2, mz = (za + zb) / 2; if (!inside(mx, mz)) continue;
        const L = hypot(x1 - x0, zb - za), yw = atan2(x1 - x0, zb - za), tl = -atan2(yb - ya, L), c = cos(yw), sn = sin(yw), at = (o) => [mx + sd * o * c, mz - sd * o * sn];
        // (material 53, scene.wgsl: the seed says which piece and which side of the road, the last number the length, so the joints can be drawn)
        const sg = sd > 0 ? 1 : 0, Lw = 20 + L;
        { const q = at(-0.32); boxes.push(q[0], my - 0.09, q[1], yw, 0.06, 0.18, L + 0.06, tl, 53, 2 + sg, 0.18, Lw); }      // the face down from the road's edge
        boxes.push(mx, my - 0.14, mz, yw, 0.62, 0.08, L + 0.06, tl, 53, sg, 0.08, Lw);      // the floor, 10 cm down
        { const q = at(0.34); boxes.push(q[0], my - 0.07, q[1], yw, 0.1, 0.22, L + 0.06, tl, 53, 4 + sg, 0.22, Lw); }      // the outer lip, a little above the road
        for (const [e, zz, yy] of [[gw(zm - 2), z0, ya], [gw(zm + 2), z1, yb]]) if (!e) { const q = rp(zz, G); boxes.push(q[0], yy - 0.09, q[1], yw, 0.7, 0.18, 0.08, 0, 53, 6 + sg, 0.18, 20.2); } } } }
  // steel guard rail on the hill road where it runs along a drop
  // (railOn: is there a length of it from z0 to z1 - not where the stretch has none, nor in a tunnel, nor across the mouth of a drive or a temple's
  // way. Where it stops, it ends on a post: the beam runs post to post and stops at the last - no end bent down into the ground.)
  const railOn = (z0, z1) => { const zm = (z0 + z1) / 2, kk = floor(zm / 4) * 4, hp = hpW(kk) > 0.05; return !((!hp && ph(floor(kk / 120), 9) < 0.5) || inTun(kk) || inTun(z0 - 3) || inTun(z1 + 3) || onDrive(z0, -1, 0.3) || onDrive(z1, -1, 0.3)); };      // (it ends a few metres short of a tunnel's mouth, its turned-down end too: taken a length at a time, the last ran on into the tunnel)
  if (hwc > 0.6 && twc < 0.1) for (let k = Math.ceil(oz / 4) - 2; k * 4 < oz + CH + 8; k++) {
    const z = k * 4, hp = hpW(z) > 0.05; if ((!hp && ph(floor(z / 120), 9) < 0.5) || inTun(z)) continue;        // all the way round the switchbacks
    const n = hp ? 3 : 1;
    for (let i = 0; i < n; i++) {
      // (on switchbacks 2 m back from the gutter's lip, clear of a drifting car's swung-out corners - the trees, poles, posts and signs stand back
      // behind it there, or it ran in among them)
      // (eased out from the hill road's 4.3 m to 6.4 m as the switchbacks begin, always behind the gutter, which starts with them: stepped out
      // there at once, the rail coming from the road before ran on into the gutter)
      const ro = (zq) => -(4.3 + 2.1 * hpT(zq)),
      za0 = z + 4 * i / n, zb0 = z + 4 * (i + 1) / n, [x, za] = rp(za0, ro(za0)), [x1, zb] = rp(zb0, ro(zb0));
      if (!inside(x, za) || !railOn(za0, zb0)) continue;
      // (at the road's edge's level or below it, never up the ground's: by a tunnel's mouth the hillside over the portal rises steeply right
      // beside the road, and the rail, set on the ground, climbed the face of it)
      const y = min(ground(x, za), roadY(za0) + 0.1), y1 = min(ground(x1, zb), roadY(zb0) + 0.1), len = hypot(x1 - x, zb - za), ya = atan2(x1 - x, zb - za);
      boxes.push(x, y + 0.3, za, 0, 0.1, 0.75, 0.12, 0, 12, 0, 0, 0);
      boxes.push((x + x1) / 2, (y + y1) / 2 + 0.55, (za + zb) / 2, ya, 0.05, 0.3, len + 0.05, -atan2(y1 - y, len), 12, 0, 0, 0);
      const step = 4 / n;
      for (const [end, px, pz, py, dir] of [[!railOn(zb0, zb0 + step), x1, zb, y1, 1], [!railOn(za0 - step, za0), x, za, y, -1]]) { if (!end) continue;
        if (dir > 0) boxes.push(px, py + 0.3, pz, 0, 0.1, 0.75, 0.12, 0, 12, 0, 0, 0);      // (the end post - at the start of a length there is one already)
      }
    }
  }
  // shrubs scattered on the verges
  for (let t = 0; t < 5 * (1 - twc) * (1 - swc); t++) { const x = ox + R() * CH, z = oz + R() * CH, d = abs(rdist(x, z)); if (d > 6.5 && d < min(40, vergeAt(z) - 3) && (d < 10.5 || plantW(z) < 0.5)) plant(TREES[8 + (R() < 0.25 ? 1 : 0)], x, z, R() * TAU, 0.7 + R() * 0.8); }
  // The hedgerows of a flower stretch: small slender trees in a line - one along the back of the verge on each side, where the flowers begin (a
  // gap left now and then), and one down every other boundary between plots, both ways, so that the flowers lie in hedged fields. And the
  // paddies of a rice stretch have sugar palms in plenty, standing on the bunds.
  { const zm = oz + CH / 2, flat = hwc < 0.2 && twc < 0.15 && snc < 0.1 && seaZ(zm) < 0.5 && plantW(zm) < 0.5;
    if (flat && flwAt(zm)) { const H = (x, z, far) => { const d = abs(rdist(x, z)); if (!inside(x, z) || d < vergeAt(z) - 0.5 || nearRiv(z, 30) || townW(z) > 0.1) return; const h = ph(floor(x * 3), floor(z * 3) + 77); if (h < 0.12) return;
          plant(TREES[19 + (h < 0.55 ? 1 : 0)], x + (h - 0.5) * 0.8, z + (ph(floor(x * 3) + 9, floor(z * 3)) - 0.5) * 0.8, h * 40, 0.85 + h * 0.4, d < 70 ? 2 : 3, false); };
      for (let k = Math.ceil(oz / 13.5); k * 13.5 < oz + CH; k++) { const z = k * 13.5; if (ph(floor(z / 31), 91) < 0.25) continue; for (const sd of [-1, 1]) H(roadX(z) + sd * (vergeAt(z) + 0.6), z); }
      for (let i = Math.ceil(ox / (2 * PLX)); i * 2 * PLX < ox + CH; i++) for (let k = Math.ceil(oz / 5); k * 5 < oz + CH; k++) H(i * 2 * PLX, k * 5);
      for (let j = Math.ceil(oz / (2 * PLZ)); j * 2 * PLZ < oz + CH; j++) for (let k = Math.ceil(ox / 5); k * 5 < ox + CH; k++) H(k * 5, j * 2 * PLZ); }
    else if (flat && !flwAt(zm)) for (let t = 0; t < 12; t++) { let x = ox + R() * CH, z = oz + R() * CH; const turn = R() * TAU, sc = 0.8 + R() * 0.5, lay = R(), which = R(); if (abs(rdist(x, z)) < vergeAt(z) + 6 || flwAt(z) || plantW(z) > 0.5 || seaZ(z) > 0.5) continue;
        if (lay < 0.5) x = Math.round(x / PLX) * PLX + (lay - 0.25) * 2; else z = Math.round(z / PLZ) * PLZ + (lay - 0.75) * 2; if (inside(x, z)) plant(TREES[5 + (which < 0.5 ? 1 : 0)], x, z, turn, sc); } }
  // here and there a field hut at the edge of the paddies, where it is seen from the road
  if (ph(cx * 7 + 3, cz * 13 + 5) < 0.3 && !flwAt(oz + CH / 2) && plantW(oz + CH / 2) < 0.5) {      // (a hut belongs to the paddies: none among the flowers or in a plantation)
    const z = oz + 8 + ph(cx + 900, cz) * (CH - 16), side = ph(cx, cz + 901) < 0.5 ? -1 : 1, x = roadX(z) + side * (vergeAt(z) + 7 + ph(cx, cz + 900) * 16);
    if (inside(x, z) && hillW(z) < 0.02 && townW(z) < 0.05 && seaW(z) < 0.02 && snowW(z) < 0.02 && !nearRiv(z, 40)) { const y = ground(x, z); if (!gw[0]) { stamp(FIELDHUT, x, y - 0.1, z, side > 0 ? PI / 2 : -PI / 2, ph(cx + 1, cz), ph(cx, cz + 1)); if (HUTS.length < 60) HUTS.push([x, z]); } }
  }
  // Kilometre stones (หลักกิโลเมตร), one to the kilometre on the left of the road: a square white pillar with a pointed top. Its face to the
  // road carries a mark, the route number and the kilometre; its two sides, which meet the traffic, a name and the distance to that place.
  for (let k = Math.ceil(oz / 1000) - 1; k * 1000 < oz + CH + 1000; k++) {
    // (Not on a bridge, at its ends or in a tunnel: where the kilometre falls there the stone stands the least way along the road that is clear
    // of it - and beside an underpass, beyond the frontage road.)
    let zk = null; for (const d of [0, 30, -30, 60, -60, 90, -90, 120, -120]) { const q = k * 1000 + 3 + d;
      if (!(rivOf(q) && min(abs(q - RV.zb), abs(q - RV.zr)) < RV.W / 2 + 22) && !(isOf(q) && abs(q - IS.zc) > 136 && abs(q - IS.zc) < 534) && !inTun(q)) { zk = q; break; } }
    if (zk === null || townW(zk) > 0.2) continue;      // (and none in a town: there the street has its own signs, and a kilometre stone is a thing of the open road)
    let zq = zk; for (let i = 0; i < 6 && onDrive(zq, 1, 0.8); i++) zq += 3;      // (stepped along, out of a drive's mouth)
    const [x, z] = rp(zq, 4.5 + 2.5 * hpT(zq) + svW(zq)); if (!inside(x, z)) continue;      // (beyond the gutter, on switchbacks)
    const yw = atan2(roadSl(z), 1) - PI / 2, y = ground(x, z);
    boxes.push(x, y + 0.345, z, yw, 0.40, 0.75, 0.26, 0, 11, 2148, ((k + 79) % 1000 + 1000) % 1000, 0, x, y + 0.785, z, yw + PI / 2, 0.26, 0.13, 0.40, 0, 11, 0, -1, 1);
  }
  // Electricity, as the Provincial Electricity Authority strings it: tall square concrete poles every 40 m down one side of the road. At the top a
  // concrete crossarm with three brown insulators for the 22 kV line, and a single earth wire above the pole on a steel spike. Where people live
  // (in towns, and along the stretches with villages) the same poles carry the low-voltage line too - four wires one above the other on a rack -
  // and lower still a fat, sagging bundle of telephone and cable-television lines.
  const lvAt = (z) => townW(z) > 0.3 || (hillW(z) < 0.3 && pn(z / 260, 7) > 0.52);
  // A pole stands every 40 m, except in a river or canal. Wires are strung from each pole to the next pole that stands.
  // The line is one line from end to end: it does not stop at a pole and take up again further on (as it did at the coast, round the switchbacks
  // and past an underpass - 'do they send it through the air?'). Along the coast road, whose seaward edge is rail and beach, the poles stand on the
  // landward side, back behind the wall, and the line crosses the road where the coast begins and ends; beside an underpass they stand beyond the
  // frontage road. Over the sea to the island it goes on the bridges, as a cable along the rail: the last pole before a bridge brings the line down to it, the first
  // after takes it up again, and the island between has its poles like anywhere. A river is crossed in one long span.
  const poleAt = (k) => { const z = k * 40; return !(isOf(z) && abs(z - IS.zc) > 138 && abs(z - IS.zc) < 532) && !(rivOf(z) && abs(z - RV.zr - rivM(roadX(z) + 5.6)) < RV.W / 2 + 14); };      // (measured to where the river really runs at the pole)
  // (Measured square to the road - rp - not along x: round the switchbacks the road runs so far aslant that 5.6 m along x is 2 m from its middle, and
  // the pole stood in the lane.)
  const poleXZ = (k) => { const zb = k * 40; if (seaW(zb) > 0.25) return rp(zb, -8.6); let z = clearZ(zb, 1, 5.6); const T = watOf(floor(z / SEG));
    // (nor does one stand in the mouth of a temple's way)
    // (measured where the pole really stands: square off a skew road it is carried along z)
    // (on the switchbacks behind the guard rail, 8 m out)
    const po = (zq) => 5.6 + 2.4 * hpT(zq) + svW(zq);
    let q = rp(z, po(z)); if (T && T.side > 0) for (let i = 0; i < 4 && abs(q[1] - T.z) < 3.6; i++) { z += (q[1] < T.z ? -1 : 1) * (3.9 - abs(q[1] - T.z)); q = rp(z, po(z)); }
    return q; };      // (in town a pole steps aside from a lane's mouth: its place is not quite every 40 m there)
  for (let k = Math.ceil(oz / 40) - 1; (k - 1) * 40 < oz + CH; k++) {
    const [x0, z0] = poleXZ(k); if (!inside(x0, z0) || !poleAt(k)) continue;
    let kn = 0; for (let j = 1; j <= 4 && !kn; j++) if (poleAt(k + j)) kn = j;
    const y0 = ground(x0, z0), [x1, z1] = poleXZ(k + kn), y1 = kn ? ground(x1, z1) : y0, yaw = atan2(roadSl(z0), 1), c = cos(yaw), sn = sin(yaw), lv0 = lvAt(z0), lv = kn > 0 && lv0 && lvAt(z1);
    const put = (lx, ly, sx, sy, sz, mat) => boxes.push(x0 + lx * c, y0 + ly, z0 - lx * sn, yaw, sx, sy, sz, 0, mat, 0, 0, 0);
    // the pole: one tapered square shaft from below the ground to its top, 24 x 20 cm at the foot to 14 x 13 at the head - a single solid
    // (built of boxes, each a little narrower than the one below, it stood in steps, a joint every length however short)
    { const V = [], I = [], cy = cos(yaw), sy = sin(yaw), W = (lx, lz) => [x0 + lx * cy + lz * sy, z0 - lx * sy + lz * cy], yb = y0 - 0.4, yt = y0 + 10.2, b0 = [0.12, 0.10], b1 = [0.07, 0.065];
      for (const [nx, nz, ax, az] of [[1, 0, 0, 1], [-1, 0, 0, -1], [0, 1, -1, 0], [0, -1, 1, 0]]) {
        const c0 = (h, e) => nx ? W(nx * h[0], e * h[1]) : W(e * h[0], nz * h[1]);
        const k0 = V.length / 7, wn = [nx * cy + nz * sy, -nx * sy + nz * cy];
        for (const [h, yy] of [[b0, yb], [b1, yt]]) for (const e of [-1, 1]) { const q = c0(h, e); V.push(q[0], yy, q[1], wn[0], 0, wn[1], 32); }
        I.push(k0, k0 + 1, k0 + 2, k0 + 1, k0 + 3, k0 + 2); }
      { const k0 = V.length / 7; for (const [ex, ez] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const q = W(ex * b1[0], ez * b1[1]); V.push(q[0], yt, q[1], 0, 1, 0, 32); } I.push(k0, k0 + 1, k0 + 2, k0 + 1, k0 + 3, k0 + 2); }
      meshP.push([new Float32Array(V), new Uint32Array(I), 0]); xcol.push(x0, z0, yaw, 0.12, 0.1, y0 - 0.4, yt); }
    // The crossarm, and what a real one has about it: two flat steel braces down to the pole; on each of its three steel pins a brown porcelain
    // insulator - a wide skirt, a narrower one over it, the groove the wire lies in; the holes cast through the pole's upper half, one above
    // another, for bolting things on (dark, seen through); the Authority's yellow number plate at a man's reach, facing the road; and at the
    // foot the darker band where the damp rises.
    put(-0.05, 9.4, 2.0, 0.12, 0.12, 2);
    for (const ix of [-0.85, -0.3, 0.75]) { put(ix, 9.5, 0.03, 0.12, 0.03, 34); put(ix, 9.6, 0.15, 0.05, 0.15, 4); put(ix, 9.66, 0.11, 0.06, 0.11, 4); put(ix, 9.72, 0.07, 0.05, 0.07, 4); }
    for (const e of [-1, 1]) far.push(x0 + e * 0.02 * c, y0 + 8.72, z0 - e * 0.02 * sn, 0.016, x0 + (e * 0.62 - 0.05) * c, y0 + 9.35, z0 - (e * 0.62 - 0.05) * sn, 0.016, -1, 1);
    for (let j = 0; j < 7; j++) boxes.push(x0, y0 + 6.1 + j * 0.42, z0, yaw, 0.045, 0.085, 0.17 - j * 0.004, 0, 3, 0, 0, 0);
    boxes.push(x0 - 0.115 * c, y0 + 2.7, z0 + 0.115 * sn, yaw, 0.012, 0.3, 0.2, 0, 50, 0.0868, 0, 0); { const yf = walkY(x0, z0); boxes.push(x0, yf + 0.15, z0, yaw, 0.248, 0.3, 0.207, 0, 2, 0.9, 0, 0); }      // (the damp band from the ground it stands in - on a town's raised footpath, its top)
    // (the earth wire's spike; the low-voltage rack - a steel strap down the pole's road side with four white spool insulators on it, a wire to each)
    put(0, 10.6, 0.05, 0.8, 0.05, 34); if (lv0) { put(-0.18, 7.3, 0.05, 0.8, 0.08, 34); for (let i = 0; i < 4; i++) put(-0.24, 7.0 + i * 0.2, 0.085, 0.075, 0.085, 19); }
    // A stay, where the line turns: on a bend the wires pull the pole toward the inside of it, and a steel wire from near its top to an anchor in
    // the ground on the outside holds it back. (How much the road turns here: the change of its direction over the two spans.)
    { const turn = atan2(roadSl(z0 + 40), 1) - atan2(roadSl(z0 - 40), 1); if (abs(turn) > 0.09 && seaW(z0) < 0.25) { const e = turn > 0 ? 1 : -1, ax = x0 + e * 4.2 * c, az = z0 - e * 4.2 * sn, gy = ground(ax, az);
        if (!gw[0] && abs(gy - y0) < 2 && abs(rdist(ax, az)) > 6.6) { far.push(x0 + e * 0.1 * c, y0 + 8.6, z0 - e * 0.1 * sn, 0.011, ax, gy + 0.05, az, 0.011, -1, 1); } } }
    // In a town, the wires to the houses: from the low-voltage rack two pairs fall away across the footpath to the shop fronts on the pole's side.
    if (lv0 && townW(z0) > 0.7 && !udOf(z0)) for (const dz of [-7, 6]) { const q = rp(z0 + dz, 8.4), n = 3; for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, sg = (t) => -0.35 * 4 * t * (1 - t);
        far.push(mix(x0 - 0.24 * c, q[0], t0), y0 + mix(7.2, 4.6, t0) + sg(t0), mix(z0 + 0.24 * sn, q[1], t0), 0.012, mix(x0 - 0.24 * c, q[0], t1), y0 + mix(7.2, 4.6, t1) + sg(t1), mix(z0 + 0.24 * sn, q[1], t1), 0.012, -1, 1); } }
    if (lv0 && townW(z0) < 0.4 && (k & 1)) { put(-0.7, 6.2, 1.3, 0.05, 0.05, 34); boxes.push(x0 - 1.25 * c, y0 + 6.14, z0 + 1.25 * sn, yaw, 0.9, 0.07, 0.12, 0, 10, 0, 0, 0); }      // a strip light on a short arm, as villages hang them on the poles
    // the last pole before a bridge of the island crossing, or the first after one: the line comes down from its top to the cable on the bridge's rail
    for (const dir of [-1, 1]) { if (!isOf(z0) || poleAt(k + dir)) continue; const zc = IS.zc, ze = [zc - 520, zc - 150, zc + 150, zc + 520].filter((q) => (q - z0) * dir > 0 && abs(q - z0) < 60)[0]; if (ze === undefined) continue;
      const a = atan2(roadX(ze + 1) - roadX(ze - 1), 2), ex = roadX(ze) + BRC[0] * cos(a), ez = ze - BRC[0] * sin(a), ey = roadY(ze) + BRC[1], n = 5;
      for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, sg = (t) => -1.1 * 4 * t * (1 - t); far.push(mix(x0, ex, t0), mix(y0 + 8.9, ey, t0) + sg(t0), mix(z0, ez, t0), 0.04, mix(x0, ex, t1), mix(y0 + 8.9, ey, t1) + sg(t1), mix(z0, ez, t1), 0.04, -1, 1); }
      far.push(x0 + 0.16 * c, y0 + 8.9, z0 - 0.16 * sn, 0.05, x0 + 0.16 * c, y0 + 9.5, z0 - 0.16 * sn, 0.05, -1, 1); reach = max(reach, hypot(ex - x0, ez - z0) - 14); }
    // Where the low lines begin or end (the last pole that carries them, this way or that): they come from somewhere and go somewhere. The four
    // low-voltage wires are fed by a transformer hung on the pole - a grey drum on a bracket, its leads up to the high line and across to the
    // rack; the communications cables turn down the pole in a steel conduit to a cabinet at its foot, a coil of spare cable hung where they
    // leave the span. (They simply stopped at the pole, cut off in the air.)
    if (lv0 && (!lvAt((k - 1) * 40) || !(kn > 0 && lvAt(z1)))) { const T = (lx, ya, lz, ra, lx2, yb, lz2, rb, m) => far.push(x0 + lx * c + lz * sn, y0 + ya, z0 - lx * sn + lz * c, ra, x0 + lx2 * c + lz2 * sn, y0 + yb, z0 - lx2 * sn + lz2 * c, rb, -1, m);
      T(0.5, 7.75, 0, 0.27, 0.5, 8.6, 0, 0.27, 4); T(0.5, 8.6, 0, 0.27, 0.5, 8.68, 0, 0.2, 4); put(0.25, 7.8, 0.5, 0.08, 0.12, 34); put(0.25, 8.5, 0.5, 0.06, 0.1, 34);
      for (const e of [-0.12, 0.12]) T(0.5 + e, 8.68, 0, 0.03, 0.5 + e, 8.9, 0, 0.022, 19);      // the bushings
      T(0.62, 8.9, 0, 0.008, 0.75, 9.72, 0, 0.008, 1); T(0.38, 8.9, 0, 0.008, -0.3, 9.72, 0, 0.008, 1); T(0.3, 7.9, 0.1, 0.012, -0.24, 7.3, 0.05, 0.012, 1);
      T(-0.2, 5.3, 0.14, 0.03, -0.13, 4.9, 0.14, 0.03, 1); T(-0.13, 4.9, 0.14, 0.032, -0.13, -0.1, 0.14, 0.032, 4);      // down the pole, in conduit
      for (let i = 0; i < 10; i++) { const a0 = i / 10 * TAU, a1 = (i + 1) / 10 * TAU; T(-0.2, 5.0 + 0.24 * cos(a0), 0.34 + 0.24 * sin(a0), 0.02, -0.2, 5.0 + 0.24 * cos(a1), 0.34 + 0.24 * sin(a1), 0.02, 1); }      // the coil of spare cable
      boxes.push(x0 - 0.55 * c + 0.14 * sn, y0 + 0.6, z0 + 0.55 * sn + 0.14 * c, yaw, 0.55, 1.2, 0.3, 0, 19, 0, 1.2, 0); boxes.push(x0 - 0.55 * c + 0.14 * sn, y0 + 0.04, z0 + 0.55 * sn + 0.14 * c, yaw, 0.7, 0.1, 0.45, 0, 2, 0, 0.1, 0); }
    if (!kn) continue;
    const yaw1 = atan2(roadSl(z1), 1), c1 = cos(yaw1), s1 = sin(yaw1);      // the next pole stands square to the road where it is
    // (clr: however a wire sags, it keeps 4.8 m over the road - where a span cuts across a bend, its low cables hung across the lane at a man's
    // height - and 2.6 m over the ground anywhere else)
    const clr = (x, z, y) => max(y, abs(rdist(x, z)) < 5.5 ? roadYs(z) + 4.8 : ground(x, z) + 2.6);
    const wire = (off, h, r, sagM, n) => { const sM = min(sagM * kn * kn, h < 6 ? 1.2 : 2.4), nn = n * kn, ax = x0 + off * c, az = z0 - off * sn, bx = x1 + off * c1, bz = z1 - off * s1;
      // a wire under tension hangs in the vertical plane through its two insulators: seen from above it is a straight line from pole to pole,
      // cutting the chord of a bend (it cannot follow the road round - nothing pulls it sideways). Only its height sags.
      for (let i = 0; i < nn; i++) { const a = i / nn, b = (i + 1) / nn, sag = (t) => -sM * 4 * t * (1 - t);
        const pa = [mix(ax, bx, a), mix(az, bz, a)], pb = [mix(ax, bx, b), mix(az, bz, b)]; far.push(pa[0], clr(pa[0], pa[1], mix(y0, y1, a) + h + sag(a)), pa[1], r, pb[0], clr(pb[0], pb[1], mix(y0, y1, b) + h + sag(b)), pb[1], r, -1, 1); } };
    reach = max(reach, hypot(x1 - x0, z1 - z0) - 14);      // (a pole may stand in the chunk's far corner, 45 m from its middle)
    for (const ix of [-0.85, -0.3, 0.75]) wire(ix, 9.74, 0.012, 0.5, 5); wire(0, 10.97, 0.011, 0.4, 4);
    if (lv) { for (let i = 0; i < 4; i++) wire(-0.24, 7.0 + i * 0.2, 0.012, 0.7, 4); wire(-0.2, 5.3, 0.035, 1.0, 6); wire(-0.26, 5.0, 0.015, 1.2, 6); }
    // As a Thai street has it: below the power lines the pole carries everybody's telephone, internet and cable-television lines, strung by many
    // hands over many years and never taken down - a thick untidy skein, no two cables at the same height or hanging alike, some sagging far below
    // the rest; spare lengths left coiled in hoops and hung on the pole; black splice cases along the skein near the pole; a small grey
    // junction box or two on the pole itself; and on one pole in five the street's transformer, on brackets under the crossarm. In a town the
    // full tangle; out along the village stretches a few cables and now and then a hoop.
    if (lv0) { const tw0 = townW(z0), full = tw0 > 0.5, hp = (m) => ph(k * 61 + m, 7700);
      if (lv) for (let i = 0, n = full ? 12 : 4; i < n; i++) { const o0 = -0.3 + 0.5 * hp(i) - 0.06, o1 = -0.3 + 0.5 * ph((k + kn) * 61 + i, 7700) - 0.06, h0 = 4.3 + 1.5 * hp(i + 20), h1 = 4.3 + 1.5 * ph((k + kn) * 61 + i + 20, 7700), sg0 = (0.5 + 2.2 * hp(i + 40) * hp(i + 40)) * min(kn, 2), r = 0.008 + 0.014 * hp(i + 60);
          const ax = x0 + o0 * c, az = z0 - o0 * sn, bx = x1 + o1 * c1, bz = z1 - o1 * s1, nn = 5 * kn, pk = 0.3 + 0.4 * hp(i + 80), yy = (t) => mix(y0 + h0, y1 + h1, t) - sg0 * (t < pk ? t / pk : (1 - t) / (1 - pk)) * (2 - (t < pk ? t / pk : (1 - t) / (1 - pk)));      // (lowest where it likes, not in the middle)
          for (let q = 0; q < nn; q++) { const t0 = q / nn, t1 = (q + 1) / nn, xa = mix(ax, bx, t0), za = mix(az, bz, t0), xb = mix(ax, bx, t1), zb = mix(az, bz, t1); far.push(xa, clr(xa, za, yy(t0)), za, r, xb, clr(xb, zb, yy(t1)), zb, r, -1, 1); } }
      const dz = (m) => [sn * m, c * m];      // (m metres along the road from the pole)
      for (let j = 0, n = full ? 2 + floor(hp(100) * 3) : (hp(100) < 0.4 ? 1 : 0); j < n; j++) {      // hoops of spare cable, hung flat against the line of the wires
        const R0 = 0.3 + 0.22 * hp(110 + j), hh = 4.5 + 1.3 * hp(120 + j), al = (hp(130 + j) < 0.5 ? -1 : 1) * (0.25 + 0.5 * hp(140 + j)), lx = -0.2 - 0.12 * hp(150 + j), d0 = dz(al), cx = x0 + lx * c + d0[0], cz = z0 - lx * sn + d0[1];
        for (let w = 0; w < 2; w++) { const Rw = R0 * (1 - 0.13 * w), off = 0.025 * w; for (let q = 0; q < 8; q++) { const a0 = q / 8 * TAU, a1 = (q + 1) / 8 * TAU, e0 = dz(cos(a0) * Rw), e1 = dz(cos(a1) * Rw);
            far.push(cx + e0[0] - off * c, y0 + hh - R0 + sin(a0) * Rw, cz + e0[1] + off * sn, 0.016, cx + e1[0] - off * c, y0 + hh - R0 + sin(a1) * Rw, cz + e1[1] + off * sn, 0.016, -1, 1); } } }
      if (full && lv) for (let j = 0, n = 1 + (hp(200) < 0.5 ? 1 : 0); j < n; j++) { const t = (1.4 + 2.2 * hp(210 + j)) / hypot(x1 - x0, z1 - z0), hh = 4.9 + 0.7 * hp(220 + j), px = mix(x0, x1, t) - 0.25 * c, pz = mix(z0, z1, t) + 0.25 * sn, e = dz(0.3);      // splice cases
          far.push(px - e[0], y0 + hh, pz - e[1], 0.085, px + e[0], y0 + hh, pz + e[1], 0.085, -1, 1); far.push(px - e[0] * 1.25, y0 + hh, pz - e[1] * 1.25, 0.04, px + e[0] * 1.25, y0 + hh, pz + e[1] * 1.25, 0.04, -1, 1); }
      if (full) { put(0.17, 3.6 + hp(300), 0.12, 0.34, 0.24, 34); if (hp(301) < 0.5) put(-0.17, 4.2 + 0.5 * hp(302), 0.1, 0.24, 0.18, 34); }      // junction boxes
      if (tw0 > 0.3 && ((k % 5) + 5) % 5 === 2) {      // the transformer: a finned grey tank on two steel arms, three bushings on its lid, leads up to the line
        put(0.62, 8.05, 0.78, 0.95, 0.62, 34); put(0.62, 8.05, 0.86, 0.7, 0.7, 34); put(0.4, 7.52, 1.1, 0.07, 0.5, 34); for (const iz of [-0.2, 0, 0.2]) boxes.push(x0 + 0.62 * c + iz * sn, y0 + 8.66, z0 - 0.62 * sn + iz * c, yaw, 0.08, 0.26, 0.08, 0, 4, 0, 0, 0);
        for (const [iz, ix] of [[-0.2, 0.75], [0, -0.3], [0.2, -0.85]]) far.push(x0 + 0.62 * c + iz * sn, y0 + 8.79, z0 - 0.62 * sn + iz * c, 0.012, x0 + ix * c, y0 + 9.72, z0 - ix * sn, 0.012, -1, 1); } }
  }
  // the trees, now that the buildings stand (see plant): every box big enough to be part of a building - a wall or a block at least 1.8 m high, or a
  // floor or roof of 6 m² - is something a crown may not grow into, if it stands higher than a man's head above the tree's foot and lower than its top
  // What the car cannot drive through (col), and what it flattens instead (soft). Nothing is listed by name: a thing is solid if it is there
  // at the height of a car's body. So every box at least half a metre high that stands within reach of the ground is solid - walls, houses,
  // shop fronts and the goods before them, fences of block and bar, gate posts, sign posts, lorries, parked motorcycles (by their wheels), market
  // stalls, boats, kilometre stones, bridge rails, piers; and every tube that is not part of a plant - lamp posts, power poles, signal posts,
  // fence posts with their rails and wires, a bridge's hangers. What is low passes under the car (kerbs, painted lines, slabs, footpaths, bench
  // seats); what is high passes over it (canopies, roofs, sign boards, overhead wires) - the car's own height decides that as it comes, so a
  // slab is a roof from below and a road from above. Each: [x, z, cos, sin, half width, half length, foot, top].
  // Trees are sorted as they are grown, below: one with a real trunk is solid, at the trunk; shrubs, saplings and the like are soft.
  // The pickups (see truck): each is parked only if its footprint, and a hand's breadth round it, is clear of every box that stands up from the
  // ground there - a wall, a column, a post, a shop's goods, a step - and of every motorcycle and bicycle left there. A unit of a shophouse
  // row is narrower than a Ranger is long: parked by its unit alone, its end stood in the next one's front or its column.
  for (const [px, pz, yw, hw, hl, yt, emit] of trkPend) { const c = cos(yw), sn = sin(yw); let ok = true;
    const inFoot = (x, z, r) => { const dx = x - px, dz = z - pz; return abs(dx * c - dz * sn) < hw + 0.15 + r && abs(dx * sn + dz * c) < hl + 0.15 + r; };
    for (const t of twList) if (inFoot(t[0], t[1], 1.0)) { ok = false; break; }      // (a two-wheeler is up to 1.9 m long, measured from its middle)
    for (let i = 0; ok && i < boxes.length; i += 12) { const sy = boxes[i + 5], yb = boxes[i + 1] - sy / 2, ytp = boxes[i + 1] + sy / 2; if (ytp < yt + 0.12 || yb > yt + 1.7 || sy < 0.1) continue;
      const bx = boxes[i], bz = boxes[i + 2], ba = boxes[i + 3], hx = boxes[i + 4] / 2, hz = boxes[i + 6] / 2; if (abs(bx - px) > hl + hx + hz + 1 || abs(bz - pz) > hl + hx + hz + 1) continue;
      const cb = cos(ba), sb2 = sin(ba);
      // (sampled: points over the box's own face, every 30 cm, each tested against the footprint)
      for (let a = -hx; ok && a <= hx + 1e-6; a += max(0.3, hx / 6)) for (let b = -hz; b <= hz + 1e-6; b += max(0.3, hz / 6)) if (inFoot(bx + a * cb + b * sb2, bz - a * sb2 + b * cb, 0)) { ok = false; break; } }
    if (ok) emit(); }
  const col = [], soft = [];
  { const gAt = (x, z) => hAt(clamp(x, ox - GS + 0.01, ox + CH + GS - 0.01), clamp(z, oz - GS + 0.01, oz + CH + GS - 0.01));
    const add = (x, z, yaw, hx, hz, yb, yt) => { const gy = gAt(x, z); if (yb < gy + 1.3 && yt > gy + 0.4) col.push(x, z, cos(yaw), sin(yaw), hx, hz, yb, yt); };
    for (let i = 0; i < xcol.length; i += 7) add(xcol[i], xcol[i + 1], xcol[i + 2], xcol[i + 3], xcol[i + 4], xcol[i + 5], xcol[i + 6]);
    for (let i = 0; i < boxes.length; i += 12) { const sy = boxes[i + 5]; if (sy >= 0.5) add(boxes[i], boxes[i + 2], boxes[i + 3], boxes[i + 4] / 2, boxes[i + 6] / 2, boxes[i + 1] - sy / 2, boxes[i + 1] + sy / 2); }
    for (const A of [far, segs]) for (let i = 0; i < A.length; i += 10) { const dx = A[i + 4] - A[i], dz = A[i + 6] - A[i + 2], r = max(A[i + 3], A[i + 7], 0.04), L = hypot(dx, dz);
      add((A[i] + A[i + 4]) / 2, (A[i + 2] + A[i + 6]) / 2, atan2(dx, dz), r, L / 2 + r, min(A[i + 1], A[i + 5]) - r, max(A[i + 1], A[i + 5]) + r); } }
  { const F = [];
    for (let i = 0; i < boxes.length; i += 12) { const sx = boxes[i + 4], sy = boxes[i + 5], sz = boxes[i + 6]; if (max(sx, sz) < 1.5 || (sy < 1.8 && sx * sz < 6)) continue;
      F.push(boxes[i], boxes[i + 2], boxes[i + 3], sx, sz, boxes[i + 1] - sy / 2, boxes[i + 1] + sy / 2); }
    for (const v of nbFoot) F.push(v);
    for (const a of pend) {
      // No limb hangs low across the road. A tree any of whose boughs or leaves would come lower than 3 m over the asphalt (a car is 1.5 m high;
      // from the driver's seat a bough at 2 m is in the windscreen, and the car drove 'into' it - through it, for boughs stop nothing) is stood
      // back from the road by as much as that bough reaches in; if that does not clear it (the road bends, or the tree leans right across) it
      // is not planted. T.low: the tree's low points, found once - the ends of its boughs and one leaf in six, up to 5 m in its own measure.
      { const T = a[0], sc = a[4], c = cos(a[3]), sn = sin(a[3]);
        if (T.crR === undefined) { let r = 0, h = 0; const L = T.leaves; for (let i = 0; i < L.length; i += 12) { r = max(r, hypot(L[i], L[i + 2])); h = max(h, L[i + 1]); } T.crR = r; T.crH = h; }
        if (!a[8] && abs(rdist(a[1], a[2])) < 4.2 + T.crR * sc && !inTun(a[2])) {
          if (!T.low) { const P = [], S = T.segs, L = T.leaves; for (let i = 0; i < T.nSeg * 10; i += 10) { if (S[i + 1] < 5) P.push(S[i], S[i + 1], S[i + 2], 0); if (S[i + 5] < 5) P.push(S[i + 4], S[i + 5], S[i + 6], 0); }
            for (let i = 0; i < L.length; i += 72) if (L[i + 1] < 5) P.push(L[i], L[i + 1], L[i + 2], 0.35 + L[i + 3] * 0.5); T.low = P; }
          const P = T.low, into = (x, z) => { let m = 0; for (let i = 0; i < P.length; i += 4) { if (P[i + 1] * sc > 3) continue; const d = 3.7 + P[i + 3] * sc - abs(rdist(x + (P[i] * c - P[i + 2] * sn) * sc, z + (P[i] * sn + P[i + 2] * c) * sc)); if (d > m) m = d; } return m; };
          let m = into(a[1], a[2]);
          if (m > 0) { const sl = roadSl(a[2]), n = Math.sqrt(1 + sl * sl), dir = rdist(a[1], a[2]) < 0 ? -1 : 1; a[1] += dir * (m + 0.3) / n; a[2] -= dir * (m + 0.3) * sl / n; lowFix[0]++; if (m > 6 || into(a[1], a[2]) > 0.05) { lowFix[1]++; continue; } } } }
      const T = a[0], x = a[1], z = a[2], sc = a[4];
      if (a[10]) { plantNow(...a); continue; }
      if (twc > 0.2 && (civIn(x, z) || convIn(x, z))) continue;      // (nothing grows of itself on a school's ground or a football field)      // (a tree a temple plants in its own court: it stands, whatever is cleared round it)
      if (T.crR === undefined) { let r = 0, h = 0; const L = T.leaves; for (let i = 0; i < L.length; i += 12) { r = max(r, hypot(L[i], L[i + 2])); h = max(h, L[i + 1]); } T.crR = r; T.crH = h; }
      const R = T.crR * sc, keep = max(0.8, 0.6 * R), ty = hAt(x, z), top = ty + max(T.crH * sc, 3); let ok = true;
      for (let j = 0; j < F.length && ok; j += 7) {
        const dx = x - F[j], dz = z - F[j + 1], hx = F[j + 3] / 2, hz = F[j + 4] / 2, reach = hx + hz + keep; if (abs(dx) > reach || abs(dz) > reach) continue;
        if (F[j + 6] < ty + 1.8 || F[j + 5] > top) continue;
        const c = cos(F[j + 2]), s = sin(F[j + 2]), ex = max(abs(dx * c - dz * s) - hx, 0), ez = max(abs(dx * s + dz * c) - hz, 0);
        if (ex * ex + ez * ez < keep * keep) ok = false;
      }
      if (ok) { const n0 = far.length + segs.length; plantNow(...a); const grew = far.length + segs.length > n0; if (a[9] && grew) a[9]();      // (a[9]: what belongs to the tree and is only made if the tree is - the tapper's cup on a rubber tree, a cherry's arch; plantNow may still refuse it)
       
        // a tree taller than a man with a trunk as thick as an arm stops the car, at its trunk; anything less the car pushes down and drives over
        const S = T.segs, tr = (S.length ? max(S[3], S[7]) : 0) * sc;
        // (only for a tree that was planted: plantNow refuses some - in an underpass's cutting, round a house, in front of the switchbacks' guard
        // rail - and those had left their trunks behind, unseen, for the car to run into)
        if (!grew) continue;
        if (T.crH * sc > 2.6 && tr > 0.07) col.push(x, z, 1, 0, max(tr, 0.18), max(tr, 0.18), ty - 0.5, ty + T.crH * sc); else soft.push(x, z, max(0.6, T.crR * sc)); }
    } }
  // Under the cherries the road and its verges lie strewn with petals (painted on the ground: terrain.wgsl); some 1400 to a chunk are real ones
  // as well, lying unseen until the car's passing or a gust takes them up into the air (leaf kind 11 with its last number 1: see common.wgsl).
  if (abs(roadX(oz + CH / 2) - (ox + CH / 2)) < CH + 12) for (let j = 0; j < 1400; j++) { const pz = oz + ph(j, cz * 7 + 411) * CH, gs = kunAt(pz); if (!chyAt(pz) && !gs) continue;      // (and under the golden showers: gs, their petals yellow)
      const px = roadX(pz) + (ph(j, cz * 7 + 412) - 0.5) * 15; if (!inside(px, pz) || townW(pz) > 0.05) continue;      // (none in a town: none are planted there)
      // On a bridge they lie on its deck only - none over the water beside it - and fewer, since no tree stands over it (two
      // in three - a little more than the deck's paint in scene.wgsl shows, since only those near the wheels are ever seen); in a tunnel along its floor, fewer the further in, none beyond 30 m. Anywhere else, not on water.
      { const keep = ph(j, cz * 7 + 415);
        if (brSpan(pz)) { if (!brAt(px, pz) || keep > 0.65) continue; }
        else if (inTun(pz)) { const inn = TN.hl - abs(pz - TN.zc); if (!tunAt(px, pz) || keep > 0.6 * (1 - min(1, inn / 30))) continue; }
        else if (wetAt(px, pz)) continue; }
      leaves.push(px, surf(px, pz) + 0.04, pz, 0.085, ph(j, cz * 7 + 413), 0, 0.032, gs ? 1 : 0, 11, ph(j, cz * 7 + 414), 1, 1); }
  // leaves from different trees are interleaved so that drawing the first third or ninth thins every tree evenly
  const nL = leaves.length / 12, lf = new Float32Array(leaves.length), Rs = rng(cx * 31 + cz * 17 + 5);
  { const order = new Uint32Array(nL); for (let i = 0; i < nL; i++) order[i] = i; for (let i = nL - 1; i > 0; i--) { const j = floor(Rs() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; } for (let i = 0, o = 0; i < nL; i++) { const q = order[i] * 12; for (let k = 0; k < 12; k++) lf[o++] = LBUF[q + k]; } }
  let meshV = new Float32Array(0), meshI = new Uint32Array(0); let nMeshFar = 0, nMeshA = 0; if (meshP.length) { const ord = [0, 2, 1]; meshP.sort((a, b) => ord[a[2] || 0] - ord[b[2] || 0]); for (const q of meshP) { if (!q[2]) nMeshA += q[1].length; if (q[2] !== 1) nMeshFar += q[1].length; } let nv = 0, ni = 0; for (const [v, ix] of meshP) { nv += v.length; ni += ix.length; } meshV = new Float32Array(nv); meshI = new Uint32Array(ni); let ov = 0, oi = 0; for (const [v, ix] of meshP) { meshV.set(v, ov); const b = ov / 7; for (let q = 0; q < ix.length; q++) meshI[oi + q] = ix[q] + b; ov += v.length; oi += ix.length; } }
  // Benches on a town's footpaths, here and there (about one every 40 m a side), and on most of them one, two or three people sitting (addP
  // with a pace of -1: seated - vsPpl). They stand out by the kerb, their backs to the road, facing the shops across the footpath: against the
  // shop fronts they stood in the shops' doorways. And not where the kerb is taken - a pole, a parked scooter, a stall: freeK.
  const freeK = (x, z, r) => { for (let i = 0; i < xcol.length; i += 7) if (abs(xcol[i] - x) < r + 1 && abs(xcol[i + 1] - z) < r + 1) return false;
    for (let i = 0; i < nBoxK; i += 12) { if (boxes[i + 5] < 0.25) continue; const e = max(boxes[i + 4], boxes[i + 6]) / 2; if (abs(boxes[i] - x) < r + e && abs(boxes[i + 2] - z) < r + e && boxes[i + 1] - boxes[i + 5] / 2 < ground(x, z) + 1.5) return false; }
    for (let i = 0; i < far.length; i += 10) { if (abs(far[i] - x) < r && abs(far[i + 2] - z) < r) return false; } return true; };
  const nBoxK = boxes.length;
  for (let zi = Math.ceil(oz / 2); zi * 2 < oz + CH; zi++) { const z = zi * 2; if (townW(z) < 0.6 || (udOf(z) && svW(z) > 0.02) || nearRiv(z, 22)) continue;
    for (const side of [-1, 1]) { const h = (j) => ph(zi * 2 + (side > 0 ? 1 : 0), 9300 + j); if (h(0) > 0.05) continue;
      // (none before a convenience store: its front is its car park's)
      const ya = atan2(roadSl(z), 1), q = rp(z, side * 4.95), gy = walkY(q[0], q[1]); if (!inside(q[0], q[1]) || gw[0] > 0 || soiD(q[0], q[1]) < 3.5 || convFront(z, side) || !freeK(q[0], q[1], 1.3)) continue; const qb = rp(z, side * 4.72);
      boxes.push(q[0], gy + 0.44, q[1], ya, 0.4, 0.05, 1.6, 0, 0, 0.3, 0.05, 0); boxes.push(qb[0], gy + 0.72, qb[1], ya, 0.05, 0.3, 1.6, 0, 0, 0.3, 0.3, 0);
      for (const e of [-0.7, 0.7]) { const ql = rp(z + e, side * 4.9); boxes.push(ql[0], gy + 0.22, ql[1], ya, 0.42, 0.44, 0.06, 0, 4, 0.5, 0.44, 0); const qp = rp(z + e, side * 4.72); boxes.push(qp[0], gy + 0.5, qp[1], ya, 0.05, 0.75, 0.06, 0, 4, 0.5, 0.75, 0); }
      for (let m = -1; m <= 1; m++) if (h(3 + m) < 0.5) { const qs = rp(z + m * 0.52, side * 5.0); addP(qs[0], qs[1], ya + side * PI / 2 + (h(7 + m) - 0.5) * 0.3, h(10 + m), h(13 + m), -1); } } }
  const nBoxFar = boxes.length / 12; for (const q of boxesD) boxes.push(q);      // (the fine detail goes last: drawn only from near to - see main.js; and it stops nothing)
  const allSeg = new Float32Array(far.length + segs.length); allSeg.set(far); allSeg.set(segs, far.length); nSegFar = far.length / 10;
  // People standing on a town's footpaths, both sides of the street, about one every 8 m of it (those walking along it are the stream of
  // render.js STROLL, 5.7 to 7 m out from the road's middle: between the kerb, with its poles and parked scooters, and the shop fronts): alone looking at a shop or the street, or two together, face to face. None beside an underpass's cutting, nor at a bridge.
  for (let zi = Math.ceil(oz / 2); zi * 2 < oz + CH; zi++) { const z = zi * 2; if (townW(z) < 0.6 || (udOf(z) && svW(z) > 0.02) || nearRiv(z, 22)) continue;
    for (const side of [-1, 1]) { const h = (j) => ph(zi * 2 + (side > 0 ? 1 : 0), 9000 + j); if (h(0) > 0.32) continue;
      const sl = roadSl(z), ya = atan2(sl, 1), walk = h(1) < 0.5, dist = walk ? 5.9 + 1.1 * h(2) : (h(3) < 0.5 ? 7.4 : 5.3) + 0.5 * h(2), q = rp(z, side * dist);
      if (walk) continue;      // (those walking the footpath are not a chunk's: render.js STROLL)
      { const fa = ya + (h(3) < 0.5 ? -side : side) * PI / 2 + (h(9) - 0.5) * 0.9; addP(q[0], q[1], fa, h(5), h(6));
        if (h(10) < 0.45) addP(q[0] + sin(fa) * 0.75, q[1] + cos(fa) * 0.75, fa + PI + (h(11) - 0.5) * 0.5, h(12), h(13)); } } }
  // (each list put in a chance order: at night only the first part of each is drawn - main.js - which must thin the people evenly)
  for (const L of [ppl, pplW]) { const n = L.length / 12, R2 = rng(cx * 53 + cz * 29 + 11); for (let i = n - 1; i > 0; i--) { const j = floor(R2() * (i + 1)); for (let k = 0; k < 12; k++) { const t = L[i * 12 + k]; L[i * 12 + k] = L[j * 12 + k]; L[j * 12 + k] = t; } } }
  return { cx, cz, x: ox + CH / 2, z: oz + CH / 2, y: hg[(M * M) >> 1], vb: vbuf(v), nPpl: (ppl.length + pplW.length) / 12, bigShops, nFruit: fruit.length / 8, fruitB: fruit.length ? vbuf(new Float32Array(fruit)) : null, nPplM: ppl.length / 12, pplA: new Float32Array(ppl.concat(pplW)), pplB: ppl.length + pplW.length ? vbuf(new Float32Array(ppl.concat(pplW))) : null, nSeg: allSeg.length / 10, nSegFar, segB: allSeg.length ? vbuf(allSeg) : null,
    hgc: hg.slice(), hwc: hwet.slice(),          // the chunk's own heights and water marks, kept for growing its grass later without working the ground out again
    col: new Float32Array(col), soft: new Float32Array(soft),          // what stops the car, and what it flattens (see above)
    reach, lowFix, wat: watSpot, round: watRound, nMesh: meshI.length, nMeshFar, nMeshA, meshB: meshI.length ? vbuf(meshV) : null, meshIB: meshI.length ? vbuf(meshI, GPUBufferUsage.INDEX) : null, nBoxFar, nLeaf: nL, leafB: nL ? vbuf(lf) : null, nGrass: 0, grassB: null, house: dbgHouse, tw: twList, drives, nBox: boxes.length / 12, boxB: boxes.length ? vbuf(new Float32Array(signW(boxes))) : null };
}
// grass is only grown for the chunks around the camera (and let go again further away): blades on level ground off the road
// (NGF: a chunk of flower fields may hold twice as many pieces - its plants are of several pieces each, and many stand without a flower)
const NG = 42000, NGT = 80000, NGF = 84000, gr = new Float32Array(NGF * 12);      // (NGT: what a chunk may hold where it is not flowers - turf is two or three pieces to a place)
// GRASS_SNOW: 1 in the cool season, when the snowfield's grass is a few dry stalks out of the snow; 0 the rest of the year (set by worldclient.js)
let GRASS_SNOW = 1;
// A chunk's grass is grown over three or four frames, a share of it each time (grassJob: the chunk being done; one at a time, since they share
// the array gr), so that no single frame has to wait for all of it.
let grassJob = null;
function growGrass(c) {
  if (grassJob && grassJob !== c) { if (!grassJob.dead) return; grassJob = null; }
  if (!grassJob) { grassJob = c; c.gI = 0; c.gN = 0; c.gR = rng((c.cx * 83492791) ^ (c.cz * 2654435761) ^ 77); }
  const ox = c.cx * CH, oz = c.cz * CH, R = c.gR, iEnd = min(NG, c.gI + 12000); let ng = c.gN;
  const po = [0, 0], HG = c.hgc, HW = c.hwc, M = GN + 3;
  // the height under a blade is read off the chunk's grid (as the mesh itself is drawn), not worked out afresh: that sum, done for every one of
  // tens of thousands of blades, used to hold a frame up for 20 ms each time a chunk came into range
  const hgAt = (x, z) => { const fx = (x - ox) / GS + 1, fz = (z - oz) / GS + 1, ix = floor(fx), iz = floor(fz), u = fx - ix, w = fz - iz, k = iz * M + ix; gw[0] = HW[(iz + (w > 0.5 ? 1 : 0)) * M + ix + (u > 0.5 ? 1 : 0)] > 0 ? 1 : 0; return mix(mix(HG[k], HG[k + 1], u), mix(HG[k + M], HG[k + M + 1], u), w); };
  // what kind of country it is changes only along the road, and slowly: it is looked up once for every 2 m of the chunk's length, not once a blade
  const ZT = [], ZS = [], ZN = [], ZH = [], ZV = [], ZP = [], ZB = [], ZQ = []; const WT = watOf(floor((oz + CH / 2) / SEG)), ZF = [], FLW = flwAt(oz + CH / 2), FK = flwKind(oz + CH / 2), CAP = FLW ? NGF : NGT;
  for (let j = 0; j < 32; j++) { const zz = oz + j * 2 + 1; ZT[j] = townW(zz); ZS[j] = seaW(zz); ZN[j] = snowW(zz); ZH[j] = hillW(zz); ZV[j] = vergeAt(zz); ZP[j] = pineAt(zz); ZB[j] = beachW(zz); ZQ[j] = max(seaZ(zz), plantW(zz)); ZF[j] = mix(VERGE + 4, 8.5, flwW(zz)); }      // (ZQ: no rice here - by the sea, or in a plantation)
  for (let i = c.gI; i < iEnd; i++) {
    if (ng >= CAP - 2) break;
    const x = ox + R() * CH, z = oz + R() * CH, rs = rdist(x, z), d = abs(rs); if (d < 4.2 || (d < 4.6 && hpW(z) > 0.05)) continue;      // (nor in the switchbacks' gutter)
    const zj = min(31, floor((z - oz) / 2)), tW = ZT[zj], sW = ZS[zj], nW = ZN[zj], hW = ZH[zj];
    const y = hgAt(x, z), u = R(), town = d < 160 && tW > 0.45, tb = town && d > 70; if (gw[0] || (town && (d < 28.5 || u > (tb ? 0.8 : 0.5) || turfAt(x, z) < (tb ? 0.4 : 0.55) || soiD(x, z) < 2.6))) continue;      // in town grass grows only in the yards (and, behind the lanes - tb - on more of the open ground there)
    let pv = 0; { const fx = (x - ox) / GS + 1, fz = (z - oz) / GS + 1, ix = floor(fx), iz = floor(fz), k = iz * M + ix, a = fx - ix, b = fz - iz;      // a house's drive (see buildChunk): none in the wheel tracks, a little between them, thin at the edges
      pv = -mix(mix(min(HW[k], 0), min(HW[k + 1], 0), a), mix(min(HW[k + M], 0), min(HW[k + M + 1], 0), a), b);
      if (pv > 0.44) continue;      // (a temple's swept court: nothing)
      if (tW > 0.45 && d > 70 && civIn(x, z)) continue;
      if (tW > 0.45 && d < 14 && footKc(x, z)) continue;      // (nor up through the raised footpath)      // (nor on a school's yard or a football field's turf - civIn)
      if (WT && WT.paved && abs(z - WT.z) < 2.7 && (x - roadX(WT.z)) * WT.side > 0 && (WT.x - x) * WT.side > 0) continue;      // (nor through the asphalt of a temple's road)
      if (pv > 0.05) { const dl = (1 - (pv - 0.05) / 0.4) * 4; if (dl < 0.4 ? u > 0.3 : dl < 1.5 || (dl < 2.1 && u > 0.45)) continue; } }
    if (sW > 0.3 && x - roadX(z) > 19 && u < ZB[zj] * 1.2) continue;          // no grass on the sand
    if (d < 22 && u > 0.12 && ZP[zj]) continue;
    if (u > 0.12 && nW * GRASS_SNOW > 0.3) continue;                                          // only a few dry stalks stand out of the snow                                      // and little under the casuarinas
    // (A crop stands only where the ground is wholly its plot's. The plots begin gradually - where a flower stretch starts or meets a canal the
    // ground changes from verge to field over the 4 m and more before ZF - and each plot has a path round it 1.8 m wide: planted from where the
    // change began, and right up to the path, flowers stood out on the grass in front of their beds and in the paths between them.)
    // (No crop on a track or within 3.4 m of its middle - its bank is that wide: rice and flowers were planted by the plot they fell in, with no
    // thought for a track across it, and the thin grass let grow between wheel tracks came out, in a flower field, as flowers down the road.)
    if (pv <= 0.002 && d > ZF[zj] + 0.5 && hW < 0.02 && nW < 0.02 && tW < (FLW ? 0.02 : 0.3) && sW < 0.02 && ZQ[zj] < 0.02 && plotAt(x, z, po)[1] > (po[0] >= 4 ? (FK === 1 ? 3.0 : 2.4) : 1.9)) {        // inside a paddy plot, clear of its bunds: rice according to its stage
      const st = po[0];
      // Rice is not sown broadcast but set out by hand in hills, a hand's span apart in rows: so each plant is moved to the nearest place of a
      // lattice 25 cm each way (hx, hz), which is how rice is transplanted in Thailand, and there several blades fan out from one foot. (Plants that fall on the same place make a fuller hill.)
      const hx = (floor(x / 0.25) + 0.5) * 0.25 + (R() - 0.5) * 0.05, hz = (floor(z / 0.25) + 0.5) * 0.25 + (R() - 0.5) * 0.05, hy = st < 4 ? hgAt(hx, hz) : y;
      if (st >= 4) {         // a flower plant, of the one kind this place grows (see flwKind): its stem, its leaves, its head or heads
        if (ng >= NGF - 16) break; const fk = FK, E15 = (h, ls) => floor(h * 50) + min(ls, 4.9) / 5, yw = R() * TAU, r1 = R(), r2 = R(), r3 = R(), r4 = R(), P = (...v) => { gr.set(v, ng * 12); ng++; };
        // (In every kind there are more plants than flowers: besides those in bloom stand as many again, or more, that are stem and leaf only -
        // not yet out, or over. They are what fills a field, seen from the road or from above; all on the same rows.)
        if (fk === 0) {          // Sunflowers, in rows 0.7 m apart: a stout stem as high as a man, hung with broad leaves from knee to shoulder - it
          // is the leaves that make a field of them a green wall under the flowers - and one heavy head.
          if (u > 0.62) continue; const bloom = u < 0.24, fx = (floor(x / 0.7) + 0.5) * 0.7 + (r4 - 0.5) * 0.1, Ls = (1.3 + 0.45 * r1) * (bloom ? 1 : 0.86), size = 0.42 + 0.1 * r2;
          P(fx, y - 0.02, z, Ls, yw, 1.38, 0.024, 0.12, 17, r1, 1, 0.4);
          for (let j = 0, n = bloom ? 4 : 3; j < n; j++) { const a = yw + j * 2.4 + r3, h = Ls * (0.22 + 0.2 * j), ll = 0.4 + 0.16 * ph(j, floor(r2 * 999)); P(fx + cos(a) * 0.02, y + h, z + sin(a) * 0.02, ll, a, 0.12 + 0.4 * r4, ll * 0.42, 0.9, 15, ph(j + 3, floor(r3 * 999)), 0.85, E15(h, Ls)); }
          if (bloom) P(fx + cos(yw) * 0.19 * Ls, y + Ls * 0.96, z + sin(yw) * 0.19 * Ls, size, r4 * TAU, 0.95 + r3 * 0.35, size * 0.55, 0, 9, r3, 1, Ls); else P(fx, y + Ls * 0.9, z, 0.3, yw + 1, 0.9, 0.12, 0.6, 15, r3, 0.9, E15(Ls * 0.9, Ls));
        } else if (fk === 1) {   // Hydrangeas: a bush, not a stalk - waist high, rounded, dense with broad leaves, and on it four or five mopheads
          // set among the leaves at the top and sides. Bushes in rows 1.3 m apart. (A bush has no one stem: each piece sways by its own height.)
          if (u > 0.2) continue; const bloom = u < 0.15, fx = (floor(x / 1.3) + 0.5) * 1.3 + (r4 - 0.5) * 0.2, Hb = 0.7 + 0.35 * r1, h9 = (m) => ph(m, floor(r2 * 99999));
          for (let j = 0; j < 5; j++) { const a = j * 2.39996 + r3 * 6, rr = 0.1 + 0.34 * h9(j), h = Hb * (0.12 + 0.68 * h9(j + 20) + (bloom ? 0 : 0.2)), ll = 0.34 + 0.14 * h9(j + 40); P(fx + cos(a) * rr, y + h, z + sin(a) * rr, ll, a, 0.05 + 0.5 * h9(j + 60), ll * 0.36, 0.8, 15, h9(j + 80), 0.72, E15(h, h)); }
          if (bloom) for (let j = 0; j < 6; j++) { const a = j * 2.2 + r1 * 6, rr = j === 0 ? 0.04 : 0.24 + 0.26 * h9(j + 100), h = Hb * (j === 0 ? 1.04 : 0.66 + 0.34 * h9(j + 120)), size = 0.36 + 0.1 * h9(j + 140);
            P(fx + cos(a) * rr, y + h - size * 0.4, z + sin(a) * rr, size, a, 1.05 + 0.35 * h9(j + 160), size * 0.52, 0, 9, h9(j + 180), 1, h); }
        } else if (fk === 2) {   // Tulips: short, upright cups, one to a stem, two broad leaves at its foot; set out in rows
          // (A chunk holds only so many pieces (NGF), and a field of these small plants reaches that long before it is full: so each plant must
          // cover more - four in five in flower, a bigger cup, two broad leaves - for the rows to close up into a carpet of colour from the road.)
          if (u > 0.9) continue; const bloom = u < 0.72, fx = (floor(x / 0.45) + 0.5) * 0.45 + (r4 - 0.5) * 0.06, Ls = 0.34 + 0.12 * r1, size = 0.24 + 0.05 * r2;
          P(fx, y, z, 0.3 + 0.06 * r3, yw + 2.2, 0.7, 0.075, 0.7, 3, r3, 0.85, 0.1);
          if (bloom) { P(fx, y - 0.02, z, Ls, yw, 1.4, 0.012, 0.1, 17, r1, 1, 0.3); P(fx + cos(yw) * 0.17 * Ls, y + Ls * 0.97, z + sin(yw) * 0.17 * Ls, size, r4 * TAU, 1.42 + r3 * 0.12, 0.08, 0, 9, r3, 1, Ls); } else P(fx, y, z, 0.28 + 0.06 * r1, yw - 1, 0.85, 0.07, 0.6, 3, r1, 0.85, 0.1);
        } else if (fk === 4) {   // Marigolds, in rows 0.55 m apart: a bushy plant knee to thigh high, dark green leaves all through it, and over the
          // top of it four or five round heads facing up and out - most plants in flower in their season, so a field is a sheet of orange or yellow (heads 22 to 28 cm across in the drawing, more than a real one's 8 to 12: from the road at speed they must close up)
          if (u > 0.27) continue; const bloom = u < 0.245, fx = (floor(x / 0.55) + 0.5) * 0.55 + (r4 - 0.5) * 0.08, Hb = 0.58 + 0.32 * r1, h9 = (m) => ph(m, floor(r2 * 99999));
          for (let j = 0; j < 3; j++) { const a = j * 2.39996 + r3 * 6, rr = 0.06 + 0.16 * h9(j), h = Hb * (0.2 + 0.55 * h9(j + 20)), ll = 0.26 + 0.1 * h9(j + 40); P(fx + cos(a) * rr, y + h, z + sin(a) * rr, ll, a, 0.1 + 0.5 * h9(j + 60), ll * 0.3, 0.8, 15, h9(j + 80), 0.62, E15(h, h)); }
          if (bloom) for (let j = 0; j < 4; j++) { const a = j * 2.2 + r1 * 6, rr = j === 0 ? 0.02 : 0.1 + 0.14 * h9(j + 100), h = Hb * (j === 0 ? 1.0 : 0.8 + 0.2 * h9(j + 120)), size = 0.22 + 0.06 * h9(j + 140);
            P(fx + cos(a) * rr, y + h - size * 0.3, z + sin(a) * rr, size, a, 1.15 + 0.3 * h9(j + 160), size * 0.55, 0, 9, h9(j + 180), 1, h); }
        } else {                 // Lilies, in rows 0.6 m apart: a straight leafy stem - narrow leaves standing out all the way up it - and at
          // the top two or three trumpets, each on its own short stalk, facing out a different way.
          // (Seen from a passing car a lily field must read as flowers, not as rows of sticks: seven plants in ten are in bloom, each with a
          // head of three big trumpets that all but hides its top, over a few broad leaves. And a chunk holds only so many pieces (NGF): with
          // more plants than that allows, the last of them were simply left out and the field stood thin - so fewer plants, of fewer, bigger pieces.)
          if (u > 0.26) continue; const bloom = u < 0.18, fx = (floor(x / 0.6) + 0.5) * 0.6 + (r4 - 0.5) * 0.08, Ls = (0.8 + 0.3 * r1) * (bloom ? 1 : 0.85);
          P(fx, y - 0.02, z, Ls, yw, 1.5, 0.013, 0.05, 17, r1, 1, 0.4);
          for (let j = 0, n = bloom ? 3 : 4; j < n; j++) { const a = yw + j * 2.4 + r3 * 3, h = Ls * (0.14 + 0.2 * j); P(fx, y + h, z, 0.42 + 0.1 * r2, a, 0.45, 0.062, 0.9, 15, r2, 0.82, E15(h, Ls)); }
          if (bloom) for (let j = 0; j < 3; j++) { const a = yw + j * 2.1 + r2 * 2, size = 0.44 + 0.1 * ph(j, floor(r3 * 999)); P(fx + cos(a) * 0.14, y + Ls * (1.04 - 0.06 * j) - size * 0.25, z + sin(a) * 0.14, size, a, 1.0 + 0.35 * ph(j + 5, floor(r1 * 999)), size * 0.55, 0, 9, ph(j + 9, floor(r2 * 999)), 1, Ls); }
        }
        ng--;      // (the last piece is counted with everything else, below)
      } else
      if (st === 0) { if (u > 0.3) continue;          // under water: in half of such plots nothing yet, in the rest young seedlings standing out of it in their rows
        if (ph(floor(x / PLX) + 7, floor(z / PLZ) + 3) < 0.5) continue;
        gr.set([hx, hy, hz, 0.18 + 0.12 * R(), R() * TAU, 1.3 + R() * 0.25, 0.009, 0.3, 3, R(), 1, 0.2], ng * 12); }
      else if (st === 1 || st === 2) { if (ng >= CAP - 3) break; const yw = R() * TAU, rp = st === 2, Lh = rp ? 1.0 + 0.2 * R() : 0.62 + 0.2 * R();
        // a hill of rice: two upright cards crossed, each cut into a sheaf of leaves (and, ripe, the hanging ears) by the shader - kinds 12 and 13
        for (let q = 0; q < 2; q++) { gr.set([hx, hy - 0.03, hz, Lh, yw + q * 1.57 + R() * 0.3, 1.42 + R() * 0.12, 0.3 + 0.08 * R(), 0, rp ? 13 : 12, R(), 1, 0.5], ng * 12); if (q < 1) ng++; } }
      else { if (u > 0.3) continue; gr.set([hx, hy, hz, 0.07 + 0.06 * R(), R() * TAU, 1.3 + R() * 0.25, 0.009, 0.2, 4, R(), 1, 0.05], ng * 12); }
    } else if (hW > 0.5 && d < 60 && vnoise(x * 0.06 + 9, z * 0.06) > 0.47 && fbm(x * 0.012 + 40, z * 0.012, 2) < 0.4) {   // tall golden grass along the hill road
      // (in some stretches it is the tall wild grass of the hills - หญ้าพง, หญ้าคา gone to seed - standing well over a man's head)
      const tg = 1 + 0.9 * sm(0.55, 0.72, vnoise(x * 0.018 + 31, z * 0.018 + 5));
      gr.set([x, y - 0.02, z, (0.8 + 0.9 * R()) * tg, R() * TAU, 1.15 + R() * 0.35, (0.012 + R() * 0.008) * (0.8 + 0.2 * tg), 0.5 + R() * 0.9, 4, R(), 1, 0.7 * tg], ng * 12);
      // (tall grass grows in clumps, many stems to one foot: one blade alone that high stood like a stick)
      if (tg > 1.3) for (let q = 0; q < 3 && ng < CAP - 3; q++) { ng++; const tx = x + (R() - 0.5) * 0.5, tz = z + (R() - 0.5) * 0.5;
        gr.set([tx, hgAt(tx, tz) - 0.02, tz, (0.7 + 0.9 * R()) * tg, R() * TAU, 1.1 + R() * 0.4, (0.012 + R() * 0.008) * (0.8 + 0.2 * tg), 0.5 + R() * 0.9, 4, R(), 1, 0.7 * tg], ng * 12); }
    } else {
      // (in the hills, away from the road, the grass is let grow: knee to waist high in broad patches)
      const tall = vnoise(x * 0.11, z * 0.11), hg = hW > 0.3 && d > 9 ? 1 + 1.3 * sm(0.5, 0.68, vnoise(x * 0.025 + 51, z * 0.025 + 9)) * sm(0.3, 0.7, hW) : 1;
      const L = (0.12 + 0.3 * R()) * (0.55 + 1.5 * tall * tall) * (town ? 0.6 : 1) * hg, tf = turfAt(x, z);
      if (tf < 0.43 ? u > 0.03 : u > 0.9) continue;                                    // thick on the turf; on bare earth only the odd weed
      // (on the turf every place has two tufts - each a card of seven blades, kind 16, knee-high at most and two hands wide; single blades
      // stand only on the bare earth: all single blades, seven to the square metre, the turf was the ground's paint with a few hairs on it)
      if (tf >= 0.43 && ng < CAP - 6) { for (let q = 0; q < (FLW ? 1 : 2); q++) { const tx = q ? x + (R() - 0.5) * 0.7 : x, tz = q ? z + (R() - 0.5) * 0.7 : z, Lt = (0.2 + 0.24 * R()) * (0.6 + 1.3 * tall * tall) * (town ? 0.6 : 1) * hg;
          gr.set([tx, (q ? hgAt(tx, tz) : y) - 0.03, tz, Lt, R() * TAU, 1.2 + R() * 0.3, 0.19 + 0.15 * R(), 0.1, 16, R(), 1, 0.25], ng * 12); if (q < (FLW ? 0 : 1)) ng++; } }      // (one tuft only in a chunk of flower fields, which is full of its flowers' pieces as it is)
      else gr.set([x, y - 0.02, z, L, R() * TAU, 1.0 + R() * 0.5, 0.011 + R() * 0.012, 0.4 + R() * 1.3, 2, R(), 1, 0.25], ng * 12);
    }
    ng++;
  }
  c.gI = iEnd; c.gN = ng; if (iEnd < NG && ng < CAP - 2) return;          // more to do next frame
  c.nGrass = ng; c.grassB = ng ? vbuf(gr.subarray(0, ng * 12)) : null; c.grassTried = true; grassJob = null;
}
function dropChunk(c) { c.dead = true; c.pplB && c.pplB.destroy && c.pplB.destroy(); c.fruitB && c.fruitB.destroy && c.fruitB.destroy(); c.meshB && c.meshB.destroy(); c.meshIB && c.meshIB.destroy(); c.boxB && c.boxB.destroy(); c.vb.destroy(); c.segB && c.segB.destroy(); c.leafB && c.leafB.destroy(); c.grassB && c.grassB.destroy(); }
const want = [];
let cxS = 1e9, czS = 1e9;      // the chunk the eye counts as being in: it changes only when the eye is 8 m into the next one
// How wide the world is: land is made out to this far either side of the road and no further (the view itself reaches some 380 m, so from the
// road the edge is never seen; the flying camera is kept inside it).
const WORLD_W = 900;
function updateChunks(px, pz, budget) {
  if (abs(px - (cxS + 0.5) * CH) > CH / 2 + 8) cxS = floor(px / CH); if (abs(pz - (czS + 0.5) * CH) > CH / 2 + 8) czS = floor(pz / CH);
  const cz0 = czS; want.length = 0;
  const keep = new Set();
  const rz = min(5, Math.ceil(380 * viewK / CH)), rx = min(4, rz);      // (a shorter view - viewK, the settings panel - keeps fewer chunks)
  // What is built: the chunks round the eye, as far as it sees (rx, rz), and - when the eye has left the car (the flying camera) - a few round the
  // car as well, for it to stand and be struck on. Nothing between: the whole width from the road out to a flying eye used to be built, and
  // 600 m out that was 150 chunks and more, most of them hidden in the haze. And nothing further than WORLD_W from the road (see flyMove).
  const add = (cx, cz) => { const k = cx + ',' + cz; if (keep.has(k)) return; const xm = (cx + 0.5) * CH, zm = (cz + 0.5) * CH; if (abs(xm - roadX(zm)) > WORLD_W + CH) return;
    keep.add(k); if (!chunks.has(k)) want.push([hypot(xm - px, zm - pz), cx, cz, k]); };
  for (let dz = -rz; dz <= rz; dz++) for (let dx = -rx; dx <= rx; dx++) add(cxS + dx, cz0 + dz);
  if (typeof car !== 'undefined' && hypot(car.x - px, car.z - pz) > CH) { const ccx = floor(car.x / CH), ccz = floor(car.z / CH); for (let dz = -2; dz <= 2; dz++) for (let dx = -1; dx <= 1; dx++) add(ccx + dx, ccz + dz); }
  for (const [k, c] of chunks) if (!keep.has(k)) { dropChunk(c); chunks.delete(k); }
  want.sort((a, b) => a[0] - b[0]);
  if (typeof chunkQueue === 'function') return chunkQueue(want, budget, keep);      // (built by the world worker: see worldclient.js)
  for (let i = 0; i < want.length && i < budget; i++) chunks.set(want[i][3], buildChunk(want[i][1], want[i][2]));
  return want.length;
}
