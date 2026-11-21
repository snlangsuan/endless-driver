// --------------------------------------------------------------------------------------------------------- input, car, camera
const keys = new Set();
// DRIFT: the driving style chosen in the driving panel - false the ordinary grip, true drifting: the tail steps out in a hard turn and the car
// slides through the bend, the view leaning and looking into it (drive.js, main.js); and the self-driving then minds no sign nor light.
let DRIFT = false; try { DRIFT = localStorage.getItem('endless.drift') === '1'; } catch (e) {}
// COACH_AT: the drift coach (drive.js) and the car's state over it - '0' both off, 'L' at the bottom left with the car's state, 'C' the two of them at the foot of the middle
// DASSIST: drifting by hand with the help (drive.js): the stick steers the path and the slide is laid over it, as the self-driving's is; off,
// the nose is swung against the tyres' grip and the slide must be held by hand
let DASSIST = true; try { DASSIST = localStorage.getItem('endless.dassist') !== '0'; } catch (e) {}
let COACH_AT = 'L'; try { const v = localStorage.getItem('endless.coach'); if (v === '0' || v === 'L' || v === 'C') COACH_AT = v; } catch (e) {}
const auto = { on: false, limit: 90, signs: true };   // self-driving: keeps the left lane and holds the speed set for it (limit, km/h, 0-200), and no more than the signs beside the road say unless signs is off
try { const v = localStorage.getItem('endless.limit'); if (v !== null && v !== '') auto.limit = clamp(Math.round(Number(v)) || 0, 0, 200); auto.signs = localStorage.getItem('endless.signs') !== '0'; } catch (e) {}
// The drive starts somewhere different each time: any stretch within about 14 km of the origin (further out the ground's fine grain, which is worked out from world position, begins to lose precision), in the left lane, facing along the road.
const SPAWN = (floor(Math.random() * 24) - 12 + 0.15 + Math.random() * 0.7) * SEG, SP = rp(SPAWN, 1.7);
const car = { x: SP[0], z: SP[1], y: 0, yaw: atan2(roadSl(SPAWN), 1), v: 0, pit: 0, ly: 0, lp: 0, bump: 0 };
car.y = surf(car.x, car.z);
const fly = { on: false, x: 0, y: 0, z: 0, yaw: 0, pit: 0 };
// While the game is being worked on, the server (scripts/serve.mjs) has the page load itself again whenever a file is saved. liveKeep is called just
// before that and puts aside where the car and the camera are, the hour and the weather; LIVE is what was put aside, read once here (so a reload by
// hand starts somewhere new as always). view3 is taken up where it is declared (car.js).
const liveKeep = () => { try { sessionStorage.setItem('endless.live', JSON.stringify({ car: [car.x, car.y, car.z, car.yaw], fly: { ...fly }, auto: auto.on, view3, tday, dayN, tHold, seaMode, wxS, windSet, wxAuto, wxCur, wx0: WXP[0] })); } catch (e) {} };
let LIVE = null; try { const s = sessionStorage.getItem('endless.live'); if (s) { sessionStorage.removeItem('endless.live'); LIVE = JSON.parse(s); } } catch (e) {}
if (LIVE) { const c = LIVE.car; car.x = c[0]; car.z = c[2]; car.yaw = c[3]; car.y = surf(car.x, car.z, c[1]); Object.assign(fly, LIVE.fly); auto.on = !!LIVE.auto;
  tday = LIVE.tday; dayN = LIVE.dayN; tHold = LIVE.tHold; seaMode = LIVE.seaMode; wxS = LIVE.wxS; windSet = LIVE.windSet; wxAuto = LIVE.wxAuto; wxCur = LIVE.wxCur; WXP[0] = LIVE.wx0; if (wxAuto) wxNext = 60; }
