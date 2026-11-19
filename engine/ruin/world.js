// --------------------------------------------------------------------------------------------------------- the world of Ruin, chunk by chunk
// The land is built in pieces 64 m square as the eye comes near, exactly as in Endless (the same names: CH, chunks, buildChunk, growGrass,
// updateChunks - main.js draws whatever these make). A block of the city is two chunks by two with streets all round it, so every chunk is one
// corner of a block: a street along one of its sides in x, another along one in z (if those streets exist), and the inside of the block behind.
// (u, v) are a chunk's own measures: metres in from its north-south street line, metres in from its east-west one.
const CH = 64, GN = 32, GS = CH / GN;
const gridI = new Uint16Array(GN * GN * 6);
for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { const a = j * (GN + 1) + i, b = a + 1, c = a + GN + 1, d = c + 1; gridI.set([a, c, b, b, c, d], (j * GN + i) * 6); }
const ibGrid = vbuf(gridI, GPUBufferUsage.INDEX);
const chunks = new Map();
const hg = new Float32Array((GN + 3) * (GN + 3)), hwet = new Float32Array((GN + 3) * (GN + 3)), LBUF = new Float32Array(12 * 220000);
// a colour for material 50 (the shader squares what it is given, so the root goes in): five bits each of red, green, blue in one number
const col50 = (r, g, b) => (Math.round(Math.sqrt(r) * 31) + 32 * Math.round(Math.sqrt(g) * 31) + 1024 * Math.round(Math.sqrt(b) * 31)) / 32768;
const CARCOL = [[0.55, 0.55, 0.55], [0.72, 0.72, 0.70], [0.03, 0.03, 0.035], [0.35, 0.03, 0.03], [0.04, 0.10, 0.30], [0.50, 0.42, 0.25], [0.10, 0.22, 0.14], [0.60, 0.33, 0.05], [0.25, 0.26, 0.28]].map((c) => col50(...c));
const OLIVE = col50(0.13, 0.15, 0.07), OLIVE2 = col50(0.20, 0.21, 0.11), TAN = col50(0.36, 0.30, 0.19), SOOT = col50(0.012, 0.011, 0.010);
const BOXCOL = [[0.45, 0.08, 0.05], [0.06, 0.16, 0.36], [0.10, 0.28, 0.14], [0.55, 0.36, 0.06], [0.42, 0.42, 0.40]].map((c) => col50(...c));
const par = (n) => ((n % 2) + 2) % 2;
function buildChunk(cx, cz) {
  const ox = cx * CH, oz = cz * CH, N = GN + 1, M = GN + 3;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) { hg[j * M + i] = ground(ox + (i - 1) * GS, oz + (j - 1) * GS); hwet[j * M + i] = gw[0]; }
  const v = new Float32Array(N * N * 7);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = (j + 1) * M + i + 1, nx = hg[k - 1] - hg[k + 1], nz = hg[k - M] - hg[k + M], l = hypot(nx, 2 * GS, nz);
    v.set([ox + i * GS, hg[k], oz + j * GS, nx / l, 2 * GS / l, nz / l, hwet[k]], (j * N + i) * 7);
  }
  const inside = (x, z) => x >= ox && x < ox + CH && z >= oz && z < oz + CH;
  const wetAt = (x, z) => hwet[(floor((z - oz) / GS + 1.5)) * M + floor((x - ox) / GS + 1.5)] > 0.5;
  const hAt = (x, z) => { const fx = clamp((x - ox) / GS + 1, 0, M - 1.001), fz = clamp((z - oz) / GS + 1, 0, M - 1.001), ix = floor(fx), iz = floor(fz), u = fx - ix, w = fz - iz, k = iz * M + ix; return mix(mix(hg[k], hg[k + 1], u), mix(hg[k + M], hg[k + M + 1], u), w); };
  const R = rng((cx * 73856093) ^ (cz * 19349663) ^ 0x2f6b1e35);
  const segs = [], far = [], boxes = [], col = [], soft = [], foot = [], pend = []; let reach = 0;
  const leaves = { n: 0 };
  const xc = ox + CH / 2, zc = oz + CH / 2, U = urb(xc, zc), kind = lotKind(floor(cx / 2), floor(cz / 2)), edge = max(abs(xc), abs(zc));
  // ---- the pieces things are made of
  const box = (x, y, z, yaw, sx, sy, sz, mat, seed = 0, tilt = 0, shape = 0) => { boxes.push(x, y, z, yaw, sx, sy, sz, tilt, mat, seed, sy, shape); };
  const solid = (x, z, yaw, hx, hz, yb, yt) => { col.push(x, z, cos(yaw), sin(yaw), hx, hz, yb, yt); };
  const stamp = (B, x, y, z, yaw, s1, s2) => { const c = cos(yaw), sn = sin(yaw); for (const b of B) boxes.push(x + b[0] * c + b[2] * sn, y + b[1], z - b[0] * sn + b[2] * c, yaw, b[3], b[4], b[5], b[6], b[7], b[7] === 1 || b[7] === 9 ? s2 : b[7] === 17 ? ph(floor(x * 7 + b[0] * 13), floor(z * 5 + b[1] * 11)) : s1, b[4], b[8] || 0); };
  const plant = (T, x, z, turn, sc, thin = 1, twigs = true, any = false) => { pend.push([T, x, z, turn, sc, thin, twigs, any]); };
  const plantNow = (T, x, z, turn, sc, thin, twigs) => {
    const y = hAt(x, z), c = cos(turn), sn = sin(turn), S = T.segs, Lf = T.leaves, farN = T.nSegFar;
    const tr = (px, py, pz, o) => { o.push(x + (px * c - pz * sn) * sc, y + py * sc, z + (px * sn + pz * c) * sc); };
    const enc = (h, r) => Math.round(min(max(h, 0), 60) * 32) + min(r, 31.9) / 32;
    const nS = twigs ? T.nSeg : (T.nSegMid || T.nSeg), lw = [1, 1, 1.5, 1.8, 2.1][thin];
    for (let i = 0; i < nS; i++) {
      const o = i < farN ? far : segs, k = i * 10, made = S[k + 8] < -0.5;
      tr(S[k], S[k + 1], S[k + 2], o); o.push(S[k + 3] * sc); tr(S[k + 4], S[k + 5], S[k + 6], o); o.push(S[k + 7] * sc, made ? -1 : enc(S[k + 8] * sc, hypot(S[k], S[k + 2]) * sc), made ? S[k + 9] : enc(S[k + 9] * sc, hypot(S[k + 4], S[k + 6]) * sc));
    }
    let o = leaves.n; const wk = sc * lw, nl = T.nLeaf; if (o + Math.ceil(nl / thin) * 12 > LBUF.length) return;
    for (let i = 0; i < nl; i += thin) { const k = i * 12, px = Lf[k], py = Lf[k + 1], pz = Lf[k + 2], hh = min(max(Lf[k + 11] * sc, 0), 60), rr = min(Math.sqrt(px * px + pz * pz) * sc, 31.9);
      LBUF[o] = x + (px * c - pz * sn) * sc; LBUF[o + 1] = y + py * sc; LBUF[o + 2] = z + (px * sn + pz * c) * sc; LBUF[o + 3] = Lf[k + 3] * sc; LBUF[o + 4] = Lf[k + 4] + turn; LBUF[o + 5] = Lf[k + 5];
      LBUF[o + 6] = Lf[k + 6] * wk; LBUF[o + 7] = Lf[k + 7]; LBUF[o + 8] = Lf[k + 8]; LBUF[o + 9] = Lf[k + 9]; LBUF[o + 10] = Lf[k + 10]; LBUF[o + 11] = Math.round(hh * 32) + rr / 32; o += 12; }
    leaves.n = o;
  };
  // a block of a building standing on the ground: its windows are the material's own (7: a tall block, 8: a concrete house or flats)
  const block = (x, z, w, d, H, mat, seed, tilt = 0) => { const yb = min(hAt(x - w / 2, z - d / 2), hAt(x + w / 2, z - d / 2), hAt(x - w / 2, z + d / 2), hAt(x + w / 2, z + d / 2)) - 0.5 - abs(sin(tilt)) * d / 2;
    box(x, yb + H / 2, z, 0, w, H, d, mat, seed, tilt); solid(x, z, 0, w / 2, d / 2, yb, yb + H); foot.push(x, z, w / 2 + 0.6, d / 2 + 0.6); return yb + H; };
  // rubble: broken concrete lying in a heap round (x, z), out to r metres
  const rubble = (x, z, r, n) => { for (let i = 0; i < n; i++) { const a = R() * TAU, q = Math.sqrt(R()) * r, px = x + cos(a) * q, pz = z + sin(a) * q, s = 0.5 + R() * R() * 2.6 * (1 - q / r * 0.6); if (!inside(px, pz)) continue;
    box(px, hAt(px, pz) + s * 0.22, pz, R() * TAU, s * (0.8 + R()), s * 0.55, s * (0.6 + R() * 0.6), R() < 0.8 ? 2 : 19, R(), (R() - 0.5) * 0.9); if (s > 1.3) solid(px, pz, 0, s * 0.5, s * 0.5, -1e9, 1e9); } };
  // An abandoned car: where it was left, where it crashed, where it burned. Its length lies along its own x; y: what it stands on.
  const wreck = (x, z, yaw, y = hAt(x, z)) => {
    const burnt = R() < 0.18, c = burnt ? SOOT : CARCOL[floor(R() * CARCOL.length)], van = R() < 0.14, c_ = cos(yaw), s_ = sin(yaw), sag = R() < 0.6 ? 0.07 : 0;
    const put = (lx, ly, lz, sx, sy, sz, mat, seed) => box(x + lx * c_ + lz * s_, y + ly - sag, z - lx * s_ + lz * c_, yaw, sx, sy, sz, mat, seed);
    if (van) { put(0, 1.05, 0, 4.7, 1.45, 1.85, 50, c); put(1.45, 1.42, 0, 1.5, 0.55, 1.9, burnt ? 3 : 17, 0.2); put(-0.6, 1.45, 0, 2.2, 0.45, 1.88, burnt ? 3 : 17, 0.2); }
    else { put(0, 0.66, 0, 4.4, 0.56, 1.76, 50, c); put(-0.25, 1.18, 0, 2.3, 0.5, 1.6, 50, c); put(-0.25, 1.2, 0, 2.36, 0.34, 1.66, burnt ? 3 : 17, 0.2); }
    for (const wx of [-1.45, 1.45]) for (const wz of [-0.8, 0.8]) put(wx, 0.33, wz, 0.64, 0.64, 0.22, 39, 1);
    solid(x, z, yaw, 2.25, 0.9, y - 1, y + 1.6); foot.push(x, z, 2.3, 2.3);
  };
  // a street lamp that will never light again; one in eight lies where it fell
  const lamp = (x, z, yaw) => { const y = hAt(x, z);
    if (R() < 0.13) { const a = R() * TAU; box(x + cos(a) * 4, y + 0.12, z - sin(a) * 4, a, 8.4, 0.16, 0.16, 34, R()); return; }
    box(x, y + 4.2, z, yaw, 0.16, 8.4, 0.16, 34, R()); box(x - sin(yaw) * -1.0, y + 8.3, z - cos(yaw) * -1.0, yaw, 0.1, 0.1, 2.1, 34, R()); box(x + sin(yaw) * 1.9, y + 8.25, z + cos(yaw) * 1.9, yaw, 0.34, 0.14, 0.75, 2, 0.3);
    solid(x, z, 0, 0.12, 0.12, y, y + 8); };
  // ---- the streets this chunk lies on. Local measures (u, v) to the world and back.
  const sx = par(cx) === 0 ? 1 : -1, sz = par(cz) === 0 ? 1 : -1, kx = sx > 0 ? cx / 2 : (cx + 1) / 2, iz = sz > 0 ? cz / 2 : (cz + 1) / 2;
  const X = (u) => (sx > 0 ? ox + u : ox + CH - u), Z = (w) => (sz > 0 ? oz + w : oz + CH - w);
  const town = U >= 0.2;
  const stN = town && segOn(1, kx, floor(cz / 2)), stE = town && segOn(0, iz, floor(cx / 2)), hwN = stN ? (isArt(kx) ? HWA : HWM) : 0, hwE = stE ? (isArt(iz) ? HWA : HWM) : 0;
  const nearRiver = abs(zc - rivZ(xc)) < rivHW(xc) + 110;
  const dry = (x, z, m) => rivD(x, z) > m;
  if (town) {
    const fu = stN ? hwN + 3.6 : 2, fv = stE ? hwE + 3.6 : 2, city = U > 0.3;
    // -- along the streets: dead lamps, cars left where they stopped, trees that have had the footpath to themselves for years
    const along = (ns) => { const hw = ns ? hwN : hwE, lim = ns ? fv : fu; if (!hw) return;
      const P = (a, d) => (ns ? [X(d), Z(a)] : [X(a), Z(d)]), yawA = ns ? PI / 2 : 0;      // a: metres along the street from the corner, d: metres out from its middle
      if (city) for (const a of [16, 48]) { const q = P(a, hw + 0.75); if (dry(q[0], q[1], 16)) lamp(q[0], q[1], ns ? (sx > 0 ? -PI / 2 : PI / 2) : (sz > 0 ? PI : 0)); }
      const n = R() < 0.42 ? 0 : 1 + floor(R() * (hw > 5 ? 3 : 1.6));
      for (let i = 0; i < n; i++) { const kerb = R() < 0.62, a = lim + 3 + R() * (CH - lim - 6), d = kerb ? hw - 1.25 : 1.1 + R() * (hw - 2.4), q = P(a, d);
        if (dry(q[0], q[1], 17)) wreck(q[0], q[1], yawA + (kerb ? (R() - 0.5) * 0.12 : (R() - 0.5) * 1.6) + (R() < 0.5 ? PI : 0)); }
      for (let a = 10; a < CH; a += 13 + R() * 6) { if (R() > 0.4) continue; const q = P(a + R() * 3, hw + 1.9); plant(TREES[BL[floor(R() * BL.length)]], q[0], q[1], R() * TAU, 0.8 + R() * 0.7); }
      for (let i = 0; i < 7; i++) { const q = P(R() * CH, R() * hw); if (weedAt(q[0], q[1]) > 0.69) plant(TREES[8 + (R() < 0.2 ? 1 : 0)], q[0], q[1], R() * TAU, 0.45 + R() * 0.6, 1, true, true); }      // scrub through the broken asphalt
    };
    along(true); along(false);
    // -- inside the block, by what the block is
    const seedB = ph(cx * 7 + 3, cz * 11 + 5);
    if (kind === 2 && !nearRiver) {         // towers: one to a corner, some with a low wing behind; a few broken off short, a few leaning
      const w = 15 + 6 * floor(R() * 3.99), d = 15 + 6 * floor(R() * 3.99), nf = 6 + floor(R() * R() * 26 * sm(0.5, 1, core(xc, zc)) + R() * 5), u0 = fu + 1 + R() * 2 + w / 2, v0 = fv + 1 + R() * 2 + d / 2, x = X(u0), z = Z(v0);
      const fell = R() < 0.16, lean = !fell && R() < 0.08 ? (R() < 0.5 ? -1 : 1) * (0.035 + R() * 0.04) : 0, H = (fell ? floor(nf * (0.3 + R() * 0.4)) + 1 : nf) * 3.2;
      const top = block(x, z, w, d, H, 7, seedB, lean);
      if (fell) { for (let i = 0; i < 4; i++) box(x + (R() - 0.5) * w * 0.5, top + 0.4 + i * 0.5, z + (R() - 0.5) * d * 0.4, R() * TAU, w * (0.5 + R() * 0.4), 0.45, d * (0.5 + R() * 0.4), 2, R(), (R() - 0.5) * 0.9);
        const a = R() * TAU; rubble(x + cos(a) * (w / 2 + 5), z + sin(a) * (d / 2 + 5), 11, 26); }
      else if (!lean) { box(x + (R() - 0.5) * w * 0.4, top + 1.3, z + (R() - 0.5) * d * 0.4, 0, 5 + R() * 3, 2.6, 4 + R() * 2, 2, R()); if (R() < 0.5) box(x + (R() - 0.5) * w * 0.5, top + 4, z + (R() - 0.5) * d * 0.5, 0, 0.2, 8, 0.2, 34, R()); }
      if (u0 + w / 2 + 17 < CH && R() < 0.7) block(X(u0 + w / 2 + 3 + 5.1 + R() * 2), Z(fv + 2 + 8.5), 10.2, 17, (2 + floor(R() * 4)) * 3, 8, ph(cx + 9, cz));
      else if (v0 + d / 2 + 17 < CH && R() < 0.7) block(X(fu + 2 + 8.5), Z(v0 + d / 2 + 3 + 5.1 + R() * 2), 17, 10.2, (2 + floor(R() * 4)) * 3, 8, ph(cx, cz + 9));
      for (let i = 0; i < 3; i++) if (R() < 0.5) wreck(X(fu + 4 + R() * (CH - fu - 8)), Z(fv + 4 + R() * (CH - fv - 8)), R() * TAU);
    } else if (kind === 4 && !nearRiver) {         // rows of shops with flats over them, wall to wall along both streets; here and there one has come down
      const row = (ns) => { const f0 = ns ? fu : fv, lim = ns ? fv : fu + 12; if (!(ns ? stN : stE) && R() < 0.5) return;
        for (let a = lim; a < CH - 5;) { const w = R() < 0.6 ? 10.2 : 17, dp = 10.2, nf = 2 + floor(R() * 4.5); if (a + w > CH - 1) break;
          const q = ns ? [X(f0 + dp / 2), Z(a + w / 2)] : [X(a + w / 2), Z(f0 + dp / 2)], sd = R();
          if (R() < 0.1) { rubble(q[0], q[1], 7, 22); a += w + 0.3; continue; }
          const top = block(q[0], q[1], ns ? dp : w, ns ? w : dp, nf * 3, 8, sd), yb = top - nf * 3 + 0.5;
          // the shop's shutter down (or half torn away) on the street side, a signboard hung out over the footpath
          if (ns ? stN : stE) { const fx = ns ? X(f0 - 0.07) : q[0], fz = ns ? q[1] : Z(f0 - 0.07); if (R() < 0.75) box(fx, yb + 1.45, fz, 0, ns ? 0.12 : w - 1, 2.7, ns ? w - 1 : 0.12, 32, R()); else box(fx, yb + 1.45, fz, 0, ns ? 0.12 : w - 1, 2.7, ns ? w - 1 : 0.12, 3);
            if (R() < 0.45) { const sy = 2.2 + R() * 1.6, o = (R() - 0.5) * (w - 2); box(ns ? X(f0 - 0.75) : q[0] + o, yb + 4 + sy / 2 + R() * 2, ns ? q[1] + o : Z(f0 - 0.75), 0, ns ? 1.1 : 0.12, sy, ns ? 0.12 : 1.1, 23, R(), R() < 0.3 ? (R() - 0.5) * 0.5 : 0); } }
          if (R() < 0.6) box(q[0] + (R() - 0.5) * 3, top + 0.9, q[1] + (R() - 0.5) * 3, 0, 1.6, 1.8, 1.6, R() < 0.5 ? 19 : 2, R());      // a water tank on the roof
          a += w + (R() < 0.15 ? 2.5 : 0.25); } };
      row(true); row(false);
      for (let i = 0; i < 5; i++) plant(TREES[BL[floor(R() * BL.length)]], X(fu + 16 + R() * (CH - fu - 18)), Z(fv + 16 + R() * (CH - fv - 18)), R() * TAU, 0.8 + R() * 0.8);
    } else if (kind === 6) {                    // houses in their plots, the gardens run wild
      const H = [HOUSE3, HOUSE3, HOUSE2, HOUSE3, HOUSE2, HOUSE], put = (u, w, toN) => { const x = X(u), z = Z(w), T = H[floor(R() * H.length)]; if (!dry(x, z, 22)) return;
        const yaw = toN ? -sx * PI / 2 : (sz > 0 ? PI : 0), y = hAt(x, z); stamp(T, x, y, z, yaw, R(), R()); const wd = T === HOUSE2 ? 3.6 : 4.6, dp = T === HOUSE2 ? 4.1 : 3.4;
        solid(x, z, yaw, wd, dp, y - 1, y + 5); foot.push(x, z, 8, 8);
        if (R() < 0.4) wreck(x + (toN ? -sx * 8.5 : 6.5), z + (toN ? 6.5 : -sz * 8.5), toN ? 0 : PI / 2); };
      put(fu + 9.5, fv + 12, true); if (fv + 40 < CH - 8) put(fu + 9.5, fv + 38, true); if (fu + 34 < CH - 8) put(fu + 34, fv + 9.5, false); if (R() < 0.5 && fu + 36 < CH - 8 && fv + 40 < CH - 8) put(fu + 36, fv + 40, R() < 0.5);
      for (let i = 0; i < 9; i++) plant(TREES[R() < 0.45 ? BL[floor(R() * BL.length)] : R() < 0.5 ? 7 : 8 + floor(R() * 2)], X(fu + 2 + R() * (CH - fu - 4)), Z(fv + 2 + R() * (CH - fv - 4)), R() * TAU, 0.7 + R() * 0.8);
    } else if (kind === 5 && !nearRiver) {      // a shed of rusting sheet and its yard: shipping boxes, a lorry that never left
      const w = 26 + floor(R() * 3) * 4, d = 20 + floor(R() * 2) * 4, x = X(fu + 3 + w / 2), z = Z(fv + 3 + d / 2), sd = R(), yb = hAt(x, z) - 0.4, Hs = 6 + R() * 2.5;
      box(x, yb + Hs / 2, z, 0, w, Hs, d, 1, sd); box(x, yb + Hs + 1.4, z, 0, w + 0.8, 2.8, d + 0.8, 1, sd, 0, 1); solid(x, z, 0, w / 2, d / 2, yb, yb + Hs); foot.push(x, z, w / 2 + 0.6, d / 2 + 0.6);
      box(x, yb + 2.6, Z(fv + 3 - 0.05), 0, 5.5, 4.6, 0.14, 3);
      for (let i = 0; i < 5; i++) { const vq = fv + d + 8 + R() * max(4, CH - fv - d - 14), px = X(fu + 5 + R() * (CH - fu - 10)), pz = Z(vq); if (vq > CH - 4) continue;
        const yw = R() < 0.7 ? 0 : R() * TAU, y = hAt(px, pz), cc = BOXCOL[floor(R() * BOXCOL.length)]; box(px, y + 1.3, pz, yw, 6.06, 2.59, 2.44, 50, cc); solid(px, pz, yw, 3.03, 1.22, y, y + 2.6); foot.push(px, pz, 3.4, 3.4);
        if (R() < 0.3) box(px + (R() - 0.5), y + 3.9, pz, yw + (R() - 0.5) * 0.3, 6.06, 2.59, 2.44, 50, BOXCOL[floor(R() * BOXCOL.length)]); }
    } else if (kind === 3 && !nearRiver) {                    // an open lot: a car park still half full, or the camp the army made and lost
      if (seedB < 0.3) {
        for (let i = 0; i < 5; i++) { const x = X(fu + 8 + (i % 3) * 13), z = Z(fv + 8 + floor(i / 3) * 12), y = hAt(x, z), yw = sx > 0 ? 0 : PI; if (R() < 0.2) continue;
          box(x, y + 1.15, z, yw, 6, 2.3, 4.4, 50, R() < 0.5 ? OLIVE : OLIVE2, 0, 1); solid(x, z, yw, 3, 0.4, y, y + 2); foot.push(x, z, 3.4, 2.6); }
        for (let a = 0; a < 30; a += 1.25) { if (R() < 0.15) continue; const x = X(fu + 3 + a), z = Z(fv + 34), y = hAt(x, z); box(x, y + 0.45, z, (R() - 0.5) * 0.2, 1.2, 0.9, 0.7, 50, TAN); solid(x, z, 0, 0.6, 0.35, y, y + 1); }
        { const x = X(fu + 44), z = Z(fv + 14), y = hAt(x, z), yw = PI / 2 + (R() - 0.5) * 0.5, c = cos(yw), s = sin(yw), put = (lx, ly, lz, a, b, d, m, sd) => box(x + lx * c + lz * s, y + ly, z - lx * s + lz * c, yw, a, b, d, m, sd);      // an army lorry
          put(-0.9, 1.5, 0, 4.6, 1.1, 2.4, 50, OLIVE); put(-0.9, 2.5, 0, 4.5, 1.2, 2.3, 50, OLIVE2); put(2.5, 1.85, 0, 2.0, 1.9, 2.3, 50, OLIVE); put(2.6, 2.35, 0, 1.9, 0.6, 2.36, 17, 0.2);
          for (const wx of [-2.4, -1.1, 2.4]) for (const wz of [-1.08, 1.08]) put(wx, 0.52, wz, 1.04, 1.04, 0.3, 39, 1); solid(x, z, yw, 3.5, 1.25, y, y + 3); foot.push(x, z, 3.8, 3.8); }
        for (let i = 0; i < 6; i++) { const x = X(fu + 4 + R() * 50), z = Z(fv + 38 + R() * 16), y = hAt(x, z); if (!inside(x, z)) continue; box(x, y + 0.45, z, R() * TAU, 0.9, 0.9, 0.9, R() < 0.5 ? 0 : 50, R() < 0.5 ? OLIVE : TAN); }
      } else for (let v0 = fv + 6; v0 < CH - 6; v0 += 11.5) for (let u0 = fu + 5; u0 < CH - 4; u0 += 2.9) if (R() < 0.3) { const x = X(u0), z = Z(v0 + (R() - 0.5) * 0.6); if (dry(x, z, 16)) wreck(x, z, PI / 2 + (R() - 0.5) * 0.15 + (R() < 0.5 ? PI : 0)); }
    } else {                                    // a park (or ground by the river): trees, scrub, a pavilion if anything
      const n = kind === 1 ? 13 : 5; for (let i = 0; i < n; i++) plant(TREES[BL[floor(R() * BL.length)]], X(fu + 2 + R() * (CH - fu - 4)), Z(fv + 2 + R() * (CH - fv - 4)), R() * TAU, 0.9 + R() * 0.9);
      for (let i = 0; i < 9; i++) plant(TREES[8 + floor(R() * 2)], X(fu + R() * (CH - fu)), Z(fv + R() * (CH - fv)), R() * TAU, 0.6 + R() * 0.8, 1, true, true);
      if (kind === 1 && seedB < 0.3) { const x = X(34), z = Z(34), y = hAt(x, z); if (dry(x, z, 20)) { stamp(SALA, x, y, z, R() * TAU, R(), R()); foot.push(x, z, 3, 3); } }
    }
    // green getting in everywhere: scrub wherever nothing stands
    for (let i = 0; i < (kind === 2 || kind === 4 ? 4 : 7); i++) plant(TREES[8 + (R() < 0.25 ? 1 : 0)], X(fu + R() * (CH - fu)), Z(fv + R() * (CH - fv)), R() * TAU, 0.5 + R() * 0.7, 1, true, true);
  } else {
    // ---- open country: the woods, scrub in the clearings, a wreck now and then along the road out
    // (full trees only beside a road, where they are seen close; deeper in, every other sprig and no fine twigs - a wood is most of what there is to draw)
    const far_ = roadEdge(xc, zc) > 75;
    for (let i = 0; i < 40; i++) { const x = ox + R() * CH, z = oz + R() * CH, w = woodAt(x, z); if (w < R() * 0.9 + 0.08) continue; const big = R(), nr = !far_ && roadEdge(x, z) < 26;
      plant(TREES[big < 0.2 ? 11 : BL[floor(R() * BL.length)]], x, z, R() * TAU, 0.9 + R() * 0.8, nr ? 1 : far_ ? 3 : 2, nr); }
    for (let i = 0; i < 5; i++) if (R() < 0.3) plant(TREES[BL[floor(R() * BL.length)]], ox + R() * CH, oz + R() * CH, R() * TAU, 0.8 + R() * 0.7);
    for (let i = 0; i < 12; i++) plant(TREES[8 + (R() < 0.15 ? 1 : 0)], ox + R() * CH, oz + R() * CH, R() * TAU, 0.6 + R() * 0.9, 1, true, R() < 0.2);
    const ka = Math.round(xc / (8 * BK)) * 8, ia = Math.round(zc / (8 * BK)) * 8;
    if (R() < 0.16 && segOn(1, ka, floor(zc / BK))) { const z = oz + R() * CH, x = nsX(ka, z) + (R() < 0.5 ? -1 : 1) * (2 + R() * 4); if (inside(x, z) && dry(x, z, 17)) wreck(x, z, PI / 2 + (R() - 0.5) * 1.4); }
    if (R() < 0.16 && segOn(0, ia, floor(xc / BK))) { const x = ox + R() * CH, z = ewZ(ia, x) + (R() < 0.5 ? -1 : 1) * (2 + R() * 4); if (inside(x, z)) wreck(x, z, (R() - 0.5) * 1.4); }
  }
  // ---- the quarantine line: where a road reaches the edge of the map a concrete wall stands across it, with the lorries that brought it
  if (edge > 9750 && edge < 9950) {
    const wall = (x, z, yaw) => { if (!inside(x, z)) return; const y = hAt(x, z), c = cos(yaw), s = sin(yaw);
      for (let q = -5; q <= 5; q++) { const px = x + q * 4 * c, pz = z - q * 4 * s; box(px, y + 1.5, pz, yaw, 4.02, 3, 0.7, 2, R()); box(px, y + 3.25, pz, yaw, 4.02, 0.5, 0.25, 26, 0); }
      solid(x, z, yaw, 22, 0.5, -1e9, 1e9); for (const q of [-1, 1]) { box(x + q * 24 * c, y + 3, z - q * 24 * s, yaw, 3, 6, 3, 2, R()); box(x + q * 24 * c, y + 6.8, z - q * 24 * s, yaw, 3.6, 0.3, 3.6, 1, 0.5); solid(x + q * 24 * c, z - q * 24 * s, yaw, 1.5, 1.5, -1e9, 1e9); } };
    for (const s of [-1, 1]) { const ka = Math.round(xc / (8 * BK)) * 8, ia = Math.round(zc / (8 * BK)) * 8;
      if (segOn(1, ka, floor(s * 9850 / BK))) wall(nsX(ka, s * 9850), s * 9850, 0);
      if (segOn(0, ia, floor(s * 9850 / BK))) wall(s * 9850, ewZ(ia, s * 9850), PI / 2); }
  }
  // ---- a bridge whose middle is in this chunk
  if (par(cx) === 0 && isArt(cx / 2)) { const b = brOf(cx / 2);
    if (b && floor(b[1] / CH) === cz) { const [x, zm, hl, y0, y1, fell] = b, tl = -atan2(y1 - y0, 2 * hl), yAt = (z) => mix(y0, y1, (z - zm) / hl * 0.5 + 0.5); reach = hl + 10;
      const span = (za, zb) => { const zq = (za + zb) / 2, len = hypot(zb - za, yAt(zb) - yAt(za)); box(x, yAt(zq) - 0.5, zq, 0, 15, 1, len, 51, 0, tl);
        for (const e of [-1, 1]) { box(x + e * 7.3, yAt(zq) + 0.55, zq, 0, 0.3, 0.25, len, 19, 0, tl); for (let z = za + 1; z < zb; z += 3) box(x + e * 7.3, yAt(z) + 0.25, z, 0, 0.22, 0.6, 0.22, 19, 0); } };
      if (fell) { span(zm - hl, zm - hl * 0.36); span(zm + hl * 0.36, zm + hl);
        for (const e of [-1, 1]) { const z0 = zm + e * hl * 0.36; box(x + (R() - 0.5), yAt(z0) - 3.6, z0 - e * 6.2, 0, 14.5, 0.9, 15, 51, 0, e * 0.5); box(x + (R() - 0.5) * 6, WL + 0.3, zm + e * R() * hl * 0.2, R() * 0.5, 13, 0.9, 11, 2, R(), (R() - 0.5) * 0.4); } }
      else { span(zm - hl, zm + hl); for (let i = 0; i < 3; i++) if (R() < 0.6) { const z = zm + (R() - 0.5) * hl * 1.5; wreck(x + (R() - 0.5) * 10, z, PI / 2 + (R() - 0.5) * 1.2, yAt(z)); } }
      for (let z = zm - hl + 9; z < zm + hl - 6; z += 26) { const yt = yAt(z) - 1, yb = WL - 4; box(x, (yt + yb) / 2, z, 0, 11, yt - yb, 2.2, 2, R()); box(x, yt - 0.4, z, 0, 14, 0.8, 3, 2, R()); }
    } }
  // ---- now the plants, once every building stands: none inside one, none in the water, none on sound asphalt (but scrub, which breaks through)
  for (const [T, x, z, turn, sc, thin, twigs, any] of pend) {
    if (!inside(x, z) || wetAt(x, z)) continue;
    if (T.crR === undefined) { let r = 0, h = 0; const L = T.leaves; for (let i = 0; i < L.length; i += 12) { r = max(r, hypot(L[i], L[i + 2])); h = max(h, L[i + 1]); } T.crR = r; T.crH = h; }
    let ok = true; for (let i = 0; i < foot.length; i += 4) if (abs(x - foot[i]) < foot[i + 2] + 0.5 && abs(z - foot[i + 1]) < foot[i + 3] + 0.5) { ok = false; break; } if (!ok) continue;
    if (!any && roadEdge(x, z) < 0.8) continue;
    plantNow(T, x, z, turn, sc, thin, twigs);
    const tr = T.segs.length ? T.segs[3] * sc : 0, ty = hAt(x, z);
    if (T.crH * sc > 2.6 && tr > 0.07) col.push(x, z, 1, 0, max(tr, 0.18), max(tr, 0.18), ty - 0.5, ty + T.crH * sc); else soft.push(x, z, max(0.6, T.crR * sc));
  }
  // leaves are drawn in four densities, each the first third of the one before: so they are put in a random order
  const nL = leaves.n / 12, lf = new Float32Array(leaves.n), Rs = rng(cx * 31 + cz * 17 + 5);
  { const order = new Uint32Array(nL); for (let i = 0; i < nL; i++) order[i] = i; for (let i = nL - 1; i > 0; i--) { const j = floor(Rs() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; } for (let i = 0, o = 0; i < nL; i++) { const q = order[i] * 12; for (let k = 0; k < 12; k++) lf[o++] = LBUF[q + k]; } }
  const allSeg = new Float32Array(far.length + segs.length); allSeg.set(far); allSeg.set(segs, far.length);
  return { cx, cz, x: xc, z: zc, y: hg[(M * M) >> 1], vb: vbuf(v), nSeg: allSeg.length / 10, nSegFar: far.length / 10, segB: allSeg.length ? vbuf(allSeg) : null,
    hgc: hg.slice(), hwc: hwet.slice(), col: new Float32Array(col), soft: new Float32Array(soft), foot: new Float32Array(foot), wild: wildAt(xc, zc), town, roads: roadEdge(xc, zc) < 60 || town,
    reach, nLeaf: nL, leafB: nL ? vbuf(lf) : null, nGrass: 0, grassB: null, house: null, nBox: boxes.length / 12, boxB: boxes.length ? vbuf(new Float32Array(signW(boxes))) : null };
}
// Grass: grown only for the chunks round the eye, a share of it each frame (see Endless's chunks.js). It stands where the terrain shader paints
// turf - thick in the country, the parks and the gardens, in tufts through the paving elsewhere - and in the patches where a road has broken up.
const NG = 42000, gr = new Float32Array(NG * 12);
let grassJob = null;
function growGrass(c) {
  if (grassJob && grassJob !== c) { if (!grassJob.dead) return; grassJob = null; }
  if (!grassJob) { grassJob = c; c.gI = 0; c.gN = 0; c.gR = rng((c.cx * 83492791) ^ (c.cz * 2654435761) ^ 77); }
  const ox = c.cx * CH, oz = c.cz * CH, R = c.gR, iEnd = min(NG, c.gI + 12000), HG = c.hgc, HW = c.hwc, M = GN + 3, F = c.foot, thr = mix(0.60, 0.38, c.wild); let ng = c.gN;
  const hgAt = (x, z) => { const fx = (x - ox) / GS + 1, fz = (z - oz) / GS + 1, ix = floor(fx), iz = floor(fz), u = fx - ix, w = fz - iz, k = iz * M + ix; gw[0] = HW[(iz + (w > 0.5 ? 1 : 0)) * M + ix + (u > 0.5 ? 1 : 0)] > 0 ? 1 : 0; return mix(mix(HG[k], HG[k + 1], u), mix(HG[k + M], HG[k + M + 1], u), w); };
  for (let i = c.gI; i < iEnd; i++) {
    if (ng >= NG - 2) break;
    const x = ox + R() * CH, z = oz + R() * CH, u = R(), y = hgAt(x, z); if (gw[0]) continue;
    if (c.roads) { const e = roadEdge(x, z); if (e < 0.3) { if (weedAt(x, z) < 0.685 || u > 0.4) continue; } else if (c.town && e < 3.3 && weedAt(x, z) < 0.6 && u > 0.05) continue; }
    let ok = true; for (let q = 0; q < F.length; q += 4) if (abs(x - F[q]) < F[q + 2] - 0.5 && abs(z - F[q + 1]) < F[q + 3] - 0.5) { ok = false; break; } if (!ok) continue;
    const tf = turfAt(x, z); if (tf < thr + 0.03 ? u > 0.03 : u > 0.5 + 0.4 * c.wild) continue;
    const tall = vnoise(x * 0.11, z * 0.11), L = (0.14 + 0.34 * R()) * (0.6 + 2.0 * tall * tall) * (0.7 + 0.5 * c.wild);
    gr.set([x, y - 0.02, z, L, R() * TAU, 1.0 + R() * 0.5, 0.011 + R() * 0.012, 0.4 + R() * 1.3, 2, R(), 1, 0.25], ng * 12); ng++;
  }
  c.gI = iEnd; c.gN = ng; if (iEnd < NG && ng < NG - 2) return;
  c.nGrass = ng; c.grassB = ng ? vbuf(gr.subarray(0, ng * 12)) : null; c.grassTried = true; grassJob = null;
}
function dropChunk(c) { c.dead = true; c.boxB && c.boxB.destroy(); c.vb.destroy(); c.segB && c.segB.destroy(); c.leafB && c.leafB.destroy(); c.grassB && c.grassB.destroy(); }
const want = [];
let cxS = 1e9, czS = 1e9;      // the chunk the eye counts as being in: it changes only when the eye is 8 m into the next one
function updateChunks(px, pz, budget) {
  if (abs(px - (cxS + 0.5) * CH) > CH / 2 + 8) cxS = floor(px / CH); if (abs(pz - (czS + 0.5) * CH) > CH / 2 + 8) czS = floor(pz / CH);
  want.length = 0; const keep = new Set();
  for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) { if (dx * dx + dz * dz > 34) continue; const cx = cxS + dx, cz = czS + dz, k = cx + ',' + cz; keep.add(k); if (!chunks.has(k)) want.push([hypot((cx + 0.5) * CH - px, (cz + 0.5) * CH - pz), cx, cz, k]); }
  for (const [k, c] of chunks) if (!keep.has(k)) { dropChunk(c); chunks.delete(k); }
  want.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < want.length && i < budget; i++) chunks.set(want[i][3], buildChunk(want[i][1], want[i][2]));
  return want.length;
}
