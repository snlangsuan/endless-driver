// --------------------------------------------------------------------------------------------------------- input, car, camera
const keys = new Set();
const auto = { on: false, limit: 80 };   // self-driving: keeps the left lane and holds the speed limit (km/h)
// The drive starts somewhere different each time: any stretch within about 14 km of the origin (further out the ground's fine grain, which is worked out from world position, begins to lose precision), in the left lane, facing along the road.
const SPAWN = (floor(Math.random() * 24) - 12 + 0.15 + Math.random() * 0.7) * SEG, SP = rp(SPAWN, 1.7);
const car = { x: SP[0], z: SP[1], y: 0, yaw: atan2(roadSl(SPAWN), 1), v: 0, pit: 0, ly: 0, lp: 0, bump: 0 };
car.y = surf(car.x, car.z);
const fly = { on: false, x: 0, y: 0, z: 0, yaw: 0, pit: 0 };
addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text') return;       // typing in the music box is not driving
  initSound(); if (e.code === 'KeyM' && SND && !e.repeat) { mute = !mute; SND.master.gain.setTargetAtTime(mute ? 0 : 0.9, AC.currentTime, 0.05); }
  if (e.repeat) return; keys.add(e.code);
  if (e.code === 'KeyT') { const J = [0.31, 0.5, 0.72, 0.9]; const n = J.find((t) => t > tday + 0.01); if (n === undefined) { tday = J[0]; dayN++; } else tday = n; headOn = -1; }
  else if (e.code === 'KeyR') { wxAuto = false; wxCur = wxCur % 7 + 1; }
  else if (e.code === 'KeyY') { wxAuto = !wxAuto; wxNext = time + 60 + Math.random() * 120; }
  else if (e.code === 'KeyV') view3 = !view3;
  else if (e.code === 'KeyL') headOn = (headOn === -1 ? (AT.night > 0.5 ? 0 : 1) : headOn ? 0 : 1);
  else if (e.code === 'KeyP') auto.on = !auto.on;
  else if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.code === 'BracketRight') auto.limit = min(160, auto.limit + 10);
  else if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.code === 'BracketLeft') auto.limit = max(30, auto.limit - 10);
  else if ((e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'KeyS') && !fly.on) auto.on = false;      // taking the wheel or braking hands control back
  else if (e.code === 'KeyH' && !e.repeat) { const off = document.body.classList.toggle('noui'); try { localStorage.setItem('endless.noui', off ? '1' : ''); } catch (err) {} }      // H hides or shows the text over the picture (not the music player)
  else if (e.code === 'KeyF') { fly.on = !fly.on; if (fly.on) { fly.x = car.x; fly.z = car.z; fly.y = car.y + 4; fly.yaw = car.yaw; fly.pit = -0.1; } }
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
