// --------------------------------------------------------------------------------------------------------- world chunks
const CH = 64, GN = 32, GS = CH / GN;   // chunk size (m), cells per side, cell size
const gridI = new Uint16Array(GN * GN * 6);
for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { const a = j * (GN + 1) + i, b = a + 1, c = a + GN + 1, d = c + 1; gridI.set([a, c, b, b, c, d], (j * GN + i) * 6); }
const ibGrid = vbuf(gridI, GPUBufferUsage.INDEX);
const chunks = new Map(), HUTS = [];
const hg = new Float32Array((GN + 3) * (GN + 3)), hwet = new Float32Array((GN + 3) * (GN + 3)), LBUF = new Float32Array(12 * 260000);
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
  // leaves are written straight into one long array kept for the purpose (LBUF): a wooded chunk has tens of thousands of them, and gathering them in an
  // ordinary list first, then copying, then shuffling leaf by leaf took most of the time a chunk takes to build - time taken out of a frame
  const leaves = { n: 0, get length() { return this.n; }, push(...v) { if (this.n + v.length <= LBUF.length) { LBUF.set(v, this.n); this.n += v.length; } } };
  // thin: every n-th sprig only, each made wider. twigs false: the finest twigs, hidden in the leaves anyway, are left out. farN: how much of the tree still shows from far off.
  // The fishing village on an island (built further down): where its houses stand, so that no tree is planted through one.
  const vil = [], pr0 = pierOf(oz + CH / 2);
  if (isOf(oz + CH / 2) && abs(oz + CH / 2 - IS.zc) < 240) { const zc = IS.zc, hv = (i, j) => ph(IS.s * 16 + i, 700 + j); vil.zc = zc;
    for (let i = 0; i < 9; i++) { const row = i < 5 ? 0 : 1, z = Math.round((zc + 38 + (row ? (i - 5) * 23 + 11 : i * 19) + hv(i, 1) * 5) / GS) * GS, x =      // (on a line of the ground's grid, for its path: see drive, below)
        roadX(z) + (row ? 47 : 19) + hv(i, 2) * 9;
      if (ism(x, z) < -52) vil.push([x, z, -PI / 2 + (hv(i, 4) - 0.5) * 0.3, hv(i, 3) < 0.7, hv(i, 5), hv(i, 6)]); } }
  // Trees are not grown as they are asked for but at the end, once every building of the chunk stands: a tree whose crown would sink into a building
  // (its trunk inside it, or nearer its wall than most of the crown's reach) is left out. Beside a building, in front of it, over a low wall: all fine.
  // nbFoot: the buildings of a neighbouring chunk that stand over the border, for the trees on this side ([x, z, yaw, width, depth, foot, top]); and the
  // ways in that must be kept open, from a gate to the lane or road it gives onto (clear: the same, standing from far below to far above).
  const pend = [], nbFoot = [], clear = (q, yaw, w, d) => nbFoot.push(q[0], q[1], yaw, w, d, -1e9, 1e9), homes = [];
  const plant = (...a) => { pend.push(a); };
  const plantNow = (T, x, z, turn, sc, thin = 1, twigs = true, farN = T.nSegFar) => {
    if (wetAt(x, z)) return;
    { const sv = svW(z); if (sv > 0.05) { const sl = roadSl(z), d = abs(x - roadX(z)) / Math.sqrt(1 + sl * sl); if (d < 3.88 + sv + (udip(z) > 0.1 ? 1.4 : 0.9)) return; } }          // nothing grows in an underpass's cutting, nor on the frontage roads beside it and leading to it (measured square to the road, as they are built)
    for (const v of vil) if (abs(x - v[0]) < 8.5 && abs(z - v[1]) < 8.5) return;
    if (pr0 && abs(x - pr0[0]) < 4.5 && z > pr0[1] - 30 && z < pr0[2]) return;          // (nor on the way down to the pier)
    const y = hAt(x, z), c = cos(turn), sn = sin(turn), S = T.segs, Lf = T.leaves;
    const tr = (px, py, pz, o) => { o.push(x + (px * c - pz * sn) * sc, y + py * sc, z + (px * sn + pz * c) * sc); };
    const enc = (h, r) => Math.round(min(max(h, 0), 60) * 32) + min(r, 31.9) / 32;       // height above the foot (whole part / 32) and reach out from the trunk (fraction * 32), in one number
    const nS = twigs ? T.nSeg : (T.nSegMid || T.nSeg), lw = [1, 1, 1.5, 1.8, 2.1][thin];
    for (let i = 0; i < nS; i++) {
      const o = i < farN ? far : segs, k = i * 10, made = S[k + 8] < -0.5;
      tr(S[k], S[k + 1], S[k + 2], o); o.push(S[k + 3] * sc); tr(S[k + 4], S[k + 5], S[k + 6], o); o.push(S[k + 7] * sc, made ? (S[k + 8] < -1.5 ? -2 - (-S[k + 8] - 2) * sc : -1) : enc(S[k + 8] * sc, hypot(S[k], S[k + 2]) * sc), made ? S[k + 9] : enc(S[k + 9] * sc, hypot(S[k + 4], S[k + 6]) * sc));
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
  const stamp = (B, x, y, z, yaw, s1, s2, fl = 0) => { const c = cos(yaw), sn = sin(yaw); for (const b of B) boxes.push(x + b[0] * c + b[2] * sn, y + b[1], z - b[0] * sn + b[2] * c, yaw, b[3], b[4], b[5], b[6], b[7], b[7] === 1 || b[7] === 9 ? s2 : b[7] === 17 ? ph(floor(x * 7 + b[0] * 13), floor(z * 5 + b[1] * 11)) : s1, b[4], fl ? 2 : b[8] || 0); };
  const swc = seaW(oz + CH / 2);
  // Speed limit signs: wherever the limit changes there is one for each direction of travel, on the driver's left, facing the traffic that is about
  // to come under it and showing the limit that begins there.
  for (let zq = Math.ceil((oz - 8) / 4) * 4; zq < oz + CH + 8; zq += 4) {
    const la = zlim(zq - 2), lb = zlim(zq + 2); if (la === lb || nearRiv(zq, 14)) continue;
    for (const e of [-1, 1]) {          // e = -1: for traffic going up the road (+z), which meets lb; e = 1: for traffic coming down, which meets la
      const a = atan2(roadX(zq + 1) - roadX(zq - 1), 2), so = 5.2 + svW(zq), x = roadX(zq) - e * so * cos(a), zz = zq + e * so * sin(a); if (!inside(x, zz)) continue;      // (so: out beyond a frontage road, beside an underpass)
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
  // speed limit (50, a white disc ringed in red), then the board with the town's name, white or green, on two steel posts.
  for (let s0 = floor(oz / SEG), s = s0 - 2; s <= s0 + 2; s++) {
    const sp = townSpan(s); if (!sp) continue;
    for (const e of [-1, 1]) {
      const z0 = (s + 0.5 + e * ((e < 0 ? sp[0] : sp[1]) - 0.045)) * SEG; if (townW(z0 + e * 80) > 0.5) continue;      // (two towns grown together have no edge here)
      for (const [dz, off, kind] of [[30, 6.8, 0]]) {          // (the 50 sign is put up with all the other limit signs, below)
        const z = z0 + e * dz, a = atan2(roadX(z + 1) - roadX(z - 1), 2), x = roadX(z) - e * off * cos(a), zz = z + e * off * sin(a); if (!inside(x, zz) || nearRiv(z, 14)) continue;
        const yaw = a + (e > 0 ? 0 : PI), c = cos(yaw), sn = sin(yaw), y = ground(x, zz);            // turned to face the traffic coming in
        const put = (lx, ly, lz, sx, sy, sz, mat, seed = 0, h = sy) => boxes.push(x + lx * c + lz * sn, y + ly, zz - lx * sn + lz * c, yaw, sx, sy, sz, 0, mat, seed, h, 0);
        if (kind === 0) { for (const d of [-1, 1]) put(d, 1.3, -0.08, 0.09, 2.6, 0.09, 34); put(0, 2.25, 0, 2.6, 1.1, 0.06, 23, ph(s, 91) < 0.6 ? 0.78 : 0.63, -1.1); }
        else { put(0, 1.2, -0.06, 0.07, 2.4, 0.07, 34); put(0, 2.4, 0, 0.75, 0.75, 0.04, 37, 0, 50); }
      }
    }
  }
  if (twc > 0.2 || swc > 0.3) {
    if (twc > 0.2) {
    // Rows of shophouses (ตึกแถว) along both sides of the street. Proportions as they are really built: a unit 4 m wide and
    // 12 m deep; a tall ground floor with a mezzanine (5 m), upper floors of 3 m; mostly three storeys; a canopy over the
    // footpath. Blocks of eight units with a lane between; each block is one build (same height and style), each unit its own colour.
    const UW = 4, DEP = 12;
    // (A unit belongs to the chunk its middle stands in, and where the road slants that middle lies up to 10 m along z from the unit's place on the
    // road: so the units of the next 28 m either way are gone through as well. Without this, buildings went missing at chunk borders.)
    for (let k = Math.ceil((oz - 28) / UW - 0.5); (k + 0.5) * UW < oz + CH + 28; k++) {
      const z = (k + 0.5) * UW, um = ((k % 9) + 9) % 9; if (townW(z) < 0.5 || um === 8 || nearRiv(z, 9)) continue; const tseg = twS;
      if ((um === 7 && xroad(floor(k / 9))) || (um === 0 && xroad(floor(k / 9) - 1))) continue;      // the corners of a crossroads are left open
      const a = atan2(roadX(z + 1) - roadX(z - 1), 2), blk = floor(k / 9);
      for (const side of [1, -1]) {
        // Every town has its own character (tch: old market town ... newer concrete town), and every block of the street is drawn by lot:
        // a row of shophouses of its own length and setback, or an open square with trees, a single large shop, a market, a temple, a filling station.
        const seg = tseg, tch = ph(seg, 300), bq = blk * 2 + (side > 0 ? 1 : 0), bt = ph(bq, 310 + seg), len = 4 + floor(ph(bq, 320 + seg) * 5), sb = 8 + floor(ph(bq, 330 + seg) * 3) * 1.3 + (udOf(blk * 36 + 18) && abs(blk * 36 + 18 - UD.zc) < 130 ? SVW : 0);      // (back beyond the frontage road, beside an underpass)
        let kind = bt < 0.13 ? 1 : bt < 0.27 ? 2 : bt < 0.27 + (tch < 0.6 ? 0.13 : 0.04) ? 3 : bt > 0.94 ? 5 : 0;
        if (((blk % 24) + 24) % 24 === floor(tch * 24) && (side > 0) === (ph(seg, 301) < 0.5)) kind = 4;
        // convenience stores are spaced out: one to every twelve blocks of street (about 430 m), on one side or the other, and never in the first or
        // last two blocks of its twelve, so two of them are at least 180 m apart. It takes the place of a row of shophouses or of a large shop.
        const sg = floor(blk / 12), store = (kind === 0 || kind === 2) && blk - sg * 12 === 2 + floor(ph(sg, 346 + seg) * 7.99) && (side > 0) === (ph(sg, 348 + seg) < 0.5);
        if (store) kind = 2;
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
            else if (kind === 2) tree(X + (20 + floor(s1 * 3) * 3) / 2 + 2.5, 3, 0.6, s2);
            else if (kind === 4) { tree(X + 3, 0, 0.9, s1); tree(X + 14, 3, 0.8, s2); tree(X - 15, 3.5, 0.7, ph(bq, 450)); } } }
          else if (um >= len) { if (um === len && ph(bq, 460) < 0.6) tree(1, 1, 0.7 + ph(bq, 461) * 0.4, ph(bq, 462)); }
          else if (tch > 0.25 && (um === 1 || um === 5) && ph(k, side + 470) < 0.55) tree(0, fwd - 7.1 - svW(z), 0.5 + ph(k, side + 471) * 0.2, ph(k, side + 472));
          continue;
        }
        if (kind) {
          if (um !== 3) continue; const X = 2 * side, s1 = ph(bq, 340 + seg), s2 = ph(bq, 350 + seg);       // X: the middle of the block along the street
          if (kind === 1) {            // a small square: shade trees, benches, a pavilion, a low kerb round it
            for (let i = 0; i < 5; i++) tree(X - 12 + i * 6 + (ph(bq, 360 + i) - 0.5) * 3, 2 - ph(bq, 370 + i) * 9, 0.7 + ph(bq, 380 + i) * 0.5, ph(bq, 390 + i));
            for (const bx of [-8, 0, 8]) { put(X + bx, 0.72, 4.6, 1.7, 0.07, 0.45, 0); put(X + bx, 1.0, 4.36, 1.7, 0.4, 0.06, 0); put(X + bx - 0.7, 0.5, 4.6, 0.08, 0.4, 0.4, 2); put(X + bx + 0.7, 0.5, 4.6, 0.08, 0.4, 0.4, 2); }
            put(X, 0.42, 5.7, 31, 0.25, 0.3, 2); { const q = Wd(X - 11, 4.2); far.push(q[0], y, q[1], 0.06, q[0], y + 8.3, q[1], 0.045, -1, 0); for (let i = 0; i < 9; i++) put(X - 10.95 + (i + 0.5) * 0.2, 7.6, 4.2, 0.2, 1.2, 0.02, 38, (i + 0.5) * 0.2); }      // the flag: nine strips of cloth (the vertex stage waves them as one)
            { const q = Wd(X + 4, -4); stamp(SALA, q[0], y + 0.3, q[1], yaw, 0.7, s1); }
          } else if (kind === 2) {     // one large shop set back behind its forecourt: glass front, a long sign, a pylon sign at the kerb
            const conv = store, Wt = 20 + floor(s1 * 3) * 3, small = conv && ph(bq, 346 + seg) < 0.5, Wb = conv ? (small ? 11 : 20) : Wt, Hb = conv ? (small ? 3.7 : 5.1) : s2 < 0.5 ? 4.6 : 8;
            if (conv) {                // the parking in front of either kind of convenience store: bays marked in yellow, a couple of motorcycles
              for (let i = 0; i <= 5; i++) put(X - 5 + i * 2.4, 0.325, 7.0, 0.11, 0.02, 2.6, 33, 0.3);
              for (let i = 0; i < 2; i++) if (ph(bq, 347 + i) < 0.7) { const lx = X + Wb / 2 - 0.9 - i * 0.8, lz = 5.9, bc = [0.1, 0.48, 0.9][floor(ph(bq, 349 + i) * 2.99)];
                put(lx, 0.74, lz - 0.05, 0.2, 0.26, 0.85, 33, bc); put(lx, 0.93, lz - 0.3, 0.24, 0.08, 0.7, 3); put(lx, 0.95, lz + 0.4, 0.22, 0.6, 0.06, 33, bc, -0.3); put(lx, 1.28, lz + 0.34, 0.62, 0.04, 0.04, 3);
                for (const wz of [0.62, -0.62]) put(lx, 0.57, lz + wz, 0.09, 0.56, 0.56, 39, 0); }
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
              put(X, 3.55, 4.25, Wb + 1.4, 0.06, 2.7, 41, s1, 0.17); put(X, 4.55, 3.35, Wb + 0.5, 1.45, 0.5, 41, s2); put(X, 4.55, 3.63, 6.6, 0.95, 0.08, 23, 2);
              for (let i = 0; i < 4; i++) { const bx = X - 3.6 + i * 1.9; put(bx, 0.82, 5.5, 0.17, 0.8, 0.17, 19); put(bx, 1.28, 5.5, 0.18, 0.14, 0.18, 33, 0.3); }      // white posts with yellow caps
              for (let i = 0; i < 4; i++) put(X + Wb / 2 - 0.65, 0.62 + i * 0.3, 3.55, 0.6, 0.28, 0.4, 33, 0.9);                                              // a stack of orange crates by the door
              put(X - 2, Hb + 0.75, -3, 2.4, 0.9, 1.2, 22);
            } else if (conv) {         // the long kind: a long low grey box with a tall plain front above a thin flat canopy, glass from end
              // to end with the lit shop behind it, the door toward one end, a row of white posts along the front, the name on a board in the middle of the wall above
              put(X, 4.3, 3.06, 8.5, 0.95, 0.12, 23, 2);
              put(X, 3.42, 3.9, Wb + 0.7, 0.13, 2.1, 2); put(X, 3.42, 4.96, Wb + 0.7, 0.2, 0.05, 3); put(X, 5.36, 3.02, Wb + 0.1, 0.1, 0.12, 19);
              for (let i = 0; i <= 12; i++) put(X - (Wb - 0.6) / 2 + i * (Wb - 0.6) / 12, 1.85, 3.08, i === 9 || i === 11 ? 0.13 : 0.05, 3.0, 0.1, 19);          // the frames of the glass; the door is between the thicker ones
              put(X, 0.4, 3.07, Wb - 0.6, 0.12, 0.1, 19); put(X, 2.55, 3.07, Wb - 0.6, 0.05, 0.1, 19); put(X + (Wb - 0.6) / 12 * 4, 1.5, 3.1, 0.06, 0.5, 0.06, 2);
              for (let i = 0; i <= 10; i++) put(X - Wb / 2 + 0.6 + i * (Wb - 1.2) / 10, 0.75, 5.0, 0.13, 0.9, 0.13, 19);                                    // the posts that keep cars off the pavement
              put(X - Wb / 2 + 1.4, 0.8, 3.72, 1.7, 1.0, 0.8, 19, s1); put(X - Wb / 2 + 1.4, 1.34, 3.72, 1.74, 0.08, 0.84, 2); put(X + Wb / 2 - 0.9, 0.75, 3.75, 0.5, 0.9, 0.5, 2);
              put(X + 4, Hb + 0.75, -3, 2.4, 0.9, 1.2, 22); put(X - 4, Hb + 0.75, -2, 2.4, 0.9, 1.2, 22);
            } else {
              put(X, Hb / 2 + 0.3, -1.5, Wb, Hb, 9, 18, s1); put(X, 1.75, 3.03, Wb - 3, 2.7, 0.08, 17, s2); put(X, 3.75, 3.1, Wb - 1, 1.0, 0.16, 23, s2); put(X, 3.2, 4.0, Wb, 0.12, 2.0, 2);
              if (Hb > 5) for (let i = 0; i < 5; i++) { const wx = X - Wb / 2 + (i + 0.5) * Wb / 5; put(wx, 6.2, 3.03, Wb / 5 - 1.2, 1.5, 0.08, 17, ph(bq, 400 + i)); put(wx, 7.1, 3.2, Wb / 5 - 0.9, 0.07, 0.45, 2); }
              put(X + Wb / 2 - 3, Hb + 0.75, -3, 2.4, 0.9, 1.2, 22); put(X - Wb / 2 + 3, Hb + 0.75, -2, 2.4, 0.9, 1.2, 22);
            }
            { const q = Wd(X - Wb / 2 - 1.5, 5.4); far.push(q[0], y, q[1], 0.11, q[0], y + 6.2, q[1], 0.09, -1, 0); } put(X - Wb / 2 - 1.5, 6.0, 5.4, 1.9, 2.3, 0.28, 23, conv ? 2 : s1);
            tree(X + Wt / 2 + 2.5, 3, 0.6, s2); { const q = Wd(X - Wb / 2 - 2.4, 1.2); if (soiD(q[0], q[1]) > 3.9) stamp(SHRINE_B, q[0], y + 0.3, q[1], yaw, 0, 0); }      // the shop's spirit houses at the corner of its forecourt
          } else if (kind === 3) {     // the market: tin roofs on posts, tables of goods under them, stalls with umbrellas out at the kerb
            for (const bx of [-10.5, 0, 10.5]) {
              put(X + bx, 3.5, -0.5, 9.4, 0.08, 9.5, 1, ph(bq, 410 + bx), bx ? 0.1 : -0.1);
              for (const px of [-4.3, 4.3]) for (const pz of [-4.8, 3.8]) put(X + bx + px, 1.7, pz, 0.12, 3.4, 0.12, 4);
              for (let i = 0; i < 3; i++) { const tz = -3.4 + i * 3; put(X + bx, 0.95, tz, 6.6, 0.07, 1.1, 0, 0.7); for (let j = 0; j < 5; j++) put(X + bx - 2.6 + j * 1.3, 1.18, tz, 0.9, 0.36, 0.8, j % 2 ? 20 : 18, ph(bq * 5 + j, 420 + i + bx)); }
            }
            for (const bx of [-5.25, 5.25]) put(X + bx, 3.05, 3.6, 3.6, 0.04, 3.2, 33, 0.48, 0.22);                         // blue tarpaulins strung between the roofs
            for (let i = 0; i < 6; i++) { const bx = X - 12 + i * 4.6 + ph(bq, 470 + i) * 2, n = 1 + floor(ph(bq, 480 + i) * 3); for (let j = 0; j < n; j++) put(bx, 0.5 + j * 0.34, 3.9, 0.6, 0.32, 0.42, 33, ph(bq, 490 + i) < 0.5 ? 0.1 : 0.48); }      // stacks of plastic crates
            for (let i = 0; i < 5; i++) { const bx = X - 13 + i * 6.5 + ph(bq, 430 + i) * 2; put(bx, 0.85, 5.3, 1.5, 0.9, 0.8, 0, 0.3); for (let j = 0; j < 3; j++) put(bx - 0.48 + j * 0.48, 1.38, 5.3, 0.42, 0.16, 0.62, 33, [0.63, 0.9, 0.1, 0.3][floor(ph(bq * 3 + j, 495 + i) * 3.99)]); put(bx, 1.6, 5.3, 0.05, 1.8, 0.05, 19); put(bx, 2.5, 5.3, 3.0, 0.06, 3.0, 29, ph(bq, 440 + i)); }
          } else if (kind === 4) {     // the temple: a white wall and roofed gate, the hall with its stepped roofs and gilded finials, a white chedi
            put(X - 9.5, 0.75, 5.5, 13, 1.3, 0.3, 41); put(X + 9.5, 0.75, 5.5, 13, 1.3, 0.3, 41);
            for (const gx of [-2.6, 2.6]) put(X + gx, 1.6, 5.5, 0.7, 3.0, 0.7, 41); put(X, 3.9, 5.5, 6.6, 1.9, 2.4, 9, 0.05, 0, 1); put(X, 5.2, 5.5, 0.1, 0.8, 0.1, 15);
            const hx = X - 6;
            put(hx, 0.7, -2, 15.5, 1.2, 9.5, 41); put(hx, 4.0, -2, 12.5, 5.4, 6.6, 41);
            for (let i = 0; i < 6; i++) { put(hx - 6 + i * 2.4, 3.7, 1.9, 0.5, 4.8, 0.5, 41); put(hx - 6 + i * 2.4, 3.7, -5.9, 0.5, 4.8, 0.5, 41); if (i < 5) put(hx - 4.8 + i * 2.4, 3.6, 1.32, 1.0, 2.6, 0.08, 14); }
            put(hx, 9.05, -2, 9.0, 4.7, 7.6, 9, 0.05, 0, 1);                                                         // the high middle of the roof
            for (const ex of [-1, 1]) { put(hx + ex * 5.9, 8.55, -2, 3.2, 3.7, 6.4, 9, 0.05, 0, 1); put(hx + ex * 7.53, 8.45, -2, 0.06, 3.3, 5.6, 15, 0, 0, 1);      // a lower length at each end, its gable filled with gold
              for (const [fx, fy] of [[7.5, 10.4], [4.5, 11.4]]) { let q = Wd(hx + ex * (fx + 0.2), -2); boxes.push(q[0], y + fy + 0.4, q[1], yaw + PI / 2, 0.1, 0.95, 0.1, ex * 0.45, 15, 0, 0, 0); q = Wd(hx + ex * (fx + 0.62), -2); boxes.push(q[0], y + fy + 0.98, q[1], yaw + PI / 2, 0.08, 0.6, 0.08, ex * 0.95, 15, 0, 0, 0); }      // the finial (ช่อฟ้า) leans out from the ridge end and curls up
              for (const ez of [-1, 1]) put(hx + ex * 7.58, 8.62, -2 + ez * 1.6, 0.12, 0.2, 4.95, 15, 0, ez * 0.857); }      // gilded bargeboards down the gable's two edges                                                    // finials at the ridge ends
            for (const ez of [-1, 1]) { put(hx, 6.2, -2 + ez * 4.5, 15.4, 0.08, 2.5, 9, 0.05, ez * 0.5); put(hx, 5.62, -2 + ez * 5.62, 15.4, 0.1, 0.28, 33, 0.63); }      // the skirt of the roof over the colonnade, its edge in green
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
          if (um === len) { if (ph(bq, 460) < 0.6) tree(1, 1, 0.7 + ph(bq, 461) * 0.4, ph(bq, 462)); else { put(0, 0.85, 4.6, 1.6, 0.9, 0.8, 0, 0.3); put(0, 1.5, 4.6, 0.05, 1.6, 0.05, 19); put(0, 2.3, 4.6, 2.1, 0.06, 2.1, 29, ph(bq, 463)); } }
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
        const bike = (lx, lz, s2) => { const bm = s2 < 0.1 ? 3 : 33, bc = s2 < 0.45 ? 0.1 : s2 < 0.75 ? 0.48 : 0.78;      // black, red, blue or white
          put(lx, 0.74, lz - 0.05, 0.2, 0.26, 0.85, bm, bc); put(lx, 0.93, lz - 0.3, 0.24, 0.08, 0.7, 3); put(lx, 0.95, lz + 0.4, 0.22, 0.6, 0.06, bm, bc, -0.3); put(lx, 1.28, lz + 0.34, 0.62, 0.04, 0.04, 3); put(lx, 1.15, lz + 0.5, 0.14, 0.12, 0.07, 19); put(lx, 1.02, lz + 0.64, 0.3, 0.2, 0.24, 3);
          for (const wz of [0.62, -0.62]) put(lx, 0.57, lz + wz, 0.09, 0.56, 0.56, 39, 0); };
        // a pickup truck drawn up before a shut shop where the row stands back from the footpath: white, silver or black
        const truck = (lx, lz, s2) => { const tm = s2 < 0.5 ? 33 : s2 < 0.8 ? 34 : 3;
          put(lx, 0.95, lz, 5.1, 0.62, 1.78, tm, 0.78); put(lx + 0.75, 1.55, lz, 1.9, 0.62, 1.66, tm, 0.78); put(lx + 0.75, 1.6, lz, 1.98, 0.42, 1.74, 17, 0.2); put(lx - 1.55, 1.27, lz, 1.9, 0.06, 1.5, 3);
          for (const wx of [-1.6, 1.6]) for (const wz of [-0.8, 0.8]) put(lx + wx, 0.62, lz + wz, 0.64, 0.64, 0.22, 39, 1); };
        const table = (lx, lz, s2) => { put(lx, 1.04, lz, 0.75, 0.05, 0.75, 34); put(lx, 0.68, lz, 0.06, 0.7, 0.06, 34); for (const d of [-0.62, 0.62]) put(lx + d, 0.53, lz, 0.3, 0.46, 0.3, 33, s2); };
        put(0, (Hh + GF) / 2 + par * 0.01, par * 0.015, Ww, Hh - GF + par * 0.02, DEP - par * 0.03, wood ? 16 : 6, wc);                            // the floors over the shop
        put(0, GF / 2, -SD / 2 + par * 0.015, Ww, GF, DEP - SD - par * 0.03, wm, wc);                                    // behind the shop: store room, kitchen, stair
        put(-Wf / 2, GF / 2 + 0.01, F - SD / 2, 0.16, GF + 0.02, SD, wood ? 0 : 18, bs); if (endU) put(Wf / 2, GF / 2 + 0.01, F - SD / 2, 0.16, GF + 0.02, SD, wood ? 0 : 18, bs);      // party walls
        put(0, 0.3, F - SD / 2 + 0.2, Wf, 0.12, SD + 0.4, 2);                                        // the shop floor, a step above the footpath
        if (sk === 0 || u(64) < 0.12) put(0, sk === 0 ? 1.7 : 2.62, F - 0.14, Wf - 0.3, sk === 0 ? 2.7 : 0.86, 0.06, wood ? 35 : 32, u(63));      // the shutter: down, or left half way
        else if (wood) for (const d of [-1, 1]) put(d * (Wf / 2 - 0.36), 1.7, F - 0.16, 0.5, 2.7, 0.14, 35, u(63));                              // folding doors pushed back to the sides
        if (sk === 1) {                // grocery (โชห่วย): shelves on three walls, a drinks fridge, crates and sacks out in front
          put(0, 1.72, zb, Wf - 0.3, 2.6, 0.08, 31, u(62)); for (const d of [-1, 1]) put(d * (Wf / 2 - 0.36), 1.45, F - SD / 2 - 0.4, 0.5, 2.1, SD - 1.4, 31, u(65 + d));
          put(1.22, 1.3, F - 0.55, 0.7, 1.9, 0.66, 19); put(1.22, 1.38, F - 0.2, 0.58, 1.55, 0.03, 17, 0.9);
          for (let i = 0; i < 3; i++) { put(-1.45 + i * 0.6, 0.56, F + 0.5, 0.55, 0.4, 0.42, 33, u(70 + i)); if (u(73 + i) < 0.5) put(-1.45 + i * 0.6, 0.96, F + 0.5, 0.55, 0.4, 0.42, 33, u(76 + i)); }
        } else if (sk === 2) {         // eating place: steel tables and plastic stools, the menu on the wall, the cook's cabinet out at the front
          put(0, 2.3, zb, 2.4, 0.8, 0.06, 23, u(62)); put(0, 1.0, zb, Wf - 0.3, 1.2, 0.05, 19);
          table(-0.95, F - 1.3, u(65)); table(0.95, F - 2.9, u(66)); table(-0.95, F - 2.9, u(65)); if (u(67) < 0.6) table(0.6, F + 1.5, u(66));
          put(1.15, 0.86, F - 0.3, 1.2, 0.9, 0.62, 34); put(1.15, 1.6, F - 0.3, 1.1, 0.58, 0.52, 17, 0.9); put(1.15, 1.92, F - 0.3, 1.16, 0.05, 0.6, 34);
        } else if (sk === 3) {         // gold shop (ร้านทอง): everything red and gold, glass counters
          put(0, 1.72, zb, Wf - 0.3, 2.6, 0.08, 14); for (const d of [-1, 1]) put(d * (Wf / 2 - 0.14), 1.72, F - SD / 2, 0.06, 2.6, SD - 0.3, 14);
          put(0, 0.8, F - 1.3, 3.0, 0.9, 0.6, 14); put(0, 1.4, F - 1.3, 3.0, 0.3, 0.6, 17, 0.9); put(0, 2.84, F - 0.1, Wf - 0.3, 0.42, 0.08, 14);
        } else if (sk === 4) {         // glass-fronted and air-conditioned: a clinic, a pharmacy, a minimart, a phone shop
          put(0, 1.7, F - 0.12, Wf - 0.34, 2.68, 0.05, 17, 0.5 + u(66) * 0.5); put(0, 0.56, F - 0.07, Wf - 0.3, 0.4, 0.09, 33, u(67)); put(0, 2.45, F - 0.09, Wf - 0.3, 0.07, 0.07, 19);
          for (const mx of [-0.62, 0.62]) put(mx, 1.7, F - 0.09, 0.06, 2.68, 0.07, 19);
        } else if (sk === 5) {         // motorcycle workshop: parts on the wall, a machine up on the floor, an oil drum, tyres
          put(0, 1.72, zb, Wf - 0.3, 2.6, 0.08, 31, u(62)); bike(-0.9, F - 1.6, u(68)); cyl(1.3, 0.36, F - 0.7, 0.29, 1.3, 1.25, F - 0.7, 0.29, u(69) < 0.5 ? 4 : 2);
          for (let i = 0; i < 3; i++) cyl(1.2, 0.42 + i * 0.2, F - 2.2, 0.3, 1.2, 0.6 + i * 0.2, F - 2.2, 0.3, 1);
        }
        const trk = sk === 0 && sb > 10 && um > 0 && um < 7 && u(142) < 0.45; if (trk) truck(0, F + 1.45, u(143));
        const kz = F + sb - 4.75 - svW(z);                                                        // just inside the kerb (which, where frontage roads leave the main road for an underpass, stands out beyond them: at 4.75 m from the road's middle these stood in the frontage road's way)
        if (u(81) < 0.3) bike(u(82) * 2.8 - 1.4, kz, u(83)); if (u(84) < 0.12) bike(u(85) * 2.8 - 1.4, kz, u(86));      // motorcycles left at the kerb
        if (sk && u(87) < 0.2) put(u(88) * 2 - 1, 0.78, F + 2.3, 0.6, 0.95, 0.05, 23, u(89), 0.18);                       // a board standing on the footpath
        if (wood) {
          put(-Wf / 2, Hh / 2, F + 0.05, 0.18, Hh, 0.18, 4); if (endU) put(Wf / 2, Hh / 2, F + 0.05, 0.18, Hh, 0.18, 4);      // posts (one between each pair of units, not two in the same place)
          put(0, 3.1, F + 1.05, Wf, 0.05, 2.3, 1, bs, 0.2);                                                                // tin lean-to over the footpath
          put(0, 5.0, F + 0.45, Wf, 0.08, 0.95, 0); put(0, 5.92, F + 0.9, Wf, 0.06, 0.07, 4); for (let x = -1.8; x <= 1.81; x += 0.4) put(x * Wf / UW, 5.48, F + 0.9, 0.04, 0.82, 0.04, 4);      // the long balcony
          put(-0.95, 6.15, F + 0.03, 0.85, 2.0, 0.06, u(90) < 0.5 ? 3 : 35, bs); for (const d of [-1, 1]) put(-0.95 + d * 0.66, 6.15, F + 0.05, 0.42, 2.0, 0.05, 35, bs);          // a door on to it, its leaves open
          put(0.95, 6.5, F + 0.03, 0.9, 1.2, 0.06, 3); for (const d of [-1, 1]) put(0.95 + d * 0.68, 6.5, F + 0.05, 0.44, 1.2, 0.05, 35, bs);                                     // a shuttered window
          if (u(3) < 0.6) put(0, 4.2, F + 0.12, UW * 0.8, 0.8, 0.08, 23, u(4));
        } else {
        put(-Wf / 2, Hh / 2, F + 0.1, 0.3, Hh, 0.32, 18, bs); if (endU) put(Wf / 2, Hh / 2, F + 0.1, 0.3, Hh, 0.32, 18, bs);   // party-wall piers
        put(0, 3.2, F + 0.85, Wf, 0.12, 1.7, 2); put(0, 3.05, F + 1.66, Wf, 0.3, 0.08, 2);            // concrete canopy with a downstand
        if (u(1) < 0.45) put(0, 2.72, F + 2.2, UW * 0.92, 0.04, 1.3, u(8) < 0.5 ? 36 : 1, u(8) < 0.5 ? [0.63, 0.63, 0.48, 0.48, 0.1][floor(u(2) * 4.99)] : u(2), 0.3);  // extra awning out over the footpath: tin, or striped canvas
        if (u(3) < 0.78) put(0, 4.05, F + 0.12, UW * 0.84, 1.05, 0.1, 23, u(4));                     // the shop's sign across the front
        if (u(5) < 0.1) put((u(6) < 0.5 ? -1 : 1) * (UW / 2 - 0.25), 3.98, F + 1.0, 0.14, 0.8, 1.2, 23, u(7));   // now and then a small lightbox standing out from the wall above the canopy
        for (let f = 1; f < st; f++) {
          const yb = 5 + (f - 1) * 3;
          if (balc) {         // a balcony: slab, parapet or bars, a glazed door and a window behind
            put(0, yb + 0.05, F + 0.5, Wf - 0.3, 0.1, 1.0, 2);
            if (bs < 0.5) put(0, yb + 0.55, F + 0.97, Wf - 0.3, 0.9, 0.08, 18, bs);
            else { put(0, yb + 1.0, F + 0.97, Wf - 0.3, 0.05, 0.05, 4); put(0, yb + 0.25, F + 0.97, Wf - 0.3, 0.04, 0.04, 4); for (let x = -1.75; x <= 1.76; x += 0.35) put(x * Wf / UW, yb + 0.6, F + 0.97, 0.03, 0.8, 0.03, 4); }
            put(-0.85, yb + 1.15, F + 0.02, 1.0, 2.2, 0.08, 19); put(-0.85, yb + 1.13, F + 0.075, 0.86, 2.06, 0.04, 17, u(10 + f));
            put(0.95, yb + 1.55, F + 0.02, 1.4, 1.3, 0.08, 19); put(0.95, yb + 1.55, F + 0.075, 1.26, 1.16, 0.04, 17, u(20 + f)); put(0.95, yb + 1.55, F + 0.115, 0.04, 1.16, 0.02, 19);
            if (u(92 + f) < 0.3) { put(0, yb + 1.95, F + 0.98, Wf - 0.3, 1.85, 0.04, 27, bs); for (const d of [-1, 1]) put(d * (Wf / 2 - 0.17), yb + 1.95, F + 0.5, 0.04, 1.85, 0.95, 4); }      // caged in with steel bars (เหล็กดัด)
            else if (u(96 + f) < 0.35) for (let i = 0; i < 4; i++) put(-1.2 + i * 0.75, yb + 1.75, F + 0.8, 0.5, 0.5 + u(100 + i + f * 4) * 0.4, 0.03, i % 2 ? 19 : 33, u(104 + i + f * 4));     // washing hung out
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
        if (u(93) < 0.45) { put(0.3, 1.45, -F - 1.25, UW - 0.8, 2.3, 2.5, 18, u(94)); put(0.3, 2.78, -F - 1.4, UW - 0.3, 0.05, 3.1, 1, u(95), -0.13); }      // a kitchen built on at the back under a tin roof
        else { put(-0.9, 1.33, -F - 0.03, 0.9, 2.0, 0.06, 4); if (u(94) < 0.5) cyl(0.9, 0.3, -F - 0.7, 0.42, 0.9, 1.3, -F - 0.7, 0.36, 4); }                 // or just the back door and a water jar
        if (!wood && (last || um === 0) && u(97) < 0.3 && st > 2) put((last ? side : -side) * (Ww / 2 + 0.07), 8.2, 0.5, 0.08, 2.6, 6, 23, u(98));                   // a big advertisement on the end wall
        if (u(53) < 0.22 && !trk) { put(u(54) < 0.5 ? -1.5 : 1.5, 0.52, F + 0.7, 0.5, 0.45, 0.5, 2); const px = (u(54) < 0.5 ? -1.5 : 1.5), wx = cx + px * c + (F + 0.7) * sn, wz = cz - px * sn + (F + 0.7) * c; if (inside(wx, wz)) plant(TREES[8 + (u(55) < 0.4 ? 1 : 0)], wx, wz, u(56) * 6, 0.45); }   // a potted shrub by the door
      }
    }
    // the kerb: a line of stones standing 15 cm above the road, 3.88 m from its middle measured along x (as the ground's own kerb paint is),
    // in pieces 2.5 m long that stop clear of the lanes' mouths and of the bridge
    for (let k = Math.ceil(oz / 2.5 - 0.5); (k + 0.5) * 2.5 < oz + CH; k++) {
      const z = (k + 0.5) * 2.5; if (townW(z) < 0.5 || nearRiv(z, 12)) continue;
      for (const side of [1, -1]) { const kp = (zz) => svSide(zz, side, 3.88 + svW(zz)), [x, zk] = kp(z); if (!inside(x, zk)) continue;      // (beside an underpass, the frontage road's outer kerb)
        const p0 = kp(z - 1), p1 = kp(z + 1), a = atan2(p1[0] - p0[0], p1[1] - p0[1]), len = 1.25 * hypot(p1[0] - p0[0], p1[1] - p0[1]) + 0.04;
        if (soiD(x, zk) > 2.15 + len / 2) boxes.push(x, roadYs(z) + 0.05, zk, a, 0.25, 0.2, len, 0, 40, 0, 0.2, 0);
        else for (let j = 0; j < 4; j++) { const zq = z + (j - 1.5) * 0.625, q = kp(zq); if (soiD(q[0], q[1]) > 2.15 + len / 8) boxes.push(q[0], roadYs(zq) + 0.05, q[1], a, 0.25, 0.2, len / 4, 0, 40, 0, 0.2, 0); } }
    }
    // the tangle of cables every Thai street has: a thick bundle strung along the shopfronts on slim posts 20 m apart. No post stands in the
    // canal: there the cables run on in one span of 40 m to the post beyond. They end at a post, never in mid-air.
    for (let k = Math.ceil(oz / 20); k * 20 < oz + CH; k++) {
      const z = k * 20, postAt = (zz) => townW(zz) >= 0.5 && !(rivOf(zz) && abs(zz - RV.zr - rivM(roadX(zz) - 7.7)) < RV.W / 2 + 6); if (!postAt(z)) continue;      // (measured to where the water really runs at the post)
      let span = 0; for (let j = 1; j <= 4 && !span; j++) { if (townW(z + 20 * j) < 0.5) break; if (postAt(z + 20 * j)) span = 20 * j; }      // on to the next post that stands, up to 80 m (a river)
      for (const side of [-1]) {                        // (the other side's cables hang on the electricity poles)
        const x = roadX(z) + side * (7.7 + svW(z)); if (!inside(x, z)) continue;
        const y = roadYs(z), y1 = roadYs(z + span), x1 = roadX(z + span) + side * (7.7 + svW(z + span)), wx = (t) => mix(x, x1, t);      // (straight from post to post, as a stretched cable hangs)
        far.push(x, y - 0.2, z, 0.07, x, y + 6.2, z, 0.06, -1, 0);
        if (span) { reach = max(reach, span - 14); const n = span / 5; for (let w = 0; w < 4; w++) for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, sg = (t) => -(0.35 + w * 0.12) * min(span / 20, 2) * 4 * t * (1 - t), hh = 5.5 + w * 0.17, off = (w - 1.5) * 0.06;
          far.push(wx(t0) + off, mix(y, y1, t0) + hh + sg(t0), z + span * t0, 0.022, wx(t1) + off, mix(y, y1, t1) + hh + sg(t1), z + span * t1, 0.022, -1, 1); } }
      }
    }
    // Behind the rows: lanes (ซอย) leave the street every 36 m, square to it, and the houses stand along both sides of each lane in lots
    // 17 m wide, facing it. What a lot holds is drawn by lot: a two-storey house, a one-storey house behind its wall and sliding gate,
    // an old timber house under its trees, a block of flats, or nothing yet but banana and weeds. Further from the street more lots are empty.
    for (let b = Math.floor((oz - 200) / 36); b * 36 + 34 < oz + CH + 200; b++) {
      const zl = b * 36 + 34; if (townW(zl) < 0.5 || nearRiv(zl, 6)) continue;
      const seg = twS, sl = (roadX(zl + 1) - roadX(zl - 1)) / 2, ca = 1 / sqrt(1 + sl * sl), sa = sl * ca, ox0 = roadX(zl);
      for (const side of [1, -1]) for (let i = 0; i < 8; i++) for (const ls of [1, -1]) {
        const t = side * (32.5 + i * 17), x = ox0 + t * ca + ls * 11 * sa, z = zl - t * sa + ls * 11 * ca; const own = inside(x, z); if ((!own && !(x >= ox - 12 && x < ox + CH + 12 && z >= oz - 12 && z < oz + CH + 12)) || townW(z) < 0.45 || nearRiv(z, 16) || abs(rdist(x, z)) < 29) continue;      // own: the house is this chunk's; a neighbour's lot is gone through too, for the trees of it that stand on this side
        let ok = true; for (const b2 of [b - 1, b + 1]) { const z2 = b2 * 36 + 34, s2 = (roadX(z2 + 1) - roadX(z2 - 1)) / 2; if (abs(((x - roadX(z2)) * s2 + z - z2) / sqrt(1 + s2 * s2)) < 20) ok = false; }
        if (!ok) continue;                                     // where the road bends the lanes close up: no room for a house
        const hq = b * 64 + i * 4 + (side > 0 ? 2 : 0) + (ls > 0 ? 1 : 0), u = ph(hq, 500 + seg), h = (j) => ph(hq, 510 + j + seg), yaw = atan2(-ls * sa, -ls * ca), c = cos(yaw), sn = sin(yaw), y = ground(x, z) - 0.05;
        const W2 = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c], tree = (T, lx, lz, sc, thin = 1) => { const q = W2(lx, lz); if (inside(q[0], q[1])) plant(T, q[0], q[1], h(lx + 20) * 6, sc, thin); };
        const put = (lx, ly, lz, sx, sy, sz, mat, seed = 0) => { if (own) boxes.push(x + lx * c + lz * sn, y + ly, z - lx * sn + lz * c, yaw, sx, sy, sz, 0, mat, seed, sy, 0); else if (sy > 1.8 && max(sx, sz) > 1.5) nbFoot.push(x + lx * c + lz * sn, z - lx * sn + lz * c, yaw, sx, sz, y + ly - sy / 2, y + ly + sy / 2); };      // (a neighbour's house: only where it stands, for our trees)
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
          if (h(15) < 0.6) tree(TREES[BL[floor(h(16) * 8)]], h(17) < 0.5 ? -6.6 : 6.6, -1 + h(18) * 5, 0.5 + h(19) * 0.3, 2); if (h(20) < 0.5) tree(TREES[8 + (h(21) < 0.5 ? 1 : 0)], h(17) < 0.5 ? 6.3 : -6.3, 6.5, 0.8);
          if (h(22) < 0.35) tree(TREES[9], h(17) < 0.5 ? 6.5 : -6.5, -3, 0.75);
          clear(W2(0, 6.5), yaw, 2.4, 9);          // the path from the door out through the gate to the lane
        } else {                                                // the one-storey house, or the old timber one, in a walled yard with a sliding gate across the drive
          const old = u > 0.88; if (own) stamp(old ? HOUSE : HOUSE3, x, y, z, yaw, h(13), h(14));
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
    for (let k = Math.ceil((oz - 16) / 32); k * 32 + 16 < oz + CH; k++) {
      const z0 = k * 32 + 16, cst = seaW(z0) > 0.4, dpl = udip(z0), sv = svW(z0), [x, z] = svSide(z0, -1, cst ? 6.3 : 4.6 + sv); if (!inside(x, z) || (townW(z0) < 0.4 && !cst) || nearRiv(z0, 7)) continue;
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
      boxes.push(mx, my - 0.47, mz, yw, 10.7, 1.0, len, tl, 30, 0, 1.0, 0);
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
  if ((udOf(oz + CH / 2) || udOf(oz - 40) || udOf(oz + CH + 40)) && abs(oz + CH / 2 - UD.zc) < 100 + CH) {
    const zc = UD.zc;
    for (let j = -20; j < 20; j++) {
      const z0 = zc + j * 5, z1 = z0 + 5, zm = z0 + 2.5, dp = udip(zm); if (dp < 0.003) continue;
      const x0 = roadX(z0), x1 = roadX(z1), mx = (x0 + x1) / 2, my = (roadY(z0) + roadY(z1)) / 2; if (!inside(mx, zm)) continue;
      const len = hypot(x1 - x0, 5) + 0.08, yw = atan2(x1 - x0, 5), c = cos(yw), sn = sin(yw), H = dp + 1.5;
      const tl = -atan2((roadY(z1) - roadY(z0)) * 0.5 + (roadY(z1) + udip(z1) - roadY(z0) - udip(z0)) * 0.5, len);
      const tr = -atan2(roadY(z1) - roadY(z0), len);
      // (The frontage road's surface starts where the road first begins to sink, not where the walls do, and its outermost length dips 10 cm into
      // the ground at its far end: begun level, with the walls, its square end stood a hand high across the lane - a step in the road.)
      const ya = roadYs(z0) - (udip(z0) < 0.02 ? 0.1 : 0), yb = roadYs(z1) - (udip(z1) < 0.02 ? 0.1 : 0), ys = (ya + yb) / 2, ts = -atan2(yb - ya, len);
      for (const sd of [-1, 1]) boxes.push(mx + sd * 7.9 * c, ys - 0.16, zm - sd * 7.9 * sn, yw, 5.4, 0.36, len + 0.1 + 11 * abs(Math.atan(roadSl(z1)) - Math.atan(roadSl(z0))), ts, 49, sd, 0.36, 0);      // (longer where the road bends: on the outside of the bend the lengths would otherwise gape apart in wedges)      // (5.2 to 10.6 m out: the lane, its kerb line and the near strip of the footpath - the seed says which side it is on)          // the frontage road beyond the parapet, level with the street (the ground under it is still on its way up)
      if (dp < 0.2) continue;                                        // (no walls yet where the road is not yet a hand deep)
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
    for (let i = 0; i < 4; i++) { const x = xP + (i % 2 ? 3.3 : -3.3), z = zs + 9 + i * 8.5; if (inside(x, z)) stamp(LONGTAIL, x, SEA - 0.14, z, (hv(i, 1) - 0.5) * 0.3 + (i % 2 ? 0 : PI), hv(i, 2), hv(i, 3), 1); }
    { const x = xP + 19, z = zs + 66; if (inside(x, z)) stamp(FISHER, x, SEA - 0.5, z, 0.5 + hv(5, 1), hv(5, 2), hv(5, 3), 1); }
    for (let i = 0; i < 5; i++) {          // boats on the shore, palms on the bank
      const x = xP + (i < 2 ? 10 + i * 7 : -(9 + (i - 2) * 6.5)); let z = zc + 110; while (z < zc + 230 && ism(x, z) < -1.2) z += 0.5;
      if (i < 3 && inside(x, z)) stamp(LONGTAIL, x, ground(x, z) - 0.1, z, (hv(i, 6) - 0.5) * 0.5, hv(i, 7), hv(i, 8));
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
        boxes.push(mx, my - 0.67, mz, yw, 10.4, 1.4, len, tl, 30, 0, 1.4, 0);
        for (const sd of [-1, 1]) {
          const px = mx + sd * 4.9 * c, pz = mz - sd * 4.9 * sn;
          boxes.push(px, my + 0.2, pz, yw, 0.3, 0.34, len, tl, 2, 0, 0.34, 0, px, my + 1.05, pz, yw, 0.1, 0.1, len, tl, 34, 0, 0.1, 0, px, my + 0.66, pz, yw, 0.06, 0.06, len, tl, 34, 0, 0.06, 0);
          boxes.push(mx + sd * 4.9 * c - (z1 - z0) / 2 * 0, my + 0.6, pz, yw, 0.09, 0.9, 0.09, 0, 34, 0, 0.9, 0);
          if (ap) continue;
          const cx0 = x0 + sd * 5.6 * c, cz0 = z0 - sd * 5.6 * sn, cx1 = x1 + sd * 5.6 * c, cz1 = z1 - sd * 5.6 * sn, h0 = cab(t0), h1 = cab(t1);
          far.push(cx0, y0 + h0, cz0, 0.2, cx1, y1 + h1, cz1, 0.2, -1, 4);                                                    // the main cable
          if (h0 > 2.6 && j % 1 === 0) far.push(cx0, y0 + 0.2, cz0, 0.045, cx0, y0 + h0, cz0, 0.045, -1, 4);                    // a hanger
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
        for (const sd of [-1, 1]) { const x = roadX(zt) + sd * 5.85 * c, z = zt - sd * 5.85 * sn; if (inside(x, z)) boxes.push(x, yD(zt) + 0.1, z, a, 1.3, 3.6, 3.4, 0, 2, 0, 3.6, 0); }
      }
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
      boxes.push(mx, my - 0.47, mz, yw, 9.4, 1.0, len + 0.06, tl, 30, 0, 1.0, 0);
      for (const sd of [-1, 1]) {
        const px = mx + sd * 4.5 * c, pz = mz - sd * 4.5 * sn;
        boxes.push(px, my + 0.16, pz, yw, 0.36, 0.26, len + 0.06, tl, 19, 0, 0.26, 0, px, my + 0.62, pz, yw, 0.14, 0.12, len + 0.06, tl, 19, 0, 0.12, 0, px, my + 1.0, pz, yw, 0.22, 0.16, len + 0.06, tl, 19, 0, 0.16, 0);
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
    for (let t = 0; t < 2; t++) { const x = ox + R() * CH, z = RV.zr + rivM(x) + (R() - 0.5) * W * 0.45, yw = PI / 2 + (R() - 0.5) * 0.5 + (R() < 0.5 ? PI : 0), s1 = R(), s2 = R(), pk = R(); if (river && pk < 0.3 && inside(x, z) && abs(x - roadX(z)) > 14) stamp(LONGTAIL, x, wl - 0.14, z, yw, s1, s2, 1); }
  }
  // a house now and then, set back from the road and facing it, with coconut palms and bananas in the yard
  const hwc = hillW(oz + CH / 2), snc = snowW(oz + CH / 2);
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
      let x = rx + sx - 13 - R() * 9; if (inside(x, z) && t < 2) for (let j = 0; j < 3; j++) { const zz = z + j * 3.6; stamp(UMBRELLA, x, ground(x, zz) - 0.03, zz, a + PI / 2, ph(floor(z), j), 0); }
      x = rx + sx - 2.5 - R() * 4; const z2 = z + 14; if (inside(x, z2) && R() < 0.7) stamp(LONGTAIL, x, ground(x, z2) - 0.1, z2, a + PI / 2 + (R() - 0.5) * 0.5, R(), R());
    }
    for (let t = 0; t < 2; t++) { const x = ox + R() * CH, z = oz + R() * CH, u = x - roadX(z) - shoreX(z), yw = R() * TAU, s1 = R(), s2 = R(); if (seaW(z) > 0.7 && u > 5 && u < 26 && beachW(z) > 0.5) stamp(LONGTAIL, x, SEA - 0.14, z, yw, s1, s2, 1); }
    { const x = ox + R() * CH, z = oz + R() * CH, u = x - roadX(z) - shoreX(z), yw = R() * TAU, s1 = R(), s2 = R(); if (R() < 0.45 && seaW(z) > 0.75 && u > 35 && u < 200) stamp(FISHER, x, SEA - 0.5, z, yw, s1, s2, 1); }
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
    if (side > 0) { const p = Math.round(z / 40) * 40; if (abs(z - p) < 4) z = p + (z >= p ? 4 : -4); const s = Math.round((z - 3) / 1000) * 1000 + 3; if (abs(z - s) < 4) z = s + 5; }
    const x = roadX(z) + side * (17 + H() * 13);
    return ok && plainRow && x > qx * CH + 11 && x < qx * CH + CH - 11 && !(rivOf(z) && abs(z - RV.zr) < RV.W / 2 + 48) && ism(x, z) < -50 ? [x, z, side] : null; };      // (and not in the sea, nor on the shore of the island crossing)
  // (a path is a straight run from a to b; what is marked is the distance to it, the least where several meet)
  const pathSeg = (ax, az, bx, bz) => { const ux = bx - ax, uz = bz - az, L2 = ux * ux + uz * uz || 1;
    for (let j = 0; j < M; j++) { const pz = oz + (j - 1) * GS; if (pz < min(az, bz) - 4 || pz > max(az, bz) + 4) continue;
      for (let i = 0; i < M; i++) { const px = ox + (i - 1) * GS, t = clamp(((px - ax) * ux + (pz - az) * uz) / L2, 0, 1), dl = hypot(px - ax - ux * t, pz - az - uz * t), k = j * M + i; if (dl >= 4 || hwet[k] > 0) continue;
        hwet[k] = min(hwet[k], -(0.05 + 0.4 * (1 - dl / 4))); if (i > 0 && i <= N && j > 0 && j <= N) v[((j - 1) * N + i - 1) * 7 + 6] = hwet[k]; } } };
  const drive = (h) => pathSeg(roadX(h[1]) + h[2] * 3.9, h[1], h[0] - h[2] * 3, h[1]);
  const myHouse = plainHouse(cx), drives = [];      // drives: [z, side] of every drive that reaches this chunk; onDrive: is this place at the road's edge in the mouth of one (no post stands there)
  const onDrive = (z, sd) => { for (const d of drives) if (d[1] * sd > 0 && abs(z - d[0]) < 2.8) return true; return false; };
  for (const q of [cx - 1, cx + 1]) { const h = plainHouse(q); if (h && !isOf(h[1])) { drive(h); drives.push([h[1], h[2]]); homes.push(h[1], h[2]);      // (and its length is kept clear of trees and of the roadside fence here too)
    const d0 = abs(h[0] - roadX(h[1])), sn = -h[2]; clear([h[0] + (3 + d0 - 4.6) / 2 * sn, h[1]], -h[2] * PI / 2, 4.4, d0 - 7.6); } }      // (on the island crossing a house may yet be left out, below: there only its own chunk paints the drive)
  // The fishing village on the island has its paths too: each house of the row by the road its own, straight out to the road; behind that row a
  // lane the houses of the back row give onto, which comes out to the road before the first house.
  if (vil.length) { const zc = vil.zc, lx = (z) => roadX(z) + 37.5, z0 = zc + 29; let zb = -1e9;
    for (const h of vil) { const z = h[1], front = h[0] - roadX(z) < 36, xa = front ? roadX(z) + 3.9 : lx(z), xb = h[0] - 3; pathSeg(xa, z, xb, z); clear([(xa + xb) / 2, z], -PI / 2, 3.2, xb - xa);
      if (front) drives.push([z, 1]); else zb = max(zb, z); }
    if (zb > z0) { for (let z = z0; z < zb; z += 6) { const z1 = min(z + 6, zb); pathSeg(lx(z), z, lx(z1), z1); clear([lx((z + z1) / 2), (z + z1) / 2], 0, 3.2, z1 - z); }
      pathSeg(roadX(z0) + 3.9, z0, lx(z0), z0); clear([roadX(z0) + 20.7, z0], -PI / 2, 3.2, 33.6); drives.push([z0, 1]); } }
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
        const [gx, gz] = L2W(0.35, 9.14), gy = ground(gx, gz); boxes.push(gx, gy + 0.9, gz, yaw, 3.9, 1.7, 0.05, 0, 27, gs, 1.7, 0);       // the sliding gate, on its track
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
  for (let t = 0; t < 42 * hwc * (1 - twc); t++) {
    const x = ox + R() * CH, z = oz + R() * CH, d = abs(rdist(x, z));
    if ((d < (tunOf(z) && abs(abs(z - TN.zc) - TN.hl) < 24 ? 13 : 8.5) && !(inTun(z) && abs(z - TN.zc) < TN.hl - 24)) || fbm(x * 0.012 + 40, z * 0.012, 2) < 0.4) continue;      // (over a tunnel the wood closes across the line of the road)
    const T = chyAt(z) === 1 && R() < 0.72 ? TREES[14 + (R() < 0.5 ? 1 : 0)] : TREES[BL[floor(R() * 8)]], turn = R() * TAU, sz = R();      // on a cherry hill most of the wood is cherry
    if (d < 22) plant(T, x, z, turn, 0.75 + sz * 0.7, 2); else if (d < 60) plant(T, x, z, turn, 0.75 + sz * 0.7, 3, false, 7); else plant(T, x, z, turn, 0.9 + sz * 0.6, 4, false, 7);
  }
  // the cherry road: a tree every eight or nine metres down both sides. The trunks are clear to four metres and the heads are big enough to
  // meet over the middle of the road, so the two rows make an arch of blossom that the car drives through, with nothing hanging in its way
  for (let k = Math.ceil(oz / 8.5) - 2; k * 8.5 < oz + CH + 17; k++) for (const sd of [-1, 1]) {
    const z0 = k * 8.5 + ph(k, 300 + sd) * 4, c = chyAt(z0); if (!c || townW(z0) > 0.05 || nearRiv(z0, 14) || (tunOf(z0) && abs(z0 - TN.zc) < TN.hl + 6)) continue;      // (none over a tunnel or in its mouth)
    const q = z0 / SEG - floor(z0 / SEG); if (ph(k, 310 + sd) > sm(0, 0.07, q) * sm(1, 0.93, q) * 0.95) continue;      // thinning out toward the ends of the stretch, and a gap here and there
    const offA = 6.3 + ph(k, 320 + sd) * 0.9, [x, z] = rp(z0, sd * offA); if (!inside(x, z) || abs(rdist(x, z)) < 5.6) continue;
    plant(TREES[14 + (ph(k, 330 + sd) < 0.5 ? 1 : 0)], x, z, ph(k, 340 + sd) * TAU, 1.08 + ph(k, 350 + sd) * 0.27, 2);
    // The arch: from each trunk three long boughs climb out over the road, highest above the near lane, and end a little past the middle,
    // where they meet those from the other side. They carry blossom all along. Nothing of them is lower than five metres over the road.
    const gy0 = surf(x, z), E = (h, r) => Math.round(clamp(h, 0, 60) * 32) + min(r, 5) / 32;
    for (let b = 0; b < 3; b++) {
      const hb = (m) => ph(k * 8 + b, 410 + m + sd), dz = (b - 1) * 2.7 + (hb(0) - 0.5) * 1.6, y0 = 4.3 + hb(1) * 1.2, rise = 3.0 + hb(2) * 1.0, past = 0.3 + hb(3) * 1.5;
      const pt = (u) => { const off = offA - (offA + past) * u, q = rp(z0 + dz * u, sd * off); return [q[0], surf(q[0], q[1]) + y0 + rise * sin(u * 2.0), q[1], offA - off]; };
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
  }
  for (let t = 0; t < 10 * hwc * (1 - twc); t++) {
    const x = ox + R() * CH, z = oz + R() * CH, d = abs(rdist(x, z)), u = R(), sz = R(), turn = R() * TAU;
    if (d < 7 || d > 50 || fbm(x * 0.012 + 40, z * 0.012, 2) < 0.4) continue;
    if (u < 0.15 && townW(z) < 0.03) plant(TREES[7], x, z, turn, 1 + sz * 0.4); else plant(TREES[8], x, z, turn, 1.6 + sz, 2);
  }
  // and now and then a warning sign: wild animals cross here
  if (hwc > 0.6 && twc < 0.1) for (let k = Math.ceil(oz / 320) - 1; k * 320 < oz + CH + 320; k++) {
    const [x, z] = rp(k * 320 + 11, -4.9); if (!inside(x, z)) continue;
    const y = ground(x, z);
    far.push(x, y - 0.2, z, 0.035, x, y + 2.1, z, 0.035, -1, 0);
    boxes.push(x, y + 2.25, z, PI / 2, 0.03, 0.72, 0.72, PI / 4, 5, hpW(z) > 0 || hpW(z + 160) > 0 ? 0.5 : 0, 0, 0);     // before the switchbacks: winding road
  }
  for (let t = 0; t < 30 * (1 - hwc) * (1 - twc) * (1 - swc); t++) {
    let x = ox + R() * CH, z = oz + R() * CH; const pick = R(), turn = R() * TAU, sc = 0.8 + R() * 0.5, d = abs(rdist(x, z));
    if (d < 9) continue;
    if (snc > 0.3) { if (pick < 0.5) plant(TREES[pick < 0.4 ? 12 + (R() < 0.5 ? 1 : 0) : BL[floor(R() * 8)]], x, z, turn, sc * (pick < 0.4 ? 0.8 : 1)); }      // snowfield: conifers and the odd bare-looking tree
    else if (d < vergeAt(z) - 2) { if (pick < 0.6) { if (pick < 0.32) { const T = TREES[BL[floor(R() * 8)]]; if (d < 30) plant(T, x, z, turn, sc); else plant(T, x, z, turn, sc, 2, false, 7); } else plant(TREES[pick < 0.47 ? 3 + (R() < 0.5 ? 1 : 0) : 7], x, z, turn, sc); } }      // verge: shade trees, coconuts, bananas
    else if (d > vergeAt(z) + 6 && pick < 0.45) {                                                 // paddies: sugar palms and the odd tree standing on the bunds
      if (R() < 0.5) x = Math.round(x / PLX) * PLX + (R() - 0.5) * 0.5; else z = Math.round(z / PLZ) * PLZ + (R() - 0.5) * 0.5;
      if (inside(x, z)) { if (pick < 0.36) plant(TREES[5 + (R() < 0.5 ? 1 : 0)], x, z, turn, sc); else plant(TREES[BL[floor(R() * 8)]], x, z, turn, sc, 2, false, 7); }
    }
  }
  // here and there a hedge of scrub, banana and young trees has grown up along the back of the verge, where it meets the fields
  for (let t = 0; t < 8 * (1 - hwc) * (1 - twc) * (1 - swc) * (snc > 0.3 ? 0 : 1); t++) {
    const z = oz + R() * CH, side = R() < 0.5 ? -1 : 1, off = R(), u = R(), sz = R(), turn = R() * TAU, d = vergeAt(z) - 3 - 8 * off, x = roadX(z) + side * d;
    if (d < 9.5 || !inside(x, z) || pn(z * 0.01, 3 + side) < 0.45) continue;
    if (u < 0.55) plant(TREES[8 + (sz < 0.25 ? 1 : 0)], x, z, turn, 1.5 + sz * 0.9, 2); else if (u < 0.75 && townW(z) < 0.03) plant(TREES[7], x, z, turn, 0.9 + sz * 0.4); else plant(TREES[BL[floor(sz * 7.99)]], x, z, turn, 0.55 + sz * 0.3, 2, false, 7);
  }
  // roadside shelter with a bench, now and then on the plain
  if (hwc < 0.4 && twc < 0.1 && swc < 0.1) for (let k = Math.ceil(oz / 520); k * 520 < oz + CH; k++) {
    const z = k * 520 + 140, x = roadX(z) - 7.5; if (inside(x, z) && !(rivOf(z) && abs(z - RV.zr) < RV.W / 2 + 30) && !nearRiv(z, 24)) stamp(SALA, x, ground(x, z), z, PI / 2, 0.7, ph(k, 3));
  }
  if (twc < 0.2) {
    // stretches of barbed-wire fence on concrete posts along the field side, shrubs growing through it
    for (let k = Math.ceil(oz / 3); k * 3 < oz + CH; k++) {
      const z = k * 3; if (ph(floor(z / 96), 5) < 0.5 || seaW(z) > 0.15 || hpW(z) > 0 || (isOf(z) && nearRiv(z, 20))) continue;
      let home = false; for (let i = 0; i < homes.length; i += 2) if (homes[i + 1] < 0 && abs(z + 1.5 - homes[i]) < 13) home = true; if (home) continue;      // (not across the front of a house on this side: its own wall or fence is there, and its gate)
      const x = roadX(z) - 9, x1 = roadX(z + 3) - 9; if (!inside(x, z)) continue;
      const y = ground(x, z); if (gw[0] || (rivOf(z) && abs(z - RV.zr) < RV.W / 2 + 22)) continue; const y1 = ground(x1, z + 3);
      far.push(x, y - 0.2, z, 0.05, x, y + 1.3, z, 0.045, -1, 0);
      for (const hh of [0.45, 0.8, 1.15]) far.push(x, y + hh, z, 0.007, x1, y1 + hh, z + 3, 0.007, -1, 1);
      if (R() < 0.08) plant(TREES[8 + (R() < 0.3 ? 1 : 0)], x + 0.4, z + 1, R() * TAU, 0.8 + R() * 0.6);
    }
    // on bends: white marker posts with red reflectors on both edges
    for (let k = Math.ceil(oz / 8) - 1; k * 8 < oz + CH + 8; k++) {
      const z = k * 8 + 5; if ((k % 3 && hpW(z) <= 0) || abs(roadX(z + 6) - 2 * roadX(z) + roadX(z - 6)) < 0.11) continue;        // every 24 m; every 8 m round the switchbacks
      for (const sd of [-4.15, 4.15]) { const [x, zp] = rp(z, sd); if (inside(x, zp) && !brSpan(zp) && !inTun(zp) && !onDrive(zp, sd)) boxes.push(x, ground(x, zp) + 0.4, zp, 0, 0.1, 0.85, 0.1, 0, 13, 0, 0, 0); }
    }
  }
  // steel guard rail on the hill road where it runs along a drop
  if (hwc > 0.6 && twc < 0.1) for (let k = Math.ceil(oz / 4) - 2; k * 4 < oz + CH + 8; k++) {
    const z = k * 4, hp = hpW(z) > 0.05; if ((!hp && ph(floor(z / 120), 9) < 0.5) || inTun(z)) continue;        // all the way round the switchbacks
    const n = hp ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const [x, za] = rp(z + 4 * i / n, -4.3), [x1, zb] = rp(z + 4 * (i + 1) / n, -4.3); if (!inside(x, za)) continue;
      const y = ground(x, za), y1 = ground(x1, zb), len = hypot(x1 - x, zb - za);
      boxes.push(x, y + 0.3, za, 0, 0.1, 0.75, 0.12, 0, 12, 0, 0, 0);
      boxes.push((x + x1) / 2, (y + y1) / 2 + 0.55, (za + zb) / 2, atan2(x1 - x, zb - za), 0.05, 0.3, len + 0.05, -atan2(y1 - y, len), 12, 0, 0, 0);
    }
  }
  // shrubs scattered on the verges
  for (let t = 0; t < 5 * (1 - twc) * (1 - swc); t++) { const x = ox + R() * CH, z = oz + R() * CH, d = abs(rdist(x, z)); if (d > 6.5 && d < min(40, vergeAt(z) - 3)) plant(TREES[8 + (R() < 0.25 ? 1 : 0)], x, z, R() * TAU, 0.7 + R() * 0.8); }
  // here and there a field hut at the edge of the paddies, where it is seen from the road
  if (ph(cx * 7 + 3, cz * 13 + 5) < 0.3) {
    const z = oz + 8 + ph(cx + 900, cz) * (CH - 16), side = ph(cx, cz + 901) < 0.5 ? -1 : 1, x = roadX(z) + side * (vergeAt(z) + 7 + ph(cx, cz + 900) * 16);
    if (inside(x, z) && hillW(z) < 0.02 && townW(z) < 0.05 && seaW(z) < 0.02 && snowW(z) < 0.02 && !nearRiv(z, 40)) { const y = ground(x, z); if (!gw[0]) { stamp(FIELDHUT, x, y - 0.1, z, side > 0 ? PI / 2 : -PI / 2, ph(cx + 1, cz), ph(cx, cz + 1)); if (HUTS.length < 60) HUTS.push([x, z]); } }
  }
  // Kilometre stones (หลักกิโลเมตร), one to the kilometre on the left of the road: a square white pillar with a pointed top. Its face to the
  // road carries a mark, the route number and the kilometre; its two sides, which meet the traffic, a name and the distance to that place.
  for (let k = Math.ceil(oz / 1000) - 1; k * 1000 < oz + CH + 1000; k++) {
    const [x, z] = rp(k * 1000 + 3, 4.5 + svW(k * 1000 + 3));      // (beyond a frontage road, if it falls beside an underpass) if (!inside(x, z) || (rivOf(z) && abs(z - RV.zb) < RV.W / 2 + 12) || isBr(z)) continue;
    const yw = atan2(roadSl(z), 1) - PI / 2, y = ground(x, z);
    boxes.push(x, y + 0.345, z, yw, 0.40, 0.75, 0.26, 0, 11, 2148, ((k + 79) % 1000 + 1000) % 1000, 0, x, y + 0.785, z, yw + PI / 2, 0.26, 0.13, 0.40, 0, 11, 0, -1, 1);
  }
  // Electricity, as the Provincial Electricity Authority strings it: tall square concrete poles every 40 m down one side of the road. At the top a
  // concrete crossarm with three brown insulators for the 22 kV line, and a single earth wire above the pole on a steel spike. Where people live
  // (in towns, and along the stretches with villages) the same poles carry the low-voltage line too - four wires one above the other on a rack -
  // and lower still a fat, sagging bundle of telephone and cable-television lines.
  const lvAt = (z) => townW(z) > 0.3 || (hillW(z) < 0.3 && pn(z / 260, 7) > 0.52);
  // A pole stands every 40 m, except in a river or canal, on the coast road and on the switchbacks. Wires are strung from each pole to the next
  // pole that stands - so the line crosses a river in one long span beside the bridge, and where it ends it ends at a pole, never in mid-air.
  const poleAt = (k) => { const z = k * 40; return seaW(z) <= 0.25 && hpW(z) <= 0 && !(isOf(z) && abs(z - IS.zc) < 545) && !(udOf(z) && abs(z - UD.zc) < 104) && !(rivOf(z) && abs(z - RV.zr - rivM(roadX(z) + 5.6)) < RV.W / 2 + 14); };      // (measured to where the river really runs at the pole)
  for (let k = Math.ceil(oz / 40); k * 40 < oz + CH; k++) {
    const z0 = k * 40, x0 = roadX(z0) + 5.6 + svW(z0); if (!inside(x0, z0) || !poleAt(k)) continue;
    let kn = 0; for (let j = 1; j <= 4 && !kn; j++) if (poleAt(k + j)) kn = j;
    const y0 = ground(x0, z0), z1 = z0 + 40 * kn, x1 = roadX(z1) + 5.6 + svW(z1), y1 = kn ? ground(x1, z1) : y0, yaw = atan2(roadSl(z0), 1), c = cos(yaw), sn = sin(yaw), lv0 = lvAt(z0), lv = kn > 0 && lv0 && lvAt(z1);
    const put = (lx, ly, sx, sy, sz, mat) => boxes.push(x0 + lx * c, y0 + ly, z0 - lx * sn, yaw, sx, sy, sz, 0, mat, 0, 0, 0);
    for (let j = 0; j < 5; j++) put(0, 0.84 + j * 2.08, 0.24 - j * 0.02, 2.08, 0.20 - j * 0.015, 2);                    // the pole, slimmer toward the top
    put(-0.05, 9.4, 2.0, 0.12, 0.12, 2); for (const ix of [-0.85, -0.3, 0.75]) put(ix, 9.59, 0.09, 0.26, 0.09, 4);          // crossarm and insulators
    put(0, 10.6, 0.05, 0.8, 0.05, 34); if (lv0) put(-0.18, 7.3, 0.05, 0.8, 0.08, 34);                                       // the earth wire's spike; the low-voltage rack
    if (lv0 && townW(z0) < 0.4 && (k & 1)) { put(-0.7, 6.2, 1.3, 0.05, 0.05, 34); boxes.push(x0 - 1.25 * c, y0 + 6.14, z0 + 1.25 * sn, yaw, 0.9, 0.07, 0.12, 0, 10, 0, 0, 0); }      // a strip light on a short arm, as villages hang them on the poles
    if (!kn) continue;
    const yaw1 = atan2(roadSl(z1), 1), c1 = cos(yaw1), s1 = sin(yaw1);      // the next pole stands square to the road where it is
    const wire = (off, h, r, sagM, n) => { const sM = min(sagM * kn * kn, h < 6 ? 1.2 : 2.4), nn = n * kn, ax = x0 + off * c, az = z0 - off * sn, bx = x1 + off * c1, bz = z1 - off * s1;
      // a wire under tension hangs in the vertical plane through its two insulators: seen from above it is a straight line from pole to pole,
      // cutting the chord of a bend (it cannot follow the road round - nothing pulls it sideways). Only its height sags.
      for (let i = 0; i < nn; i++) { const a = i / nn, b = (i + 1) / nn, sag = (t) => -sM * 4 * t * (1 - t);
        far.push(mix(ax, bx, a), mix(y0, y1, a) + h + sag(a), mix(az, bz, a), r, mix(ax, bx, b), mix(y0, y1, b) + h + sag(b), mix(az, bz, b), r, -1, 1); } };
    reach = max(reach, 40 * kn - 14);      // (a pole may stand in the chunk's far corner, 45 m from its middle)
    for (const ix of [-0.85, -0.3, 0.75]) wire(ix, 9.74, 0.012, 0.5, 5); wire(0, 10.97, 0.011, 0.4, 4);
    if (lv) { for (let i = 0; i < 4; i++) wire(-0.24, 7.0 + i * 0.2, 0.012, 0.7, 4); wire(-0.2, 5.3, 0.035, 1.0, 6); wire(-0.26, 5.0, 0.015, 1.2, 6); }
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
  const col = [], soft = [];
  { const gAt = (x, z) => hAt(clamp(x, ox - GS + 0.01, ox + CH + GS - 0.01), clamp(z, oz - GS + 0.01, oz + CH + GS - 0.01));
    const add = (x, z, yaw, hx, hz, yb, yt) => { const gy = gAt(x, z); if (yb < gy + 1.3 && yt > gy + 0.4) col.push(x, z, cos(yaw), sin(yaw), hx, hz, yb, yt); };
    for (let i = 0; i < boxes.length; i += 12) { const sy = boxes[i + 5]; if (sy >= 0.5) add(boxes[i], boxes[i + 2], boxes[i + 3], boxes[i + 4] / 2, boxes[i + 6] / 2, boxes[i + 1] - sy / 2, boxes[i + 1] + sy / 2); }
    for (const A of [far, segs]) for (let i = 0; i < A.length; i += 10) { const dx = A[i + 4] - A[i], dz = A[i + 6] - A[i + 2], r = max(A[i + 3], A[i + 7], 0.04), L = hypot(dx, dz);
      add((A[i] + A[i + 4]) / 2, (A[i + 2] + A[i + 6]) / 2, atan2(dx, dz), r, L / 2 + r, min(A[i + 1], A[i + 5]) - r, max(A[i + 1], A[i + 5]) + r); } }
  { const F = [];
    for (let i = 0; i < boxes.length; i += 12) { const sx = boxes[i + 4], sy = boxes[i + 5], sz = boxes[i + 6]; if (max(sx, sz) < 1.5 || (sy < 1.8 && sx * sz < 6)) continue;
      F.push(boxes[i], boxes[i + 2], boxes[i + 3], sx, sz, boxes[i + 1] - sy / 2, boxes[i + 1] + sy / 2); }
    for (const v of nbFoot) F.push(v);
    for (const a of pend) {
      const T = a[0], x = a[1], z = a[2], sc = a[4];
      if (T.crR === undefined) { let r = 0, h = 0; const L = T.leaves; for (let i = 0; i < L.length; i += 12) { r = max(r, hypot(L[i], L[i + 2])); h = max(h, L[i + 1]); } T.crR = r; T.crH = h; }
      const R = T.crR * sc, keep = max(0.8, 0.6 * R), ty = hAt(x, z), top = ty + max(T.crH * sc, 3); let ok = true;
      for (let j = 0; j < F.length && ok; j += 7) {
        const dx = x - F[j], dz = z - F[j + 1], hx = F[j + 3] / 2, hz = F[j + 4] / 2, reach = hx + hz + keep; if (abs(dx) > reach || abs(dz) > reach) continue;
        if (F[j + 6] < ty + 1.8 || F[j + 5] > top) continue;
        const c = cos(F[j + 2]), s = sin(F[j + 2]), ex = max(abs(dx * c - dz * s) - hx, 0), ez = max(abs(dx * s + dz * c) - hz, 0);
        if (ex * ex + ez * ez < keep * keep) ok = false;
      }
      if (ok) { plantNow(...a);
        // a tree taller than a man with a trunk as thick as an arm stops the car, at its trunk; anything less the car pushes down and drives over
        const S = T.segs, tr = (S.length ? max(S[3], S[7]) : 0) * sc;
        if (T.crH * sc > 2.6 && tr > 0.07) col.push(x, z, 1, 0, max(tr, 0.18), max(tr, 0.18), ty - 0.5, ty + T.crH * sc); else soft.push(x, z, max(0.6, T.crR * sc)); }
    } }
  // leaves from different trees are interleaved so that drawing the first third or ninth thins every tree evenly
  const nL = leaves.length / 12, lf = new Float32Array(leaves.length), Rs = rng(cx * 31 + cz * 17 + 5);
  { const order = new Uint32Array(nL); for (let i = 0; i < nL; i++) order[i] = i; for (let i = nL - 1; i > 0; i--) { const j = floor(Rs() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; } for (let i = 0, o = 0; i < nL; i++) { const q = order[i] * 12; for (let k = 0; k < 12; k++) lf[o++] = LBUF[q + k]; } }
  const allSeg = new Float32Array(far.length + segs.length); allSeg.set(far); allSeg.set(segs, far.length); nSegFar = far.length / 10;
  return { cx, cz, x: ox + CH / 2, z: oz + CH / 2, y: hg[(M * M) >> 1], vb: vbuf(v), nSeg: allSeg.length / 10, nSegFar, segB: allSeg.length ? vbuf(allSeg) : null,
    hgc: hg.slice(), hwc: hwet.slice(),          // the chunk's own heights and water marks, kept for growing its grass later without working the ground out again
    col: new Float32Array(col), soft: new Float32Array(soft),          // what stops the car, and what it flattens (see above)
    reach, nLeaf: nL, leafB: nL ? vbuf(lf) : null, nGrass: 0, grassB: null, house: dbgHouse, nBox: boxes.length / 12, boxB: boxes.length ? vbuf(new Float32Array(signW(boxes))) : null };
}
// grass is only grown for the chunks around the camera (and let go again further away): blades on level ground off the road
const NG = 42000, gr = new Float32Array(NG * 12);
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
  const ZT = [], ZS = [], ZN = [], ZH = [], ZV = [], ZP = [], ZB = [];
  for (let j = 0; j < 32; j++) { const zz = oz + j * 2 + 1; ZT[j] = townW(zz); ZS[j] = seaW(zz); ZN[j] = snowW(zz); ZH[j] = hillW(zz); ZV[j] = vergeAt(zz); ZP[j] = pineAt(zz); ZB[j] = beachW(zz); }
  for (let i = c.gI; i < iEnd; i++) {
    if (ng >= NG - 2) break;
    const x = ox + R() * CH, z = oz + R() * CH, d = abs(rdist(x, z)); if (d < 4.2) continue;
    const zj = min(31, floor((z - oz) / 2)), tW = ZT[zj], sW = ZS[zj], nW = ZN[zj], hW = ZH[zj];
    const y = hgAt(x, z), u = R(), town = d < 160 && tW > 0.45; if (gw[0] || (town && (d < 28.5 || u > 0.5 || turfAt(x, z) < 0.55 || soiD(x, z) < 2.6))) continue;      // in town grass grows only in the yards
    { const fx = (x - ox) / GS + 1, fz = (z - oz) / GS + 1, ix = floor(fx), iz = floor(fz), k = iz * M + ix, a = fx - ix, b = fz - iz;      // a house's drive (see buildChunk): none in the wheel tracks, a little between them, thin at the edges
      const pv = -mix(mix(min(HW[k], 0), min(HW[k + 1], 0), a), mix(min(HW[k + M], 0), min(HW[k + M + 1], 0), a), b);
      if (pv > 0.05) { const dl = (1 - (pv - 0.05) / 0.4) * 4; if (dl < 0.4 ? u > 0.3 : dl < 1.5 || (dl < 2.1 && u > 0.45)) continue; } }
    if (sW > 0.3 && x - roadX(z) > 19 && u < ZB[zj] * 1.2) continue;          // no grass on the sand
    if (d < 22 && u > 0.12 && ZP[zj]) continue;
    if (u > 0.12 && nW > 0.3) continue;                                          // only a few dry stalks stand out of the snow                                      // and little under the casuarinas
    if (d > ZV[zj] + 0.5 && hW < 0.02 && nW < 0.02 && tW < 0.3 && sW < 0.02 && plotAt(x, z, po)[1] > 1.9) {        // inside a paddy plot, clear of its bunds: rice according to its stage
      const st = po[0];
      // Rice is not sown broadcast but set out by hand in hills, a hand's span apart in rows: so each plant is moved to the nearest place of a
      // lattice 25 cm each way (hx, hz), which is how rice is transplanted in Thailand, and there several blades fan out from one foot. (Plants that fall on the same place make a fuller hill.)
      const hx = (floor(x / 0.25) + 0.5) * 0.25 + (R() - 0.5) * 0.05, hz = (floor(z / 0.25) + 0.5) * 0.25 + (R() - 0.5) * 0.05, hy = st < 4 ? hgAt(hx, hz) : y;
      if (st >= 4) {         // a flower: a green stalk and its head
        if (ng >= NG - 2) break; if (u > 0.6) continue;
        const Ls = 0.5 + 0.3 * R(), yw = R() * TAU;
        gr.set([x, y - 0.02, z, Ls, yw, 1.35, 0.012, 0.15, 3, R(), 1, 0.4], ng * 12); ng++;
        gr.set([x + cos(yw) * 0.2 * Ls, y + Ls * 0.95, z + sin(yw) * 0.2 * Ls, 0.28 + 0.08 * R(), R() * TAU, 0.95 + R() * 0.4, 0.15, 0, 9, R(), st === 4 ? 1 : 0.6, Ls], ng * 12);
      } else
      if (st === 0) { if (u > 0.3) continue;          // under water: in half of such plots nothing yet, in the rest young seedlings standing out of it in their rows
        if (ph(floor(x / PLX) + 7, floor(z / PLZ) + 3) < 0.5) continue;
        gr.set([hx, hy, hz, 0.18 + 0.12 * R(), R() * TAU, 1.3 + R() * 0.25, 0.009, 0.3, 3, R(), 1, 0.2], ng * 12); }
      else if (st === 1 || st === 2) { if (ng >= NG - 3) break; const yw = R() * TAU, rp = st === 2, Lh = rp ? 1.0 + 0.2 * R() : 0.62 + 0.2 * R();
        // a hill of rice: two upright cards crossed, each cut into a sheaf of leaves (and, ripe, the hanging ears) by the shader - kinds 12 and 13
        for (let q = 0; q < 2; q++) { gr.set([hx, hy - 0.03, hz, Lh, yw + q * 1.57 + R() * 0.3, 1.42 + R() * 0.12, 0.3 + 0.08 * R(), 0, rp ? 13 : 12, R(), 1, 0.5], ng * 12); if (q < 1) ng++; } }
      else { if (u > 0.3) continue; gr.set([hx, hy, hz, 0.07 + 0.06 * R(), R() * TAU, 1.3 + R() * 0.25, 0.009, 0.2, 4, R(), 1, 0.05], ng * 12); }
    } else if (hW > 0.5 && d < 60 && vnoise(x * 0.06 + 9, z * 0.06) > 0.47 && fbm(x * 0.012 + 40, z * 0.012, 2) < 0.4) {   // tall golden grass along the hill road
      gr.set([x, y - 0.02, z, 0.8 + 0.9 * R(), R() * TAU, 1.15 + R() * 0.35, 0.012 + R() * 0.008, 0.5 + R() * 0.9, 4, R(), 1, 0.7], ng * 12);
    } else {
      const tall = vnoise(x * 0.11, z * 0.11), L = (0.12 + 0.3 * R()) * (0.55 + 1.5 * tall * tall) * (town ? 0.6 : 1), tf = turfAt(x, z);
      if (tf < 0.43 ? u > 0.03 : u > 0.72) continue;                                    // thick on the turf; on bare earth only the odd weed
      gr.set([x, y - 0.02, z, L, R() * TAU, 1.0 + R() * 0.5, 0.011 + R() * 0.012, 0.4 + R() * 1.3, 2, R(), 1, 0.25], ng * 12);
    }
    ng++;
  }
  c.gI = iEnd; c.gN = ng; if (iEnd < NG && ng < NG - 2) return;          // more to do next frame
  c.nGrass = ng; c.grassB = ng ? vbuf(gr.subarray(0, ng * 12)) : null; c.grassTried = true; grassJob = null;
}
function dropChunk(c) { c.dead = true; c.boxB && c.boxB.destroy(); c.vb.destroy(); c.segB && c.segB.destroy(); c.leafB && c.leafB.destroy(); c.grassB && c.grassB.destroy(); }
const want = [];
let cxS = 1e9, czS = 1e9;      // the chunk the eye counts as being in: it changes only when the eye is 8 m into the next one
function updateChunks(px, pz, budget) {
  if (abs(px - (cxS + 0.5) * CH) > CH / 2 + 8) cxS = floor(px / CH); if (abs(pz - (czS + 0.5) * CH) > CH / 2 + 8) czS = floor(pz / CH);
  const cz0 = czS; want.length = 0;
  const keep = new Set();
  const rz = min(5, Math.ceil(380 * viewK / CH)), rx = min(4, rz);      // (a shorter view - viewK, the settings panel - keeps fewer chunks)
  for (let dz = -rz; dz <= rz; dz++) {
    const cz = cz0 + dz, cxr = floor(roadX((cz + 0.5) * CH) / CH), cxp = cxS;
    for (let cx = min(cxr, cxp) - rx; cx <= max(cxr, cxp) + rx; cx++) { const k = cx + ',' + cz; keep.add(k); if (!chunks.has(k)) want.push([hypot((cx + 0.5) * CH - px, (cz + 0.5) * CH - pz), cx, cz, k]); }
  }
  for (const [k, c] of chunks) if (!keep.has(k)) { dropChunk(c); chunks.delete(k); }
  want.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < want.length && i < budget; i++) chunks.set(want[i][3], buildChunk(want[i][1], want[i][2]));
  return want.length;
}

