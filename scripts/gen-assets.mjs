#!/usr/bin/env bun
// Generate image assets for Endless with the Gemini API (Nano Banana image models).
//
//   bun run gen:assets                 -> generate everything that does not exist yet
//   bun run gen:assets grass rock   -> only these assets (names below)
//   bun run gen:assets --force      -> regenerate even if the file exists
//   bun run gen:assets --dry        -> print prompts only, no API calls
//   bun run gen:assets --list       -> list asset names
//
// Needs GEMINI_API_KEY in .env (see .env.example). Optional:
//   GEMINI_IMAGE_MODEL   (default gemini-3.1-flash-image)
//   ASSET_TEX_SIZE       (default 1024, final size of the tiling textures)
//
// Output:
//   assets/raw/<name>.png        untouched image from the API
//   assets/<name>.webp           processed, ready for the game
//   assets/preview.html          contact sheet (textures tiled 3x3 so seams are easy to spot)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets');
const RAW = path.join(OUT, 'raw');

// ---------- .env ----------
function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv();
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const TEX_SIZE = +(process.env.ASSET_TEX_SIZE || 1024);
const API = (m) => `https://generativelanguage.googleapis.com/v1/models/${m}:generateContent`;

// ---------- prompts ----------
const TEX = (subject) =>
  `Seamless tileable texture of ${subject}. Photographed straight down, orthographic top-down view, ` +
  `flat even overcast lighting, no cast shadows, no perspective, no horizon, no vignette, no objects, ` +
  `uniform density and colour across the whole frame, high detail, photorealistic, square image.`;
const PANO = (subject) =>
  `Ultra-wide panoramic side view of ${subject} far in the distance, softened by atmospheric haze. ` +
  `The landforms sit along the bottom edge and fill only the lower 55% of the image; the bottom edge is solid landform. ` +
  `Everything above the silhouette is a perfectly flat, uniform pure chroma-key green (#00FF00) background: no sky, no clouds, no gradient, no sun. ` +
  `No foreground, no close trees, no buildings, no people, no text. Natural colours, photorealistic, the left and right edges should match in height.`;
const CLOUD = (shape) =>
  `A single ${shape} cloud, photorealistic, bright white sunlit top and soft slightly grey underside, ` +
  `centred and fully contained inside the frame with generous empty margins on all sides, ` +
  `on a perfectly flat pure black (#000000) background. No sky colour, no other clouds, no ground, no text.`;

const SPRITE = (subject) =>
  `A single ${subject}, the whole plant fully visible from the base of the trunk to the very top, centred, side view at eye level, ` +
  `isolated on a perfectly flat uniform pure magenta (#FF00FF) background. No ground, no soil, no grass at the base, no shadow, ` +
  `no other plants or objects, no text, no frame. Photorealistic, soft natural daylight, crisp clean edges against the magenta.`;
// Thai folk-legend ghosts for the night haunting (billboards, keyed like the plants)
const GHOST = (subject) =>
  `${subject}. The whole figure fully visible and centred, at eye level, ` +
  `isolated on a perfectly flat uniform BRIGHT pure magenta (#FF00FF) background that is evenly lit and stays bright magenta everywhere (the dim light falls only on the figure). ` +
  `No ground, no shadow, no other objects, no text, no frame. Realistic photographic style, cold moonlight on the figure, eerie and frightening, no blood. Crisp clean edges against the magenta.`;
const FACADE = (subject) =>
  `Seamless tileable texture of ${subject}. Photographed straight-on (front orthographic view), flat even lighting, no perspective, ` +
  `no shadows, no windows or doors, no objects, uniform across the whole frame, photorealistic, square image.`;
