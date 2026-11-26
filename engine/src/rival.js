// --------------------------------------------------------------------------------------------------------- the rival (Endless)
// Drifting, with the rival switched on (the settings panel: RIVAL, input.js), the other car - the GR86 if the player drives the MX-5, the MX-5
// if the GR86 - comes up from behind and races: it chases, gets alongside and by, leads, and gives the lead back, round and round, never far
// off - a duel, not a getaway. Its model is drawn and smokes and marks the road as the player's does (playercar.js: RIV.C, RIV.s).
// It is not driven by drive.js's physics but along the road itself: where it is on the road (zr, the road's z; L, metres from the middle,
// square to it, + toward +x) and how fast (v) - the speed what the bends ahead allow for its line and what the race asks, the line a racing
// driver's through the bends (as the self-driving's, drive.js) and kept clear of the player's car alongside. Its heading follows its path,
// its nose turned into the slide by how fast the path is turning, as a drifting car's is.
// Switched off (or the drift mode left), it does not vanish: it drops back out of sight and is gone.
const RIV = { C: null, s: null, id: null, zr: 0, L: 0, Lv: 0, dirz: 1, ph: 'follow', pt: 0, lane: 1, tick: 0, loading: null, gone: 0, side: 0, touch: 0 };
// The race, by turns (RIV.ph): lead - the rival ahead, racing; yield - its time up, it moves over into a lane, the left or the right, away
// from the player's line, straightens up (no drift) and eases off 9 km/h, and the player comes by in the other lane; follow - behind, a few
// lengths back, racing; let - the player's time up: the player's self-driving moves over into a lane and eases off in the same way (rivalKeep,
// rivalCap) and the rival goes by in the other. (Driven by hand, the player is not moved: the rival goes by in the other lane when there is
// room.) Then round again: the lead taken in turns, each change made in plain sight, no one cut up.
const rvActive = () => RIVAL && DRIFT;
const rvOther = () => (PCAR_ID === 'mx5' ? 'gr86' : 'mx5');
const rvNN = (z) => Math.sqrt(1 + roadSl(z) ** 2);
// How far along the road from the player to the rival (+ the rival ahead, the way dirz): the road's own length between their z's, summed in
// short steps. (Taken as the z's apart times the road's slant at one of them, on a switchback - the road there running nearly across z - the
// gap jumped about by tens of metres from frame to frame, and the race with it.)
function rvAlong(z1, z2, dirz) {
  const n = min(160, Math.ceil(abs(z2 - z1) / 1.5) || 1), h = (z2 - z1) / n; let L = 0, x0 = roadX(z1);
  for (let i = 1; i <= n; i++) { const x1 = roadX(z1 + h * i); L += Math.hypot(x1 - x0, h); x0 = x1; }
  return L * Math.sign(z2 - z1) * dirz;
}
// How much road across a car takes, half of it, turned sideways by sl in a slide - its body 4.3 m long and 1.9 wide, and turned about a
// point near its front (playercar.js), so that its tail swings out 2.6 m's worth: at 20 degrees nearly twice as much as straight. And so how far apart, middle to middle, two cars side by side must be to pass clean - half a metre between
// them. (Kept a fixed 2.6 m apart, as at first, two cars sideways in a bend overlapped, and were shoved apart: a jerk.)
const rvHalf = (sl) => 0.95 * abs(cos(sl)) + 2.6 * abs(sin(sl));
const rvGap = (a, b) => rvHalf(a) + rvHalf(b) + 0.5;
// How far apart two cars' bodies are (each a 4.3 x 1.9 m box at x, z turned to yaw; below 0 they overlap), by the axes of the two boxes.
function rvSep(x1, z1, y1, x2, z2, y2) {
  const dx = x2 - x1, dz = z2 - z1; let sep = -99;
  for (const a of [y1, y1 + PI / 2, y2, y2 + PI / 2]) { const ax = sin(a), az = cos(a), pr = (y) => 2.15 * abs(sin(y) * ax + cos(y) * az) + 0.95 * abs(cos(y) * ax - sin(y) * az);
    sep = max(sep, abs(dx * ax + dz * az) - pr(y1) - pr(y2)); }
  return sep;
}
// The same, laid out on the road itself: each car by where it is across the road (a, from the middle, + on the left of the way), how far along
// (b, + ahead) and its slide (s, its nose turned from the road's heading). Its body turns about a point 1 m ahead of where it is, as it is drawn
// (playercar.js: PZ), so a slide moves the body's middle back and out.
const rvSepL = (a1, b1, s1, a2, b2, s2) => rvSep(a1 - sin(s1), b1 + 1 - cos(s1), s1, a2 - sin(s2), b2 + 1 - cos(s2), s2);
// How far apart across the road two cars must be, g apart along it and sliding s1 (the player's) and s2, for half a metre between their bodies
// (the rival on the side 'side' of the player). Two cars sliding alike, side by side, need far less than two sliding any way at all (rvGap): their
// bodies lie parallel, and 2.6 to 2.9 m does up to 30 degrees. (Never under 2.4 m, a car's width and half a metre: taken by the bodies'
// lengths alone, two cars 5 m apart along the road were let come within 1.8 m across, and their corners met as their headings differed.)
function rvNeed(g, s1, s2, side) { for (let d = 2.4; d < 7; d += 0.1) if (rvSepL(0, 0, s1, side * d, g, s2) >= 0.5) return d; return 7; }
// Whether the road from here on is fit to drift two abreast: its full width, out of town, and no switchback, bridge, tunnel nor underpass.
function rvTwinOK(z0, dirz) { const nn = rvNN(z0);
  for (let d = 0; d <= 60; d += 10) { const z = z0 + dirz * d / nn; if (townW(z) > 0.02 || hpW(z) > 0.02 || brSpan(z) || inTun(z) || udOf(z)) return false; }
  return true; }
