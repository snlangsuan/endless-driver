// --------------------------------------------------------------------------------------------------------- driving (Endless)
// The car on the one long road: steering by hand or by the self-driving, what stops it, the flying camera, and the lines of text at the top left.
let hold = false;
// How the car being driven drifts - a profile for each car, so that another can be given its own. gutter: whether the self-driving and the
// help ride a switchback's gutter (a wheel run in the channel, held round by its lip) - a trick for a car that sits high on tall tyres; the
// MX-5 and the GR86 sit low on their 17- and 18-inch wheels, sills and spoilers a hand off the road: they keep their wheels out of the gutter and take the hairpin
// on its tyres. slide: how far the tail swings out (1: up to 60 degrees); snap: how quickly the nose follows into the slide; scrub: how much
// speed a slide costs; grip: how hard it can corner sideways on a pass, m/s2 per unit of the road's grip.
const CARS = {
  mx5: { gutter: false, slide: 0.72, snap: 1.35, scrub: 0.8, grip: 9.0, top: 220, acc: 7, pw: 105 },      // light, short, rear-driven: a quick, tidy slide, not a big angle
  gr86: { gutter: false, slide: 0.82, snap: 1.2, scrub: 0.85, grip: 9.2, top: 216, acc: 7.2, pw: 112 },  // longer and heavier, more power: a bigger, slower-building slide that it holds; as low as the MX-5 - 13 cm under it - so out of the gutter too
  // (not one the player drives: the white car of the passes - ae86.js. Light, modest power; quick through the hairpins)
  ae86: { gutter: true, slide: 0.7, snap: 1.4, scrub: 0.8, grip: 10.0, top: 185, acc: 6.4, pw: 92 },
  truck: { gutter: true, slide: 1, snap: 1, scrub: 1, grip: 9.4, top: 180, acc: 5.5, pw: 85 },              // (the earlier tuning, kept for a taller car)
};
// (top: its top speed, km/h; acc: the most the driven wheels give pulling away, m/s²; pw: its power over its weight, W/kg - what it pulls
// with falls as the speed rises, power over speed, until the air's drag, with the square of the speed, takes it all at the top speed)
let CARP = CARS[PCAR_ID] || CARS.mx5;
auto.limit = min(auto.limit, CARP.top);      // (the self-driving's speed: no more than this car can do)
const alongRoad = (h) => (cos(h - Math.atan2(roadSl(car.z), 1)) >= 0 ? 1 : -1);      // +1 going the way z grows along the road, -1 the other
// The weather in the tyres. grip: 1 on a dry road; a wet one - in the rain and for a while after, as long as the road stays wet - grips at 70%,
// and the snowfield's road in the cool season at 45%. Cornering speed goes as the square root of it (15% less when wet, 30% on snow), the brakes
// take longer to stop the car, and a slide steps out more readily, runs longer and is caught more slowly. (car.grip: the tyres' sound too.)
// How far out from the road's middle the drawn car's wheels on one side of it are (side: +1 or -1, the side of the road; which: 0 the front pair,
// 2 the rear) with its middle at x, z - as playercar.js lays them: each car's own wheels (PCAR.WH), the car turned, sliding, about a point near
// its front. (The gutter was found by the car's middle and a fixed 0.75 m: sideways in a drift the front wheel on the inside reaches further in
// than that, and it ran over the channel's far lip while the car was taken to be in it.)
const wheelOut = (x, z, side, which) => { const C = typeof PCAR !== 'undefined' && PCAR; if (!C) return rdist(x, z) * side + 0.75;
  const hd = car.hd !== undefined ? car.hd : car.yaw, ox = sin(hd) - sin(car.yaw), oz = cos(hd) - cos(car.yaw), cy = cos(car.yaw), sy = sin(car.yaw); let m = -99;
  for (const w of [which, which + 1]) { const lx = C.WH[w][0], lz = C.WH[w][1]; m = max(m, rdist(x + ox + lx * cy + lz * sy, z + oz - lx * sy + lz * cy) * side); }
  return m; };
