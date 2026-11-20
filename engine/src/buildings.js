// --------------------------------------------------------------------------------------------------------- buildings
// Houses are assembled from boxes and gable prisms: [x y z, sx sy sz, tilt, material, shape (1 = gable)].
// materials: 0 upright boards, 1 corrugated sheet, 2 concrete, 3 dark opening, 4 dark timber, 9 roof tiles, 16 weatherboard, 17 glass, 18 painted render, 19 white trim
const mkB = () => { const B = []; B.box = (x, y, z, sx, sy, sz, mat, tilt = 0, shape = 0) => { B.push([x, y, z, sx, sy, sz, tilt, mat, shape]); return B; }; return B; };
// a window with frame, glass, glazing bars and a sill, on the front/back (f, b) or side (l, r) wall at distance `off` from the centre plane
function addWindow(B, face, u, y, w, h, off, trim, shutter = -1) {
  const sg = face === 'f' || face === 'r' ? 1 : -1, side = face === 'l' || face === 'r';
  const put = (du, dy, dn, sw, sh, sd2, mat) => { if (side) B.box(sg * (off + dn), y + dy, u + du, sd2, sh, sw, mat); else B.box(u + du, y + dy, sg * (off + dn), sw, sh, sd2, mat); };
  put(0, 0, 0.02, w + 0.16, h + 0.16, 0.09, trim); put(0, 0, 0.085, w, h, 0.02, 17);          // (each layer stands 3 cm proud of the one behind: closer, and they fight for the same pixels from far off)
  put(0, 0, 0.115, 0.045, h, 0.02, trim); put(0, 0, 0.115, w, 0.045, 0.02, trim); put(0, -h / 2 - 0.1, 0.06, w + 0.3, 0.06, 0.16, trim);
  if (shutter >= 0) for (const s2 of [-1, 1]) put(s2 * (w * 0.75 + 0.1), 0, 0.03, w / 2, h, 0.035, shutter);
}
function addDoor(B, face, u, y0, w, h, off, trim, leaf) {
  const sg = face === 'f' ? 1 : -1;
  B.box(u, y0 + h / 2, sg * (off + 0.02), w + 0.18, h + 0.1, 0.09, trim); B.box(u, y0 + h / 2 - 0.02, sg * (off + 0.085), w, h - 0.04, 0.03, leaf); B.box(u + w * 0.36, y0 + h * 0.48, sg * (off + 0.115), 0.05, 0.12, 0.03, 19);
}
// a gable roof over a W x D plan whose walls end at height top: gable ends, two overhanging slopes, ridge cap, fascia boards
function addGableRoof(B, W, D, top, rise, over, wallMat, roofMat) {
  const pit = Math.atan2(rise, D / 2), half = D / 2 + over, run = half / cos(pit);
  B.box(0, top + rise / 2, 0, W, rise, D, wallMat, 0, 1);
  const cy = top + rise - Math.tan(pit) * half / 2 + 0.07;
  B.box(0, cy, -half / 2, W + over * 2, 0.06, run, roofMat, -pit); B.box(0, cy, half / 2, W + over * 2, 0.06, run, roofMat, pit);
  B.box(0, top + rise + 0.1, 0, W + over * 2, 0.07, 0.3, roofMat);
  for (const s2 of [-1, 1]) B.box(0, top - Math.tan(pit) * over + 0.02, s2 * (half - 0.02), W + over * 2, 0.16, 0.035, 4);
}
// 1. the old wooden house on stilts: weatherboard walls, shuttered windows, a covered veranda with balusters, a stair with handrails
const HOUSE = (() => {
  const B = mkB(), W = 6.4, D = 4.4, FL = 2.0, WH = 2.4, top = FL + WH;
  for (const x of [-2.9, -0.97, 0.97, 2.9]) for (const z of [-2.0, 0, 2.0, 3.9]) { B.box(x, FL / 2, z, 0.18, FL, 0.18, 4); B.box(x, 0.1, z, 0.34, 0.3, 0.34, 2); }
  for (const z of [-2.0, 0, 2.0, 3.9]) B.box(0, FL - 0.2, z, W + 0.3, 0.18, 0.12, 4);                      // beams under the floor
  for (const x of [-2.9, 2.9]) B.box(x, FL - 0.75, -1.0, 0.07, 0.1, 2.4, 4, 0.5);                           // braces
  B.box(0, FL, 0.95, W + 0.4, 0.1, D + 2.3, 0); B.box(0, FL + WH / 2, 0, W, WH, D, 16);
  addGableRoof(B, W, D, top, 1.35, 0.6, 16, 1);
  addDoor(B, 'f', 0.8, FL + 0.05, 0.9, 1.95, D / 2, 4, 16);
  addWindow(B, 'f', -1.7, FL + 1.35, 0.95, 1.0, D / 2, 4, 16); addWindow(B, 'b', -1.6, FL + 1.35, 0.95, 1.0, D / 2, 4, 16); addWindow(B, 'b', 1.6, FL + 1.35, 0.95, 1.0, D / 2, 4, 16);
  addWindow(B, 'l', 0, FL + 1.35, 0.95, 1.0, W / 2, 4, 16); addWindow(B, 'r', -0.4, FL + 1.35, 0.95, 1.0, W / 2, 4, 16);
  // veranda: lean-to roof on posts, rail with balusters, stair at the right-hand end
  const vz = D / 2 + 1.75;
  B.box(0, top - 0.42, D / 2 + 1.0, W + 1.2, 0.05, 2.35, 1, 0.2);
  for (const x of [-3.05, -1.0, 1.0, 3.05]) B.box(x, FL + 1.0, vz, 0.11, 2.0, 0.11, 4);
  B.box(-0.55, FL + 0.9, vz, 5.0, 0.07, 0.09, 4); B.box(-0.55, FL + 0.18, vz, 5.0, 0.05, 0.06, 4);
  for (let x = -2.95; x < 1.95; x += 0.3) B.box(x, FL + 0.54, vz, 0.035, 0.7, 0.035, 4);
  for (const x of [-3.15, 3.15]) { B.box(x, FL + 0.9, D / 2 + 0.9, 0.09, 0.07, 1.7, 4); for (let z = D / 2 + 0.2; z < vz; z += 0.3) B.box(x, FL + 0.54, z, 0.035, 0.7, 0.035, 4); }
  const sx = 2.55, n = 8, sr = 0.25, sgo = 0.3;
  for (let k = 0; k < n; k++) B.box(sx, FL - 0.12 - k * sr, vz + 0.3 + k * sgo, 1.0, 0.05, 0.28, 0);
  for (const dx of [-0.52, 0.52]) { B.box(sx + dx, FL / 2 - 0.02, vz + 0.15 + n * sgo / 2, 0.06, 0.2, hypot(n * sgo, FL) + 0.2, 4, Math.atan2(FL, n * sgo)); B.box(sx + dx, FL / 2 + 0.85, vz + 0.15 + n * sgo / 2, 0.05, 0.06, hypot(n * sgo, FL) + 0.1, 4, Math.atan2(FL, n * sgo)); }
  // a lean-to kitchen at the back on the ground, and the water jars
  B.box(-1.4, 1.1, -3.6, 3.4, 2.2, 2.4, 0); B.box(-1.4, 2.35, -3.75, 3.9, 0.05, 3.0, 1, -0.16);
  B.box(1.9, 0.45, 3.3, 0.7, 0.9, 0.7, 2);
  return B;
})();
// 2. the house most families build now: one storey of painted block on a plinth, tiled gable roof, a porch on square columns, a carport
const HOUSE3 = (() => {
  const B = mkB(), W = 9, D = 6.6, P = 0.35, WH = 2.9, top = P + WH;
  B.box(0, P / 2, 0.9, W + 0.5, P, D + 2.4, 2); B.box(0, P + WH / 2, 0, W, WH, D, 18);
  addGableRoof(B, W, D, top, 1.55, 0.75, 18, 9);
  B.box(0, top - 0.25, D / 2 + 1.15, 5.2, 0.07, 2.5, 9, 0.22);                                             // porch roof
  for (const x of [-2.4, 2.4]) { B.box(x, P + 1.3, D / 2 + 2.0, 0.26, 2.6, 0.26, 19); B.box(x, P + 0.1, D / 2 + 2.0, 0.4, 0.2, 0.4, 2); }
  for (let k = 0; k < 2; k++) B.box(0, P - 0.1 - k * 0.17, D / 2 + 2.25 + k * 0.3, 2.2, 0.17, 0.3, 2);          // steps
  addDoor(B, 'f', 0, P, 1.0, 2.1, D / 2, 19, 4);
  addWindow(B, 'f', -2.9, P + 1.55, 1.5, 1.2, D / 2, 19); addWindow(B, 'f', 2.9, P + 1.55, 1.5, 1.2, D / 2, 19);
  addWindow(B, 'b', -2.6, P + 1.55, 1.2, 1.1, D / 2, 19); addWindow(B, 'b', 2.2, P + 1.75, 0.7, 0.6, D / 2, 19);
  addWindow(B, 'l', -0.6, P + 1.55, 1.4, 1.2, W / 2, 19); addWindow(B, 'r', 0.9, P + 1.55, 1.4, 1.2, W / 2, 19);
  B.box(W / 2 + 0.25, P + 2.0, -1.6, 0.3, 0.55, 0.85, 19);                                                // air conditioner
  // carport beside the house: sheet roof on steel posts
  B.box(-W / 2 - 1.9, 2.75, 0.6, 3.6, 0.05, 5.4, 1, 0.07);
  for (const z of [-1.9, 3.1]) B.box(-W / 2 - 3.5, 1.35, z, 0.09, 2.7, 0.09, 4);
  B.box(-W / 2 - 1.9, 0.04, 0.6, 3.6, 0.08, 5.4, 2);
  // water tank on a stand at the back
  for (const [x, z] of [[2.6, -4.4], [3.6, -4.4], [2.6, -5.4], [3.6, -5.4]]) B.box(x, 1.3, z, 0.09, 2.6, 0.09, 4);
  B.box(3.1, 2.65, -4.9, 1.3, 0.08, 1.3, 2); B.box(3.1, 3.4, -4.9, 1.0, 1.4, 1.0, 19);
  return B;
})();

