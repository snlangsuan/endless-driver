// Build: bundles src/ into one self-contained dist/index.html (works by double-click, no server needed)
// Run with: bun run build
import fs from 'node:fs';

// two builds: the WebGL one (index.html) and the WebGPU one (webgpu.html, three.js WebGPURenderer + TSL node materials)
const path = await import('node:path');
const webgpuPath = path.resolve('node_modules/three/build/three.webgpu.js');
const gpuPlugin = (gpu) => ({ name: 'gpu', setup(b) {
  if (gpu) b.onResolve({ filter: /^three(\/tsl|\/webgpu)?$/ }, () => ({ path: webgpuPath }));
  if (gpu) b.onResolve({ filter: /^\.\/(post|sky)\.js$/ }, (a) => ({ path: path.resolve('src', a.path.replace(/\.js$/, '.gpu.js')) }));
  else b.onResolve({ filter: /tsl\/display\// }, () => ({ path: path.resolve('src/stub.js') }));
} });
async function bundle(gpu) {
  const r = await Bun.build({ entrypoints: ['src/main.js'], minify: true, format: 'iife', target: 'browser', define: { __GPU__: gpu ? 'true' : 'false' }, plugins: [gpuPlugin(gpu)] });
  if (!r.success) { for (const m of r.logs) console.error(m); process.exit(1); }
  return (await r.outputs[0].text()).replace(/<\/script/gi, '<\\/script');
}
const js = await bundle(false), jsGpu = process.env.NO_GPU ? null : await bundle(true);
// embed generated images (assets/*.webp) as data URIs so the single HTML file still works offline
let assets = '';
if (fs.existsSync('assets') && !process.env.NO_ASSETS) {
  const map = {};
  // big ground/bark textures are re-encoded a little lighter for the single-file build (cached; originals untouched)
  let sharp = null; try { sharp = (await import('sharp')).default; } catch {}
  const cache = 'assets/.build-cache'; fs.mkdirSync(cache, { recursive: true });
  let saved = 0;
  for (const f of fs.readdirSync('assets').filter((f) => f.endsWith('.webp')).sort()) {
    let buf = fs.readFileSync(`assets/${f}`);
    if (sharp && buf.length > 280 * 1024 && !f.startsWith('ghost_')) {
      const st = fs.statSync(`assets/${f}`), cf = `${cache}/${f.replace(/\.webp$/, '')}_${st.size}_${Math.round(st.mtimeMs)}.webp`;
      if (!fs.existsSync(cf)) fs.writeFileSync(cf, await sharp(buf).webp({ quality: 70, effort: 5 }).toBuffer());
      const small = fs.readFileSync(cf); if (small.length < buf.length) { saved += buf.length - small.length; buf = small; }
    }
    map[f.replace(/\.webp$/, '')] = 'data:image/webp;base64,' + buf.toString('base64');
  }
  if (saved) console.log(`textures re-encoded for the build: -${(saved / 1024).toFixed(0)} KB`);
  assets = `<script>window.__ASSETS=${JSON.stringify(map)}</script>`;
  console.log(`embedded ${Object.keys(map).length} assets`);
}
// recorded engine loops: assets/engines/<engine>_<rpm>[_off].(ogg|mp3|m4a|wav)
if (fs.existsSync('assets/engines') && !process.env.NO_ASSETS && !process.env.NO_ENGINES) {
  const eng = {}, mime = { ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav' };
  for (const f of fs.readdirSync('assets/engines').sort()) {
    const m = f.match(/^([a-z0-9]+)_(\d+)(_off)?\.(ogg|mp3|m4a|wav)$/i); if (!m) continue;
    (eng[m[1]] ||= []).push({ rpm: +m[2], off: !!m[3], data: `data:${mime[m[4].toLowerCase()]};base64,` + fs.readFileSync(`assets/engines/${f}`).toString('base64') });
  }
  if (Object.keys(eng).length) { assets += `<script>window.__ENGINES=${JSON.stringify(eng)}</script>`; console.log('engine recordings:', Object.entries(eng).map(([k, v]) => `${k}(${v.length})`).join(' ')); }
}
// smooth player-car models made in Blender (tools/carbuilder.py): assets/cars/<car>.glb + <car>_wheel.glb
if (fs.existsSync('assets/cars')) {
  const cars = {};
  for (const f of fs.readdirSync('assets/cars').filter((f) => f.endsWith('.glb')).sort()) cars[f.replace(/\.glb$/, '')] = fs.readFileSync(`assets/cars/${f}`).toString('base64');
  if (Object.keys(cars).length) { assets += `<script>window.__CARS=${JSON.stringify(cars)}</script>`; console.log('car models:', Object.keys(cars).length); }
}
const page = fs.readFileSync('src/index.html', 'utf8'), html = page.replace('<script>/*GAME*/</script>', () => `${assets}<script>${js}</script>`);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
if (jsGpu) { const noImg = assets.replace(/<script>window\.__ASSETS=.*?<\/script>/s, '');   // WebGPU build: no images at all, everything is generated
  const h2 = page.replace('<script>/*GAME*/</script>', () => `${noImg}<script>${jsGpu}</script>`); fs.writeFileSync('dist/webgpu.html', h2); console.log('dist/webgpu.html', (h2.length / 1024).toFixed(0) + ' KB'); }
fs.copyFileSync('src/pad.html', 'dist/pad.html'); // phone joystick page (served by bun run serve)
console.log('dist/index.html', (html.length / 1024).toFixed(0) + ' KB');