function rvDrop() { const C = RIV.C; if (C) { C.live.on = false; C.vb.destroy(); C.ib.destroy(); C.ub.destroy(); C.tex.destroy(); } RIV.C = null; RIV.s = null; RIV.id = null; }
// its model: the car the player is not driving, fetched the first time it is wanted
function rvModel() {
  const id = rvOther(); if (RIV.id === id && RIV.C) return true;
  if (!ASSET[id]) { if (RIV.loading !== id) { RIV.loading = id; fetch('assets/' + id + '.bin').then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then((b) => { ASSET[id] = b; RIV.loading = null; }).catch((e) => { console.warn('rival ' + id, e); RIV.loading = null; }); } return false; }
  const keep = RIV.s; rvDrop(); RIV.C = pcBuild(ASSET[id], id); RIV.id = id; RIV.s = keep; return !!RIV.C;
}
// Whether the lead may change hands here: the next 100 m along the way near enough straight, the road its full width - no bridge, tunnel,
// underpass, switchback, nor a bend tighter than about 150 m round.
function rvSwapOK(z0, dirz) { const nn = rvNN(z0);
  for (let d = 0; d <= 100; d += 10) { const z = z0 + dirz * d / nn; if (brSpan(z) || inTun(z) || udOf(z) || hpW(z) > 0.02) return false;
    if (abs(roadX(z + 6) - 2 * roadX(z) + roadX(z - 6)) / 36 > 0.0067) return false; }
  return true; }
