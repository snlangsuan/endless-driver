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
const fail = (m) => { const e = $('err'); e.style.display = 'block'; e.textContent += m + '\n\n'; };
addEventListener('error', (e) => fail('JS: ' + e.message + ' @' + e.lineno));
addEventListener('unhandledrejection', (e) => fail('JS: ' + (e.reason && (e.reason.stack || e.reason))));
const PARTS = ['core', 'land', 'shaders', 'render', 'plants', 'buildings', 'chunks', 'weather', 'input', 'sound', 'car', 'music', 'main'];
const WGSL = {};
let adapter, device;
(async () => {
  if (!navigator.gpu) { fail('เบราว์เซอร์นี้ไม่รองรับ WebGPU'); return; }
  adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) { fail('ไม่พบการ์ดจอที่รองรับ WebGPU'); return; }
  device = await adapter.requestDevice();
  await Promise.all(['common', 'vertex', 'scene', 'post', 'final'].map(async (n) => {
    const r = await fetch('shaders/' + n + '.wgsl'); if (!r.ok) throw new Error('โหลด shaders/' + n + '.wgsl ไม่ได้ (' + r.status + ')');
    WGSL[n] = await r.text();
  }));
  for (const p of PARTS) await new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = 'src/' + p + '.js';
    s.onload = ok; s.onerror = () => no(new Error('โหลด src/' + p + '.js ไม่ได้')); document.body.appendChild(s);
  });
})();
