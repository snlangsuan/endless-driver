// --------------------------------------------------------------------------------------------------------- input, car, camera
const keys = new Set();
const auto = { on: false, limit: 90 };   // self-driving: keeps the left lane and holds the speed limit (km/h)
// The drive starts somewhere different each time: any stretch within about 14 km of the origin (further out the ground's fine grain, which is worked out from world position, begins to lose precision), in the left lane, facing along the road.
const SPAWN = (floor(Math.random() * 24) - 12 + 0.15 + Math.random() * 0.7) * SEG, SP = rp(SPAWN, 1.7);
const car = { x: SP[0], z: SP[1], y: 0, yaw: atan2(roadSl(SPAWN), 1), v: 0, pit: 0, ly: 0, lp: 0, bump: 0 };
car.y = surf(car.x, car.z);
const fly = { on: false, x: 0, y: 0, z: 0, yaw: 0, pit: 0 };
// Full screen is of the whole page, so the text and the music player stay. While it is on, the page asks for the Esc key for itself (Keyboard Lock, in
// Chrome and Edge): a press of Esc then only lets go of the mouse, as it does in a window, instead of also leaving full screen; holding Esc down
// leaves it (the browser says so when full screen begins), as do G and the button. Browsers without Keyboard Lock keep their own Esc.
const FS_ON = 'M4 4h6v2H6v4H4zM14 4h6v6h-2V6h-4zM4 14h2v4h4v2H4zM18 14h2v6h-6v-2h4z', FS_OFF = 'M8 4h2v6H4V8h4zM14 4h2v4h4v2h-6zM4 14h6v6H8v-4H4zM14 14h6v2h-4v4h-2z';
const toggleFS = () => { try { const r = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } catch (err) {} };
document.addEventListener('fullscreenchange', () => {
  const on = !!document.fullscreenElement, kb = navigator.keyboard; $('fsI').setAttribute('d', on ? FS_OFF : FS_ON); $('fs').title = on ? 'ออกจากเต็มจอ (G)' : 'เต็มจอ (G)';
  try { if (kb && kb.lock) { const r = on ? kb.lock(['Escape']) : kb.unlock(); if (r && r.catch) r.catch(() => {}); } } catch (err) {}
});
// The clock at the bottom left, above the line of keys (and in its place when H hides that): the hour in the world, in bare figures.
setInterval(() => { const m = floor(tday * 1440); $('clk').textContent = String(floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); 
  // the speed, in the same bare figures, over the music player - shown only while H has the rest of the text hidden (the player grows when pointed at: it is kept just above wherever the player's top is)
  $('spdN').textContent = (abs(car.v) * 3.6).toFixed(0); $('spd').style.bottom = (innerHeight - $('mp').getBoundingClientRect().top + 6) + 'px'; }, 250);
