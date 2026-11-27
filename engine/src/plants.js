// --------------------------------------------------------------------------------------------------------- plants
// A plant is designed once as a template (branch pieces + leaves around the origin) and then stamped into the world
// turned and scaled. Leaf: x y z len | yaw el halfWidth droop | kind seed shade height. Piece: x0 y0 z0 r0 | x1 y1 z1 r1 | h0 h1
const nrm3 = (v) => { const l = hypot(v[0], v[1], v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l; return v; };
function shuffleLeaves(L, R) { const n = L.length / 12, t = new Array(12); for (let i = n - 1; i > 0; i--) { const j = floor(R() * (i + 1)); for (let k = 0; k < 12; k++) { t[k] = L[i * 12 + k]; L[i * 12 + k] = L[j * 12 + k]; L[j * 12 + k] = t[k]; } } }
// broadleaf tree: each limb carries its children spaced along it, spiralling round at the golden angle
// (o.sp: its species, by which its sprigs are cut to its own leaf and its bark painted - fsLeaf and fsBranch in scene.wgsl: 0 a pterocarpus
// (ประดู่) and any tree not said, 1 rain tree (จามจุรี), 2 dipterocarp (ยางนา), 3 golden shower (ราชพฤกษ์), 4 wild cherry (พญาเสือโคร่ง),
// 6 mango (มะม่วง), 7 bodhi (โพธิ์))
function makeTree(seed, o) {
  const R = rng(seed), segs = [[], [], [], []], twigs = [];
  const branch = (p0, d0, len, rad, lvl) => {
    // No limb grows straight: each piece turns a little from the last, now and then sharply (where a shoot once died back);
    // a long limb sags under its own weight in the middle and turns up to the light at its end.
    const n = lvl === 0 ? 8 : lvl === 1 ? 7 : lvl === 2 ? 4 : 3, pts = [p0.slice()], dirs = [], d = d0.slice(), p = p0.slice(), wob = o.wob * (lvl ? 1.25 : 0.6), tip = lvl === 0 ? 0.16 : 0.4;
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
    leaves.push(x, y, z, L, R() * TAU, -0.35 + R() * 1.1, L * o.wide, 0.5 + R() * 1.0, o.bloom && R() < o.bloom ? 10 : o.hang ? 19 : o.kind || 0, R(), shade + 2 * (o.sp || 0), y);      // (the tree's species rides with the shade, in twos: see leafV)      // (o.bloom: that share of the sprigs are sprays of blossom)
    // (o.hang: a golden shower's - its leaves are kind 19, which it half sheds when it flowers, and from that share of its sprigs hang one or two
    // long chains of flowers, leaf kind 18, straight down, seen only in its season)
    if (o.hang) for (let q = 0, nq = R() < o.hang ? (R() < 0.6 ? 2 : 1) : 0; q < nq; q++) { const Lr = 0.5 + R() * 0.38; leaves.push(x + (R() - 0.5) * 0.2, y - 0.05, z + (R() - 0.5) * 0.2, Lr, R() * TAU, -1.48 + R() * 0.16, Lr * 0.2, 0, 18, R(), shade, y); }
  }
  shuffleLeaves(leaves, R);
  const all = [].concat(segs[0], segs[1], segs[2], segs[3]);
  return { sp: o.sp || 0, segs: new Float32Array(all), nSeg: all.length / 10, nSegFar: (segs[0].length + segs[1].length) / 10, nSegMid: (segs[0].length + segs[1].length + segs[2].length) / 10, leaves: new Float32Array(leaves), nLeaf: leaves.length / 12 };
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
// Coconut palm (ต้นมะพร้าว): a slender grey trunk, swollen at the foot and ringed all the way up with the scars of fallen fronds, that leans out
// and curves up again; and a full round head of some thirty fronds five and six metres long - the youngest standing nearly upright in the
// middle, the rest arching out all round, the oldest hanging below the level - each a yellow-green rib bare for its first fifth, then carrying
// thirty pairs of long narrow leaflets, held up in a shallow V along a young frond and hanging from an old one. Under the head the brown fibre
// of the frond bases, the bunches of nuts, and two or three dead fronds hanging against the trunk.
// (The trunk and the ribs are made pieces - materials 28 and 2 - that ride the palm's sway, each from the height of its own two ends: branchV.
// It was a short flat umbrella of seventeen fronds of four metres with twenty-four pairs of leaflets, on a smooth black trunk; its ribs were
// bark-coloured.)
function makePalm(seed) {
  const R = rng(seed), segs = [], ribs = [], leaves = [], Hh = 9 + R() * 4, bend = 0.1 + R() * 0.14, ba = R() * TAU;
  const tp = (t) => [cos(ba) * sin(t * 1.4) * Hh * bend, t * Hh - 0.3, sin(ba) * sin(t * 1.4) * Hh * bend], SWof = (y) => -2 - max(y, 0);
  const made = (a, ra, b, rb, mat, o = segs) => o.push(a[0], a[1], a[2], ra, b[0], b[1], b[2], rb, SWof(a[1]), mat);
  // (the trunk: 42 cm through at the ground, 20 by a metre up, 16 under the head)
  const tr = (t) => 0.17 - 0.035 * t + 0.25 * Math.exp(-t * Hh / 0.45);
  for (let i = 0; i < 16; i++) made(tp(i / 16), tr(i / 16), tp((i + 1) / 16), tr((i + 1) / 16), 28);
  const top = tp(1);
  // (the head's foot: the frond bases wrapped in brown fibre, a short thick piece over the top of the trunk)
  made([top[0], top[1] - 0.25, top[2]], 0.17, [top[0], top[1] + 0.2, top[2]], 0.26, 9); made([top[0], top[1] + 0.2, top[2]], 0.26, [top[0], top[1] + 0.55, top[2]], 0.12, 9);
  // Coconuts: two or three bunches hanging close under the crown, each on a short stalk out of the top of the trunk, five to eight nuts to a
  // bunch. A nut is 30 cm long, egg-shaped, blunt at the stalk end and a little pointed below: three lengths of tube, swelling and closing.
  // Each bunch is of one age - young green, or ripening to yellow and orange (the seed, carried in the fraction of the material's number).
  for (let bn = 0, nb = 2 + (R() < 0.6 ? 1 : 0); bn < nb; bn++) {
    const a = bn * TAU / nb + R() * 0.8, age = R(), M = 11 + min(age, 0.99) * 0.9, bx = top[0] + cos(a) * 0.55, bz = top[2] + sin(a) * 0.55, by = top[1] - 0.6, SW = -2 - top[1];      // (SW: a made thing that still rides the tree's sway - see plant() in chunks.js and branchV)
    segs.push(top[0], top[1] - 0.05, top[2], 0.035, bx, by, bz, 0.03, SW, 2);
    for (let k = 0, nk = 5 + floor(R() * 4); k < nk; k++) { const an = a + (R() - 0.5) * 2.6, rr = 0.12 + R() * 0.22, x = bx + cos(an) * rr, z = bz + sin(an) * rr, y = by - 0.02 - R() * 0.35, s = 1.1 + R() * 0.35, lx = cos(an) * 0.05, lz = sin(an) * 0.05;
      const q = (t) => [x + lx * t, y - 0.3 * s * t, z + lz * t], p0 = q(0), p1 = q(0.3), p2 = q(0.72), p3 = q(1);
      segs.push(p0[0], p0[1], p0[2], 0.06 * s, p1[0], p1[1], p1[2], 0.118 * s, SW, M, p1[0], p1[1], p1[2], 0.118 * s, p2[0], p2[1], p2[2], 0.108 * s, SW, M, p2[0], p2[1], p2[2], 0.108 * s, p3[0], p3[1], p3[2], 0.03 * s, SW, M); } }
  const NF = 28, ND = 3, hub = [top[0], top[1] + 0.3, top[2]];
  for (let k = 0; k < NF + ND; k++) {
    // (age: 0 the newest, upright in the middle; 1 the oldest, hanging below the level. A dead one hangs down the trunk.)
    const dead = k >= NF, age = dead ? 1 : k / (NF - 1), a = k * 2.39996 + R() * 0.5, el = dead ? -0.95 - R() * 0.3 : 1.3 - 1.75 * age + (R() - 0.5) * 0.22;
    const L = (dead ? 3.6 : 4.7) + R() * 1.3 - (age < 0.12 ? 1.4 : 0), sag = dead ? 0.12 : 0.22 + 0.42 * age + R() * 0.12, dx = cos(a) * cos(el), dy = sin(el), dz = cos(el) * sin(a);
    const rib = (t) => [hub[0] + dx * L * t, hub[1] + dy * L * t - t * t * L * sag, hub[2] + dz * L * t];
    for (let i = 0; i < 7; i++) made(rib(i / 7), i === 0 ? 0.075 : 0.05 - 0.0055 * i, rib((i + 1) / 7), 0.044 - 0.0055 * i, dead ? 9 : 2, ribs);
    const NP = 30;
    for (let j = 0; j < NP; j++) for (const sd of [1, -1]) {
      const t = 0.2 + 0.8 * (j + 0.5 + (R() - 0.5) * 0.3) / NP, p = rib(t), q = rib(min(t + 0.04, 1)), sl = atan2(q[1] - p[1], Math.hypot(q[0] - p[0], q[2] - p[2]) || 1e-3);
      const ll = L * (0.07 + 0.155 * sin(PI * Math.pow((t - 0.2) / 0.8, 0.62))) * (0.9 + R() * 0.2);
      // (a leaflet leaves the rib swept toward its tip - more so further out - and a little above the rib's own slope on a young frond, below it
      // on an old one, and droops toward its end)
      leaves.push(p[0], p[1], p[2], ll, a + sd * (1.15 - 0.5 * t) + (R() - 0.5) * 0.12, dead ? -1.1 - R() * 0.3 : sl * 0.6 + 0.28 - 0.75 * age - R() * 0.22, 0.042, dead ? 0.3 : 0.5 + 0.9 * age + R() * 0.5, dead ? 7 : 1, R(), 0.6 + 0.4 * t, p[1]);
    }
  }
  shuffleLeaves(leaves, R);
  const all = segs.concat(ribs);
  return { segs: new Float32Array(all), nSeg: all.length / 10, nSegFar: all.length / 10, leaves: new Float32Array(leaves), nLeaf: leaves.length / 12 };
}
// oil palm (ปาล์มน้ำมัน), as a plantation grows it: a short stout trunk, knobbly all the way up with the butts of the fronds that were cut from it;
// a great head of some two dozen long feathered fronds - the young ones standing up, the rest arching out and down under their own weight, the
// oldest hanging dry; and tucked in among the frond butts at the top of the trunk the fruit: heavy dark bunches, two to four of them.
function makeOilPalm(seed) {
  const R = rng(seed), segs = [], spikes = [], leaves = [], Hh = 5.2 + R() * 2.6, lean = (R() - 0.5) * 0.05, la = R() * TAU;
  const tp = (t) => [cos(la) * lean * Hh * t, t * Hh - 0.3, sin(la) * lean * Hh * t];
  for (let i = 0; i < 12; i++) { const a = tp(i / 12), b = tp((i + 1) / 12), kn = i % 2 ? 0.035 : 0; segs.push(a[0], a[1], a[2], 0.36 + kn + (i === 0 ? 0.08 : 0), b[0], b[1], b[2], 0.36 + (kn ? 0 : 0.035), max(a[1], 0), b[1]); }
  const top = tp(1);
  for (let k = 0; k < 16; k++) { const a = k * 2.39996, y = top[1] - 0.15 - k * 0.14, c = tp((y + 0.3) / Hh), dx = cos(a), dz = sin(a);      // the cut frond butts just under the head: short stubs standing out and up
    segs.push(c[0] + dx * 0.3, y, c[2] + dz * 0.3, 0.085, c[0] + dx * 0.55, y + 0.22, c[2] + dz * 0.55, 0.06, max(y, 0), max(y + 0.22, 0)); }
  for (let bn = 0, nb = 2 + floor(R() * 2.99); bn < nb; bn++) {      // the fruit bunches: an egg of close-packed fruit half a metre long, purple-black, sitting on the frond butts
    const a = bn * TAU / nb + R() * 0.9, bx = top[0] + cos(a) * 0.52, bz = top[2] + sin(a) * 0.52, by = top[1] - 0.25 - R() * 0.25, SW = -2 - top[1], s = 0.85 + R() * 0.35, ox = cos(a) * 0.1, oz = sin(a) * 0.1;
    const q = (t) => [bx + ox * t, by - 0.5 * s * t, bz + oz * t], p0 = q(0), p1 = q(0.3), p2 = q(0.7), p3 = q(1);
    for (let k = 0; k < 10; k++) { const t = 0.15 + 0.75 * R(), c0 = q(t), an = R() * TAU, rr = 0.19 * s * sin(PI * (0.12 + 0.8 * t)), ux = cos(an), uz = sin(an), uy = (R() - 0.5) * 0.8; spikes.push(c0[0] + ux * rr, c0[1] + uy * rr * 0.4, c0[2] + uz * rr, 0.016, c0[0] + ux * (rr + 0.11), c0[1] + uy * (rr + 0.11) * 0.4 - 0.02, c0[2] + uz * (rr + 0.11), 0.004, SW, 13); }      // its spines: the bunch bristles
    segs.push(p0[0], p0[1], p0[2], 0.1 * s, p1[0], p1[1], p1[2], 0.2 * s, SW, 13, p1[0], p1[1], p1[2], 0.2 * s, p2[0], p2[1], p2[2], 0.19 * s, SW, 13, p2[0], p2[1], p2[2], 0.19 * s, p3[0], p3[1], p3[2], 0.06 * s, SW, 13); }
  const nTrunk = segs.length / 10, NF = 24;
  for (let k = 0; k < NF; k++) {
    const dead = k >= NF - 3, f = k / (NF - 1), a = k * 2.39996 + R() * 0.3, el = dead ? -0.75 - R() * 0.2 : 1.15 - f * 1.35 + (R() - 0.5) * 0.2, L = 4.6 + R() * 1.2, dx = cos(a) * cos(el), dy = sin(el), dz = cos(el) * sin(a), sag = dead ? 0.1 : 0.28 + f * 0.3;
    const rib = (t) => [top[0] + dx * L * t, top[1] + 0.15 + dy * L * t - t * t * L * sag, top[2] + dz * L * t];
    for (let i = 0; i < 5; i++) { const p = rib(i / 5), q = rib((i + 1) / 5); segs.push(p[0], p[1], p[2], 0.06 - 0.009 * i, q[0], q[1], q[2], 0.051 - 0.009 * i, p[1], q[1]); }
    for (let j = 0; j < 20; j++) for (const s of [1, -1]) {      // (the leaflets stand out in two ranks, one lifted and one flat: the frond looks feathery, not combed)
      const t = 0.16 + 0.84 * (j + 0.5) / 20, p = rib(t), ll = L * (0.09 + 0.15 * sin(PI * Math.pow(t, 0.75)));
      leaves.push(p[0], p[1], p[2], ll, a + s * (1.3 - t * 0.3), (j & 1 ? 0.15 : -0.3) - R() * 0.25, 0.05, 0.9 + R() * 0.7, dead ? 7 : 1, R(), 0.55 + 0.45 * t, p[1]);
    }
  }
  // Ferns: an oil palm's trunk is a garden of them - they root in the mould that gathers behind the old frond butts. A dozen or so small bright
  // fronds arching out of the upper trunk. (Leaflet-shaped leaves, short and broad, drooping at the tip.)
  for (let k = 0; k < 18; k++) { const hh = (0.3 + 0.65 * R()) * (Hh - 0.3), c0 = tp((hh + 0.3) / Hh), an = R() * TAU, L = 0.7 + R() * 0.55;
    leaves.push(c0[0] + cos(an) * 0.33, hh, c0[2] + sin(an) * 0.33, L, an, 0.3 + R() * 0.5, 0.13, 1.6 + R() * 0.8, 1, R() * 0.5, 1, hh); }      // (kind 1, as the palm's own leaflets are: the kinds drawn as grass blades take their height another way and would be blown off the trunk)
  shuffleLeaves(leaves, R);
  // The trunk is clad all the way down in the butts of old fronds, set round it in spirals: each a short thick stub standing out and up. (With
  // the spines, among the pieces drawn only from near to; from far off the trunk's paint - fsBranch - carries the pattern.)
  for (let k = 0, y = 0.25; y < top[1] - 2.3; k++, y += 0.105) { const a = k * 2.39996, c = tp((y + 0.3) / Hh), dx = cos(a), dz = sin(a), o = 0.3 + (y < 0.6 ? 0.07 : 0);
    spikes.push(c[0] + dx * o, y, c[2] + dz * o, 0.1, c[0] + dx * (o + 0.2), y + 0.2, c[2] + dz * (o + 0.2), 0.06, max(y, 0), y + 0.2); }
  for (const v of spikes) segs.push(v);      // (last: drawn only from near to)
  return { segs: new Float32Array(segs), nSeg: segs.length / 10, nSegFar: nTrunk + NF * 5, leaves: new Float32Array(leaves), nLeaf: leaves.length / 12 };
}
// Sugar palm (ต้นตาล, Borassus): a tall, dead straight, stout trunk - near black, rough, ringed, a little thicker toward the top than half way
// up - and on it a dense round head of some thirty great stiff fans, each a pleated grey-green disc two and a half to three metres across, cut
// into points round its rim, on a stout stalk of a metre and more; the young ones upright in the middle, the old ones standing out level and
// below. Under the head hang the dead fans, brown, in a skirt against the trunk, and the stubs of cut stalks stand out of its top; and among
// the stalks the bunches of fruit, round and purple-black, each the size of a small coconut.
// (A fan is one card, cut to shape by the fragment stage - kind 20; the trunk a made piece of its own bark, material 29. It was a thin smooth
// pole with twenty-six sprays of fourteen narrow leaflets - a bottle brush, not a tal.)
function makeSugarPalm(seed) {
  const R = rng(seed), segs = [], leaves = [], Hh = 11 + R() * 5, lx = (R() - 0.5) * 0.5, lz = (R() - 0.5) * 0.5;
  const made = (a, ra, b, rb, mat) => segs.push(a[0], a[1], a[2], ra, b[0], b[1], b[2], rb, -2 - max(a[1], 0), mat);
  const tp = (t) => [lx * t * t, t * Hh - 0.3, lz * t * t], tr = (t) => 0.25 + 0.035 * sin(PI * clamp((t - 0.35) / 0.65, 0, 1)) + 0.2 * Math.exp(-t * Hh / 0.6);
  for (let i = 0; i < 14; i++) made(tp(i / 14), tr(i / 14), tp((i + 1) / 14), tr((i + 1) / 14), 29);
  const top = tp(1), hubC = [top[0], top[1] + 0.25, top[2]];
  made([top[0], top[1] - 0.1, top[2]], 0.27, [top[0], top[1] + 0.45, top[2]], 0.2, 9);
  // (the stubs of old stalks, cut or broken off, round the trunk's last metre and a half)
  for (let k = 0; k < 14; k++) { const a = k * 2.39996 + R(), y = top[1] - 0.1 - R() * 1.5, r0 = tr(1) - 0.03, l = 0.25 + R() * 0.3; made([top[0] + cos(a) * r0, y, top[2] + sin(a) * r0], 0.05, [top[0] + cos(a) * (r0 + l * 0.75), y + l * 0.65, top[2] + sin(a) * (r0 + l * 0.75)], 0.03, 9); }
  // (fruit: two or three bunches hung out between the lower stalks)
  for (let bn = 0, nb = 2 + (R() < 0.5 ? 1 : 0); bn < nb; bn++) { const a = bn * TAU / nb + R(), bx = top[0] + cos(a) * 0.6, bz = top[2] + sin(a) * 0.6, by = top[1] - 0.35, SW = -2 - top[1];
    segs.push(top[0], top[1] + 0.1, top[2], 0.04, bx, by, bz, 0.03, SW, 9);
    for (let k = 0, nk = 5 + floor(R() * 4); k < nk; k++) { const an = R() * TAU, rr = 0.08 + R() * 0.2, x = bx + cos(an) * rr, z = bz + sin(an) * rr, y = by - R() * 0.4, r = 0.085 + R() * 0.025;
      segs.push(x, y + r, z, r * 0.45, x, y, z, r, SW, 5, x, y, z, r, x, y - r, z, r * 0.45, SW, 5); } }
  const NF = 32, ND = 9;
  for (let k = 0; k < NF + ND; k++) {
    const dead = k >= NF, age = dead ? 1 : k / (NF - 1), az = k * 2.39996 + R() * 0.5, el = dead ? -1.15 - R() * 0.25 : 1.35 - 1.95 * age + (R() - 0.5) * 0.25;
    const st = dead ? 0.7 + R() * 0.4 : 1.0 + R() * 0.45, dx = cos(az) * cos(el), dy = sin(el), dz = sin(az) * cos(el);
    const hub = [hubC[0] + dx * st, hubC[1] + dy * st, hubC[2] + dz * st], L = (dead ? 1.9 : 2.2) + R() * 0.5;
    made(hubC, 0.055, hub, 0.035, dead ? 9 : 2);
    // (the card: from the stalk's end on along it, the fan's middle 0.38 of its length out and the fan 0.62 of it in radius - see fsLeaf)
    leaves.push(hub[0] - dx * L * 0.3, hub[1] - dy * L * 0.3, hub[2] - dz * L * 0.3, L, az, el, L * 0.65, dead ? 0.05 : 0.08 + 0.25 * age, 20, dead ? 0.93 + R() * 0.06 : R() * 0.85, 0.55 + 0.45 * (1 - age), hub[1]);
  }
  shuffleLeaves(leaves, R);
  return { segs: new Float32Array(segs), nSeg: segs.length / 10, nSegFar: segs.length / 10, leaves: new Float32Array(leaves), nLeaf: leaves.length / 12 };
}
// banana clump (กอกล้วย): four or five thick stems of different heights leaning apart, brown and stringy at the foot and green above.
// Each stem carries a head of big paddle leaves on long stalks - the young ones standing up in the middle, the old ones arching over
// and hanging, torn along the veins. The tallest stem carries the bunch (เครือ): a thick stalk bends over out of the crown and hangs
// straight down, with hands of fruit in tiers round it, a bare length below them, and the purple bud (ปลี) at the end.
function makeBanana(seed) {
  const R = rng(seed), segs = [], fine = [], leaves = [], tube = (a, ra, b, rb, mat, o = segs) => o.push(a[0], a[1], a[2], ra, b[0], b[1], b[2], rb, -2 - max(0, a[1]), mat);      // (-2 - height: a made piece that goes with the plant's sway, as its leaves do - stems, bunch and bud; at -1 they stood still while the leaves moved)
  const HS = [3.4, 2.7, 3.0, 2.1, 1.0];
  for (let s = 0; s < 5; s++) {
    const a0 = s * 2.4 + R() * 0.7, rr = s ? 0.42 + R() * 0.25 : 0.08, bx = cos(a0) * rr, bz = sin(a0) * rr, Hs = HS[s] * (0.92 + R() * 0.16), k = Hs / 3.4, lean = s ? 0.3 + R() * 0.35 : 0.12;
    const sp = (t) => [bx + cos(a0) * lean * k * t * t, -0.2 + (Hs + 0.2) * t, bz + sin(a0) * lean * k * t * t];
    // (a stem is the rolled bases of its leaves: stout - 34 cm through at the foot of a full-grown one, 20 where the leaves part - and smooth
    // in its taper, eight lengths of it; it was 26 cm tapering to 19 in six)
    const rad = (t) => (0.1 + 0.07 * Math.pow(1 - t, 1.3)) * (0.5 + 0.5 * k) + 0.05 * Math.exp(-t * 9);
    for (let i = 0; i < 8; i++) tube(sp(i / 8), rad(i / 8), sp((i + 1) / 8), rad((i + 1) / 8), i < 3 ? 9 : 10);
    const top = sp(1), nl = s === 4 ? 5 : 9 + floor(R() * 3);
    for (let j = 0; j < nl; j++) {
      // (a blade two to two and a half metres long and a quarter as wide, on a stalk of half a metre and more that arches out of the stem's top
      // in two lengths; the old leaves bow right over)
      const az = j * 2.39996 + R() * 0.5 + s, age = j / (nl - 1), el = 1.32 - age * 1.45 + (R() - 0.5) * 0.2, L = (2.1 + R() * 0.6) * (0.45 + 0.55 * k) * (0.8 + 0.2 * sin(PI * age) + 0.1), droop = 0.5 + age * 1.1 + R() * 0.2;
      const pel = el * 0.55 + 0.7, pl = (0.5 + R() * 0.35) * (0.5 + 0.5 * k);                                  // the leaf stalk leaves the stem more steeply than the blade it carries
      const pm = [top[0] + cos(az) * cos(pel + 0.3) * pl * 0.5, top[1] + sin(pel + 0.3) * pl * 0.5, top[2] + sin(az) * cos(pel + 0.3) * pl * 0.5];
      const pe = [pm[0] + cos(az) * cos(pel - 0.25) * pl * 0.55, pm[1] + sin(pel - 0.25) * pl * 0.55, pm[2] + sin(az) * cos(pel - 0.25) * pl * 0.55];
      tube([top[0], top[1] - 0.35 * k, top[2]], 0.065 * (0.5 + 0.5 * k), pm, 0.04, 10); tube(pm, 0.04, pe, 0.026, 10);
      leaves.push(pe[0], pe[1], pe[2], L, az, el, L * 0.125, droop, 5, clamp(age * 0.9 + (R() - 0.5) * 0.15, 0, 0.99), 0.85 + R() * 0.15, pe[1]);
    }
    if (s < 4) for (let j = 0; j < 5; j++) { const az = R() * TAU, p = sp(0.8 + R() * 0.16), rs = rad(0.85) + 0.02; leaves.push(p[0] + cos(az) * rs, p[1], p[2] + sin(az) * rs, (1.1 + R() * 0.7) * k, az, -1.38 + R() * 0.12, 0.17, 0.12, 7, R(), 0.6, p[1]); }    // dead leaves hang down against the stem
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
