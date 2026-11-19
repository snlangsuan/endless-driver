// --------------------------------------------------------------------------------------------------------- Ruin: the game
// Driving through the dead city (anywhere: there is no one road to keep to), the dead who still walk it, the car's condition, the maps, and the
// lines of text at the top left. main.js calls drive / flyMove / hudInfo / underCover as it does Endless's, and gameTick once a frame.
deadWorld = 1;                                         // no power anywhere: every lamp and window is dark (render.js)
car.x = START[0]; car.z = START[1]; car.yaw = 0; car.y = surf(car.x, car.z);
tday = 0.655; wxCur = 2; wxNext = 240;                  // it begins late on an overcast afternoon
const game = { hp: 100, kills: 0, near: 0, dist: 0, msgT: 0 };
const say = (t, secs = 4) => { const m = $('msg'); m.textContent = t; m.classList.add('on'); game.msgT = secs; };
const underCover = () => false;
hudText = () => fps.toFixed(0) + ' fps';                 // the screen is kept bare: the frame rate at the top left, the full-screen button, nothing else
const COMPASS = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'];
const hudInfo = () => { const x = fly.on ? fly.x : car.x, z = fly.on ? fly.z : car.z, yw = fly.on ? fly.yaw : car.yaw, hd = COMPASS[((Math.round(yw / (PI / 4)) % 8) + 8) % 8];
  return `${placeName(x, z)} · ${todName()} ${wxName()} · ${fly.on ? 'กล้องบิน' : (abs(car.v) * 3.6).toFixed(0) + ' km/h ' + (onRoad ? 'บนถนน' : 'นอกถนน')} · หันไปทาง${hd}\nพิกัด ${(x / 1000).toFixed(2)} กม. ตะวันออก, ${(z / 1000).toFixed(2)} กม. เหนือ จากใจกลางเมือง · สภาพรถ ${game.hp.toFixed(0)}% · ชนซอมบี้ ${game.kills} ตัว · รอบตัว ${game.near} ตัว`; };