// The drive is taken up where it was left (Endless only; the settings panel can turn this off, for a new place each time as before): where the
// car is is put aside every few seconds and when the page is left, and read back here. (Not after a reload made by the server while the game
// is being worked on: that has its own, fuller note - LIVE, above.)
let resume = true; try { resume = localStorage.getItem('endless.resume') !== '0'; } catch (e) {}
// (and the game's clock - the day and the hour - which the seasons run on: kept always, so that the year goes on from where it was left)
const lastKeep = () => { if (window.GAME) return; try { localStorage.setItem('endless.last', JSON.stringify([car.x, car.y, car.z, car.yaw])); localStorage.setItem('endless.clock', JSON.stringify([dayN, tday])); } catch (e) {} };
if (!LIVE && !window.GAME) { try { const k = JSON.parse(localStorage.getItem('endless.clock')); if (Array.isArray(k) && k.length === 2 && k.every(Number.isFinite) && k[0] >= 0 && k[1] >= 0 && k[1] < 1) { dayN = k[0]; tday = k[1]; } } catch (e) {} }
if (!LIVE && !window.GAME && resume) { try { const c = JSON.parse(localStorage.getItem('endless.last')); if (Array.isArray(c) && c.length === 4 && c.every(Number.isFinite) && abs(c[2]) < 14400) { car.x = c[0]; car.z = c[2]; car.yaw = c[3]; car.y = surf(car.x, car.z, c[1]); } } catch (e) {} }
addEventListener('pagehide', lastKeep); document.addEventListener('visibilitychange', () => { if (document.hidden) lastKeep(); }); setInterval(lastKeep, 4000);
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
  // The hour chosen holds the time there; นับต่อ (Tc) lets it run on from that hour. While it runs the box shows "from hh:00" (RUN, a choice
  // not in the list), so that picking that same hour again is a change too, and holds the time once more. cont: running on from a chosen hour.
  const Tc = $('skTc'), RUN = new Option('', 'run'); RUN.hidden = true; T.add(RUN); let cont = false;
  const hh = (h) => String(h).padStart(2, '0') + ':00';
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
    T.value = tHold ? String(floor(tday * 24 + 0.001) % 24) : cont ? 'run' : '-1'; press(S, seaMode); contShow();
    if (wxAuto) kind = 'auto'; else if (wxCur === 0) Rg.value = Math.round(wxS * 100); else { kind = KIND[wxCur][0]; Rg.value = Math.round(KIND[wxCur][1] * 100); }
    press(Wb, kind); strength();
    if (windSet >= 0) Wd.value = Math.round(windSet * 100); else Wd.value = Math.round(clamp(AT.wind / 5.5, 0, 1) * 100); windShow();      // (left alone, the slider shows the wind there is)
  };
  const clock = () => { const m = floor(tday * 1440); $('skNow').textContent = 'ตอนนี้ ' + String(floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + (tHold ? ' (ล็อก)' : ''); };
  const contShow = () => { Tc.setAttribute('aria-pressed', cont); Tc.disabled = !tHold && !cont; };
  T.addEventListener('change', () => {
    if (T.value === 'run') return;
    const h = Number(T.value); cont = false;
    if (h < 0) { tHold = false; tday = Math.random(); } else { tHold = true; if (h / 24 < tday - 0.5) dayN++; tday = h / 24 + 0.0001; }      // (สุ่ม: a random hour, and the day runs on from it)
    headOn = -1; clock(); contShow();
  });
  Tc.addEventListener('click', () => { if (!tHold) return; RUN.text = 'เดินต่อจาก ' + hh(floor(tday * 24 + 0.001) % 24); tHold = false; cont = true; T.value = 'run'; clock(); contShow(); });
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
  $('skyB').addEventListener('click', (e) => { e.currentTarget.blur(); if (D.open) { D.close(); return; } if ($('cfg').open) $('cfg').close(); if ($('drv').open) $('drv').close(); read(); clock(); D.show(); if (D.contains(document.activeElement)) document.activeElement.blur(); tick = setInterval(() => { clock(); if (!D.matches(':focus-within')) read(); }, 500); });
}
// The settings panel (the cog, top right): the picture - best looking, or smooth for recording the screen (see render.js) -, how far the land is drawn (viewK),
// the frame rate held to 60 or 30 or left free, and the sound: how loud
// everything is (the main volume; off altogether, as M does) and, apart from that, how loud the one-off effects are - thunder, birds, crickets,
// dogs. (The music has its own volume, on the music player.) Remembered.
let gameVol = 1, fxVol = 1, mute = false; try { const f = localStorage.getItem('endless.fx'); if (f !== null && f !== '') fxVol = clamp(Number(f), 0, 1); } catch (e) {}
try { const v = localStorage.getItem('endless.vol'); if (v !== null && v !== '') gameVol = clamp(Number(v), 0, 1); mute = localStorage.getItem('endless.mute') === '1'; } catch (e) {}
const setVol = () => { if (SND) { SND.master.gain.setTargetAtTime(mute ? 0 : 0.9 * gameVol, AC.currentTime, 0.05); SND.fx.gain.setTargetAtTime(fxVol, AC.currentTime, 0.05); } try { localStorage.setItem('endless.fx', String(fxVol)); localStorage.setItem('endless.vol', String(gameVol)); localStorage.setItem('endless.mute', mute ? '1' : ''); } catch (e) {} if ($('cfg').open) cfgRead(); };
const SPK = 'M4 9v6h4l5 4V5L8 9z', SPK_ON = 'M15.5 8.5a5 5 0 0 1 0 7l-1.2-1.2a3.3 3.3 0 0 0 0-4.6zM18 6a8.5 8.5 0 0 1 0 12l-1.2-1.2a6.8 6.8 0 0 0 0-9.6z', SPK_X = 'M16.2 9.3l1.9 1.9 1.9-1.9 1.2 1.2-1.9 1.9 1.9 1.9-1.2 1.2-1.9-1.9-1.9 1.9-1.2-1.2 1.9-1.9-1.9-1.9z';      // the speaker, with its waves or crossed out
const cfgRead = () => { for (const b of $('skQ').children) b.setAttribute('aria-pressed', b.dataset.v === (smooth ? '1' : '0'));
  if ($('cfSp')) for (const b of $('cfSp').children) b.setAttribute('aria-pressed', (b.dataset.v === '1') === resume);
  for (const b of $('cfCap').children) b.setAttribute('aria-pressed', Number(b.dataset.v) === fpsCap); for (const b of $('cfVw').children) b.setAttribute('aria-pressed', Number(b.dataset.v) === viewK);
  $('cfVo').value = Math.round(gameVol * 100); $('cfVv').textContent = mute ? 'ปิดอยู่' : Math.round(gameVol * 100) + '%'; $('cfMu').setAttribute('aria-pressed', mute); $('cfMuP').setAttribute('d', mute ? SPK + SPK_X : SPK + SPK_ON); $('cfMu').title = (mute ? 'เปิดเสียง' : 'ปิดเสียง') + ' (M)'; $('cfMu').setAttribute('aria-label', mute ? 'เปิดเสียง' : 'ปิดเสียง');
  $('cfFx').value = Math.round(fxVol * 100); $('cfFv').textContent = Math.round(fxVol * 100) + '%'; };
{
  const D = $('cfg');
  $('skQ').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; smooth = b.dataset.v === '1'; try { localStorage.setItem('endless.smooth', smooth ? '1' : ''); } catch (err) {} scale = smooth ? 0.8 : 1; lodK = 1; cfgRead(); });      // (changing it starts the frame-rate keeping afresh)
  $('cfVw').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; viewK = Number(b.dataset.v); try { localStorage.setItem('endless.view', viewK < 1 ? String(viewK) : ''); } catch (err) {} cfgRead(); });
  if ($('cfSp')) $('cfSp').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; resume = b.dataset.v === '1'; try { localStorage.setItem('endless.resume', resume ? '' : '0'); } catch (err) {} cfgRead(); });
  $('cfCap').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; fpsCap = Number(b.dataset.v); try { localStorage.setItem('endless.cap', fpsCap ? String(fpsCap) : ''); } catch (err) {} rBest = 0; rKnown = 0; rPrev = 0; rLid = 1; cfgRead(); });      // (what the best rate is has to be found again)
  $('cfVo').addEventListener('input', () => { gameVol = $('cfVo').value / 100; if (gameVol > 0) mute = false; initSound(); setVol(); cfgRead(); });
  $('cfMu').addEventListener('click', () => { mute = !mute; initSound(); setVol(); cfgRead(); });
  $('cfFx').addEventListener('input', () => { fxVol = $('cfFx').value / 100; initSound(); setVol(); cfgRead(); });
  // (as with the sky panel: the keys stay the car's, but for those a focused control needs)
  D.addEventListener('keydown', (e) => { if (/^(Tab|Arrow|Space|Enter|Home|End|Page)/.test(e.code)) e.stopPropagation(); else if (e.code !== 'Escape') { e.preventDefault(); if (e.target.blur) e.target.blur(); } }, true);
  D.addEventListener('keyup', (e) => { if (/^(Tab|Arrow|Space|Enter|Home|End|Page)/.test(e.code)) e.stopPropagation(); });
  D.addEventListener('change', (e) => { if (e.target.blur) e.target.blur(); });
  D.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) b.blur(); });
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement && D.open) D.close(); });
  $('cfgB').addEventListener('click', (e) => { e.currentTarget.blur(); if (D.open) { D.close(); return; } if ($('sky').open) $('sky').close(); if ($('drv').open) $('drv').close(); cfgRead(); D.show(); if (D.contains(document.activeElement)) document.activeElement.blur(); });
}
// The driving panel (the steering wheel, top right): self-driving on or off (as P does), the speed it holds - 0 to 200 km/h - and whether it
// keeps to the signs. The speed is set three ways that all go through setLimit: the slider, the panel's - and + buttons, and the - and + keys.
// A press of a button or a key changes it by 1; held down, after a moment it changes by 5 once, pauses briefly so that a single step of 5 is easy
// to stop on, and only then goes on changing by 5 at a time until let go (stepStart, stepStop).
const drvRead = () => { $('drvB').classList.toggle('on', auto.on); if (!$('drv').open) return;
  $('dvOn').setAttribute('aria-pressed', auto.on); $('dvOn').textContent = auto.on ? 'ปิดขับอัตโนมัติ' : 'เปิดขับอัตโนมัติ'; $('dvOv').textContent = auto.on ? 'เปิดอยู่' : 'ปิดอยู่';
  $('dvSp').value = auto.limit; $('dvSv').textContent = auto.limit + ' km/h'; $('dvSg').setAttribute('aria-pressed', auto.signs); if ($('dvMd')) for (const b of $('dvMd').children) b.setAttribute('aria-pressed', String(b.dataset.v === (DRIFT ? '1' : '0')));
  if ($('dvCo')) for (const b of $('dvCo').children) b.setAttribute('aria-pressed', String(b.dataset.v === COACH_AT));
  if ($('dvAs')) for (const b of $('dvAs').children) b.setAttribute('aria-pressed', String(b.dataset.v === (DASSIST ? '1' : '0'))); };
