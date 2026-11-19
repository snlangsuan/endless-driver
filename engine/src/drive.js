// --------------------------------------------------------------------------------------------------------- driving (Endless)
// The car on the one long road: steering by hand or by the self-driving, what stops it, the flying camera, and the lines of text at the top left.
let hold = false;
function drive(dt) {
  let thr = K('KeyW') - K('KeyS'), st = K('KeyA') - K('KeyD'); const onRoad = abs(rdist(car.x, car.z)) < 3.9 + svW(car.z);      // (the frontage roads beside an underpass are road too: the car rolls on them as on the main road, not as on rough ground)
  if (auto.on) {
    // Keep to the middle of the left lane. The steering has three parts: what the bend itself asks for at this speed (so the car turns with the
    // road and is not left behind by it), the difference between where the car points and where the road points just ahead, and a pull back
    // toward the middle of the lane. (Aiming at a point far ahead, as before, cut every left-hand bend short by up to 2.5 m - off the road.)
    const dirz = cos(car.yaw) >= 0 ? 1 : -1, sl0 = roadSl(car.z), nn = Math.sqrt(1 + sl0 * sl0), va = abs(car.v);
    const hd = (zq) => atan2(roadSl(zq) * dirz, dirz), wrap = (q) => q - Math.round(q / TAU) * TAU;
    const pv = (0.5 + va * 0.08) / nn, th = hd(car.z + dirz * pv), kap = wrap(hd(car.z + dirz * (pv + 1.5 / nn)) - hd(car.z + dirz * (pv - 1.5 / nn))) / 3;
    const e = rdist(car.x, car.z) * dirz - 1.7;                       // how far to the left of the lane's middle the car is
    const rate = 1.7 * clamp(car.v / 5, -1, 1) / (1 + va * 0.03);     // how fast full lock turns the car (the same rule as below)
    st = clamp(car.v * kap / max(rate, 0.2) + wrap(th - atan2(e * 2.0, 3 + va * 0.35) - car.yaw) * 3.2, -1, 1);
    const kv = (zq) => abs(roadX(zq + 4) - 2 * roadX(zq) + roadX(zq - 4)) / 16 / Math.pow(1 + roadSl(zq) ** 2, 1.5);
    const curv = max(kv(car.z + dirz * (12 + abs(car.v) * 1.2) / nn), kv(car.z + dirz * 5 / nn));
    const ahead = zlim(car.z + dirz * (6 + car.v * car.v / 9) / nn);                              // the sign coming up, seen in time to be down to its speed on reaching it
    let vt = min((auto.signs ? min(auto.limit, zlim(car.z), ahead) : auto.limit) / 3.6, Math.sqrt(4.5 / max(curv, 1e-4)));
    // traffic lights: stop at the line (short of the zebra crossing) for red, and for amber if there is room to; wait; go on green
    const tl = tlNext(car.z, dirz); hold = false;
    if (tl) { const dist = (tl[0] - car.z) * dirz * nn - 10.9, sg = tlState(tl[1], time);            // from the car's nose to the line
      if (dist > -1.5 && (sg === 2 || (sg === 1 && dist > car.v * car.v / 10))) { vt = min(vt, dist < 0.4 ? 0 : Math.sqrt(2 * 2.4 * dist)); hold = dist < 0.4; } }          // never over the driver's own limit, nor the sign's, nor what the bend allows
    const dv = vt - car.v; thr = dv > 0.3 ? min(1, dv * 0.6) : dv < -1.5 ? -1 : 0; if (hold && car.v > 0.2) thr = -1;
  }
  car.v += (thr > 0 ? (K('ShiftLeft') ? 13 : 8) * thr : thr < 0 ? (car.v > 0.5 ? (auto.on ? -7 : -18) : auto.on ? 0 : -5) : 0) * dt;
  car.v -= (car.v * (onRoad ? 0.2 : 0.9) + Math.sign(car.v) * (onRoad ? 0.35 : 1.4)) * dt;
  if (auto.on && hold && abs(car.v) < 1) car.v = 0;                              // standing at a red light
  if (car.v < -8) car.v = -8;
  // Steering by hand. A key is all or nothing, and taken as it comes it threw the wheel hard over at once: at 70 km/h a touch of A or D turned the
  // car 12 degrees in a fifth of a second and it was off the road. So the wheel is turned as a quick hand turns it - a sixth of a second to full
  // lock, back to the middle a little faster when the key is let go (or the other pressed) - and full lock asks less the faster the car goes:
  // never more turning than presses the car sideways at 11 m/s2. (A first try was much gentler - 0.4 s to full lock, 8 m/s2 - and went too far
  // the other way: short taps, which is how keys are steered with, did next to nothing.) At town speeds the car turns as quickly as before; at
  // 70 km/h about half as quickly, at 110 two fifths. The self-driving steers by its own rule, unchanged.
  if (auto.on) { car.sm = 0; car.yaw += st * dt * 1.7 * clamp(car.v / 5, -1, 1) / (1 + abs(car.v) * 0.03); }
  else { const cur = car.sm || 0, k = (st === 0 || st * cur < 0 ? 9 : 6) * dt; car.sm = cur + clamp(st - cur, -k, k); st = car.sm;
    car.yaw += st * dt * clamp(car.v / 5, -1, 1) * min(1.7, 11 / max(abs(car.v), 1)); }
  car.steer = (car.steer || 0) + (st - (car.steer || 0)) * (1 - exp(-dt * 8));
  const nx = car.x + sin(car.yaw) * car.v * dt, nz = car.z + cos(car.yaw) * car.v * dt, top = udTop(nx, nz, car.y), pr = !top && pierAt(nx, nz), onBr = top || pr || brAt(nx, nz) || tunAt(nx, nz), gy = top ? roadYs(nz) + 0.03 : pr ? max(ground(nx, nz), PIERY + 0.06) : onBr ? roadY(nz) + 0.03 : ground(nx, nz);
  let blocked = gy - car.y > 1.1 || (!onBr && gw[0] > 0);
  if (inTun(nz) && abs(nx - roadX(nz)) > 3.55 && abs(nx - roadX(nz)) > abs(car.x - roadX(car.z)) && abs(car.x - roadX(car.z)) <= 4.75) blocked = true;      // the tunnel's walkways and walls
  { const dp = udip(nz); if (dp > 0.2) { const pd = (px, pz) => { const s = roadSl(pz); return abs(px - roadX(pz)) / Math.sqrt(1 + s * s); }, d0 = pd(car.x, car.z), d1 = pd(nx, nz), dz0 = abs(car.z - UD.zc), dz1 = abs(nz - UD.zc);      // (square to the road)      // an underpass:
    if (car.y < roadY(nz) + dp * 0.5) { if (d1 > 2.85 && d1 > d0) blocked = true; }                                     // down in the cutting, its walls;
    else if ((dz1 > 16 && d1 < 6.1 && d1 < d0) || (d0 < 6.1 && (dz0 - 15.4) * (dz1 - 15.4) < 0)) blocked = true; } }      // up at street level, the parapet along it and the rails of the slab (only across the cutting: the frontage roads run on through the crossroads)
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
  if (blocked) car.v *= -0.25; else { car.x = mx; car.z = mz; car.y += (gy - car.y) * (1 - exp(-dt * 14)); }
  crush(dt);
  const gf = surf(car.x + sin(car.yaw) * 1.6, car.z + cos(car.yaw) * 1.6, car.y);
  car.pit += (atan2(gf - car.y, 1.6) - car.pit) * (1 - exp(-dt * 6));
  if (abs(car.v) > 2 && !drag) car.ly *= exp(-dt * 0.9);
  car.bump += dt * abs(car.v) * 2.2;
  return onRoad;
}
function flyMove(dt) {
  const sp = (K('ShiftLeft') ? 60 : 14) * dt, f = K('KeyW') - K('KeyS'), r = K('KeyD') - K('KeyA'), u = K('KeyE') - K('KeyQ');
  const cp = cos(fly.pit), fx = sin(fly.yaw) * cp, fy = sin(fly.pit), fz = cos(fly.yaw) * cp, rx = -cos(fly.yaw), rz = sin(fly.yaw);
  const was = tunAt(fly.x, fly.z) && fly.y < roadY(fly.z) + 6.4;                 // the flying camera can go through a tunnel: once in, it is kept between floor, walls and roof
  fly.x += (fx * f + rx * r) * sp; fly.y += (fy * f + u) * sp; fly.z += (fz * f + rz * r) * sp;
  if (inTun(fly.z) && (was || (abs(fly.x - roadX(fly.z)) < 4.6 && fly.y < roadY(fly.z) + 6))) { fly.x = clamp(fly.x, roadX(fly.z) - 4.4, roadX(fly.z) + 4.4); fly.y = clamp(fly.y, roadY(fly.z) + 0.6, roadY(fly.z) + 5.2); }
  else fly.y = max(fly.y, ground(fly.x, fly.z) + 0.8);
}
// The second and third lines of the text at the top left: where the car is, the hour and the weather, the speed, the self-driving.
const hudInfo = () => `${isOf(car.z) && abs(car.z - IS.zc) < 525 ? (isBr(car.z) ? 'สะพานแขวนข้ามทะเล' : 'เกาะ') : inTun(car.z) ? 'อุโมงค์ลอดเขา' : udip(car.z) > 1 ? 'ทางลอด' : chyAt(car.z) ? 'ถนนพญาเสือโคร่ง' : hpW(car.z) > 0.5 ? 'ทางเขาโค้งหักศอก' : seaW(car.z) > 0.5 ? 'ถนนเลียบทะเล' : townW(car.z) > 0.5 ? 'ในเมือง' : hillW(car.z) > 0.5 ? 'ถนนเขา ป่า อ่างเก็บน้ำ' : snowW(car.z) > 0.5 ? 'ทุ่งหิมะ' : flwAt(car.z) ? 'ทุ่งดอกไม้และนาข้าว' : 'ทุ่งนา'} · ${todName()} ${wxName()} ${seasonName(car.z)} · ${fly.on ? 'กล้องบิน' : (abs(car.v) * 3.6).toFixed(0) + ' km/h ' + (onRoad ? 'บนถนน' : 'นอกถนน')} · ${auto.on ? 'ขับอัตโนมัติ' : 'ขับเอง'} (จำกัด ${auto.limit} km/h) · ป้าย ${zlim(car.z)}`;
// Under cover (inside a tunnel, beneath the slab of an underpass): no rain or snow crosses the view there, and the sounds of outdoors fall away.
const underCover = (cx2, cy2, cz2) => (inTun(cz2) && abs(cx2 - roadX(cz2)) < 5 && cy2 < roadY(cz2) + 6.5) || (udOf(cz2) && abs(cz2 - UD.zc) < 15 && cy2 < roadY(cz2) + 5.2);
