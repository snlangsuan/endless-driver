// --------------------------------------------------------------------------------------------------------- the cinematic view
// While the car drives itself, the picture can be shot as a film is (C, the camera choice in the settings, or down on a pad's cross): the camera
// is not the player's but a crew's, cutting every few seconds between set-ups - following low behind, running ahead with the car coming on, a
// long lens alongside, standing at the roadside and panning as the car goes by, a drone high over it, down by a rear wheel, circling it slowly -
// each with its own lens, smooth in its moves, framing the car by thirds with room ahead of it. The picture is cut to 2.39:1 with black bars and
// graded as a film (final.wgsl, by CINE.k): teal shadows and warm lights, a soft S of contrast, a deeper vignette, grain, a little colour fringe
// at the edges and more bloom. The writing over the picture goes; moving the mouse brings the buttons back for a moment. It ends when the car is
// driven by hand again (or C, Esc).
const CINE = { on: false, act: false, k: 0, bar: 0, tan: Math.tan(31 * PI / 180), cam: [0, 0, 0, 0, 0], shot: null, last: '', hs: null, sx: 0, uiT: 0, duel: 0 };
const cineOn = () => CINE.act;
const cineSet = (on) => { CINE.on = on && auto.on; CINE.shot = null; cineUI(true); };
// (the camera choice in the settings that shows it - the driver's seat, behind the car (view3), or the cinematic view - kept in step with it
// however it was changed; the cinematic view can be chosen there only while the car drives itself)
let cineSig = '';
const cineUI = (force) => {
  const sig = `${CINE.on}${auto.on}${view3}`; if (!force && sig === cineSig) return; cineSig = sig;
  const g = $('cfCam'), v = CINE.on ? 'cine' : view3 ? 'back' : 'in';
  if (g) for (const q of g.children) { q.setAttribute('aria-pressed', String(q.dataset.v === v)); if (q.dataset.v === 'cine') { q.disabled = !auto.on; q.title = auto.on ? 'ตัดสลับหลายมุมแบบภาพยนตร์ จอกว้าง 2.39:1 โทนสีแบบฟิล์ม (C)' : 'เปิดขับอัตโนมัติก่อน (P) จึงจะเลือกโหมดภาพยนตร์ได้'; } }
};
{
  // (the other two set the view under the cinematic one, for when the film ends)
  const g = $('cfCam'); if (g) g.addEventListener('click', (e) => { const q = e.target.closest('button'); if (!q || q.disabled) return; const v = q.dataset.v;
    if (v === 'cine') cineSet(true); else { view3 = v === 'back'; cineSet(false); } });
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyC' && !e.repeat && !fly.on && (auto.on || CINE.on)) cineSet(!CINE.on);
    else if (e.code === 'Escape' && CINE.on && !CINE.escDlg) cineSet(false);
  });
  // (whether a panel was open when Esc went down, seen before input.js closes it: then Esc only closes the panel)
  document.addEventListener('keydown', (e) => { if (e.code === 'Escape') CINE.escDlg = !!document.querySelector('dialog[open]'); }, true);
  addEventListener('pointermove', () => { CINE.uiT = performance.now(); });
}
// (lens: the tangent of half the picture's height, as TANH in main.js - 31 degrees there; the crew's lenses are longer)
const lens = (deg) => Math.tan(deg * PI / 360);
// what is under a point for the camera to keep above: the surface as it is drawn there - the road, a bridge's deck, the ground beside them -
// and in a tunnel the road (the ground there is the mountain over it). (Taken as the road's height for 6 m either side of its middle, a camera
// beside a mountain road was put inside the cutting's bank, which rises from 4.5 m out, and looked out through the ground.)
const cineFloor = (x, z, y) => (inTun(z) ? roadYs(z) : surf(x, z, y));
// Whether a camera is out beside a bridge, past its balustrade (4.3 m out) and below the rail's top: it sees the car through the rail, the rail a
// blur across the front of the picture (the balustrade is not among the solid things cineHit knows). A drone, high over it, is not.
const cineOffDeck = (p) => brSpan(p[2]) && abs(p[0] - roadX(p[2])) > 4.2 && p[1] < roadY(p[2]) + 2.6;
// Whether anything stands between two points, the ends included (a camera put inside a wall saw out of it, the line looked at from 1.5 m on):
// every 1.5 m along the line, at its own height, the ground - a bank, a crest - and what the chunks' col lists hold (collide.js), whole height
// and all: buildings, walls, poles, and trees - a tree there is its trunk, and its crown made up from the trunk's height, round the top 60% of
// it, about as wide as a quarter of it is tall either way (the leaves themselves are not kept; a drone was put inside a tree's crown).
// (and the rival's car, racing (rival.js): its body and a hand round it - the camera was put inside it)
const cineRiv = (x, z, y) => { if (typeof RIV === 'undefined' || !RIV.s || !RIV.C) return false; const S = RIV.s, dx = x - S.x - RIV.C.ox, dz = z - S.z - RIV.C.oz, c = cos(S.yaw), s = sin(S.yaw);
  return abs(dx * s + dz * c) < 2.6 && abs(dx * c - dz * s) < 1.4 && y > S.y - 0.3 && y < S.y + 1.8; };
