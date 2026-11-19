// =====================================================================================================================
// Endless: a scenic driving world rendered with WebGPU. Everything on screen is made by this file: no images, no models.
// Rendering ideas used: every leaf and grass blade is real geometry (instanced, shaped in the vertex shader), light passes
// through leaves, a shadow map follows the camera, distance fades into the colour of the horizon, the picture is rendered
// in HDR then bloomed and tone mapped.
// =====================================================================================================================
// This file starts everything: it reports errors on the page, gets the graphics device, fetches the shaders (shaders/*.wgsl),
// then loads the rest of the game in order. The files in src/ are plain scripts that share one scope, exactly as when the game
// was a single file: a name declared at the top of one is visible in all that follow, so the order below matters.
const $ = (id) => document.getElementById(id);
const fail = (m) => { const e = $('err'), l = $('load'); if (l) l.remove(); e.style.display = 'block'; e.textContent += m + '\n\n'; };
addEventListener('error', (e) => fail('JS: ' + e.message + ' @' + e.lineno));
addEventListener('unhandledrejection', (e) => fail('JS: ' + (e.reason && (e.reason.stack || e.reason))));
const PARTS = ['core', 'land', 'shaders', 'render', 'plants', 'buildings', 'chunks', 'weather', 'input', 'sound', 'car', 'music', 'main'];
const WGSL = {};
let adapter, device;
// The loading screen (#load in the page) stays up until the first picture has been drawn. The scripts do their work in long unbroken stretches
// - main.js builds the nearest of the world as it loads - so after each step the browser is given a moment to show the new progress. (The timer
// is for a tab in the background, where animation frames do not come.)
const PART_SAY = { core: 'กำลังเตรียมโลก ...', render: 'กำลังเตรียมการแสดงผล ...', plants: 'กำลังเตรียมต้นไม้และอาคาร ...', weather: 'กำลังเตรียมท้องฟ้าและอากาศ ...', input: 'กำลังเตรียมการควบคุมและเสียง ...', main: 'กำลังสร้างถนนและทิวทัศน์ ...' };
// Waiting for a frame costs up to 1/60 s, so the screen is brought up to date only when the last update is 50 ms old, or when asked to (force).
let shownAt = 0;
const shown = () => new Promise((ok) => { const t = setTimeout(ok, 120); requestAnimationFrame(() => { clearTimeout(t); setTimeout(ok, 0); }); }).then(() => { shownAt = performance.now(); });
const progress = (k, say, force) => { $('loadF').style.transform = `scaleX(${k})`; $('loadB').setAttribute('aria-valuenow', Math.round(k * 100)); if (say) $('loadS').textContent = say;
  return force || performance.now() - shownAt > 50 ? shown() : Promise.resolve(); };
(async () => {
  if (!navigator.gpu) { fail('เบราว์เซอร์นี้ไม่รองรับ WebGPU'); return; }
  // Everything is downloaded at once, while the graphics device is still being got ready: the shaders by fetch, the scripts as preloads that
  // the script elements below then take from the browser's memory instead of asking the server for each in turn. (Run, they still are in order.)
  for (const p of PARTS) { const l = document.createElement('link'); l.rel = 'preload'; l.as = 'script'; l.href = 'src/' + p + '.js'; document.head.appendChild(l); }
  const shaders = Promise.all(['common', 'vertex', 'scene', 'post', 'final'].map(async (n) => {
    const r = await fetch('shaders/' + n + '.wgsl'); if (!r.ok) throw new Error('โหลด shaders/' + n + '.wgsl ไม่ได้ (' + r.status + ')');
    WGSL[n] = await r.text();
  }));
  shaders.catch(() => {});      // (a failure is reported where it is awaited, below, and only there)
  await progress(0.04, 'กำลังเชื่อมต่อการ์ดจอ ...', true);
  adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) { fail('ไม่พบการ์ดจอที่รองรับ WebGPU'); return; }
  device = await adapter.requestDevice();
  await progress(0.1, 'กำลังโหลด shader ...');
  await shaders;
  for (let i = 0; i < PARTS.length; i++) { const p = PARTS[i];
    await progress(0.16 + 0.64 * i / (PARTS.length - 1), PART_SAY[p], p === 'main');
    await new Promise((ok, no) => {
      const s = document.createElement('script'); s.src = 'src/' + p + '.js';
      s.onload = ok; s.onerror = () => no(new Error('โหลด src/' + p + '.js ไม่ได้')); document.body.appendChild(s);
    });
  }
  await progress(0.92, 'กำลังวาดภาพแรก ...');
  // main.js asked for the first frame before this did, so by now it has been drawn and sent to the graphics card: wait for the card to finish it.
  await new Promise(requestAnimationFrame); await device.queue.onSubmittedWorkDone();
  const l = $('load'); if (!l) return;      // (something failed meanwhile, and the error is showing)
  await progress(1, 'พร้อมแล้ว'); l.classList.add('done'); setTimeout(() => l.remove(), 600);
})();