// set down behind the player, out of sight round the last bend or over the last rise, coming up a little quicker than the player goes
function rvSpawn() {
  RIV.dirz = alongRoad(car.hd !== undefined ? car.hd : car.yaw); RIV.zr = car.z - RIV.dirz * (hpW(car.z) > 0.05 ? 40 : 70) / rvNN(car.z); RIV.L = -1.7 * RIV.dirz;
  const P = rp(RIV.zr, RIV.L), hd = atan2(roadSl(RIV.zr) * RIV.dirz, RIV.dirz);
  RIV.s = { x: P[0], z: P[1], y: surf(P[0], P[1]), yaw: hd, hd, v: max(abs(car.v) + 4, 12), slip: 0, gut: 0, brk: 0 };
  RIV.ph = 'follow'; RIV.pt = 8 + Math.random() * 5; RIV.gone = 0; RIV.side = 0; RIV.Lv = 0; RIV.tw = null; RIV.twB = false; RIV.twCool = 4;
}
// How fast the bends ahead let it go, for a racing line through them: the road looked along for 100 m, as the self-driving does (drive.js), and
// no faster than lets it ease down to each bend by the time it gets there. aK: how hard it corners, against the self-driving's (the race's turns).
function rvBendV(zr, dirz, aK) {
  const grip = gripAt(zr), P = CARS[RIV.id] || CARP, aT = 9.5 * grip * aK, aHp = P.grip * grip * aK, dec = 4 * grip * (1 + 2 * max(0, aK - 1)), wrap = (q) => q - Math.round(q / TAU) * TAU, hdA = (zq) => atan2(roadSl(zq), 1);
  const kv = (zq) => abs(roadX(zq + 4) - 2 * roadX(zq) + roadX(zq - 4)) / 16 / Math.pow(1 + roadSl(zq) ** 2, 1.5);
  let zz = zr, sL = 0, xx = roadX(zz), vB = 99;
  for (let i = 0; i < 50 && sL < 100; i++) { const zn = zz + dirz * 2, xn = roadX(zn); sL += Math.hypot(xn - xx, 2); zz = zn; xx = xn;
    let kb = kv(zz); if (kb > 0.004) { const tn = min(PI, abs(wrap(hdA(zz + 25) - hdA(zz - 25)))), R2 = 1 / kb + 3.2 / max(1 - cos(tn / 2), 0.08); kb = 1 / R2; }
    const vb = Math.sqrt((hpW(zz) > 0.05 ? aHp : aT) / max(kb, 1e-4)); vB = min(vB, Math.sqrt(vb * vb + 2 * dec * max(0, sL - 4))); }
  return vB;
}
function rivalStep(dt) {
  if (dt <= 0 || dt > 0.25) return;
  const act = rvActive();
  if (!act && !RIV.s) { if (RIV.C) rvDrop(); return; }
  if (act && !rvModel()) return;
  if (!RIV.s) rvSpawn();
  const S = RIV.s, dirz = RIV.dirz, nn = rvNN(RIV.zr), wr = (q) => q - Math.round(q / TAU) * TAU;
  // (the player turned round: it comes again from behind, the new way)
  if (act && alongRoad(car.hd !== undefined ? car.hd : car.yaw) !== dirz && abs(car.v) > 3) { rvSpawn(); return; }
  // where it is against the player along the road (+ ahead), and where each is across it (metres from the middle on the left of the way)
  const g = rvAlong(car.z, RIV.zr, dirz), Lp = rdist(car.x, car.z) * dirz, Lr = RIV.L * dirz, vp = abs(car.v);
  // (lost - far ahead or far behind, the player stopped a long while or off somewhere: it comes again from behind)
  if (act && abs(g) > 260) { rvSpawn(); return; }
  // The race: its turn, and how it changes. (LANE: the middle of a lane, from the road's middle)
  const LANE = townW(RIV.zr) > 0.05 ? 1.6 : 1.75;
  const sp0 = car.slip || 0;
  if (act) { RIV.pt -= dt;
    if (g > 7 && (RIV.ph === 'follow' || RIV.ph === 'let')) { RIV.ph = 'lead'; RIV.pt = 14 + Math.random() * 10; }
    else if (g < -7 && (RIV.ph === 'lead' || RIV.ph === 'yield')) { RIV.ph = 'follow'; RIV.pt = 12 + Math.random() * 8; }
    // (the lead changes hands only where there is room for it to be done well: the next 100 m near straight and the full width of the road - no
    // bridge, no tunnel, no underpass, no switchback, no bend to speak of - and with neither car sliding: started mid-drift, or at a bridge's
    // end, the one giving way was seen to brake hard out of the slide and the two to squeeze by in a narrow place)
    else if (RIV.pt <= 0 && (RIV.ph === 'lead' || RIV.ph === 'follow')) { if ((RIV.tick % 10 === 0) && !RIV.tw && rvSwapOK(RIV.zr, dirz) && rvSwapOK(car.z, dirz) && abs(sp0) < 0.12 && abs(S.slip) < 0.12) {
        if (RIV.ph === 'lead') { RIV.ph = 'yield'; RIV.lane = Lp >= Lr ? -1 : 1; } else { RIV.ph = 'let'; RIV.lane = Lr >= Lp ? 1 : -1; } RIV.pt = 25; RIV.ramp = 0; RIV.v0 = S.v; RIV.p0 = vp; } }
    else if (RIV.pt <= 0) { RIV.ph = RIV.ph === 'yield' ? 'lead' : 'follow'; RIV.pt = 10; } }      // (not done in 25 s - the player hanging back: as it was)
  else RIV.gone += dt;
  const turn = act && (RIV.ph === 'yield' || RIV.ph === 'let');
  // (giving way eased into over 3 s - off the throttle, not the brakes)
  RIV.ramp = turn ? min(1, (RIV.ramp || 0) + dt / 3) : 0;
  // its line: a racing driver's through the bends - wide in, the inside at the apex, wide out (drive.js's, for the self-driving)
  const kq = (d) => wr(atan2(roadSl(RIV.zr + dirz * (d + 1.5) / nn) * dirz, dirz) - atan2(roadSl(RIV.zr + dirz * (d - 1.5) / nn) * dirz, dirz)) / 3;
  const kn = kq(6 + S.v * 0.5), kf = kq(18 + S.v * 1.2), hp = hpW(RIV.zr) > 0.05, lim = hp ? 1.9 : (townW(RIV.zr) > 0.05 ? 2.3 : 2.6) - 1.2 * abs(sin(S.slip));
  let Lt = clamp(kn * 75 - kf * 30, -lim, lim);
  const tight = (k) => sm(0.0015, 0.006, abs(k)) * (1 - sm(0.02, 0.2, townW(RIV.zr)));
  // How much it drifts: through the bends - from about 600 m round, fully under 170 - and the switchbacks; straight on the straights,
  // never in town (its tail swept through the scooters parked along the street), and not at all side by side, nor while the lead changes hands.
  // Drifting two abreast (RIV.tw): out of town on the full width of the road, coming to a bend with the two of them close, now and then - four
  // bends in five - the one behind does not drop in behind but comes up alongside, and the two go through the bend side by side, sliding alike,
  // the one a little ahead of the other and the gap between them what their bodies need at that angle (rvNeed). Once the road straightens, or
  // narrows, or the lead is to change hands, they part, and the race goes on as it was. Only while the player's car drives itself, its slide
  // fitted to the gap (rivalTailK): driven by hand, the slide is the player's own. (tw.side: the side of the player the rival is on;
  // tw.gT: where along the road it keeps to, against the player - a metre behind, or ahead when it leads; tw.need: the gap across the road.)
  // (The bend is seen coming well ahead - 85 m at 110 km/h - so that the two are level by the time they turn in: decided on the near bend
  // alone, the one behind was still 12 m back as the bend ended. And when it is over they part along the road before either goes back to
  // its own line - the one ahead draws away, 7 m - while still side by side: going back to their lines abreast, they came together.)
  const sp = car.slip || 0, kfar = kq(30 + S.v * 1.8), bendS = max(tight(kn), tight(kf), tight(kfar)) > 0.35, bendA = max(tight(kn), tight(kf)) > 0.35, ksg = Math.sign(kf || kn || kfar) || 1;
  if (RIV.tick % 10 === 0) RIV.twOK = rvTwinOK(RIV.zr, dirz) && rvTwinOK(car.z, dirz);
  RIV.twCool = max(0, (RIV.twCool || 0) - dt);
  if (bendS && !RIV.twB) { RIV.twB = true;
    if (act && auto.on && !turn && !RIV.tw && RIV.twCool <= 0 && RIV.twOK && abs(g) < 20 && S.v > 11 && vp > 11 && Math.random() < 0.8)
      RIV.tw = { side: abs(Lr - Lp) > 0.6 ? Math.sign(Lr - Lp) : -ksg, gT: g >= 0 ? 1 : -1, t: 0, off: 0, need: 3, part: false, in: false }; }
  else if (!bendS && max(tight(kn), tight(kf)) < 0.15) RIV.twB = false;
  // (T.in: the bend reached - till then it is only coming, and 'over' means it is no longer seen ahead at all)
  if (RIV.tw) { const T = RIV.tw; T.t += dt; T.in = T.in || bendA; T.off = (T.in ? bendA || max(tight(kn), tight(kf)) > 0.15 : bendS) ? 0 : T.off + dt;
    if (!act || turn || abs(g) > 25 || (T.part && abs(g) > 6)) { RIV.tw = null; RIV.twCool = 3; }
    // (parting: the one ahead draws away - or, not away in 3 s (the bends or its top speed holding it), the rival drops back; given up after 8 s)
    else if (T.part && T.t - T.pt0 > 8) { RIV.tw = null; RIV.twCool = 3; }
    else { if (!T.part && (!RIV.twOK || T.off > 0.9 || T.t > 16)) { T.part = true; T.pt0 = T.t; T.gT = g >= 1 ? 7 : -7; }
      if (T.part && T.t - T.pt0 > 3) T.gT = -7;
      T.need = max(rvNeed(T.part ? g : T.gT, 0.42 * ksg, 0.42 * ksg, T.side), rvNeed(g, sp, S.slip, T.side)); } }
  const tw = RIV.tw;
  const ov = g > -5.6 && g < 5.6, dk = turn || (ov && (!tw || tw.part)) ? 0 : max(tight(kn), tight(kf) * 0.6);
  // (drifting a bend, its line kept in from the edge by what the slide will swing its tail out: room for the drift on the road itself)
  if (dk > 0.05) Lt = clamp(Lt, -(3.5 - rvHalf(0.45 * dk)), 3.5 - rvHalf(0.45 * dk));
  const GAP = tw ? tw.need : rvGap(sp, S.slip);
  // (EDGE: how far out its middle may go - its body, turned by its slide, kept on the asphalt, 3.5 m either side of the road's middle (its mirrors a
  // little over), in town 3.3; on the switchbacks its wheels short of the gutter, which neither car can ride. Off it, the car looked to run off the
  // road, and its tail went for the posts and the kerbs.)
  const EDGE = min((townW(RIV.zr) > 0.05 ? 3.3 : 3.5) - rvHalf(max(abs(S.slip), 0.03)) + 0.05, hp ? 2.75 - 1.3 * abs(sin(S.slip)) : 9);
  // How hard it corners (aK, against the self-driving's) and what it may not go faster than (vCap, m/s). Far behind it pushes harder in the bends,
  // far ahead it is a little easier on them. The race's pace on a straight (vRace): the self-driving's set speed, or by hand the best the player
  // has been going of late.
  RIV.vpMax = max(vp, (RIV.vpMax || vp) - dt * 0.4); const vRace = auto.on ? auto.limit / 3.6 : RIV.vpMax;
  let aK = 1, vCap = 99;
  if (!act) vCap = max(0, vp - 3);      // (leaving: it drops back, out of sight, and is gone)
  else if (g > 0) aK = 1 - clamp((g - 14) * 0.004, 0, 0.06);
  else aK = 1 + clamp((-g - 12) * 0.008, 0, 0.25);
  // (ahead: at the race's pace, its own - not tied to the player's speed when the player is close behind, which had the two, each going by the
  // other, wind each other down from 107 km/h to 35 on a straight; only well clear, past 12 m, does it ease off a little, 4 km/h at most)
  if (act && RIV.ph === 'lead') vCap = g > 12 ? max(vp - 1.2, min(vRace + 0.5, vp + 0.25 * (12 - g) + 1.2)) : vRace + 0.5;
  // (the last seconds before its turn to lead, it closes right up - the pressure on - into the player's slipstream)
  // (behind, close - a tandem: two lengths back, a little more while either slides, its tail out - and following the player's slide with its own,
  // which the room left for its slide below now allows: kept 9 to 14 m back with no slide at all within 14 m of the player, it ran behind straight)
  if (act && RIV.ph === 'follow') vCap = vp + clamp(0.4 * ((RIV.pt < 5 ? -6 : -7) - 2.5 * abs(sin(sp)) - 2 * abs(sin(S.slip)) - g), -3, 3);
  // (two abreast: held level with the player, a metre off, by its speed - the player goes as it goes)
  if (tw) vCap = vp + clamp(0.7 * (tw.gT - g), -5, 4);
  if (act && RIV.ph === 'yield') { Lt = RIV.lane * LANE; vCap = (RIV.v0 || S.v) - 1.1 * RIV.ramp; }      // (over into its lane at its own pace, 4 km/h off it - not slowed by the player's speed, which had the two
  // wind each other down to a stop - and the player comes by, its self-driving let 9 km/h over its set speed for it: rivalBoost)
  if (act && RIV.ph === 'let') {
    // the player making way (its self-driving over in the other lane, easing off): into its own lane and by. By hand, the player not moving
    // over, it goes by only where its lane is clear of the player's car by a car's width and more; otherwise it waits a few lengths back.
    const clear = abs(RIV.lane * LANE - Lp) >= GAP && abs(sp) < 0.12; Lt = clear || !ov ? RIV.lane * LANE : Lr;
    vCap = clear ? vp + 2.5 : vp + clamp(0.4 * (-9 - g), -3, 1);      // (out in its lane: it puts its foot down and goes by)
  }
  // Side by side, each keeps to its own side of the other, GAP apart - the one ahead holding its line, the one coming by finding its room - and
  // the side the rival is on when they come together is the side it keeps until they are apart (RIV.side): it never cuts across the player.
  const sepB0 = RIV.C && PCAR ? rvSep(car.x + PCAR.ox, car.z + PCAR.oz, car.yaw, S.x + RIV.C.ox, S.z + RIV.C.oz, S.yaw) : 9;
  if (tw) { RIV.side = tw.side; Lt = Lp + tw.side * tw.need; }      // (two abreast: on its side of the player, the gap across that their slides need)
  else if (!ov) RIV.side = 0;
  else { if (!RIV.side) RIV.side = Math.sign(Lr - Lp) || (Lp >= 0 ? -1 : 1);
    const want = Lp + RIV.side * GAP;
    if ((Lt - Lp) * RIV.side < GAP && (g < 0 || abs(Lr - Lp) < GAP - 0.5 || sepB0 < 0.5)) Lt = want;
    if (abs(want) > EDGE + 0.05 && g < 0) vCap = min(vCap, vp - 2); }      // (no room on its side: it drops back rather than squeeze)
  RIV.dbg = [g, Lp, Lr, Lt, RIV.side, RIV.lane || 0, vCap * 3.6, RIV.ph];
  // something solid in its line ahead (looked at every sixth frame) - it takes the nearest line that is clear
  if (++RIV.tick % 6 === 0) { const zq = RIV.zr + dirz * (8 + S.v * 0.4) / nn, hit = (l) => { const q = rp(zq, l * dirz); return solidAt(q[0], q[1], surf(q[0], q[1], S.y + 1), 1.1) > 0; };
    RIV.blk = null; if (hit(Lt)) for (const d of [1, -1, 2, -2, 3, -3]) { const l = clamp(Lt + d, -EDGE, EDGE); if (!hit(l)) { RIV.blk = l; break; } } }
  if (RIV.blk !== null && RIV.blk !== undefined && !ov) Lt = RIV.blk;
  Lt = clamp(Lt, -EDGE, EDGE);
  // Across the road on a spring, critically damped: it eases out, glides over, and settles - an S, not a jerk (no faster than 2.2 m/s, or
  // 3.5 m/s to keep clear when the player's car comes over toward it).
  const sepB = RIV.C && PCAR ? rvSep(car.x + PCAR.ox, car.z + PCAR.oz, car.yaw, S.x + RIV.C.ox, S.z + RIV.C.oz, S.yaw) : 9;
  { const urg = ov && (abs(Lr - Lp) < GAP - 0.2 || sepB < 0.4), w = urg ? 3.2 : 1.7, vmax = urg ? 3.5 : 2.2;
    RIV.Lv = (RIV.Lv || 0) + ((Lt - Lr) * w * w - 2 * w * (RIV.Lv || 0)) * dt; RIV.Lv = clamp(RIV.Lv, -vmax, vmax); RIV.L = (Lr + RIV.Lv * dt) * dirz; }
  // Its speed: what the bends allow its line, its top speed, and what its turn in the race allows; and right behind the player in its line - not
  // out to a side - no quicker than the player: it never runs into the back of it. It pulls away by its engine (power over speed, as drive.js)
  // and brakes at up to 7 m/s2.
  const P = CARS[RIV.id] || CARP, vB = rvBendV(RIV.zr, dirz, aK);
  let vt = min(vB, P.top / 3.6, max(0, vCap));
  // (in the player's line behind it: 6.5 m back and no closer (more while either slides); and the bodies near each other
  // anywhere alongside: it gives way, off the throttle, if it is not the one ahead)
  if (g > -12 && g < -2.5 && abs(Lr - Lp) < GAP - 0.3) vt = min(vt, vp + clamp(0.5 * ((RIV.ph === 'follow' && RIV.pt < 5 ? -5.8 : -6.5) - 2.5 * abs(sin(sp)) - 2 * abs(sin(S.slip)) - g), -4, 2));
  if (sepB < 0.35 && g < 2) vt = min(vt, vp - 2 * (0.35 - sepB) - 0.3);
  const acc = min(P.acc, P.pw / max(S.v, 1)), dv = vt - S.v; S.v = max(0, S.v + clamp(dv, -7 * dt, acc * dt)); S.brk = dv < -1 ? 1 : 0;
  // along the road by its speed, set down on it; its heading by its path, its nose into the slide by how fast the path turns
  RIV.zr += dirz * S.v * dt / nn; const Q = rp(RIV.zr, RIV.L), mx = Q[0] - S.x, mz = Q[1] - S.z;
  const hd0 = S.hd; if (mx * mx + mz * mz > 1e-8) S.hd = atan2(mx, mz); S.x = Q[0]; S.z = Q[1]; S.y = surf(S.x, S.z, S.y + 1);
  const yr = wr(S.hd - hd0) / dt; let slT = (clamp(0.085 * S.v * yr, -0.62, 0.62) * dk + clamp(0.008 * S.v * yr, -0.06, 0.06) * (1 - dk)) * sm(5, 11, S.v);      // (drifting a bend: up to 35 degrees, as the player's)      // (a slide in the tight bends; otherwise only the few degrees a gripping car's tyres slip)
  // (following close - a tandem - it slides as the player does, near as far, the player's slide its lead: by its own reading of the bend it slid
  // a third as far as the car it chased, and looked to follow it through on grip. The room below still has the last word.)
  if (act && RIV.ph === 'follow' && !tw && g < 0 && g > -16 && abs(sp) > 0.15 && dk > 0.05) slT = Math.sign(sp) * max(abs(slT), 0.9 * abs(sp)) * sm(5, 11, S.v);
  // (and never more of a slide than there is room for: its body, swung out by it, kept on the asphalt and a half metre clear of the player's car
  // - the largest angle that fits, or none. Let slide as the bend asked, its tail went over the edge, through the rails, and into the player.)
  // (The player's car as it is, the two bodies at their places along the road as well as across it: taken by the gap across alone, for
  // anything within 14 m, the car right behind in the player's line - nowhere near its body - was let no slide at all, and went through
  // every bend straight behind the drifting one.)
  { const Lr2 = RIV.L * dirz, Lp2 = rdist(car.x, car.z) * dirz, near = abs(g) < 9, road = (townW(RIV.zr) > 0.05 ? 3.3 : 3.55) - abs(Lr2), ss = Math.sign(slT) || 1;
    let smax = 0.62; while (smax > 0 && (rvHalf(smax) > road || (near && rvSepL(Lp2, 0, sp, Lr2, g, ss * smax) < 0.5))) smax -= 0.04;
    slT = clamp(slT, -max(smax, 0), max(smax, 0)); }
  // (no more of the slide than leaves its tail clear of what stands by the road, looked for along its way: pcSlideRoom)
  if (RIV.tick % 4 === 2) RIV.tailT = pcSlideRoom(RIV.C, S.x, S.z, S.y, S.hd, kn, slT); RIV.tailK = min(RIV.tailT ?? 1, (RIV.tailK ?? 1) + dt * 1.2); slT *= RIV.tailK;
  // (into the slide quickly, out of it more slowly - but at once where there is no room for it)
  S.slip += (slT - S.slip) * (1 - exp(-dt * (abs(slT) > abs(S.slip) ? 3.5 : abs(S.slip) - abs(slT) > 0.1 ? 8 : 2)));
  // (its tail kept out of what is beside the road, as the player's)
  if (abs(S.slip) > 0.04 && pcTailHit(RIV.C, S.x, S.z, S.y, S.hd + S.slip, S.hd)) S.slip *= 1 - min(1, dt * 15);
  S.yaw = S.hd + S.slip;
  // (touching all the same - the player driving into it by hand: counted, and the one behind held to the other's speed - no shove, which jerked)
  if (sepB < 0) { RIV.touch = (RIV.touch || 0) + 1; if (g < 0) S.v = min(S.v, vp - 0.5); else if (g > 2.5 && car.v > S.v) { car.v = S.v; car.jolt = max(car.jolt || 0, 0.2); } }
  // (left, and out of sight behind or far enough: gone)
  if (!act && (g < -160 || RIV.gone > 30)) rvDrop();
}
// The player's self-driving takes its turns too (drive.js). rivalKeep: its line (across the road, as drive.js's home) - its lane while it makes
// way, or while it goes by the rival making way; otherwise its own, giving a little only side by side with the bodies close. rivalCap: how fast
// it may go (m/s; 99 no limit) - easing off while it makes way, and close behind the rival in its line no quicker than it.
const rvLane = () => (townW(car.z) > 0.05 ? 1.6 : 1.75);
function rivalKeep(home, dirz) {
  const S = RIV.s; if (!S || !RIV.C || !rvActive()) return home;
  const g = rvAlong(car.z, RIV.zr, RIV.dirz), Lr = RIV.L * dirz, Lp = rdist(car.x, car.z) * dirz;
  if ((RIV.ph === 'let' || RIV.ph === 'yield') && g > -25 && g < 25) return -RIV.lane * rvLane();
  const lim = (hpW(car.z) > 0.05 ? 2.45 : townW(car.z) > 0.05 ? 2.3 : 2.55) - 1.5 * abs(sin(car.slip || 0));      // (its wheels on the asphalt)
  // (two abreast: its own side of the road's middle, half the gap the two slides need across from it - the rival takes the other half)
  if (RIV.tw && g > -25 && g < 25) return clamp(-RIV.tw.side * RIV.tw.need / 2, -lim, lim);
  if (g < -5.6 || g > 5.6) return home;
  const G = rvGap(car.slip || 0, S.slip);
  const sd = Math.sign(Lp - Lr) || 1; if ((home - Lr) * sd >= G - 0.5) return home;
  return clamp(Lr + sd * (G - 0.5), -lim, lim);
}
function rivalCap() {
  const S = RIV.s; if (!S || !RIV.C || !rvActive()) return 99;
  const g = rvAlong(car.z, RIV.zr, RIV.dirz), dl = abs(RIV.L - rdist(car.x, car.z));
  if (RIV.ph === 'let' && g > -40 && g < 7) return (RIV.p0 || abs(car.v)) - 1.1 * (RIV.ramp || 0);      // (making way: its own pace, 4 km/h off it)
  if (RIV.ph === 'yield') return 99;
  return g > 2.5 && g < 14 && dl < (RIV.tw ? RIV.tw.need : rvGap(car.slip || 0, S.slip)) - 0.3 ? S.v + (g - 6) * 0.4 : 99;
}
// How much of the slide asked for (ts, the nose's turn from the car's travel) the player's self-driving may have, racing the rival (drive.js:
// car.tailK): hardly any while the lead changes hands, or side by side with it - two cars sliding side by side came together - except two
// abreast (RIV.tw), when the most of it that keeps the bodies half a metre apart (the rival's own slide fitted to the gap the same way).
function rivalTailK(ts) {
  if (!RIV.s || !RIV.C || !rvActive()) return 1;
  const g = rvAlong(car.z, RIV.zr, RIV.dirz), S = RIV.s;
  if ((RIV.ph === 'let' || RIV.ph === 'yield') && g > -25 && g < 25) return 0.15;
  // (and two abreast, no more of a slide than the rival's own and a little: the two sliding alike - the rival, out by the edge, has less room)
  if (RIV.tw) { const hd = car.hd !== undefined ? car.hd : car.yaw, fm = min(1, (abs(S.slip) + 0.12) / max(abs(ts), 0.01));
    for (const f0 of [1, 0.8, 0.6, 0.45, 0.3]) { const f = f0 * fm, y = hd + ts * f; if (rvSep(car.x + sin(hd) - sin(y), car.z + cos(hd) - cos(y), y, S.x + RIV.C.ox, S.z + RIV.C.oz, S.yaw) >= 0.45) return f; }
    return 0.15; }
  return g > -4.8 && g < 4.8 && abs(RIV.L - rdist(car.x, car.z)) < 4 ? 0.15 : 1;
}
// (how far over its set speed the player's self-driving may go: getting by the rival as it makes way, 9 km/h - the one behind puts its foot down)
function rivalBoost() { return RIV.s && RIV.C && rvActive() && RIV.ph === 'yield' && rvAlong(car.z, RIV.zr, RIV.dirz) > -9 ? 2.5 : 0; }
