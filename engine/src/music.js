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