const ASSETS = [
  // tiling ground / surface textures
  { name: 'grass', kind: 'tile', prompt: TEX('short lush green grass lawn with individual blades visible and a few tiny clover leaves') },
  { name: 'dry_grass', kind: 'tile', prompt: TEX('sparse dry yellow-brown grass mixed with patches of bare dusty earth and small pebbles') },
  { name: 'soil', kind: 'tile', prompt: TEX('dark brown farmland soil with small clods and pebbles') },
  { name: 'sand', kind: 'tile', prompt: TEX('fine golden beach sand with subtle wind ripples') },
  { name: 'snow', kind: 'tile', prompt: TEX('fresh packed white snow surface with subtle crystalline sparkle, no footprints') },
  { name: 'rock', kind: 'tile', prompt: TEX('weathered grey granite rock surface with cracks and patches of pale lichen') },
  { name: 'red_rock', kind: 'tile', prompt: TEX('red-orange layered desert sandstone rock surface with fine horizontal strata') },
  { name: 'gravel', kind: 'tile', prompt: TEX('grey roadside gravel and crushed stone') },
  { name: 'asphalt', kind: 'tile', prompt: TEX('worn dark grey asphalt road surface with visible stone aggregate, fine cracks and subtle tar patches, absolutely no road markings or paint lines') },
  { name: 'bark', kind: 'tile', prompt: TEX('tree bark close-up with vertical grooves, brown-grey') },
  // building surfaces (front-on)
  { name: 'wood_wall', kind: 'tile', prompt: FACADE('a weathered wall of horizontal brown teak wooden planks from a traditional Thai house') },
  { name: 'log_wall', kind: 'tile', prompt: FACADE('a log cabin wall of stacked round pine logs') },
  { name: 'roof_tiles', kind: 'tile', prompt: FACADE('orange-red terracotta roof tiles in overlapping rows') },
  { name: 'roof_metal', kind: 'tile', prompt: FACADE('a corrugated galvanised metal roof sheet with light rust streaks') },
  { name: 'stucco', kind: 'tile', prompt: FACADE('white painted lime plaster wall with slight weathering and hairline cracks') },
  // vegetation sprites (keyed to transparency, used as billboards)
  { name: 'tree_broadleaf', kind: 'sprite', prompt: SPRITE('lush green tropical rain tree with a wide rounded umbrella canopy and a short thick trunk') },
  { name: 'tree_autumn', kind: 'sprite', prompt: SPRITE('deciduous maple tree in full autumn colours with orange, red and golden leaves') },
  { name: 'tree_sakura', kind: 'sprite', prompt: SPRITE('cherry blossom tree in full pale-pink bloom with a dark trunk') },
  { name: 'tree_pine', kind: 'sprite', prompt: SPRITE('tall slender conifer pine tree, dark green, conical shape') },
  { name: 'tree_pine_snow', kind: 'sprite', prompt: SPRITE('fir tree heavily covered in fresh snow') },
  { name: 'tree_birch', kind: 'sprite', prompt: SPRITE('slender white-barked birch tree with light green airy foliage') },
  { name: 'tree_palm', kind: 'sprite', prompt: SPRITE('tall coconut palm tree with a gently curved trunk and drooping fronds') },
  { name: 'tree_sugarpalm', kind: 'sprite', prompt: SPRITE('Asian palmyra palm (sugar palm) with a tall straight dark trunk and a round crown of stiff fan-shaped leaves, as seen in Thai rice fields') },
  { name: 'bamboo', kind: 'sprite', prompt: SPRITE('dense clump of tall green bamboo with arching tops') },
  { name: 'banana', kind: 'sprite', prompt: SPRITE('banana plant with large broad green leaves, some slightly torn') },
  { name: 'bush', kind: 'sprite', prompt: SPRITE('round dense green shrub, wider than tall') },
  { name: 'bush_autumn', kind: 'sprite', prompt: SPRITE('round dense shrub with orange and red autumn leaves, wider than tall') },
  { name: 'cactus', kind: 'sprite', prompt: SPRITE('tall saguaro cactus with two upturned arms') },
  { name: 'tree_dead', kind: 'sprite', prompt: SPRITE('dead leafless desert tree with twisted grey bare branches') },
  { name: 'ghost_tani', kind: 'sprite', prompt: GHOST('Thai folklore ghost Nang Tani, the spirit who lives in a wild banana tree (kluai tani): a beautiful pale young Thai woman in old-style Thai dress, a green silk breast cloth (sabai) over one shoulder and a green ankle-length Thai tube skirt, long black hair, her feet hovering just above the ground, standing in front of a tall wild banana plant with big leaves and a hanging bunch of green bananas, a faint greenish glow around her, full figure and the whole banana plant from base to top') },
  { name: 'ghost_krasue', kind: 'sprite', prompt: GHOST('Thai folklore ghost Krasue, exactly as in the Thai legend: a floating disembodied head of a beautiful pale Thai woman with long black hair, and hanging directly below her neck instead of a body, her dangling internal organs: a heart, lungs, a stomach and long trailing intestines hanging down about one metre, the organs faintly glowing with an eerie green light as if lit from inside, no torso, no arms, no legs, front view, the head at the top of the frame and the organs trailing to the bottom') },
  { name: 'ghost_krahang', kind: 'sprite', prompt: GHOST('Thai folklore ghost Krahang, exactly as in the Thai legend: a thin dark-skinned Thai village man in a dark loincloth flying through the night, two large round woven bamboo rice-winnowing trays (kradong) strapped to his outstretched arms as wings, and a long wooden rice pestle (sak) held between his legs trailing behind him like a tail, wild staring eyes, full figure, front view') },
  { name: 'ghost_pret', kind: 'sprite', prompt: GHOST('Thai folklore ghost Pret, exactly as in the Thai Buddhist legend: an impossibly tall and emaciated grey-skinned humanoid as tall as a sugar palm tree, skin and bones with every rib showing, a very long thin neck, a small head with sparse dry hair, a tiny mouth no bigger than the eye of a needle, enormous hands and feet as large as palm leaves, long thin limbs, standing upright, full figure from feet to head, front view') },
  { name: 'yai_ref', kind: 'ref', prompt: 'A full-body character reference photo for 3D modelling of the Thai urban-legend ghost Yai Speed: a small, thin, hunched elderly Thai village woman about 75 years old, short grey hair pulled back in a small bun, deeply wrinkled tan skin, sunken eyes with an unsettling stare, wearing a faded off-white short-sleeved Thai blouse (suea kho krachao) and a dark checked ankle-length Thai tube skirt (pha sin) hitched up to the knees for running, barefoot. She stands in a neutral A-pose facing the camera straight on, arms slightly away from the body, feet apart, the whole figure from head to toe in frame and centred, sharp focus, even soft studio lighting from the front with no harsh shadows, on a plain flat light-grey background, no props, no text, no motion blur.' },
  { name: 'ghost_yai_face', kind: 'sprite', prompt: GHOST('a jump-scare close-up at a car side window: the face of the Thai ghost Yai Speed, a very old hunched Thai woman with grey hair in a bun, deeply wrinkled skin, wide staring eyes and a thin grin, head and shoulders only, filling most of the frame') },
  { name: 'ghost_face', kind: 'sprite', prompt: GHOST('a jump-scare close-up: the face of a Thai female ghost right up against the camera, deathly pale grey skin, black hollow eye sockets with tiny white pupils, mouth slightly open, long wet black hair hanging around the face, head and top of the shoulders only, filling most of the frame') },
  { name: 'ghost_rider', kind: 'sprite', prompt: GHOST('the Thai urban-legend roadside hitchhiker ghost: a pale young Thai woman in a plain white blouse and a dark Thai tube skirt, sitting upright on a car\'s back seat facing the camera, very long wet straight black hair falling over her face with one dead staring eye visible between the strands, hands resting on her lap, seen from the front from the seat up to the top of her head') },
  // distant mountain silhouettes (transparent sky)
  { name: 'mountains_green', kind: 'pano', prompt: PANO('a range of green forested mountains and rolling hills') },
  { name: 'mountains_snow', kind: 'pano', prompt: PANO('a range of jagged snow-capped alpine mountains with grey rock') },
  { name: 'mountains_desert', kind: 'pano', prompt: PANO('red desert mesas, buttes and flat-topped canyon cliffs') },
  { name: 'islands', kind: 'pano', prompt: PANO('a chain of tropical limestone karst islands rising from a calm sea, like Phang Nga Bay in Thailand, the sea is a thin strip at the bottom') },
  // clouds (transparent)
  { name: 'cloud_1', kind: 'cloud', prompt: CLOUD('large puffy cumulus') },
  { name: 'cloud_2', kind: 'cloud', prompt: CLOUD('wide flat-bottomed cumulus') },
  { name: 'cloud_3', kind: 'cloud', prompt: CLOUD('small fluffy fair-weather cumulus') },
  { name: 'cloud_4', kind: 'cloud', prompt: CLOUD('tall towering cumulus with billowing top') },
  { name: 'cloud_5', kind: 'cloud', prompt: CLOUD('long thin stretched stratocumulus') },
  { name: 'cloud_6', kind: 'cloud', prompt: CLOUD('soft wispy cumulus with ragged edges') },
];
const KIND = {
  tile: { aspectRatio: '1:1', imageSize: '2K' },
  pano: { aspectRatio: '4:1', imageSize: '2K' },
  cloud: { aspectRatio: '16:9', imageSize: '1K' },
  sprite: { aspectRatio: '3:4', imageSize: '2K' },
  ref: { aspectRatio: '3:4', imageSize: '2K' },   // reference pictures for image-to-3D (not used by the game)
};

