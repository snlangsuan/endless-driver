// --------------------------------------------------------------------------------------------------------- plants
// A plant is designed once as a template (branch pieces + leaves around the origin) and then stamped into the world
// turned and scaled. Leaf: x y z len | yaw el halfWidth droop | kind seed shade height. Piece: x0 y0 z0 r0 | x1 y1 z1 r1 | h0 h1
const nrm3 = (v) => { const l = hypot(v[0], v[1], v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l; return v; };
function shuffleLeaves(L, R) { const n = L.length / 12, t = new Array(12); for (let i = n - 1; i > 0; i--) { const j = floor(R() * (i + 1)); for (let k = 0; k < 12; k++) { t[k] = L[i * 12 + k]; L[i * 12 + k] = L[j * 12 + k]; L[j * 12 + k] = t[k]; } } }
// broadleaf tree: each limb carries its children spaced along it, spiralling round at the golden angle
function makeTree(seed, o) {
  const R = rng(seed), segs = [[], [], [], []], twigs = [];
  const branch = (p0, d0, len, rad, lvl) => {
    // No limb grows straight: each piece turns a little from the last, now and then sharply (where a shoot once died back);
    // a long limb sags under its own weight in the middle and turns up to the light at its end.
    const n = lvl === 0 ? 8 : lvl === 1 ? 7 : 5, pts = [p0.slice()], dirs = [], d = d0.slice(), p = p0.slice(), wob = o.wob * (lvl ? 1.25 : 0.6), tip = lvl === 0 ? 0.16 : 0.4;
    for (let i = 0; i < n; i++) {
      const kink = R() < 0.22 ? 2.6 : 1, flat = 1 - abs(d[1]);
      d[0] += (R() - 0.5) * wob * kink; d[2] += (R() - 0.5) * wob * kink; d[1] += lvl ? (R() - 0.5) * wob * 0.6 + (i / n - 0.42) * 0.3 * flat + o.trop * 0.2 : 0.05; nrm3(d);
      const r0 = rad * (1 - (1 - tip) * i / n) * (lvl === 0 && i === 0 ? 1.6 : 1), r1 = rad * (1 - (1 - tip) * (i + 1) / n);
      const q = [p[0] + d[0] * len / n, p[1] + d[1] * len / n, p[2] + d[2] * len / n];
      segs[lvl].push(p[0], p[1], p[2], r0, q[0], q[1], q[2], r1, max(p[1], 0), max(q[1], 0));
      p[0] = q[0]; p[1] = q[1]; p[2] = q[2]; pts.push(q); dirs.push(d.slice());
    }
    if (lvl >= o.n.length - 1) twigs.push(pts);
    if (lvl >= o.n.length) return;
    const cnt = o.n[lvl], f0 = lvl === 0 ? o.crown : 0.2;
    for (let k = 0; k < cnt; k++) {
      const t = (k + R() * 0.7) / cnt, f = min(0.999, f0 + (1 - f0) * t), fi = f * n, i0 = floor(fi), tg = dirs[i0];
      const pos = [mix(pts[i0][0], pts[i0 + 1][0], fi - i0), mix(pts[i0][1], pts[i0 + 1][1], fi - i0), mix(pts[i0][2], pts[i0 + 1][2], fi - i0)];
      const ax = abs(tg[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
      const p1 = nrm3([ax[1] * tg[2] - ax[2] * tg[1], ax[2] * tg[0] - ax[0] * tg[2], ax[0] * tg[1] - ax[1] * tg[0]]);
      const p2 = [tg[1] * p1[2] - tg[2] * p1[1], tg[2] * p1[0] - tg[0] * p1[2], tg[0] * p1[1] - tg[1] * p1[0]];
      const az = k * 2.39996 + R() * 0.6, a = o.ang[lvl] * (0.82 + R() * 0.36) * (lvl === 0 ? 1.2 - 0.5 * t : 1), ca = cos(a), sa = sin(a);
      const nd = nrm3([tg[0] * ca + (p1[0] * cos(az) + p2[0] * sin(az)) * sa, tg[1] * ca + (p1[1] * cos(az) + p2[1] * sin(az)) * sa + o.trop, tg[2] * ca + (p1[2] * cos(az) + p2[2] * sin(az)) * sa]);
      const cl = (lvl === 0 ? o.H * o.len0 * (0.62 + 0.42 * sin(PI * (0.12 + 0.8 * t))) : len * o.lenR * (1 - 0.45 * t)) * (0.8 + R() * 0.4);
      branch(pos, nd, cl, max(0.012, rad * (1 - (1 - tip) * f) * (lvl === 0 ? 0.5 : 0.6)), lvl + 1);
    }
  };
  branch([0, -0.3, 0], nrm3([(R() - 0.5) * 0.12, 1, (R() - 0.5) * 0.12]), o.H, o.r, 0);
  // the crown's middle and reach, for shading leaves deep inside it darker
  let cx = 0, cy = 0, cz = 0, cn = 0, rad = 0;
  for (const t of twigs) for (const p of t) { cx += p[0]; cy += p[1]; cz += p[2]; cn++; }
  cx /= cn; cy /= cn; cz /= cn;
  for (const t of twigs) for (const p of t) rad = max(rad, hypot(p[0] - cx, p[1] - cy, p[2] - cz));
  const leaves = [];
  for (const t of twigs) for (let i = 1; i < t.length; i++) for (let j = 0; j < o.per; j++) {
    const f = R(), a = i < t.length - 1 ? t[i] : t[i - 1], b = i < t.length - 1 ? t[i + 1] : t[i];
    const x = mix(a[0], b[0], f), y = mix(a[1], b[1], f), z = mix(a[2], b[2], f);
    const dist = hypot(x - cx, y - cy, z - cz) / rad, shade = 0.42 + 0.58 * clamp((dist - 0.25) / 0.6, 0, 1), L = o.leaf * (0.7 + R() * 0.6);
    leaves.push(x, y, z, L, R() * TAU, -0.35 + R() * 1.1, L * o.wide, 0.5 + R() * 1.0, 0, R(), shade, y);
  }
  shuffleLeaves(leaves, R);
  const all = [].concat(segs[0], segs[1], segs[2], segs[3]);
  return { segs: new Float32Array(all), nSeg: all.length / 10, nSegFar: (segs[0].length + segs[1].length) / 10, nSegMid: (segs[0].length + segs[1].length + segs[2].length) / 10, leaves: new Float32Array(leaves), nLeaf: leaves.length / 12 };
}
// casuarina (ต้นสนทะเล): a tall rough trunk leaning one way (toward local +x), thin upswept boughs, and long drooping sprays of grey-green needles
function makeCasuarina(seed) {
  const R = rng(seed), segs = [], br = [], leaves = [], Hh = 15 + R() * 5, lean = 0.16 + R() * 0.10, w1 = R() * 6, w2 = R() * 6;
  const tp = (t) => [sin(t * 1.25) * Hh * lean + sin(t * 5 + w1) * 0.3 * t, t * Hh - 0.3, sin(t * 4 + w2) * 0.3 * t];
  for (let i = 0; i < 12; i++) { const a = tp(i / 12), b = tp((i + 1) / 12); segs.push(a[0], a[1], a[2], 0.36 - 0.29 * i / 12 + (i === 0 ? 0.14 : 0), b[0], b[1], b[2], 0.36 - 0.29 * (i + 1) / 12, max(a[1], 0), b[1]); }
  const nB = 40;
  for (let k = 0; k < nB; k++) {
    const t = 0.3 + 0.69 * (k + R() * 0.8) / nB, base = tp(t), az = k * 2.39996 + R() * 0.5, Lb = (2.9 + R() * 3.0) * (1.1 - 0.75 * (t - 0.3) / 0.7), ox = cos(az), oz = sin(az), rise = 0.25 + R() * 0.5;
    const bp = (u) => [base[0] + ox * Lb * u, base[1] + Lb * (rise * u - 0.42 * u * u), base[2] + oz * Lb * u];
    for (let i = 0; i < 4; i++) { const a = bp(i / 4), b = bp((i + 1) / 4); br.push(a[0], a[1], a[2], 0.055 - 0.011 * i, b[0], b[1], b[2], 0.044 - 0.011 * i, a[1], b[1]); }
    const n = 12 + floor(Lb * 3);
    for (let j = 0; j < n; j++) { const u = 0.18 + 0.82 * R(), q = bp(u), L = 0.55 + R() * 0.55; leaves.push(q[0], q[1], q[2], L, az + (R() - 0.5) * 2.4, -0.2 - R() * 0.9, 0.13, 0.8 + R() * 1.2, 8, R(), 0.55 + 0.45 * u, q[1]); }
  }
  shuffleLeaves(leaves, R);
  const all = segs.concat(br);
  return { segs: new Float32Array(all), nSeg: all.length / 10, nSegFar: 12, leaves: new Float32Array(leaves), nLeaf: leaves.length / 12 };
}
// coconut palm: a leaning ringed trunk, arching fronds, each a rib carrying two rows of hanging leaflets
function makePalm(seed) {
  const R = rng(seed), segs = [], leaves = [], Hh = 9 + R() * 3, bend = 0.12 + R() * 0.12, ba = R() * TAU;
  const tp = (t) => [cos(ba) * sin(t * 1.4) * Hh * bend, t * Hh - 0.3, sin(ba) * sin(t * 1.4) * Hh * bend];
  for (let i = 0; i < 10; i++) { const a = tp(i / 10), b = tp((i + 1) / 10); segs.push(a[0], a[1], a[2], 0.26 - 0.09 * i / 10 + (i === 0 ? 0.1 : 0), b[0], b[1], b[2], 0.26 - 0.09 * (i + 1) / 10, max(a[1], 0), b[1]); }
  const top = tp(1);
  for (let k = 0; k < 7; k++) { const a = k * 0.9 + R(), r = 0.2 + R() * 0.12, y = top[1] - 0.35 - R() * 0.3; segs.push(top[0] + cos(a) * r, y, top[2] + sin(a) * r, 0.13, top[0] + cos(a) * r, y - 0.24, top[2] + sin(a) * r, 0.11, y, y); }
  const nTrunk = segs.length / 10;
  for (let k = 0; k < 19; k++) {
    const dead = k >= 16, a = k * 2.39996 + R() * 0.4, el = dead ? -0.9 - R() * 0.3 : -0.15 + R() * 1.0, L = 3.4 + R() * 1.3, dx = cos(a) * cos(el), dy = sin(el), dz = cos(el) * sin(a), sag = 0.4 + R() * 0.25;
    const rib = (t) => [top[0] + dx * L * t, top[1] + dy * L * t - t * t * L * sag, top[2] + dz * L * t];
    for (let i = 0; i < 6; i++) { const p = rib(i / 6), q = rib((i + 1) / 6); segs.push(p[0], p[1], p[2], 0.045 - 0.006 * i, q[0], q[1], q[2], 0.039 - 0.006 * i, p[1], q[1]); }
    for (let j = 0; j < 24; j++) for (const s of [1, -1]) {
      const t = 0.1 + 0.9 * (j + 0.5) / 24, p = rib(t), ll = L * (0.1 + 0.26 * sin(PI * Math.pow(t, 0.7)));
      leaves.push(p[0], p[1], p[2], ll, a + s * (1.25 - t * 0.35), -0.25 - R() * 0.3, 0.055, 1.1 + R() * 0.7, dead ? 7 : 1, R(), 0.6 + 0.4 * t, p[1]);
    }
  }
  shuffleLeaves(leaves, R);
  return { segs: new Float32Array(segs), nSeg: segs.length / 10, nSegFar: nTrunk + 114, leaves: new Float32Array(leaves), nLeaf: leaves.length / 12 };
}
// sugar palm (ต้นตาล): a tall straight trunk and a round head of stiff fans
function makeSugarPalm(seed) {
  const R = rng(seed), segs = [], leaves = [], Hh = 11 + R() * 4;
  for (let i = 0; i < 6; i++) segs.push((R() - 0.5) * 0.08, i / 6 * Hh - 0.3, 0, 0.27 - 0.02 * i + (i === 0 ? 0.12 : 0), (R() - 0.5) * 0.08, (i + 1) / 6 * Hh - 0.3, 0, 0.25 - 0.02 * i, i / 6 * Hh, (i + 1) / 6 * Hh);
  const nTrunk = 6, top = [0, Hh - 0.3, 0];
  for (let k = 0; k < 26; k++) {
    const az = k * 2.39996, el = -0.7 + R() * 1.9, st = 0.8 + R() * 0.5, dx = cos(az) * cos(el), dy = sin(el), dz = sin(az) * cos(el), sx = -sin(az), sz = cos(az);
    const hub = [top[0] + dx * st, top[1] + dy * st, top[2] + dz * st];
    segs.push(top[0], top[1], top[2], 0.035, hub[0], hub[1], hub[2], 0.025, top[1], hub[1]);
    for (let j = 0; j < 14; j++) {
      const fa = (j / 13 - 0.5) * 3.3, bx = dx * cos(fa) + sx * sin(fa), by = dy * cos(fa), bz = dz * cos(fa) + sz * sin(fa);
      leaves.push(hub[0], hub[1], hub[2], 1.05 + R() * 0.3, atan2(bz, bx), Math.asin(clamp(by, -1, 1)), 0.075, 0.2 + R() * 0.3, 1, R(), 0.5 + 0.5 * clamp((el + 0.7) / 1.9, 0, 1), hub[1]);
    }
  }
  shuffleLeaves(leaves, R);
  return { segs: new Float32Array(segs), nSeg: segs.length / 10, nSegFar: nTrunk + 26, leaves: new Float32Array(leaves), nLeaf: leaves.length / 12 };
}
// banana clump (กอกล้วย): four or five thick stems of different heights leaning apart, brown and stringy at the foot and green above.
// Each stem carries a head of big paddle leaves on long stalks - the young ones standing up in the middle, the old ones arching over
// and hanging, torn along the veins. The tallest stem carries the bunch (เครือ): a thick stalk bends over out of the crown and hangs
// straight down, with hands of fruit in tiers round it, a bare length below them, and the purple bud (ปลี) at the end.
function makeBanana(seed) {
  const R = rng(seed), segs = [], fine = [], leaves = [], tube = (a, ra, b, rb, mat, o = segs) => o.push(a[0], a[1], a[2], ra, b[0], b[1], b[2], rb, -1, mat);
  const HS = [3.4, 2.7, 3.0, 2.1, 1.0];
  for (let s = 0; s < 5; s++) {
    const a0 = s * 2.4 + R() * 0.7, rr = s ? 0.42 + R() * 0.25 : 0.08, bx = cos(a0) * rr, bz = sin(a0) * rr, Hs = HS[s] * (0.92 + R() * 0.16), k = Hs / 3.4, lean = s ? 0.3 + R() * 0.35 : 0.12;
    const sp = (t) => [bx + cos(a0) * lean * k * t * t, -0.2 + (Hs + 0.2) * t, bz + sin(a0) * lean * k * t * t];
    const rad = (t) => (0.095 + 0.115 * Math.pow(1 - t, 1.4)) * (0.5 + 0.5 * k) + (t === 0 ? 0.05 : 0);
    for (let i = 0; i < 6; i++) tube(sp(i / 6), rad(i / 6), sp((i + 1) / 6), rad((i + 1) / 6), i < 3 ? 9 : 10);
    const top = sp(1), nl = s === 4 ? 5 : 9 + floor(R() * 3);
    for (let j = 0; j < nl; j++) {
      const az = j * 2.39996 + R() * 0.5 + s, age = j / (nl - 1), el = 1.32 - age * 1.3 + (R() - 0.5) * 0.2, L = (1.9 + R() * 0.6) * (0.45 + 0.55 * k) * (0.8 + 0.2 * sin(PI * age) + 0.1), droop = 0.45 + age * 0.95 + R() * 0.2;
      const pel = el * 0.55 + 0.7, pl = (0.4 + R() * 0.3) * (0.5 + 0.5 * k);                                  // the leaf stalk leaves the stem more steeply than the blade it carries
      const pe = [top[0] + cos(az) * cos(pel) * pl, top[1] + sin(pel) * pl, top[2] + sin(az) * cos(pel) * pl];
      tube([top[0], top[1] - 0.35 * k, top[2]], 0.06 * (0.5 + 0.5 * k), pe, 0.028, 10);
      leaves.push(pe[0], pe[1], pe[2], L, az, el, L * 0.175, droop, 5, clamp(age * 0.9 + (R() - 0.5) * 0.15, 0, 0.99), 0.85 + R() * 0.15, pe[1]);
    }
    if (s < 4) for (let j = 0; j < 3; j++) { const az = R() * TAU, p = sp(0.86 + R() * 0.1); leaves.push(p[0] + cos(az) * 0.1, p[1], p[2] + sin(az) * 0.1, (1.0 + R() * 0.5) * k, az, -1.25, 0.15, 0.3, 7, R(), 0.6, p[1]); }    // dead leaves hang down against the stem
    if (s === 0) {
      const az = a0 + 1.2 + R() * 3.9, cx = cos(az), cz = sin(az);
      const q = (t) => { const u = min(t / 0.25, 1), out = 0.45 * sin(u * PI / 2); return [top[0] + cx * out, top[1] - 0.1 + 0.5 * u * (1 - u) - 0.12 * u - max(t - 0.25, 0) * 1.95, top[2] + cz * out]; };
      for (let i = 0; i < 14; i++) tube(q(i / 14 * 0.88), 0.042 - 0.001 * i, q((i + 1) / 14 * 0.88), 0.041 - 0.001 * i, 2);
      const e = q(0.88), dn = (d) => [e[0], e[1] - d, e[2]];                                                 // the bud: a fat purple teardrop
      tube(e, 0.03, dn(0.07), 0.078, 5); tube(dn(0.07), 0.078, dn(0.17), 0.07, 5); tube(dn(0.17), 0.07, dn(0.34), 0.008, 5);
      for (let hd = 0; hd < 8; hd++) {                                                                       // the hands: each a ring of fingers that leave the stalk and curve upward, smaller toward the bud
        const b = q(0.33 + hd * 0.05), sz = 1 - hd * 0.055, nf = 13 - floor(hd / 2);
        for (let f = 0; f < nf; f++) {
          const fa = f / nf * TAU + hd * 0.9, inr = f & 1, fx = cos(fa), fz = sin(fa), l = (0.17 + R() * 0.04) * sz, r0 = 0.035 + inr * 0.03;
          const a = [b[0] + fx * 0.03, b[1] + inr * 0.03, b[2] + fz * 0.03], m = [b[0] + fx * (r0 + l * 0.6), b[1] + l * 0.12 + inr * 0.03, b[2] + fz * (r0 + l * 0.6)], e2 = [b[0] + fx * (r0 + l * 0.85), b[1] + l * 0.85 + inr * 0.03, b[2] + fz * (r0 + l * 0.85)];
          tube(a, 0.02 * sz, m, 0.034 * sz, 8, fine); tube(m, 0.034 * sz, e2, 0.014 * sz, 8, fine);
        }
      }
      tube(top, 0.05, [top[0] + (R() - 0.5) * 0.15, top[1] + 1.0, top[2] + (R() - 0.5) * 0.15], 0.03, 2); tube([top[0], top[1] + 1.0, top[2]], 0.03, [top[0], top[1] + 1.6, top[2]], 0.008, 2);      // the new leaf, still rolled, stands straight up out of the middle
    }
  }
  shuffleLeaves(leaves, R);
  const all = segs.concat(fine);
  return { segs: new Float32Array(all), nSeg: all.length / 10, nSegFar: segs.length / 10, leaves: new Float32Array(leaves), nLeaf: leaves.length / 12 };
}