$('fs').addEventListener('click', (e) => { e.currentTarget.blur(); toggleFS(); });      // (blurred, so that Space or Enter while driving does not press it again)
// The sky panel (the cloud button, top right): the hour (left to run on its own, or held at a chosen hour), the season, and the weather with how
// strong it is. It only sets what the keys set too (T, R, Y), so the two never disagree: opening it reads the state back from the world.
{
  const D = $('sky'), T = $('skT'), S = $('skS'), Wb = $('skW'), I = $('skI'), Rg = $('skR'), Rv = $('skRv');
  for (let h = 0; h < 24; h++) T.add(new Option(String(h).padStart(2, '0') + ':00', h));
  // what each weather is made of at strength s (0..1): [cloud cover, mist, rain, storm], as in WXP
  const MAKE = { cloud: (s) => [0.25 + 0.7 * s, 0, 0, 0], rain: (s) => [0.85 + 0.15 * s, 0.05 + 0.25 * s, 0.15 + 0.85 * s, 0], storm: (s) => [1, 0.3, 0.85 + 0.15 * s, 0.6 + 0.4 * s], fog: (s) => [0.25 + 0.25 * s, 0.3 + 0.7 * s, 0, 0], snow: (s) => [0.6 + 0.35 * s, 0.1 + 0.3 * s, 0, 0, 0.2 + 0.8 * s] };      // (snow: a fifth part, how hard it falls)
  const KIND = [null, ['sun', 0], ['cloud', 0.5], ['rain', 0.2], ['rain', 0.9], ['storm', 0.8], ['fog', 0.15], ['fog', 1]];      // the keyed kinds 1..7 (R) as kind and strength
  let kind = 'auto';
  const press = (box, v) => { for (const b of box.children) b.setAttribute('aria-pressed', b.dataset.v === String(v)); };
  const strength = () => { const on = !!MAKE[kind]; I.hidden = !on; Rv.textContent = on ? Rg.value + '%' : ''; };
  const apply = () => {
    if (kind === 'auto') { if (!wxAuto) { wxAuto = true; wxNext = time; } }
    else { wxAuto = false; if (kind === 'sun') wxCur = 1; else { wxS = Rg.value / 100; WXP[0] = MAKE[kind](wxS); wxCur = 0; } }
    strength();
  };
  const read = () => {
    T.value = tHold ? String(floor(tday * 24 + 0.001) % 24) : '-1'; press(S, seaMode);
    if (wxAuto) kind = 'auto'; else if (wxCur === 0) Rg.value = Math.round(wxS * 100); else { kind = KIND[wxCur][0]; Rg.value = Math.round(KIND[wxCur][1] * 100); }
    press(Wb, kind); strength();
    if (windSet >= 0) Wd.value = Math.round(windSet * 100); else Wd.value = Math.round(clamp(AT.wind / 5.5, 0, 1) * 100); windShow();      // (left alone, the slider shows the wind there is)
  };
  const clock = () => { const m = floor(tday * 1440); $('skNow').textContent = 'ตอนนี้ ' + String(floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + (tHold ? ' (ล็อก)' : ''); };
  T.addEventListener('change', () => {
    const h = Number(T.value);
    if (h < 0) { tHold = false; tday = Math.random(); } else { tHold = true; if (h / 24 < tday - 0.5) dayN++; tday = h / 24 + 0.0001; }      // (สุ่ม: a random hour, and the day runs on from it)
    headOn = -1; clock();
  });
  S.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; seaMode = Number(b.dataset.v); press(S, seaMode); });
  Wb.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; kind = b.dataset.v; if (MAKE[kind] && kind !== 'auto') Rg.value = kind === 'fog' ? 60 : 50; press(Wb, kind); apply(); });
  Rg.addEventListener('input', apply);
  // the wind: left to the place and the weather (อัตโนมัติ), or held at a strength chosen on the slider - moving the slider takes it over
  const Wa = $('skWa'), Wd = $('skWd'), windShow = () => { Wa.setAttribute('aria-pressed', windSet < 0); $('skWv').textContent = windSet < 0 ? '' : Wd.value + '%' + (windSet < 0.08 ? ' · ลมสงบ' : windSet < 0.35 ? ' · ลมอ่อน' : windSet < 0.65 ? ' · ลมแรง' : ' · ลมพายุ'); };
  Wd.addEventListener('input', () => { windSet = Wd.value / 100; windShow(); });
  Wa.addEventListener('click', () => { windSet = -1; windShow(); });
  // The panel may be left open while driving, so it must not keep the keys: only the ones a control needs to be worked from the keyboard stay with
  // it (Tab, the arrows, Space, Enter - and only while that control has the focus). Any other key - W A S D and the rest - lets go of the control
  // and goes to the car as always. (Held back altogether, as they first were, the car could not be driven at all with the panel open.)
  D.addEventListener('keydown', (e) => { if (/^(Tab|Arrow|Space|Enter|Home|End|Page)/.test(e.code)) e.stopPropagation(); else if (e.code !== 'Escape') { e.preventDefault(); if (e.target.blur) e.target.blur(); } }, true);
  D.addEventListener('keyup', (e) => { if (/^(Tab|Arrow|Space|Enter|Home|End|Page)/.test(e.code)) e.stopPropagation(); });
  D.addEventListener('change', (e) => { if (e.target.blur) e.target.blur(); });      // (a choice once made, the control gives the keys back)
  D.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) b.blur(); });
  let tick = 0;
  D.addEventListener('close', () => clearInterval(tick));
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement && D.open) D.close(); });      // (taking hold of the mouse to drive puts it away)
  $('skyB').addEventListener('click', (e) => { e.currentTarget.blur(); if (D.open) { D.close(); return; } if ($('cfg').open) $('cfg').close(); read(); clock(); D.show(); if (D.contains(document.activeElement)) document.activeElement.blur(); tick = setInterval(() => { clock(); if (!D.matches(':focus-within')) read(); }, 500); });
}
// The settings panel (the cog, top right): the picture - best looking, or smooth for recording the screen (see render.js) - and the sound: how loud
// everything is (the main volume; off altogether, as M does) and, apart from that, how loud the one-off effects are - thunder, birds, crickets,
// dogs. (The music has its own volume, on the music player.) Remembered.
let gameVol = 1, fxVol = 1, mute = false; try { const f = localStorage.getItem('endless.fx'); if (f !== null && f !== '') fxVol = clamp(Number(f), 0, 1); } catch (e) {}
try { const v = localStorage.getItem('endless.vol'); if (v !== null && v !== '') gameVol = clamp(Number(v), 0, 1); mute = localStorage.getItem('endless.mute') === '1'; } catch (e) {}
const setVol = () => { if (SND) { SND.master.gain.setTargetAtTime(mute ? 0 : 0.9 * gameVol, AC.currentTime, 0.05); SND.fx.gain.setTargetAtTime(fxVol, AC.currentTime, 0.05); } try { localStorage.setItem('endless.fx', String(fxVol)); localStorage.setItem('endless.vol', String(gameVol)); localStorage.setItem('endless.mute', mute ? '1' : ''); } catch (e) {} if ($('cfg').open) cfgRead(); };
const cfgRead = () => { for (const b of $('skQ').children) b.setAttribute('aria-pressed', b.dataset.v === (smooth ? '1' : '0'));
  $('cfVo').value = Math.round(gameVol * 100); $('cfVv').textContent = mute ? 'ปิดอยู่' : Math.round(gameVol * 100) + '%'; $('cfMu').setAttribute('aria-pressed', mute); $('cfMu').textContent = mute ? 'เปิดเสียง' : 'ปิดเสียง';
  $('cfFx').value = Math.round(fxVol * 100); $('cfFv').textContent = Math.round(fxVol * 100) + '%'; };
{
  const D = $('cfg');
  $('skQ').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; smooth = b.dataset.v === '1'; try { localStorage.setItem('endless.smooth', smooth ? '1' : ''); } catch (err) {} scale = smooth ? 0.8 : 1; lodK = 1; cfgRead(); });      // (changing it starts the frame-rate keeping afresh)
  $('cfVo').addEventListener('input', () => { gameVol = $('cfVo').value / 100; if (gameVol > 0) mute = false; initSound(); setVol(); cfgRead(); });
  $('cfMu').addEventListener('click', () => { mute = !mute; initSound(); setVol(); cfgRead(); });
  $('cfFx').addEventListener('input', () => { fxVol = $('cfFx').value / 100; initSound(); setVol(); cfgRead(); });
  // (as with the sky panel: the keys stay the car's, but for those a focused control needs)
  D.addEventListener('keydown', (e) => { if (/^(Tab|Arrow|Space|Enter|Home|End|Page)/.test(e.code)) e.stopPropagation(); else if (e.code !== 'Escape') { e.preventDefault(); if (e.target.blur) e.target.blur(); } }, true);
  D.addEventListener('keyup', (e) => { if (/^(Tab|Arrow|Space|Enter|Home|End|Page)/.test(e.code)) e.stopPropagation(); });
  D.addEventListener('change', (e) => { if (e.target.blur) e.target.blur(); });
  D.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) b.blur(); });
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement && D.open) D.close(); });
  $('cfgB').addEventListener('click', (e) => { e.currentTarget.blur(); if (D.open) { D.close(); return; } if ($('sky').open) $('sky').close(); cfgRead(); D.show(); if (D.contains(document.activeElement)) document.activeElement.blur(); });
}
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && document.pointerLockElement) { document.exitPointerLock(); return; }      // (with Esc held for the page, letting go of the mouse is the page's to do)
  if (e.code === 'Escape' && ($('sky').open || $('cfg').open)) { if ($('sky').open) $('sky').close(); if ($('cfg').open) $('cfg').close(); return; }      // (then it closes whichever panel is open)
  if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text') return;       // typing in the music box is not driving
  initSound(); if (e.code === 'KeyM' && !e.repeat) { mute = !mute; setVol(); }
  if (e.repeat) return; keys.add(e.code);
  if (e.code === 'KeyT') { const J = [0.31, 0.5, 0.72, 0.9]; const n = J.find((t) => t > tday + 0.01); if (n === undefined) { tday = J[0]; dayN++; } else tday = n; headOn = -1; }
  else if (e.code === 'KeyR') { wxAuto = false; wxCur = wxCur % 7 + 1; }
  else if (e.code === 'KeyY') { wxAuto = !wxAuto; wxNext = time + 60 + Math.random() * 120; }
  else if (e.code === 'KeyV') view3 = !view3;
  else if ((e.code === 'KeyB' || e.code === 'KeyN') && SND && AC.state === 'running') dogVoice(AC.currentTime + 0.05, 1, e.code === 'KeyB' ? 'howl' : 'bark');      // B: a dog howls now, N: it barks - close and plain (for listening to the sounds)
  else if (e.code === 'KeyL') headOn = (headOn === -1 ? (AT.night > 0.5 ? 0 : 1) : headOn ? 0 : 1);
  else if (e.code === 'KeyP') auto.on = !auto.on;
  else if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.code === 'BracketRight') auto.limit = min(160, auto.limit + 10);
  else if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.code === 'BracketLeft') auto.limit = max(30, auto.limit - 10);
  else if ((e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'KeyS') && !fly.on) auto.on = false;      // taking the wheel or braking hands control back
  else if (e.code === 'KeyG' && !e.repeat) toggleFS();      // G (or the button at the top right): full screen and back
  else if (e.code === 'KeyH' && !e.repeat) { const off = document.body.classList.toggle('noui'); try { localStorage.setItem('endless.noui', off ? '1' : ''); } catch (err) {} }      // H hides or shows the text over the picture (not the music player)
  else if (e.code === 'KeyF') { fly.on = !fly.on; if (fly.on) { fly.x = car.x; fly.z = car.z; fly.y = car.y + 4; fly.yaw = car.yaw; fly.pit = -0.1; }
    else {      // Coming down from the flying camera, the car is set down where the camera has got to - not left where it was taken off from - facing
      // the way the camera looks. If nothing can stand there (in water, inside a building, in a tunnel's rock) it is put on the road abreast
      // of the place instead, in the left lane for the way it faces.
      let x = fly.x, z = fly.z; ground(x, z); const wet = gw[0] !== 0, y0 = surf(x, z, fly.y);
      if (wet || solidAt(x, z, y0) > 0 || (inTun(z) && !tunAt(x, z))) { const dir = cos(fly.yaw) >= 0 ? 1 : -1, q = rp(z, 1.7 * dir); x = q[0]; z = q[1]; car.yaw = atan2(roadSl(z) * dir, dir); } else car.yaw = fly.yaw;
      car.x = x; car.z = z; car.y = surf(x, z, fly.y); car.v = 0; car.sm = 0; car.ly = 0; car.lp = 0; auto.on = false; } }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
let drag = false;
// A click on the picture takes hold of the mouse: the pointer disappears and cannot leave, and moving the mouse looks around.
// Esc lets it go again (the browser does that). A finger on a touch screen still drags to look.
const held = () => document.pointerLockElement === canvas;
canvas.addEventListener('pointerdown', (e) => { initSound();
  if (e.pointerType === 'mouse') { if (!held() && canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) {} } }
  else { drag = true; canvas.setPointerCapture(e.pointerId); } });
document.addEventListener('pointerlockchange', () => { document.body.classList.toggle('held', held()); });
canvas.addEventListener('pointerup', () => { drag = false; });
canvas.addEventListener('pointermove', (e) => {
  if (!drag && !held()) return;
  if (fly.on) { fly.yaw -= e.movementX * 0.004; fly.pit = clamp(fly.pit - e.movementY * 0.004, -1.5, 1.5); }
  else { car.ly -= e.movementX * 0.004; car.lp = clamp(car.lp - e.movementY * 0.004, -1.1, 1.1); }
});
const K = (c) => (keys.has(c) ? 1 : 0);
