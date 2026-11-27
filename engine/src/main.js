// --------------------------------------------------------------------------------------------------------- matrices
const mul = (o, a, b) => { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; };
const mV2 = new Float32Array(16), mP2 = new Float32Array(16), UBR = new Float32Array(UBN), WAKE = [0, 1, 2, 3, 4, 5, 6, 7].map(() => [0, 0, -99, 0]);
const mV = new Float32Array(16), mP = new Float32Array(16), mL = new Float32Array(16), mO = new Float32Array(16);
const view = (m, e, f, r, u) => { m[0] = r[0]; m[4] = r[1]; m[8] = r[2]; m[12] = -(r[0] * e[0] + r[1] * e[1] + r[2] * e[2]); m[1] = u[0]; m[5] = u[1]; m[9] = u[2]; m[13] = -(u[0] * e[0] + u[1] * e[1] + u[2] * e[2]);
  m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2]; m[14] = f[0] * e[0] + f[1] * e[1] + f[2] * e[2]; m[3] = 0; m[7] = 0; m[11] = 0; m[15] = 1; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// --------------------------------------------------------------------------------------------------------- frame
const hud = $('hud');
let capT = 0, last = performance.now(), time = 0, fN = 0, fT = 0, fWorst = 0, fps = 60, onRoad = true, tris = 0;
let glassF = 0;      // how misted the inside of the windscreen is
let glassP = 0;      // how much snow has piled on the windscreen of the standing car
let glassR = 0, glassS = 0; const glassSl = [0, 0, 0], glassV = [1, 1, 1], glassUp = [0, 0, 0];      // how wet the windscreen is, how much snow lies on it; for its big, middling and small drops: how far the running ones have slid, which way they go, how far the standing ones have crept up
const NEAR = 0.3, FAR = 1500, TANH = Math.tan(62 * PI / 360), SHR = 95; let TANV = TANH, shL = null, shYaw = 0, upOK = 0, rBest = 0, rPrev = 0, rFlat = 0, rSince = 99, rLid = 1, rLidN = 0, rKnown = 0, coverK = 0, lodK = QP[QUAL].lod; const ordC = [], seenC = [];      // lodK: 1 = full drawing distances for leaves, twigs and grass; lowered (to 0.9 at least) when the frame rate cannot be held otherwise
updateChunks(car.x, car.z, 30);
function frame(now) {
  requestAnimationFrame(frame);
  // A locked frame rate (fpsCap): the browser calls this once for each picture the display shows, and the calls that come before the next picture
  // is due are let go by. What is due is kept on its own clock (capT), so the rate averages what was asked even on a display whose own rate is not
  // a multiple of it; 2 ms early counts as on time, for the calls do not come quite evenly.
  if (fpsCap) { if (now < capT - 2) return; capT += 1000 / fpsCap; if (capT < now) capT = now + 1000 / fpsCap * 0.5; }
  const dtr = now - last; last = now; let dt = min(dtr / 1000, 0.1); time += dt;
  fN++; fT += dtr; if (dtr > fWorst) fWorst = dtr;
  if (fT > 500) {
    fps = fN * 1000 / fT;
    // Hold the frame rate up without spoiling the picture: when it falls a fifth below what the display shows (or under 60), first
    // draw the picture a little smaller (once the drawing distances of the far leaves, twigs and grass were cut too - lodK - but no more); give it
    // back in the reverse order. Looks come first: see the floor below.
    // The picture is drawn smaller when the frame rate is low and back at full size when it has recovered. "Low" is judged against the best
    // rate this display has shown, so a screen that runs at 30 or 50 Hz is not mistaken for a slow one; and if a step down did not help
    // (the rate is capped, or the machine is not held back by pixels) the best rate is taken to be the one we have.
    if (fWorst < 400) {
      if (fps > rBest) rBest = fps;
      if (rPrev) { rFlat = fps < rPrev * 1.04 ? rFlat + 1 : 0; rPrev = 0; if (rFlat >= 2) { rBest = fps; rFlat = 0; rKnown = 1; } }
      // the floor: how small the picture may be drawn, by the quality chosen (QP in render.js). The drawing distances of leaves, twigs and grass are
      // the quality's too (lodK) and are not cut however the frame rate goes: the woods stay as full, and the picture is drawn smaller instead.
      const sF = QP[QUAL].floor;
      const lock = fpsCap ? (rKnown ? min(fpsCap, rBest) : fpsCap) : 0, dn = QP[QUAL].hold ? QP[QUAL].hold + 2 : lock ? lock * 0.95 : smooth ? 56 : rKnown || rBest > 50 ? min(60, rBest * 0.8) : 34, up = QP[QUAL].hold ? QP[QUAL].hold * 1.3 : lock ? lock * 0.985 : smooth ? 70 : min(100, rBest * 0.95);      // (locked: the rate asked for is the one to hold - what is given up to hold it has the same floors - and since a locked rate cannot show what is to spare, quality is given back while the lock is held, and kept down for a while where that proved too much: rLid. A display slower than the lock is not taken for a slow machine: rKnown)
           // (smooth: hold 60 - a steady rate is what a recording needs - and give quality back only when well clear of it)      // looks before speed: nothing is given up until the rate is a fifth below the display's (or under 60)      // (until a step down has been seen not to help, 34 is the mark: a slow machine must not be taken for a capped display)
      if (rLidN > 0 && --rLidN === 0) rLid = 1;
      rSince++;
      // Quality has a floor: the picture is never drawn below the quality's floor (QP, render.js: 75% at high). Past that the frame rate is let fall.
      // The extra size on a plain 1x screen (ssOn, render.js) is all or nothing, and the first thing given up: taken only after a few seconds held
      // at the full 60 with everything else at full, dropped at once when the rate slips under 56 - and then not tried again for a minute, two the
      // next time, and so on. (Shrunk and grown by small steps like the rest, the picture was made again every few seconds - each time a hitch -
      // and sat just under 60, every other frame shown twice: in the cinematic view the picture stuttered.)
      let ssStep = false;
      if (QP[QUAL].keep) ssOn = true;      // (ultra: the extra size kept, whatever the rate)
      else if (ssCan()) { const tgt = rKnown ? min(rBest, 60) : 60;
        if (ssOn && fps < tgt * 0.93) { ssOn = false; ssWait = ssBack; ssBack = min(ssBack * 2, 1920); ssOK = 0; upOK = 0; rPrev = 0; ssStep = true; }
        else if (!ssOn && scale >= 1 && --ssWait <= 0) { ssOK = fps >= tgt * 0.98 ? ssOK + 1 : 0; if (ssOK >= 6) { ssOn = true; ssOK = 0; ssStep = true; } } }
      // (ultra, already at its smallest picture and still under the rate it holds: the leaves' and twigs' extra reach given up, back to high's, and
      // taken again when there is rate to spare)
      if (QP[QUAL].hold && scale <= sF && fps < dn) lodK = max(1, lodK * 0.95); else if (QP[QUAL].hold && fps > up && scale >= QP[QUAL].base * 0.99 && lodK < QP[QUAL].lod) lodK = min(QP[QUAL].lod, lodK * 1.04);
      if (ssStep) upOK = 0;
      else if (fps < dn && scale > sF) {
        if (smooth) { const k = fps < dn * 0.75 ? 0.88 : 0.95; scale = max(sF, scale * k); if (fpsCap && rSince <= 2) { rLid = scale; rLidN = 120; } }      // (smooth: in bigger steps while far short)
        else { scale = max(sF, scale * (fps < dn * 0.8 ? 0.88 : 0.95)); if (rSince <= 2) { rLid = scale; rLidN = 120; } }
        upOK = 0; rPrev = fps;
      }
      else if (fps > up && scale < min(rLid, QP[QUAL].base)) { if (++upOK >= 6) { scale = min(rLid, QP[QUAL].base, scale * 1.05); upOK = 0; rSince = 0; } }
      else upOK = 0;
    }
    // (with the words hidden (H) the frame rate alone stays, at the top left)
    hud.textContent = hudText ? hudText() : document.body.classList.contains('noui') ? `${fps.toFixed(0)} fps` : `${fps.toFixed(0)} fps · ช้าสุด ${fWorst.toFixed(0)} ms · ${CVW}x${CVH}${W !== CVW ? ` (วาด ${W}x${H})` : ""} · ${(tris / 1e6).toFixed(1)}M สามเหลี่ยม\n${hudInfo()}\n${SND ? SND.info || '' : 'กดปุ่มใดก็ได้เพื่อเปิดเสียง'}`;
    fN = 0; fT = 0; fWorst = 0;
  }
  resize();
  pollPad(dt); if (typeof lookStep === 'function') lookStep(dt); crushRecover(dt); if (fly.on) flyMove(dt); else onRoad = drive(dt); if (typeof rivalStep === 'function') rivalStep(dt);
  updateSound(dt); if (SHOW_CAR) placeCar(dt);
  if (gameTick) gameTick(dt);      // a game's own doings each frame (it may fill EXTRA with boxes that move: see render.js)
  // camera
  let ex, ey, ez, yaw, pit;
  // (TANV: the lens this frame - the crew's, in the cinematic view, else the usual one)
  const cin = typeof cineCam === 'function' ? cineCam(dt) : null, ext = view3 || !!cin; TANV = cin ? CINE.tan : TANH;
  if (fly.on) { ex = fly.x; ey = fly.y; ez = fly.z; yaw = fly.yaw; pit = fly.pit; }
  else if (cin) { [ex, ey, ez, yaw, pit] = cin; }
  else if (view3 && typeof PCAR !== 'undefined' && PCAR) { [ex, ey, ez, yaw, pit] = pcCam(dt); }      // (behind the player's car: playercar.js)
  else if (SHOW_CAR && view3) { const ya = car.yaw + car.ly; ex = car.x - sin(ya) * 6.5; ez = car.z - cos(ya) * 6.5; ey = max(car.y + 2.5, ground(ex, ez) + 0.8); yaw = ya; pit = -0.13 + car.lp; }
  else { const so = SHOW_CAR ? 1 : 0; ex = car.x - so * (0.36 * cos(car.yaw) + 0.1 * sin(car.yaw)); ez = car.z + so * (0.36 * sin(car.yaw) - 0.1 * cos(car.yaw)); ey = car.y + 1.24 + (onRoad ? 0 : (sin(car.bump) * 0.035 + sin(car.bump * 2.7) * 0.02) * min(1, abs(car.v))) - (car.jolt || 0) * 0.06 * cos((1 - (car.jolt || 0)) * 30); yaw = car.yaw + car.ly; pit = car.pit * 0.85 + car.lp;
    // (drifting: the eye looks a third of the way round toward where the car is going, and the view leans out of the turn with the slide and shakes with it)
    // (in comfort mode it looks round less far into the slide, and does not shake)
    if (DRIFT) { const sl = car.slip || 0; yaw -= sl * (COMFORT ? 0.2 : 0.35); if (!COMFORT) ey += (sin(time * 37) + sin(time * 23)) * 0.012 * min(1, abs(sl) * 2) * min(1, abs(car.v) / 15); } }
  updateChunks(ex, ez, 1);
  if (typeof pcUpdate === 'function') { pcUpdate(dt); smokeStep(dt, Math.fround(ex), Math.fround(ey), Math.fround(ez)); marksStep(dt, Math.fround(ex), Math.fround(ey), Math.fround(ez)); underStep(Math.fround(ex), Math.fround(ey), Math.fround(ez)); }
  POP = popAt(tday * 24); if (STROLL) STROLL.step(ex, ey, ez); else PNEAR.length = 0; pplNear(time);
  // The car's state, drawn from above at the foot of the screen (there is no bonnet or boot in the picture to tell by): the car turned against
  // the way it is going by its slide, its front wheels by the steering, the rear wheels red under the handbrake, one side's wheels blue down in a
  // gutter; and the gear (the pad's, or by the way the car rolls) and how far it is sideways.
  { const C = $('cst'); if (C) { C.classList.toggle('off', fly.on || COACH_AT === '0'); C.classList.toggle('mid', COACH_AT === 'C'); if (!fly.on) { const sl = car.slip || 0, sd = (car.steer || 0) * 28, hbk = K('HB') > 0.1, g = (car.gut || 0) > 0.5, gl = g && rdist(car.x, car.z) * alongRoad(car.hd) > 0;
      $('cstC').setAttribute('transform', `rotate(${(-sl * 180 / PI).toFixed(1)})`); $('cstF0').setAttribute('transform', `translate(-8 -9) rotate(${(-sd).toFixed(1)})`); $('cstF1').setAttribute('transform', `translate(8 -9) rotate(${(-sd).toFixed(1)})`);
      for (let i = 0; i < 4; i++) { const w = $('cstW' + i); w.classList.toggle('hb', hbk && i >= 2); w.classList.toggle('gt', g && (i % 2 === 0) === gl); }
      const gear = PAD.on ? PAD.gear : car.v < -0.3 ? 'R' : 'D', a = Math.round(abs(sl) * 180 / PI);
      const t = `เกียร์ ${gear}` + (a >= 3 ? ` · ไถล ${a}°` : '') + (hbk ? ' · เบรกมือ' : '') + (g ? ' · ล้อลงร่อง' : ''); if (C.dataset.t !== t) { C.dataset.t = t; $('cstT').textContent = t; }
      const ck = COACH_AT === '0' ? null : car.coach, Kd = $('cstK'), kt = ck ? ck[0] : '', kc = ck ? ck[1] : ''; if (Kd.dataset.t !== kt + kc) { Kd.dataset.t = kt + kc; Kd.textContent = kt; Kd.className = kt ? 'on ' + kc : ''; } } } }
  // which way the eye looks while it is turned from the car's front (the mouse turns it; see drive.js): shown at the foot of the screen
  { const L = $('look'); if (L) { const a = fly.on ? 0 : car.ly - Math.round(car.ly / TAU) * TAU, on = abs(a) > 0.35; L.classList.toggle('on', on);
      if (on) { $('lookV').setAttribute('transform', `rotate(${(-a * 180 / PI).toFixed(0)})`); const d = abs(a); $('lookT').textContent = d > 2.4 ? 'มองไปด้านหลังรถ' : d > 1.0 ? (a > 0 ? 'มองไปด้านซ้ายรถ' : 'มองไปด้านขวารถ') : (a > 0 ? 'มองเฉียงซ้าย' : 'มองเฉียงขวา'); } } }
  ex = Math.fround(ex); ey = Math.fround(ey); ez = Math.fround(ez);      // the eye exactly as the shaders will have it (they subtract it from every position)
  const cp = cos(pit), f = [sin(yaw) * cp, sin(pit), cos(yaw) * cp], e = [ex, ey, ez], O3 = [0, 0, 0]; let r = nrm3(cross(f, [0, 1, 0])), u = cross(r, f);
  // the lean: rolled about the line of sight, out of the turn - with the slide, and with how hard the wheel is over at speed
  // (in comfort mode a third as much, and none while the driver is looking round: a view that rolls as it turns is the worst for sickness)
  { const rk = COMFORT ? 0.33 * clamp(1 - (abs(car.ly - Math.round(car.ly / TAU) * TAU) - 0.15) / 0.3, 0, 1) : 1, roll = !fly.on && !ext && DRIFT ? rk * clamp((car.slip || 0) * 0.22 + (car.steer || 0) * 0.05 * min(1, abs(car.v) / 20), -0.28, 0.28) : 0; if (roll) { const c = cos(roll), s = sin(roll); const r2 = r.map((v, j) => v * c + u[j] * s), u2 = u.map((v, j) => v * c - r[j] * s); r = r2; u = u2; } }
  view(mV, O3, f, r, u);            // all matrices are for positions relative to the eye
  const asp = W / H; mP.fill(0); mP[0] = 1 / (TANV * asp); mP[5] = 1 / TANV; mP[10] = FAR / (NEAR - FAR); mP[11] = -1; mP[14] = NEAR * FAR / (NEAR - FAR);
  mul(UB, mP, mV);
  // the shadow map: a box of light around the area in front of the camera
  if (!tHold) { tday += dt / 720; if (tday >= 1) { tday -= 1; dayN++; } }      // (unless an hour was chosen in the sky panel)
  const T = atmos(ez), L = nrm3(T.dir.slice());
  // The shadow map must not shimmer. So: the light it is drawn from moves in small steps, not every frame; the box of
  // light lies ahead along the view, but is turned only when the view has swung 17 degrees away from it; and its middle
  // moves only by whole texels, so that a shadow edge falls on the same texels from one frame to the next.
  if (!shL || shL[0] * L[0] + shL[1] * L[1] + shL[2] * L[2] < 1 - 2e-6 * max(shL[1] * shL[1], 0.04)) shL = L.slice();      // steps of 0.02 (low sun) to 0.1 degree
  { let dy = yaw - shYaw; dy -= Math.round(dy / TAU) * TAU; if (abs(dy) > 0.3) shYaw = yaw; } const yq = shYaw;
  const lf = [-shL[0], -shL[1], -shL[2]], lr = nrm3(cross(lf, [0, 1, 0])), lu = cross(lr, lf), TEX = 2 * SHR / SHADOW, d3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sc = [ex + sin(yq) * SHR * 0.6, ey, ez + cos(yq) * SHR * 0.6], qx = Math.round(d3(sc, lr) / TEX) * TEX - d3(sc, lr), qy = Math.round(d3(sc, lu) / TEX) * TEX - d3(sc, lu);
  for (let j = 0; j < 3; j++) sc[j] += lr[j] * qx + lu[j] * qy;
  const le = [sc[0] + shL[0] * 300 - ex, sc[1] + shL[1] * 300 - ey, sc[2] + shL[2] * 300 - ez];
  view(mL, le, lf, lr, lu);
  mO.fill(0); mO[0] = 1 / SHR; mO[5] = 1 / SHR; mO[10] = 1 / (1 - 700); mO[14] = 1 / (1 - 700); mO[15] = 1;
  mul(UBS, mO, mL); UB.set(UBS.subarray(0, 16), 16);
  const hl = (headOn === -1 ? (T.night > 0.5 ? 1 : 0) : headOn) * 1.6;
  UB.set([ex, ey, ez, time, L[0], L[1], L[2], T.rain, T.sun[0], T.sun[1], T.sun[2], abs(car.v) * 3.6, f[0], f[1], f[2], LT.seed, r[0], r[1], r[2], TANV * asp, u[0], u[1], u[2], TANV,
    T.fog, 360 * viewK, T.cover, T.dry, W, H, car.yaw, fly.on || ext ? 0 : 1, T.amb[0], T.amb[1], T.amb[2], T.wet, hl, T.wind, T.ex, T.night, T.zen[0], T.zen[1], T.zen[2], T.flash, T.hor[0], T.hor[1], T.hor[2], LT.az], 32);
  UB[80] = ((ex % 256) + 256) % 256; UB[81] = ((ez % 256) + 256) % 256;      // where the eye stands in its 256 m tile (camM)
  UB[82] = T.snowG; UB[83] = deadWorld;      // (camM.z: snow lying everywhere, from snow chosen by hand)
  UB[148] = T.cool;      // (ssn.x: the cool season - the snowfield's snow lies only then)
  for (let i = 0; i < 8; i++) { const q = CRUSH[i], s = q[2]; UB[84 + i * 4] = q[0]; UB[85 + i * 4] = q[1]; UB[86 + i * 4] = s * s * (3 - 2 * s); UB[87 + i * 4] = q[3]; }      // (crush: plants pressed down by the car)
  // (wake: the car's last places, for what its passing blows about - the first is where it is now; a new one is kept every second or so of travel)
  { const st = min(1, abs(car.v) / 14), W0 = WAKE[0], W1 = WAKE[1]; const lead = clamp(car.v * 0.4, -6, 12);
    // (the first point runs ahead of the car by what it covers in 0.4 s: the air it pushes before it stirs things there already, so the driver sees them rise)
    W0[0] = car.x + sin(car.yaw) * lead; W0[1] = car.z + cos(car.yaw) * lead; W0[2] = time; W0[3] = st;
    if (Math.hypot(car.x - W1[0], car.z - W1[1]) > max(6, abs(car.v) * 1.1)) { const q = WAKE.pop(); q[0] = car.x; q[1] = car.z; q[2] = time; q[3] = st; WAKE.splice(1, 0, q); }
    for (let i = 0; i < 8; i++) UB.set(WAKE[i], 116 + i * 4); }
  UBS.set(UB.subarray(16, UBN), 16);
  Q.writeBuffer(ubo, 0, UB); Q.writeBuffer(uboS, 0, UBS);
  { const cz2 = fly.on ? fly.z : car.z, cx2 = fly.on ? fly.x : car.x, cy2 = fly.on ? fly.y : car.y + 1.2;      // under cover (a tunnel, the slab of an underpass) no rain or snow crosses the view, and the sounds of outdoors fall away
    const und = underCover(cx2, cy2, cz2) ? 1 : 0; coverK += (und - coverK) * min(1, dt * 4); }
  // the windscreen gets wet as fast as the rain comes and dries slowly; snow on it melts away more slowly still. Out of the rain (a tunnel, an
  // underpass) no more falls on it, but what is there stays a while. Only from the driver's seat.
  // Snow that lands on the warm glass turns to water after a little while: so snowing wets the screen too, more slowly than rain and not so much.
  { const sn = T.snow * (1 - coverK), rr = T.rain * (1 - coverK) * (T.snow > T.rain ? 0 : 1), rn = max(rr, glassS * 0.3), k = min(1, dt);
    // (Out of the rain - in a tunnel, under the slab - the drops are blown off the glass by the car's own wind: at speed in a few seconds,
    // standing still slowly as before. Left to dry at the standing rate only, they ran up the glass the length of a tunnel.)
    glassR += (rn - glassR) * k * (rn > glassR ? (rr >= rn ? 0.6 : 0.12) : 0.07 + 0.4 * min(1, (car.v / 22) ** 2)); if (rn < 0.01 && glassR < 0.02) glassR = 0; glassS += (sn - glassS) * k * (sn > glassS ? 0.4 : 0.05); }
  // The wind over the glass against a drop's weight (see final.wgsl): wf is the wind's push, 1 at 80 km/h and growing as the square of the speed.
  // A running drop goes down at its own pace until the wind matches its weight - the small ones hang from about 25 km/h and climb from 36,
  // the middling hang from 37 and climb from 47, the big hang from 53 and climb from 62 (they were first left running down until 85: at 80 the
  // big drops were still going down while everything else went up, which is not what a windscreen does) - then hangs (the glass holds it: nothing moves while the two forces are within a little of each other), then climbs, faster the
  // faster the car. The standing drops creep up likewise, the middling first; the finest never move.
  { const wf = (car.v / 22) ** 2, G = [1, 0.7, 0.35], A = [1.9, 2.4, 2.4], C = [[0.8, 0.6, 0.02], [1.2, 0.3, 0.02], [0.5, 0.8, 0]];      // (the standing drops hardly move: the glass holds them)
    for (let k = 0; k < 3; k++) { const net = G[k] - A[k] * wf, v0 = Math.sign(net) * max(abs(net) - 0.15, 0), vel = v0 < 0 ? max(-30, v0 * 6) : v0;      // (blown up the glass a drop goes many times faster than it trickles down)
      glassSl[k] += vel * dt; glassV[k] += (clamp(vel * 3, -1, 1) - glassV[k]) * min(1, dt * 4); glassUp[k] += max(0, C[k][0] * wf - C[k][1]) * C[k][2] * dt; } }
  // The inside of the glass mists when it is cold out: in falling snow and on the snowfield most, in the cool season, and a little in rain and
  // fog (damp, and cooler than the cabin). It comes on over half a minute and clears quicker.
  { const cold = clamp(T.snow + 0.6 * snowW(car.z) * T.cool + 0.35 * T.cool + 0.35 * T.rain + 0.3 * T.mist, 0, 1); glassF += (cold - glassF) * min(1, dt * (cold > glassF ? 0.07 : 0.15)); }
  // Standing in a snowfall the screen is buried: in heavy snow, in about three quarters of a minute. Moving off, the wind and the shaking clear it
  // in a few seconds, quicker the faster the car goes; when the snow stops it melts away slowly.
  { const sn = T.snow * (1 - coverK), sp = abs(car.v);
    glassP = clamp(glassP + dt * (sp > 1.5 ? -(0.05 + sp * 0.02) : sn > 0.05 ? sn / 45 : -1 / 40), 0, 1); }
  const onGlass = !fly.on && !ext ? 1 : 0;
  Q.writeBuffer(uFinal, 0, new Float32Array([T.ex, (T.snow > T.rain ? -T.snow : T.rain) * (1 - coverK), time, 0.25 + 0.12 * T.wind, glassR * onGlass, glassS * onGlass, abs(car.v), W / H, ...glassSl, glassF * onGlass, ...glassV, glassP * onGlass, ...glassUp, 0, typeof CINE !== 'undefined' ? CINE.k : 0, typeof CINE !== 'undefined' ? CINE.bar : 0, W / CVW, 0]));

  // Which chunks the picture shows, nearest first, and how finely - worked out before anything is drawn, for the leaves and grass of each are first
  // culled on the graphics card (cull.wgsl) and then drawn from what that leaves.
  let grassBudget = 1;
  // nearest first: what is drawn early hides what comes after, and a hidden pixel costs nothing - in a forest most of what lies beyond the first trees is hidden
  ordC.length = 0; for (const c of chunks.values()) { c.dd = hypot(c.x - ex, c.z - ez); if (c.dd <= 380 * viewK) ordC.push(c); } ordC.sort((a, b) => a.dd - b.dd);
  if (grassJob) { if (grassJob.dead) grassJob = null; else { growGrass(grassJob); grassBudget = 0; } }      // first go on with the chunk whose grass is half grown
  seenC.length = 0;
  for (const c of ordC) {
    const dx = c.x - ex, dz = c.z - ez, d = c.dd;
    if (d < 150 * max(1, QP[QUAL].grass) && !c.grassTried && grassBudget > 0) { grassBudget--; growGrass(c); }      // (before the test below: grass must be there already when a chunk comes into view)
    else if (d > 230 * max(1, QP[QUAL].grass) && c.grassB) { c.grassB.destroy(); c.grassB = null; c.nGrass = 0; c.grassTried = false; }
    if (d > CH) {                          // behind the camera or off to the side of what the screen shows
      // In plan the screen's edge runs at slope k from the eye; a chunk is a disc of radius Rc about its middle (its own corners at 45 m, and the
      // buildings and crowns that stand on its edge and reach beyond), so its middle may be Rc * sqrt(1 + k^2) outside that edge before nothing of it shows.
      const fh = hypot(f[0], f[2]) || 1, fw = (dx * f[0] + dz * f[2]) / fh, k = TANV * (W / H) / max(cp - TANV * abs(f[1]), 0.05), Rc = 66 + (c.reach || 0);
      if (abs(f[1]) < 0.3 ? (fw < -Rc || Math.sqrt(max(d * d - fw * fw, 0)) > k * max(fw, 0) + Rc * hypot(1, k)) : (dx * f[0] + dz * f[2]) / d < -0.35) continue;
    }
    seenC.push(c);
    // how finely its leaves and grass are drawn (l: which density, -1 none; n: how many of them), and - culled - their draw's place (s) and list (o)
    c.lL = c.nLeaf ? (d < 62 * lodK ? 0 : d < 150 * lodK ? 1 : d < 250 * lodK ? 2 : 3) : -1; c.lN = c.lL >= 0 ? floor(c.nLeaf / LODN[c.lL]) : 0; c.lS = -1;
    const gK = QP[QUAL].grass; c.gL = c.nGrass && d < 130 * gK ? (d < 48 * gK ? 0 : d < 85 * gK ? 1 : 2) : -1; c.gN = c.gL >= 0 ? floor(c.nGrass / GLODN[c.gL]) : 0; c.gS = -1;
  }
  // the culling: a place in the lists and an indirect draw for every leaf and grass draw whose buffer can be culled
  let nCull = 0;
  if (CULL) { let room = 64, big = 0; const S = GPUBufferUsage.STORAGE;
    for (const c of seenC) { if (c.lN && c.leafB.usage & S) { room += Math.ceil(c.lN / 64) * 64; big = max(big, c.leafB.size / 48); } if (c.gN && c.grassB.usage & S) { room += Math.ceil(c.gN / 64) * 64; big = max(big, c.grassB.size / 48); } }
    cullRoom(room + big);
    // the sides of the view, from the matrix the shaders use (it takes positions relative to the eye): left, right, bottom, top, near
    const M = UB, pl = [[3, 0, 1], [3, 0, -1], [3, 1, 1], [3, 1, -1], [2, 2, 0]];
    let off = 0; const slot = (n, l, buf, ws, nv) => { if (nCull >= CULLD) return -1; const q = nCull++, P = CU.P, A = CU.A;
      for (let k = 0; k < 5; k++) { const [r0, r1, sg] = pl[k], v = [0, 1, 2, 3].map((j) => M[j * 4 + r0] + sg * M[j * 4 + r1]), L = hypot(v[0], v[1], v[2]) || 1; for (let j = 0; j < 4; j++) P[q * 64 + k * 4 + j] = v[j] / L; }
      // (the eye: the instances' places are in the world, the sides of the view are about the eye)
      for (let j = 0; j < 4; j++) P[q * 64 + 20 + j] = 0; P[q * 64 + 24] = ex; P[q * 64 + 25] = ey; P[q * 64 + 26] = ez; P[q * 64 + 27] = 0;
      const PU = new Uint32Array(P.buffer, q * 256 + 112, 1); PU[0] = n; P[q * 64 + 29] = ws;
      A[q * 64] = nv; A[q * 64 + 1] = 0; A[q * 64 + 2] = 0; A[q * 64 + 3] = 0; cullBG(buf); buf._o = buf._o || []; const o = off; off += Math.ceil(n / 64) * 64; return [q, o]; };
    for (const c of seenC) { const S2 = GPUBufferUsage.STORAGE;
      if (c.lN && c.leafB.usage & S2) { const r = slot(c.lN, c.lL, c.leafB, LODW[c.lL] * LODL[c.lL], LODV[c.lL]); if (r) { c.lS = r[0]; c.lO = r[1]; } }
      if (c.gN && c.grassB.usage & S2) { const r = slot(c.gN, c.gL, c.grassB, GLODW[c.gL], GLODV[c.gL]); if (r) { c.gS = r[0]; c.gO = r[1]; } } }
    if (nCull) { Q.writeBuffer(CU.par, 0, CU.P, 0, nCull * 64); Q.writeBuffer(CU.args, 0, CU.A, 0, nCull * 64); } }
  const enc = device.createCommandEncoder();
  // 1. shadows
  let p = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: vShadow, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
  p.setBindGroup(0, bgShadow);
  for (const c of chunks.values()) {
    const d = hypot(c.x - sc[0], c.z - sc[2]), dc = hypot(c.x - ex, c.z - ez); if (d > SHR * 1.45 + CH + 40 / max(shL[1], 0.2) + (c.reach || 0)) continue;      // (with room for the long shadows of a low sun)
    p.setPipeline(pTerrainS); p.setVertexBuffer(0, c.vb); p.setIndexBuffer(ibGrid, 'uint16'); p.drawIndexed(gridI.length);
    if (c.nSegFar) { p.setPipeline(pBranchS); p.setVertexBuffer(0, vbTube4); p.setVertexBuffer(1, c.segB); p.setIndexBuffer(ibTube4, 'uint16'); p.drawIndexed(tubeI4.length, c.nSegFar); }
    if (c.nBox) { const nb = c.nBoxFar === undefined ? c.nBox : c.nBoxFar; if (nb) { p.setPipeline(pBoxS); p.setVertexBuffer(0, vbCube); p.setVertexBuffer(1, c.boxB); p.setIndexBuffer(ibCube, 'uint16'); p.drawIndexed(36, nb); } }
    if (c.nPpl && PPL && dc < 60 + CH) { p.setPipeline(pPplS); p.setVertexBuffer(1, c.pplB); for (let sx = 0; sx < 2; sx++) { const n = Math.round((sx ? c.nPpl - c.nPplM : c.nPplM) * POP), M = PPL[sx][1]; if (n) { p.setVertexBuffer(0, M.vb); p.setIndexBuffer(M.ib, 'uint32'); p.drawIndexed(M.ni, n, 0, 0, sx ? c.nPplM : 0); } } }      // (people throw shadows only near)
    if (c.nLeaf) { if (dc > 230 * lodK) continue; const l = dc > 52 * lodK ? 2 : 1; p.setPipeline(l === 2 ? pLeafS2 : pLeafS); p.setVertexBuffer(0, c.leafB); p.draw(6, floor(c.nLeaf / LODN[l])); }
  }
  if (STROLL) STROLL.draw(p, true);
  if (EXTRA.nBox) { p.setPipeline(pBoxS); p.setVertexBuffer(0, vbCube); p.setVertexBuffer(1, EXTRA.boxB); p.setIndexBuffer(ibCube, 'uint16'); p.drawIndexed(36, EXTRA.nBox); }
  for (const c of chunks.values()) if (c.nMesh && hypot(c.x - sc[0], c.z - sc[2]) < SHR * 1.45 + CH + 60) { const A = c.nMeshA ?? c.nMesh, Fr = c.nMeshFar ?? c.nMesh; p.setPipeline(pMeshS); p.setVertexBuffer(0, c.meshB); p.setIndexBuffer(c.meshIB, 'uint32'); if (hypot(c.x - ex, c.z - ez) < 75 + CH) { if (A) p.drawIndexed(A); if (c.nMesh > Fr) p.drawIndexed(c.nMesh - Fr, 1, Fr); } else if (Fr) p.drawIndexed(Fr); }
  if (SHOW_CAR) { p.setPipeline(pCarS); p.setVertexBuffer(0, carVB); p.setIndexBuffer(carIB, 'uint16'); p.drawIndexed(CAR.idx.length); }
  if (typeof pcDraw === 'function') pcDraw(p, true);
  p.end();
  // 1b. what the mirrors see: the land behind the car, drawn small and without the finest detail (only from the driver's seat)
  if (SHOW_CAR && !fly.on && !ext) {
    const f2 = [-sin(car.yaw), 0, -cos(car.yaw)], r2 = nrm3(cross(f2, [0, 1, 0])), u2 = cross(r2, f2), e2 = [car.x, car.y + 1.3, car.z];
    view(mV2, O3, f2, r2, u2); mP2.fill(0); mP2[0] = 1 / 1.45; mP2[5] = 1 / 0.725; mP2[10] = FAR / (NEAR - FAR); mP2[11] = -1; mP2[14] = NEAR * FAR / (NEAR - FAR);
    UBR.set(UB); mul(UBR, mP2, mV2); UBR.set([e2[0], e2[1], e2[2]], 32); UBR[80] = ((Math.fround(e2[0]) % 256) + 256) % 256; UBR[81] = ((Math.fround(e2[2]) % 256) + 256) % 256;
    UBR.set([f2[0], f2[1], f2[2]], 44); UBR.set([r2[0], r2[1], r2[2], 1.45, u2[0], u2[1], u2[2], 0.725], 48);
    { const dd = [Math.fround(e2[0]) - ex, Math.fround(e2[1]) - ey, Math.fround(e2[2]) - ez]; for (let q = 0; q < 4; q++) UBR[28 + q] = UB[28 + q] + UB[16 + q] * dd[0] + UB[20 + q] * dd[1] + UB[24 + q] * dd[2]; }      // the shadow matrix, re-based on the mirror's eye
    Q.writeBuffer(uboR, 0, UBR);
    p = enc.beginRenderPass({ colorAttachments: [{ view: vMirMS, resolveTarget: vMir, clearValue: [0, 0, 0, 1], loadOp: 'clear', storeOp: 'discard' }], depthStencilAttachment: { view: vMirD, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' } });
    p.setBindGroup(0, bgSceneR);
    for (const c of chunks.values()) {
      const dx = c.x - e2[0], dz = c.z - e2[2], d = hypot(dx, dz); if (d > 210 || (d > CH && (dx * f2[0] + dz * f2[2]) / d < 0.15)) continue;
      p.setPipeline(pTerrain); p.setVertexBuffer(0, c.vb); p.setIndexBuffer(ibGrid, 'uint16'); p.drawIndexed(gridI.length);
      if (c.nSegFar) { p.setPipeline(pBranch); p.setVertexBuffer(0, vbTube); p.setVertexBuffer(1, c.segB); p.setIndexBuffer(ibTube, 'uint16'); p.drawIndexed(tubeI.length, c.nSegFar); }
      if (c.nBox) { const nb = c.nBoxFar === undefined ? c.nBox : c.nBoxFar; if (nb) { p.setPipeline(pBox); p.setVertexBuffer(0, vbCube); p.setVertexBuffer(1, c.boxB); p.setIndexBuffer(ibCube, 'uint16'); p.drawIndexed(36, nb); } }
      if (c.nLeaf && d < 170) { p.setPipeline(pLeaf[2]); p.setVertexBuffer(0, c.leafB); p.draw(LODV[2], floor(c.nLeaf / LODN[2])); }
    }
    p.setPipeline(pSky); p.draw(3); p.end();
  }
  // 1c. the culling (see above): each list filled and counted, before the picture is drawn from them
  if (nCull) { const q = enc.beginComputePass(); q.setPipeline(pCull);
    for (const c of seenC) { if (c.lS >= 0) { q.setBindGroup(0, c.leafB._cg, [c.lO * 4, c.lS * 256, c.lS * 256]); q.dispatchWorkgroups(Math.ceil(c.lN / 64)); }
      if (c.gS >= 0) { q.setBindGroup(0, c.grassB._cg, [c.gO * 4, c.gS * 256, c.gS * 256]); q.dispatchWorkgroups(Math.ceil(c.gN / 64)); } }
    q.end(); }
  // 2. the picture, in HDR
  p = enc.beginRenderPass({ colorAttachments: [{ view: vMS, resolveTarget: vScene, clearValue: [0, 0, 0, 1], loadOp: 'clear', storeOp: 'discard' }],
    depthStencilAttachment: { view: vDepth, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' } });
  p.setBindGroup(0, bgScene); tris = 0;
  if (SHOW_CAR) { p.setPipeline(pCar); p.setVertexBuffer(0, carVB); p.setIndexBuffer(carIB, 'uint16'); p.drawIndexed(CAR.idx.length); }
  if (typeof pcDraw === 'function') pcDraw(p, false);
  for (const c of seenC) {
    const d = c.dd;
    // (sculpted things: the small ones - a parked motorcycle's body - come last in the buffer and are drawn only within 75 m)
    // (the chunk's mesh buffer holds first what is always drawn, then what is drawn only from afar, then what only from near to)
    if (c.nMesh) { p.setPipeline(pMesh); p.setVertexBuffer(0, c.meshB); p.setIndexBuffer(c.meshIB, 'uint32'); const A = c.nMeshA ?? c.nMesh, Fr = c.nMeshFar ?? c.nMesh;
      if (d < 75 + CH) { if (A) p.drawIndexed(A); if (c.nMesh > Fr) p.drawIndexed(c.nMesh - Fr, 1, Fr); tris += (A + c.nMesh - Fr) / 3; } else if (Fr) { p.drawIndexed(Fr); tris += Fr / 3; } }
    if (c.nSeg) {          // trunks and boughs nearby are round (8 sides); twigs, and everything from 85 m on, have 4
      // (c.round: a chunk whose big made things are round and seen from far - a temple's images and chedi - keeps them round at any distance:
      // four-sided, a Buddha was a figure of square beams)
      const near = d < 85 * lodK, nR = near || c.round ? c.nSegFar : 0, n4 = near ? c.nSeg - c.nSegFar : c.round ? 0 : c.nSegFar; p.setPipeline(pBranch); p.setVertexBuffer(1, c.segB);
      if (nR) { if (c.round) { p.setVertexBuffer(0, vbTube16); p.setIndexBuffer(ibTube16, 'uint16'); p.drawIndexed(tubeI16.length, nR); } else { p.setVertexBuffer(0, vbTube); p.setIndexBuffer(ibTube, 'uint16'); p.drawIndexed(tubeI.length, nR); } }
      if (n4) { if (c.round) { p.setVertexBuffer(0, vbTube); p.setIndexBuffer(ibTube, 'uint16'); p.drawIndexed(tubeI.length, n4, 0, 0, nR); } else { p.setVertexBuffer(0, vbTube4); p.setIndexBuffer(ibTube4, 'uint16'); p.drawIndexed(tubeI4.length, n4, 0, 0, nR); } }      // (a temple's fine pieces - the curls of an image's hair - are round, not four-sided)
      tris += nR * SIDES * 2 + n4 * 8;
    }
    // (a chunk may keep fine detail at the end of its boxes - the last after nBoxFar - which is drawn only from near to: the small things of a temple)
    // (the men first in the chunk's list, then the women; the full figures only in the chunks next the eye)
    if (c.nPpl && PPL && d < 150 + CH) { p.setPipeline(pPpl); p.setVertexBuffer(1, c.pplB); for (let sx = 0; sx < 2; sx++) { const n = Math.round((sx ? c.nPpl - c.nPplM : c.nPplM) * POP), M = PPL[sx][d < 14 + CH / 2 ? 0 : 1]; if (n) { p.setVertexBuffer(0, M.vb); p.setIndexBuffer(M.ib, 'uint32'); p.drawIndexed(M.ni, n, 0, 0, sx ? c.nPplM : 0); tris += M.ni / 3 * n; } } }      // (the people of the place: not drawn beyond 150 m, where each is a few points)
    if (c.nFruit && d < 45 + CH / 2) { p.setPipeline(pFruit); p.setVertexBuffer(0, FRUIT.vb); p.setVertexBuffer(1, c.fruitB); p.setIndexBuffer(FRUIT.ib, 'uint16'); p.drawIndexed(FRUIT.ni, c.nFruit); tris += c.nFruit * 32; }      // (a market's fruit, from near to)
    if (c.nBox) { const nb = d < 110 * lodK || c.nBoxFar === undefined ? c.nBox : c.nBoxFar; if (nb) { p.setPipeline(pBox); p.setVertexBuffer(0, vbCube); p.setVertexBuffer(1, c.boxB); p.setIndexBuffer(ibCube, 'uint16'); p.drawIndexed(36, nb); tris += nb * 12; } }
    // (culled: drawn from the list, as many as the graphics card counted; else all n)
    if (c.lN) { const l = c.lL; if (c.lS >= 0) { p.setPipeline(pLeafC[l]); p.setBindGroup(1, c.leafB._rg, [c.lO * 4]); p.drawIndirect(CU.args, c.lS * 256); } else { p.setPipeline(pLeaf[l]); p.setVertexBuffer(0, c.leafB); p.draw(LODV[l], c.lN); } tris += c.lN * (LODV[l] - 2); }
    if (c.gN) { const l = c.gL; if (c.gS >= 0) { p.setPipeline(pGrassC[l]); p.setBindGroup(1, c.grassB._rg, [c.gO * 4]); p.drawIndirect(CU.args, c.gS * 256); } else { p.setPipeline(pGrass[l]); p.setVertexBuffer(0, c.grassB); p.draw(GLODV[l], c.gN); } tris += c.gN * (GLODV[l] - 2); }
  }
  if (EXTRA.nBox) { p.setPipeline(pBox); p.setVertexBuffer(0, vbCube); p.setVertexBuffer(1, EXTRA.boxB); p.setIndexBuffer(ibCube, 'uint16'); p.drawIndexed(36, EXTRA.nBox); tris += EXTRA.nBox * 12; }
  // the ground last (but for the sky): its paint is the dearest there is, and this way none is spent where a tree or a house stands in front of it
  p.setPipeline(pTerrain); p.setIndexBuffer(ibGrid, 'uint16'); for (const c of seenC) { p.setVertexBuffer(0, c.vb); p.drawIndexed(gridI.length); tris += GN * GN * 2; }
  p.setPipeline(pSky); p.draw(3);
  if (STROLL) tris += STROLL.draw(p, false);      // (those walking the town's footpaths)
  if (typeof underDraw === 'function') underDraw(p);      // (the shade under the cars, under the tyre marks)
  if (STROLL) STROLL.glow(p);      // (the rubber tappers' lamps)
  if (typeof marksDraw === 'function') marksDraw(p);      // (tyre marks on the road, then the smoke over them)
  if (typeof smokeDraw === 'function') smokeDraw(p);      // (see-through, so after all else)
  p.end();
  // 3. bloom: bright parts spread down a chain of smaller images and added back up
  const pass = (v, pipe, bg, load = 'clear') => { const q = enc.beginRenderPass({ colorAttachments: [{ view: v, clearValue: [0, 0, 0, 1], loadOp: load, storeOp: 'store' }] }); q.setPipeline(pipe); q.setBindGroup(0, bg); q.draw(3); q.end(); };
  pass(bloomV[0], pBright, bgBloom.bright);
  for (let i = 1; i < NB; i++) pass(bloomV[i], pDown, bgBloom.down[i - 1]);
  for (let i = NB - 1; i > 0; i--) pass(bloomV[i - 1], pUp, bgBloom.up[i], 'load');
  // 4. to the screen: exposure, filmic curve, vignette
  p = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store' }] });
  p.setPipeline(pFinal); p.setBindGroup(0, bgFinal); p.draw(3); p.end();
  Q.submit([enc.finish()]);
}
requestAnimationFrame(frame);
try { if (localStorage.getItem('endless.noui')) document.body.classList.add('noui'); } catch (err) {}
window.__dbg = { snd: () => ({ state: AC && AC.state, now: AC && AC.currentTime, S: SND }), auto, car, fly, chunks, AT, setT: (t) => { tday = t; }, setWx: (k) => { wxAuto = false; wxCur = k; }, HUTS: typeof HUTS !== 'undefined' ? HUTS : null, get fps() { return fps; }, get tris() { return tris; } };