// 3. a two-storey town house: painted render, tiled gable roof, balcony over the porch, a walled front yard with gate posts
const HOUSE2 = (() => {
  const B = mkB(), W = 7, D = 8, H2 = 6.1;
  B.box(0, H2 / 2, 0, W, H2, D, 18); addGableRoof(B, D, W, H2, 1.5, 0.6, 18, 9);
  return B;
})();
{ // the gable roof helper runs its ridge along x; this house is deeper than wide, so turn the roof pieces a quarter turn by hand
  const B = HOUSE2, W = 7, D = 8, H2 = 6.1; B.length = 1;
  const pit = Math.atan2(1.5, D / 2), half = D / 2 + 0.6, run = half / cos(pit), cy = H2 + 1.5 - Math.tan(pit) * half / 2 + 0.07;
  B.box(0, H2 + 0.75, 0, W, 1.5, D, 18, 0, 1); B.box(0, cy, -half / 2, W + 1.2, 0.06, run, 9, -pit); B.box(0, cy, half / 2, W + 1.2, 0.06, run, 9, pit); B.box(0, H2 + 1.6, 0, W + 1.2, 0.07, 0.3, 9);
  B.box(0, 3.0, D / 2 + 0.9, W, 0.14, 1.8, 2); for (const x of [-3.2, 3.2]) B.box(x, 1.5, D / 2 + 1.65, 0.24, 3.0, 0.24, 19);     // balcony slab on columns
  B.box(0, 3.55, D / 2 + 1.75, W, 0.07, 0.08, 19); for (let x = -3.3; x <= 3.31; x += 0.33) B.box(x, 3.3, D / 2 + 1.75, 0.04, 0.5, 0.04, 19);
  addDoor(B, 'f', -1.6, 0, 1.0, 2.1, D / 2, 19, 4); addWindow(B, 'f', 1.5, 1.5, 1.8, 1.2, D / 2, 19);
  addDoor(B, 'f', 1.4, 3.07, 0.9, 2.0, D / 2, 19, 4); addWindow(B, 'f', -1.5, 4.5, 1.6, 1.2, D / 2, 19);
  for (const y of [1.5, 4.5]) { addWindow(B, 'l', -1.5, y, 1.3, 1.1, W / 2, 19); addWindow(B, 'l', 1.8, y, 1.3, 1.1, W / 2, 19); addWindow(B, 'r', 0, y, 1.3, 1.1, W / 2, 19); addWindow(B, 'b', 0, y, 1.5, 1.1, D / 2, 19); }
  B.box(-2.75, 0.65, 8, 3.5, 1.3, 0.16, 18).box(2.75, 0.65, 8, 3.5, 1.3, 0.16, 18).box(-4.6, 0.65, 2, 0.16, 1.3, 12, 18).box(4.6, 0.65, 2, 0.16, 1.3, 12, 18).box(-0.95, 0.85, 8, 0.3, 1.7, 0.3, 19).box(0.95, 0.85, 8, 0.3, 1.7, 0.3, 19);
}
// a shrub: a low dome of small leaves; some bloom (bougainvillea)
function makeBush(seed, flower) {
  // A shrub: a rounded, lumpy mound of foliage that comes right down to the ground, thick at the skin and darker inside.
  // The stems are thin, bend outward and fork, and end inside the leaves, so that what shows is the mound and not the sticks.
  const R = rng(seed), segs = [], leaves = [], p1 = R() * TAU, p2 = R() * TAU, RX = 0.9, RY = 1.15;
  const rim = (az, el) => 1 + 0.16 * sin(az * 3 + p1) * cos(el) + 0.10 * sin(az * 5 + p2 + el * 3);       // how far out the mound reaches that way
  const at = (az, el, f) => { const r = rim(az, el) * f; return [cos(az) * cos(el) * RX * r, 0.12 + sin(el) * RY * r, sin(az) * cos(el) * RX * r]; };
  const limb = (a, b, r0, r1, n) => { const mid = [(a[0] + b[0]) / 2 + (R() - 0.5) * 0.12, (a[1] + b[1]) / 2 + 0.06, (a[2] + b[2]) / 2 + (R() - 0.5) * 0.12]; let q = a;
    for (let i = 1; i <= n; i++) { const t = i / n, w = [0, 1, 2].map((k) => (1 - t) * (1 - t) * a[k] + 2 * t * (1 - t) * mid[k] + t * t * b[k]); segs.push(q[0], q[1], q[2], r0 + (r1 - r0) * (i - 1) / n, w[0], w[1], w[2], r0 + (r1 - r0) * t, max(q[1], 0), w[1]); q = w; } };
  for (let k = 0; k < 7; k++) {
    const az = k * 2.39996 + R() * 0.5, el = 0.35 + R() * 0.95, foot = [cos(az) * 0.05, -0.1, sin(az) * 0.05], fork = at(az, el, 0.42);
    limb(foot, fork, 0.02, 0.012, 3);
    for (let j = 0; j < 3; j++) limb(fork, at(az + (R() - 0.5) * 1.3, clamp(el + (R() - 0.5) * 0.9, 0.05, 1.5), 0.72 + R() * 0.12), 0.011, 0.004, 2);
  }
  for (let i = 0; i < 540; i++) {
    const az = R() * TAU, el = Math.asin(-0.08 + 1.08 * R()), f = 0.5 + 0.5 * Math.pow(R(), 0.4), q = at(az, el, f); if (q[1] < 0.04) q[1] = 0.04 + R() * 0.08;
    const bloom = flower && f > 0.86 && R() < 0.3;
    leaves.push(q[0], q[1], q[2], 0.23 + R() * 0.14, az + (R() - 0.5) * 2.2, -0.35 + R() * 1.2 + sin(el) * 0.3, 0.1, 0.3 + R() * 0.8, bloom ? 6 : 0, R(), 0.42 + 0.58 * (f - 0.5) * 2, q[1]);
  }
  shuffleLeaves(leaves, R);
  return { segs: new Float32Array(segs), nSeg: segs.length / 10, nSegFar: 0, leaves: new Float32Array(leaves), nLeaf: leaves.length / 12 };
}
// Spirit houses, always as a pair on one concrete pad: ศาลพระภูมิ (taller, on a single post) and ศาลเจ้าที่ (lower and wider, on four legs).
// A: the traditional kind, little teak houses hung with marigold garlands, a red cloth round the post, an offering table in front.
const SHRINE_A = (() => {
  const B = mkB();
  B.box(0, 0.12, 0, 3.4, 0.24, 1.9, 2).box(0, 0.05, 1.1, 2.6, 0.1, 0.4, 2);
  const house = (x, base, w, d, h) => {                 // a miniature house: floor, walls with dark openings, gable roof, veranda rail, garlands
    B.box(x, base + 0.03, 0, w + 0.34, 0.06, d + 0.3, 4).box(x, base + 0.06 + h / 2, -0.03, w, h, d, 16);
    B.box(x, base + 0.06 + h * 0.5, d / 2 - 0.02, w * 0.3, h * 0.7, 0.02, 3).box(x - w * 0.33, base + 0.06 + h * 0.6, d / 2 - 0.02, w * 0.16, h * 0.35, 0.02, 3).box(x + w * 0.33, base + 0.06 + h * 0.6, d / 2 - 0.02, w * 0.16, h * 0.35, 0.02, 3);
    const top = base + 0.06 + h, rise = d * 0.42, pit = Math.atan2(rise, d / 2), half = d / 2 + 0.1, run = half / cos(pit), cy = top + rise - Math.tan(pit) * half / 2 + 0.02;
    B.box(x, top + rise / 2, -0.03, w, rise, d, 16, 0, 1).box(x, cy, -0.03 - half / 2, w + 0.2, 0.025, run, 4, -pit).box(x, cy, -0.03 + half / 2, w + 0.2, 0.025, run, 4, pit);
    for (const sx of [-1, 1]) B.box(x + sx * (w / 2 + 0.14), base + 0.16, 0, 0.02, 0.02, d + 0.26, 4);
    B.box(x, base + 0.16, d / 2 + 0.13, w + 0.3, 0.02, 0.02, 4);
    // marigold garlands along the eaves and hanging at the corners
    B.box(x, top + 0.0, half - 0.02, w + 0.26, 0.05, 0.05, 20).box(x, top + 0.0, -half - 0.03, w + 0.26, 0.05, 0.05, 20);
    for (const sx of [-1, 1]) { B.box(x + sx * (w / 2 + 0.12), top - 0.02, 0, 0.05, 0.05, d + 0.2, 20); B.box(x + sx * (w / 2 + 0.12), top - h * 0.45, half - 0.02, 0.05, h * 0.9, 0.05, 20); }
  };
  // ศาลพระภูมิ: one post
  B.box(-0.75, 1.05, 0, 0.17, 1.65, 0.17, 4).box(-0.75, 1.82, 0, 0.5, 0.1, 0.45, 4).box(-0.75, 1.22, 0, 0.2, 0.16, 0.2, 14);
  house(-0.75, 1.87, 0.5, 0.4, 0.34);
  // ศาลเจ้าที่: four legs, a small ladder up to it
  for (const [lx, lz] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]]) B.box(0.85 + lx, 0.74, lz, 0.07, 1.0, 0.07, 4);
  B.box(0.85, 0.75, 0, 0.9, 0.04, 0.04, 4).box(0.85, 0.75, -0.3, 0.86, 0.04, 0.04, 4).box(0.85, 1.0, 0.36, 0.3, 0.45, 0.03, 14);
  house(0.85, 1.24, 0.66, 0.46, 0.3);
  B.box(0.85, 0.75, 0.62, 0.22, 1.05, 0.03, 4, 0.3);
  // offering table in front of the tall one
  for (const [lx, lz] of [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]]) B.box(-0.75 + lx, 0.65, 0.62 + lz, 0.05, 0.82, 0.05, 4);
  B.box(-0.75, 1.07, 0.62, 0.74, 0.04, 0.46, 4);
  return B;
})();
// B: the cast-concrete kind seen at newer houses: white with gold ornament, a stepped pillar, a little temple with tiered roofs and a spire
const SHRINE_B = (() => {
  const B = mkB();
  B.box(0, 0.1, 0, 3.6, 0.2, 2.6, 2);
  const temple = (x, z, base, w, tiers, spire) => {
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(x + cx * w * 0.4, base + w * 0.35, z + cz * w * 0.4, w * 0.1, w * 0.7, w * 0.1, 19);
    B.box(x, base + w * 0.3, z - w * 0.1, w * 0.62, w * 0.6, w * 0.5, 19).box(x, base + w * 0.28, z + w * 0.16, w * 0.28, w * 0.46, 0.02, 3);
    let y = base + w * 0.7, ww = w * 1.15;
    for (let t = 0; t < tiers; t++) { B.box(x, y + 0.02, z, ww, 0.04, ww, 15); B.box(x, y + 0.04 + ww * 0.24, z, ww * 0.96, ww * 0.48, ww * 0.96, 19, 0, 1); B.box(x, y + 0.04 + ww * 0.24, z, ww * 0.3, ww * 0.5, ww * 1.0, 19, 0, 1); y += ww * 0.36; ww *= 0.66; }
    if (spire) for (let k = 0; k < 6; k++) B.box(x, y + 0.1 + k * 0.09, z, 0.16 - k * 0.024, 0.1, 0.16 - k * 0.024, k > 3 ? 15 : 19);
  };
  // ศาลพระภูมิ on its pillar
  B.box(-0.7, 0.3, -0.2, 0.74, 0.2, 0.74, 19).box(-0.7, 0.47, -0.2, 0.58, 0.14, 0.58, 19).box(-0.7, 0.56, -0.2, 0.6, 0.04, 0.6, 15);
  B.box(-0.7, 1.05, -0.2, 0.34, 1.0, 0.34, 19).box(-0.7, 0.85, -0.2, 0.36, 0.1, 0.36, 15).box(-0.7, 1.3, -0.2, 0.36, 0.06, 0.36, 15);
  B.box(-0.7, 1.6, -0.2, 0.46, 0.1, 0.46, 15).box(-0.7, 1.7, -0.2, 0.62, 0.1, 0.62, 19).box(-0.7, 1.79, -0.2, 1.2, 0.07, 1.2, 19);
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(-0.7 + cx * 0.54, 1.9, -0.2 + cz * 0.54, 0.1, 0.16, 0.1, 19);
  temple(-0.7, -0.2, 1.82, 0.52, 3, true);
  // ศาลเจ้าที่: lower, on a short pedestal
  B.box(0.95, 0.5, -0.3, 0.46, 0.6, 0.46, 19).box(0.95, 0.52, -0.3, 0.48, 0.07, 0.48, 15).box(0.95, 0.84, -0.3, 1.0, 0.07, 0.9, 19);
  temple(0.95, -0.3, 0.87, 0.5, 2, false);
  // two offering tables on pedestals
  for (const x of [-0.7, 0.95]) { B.box(x, 0.32, 0.85, 0.36, 0.24, 0.36, 19); B.box(x, 0.62, 0.85, 0.24, 0.5, 0.24, 19); B.box(x, 0.8, 0.85, 0.3, 0.07, 0.3, 15); B.box(x, 0.92, 0.85, 0.9, 0.06, 0.55, 19); }
  return B;
})();
for (const b of SHRINE_B) b[7] = b[8] === 1 ? 15 : b[7] === 19 ? 41 : b[7];      // newer spirit houses are white, their roofs gilt
// boats. Both lie along z, bow toward +z. The long-tail (เรือหางยาว): a narrow wooden hull, a tall prow hung with garlands and ribbons,
// a canopy on four posts, the engine at the stern with its long propeller shaft. The fishing boat: deep painted hull, wheelhouse, mast and booms.
const LONGTAIL = mkB().box(0, 0.28, 0, 1.25, 0.5, 6.4, 25).box(0, 0.3, 3.7, 0.85, 0.46, 1.2, 25).box(0, 0.32, -3.5, 0.95, 0.44, 0.8, 25).box(0, 0.56, 0, 1.33, 0.07, 6.5, 4)
  .box(0, 1.05, 4.9, 0.2, 0.2, 2.6, 4, -0.62).box(0, 1.62, 5.75, 0.27, 0.3, 0.3, 20).box(0, 1.38, 5.42, 0.25, 0.28, 0.25, 14)
  .box(-0.55, 1.15, 1.2, 0.05, 1.25, 0.05, 4).box(0.55, 1.15, 1.2, 0.05, 1.25, 0.05, 4).box(-0.55, 1.15, -1.6, 0.05, 1.25, 0.05, 4).box(0.55, 1.15, -1.6, 0.05, 1.25, 0.05, 4)
  .box(0, 1.8, -0.2, 1.5, 0.05, 3.4, 1).box(0, 0.5, 0.6, 1.1, 0.06, 0.3, 4).box(0, 0.5, -0.9, 1.1, 0.06, 0.3, 4).box(0, 0.85, -3.3, 0.38, 0.45, 0.6, 12).box(0, 0.75, -5.3, 0.05, 0.05, 3.8, 12, -0.16);