// ---- driving. The ground everywhere can be driven on; asphalt is fast, anything else slow and rough. What stops the car: steep ground, water,
// buildings and wrecks and trees (the chunks' col lists), the parapets of a bridge and the gap of a fallen one, and the edge of the map.
function drive(dt) {
  const thr = K('KeyW') - K('KeyS'); let st = K('KeyA') - K('KeyD');
  const dk0 = deckAt(car.x, car.z), onBr0 = dk0 > -1e8 && car.y > dk0 - 2.5, onRd = onBr0 || roadEdge(car.x, car.z) < 0.3, rough = onRd ? (!onBr0 && weedAt(car.x, car.z) > 0.69 ? 0.45 : 0) : 1;
  car.v += (thr > 0 ? (K('ShiftLeft') ? 13 : 8) * thr : thr < 0 ? (car.v > 0.5 ? -18 : -5) : 0) * dt;
  car.v -= (car.v * mix(0.2, 0.9, rough) + Math.sign(car.v) * mix(0.35, 1.4, rough)) * dt;
  if (car.v < -8) car.v = -8;
  { const cur = car.sm || 0, k = (st === 0 || st * cur < 0 ? 9 : 6) * dt; car.sm = cur + clamp(st - cur, -k, k); st = car.sm;      // (the wheel is turned as a hand turns it: see Endless's drive.js)
    car.yaw += st * dt * clamp(car.v / 5, -1, 1) * min(1.7, 11 / max(abs(car.v), 1)); }
  car.steer = (car.steer || 0) + (st - (car.steer || 0)) * (1 - exp(-dt * 8));
  const nx = car.x + sin(car.yaw) * car.v * dt, nz = car.z + cos(car.yaw) * car.v * dt, dk = deckAt(nx, nz), onBr = dk > -1e8 && car.y > dk - 2.5, gy = onBr ? dk : ground(nx, nz);
  let blocked = gy - car.y > 1.1 || (!onBr && gw[0] > 0) || max(abs(nx), abs(nz)) > 9900;
  if (onBr0 && !blocked) { const bx = Math.round(car.x / (8 * BK)) * 8 * BK; if (abs(nx - bx) > 6.7 && abs(nx - bx) > abs(car.x - bx)) blocked = true; if (!onBr && car.y - ground(nx, nz) > 1.5) blocked = true; }      // the parapet; the broken end of a fallen span
  let mx = nx, mz = nz;
  if (!blocked) { const p0 = solidAt(car.x, car.z, car.y) + 0.002;
    if (solidAt(nx, nz, car.y) > p0) { if (solidAt(nx, car.z, car.y) <= p0) { mz = car.z; car.v *= 1 - min(1, dt * 2.5); } else if (solidAt(car.x, nz, car.y) <= p0) { mx = car.x; car.v *= 1 - min(1, dt * 2.5); } else blocked = true; } }
  if (blocked) { if (abs(car.v) > 9) { game.hp -= (abs(car.v) - 9) * 0.5; thud(0.5); } car.v *= -0.25; }
  else { game.dist += hypot(mx - car.x, mz - car.z); car.x = mx; car.z = mz; car.y += (gy - car.y) * (1 - exp(-dt * 14)); }
  crush(dt);
  const gf = surf(car.x + sin(car.yaw) * 1.6, car.z + cos(car.yaw) * 1.6, car.y);
  car.pit += (atan2(gf - car.y, 1.6) - car.pit) * (1 - exp(-dt * 6));
  if (abs(car.v) > 2 && !drag) car.ly *= exp(-dt * 0.9);
  car.bump += dt * abs(car.v) * 2.2;
  return onRd;
}
function flyMove(dt) {
  const sp = (K('ShiftLeft') ? 90 : 16) * dt, f = K('KeyW') - K('KeyS'), r = K('KeyD') - K('KeyA'), u = K('KeyE') - K('KeyQ');
  const cp = cos(fly.pit), fx = sin(fly.yaw) * cp, fy = sin(fly.pit), fz = cos(fly.yaw) * cp, rx = -cos(fly.yaw), rz = sin(fly.yaw);
  fly.x = clamp(fly.x + (fx * f + rx * r) * sp, -HALF, HALF); fly.y += (fy * f + u) * sp; fly.z = clamp(fly.z + (fz * f + rz * r) * sp, -HALF, HALF);
  fly.y = max(fly.y, ground(fly.x, fly.z) + 0.8);
}
// ---- sounds of its own (through the engine's voice(): see sound.js)
const sndOn = () => SND && AC.state === 'running';
function thud(v) { if (sndOn()) { const t = AC.currentTime + 0.01; voice('sine', t, [[0, 130], [0.14, 42]], [[0.005, 1], [0.2, 0]], v); voice('square', t, [[0, 70], [0.08, 40]], [[0.004, 0.5], [0.09, 0]], v * 0.5, 0, 300); } }
function groan(v, pan) { if (sndOn()) { const t = AC.currentTime + 0.02, f = rnd(70, 125), d = rnd(0.7, 1.6); voice('sawtooth', t, [[0, f], [d * 0.5, f * rnd(0.7, 0.9)], [d, f * rnd(0.8, 1.15)]], [[0.2, 1], [d * 0.7, 0.7], [d, 0]], v, pan, rnd(320, 620)); } }
// ---- the dead. Up to ZN of them walk the land round the car (more in the city than in the woods): they stand or drift about until the car comes
// near, then come for it - most at a shamble, a few at a run. Hit at speed they go down and stay down; reaching a car that stands or crawls,
// they beat on it and it suffers. Each is six boxes (head, body, two arms held out, two legs) put into the engine's EXTRA buffer every frame.
const ZN = 56, ZBX = 6, zbuf = new Float32Array(ZN * ZBX * 12), ZS = [];
EXTRA.boxB = device.createBuffer({ size: zbuf.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
const SKIN = [col50(0.30, 0.34, 0.24), col50(0.36, 0.36, 0.30), col50(0.24, 0.28, 0.22)];
const CLOTH = [[0.30, 0.30, 0.32], [0.10, 0.14, 0.24], [0.35, 0.10, 0.08], [0.40, 0.38, 0.30], [0.12, 0.20, 0.12], [0.05, 0.05, 0.06], [0.45, 0.30, 0.12], [0.50, 0.50, 0.48]].map((c) => col50(...c));
function zSpawn(px, pz, rMin, rMax) {
  for (let tries = 0; tries < 6; tries++) {
    const a = Math.random() * TAU, r = rMin + Math.random() * (rMax - rMin), x = px + cos(a) * r, z = pz + sin(a) * r; if (max(abs(x), abs(z)) > 9850) continue;
    const u = urb(x, z); if (Math.random() > 0.2 + 0.8 * u) continue;                     // few in the woods
    if (u > 0.3 && roadEdge(x, z) > 9 && Math.random() < 0.7) continue;                  // in the city most keep to the streets
    const y = ground(x, z); if (gw[0] || solidAt(x, z, y) > 0) continue;
    ZS.push({ x, z, y, yaw: Math.random() * TAU, sp: Math.random() < 0.12 ? 4.2 + Math.random() * 1.6 : 0.9 + Math.random() * 1.5, st: 0, t: Math.random() * 9, ph: Math.random() * TAU, fall: 0, tx: x, tz: z,
      sk: SKIN[floor(Math.random() * SKIN.length)], sh: CLOTH[floor(Math.random() * CLOTH.length)], tr: CLOTH[floor(Math.random() * CLOTH.length)], s: 0.9 + Math.random() * 0.2, gr: Math.random() * 5 });
    return;
  }
}
function zombies(dt) {
  const px = fly.on ? fly.x : car.x, pz = fly.on ? fly.z : car.z, want = Math.round(ZN * (0.22 + 0.78 * HERE.u)), live = !fly.on;
  if (ZS.length < want && chunks.size > 40) zSpawn(px, pz, game.dist < 30 ? 45 : 80, 150);
  let near = 0, o = 0;
  for (let i = ZS.length - 1; i >= 0; i--) { const q = ZS[i], dx = car.x - q.x, dz = car.z - q.z, d = hypot(dx, dz);
    if (hypot(px - q.x, pz - q.z) > 190 || (q.st === 2 && q.t > 9)) { ZS.splice(i, 1); continue; }
    q.t += dt;
    if (q.st === 2) { q.fall = min(1, q.fall + dt * 3.2); }
    else {
      if (d < 60) near++;
      const hears = live && d < 38 + abs(car.v) * 2.2; if (hears && q.st === 0) { q.st = 1; q.gr = min(q.gr, 0.6); } else if (!hears && q.st === 1 && d > 80) q.st = 0;
      let sp = 0, want_ = q.yaw;
      if (q.st === 1) { want_ = atan2(dx, dz); sp = d > 1.25 ? q.sp : 0; }
      else { if (hypot(q.tx - q.x, q.tz - q.z) < 1 || q.t > 14) { q.t = 0; const a = Math.random() * TAU, r = Math.random() * 14; q.tx = q.x + cos(a) * r; q.tz = q.z + sin(a) * r; }
        want_ = atan2(q.tx - q.x, q.tz - q.z); sp = q.t < 9 ? 0.45 : 0; }
      let dy = want_ - q.yaw; dy -= Math.round(dy / TAU) * TAU; q.yaw += clamp(dy, -dt * 2.5, dt * 2.5);
      if (sp > 0) { const nx = q.x + sin(q.yaw) * sp * dt, nz = q.z + cos(q.yaw) * sp * dt, dk = deckAt(nx, nz), gy = dk > -1e8 && q.y > dk - 2.5 ? dk : ground(nx, nz);
        if ((dk > -1e8 || !gw[0]) && abs(gy - q.y) < 1.2 && solidAt(nx, nz, gy - 0.3) <= solidAt(q.x, q.z, q.y - 0.3) + 0.002) { q.x = nx; q.z = nz; q.y = gy; q.ph += sp * dt * 3.2; }
        else { q.yaw += (Math.random() - 0.3) * 1.4; q.tx = q.x; q.tz = q.z; } }
      // the car and it meet
      if (live && d < 1.55) {
        if (abs(car.v) > 2.5) { q.st = 2; q.t = 0; q.yaw = atan2(dx, dz); game.kills++; game.hp -= 0.4 + abs(car.v) * 0.03; car.v *= 0.93; thud(0.4); }
        else { game.hp -= 2.2 * dt; q.ph += dt * 9; if (Math.random() < dt * 2.5) thud(0.12); }
      }
      q.gr -= dt; if (q.gr < 0 && d < 45) { groan(0.05 * (1 - d / 45) * (q.st === 1 ? 1.6 : 1), clamp((dx * cos(car.yaw) - dz * sin(car.yaw)) / -20, -1, 1)); q.gr = 2 + Math.random() * 6; }
    }
    // its six boxes: local x right, y up, z forward; f: how far over backward it has gone (0 upright .. 1 flat)
    const s = q.s, cy = cos(q.yaw), sy = sin(q.yaw), f = -q.fall * 1.5, cf = cos(f), sf = sin(f), sink = q.st === 2 ? max(0, q.t - 6.5) * 0.12 : 0, sw = sin(q.ph) * (q.st === 2 ? 0 : 0.5), chase = q.st === 1 ? 1 : 0.45;
    const put = (lx, ly, lz, bx, by, bz, tilt, colr) => { const y2 = ly * cf - lz * sf, z2 = ly * sf + lz * cf; zbuf.set([q.x + (lx * cy + z2 * sy) * s, q.y + y2 * s - sink + 0.02, q.z + (-lx * sy + z2 * cy) * s, q.yaw, bx * s, by * s, bz * s, tilt + f, 50, colr, by * s, 0], o); o += 12; };
    const limb = (lx, py, len, a, w, dpt, colr) => put(lx, py - cos(a) * len / 2, -sin(a) * len / 2, w, len, dpt, a, colr);
    put(0, 1.19, 0, 0.46, 0.64, 0.26, 0.12, q.sh); put(0, 1.66, 0.04, 0.24, 0.27, 0.25, 0.2, q.sk);
    limb(-0.115, 0.87, 0.87, sw, 0.19, 0.21, q.tr); limb(0.115, 0.87, 0.87, -sw, 0.19, 0.21, q.tr);
    limb(-0.3, 1.45, 0.62, -1.25 * chase + sw * 0.35, 0.12, 0.13, q.sk); limb(0.3, 1.45, 0.62, -1.1 * chase - sw * 0.35, 0.12, 0.13, q.sk);
  }
  game.near = near; EXTRA.nBox = o / 12; if (o) Q.writeBuffer(EXTRA.boxB, 0, zbuf, 0, o);
}
// ---- the maps. The whole land is drawn once into MAP (500 x 500, 40 m to the dot; north up): woods, open ground, the city by how dense it is,
// the river, every road, the bridges. The small map at the top right is a piece of it round the car, enlarged, with the streets drawn in sharp
// over it; Tab (or a click on it) shows the whole.
const MAPN = 500, MAPS = 2 * HALF / MAPN, MAP = document.createElement('canvas'); MAP.width = MAP.height = MAPN;
{
  const g = MAP.getContext('2d'), im = g.createImageData(MAPN, MAPN), D = im.data;
  for (let j = 0; j < MAPN; j++) for (let i = 0; i < MAPN; i++) { const x = (i + 0.5) * MAPS - HALF, z = HALF - (j + 0.5) * MAPS, u = urb(x, z), w = woodAt(x, z), k = (j * MAPN + i) * 4;
    let c = [mix(74, 34, w), mix(80, 58, w), mix(52, 36, w)]; const ct = sm(0.15, 0.9, u), g0 = 96 + 34 * ct; c = [mix(c[0], g0, sm(0.1, 0.3, u) * 0.85), mix(c[1], g0 - 3, sm(0.1, 0.3, u) * 0.85), mix(c[2], g0 - 8, sm(0.1, 0.3, u) * 0.85)];
    if (u > 0.2 && lotKind(floor(x / BK), floor(z / BK)) === 1) c = [58, 84, 50];
    if (rivD(x, z) < 0) c = [52, 92, 118];
    D[k] = c[0]; D[k + 1] = c[1]; D[k + 2] = c[2]; D[k + 3] = 255; }
  g.putImageData(im, 0, 0);
  const mx = (x) => (x + HALF) / MAPS, mz = (z) => (HALF - z) / MAPS;
  for (const art of [false, true]) { g.strokeStyle = art ? 'rgba(217,207,174,.95)' : 'rgba(30,32,36,.45)'; g.lineWidth = art ? 1.1 : 0.5; g.beginPath();
    for (let k = -78; k <= 78; k++) { if (isArt(k) !== art) continue;
      for (let j = -78; j < 78; j++) { if (segOn(1, k, j)) { g.moveTo(mx(nsX(k, j * BK)), mz(j * BK)); g.lineTo(mx(nsX(k, (j + 0.5) * BK)), mz((j + 0.5) * BK)); g.lineTo(mx(nsX(k, (j + 1) * BK)), mz((j + 1) * BK)); }
        if (segOn(0, k, j)) { g.moveTo(mx(j * BK), mz(ewZ(k, j * BK))); g.lineTo(mx((j + 0.5) * BK), mz(ewZ(k, (j + 0.5) * BK))); g.lineTo(mx((j + 1) * BK), mz(ewZ(k, (j + 1) * BK))); } } }
    g.stroke(); }
  for (let k = -72; k <= 72; k += 8) { const b = brOf(k); if (!b) continue; g.fillStyle = b[5] ? '#e2493b' : '#f4f4f0'; g.fillRect(mx(b[0]) - 1.2, mz(b[1] + b[2]), 2.4, 2 * b[2] / MAPS); }
}
const mini = $('mini'), big = $('big'), bigW = $('bigW'); let mapT = 0;
const arrow = (g, x, y, yaw, r, colr) => { g.save(); g.translate(x, y); g.rotate(yaw); g.fillStyle = colr; g.strokeStyle = '#000'; g.lineWidth = r * 0.16; g.beginPath(); g.moveTo(0, -r); g.lineTo(r * 0.68, r * 0.8); g.lineTo(0, r * 0.42); g.lineTo(-r * 0.68, r * 0.8); g.closePath(); g.fill(); g.stroke(); g.restore(); };
function drawMaps() {
  const px = fly.on ? fly.x : car.x, pz = fly.on ? fly.z : car.z, yaw = fly.on ? fly.yaw : car.yaw;
  if (bigW.classList.contains('on')) { const S = Math.round(big.clientWidth * min(devicePixelRatio || 1, 2)); if (big.width !== S) big.width = big.height = S; const g = big.getContext('2d'), k = S / MAPN;
    g.imageSmoothingEnabled = true; g.drawImage(MAP, 0, 0, S, S); g.strokeStyle = 'rgba(255,255,255,.09)'; g.lineWidth = 1; g.beginPath(); for (let q = 1; q < 20; q++) { g.moveTo(q * S / 20, 0); g.lineTo(q * S / 20, S); g.moveTo(0, q * S / 20); g.lineTo(S, q * S / 20); } g.stroke();
    g.fillStyle = '#6ee7b7'; g.beginPath(); g.arc((START[0] + HALF) / MAPS * k, (HALF - START[1]) / MAPS * k, S * 0.007, 0, TAU); g.fill();
    arrow(g, (px + HALF) / MAPS * k, (HALF - pz) / MAPS * k, yaw, S * 0.016, '#ffd24a'); return; }
  if (document.body.classList.contains('noui')) return;
  const S = Math.round(188 * min(devicePixelRatio || 1, 2)); if (mini.width !== S) mini.width = mini.height = S; const g = mini.getContext('2d'), VR = 420, k = S / (2 * VR), X = (x) => (x - px + VR) * k, Zm = (z) => (pz - z + VR) * k;
  g.fillStyle = '#11151c'; g.fillRect(0, 0, S, S); g.imageSmoothingEnabled = true; g.drawImage(MAP, (px - VR + HALF) / MAPS, (HALF - pz - VR) / MAPS, 2 * VR / MAPS, 2 * VR / MAPS, 0, 0, S, S);
  g.lineCap = 'butt';
  for (const art of [false, true]) { g.strokeStyle = art ? '#3b3d42' : '#4a4c50'; g.lineWidth = (art ? 2 * HWA : 2 * HWM) * k; g.beginPath();
    for (let a = floor((px - VR) / BK); a <= Math.ceil((px + VR) / BK); a++) for (let b = floor((pz - VR) / BK) - 1; b <= Math.ceil((pz + VR) / BK); b++) {
      if (isArt(a) === art && segOn(1, a, b)) { g.moveTo(X(nsX(a, b * BK)), Zm(b * BK)); g.lineTo(X(nsX(a, (b + 0.5) * BK)), Zm((b + 0.5) * BK)); g.lineTo(X(nsX(a, (b + 1) * BK)), Zm((b + 1) * BK)); } }
    for (let b = floor((pz - VR) / BK); b <= Math.ceil((pz + VR) / BK); b++) for (let a = floor((px - VR) / BK) - 1; a <= Math.ceil((px + VR) / BK); a++) {
      if (isArt(b) === art && segOn(0, b, a)) { g.moveTo(X(a * BK), Zm(ewZ(b, a * BK))); g.lineTo(X((a + 0.5) * BK), Zm(ewZ(b, (a + 0.5) * BK))); g.lineTo(X((a + 1) * BK), Zm(ewZ(b, (a + 1) * BK))); } }
    g.stroke(); }
  // the river over the streets that stop at it, then the bridges over the river
  g.strokeStyle = '#345c76'; g.lineWidth = 2 * rivHW(px) * k; g.beginPath(); for (let x = px - VR - 40; x <= px + VR + 40; x += 20) g.lineTo(X(x), Zm(rivZ(x))); g.stroke();
  { const ka = Math.round(px / (8 * BK)) * 8, b = brOf(ka); if (b) { g.strokeStyle = b[5] ? '#e2493b' : '#8d8f92'; g.lineWidth = 15 * k; g.beginPath(); if (b[5]) { g.moveTo(X(b[0]), Zm(b[1] - b[2])); g.lineTo(X(b[0]), Zm(b[1] - b[2] * 0.36)); g.moveTo(X(b[0]), Zm(b[1] + b[2] * 0.36)); g.lineTo(X(b[0]), Zm(b[1] + b[2])); } else { g.moveTo(X(b[0]), Zm(b[1] - b[2])); g.lineTo(X(b[0]), Zm(b[1] + b[2])); } g.stroke(); } }
  g.fillStyle = '#e2493b'; for (const q of ZS) if (q.st !== 2) { g.beginPath(); g.arc(X(q.x), Zm(q.z), S * 0.011, 0, TAU); g.fill(); }
  arrow(g, S / 2, S / 2, yaw, S * 0.05, '#ffd24a');
  g.fillStyle = 'rgba(255,255,255,.7)'; g.font = `600 ${S * 0.07}px system-ui`; g.textAlign = 'center'; g.fillText('N', S / 2, S * 0.085);
}
const toggleMap = () => { bigW.classList.toggle('on'); mapT = 9; };
mini.addEventListener('click', toggleMap); bigW.addEventListener('click', toggleMap);
addEventListener('keydown', (e) => { if (e.code === 'Tab' && !(e.target && e.target.tagName === 'INPUT')) { e.preventDefault(); if (!e.repeat) toggleMap(); } });
// ---- once a frame
gameTick = (dt) => {
  const px = fly.on ? fly.x : car.x, pz = fly.on ? fly.z : car.z; HERE.x = px; HERE.z = pz; HERE.u = urb(px, pz); HERE.wood = woodAt(px, pz);
  zombies(dt);
  if (game.near === 0 && game.hp < 100) game.hp = min(100, game.hp + dt * 0.4);          // patched up, slowly, when nothing is about
  if (game.hp <= 0) { game.hp = 100; car.x = START[0]; car.z = START[1]; car.yaw = 0; car.v = 0; car.y = surf(car.x, car.z); ZS.length = 0; say('รถพังยับ ... คุณถูกลากกลับมาที่จุดเริ่มต้นพร้อมรถคันใหม่', 6); }
  if (game.msgT > 0) { game.msgT -= dt; if (game.msgT <= 0) $('msg').classList.remove('on'); }
  if ((mapT += dt) > 0.1) { mapT = 0; drawMaps(); }
};
setTimeout(() => say('เมืองนี้ตายไปหลายปีแล้ว ขับขึ้นเหนือไปตามถนนใหญ่เพื่อเข้าใจกลางเมือง · Tab ดูแผนที่', 9), 2500);
window.__ruin = { game, ZS, MAP };
