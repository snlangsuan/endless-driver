// --------------------------------------------------------------------------------------------------------- the white car of the passes
// On a mountain pass, as the player comes up to the top of the long way down (land.js: PASS_Q - the switchbacks fall away northward, +z, for
// two thirds of their length), a white and black hatchback comes up from behind and tries to get by: down the hairpins after the player,
// looking for room, past where there is some. It is not a car the player can drive, and has nothing to do with the rival's race (rival.js) -
// it comes whatever the mode. Its model: assets/ae86.bin (scripts/ae86.py), fetched when a pass is near.
// It runs along the road itself, as the rival does - a place along it (zr), metres across from its middle (L, + toward +x), a speed - so it
// cannot leave the road; and it gives way to every other car: it comes alongside only with a car's width and more between them, and behind
// one with no room to pass it holds back. At the foot of the pass: ahead of the player, it goes on and away up the road until it is out of
// sight, and is gone; behind, it drops back, and once out of sight is gone too - turn round and go back for it, and it is not there.
const E86 = { C: null, s: null, zr: 0, L: 0, Lv: 0, st: 'idle', done: null, seg: 0, loading: false, side: 0 };
function e86Model() {
  if (E86.C) return true;
  if (!ASSET.ae86) { if (!E86.loading) { E86.loading = true; fetch('assets/ae86.bin').then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then((b) => { ASSET.ae86 = b; }).catch((e) => { console.warn('ae86', e); }); } return false; }
  E86.C = pcBuild(ASSET.ae86, 'ae86'); return !!E86.C;
}
const e86Pass = (z) => { const s = floor(z / SEG); return zoneOf(s) === 1 && !tunS(s) ? { s, q: z / SEG - s - 0.5 } : null; };
// --------------------------------------------------------------------------------------------------------- three abreast
// On a pass, with the rival racing (rival.js) and the white car of the passes come up, the three now and then run side by side across the
// whole of the road - it is 10 m wide over a pass (land.js: PASS_WX), room for three. TRI: when the three are close (within 25-30 m along the
// road), the player's car driving itself, each is given a slot across the road - the player the one nearest where it is, the other two the
// rest, in the order they are across it - 2.45 m apart in the road's measure, and the two behind come up level. Level, they do not settle:
// each of the two edges ahead and drops back by turns (gR, gE: where each keeps to along the road against the player), the pace that the
// bends allow the slowest of them, less a little (TRI.v), the slides held down. After 9 to 14 s it breaks up: the white car goes for it, harder
// into the bends for 7 s (TRI.push), and not again for 12 to 20 s. (rival.js: rivalStep, rivalKeep, rivalCap, rivalTailK take their parts.)
const TRI = { on: false, t: 0, T: 0, cool: 8, slot: { p: 0, r: 0, e: 0 }, gR: 0, gE: 0, v: 99, push: 0 };
const TRI_W = 2.45;
function triStep(dt) {
  TRI.cool = max(0, TRI.cool - dt); TRI.push = max(0, TRI.push - dt);
  const ok = auto.on && !fly.on && rvActive() && !!RIV.s && !!RIV.C && RIV.dirz === 1 && !!E86.s && E86.st === 'race' && hpW(car.z) > 0.3 && abs(car.v) > 8
    && RIV.ph !== 'yield' && RIV.ph !== 'let' && !RIV.away && !RIV.tw;
  const gR = ok ? rvAlong(car.z, RIV.zr, 1) : 0, gE = ok ? rvAlong(car.z, E86.zr, 1) : 0;
  if (TRI.on) {
    TRI.t += dt;
    if (!ok || abs(gR) > 30 || abs(gE) > 35 || TRI.t > TRI.T) { TRI.on = false; TRI.cool = 12 + Math.random() * 8; TRI.push = 7; return; }
    // (coming up level over the first seconds, then the jostling - the two out of step, so one is ahead as the other drops back)
    const k = sm(3, 6, TRI.t); TRI.gR = k * 1.8 * sin(TRI.t * 0.8); TRI.gE = k * 1.8 * sin(TRI.t * 0.8 + 2.4);
    // (and while one of the two is still coming up from behind, the player's car eases off a little more for it: 3 m/s at most)
    TRI.v = min(rvBendV(RIV.zr, 1, 1), rvBendV(car.z, 1, 1)) * 0.92 - clamp(0.25 * max(-gR - 2, -gE - 2, 0), 0, 3);
    return; }
  if (!ok || TRI.cool > 0 || abs(gR) > 25 || abs(gE) > 30) return;
  // (the slots: the player keeps the one nearest it; the rival and the white car the other two, in the order they are across the road)
  const Ls = [-TRI_W, 0, TRI_W], Lp = rdist(car.x, car.z); let ip = 0; Ls.forEach((l, i) => { if (abs(l - Lp) < abs(Ls[ip] - Lp)) ip = i; });
  const rest = Ls.filter((_, i) => i !== ip); TRI.slot.p = Ls[ip];
  if (RIV.L <= E86.L) { TRI.slot.r = rest[0]; TRI.slot.e = rest[1]; } else { TRI.slot.r = rest[1]; TRI.slot.e = rest[0]; }
  TRI.on = true; TRI.t = 0; TRI.T = 9 + Math.random() * 5; TRI.gR = 0; TRI.gE = 0; TRI.v = 99;
}
const triOn = () => TRI.on;
function e86Step(dt) {
  if (dt <= 0 || dt > 0.25) return;
  triStep(dt);
  const P = e86Pass(car.z), dz = alongRoad(car.hd !== undefined ? car.hd : car.yaw), vp = abs(car.v);
  if (!E86.s) {
    if (!P || P.s === E86.done) return; e86Model();
    // (it appears a little before the top, the player going north and moving: 60 m back down the road, coming on quicker than the player)
    if (dz > 0 && P.q > PASS_Q - 0.1 && P.q < PASS_Q - 0.01 && vp > 6 && !fly.on && E86.C) { const nn = rvNN(car.z); E86.zr = car.z - 60 / nn; E86.L = -1.7; E86.Lv = 0; E86.side = 0; E86.seg = P.s; E86.done = P.s; E86.st = 'race';
      const q = rp(E86.zr, E86.L), hd = atan2(roadSl(E86.zr), 1); E86.s = { x: q[0], z: q[1], y: surf(q[0], q[1]), yaw: hd, hd, v: max(vp + 5, 14), slip: 0, gut: 0, brk: 0 }; }
    return; }
  const S = E86.s, nn = rvNN(E86.zr), g = rvAlong(car.z, E86.zr, 1), Lr = E86.L, zEnd = (E86.seg + 0.97) * SEG, CP = CARS.ae86;
  if (E86.st === 'race' && (E86.zr > zEnd || car.z > zEnd)) E86.st = g > 0 ? 'away' : 'fade';
  // gone: away ahead and out of sight; dropped back out of sight (or the player turned round to look for it); or lost
  if ((E86.st === 'away' && g > 330) || (E86.st === 'fade' && (g < -110 || (dz < 0 && g < -45))) || abs(g) > 450) { E86.s = null; E86.st = 'idle'; return; }
  // its speed: what the bends allow its line (as the rival's is reckoned), and what its turn asks
  // The gutter: through a hairpin it drops its inside wheels into the concrete channel at the road's edge and is held round by it - a tighter
  // line than the asphalt gives, and a sixth more speed (as drive.js has it for a car that can: CARS.gutter). hair: in or coming to a hairpin,
  // and which way it turns; S.gut: how far the wheels are down in it.
  const hA = (zq) => atan2(roadSl(zq), 1), wr = (a) => a - Math.round(a / TAU) * TAU, kq = (d) => wr(hA(E86.zr + (d + 3) / nn) - hA(E86.zr + (d - 3) / nn)) / 6;
  const kN = kq(0), kF = kq(10 + S.v * 0.5), kH = abs(kN) > abs(kF) ? kN : kF, hair = hpW(E86.zr) > 0.05 && abs(kH) > 0.035 ? Math.sign(kH) : 0;
  S.gut = sm(3.0, 3.3, abs(E86.L)) * (hpW(E86.zr) > 0.05 ? 1 : 0);
  let vB; { const id0 = RIV.id; RIV.id = 'ae86'; vB = rvBendV(E86.zr, 1, TRI.push > 0 ? 1.28 : 1.18) * (1 + 0.16 * S.gut); RIV.id = id0; }
  let want = E86.st === 'away' ? min(vB, CP.top / 3.6) : E86.st === 'fade' ? min(vB, max(4, vp * 0.55)) : min(vB, CP.top / 3.6, vp + (g < 0 ? (TRI.push > 0 ? 12 : 9) : g > 40 ? 0 : TRI.push > 0 ? 6 : 3));
  // the other cars - the player's, the rival's: by on the side with room, a car's width and more off; no room, it holds back behind
  // Its line: a racing driver's - out wide coming to a bend, in to the apex, out wide again (as the rival's, rival.js), kept a metre and more
  // in from the edge; and only at the apex of a hairpin itself, where the road turns hardest, the inside wheels down into the gutter and out
  // again. (Made for the gutter the moment a hairpin was in sight, it ran along the road's edge nearly the whole way down, from one side to the
  // other at every bend.) Out of the bends, the left lane.
  const kn = kq(6 + S.v * 0.5), kf = kq(18 + S.v * 1.2), hp = hpW(E86.zr) > 0.05, LIM = hp ? 2.2 : 1.9;
  const line = abs(kn) + abs(kf) > 0.004 ? clamp(kn * 75 - kf * 30, -LIM, LIM) : -1.3, apex = hp ? sm(0.04, 0.065, abs(kN)) : 0;
  let Lt = mix(line, Math.sign(kN) * 3.35, apex); const EIN = hpW(E86.zr) > 0.05 ? 3.4 : 2.6, EDGE = (hpW(E86.zr) > 0.05 ? 2.75 : 2.5) - 1.3 * abs(sin(S.slip)), O = [{ g, L: rdist(car.x, car.z), v: vp, sl: car.slip || 0, x: car.x, z: car.z, yaw: car.yaw }];
  if (RIV.s) O.push({ g: rvAlong(RIV.zr, E86.zr, 1), L: RIV.L, v: RIV.s.v, sl: RIV.s.slip || 0, x: RIV.s.x, z: RIV.s.z, yaw: RIV.s.yaw });
  let near = false, urg = false;
  for (const o of O) { if (o.g < -18 || o.g > 14) continue; near = true; const need = rvGap(o.sl, S.slip) + 0.2, d = Lr - o.L;
    let side = E86.side || (abs(d) > 0.8 ? Math.sign(d) : o.L >= 0 ? -1 : 1), lt = o.L + side * need;
    const room = (l) => abs(l) <= (hair && l * hair > 0 ? EIN : EDGE);
    if (!room(lt) && o.g < -6) { side = -side; lt = o.L + side * need; }
    // (no room beside it: behind or level, it drops back behind; already ahead of it - by, after a push - it keeps its line and goes on)
    if (!room(lt) && o.g >= 4) lt = Lr;
    else if (!room(lt)) { want = min(want, o.v + clamp(0.5 * (-9 - o.g), -6, 1)); if (o.g < -5) lt = Lr; else { lt = clamp(lt, -EIN, EIN); if (o.g < 3) want = min(want, o.v - 3); } }
    else if (abs(d) < need - 0.25 && o.g < 5) want = min(want, o.v + clamp(0.6 * (-8 - o.g), -6, 2));
    E86.side = side; Lt = lt; if (abs(d) < need - 0.1 && o.g > -10) urg = true;
    const sep = rvSep(o.x, o.z, o.yaw, S.x, S.z, S.yaw); if (sep < 0.5) { if (o.g < 1.5) want = min(want, o.v - 2 * (0.5 - sep) - 0.5); else want = max(want, min(o.v + 1.5, vB)); } }
  if (!near) E86.side = 0;
  // (three abreast: its slot, level with the player or a little ahead or behind by turns - the last word below still keeps it off the others)
  if (triOn()) { Lt = TRI.slot.e; want = min(vB, CP.top / 3.6, max(0, vp + clamp(0.8 * (TRI.gE - g), -5, 4))); urg = false; E86.side = Math.sign(TRI.slot.e - TRI.slot.p) || 1; }
  Lt = clamp(Lt, -EIN, EIN);
  const hd0 = S.hd || hA(E86.zr);
  { const w = urg ? 3.6 : 2.6; E86.Lv += ((Lt - Lr) * w * w - 2 * w * E86.Lv) * dt; const lm = min(urg ? 4 : 3, (urg ? 0.4 : 0.25) * S.v); E86.Lv = clamp(E86.Lv, -lm, lm); E86.L = clamp(Lr + E86.Lv * dt, -EIN, EIN); }
  { const acc = min(CP.acc, CP.pw / max(S.v, 1)), dv = want - S.v; S.v = max(0, S.v + clamp(dv, -8 * dt, acc * dt)); S.brk = dv < -1 ? 1 : 0; }
  // (and the last word: it never moves into another car - a step that would leave the bodies touching is not taken, the one behind held back)
  { const z1 = E86.zr + S.v * dt / nn, q1 = rp(z1, E86.L), y1 = hA(z1) + S.slip; let ok = true;
    for (const o of O) if (o.g > -12 && o.g < 12 && rvSep(o.x, o.z, o.yaw, q1[0], q1[1], y1) < 0.12) { if (o.g < 2) { ok = false; S.v = max(0, min(S.v, o.v - 1.5)); } else S.v = min(max(S.v, o.v + 2), CP.top / 3.6); }
    if (ok) E86.zr = z1; }
  // Its slide: committed - the nose turned into the bend by as much as the bend's pull asks (three quarters of it over the tyres' grip, as the
  // rival's), up to 40 degrees; less with its wheels held in the gutter, and less beside another car. Coming to a hairpin it flicks the tail
  // the other way first, a feint, and swings it in. In quickly, out more gently; and never more of it than keeps its body on the road.
  const kk = kq(2), crowd = O.some((o) => o.g > -9 && o.g < 7) ? 0.45 : 1;
  let ts = clamp(0.75 * S.v * S.v * kk / (5.5 * gripAt(E86.zr)), -0.7, 0.7) * sm(6, 12, S.v) * crowd * (1 - 0.45 * S.gut);
  if (hp && abs(kF) > 0.04 && abs(kN) < 0.012 && S.v > 9) ts = -0.2 * Math.sign(kF) * crowd;      // (the feint)
  { const ss = Math.sign(ts) || 1, half = 3.5 + 0.4 * S.gut, at = (sl) => { const y = hd0 + sl, c = cos(y), sn = sin(y), ox = S.x + sin(hd0) - sin(y), oz = S.z + cos(hd0) - cos(y); let m = 0;
      for (const [lx, lz] of RV_CORNERS) m = max(m, abs(rdist(ox + lx * c + lz * sn, oz - lx * sn + lz * c))); return m; };
    let smax = abs(ts); while (smax > 0 && at(ss * smax) > half) smax -= 0.05; ts = ss * max(smax, 0); }
  { const up = abs(ts) > abs(S.slip); S.slip += clamp((ts - S.slip) * (1 - exp(-dt * (up ? 5 : 2.5))), -2 * dt, 2 * dt); }
  const q = rp(E86.zr, E86.L), hd = hA(E86.zr) + atan2(E86.Lv, max(S.v, 2));
  S.x = q[0]; S.z = q[1]; S.y = surf(q[0], q[1], S.y + 1); S.hd = hd; S.yaw = hd + S.slip;
}
