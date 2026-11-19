// --------------------------------------------------------------------------------------------------------- music
// A small player in the corner: paste a YouTube playlist (or a single video) link and it plays through YouTube's own embedded
// player, which sits out of sight behind the picture, so only these controls show. The link is remembered for next time.
{
  const $u = $('mpU'), $t = $('mpT'), $s2 = $('mpS2'), $v = $('mpV'), $mp = $('mp'), PLAY = 'M8 5v14l11-7z', PAUSE = 'M6 5h4v14H6zM14 5h4v14h-4z';
  let yt = null, ready = false, want = null, loading = false, askedAt = 0;
  // Repeat: 0 off, 1 this one over and over, 2 the whole list round again (for a single video the same as 1). Remembered for next time.
  let rep = 0; try { rep = Number(localStorage.getItem('endless.repeat')) || 0; } catch (e) {}
  const showRep = () => { const b = $('mpLp'); b.classList.toggle('on', rep > 0); b.classList.toggle('one', rep === 1); b.title = 'วนซ้ำ: ' + ['ปิด', 'เพลงนี้', 'ทั้งรายการ'][rep]; if (ready && yt.setLoop) yt.setLoop(rep === 2); };
  const again = () => { if (!ready) return; yt.seekTo(0, true); yt.playVideo(); };
  const parse = (txt) => { const l = /[?&]list=([\w-]+)/.exec(txt), v = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/.exec(txt), q = txt.trim(); return l ? { list: l[1], v: v ? v[1] : null } : v ? { v: v[1] } : /^[\w-]{11}$/.test(q) ? { v: q } : /^(PL|UU|OL|RD|FL)[\w-]+$/.test(q) ? { list: q } : null; };
  const fmt = (x) => { x = Math.max(0, x | 0); const h = (x / 3600) | 0, m = ((x % 3600) / 60) | 0, sc = x % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sc).padStart(2, '0'); };
  const say = (a, b) => { if (a !== null) $t.textContent = a; if (b !== undefined) $s2.textContent = b; };
  const start = (w) => { askedAt = performance.now(); if (w.list) yt.loadPlaylist({ list: w.list, listType: 'playlist', index: 0 }); else yt.loadVideoById(w.v); yt.setVolume(+$v.value); say(null, 'กำลังโหลด ...'); };
  const boot = () => { if (loading) return; loading = true; say(null, 'กำลังต่อ YouTube ...');
    window.onYouTubeIframeAPIReady = () => { yt = new YT.Player('mpF', { width: 320, height: 200, playerVars: { playsinline: 1, controls: 0, disablekb: 1, autoplay: 1 }, events: {
      onReady: () => { ready = true; showRep(); if (want) start(want); },
      onStateChange: (e) => { const d = yt.getVideoData ? yt.getVideoData() : null, pl = yt.getPlaylist ? yt.getPlaylist() : null, n = pl && pl.length ? `เพลงที่ ${yt.getPlaylistIndex() + 1} จาก ${pl.length} · ` : '';
        if (e.data === 0 && (rep === 1 || (rep === 2 && !(pl && pl.length > 1)))) { again(); return; }      // ended: this one again (a list set to go round is turned back to its start by YouTube's own player)
        if (e.data === 1 && yt.setLoop) yt.setLoop(rep === 2);
        $('mpSi').setAttribute('d', e.data === 1 || e.data === 3 ? PAUSE : PLAY); $mp.classList.toggle('on', e.data === 1); if (e.data === 1) $mp.classList.remove('url');
        if (d && d.title) say(d.title, n + (e.data === 1 ? 'กำลังเล่น' : e.data === 3 ? 'กำลังโหลด ...' : e.data === 2 ? 'หยุดชั่วคราว' : e.data === 0 ? 'จบแล้ว' : 'พร้อมเล่น กดปุ่มเล่น')); },
      onError: (e) => { say(null, (e.data === 101 || e.data === 150 ? 'เจ้าของไม่อนุญาตให้เล่นนอก YouTube' : e.data === 100 ? 'ไม่พบวิดีโอนี้ หรือเป็นวิดีโอส่วนตัว' : 'เล่นไม่ได้ (รหัส ' + e.data + ')')); $mp.classList.add('url'); if (yt.getPlaylist && yt.getPlaylist()) setTimeout(() => yt.nextVideo(), 1800); } } }); };
    const tag = document.createElement('script'); tag.src = 'https://www.youtube.com/iframe_api'; tag.onerror = () => { loading = false; say(null, 'ต่อ YouTube ไม่ได้ ตรวจอินเทอร์เน็ต'); }; document.head.appendChild(tag); };
  const load = () => { const w = parse($u.value); if (!w) { say(null, 'ลิงก์นี้อ่านไม่ออก ต้องเป็นลิงก์ YouTube ที่มี v= หรือ list='); return; } want = w; try { localStorage.setItem('endless.music', $u.value); } catch (e) {} if (ready) start(w); else boot(); };
  $u.addEventListener('keydown', (e) => { if (e.key === 'Enter') { load(); $u.blur(); } });
  // Pasting a link is enough; no need for Enter. What is pasted takes the place of whatever was in the box: the last link is still there when
  // the box is opened again, and a new one pasted after it used to be joined on to its end - the two read as one, and the OLD one played again.
  $u.addEventListener('paste', (e) => { const t = e.clipboardData && e.clipboardData.getData('text'); if (t) { e.preventDefault(); $u.value = t.trim(); } setTimeout(load, 0); });
  $u.addEventListener('focus', () => setTimeout(() => $u.select(), 0));          // (and typing over it replaces it too: the old link is selected whole)
  $('mpL').onclick = () => { $mp.classList.toggle('url'); if ($mp.classList.contains('url')) $u.focus(); };
  $('mpS').onclick = () => { if (!ready) { if ($u.value) load(); else { $mp.classList.add('url'); $u.focus(); } return; } if (yt.getPlayerState() === 1) yt.pauseVideo(); else yt.playVideo(); };
  $('mpP').onclick = () => { if (ready) yt.previousVideo(); }; $('mpN').onclick = () => { if (ready) yt.nextVideo(); };
  $v.oninput = () => { if (ready) yt.setVolume(+$v.value); };
  $('mpRs').onclick = again;
  $('mpLp').onclick = () => { rep = (rep + 1) % 3; try { localStorage.setItem('endless.repeat', String(rep)); } catch (e) {} showRep(); };
  showRep();
  // The bar under the title is for seeking: click anywhere along it, or press and drag (the picture of how far it has got follows the pointer,
  // and the player is sent there when the drag ends - and every quarter second on the way, so that what is heard keeps up).
  { const B = $('mpB'); let drag = false, lastSeek = 0;
    const at = (e, done) => { const r = B.getBoundingClientRect(), d = yt.getDuration(), k = clamp((e.clientX - r.left) / r.width, 0, 1); if (!(d > 0)) return; $('mpBf').style.width = k * 100 + '%'; $('mpC').textContent = fmt(d * k);
      if (done || performance.now() - lastSeek > 250) { lastSeek = performance.now(); yt.seekTo(d * k, done); } };
    B.addEventListener('pointerdown', (e) => { if (!ready) return; drag = true; B.setPointerCapture(e.pointerId); at(e, false); });
    B.addEventListener('pointermove', (e) => { if (drag) at(e, false); });
    B.addEventListener('pointerup', (e) => { if (drag) { drag = false; at(e, true); } });
    B.addEventListener('pointercancel', () => { drag = false; }); }
  setInterval(() => { if (!ready || !yt.getCurrentTime) return; const c = yt.getCurrentTime() || 0, d = yt.getDuration() || 0, st = yt.getPlayerState();
    $('mpC').textContent = fmt(c); $('mpD').textContent = fmt(d); $('mpBf').style.width = (d > 0 ? c / d * 100 : 0) + '%';
    if (askedAt && st !== 1 && st !== 3 && performance.now() - askedAt > 4000) { askedAt = 0; say(null, 'เบราว์เซอร์ยังไม่ให้เล่นเอง กดปุ่มเล่นหนึ่งครั้ง'); } if (st === 1) askedAt = 0; }, 500);
  try { const last = localStorage.getItem('endless.music'); if (last) { $u.value = last; $mp.classList.remove('url'); say('รายการเดิมพร้อมเล่น', 'กดปุ่มเล่น หรือกดไอคอนลิงก์เพื่อเปลี่ยน'); } } catch (e) {}
}
let hold = false;
// How far a car standing at (x, z), its floor at height y, is into something solid (0: clear of everything). The car is taken as a circle
// 0.85 m across the half; a thing counts if any of it is between the car's sill and its roof (see the chunks: col).
function solidAt(x, z, y) {
  let pen = 0;
  for (const c of chunks.values()) { if (abs(c.x - x) > 46 || abs(c.z - z) > 46) continue; const A = c.col;
    for (let i = 0; i < A.length; i += 8) { const dx = x - A[i], dz = z - A[i + 1], hx = A[i + 4], hz = A[i + 5], rr = hx + hz + 0.85; if (abs(dx) > rr || abs(dz) > rr) continue;
      if (A[i + 6] > y + 1.25 || A[i + 7] < y + 0.45) continue;
      const ex = max(abs(dx * A[i + 2] - dz * A[i + 3]) - hx, 0), ez = max(abs(dx * A[i + 3] + dz * A[i + 2]) - hz, 0), d = 0.85 - Math.sqrt(ex * ex + ez * ez); if (d > pen) pen = d; } }
  return pen;
}
// Shrubs and saplings under the car are pressed flat, and stand up again slowly once it has gone. CRUSH: up to eight of them at a time, each
// [x, z, how far down 0..1, its reach]; the shaders bend every leaf and twig near such a place down toward the ground by that much.
const CRUSH = []; for (let i = 0; i < 8; i++) CRUSH.push([0, 0, 0, 1]);
function crushRecover(dt) { for (const q of CRUSH) q[2] = max(0, q[2] - dt / 9); }      // nine seconds to stand up again (every frame, whoever is steering - see main.js)
function crush(dt) {
  if (abs(car.v) < 0.3) return;
  for (const c of chunks.values()) { if (abs(c.x - car.x) > 40 || abs(c.z - car.z) > 40) continue; const A = c.soft;
    for (let i = 0; i < A.length; i += 3) { if (hypot(car.x - A[i], car.z - A[i + 1]) > A[i + 2] * 0.75 + 0.9) continue;
      let q = CRUSH.find((k) => k[0] === A[i] && k[1] === A[i + 1]); if (!q) { q = CRUSH[0]; for (const k of CRUSH) if (k[2] < q[2]) q = k; q[0] = A[i]; q[1] = A[i + 1]; q[3] = A[i + 2] * 1.15; }
      q[2] = min(1, q[2] + dt * 6 + dt / 9); } }
}
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
    let vt = min(min(auto.limit, zlim(car.z), ahead) / 3.6, Math.sqrt(4.5 / max(curv, 1e-4)));
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