// ---------- API ----------
async function generate(prompt, cfg) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is missing - put it in .env');
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: cfg },
  };
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(API(MODEL), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
      const txt = await res.text();
      if (!res.ok) {
        const retry = res.status === 429 || res.status >= 500;
        lastErr = new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
        if (!retry) throw lastErr;
      } else {
        const json = JSON.parse(txt);
        const parts = json.candidates?.[0]?.content?.parts || [];
        const img = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
        if (img) return Buffer.from((img.inlineData || img.inline_data).data, 'base64');
        const reason = json.candidates?.[0]?.finishReason || json.promptFeedback?.blockReason || 'no image in response';
        lastErr = new Error(`No image returned (${reason}) ${parts.map((p) => p.text || '').join(' ').slice(0, 200)}`);
      }
    } catch (e) { lastErr = e; if (/HTTP 4(0[0-9]|1[0-9])/.test(e.message) && !/HTTP 429/.test(e.message)) throw e; }
    const wait = 2000 * attempt * attempt;
    console.log(`   retry ${attempt}/3 in ${wait / 1000}s - ${lastErr.message.slice(0, 120)}`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw lastErr;
}

// ---------- post-processing ----------
// Make a texture tile seamlessly: blend the image with a half-offset copy of itself
// (whose borders already wrap) using a mask that favours the copy near the borders.
function seamless(data, w, h, ch, axes = 'xy') {
  const out = Buffer.alloc(data.length);
  const sx = axes.includes('x') ? w / 2 : 0, sy = axes.includes('y') ? h / 2 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ox = (x + sx) % w, oy = (y + sy) % h;
    const dx = axes.includes('x') ? Math.abs(x / (w - 1) - 0.5) * 2 : 0;
    const dy = axes.includes('y') ? Math.abs(y / (h - 1) - 0.5) * 2 : 0;
    let m = Math.max(dx, dy); m = Math.min(1, Math.max(0, (m - 0.55) / 0.45)); m = m * m * (3 - 2 * m);
    const i = (y * w + x) * ch, j = (oy * w + ox) * ch;
    if (ch === 4) { // premultiplied blend so transparent pixels never tint the result
      const a1 = data[i + 3] / 255 * (1 - m), a2 = data[j + 3] / 255 * m, A = a1 + a2;
      for (let c = 0; c < 3; c++) out[i + c] = A > 0 ? Math.round((data[i + c] * a1 + data[j + c] * a2) / A) : 0;
      out[i + 3] = Math.round(A * 255);
    } else for (let c = 0; c < ch; c++) out[i + c] = Math.round(data[i + c] * (1 - m) + data[j + c] * m);
  }
  return out;
}
// Chroma-key the green background of a panorama into transparency (with green spill removal)
function keyGreen(data, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < w * h * 3; i += 3, j += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    const dom = (g - Math.max(r, b)) / 255; // how "green-screen" the pixel is
    let a = 1 - Math.min(1, Math.max(0, (dom - 0.12) / 0.3));
    if (g > Math.max(r, b)) g = Math.max(r, b) + (g - Math.max(r, b)) * 0.35; // despill
    out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = Math.round(a * 255);
  }
  // fill fully-transparent columns' bottom gaps: make sure every column is opaque at the very bottom
  for (let x = 0; x < w; x++) for (let y = h - 3; y < h; y++) out[(y * w + x) * 4 + 3] = 255;
  return out;
}
// Plants on magenta: chroma-key to alpha, remove magenta spill on the edges only
// Estimate the background colour from the image border (median of border pixels)
function borderColor(data, w, h) {
  const rs = [], gs = [], bs = [];
  const take = (x, y) => { const i = (y * w + x) * 3; rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]); };
  for (let x = 0; x < w; x += 4) { take(x, 0); take(x, 2); take(x, h - 1); }
  for (let y = 0; y < h; y += 4) { take(0, y); take(w - 1, y); }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}
