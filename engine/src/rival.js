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
const RV_CORNERS = [[0.95, 2.15], [-0.95, 2.15], [0.95, -2.15], [-0.95, -2.15]];      // (a car's body, 4.3 x 1.9 m, its corners from its middle)
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
function rvNeed(g, s1, s2, side, m = 0.5) { for (let d = 2.4; d < 7; d += 0.1) if (rvSepL(0, 0, s1, side * d, g, s2) >= m) return d; return 7; }
// Whether the road from here on is fit to drift two abreast: its full width, out of town, and no switchback, bridge, tunnel nor underpass -
// for as far as the cars go in six and a half seconds at v, and 80 m at the least. (It was 60 m whatever the speed: at 130 km/h that is
// under two seconds, the two had not parted when they came to a bridge, and went on to it side by side, sliding - one of them into the
// end of its balustrade. Parting takes the following car back to 7 m behind, which wants several seconds.)
function rvTwinOK(z0, dirz, v = 0) { const nn = rvNN(z0), look = max(80, abs(v) * 6.5);
  for (let d = 0; d <= look; d += 10) { const z = z0 + dirz * d / nn; if (townW(z) > 0.02 || hpW(z) > 0.02 || brSpan(z) || inTun(z) || udOf(z)) return false; }
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
    // (a pass is done when the one that came by is two car lengths and more clear - 11 m, not 7: at 7 it pulled back across the other's nose
    // as soon as its tail was past. And having passed, each keeps the lane it passed in a few seconds more, easing back to its line: RIV.back)
    RIV.back = max(0, (RIV.back || 0) - dt);
    if (g > 11 && (RIV.ph === 'follow' || RIV.ph === 'let')) { if (RIV.ph === 'let') RIV.back = 3.5; RIV.ph = 'lead'; RIV.pt = 14 + Math.random() * 10; }
    else if (g < -11 && (RIV.ph === 'lead' || RIV.ph === 'yield')) { if (RIV.ph === 'yield') RIV.back = 3.5; RIV.ph = 'follow'; RIV.pt = 12 + Math.random() * 8; }
    // (the lead changes hands only where there is room for it to be done well: the next 100 m near straight and the full width of the road - no
    // bridge, no tunnel, no underpass, no switchback, no bend to speak of - and with neither car sliding: started mid-drift, or at a bridge's
    // end, the one giving way was seen to brake hard out of the slide and the two to squeeze by in a narrow place)
    else if (RIV.pt <= 0 && (RIV.ph === 'lead' || RIV.ph === 'follow')) { if ((RIV.tick % 10 === 0) && !RIV.tw && rvSwapOK(RIV.zr, dirz) && rvSwapOK(car.z, dirz) && abs(sp0) < 0.12 && abs(S.slip) < 0.12 && !RIV.away && vp > 8 && S.v > 8) {      // (and both moving: a swap begun with the player stopped held the rival to its speed then - none)

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
  if (RIV.tick % 10 === 0) { const vq = max(abs(S.v), abs(car.v)); RIV.twOK = rvTwinOK(RIV.zr, dirz, vq) && rvTwinOK(car.z, dirz, vq); }
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
      // (0.8 m between the bodies two abreast, not 0.5: at 0.5 they ran right on the line where the last word below steps in, and it and the
      // spring took the rival in and out by turns all through the bend - the car shook)
      T.need = max(rvNeed(T.part ? g : T.gT, 0.42 * ksg, 0.42 * ksg, T.side, 0.8), rvNeed(g, sp, S.slip, T.side, 0.8)); } }
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
  // (in front and near, never more than 9 km/h quicker than the player: let go at its own race pace the moment it was by, it leapt away)
  if (act && RIV.ph === 'lead') vCap = g > 12 ? max(vp - 1.2, min(vRace + 0.5, vp + 0.25 * (12 - g) + 1.2)) : min(vRace + 0.5, vp + 2.5);
  // (the last seconds before its turn to lead, it closes right up - the pressure on - into the player's slipstream)
  // (behind, close - a tandem: two lengths back, a little more while either slides, its tail out - and following the player's slide with its own,
  // which the room left for its slide below now allows: kept 9 to 14 m back with no slide at all within 14 m of the player, it ran behind straight)
  if (act && RIV.ph === 'follow') vCap = vp + clamp(0.4 * ((RIV.pt < 5 ? -6 : -7) - 2.5 * abs(sin(sp)) - 2 * abs(sin(S.slip)) - g), -3, 3);
  // (two abreast: held level with the player, a metre off, by its speed - the player goes as it goes)
  if (tw) vCap = vp + clamp(0.7 * (tw.gT - g), -5, 4);
  // (driven by hand the player keeps to whatever lane it likes: if it is in the one the rival was making for, the rival takes the other - but not
  // while the two are side by side, when crossing over would cut across it. Picked once from where the player was as it began, the rival was
  // seen to pull over in front of a player who had come back into that lane, and be run into.)
  if (act && RIV.ph === 'yield' && !auto.on && abs(g) > 6 && abs(Lp - RIV.lane * LANE) < 1.2) RIV.lane = -RIV.lane;
  if (act && RIV.ph === 'yield') { Lt = RIV.lane * LANE; vCap = auto.on ? max(RIV.v0 || S.v, vp - 1) - 1.1 * RIV.ramp : min(RIV.v0 || S.v, vp) - 2.5 * RIV.ramp; }
  // (driven by hand the player does not put its foot down to come by, as the self-driving does (rivalBoost): the rival eases off below the
  // player's own speed instead, whatever it is - held at its own pace, it was seen to go on at 119 km/h with the player at 51, and was gone)      // (over into its lane at its own pace, 4 km/h off it - not slowed by the player's speed, which had the two
  // wind each other down to a stop - and the player comes by, its self-driving let 9 km/h over its set speed for it: rivalBoost)
  if (act && RIV.ph === 'let') {
    // the player making way (its self-driving over in the other lane, easing off): into its own lane and by. By hand, the player not moving
    // over, it goes by only where its lane is clear of the player's car by a car's width and more; otherwise it waits a few lengths back.
    const clear = abs(RIV.lane * LANE - Lp) >= GAP && abs(sp) < 0.12; Lt = clear || !ov ? RIV.lane * LANE : Lr;
    vCap = clear ? vp + 0.8 + 1.7 * (RIV.ramp || 0) : vp + clamp(0.4 * (-9 - g), -3, 1);      // (out in its lane: it puts its foot down - over a few seconds, not at a stroke - and goes by)
  }
  // (just by, or just passed: still over in the lane it was in, easing back to its own line)
  if (act && !turn && RIV.back > 0 && RIV.lane) { const kb = sm(0, 3, RIV.back); Lt = Lt + (RIV.lane * LANE - Lt) * kb;
  }
  // (and well ahead - past 20 m - it waits: slower than the player by more the further it is, a sixth of the way back each second, down to a
  // stop if the player has stopped, so the gap closes to 20 m and stays there until the player comes on. Left to its own pace ahead of a player
  // driving by hand and slowing, it drew away out of sight, and was set down behind again.)
  if (act && g > 20) vCap = min(vCap, max(0, vp + clamp(0.3 * (20 - g), -12, 0)));
  // (the player stopping or nearly, with the rival behind and near: it stops 8 m back, in the player's line - not drawn up beside it)
  if (act && !tw && vp < 4 && g < 0 && g > -16) { vCap = min(vCap, max(0, vp + 0.6 * (-8 - g))); if (g < -6.2) Lt = Lp; }
  // The player stopped (for more than a second and a half): the rival does not stand and wait in sight of it - it drives on, by in the
  // other lane if it was behind, and away up the road until it is out of sight (190 m, past what the eye makes out), and stops there. When
  // the player comes on again and draws near - before the rival can be seen - it moves off, and keeps ahead at the pace of waiting (the
  // rule above: slower than the player the further ahead it is), so it is caught up with as before. (RIV.away)
  RIV.stopT = vp < 1.5 ? (RIV.stopT || 0) + dt : 0;
  if (act && !tw && RIV.stopT > 1.5) RIV.away = true;
  if (RIV.away && (!act || (vp > 3 && g < 175) || abs(g) > 250)) RIV.away = false;
  if (RIV.away) { vCap = g < 200 ? (vp > 3 ? vp + 4 : 24) : 0;
    // (going by: on whichever side of the player it is on already, a car's width and more off it - or, no room there, the other)
    if (g < 10) { if (!RIV.awS) { const sd0 = Math.sign(Lr - Lp) || 1; RIV.awS = abs(Lp + sd0 * 2.5) <= EDGE ? sd0 : -sd0; } RIV.side = RIV.awS; Lt = clamp(Lp + RIV.awS * 2.5, -EDGE, EDGE); } else { Lt = -LANE; RIV.awS = 0; } } else RIV.awS = 0;
  // Side by side, each keeps to its own side of the other, GAP apart - the one ahead holding its line, the one coming by finding its room - and
  // the side the rival is on when they come together is the side it keeps until they are apart (RIV.side): it never cuts across the player.
  // (three abreast, ae86.js: its slot across the road, and level with the player or a little ahead or behind by turns)
  const tri = act && typeof triOn === 'function' && triOn();
  if (tri) { Lt = TRI.slot.r; vCap = vp + clamp(0.8 * (TRI.gR - g), -5, 4); }
  const sepB0 = RIV.C && PCAR ? rvSep(car.x + PCAR.ox, car.z + PCAR.oz, car.yaw, S.x + RIV.C.ox, S.z + RIV.C.oz, S.yaw) : 9;
  if (tri) RIV.side = Math.sign(TRI.slot.r - TRI.slot.p) || 1;
  else if (tw) { RIV.side = tw.side; Lt = Lp + tw.side * tw.need; }      // (two abreast: on its side of the player, the gap across that their slides need)
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
  // (slow, or stopped waiting for the player: into its own lane, the left, square to the road - not left standing wherever the racing line
  // had it, out across the middle)
  // (begun early enough - from 50 km/h down, and at once when it is waiting ahead for a player who has slowed - for it to be in its lane
  // before it stops: across the road it moves only as it moves along, and it was seen to stop short of it, out in the other lane)
  if (act && !tw && !tri && !ov && !RIV.away && (S.v < 14 || (g > 20 && vp < 8))) Lt = Lt + (-LANE - Lt) * max(sm(14, 6, S.v), g > 20 && vp < 8 ? 1 : 0);
  Lt = clamp(Lt, -EDGE, EDGE);
  // Across the road on a spring, critically damped: it eases out, glides over, and settles - an S, not a jerk (no faster than 2.2 m/s, or
  // 3.5 m/s to keep clear when the player's car comes over toward it).
  const sepB = RIV.C && PCAR ? rvSep(car.x + PCAR.ox, car.z + PCAR.oz, car.yaw, S.x + RIV.C.ox, S.z + RIV.C.oz, S.yaw) : 9;
  { const urg = ov && (abs(Lr - Lp) < GAP - 0.2 || sepB < 0.4), w = urg ? 3.2 : 1.7, vmax = urg ? 3.5 : 2.2;
    if (RIV.hold && RIV.hold.t > 0) { RIV.hold.t -= dt; Lt = RIV.hold.sd > 0 ? max(Lt, RIV.hold.L) : min(Lt, RIV.hold.L); }      // (the line the last word below took it to, held a moment)
    RIV.Lv = (RIV.Lv || 0) + ((Lt - Lr) * w * w - 2 * w * (RIV.Lv || 0)) * dt; RIV.Lv = clamp(RIV.Lv, -vmax, vmax);
    // (and a car moves across the road only as it moves along it - no more than a fifth of its speed (a half, pulling out slowly), so slowly, the further it is turned: at a
    // standstill, not at all. Its spring alone moved it sideways while it stood waiting, and its nose, following its path, swung round across
    // the lane)
    const lvM = (RIV.away && S.v < 6 ? 0.5 : 0.2) * S.v + 0.02 * (S.v > 0.3 ? 1 : 0);      // (pulling out from behind a stopped car, slowly, it turns more sharply)
    RIV.Lv = clamp(RIV.Lv, -lvM, lvM); RIV.L = (Lr + RIV.Lv * dt) * dirz; }
  // Its speed: what the bends allow its line, its top speed, and what its turn in the race allows; and right behind the player in its line - not
  // out to a side - no quicker than the player: it never runs into the back of it. It pulls away by its engine (power over speed, as drive.js)
  // and brakes at up to 7 m/s2.
  const P = CARS[RIV.id] || CARP, vB = rvBendV(RIV.zr, dirz, aK);
  let vt = min(vB, P.top / 3.6, max(0, vCap));
  // (two abreast, both cars take the bend a good deal slower than either would alone - 88% of it: at the full pace the slides and the gap
  // between them changed faster than either car could follow, and they were seen to twitch keeping apart. rivalCap holds the player's to it.)
  RIV.twV = tw ? vB * 0.88 : null; if (tw) vt = min(vt, RIV.twV);
  // (in the player's line behind it: 6.5 m back and no closer (more while either slides); and the bodies near each other
  // anywhere alongside: it gives way, off the throttle, if it is not the one ahead)
  if (!tri && g > -12 && g < -2.5 && abs(Lr - Lp) < GAP - 0.3 && !(RIV.away && vp < 1.5)) vt = min(vt, vp + clamp(0.5 * ((RIV.ph === 'follow' && RIV.pt < 5 ? -5.8 : -6.5) - 2.5 * abs(sin(sp)) - 2 * abs(sin(S.slip)) - g), -4, 2));
  if (sepB < 0.35 && g < 2 && !(RIV.away && sepB > 0.12 && abs(Lt - Lr) < abs(Lt - Lp))) vt = min(vt, vp - 2 * (0.35 - sepB) - 0.3);
  // Coming up beside the player from behind is for the straights. With no slide agreed between them (tw), it does not come alongside - and if
  // it is there already it drops back, to 9 m behind - when a bend is coming, when the player's car has begun to slide (its tail swings out
  // across the lane beside it), or when the player is moving over toward it: it was seen to hold its place at the player's quarter while the
  // player took the middle of the road and turned in to drift, and with nowhere to go, was struck. (RIV.bk: held a second and a half after.)
  { const LpV = (Lp - (RIV.pLp === undefined ? Lp : RIV.pLp)) / max(dt, 1e-3); RIV.pLp = Lp; RIV.LpV = (RIV.LpV || 0) + (LpV - (RIV.LpV || 0)) * min(1, dt * 6);
    const toward = RIV.LpV * (Math.sign(Lr - Lp) || 1);
    if (act && !tw && !tri && !RIV.away && g < 2 && g > -14 && vp > 8 && (bendS || abs(sp) > 0.14 || (toward > 0.5 && abs(Lr - Lp) < GAP + 1.6))) RIV.bk = 1.5;
    if (RIV.bk > 0) { RIV.bk -= dt; if (!tw && g < 2 && g > -14) vt = min(vt, vp + clamp(0.6 * (-9 - g), -6, 0.5)); } }
  if (RIV.away && g < 10 && g > -12 && S.v < 3 && sepB > 0.2) vt = max(vt, 3);      // (it creeps out from behind the stopped player: across the road it moves only as it moves along)
  const acc = min(P.acc, P.pw / max(S.v, 1)), dv = vt - S.v; S.v = max(0, S.v + clamp(dv, -7 * dt, acc * dt)); S.brk = dv < -1 ? 1 : 0;
  // along the road by its speed, set down on it; its heading by its path, its nose into the slide by how fast the path turns
  RIV.zr += dirz * S.v * dt / nn; const Q = rp(RIV.zr, RIV.L), mx = Q[0] - S.x, mz = Q[1] - S.z;
  // (its heading eased onto the way it has just moved, over some 70 ms: taken raw each frame, every small change in how fast it was moving
  // across the road - its spring settling, the last word below putting it out - turned its nose by as much at once, and the car shook)
  // (when it hardly moves its path says nothing of where it points: then it keeps square to the road)
  const hd0 = S.hd, along = (mx * sin(hd0) + mz * cos(hd0)); if (mx * mx + mz * mz > 1e-8 && S.v > 0.5 && along > 0) S.hd = hd0 + wr(atan2(mx, mz) - hd0) * (1 - exp(-dt * 15)); else if (S.v <= 0.5) S.hd = hd0 + wr(atan2(roadSl(RIV.zr) * dirz, dirz) - hd0) * (1 - exp(-dt * 3)); S.x = Q[0]; S.z = Q[1]; S.y = surf(S.x, S.z, S.y + 1);
  // (drifting a bend: by the same measure as the player's self-driving (drive.js) - three quarters of the sideways pull over 5.5 m/s2 of grip,
  // and no further than the player's car is seen to go, 40 degrees. By a smaller measure of its own, up to 35, it slid half as often as the
  // player and less far; let go to 60, as the player's asks before its own limits, it slid half as far again as the player.)
  // (and in every bend, by its pull, as the player's car is - not only in the tight ones, from about 600 m round - and by the same rules: in town
  // too, its tail kept off the parked scooters by pcSlideRoom below as the player's is; and not while it is level with the player's car - within
  // 4.8 m along and 4 m across, as rivalTailK holds the player's - nor while the lead changes hands (two abreast, the slide fitted to the gap).
  // Kept out of town and straight the whole way past the player, it slid in a third as many bends.)
  const lvl = abs(g) < 4.8 && abs(Lr - Lp) < 4, dS = turn || (lvl && (!tw || tw.part)) ? 0 : 1;
  const yr = wr(S.hd - hd0) / dt, gr0 = gripAt(RIV.zr); let slT = (clamp((hp ? 0.66 : 0.75) * S.v * yr / (5.5 * gr0) * 1.05, -0.7, 0.7) * dS + clamp(0.008 * S.v * yr, -0.06, 0.06) * (1 - dS)) * sm(5, 11, S.v);      // (a slide in the tight bends; otherwise only the few degrees a gripping car's tyres slip)
  // (following close - a tandem - it slides as the player does, near as far, the player's slide its lead: by its own reading of the bend it slid
  // a third as far as the car it chased, and looked to follow it through on grip. The room below still has the last word.)
  if (act && RIV.ph === 'follow' && !tw && g < 0 && g > -16 && abs(sp) > 0.15 && dk > 0.05) slT = Math.sign(sp) * max(abs(slT), 0.9 * abs(sp)) * sm(5, 11, S.v);
  // (and never more of a slide than there is room for: its body, swung out by it, kept on the asphalt and a half metre clear of the player's car
  // - the largest angle that fits, or none. Let slide as the bend asked, its tail went over the edge, through the rails, and into the player.)
  // (The player's car as it is, the two bodies at their places along the road as well as across it: taken by the gap across alone, for
  // anything within 14 m, the car right behind in the player's line - nowhere near its body - was let no slide at all, and went through
  // every bend straight behind the drifting one.)
  // (The room on the road taken by the body as it is turned: its four corners, the tail swung out to the one side only - not, as at first, as much
  // room on both sides as the tail takes on one: kept to the inside of a bend, as its line has it at the apex, it was let next to no slide
  // there, though the tail swings out toward the middle of the road and the whole of it was free.)
  { const Lr2 = RIV.L * dirz, Lp2 = rdist(car.x, car.z) * dirz, near = abs(g) < 9, half = townW(RIV.zr) > 0.05 ? 3.15 : 3.5, ss = Math.sign(slT) || 1;
    // (the corners where they will be drawn - turned about the point 1 m ahead, as pcPose turns the body - and how far each is from the road's
    // middle: laid out square to the road instead, the bend and the turn of the car's path under it put them out by up to 80 cm at a large slide)
    const out = (sl) => { const y = S.hd + sl, c = cos(y), sn = sin(y), ox = S.x + sin(S.hd) - sin(y), oz = S.z + cos(S.hd) - cos(y); let m = 0;
      for (const [lx, lz] of RV_CORNERS) m = max(m, abs(rdist(ox + lx * c + lz * sn, oz - lx * sn + lz * c))); return m; };
    let smax = 0.7; while (smax > 0 && (out(ss * smax) > half || (near && rvSepL(Lp2, 0, sp, Lr2, g, ss * smax) < 0.5))) smax -= 0.04;
    slT = clamp(slT, -max(smax, 0), max(smax, 0)); }
  // (no more of the slide than leaves its tail clear of what stands by the road, looked for along its way: pcSlideRoom)
  if (RIV.tick % 4 === 2) RIV.tailT = pcSlideRoom(RIV.C, S.x, S.z, S.y, S.hd, kn, slT); RIV.tailK = min(RIV.tailT ?? 1, (RIV.tailK ?? 1) + dt * 1.2); slT *= RIV.tailK;
  // (into the slide quickly, out of it more slowly - but at once where there is no room for it)
  // (and never faster than 1.5 rad/s into it, 2.5 out of it: taken out of a slide at the rate of 8 a second when the room ran short, the
  // car's tail was seen to snap straight in a frame or two, close beside the player's car)
  { const up = abs(slT) > abs(S.slip), dS = (slT - S.slip) * (1 - exp(-dt * (up ? 3.5 : abs(S.slip) - abs(slT) > 0.1 ? 8 : 2))); S.slip += clamp(dS, -(up ? 1.5 : 2.5) * dt, (up ? 1.5 : 2.5) * dt); }
  // (its tail kept out of what is beside the road, as the player's)
  if (abs(S.slip) > 0.04 && pcTailHit(RIV.C, S.x, S.z, S.y, S.hd + S.slip, S.hd)) S.slip *= 1 - min(1, dt * 15);
  S.yaw = S.hd + S.slip;
  // The last word on keeping clear of the player's car: the two bodies as they now stand, and if they are under 35 cm apart the rival
  // makes for the line across the road, on its own side of the player, that leaves them 45 cm (within the road's edge) - at up to 6 m/s, and
  // that line held for a moment against the spring above, which would draw it straight back; short of room there it straightens up and gets
  // ahead or drops back, by up to 15 m/s2. (The spring alone, at 3.5 m/s at most, let the gap close to 4 cm with the player's slide swinging
  // toward it two abreast at 108 km/h. Put out the whole way at once, and its speed changed at once, the rival jumped about: the spring took it
  // back the next frame and it was put out again - in the cinematic view the car was seen to shake.)
  if (act && PCAR && RIV.C) {
    const pose = () => rvSep(car.x + PCAR.ox, car.z + PCAR.oz, car.yaw, S.x + RIV.C.ox, S.z + RIV.C.oz, S.yaw);
    const place = (Ln) => { RIV.L = Ln * dirz; const Q2 = rp(RIV.zr, RIV.L); S.x = Q2[0]; S.z = Q2[1]; S.y = surf(S.x, S.z, S.y + 1); };
    let sep = pose();
    if (sep < 0.35) { const Lr0 = RIV.L * dirz, sd = Math.sign(Lr0 - rdist(car.x, car.z) * dirz) || RIV.side || 1; let Lw = Lr0;
      for (let d = 0.05; d <= 1.6 && sep < 0.45; d += 0.05) { Lw = clamp(Lr0 + sd * d, -EDGE, EDGE); place(Lw); sep = pose(); if (abs(Lw) >= EDGE) break; }
      const sepW = sep, step = clamp(Lw - Lr0, -6 * dt, 6 * dt); place(Lr0 + step); sep = pose(); RIV.hold = { L: Lw, sd, t: 0.8 }; RIV.Lv = step / dt;
      // (no room to the side - at the road's edge - or the bodies about to touch while it is still getting over)
      if (sepW < 0.3 || sep < 0.1) { S.slip *= 1 - min(1, dt * 6); S.yaw = S.hd + S.slip;
        if (g >= 1) S.v += min(max(min(vp + 3, P.top / 3.6) - S.v, 0), 15 * dt); else S.v -= min(max(S.v - max(0, vp - 6), 0), 15 * dt); } } }
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
  if (typeof triOn === 'function' && triOn()) { const lt = 2.45 - 1.5 * abs(sin(car.slip || 0)); return clamp(TRI.slot.p * dirz, -lt, lt); }      // (three abreast: its slot)
  if ((RIV.ph === 'let' || RIV.ph === 'yield') && g > -25 && g < 25) return -RIV.lane * rvLane();
  if (RIV.back > 0 && RIV.lane && g > -25 && g < 25) { const kb = sm(0, 3, RIV.back); home = home + (-RIV.lane * rvLane() - home) * kb; }      // (just by, or just passed: back to its line by degrees)
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
  if (typeof triOn === 'function' && triOn()) return TRI.v;      // (three abreast: the pace the bends allow the three, less a little)
  const g = rvAlong(car.z, RIV.zr, RIV.dirz), dl = abs(RIV.L - rdist(car.x, car.z));
  if (RIV.ph === 'let' && g > -40 && g < 7) return (RIV.p0 || abs(car.v)) - 1.1 * (RIV.ramp || 0);      // (making way: its own pace, 4 km/h off it)
  if (RIV.ph === 'yield') return 99;
  const c0 = g > 2.5 && g < 14 && dl < (RIV.tw ? RIV.tw.need : rvGap(car.slip || 0, S.slip)) - 0.3 ? S.v + (g - 6) * 0.4 : 99;
  return RIV.tw && RIV.twV ? min(c0, RIV.twV) : c0;
}
// How much of the slide asked for (ts, the nose's turn from the car's travel) the player's self-driving may have, racing the rival (drive.js:
// car.tailK): hardly any while the lead changes hands, or side by side with it - two cars sliding side by side came together - except two
// abreast (RIV.tw), when the most of it that keeps the bodies half a metre apart (the rival's own slide fitted to the gap the same way).
function rivalTailK(ts) {
  if (!RIV.s || !RIV.C || !rvActive()) return 1;
  const g = rvAlong(car.z, RIV.zr, RIV.dirz), S = RIV.s;
  if (typeof triOn === 'function' && triOn()) return 0.3;      // (three abreast: only a little of a slide)
  if ((RIV.ph === 'let' || RIV.ph === 'yield') && g > -25 && g < 25) return 0.15;
  // (and two abreast, no more of a slide than the rival's own and a little: the two sliding alike - the rival, out by the edge, has less room)
  if (RIV.tw) { const hd = car.hd !== undefined ? car.hd : car.yaw, fm = min(1, (abs(S.slip) + 0.12) / max(abs(ts), 0.01));
    for (const f0 of [1, 0.8, 0.6, 0.45, 0.3]) { const f = f0 * fm, y = hd + ts * f; if (rvSep(car.x + sin(hd) - sin(y), car.z + cos(hd) - cos(y), y, S.x + RIV.C.ox, S.z + RIV.C.oz, S.yaw) >= 0.75) return f; }
    return 0.15; }
  return g > -4.8 && g < 4.8 && abs(RIV.L - rdist(car.x, car.z)) < 4 ? 0.15 : 1;
}
// (how far over its set speed the player's self-driving may go: getting by the rival as it makes way, 9 km/h - the one behind puts its foot down)
function rivalBoost() { return RIV.s && RIV.C && rvActive() && RIV.ph === 'yield' && rvAlong(car.z, RIV.zr, RIV.dirz) > -9 ? 2.5 * (RIV.ramp || 0) : 0; }