const setLimit = (v) => { auto.limit = clamp(Math.round(v), 0, 200); try { localStorage.setItem('endless.limit', String(auto.limit)); } catch (e) {} drvRead(); };
let stepT = 0, stepI = 0;
const stepStop = () => { clearTimeout(stepT); clearInterval(stepI); stepT = stepI = 0; };
const stepStart = (dir) => { stepStop(); setLimit(auto.limit + dir); stepT = setTimeout(() => { setLimit(auto.limit + 5 * dir); stepT = setTimeout(() => { stepI = setInterval(() => setLimit(auto.limit + 5 * dir), 140); }, 400); }, 420); };
{
  const D = $('drv');
  $('dvOn').addEventListener('click', () => { auto.on = !auto.on; drvRead(); });
  $('dvSp').addEventListener('input', () => setLimit(Number($('dvSp').value)));
  if ($('dvMd')) $('dvMd').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; DRIFT = b.dataset.v === '1'; try { localStorage.setItem('endless.drift', DRIFT ? '1' : '0'); } catch (err) {} drvRead(); });
  if ($('dvAs')) $('dvAs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; DASSIST = b.dataset.v === '1'; try { localStorage.setItem('endless.dassist', DASSIST ? '1' : '0'); } catch (err) {} drvRead(); });
  if ($('dvCo')) $('dvCo').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; COACH_AT = b.dataset.v; try { localStorage.setItem('endless.coach', COACH_AT); } catch (err) {} drvRead(); });
  $('dvSg').addEventListener('click', () => { auto.signs = !auto.signs; try { localStorage.setItem('endless.signs', auto.signs ? '1' : '0'); } catch (e) {} drvRead(); });
  for (const [id, dir] of [['dvM', -1], ['dvP', 1]]) { const b = $(id);
    b.addEventListener('pointerdown', (e) => { if (e.button) return; try { b.setPointerCapture(e.pointerId); } catch (err) {} stepStart(dir); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, stepStop);
    b.addEventListener('click', (e) => { if (e.detail === 0) setLimit(auto.limit + dir); });      // (worked from the keyboard: Enter or Space on the button)
    b.addEventListener('contextmenu', (e) => e.preventDefault()); }
  // (as with the other panels: the keys stay the car's, but for those a focused control needs)
  D.addEventListener('keydown', (e) => { if (/^(Tab|Arrow|Space|Enter|Home|End|Page)/.test(e.code)) e.stopPropagation(); else if (e.code !== 'Escape') { e.preventDefault(); if (e.target.blur) e.target.blur(); } }, true);
  D.addEventListener('keyup', (e) => { if (/^(Tab|Arrow|Space|Enter|Home|End|Page)/.test(e.code)) e.stopPropagation(); });
  D.addEventListener('change', (e) => { if (e.target.blur) e.target.blur(); });
  D.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) b.blur(); });
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement && D.open) D.close(); });
  $('drvB').addEventListener('click', (e) => { e.currentTarget.blur(); if (D.open) { D.close(); return; } if ($('sky').open) $('sky').close(); if ($('cfg').open) $('cfg').close(); D.show(); drvRead(); if (D.contains(document.activeElement)) document.activeElement.blur(); });
  setInterval(drvRead, 250);      // (self-driving is also switched by P, and off by taking the wheel: the button and the panel follow)
}
const STEP_KEY = { Equal: 1, NumpadAdd: 1, BracketRight: 1, Minus: -1, NumpadSubtract: -1, BracketLeft: -1 };
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && document.pointerLockElement) { document.exitPointerLock(); return; }      // (with Esc held for the page, letting go of the mouse is the page's to do)
  if (e.code === 'Escape' && ($('sky').open || $('cfg').open || $('drv').open)) { for (const id of ['sky', 'cfg', 'drv']) if ($(id).open) $(id).close(); return; }      // (then it closes whichever panel is open)
  if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text') return;       // typing in the music box is not driving
  // (Space is the brake: it must not also press whatever button last had the focus, nor scroll the page)
  if (e.code === 'Space') { e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }
  initSound(); if (e.code === 'KeyM' && !e.repeat) { mute = !mute; setVol(); }
  if (e.repeat) return; keys.add(e.code);
  // (T, R and Y - the time, the weather, the weather by itself - are not keys any more: the weather panel does them)
  if (e.code === 'KeyV') view3 = !view3;
  else if (e.code === 'KeyL') headOn = (headOn === -1 ? (AT.night > 0.5 ? 0 : 1) : headOn ? 0 : 1);
  else if (e.code === 'KeyP') { auto.on = !auto.on; drvRead(); }
  else if (STEP_KEY[e.code]) stepStart(STEP_KEY[e.code]);      // - and +: by 1, and by 5 at a time while held
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
addEventListener('keyup', (e) => { keys.delete(e.code); if (STEP_KEY[e.code]) stepStop(); });
addEventListener('blur', () => { keys.clear(); stepStop(); });
let drag = false;
// A click on the picture takes hold of the mouse: the pointer disappears and cannot leave, and moving the mouse looks around.
// Esc lets it go again (the browser does that). A finger on a touch screen still drags to look.
const held = () => document.pointerLockElement === canvas;
let lookT = 0;      // (when the mouse last turned the eye: see drive.js)
canvas.addEventListener('pointerdown', (e) => { initSound();
  if (e.pointerType === 'mouse') { if (!held() && canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) {} } }
  else { drag = true; canvas.setPointerCapture(e.pointerId); } });