// Generic key: alpha from colour distance to the detected background (used when the model ignored "pure magenta")
function keyByColor(data, w, h, bg) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < w * h * 3; i += 3, j += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const d = Math.hypot(r - bg[0], g - bg[1], b - bg[2]) / 255;
    const a = Math.min(1, Math.max(0, (d - 0.07) / 0.12));
    out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = Math.round(a * 255);
  }
  return out;
}
function keyMagenta(data, w, h) {
  const bg = borderColor(data, w, h);
  const isMag = bg[0] > bg[1] + 40 && bg[2] > bg[1] + 40;                 // magenta hue, even if the model lit it dimly
  if (!isMag) { console.log(`   background is not magenta (${bg.join(',')}), keying by colour distance`); return keyByColor(data, w, h, bg); }
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < w * h * 3; i += 3, j += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    const dom = (Math.min(r, b) - g) / Math.max(60, Math.max(r, b)); // magenta = red and blue both well above green, relative to brightness
    const a = 1 - Math.min(1, Math.max(0, (dom - 0.3) / 0.3));
    if (a < 1 && Math.min(r, b) > g) { const m = Math.min(r, b) - g; r -= m * 0.85; b -= m * 0.85; }
    out[j] = Math.max(0, r); out[j + 1] = g; out[j + 2] = Math.max(0, b); out[j + 3] = Math.round(a * 255);
  }
  return out;
}
// Clouds on black: alpha from brightness, colour un-premultiplied
function keyBlack(data, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < w * h * 3; i += 3, j += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const l = Math.max(r, g, b) / 255;
    let a = Math.min(1, Math.max(0, (l - 0.04) / 0.62)); a = a * a * (3 - 2 * a);
    const k = a > 0.01 ? 1 / Math.max(l, 0.2) : 1;
    out[j] = Math.min(255, r * k); out[j + 1] = Math.min(255, g * k); out[j + 2] = Math.min(255, b * k); out[j + 3] = Math.round(a * 255);
  }
  // fade the borders so no hard edges remain
  const fade = Math.round(Math.min(w, h) * 0.06);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (d < fade) out[(y * w + x) * 4 + 3] = Math.round(out[(y * w + x) * 4 + 3] * (d / fade));
  }
  return out;
}