const gripAt = (z) => min(1 - 0.3 * (AT.wet || 0), 1 - 0.55 * snowW(z) * (AT.cool || 0));
function drive(dt) {
  const grip = car.grip = gripAt(car.z);
  let thr = K('KeyW') - K('KeyS'), st = K('KeyA') - K('KeyD'); const onRoad = abs(rdist(car.x, car.z)) < (hpW(car.z) > 0.05 ? 4.45 : 3.9) + svW(car.z);      // (a switchback's gutter is driven along as road: see below)      // (the frontage roads beside an underpass are road too: the car rolls on them as on the main road, not as on rough ground)
  if (auto.on) {
    // Keep to the middle of the left lane. The steering has three parts: what the bend itself asks for at this speed (so the car turns with the
    // road and is not left behind by it), the difference between where the car points and where the road points just ahead, and a pull back
    // toward the middle of the lane. (Aiming at a point far ahead, as before, cut every left-hand bend short by up to 2.5 m - off the road.)
    // (Which way along the road it is going: judged against the road, by the way the car travels. Judged by where its nose pointed against the
    // world's z, a car drifting through a hairpin - the road there 60 degrees across, the nose 40 more out into the slide - was taken to be
    // going the other way, and the self-driving turned it round and off the road.)
    const dirz = alongRoad(DRIFT && car.hd !== undefined ? car.hd : car.yaw), sl0 = roadSl(car.z), nn = Math.sqrt(1 + sl0 * sl0), va = abs(car.v);
    const hd = (zq) => atan2(roadSl(zq) * dirz, dirz), wrap = (q) => q - Math.round(q / TAU) * TAU;
    const pv = (0.5 + va * 0.08) / nn, th = hd(car.z + dirz * pv), kap = wrap(hd(car.z + dirz * (pv + 1.5 / nn)) - hd(car.z + dirz * (pv - 1.5 / nn))) / 3;
    // Something solid standing in the lane ahead - a thing left on the road, a wall's corner, a parked machine out too far - is steered round:
    // the car looks along its line as far as it needs to stop in (and a little more), and if that line is not clear it takes the nearest line
    // across the road that is - nearer the middle first, then the other lane (nothing comes the other way), then out by the edge - goes round
    // at a walking-to-town pace, and comes back to its lane when the lane is clear again. If no line is clear it stops short of the thing.
    // (Looked at every fourth frame: it is a search through everything solid nearby. auto.lat is the line being driven, metres left of the
    // road's middle; auto.stopIn how far off the thing is that nothing gets round.)
    if (auto.lat === undefined) { auto.lat = clamp(rdist(car.x, car.z) * dirz, -9, 9); auto.aim = 1.7; auto.stopIn = -1; auto.tick = 0; }      // (from where the car is: switched on up on a frontage road, it first swung for the lane below)
    // (Drifting, the self-driving keeps to no lane: it takes the line a racing driver takes - wide before a bend, the inside at its apex, wide
    // again on the way out - using the whole road. On the switchbacks of a pass its inside wheels run in the gutter at the apex (3.3 m out:
    // the wheels 4 m out, in the channel), as on a mountain road, the gutter holding the car round the bend - see the grip below.)
    let home = 1.7;
    // (At an underpass the self-driving goes down through it or - drifting or not - keeps to the street, along a frontage road:
    // it moves out onto it as it opens, 136 to 96 m before the middle, and back after. Measured square to the road, as the frontage roads are
    // built; lat is along x, so it is made the longer by the road's slant.)
    // (it follows the frontage road's opening a dozen metres ahead, so that it is out on it - 7.2 m from the middle - before the walls begin)
    // (no further out than the asphalt reaches where the car is - its side a hand inside the kerb - or it drove up onto the footpath as the road opened)
    // (Which way it goes is drawn afresh each time it comes to one: the frontage road on its own side, down through the middle, or across the
    // other carriageway to the frontage road on the far side - a third each. Drifting, it always takes the middle, the quickest line: measured
    // through three underpasses it kept above 90 km/h there, where either frontage road - out and back across the lanes, over the cross street -
    // dragged it down to 35-70 km/h and cost 2-5 s.)
    let front = false; { const zq = car.z + dirz * 2; if (udOf(zq) && (svW(zq) > 0.05 || svW(car.z) > 0.05)) { if (auto.udZ !== UD.zc) { auto.udZ = UD.zc; auto.udPick = floor(Math.random() * 3) - 1; }
      // (Already up on a frontage road - however it got there - it keeps to that one: aimed at the middle line, it steered for the cutting below
      // the whole length of the underpass, pressed against the parapet.)
      const dq = udip(car.z), upS = dq > 0.3 && abs(rdist(car.x, car.z)) > 4.6 && car.y > roadY(car.z) + dq * 0.5 ? Math.sign(rdist(car.x, car.z) * dirz) : 0, pk = upS || (DRIFT ? 0 : auto.udPick);
      if (pk) { front = true; home = pk * (1.7 + min(5.5, svW(car.z) * 1.02)) * nn; } } }
    if (DRIFT && !front) { const kq = (d) => wrap(hd(car.z + dirz * (d + 1.5) / nn) - hd(car.z + dirz * (d - 1.5) / nn)) / 3, kn = kq(6 + va * 0.5), kf = kq(18 + va * 1.2), hpq = hpW(car.z) > 0.05, slq = abs(car.slip || 0), reach = 0.9 * cos(slq) + 2.1 * sin(slq),
        gIn = Math.sign(kn) * dirz || 1, gW = CARP.gutter ? clamp(4.15 - (wheelOut(car.x, car.z, gIn, 0) - rdist(car.x, car.z) * gIn), 2.9, 3.4) : 3.3,
        inner = hpq ? ((auto.noGut || !CARP.gutter) ? min(1.9, 6.0 - reach) : mix(min(2.5, 6.0 - reach), gW, sm(0.04, 0.065, abs(kn)))) : (townW(car.z) > 0.05 ? 2.3 : 2.6) - 2.1 * abs(sin(car.slip || 0)), outer = hpq ? min(2.5, 6.0 - reach) : inner;
      // (Toward the gutter by degrees with the bend's tightness - 3.45 m only in a real hairpin: switched to it all at once at one tightness, the
      // car was flung across the road at the channel in every bend that passed it, and in too deep.)
      // (gW: the car's middle where its front wheel on the inside comes to the channel's middle, 4.15 m out (the channel 3.86 to 4.44) - by the
      // wheel as it is drawn, which sideways in the slide is up to a metre further in than the middle: aimed by the middle at 3.3 m the wheel
      // came in at the far lip and over it. At 3.45, with the car's overshoot, they went over it and against the rail. Once in, the car is held there (auto.gLock), so its sway no longer has them in and out.)
      // (On the switchbacks the inside wheels go down into the gutter only at a hairpin's apex - a bend under 25 m round - where it pays; through the
      // easier bends the wheels stay on the asphalt, 3.4 m out at most, short of the channel. And the car's corners - swung out by the slide, 0.9 m
      // straight, 2.2 m sideways at 50 degrees - are kept short of the guard rail at 6.4 m: in the gutter by the slide held in (see ts below).)      // (sideways in a drift, the nose swings 2 m out toward the inside of the bend: the line is kept in by that much, or the nose ran along the guard rail)      // (in town no nearer the kerb than its footpath allows)
      { const h = kn * 75 - kf * 30; home = h * kn > 0 ? clamp(h, -inner, inner) : clamp(h, -outer, outer); }
      // (racing the rival, a tighter line - six tenths of the road's width either side of the middle, not all of it: the wheels stay on the
      // asphalt, and the car behind has a side to come by on)
      if (typeof rvActive === 'function' && rvActive()) home *= 0.6;
      if (typeof rivalKeep === 'function') home = rivalKeep(home, dirz);      // (racing the rival: alongside it, its own side of it - rival.js)
      // Round a hairpin the gutter is ridden like a tram's rail: once the inside wheels are down in it at the start of the bend, the car keeps
      // them there all the way round the U - held in the channel's middle - and only when the road straightens, or turns the other way, does it
      // draw them out. (Steered to a line beside it, the wheels went in and out two and three times a bend, the car seeming to hesitate, and the
      // speed planned for the gutter was lost each time.) auto.gLock: the side of the road it is held on, 0 when free.
      if (hpq && !auto.noGut && CARP.gutter) { const rs = rdist(car.x, car.z), ins = Math.sign(kn) * dirz;
        if (!auto.gLock && (car.gut || 0) > 0.5 && abs(kn) > 0.03 && Math.sign(rs) === ins) auto.gLock = Math.sign(rs);
        if (auto.gLock && ((abs(kn) < 0.015 && abs(kf) < 0.015) || (abs(kn) > 0.01 && ins !== auto.gLock))) auto.gLock = 0;
        if (auto.gLock) { const wo = wheelOut(car.x, car.z, auto.gLock, 0) - rdist(car.x, car.z) * auto.gLock; home = auto.gLock * dirz * clamp(4.15 - wo, 3.05, 3.5); auto.lat = home; } } else auto.gLock = 0; }      // (the front wheel on that side held at the channel's middle, 4.15 m out)
    if (auto.tick++ % 4 === 0) { const look = 9 + va * 1.5 + va * va / 12, yq = car.y;
      const cur = rdist(car.x, car.z) * dirz;      // (near the car the line asked about starts from where the car is, and is over on L by 8 m ahead)
      const clearTo = (L) => { for (let s = 3.5; s < look; s += 2.5) { const q = rp(car.z + dirz * s / nn, mix(cur, L, min(1, s / 8)) * dirz); if (solidAt(q[0], q[1], surf(q[0], q[1], yq), 1.2) > 0) return s; } return -1; };
      const own = clearTo(home); auto.stopIn = -1; auto.dodge = own >= 0;
      if (own < 0) auto.aim = home; else { let best = null; for (const L of [auto.aim, 0.7, -0.5, -1.7, 2.5]) if (abs(L - home) > 0.3 && clearTo(L) < 0) { best = L; break; } if (best === null) auto.stopIn = own; else auto.aim = best; } }
    if ((DRIFT || front) && !(auto.dodge && !front)) auto.aim = home;
    // (On a pass, drifting, the line moves out toward the gutter no faster than 2.6 m/s, and the car is turned toward it more gently: at 4.5 m/s,
    // sideways in a slide, the car overshot it - its wheels over the channel's far lip, against the guard rail, and thrown back.)
    const hpA = DRIFT && !front && hpW(car.z) > 0.05;
    { const ls = DRIFT || front ? (hpA && abs(auto.aim) > abs(auto.lat) ? 2.6 : 4.5) : 2.2; auto.lat += clamp(auto.aim - auto.lat, -dt * ls, dt * ls); }
    const e = rdist(car.x, car.z) * dirz - auto.lat;                       // how far to the left of the line it is driving the car is
    const rate = 1.7 * clamp(car.v / 5, -1, 1) / (1 + va * 0.03);     // how fast full lock turns the car (the same rule as below)
    // (drifting, the car's path is its travel, car.hd - its nose is held out into the slide on top of that: see below)
    st = clamp(car.v * kap / max(rate, 0.2) + wrap(th - atan2(e * (hpA ? 1.3 : 2.0), 3 + va * 0.35) - (DRIFT && car.hd !== undefined ? car.hd : car.yaw)) * 3.2, -1, 1);
    const kv = (zq) => abs(roadX(zq + 4) - 2 * roadX(zq) + roadX(zq - 4)) / 16 / Math.pow(1 + roadSl(zq) ** 2, 1.5);
    const ahead = zlim(car.z + dirz * (6 + car.v * car.v / 9) / nn);                              // the sign coming up, seen in time to be down to its speed on reaching it
    // (drifting: no sign is minded, nor any light, and the bends are taken faster - the tail out)
    // (On the switchbacks the bends were once taken at 7 m/s2 sideways rather than 9.5: at 46 km/h the car ran a metre wide of its line at a
    // hairpin's apex, its nose out over the guard rail. With the line now eased toward the gutter and held in it, 9.4 is kept to - through three
    // passes 12% quicker, never off its line. The gutter's help is planned bend by bend, below - by where the car is, all or nothing, the target
    // dropped the moment a wheel came out and the car was braked hard: a jolt after every gutter.)
    // The speed the bends allow: the road ahead is looked along for 100 m, and the car goes no faster than lets it ease down - gently, 4 m/s2
    // drifting, 2 otherwise - to what each bend on it allows by the time it gets there. (It looked at two points only, one near and one a little
    // way on: it sped up on every short straight between bends and braked hard at the next - two jerks to every bend, and a car that never
    // flowed. Now through a run of bends close together it keeps the pace they all allow.)
    // (Drifting round a switchback, the tyres alone hold 9.4 m/s2 sideways. A wheel down in the gutter does more: its lip holds the car like a
    // rail, half as much again - so a hairpin, where the tyres alone would have the car braking, is planned for the gutter and taken faster;
    // the easier bends, where the tyres suffice, are not, and the wheels stay up on the asphalt. auto.noGut: never use it - for comparison.)
    const gutOK = DRIFT && !auto.noGut && CARP.gutter, aT = (DRIFT ? 9.5 : 4.5) * grip, aHp = CARP.grip * grip, aG = aHp + 3.6 * grip * (0.6 + 0.4 * grip), dec = (DRIFT ? 4 : 2) * grip; let vBend = 99;
    const aAt = (zq, kb) => (DRIFT && hpW(zq) > 0.05 ? mix(aHp, aG, gutOK ? sm(0.04, 0.065, kb) : 0) : aT);      // (by degrees with the bend's tightness: a bend just either side of the line had the speed jump)
    // (Drifting, the line is a racing driver's - wide in, the inside at the apex, wide out - and that line's bend is gentler than the road's: by
    // the width it uses, the more so the less the road turns in all. So the speed a bend allows is worked out for the line's radius, the road's
    // radius plus LW / (1 - cos(half the turn)), the turn taken over 25 m either side; a hairpin, turning right round, gains about LW.)
    const LW = DRIFT && !front ? 3.2 : 0, hdA = (zq) => atan2(roadSl(zq), 1);
    { let zz = car.z, sL = 0, xx = roadX(zz); for (let i = 0; i < 60 && sL < 100; i++) { const zn = zz + dirz * 2, xn = roadX(zn); sL += Math.hypot(xn - xx, 2); zz = zn; xx = xn;
      let kb = kv(zz); if (LW && kb > 0.004) { const tn = min(PI, abs(wrap(hdA(zz + 25) - hdA(zz - 25)))), R2 = 1 / kb + LW / max(1 - cos(tn / 2), 0.08); kb = 1 / R2; }
      const vb = Math.sqrt(aAt(zz, kv(zz)) / max(kb, 1e-4)); vBend = min(vBend, Math.sqrt(vb * vb + 2 * dec * max(0, sL - 4))); } }
    // (In fog and at night it sees less of the road: a bend it cannot see yet might be anything, so it goes no faster than lets it slow to
    // 43 km/h within what it can see - 100 m on a clear day, much less in thick fog, and a third less in the dark.)
    { const vis = min(100, 2.5 / max(AT.fog || 0, 1e-4)) * (1 - 0.3 * (AT.night || 0)); vBend = min(vBend, Math.sqrt(144 + 2 * dec * vis)); }
    let vt = min((auto.signs && !DRIFT ? min(auto.limit, zlim(car.z), ahead) : auto.limit) / 3.6, vBend);
    if (typeof rivalBoost === 'function') vt = min(vBend, vt + rivalBoost());      // (getting by the rival as it makes way: a little over the set speed)
    if (typeof rivalCap === 'function') vt = min(vt, rivalCap());      // (close behind the rival in its line: no quicker than it)
    // traffic lights: stop at the line (short of the zebra crossing) for red, and for amber if there is room to; wait; go on green
    const tl = tlNext(car.z, dirz); hold = false;
    if (tl && !DRIFT) { const dist = (tl[0] - car.z) * dirz * nn - 10.9, sg = tlState(tl[1], time);            // from the car's nose to the line
      if (dist > -1.5 && (sg === 2 || (sg === 1 && dist > car.v * car.v / 10))) { vt = min(vt, dist < 0.4 ? 0 : Math.sqrt(2 * 2.4 * dist)); hold = dist < 0.4; } }          // never over the driver's own limit, nor the sign's, nor what the bend allows
    if (auto.dodge && (abs(auto.lat - home) > 0.15 || auto.aim !== home)) vt = min(vt, 9); if (auto.stopIn >= 0) { vt = min(vt, auto.stopIn < 5.5 ? 0 : Math.sqrt(2 * 2.4 * (auto.stopIn - 5.5))); }      // round a thing: slowly; nothing gets round: stop short of it
    // (throttle and brake by how far off the speed is: the brake all or nothing, the car was braked and let go on alternate frames)
    const dv = vt - car.v; thr = dv > 0.3 ? min(1, dv * 0.6) : dv < -0.8 ? max(-1, (dv + 0.8) * 0.5) : 0; if (hold && car.v > 0.2) thr = -1;
    // Stuck off the road - nosed into a tree, a wall, a fence, standing there a second and more - it backs out: two seconds in reverse, the
    // wheel over so that the nose swings round to point at the road - at its line on it, as the steering below aims - and then on again. (It had
    // no reverse, and sat there for good.)
    const offR = abs(rdist(car.x, car.z)) > (hpW(car.z) > 0.05 ? 4.45 : 3.9) + svW(car.z) + 0.3;
    auto.stk = offR && abs(car.v) < 1 && !hold && !(auto.back > 0) ? (auto.stk || 0) + dt : 0;
    // (Four tries and still off the road - down in a hollow below a high road, a step too tall to climb, with no way up - and it is set back on
    // its lane where it left it, pointing along the road: the self-driving is never left stranded.)
    if (!offR) auto.fails = 0;
    if (auto.stk > 1.2) { auto.stk = 0; auto.fails = (auto.fails || 0) + 1; if (auto.fails <= 4) { auto.back = 2; car.hd = car.yaw; }
      else { const s = roadSl(car.z), zf = car.z + (car.x - roadX(car.z)) * s / (1 + s * s), q = rp(zf, 1.7 * dirz); car.x = q[0]; car.z = q[1]; car.y = surf(q[0], q[1]); car.yaw = car.hd = atan2(roadSl(zf) * dirz, dirz); car.v = 0; car.slip = 0; auto.fails = 0; auto.lat = undefined; } }
    if (auto.back > 0) { auto.back -= dt; thr = -0.6; st = -clamp(wrap(th - atan2(e * 2.0, 3) - car.yaw) * 2, -1, 1); if (!offR && auto.back < 1.5) auto.back = 0; }
  }
  if (K('Space')) thr = min(thr, 0);      // (braking, the foot is off the throttle - the self-driving's too)
  const hb = K('HB'); if (hb > 0) thr *= 1 - 0.8 * hb;      // (the handbrake on: the driven wheels held - see below)
  // Pulling: as much as the tyres give at low speed (more with Shift, the pedal to the floor), then the engine's power over the speed. Held
  // back by the air, with the square of the speed - set so that power and drag meet at the car's top speed, 220 km/h for the MX-5 - by the
  // tyres rolling, by the engine's braking with the throttle let go, and off the road by the rough ground. (Before, a drag that grew only with
  // the speed held the car to 138 km/h on the throttle and 228 with Shift, and lifting off slowed it like a brake.)
  const vA = abs(car.v), vTop = CARP.top / 3.6, cd = (CARP.pw / vTop - 0.15) / (vTop * vTop), push = min(K('ShiftLeft') ? CARP.acc * 1.3 : CARP.acc, CARP.pw / max(vA, 1));
  car.v += (thr > 0 ? push * thr : thr < 0 ? (car.v > 0.5 ? (auto.on ? -7 : -18) * grip : auto.on && !(auto.back > 0) ? 0 : -min(5, push)) : 0) * dt;
  car.v -= (Math.sign(car.v) * (cd * vA * vA + 0.15 + (thr <= 0.02 ? 0.035 * vA : 0)) + (onRoad ? 0 : car.v * 0.4 + Math.sign(car.v) * 0.7)) * dt;      // (off the road: the ground drags - less than it did (0.7 v + 1.05): with a slide's scrub on top, a car steering back to the road was all but stopped)
  // Space: the brake - hard (8 m/s², a little short of locking the wheels; less on rough ground), in either direction, down to a standstill and no
  // further (it never drives the car backwards); it overrides the throttle and the self-driving, which takes up again when it is let go.
  if (K('Space')) { const b = (onRoad ? 8 : 5.5) * grip * dt; car.v = abs(car.v) <= b ? 0 : car.v - Math.sign(car.v) * b; }
  // The handbrake (a game pad's Square: K('HB')): the rear wheels locked. It slows the car - less hard than the brake, 5 m/s2 - and takes the
  // drive off them; and drifting, it breaks the tail loose: the nose swings into the turn the faster and the slide is caught the slower (below).
  if (hb > 0) { const b = 5 * hb * grip * dt; car.v = abs(car.v) <= b ? 0 : car.v - Math.sign(car.v) * b; }
  if (auto.on && hold && abs(car.v) < 1) car.v = 0;                              // standing at a red light
  if (car.v < -8) car.v = -8;
  // Steering by hand. A key is all or nothing, and taken as it comes it threw the wheel hard over at once: at 70 km/h a touch of A or D turned the
  // car 12 degrees in a fifth of a second and it was off the road. So the wheel is turned as a quick hand turns it - a sixth of a second to full
  // lock, back to the middle a little faster when the key is let go (or the other pressed) - and full lock asks less the faster the car goes:
  // never more turning than presses the car sideways at 11 m/s2. (A first try was much gentler - 0.4 s to full lock, 8 m/s2 - and went too far
  // the other way: short taps, which is how keys are steered with, did next to nothing.) At town speeds the car turns as quickly as before; at
  // 70 km/h about half as quickly, at 110 two fifths. The self-driving steers by its own rule, unchanged.
  if (auto.on) { car.sm = 0; const dy = st * dt * 1.7 * clamp(car.v / 5, -1, 1) / (1 + abs(car.v) * 0.03); if (DRIFT && car.hd !== undefined && abs(car.v) > 4) car.hd += dy; else car.yaw += dy; }      // (slow, there is no slide - car.hd is the nose's way, below - so the wheel turns the nose; turning car.hd there was undone, and the car could not steer)
  else {
    // (On keys, drifting: a key is all the wheel at once, held or not - so how long it has been held stands for how far the wheel is turned.
    // car.keyT: seconds the key of this side has been down (it falls back quickly once let go, or the other pressed): the slide below grows
    // with it - a tap sets the car a little sideways, a key held brings the whole slide on over a second - where before any press at speed
    // was the full slide, 60 degrees, at once, and nothing in between could be asked for. KEYS: no pad in use.)
    const KEYS = typeof PAD === 'undefined' || !PAD.on, rawS = st;
    if (KEYS && rawS !== 0 && rawS * (car.keyS || 0) > 0) car.keyT = (car.keyT || 0) + dt; else car.keyT = max(0, (car.keyT || 0) - dt * (rawS === 0 ? 2.5 : 8));
    if (rawS !== 0) car.keyS = Math.sign(rawS);
    const cur = car.sm || 0, k = (st === 0 || st * cur < 0 ? 9 : 6) * dt; car.sm = cur + clamp(st - cur, -k, k); st = car.sm;
    // (a help that turned the car's way back along the road when the keys were let go was tried, and taken out: off the road, steering back
    // toward it, it turned the car away again as soon as the key was up - the car would not come back onto the road)
    // (drifting by hand, the wheel steers the car's path as the self-driving's does - the slide is laid over it below; car.turn: how fast the
    // path is turning, rad/s, for the slide to be sized by)
    const dy = st * dt * clamp(car.v / 5, -1, 1) * min(1.7, 11 / max(abs(car.v), 1)); if (DRIFT && DASSIST && car.hd !== undefined && abs(car.v) > 4) { car.hd += dy; car.turn = dy / max(dt, 1e-4); } else car.yaw += dy; }
  car.steer = (car.steer || 0) + (st - (car.steer || 0)) * (1 - exp(-dt * 8));
  // Drifting. The car goes the way it is travelling (car.hd), not the way it points (car.yaw): turned hard at speed, the tail steps out - the
  // nose comes round faster than the car follows - and the travel swings round after it as the tyres bite, quicker with the wheel straightened
  // (that is how a drift is caught), slower with it held over; a slide scrubs speed off. With the ordinary grip the two are the same.
  if (car.hd === undefined) car.hd = car.yaw;
  if (DRIFT && abs(car.v) > 4 && (auto.on || DASSIST)) {
    // (Driving by hand the same - with the help on, 'ช่วยคุม' in the driving panel (DASSIST): the stick steers the path, and the slide is laid over it by how hard the car is turning at its speed - so it is
    // as smooth and as easily held as the self-driving's. The throttle opens it - the rear wheels spinning - and lifting off closes it; the
    // handbrake kicks the tail out; steering the other way takes the turn out of the path and the slide with it. Driven by hand as a free
    // spin of the nose against the tyres' grip, as first made, no slide could be held: it caught itself in half a second or spun.)
    // (The self-driving drifts through the bends as a driver does: it steers the car's path round the bend, and holds the nose out into it by
    // as much as the bend is tight at that speed - up to 35 degrees in a hairpin - straightening as the road does. The slide scrubs speed off.)
    // (how far out: by the bend's own tightness at this speed - the sideways pull v^2 x curvature - as well as how hard the wheel is over, up to
    // 60 degrees in a hairpin; the nose swings out quickly on the way in and comes back more slowly on the way out)
    const wr = (q) => q - Math.round(q / TAU) * TAU, sp = clamp((abs(car.v) - 6) / 10, 0, 1), dz2 = alongRoad(car.hd), nn2 = Math.sqrt(1 + roadSl(car.z) ** 2);
    const kk = auto.on ? wr(atan2(roadSl(car.z + dz2 * 9 / nn2) * dz2, dz2) - atan2(roadSl(car.z + dz2 * 3 / nn2) * dz2, dz2)) / 6 : 0, lat = auto.on ? car.v * car.v * kk : car.v * (car.turn || 0);
    // (with a wheel down in a switchback's gutter the car is held round by it and needs less slide: half as much, its nose kept off the rail)
    // (taken off by degrees from 2.2 m out, and by a third, not a half: cut in half over the last 60 cm, the slide collapsed from 50 to 22 degrees
    // as the wheels dropped in - the car flung in, then snatched back)
    const gq = (hpW(car.z) > 0.05 && CARP.gutter ? 1 - 0.35 * sm(2.2, 3.3, abs(rdist(car.x, car.z))) : 1) * CARP.slide * (car.tailK ?? 1);
    // (and on a slippery road - wet, or snow - it slides wider: the same sideways pull is more of what the tyres can take there - measured
    // against the pull alone, the slower car on a wet road slid less than on a dry one - and up to 30% more on top)
    // (By hand, the tyres hold the car up to a point - more than a lane change asks - and only beyond that does the tail step out: sized from the first m/s2 as the self-driving's is, a touch of the stick to change lanes swung the car 30 degrees one way and
    // then the other. The self-driving sizes it as before - it only ever asks for it in the bends.)
    // (Tuned again: the pull is taken over the last third of a second - a quick correction on a straight, a tap of the key or a flick of the
    // stick, no longer kicks the tail out; a turn held does - and the tail steps out sooner than before, at 3.2 m/s2 and fully by 7, sooner
    // still on the throttle.)
    // (And again: with the throttle held, as it is on keys, the tail stepped out from 2 m/s2 - a touch of the key at speed asks some 11 - so a
    // slight press already had the car sideways. Now from 4.2 m/s2 on the throttle (5.2 off it), easing in - a little over gives a little
    // slide, not a third of it at once - and fully by 5 m/s2 beyond.)
    car.latF = (car.latF || 0) + (lat - (car.latF || 0)) * (1 - exp(-dt / 0.35));
    const pw = auto.on ? 0.5 : max(0, thr), l0 = (5.2 - 1.0 * pw) * grip, oq = clamp((abs(car.latF) - l0) / (5 * grip), 0, 1), over = Math.sign(car.latF) * oq * oq * (3 - 2 * oq);
    // (the self-driving's own steering adds to the slide - less on the switchbacks, and the bend's pull a little less too: swinging across the
    // road for the gutter, it had the car 50 degrees sideways before the bend, and then snatched back as the wheels went in)
    const hpS = hpW(car.z) > 0.05, base = auto.on ? clamp(lat / (5.5 * grip), -1, 1) * (hpS ? 0.66 : 0.75) + st * (hpS ? 0.3 : 0.55) : over * 0.85 * (typeof PAD === 'undefined' || !PAD.on ? 0.25 + 0.75 * sm(0.12, 1.1, car.keyT || 0) : 1), kick = auto.on ? 0 : 0.55 * hb * (Math.sign(st || car.slip || 0));
    const ts = gq * (1 + 0.3 * (1 - grip)) * clamp((base * (auto.on ? 1 : 0.6 + 0.8 * pw) + kick), auto.on ? -1 : -1.05, auto.on ? 1 : 1.05) * 1.05 * clamp((abs(car.v) - 5) / 7, 0, 1), cur = wr(car.yaw - car.hd);      // (up to 60 degrees, from 30 km/h on; by hand to 66 on the throttle)
    // (the self-driving holds no more of the slide than leaves its tail clear of the posts, lamp posts, rails and parked things by the road: it
    // looks along its way and straightens before it gets there - see pcSlideRoom; the slide eased back in as the way clears)
    // (racing the rival, side by side with it or while the lead changes hands, it drives straight: two cars sliding side by side came together -
    // but two abreast through a bend on purpose, it slides as much as leaves the two bodies apart: rival.js, rivalTailK)
    // (ts was sized with last frame's tailK in it (gq): the room is looked at for the whole of the slide asked for)
    // (taken down over a third of a second, not at once: cut from the whole slide to a sixth of it the moment the rival came within 4.8 m, the
    // car's tail snapped round - a jerk plain to see in the cinematic view, two cars drifting in close)
    car.tailK = auto.on && typeof rivalTailK === 'function' ? max(rivalTailK(ts / max(car.tailK ?? 1, 0.1)), (car.tailKp ?? 1) - dt * 3) : 1;
    if (auto.on && PCAR && typeof pcSlideRoom === 'function') { if (auto.tick % 4 === 1) car.tailT = pcSlideRoom(PCAR, car.x, car.z, car.y, car.hd, kk, ts / max(car.tailK ?? 1, 0.1)); car.tailK = min(car.tailT ?? 1, car.tailK ?? 1, (car.tailKp ?? 1) + dt * 1.2); car.tailKp = car.tailK; } else car.tailK = car.tailKp = 1;
    // (by hand the nose is led by the path's own turning, so that it does not trail a few degrees behind a gentle turn - it read as the car not
    // answering the stick)
    // (and with a wheel in a switchback's gutter the slide scrubs barely half as much speed: the lip holds the car round instead of the tyres -
    // that is what the gutter is worth. Without it the gutter only cost speed: the car slid as much and was stopped at the lip.)
    const lead = auto.on ? 0 : (car.turn || 0) / 5;      // (and the stick let go, the car straightens the quicker)
    car.yaw += wr(car.hd + ts + lead - car.yaw) * (1 - exp(-dt * CARP.snap * (abs(ts) > abs(cur) ? 5 : !auto.on && abs(st) < 0.15 ? 3.6 : 2.2))); car.slip = wr(car.yaw - car.hd); car.v *= 1 - min(1, abs(sin(car.slip)) * 0.18 * CARP.scrub * (1 - 0.55 * (CARP.gutter ? car.gut || 0 : 0)) * dt); }
  // Drifting by hand without the help ('อิสระ' in the driving panel, DASSIST off): the nose is swung by the wheel against the tyres' grip and
  // the travel follows it as they bite - harder to hold, as a real car is.
  else if (DRIFT && abs(car.v) > 4) { const wr = (q) => q - Math.round(q / TAU) * TAU, sp = clamp((abs(car.v) - 4) / 8, 0, 1);
    // (Power: the throttle spins the driven rear wheels and keeps them sliding - the tail swings out further and the slide is held, not caught;
    // off the throttle the tyres bite again and the car straightens. That is how a drift is held and steered with the right foot.)
    const pw = max(0, thr) * sp;
    // (The extra swing of the nose fades as the slide grows - it is the tail stepping out, not a spin - and the tyres bite harder the further
    // the car is sideways, so that held through a hairpin the slide settles at 30 to 40 degrees instead of going round: on the first try a
    // driver steering into a U-bend spun off the road into the trees. Steering the other way, the slide is caught quickly.)
    let sl0 = wr(car.yaw - car.hd); const into = st * sl0 > 0 ? 1 - min(1, abs(sl0) / (0.65 + 0.45 * pw)) : 1;
    // (The tyres hold first. Up to what they grip - the sideways pull the stick asks, as the ordinary steering sizes it, from 4.2 m/s2 on the
    // throttle and 5.2 off it, over the last third of a second - the car steers as it does without the drift, the travel along with the nose;
    // only beyond that, easing in, does the stick swing the nose against the tyres. Before, any touch did: the travel trailed the nose, and 30%
    // of the stick at 80 km/h held the tail 17 degrees out. The handbrake still kicks it out at once.)
    const rq = min(1.7, 11 / max(abs(car.v), 1)); car.latF = (car.latF || 0) + (abs(car.v) * st * rq - (car.latF || 0)) * (1 - exp(-dt / 0.35));
    const oq = clamp((abs(car.latF) - (5.2 - pw) * grip) / (5 * grip), 0, 1), fr = hb > 0 ? 1 : max(oq * oq * (3 - 2 * oq), sm(0.08, 0.25, abs(sl0))), gh = 1 - fr;
    car.yaw += st * dt * Math.sign(car.v) * (gh * rq + fr * 1.15 * sp * (hb > 0 ? 1 : into) * (1 + 0.6 * (1 - grip)) * (1 + 1.6 * hb) * (1 + 0.7 * pw));      // (on a slippery road the tail steps out more readily)
    // (A wheel run in a switchback's gutter on the inside of the turn - the car 3 to 3.7 m out on the side it is turning toward - is held by
    // it like a rail: the slide is checked and less speed is scrubbed. That is the gutter trick of the mountain passes.)
    const rg = rdist(car.x, car.z) * alongRoad(car.hd), inG = hpW(car.z) > 0.05 && CARP.gutter && rg * st > 0 ? sm(2.8, 3.1, abs(rg)) * (1 - sm(3.7, 3.95, abs(rg))) : 0;      // (by degrees, likewise)
    const k = 14 * gh + ((1.6 + 3.2 * (1 - abs(st)) + 3.5 * abs(sl0) * (1 - 0.7 * pw) + (st * sl0 < 0 ? 3 : 0)) + 5 * inG * (0.6 + 0.4 * grip)) * (1 - 0.5 * pw); car.hd += wr(car.yaw - car.hd) * (1 - exp(-dt * k * grip * (1 - 0.75 * hb)));
    const slMax = (0.75 + 0.2 * pw) * (0.4 + 0.6 * CARP.slide); let sl = wr(car.yaw - car.hd); if (abs(sl) > slMax) { car.hd = car.yaw - Math.sign(sl) * slMax; sl = Math.sign(sl) * slMax; }
    car.slip = sl; car.v *= 1 - min(1, abs(sin(sl)) * (0.32 - 0.2 * inG) * (0.5 + 0.5 * grip) * dt); }
  else { car.hd = car.yaw; car.slip = (car.slip || 0) * exp(-dt * 6); }
  // (Down in the gutter the car runs along it as on a rail, near straight - its inside wheels, front and rear, both in the channel. Left at the
  // drift's angle, 20 degrees and more, the tail stood out of it, the rear wheel up on the asphalt, and the front ran over the far lip.)
  if (DRIFT && CARP.gutter && (car.gut || 0) > 0.3) { const wq = (q) => q - Math.round(q / TAU) * TAU, sl = wq(car.yaw - car.hd), cap = 0.06;
    if (abs(sl) > cap) { car.yaw = car.hd + Math.sign(sl) * (cap + (abs(sl) - cap) * exp(-dt * 40)); car.slip = wq(car.yaw - car.hd); } }
  // (And it is caught by the channel as by a rail: once the front wheel is in it, the car's way out toward the far lip is turned along the
  // road - its speed kept, not lost against the lip. Coming in at a slant, still moving out 3 m/s, the wheel otherwise struck the far lip a
  // tenth of a second after dropping in.)
  if (CARP.gutter && hpW(car.z) > 0.15 && abs(car.v) > 2) { const sd = Math.sign(rdist(car.x, car.z)) || 1, fo = wheelOut(car.x, car.z, sd, 0);
    if (fo > 3.9 && fo < 4.6) { const e = 0.05, r0 = rdist(car.x, car.z) * sd, gx = (rdist(car.x + e, car.z) * sd - r0) / e, gz = (rdist(car.x, car.z + e) * sd - r0) / e, gl = Math.hypot(gx, gz) || 1,
        ux = gx / gl, uz = gz / gl, dvn = Math.sign(car.v), dx = sin(car.hd) * dvn, dz = cos(car.hd) * dvn, vo = dx * ux + dz * uz;
      // (and held the other way too, out of the channel back onto the road - fully while the self-driving rides it round, half when driven by
      // hand, so that a firm turn of the wheel still brings it out)
      const kOut = vo > 0 ? sm(4.08, 4.22, fo) : (auto.on && auto.gLock ? 1 : 0.5) * (1 - sm(4.08, 4.22, fo)) * sm(3.9, 4.0, fo);
      if (kOut > 0) { const k = min(1, dt * 30) * kOut, qx = dx - ux * vo * k, qz = dz - uz * vo * k; car.hd = Math.atan2(qx * dvn, qz * dvn); const sq = car.yaw - car.hd; car.slip = sq - Math.round(sq / TAU) * TAU; } } }
  let nx = car.x + sin(car.hd) * car.v * dt, nz = car.z + cos(car.hd) * car.v * dt;
  // On a bridge the car keeps to the deck, whatever else: no further out than leaves its side clear of the rail. (Past the deck's edge what is
  // under the car is the sea's floor, and it went straight down through the bridge - then hung there on its side, the wheels still under the
  // deck reckoned up on it. The rail stops a car too - chunks.js - but nothing may depend on that alone.) And a car already down there, under
  // or beside the deck, is set back up on it.
  // (How far out its middle may be: so that no part of the body is past the rail's inner face - 4.72 m out on an island bridge, 4.3 over a
  // river. The body is 1.75 m wide and 3.9 long, and sliding it stands across the road: its reach to the side is half its width square to
  // the road and half its length along it, by how far it is turned - and it is drawn swung about a point a metre ahead of its middle
  // (playercar.js: PZ), which carries the tail further out still. Held by its middle at half its width alone, a car sliding by the rail had
  // its tail a metre and more through it. Well outside - set down there from under the bridge - it is put back at once.)
  if (brSpan(nz)) { const rx = roadX(nz), sl = roadSl(nz), ca = 1 / Math.sqrt(1 + sl * sl), sa = sl * ca, ax = ca, az = -sa, hdd = car.hd === undefined ? car.yaw : car.hd, rel = car.yaw - Math.atan2(sl, 1);
    const off = ((sin(hdd) - sin(car.yaw)) * ax + (cos(hdd) - cos(car.yaw)) * az) * 1.0, ext = 0.9 * abs(cos(rel)) + 1.98 * abs(sin(rel)), R = isBr(nz) ? 4.72 : 4.3;
    const lat = (nx - rx) * ca, lo = -(R - ext) - off, hi = (R - ext) - off, dx = nx - rx;
    if (abs(dx) < 11 && (lat < lo || lat > hi || car.y < roadY(nz) - 0.8)) { const far0 = lat < lo - 0.3 || lat > hi + 0.3;
      if (lat < lo || lat > hi) { nx = rx + clamp(lat, min(lo, hi), max(lo, hi)) / ca; car.v *= far0 ? 0.96 : 0.995; if (far0) { car.x = nx; car.z = nz; } }
      if (car.y < roadY(nz) - 0.8) { car.y = roadY(nz) + 0.03; car.gyP = undefined; } } }
  let top = udTop(nx, nz, car.y), pr = !top && pierAt(nx, nz), onBr = top || pr || brAt(nx, nz) || tunAt(nx, nz), gy = top ? roadYs(nz) + 0.03 : pr ? max(ground(nx, nz), PIERY + 0.06) : onBr ? roadY(nz) + 0.03 : ground(nx, nz);
  // (run along a switchback's gutter, the car drops into it by a wheel's worth: 6 cm, and shakes a little on its joints)
  // (A wheel in a switchback's gutter is held by its lip: the car does not slide on out over it - it runs along the channel, the lip taking the
  // push, and scrubs a little speed. That is what makes the gutter worth a wheel.)
  // (and the self-driving, riding it round a hairpin, holds it in the channel's middle both ways - see auto.gLock)
  // (The step's excess is taken off square to the road where the car is - its sideways part only, the way along it kept. Put back at a point
  // worked out afresh from the road's slant, at a hairpin's apex - the road there running nearly across z - the car was put back where it had
  // been, frame after frame, and stood still at speed.)
  const sideOff = (lo, hi, fromIn) => { const r1 = rdist(nx, nz), zs = rzs, a1 = abs(r1), ac = clamp(a1, lo, hi); if (ac === a1 || (fromIn && a1 < lo)) return false; const sl = roadSl(zs), n = Math.sqrt(1 + sl * sl), ex = (a1 - ac) * Math.sign(r1); nx -= ex / n; nz += ex * sl / n; return true; };
  // (Held in the gutter, the self-driving is eased back toward the channel's middle - not stopped at a hard edge: put back at 3.5 m every frame
  // it came there, the car struck it as a wall, a jolt and the speed gone.)
  if (auto.on && auto.gLock && !onBr && hpW(nz) > 0.15) { const r1 = rdist(nx, nz), a1 = abs(r1); if (a1 > 3.4) { const zs = rzs, sl = roadSl(zs), n = Math.sqrt(1 + sl * sl), ex = (a1 - 3.4) * min(1, dt * 10) * Math.sign(r1); nx -= ex / n; nz += ex * sl / n; } sideOff(3.2, 3.62, false); }
  if (!onBr && hpW(nz) > 0.15) { const r0 = abs(rdist(car.x, car.z)); if (r0 > 3.0 && r0 < 3.75 && sideOff(0, max(r0, 3.68), true)) car.v *= 1 - min(1, dt * 0.08); }
  // (and by the wheels themselves: the front one nearest the channel kept in it, short of its far lip - the channel open from 3.86 to 4.44 m
  // out, the tyre a quarter of a metre wide: past the channel's middle it is drawn gently back toward it, and its middle goes no further than
  // 4.28 m, the tyre's side a few centimetres short of the lip. Run along the channel like a rail, it costs no speed: held hard at the edge
  // with a little scrubbed off each frame, as at first, the wheel was seen to strike the far lip and the car lost its speed all round the bend.)
  if (!onBr && hpW(nz) > 0.15) { const sd = Math.sign(rdist(nx, nz)) || 1, fo = wheelOut(nx, nz, sd, 0);
    if (fo > 4.14 && fo < 4.9) { rdist(nx, nz); const sl = roadSl(rzs), n = Math.sqrt(1 + sl * sl), ex = max(fo - 4.28, (fo - 4.14) * min(1, dt * 8)) * sd; nx -= ex / n; nz += ex * sl / n; } }
  const gut0 = car.gut || 0; car.gut = 0; if (!onBr && hpW(nz) > 0.15) { const rg = wheelOut(nx, nz, Math.sign(rdist(nx, nz)) || 1, 0); if (rg > 3.8 && rg < 4.5) { car.gut = sm(3.84, 3.98, rg) * (1 - sm(4.3, 4.45, rg));      // (by where the front wheel nearest it runs: the channel is 3.86 to 4.42 m out)
    gy -= 0.04 * car.gut + 0.006 * sin(nz * 3.1);      // (the channel 10 cm deep: the tyre sits down in it 4 cm)
    // (A low car - the MX-5, CARP.gutter off - cannot ride it: the channel is deeper than it sits off the road, and with a wheel down its sill
    // and spoiler grind on the edge. It is slowed hard - near 2 m/s2 at speed - and shakes; drivers keep out of it.)
    if (!CARP.gutter && car.gut > 0.5) { car.v *= 1 - min(1, dt * (0.06 + 0.04 * abs(car.v)) * car.gut); car.jolt = max(car.jolt || 0, 0.35); if (typeof padRumble === 'function') padRumble(0.6, 0.9, 60); } } }      // (car.gut: its rumble, sound.js)
  // (a wheel going down into the gutter, or coming up out of it, is felt and heard: a jolt through the car and a thump - main.js, sound.js)
  // (and through a game pad's motors: a thud going in or out, and a tick at every joint of the channel's 2 m sections the wheel runs over)
  if ((gut0 - 0.5) * (car.gut - 0.5) < 0 && abs(car.v) > 2) { car.jolt = min(1, 0.4 + abs(car.v) / 25); if (typeof gutThump === 'function') gutThump(car.jolt, car.gut > 0.5); if (typeof padRumble === 'function') padRumble(0.9 * car.jolt, 0.5 * car.jolt, 150); }
  else if (car.gut > 0.5 && floor(nz / 2) !== floor(car.z / 2) && typeof padRumble === 'function') padRumble(0.15, 0.5 * min(1, abs(car.v) / 12), 45);
  car.jolt = (car.jolt || 0) * exp(-dt * 7);
  let blocked = gy - car.y > 1.1 || (!onBr && gw[0] > 0);
  if (inTun(nz) && abs(nx - roadX(nz)) > 3.55 && abs(nx - roadX(nz)) > abs(car.x - roadX(car.z)) && abs(car.x - roadX(car.z)) <= 4.75) blocked = true;      // the tunnel's walkways and walls
  { const dp = udip(nz); if (dp > 0.2) { const pd = (px, pz) => { const s = roadSl(pz); return abs(px - roadX(pz)) / Math.sqrt(1 + s * s); }, d0 = pd(car.x, car.z), d1 = pd(nx, nz), dz0 = abs(car.z - UD.zc), dz1 = abs(nz - UD.zc);      // (square to the road)      // an underpass:
    // Down in the cutting, its walls (the kerb at their foot 3.75 m out). The car slides along them as along the parapet, and its corners are
    // kept out of them: turned toward a wall, its nose reaches further out than its side - stopped dead by its middle at 2.85 m, it stuck there
    // with the throttle down and its nose a metre into the concrete.
    // (Down in it or up at the street's level: inside the walls - under 4.6 m from the middle - the car is down in the cutting, whatever its
    // height says, unless it is up on the slab over it. Judged by height alone, at the top of the ramp - the cutting a hand deep, the car's
    // height following the falling road a little behind - a car hugging the right-hand wall counted as up there, and the parapet's rule put it
    // out on the frontage road.)
    const downIn = d0 < 4.6 ? !(dz0 < 16 && car.y > roadY(nz) + dp * 0.5) : car.y < roadY(nz) + dp * 0.5;
    if (downIn) { const wq = (q) => q - Math.round(q / TAU) * TAU, rh = Math.atan2(roadSl(nz), 1), fw = cos(car.hd - rh) >= 0 ? rh : rh + PI, rel = wq(car.yaw - fw), lim = Math.max(1.2, 3.72 - 0.9 * abs(cos(rel)) - 2.1 * abs(sin(rel)));
      if (d1 > lim && d1 >= d0 - 0.001) { const s = roadSl(nz), sd = Math.sign(nx - roadX(nz)) || 1, zf = nz + (nx - roadX(nz)) * s / (1 + s * s), q = rp(zf, sd * Math.min(d1, Math.max(lim, d0))); nx = q[0]; nz = q[1];
        car.v *= 1 - min(1, dt * (1.2 + 4 * abs(sin(rel)))); const g = min(1, dt * 3); car.yaw += wq(fw - car.yaw) * g * 0.5; car.hd += wq(fw - car.hd) * g; }      // (and is turned along it)
      // (and it stays down on the road: the ground was taken where the step would have put it - out past the wall, up at the frontage road's
      // level - so a car pressed against the right-hand wall was lifted a little each frame until it counted as up there, and was put out on
      // the frontage road above)
      gy = min(ground(nx, nz), roadY(nz) + 0.1); blocked = gy - car.y > 1.1 || (!onBr && gw[0] > 0); }
    else if (d0 < 4.6 && (dz0 - 15.4) * (dz1 - 15.4) < 0) blocked = true;
    // (a car coming off the slab close beside the rail's end - its side over it - is eased out past it, as along the parapet, not stopped)
    else if (d0 < 6.15 && (dz0 - 15.4) * (dz1 - 15.4) < 0) { const s = roadSl(nz), sd = Math.sign(nx - roadX(nz)) || 1, zf = nz + (nx - roadX(nz)) * s / (1 + s * s), q = rp(zf, sd * 6.2); nx = q[0]; nz = q[1]; car.v *= 1 - min(1, dt * 1.5); }      // the rails of the slab, across the cutting only (5.2 m each side, and the car's half width): a car on the frontage road beside it is clear of them
    // (the parapet along the frontage road: the car slides along it, as along anything solid, held 6.1 m out - stopped dead, it bounced back off
    // it at every touch, and on a slanting road, where the lane beside it is narrow, could not be driven along at all)
    else if (dz1 > 16 && d1 < 6.15 && d1 < d0) { const s = roadSl(nz), sd = Math.sign(nx - roadX(nz)) || 1, zf = nz + (nx - roadX(nz)) * s / (1 + s * s), q = rp(zf, sd * 6.2); nx = q[0]; nz = q[1]; car.v *= 1 - min(1, dt * 1.5); } } }      // (put back out square from the road's point abreast of the car - from the point at its own z, on a slanting road it was thrown metres back along the road at every touch, and W seemed to drive it backwards)      // up at street level, the parapet along it and the rails of the slab (only across the cutting: the frontage roads run on through the crossroads)
  if (brSpan(nz) && (abs(car.x - roadX(car.z)) - 4.3) * (abs(nx - roadX(nz)) - 4.3) < 0) blocked = true;      // the balustrade                  // steep ground and water stop the car
  if (seaW(nz) >= 0.35 && pineWt(nz) <= 0.35) {                                         // so do the guard rail and the retaining wall of the coast road
    const d0 = car.x - roadX(car.z), d1 = nx - roadX(nz);
    if ((d0 - 4.2) * (d1 - 4.2) < 0 && !railGap(floor(nz / 4))) blocked = true;
    if ((d0 + 6.5) * (d1 + 6.5) < 0) blocked = true;
  }
  // Solid things: the car may not go further into one than it already is (so it can always back out of whatever it is touching). Stopped by
  // one, it does not stick: it slides along it if either half of its step - across or along - is clear, losing a little speed to the scrape;
  // only head on does it stop, and bounce back a hand's breadth.
  let mx = nx, mz = nz;
  if (!blocked) { const p0 = solidAt(car.x, car.z, car.y) + 0.002;
    if (solidAt(nx, nz, car.y) > p0) { if (solidAt(nx, car.z, car.y) <= p0) { mz = car.z; car.v *= 1 - min(1, dt * 2.5); } else if (solidAt(car.x, nz, car.y) <= p0) { mx = car.x; car.v *= 1 - min(1, dt * 2.5); } else blocked = true; } }
  // (the height follows the land as it rises and falls at once, and only a step - more than the car's travel could climb in the frame on a 40%
  // slope: onto a deck, into the gutter - is eased: eased throughout, it trailed the road by the speed times the slope over 14, a hand's breadth
  // and more in the air going down a hill at speed, and the cinematic view's camera, framing the car by this height, rode up off it)
  if (blocked) car.v *= -0.25; else { const dY = gy - (car.gyP ?? gy); if (abs(dY) < abs(car.v) * dt * 0.4 + 0.008) car.y += dY;
    car.x = mx; car.z = mz; car.y += (gy - car.y) * (1 - exp(-dt * 14)); car.gyP = gy; }
  // (and its tail, swung out in a slide: into a balustrade, a parked scooter, a wall, it is knocked back in - the slide taken out of it, a
  // little speed lost, a jolt - rather than drawn through the thing: playercar.js)
  if (DRIFT && abs(car.slip || 0) > 0.04 && typeof pcTailHit === 'function' && PCAR && pcTailHit(PCAR, car.x, car.z, car.y, car.yaw, car.hd !== undefined ? car.hd : car.yaw)) {
    const k = 1 - min(1, dt * 15); car.yaw = car.hd + (car.slip || 0) * k; car.slip = (car.slip || 0) * k; car.v *= 1 - min(1, dt * 0.8); car.jolt = max(car.jolt || 0, 0.15); }
  crush(dt);
  const gf = surf(car.x + sin(car.yaw) * 1.6, car.z + cos(car.yaw) * 1.6, car.y);
  car.pit += (atan2(gf - car.y, 1.6) - car.pit) * (1 - exp(-dt * 6));
  // (The mouse only turns the eye, never the car. Looking round by dragging, the eye swings back to the front by itself once let go, as the car
  // moves; with the mouse held (pointer lock) it stays where the mouse puts it - pulled back, it fought the mouse, and felt like steering.)
  // (Looked round with the mouse, the eye stays where it is put while the mouse moves it, and a moment after - but once the mouse has been still
  // for a second and a half and the car is moving, it swings back to the front. Left turned round for good, a driver who had glanced behind
  // then saw the road run backward when W was pressed: the car went forward, the eye looked back.)
  // (In comfort mode it waits longer before it swings back, and swings slower, at most 0.8 rad/s: a view that turns by itself, unasked, is what
  // most makes people sick.)
  if (abs(car.v) > 2 && !drag && performance.now() - lookT > (COMFORT ? 2500 : 1500)) { const w = car.ly - Math.round(car.ly / TAU) * TAU, r = COMFORT ? 0.9 : 1.6, cap = COMFORT ? 0.8 * dt : 1e9;
    car.ly = w - clamp(w * (1 - exp(-dt * r)), -cap, cap); car.lp -= clamp(car.lp * (1 - exp(-dt * r)), -cap, cap); }
  car.bump += dt * abs(car.v) * 2.2;
  coachDrift();
  return onRoad;
}
function flyMove(dt) {
  const sp = (K('ShiftLeft') ? 60 : 14) * dt, f = K('KeyW') - K('KeyS'), r = K('KeyD') - K('KeyA'), u = K('KeyE') - K('KeyQ');
  const cp = cos(fly.pit), fx = sin(fly.yaw) * cp, fy = sin(fly.pit), fz = cos(fly.yaw) * cp, rx = -cos(fly.yaw), rz = sin(fly.yaw);
  const was = tunAt(fly.x, fly.z) && fly.y < roadY(fly.z) + 6.4;                 // the flying camera can go through a tunnel: once in, it is kept between floor, walls and roof
  fly.x += (fx * f + rx * r) * sp; fly.y += (fy * f + u) * sp; fly.z += (fz * f + rz * r) * sp;
  // (no further from the road than the land is made - WORLD_W, chunks.js - less the view's reach, so the edge of the world is never in sight)
  { const rx0 = roadX(fly.z), lim = typeof WORLD_W === 'number' ? WORLD_W - 300 : 1e9; fly.x = clamp(fly.x, rx0 - lim, rx0 + lim); }
  if (inTun(fly.z) && (was || (abs(fly.x - roadX(fly.z)) < 4.6 && fly.y < roadY(fly.z) + 6))) { fly.x = clamp(fly.x, roadX(fly.z) - 4.4, roadX(fly.z) + 4.4); fly.y = clamp(fly.y, roadY(fly.z) + 0.6, roadY(fly.z) + 5.2); }
  else fly.y = max(fly.y, ground(fly.x, fly.z) + 0.8);
}
// The second and third lines of the text at the top left: where the car is, the hour and the weather, the speed, the self-driving.
// The drift coach: driving by hand in the drifting style, a word on what to do now - from the bend coming up (how far, which way, how tight, and
// the speed it can be taken at), the car's speed, and how far sideways it is and which way that is going - named by the controls in use (the
// pad's or the keyboard's). car.coach: [the words, 'ok' | 'warn' | 'go' for its colour]; held a moment so that it does not flicker.
const COACH = { t: '', k: '', at: 0 };
function coachDrift() {
  if (!DRIFT || auto.on || fly.on) { car.coach = null; return; }
  const pad = PAD.on, dirz = alongRoad(car.hd), nn = Math.sqrt(1 + roadSl(car.z) ** 2), hd = (zq) => Math.atan2(roadSl(zq) * dirz, dirz), wr = (q) => q - Math.round(q / TAU) * TAU;
  const turn = (d) => wr(hd(car.z + dirz * (d + 12) / nn) - hd(car.z + dirz * d / nn)) / 12;      // the road's turn per metre, d metres on
  const grip = car.grip || 1, aL = (hpW(car.z) > 0.05 ? 8 : 9.5) * grip, v = car.v, sl = car.slip || 0, asl = abs(sl), st = car.steer || 0, hbk = K('HB') > 0.1;
  let bd = -1, bk = 0; for (let d = 0; d <= 70; d += 5) { const k = turn(d); if (abs(k) > 0.022) { bd = d; bk = k; break; } }
  const kNow = turn(0), inBend = abs(kNow) > 0.022, side = (k) => (k > 0 ? 'ซ้าย' : 'ขวา');
  const KEY = { steer: (k) => (pad ? `โยกก้านไป${side(k)}` : `กด ${k > 0 ? 'A' : 'D'}`), cs: (k) => (pad ? `โยกก้านไป${side(-k)}` : `กด ${k > 0 ? 'D' : 'A'}`), hb: pad ? 'แตะ □ เบรกมือ' : 'หักพวงมาลัยแรงๆ', gas: pad ? 'R2' : 'W', brake: pad ? 'L2' : 'S' };
  let t = '', c = 'ok';
  if (abs(rdist(car.x, car.z)) > (hpW(car.z) > 0.05 ? 4.6 : 4.2) + svW(car.z)) { t = 'ออกนอกถนน: กลับเข้าถนนก่อน'; c = 'warn'; }
  else if (v < 6) { t = `กด ${KEY.gas} ออกตัว: ดริฟต์ได้ตั้งแต่ราว 30 km/h`; }
  else if (asl > 0.1) {      // in a slide
    const growing = st * sl > 0.05;      // (the wheel held into the slide: it will open further)
    if (hbk && asl > 0.35) { t = pad ? 'ปล่อย □ ได้แล้ว: เลี้ยงคันเร่ง R2 ครึ่งๆ' : 'เลี้ยงคันเร่งครึ่งๆ'; c = 'go'; }
    else if (asl > 0.85 || (asl > 0.7 && growing)) { t = `หมุนเกินไป: ${KEY.cs(sl)} แก้ และผ่อน ${KEY.gas}`; c = 'warn'; }
    else if (!inBend && (bd < 0 || bd > 20)) { t = `พ้นโค้งแล้ว: คืนพวงมาลัยตรง แล้วกด ${KEY.gas} ออก`; c = 'go'; }
    else if (asl < 0.26 && abs(kNow) > 0.04) { t = pad ? 'ท้ายยังออกน้อย: แตะ □ อีกนิด' : 'ท้ายยังออกน้อย: หักเข้าโค้งให้มากขึ้น'; }
    else { t = `ดี! ${Math.round(asl * 57.3)}° คุมมุมด้วย ${KEY.gas} ครึ่งๆ และก้าน`.replace(' และก้าน', pad ? ' และก้าน' : ' และ A/D'); c = 'go'; } }
  else if (bd >= 0) {      // a bend coming up, the car not sliding yet
    const vb = Math.sqrt(aL / abs(bk)) * 1.15, far = bd * 1;
    if (v > vb + 2 && far > 8) { t = `โค้ง${side(bk)}ข้างหน้า ${far} m: แตะ ${KEY.brake} ลดเหลือ ~${Math.round(vb * 3.6)} km/h`; c = 'warn'; }
    else if (far <= 12) { t = hpW(car.z) > 0.05 && abs(bk) > 0.045 ? `${KEY.steer(bk)} ชิดขอบในให้ล้อลงร่อง แล้ว${pad ? 'แตะ □' : 'หักค้าง'}` : `ตอนนี้! ${KEY.steer(bk)} แล้ว${KEY.hb}`; c = 'go'; }
    else t = `โค้ง${side(bk)}ข้างหน้า ${far} m: เตรียมตัว`; }
  else if (v * 3.6 < 70) t = `ทางตรง: กด ${KEY.gas} เร่งได้เต็มที่`;
  // (a new word waits 0.6 s; the same word with a new number - the angle, the distance - is put up at once)
  const now = performance.now(), same = t.replace(/[0-9]+/g, '') === COACH.t.replace(/[0-9]+/g, ''); if (t !== COACH.t && (same || now - COACH.at > 600 || c === 'warn')) { if (!same) COACH.at = now; COACH.t = t; COACH.k = c; }
  car.coach = COACH.t ? [COACH.t, COACH.k] : null;
}
const hudInfo = () => `${isOf(car.z) && abs(car.z - IS.zc) < 525 ? (isBr(car.z) ? 'สะพานแขวนข้ามทะเล' : 'เกาะ') : inTun(car.z) ? 'อุโมงค์ลอดเขา' : udip(car.z) > 1 ? 'ทางลอด' : chyAt(car.z) ? 'ถนนพญาเสือโคร่ง' : hpW(car.z) > 0.5 ? 'ทางเขาโค้งหักศอก' : seaW(car.z) > 0.5 ? 'ถนนเลียบทะเล' : townW(car.z) > 0.5 ? 'ในเมือง' : hillW(car.z) > 0.5 ? 'ถนนเขา ป่า อ่างเก็บน้ำ' : snowW(car.z) > 0.5 ? (AT.cool > 0.5 ? 'ทุ่งหิมะ' : 'ทุ่งหญ้าบนที่สูง') : flwAt(car.z) ? ['ทุ่งทานตะวัน', 'ทุ่งไฮเดรนเยีย', 'ทุ่งทิวลิป', 'ทุ่งลิลลี่', 'ทุ่งดาวเรือง'][flwKind(car.z)] : kunAt(car.z) ? 'ถนนราชพฤกษ์' : rubW(car.z) > 0.5 ? 'สวนยางพารา' : oilW(car.z) > 0.5 ? 'สวนปาล์มน้ำมัน' : 'ทุ่งนา'} · ${todName()} ${wxName()} · ${fly.on ? 'กล้องบิน' : (abs(car.v) * 3.6).toFixed(0) + ' km/h ' + (onRoad ? 'บนถนน' : 'นอกถนน')} · ${auto.on ? 'ขับอัตโนมัติ' : 'ขับเอง'}${DRIFT ? ' (ดริฟต์)' : ''} (จำกัด ${auto.limit} km/h) · ป้าย ${zlim(car.z)}`;
// Under cover (inside a tunnel, beneath the slab of an underpass): no rain or snow crosses the view there, and the sounds of outdoors fall away.
const underCover = (cx2, cy2, cz2) => (inTun(cz2) && abs(cx2 - roadX(cz2)) < 5 && cy2 < roadY(cz2) + 6.5) || (udOf(cz2) && abs(cz2 - UD.zc) < 15 && cy2 < roadY(cz2) + 5.2);
