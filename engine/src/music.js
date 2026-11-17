// --------------------------------------------------------------------------------------------------------- music
// A small player in the corner: paste a YouTube playlist (or a single video) link and it plays through YouTube's own embedded
// player, which sits out of sight behind the picture, so only these controls show. The link is remembered for next time.
{
  const $u = $('mpU'), $t = $('mpT'), $s2 = $('mpS2'), $v = $('mpV'), $mp = $('mp'), PLAY = 'M8 5v14l11-7z', PAUSE = 'M6 5h4v14H6zM14 5h4v14h-4z';
  let yt = null, ready = false, want = null, loading = false, askedAt = 0;
  const parse = (txt) => { const l = /[?&]list=([\w-]+)/.exec(txt), v = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/.exec(txt), q = txt.trim(); return l ? { list: l[1], v: v ? v[1] : null } : v ? { v: v[1] } : /^[\w-]{11}$/.test(q) ? { v: q } : /^(PL|UU|OL|RD|FL)[\w-]+$/.test(q) ? { list: q } : null; };
  const fmt = (x) => { x = Math.max(0, x | 0); const h = (x / 3600) | 0, m = ((x % 3600) / 60) | 0, sc = x % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sc).padStart(2, '0'); };
  const say = (a, b) => { if (a !== null) $t.textContent = a; if (b !== undefined) $s2.textContent = b; };
  const start = (w) => { askedAt = performance.now(); if (w.list) yt.loadPlaylist({ list: w.list, listType: 'playlist', index: 0 }); else yt.loadVideoById(w.v); yt.setVolume(+$v.value); say(null, 'กำลังโหลด ...'); };
  const boot = () => { if (loading) return; loading = true; say(null, 'กำลังต่อ YouTube ...');
    window.onYouTubeIframeAPIReady = () => { yt = new YT.Player('mpF', { width: 320, height: 200, playerVars: { playsinline: 1, controls: 0, disablekb: 1, autoplay: 1 }, events: {
      onReady: () => { ready = true; if (want) start(want); },
      onStateChange: (e) => { const d = yt.getVideoData ? yt.getVideoData() : null, pl = yt.getPlaylist ? yt.getPlaylist() : null, n = pl && pl.length ? `เพลงที่ ${yt.getPlaylistIndex() + 1} จาก ${pl.length} · ` : '';
        $('mpSi').setAttribute('d', e.data === 1 || e.data === 3 ? PAUSE : PLAY); $mp.classList.toggle('on', e.data === 1); if (e.data === 1) $mp.classList.remove('url');
        if (d && d.title) say(d.title, n + (e.data === 1 ? 'กำลังเล่น' : e.data === 3 ? 'กำลังโหลด ...' : e.data === 2 ? 'หยุดชั่วคราว' : e.data === 0 ? 'จบแล้ว' : 'พร้อมเล่น กดปุ่มเล่น')); },
      onError: (e) => { say(null, (e.data === 101 || e.data === 150 ? 'เจ้าของไม่อนุญาตให้เล่นนอก YouTube' : e.data === 100 ? 'ไม่พบวิดีโอนี้ หรือเป็นวิดีโอส่วนตัว' : 'เล่นไม่ได้ (รหัส ' + e.data + ')')); $mp.classList.add('url'); if (yt.getPlaylist && yt.getPlaylist()) setTimeout(() => yt.nextVideo(), 1800); } } }); };
    const tag = document.createElement('script'); tag.src = 'https://www.youtube.com/iframe_api'; tag.onerror = () => { loading = false; say(null, 'ต่อ YouTube ไม่ได้ ตรวจอินเทอร์เน็ต'); }; document.head.appendChild(tag); };
  const load = () => { const w = parse($u.value); if (!w) { say(null, 'ลิงก์นี้อ่านไม่ออก ต้องเป็นลิงก์ YouTube ที่มี v= หรือ list='); return; } want = w; try { localStorage.setItem('endless.music', $u.value); } catch (e) {} if (ready) start(w); else boot(); };
  $u.addEventListener('keydown', (e) => { if (e.key === 'Enter') { load(); $u.blur(); } });
  $u.addEventListener('paste', () => setTimeout(load, 0));                                     // pasting a link is enough; no need for Enter
  $('mpL').onclick = () => { $mp.classList.toggle('url'); if ($mp.classList.contains('url')) $u.focus(); };
  $('mpS').onclick = () => { if (!ready) { if ($u.value) load(); else { $mp.classList.add('url'); $u.focus(); } return; } if (yt.getPlayerState() === 1) yt.pauseVideo(); else yt.playVideo(); };
  $('mpP').onclick = () => { if (ready) yt.previousVideo(); }; $('mpN').onclick = () => { if (ready) yt.nextVideo(); };
  $v.oninput = () => { if (ready) yt.setVolume(+$v.value); };
  $('mpB').onclick = (e) => { if (!ready) return; const r = $('mpB').getBoundingClientRect(), d = yt.getDuration(); if (d > 0) yt.seekTo(d * clamp((e.clientX - r.left) / r.width, 0, 1), true); };
  setInterval(() => { if (!ready || !yt.getCurrentTime) return; const c = yt.getCurrentTime() || 0, d = yt.getDuration() || 0, st = yt.getPlayerState();
    $('mpC').textContent = fmt(c); $('mpD').textContent = fmt(d); $('mpBf').style.width = (d > 0 ? c / d * 100 : 0) + '%';
    if (askedAt && st !== 1 && st !== 3 && performance.now() - askedAt > 4000) { askedAt = 0; say(null, 'เบราว์เซอร์ยังไม่ให้เล่นเอง กดปุ่มเล่นหนึ่งครั้ง'); } if (st === 1) askedAt = 0; }, 500);
  try { const last = localStorage.getItem('endless.music'); if (last) { $u.value = last; $mp.classList.remove('url'); say('รายการเดิมพร้อมเล่น', 'กดปุ่มเล่น หรือกดไอคอนลิงก์เพื่อเปลี่ยน'); } } catch (e) {}
}
function drive(dt) {
  let thr = K('KeyW') - K('KeyS'), st = K('KeyA') - K('KeyD'); const onRoad = abs(rdist(car.x, car.z)) < 3.9;
  if (auto.on) {
    // aim at a point ahead in the left lane; ease off for bends so the car is never thrown wide
    const sl0 = roadSl(car.z), nn = Math.sqrt(1 + sl0 * sl0), dirz = cos(car.yaw) >= 0 ? 1 : -1, look = (7 + abs(car.v) * 0.55) / nn, [tx, tz] = rp(car.z + dirz * look, 1.7 * dirz);
    let er = atan2(tx - car.x, tz - car.z) - car.yaw; er -= Math.round(er / TAU) * TAU;
    st = clamp(er * 3, -1, 1);
    const kv = (zq) => abs(roadX(zq + 4) - 2 * roadX(zq) + roadX(zq - 4)) / 16 / Math.pow(1 + roadSl(zq) ** 2, 1.5);
    const curv = max(kv(car.z + dirz * (12 + abs(car.v) * 1.2) / nn), kv(car.z + dirz * 5 / nn));
    const vt = min(auto.limit / 3.6, Math.sqrt(4.5 / max(curv, 1e-4)));
    const dv = vt - car.v; thr = dv > 0.3 ? min(1, dv * 0.6) : dv < -1.5 ? -1 : 0;
  }
  car.v += (thr > 0 ? (K('ShiftLeft') ? 13 : 8) * thr : thr < 0 ? (car.v > 0.5 ? (auto.on ? -7 : -18) : auto.on ? 0 : -5) : 0) * dt;
  car.v -= (car.v * (onRoad ? 0.2 : 0.9) + Math.sign(car.v) * (onRoad ? 0.35 : 1.4)) * dt;
  if (car.v < -8) car.v = -8;
  car.steer = (car.steer || 0) + (st - (car.steer || 0)) * (1 - exp(-dt * 8));
  car.yaw += st * dt * 1.7 * clamp(car.v / 5, -1, 1) / (1 + abs(car.v) * 0.03);
  const nx = car.x + sin(car.yaw) * car.v * dt, nz = car.z + cos(car.yaw) * car.v * dt, onBr = brAt(nx, nz), gy = onBr ? roadY(nz) + 0.03 : ground(nx, nz);
  let blocked = gy - car.y > 1.1 || (!onBr && gw[0] > 0);
  if (brSpan(nz) && (abs(car.x - roadX(car.z)) - 4.3) * (abs(nx - roadX(nz)) - 4.3) < 0) blocked = true;      // the balustrade                  // steep ground and water stop the car
  if (seaW(nz) >= 0.35 && pineWt(nz) <= 0.35) {                                         // so do the guard rail and the retaining wall of the coast road
    const d0 = car.x - roadX(car.z), d1 = nx - roadX(nz);
    if ((d0 - 4.2) * (d1 - 4.2) < 0 && !railGap(floor(nz / 4))) blocked = true;
    if ((d0 + 6.5) * (d1 + 6.5) < 0) blocked = true;
  }
  if (blocked) car.v *= -0.25; else { car.x = nx; car.z = nz; car.y += (gy - car.y) * (1 - exp(-dt * 14)); }
  const gf = surf(car.x + sin(car.yaw) * 1.6, car.z + cos(car.yaw) * 1.6);
  car.pit += (atan2(gf - car.y, 1.6) - car.pit) * (1 - exp(-dt * 6));
  if (abs(car.v) > 2 && !drag) car.ly *= exp(-dt * 0.9);
  car.bump += dt * abs(car.v) * 2.2;
  return onRoad;
}
function flyMove(dt) {
  const sp = (K('ShiftLeft') ? 60 : 14) * dt, f = K('KeyW') - K('KeyS'), r = K('KeyD') - K('KeyA'), u = K('KeyE') - K('KeyQ');
  const cp = cos(fly.pit), fx = sin(fly.yaw) * cp, fy = sin(fly.pit), fz = cos(fly.yaw) * cp, rx = -cos(fly.yaw), rz = sin(fly.yaw);
  fly.x += (fx * f + rx * r) * sp; fly.y += (fy * f + u) * sp; fly.z += (fz * f + rz * r) * sp;
  fly.y = max(fly.y, ground(fly.x, fly.z) + 0.8);
}

