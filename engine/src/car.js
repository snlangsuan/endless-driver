// --------------------------------------------------------------------------------------------------------- the car
// A compact crossover with no badge. Its lines were taken from a reference model the owner supplied (measured, not copied: the roof line, the
// width along its length, the waist and the glass were read off that model and set down here as curves): a long bonnet, a low roof that falls
// away in a fastback to a short tail, broad haunches over the wheels and a waist between them. 4.4 m long, 1.87 wide over the haunches,
// 1.55 high, 2.65 m between the axles, 0.17 m clear of the ground, on 215/55R18 tyres (0.69 m across).
// The body is one skin stretched over cross-sections along its length. Each section follows four curves - the roof line (YT),
// the widest half-width (WS), the underside (YB) and the waist below the windows - so the shape can be tuned from those numbers.
// Local axes: +z ahead, +x to the left (the driver sits on the right, as in Thailand).
const CAR = (() => {
  const crv = (K) => (z) => { let i = 0; while (i < K.length - 2 && z > K[i + 1][0]) i++;
    const p0 = K[max(i - 1, 0)], p1 = K[i], p2 = K[i + 1], p3 = K[min(i + 2, K.length - 1)], d = p2[0] - p1[0], t = clamp((z - p1[0]) / d, 0, 1), t2 = t * t, t3 = t2 * t;
    const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]), m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]);
    return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * d * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * d * m2; };
  const YT = crv([[-2.2, 1.0], [-2.1, 1.12], [-1.9, 1.22], [-1.7, 1.31], [-1.55, 1.42], [-1.2, 1.50], [-0.7, 1.55], [-0.2, 1.548], [0.15, 1.48], [0.5, 1.33], [0.9, 1.13], [1.3, 1.09], [1.7, 1.03], [2.0, 0.96], [2.14, 0.91], [2.2, 0.85]]);
  const WS = crv([[-2.2, 0.72], [-2.1, 0.78], [-1.9, 0.84], [-1.7, 0.895], [-1.4, 0.935], [-1.0, 0.935], [-0.6, 0.90], [0.2, 0.872], [0.8, 0.878], [1.2, 0.912], [1.6, 0.905], [1.85, 0.875], [2.0, 0.85], [2.14, 0.82], [2.2, 0.78]]);
  const YB = crv([[-2.2, 0.44], [-2.0, 0.27], [-1.6, 0.17], [1.5, 0.17], [1.9, 0.21], [2.2, 0.27]]);
  const V = [], I = [], G = [], NS = 112, HP = 61, RN = 2 * HP - 2;      // V: x y z, normal, lp, material (10 numbers); G: which wheel a vertex belongs to (0 none)
  const add = (x, y, z, lx, ly, lz, m, gi) => { V.push(x, y, z, 0, 0, 0, lx, ly, lz, m); G.push(gi); return G.length - 1; };
  for (let i = 0; i <= NS; i++) {
    const z = 2.2 * sin((i / NS - 0.5) * PI), yt = YT(z), ws = WS(z), yb = YB(z), ylr = 1.04 + (1.05 - z) * 0.04, cab = sm(0.06, 0.3, yt - ylr), yl = min(ylr, yt - 0.1), wr = mix(ws * 0.8, min(0.63, ws * 0.72), cab);
    const H = [[0, yb], [0.55 * ws, yb], [0.85 * ws, yb + 0.03], [0.97 * ws, yb + 0.1], [ws, yb + 0.25], [ws, (yb + yl) / 2 + 0.05], [0.985 * ws, yl - 0.08], [0.96 * ws, yl],
      [mix(0.96 * ws, wr, 0.35), mix(yl, yt, 0.4)], [mix(0.96 * ws, wr, 0.75), mix(yl, yt, mix(0.65, 0.8, cab))], [wr, yt - mix(0.02, 0.05, cab)], [wr * 0.8, yt - 0.012], [wr * 0.4, yt], [0, yt]];
    const e = min(i, NS - i), k = e === 0 ? 0.55 : e === 1 ? 0.84 : e === 2 ? 0.95 : 1, yc = (yb + yt) / 2;      // the ends are drawn in, so nose and tail are rounded
    const fr = i > NS / 2, kx = fr ? (e === 0 ? 0.88 : e === 1 ? 0.96 : e === 2 ? 0.99 : 1) : k, ky = fr ? 1 : k;      // the front stays tall and upright, only its corners rounded in plan
    // the fourteen points that shape a half section are joined by a smooth curve and laid out again as HP points
    const H2 = []; for (let t = 0; t < HP; t++) { const u = t / (HP - 1) * 13, a = min(floor(u), 12), f = u - a, q0 = H[max(a - 1, 0)], q1 = H[a], q2 = H[a + 1], q3 = H[min(a + 2, 13)];
      const cr = (c) => 0.5 * (2 * q1[c] + (q2[c] - q0[c]) * f + (2 * q0[c] - 5 * q1[c] + 4 * q2[c] - q3[c]) * f * f + (3 * q1[c] - q0[c] - 3 * q2[c] + q3[c]) * f * f * f); H2.push([max(cr(0), 0), cr(1)]); }
    H2[0][0] = 0; H2[HP - 1][0] = 0;
    for (let j = 0; j < RN; j++) { const h = j < HP ? H2[j] : H2[RN - j], x = (j < HP ? 1 : -1) * h[0] * kx, y = yc + (h[1] - yc) * ky; add(x, y, z, x, y, z, 0, 0); }
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < RN; j++) { const a = i * RN + j, b = i * RN + (j + 1) % RN, c = a + RN, d = b + RN; I.push(a, c, b, b, c, d); }
  // nose and tail are closed with rings drawn in toward the middle, so that there is skin there to shape (grille, lamps, plate)
  for (const i of [0, NS]) { const z = i ? 2.2 : -2.2, yc = (YB(z) + YT(z)) / 2 + (i ? 0.02 : 0.1); let prev = i * RN;
    for (let r = 1; r < 36; r++) { const sc = 1 - r / 36, b0 = G.length; for (let j = 0; j < RN; j++) { const k = (i * RN + j) * 10, x = V[k] * sc, y = yc + (V[k + 1] - yc) * sc; add(x, y, z, x, y, z, 0, 0); }
      for (let j = 0; j < RN; j++) { const a = prev + j, b = prev + (j + 1) % RN, c = b0 + j, d = b0 + (j + 1) % RN; I.push(a, c, b, b, c, d); } prev = b0; }
    const c = add(0, yc, z, 0, yc, z, 0, 0); for (let j = 0; j < RN; j++) I.push(c, prev + j, prev + (j + 1) % RN); }
  const nBody = G.length;
  const box = (x0, x1, y0, y1, z0, z1, m) => { for (const [ax, s] of [[0, -1], [0, 1], [1, -1], [1, 1], [2, -1], [2, 1]]) {
    const q = []; for (const [u, w] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { const pnt = [0, 0, 0]; pnt[ax] = s; pnt[(ax + 1) % 3] = u * 2 - 1; pnt[(ax + 2) % 3] = w * 2 - 1;
      const x = mix(x0, x1, pnt[0] * 0.5 + 0.5), y = mix(y0, y1, pnt[1] * 0.5 + 0.5), z = mix(z0, z1, pnt[2] * 0.5 + 0.5); q.push(add(x, y, z, x, y, z, m, 0)); }
    I.push(q[0], q[1], q[2], q[0], q[2], q[3]); } };
  box(-0.035, 0.035, YT(-1.1) - 0.03, YT(-1.1) + 0.06, -1.2, -1.0, 3);                                                                                             // aerial fin
  box(-0.74, 0.74, 0.2, 0.74, -1.9, 1.9, 2);
  // ---- the cabin as the driver sees it. Materials: 4 dashboard and door tops, 5 steering wheel, 7 pillar and roof trim, 8 the screen, 9 the mirror.
  const X3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const loft = (rings, m, gi, closed) => { const n = rings[0].length, b0 = G.length; for (const r of rings) for (const q of r) add(q[0], q[1], q[2], q[3] === undefined ? q[0] : q[3], q[4] === undefined ? q[1] : q[4], q[5] === undefined ? q[2] : q[5], m, gi);
    const nj = closed ? n : n - 1; for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < nj; j++) { const a = b0 + i * n + j, b = b0 + i * n + (j + 1) % n, c = a + n, d = b + n; I.push(a, c, b, b, c, d); } };
  const tubeP = (path, ru, rw, m, gi, sides = 10) => loft(path.map((q, i) => { const nx = path[min(i + 1, path.length - 1)], pv = path[max(i - 1, 0)], t = nrm3([nx[0] - pv[0], nx[1] - pv[1], nx[2] - pv[2]]), u = nrm3(X3(t, abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), w = X3(t, u);
    return Array.from({ length: sides }, (_, k) => { const a = k / sides * TAU, cu = cos(a) * ru, cw = sin(a) * rw; return [q[0] + u[0] * cu + w[0] * cw, q[1] + u[1] * cu + w[1] * cw, q[2] + u[2] * cu + w[2] * cw]; }); }), m, gi, true);
  const blob = (c, r, m, gi, ax = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) => loft(Array.from({ length: 9 }, (_, i) => { const la = (i / 8 - 0.5) * PI; return Array.from({ length: 14 }, (_, k) => { const lo = k / 14 * TAU, e = [cos(la) * cos(lo) * r[0], sin(la) * r[1], cos(la) * sin(lo) * r[2]];
    return [c[0] + ax[0][0] * e[0] + ax[1][0] * e[1] + ax[2][0] * e[2], c[1] + ax[0][1] * e[0] + ax[1][1] * e[1] + ax[2][1] * e[2], c[2] + ax[0][2] * e[0] + ax[1][2] * e[1] + ax[2][2] * e[2]]; }); }), m, gi, true);
  const EYE = [-0.36, 1.24, -0.1];
  const mirror = (M, w, h, ty) => { const e = nrm3([EYE[0] - M[0], EYE[1] - M[1], EYE[2] - M[2]]), n = nrm3([e[0], e[1], e[2] - 1]), t1 = nrm3(X3([0, 1, 0], n)), t2 = X3(n, t1);
    const P = (a, b) => [M[0] + t1[0] * a * w + t2[0] * b * h, M[1] + t1[1] * a * w + t2[1] * b * h, M[2] + t1[2] * a * w + t2[2] * b * h, a, b, ty]; loft([[P(-1, -1), P(1, -1)], [P(-1, 1), P(1, 1)]], 9, 0, false); };
  // dashboard: one moulded shape across the car, rising into a hood over the instruments in front of the driver
  loft(Array.from({ length: 49 }, (_, xi) => { const x = -0.82 + 1.64 * xi / 48, bn = Math.exp(-(((x + 0.36) / 0.2) ** 2)), ce = Math.exp(-((x / 0.22) ** 2));
    return [[1.06, 0.99], [0.96, 1.03], [0.82, 1.04 + 0.075 * bn], [0.70 - 0.05 * bn, 1.035 + 0.085 * bn], [0.625 - 0.07 * bn, 1.0 + 0.05 * bn], [0.60 - 0.05 * bn, 0.945], [0.585 - 0.02 * bn - 0.02 * ce, 0.87], [0.60 - 0.03 * ce, 0.77], [0.66 - 0.05 * ce, 0.67], [0.80, 0.58]].map((q) => [x, q[1], q[0]]); }), 4, 0, false);
  for (const sx of [-1, 1]) {
    tubeP([[sx * 0.80, 1.045, 0.95], [sx * 0.815, 1.05, 0.3], [sx * 0.83, 1.085, -0.6]], 0.055, 0.05, 4, 0);                                   // door tops
    tubeP([[sx * 0.77, 1.10, 0.93], [sx * 0.71, 1.28, 0.55], [sx * 0.60, YT(0.2) - 0.07, 0.2]], 0.04, 0.026, 7, 0);                                  // screen pillars
    // door mirror: a shaped housing on a short arm from the door, and a flat glass set to show the driver the road behind
    blob([sx * 0.945, 1.135, 0.645], [0.10, 0.064, 0.045], 3, 0); tubeP([[sx * 0.86, 1.09, 0.71], [sx * 0.895, 1.105, 0.665]], 0.034, 0.02, 3, 0, 8);
    mirror([sx * 0.94, 1.135, 0.596], 0.092, 0.056, 0);
    // door panel with its armrest
    loft(Array.from({ length: 9 }, (_, i) => { const z = 1.0 - 1.7 * i / 8; return [[sx * 0.875, 1.0], [sx * 0.85, 0.9], [sx * 0.80, 0.80], [sx * 0.795, 0.74], [sx * 0.85, 0.68], [sx * 0.865, 0.42]].map((q) => [q[0], q[1], z]); }), 4, 0, false);
  }
  tubeP([[-0.60, YT(0.2) - 0.06, 0.2], [0, YT(0.22) - 0.04, 0.22], [0.60, YT(0.2) - 0.06, 0.2]], 0.035, 0.022, 7, 0);                                                     // the header above the screen
  loft([[[-0.56, YT(0.21) - 0.06, 0.21], [0.56, YT(0.21) - 0.06, 0.21]], [[-0.56, YT(-0.6) - 0.07, -0.6], [0.56, YT(-0.6) - 0.07, -0.6]]], 7, 0, false);                                    // roof lining
  blob([0, 1.365, 0.37], [0.105, 0.036, 0.02], 4, 0); tubeP([[0, 1.39, 0.37], [0, YT(0.3) - 0.05, 0.3]], 0.012, 0.012, 4, 0, 6); mirror([0, 1.365, 0.349], 0.093, 0.027, 1);      // the inside mirror: housing, stalk, glass
  // between the seats: the console and gear lever; and the passenger's seat
  blob([0, 0.70, 0.02], [0.105, 0.13, 0.55], 4, 0); tubeP([[0, 0.82, 0.2], [0, 0.94, 0.17]], 0.011, 0.011, 4, 0, 6); blob([0, 0.955, 0.168], [0.024, 0.028, 0.026], 4, 0);
  blob([0.37, 0.62, -0.1], [0.24, 0.085, 0.27], 4, 0); blob([0.37, 1.0, -0.44], [0.23, 0.34, 0.075], 4, 0, [[1, 0, 0], [0, 0.97, -0.24], [0, 0.24, 0.97]]); blob([0.37, 1.41, -0.53], [0.105, 0.085, 0.05], 4, 0);
  loft([[[-0.135, 1.075, 0.735, -0.135, -0.05, 0], [0.145, 1.075, 0.735, 0.145, -0.05, 0]], [[-0.135, 1.175, 0.715, -0.135, 0.05, 0], [0.145, 1.175, 0.715, 0.145, 0.05, 0]]], 8, 0, false);   // the screen standing on the dash
  // steering wheel: rim, hub and three spokes, on its column; group 5 turns about SWA through SWC
  const SWC = [-0.36, 0.99, 0.39], SWA = nrm3([0, 0.36, -0.93]), SU = [1, 0, 0], SW = X3(SWA, SU), wp = (r, a, h = 0) => [SWC[0] + (SU[0] * cos(a) + SW[0] * sin(a)) * r + SWA[0] * h, SWC[1] + (SU[1] * cos(a) + SW[1] * sin(a)) * r + SWA[1] * h, SWC[2] + (SU[2] * cos(a) + SW[2] * sin(a)) * r + SWA[2] * h];
  loft(Array.from({ length: 41 }, (_, i) => { const a = i / 40 * TAU; return Array.from({ length: 10 }, (_, k) => { const b = k / 10 * TAU, q = wp(0.185 + cos(b) * 0.017, a, sin(b) * 0.017); return [q[0], q[1], q[2], 1, 0, 0]; }); }), 5, 5, true);
  for (const a of [0, PI, -PI / 2]) loft(Array.from({ length: 5 }, (_, i) => { const r = 0.05 + 0.125 * i / 4; return Array.from({ length: 8 }, (_, k) => { const b = k / 8 * TAU, q = wp(r, a + cos(b) * 0.021 / max(r, 0.05) * (1.6 - i * 0.2), -0.012 - 0.01 * (1 - i / 4) + sin(b) * 0.008); return [q[0], q[1], q[2], 2, 0, 0]; }); }), 5, 5, true);
  blob(wp(0, 0, -0.025), [0.072, 0.03, 0.062], 5, 5, [SU, SWA, SW]);
  tubeP([wp(0, 0, -0.03), wp(0, 0, -0.33)], 0.034, 0.034, 4, 0, 10);                                              // floor and wheel wells, dark
  const WC = [[0.795, 0.34, 1.325], [-0.795, 0.34, 1.325], [0.795, 0.34, -1.325], [-0.795, 0.34, -1.325]], PR = [[0.115, 0.001], [0.115, 0.215], [0.10, 0.232], [0.115, 0.30], [0.085, 0.345], [-0.085, 0.345], [-0.115, 0.30], [-0.115, 0.001]];
  WC.forEach((wc, wi) => { const sd = wc[0] > 0 ? 1 : -1, b0 = G.length, NA = 24;
    for (let a = 0; a <= NA; a++) for (const pr of PR) { const th = a / NA * TAU, y = pr[1] * cos(th), z = pr[1] * sin(th); add(wc[0] + sd * pr[0], wc[1] + y, wc[2] + z, pr[0], y, z, 1, wi + 1); }
    for (let a = 0; a < NA; a++) for (let q = 0; q < PR.length - 1; q++) { const A = b0 + a * PR.length + q, B = A + 1, C = A + PR.length, D = C + 1; I.push(A, C, B, B, C, D); } });
  // smooth normals: every face adds its own to its corners; then each is turned to face outward
  const nv = G.length;
  const normals = () => {
    for (let q = 0; q < nv; q++) { V[q * 10 + 3] = 0; V[q * 10 + 4] = 0; V[q * 10 + 5] = 0; }
    for (let t = 0; t < I.length; t += 3) { const a = I[t] * 10, b = I[t + 1] * 10, c = I[t + 2] * 10, ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const cx = (V[a] + V[b] + V[c]) / 3, cy = (V[a + 1] + V[b + 1] + V[c + 1]) / 3, cz = (V[a + 2] + V[b + 2] + V[c + 2]) / 3, g = G[I[t]];
      const mt = V[a + 9], ref = g && g < 5 ? WC[g - 1] : mt > 2.5 ? [Math.sign(cx) * 0.9, 1.075, 0.62] : mt > 1.5 ? [cx * 0.5, cy > 0.9 ? cy - 0.03 : 0.47, cz * 0.98] : [0, 0.85, cz * 0.75], ox = cx - ref[0], oy = cy - ref[1], oz = cz - ref[2];
      if (mt < 3.5 && nx * ox + ny * oy + nz * oz < 0) { nx = -nx; ny = -ny; nz = -nz; }       // cabin parts are seen from either side; their own winding is kept
      for (const q of [a, b, c]) { V[q + 3] += nx; V[q + 4] += ny; V[q + 5] += nz; } }
    for (let q = 0; q < nv; q++) { const l = hypot(V[q * 10 + 3], V[q * 10 + 4], V[q * 10 + 5]) || 1; V[q * 10 + 3] /= l; V[q * 10 + 4] /= l; V[q * 10 + 5] /= l; }
  };
  normals();
  // relief: the same places the shader paints are pushed in or out of the skin - lips round the arches, a crease along the
  // shoulder, glass set in, creases on the bonnet, the grille and intakes sunk, the bumper standing proud, lamps and plate
  const G2 = (v, c, w) => Math.exp(-(((v - c) / w) ** 2));
  for (let q = 0; q < nBody; q++) {
    const k = q * 10, x = V[k], y = V[k + 1], z = V[k + 2], nx = V[k + 3], ny = V[k + 4], nz = V[k + 5], ax = abs(x), belt = 1.04 + (1.05 - z) * 0.04; let d = 0;
    const dw = min(hypot(z - 1.325, y - 0.34), hypot(z + 1.325, y - 0.34));
    if (ax > 0.45) d += 0.022 * sm(0.58, 0.47, dw) * sm(0.39, 0.43, dw);
    if (abs(nx) > 0.6 && z > -1.95 && z < 1.9) d += 0.012 * G2(y, belt - 0.13, 0.028) - 0.009 * G2(y, 0.6, 0.08) + 0.01 * G2(y, 0.40, 0.03);
    if ((abs(nx) > 0.5 && y > belt + 0.035 && ny < 0.62 && z > -1.74 && z < 0.58 && abs(z + 0.14) > 0.045 && abs(z + 1.46) > 0.05) || (nz > 0.33 && y > 1.16 && abs(nx) < 0.42 && z < 0.98) || (nz < -0.3 && y > 1.24 && abs(nx) < 0.42 && z < -1.3 && ny < 0.93)) d -= 0.011;
    if (ny > 0.8 && z > 1.1 && z < 2.14) d += 0.013 * G2(ax, 0.5, 0.035) * sm(1.1, 1.3, z) - 0.006 * G2(ax, 0.2, 0.12) * sm(1.1, 1.4, z);
    if (nz > 0.45 && z > 1.9) {          // the face: grille high between the lamps, a body-colour bumper with the plate, a dark valance with intakes below
      const gw = 0.46 - 0.10 * (0.80 - y) / 0.18;
      if (y > 0.62 && y < 0.80 && ax < gw) d -= 0.032 * sm(0, 0.012, gw - ax) * sm(0.62, 0.635, y) * sm(0.80, 0.787, y);
      else if (y > 0.735 && y < 0.845 - (ax - 0.46) * 0.10 && ax >= gw && ax < 0.85) d -= 0.010;
      if (y >= 0.45 && y < 0.62) d += 0.018 * sm(0.45, 0.49, y) * sm(0.62, 0.57, y);
      if (y < 0.45) { d -= 0.012; if (ax < 0.5 && y > 0.30 && y < 0.42) d -= 0.035 * sm(0, 0.012, 0.5 - ax); if (ax > 0.60 && ax < 0.78 && y > 0.33) d -= 0.03; if (y < 0.295 && ax < 0.45) d += 0.022; }
    }
    if (z > 1.8 && nz <= 0.45 && ax > 0.8 && y > 0.735 && y < 0.81) d -= 0.008;
    if (z < -1.93 && y > 0.93 && y < 1.035 && ax > 0.28 && ax < 0.86) d += 0.012;
    if (z < -2.08 && ax < 0.3 && y > 0.58 && y < 0.76) d -= 0.014;
    if (nz < -0.45 && z < -1.9 && y > 0.49 && y < 0.6) d += 0.018 * sm(0.49, 0.52, y) * sm(0.6, 0.56, y);
    if (z > 1.95) V[k + 2] -= sm(1.95, 2.2, z) * (0.10 * (ax / 0.8) ** 2 + max(y - 0.56, 0) * 0.16 + max(0.5 - y, 0) * 0.22);
    V[k] += nx * d; V[k + 1] += ny * d; V[k + 2] += nz * d; V[k + 6] = V[k]; V[k + 7] = V[k + 1]; V[k + 8] = V[k + 2];
  }
  normals();
  return { sw: [SWC, SWA], v: new Float32Array(V), g: G, idx: new Uint16Array(I.length + (I.length & 1)).fill(0).map((_, k) => I[k] || 0), wc: WC, n: nv };
})();
const carOut = new Float32Array(CAR.v.length), carVB = vbuf(carOut), carIB = vbuf(CAR.idx, GPUBufferUsage.INDEX); let view3 = false;
const SHOW_CAR = false;        // the car is drawn: from the driver's seat its bonnet, pillars, dashboard and mirrors; V looks at it from behind
// put the car where it stands: wheels turned by their rolling and the front pair by the steering, then the whole by the slope and heading
function placeCar(dt) {
  car.spin = (car.spin || 0) + car.v * dt / 0.345;
  const c = cos(car.yaw), sn = sin(car.yaw), cp = cos(car.pit), sp = sin(car.pit), cs = cos(car.spin), ss_ = sin(car.spin), st = (car.steer || 0) * 0.5, ct = cos(st), stt = sin(st), M = CAR.v, O = carOut;
  for (let q = 0; q < CAR.n; q++) {
    const k = q * 10, g = CAR.g[q]; let x = M[k], y = M[k + 1], z = M[k + 2], nx = M[k + 3], ny = M[k + 4], nz = M[k + 5];
    if (g === 5) { const C = CAR.sw[0], A = CAR.sw[1], th = -(car.steer || 0) * 1.9, ck = cos(th), sk = sin(th);
      const rot = (vx, vy, vz) => { const dt_ = (A[0] * vx + A[1] * vy + A[2] * vz) * (1 - ck); return [vx * ck + (A[1] * vz - A[2] * vy) * sk + A[0] * dt_, vy * ck + (A[2] * vx - A[0] * vz) * sk + A[1] * dt_, vz * ck + (A[0] * vy - A[1] * vx) * sk + A[2] * dt_]; };
      const r1 = rot(x - C[0], y - C[1], z - C[2]), r2 = rot(nx, ny, nz); x = C[0] + r1[0]; y = C[1] + r1[1]; z = C[2] + r1[2]; nx = r2[0]; ny = r2[1]; nz = r2[2]; }
    else if (g) { const w = CAR.wc[g - 1]; x -= w[0]; y -= w[1]; z -= w[2];
      let t = y * cs - z * ss_; z = y * ss_ + z * cs; y = t; t = ny * cs - nz * ss_; nz = ny * ss_ + nz * cs; ny = t;
      if (g < 3) { t = x * ct + z * stt; z = -x * stt + z * ct; x = t; t = nx * ct + nz * stt; nz = -nx * stt + nz * ct; nx = t; }
      x += w[0]; y += w[1]; z += w[2]; }
    const y2 = y * cp + z * sp, z2 = z * cp - y * sp, ny2 = ny * cp + nz * sp, nz2 = nz * cp - ny * sp;
    O[k] = car.x + x * c + z2 * sn; O[k + 1] = car.y + y2; O[k + 2] = car.z - x * sn + z2 * c;
    O[k + 3] = nx * c + nz2 * sn; O[k + 4] = ny2; O[k + 5] = -nx * sn + nz2 * c; O[k + 6] = M[k + 6]; O[k + 7] = M[k + 7]; O[k + 8] = M[k + 8]; O[k + 9] = M[k + 9];
  }
  Q.writeBuffer(carVB, 0, O);
}