document.addEventListener('pointerlockchange', () => { document.body.classList.toggle('held', held()); });
canvas.addEventListener('pointerup', () => { drag = false; });
canvas.addEventListener('pointermove', (e) => {
  if (!drag && !held()) return;
  if (fly.on) { fly.yaw -= e.movementX * 0.004; fly.pit = clamp(fly.pit - e.movementY * 0.004, -1.5, 1.5); }
  else { car.ly -= e.movementX * 0.004; car.lp = clamp(car.lp - e.movementY * 0.004, -1.1, 1.1); lookT = performance.now(); }
});
// A game controller (a PlayStation pad, or any the browser maps the standard way): the left stick steers, R2 is the throttle and L2 the brake
// - by how far they are pushed, not all or nothing - and Cross the throttle and Square the handbrake (HB: drive.js) as buttons, as racing
// games have them, so that the thumb on the stick is free to steer; Shift's boost on L3. The right stick looks round. The other buttons
// press the keys they stand for: Triangle P (self-driving), Circle V (the view), R3 or the touch pad drifting or ordinary grip (Chrome on a Mac
// does not pass the touch pad on; in Ruin the touch pad is Tab, its map),
// the D-pad up L (the lights), left and right the self-driving's speed - and +; L1/R1 the gears, R and D (in the flying camera down and up, Q and E);
// Share F (the flying camera), Options H (the text over the picture). PAD: what it gives this frame.
const PAD = { on: false, v: {}, b: [], look: [0, 0], gear: 'D' };
const PAD_KEY = { 3: 'KeyP', 1: 'KeyV', 12: 'KeyL', 14: 'Minus', 15: 'Equal', 8: 'KeyF', 9: 'KeyH', 17: 'Tab' };
function pollPad(dt) {
  // (Any pad the browser shows - it shows none until a button has been pressed with the page open. Most map a PlayStation pad the standard
  // way; some - Firefox on a Mac, among others - hand over its raw layout instead, which is put into the standard order here.)
  const gs = navigator.getGamepads ? navigator.getGamepads() : []; let gp = null; for (const g of gs) if (g && g.connected) { gp = g; break; }
  if (!gp) { if (PAD.on) { PAD.on = false; PAD.v = {}; PAD.gp = null; padNote('จอยหลุดการเชื่อมต่อ'); } return; }
  if (!PAD.on || PAD.id !== gp.id) { PAD.id = gp.id; padNote('เชื่อมต่อจอยแล้ว'); initSound(); }
  PAD.on = true; PAD.gp = gp; const dz = (a) => (abs(a) < 0.14 ? 0 : (a - Math.sign(a) * 0.14) / 0.86);
  const raw = gp.mapping !== 'standard' && /054c|sony|dualsense|dualshock|wireless controller/i.test(gp.id) && gp.axes.length >= 6;
  const RAWB = [1, 2, 0, 3, 4, 5, -6, -7, 8, 9, 10, 11, -1, -1, -1, -1, 12, 13];      // (standard button i is raw button RAWB[i]; negative: an axis, or the hat)
  const Bs = (i) => { const b = gp.buttons[i]; return b ? (b.value || (b.pressed ? 1 : 0)) : 0; };
  const B = (i) => { if (!raw) return Bs(i); const r = RAWB[i]; if (r === -6) return (gp.axes[3] + 1) / 2; if (r === -7) return (gp.axes[4] + 1) / 2;
    if (r === -1) { const h = gp.axes[9]; if (h === undefined || h > 1.01) return 0; const d = Math.round((h + 1) * 3.5); return (i === 12 && (d === 0 || d === 1 || d === 7)) || (i === 13 && d >= 3 && d <= 5) || (i === 14 && d >= 5 && d <= 7) || (i === 15 && d >= 1 && d <= 3) ? 1 : 0; }
    return Bs(r); };
  const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[raw ? 2 : 2] || 0), ry = dz(gp.axes[raw ? 5 : 3] || 0);
  // (the left stick pushed forward drives on and pulled back brakes, for those who drive with the stick alone; the triggers do it by degrees)
  // (An automatic gearbox, D and R, changed with R1 and L1: the throttle drives the car the way the gear says, and the brakes - L2, the stick
  // pulled back - only ever stop it, never run it backwards. The keyboard keeps W and S as they were.)
  const tz = (v) => (v < 0.06 ? 0 : v), gas = tz(max(B(7), B(0), -ly)), brk = tz(max(B(6), ly));      // (a trigger at rest may read a hair above 0: it must not hold the brake on)
  PAD.v = { KeyW: PAD.gear === 'D' ? gas : 0, KeyS: PAD.gear === 'R' ? gas : 0, KeyA: max(0, -lx), KeyD: max(0, lx), Space: brk, HB: tz(B(2)), ShiftLeft: B(10), KeyQ: fly.on ? B(4) : 0, KeyE: fly.on ? B(5) : 0 };
  // (the buttons that stand for keys: pressed and let go as those keys would be, so that everything they do is done the one way)
  const ev = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, key: code }));
  for (let i = 0; i < 18; i++) { const on = B(i) > 0.5, was = !!PAD.b[i]; PAD.b[i] = on; if (on === was) continue;
    let code = PAD_KEY[i]; if (!fly.on && (i === 4 || i === 5)) { if (on) { const g = i === 4 ? 'R' : 'D'; if (PAD.gear !== g) { PAD.gear = g; padNote('เกียร์ ' + g); } } continue; }
    if ((i === 17 || i === 11) && on && $('dvMd')) { DRIFT = !DRIFT; try { localStorage.setItem('endless.drift', DRIFT ? '1' : '0'); } catch (e) {} padNote(DRIFT ? 'โหมดดริฟต์' : 'โหมดขับปกติ'); if (typeof drvRead === 'function') drvRead(); continue; }
    // (Square in the ordinary grip slows the car only: say how to drift, once a press - the mode is easily not the one thought)
    if (i === 2 && on && !DRIFT && $('dvMd') && !fly.on) padNote('เบรกมือจะดริฟต์ได้ในโหมดดริฟต์: กด R3 (กดก้านขวา) เพื่อเปิด');
    if (code) ev(on ? 'keydown' : 'keyup', code); }
  // (taking the wheel or braking hands the self-driving's control back, as the keys do)
  if (auto.on && !fly.on && (abs(lx) > 0.5 || brk > 0.5 || B(2) > 0.5 || PAD.gear === 'R' && gas > 0.5)) { auto.on = false; if (typeof drvRead === 'function') drvRead(); }
  if (rx || ry) { if (fly.on) { fly.yaw -= rx * dt * 2.2; fly.pit = clamp(fly.pit - ry * dt * 1.8, -1.5, 1.5); } else { car.ly -= rx * dt * 2.6; car.lp = clamp(car.lp - ry * dt * 2, -1.1, 1.1); lookT = performance.now(); } }
}
addEventListener('gamepadconnected', () => { initSound(); });
// a word at the foot of the picture for a few seconds: the pad found, or lost
let padNoteEl = null, padNoteT = 0;
function padNote(t) { if (!padNoteEl) { padNoteEl = document.createElement('div'); padNoteEl.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);padding:8px 16px;border-radius:10px;background:rgba(20,22,28,.82);color:#fff;font:14px system-ui,sans-serif;z-index:50;pointer-events:none;transition:opacity .4s'; document.body.appendChild(padNoteEl); }
  padNoteEl.textContent = t; padNoteEl.style.opacity = '1'; clearTimeout(padNoteT); padNoteT = setTimeout(() => { padNoteEl.style.opacity = '0'; }, 3000); }
// The pad shakes: s the heavy motor (a thud), w the light one (a buzz), 0..1, for ms milliseconds - where the browser can (Chrome's
// vibrationActuator, or the older hapticActuators), and quietly not where it cannot.
function padRumble(s, w, ms) { const gp = PAD.gp; if (!gp) return; const a = gp.vibrationActuator;
  try { if (a && a.playEffect) { const r = a.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: clamp(s, 0, 1), weakMagnitude: clamp(w, 0, 1) }); if (r && r.catch) r.catch(() => {}); }
    else if (gp.hapticActuators && gp.hapticActuators[0]) gp.hapticActuators[0].pulse(clamp(max(s, w), 0, 1), ms); } catch (e) {} }
const K = (c) => max(keys.has(c) ? 1 : 0, PAD.v[c] || 0);