const FISHER = mkB().box(0, 0.7, 0, 3.4, 1.5, 10, 25).box(0, 0.95, 5.9, 2.4, 1.7, 2.2, 25, -0.22).box(0, 0.6, -5.4, 3.0, 1.3, 1.0, 25).box(0, 1.5, 0, 3.5, 0.1, 10.1, 19)
  .box(0, 2.45, -2.4, 2.5, 1.9, 3.4, 16).box(0, 2.7, -0.68, 1.9, 0.6, 0.05, 17).box(0, 3.45, -2.4, 2.9, 0.08, 3.9, 1).box(0, 4.6, 1.2, 0.12, 6.2, 0.12, 4)
  .box(-1.2, 3.9, 2.2, 0.06, 0.06, 5.2, 4, -0.55).box(1.2, 3.9, 2.2, 0.06, 0.06, 5.2, 4, -0.55).box(0, 1.8, 3.2, 1.6, 0.5, 1.6, 0);
// a beach umbrella with two sun loungers
const UMBRELLA = mkB().box(0, 1.05, 0, 0.05, 2.1, 0.05, 19).box(0, 2.1, 0, 2.4, 0.06, 2.4, 29).box(0, 2.18, 0, 1.3, 0.08, 1.3, 29)
  .box(0.95, 0.28, 0.2, 0.62, 0.07, 1.4, 19).box(0.95, 0.5, -0.75, 0.62, 0.06, 0.75, 19, -0.6).box(-0.95, 0.28, 0.2, 0.62, 0.07, 1.4, 19).box(-0.95, 0.5, -0.75, 0.62, 0.06, 0.75, 19, -0.6);