const cineHit = (x, z, y) => {
  if (cineRiv(x, z, y)) return true;
  for (const c of chunks.values()) { if (abs(c.x - x) > 52 || abs(c.z - z) > 52) continue; const A = c.col;
    for (let i = 0; i < A.length; i += 8) { const dx = x - A[i], dz = z - A[i + 1], hx = A[i + 4], hz = A[i + 5], yb = A[i + 6], yt = A[i + 7];
      if (abs(dx) > 8 && abs(dz) > 8) continue;
      if (hx < 0.7 && hz < 0.7 && yt - yb > 3) { const h = yt - yb, cr = clamp(0.28 * h, 1.5, 6); if (y > yb + 0.4 * h && y < yt + 0.6 && dx * dx + dz * dz < cr * cr) return true; }
      if (y < yb - 0.2 || y > yt + 0.2) continue;
      const ex = max(abs(dx * A[i + 2] - dz * A[i + 3]) - hx, 0), ez = max(abs(dx * A[i + 3] + dz * A[i + 2]) - hz, 0); if (ex * ex + ez * ez < 0.09) return true; } }
  return false;
};
const cineSees = (A, B) => { const d = Math.hypot(B[0] - A[0], B[2] - A[2]), n = max(1, Math.ceil(d / 1.5));
  for (let i = 0; i < n; i++) { const t = i / n, x = A[0] + (B[0] - A[0]) * t, z = A[2] + (B[2] - A[2]) * t, y = A[1] + (B[1] - A[1]) * t;
    if (!inTun(z) && y < cineFloor(x, z, y) - 0.05) return false;
    if (t < 0.92 && cineHit(x, z, y)) return false; } return true; };