async function process1(asset, rawBuf) {
  if (asset.kind === 'ref') { const d = path.join(OUT, 'ref'); fs.mkdirSync(d, { recursive: true }); await sharp(rawBuf).png().toFile(path.join(d, `${asset.name}.png`)); return; }
  const dst = path.join(OUT, `${asset.name}.webp`);
  if (asset.kind === 'tile') {
    const { data, info } = await sharp(rawBuf).removeAlpha().resize(TEX_SIZE, TEX_SIZE, { fit: 'cover' }).raw().toBuffer({ resolveWithObject: true });
    const s = seamless(data, info.width, info.height, info.channels);
    await sharp(s, { raw: { width: info.width, height: info.height, channels: info.channels } }).webp({ quality: 86 }).toFile(dst);
  } else if (asset.kind === 'pano') {
    const { data, info } = await sharp(rawBuf).removeAlpha().resize(2048, 512, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const rgba = seamless(keyGreen(data, info.width, info.height), info.width, info.height, 4, 'x'); // key first so the seam blend never mixes in green
    await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ quality: 88, alphaQuality: 90 }).toFile(dst);
  } else if (asset.kind === 'sprite') {
    const { data, info } = await sharp(rawBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const rgba = keyMagenta(data, info.width, info.height);
    // trim to the plant, then fit into 1024 px (keeps aspect; bottom edge = base of the trunk)
    const trimmed = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).trim({ threshold: 4 }).png().toBuffer();
    await sharp(trimmed).resize({ height: 1024, width: 1024, fit: 'inside' }).webp({ quality: 88, alphaQuality: 95 }).toFile(dst);
  } else {
    const { data, info } = await sharp(rawBuf).removeAlpha().resize(1024, null).raw().toBuffer({ resolveWithObject: true });
    const rgba = keyBlack(data, info.width, info.height);
    await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).trim({ threshold: 2 }).webp({ quality: 88, alphaQuality: 90 }).toFile(dst);
  }
  return dst;
}

