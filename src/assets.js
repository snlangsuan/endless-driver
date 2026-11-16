// ===== Optional generated image assets (embedded by build.mjs as window.__ASSETS) =====
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
export const CARGLB = {}; // name -> THREE.Group (player-car models from Blender)
export const IMG = {};
function loadCars() {
  const src = window.__CARS || {}, loader = new GLTFLoader();
  return Promise.all(Object.entries(src).map(([k, b64]) => new Promise((res) => {
    const bin = atob(b64), buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    loader.parse(buf.buffer, '', (g) => { CARGLB[k] = g.scene; g.scene.animations = g.animations || []; res(); }, () => res());
  })));
}
export function loadAssets() {
  const src = window.__ASSETS || {};
  return Promise.all([loadCars(), ...Object.entries(src).map(([k, url]) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { IMG[k] = im; res(); };
    im.onerror = () => res();
    im.src = url;
  }))]);
}
export function tex(name, renderer, { srgb = true, repeat = true } = {}) {
  const im = IMG[name]; if (!im) return null;
  const t = new THREE.Texture(im);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}
// average colour of an image in linear space (used to keep the designed biome colours as a tint)
export function avgLinear(name) {
  const im = IMG[name]; if (!im) return null;
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0, 16, 16);
  const d = g.getImageData(0, 0, 16, 16).data; let r = 0, gg = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += Math.pow(d[i] / 255, 2.2); gg += Math.pow(d[i + 1] / 255, 2.2); b += Math.pow(d[i + 2] / 255, 2.2); }
  const n = d.length / 4; return [r / n, gg / n, b / n];
}

// Cut-out plant sprite cleaned for rendering: removes magenta spill left by the chroma key and
// "bleeds" leaf colour into the transparent pixels so mipmaps / soft edges don't pick up a pink fringe.
export function spriteTex(name, renderer, despill = true) {
  const im = IMG[name]; if (!im) return null;
  const w = im.naturalWidth, h = im.naturalHeight;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, w, h).data, n = w * h;
  if (despill) for (let i = 0; i < n * 4; i += 4) {
    const m = Math.min(d[i], d[i + 2]) - d[i + 1];
    if (m > 0) { d[i] -= m; d[i + 2] -= m; d[i + 1] = Math.min(255, d[i + 1] + m * 0.3); }
  }
  // colour bleed: pixels below this alpha take the average colour of solid neighbours
  let done = new Uint8Array(n); for (let k = 0; k < n; k++) done[k] = d[k * 4 + 3] >= 170 ? 1 : 0;
  for (let pass = 0; pass < 6; pass++) {
    const nd = done.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x; if (done[k]) continue;
      let r = 0, gg = 0, b = 0, cnt = 0;
      for (const q of [k - 1, k + 1, k - w, k + w]) {
        if (q < 0 || q >= n || !done[q] || (q === k - 1 && x === 0) || (q === k + 1 && x === w - 1)) continue;
        r += d[q * 4]; gg += d[q * 4 + 1]; b += d[q * 4 + 2]; cnt++;
      }
      if (cnt) { d[k * 4] = r / cnt; d[k * 4 + 1] = gg / cnt; d[k * 4 + 2] = b / cnt; nd[k] = 1; }
    }
    done = nd;
  }
  // DataTexture rows start at the bottom: flip while copying
  const out = new Uint8Array(n * 4);
  for (let y = 0; y < h; y++) out.set(d.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.needsUpdate = true;
  t.image.naturalWidth = w; // keep the aspect available like an <img>
  return t;
}