const SALA = [[-1.6, 1.2, -1, 0.12, 2.4, 0.12, 0, 4], [1.6, 1.2, -1, 0.12, 2.4, 0.12, 0, 4], [-1.6, 1.2, 1, 0.12, 2.4, 0.12, 0, 4], [1.6, 1.2, 1, 0.12, 2.4, 0.12, 0, 4],
  [0, 0.42, 0, 3.4, 0.08, 2.2, 0, 0], [0, 0.75, -0.95, 3.2, 0.5, 0.06, 0, 0], [0, 2.75, -0.68, 4.0, 0.06, 1.7, -0.5, 1], [0, 2.75, 0.68, 4.0, 0.06, 1.7, 0.5, 1]];
// a field hut (เถียงนา): a floor on four posts under a tin roof, where the farmer rests at midday
const FIELDHUT = [[-1.1, 1.15, -1, 0.1, 2.3, 0.1, 0, 4], [1.1, 1.15, -1, 0.1, 2.3, 0.1, 0, 4], [-1.1, 1.15, 1, 0.1, 2.3, 0.1, 0, 4], [1.1, 1.15, 1, 0.1, 2.3, 0.1, 0, 4],
  [0, 0.85, 0, 2.5, 0.07, 2.3, 0, 0], [0, 2.55, -0.62, 3.0, 0.05, 1.6, -0.5, 1], [0, 2.55, 0.62, 3.0, 0.05, 1.6, 0.5, 1]];