// (a tunnel, or an underpass's cutting - its walls as close either side - near the car: only the set-ups that fit between them; in the cutting
// a camera alongside the car was put inside its wall)
const tunNear = (d) => { const dz = alongRoad(car.hd !== undefined ? car.hd : car.yaw); for (let s = -40; s <= d; s += 10) { const q = car.z + dz * s; if (inTun(q) || udip(q) > 0.3) return true; } return false; };
// The set-ups. Each is begun with what it needs fixed (init: false if it cannot be shot here) and run each frame (run: the camera's wanted
// place p, the point it looks at a, its lens, and where in the frame the car is held - sy up from the middle, in halves of the picture).
const SHOTS = {
  chase: { w: 2, dur: [6, 9], tun: true,
    init: (S) => { S.d = 6.8 + Math.random() * 2; S.h = 1.0 + Math.random() * 0.5; S.lat = (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.8); S.l = lens(36 + Math.random() * 8); S.k = 2.6; return true; },
    run: (S, V) => ({ p: V.at(-S.d, S.lat, S.h), a: V.at(2.5, 0, 0.6), l: S.l, sy: -0.22 }) },
  front: { w: 1.5, dur: [5, 7], tun: true,
    init: (S) => { S.d0 = 14; S.d1 = 6.5; S.h = 0.75 + Math.random() * 0.4; S.lat = (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1); S.l = lens(28 + Math.random() * 6); S.k = 4; return true; },
    run: (S, V) => ({ p: V.at(S.d0 + (S.d1 - S.d0) * sm(0, 1, S.t / S.dur), S.lat, S.h), a: V.at(0, 0, 0.55), l: S.l, sy: -0.12 }) },
  side: { w: 1.5, dur: [5, 8], tun: false,
    init: (S) => { S.side = Math.random() < 0.75 ? -1 : 1; S.r = S.side < 0 ? 4.6 + Math.random() * 0.8 : 3.4; S.h = 0.9 + Math.random() * 0.5; S.l = lens(26 + Math.random() * 6); S.k = 3; return !hpW(car.z) || S.side < 0; },
    run: (S, V) => ({ p: V.at(3.5 - 7 * S.t / S.dur, S.side * S.r, S.h), a: V.at(0, 0, 0.5), l: S.l, sy: -0.1 }) },
  road: { w: 2, dur: [6, 10], tun: false, still: true,
    init: (S, V) => { const s = 45 + Math.random() * 30, dz = V.dz, sl0 = roadSl(car.z), zq = car.z + dz * s / Math.sqrt(1 + sl0 * sl0), sl = roadSl(zq), n = Math.sqrt(1 + sl * sl);
      for (let q = car.z; Math.abs(q - car.z) < Math.abs(zq - car.z) + 20; q += dz * 8) if (inTun(q)) return false;
      // (nor on a bridge: its roadside is past the balustrade, out over the water - the camera stood beside the deck looking through the rail)
      for (let q = -14; q <= 14; q += 2) if (brSpan(zq + q)) return false;
      const side = (Math.random() < 0.55 ? -1 : 1) * dz, off = side * dz < 0 ? 4.6 : 4.9, x = roadX(zq) + side * off / n, z = zq - side * off * sl / n, ry = roadY(zq), g = ground(x, z);
      if (g > ry + 3.5 || udip(zq) > 0.3 || udip(car.z) > 0.3) return false;
      S.P = [x, max(g, ry - 0.3) + 0.8 + Math.random() * 1.6, z]; S.k = 99;
      // (and it must see the car the whole way: from where it is now to some way past the camera, along its lane - in a town a roadside camera
      // was put behind a shop's wall)
      if (solidAt(x, z, S.P[1] - 0.85, 0.4) > 0) return false;
      for (let q = -s; q <= 20; q += 10) { const zz = zq + dz * q / n, lx = roadX(zz) - 1.7 * dz; if (!cineSees(S.P, [lx, roadY(zz) + 0.7, zz])) return false; }
      return true; },
    run: (S, V) => { const d = Math.hypot(V.P[0] - S.P[0], V.P[2] - S.P[2]); if (S.t > 2 && d > 22 && (V.P[0] - S.P[0]) * V.F[0] + (V.P[2] - S.P[2]) * V.F[1] > 0) S.end = true;
      return { p: S.P, a: [V.P[0], V.P[1] + 0.55, V.P[2]], l: clamp(2.2 / max(d, 1), lens(10), lens(46)), sy: -0.05 }; } },
  // (looking steeply down - from lower and further out the tops of the trees by the road came between it and the car)
  drone: { w: 1.2, dur: [7, 10], tun: false,
    init: (S) => { if (tunNear(260)) return false; S.R = 11 + Math.random() * 6; S.H = 23 + Math.random() * 6; S.a0 = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.9); S.w = (Math.random() < 0.5 ? -1 : 1) * (0.04 + Math.random() * 0.05); S.l = lens(34 + Math.random() * 8); S.k = 1.4; return true; },
    run: (S, V) => { const a = S.a0 + S.w * S.t, c = cos(a), s = sin(a), p = V.at(-S.R * c, S.R * s, 0); p[1] = max(V.P[1], ground(p[0], p[2])) + S.H; return { p, a: V.at(4, 0, 0.3), l: S.l, sy: -0.08 }; } },
  wheel: { w: 0.6, dur: [4, 6], tun: true, rigid: true,
    init: (S) => { S.side = Math.random() < 0.5 ? -1 : 1; S.l = lens(50); S.k = 14; return true; },
    run: (S, V) => ({ p: V.body(S.side * 1.45, -3.1, 0.38), a: V.body(S.side * 0.5, 5, 0.5), l: S.l, sy: 0.05 }) },
  orbit: { w: 1, dur: [7, 9], tun: false,
    init: (S) => { S.R = 6 + Math.random() * 1.5; S.H = 0.8 + Math.random() * 0.7; S.a0 = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.4); S.w = -Math.sign(S.a0) * (0.12 + Math.random() * 0.06); S.l = lens(30); S.k = 3.5; return true; },
    run: (S, V) => { const a = S.a0 + S.w * S.t; return { p: V.at(S.R * cos(a), S.R * sin(a), S.H), a: V.at(0, 0, 0.5), l: S.l, sy: -0.15 }; } },
};
// (a set-up is taken only if from where it begins it sees the car - or the first moment of it was a wall, a tree, and then the cut away)
const cineFirst = (D, T, V) => { if (D.rigid) return true; const o = D.run(T, V); return !cineOffDeck(o.p) && cineSees(o.p, [V.P[0], V.P[1] + 0.7, V.P[2]]); };
// Each frame, before the picture is drawn: whether the crew's camera is in use, and if so where it is (CINE.cam: x, y, z, yaw, pitch) and its
// lens (CINE.tan); and how far into the film look the picture is (CINE.k, fading in and out over a second) and the bars (CINE.bar: the part of
// the picture's height each covers).
function cineCam(dt) {
  const C = CINE;
  if (C.on && (!auto.on || fly.on)) cineSet(false);
  cineUI(false);
  C.act = C.on;
  C.k = clamp(C.k + (C.on ? dt : -dt) * 1.2, 0, 1); const ek = C.k * C.k * (3 - 2 * C.k);
  C.bar = ek * max(0, (1 - (W / H) / 2.39) / 2);
  document.body.classList.toggle('cine', C.on);
  document.body.classList.toggle('cineui', C.on && performance.now() - C.uiT < 2500);
  if (!C.act) { C.shot = null; return null; }
  const P0 = typeof PCAR !== 'undefined' && PCAR ? PCAR : { ox: 0, oz: 0 }, hd = car.hd !== undefined ? car.hd : car.yaw, wr = (q) => q - Math.round(q / TAU) * TAU;
  if (C.hs === null || !C.shot) C.hs = hd; C.hs += wr(hd - C.hs) * (1 - Math.exp(-dt * 2.5));
  const h = C.hs, F = [sin(h), cos(h)], Lv = [cos(h), -sin(h)], P = [car.x + P0.ox, car.y, car.z + P0.oz], by = car.yaw, BF = [sin(by), cos(by)], BL = [cos(by), -sin(by)];
  // (racing the rival, close: the two cars framed together - the set-ups are laid out round the point between them, and the lens a little wider -
  // so that a pass, the two wheel to wheel, is in the picture; the set-ups fixed to the player's own body stay on it)
  const PB = P.slice(); { const R = typeof RIV !== 'undefined' && RIV.s && RIV.C ? RIV.s : null, dd = R ? Math.hypot(R.x - P[0], R.z - P[2]) : 99;
    C.duel += ((dd < 22 ? 1 : 0) - (C.duel || 0)) * (1 - Math.exp(-dt * 1.2)); const k = 0.5 * C.duel;
    if (R && k > 0.01) { P[0] += (R.x + RIV.C.ox - P[0]) * k; P[1] += (R.y - P[1]) * k; P[2] += (R.z + RIV.C.oz - P[2]) * k; } }
  const V = { P, F, dz: alongRoad(hd), at: (f, l, u) => [P[0] + F[0] * f + Lv[0] * l, P[1] + u, P[2] + F[1] * f + Lv[1] * l],
    // (at the car's own height, as a camera bolted to it is: taken from the road under the camera, it rose and fell over every bump and camber
    // the car's body did not, and the car shook in the picture)
    body: (l, f, u) => { const x = PB[0] + BF[0] * f + BL[0] * l, z = PB[2] + BF[1] * f + BL[1] * l; return [x, car.y + u, z]; } };
  // a new set-up when the last has run its time (or the car has gone by a roadside one): any but the one just shot, and in a tunnel, or with one
  // just ahead, only those that fit under its roof
  let S = C.shot;
  if (!S || S.t >= S.dur || S.end) {
    const tn = inTun(car.z) || udip(car.z) > 0.3 || tunNear(120), names = Object.keys(SHOTS).filter((n) => n !== C.last && (!tn || SHOTS[n].tun));
    S = null;
    // (a list of set-ups given beforehand - CINE.plan, [{ name, dur }], for a sequence shot to order, as for a video - is taken first, each in
    // turn, where it can be shot; then the crew chooses again)
    while (C.plan && C.plan.length && !S) { const q = C.plan.shift(), D = SHOTS[q.name]; if (!D || (tn && !D.tun)) continue;
      const T = { name: q.name, t: 0, end: false, dur: q.dur || D.dur[0] }; if (D.init(T, V) && cineFirst(D, T, V)) S = T; }
    for (let tries = 0; tries < 8 && !S; tries++) {
      let r = Math.random() * names.reduce((a, n) => a + SHOTS[n].w, 0), pick = names[0];
      for (const n of names) { r -= SHOTS[n].w; if (r <= 0) { pick = n; break; } }
      const D = SHOTS[pick], T = { name: pick, t: 0, end: false }; T.dur = D.dur[0] + Math.random() * (D.dur[1] - D.dur[0]);
      if (D.init(T, V) && cineFirst(D, T, V)) S = T;
    }
    if (!S) { S = { name: 'chase', t: 0, end: false, dur: 6 }; SHOTS.chase.init(S, V); }
    C.shot = S; C.last = S.name; S.cut = true;
  }
  S.t += dt;
  const D = SHOTS[S.name], o = D.run(S, V);
  // (a moving camera is led by the car's own way, by about what its spring lags behind - or it hung back: 14 m behind a chase meant to be 7,
  // and an orbit of 6 m closed to 4)
  if (!D.still && !D.rigid) { const lead = car.v / S.k; o.p[0] += sin(hd) * lead; o.p[2] += cos(hd) * lead; }
  // (the aim too, by what its own spring lags: across a side shot the car ran out to the frame's edge)
  if (!D.rigid) { const la = car.v / 5; o.a[0] += sin(hd) * la; o.a[2] += cos(hd) * la; }
  // (the camera moves to its wanted place on a spring - the set-up's own, from a steady mount to a loose one - put there at once on a cut; and
  // never below what is under it)
  // (a camera fixed to the car's body - D.rigid - goes with it exactly, frame by frame: on a spring, however stiff, with a lead for its lag, it
  // was right only at an even speed and an even frame time, and the car, near and on a long lens, trembled in the picture)
  if (S.cut || !S.p) { S.p = o.p.slice(); S.a = o.a.slice(); S.l = o.l; S.sx = 0; }
  if (D.rigid) { S.p = o.p.slice(); S.a = o.a.slice(); }
  const kp = 1 - Math.exp(-dt * S.k), ka = 1 - Math.exp(-dt * (D.rigid ? 14 : 5));
  if (!D.rigid) for (let j = 0; j < 3; j++) { S.p[j] += (o.p[j] - S.p[j]) * kp; S.a[j] += (o.a[j] - S.a[j]) * ka; }
  S.l += (o.l - S.l) * (1 - Math.exp(-dt * 3));
  S.p[1] = max(S.p[1], cineFloor(S.p[0], S.p[2], S.p[1] + 0.5) + (D.rigid ? 0.08 : 0.35));      // (a camera on the car needs only to stay out of the road: lifted as the others are, by the camber under it, it bobbed)
  // (something come between the camera and the car - a house, a tree - for more than a moment: cut away to another set-up)
  S.lt = (S.lt || 0) + dt; if (S.lt > 0.1) { S.lt = 0; if (!D.tun && (inTun(car.z) || udip(car.z) > 0.3 || tunNear(35))) S.end = true; if (!D.rigid && cineHit(S.p[0], S.p[2], S.p[1])) S.end = true; if (!D.rigid && cineOffDeck(S.p)) S.end = true; if (D.rigid && cineRiv(S.p[0], S.p[2], S.p[1])) S.end = true; S.blk = cineSees(S.p, [P[0], P[1] + 0.7, P[2]]) ? 0 : (S.blk || 0) + 0.1; if (S.blk > 0.4) S.end = true; }
  const dx = S.a[0] - S.p[0], dy = S.a[1] - S.p[1], dz = S.a[2] - S.p[2], yT = atan2(dx, dz), pT = atan2(dy, Math.hypot(dx, dz));
  // (framed by thirds: the car held to one side of the middle, away from where it is heading across the picture, so that there is room in front
  // of it - less when it comes at the camera or goes away from it)
  const asp = W / H, vis = 1 - 2 * C.bar, rx = [-cos(yT), sin(yT)], m = F[0] * rx[0] + F[1] * rx[1], sxT = -0.32 * clamp(m * 1.6, -1, 1);
  if (S.cut) S.sx = sxT; S.sx += (sxT - S.sx) * (1 - Math.exp(-dt * 1.5));
  // (and held as by hand: a slow sway of a few hundredths of a degree, never on the rigid mount)
  const hh = D.rigid || D.still ? 0.3 : 1, nz = time || 0, swY = (sin(nz * 0.53) * 0.6 + sin(nz * 1.31 + 1) * 0.4) * 0.0025 * hh, swP = (sin(nz * 0.71 + 2) * 0.6 + sin(nz * 1.7) * 0.4) * 0.0018 * hh;
  // (wider by a little while the two cars are framed together - here, at the picture, not in the set-up's own lens: some set-ups read that back
  // each frame, and widened it on itself frame after frame until the picture was a smear)
  const L2 = S.l * (1 + 0.25 * (C.duel || 0)); C.tan = L2;
  C.cam = [S.p[0], S.p[1], S.p[2], yT + Math.atan(S.sx * L2 * asp) + swY, pT - Math.atan(o.sy * vis * L2) + swP];
  S.cut = false;
  return C.cam;
}
