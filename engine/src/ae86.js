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
function e86Step(dt) {
  if (dt <= 0 || dt > 0.25) return;
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
  let vB; { const id0 = RIV.id; RIV.id = 'ae86'; vB = rvBendV(E86.zr, 1, 1.12) * (1 + 0.16 * S.gut); RIV.id = id0; }
  let want = E86.st === 'away' ? min(vB, CP.top / 3.6) : E86.st === 'fade' ? min(vB, max(4, vp * 0.55)) : min(vB, CP.top / 3.6, vp + (g < 0 ? 9 : g > 40 ? 0 : 3));
  // the other cars - the player's, the rival's: by on the side with room, a car's width and more off; no room, it holds back behind
  let Lt = hair ? hair * 3.4 : -1.3; const EIN = hpW(E86.zr) > 0.05 ? 3.4 : 2.6, EDGE = 2.5 - 1.3 * abs(sin(S.slip)), O = [{ g: -g, L: rdist(car.x, car.z), v: vp, sl: car.slip || 0, x: car.x, z: car.z, yaw: car.yaw }];
  if (RIV.s) O.push({ g: rvAlong(RIV.zr, E86.zr, 1), L: RIV.L, v: RIV.s.v, sl: RIV.s.slip || 0, x: RIV.s.x, z: RIV.s.z, yaw: RIV.s.yaw });
  let near = false, urg = false;
  for (const o of O) { if (o.g < -18 || o.g > 14) continue; near = true; const need = rvGap(o.sl, S.slip) + 0.2, d = Lr - o.L;
    let side = E86.side || (abs(d) > 0.8 ? Math.sign(d) : o.L >= 0 ? -1 : 1), lt = o.L + side * need;
    const room = (l) => abs(l) <= (hair && l * hair > 0 ? EIN : EDGE);
    if (!room(lt) && o.g < -6) { side = -side; lt = o.L + side * need; }
    if (!room(lt)) { want = min(want, o.v + clamp(0.5 * (-9 - o.g), -6, 1)); if (o.g < -5) lt = Lr; else { lt = clamp(lt, -EIN, EIN); if (o.g < 3) want = min(want, o.v - 3); } }
    else if (abs(d) < need - 0.25 && o.g < 5) want = min(want, o.v + clamp(0.6 * (-8 - o.g), -6, 2));
    E86.side = side; Lt = lt; if (abs(d) < need - 0.1 && o.g > -10) urg = true;
    const sep = rvSep(o.x, o.z, o.yaw, S.x, S.z, S.yaw); if (sep < 0.5) { if (o.g < 1.5) want = min(want, o.v - 2 * (0.5 - sep) - 0.5); else want = max(want, min(o.v + 1.5, vB)); } }
  if (!near) E86.side = 0;
  Lt = clamp(Lt, -EIN, EIN);
  { const w = urg ? 3.6 : 2.2; E86.Lv += ((Lt - Lr) * w * w - 2 * w * E86.Lv) * dt; const lm = min(urg ? 4 : 3, (urg ? 0.4 : 0.25) * S.v); E86.Lv = clamp(E86.Lv, -lm, lm); E86.L = clamp(Lr + E86.Lv * dt, -EIN, EIN); }
  { const acc = min(CP.acc, CP.pw / max(S.v, 1)), dv = want - S.v; S.v = max(0, S.v + clamp(dv, -8 * dt, acc * dt)); S.brk = dv < -1 ? 1 : 0; }
  // (and the last word: it never moves into another car - a step that would leave the bodies touching is not taken, the one behind held back)
  { const z1 = E86.zr + S.v * dt / nn, q1 = rp(z1, E86.L), y1 = hA(z1) + S.slip; let ok = true;
    for (const o of O) if (o.g > -12 && o.g < 12 && rvSep(o.x, o.z, o.yaw, q1[0], q1[1], y1) < 0.12) { if (o.g < 2) { ok = false; S.v = max(0, min(S.v, o.v - 1.5)); } else S.v = min(max(S.v, o.v + 2), CP.top / 3.6); }
    if (ok) E86.zr = z1; }
  // its heading along its path, the nose turned into the bend a little by how hard it turns - a tidy slide, never a wide one
  const kk = kq(0);
  const ts = clamp(S.v * S.v * kk / 6, -1, 1) * 0.42 * clamp((S.v - 6) / 8, 0, 1) * (O.some((o) => o.g > -9 && o.g < 7) ? 0.3 : 1) * (1 - 0.7 * S.gut);
  S.slip += (ts - S.slip) * (1 - exp(-dt * 4));
  const q = rp(E86.zr, E86.L), hd = hA(E86.zr) + atan2(E86.Lv, max(S.v, 2));
  S.x = q[0]; S.z = q[1]; S.y = surf(q[0], q[1], S.y + 1); S.hd = hd; S.yaw = hd + S.slip;
}