function writePreview() {
  const items = ASSETS.filter((a) => fs.existsSync(path.join(OUT, `${a.name}.webp`)));
  const html = `<!doctype html><meta charset="utf-8"><title>Endless assets</title>
<style>body{background:#222;color:#ddd;font:14px system-ui;margin:20px}h2{margin:24px 0 8px}.g{display:flex;flex-wrap:wrap;gap:14px}
.t{width:360px}.t div{width:360px;height:360px;background-size:120px 120px}.p{width:100%}.p div{height:180px;background:linear-gradient(#7fb2e8,#cfe3f5);background-size:auto 100%}
.p div span{display:block;height:100%;background-size:auto 100%;background-repeat:repeat-x;background-position:bottom}.c div{width:300px;height:170px;background:linear-gradient(#5b93d6,#a9cdf0);display:flex;align-items:center;justify-content:center}.c img{max-width:90%;max-height:90%}</style>
<h1>Endless - generated assets (${MODEL})</h1>
<h2>Textures (tiled 3x3 - look for seams)</h2><div class="g">${items.filter((a) => a.kind === 'tile').map((a) => `<div class="t"><div style="background-image:url(${a.name}.webp)"></div>${a.name}</div>`).join('')}</div>
<h2>Distant mountains (repeated 2x over a sky gradient)</h2>${items.filter((a) => a.kind === 'pano').map((a) => `<div class="p"><div><span style="background-image:url(${a.name}.webp)"></span></div>${a.name}</div>`).join('')}
<h2>Plants (billboards)</h2><div class="g">${items.filter((a) => a.kind === 'sprite').map((a) => `<div class="c"><div style="height:260px;width:200px;background:linear-gradient(#9cc7ee,#e4f0fa 70%,#7a9a4a 70%)"><img src="${a.name}.webp" style="max-height:240px"></div>${a.name}</div>`).join('')}</div>
<h2>Clouds</h2><div class="g">${items.filter((a) => a.kind === 'cloud').map((a) => `<div class="c"><div><img src="${a.name}.webp"></div>${a.name}</div>`).join('')}</div>`;
  fs.writeFileSync(path.join(OUT, 'preview.html'), html);
}

// ---------- main ----------
async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force'), dry = args.includes('--dry'), reprocess = args.includes('--reprocess');
  if (args.includes('--list')) { for (const a of ASSETS) console.log(`${a.name.padEnd(18)} ${a.kind}`); return; }
  const names = args.filter((a) => !a.startsWith('--'));
  const unknown = names.filter((n) => !ASSETS.some((a) => a.name === n));
  if (unknown.length) { console.error('Unknown asset(s):', unknown.join(', '), '\nUse --list to see names.'); process.exit(1); }
  const todo = ASSETS.filter((a) => (!names.length || names.includes(a.name)));
  fs.mkdirSync(RAW, { recursive: true });
  console.log(`Model: ${MODEL}   output: ${path.relative(process.cwd(), OUT) || OUT}`);
  let ok = 0, fail = 0, skip = 0;
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const a = queue.shift();
      const rawPath = path.join(RAW, `${a.name}.png`), dst = path.join(OUT, `${a.name}.webp`);
      if (dry) { console.log(`\n[${a.name}] ${a.kind} ${JSON.stringify(KIND[a.kind])}\n${a.prompt}`); continue; }
      try {
        let raw;
        if (reprocess && fs.existsSync(rawPath)) raw = fs.readFileSync(rawPath);
        else if (!force && fs.existsSync(dst)) { console.log(`- ${a.name}: exists, skipped (use --force to redo)`); skip++; continue; }
        else {
          console.log(`> ${a.name}: generating...`);
          raw = await generate(a.prompt, KIND[a.kind]);
          fs.writeFileSync(rawPath, raw);
        }
        await process1(a, raw);
        console.log(`  ${a.name}: done -> assets/${a.name}.webp`);
        ok++;
      } catch (e) { console.error(`! ${a.name}: ${e.message}`); fail++; }
    }
  };
  await Promise.all([worker(), worker()]);
  if (!dry) {
    writePreview();
    console.log(`\nFinished: ${ok} generated, ${skip} skipped, ${fail} failed. Open assets/preview.html to check them.`);
    if (fail) process.exitCode = 1;
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