const TREES = [
  makeTree(11, { H: 8, r: 0.34, n: [9, 5, 3], ang: [1.1, 0.9, 0.85], crown: 0.32, len0: 0.5, lenR: 0.6, trop: 0.2, wob: 0.2, per: 4, leaf: 0.62, wide: 0.3 }),
  makeTree(23, { H: 10, r: 0.4, n: [10, 5, 3], ang: [1.15, 0.9, 0.85], crown: 0.38, len0: 0.46, lenR: 0.6, trop: 0.18, wob: 0.22, per: 4, leaf: 0.66, wide: 0.3 }),
  makeTree(37, { H: 6.5, r: 0.26, n: [8, 4, 3], ang: [1.2, 0.95, 0.85], crown: 0.28, len0: 0.6, lenR: 0.62, trop: 0.14, wob: 0.26, per: 4, leaf: 0.56, wide: 0.3 }),
  makePalm(71), makePalm(79), makeSugarPalm(91), makeSugarPalm(97), makeBanana(105), makeBush(121, false), makeBush(127, true),
  // a rain tree (จามจุรี): short thick trunk under a wide flat umbrella; and a tall forest tree with a clean bole and a high crown
  makeTree(53, { H: 8.5, r: 0.52, n: [11, 6, 3], ang: [1.38, 1.0, 0.9], crown: 0.34, len0: 0.9, lenR: 0.6, trop: 0.04, wob: 0.26, per: 4, leaf: 0.55, wide: 0.3 }),
  makeTree(67, { H: 17, r: 0.44, n: [10, 5, 3], ang: [1.05, 0.9, 0.85], crown: 0.62, len0: 0.3, lenR: 0.6, trop: 0.2, wob: 0.14, per: 4, leaf: 0.64, wide: 0.3 }),
];
TREES.push(makeCasuarina(141), makeCasuarina(149));      // 12, 13
// พญาเสือโคร่ง in flower (14, 15): a dark crooked trunk clear to well above a car's roof, then boughs that climb as they spread, making a full round head
// high over the verge (no limb hangs down across the road); hardly a leaf - the whole crown is pink
TREES.push(makeTree(163, { H: 8.5, r: 0.36, n: [9, 5, 3], ang: [0.92, 0.9, 0.85], crown: 0.44, len0: 0.5, lenR: 0.62, trop: 0.26, wob: 0.3, per: 4, leaf: 0.62, wide: 0.38, bloom: 0.93 }),
  makeTree(171, { H: 9.5, r: 0.42, n: [10, 5, 3], ang: [0.98, 0.9, 0.85], crown: 0.46, len0: 0.48, lenR: 0.62, trop: 0.24, wob: 0.28, per: 4, leaf: 0.64, wide: 0.38, bloom: 0.96 }));
// ยางพารา (16): a rubber tree as a plantation grows it - a straight slender trunk, clear for half its height, then a few steep boughs and a light crown
TREES.push(makeTree(181, { H: 15, r: 0.19, n: [6, 3, 2], ang: [0.7, 0.85, 0.85], crown: 0.52, len0: 0.36, lenR: 0.62, trop: 0.3, wob: 0.1, per: 4, leaf: 0.66, wide: 0.5, kind: 14 }));
TREES.push(makeOilPalm(193), makeOilPalm(199));      // 17, 18
// small slender trees (19, 20), for the hedgerows of the flower fields: a thin stem, a light round head not much above a man's height
TREES.push(makeTree(211, { H: 4.4, r: 0.085, n: [7, 4, 2], ang: [1.0, 0.9, 0.85], crown: 0.42, len0: 0.42, lenR: 0.6, trop: 0.22, wob: 0.2, per: 4, leaf: 0.5, wide: 0.42 }),
  makeTree(223, { H: 5.2, r: 0.1, n: [8, 4, 2], ang: [0.85, 0.9, 0.85], crown: 0.5, len0: 0.36, lenR: 0.6, trop: 0.3, wob: 0.16, per: 4, leaf: 0.48, wide: 0.4 }));
const DEMO = Number(new URLSearchParams(location.search).get('plant') ?? -1);
const BL = [0, 1, 2, 10, 11, 0, 1, 2];      // the broadleaf kinds, the rarer ones met less often

