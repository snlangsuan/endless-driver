import QRCode from 'qrcode';
import * as THREE from 'three';
import {
  clamp, lerp, sstep, hash1, hash2, vnoise, REGIONS, NREG, REGION_LEN, regionIdx, regionAt, weatherOf, blendParams,
  road, SP, ROAD_HALF, ensureS, roadAtZ, roadAtS, heightCore, TI, groundAt, bridgeNear, onBridge, tunnelNear, inTunnel, underDip,
} from './world.js';
import {
  lin, M, buildPropGeos, buildVehicleGeo, buildPlayerCar, playerCarDefaults, VEHICLES, makeTintStdMat, buildCarShadowGeo, buildRoadsideGeos, billboardGeo, FACE_CAMERA, buildBuildingParts, buildTurbine, signTextures, kmTexture, makeTintMat, roadTexture, roadBumpTexture, rockTexture, detailTexture, glowTexture, buildInterior, wind,
} from './models.js';
import { Sky } from './sky.js';
import { Post } from './post.js';
import { Vegetation, Fireflies, Birds } from './veg.js';
import { Audio } from './audio.js';
import { IMG, CARGLB, loadAssets, tex, spriteTex, avgLinear } from './assets.js';
import { HUD } from './hud.js';
import { buildProcPlants, plantMaterial, proceduralTerrainMat } from './procgen.js';
import { GPU, surfaceMatGPU, gpuSun, gpuWind, terrainMatGPU, splatMatGPU, spriteMatGPU, innerDarkGPU, glowDef, glowPoints } from './gpu.js';
import { Haunt } from './ghosts.js';

if (__GPU__ && window.GPUDevice) {   // WebGPU port debugging: record the first validation errors with what caused them (window.__gpuErr)
  const rec = (what, e) => { if (!e) return; const a = (window.__gpuErr ||= []); if (a.length < 20) a.push(what + ': ' + e.message.slice(0, 900)); };
  for (const fn of ['createRenderPipeline', 'createBindGroup', 'createTexture', 'createComputePipeline', 'createBuffer', 'createSampler', 'createBindGroupLayout']) {
    const f = GPUDevice.prototype[fn];
    GPUDevice.prototype[fn] = function (d) { this.pushErrorScope('validation'); const r = f.call(this, d); this.popErrorScope().then((e) => rec(fn + ' ' + (d?.label || ''), e)); return r; };
  }
  const sm = GPUDevice.prototype.createShaderModule;
  GPUDevice.prototype.createShaderModule = function (d) { const m = sm.call(this, d); m.getCompilationInfo?.().then((ci) => { for (const x of ci.messages) if (x.type === 'error') rec('shader ' + (d.label || ''), { message: x.message + ' @' + x.lineNum + ': ' + (d.code.split('\n')[x.lineNum - 1] || '') }); }); return m; };
}
if (__GPU__) for (const k of ['warn', 'error']) { const f = console[k]; console[k] = (...a) => { const L = (window.__log ||= []); if (L.length < 60) L.push(k + ': ' + a.map(String).join(' ').slice(0, 700)); f.apply(console, a); }; }   // keep the first messages (WebGPU port debugging)
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const $ = (id) => document.getElementById(id);

// ---------------- Quality presets ----------------
const QUALITY = [
  { name: 'ต่ำ', dpr: 1, shadows: 0, post: false, grass: 0.3 },
  { name: 'กลาง', dpr: 1.5, shadows: 1024, post: true, grass: 0.6 },
  { name: 'สูง', dpr: 2, shadows: 2048, post: true, grass: 1 },
];
let qi = (() => { try { const v = localStorage.getItem('ed-quality'); if (v != null) return +v; } catch {} return isTouch ? 0 : 2; })();

// ---------------- Renderer / scene ----------------
const canvas = $('c');
const renderer = GPU
  ? new THREE.WebGPURenderer({ canvas, antialias: !isTouch, logarithmicDepthBuffer: false, powerPreference: 'high-performance' })   // log depth breaks the bloom passes (r170); WebGPU's 32-bit depth copes
  : new THREE.WebGLRenderer({ canvas, antialias: !isTouch, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
let gpuReady = !GPU;
if (GPU) {
  renderer.capabilities ??= { getMaxAnisotropy: () => 8 };   // textures are made before the device is ready
  renderer.init().then(() => {
    gpuReady = true; console.log('renderer:', renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2 fallback');
    const dev = renderer.backend?.device;   // keep the first few GPU errors for debugging (window.__gpuErr)
    if (dev) dev.addEventListener('uncapturederror', (e) => { const a = (window.__gpuErr ||= []); if (a.length < 12) a.push(e.error.message.slice(0, 600)); });
  });
}
const RenderTargetC = GPU ? THREE.RenderTarget : THREE.WebGLRenderTarget;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xaaccee, 150, 1100);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 6000);
const mirrorCam = new THREE.PerspectiveCamera(28, 3.2, 0.5, 6000);
const post = new Post(renderer, scene, camera);
function resize() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY[qi].dpr));
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
const C = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
// glowing point clouds: real points in WebGL, instanced sprites in WebGPU (which only draws 1-pixel points)
const pointsMat = (o) => (GPU ? glowDef(o) : new THREE.PointsMaterial(o));
const makePoints = (geo, mat) => (GPU ? glowPoints(geo, mat) : new THREE.Points(geo, mat));

// lights: one directional light acts as sun by day and moon by night (casts shadows around the car)
const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x4a4030, 1.0); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.5); scene.add(sun); scene.add(sun.target);
sun.shadow.camera.left = -95; sun.shadow.camera.right = 95; sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -95;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 900;
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.5;
function applyQuality(first) {
  const q = QUALITY[qi];
  sun.castShadow = q.shadows > 0;
  if (q.shadows) {
    if (sun.shadow.map && sun.shadow.mapSize.x !== q.shadows) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    sun.shadow.mapSize.set(q.shadows, q.shadows);
  }
  post.enabled = q.post;
  veg.density = q.grass;
  resize();
  for (let i = 0; i < 3; i++) hud.btn('q' + i, i === qi);
  if (!first) { veg.clear(); toast('คุณภาพกราฟิก: ' + q.name); }
  try { localStorage.setItem('ed-quality', qi); } catch {}
}

const sky = new Sky(scene);

// Image-based lighting: the sky is re-captured into an environment map every few seconds
// so cars, glass, chrome and the wet road reflect the actual sky / sunset / night.
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), sky.dome.material));
const envGroundMat = new THREE.MeshBasicMaterial({ color: 0x334422, side: THREE.DoubleSide });
const envGround = new THREE.Mesh(new THREE.CircleGeometry(80, 24).rotateX(-Math.PI / 2), envGroundMat); envGround.position.y = -3; envScene.add(envGround);
let envRT = null, envTimer = 0;
scene.environmentIntensity = 0.75;
function updateEnvMap(dt, force) {
  envTimer -= dt;
  if (!force && envTimer > 0) return;
  envTimer = 2;
  const rt = pmrem.fromScene(envScene, 0.015, 0.1, 300);
  if (envRT) envRT.dispose();
  envRT = rt; scene.environment = rt.texture;
}

// ---------------- Shared materials / geometries ----------------
const detailTex = detailTexture(renderer);
const rockTex = rockTexture(renderer);
let terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTex, bumpMap: detailTex, bumpScale: 0.9 });
terrainMat.onBeforeCompile = (sh) => {
  sh.uniforms.rockMap = { value: rockTex };
  sh.vertexShader = 'attribute float aRock;\nvarying float vRock;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vRock = aRock;');
  sh.fragmentShader = 'uniform sampler2D rockMap;\nvarying float vRock;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
    vec3 g1 = texture2D(map, vMapUv).rgb, g2 = texture2D(map, vMapUv * 0.173 + vec2(0.31, 0.57)).rgb;
    vec3 r1 = texture2D(rockMap, vMapUv * 0.55).rgb, r2 = texture2D(rockMap, vMapUv * 0.083 + vec2(0.2, 0.7)).rgb;
    diffuseColor.rgb *= mix(g1 * g2 * 1.95, r1 * r2 * 1.95, vRock);`);
};
terrainMat.customProgramCacheKey = () => 'terrain2';
if (GPU) terrainMat = proceduralTerrainMat();   // WebGPU: ground drawn from noise only
const PROC_LOD = GPU ? [buildProcPlants(1), buildProcPlants(5), buildProcPlants(30)] : null, PROC = GPU ? PROC_LOD[0] : null, plantMat = GPU ? plantMaterial() : null;   // WebGPU: trees grown in code
const treeMat = makeTintMat();
const tintMat = makeTintMat({ swayAmp: 0 });
const PG = buildPropGeos();
const BUILD = buildBuildingParts();
const bldMats = {}; // texture name -> material (filled in setupAssets)
const vehMatPlain = makeTintStdMat();
const RS = buildRoadsideGeos();
const roadBump = roadBumpTexture(renderer);
const roadMat = new THREE.MeshStandardMaterial({ map: roadTexture(renderer), bumpMap: roadBump, bumpScale: 1.2, roughness: 0.88, metalness: 0 });
const gravelMat = new THREE.MeshLambertMaterial({ color: C(0.62, 0.58, 0.52), map: rockTex, bumpMap: rockTex, bumpScale: 1.5 });
const postMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const railMat = new THREE.MeshStandardMaterial({ color: C(0.72, 0.74, 0.77), roughness: 0.35, metalness: 0.55, side: THREE.DoubleSide });
const reflMat = new THREE.MeshBasicMaterial({ color: C(1, 0.55, 0.1) });
const bulbMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
const glowTex = glowTexture();
const lampGlowMat = pointsMat({ map: glowTex, size: 5, color: C(1, 0.8, 0.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
const wireMat = new THREE.LineBasicMaterial({ color: 0x15161a });
const SIGNTEX = signTextures();
const signMats = Object.fromEntries(Object.entries(SIGNTEX).map(([k, t]) => [k, new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide })]));
const SIGN_PLATE = new THREE.PlaneGeometry(0.85, 0.85);
const SIGN_POST = new THREE.CylinderGeometry(0.035, 0.035, 2.2, 6);
const signPostMat = new THREE.MeshStandardMaterial({ color: 0x9a9da2, roughness: 0.4, metalness: 0.7 });
const KM_STONE = new THREE.BoxGeometry(0.42, 0.72, 0.18);
const KM_TOP = new THREE.CylinderGeometry(0.21, 0.21, 0.18, 16);
const kmTopMat = new THREE.MeshLambertMaterial({ color: C(0.78, 0.08, 0.1) });
const kmCache = new Map();
function kmMat(km) {
  const k = Math.round(km);
  if (!kmCache.has(k)) {
    const t = kmTexture(k), white = new THREE.MeshLambertMaterial({ color: C(0.95, 0.95, 0.93) }), face = new THREE.MeshLambertMaterial({ map: t });
    kmCache.set(k, [white, white, white, white, face, face]);
    if (kmCache.size > 12) { const first = kmCache.keys().next().value; kmCache.get(first)[4].map.dispose(); kmCache.delete(first); }
  }
  return kmCache.get(k);
}
const catEyeMat = pointsMat({ map: glowTex, size: 0.45, color: C(1, 0.7, 0.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
const veg = new Vegetation(scene);
const fireflies = new Fireflies(scene, glowTex);
const birds = new Birds(scene);

// ---------------- Generated image assets (optional) ----------------
// Terrain materials: 0 grass, 1 dry grass, 2 soil, 3 sand, 4 snow, 5 rock, 6 red rock, 7 gravel
const MATS = ['grass', 'dry_grass', 'soil', 'sand', 'snow', 'rock', 'red_rock', 'gravel'];
const MAT_SCALE = [4, 5, 4, 6, 7, 9, 11, 3];
let SPLAT = null; // { avg: [[r,g,b] x8] } when textures are available
function makeSplatMaterial(texs) {
  if (GPU) return splatMatGPU(texs, MAT_SCALE);
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    MATS.forEach((n, i) => (sh.uniforms['tM' + i] = { value: texs[i] }));
    sh.vertexShader = 'attribute vec4 aW0;\nattribute vec4 aW1;\nvarying vec4 vW0;\nvarying vec4 vW1;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vW0 = aW0; vW1 = aW1;
      vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    const S = MAT_SCALE.map((v) => v.toFixed(1));
    sh.fragmentShader = MATS.map((n, i) => `uniform sampler2D tM${i};`).join('\n') + '\nvarying vec4 vW0;\nvarying vec4 vW1;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec2 P = vWP.xz;
      vec3 tn = pow(abs(vWN), vec3(4.0)); tn /= (tn.x + tn.y + tn.z);
      vec3 acc = vec3(0.0);
      #define FLAT(T, S) mix(texture2D(T, P / S).rgb, texture2D(T, P / (S * 3.7) + vec2(0.37, 0.71)).rgb, 0.33)
      #define TRI(T, S) (texture2D(T, vWP.xz / S).rgb * tn.y + texture2D(T, vWP.xy / S).rgb * tn.z + texture2D(T, vWP.zy / S).rgb * tn.x)
      if (vW0.x > 0.004) acc += FLAT(tM0, ${S[0]}) * vW0.x;
      if (vW0.y > 0.004) acc += FLAT(tM1, ${S[1]}) * vW0.y;
      if (vW0.z > 0.004) acc += FLAT(tM2, ${S[2]}) * vW0.z;
      if (vW0.w > 0.004) acc += FLAT(tM3, ${S[3]}) * vW0.w;
      if (vW1.x > 0.004) acc += FLAT(tM4, ${S[4]}) * vW1.x;
      if (vW1.y > 0.004) acc += TRI(tM5, ${S[5]}) * vW1.y;
      if (vW1.z > 0.004) acc += TRI(tM6, ${S[6]}) * vW1.z;
      if (vW1.w > 0.004) acc += FLAT(tM7, ${S[7]}) * vW1.w;
      diffuseColor.rgb *= acc;`);
  };
  m.customProgramCacheKey = () => 'terrain-splat';
  return m;
}
// plant sprites used as billboards: [image, height in metres]
const SPRITE_H = { tree_broadleaf: 9, tree_autumn: 8, tree_sakura: 6.5, tree_pine: 13, tree_pine_snow: 11, tree_birch: 11, tree_palm: 12, tree_sugarpalm: 15, bamboo: 8, banana: 4, bush: 1.9, bush_autumn: 1.9, cactus: 5, tree_dead: 6 };
const SPRITES = {}; // name -> { geo, mat }
function spriteFor(type, regKey) {
  const n = {
    roundtree: regKey === 'autumn' ? 'tree_autumn' : 'tree_broadleaf', sakura: 'tree_sakura', pine: 'tree_pine', snowpine: 'tree_pine_snow',
    birch: 'tree_birch', palm: 'tree_palm', sugarpalm: 'tree_sugarpalm', bamboo: 'bamboo', banana: 'banana',
    bush: regKey === 'autumn' ? 'bush_autumn' : 'bush', cactus: 'cactus', deadtree: 'tree_dead',
  }[type];
  return n && SPRITES[n] ? n : null;
}
function setupSprites() {
  for (const name in SPRITE_H) {
    const t = spriteTex(name, renderer, name !== 'tree_sakura'); if (!t) continue;
    const H = SPRITE_H[name], aspect = t.image.width / t.image.height;
    if (GPU) { SPRITES[name] = { geo: billboardGeo(H, aspect), mat: spriteMatGPU(t, name !== 'tree_sakura'), depth: null }; continue; }
    const mat = makeTintMat({ swayBase: H * 0.3, swayAmp: 0.035, flat: false, side: THREE.DoubleSide, texScale: 0, face: true });
    mat.map = t; mat.alphaTest = 0.5;
    if (name !== 'tree_sakura') { // remove magenta spill left from the chroma-key background (thin leaves, frond tips)
      const pb = mat.onBeforeCompile, pk = mat.customProgramCacheKey;
      mat.onBeforeCompile = (sh) => { pb(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n{ float sp = max(min(diffuseColor.r, diffuseColor.b) - diffuseColor.g, 0.0); diffuseColor.rb -= sp; diffuseColor.g += sp * 0.3; }'); };
      mat.customProgramCacheKey = () => pk() + '-despill';
    }
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: t, alphaTest: 0.45, side: THREE.DoubleSide });
    depth.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + FACE_CAMERA); };
    depth.customProgramCacheKey = () => 'sprite-depth-face';
    SPRITES[name] = { geo: billboardGeo(H, aspect), mat, depth };
  }
}
function setupAssets() {
  setupSprites();
  if (GPU) for (const n of ['wood_wall', 'log_wall', 'roof_tiles', 'roof_metal', 'stucco']) bldMats[n] = surfaceMatGPU(n);   // WebGPU: wall and roof patterns are drawn by the shader
  for (const n of ['wood_wall', 'log_wall', 'roof_tiles', 'roof_metal', 'stucco']) {
    const t = tex(n, renderer); if (!t) continue;
    const mt = makeTintMat({ swayAmp: 0, texScale: 0 }); mt.map = t; bldMats[n] = mt;
  }
  const texs = MATS.map((n) => tex(n, renderer));
  if (texs.every(Boolean)) {
    SPLAT = { avg: MATS.map((n) => avgLinear(n)) };
    terrainMat = makeSplatMaterial(texs);
  }
  if (IMG.asphalt) { roadMat.map.dispose(); roadMat.map = roadTexture(renderer, IMG.asphalt); roadMat.needsUpdate = true; }
  const gv = tex('gravel', renderer);
  if (gv) { gv.repeat.set(1, 1); gravelMat.map = gv; gravelMat.bumpMap = null; gravelMat.color.setRGB(1, 1, 1); gravelMat.needsUpdate = true; }
  const panos = {};
  for (const n of ['mountains_green', 'mountains_snow', 'mountains_desert', 'islands']) { const t = tex(n, renderer, { repeat: false }); if (t) { t.wrapS = THREE.RepeatWrapping; panos[n] = t; } }
  if (Object.keys(panos).length === 4) sky.setPanos(panos);
  const clouds = []; for (let i = 1; i <= 6; i++) { const t = tex('cloud_' + i, renderer, { repeat: false }); if (t) clouds.push(t); }
  sky.setClouds(clouds);
}

// ---------------- Collision data ----------------
// r: collision radius at scale 1. kind: 'solid' blocks the car, 'break' gets knocked down, 'squash' gets flattened.
const PROP_COLL = {
  pine: [0.35, 'solid'], snowpine: [0.35, 'solid'], roundtree: [0.4, 'solid'], sakura: [0.4, 'solid'], palm: [0.32, 'solid'],
  sugarpalm: [0.36, 'solid'], birch: [0.26, 'solid'], bamboo: [0.85, 'solid'], house: [3.6, 'solid'], house2: [4.8, 'solid'], shophouse: [8, 'solid'], cabin: [2.7, 'solid'],
  chedi: [3.1, 'solid'], rock: [1.6, 'solid'],
  banana: [0.35, 'break'], cactus: [0.42, 'break'], deadtree: [0.3, 'break'], bush: [1.1, 'squash'],
};
const broken = new Set();       // ids of knocked-down objects (survive tile rebuilds)
const falling = [];             // running knock-down animations
// ---------------- Terrain tiles ----------------
const TS = 160, TR = 48;
const tiles = new Map();
const FLOWERS = [[0.95, 0.3, 0.45], [0.98, 0.85, 0.2], [0.95, 0.95, 0.95], [0.7, 0.45, 0.9]];
const SNOW = [0.94, 0.96, 1.0], GRAVEL = [0.5, 0.47, 0.42];
const DETAIL_GAIN = 1.0; // compensates the darkening of the detail texture
const _col = new THREE.Color();
const PROP_BOAT = REGIONS.find((r) => r.key === 'coast').props.find((p) => p[0] === 'boat')[2];
const TURB = buildTurbine();
const rotors = new Set();

function buildTile(tx, tz) {
  const ox = tx * TS, oz = tz * TS, N = TR + 1, st = TS / TR, NB = N + 2;
  // heights on a grid with a 1-vertex border so normals/slopes are seamless across tiles
  const HB = new Float32Array(NB * NB), Ls = new Float32Array(N * N);
  const rows = [];
  for (let j = -1; j <= N; j++) {
    const z = oz + j * st;
    const r = roadAtZ(z, {}); const p = blendParams(r.s, {});
    if (j >= 0 && j < N) rows.push({ r, p });
    for (let i = -1; i <= N; i++) {
      HB[(j + 1) * NB + i + 1] = heightCore(ox + i * st, z, r, p);
      if (j >= 0 && j < N && i >= 0 && i < N) Ls[j * N + i] = TI.L;
    }
  }
  const HBk = (i, j) => HB[(j + 1) * NB + i + 1];
  const pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3), nor = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2), rk = new Float32Array(N * N);
  const c = [0, 0, 0], wv = new Float32Array(8);
  const W0 = SPLAT ? new Float32Array(N * N * 4) : null, W1 = SPLAT ? new Float32Array(N * N * 4) : null;
  // mix the designed colour, and (when splatting) move the same share of material weight onto material m
  const mix = (b, t, m = -1) => {
    c[0] += (b[0] - c[0]) * t; c[1] += (b[1] - c[1]) * t; c[2] += (b[2] - c[2]) * t;
    if (m >= 0 && t > 0) { for (let q = 0; q < 8; q++) wv[q] *= 1 - t; wv[m] += t; }
  };
  for (let j = 0; j < N; j++) {
    const { r, p } = rows[j];
    for (let i = 0; i < N; i++) {
      const k = j * N + i, x = ox + i * st, z = oz + j * st, h = HBk(i, j), L = Ls[k], aL = Math.abs(L);
      pos[k * 3] = i * st; pos[k * 3 + 1] = h; pos[k * 3 + 2] = j * st;
      uv[k * 2] = x / 6; uv[k * 2 + 1] = z / 6;
      const hx = (HBk(i + 1, j) - HBk(i - 1, j)) / (2 * st), hz = (HBk(i, j + 1) - HBk(i, j - 1)) / (2 * st);
      const nl = 1 / Math.sqrt(hx * hx + hz * hz + 1);
      nor[k * 3] = -hx * nl; nor[k * 3 + 1] = nl; nor[k * 3 + 2] = -hz * nl;
      const slope = Math.sqrt(hx * hx + hz * hz);
      rk[k] = sstep(0.45, 0.95, slope) * (1 - p.snow * 0.6) + p.mesa * sstep(0.2, 0.5, slope) * 0.5;
      // base colour with macro & micro variation
      const n = 0.5 + 0.5 * vnoise(x * 0.03, z * 0.03);
      const macro = vnoise(x * 0.006 + 40, z * 0.006 - 13);
      c[0] = p.grass[0]; c[1] = p.grass[1]; c[2] = p.grass[2]; mix(p.grass2, n);
      wv.fill(0); { const dr = clamp(p.dry + (vnoise(x * 0.02 + 7, z * 0.02) * 0.25) * (p.dry > 0.05 ? 1 : 0), 0, 1); wv[0] = 1 - dr; wv[1] = dr; }
      if (p.mesa > 0.01) mix(p.sand, p.mesa * sstep(-0.1, 0.5, vnoise(x * 0.012, z * 0.012 + 9)) * 0.7, 3);
      const lv = 1 + macro * 0.13; c[0] *= lv * (1 + Math.max(0, macro) * 0.08); c[1] *= lv; c[2] *= lv * (1 - Math.max(0, macro) * 0.15);
      const v = (hash2(i + tx * 97, j + tz * 89) - 0.5) * 0.05; c[0] += v; c[1] += v; c[2] += v * 0.5;
      if (p.paddy > 0.01) {
        const f = p.paddy * (1 - sstep(200, 380, aL));
        if (f > 0) {
          const cx = x / 28, cz = z / 20, cell = hash2(Math.floor(cx), Math.floor(cz));
          let pc = cell < 0.12 ? [0.42, 0.55, 0.56] : cell < 0.5 ? [0.38, 0.66, 0.16] : cell < 0.8 ? [0.56, 0.72, 0.22] : [0.82, 0.72, 0.3];
          const dike = cx - Math.floor(cx) < 0.1 || cz - Math.floor(cz) < 0.12;
          if (dike) pc = [0.5, 0.5, 0.3];
          mix(pc, f, cell < 0.12 && !dike ? 2 : dike ? 1 : -1);
        }
      }
      if (p.flowers > 0.01) {
        const fh = hash2(Math.floor(x / 3) + 7, Math.floor(z / 3));
        const field = sstep(0.1, 0.5, vnoise(x * 0.01 + 3, z * 0.01));
        if (fh > 0.8 - field * 0.2 && aL > 12) mix(FLOWERS[Math.floor(fh * 1000) % 4], p.flowers * 0.28 * (0.5 + 0.5 * field));
      }
      if (p.mesa > 0.01) {
        const band = 0.5 + 0.5 * Math.sin(h * 0.45 + vnoise(x * 0.02, z * 0.02) * 0.8);
        const rc = [lerp(p.rock[0], 0.9, band * 0.6), lerp(p.rock[1], 0.62, band * 0.5), lerp(p.rock[2], 0.42, band * 0.4)];
        mix(rc, p.mesa * sstep(0.2, 0.55, slope), 6);
      }
      mix(p.rock, sstep(0.5, 0.95, slope) * (1 - p.mesa * 0.5), p.mesa > 0.5 ? 6 : 5);
      if (h < 3.2) mix(p.sand, Math.max(p.coast, 0.5) * (1 - sstep(1.4, 3.2, h)), 3);
      if (h < 0.6) mix([0.62, 0.58, 0.46], sstep(0.6, -0.2, h) * 0.5, 3); // wet sand
      if (h < 0) mix([0.3, 0.36, 0.3], sstep(0, -5, h), 2);
      const sn = Math.max(p.snow, sstep(p.snowline, p.snowline + 40, h - r.y));
      if (sn > 0) mix(SNOW, sn * (1 - sstep(0.85, 1.4, slope) * 0.75), 4);
      if (aL < ROAD_HALF + 2.6) mix(GRAVEL, 0.85 * (1 - p.snow * 0.4), 7);
      else if (aL < ROAD_HALF + 4.5) mix(GRAVEL, 0.35 * (1 - p.snow * 0.4), 7);
      if (SPLAT) {
        // colour attribute becomes a tint relative to the textures' own average colour
        let ar = 0, ag = 0, ab = 0;
        for (let q = 0; q < 8; q++) { const A = SPLAT.avg[q]; ar += A[0] * wv[q]; ag += A[1] * wv[q]; ab += A[2] * wv[q]; }
        const tint = (v, a) => clamp(lin(clamp(v, 0, 1)) / Math.max(a, 1e-3), 0.25, 3) * 0.55 + 0.45;
        col[k * 3] = tint(c[0], ar); col[k * 3 + 1] = tint(c[1], ag); col[k * 3 + 2] = tint(c[2], ab);
        W0.set([wv[0], wv[1], wv[2], wv[3]], k * 4); W1.set([wv[4], wv[5], wv[6], wv[7]], k * 4);
      } else { col[k * 3] = lin(clamp(c[0], 0, 1)) * DETAIL_GAIN; col[k * 3 + 1] = lin(clamp(c[1], 0, 1)) * DETAIL_GAIN; col[k * 3 + 2] = lin(clamp(c[2], 0, 1)) * DETAIL_GAIN; }
    }
  }
  const idx = new Uint16Array(TR * TR * 6); let q = 0;
  for (let j = 0; j < TR; j++) for (let i = 0; i < TR; i++) {
    const a = j * N + i, b = a + 1, d = a + N, e = d + 1;
    if ((i + j) & 1) { idx[q++] = a; idx[q++] = d; idx[q++] = b; idx[q++] = b; idx[q++] = d; idx[q++] = e; }
    else { idx[q++] = a; idx[q++] = d; idx[q++] = e; idx[q++] = a; idx[q++] = e; idx[q++] = b; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aRock', new THREE.BufferAttribute(rk, 1));
  if (SPLAT) { g.setAttribute('aW0', new THREE.BufferAttribute(W0, 4)); g.setAttribute('aW1', new THREE.BufferAttribute(W1, 4)); }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  const H = new Float32Array(N * N); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = HBk(i, j);
  const grp = new THREE.Group(); grp.position.set(ox, 0, oz);
  const tm = new THREE.Mesh(g, terrainMat); tm.receiveShadow = true; tm.castShadow = true;
  grp.add(tm);

  // props
  const buckets = {}, cols = [];
  grp.userData.cols = cols;
  const SPC = 6.5, n = Math.floor(TS / SPC);
  for (let j = 0; j < n; j++) {
    const { r, p } = rows[Math.min(N - 1, Math.round((j + 0.5) * SPC / st))];
    for (let i = 0; i < n; i++) {
      const h0 = hash2(tx * 1000 + i, tz * 1000 + j);
      if (h0 > p.density * 1.2) continue;
      const x = ox + (i + hash2(i * 7 + tx, j * 3 + tz)) * SPC, z = oz + (j + hash2(i * 5 - tz, j * 11 + tx)) * SPC;
      const L = (x - r.x) * Math.cos(r.h), aL = Math.abs(L);
      if (aL < ROAD_HALF + (p.shops > 0.5 ? 18 : 6) || aL > 420) continue;
      if (((p.coast > 0.5 && L < -60) || (p.isl > 0.5 && aL > 40)) && hash2(i * 3 + tx, j * 7 + tz) < 0.025) { // fishing boats offshore
        const hb = heightCore(x, z, r, p);
        if (hb < -1.5) { (buckets.boat || (buckets.boat = [])).push([x - ox, 0.05, z - oz, hash2(i, j) * 6.28, 1, PROP_BOAT[Math.floor(hash2(j, i * 3) * PROP_BOAT.length)]]); continue; }
      }
      const clus = 0.35 + 0.65 * sstep(-0.3, 0.3, vnoise(x * 0.008, z * 0.008));
      if (h0 > p.density * clus * (aL < 260 ? 1 : 0.45)) continue;
      const reg = hash2(i + 33, j + 77) < p.t ? p.b : p.a;
      const props = reg.props;
      let tot = 0; for (const pr of props) tot += pr[1];
      let rr = hash2(i * 13 + tz, j * 17 + tx) * tot, pick = props[0];
      for (const pr of props) { if ((rr -= pr[1]) <= 0) { pick = pr; break; } }
      const type = pick[0];
      const building = type === 'house' || type === 'house2' || type === 'shophouse' || type === 'cabin' || type === 'chedi';
      if (building && (aL < (type === 'chedi' ? 35 : type === 'shophouse' ? ROAD_HALF + 13 : type === 'house2' ? 20 : 22) || aL > (type === 'shophouse' ? 26 : 220))) continue;
      if (type === 'shophouse' && (i % 3 || j % 3)) continue;   // big footprints: one per 3x3 cells so rows don't overlap
      if (type === 'house2' && (i % 2 || j % 2)) continue;
      const h = heightCore(x, z, r, p);
      if (h < 0.6) continue;
      { const bb = bridgeNear(r.s); if (bb && h < bb.wl + 0.6) continue; }   // nothing growing in the river
      let scl = 0.75 + hash2(i, j + 999) * 0.6 * (type === 'rock' ? 2 : 1);
      if (building) scl = type === 'chedi' ? 1 + hash2(i, j) * 0.6 : type === 'shophouse' ? 1 : 0.9 + hash2(i, j) * 0.25;
      const ry = building ? r.h + (L > 0 ? -Math.PI / 2 : Math.PI / 2) + (hash2(j, i) - 0.5) * (type === 'shophouse' ? 0.06 : 0.3) : hash2(j, i) * 6.28;
      const spr = spriteFor(type, reg.key);
      const bkey = spr ? 'S:' + spr : PROC && PROC[type] ? type + '|' + ((x - ox > TS / 2 ? 1 : 0) + (z - oz > TS / 2 ? 2 : 0)) : type;   // code-grown plants: one batch per quarter tile, so detail can follow distance
      (buckets[bkey] || (buckets[bkey] = [])).push([x - ox, h - (type === 'rock' ? 0.3 : 0.05), z - oz, ry, scl, spr ? [1, 1, 1] : pick[2][Math.floor(hash2(i + 5, j + 9) * pick[2].length)], type]);
    }
  }
  for (const bkey in buckets) {
    const list = buckets[bkey];
    const spr = bkey.startsWith('S:') ? SPRITES[bkey.slice(2)] : null, type = list[0][6];
    const parts = !spr && BUILD[type] && (bldMats.wood_wall || !PG[type]) ? BUILD[type] : null;
    const pg = PROC && PROC[type];
    const im = pg ? new THREE.InstancedMesh(pg, plantMat, list.length) : new THREE.InstancedMesh(spr ? spr.geo : parts ? parts[0].geo : PG[type], spr ? spr.mat : parts ? (bldMats[parts[0].tex] || treeMat) : treeMat, list.length);
    if (spr && spr.depth) im.customDepthMaterial = spr.depth;
    im.castShadow = true; im.receiveShadow = !spr; // billboards would shadow themselves (crossed cards)
    const extra = parts ? parts.slice(1).map((pt) => { const e = new THREE.InstancedMesh(pt.geo, pt.tex ? (bldMats[pt.tex] || treeMat) : treeMat, list.length); e.castShadow = true; e.receiveShadow = true; return e; }) : pg ? PROC_LOD.slice(1).map((G) => { const e = new THREE.InstancedMesh(G[type], plantMat, list.length); e.castShadow = G !== PROC_LOD[2]; e.receiveShadow = true; e.visible = false; return e; }) : [];
    list.forEach((it, k) => {
      const mk = M(it[0], it[1], it[2], 0, it[3], 0, it[4], it[4], it[4]);
      im.setMatrixAt(k, mk); for (const e of extra) e.setMatrixAt(k, mk);
      const cc = it[5], v = spr ? 0.85 + hash1(k * 7 + tx) * 0.25 : 0.9 + hash1(k * 7 + tx) * 0.2;
      if (spr) { const mx = Math.max(cc[0], cc[1], cc[2], 0.01); _col.setRGB((0.85 + 0.15 * cc[0] / mx) * v, (0.85 + 0.15 * cc[1] / mx) * v, (0.85 + 0.15 * cc[2] / mx) * v); } // photo sprites already carry their colour
      else _col.setRGB(cc[0] * v, cc[1] * v, cc[2] * v, THREE.SRGBColorSpace);
      im.setColorAt(k, _col); for (const e of extra) e.setColorAt(k, _col);
    });
    im.computeBoundingSphere();
    grp.add(im); for (const e of extra) { e.computeBoundingSphere(); grp.add(e); }
    if (pg) { let sx = 0, sz = 0; for (const it of list) { sx += it[0]; sz += it[2]; } (grp.userData.lods || (grp.userData.lods = [])).push({ m: [im, ...extra], x: ox + sx / list.length, z: oz + sz / list.length }); }
    const pc = PROP_COLL[type];
    if (pc) list.forEach((it, k) => {
      const id = `t${tx},${tz},${bkey},${k}`;
      const c = { x: it[0] + ox, z: it[2] + oz, r: pc[0] * it[4] * (type === 'rock' ? 1.15 : 1), kind: pc[1], id, parts: pg ? [{ im, k }, ...extra.map((e) => ({ im: e, k }))] : [{ im, k }], base: [it[0], it[1], it[2], it[3], it[4]] };
      cols.push(c);
      if (broken.has(id)) knockDown(c, null, true);
    });
  }
  // wind turbines on the hills of the flower meadows
  const pc = rows[Math.floor(N / 2)].p;
  const mw = (pc.a.key === 'meadow' ? 1 - pc.t : 0) + (pc.b.key === 'meadow' ? pc.t : 0);
  if (mw > 0.2 && hash2(tx * 7, tz * 13) < 0.45 * mw) {
    for (let k = 0; k < 2; k++) {
      const x = ox + hash2(tx + k, tz * 3) * TS, z = oz + hash2(tx * 5, tz + k * 9) * TS;
      const rr = roadAtZ(z, {}), pp = blendParams(rr.s, {});
      const h = heightCore(x, z, rr, pp), aL = Math.abs(TI.L);
      if (aL < 110 || aL > 450 || h < 1) continue;
      const tw = new THREE.Group(); tw.position.set(x - ox, h - 0.5, z - oz); tw.rotation.y = 0.6;
      const tower = new THREE.Mesh(TURB.tower, vehMatPlain); tower.castShadow = true; tw.add(tower);
      const rotor = new THREE.Mesh(TURB.rotor, vehMatPlain); rotor.position.set(0, 50.8, 2.4); rotor.rotation.z = hash2(tx, k) * 6; rotor.castShadow = true;
      tw.add(rotor); rotors.add(rotor); grp.add(tw);
      cols.push({ x, z, r: 1.7, kind: 'solid' });
    }
  }
  scene.add(grp);
  return grp;
}
// keeps the frame rate up: when it drops, plant detail distance comes in first, then render resolution
const gov = { lod: 1, res: 1, base: 1 };
// code-grown plants: full detail near the camera, thinned versions further out
function updatePlantLod() {
  for (const [, g] of tiles) { const L = g.userData.lods; if (!L) continue; for (const l of L) { const d = Math.hypot(l.x - camWorld.x, l.z - camWorld.z), lv = d < 75 * gov.lod ? 0 : d < 230 * gov.lod ? 1 : 2; for (let i = 0; i < 3; i++) l.m[i].visible = i === lv; } }
}
// mirrors are small: draw every plant in them at its lightest version
function plantLodFar() { for (const [, g] of tiles) { const L = g.userData.lods; if (L) for (const l of L) { l.m[0].visible = l.m[1].visible = false; l.m[2].visible = true; } } }
function disposeGroup(grp) {
  grp.traverse((o) => rotors.delete(o));
  scene.remove(grp);
  grp.traverse((o) => { if (o.isInstancedMesh) o.dispose(); else if (o.isGlow) { o.srcGeo.dispose(); o.material.dispose(); } else if (o.isMesh || o.isPoints) { if (!o.userData.shared) o.geometry.dispose(); } });
}
const _rz = {};
function updateTiles(force) {
  const cz = car.z;
  const z0 = Math.floor((cz - 350) / TS), z1 = Math.floor((cz + 1150) / TS);
  const need = new Set(), queue = [];
  for (let tz = z0; tz <= z1; tz++) {
    const xa = roadAtZ(tz * TS, _rz).x, xb = roadAtZ((tz + 1) * TS, _rz).x, xm = roadAtZ((tz + 0.5) * TS, _rz).x;
    const lat = Math.abs(tz * TS - cz) < 500 ? 760 : 680;
    const x0 = Math.floor((Math.min(xa, xb, xm) - lat) / TS), x1 = Math.floor((Math.max(xa, xb, xm) + lat) / TS);
    for (let tx = x0; tx <= x1; tx++) {
      const key = tx + ',' + tz; need.add(key);
      if (!tiles.has(key)) {
        const dx = (tx + 0.5) * TS - car.x, dz = (tz + 0.5) * TS - cz;
        queue.push([dx * dx + dz * dz * 0.6, tx, tz, key]);
      }
    }
  }
  for (const [k, g] of tiles) if (!need.has(k)) { disposeGroup(g); tiles.delete(k); }
  queue.sort((a, b) => a[0] - b[0]);
  const budget = force ? 1e9 : 2;
  for (let i = 0; i < queue.length && i < budget; i++) tiles.set(queue[i][3], buildTile(queue[i][1], queue[i][2]));
}

// ---------------- Road chunks ----------------
const CH = 100; // samples per chunk (200 m)
const chunks = new Map();
// ----- bridges over the rivers and canals that cross the road (see world.js bridgeOfKm) -----
const BRIDGE = {
  conc: new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.9, side: THREE.DoubleSide }),
  dark: new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.95, side: THREE.DoubleSide }),
  steel: new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.45, metalness: 0.5 }),
  cable: new THREE.MeshStandardMaterial({ color: 0xe9edf0, roughness: 0.4, metalness: 0.3 }),
  seaNames: ['เกาะยาว', 'เกาะลันตา', 'เกาะแก้ว', 'เกาะนางยวน', 'เกาะหอย', 'เกาะลอย', 'เกาะสีชัง', 'เกาะช้างน้อย', 'เกาะมุก', 'เกาะไข่'],
  names: { small: ['บางใหญ่', 'ตาโต', 'สองพี่น้อง', 'บ้านใหม่', 'หนองบัว', 'ลำไทร', 'ขุนแก้ว', 'วัดโบสถ์', 'บางกระดี่', 'ท่าข้าม'], big: ['ปิง', 'วัง', 'ยม', 'น่าน', 'ป่าสัก', 'ท่าจีน', 'แม่กลอง', 'มูล', 'ชี', 'ตาปี'] },
  stripe: null, plates: new Map(),
};
function bridgeStripeMat() { // black-and-yellow end posts
  if (BRIDGE.stripe) return BRIDGE.stripe;
  const c = document.createElement('canvas'); c.width = 16; c.height = 64; const g = c.getContext('2d');
  for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#111' : '#f2c40c'; g.fillRect(0, k * 8, 16, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (BRIDGE.stripe = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
}
function bridgePlateMat(b) { // the bridge's name, painted on a plate at each end
  const key = b.s; if (BRIDGE.plates.has(key)) return BRIDGE.plates.get(key);
  const list = b.sea ? BRIDGE.seaNames : b.big ? BRIDGE.names.big : BRIDGE.names.small, nm = list[Math.floor(b.name * list.length)];
  const text = b.sea ? `สะพานข้ามทะเล${nm}` : b.big ? `สะพานข้ามแม่น้ำ${nm}` : `สะพานคลอง${nm}`;
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#1d4f91'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(8, 8, 496, 112);
  g.fillStyle = '#fff'; g.font = 'bold 52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 66, 470);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const mt = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }); BRIDGE.plates.set(key, mt); return mt;
}
function plateMat(text) { // a blue name plate with white text (cached per text)
  if (BRIDGE.plates.has(text)) return BRIDGE.plates.get(text);
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#1d4f91'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(8, 8, 496, 112);
  g.fillStyle = '#fff'; g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 66, 470);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const mt = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }); BRIDGE.plates.set(text, mt); return mt;
}
// ----- sea bridges between the islands: a box-girder deck on hammerhead piers; the long one has a cable-stayed main span -----
const _q = new THREE.Quaternion(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _m4 = new THREE.Matrix4();
function buildSeaBridge(grp, b, i0, i1, bx, by, bz, lamps) {
  const ia = Math.ceil((b.s - b.half) / SP), ib = Math.floor((b.s + b.half) / SP);
  const j0 = Math.max(i0, ia), j1 = Math.min(i1, ib + 1);
  if (j1 <= j0) return;
  const T = 2.4, IN = ROAD_HALF + 0.9, OUT = ROAD_HALF + 2.6;
  const at = (s, L, dy) => { const r = roadAtS(s, {}), lx = Math.cos(r.h), lz = -Math.sin(r.h); return [r.x + lx * L - bx, r.y + dy - by, r.z + lz * L - bz, r.h]; };
  const inSpan = (s) => s >= j0 * SP && s < j1 * SP;
  // deck: box girder with a concrete barrier, a walkway outside it and a sloping soffit
  const sec = (sd) => [[0, -T], [sd * (OUT - 1.6), -T], [sd * OUT, -0.8], [sd * OUT, 0.35], [sd * (IN + 0.35), 0.35], [sd * (IN + 0.35), 1.0], [sd * IN, 1.0], [sd * IN, 0.14]];
  const pos = [], idx = [];
  for (const sd of [1, -1]) {
    const S = sec(sd), base = pos.length / 3;
    for (let i = j0; i <= j1; i++) { const h = road.h[i], lx = Math.cos(h), lz = -Math.sin(h), x = road.x[i] - bx, y = road.y[i] - by, z = road.z[i] - bz; for (const [L, dy] of S) pos.push(x + lx * L, y + dy, z + lz * L); }
    const n = S.length;
    for (let k = 0; k < j1 - j0; k++) for (let q = 0; q < n - 1; q++) { const a = base + k * n + q, c = a + n; idx.push(a, c, a + 1, a + 1, c, c + 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const deck = new THREE.Mesh(g, BRIDGE.conc); deck.castShadow = true; deck.receiveShadow = true; grp.add(deck);
  // handrail along the outer edge of the walkways
  const posts = [], tub = [];
  for (const sd of [1, -1]) {
    for (let s = Math.ceil(j0 * SP / 2.5) * 2.5; s < j1 * SP; s += 2.5) posts.push(at(s, sd * (OUT - 0.12), 0.35));
    for (let i = j0; i < j1; i++) for (const hy of [1.4, 0.9]) { const a = at(i * SP, sd * (OUT - 0.12), hy), c = at((i + 1) * SP, sd * (OUT - 0.12), hy); tub.push(a[0], a[1], a[2], c[0], c[1], c[2]); }
  }
  if (posts.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 1.05, 0.06).translate(0, 0.52, 0), BRIDGE.steel, posts.length);
    posts.forEach((p, k) => im.setMatrixAt(k, M(p[0], p[1], p[2], 0, p[3], 0))); grp.add(im);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tub, 3)); grp.add(new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0xc8d0d4 })));
  }
  // street lamps on the walkways, staggered
  for (let s = b.s - b.half + 15; s < b.s + b.half - 10; s += 36) if (inSpan(s)) for (const sd of [1, -1]) { const p = at(s + (sd > 0 ? 0 : 18), sd * (ROAD_HALF + 1.8), 0.35); if (inSpan(s + (sd > 0 ? 0 : 18))) lamps.push([p[0], p[1], p[2], p[3] + (sd > 0 ? 0 : Math.PI)]); }
  const bot = -14;
  // piers: a pile cap at the waterline, one wide column and a hammerhead under the deck
  const spanL = b.stay ? 52 : 40, half = b.main / 2;
  for (let s = b.s - b.half + spanL * 0.6; s < b.s + b.half - spanL * 0.4; s += spanL) {
    if (!inSpan(s) || (b.main && Math.abs(s - b.s) < half + 8)) continue;
    const r = roadAtS(s, {}), top = r.y - T;
    const col = new THREE.Mesh(new THREE.BoxGeometry(2.6, top - bot, 3.6), BRIDGE.dark); col.position.set(r.x - bx, (top + bot) / 2 - by, r.z - bz); col.rotation.y = r.h; col.castShadow = true; grp.add(col);
    const hh = new THREE.Mesh(new THREE.BoxGeometry(2 * OUT - 4, 1.6, 3.2), BRIDGE.dark); hh.position.set(r.x - bx, top - 0.8 - by, r.z - bz); hh.rotation.y = r.h; grp.add(hh);
    const pc = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 6.5), BRIDGE.dark); pc.position.set(r.x - bx, -0.3 - by, r.z - bz); pc.rotation.y = r.h; grp.add(pc);
  }
  // the cable-stayed main span: two H-shaped towers, fans of stay cables to both walkway edges
  if (b.main) for (const e of [-1, 1]) {
    const ps = b.s + e * half; if (!inSpan(ps)) continue;
    const r = roadAtS(ps, {}), lx = Math.cos(r.h), lz = -Math.sin(r.h), H = 52, top = r.y + H, legL = OUT + 1.2;
    for (const sd of [1, -1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(2.2, top - bot, 3.4), BRIDGE.conc); leg.position.set(r.x + lx * sd * legL - bx, (top + bot) / 2 - by, r.z + lz * sd * legL - bz); leg.rotation.y = r.h; leg.castShadow = true; grp.add(leg);
      const lt = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); lt.position.set(r.x + lx * sd * legL - bx, top + 0.5 - by, r.z + lz * sd * legL - bz); grp.add(lt);   // aircraft warning light
    }
    for (const [y, hgt] of [[r.y - T - 1.2, 2.2], [r.y + H * 0.62, 1.8], [top - 1.2, 2.4]]) { const cb = new THREE.Mesh(new THREE.BoxGeometry(2 * legL + 2.2, hgt, 2.6), BRIDGE.conc); cb.position.set(r.x - bx, y - by, r.z - bz); cb.rotation.y = r.h; cb.castShadow = true; grp.add(cb); }
    const pc = new THREE.Mesh(new THREE.BoxGeometry(2 * legL + 8, 3.5, 10), BRIDGE.dark); pc.position.set(r.x - bx, -0.2 - by, r.z - bz); pc.rotation.y = r.h; grp.add(pc);
    const cab = [];
    for (const dir of [-1, 1]) for (let k = 0, d = 16; d < half - 4; k++, d += 11) for (const sd of [1, -1]) {
      const a = at(ps + dir * d, sd * (OUT - 0.4), 0.4), tY = top - 4 - k * 1.4;
      _v1.set(r.x + lx * sd * legL - bx, tY - by, r.z + lz * sd * legL - bz); _v2.set(a[0], a[1], a[2]); cab.push([_v1.clone(), _v2.clone()]);
    }
    const ci = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 5).translate(0, 0.5, 0), BRIDGE.cable, cab.length);
    cab.forEach(([p1, p2], k) => { const d = _v1.subVectors(p2, p1), len = d.length(); _q.setFromUnitVectors(_up, d.normalize()); _m4.compose(p1, _q, _v2.set(1, len, 1)); ci.setMatrixAt(k, _m4); });
    ci.castShadow = true; grp.add(ci);
  }
  // abutments and name plates at both ends
  for (const e of [-1, 1]) {
    const s = b.s + e * b.half; if (!inSpan(s) && !inSpan(s - e * 2)) continue;
    const r = roadAtS(s, {});
    const ab = new THREE.Mesh(new THREE.BoxGeometry(2 * OUT, 9, 3), BRIDGE.dark); ab.position.set(r.x - bx, r.y - T - 4.5 + 0.1 - by, r.z - bz); ab.rotation.y = r.h; grp.add(ab);
    const q = at(s - e * 3, IN + 0.02, 0.55), pl = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48), bridgePlateMat(b));
    pl.position.set(q[0], q[1], q[2]); pl.rotation.y = q[3] + (e < 0 ? Math.PI : 0); grp.add(pl);
  }
  for (let i = j0; i <= j1; i++) { grp.userData.rails[1].add(i); grp.userData.rails[-1].add(i); }
}
// ----- tunnels: a tiled tube with lights and two portals through a hill; or a sunken underpass with retaining walls under a cross street -----
const TUNNEL = {
  wall: new THREE.MeshStandardMaterial({ color: 0xb5ae9f, roughness: 0.7, side: THREE.DoubleSide }),
  roof: new THREE.MeshStandardMaterial({ color: 0x3b3e42, roughness: 0.9, side: THREE.DoubleSide }),
  conc: new THREE.MeshStandardMaterial({ color: 0xa8a49b, roughness: 0.9, side: THREE.DoubleSide }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
  asph: new THREE.MeshStandardMaterial({ color: 0x3a3b3d, roughness: 0.95 }),
  names: ['ขุนตาน', 'เขาพลึง', 'ดอยหลวง', 'ผาช้าง', 'เขาใหญ่', 'ห้วยแม่ขมิ้น', 'ดอยสะเก็ด', 'เขาหินซ้อน'],
};
// sweep a cross-section (list of [L, dy] pairs, L to the left) along the road samples j0..j1
function noSide(s) { if (onBridge(s)) return true; const t = tunnelNear(s, 30); return !!t && (t.kind === 'under' || (s >= t.s0 - 30 && s <= t.s1 + 30)); }
function sweep(sec, j0, j1, bx, by, bz, yOff = () => 0) {
  const pos = [], idx = [], n = sec.length;
  for (let i = j0; i <= j1; i++) {
    const h = road.h[i], lx = Math.cos(h), lz = -Math.sin(h), x = road.x[i] - bx, y = road.y[i] - by + yOff(i * SP), z = road.z[i] - bz;
    for (const [L, dy] of sec) pos.push(x + lx * L, y + dy, z + lz * L);
  }
  for (let k = 0; k < j1 - j0; k++) for (let q = 0; q < n - 1; q++) { const a = k * n + q, c = a + n; idx.push(a, c, a + 1, a + 1, c, c + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}
const TW = ROAD_HALF + 1.3;            // tube half-width at the walls
function tubeShape(off = 0) {           // the opening, for the portal: walls to 4.6 m, a flattened arch to 7.4 m
  const sh = new THREE.Path(), W = TW + off;
  sh.moveTo(-W, -0.5); sh.lineTo(-W, 4.6); sh.quadraticCurveTo(-W + 0.4, 7.4 + off, 0, 7.4 + off); sh.quadraticCurveTo(W - 0.4, 7.4 + off, W, 4.6); sh.lineTo(W, -0.5); sh.lineTo(-W, -0.5);
  return sh;
}
function buildTunnel(grp, i0, i1, bx, by, bz) {
  const t = tunnelNear(((i0 + i1) / 2) * SP) || tunnelNear(i0 * SP) || tunnelNear(i1 * SP);
  if (!t) return;
  const at = (s, L, dy) => { const r = roadAtS(s, {}), lx = Math.cos(r.h), lz = -Math.sin(r.h); return [r.x + lx * L - bx, r.y + dy - by, r.z + lz * L - bz, r.h]; };
  const inSpan = (s) => s >= i0 * SP && s < i1 * SP;
  const rails = grp.userData.rails;
  if (t.kind === 'mtn') {
    const j0 = Math.max(i0, Math.ceil(t.s0 / SP)), j1 = Math.min(i1, Math.floor(t.s1 / SP));
    if (j1 > j0) {
      // tiled walls with a kerb, dark arched ceiling
      const wallSec = (sd) => [[sd * (ROAD_HALF + 0.15), 0.02], [sd * (ROAD_HALF + 0.15), 0.3], [sd * TW, 0.3], [sd * TW, 4.6]];
      const roofSec = [[TW, 4.6], [TW - 0.6, 6.3], [TW - 2.6, 7.1], [0, 7.4], [-(TW - 2.6), 7.1], [-(TW - 0.6), 6.3], [-TW, 4.6]];
      for (const sd of [1, -1]) { const m = new THREE.Mesh(sweep(wallSec(sd), j0, j1, bx, by, bz), TUNNEL.wall); m.receiveShadow = true; grp.add(m); }
      const rf = new THREE.Mesh(sweep(roofSec, j0, j1, bx, by, bz), TUNNEL.roof); rf.castShadow = true; rf.receiveShadow = true; grp.add(rf);
      // a row of lamps along each upper wall
      const lp = [];
      for (let s = Math.ceil(j0 * SP / 6) * 6; s < j1 * SP; s += 6) for (const sd of [1, -1]) lp.push(at(s, sd * (TW - 0.45), 5.9));
      if (lp.length) { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.12, 1.2), TUNNEL.lamp, lp.length); lp.forEach((p, k) => im.setMatrixAt(k, M(p[0], p[1], p[2], 0, p[3], 0))); grp.add(im); }
      for (let i = j0; i <= j1; i++) { rails[1].add(i); rails[-1].add(i); }
    }
    // portals: a concrete face with the arch opening, standing in the hillside, and a name plate
    for (const e of [-1, 1]) {
      const s = e < 0 ? t.s0 : t.s1; if (!inSpan(s)) continue;
      const r = roadAtS(s, {}), Wd = 26, Hh = t.H + 6;
      const sh = new THREE.Shape(); sh.moveTo(-Wd, -3); sh.lineTo(Wd, -3); sh.lineTo(Wd, Hh); sh.lineTo(-Wd, Hh); sh.lineTo(-Wd, -3); sh.holes.push(tubeShape(0));
      const g = new THREE.ExtrudeGeometry(sh, { depth: 1.6, bevelEnabled: false }); g.translate(0, 0, -0.8);
      const pf = new THREE.Mesh(g, TUNNEL.conc); pf.position.set(r.x - bx, r.y - by, r.z - bz); pf.rotation.y = r.h; pf.castShadow = true; pf.receiveShadow = true; grp.add(pf);
      const rim = new THREE.Shape(); rim.moveTo(-TW - 1.2, -0.3); rim.lineTo(TW + 1.2, -0.3); rim.lineTo(TW + 1.2, 9.2); rim.lineTo(-TW - 1.2, 9.2); rim.lineTo(-TW - 1.2, -0.3); rim.holes.push(tubeShape(0));
      const rg = new THREE.ExtrudeGeometry(rim, { depth: 0.6, bevelEnabled: false }); rg.translate(0, 0, e < 0 ? 0.8 : -1.4);
      const rm = new THREE.Mesh(rg, TUNNEL.wall); rm.position.copy(pf.position); rm.rotation.y = r.h; grp.add(rm);
      const nm = TUNNEL.names[Math.floor(t.name * TUNNEL.names.length)];
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.9), plateMat(`อุโมงค์${nm}`));
      const q = at(s, 0, 8.3); pl.position.set(q[0] + Math.sin(r.h) * e * 1.1, q[1], q[2] + Math.cos(r.h) * e * 1.1); pl.rotation.y = r.h + (e < 0 ? Math.PI : 0); grp.add(pl);
    }
    return;
  }
  // ---- underpass ----
  const a = t.s0 - t.ramp, b = t.s1 + t.ramp;
  const j0 = Math.max(i0, Math.ceil(a / SP)), j1 = Math.min(i1, Math.floor(b / SP));
  if (j1 <= j0) return;
  const dip = (s) => underDip(t, s);
  // retaining walls: from the road up to 1 m above the street (a parapet), with a railing on top
  for (const sd of [1, -1]) {
    const pos = [], idx = [];
    for (let i = j0; i <= j1; i++) {
      const h = road.h[i], lx = Math.cos(h), lz = -Math.sin(h), x = road.x[i] - bx, y = road.y[i] - by, z = road.z[i] - bz, top = dip(i * SP) + 1.0;
      for (const [L, dy] of [[sd * (ROAD_HALF + 0.2), 0.02], [sd * (ROAD_HALF + 0.2), 0.3], [sd * (ROAD_HALF + 1.2), 0.3], [sd * (ROAD_HALF + 1.2), Math.max(0.9, top)], [sd * (ROAD_HALF + 1.6), Math.max(0.9, top)], [sd * (ROAD_HALF + 1.6), top - 1.2]]) pos.push(x + lx * L, y + dy, z + lz * L);
    }
    for (let k = 0; k < j1 - j0; k++) for (let q = 0; q < 5; q++) { const a2 = k * 6 + q, c = a2 + 6; idx.push(a2, c, a2 + 1, a2 + 1, c, c + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, TUNNEL.conc); m.castShadow = true; m.receiveShadow = true; grp.add(m);
  }
  for (let i = j0; i <= j1; i++) if (dip(i * SP) > 0.8) { rails[1].add(i); rails[-1].add(i); }
  // the covered part: a deck carrying the cross street, lamps underneath
  const c0 = Math.max(i0, Math.ceil(t.s0 / SP)), c1 = Math.min(i1, Math.floor(t.s1 / SP));
  if (c1 > c0) {
    const slab = new THREE.Mesh(sweep([[ROAD_HALF + 1.6, 0], [-(ROAD_HALF + 1.6), 0]], c0, c1, bx, by, bz, (s) => dip(s) - 0.9), TUNNEL.roof); slab.castShadow = true; grp.add(slab);
    const lp = [];
    for (let s = Math.ceil(c0 * SP / 5) * 5; s < c1 * SP; s += 5) for (const sd of [1, -1]) lp.push(at(s, sd * (ROAD_HALF - 0.5), dip(s) - 1.0));
    if (lp.length) { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.08, 1.0), TUNNEL.lamp, lp.length); lp.forEach((p, k) => im.setMatrixAt(k, M(p[0], p[1], p[2], 0, p[3], 0))); grp.add(im); }
  }
  // the cross street on top (asphalt with a centre line), laid across once, in the chunk that holds the middle
  const mid = (t.s0 + t.s1) / 2;
  if (inSpan(mid)) {
    const r = roadAtS(mid, {}), y = r.y + dip(mid) + 0.04;
    const st = new THREE.Mesh(new THREE.BoxGeometry(70, 0.12, t.s1 - t.s0 - 6), TUNNEL.asph); st.position.set(r.x - bx, y - by, r.z - bz); st.rotation.y = r.h; st.receiveShadow = true; grp.add(st);
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(70, 0.18), new THREE.MeshBasicMaterial({ color: 0xf2d24b })); ln.rotation.x = -Math.PI / 2; ln.position.set(r.x - bx, y + 0.07 - by, r.z - bz); ln.rotation.z = r.h; grp.add(ln);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), plateMat('ทางลอด'));
    for (const e of [-1, 1]) { const q = at(mid + e * (t.s1 - t.s0) / 2, 0, dip(mid) - 0.4); pl.clone(); const p2 = pl.clone(); p2.position.set(q[0] - Math.sin(r.h) * e * 0.05, q[1], q[2] - Math.cos(r.h) * e * 0.05); p2.rotation.y = r.h + (e < 0 ? Math.PI : 0); grp.add(p2); }
  }
}
function buildBridge(grp, i0, i1, bx, by, bz, lamps) {
  const b = bridgeNear(((i0 + i1) / 2) * SP) || bridgeNear(i0 * SP) || bridgeNear(i1 * SP);
  if (!b) return;
  if (b.sea) return buildSeaBridge(grp, b, i0, i1, bx, by, bz, lamps);
  const ia = Math.ceil((b.s - b.half) / SP), ib = Math.floor((b.s + b.half) / SP);
  const j0 = Math.max(i0, ia), j1 = Math.min(i1, ib);
  if (j1 <= j0) return;
  const T = b.big ? 1.7 : 0.75, IN = ROAD_HALF + 0.9, OUT = ROAD_HALF + 1.2, PH = b.big ? 0.65 : 0.9;
  // cross-section polyline (L, dy) for each side, swept along the road samples
  const sec = (sd) => [[0, -T], [sd * OUT, -T], [sd * OUT, PH], [sd * IN, PH], [sd * IN, 0.14]];
  const pos = [], idx = [];
  for (const sd of [1, -1]) {
    const S = sec(sd), base = pos.length / 3;
    for (let i = j0; i <= j1; i++) {
      const h = road.h[i], lx = Math.cos(h), lz = -Math.sin(h), x = road.x[i] - bx, y = road.y[i] - by, z = road.z[i] - bz;
      for (const [L, dy] of S) pos.push(x + lx * L, y + dy, z + lz * L);
    }
    const n = S.length;
    for (let k = 0; k < j1 - j0; k++) for (let q = 0; q < n - 1; q++) { const a = base + k * n + q, c = a + n; idx.push(a, c, a + 1, a + 1, c, c + 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const deck = new THREE.Mesh(g, BRIDGE.conc); deck.castShadow = true; deck.receiveShadow = true; grp.add(deck);
  const at = (s, L, dy) => { const r = roadAtS(s, {}), lx = Math.cos(r.h), lz = -Math.sin(r.h); return [r.x + lx * L - bx, r.y + dy - by, r.z + lz * L - bz, r.h]; };
  const inSpan = (s) => s >= j0 * SP && s <= j1 * SP;
  // steel rail along the top of the big bridge's barrier, posts every 2.5 m
  if (b.big) {
    const rp = [];
    for (const sd of [1, -1]) for (let s = Math.ceil(j0 * SP / 2.5) * 2.5; s <= j1 * SP; s += 2.5) rp.push(at(s, sd * (IN + 0.12), PH));
    if (rp.length) {
      const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 6).translate(0, 0.22, 0), BRIDGE.steel, rp.length);
      rp.forEach((p, k) => im.setMatrixAt(k, M(p[0], p[1], p[2], 0, p[3], 0))); grp.add(im);
      const tub = []; for (const sd of [1, -1]) for (let i = j0; i < j1; i++) { const a = at(i * SP, sd * (IN + 0.12), PH + 0.45), c = at((i + 1) * SP, sd * (IN + 0.12), PH + 0.45); tub.push(a[0], a[1], a[2], c[0], c[1], c[2]); }
      const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tub, 3)); grp.add(new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0xb8c0c4 })));
    }
    // street lamps along both sides
    for (let s = b.s - b.half + 12; s < b.s + b.half - 6; s += 30) if (inSpan(s)) for (const sd of [1, -1]) { const p = at(s, sd * (ROAD_HALF + 1.8), PH - 0.2); lamps.push([p[0], p[1], p[2], p[3] + (sd > 0 ? 0 : Math.PI)]); }
    // piers: twin columns with a cap beam, standing in the river
    const ph = new THREE.CylinderGeometry(0.75, 0.85, 1, 14).translate(0, 0.5, 0), cap = new THREE.BoxGeometry(2 * OUT - 1, 1.1, 2.2);
    for (let s = b.s - b.w + 4; s <= b.s + b.w - 4; s += 26) {
      if (!inSpan(s)) continue;
      const r = roadAtS(s, {}), top = r.y - T, bot = b.bed - 1, lx = Math.cos(r.h), lz = -Math.sin(r.h);
      for (const L of [-3.4, 3.4]) { const c = new THREE.Mesh(ph, BRIDGE.dark); c.position.set(r.x + lx * L - bx, bot - by, r.z + lz * L - bz); c.scale.y = top - bot; c.castShadow = true; grp.add(c); }
      const cb = new THREE.Mesh(cap, BRIDGE.dark); cb.position.set(r.x - bx, top - 0.55 - by, r.z - bz); cb.rotation.y = r.h; cb.castShadow = true; grp.add(cb);
    }
  }
  // abutments at both ends and striped end posts with the name plate (canal bridges)
  for (const e of [-1, 1]) {
    const s = b.s + e * b.half; if (!inSpan(s)) continue;
    const r = roadAtS(s, {});
    const ab = new THREE.Mesh(new THREE.BoxGeometry(2 * OUT, 7, 2.4), BRIDGE.dark); ab.position.set(r.x - bx, r.y - T - 3.5 + 0.1 - by, r.z - bz); ab.rotation.y = r.h; grp.add(ab);
    for (const sd of [1, -1]) {
      const p = at(s - e * 0.3, sd * (IN + 0.15), 0);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.25, 0.45).translate(0, 0.62, 0), bridgeStripeMat()); post.position.set(p[0], p[1], p[2]); post.rotation.y = p[3]; post.castShadow = true; grp.add(post);
      if (sd === 1) { // name plate facing the traffic coming onto the bridge
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.38), bridgePlateMat(b));
        const q = at(s - e * 1.6, sd * (IN + 0.02), PH * 0.55); pl.position.set(q[0], q[1], q[2]); pl.rotation.y = q[3] + (e < 0 ? Math.PI : 0); grp.add(pl);
      }
    }
  }
  // the water: a long sheet along the channel at the river's level (hidden by the banks wherever the ground is higher)
  if (inSpan(b.s) && sky?.sea) {
    const r = roadAtS(b.s, {}), lx = Math.cos(r.h), lz = -Math.sin(r.h), fx = Math.sin(r.h), fz = Math.cos(r.h), bk = b.w + b.bank + 3;
    // the sheet runs along the channel only as far as both banks stay above the water (no water hanging over a valley)
    const reach = (sd) => { let L = 0; while (L < 500) { const n = L + 10, x = r.x + lx * n * sd, z = r.z + lz * n * sd; if (Math.min(groundAt(x + fx * bk, z + fz * bk), groundAt(x - fx * bk, z - fz * bk)) < b.wl + 0.3) break; L = n; } return L; };
    const Lp = Math.max(20, reach(1)), Ln = Math.max(20, reach(-1));
    const wg = new THREE.PlaneGeometry(Lp + Ln, 2 * (b.w + b.bank) + 14).rotateX(-Math.PI / 2);
    const wm = new THREE.Mesh(wg, sky.sea.material); wm.position.set(r.x + lx * (Lp - Ln) / 2 - bx, b.wl - by, r.z + lz * (Lp - Ln) / 2 - bz); wm.rotation.y = r.h; grp.add(wm);   // long side across the road
  }
  // the parapets stop the car like a guard rail
  for (let i = j0; i <= j1; i++) { grp.userData.rails[1].add(i); grp.userData.rails[-1].add(i); }
}
function buildChunk(ci) {
  const i0 = ci * CH, i1 = i0 + CH;
  ensureS(i1 * SP + 4);
  const bx = road.x[i0], by = road.y[i0], bz = road.z[i0];
  const n = i1 - i0 + 1;
  const rp = [], ru = [], sp = [], su = [];
  const ri = [], si = [];
  for (let k = 0; k < n; k++) {
    const i = i0 + k, h = road.h[i];
    const lx = Math.cos(h), lz = -Math.sin(h);
    const x = road.x[i] - bx, y = road.y[i] - by, z = road.z[i] - bz, v = (i * SP) / 12;
    rp.push(x - lx * ROAD_HALF, y, z - lz * ROAD_HALF, x + lx * ROAD_HALF, y, z + lz * ROAD_HALF);
    ru.push(0, v, 1, v);
    su.push(0, v * 4, 0.35, v * 4, 0, v * 4, 0.35, v * 4);
    const onB = onBridge(i * SP), W2 = onB ? ROAD_HALF + 0.9 : ROAD_HALF + 1.5, yo = onB ? 0.14 : -0.6, yi = onB ? 0.14 : 0.01;
    sp.push(x - lx * ROAD_HALF, y + yi, z - lz * ROAD_HALF, x - lx * W2, y + yo, z - lz * W2,
      x + lx * ROAD_HALF, y + yi, z + lz * ROAD_HALF, x + lx * W2, y + yo, z + lz * W2);
    if (k < n - 1) {
      const a = k * 2; ri.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      const b = k * 4; si.push(b, b + 1, b + 4, b + 1, b + 5, b + 4, b + 2, b + 6, b + 3, b + 3, b + 6, b + 7);
    }
  }
  const grp = new THREE.Group(); grp.position.set(bx, by, bz);
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rg.setAttribute('uv', new THREE.Float32BufferAttribute(ru, 2));
  rg.setIndex(ri); rg.computeVertexNormals(); rg.computeBoundingSphere();
  const rm = new THREE.Mesh(rg, roadMat); rm.receiveShadow = true; grp.add(rm);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
  sg.setIndex(si); sg.computeVertexNormals(); sg.computeBoundingSphere();
  const sm = new THREE.Mesh(sg, gravelMat); sm.receiveShadow = true; grp.add(sm);
  // posts & lamps
  const posts = [], lamps = [];
  const bp = {};
  for (let i = i0; i < i1; i++) {
    const s = i * SP, h = road.h[i], lx = Math.cos(h), lz = -Math.sin(h);
    const x = road.x[i] - bx, y = road.y[i] - by, z = road.z[i] - bz;
    if (noSide(s)) continue;
    if (i % 15 === 0) for (const sd of [1, -1]) posts.push([x + lx * sd * (ROAD_HALF + 1.1), y - 0.1, z + lz * sd * (ROAD_HALF + 1.1), h]);
    if (i % 25 === 0) { blendParams(s, bp); if (bp.lamps > 0.5 && hash1(i) > 0.15) lamps.push([x + lx * (ROAD_HALF + 1.8), y - 0.2, z + lz * (ROAD_HALF + 1.8), h]); }
  }
  const inst = (geo, mat, list) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, k) => im.setMatrixAt(k, M(p[0], p[1], p[2], 0, p[3], 0)));
    im.computeBoundingSphere(); im.castShadow = mat !== reflMat && mat !== bulbMat; im.receiveShadow = true; grp.add(im); return im;
  };
  const cols = (grp.userData.cols = []), rails = (grp.userData.rails = { 1: new Set(), [-1]: new Set() });
  buildBridge(grp, i0, i1, bx, by, bz, lamps);
  buildTunnel(grp, i0, i1, bx, by, bz);
  const postIm = inst(RS.post, postMat, posts), reflIm = inst(RS.refl, reflMat, posts);
  posts.forEach((p, k) => {
    const c = { x: p[0] + bx, z: p[2] + bz, r: 0.12, kind: 'break', id: `p${ci},${k}`, parts: [{ im: postIm, k }, { im: reflIm, k }], base: [p[0], p[1], p[2], p[3], 1] };
    cols.push(c); if (broken.has(c.id)) knockDown(c, null, true);
  });
  if (lamps.length) {
    inst(RS.lamp, postMat, lamps); inst(RS.bulb, bulbMat, lamps);
    for (const p of lamps) cols.push({ x: p[0] + bx, z: p[2] + bz, r: 0.2, kind: 'solid' });
    const gp = [];
    for (const p of lamps) { const lx = Math.cos(p[3]), lz = -Math.sin(p[3]); gp.push(p[0] - lx * 2.05, p[1] + 7.55, p[2] - lz * 2.05); }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    grp.add(makePoints(gg, lampGlowMat));
  }
  // power lines on the right-hand side (rural regions)
  {
    const SPAN = 20, pp = {}, wires = [], poles = [];
    const poleAt = (i) => {
      const h = road.h[i], lx = Math.cos(h), lz = -Math.sin(h), L = -(ROAD_HALF + 6.5);
      const x = road.x[i] + lx * L, z = road.z[i] + lz * L;
      return { x, z, h, lx, lz, y: groundAt(x, z) - 0.2 };
    };
    const on = (i) => blendParams(i * SP, pp).power > 0.5;
    for (let i = Math.ceil(i0 / SPAN) * SPAN; i < i1; i += SPAN) {
      if (!on(i)) continue;
      const a = poleAt(i);
      { const bb = bridgeNear(i * SP); if (bb && a.y < bb.wl + 1) continue; }   // would stand in the river
      if (tunnelNear(i * SP, 40)) continue;
      poles.push([a.x - bx, a.y - by, a.z - bz, a.h]);
      if (!on(i + SPAN)) continue;
      ensureS((i + SPAN) * SP + 4);
      const b = poleAt(i + SPAN);
      for (const off of [-0.85, 0, 0.85]) {
        let px = 0, py = 0, pz = 0;
        for (let k = 0; k <= 10; k++) {
          const t = k / 10, sag = Math.sin(t * Math.PI) * 0.9;
          const x = lerp(a.x + a.lx * off, b.x + b.lx * off, t) - bx, y = lerp(a.y, b.y, t) + 8.75 - sag - by, z = lerp(a.z + a.lz * off, b.z + b.lz * off, t) - bz;
          if (k) wires.push(px, py, pz, x, y, z);
          px = x; py = y; pz = z;
        }
      }
    }
    if (poles.length) inst(RS.powerPole, postMat, poles);
    for (const p of poles) cols.push({ x: p[0] + bx, z: p[2] + bz, r: 0.24, kind: 'solid' });
    if (wires.length) {
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
      grp.add(new THREE.LineSegments(wg, wireMat));
    }
  }
  // warning signs before sharp curves, speed limits, and Thai-style kilometre stones
  {
    const curveAt = (i) => { ensureS((i + 70) * SP); return road.h[i + 60] - road.h[i + 15]; };
    for (let i = Math.ceil(i0 / 10) * 10; i < i1; i += 10) {
      const dh = curveAt(i);
      let sign = null;
      if (Math.abs(dh) > 0.2) {
        let prev = false;
        for (let j = i - 10; j >= Math.max(0, i - 160); j -= 10) if (Math.abs(curveAt(j)) > 0.2) { prev = true; break; }
        if (!prev) sign = dh > 0 ? 'left' : 'right';
      } else if (i % 1500 === 750) sign = 'speed';
      if (sign && noSide(i * SP)) sign = null;
      if (sign) {
        const h = road.h[i], lx = Math.cos(h), lz = -Math.sin(h), L = ROAD_HALF + 1.6;
        const g = new THREE.Group(); g.position.set(road.x[i] + lx * L - bx, road.y[i] - 0.1 - by, road.z[i] + lz * L - bz); g.rotation.y = h + Math.PI;
        const post = new THREE.Mesh(SIGN_POST, signPostMat); post.position.y = 1.1; post.castShadow = true; g.add(post);
        const plate = new THREE.Mesh(SIGN_PLATE, signMats[sign]); plate.position.set(0, 2.15, -0.04); plate.castShadow = true; g.add(plate);
        grp.add(g);
        const c = { x: g.position.x + bx, z: g.position.z + bz, r: 0.12, kind: 'break', id: `s${i}`, group: g }; cols.push(c); if (broken.has(c.id)) knockDown(c, null, true);
      }
    }
    for (let i = Math.ceil(i0 / 500) * 500; i < i1; i += 500) {
      if (i === 0 || noSide(i * SP)) continue;
      const h = road.h[i], lx = Math.cos(h), lz = -Math.sin(h), L = ROAD_HALF + 1.5;
      const g = new THREE.Group(); g.position.set(road.x[i] + lx * L - bx, road.y[i] - 0.1 - by, road.z[i] + lz * L - bz); g.rotation.y = h + Math.PI;
      const stone = new THREE.Mesh(KM_STONE, kmMat(i * SP / 1000)); stone.position.y = 0.36; stone.castShadow = true; g.add(stone);
      const top = new THREE.Mesh(KM_TOP, kmTopMat); top.position.y = 0.72; top.rotation.x = Math.PI / 2; g.add(top);
      grp.add(g);
      const c = { x: g.position.x + bx, z: g.position.z + bz, r: 0.3, kind: 'break', id: `k${i}`, group: g }; cols.push(c); if (broken.has(c.id)) knockDown(c, null, true);
    }
  }
  // town: rows of shophouses facing the road on both sides
  {
    const sp = {}, list = [];
    const B = BUILD.shophouse, D = 12;
    for (let i = Math.ceil(i0 / 10) * 10; i < i1; i += 10) {
      blendParams(i * SP, sp);
      if (sp.shops < 0.5) continue;
      for (const sd of [1, -1]) {
        if (hash2(i, sd * 7) > 0.82) continue;                      // the odd gap (side street / empty lot)
        const h = road.h[i], lx = Math.cos(h), lz = -Math.sin(h), L = sd * (ROAD_HALF + 4 + D / 2);
        const x = road.x[i] + lx * L, z = road.z[i] + lz * L;
        list.push({ x: x - bx, y: Math.min(groundAt(x, z), road.y[i] + underDip(tunnelNear(i * SP), i * SP)) - 0.15 - by, z: z - bz, ry: Math.atan2(-sd * lx, -sd * lz), c: hash2(i, sd * 3), h, sd });
      }
    }
    if (list.length) {
      const pal = [[0.96, 0.93, 0.84], [0.95, 0.86, 0.72], [0.82, 0.88, 0.92], [0.94, 0.8, 0.8], [0.86, 0.92, 0.82], [0.98, 0.97, 0.95]];
      for (const pt of B) {
        const im = new THREE.InstancedMesh(pt.geo, pt.tex ? (bldMats[pt.tex] || treeMat) : treeMat, list.length);
        list.forEach((b, k) => { im.setMatrixAt(k, M(b.x, b.y, b.z, 0, b.ry, 0)); const cc = pal[Math.floor(b.c * pal.length)]; im.setColorAt(k, _col.setRGB(cc[0], cc[1], cc[2], THREE.SRGBColorSpace)); });
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); grp.add(im);
      }
      for (const b of list) for (const off of [-5.6, 0, 5.6]) {        // three circles along the row
        const ax = Math.sin(b.h), az = Math.cos(b.h);
        cols.push({ x: b.x + bx + ax * off, z: b.z + bz + az * off, r: 6, kind: 'solid' });
      }
    }
  }
  // cat's-eye reflectors on the centre line
  const ce = [];
  for (let i = i0; i < i1; i += 6) ce.push(road.x[i] - bx, road.y[i] - by + 0.03, road.z[i] - bz);
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(ce, 3));
  grp.add(makePoints(cg, catEyeMat));
  // guard rails on the downhill side in mountain regions
  const rr = {}, rpp = {};
  for (const sd of [1, -1]) {
    const rp2 = [], ridx = [], rposts = [];
    let prev = -1;
    for (let i = i0; i <= i1; i++) {
      blendParams(i * SP, rpp);
      let on = false;
      if (rpp.rails > 0.5) {
        const h = road.h[i], lx = Math.cos(h), lz = -Math.sin(h);
        const L = sd * (ROAD_HALF + 9), x = road.x[i] + lx * L, z = road.z[i] + lz * L;
        roadAtZ(z, rr);
        on = heightCore(x, z, rr, rpp) < road.y[i] - 2.5;
      }
      if (on) {
        const h = road.h[i], lx = Math.cos(h), lz = -Math.sin(h), L = sd * (ROAD_HALF + 0.85);
        const x = road.x[i] + lx * L - bx, y = road.y[i] - by, z = road.z[i] + lz * L - bz;
        const v = rp2.length / 3;
        rp2.push(x, y + 0.5, z, x, y + 0.82, z);
        if (prev === i - 1) ridx.push(v - 2, v, v - 1, v - 1, v, v + 1);
        if (i % 2 === 0) rposts.push([x, y - 0.1, z, h]);
        grp.userData.rails[sd].add(i);
        prev = i;
      }
    }
    if (ridx.length) {
      const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(rp2, 3)); g2.setIndex(ridx); g2.computeVertexNormals();
      const m = new THREE.Mesh(g2, railMat); m.castShadow = true; m.receiveShadow = true; grp.add(m);
      inst(RS.railPost, postMat, rposts);
    }
  }
  scene.add(grp);
  return grp;
}
function updateChunks() {
  const c0 = Math.max(0, Math.floor((carS - 400) / (CH * SP))), c1 = Math.floor((carS + 1400) / (CH * SP));
  for (const [k, g] of chunks) if (k < c0 || k > c1) { disposeGroup(g); chunks.delete(k); }
  for (let c = c0; c <= c1; c++) if (!chunks.has(c)) chunks.set(c, buildChunk(c));
}

// ---------------- Player car ----------------
const PAINT = [0.98, 0.7, 0.04]; // initial paint (replaced by applyCar)
const rig = new THREE.Group(); scene.add(rig);
const interior = buildInterior(PAINT);
rig.add(interior.grp); rig.add(interior.hood);
// ----- selectable cars -----
const CARS = {
  coupe: { turbo: true, name: 'คูเป้โรตารี', sub: 'โรตารี 9,000 รอบ', paint: 0, engine: 'rotary', mass: 1300, idle: 950, redline: 9000, final: 4.1, wr: 0.32, tq: [155, 135, 6.5, 9], seat: 0, drag: 0.38, dial: 280 },
  rally: { turbo: true, name: 'คูเป้แรลลี่', sub: 'บ็อกเซอร์เทอร์โบ 4WD', engine: 'boxert', awd: true, mass: 1450, idle: 800, redline: 7000, final: 3.9, wr: 0.33, tq: [200, 255, 4.0, 3.5], seat: 0.04, drag: 0.4, paint: 5, dial: 280 },
  fastback: { name: 'คูเป้ 2+2', sub: 'บ็อกเซอร์ ขับหลัง', engine: 'boxer', mass: 1270, idle: 750, redline: 7500, final: 4.1, wr: 0.32, tq: [170, 45, 6.4, 3], seat: -0.02, drag: 0.38, paint: 1, hood: 0, dial: 260 },
  cross: { fwd: true, name: 'ครอสโอเวอร์', sub: '4 สูบ 2.0 กำลังอัดสูง', engine: 'i4hc', mass: 1380, idle: 850, redline: 6800, final: 4.3, wr: 0.35, tq: [140, 65, 4.0, 4], seat: 0.2, drag: 0.56, paint: 1, dial: 220 },
  roadster: { name: 'โรดสเตอร์', sub: '4 สูบ 2.0 กำลังอัดสูง เปิดประทุน', engine: 'i4hc', mass: 1060, idle: 850, redline: 6800, final: 4.1, wr: 0.31, tq: [140, 65, 4.0, 4], seat: -0.08, drag: 0.38, paint: 1, open: true, dial: 240 },
};
const ENGINE_TXT = { boxert: 'บ็อกเซอร์ 4 สูบ เทอร์โบ', boxer: 'บ็อกเซอร์ 4 สูบ', i4s: '4 สูบเรียง', i4hc: '4 สูบเรียง 2.0 ลิตร กำลังอัดสูง ไม่มีเทอร์โบ', i4r: '4 สูบเรียง รอบจัด', rotary: 'โรตารี 2 โรเตอร์ เทอร์โบ', i4: '4 สูบเรียง', i4t: '4 สูบเรียง เทอร์โบ', v6: 'V6', diesel: 'ดีเซล 4 สูบ เทอร์โบ', diesel6: 'ดีเซล 6 สูบเรียง' };
function carSpecHtml(c) {
  const rows = [['เครื่อง', ENGINE_TXT[c.engine] || c.engine], ['ขับเคลื่อน', c.awd ? '4 ล้อ' : c.fwd ? 'ล้อหน้า' : 'ล้อหลัง'], ['รอบสูงสุด', c.redline.toLocaleString() + ' รอบ/นาที'], ['แรงบิดสูงสุด', '~' + Math.round(c.tq[0]) + ' นิวตันเมตร'], ['น้ำหนัก', c.mass.toLocaleString() + ' กก.']];
  return rows.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join('');
}
const PAINTS = [['เหลือง', [0.98, 0.7, 0.04]], ['แดง', [0.62, 0.05, 0.06]], ['ขาว', [0.92, 0.92, 0.9]], ['ดำ', [0.05, 0.05, 0.06]], ['เงิน', [0.66, 0.68, 0.71]], ['น้ำเงิน', [0.08, 0.2, 0.55]], ['เขียว', [0.1, 0.35, 0.2]], ['ส้ม', [0.95, 0.38, 0.05]]];
const RIMS = [['เงิน', [0.72, 0.74, 0.77]], ['ทอง', [0.78, 0.6, 0.18]], ['ดำ', [0.06, 0.06, 0.07]], ['เทาเข้ม', [0.2, 0.21, 0.23]], ['ขาว', [0.9, 0.9, 0.88]], ['บรอนซ์', [0.42, 0.28, 0.14]]];
const HOODS = [['สีเดียวกับตัวรถ', null], ['เทาเข้ม', [0.11, 0.115, 0.125]], ['ดำ', [0.03, 0.03, 0.035]], ['ขาว', [0.9, 0.9, 0.88]]];
let CAR = CARS.coupe, carType = 'coupe', paintIdx = 0, rimIdx = -1, hoodIdx = 0; // rimIdx -1 = the car's own default
try { const sv = JSON.parse(localStorage.getItem('ed-car') || 'null'); if (sv && CARS[sv.t]) { carType = sv.t; CAR = CARS[sv.t]; paintIdx = sv.p | 0; rimIdx = sv.r ?? -1; hoodIdx = sv.h | 0; } } catch {}
const cabin = new THREE.Group(); rig.add(cabin); cabin.add(interior.grp); cabin.add(interior.hood);
let PC = null, extBody = null, extHood = null, extTop = null, wheels = [];
const exterior = new THREE.Group(); exterior.visible = false; rig.add(exterior);
const extMat = makeTintStdMat();
const blinkMatL = new THREE.MeshBasicMaterial({ color: 0x110800 }), blinkMatR = new THREE.MeshBasicMaterial({ color: 0x110800 });
// wheel layout of the Blender models (must match tools/cars_spec.py)
const GLBSPEC = { coupe: [0.79, 2.45, 0.32, 4.35, 1.78], rally: [0.73, 2.52, 0.32, 4.34, 1.7], fastback: [0.77, 2.575, 0.33, 4.27, 1.78], cross: [0.78, 2.655, 0.35, 4.4, 1.79], roadster: [0.75, 2.31, 0.31, 3.95, 1.73] };
const glbMats = {
  paint: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }),
  hood: new THREE.MeshPhysicalMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x0a0d10, roughness: 0.04, metalness: 0.1, clearcoat: 1, envMapIntensity: 1.4 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.35 }), // no env map: high metalness renders black
  light: new THREE.MeshStandardMaterial({ color: 0xf2f2ea, roughness: 0.1, emissive: 0x000000 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x7a0606, roughness: 0.2, emissive: 0x000000 }),
};
let glbCar = null, glbTub = null, glbGlass = [], glbMirrors = [];
// the inside of the Blender body reads as dark interior trim (door cards, pillars, headliner) from the cockpit
for (const k of ['paint', 'hood']) {
  glbMats[k].side = THREE.DoubleSide;
  glbMats[k].onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.05, 0.048, 0.046);'); };
  glbMats[k].customProgramCacheKey = () => 'inner-' + k;
  if (GPU) innerDarkGPU(glbMats[k]);
}
glbMats.glass.transparent = true; glbMats.glass.opacity = 0.38; glbMats.glass.depthWrite = false; glbMats.glass.color.set(0x1c252c); // tinted, but you can see the cabin through it
// first-person seat inside each Blender body (that model's frame): eye [y, z], windscreen base/top [zb, yb, zt, yt], side-mirror housing [x, y, z]
const seatH = 0;   // seat height offset (fixed)
const COCK = {
  coupe: { rear: false, seatDrop: 0.12, eyeX: 0.12, eye: [1.02, -0.51], ws: [0.6, 0.84, -0.05, 1.24], mir: [0.95, 0.92, 0.58] },
  rally: { rear: 'low', rearFwd: 0.15, eyeX: 0.12, eye: [1.07, -0.19], ws: [0.92, 0.93, 0.25, 1.38], mir: [0.97, 1.04, 0.78] },
  fastback: { rear: 'low', eyeX: 0.12, eye: [0.98, -0.18], ws: [0.95, 0.87, 0.1, 1.29], mir: [0.95, 0.96, 0.75] },
  cross: { rear: 'low', rearFwd: 0.1, eyeX: 0.12, eye: [1.22, -0.21], ws: [0.9, 1.06, 0.12, 1.53], mir: [0.97, 1.16, 0.72] },
  roadster: { seatDrop: 0.08, eye: [1.04, -0.08], ws: [0.77, 0.9, 0.43, 1.14], mir: [0.92, 0.92, 0.5] },
};
let smoothCabin = null;
const cockOff = new THREE.Vector3();
function setupSmoothCabin() { // smooth dashboard, cowl, console, seats and steering wheel from Blender
  if (smoothCabin || !CARGLB.cabin) return;
  smoothCabin = CARGLB.cabin.clone(true);
  smoothCabin.traverse((o) => { if (o.isMesh) { const mm = interior.mats[o.material.name]; if (mm) o.material = mm; o.castShadow = true; o.receiveShadow = true; } });
  const steer = smoothCabin.getObjectByName('steer');
  if (steer) { steer.parent.remove(steer); steer.position.set(0, 0, 0); interior.wheel.add(steer); }
  interior.grp.add(smoothCabin);
  for (const o of interior.boxy) o.visible = false;
  smoothCabin.add(carScreen);
}
// the centre screen is set into the face of the dashboard, just under its top edge (never above it, where it would block the road)
function placeCarScreen() {
  const dash = smoothCabin?.getObjectByName('dash'); if (!dash) return;
  smoothCabin.updateMatrixWorld(true);
  const toW = (v) => smoothCabin.localToWorld(v.clone()), toL = (v) => smoothCabin.worldToLocal(v.clone());
  const rc = new THREE.Raycaster();
  // top of the dash on the centre line, near its rear edge
  dash.geometry.computeBoundingBox(); const bb = dash.geometry.boundingBox.clone().applyMatrix4(dash.matrix);
  rc.set(toW(new THREE.Vector3(0, 3, bb.min.z + 0.05)), new THREE.Vector3(0, -1, 0).transformDirection(smoothCabin.matrixWorld));
  let h = rc.intersectObject(dash, false)[0]; const topY = h ? toL(h.point).y : bb.max.y;
  // the dash face toward the driver, at the screen's height
  const cy = topY - 0.03 - SCR_H / 2;
  rc.set(toW(new THREE.Vector3(0, cy, -1)), new THREE.Vector3(0, 0, 1).transformDirection(smoothCabin.matrixWorld));
  h = rc.intersectObject(dash, false)[0];
  const z = h ? toL(h.point).z : bb.min.z;
  let tilt = 0;
  if (h?.face) { const n = h.face.normal.clone().transformDirection(dash.matrixWorld).transformDirection(smoothCabin.matrixWorld.clone().invert()); tilt = Math.atan2(n.y, -n.z); }   // follow the slope of the face
  carScreen.position.set(0.02, cy, z - 0.012); carScreen.rotation.set(clamp(tilt, -0.5, 0.5), Math.PI, 0);
  carScreen.children[1].visible = false;   // no stand: it sits in the dash
}
// the centre screen that YouTube plays on (the video is an HTML player laid over this quad in perspective every frame)
const SCR_W = 0.3, SCR_H = 0.169;
const carScreen = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), new THREE.MeshBasicMaterial({ color: 0x05080c }));
carScreen.position.set(0, 0.8, 0.62); carScreen.rotation.set(-0.15, Math.PI, 0); interior.grp.add(carScreen);
{ const bz = new THREE.Mesh(new THREE.BoxGeometry(SCR_W + 0.02, SCR_H + 0.02, 0.018).translate(0, 0, -0.011), new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.5 })); carScreen.add(bz);   // bezel
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.03).translate(0, -SCR_H / 2 - 0.02, -0.025), bz.material); carScreen.add(stem); }
function applyCockpit() {
  setupSmoothCabin();
  const ck = glbCar ? COCK[carType] : null;
  for (const o of interior.shell) o.visible = !ck;
  for (const g of winGlass) g.userData.off = !!ck;
  const keep = (o) => { if (!o.userData.orig) o.userData.orig = { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }; return o.userData.orig; };
  const reset = (o) => { const or = keep(o); o.position.copy(or.p); o.quaternion.copy(or.q); o.scale.copy(or.s); };
  const seats = smoothCabin?.getObjectByName('seats'); if (seats) seats.position.y = -(ck?.seatDrop || 0);   // low roofs: seats sit lower
  const rear = smoothCabin?.getObjectByName('rear');
  if (rear) {                                                    // 2-seaters have none; a 2+2 under a fastback gets small, low ones
    rear.visible = !(ck && (CAR.open || ck.rear === false));
    const low = ck && ck.rear === 'low'; rear.scale.set(1, low ? 0.75 : 1, low ? 0.85 : 1); rear.position.set(0, low ? 0.08 : 0, (low ? 0.12 : 0) + (ck?.rearFwd || 0));
  }
  [interior.drops, ...interior.wipers, ...interior.sideMirrors.map((sm) => sm.face.parent)].forEach(keep);
  riderFit = null;   // the back-seat ghost is re-fitted under this car's roof the next time she appears
  if (!ck) {
    cockOff.set(0, CAR.seat, 0); cabin.position.copy(cockOff);
    const dash = smoothCabin?.getObjectByName('dash'); if (dash) { dash.scale.set(1, 1, 1); dash.position.set(0, 0, 0); }
    [interior.drops, ...interior.wipers].forEach(reset);
    interior.sideMirrors.forEach((sm, i) => { reset(sm.face.parent); sideMirrors[i]?.cam.position.set(sm.pos.x + sm.side * 0.04, sm.pos.y + 0.02 + CAR.seat, sm.pos.z - 0.05); });
  } else {
    cockOff.set(ck.eyeX ?? 0.05, ck.eye[0] - 1.22 + seatH, ck.eye[1] + 0.05); cabin.position.copy(cockOff);   // eyeX: the seat sits a little inboard, as in a real car; seatH: player's seat height setting
    // rain-drop sheet, glass tint and wipers lie on the model's own windscreen
    let [zb, yb, zt, yt] = ck.ws;
    if (glbGlass.length) { const bb = new THREE.Box3(); for (const g of glbGlass) { g.geometry.computeBoundingBox(); bb.union(g.geometry.boundingBox.clone().translate(g.position)); } zb = bb.max.z; yb = bb.min.y; } // the model's own windscreen base
    const B = new THREE.Vector3(0, yb, zb).sub(cockOff), Tp = new THREE.Vector3(0, yt, zt).sub(cockOff);
    const d = Tp.clone().sub(B), len = d.length(); d.normalize();
    const n = new THREE.Vector3(0, d.z, -d.y);                       // points into the cabin
    const mid = B.clone().add(Tp).multiplyScalar(0.5).addScaledVector(n, 0.015);
    interior.drops.position.copy(mid); interior.drops.lookAt(interior.drops.parent.localToWorld(mid.clone().add(n)));
    interior.drops.scale.set(1, len / 0.95, 1);
    const slope = Math.atan2(yt - yb, zb - zt);
    // stretch the dashboard so its top meets the bottom of this car's windscreen (nothing of the body shell shows in between)
    const dash = smoothCabin?.getObjectByName('dash'), cowl = smoothCabin?.getObjectByName('cowl');
    if (dash) {
      const kz = clamp((B.z + 0.04 - 0.675) / 0.475, 0.5, 1.7), ky = clamp((B.y + 0.005 - 0.575) / 0.38, 0.7, 1.5);
      dash.scale.set(1, ky, kz); dash.position.set(0, 0.575 * (1 - ky), 0.675 * (1 - kz));
      if (cowl) { cowl.position.y = 0.955 * (ky - 1); cowl.visible = false; }   // the gauge hood stood up into the view of the road (the dials are drawn on screen anyway)
    }
    interior.wipers.forEach((w) => { reset(w); w.position.y = B.y + 0.02; w.position.z = B.z + 0.03; w.rotation.x = -(Math.PI / 2 - slope); });
    // side mirrors: the reflecting face sits on the back of the model's mirror housing
    interior.sideMirrors.forEach((sm, i) => {
      let P = new THREE.Vector3(sm.side * ck.mir[0], ck.mir[1], ck.mir[2] - 0.05);
      glbCar.traverse((q) => { if (q.isMesh && /^mirror\d*$/.test(q.name) && Math.sign(q.position.x) === sm.side) P = q.position.clone().add(new THREE.Vector3(0, 0, -0.052)); }); // the model's own housing
      const gm = sm.face.parent, local = P.clone().sub(cockOff);
      // the glass is the whole back of the housing: flat against it, facing rearward and turned a little toward the driver
      gm.position.copy(local); gm.scale.set(0.85, 0.9, 1);
      for (const c of gm.children) c.visible = true;                 // its own housing sits right behind the glass (the model's is hidden in the cockpit)
      gm.lookAt(gm.parent.localToWorld(local.clone().add(new THREE.Vector3(-sm.side * 0.28, 0, -1))));
      sideMirrors[i]?.cam.position.set(P.x + sm.side * 0.04, P.y + 0.02, P.z - 0.05);
    });
  }
  if (wsPlane) { wsPlane.position.copy(interior.drops.position); wsPlane.quaternion.copy(interior.drops.quaternion); wsPlane.scale.copy(interior.drops.scale); wsPlane.visible = !ck; }
  placeCarScreen();
}
function buildExteriorGLB() {
  const sp = GLBSPEC[carType], src = CARGLB[carType], wsrc = CARGLB[carType + '_wheel'];
  glbCar = src.clone(true); extTop = null; glbTub = null; glbGlass = []; glbMirrors = [];
  glbCar.traverse((o) => {
    if (o.name === 'softtop') extTop = o;
    if (o.isMesh && o.material.name === 'seat') glbTub = o.material;
    if (o.isMesh && o.material.name === 'glass' && o.parent === glbCar) glbGlass.push(o);
    if (o.isMesh && /^mirror/.test(o.name)) glbMirrors.push(o);
    if (o.isMesh && /^(indicator|rind)/.test(o.name)) { o.material = o.position.x > 0 ? blinkMatL : blinkMatR; return; }   // the model's own amber lamps blink
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const n = o.material.name; if (n === 'glass') o.userData.glass = true;
    if (glbMats[n]) o.material = glbMats[n];
    else if (n === 'trim' || n === 'cloth' || n === 'seat') o.material.side = THREE.DoubleSide; // wheel-well liners are open tubes
    if (o.material.metalness > 0.4) o.material.metalness = 0.4;
  });
  exterior.add(glbCar);
  buildGlassDrops();
  const [tr, wb, r] = sp;
  wheels = [[tr, wb / 2], [-tr, wb / 2], [tr, -wb / 2], [-tr, -wb / 2]].map(([x, z], i) => {
    const piv = new THREE.Group(); piv.position.set(x, r, z);
    const w = new THREE.Group(), wm = wsrc.clone(true);
    wm.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (glbMats[o.material.name]) o.material = glbMats[o.material.name]; } });
    w.add(wm); piv.add(w); exterior.add(piv);
    return { piv, w, front: i < 2 };
  });
}
// the back-seat passenger must sit under the roof: find the roof above her seat and shrink / lower her to fit
let riderFit = null, riderAdj = { dz: 0, s: 1, dy: 0 }, riderG = null;
const _rc = new THREE.Raycaster();
function fitRider() {
  const R = haunt.rider;
  if (!riderG) { const b = R.children[0]; if (!b?.isMesh) return; riderG = new THREE.Group(); R.remove(b); riderG.add(b); R.add(riderG); }
  if (riderFit !== carType) {
    riderFit = carType; riderAdj = { dz: 0, s: 1, dy: 0 };
    if (glbCar && COCK[carType]) {
      const b = riderG.children[0];
      scene.updateMatrixWorld(true);
      const meshes = []; glbCar.traverse((o) => { if (o.isMesh && o !== glassDrops && !/^(mirror|wheel)/.test(o.name)) meshes.push(o); });
      const roomAt = (z) => {                                                  // seat-to-roof height (minus 7 cm) at this spot
        const top = cabin.localToWorld(new THREE.Vector3(0.32, 4, z)), base = cabin.localToWorld(new THREE.Vector3(0.32, b.position.y, z));
        _rc.set(top, new THREE.Vector3(0, -1, 0)); _rc.far = 6;
        const hit = _rc.intersectObjects(meshes, false).find((h) => h.point.y > base.y + 0.3);
        return hit ? hit.point.y - 0.07 - base.y : 9;
      };
      const h = 1.05; let best = { z: -1.1, room: roomAt(-1.1) };
      for (const z of [-1.0, -0.9, -0.8]) { if (best.room >= 0.8) break; const r = roomAt(z); if (r > best.room) best = { z, room: r }; }   // coupes: the rear glass slopes down over the back seat, so she sits further forward
      riderAdj.dz = best.z + 1.1;
      if (best.room < h) {                                                     // sink her into the cushion first (up to 15 cm), then shrink what is left
        riderAdj.dy = -Math.min(0.15, h - best.room); const room = best.room - riderAdj.dy;
        riderAdj.s = Math.max(0.6, Math.min(1, room / h)); if (room / h < 0.6) riderAdj.dy -= 0.6 * h - room;
      }
    }
  }
  const rear = R.position.z < -0.85;                                         // only the back seat needs it; up front there is room
  riderG.position.set(0, rear ? riderAdj.dy : 0, rear ? riderAdj.dz : 0); riderG.scale.setScalar(rear ? riderAdj.s : 1);
}
// rain drops drawn on the model's own windscreen triangles only, so they never spill onto the roof lining, pillars or dashboard
let glassDrops = null;
function buildGlassDrops() {
  glassDrops = null;
  glbCar.updateMatrixWorld(true);
  const inv = glbCar.matrixWorld.clone().invert(), pos = [], uv = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const tris = [];
  glbCar.traverse((o) => {
    if (!o.isMesh || !o.userData.glass) return;
    const m = inv.clone().multiply(o.matrixWorld), g = o.geometry, P = g.attributes.position, I = g.index;
    const cnt = I ? I.count : P.count, at = (k) => (I ? I.getX(k) : k);
    for (let k = 0; k < cnt; k += 3) {
      a.fromBufferAttribute(P, at(k)).applyMatrix4(m); b.fromBufferAttribute(P, at(k + 1)).applyMatrix4(m); c.fromBufferAttribute(P, at(k + 2)).applyMatrix4(m);
      n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
      if (n.z > 0.3 && n.y > -0.2 && Math.abs(n.x) < 0.5) tris.push([a.clone(), b.clone(), c.clone(), n.clone()]);   // forward-facing glass = windscreen
    }
  });
  if (!tris.length) return;
  let y0 = Infinity, y1 = -Infinity; for (const t of tris) for (let q = 0; q < 3; q++) { y0 = Math.min(y0, t[q].y); y1 = Math.max(y1, t[q].y); }
  for (const t of tris) for (let q = 0; q < 3; q++) {
    const p = t[q].clone().addScaledVector(t[3], -0.045);           // just inside the glass (and inside a thick roadster screen)
    pos.push(p.x, p.y, p.z); uv.push(p.x / 1.5 + 0.5, (p.y - y0) / Math.max(0.2, y1 - y0));
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  glassDrops = new THREE.Mesh(geo, interior.drops.material.clone()); glassDrops.material.side = THREE.DoubleSide;
  glassDrops.renderOrder = 3; glassDrops.visible = false; glassDrops.castShadow = false; glassDrops.name = 'glassDrops';
  glbCar.add(glassDrops);
}
function buildExterior() {
  if (glbCar) { exterior.remove(glbCar); glbCar = null; }
  for (const o of [...exterior.children]) { exterior.remove(o); o.traverse((q) => { if (q.isMesh && q.geometry && q !== extBody) q.geometry.dispose?.(); }); }
  if (extBody) { extBody.geometry.dispose(); extBody.dispose(); }
  if (extHood) { extHood.geometry.dispose(); extHood.dispose(); extHood = null; }
  PC = buildPlayerCar(carType, rimIdx >= 0 ? RIMS[rimIdx][1] : null);
  if (CARGLB[carType] && CARGLB[carType + '_wheel']) { // smooth Blender model
    const sp = GLBSPEC[carType]; PC = { ...PC, r: sp[2], L: sp[3], W: sp[4], hood: null, softTop: null };
    extTop = null; buildExteriorGLB(); extBody = null; return;   // blinkers are the model's amber lamps
  }
  if (extTop) { extTop.geometry.dispose(); extTop = null; }
  if (PC.softTop) { extTop = new THREE.Mesh(PC.softTop, vehMatPlain); extTop.castShadow = true; extTop.receiveShadow = true; exterior.add(extTop); }
  if (PC.hood) { extHood = new THREE.InstancedMesh(PC.hood, extMat, 1); extHood.setMatrixAt(0, new THREE.Matrix4()); extHood.castShadow = true; exterior.add(extHood); }
  extBody = new THREE.InstancedMesh(PC.body, extMat, 1);
  extBody.setMatrixAt(0, new THREE.Matrix4()); extBody.castShadow = true; extBody.receiveShadow = true; exterior.add(extBody);
  wheels = PC.wheelPos.map(([x, z], i) => {
    const piv = new THREE.Group(); piv.position.set(x, PC.r, z);
    const w = new THREE.Mesh(PC.wheel, vehMatPlain); w.castShadow = true; piv.add(w); exterior.add(piv);
    return { piv, w, front: i < 2 };
  });
  addBlinkers();
}
function addBlinkers() {
  const hl = PC.L / 2, hw = PC.W / 2, yb = carType === 'truck' ? 0.85 : carType === 'coupe' ? 0.45 : 0.62;
  for (const [x, z, y] of [[hw - 0.18, hl, yb], [hw - 0.12, -hl, yb + 0.25], [-hw + 0.18, hl, yb], [-hw + 0.12, -hl, yb + 0.25]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.04), x > 0 ? blinkMatL : blinkMatR); b.position.set(x, y, z + Math.sign(z) * 0.04); exterior.add(b);
  }
}
// newCar: picking a different model resets paint / wheels / hood to that model's own look
function applyCar(type, pIdx, announce, newCar = false) {
  if (newCar && type !== carType) { pIdx = CARS[type].paint ?? pIdx; rimIdx = -1; hoodIdx = CARS[type].hood || 0; }
  carType = type; CAR = CARS[type]; paintIdx = pIdx;
  buildExterior();
  const col = C(...PAINTS[paintIdx][1]);
  if (extBody) { extBody.setColorAt(0, col); extBody.instanceColor.needsUpdate = true; }
  interior.paintM.color.copy(col);
  const hc = HOODS[hoodIdx][1] ? C(...HOODS[hoodIdx][1]) : col;
  interior.hoodM.color.copy(hc);
  if (extHood) { extHood.setColorAt(0, hc); extHood.instanceColor.needsUpdate = true; }
  glbMats.paint.color.copy(col); glbMats.hood.color.copy(hc);
  { const rc = rimIdx >= 0 ? RIMS[rimIdx][1] : playerCarDefaults(type).rim || [0.72, 0.74, 0.77]; glbMats.rim.color.setRGB(rc[0], rc[1], rc[2], THREE.SRGBColorSpace); }
  applyTopState();
  shadowProxy.scale.set(PC.W / 1.8, 1 + CAR.seat * 0.9, PC.L / 4.3);
  mirrorCam.position.set(0, 1.45 + CAR.seat, -PC.L / 2 - 0.1);
  headL.position.set(0, 0.8 + CAR.seat * 0.5, PC.L / 2); headL2.position.copy(headL.position);
  applyCockpit();
  car.rpm = CAR.idle;
  audio.setProfile(CAR.engine, CAR.redline);
  try { localStorage.setItem('ed-car', JSON.stringify({ t: type, p: pIdx, r: rimIdx, h: hoodIdx })); } catch {}
  document.querySelectorAll('[data-car]').forEach((e) => e.classList.toggle('active', e.dataset.car === type));
  document.querySelectorAll('[data-paint]').forEach((e) => e.classList.toggle('active', +e.dataset.paint === pIdx));
  const defRim = RIMS.findIndex((r) => r[1].join() === (playerCarDefaults(type).rim || []).join());
  document.querySelectorAll('[data-st]').forEach((el) => el.addEventListener('click', () => setStation(+el.dataset.st)));
document.querySelectorAll('[data-wx]').forEach((el) => el.addEventListener('click', () => setWeather(el.dataset.wx)));
document.querySelectorAll('[data-tod]').forEach((el) => el.addEventListener('click', () => setTod(el.dataset.tod)));
document.querySelectorAll('[data-rim]').forEach((e) => e.classList.toggle('active', +e.dataset.rim === (rimIdx >= 0 ? rimIdx : defRim)));
  document.querySelectorAll('[data-ghost]').forEach((el) => el.addEventListener('click', () => tryGhosts(el.dataset.ghost)));
document.querySelectorAll('[data-hood]').forEach((e) => e.classList.toggle('active', +e.dataset.hood === hoodIdx));
  $('hoodRow').style.display = PC.hood || (glbCar && carType === 'fastback') ? '' : 'none';
  hud.val('car', CAR.name);
  $('gName').textContent = CAR.name; $('gSpec').innerHTML = carSpecHtml(CAR);
  if (announce) toast(`${CAR.name} สี${PAINTS[pIdx][0]}`);
}
const arrowShape = (dir) => { const sh = new THREE.Shape(); sh.moveTo(dir * 0.03, 0); sh.lineTo(0, 0.022); sh.lineTo(0, 0.009); sh.lineTo(-dir * 0.025, 0.009); sh.lineTo(-dir * 0.025, -0.009); sh.lineTo(0, -0.009); sh.lineTo(0, -0.022); sh.closePath(); return new THREE.ShapeGeometry(sh); };
const dashL = new THREE.MeshBasicMaterial({ color: 0x001000 }), dashR = new THREE.MeshBasicMaterial({ color: 0x001000 });
{ // little green arrows on the instrument binnacle (as seen from the driver: +x is left)
  const al = new THREE.Mesh(arrowShape(1), dashL); al.position.set(-0.29, 0.955, 0.655); al.rotation.set(-0.25, Math.PI, 0); interior.grp.add(al);
  const ar = new THREE.Mesh(arrowShape(-1), dashR); ar.position.set(-0.45, 0.955, 0.655); ar.rotation.set(-0.25, Math.PI, 0); interior.grp.add(ar);
}
// invisible proxy so the car still casts a shadow (with open windows) while we sit inside
const shadowProxy = new THREE.Mesh(buildCarShadowGeo(), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
shadowProxy.castShadow = true; rig.add(shadowProxy);
// side window glass (cockpit): slides down when the windows are opened
const winGlass = []; let wsPlane = null;
{
  // one glass material for the windscreen and the door windows so they read the same
  const gm = new THREE.MeshBasicMaterial({ color: 0xb4c4d0, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.95), gm); // windscreen, same plane as the rain drops
  ws.position.copy(interior.drops.position); ws.quaternion.copy(interior.drops.quaternion); ws.renderOrder = 2; interior.grp.add(ws); wsPlane = ws;
  for (const s of [1, -1]) {
    const sh = new THREE.Shape(); sh.moveTo(1.0, 0.0); sh.lineTo(0.34, 0.56); sh.lineTo(-0.5, 0.58); sh.lineTo(-0.5, 0.0); sh.closePath();
    const g = new THREE.ShapeGeometry(sh); g.rotateY(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, gm); mesh.position.set(s * 0.81, 0.93, 0); mesh.renderOrder = 2;
    interior.grp.add(mesh); winGlass.push(mesh);
  }
}
const head = new THREE.Group(); cabin.add(head); head.add(camera);
rig.add(mirrorCam); mirrorCam.position.set(0, 1.45, -2.4);
// working side mirrors: each renders the view behind into a small texture shown (flipped) on the mirror face
const sideMirrors = interior.sideMirrors.map((sm) => {
  const rt = new RenderTargetC(isTouch ? 224 : 320, isTouch ? 130 : 186, { samples: isTouch ? 0 : (GPU ? 4 : 2) });   // WebGPU: MSAA is 1 or 4 samples
  rt.texture.repeat.x = -1; rt.texture.offset.x = 1; rt.texture.wrapS = THREE.RepeatWrapping;
  const cam = new THREE.PerspectiveCamera(24, 0.225 / 0.13, 0.3, 6000); // must reach the 4500 m sky dome
  cam.position.set(sm.pos.x + sm.side * 0.04, sm.pos.y + 0.02, sm.pos.z - 0.05);
  cam.rotation.set(-0.035, -sm.side * 0.2, 0, 'YXZ'); // look back, a little outward
  rig.add(cam);
  return { ...sm, rt, cam, staticColor: sm.face.material.color.clone() };
});
const headL = new THREE.SpotLight(0xfff3dd, 0, 170, 0.5, 0.55, 1.2);
headL.position.set(0, 0.8, 2.3); rig.add(headL); rig.add(headL.target); headL.target.position.set(0, -1.5, 30);
const headL2 = new THREE.SpotLight(0xfff3dd, 0, 60, 0.95, 0.8, 1.5);
headL2.position.set(0, 0.8, 2.3); rig.add(headL2); rig.add(headL2.target); headL2.target.position.set(0, -2, 10);

const GEARS = [-3.4, 0, 3.6, 2.15, 1.45, 1.1, 0.88, 0.72]; // R N 1..6
// per-car engine/drivetrain values (see CARS)
const CV = { get FINAL() { return CAR.final; }, get WR() { return CAR.wr; }, get MASS() { return CAR.mass; }, get IDLE() { return CAR.idle; }, get REDLINE() { return CAR.redline; } };
const car = {
  x: 0, z: 0, y: 0, yaw: 0, pitch: 0, roll: 0, v: 0, steer: 0, gear: 2, auto: true, rpm: CV.IDLE,
  shiftT: 0, revTimer: 0, odo: 0, boost: 0, shake: 0, offroad: 0, throttle: 0, brake: 0,
  blink: 0, blinkT: 0, blinkOn: false, blinkArmed: false, // blink: 0 off, 1 left, -1 right, 2 hazard
};
let carS = 0, carL = 0;
function placeCar(s) {
  const r = roadAtS(s, {});
  car.x = r.x + Math.cos(r.h) * 2.0; car.z = r.z - Math.sin(r.h) * 2.0; car.y = r.y; car.yaw = r.h;
  carS = s;
}
const torque = (rpm) => { const x = rpm / 1000, t = CAR.tq; return t[0] + t[1] * Math.exp(-((x - t[2]) ** 2) / t[3]) - (CAR.engine === 'rotary' && x < 2.5 ? (2.5 - x) * 18 : 0); };
function gearName() {
  if (car.gear === 0) return 'R';
  if (car.gear === 1) return 'N';
  return (car.auto ? 'D' : '') + (car.gear - 1);
}
function shift(d) {
  if (car.auto) return;
  let g = car.gear + d;
  if (g < 0 || g > 7) return;
  if (g === 0 && car.v > 1) return toast('หยุดรถก่อนเข้าเกียร์ถอย');
  if (g >= 2 && car.v < -1) return;
  if (g >= 2) {
    const r = Math.abs(car.v) / CV.WR * 60 / (2 * Math.PI) * GEARS[g] * CV.FINAL;
    if (r > CV.REDLINE + 400) return toast('รอบสูงเกินไป — ลดความเร็วก่อนลดเกียร์');
  }
  car.gear = g; car.shiftT = 0.22; audio.click();
}

// ---------------- Traffic ----------------
const MAXT = 12;
const traffic = [];
const vehMat = makeTintStdMat();
const TMASS = { sedan: 1400, hatch: 1150, pickup: 1950, suv: 2050, van: 2150, truck: 7500 };
const TTYPES = [['sedan', 3], ['hatch', 2], ['pickup', 3], ['suv', 2], ['van', 1], ['truck', 1]];
const tMeshes = {};
for (const [type] of TTYPES) {
  const im = new THREE.InstancedMesh(buildVehicleGeo(type), vehMat, MAXT);
  im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
  for (let i = 0; i < MAXT; i++) im.setColorAt(i, C(1, 1, 1));
  scene.add(im); tMeshes[type] = im;
}
const TCOLS = [[0.92, 0.92, 0.92], [0.92, 0.92, 0.92], [0.06, 0.06, 0.07], [0.66, 0.68, 0.71], [0.66, 0.68, 0.71], [0.13, 0.25, 0.55], [0.55, 0.06, 0.07], [0.85, 0.65, 0.15], [0.18, 0.38, 0.28], [0.35, 0.35, 0.38], [0.5, 0.42, 0.32]];
const tGlowGeo = new THREE.BufferGeometry();
tGlowGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAXT * 4 * 3), 3));
tGlowGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(MAXT * 4 * 3), 3));
const tGlowMat = pointsMat({ map: glowTex, size: 2.2, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
const tGlow = makePoints(tGlowGeo, tGlowMat); tGlow.frustumCulled = false; scene.add(tGlow);
let spawnT = 0;
function spawnCar(s, dir) {
  if (traffic.length >= MAXT) return;
  for (const t of traffic) if (t.dir === dir && Math.abs(t.s - s) < 45) return;
  let tot = 0; for (const t of TTYPES) tot += t[1];
  let r = Math.random() * tot, type = 'sedan';
  for (const t of TTYPES) { if ((r -= t[1]) <= 0) { type = t[0]; break; } }
  const slow = type === 'truck' ? 0.75 : 1;
  const v = (dir < 0 ? 17 + Math.random() * 9 : 15 + Math.random() * 5) * slow;
  traffic.push({ s, dir, type, v, want: v, lat: 0, latT: 0, wait: 0, col: TCOLS[Math.floor(Math.random() * TCOLS.length)] });
}
const _tr = {}, _tr2 = {}, _tm = new THREE.Matrix4(), _tq = new THREE.Quaternion(), _te = new THREE.Euler(), _tv = new THREE.Vector3(), _ts = new THREE.Vector3(1, 1, 1);
let leadGap = 1e9, leadV = 0; // nearest same-direction car ahead in our lane (for autopilot)
// ----- traffic driving: keep a gap, stop for wrecks / a stopped player, overtake when the other lane is free -----
const laneOf = (t) => (t.dir < 0 ? -1.9 : 1.9) + (t.lat || 0);
function aheadOf(t, lane, range) { // nearest thing in front of t inside the lane band at 'lane'
  let best = null, bg = range;
  for (const o of traffic) {
    if (o === t || Math.abs(laneOf(o) - lane) > 2.3) continue;
    const d = (o.s - t.s) * t.dir - (VEHICLES[o.type].L + VEHICLES[t.type].L) / 2;
    if (d > -1 && d < bg) { bg = d; best = { gap: d, v: o.dir * o.v * t.dir, o }; }
  }
  if (Math.abs(carL - lane) < 2.3) {
    const d = (carS - t.s) * t.dir - (VEHICLES[t.type].L / 2 + 2.2);
    if (d > -1 && d < bg) { bg = d; best = { gap: d, v: car.v * t.dir, o: null }; }
  }
  return best;
}
function laneFree(t, lane, back, front) { // nothing in that lane from 'back' metres behind to 'front' metres ahead (oncoming counted early)
  for (const o of traffic) {
    if (o === t || Math.abs(laneOf(o) - lane) > 2.3) continue;
    const d = (o.s - t.s) * t.dir, closing = o.dir !== t.dir ? o.v * 6 : 0;
    if (d > -back && d < front + closing) return false;
  }
  if (Math.abs(carL - lane) < 2.3) { const d = (carS - t.s) * t.dir; if (d > -back && d < front + Math.max(0, -car.v * t.dir) * 6) return false; }
  return true;
}
function trafficDrive(t, dt) {
  if (t.crashed) { t.v -= Math.sign(t.v) * Math.min(Math.abs(t.v), 7 * dt); t.latV = 0; return; } // wrecked: skids to a stop
  const home = t.dir < 0 ? -1.9 : 1.9, lane = laneOf(t);
  const a = aheadOf(t, lane, 140);
  let target = t.want;
  if (a) target = Math.min(target, Math.max(0, a.v) + Math.max(0, a.gap - 7) * 0.45);
  if (a && a.gap < 4) target = 0;
  // overtaking: blocked by something stopped -> wait a moment, then use the other lane if it is clear
  const blocked = a && a.v < 2.5 && a.gap < 25;
  t.wait = blocked && t.v < 3 ? t.wait + dt : 0;
  if (!t.latT && t.wait > 1.2 && laneFree(t, -home, 12, 70)) { t.latT = -2 * home; t.pass = a.o; }
  if (t.latT) {
    target = Math.min(t.want, 11);
    const passed = t.pass ? (t.s - t.pass.s) * t.dir > VEHICLES[t.pass.type].L + 6 : (t.s - carS) * t.dir > 9;
    if (passed && laneFree(t, home, 6, 12)) { t.latT = 0; t.pass = null; }
  }
  // speed: gentle acceleration, firm braking
  const dv = target - t.v;
  t.v += dv > 0 ? Math.min(dv, 2.2 * dt) : Math.max(dv, -8 * dt);
  // steer toward the lateral target
  const want = t.latT - t.lat, latV = clamp(want * 1.2, -1.6, 1.6);
  t.lat += latV * dt; t.latV = latV;
}
function updateTraffic(dt) {
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnT = 3 + Math.random() * 8;
    if (haunt.fx.traffic < 0.9) spawnT = 1; else
    if (Math.random() < 0.75) spawnCar(carS + 900 + Math.random() * 300, -1);
    else spawnCar(carS + 600 + Math.random() * 300, 1);
  }
  const pos = tGlowGeo.attributes.position.array, col = tGlowGeo.attributes.color.array;
  for (const t of traffic) trafficDrive(t, dt);
  for (let i = traffic.length - 1; i >= 0; i--) {
    const t = traffic[i];
    t.s += t.dir * t.v * dt;
    if (t.s < carS - 250 || t.s > carS + 1500) traffic.splice(i, 1);
    else if (haunt.fx.traffic < 0.6 && Math.abs(t.s - carS) > 70) traffic.splice(i, 1); // the road empties when the haunting starts (out of sight in the mist)
  }
  const counts = {}; for (const k in tMeshes) counts[k] = 0;
  let n = 0; leadGap = 1e9;
  for (const t of traffic) {
    const V = VEHICLES[t.type];
    const r = roadAtS(t.s, _tr);
    const L = laneOf(t);
    const lx = Math.cos(r.h), lz = -Math.sin(r.h);
    const x = r.x + lx * L, z = r.z + lz * L, yaw = (t.dir < 0 ? r.h + Math.PI : r.h) + (t.rot || 0) - Math.atan2(t.latV || 0, Math.max(3, Math.abs(t.v))) * t.dir;
    const r2 = roadAtS(t.s + 2, _tr2);
    const pitch = -Math.atan2(r2.y - r.y, 2) * t.dir;
    _tq.setFromEuler(_te.set(pitch, yaw, 0, 'YXZ'));
    _tm.compose(_tv.set(x, r.y, z), _tq, _ts);
    const im = tMeshes[t.type], k = counts[t.type]++;
    im.setMatrixAt(k, _tm);
    im.setColorAt(k, _col.setRGB(t.col[0], t.col[1], t.col[2], THREE.SRGBColorSpace));
    const fx = Math.sin(yaw), fz = Math.cos(yaw), sx = Math.cos(yaw), sz = -Math.sin(yaw);
    const hx = V.w / 2 - 0.32, hz = V.L / 2 + 0.06, hy = t.type === 'truck' ? 0.85 : t.type === 'suv' || t.type === 'van' || t.type === 'pickup' ? 0.82 : 0.7;
    const pts = [[hx, hy, hz, 1, 0.95, 0.8], [-hx, hy, hz, 1, 0.95, 0.8], [hx + 0.05, hy + 0.08, -hz, 0.9, 0.05, 0.03], [-hx - 0.05, hy + 0.08, -hz, 0.9, 0.05, 0.03]];
    for (let q = 0; q < 4; q++) {
      const p = pts[q], o = (n * 4 + q) * 3;
      pos[o] = x + sx * p[0] + fx * p[2]; pos[o + 1] = r.y + p[1]; pos[o + 2] = z + sz * p[0] + fz * p[2];
      col[o] = p[3]; col[o + 1] = p[4]; col[o + 2] = p[5];
    }
    const ds = t.s - carS, dl = L - carL;
    if (t.dir > 0 && ds > 0 && Math.abs(dl) < 2.5 && ds < leadGap) { leadGap = ds - V.L / 2 - 2.3; leadV = t.v; }
    // collision with player: momentum along the road, so the heavier / faster car wins
    const reach = V.L / 2 + 2.2;
    if (Math.abs(ds) < reach && Math.abs(dl) < (V.w + 1.8) / 2) {
      const u1 = car.v, u2 = t.dir * t.v, rel = u1 - u2;             // both along +s
      if (rel * Math.sign(ds || 1) > 0.3) {                          // closing in
        const m1 = CV.MASS, m2 = TMASS[t.type], e = 0.1;
        const p = m1 * u1 + m2 * u2;
        car.v = (p + m2 * e * (u2 - u1)) / (m1 + m2);
        const v2 = (p + m1 * e * (u1 - u2)) / (m1 + m2);
        t.v = v2 * t.dir; t.crashed = true;                          // negative = pushed backwards
        t.rot = (t.rot || 0) + clamp(Math.abs(rel) / 25, 0, 1) * (dl > 0 ? -1 : 1) * (0.25 + Math.random() * 0.35) * (m1 / (m1 + m2)) * 2;
        const hit = clamp(Math.abs(rel) / 20, 0.2, 1);
        car.shake = hit; audio.crash(hit);
        toast(t.dir < 0 ? 'ชน! ระวังรถสวนทาง' : 'ชนท้าย! เว้นระยะห่างด้วย');
      }
      t.s = carS + Math.sign(ds || 1) * reach;                        // never overlap
    }
    n++;
  }
  for (const k in tMeshes) {
    const im = tMeshes[k]; im.count = counts[k];
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }
  tGlowGeo.setDrawRange(0, n * 4);
  tGlowGeo.attributes.position.needsUpdate = true; tGlowGeo.attributes.color.needsUpdate = true;
}

// ---------------- Weather particles ----------------
const PN = 6000, PBOX = [50, 30, 50];
const pGeo = new THREE.BufferGeometry();
const pArr = new Float32Array(PN * 3);
for (let i = 0; i < PN; i++) { pArr[i * 3] = (Math.random() - 0.5) * PBOX[0]; pArr[i * 3 + 1] = (Math.random() - 0.5) * PBOX[1]; pArr[i * 3 + 2] = (Math.random() - 0.5) * PBOX[2]; }
pGeo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
const pMat = pointsMat({ map: glowTex, size: 0.14, transparent: true, depthWrite: false, color: 0xffffff });
const pts = makePoints(pGeo, pMat); pts.frustumCulled = false; scene.add(pts);
const RN = 1400;
const rGeo = new THREE.BufferGeometry();
const rArr = new Float32Array(RN * 6), rBase = new Float32Array(RN * 3);
for (let i = 0; i < RN; i++) { rBase[i * 3] = (Math.random() - 0.5) * 60; rBase[i * 3 + 1] = (Math.random() - 0.5) * 30; rBase[i * 3 + 2] = (Math.random() - 0.5) * 60; }
rGeo.setAttribute('position', new THREE.BufferAttribute(rArr, 3));
const rMat = new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.45 });
const rain = new THREE.LineSegments(rGeo, rMat); rain.frustumCulled = false; scene.add(rain);
const lastCam = new THREE.Vector3();
const camWorld = new THREE.Vector3();
const W = { rain: 0, snow: 0, petals: 0, leaves: 0, clear: 0 };
function wrap(v, s) { return ((v + s / 2) % s + s) % s - s / 2; }
function updateParticles(dt, t) {
  const dx = camWorld.x - lastCam.x, dy = camWorld.y - lastCam.y, dz = camWorld.z - lastCam.z;
  lastCam.copy(camWorld);
  const big = Math.abs(dx) + Math.abs(dz) > 50;
  let type = 'snow', amt = W.snow;
  if (W.petals > amt) { type = 'petals'; amt = W.petals; }
  if (W.leaves > amt) { type = 'leaves'; amt = W.leaves; }
  pts.visible = amt > 0.02;
  if (pts.visible) {
    const gust = type === 'snow' ? wxCur.wind : 0; // blizzard: faster, sideways snow
    const fall = type === 'snow' ? 1.6 + gust * 2.4 : type === 'petals' ? 1.0 : 1.8;
    pMat.size = type === 'snow' ? 0.17 + gust * 0.13 : type === 'petals' ? 0.11 : 0.17;
    const cc = type === 'snow' ? [1, 1, 1] : type === 'petals' ? [1, 0.7, 0.82] : [0.95, 0.5, 0.15];
    const lv = 0.25 + 0.75 * dayAmt;
    pMat.color.setRGB(cc[0] * lv, cc[1] * lv, cc[2] * lv, THREE.SRGBColorSpace);
    const count = Math.floor(PN * clamp(amt, 0, 1) * (type === 'snow' ? 1 : 0.35));
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      const sw = Math.sin(t * 1.3 + i) * (type === 'snow' ? 0.4 + gust * 1.5 : 1.4) + gust * 7;
      pArr[o] = wrap(pArr[o] - (big ? 0 : dx) + sw * dt, PBOX[0]);
      pArr[o + 1] = wrap(pArr[o + 1] - (big ? 0 : dy) - fall * dt, PBOX[1]);
      pArr[o + 2] = wrap(pArr[o + 2] - (big ? 0 : dz) + Math.cos(t + i * 0.7) * 0.5 * dt, PBOX[2]);
    }
    pGeo.setDrawRange(0, count); pGeo.attributes.position.needsUpdate = true;
    pts.position.copy(camWorld);
  }
  rain.visible = W.rain > 0.02;
  if (rain.visible) {
    const count = Math.floor(RN * clamp(W.rain, 0, 1));
    const vx = Math.sin(car.yaw) * car.v * 0.03, vz = Math.cos(car.yaw) * car.v * 0.03;
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      rBase[o] = wrap(rBase[o] - (big ? 0 : dx), 60);
      rBase[o + 1] = wrap(rBase[o + 1] - (big ? 0 : dy) - 22 * dt, 30);
      rBase[o + 2] = wrap(rBase[o + 2] - (big ? 0 : dz), 60);
      const p = i * 6;
      rArr[p] = rBase[o]; rArr[p + 1] = rBase[o + 1]; rArr[p + 2] = rBase[o + 2];
      rArr[p + 3] = rBase[o] + vx; rArr[p + 4] = rBase[o + 1] - 0.7; rArr[p + 5] = rBase[o + 2] + vz;
    }
    rGeo.setDrawRange(0, count * 2); rGeo.attributes.position.needsUpdate = true;
    rain.position.copy(camWorld);
    rMat.opacity = 0.18 + 0.3 * dayAmt;
  }
}

// ---------------- State / settings ----------------
const S = {
  tod: 0.29, timeScale: 1, paused: true, started: false, autopilot: false, cruise: false, setSpeed: 90, gapLevel: 1, // km/h for autopilot & cruise
  camMode: 0, // 0 cockpit, 1 hood, 2 chase
  look: 0, lookYaw: 0, lookPitch: 0, freeYaw: 0, freePitch: 0,
  lights: 0, // 0 auto 1 on 2 off
  mirror: isTouch ? 0 : 2, tilt: 0, hideHud: false,
  winOpen: false, station: 0,
  wx: (() => { try { return localStorage.getItem('ed-wx') || 'auto'; } catch { return 'auto'; } })(), todSel: 'auto',
};
const LOOKS = [0, 1.45, -1.45, Math.PI];
const LOOK_NAMES = ['มองหน้า', 'มองซ้าย', 'มองขวา', 'มองหลัง'];
const CAM_NAMES = ['ห้องคนขับ', 'กล้องฝากระโปรง', 'มุมมองนอกรถ', 'กล้องอิสระ — WASD บิน, ลากเมาส์หมุน, Space/Shift ขึ้นลง, กด C ออก'];
// free camera: fly around the world while the car keeps driving on autopilot
const fly = { on: false, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, wasAuto: false };
let dayAmt = 1, nightAmt = 0;
const audio = new Audio();
const hud = new HUD();
function toast(msg) { hud.toast(msg); }
// ----- night haunting (Thai folk legends) -----
const _bpH = {};
const haunt = new Haunt({
  scene, camera, roadAtS, groundAt, glowTex, toast, audio,
  banner: (t1, t2) => { const b = $('banner'); b.innerHTML = `<div class="b1">${t1}</div><div class="b2">${t2}</div>`; b.classList.add('show'); clearTimeout(hud.bannerT); hud.bannerT = setTimeout(() => b.classList.remove('show'), 4500); },
});
try { haunt.enabled = localStorage.getItem('ed-ghosts') !== '0'; } catch {}
// muddy handprints that slap onto the windscreen from outside during a haunting
const handPrints = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = 'rgba(70,62,52,0.85)';
  g.beginPath(); g.ellipse(64, 108, 34, 40, 0, 0, Math.PI * 2); g.fill();
  for (const [x, y, w, h, r] of [[22, 64, 14, 44, -0.5], [42, 18, 14, 62, -0.12], [62, 8, 15, 68, 0], [82, 16, 14, 62, 0.12], [100, 34, 13, 52, 0.28]]) { g.save(); g.translate(x + w / 2, y + h); g.rotate(r); g.beginPath(); g.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
  g.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 140; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`; g.fillRect(Math.random() * 128, Math.random() * 160, 2 + Math.random() * 4, 1 + Math.random() * 3); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide });
  const list = [];
  for (let k = 0; k < 6; k++) {
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.25), mat); pm.position.set(-0.55 + (k % 3) * 0.5 + (Math.random() - 0.5) * 0.18, -0.05 + Math.floor(k / 3) * 0.3 + (Math.random() - 0.5) * 0.1, 0.004);
    pm.rotation.z = (Math.random() - 0.5) * 0.7; pm.scale.x = Math.random() < 0.5 ? -1 : 1; pm.visible = false; pm.renderOrder = 3; interior.drops.add(pm); list.push(pm);
  }
  return { list, mat };
})();
cabin.add(haunt.rider); cabin.add(haunt.periGroup);
audio.onWarble = (rate, dur) => { // haunted radio: songs from files / YouTube sag in pitch for a moment
  try { songEl.preservesPitch = false; songEl.playbackRate = rate; setTimeout(() => (songEl.playbackRate = 1), dur * 1000); } catch {}
  try { if (yt && yt.setPlaybackRate && S.station === 5) { yt.setPlaybackRate(0.75); setTimeout(() => yt.setPlaybackRate(1), dur * 1000); } } catch {}
};
function setGhosts(on) {
  haunt.enabled = on; try { localStorage.setItem('ed-ghosts', on ? '1' : '0'); } catch {}
  if (!on) { haunt.clear(); haunt.rider.visible = false; }
  hud.val('ghosts', on ? 'เปิด' : 'ปิด'); hud.btn('ghosts', on); toast(on ? 'ผีตอนกลางคืน: เปิด' : 'ผีตอนกลางคืน: ปิด');
}
function tryGhosts(type) { // jump straight into a haunted night (optionally a given legend)
  if (!haunt.enabled) setGhosts(true);
  setTod('night'); haunt.clear(); haunt.start(carS, typeof type === 'string' ? type : undefined);
  toggleWxPanel(false);
}

// ---------------- Input ----------------
const keys = new Set();
const touch = { gas: 0, brake: 0, steer: 0, steerActive: false, tiltSteer: 0 };
addEventListener('keydown', (e) => {
  if (e.repeat) { if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); return; }
  keys.add(e.code);
  if (!S.started) return;
  if (e.code === 'KeyH') { hornOn(true); return; }
  const c = e.code;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) e.preventDefault();
  if (fly.on && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft'].includes(c)) return;
  if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(c) && S.autopilot) setAutopilot(false);
  if (c === 'KeyO') { toggleWxPanel(); return; }
  if (c === 'KeyI') { setWindows(!S.winOpen); return; }
  if (c === 'Digit9') { setStation((S.station + 1) % (myTracks.length ? 5 : 4)); return; }
  if (c === 'KeyY') { if (S.garage) closeGarage(); else openGarage(); return; }
  if (S.garage && c !== 'Escape') return;
  if (c === 'Escape') togglePause();
  else if (c === 'KeyG') toggleGearbox();
  else if (c === 'KeyE' || c === 'ShiftLeft' || c === 'ShiftRight') shift(1);
  else if (c === 'KeyQ' || c === 'ControlLeft' || c === 'ControlRight') shift(-1);
  else if (c === 'Digit1' || c === 'Numpad8') setLook(0);
  else if (c === 'Digit2' || c === 'Numpad4') setLook(1);
  else if (c === 'Digit3' || c === 'Numpad6') setLook(2);
  else if (c === 'Digit4' || c === 'Numpad2') setLook(3);
  else if (c === 'KeyC') cycleCam();
  else if (c === 'Digit0' || c === 'Numpad0') { S.camMode = fly.on ? 0 : 3; setFly(S.camMode === 3); toast(CAM_NAMES[S.camMode]); hud.val('cam', CAM_SHORT[S.camMode]); }   // straight into / out of the free camera
  else if (c === 'KeyP') setAutopilot(!S.autopilot);
  else if (c === 'KeyL') cycleLights();
  else if (c === 'KeyT') cycleTime();
  else if (c === 'KeyJ') nextRegion();
  else if (c === 'KeyM') toggleSound();
  else if (c === 'KeyV') cycleMirror();
  else if (c === 'KeyF') toggleFS();
  else if (c === 'KeyR') setCruise(!S.cruise);
  else if (c === 'KeyN') cycleGap();
  else if (c === 'Equal' || c === 'NumpadAdd' || c === 'PageUp') adjustSpeed(5);
  else if (c === 'Minus' || c === 'NumpadSubtract' || c === 'PageDown') adjustSpeed(-5);
  else if (c === 'KeyZ') setBlink(1);
  else if (c === 'KeyX') setBlink(-1);
  else if (c === 'KeyB') setBlink(2);
  else if (c === 'KeyK') { qi = (qi + 1) % 3; applyQuality(); }
  else if (c === 'KeyU') { S.hideHud = !S.hideHud; document.body.classList.toggle('nohud', S.hideHud); }
});
addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'KeyH') hornOn(false); });
addEventListener('blur', () => { keys.clear(); hornOn(false); });
const K = (...c) => !fly.on && c.some((k) => keys.has(k));
const KF = (...c) => c.some((k) => keys.has(k));

// free look by dragging on the scene
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const k = isTouch ? 0.007 : 0.005;
  if (fly.on) { fly.yaw += (drag.x - e.clientX) * k * 0.8; fly.pitch = clamp(fly.pitch + (drag.y - e.clientY) * k * 0.8, -1.45, 1.45); drag.x = e.clientX; drag.y = e.clientY; return; }
  S.freeYaw += (drag.x - e.clientX) * k; S.freePitch = clamp(S.freePitch + (drag.y - e.clientY) * k, -0.6, 0.5);
  drag.x = e.clientX; drag.y = e.clientY;
});
const endDrag = (e) => { if (drag && drag.id === e.pointerId) drag = null; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('dblclick', () => setLook(0));

function setLook(i) { S.look = i; S.freeYaw = 0; S.freePitch = 0; hud.setLook(i); toast(LOOK_NAMES[i]); }
const CAM_SHORT = ['ห้องคนขับ', 'ฝากระโปรง', 'นอกรถ', 'อิสระ'];
function setFly(on) {
  if (on === fly.on) return;
  fly.on = on;
  document.body.classList.toggle('flycam', on);   // no gauges while flying
  if (on) {
    camera.getWorldPosition(camWorld); fly.x = camWorld.x; fly.y = camWorld.y + 2; fly.z = camWorld.z;
    fly.yaw = car.yaw; fly.pitch = -0.08;
    fly.wasAuto = S.autopilot; if (!S.autopilot) setAutopilot(true);
    scene.attach(camera);
  } else {
    head.add(camera); camera.position.set(0, 0, 0); camera.rotation.set(0, Math.PI, 0);
    if (!fly.wasAuto) setAutopilot(false);
  }
}
function cycleCam() { S.camMode = (S.camMode + 1) % 4; setFly(S.camMode === 3); toast(CAM_NAMES[S.camMode]); hud.val('cam', CAM_SHORT[S.camMode]); }
function setAutopilot(v) {
  S.autopilot = v; hud.btn('auto', v);
  if (v && S.cruise) setCruise(false, null);
  toast(v ? `เปิดขับอัตโนมัติ (ไม่เกิน ${S.setSpeed} km/h)` : 'ปิดขับอัตโนมัติ');
}
function setCruise(v, msg) {
  if (v && S.autopilot) { toast('ขับอัตโนมัติคุมความเร็วอยู่แล้ว ปรับความเร็วด้วย + / -'); return; }
  if (v) {
    const kmh = Math.abs(car.v) * 3.6;
    if (kmh < 25) { toast('ต้องวิ่งเร็วกว่า 25 km/h ก่อนเปิดครูซ'); return; }
    S.setSpeed = clamp(Math.round(kmh / 5) * 5, 30, 200); hud.val('setspeed', S.setSpeed);
  }
  S.cruise = v; hud.btn('cruise', v); hud.val('cruise', v ? 'เปิด' : 'ปิด');
  if (msg !== null) toast(msg || (v ? `ครูซคอนโทรล ${S.setSpeed} km/h` : 'ปิดครูซคอนโทรล'));
}
function adjustSpeed(d) {
  S.setSpeed = clamp(S.setSpeed + d, 30, 200); hud.val('setspeed', S.setSpeed);
  toast(`ตั้งความเร็ว ${S.setSpeed} km/h` + (S.autopilot ? ' (ขับอัตโนมัติ)' : S.cruise ? ' (ครูซ)' : ''));
}
function cycleLights() { S.lights = (S.lights + 1) % 3; const n = ['อัตโนมัติ', 'เปิด', 'ปิด'][S.lights]; toast('ไฟหน้า: ' + n); hud.val('lights', n); }
// ----- chosen weather / time of day (auto = follows the zones and the clock) -----
const WX = {
  auto: { name: 'อัตโนมัติ (ตามโซน)' },
  sunny: { name: 'แดดจ้า', cloud: 0.08 },
  cloudy: { name: 'เมฆมาก', cloud: 1, overX: 0.25 },
  dark: { name: 'ฟ้ามืดครึ้ม', cloud: 1, overX: 0.85 },
  rain: { name: 'ฝนตก', rain: 1, cloud: 1 },
  storm: { name: 'พายุฝน', rain: 1, cloud: 1, overX: 1, wind: 1 },
  mist: { name: 'หมอกบาง', fog: 0.72, cloud: 0.6, overX: 0.2 },
  fog: { name: 'หมอกหนา', fog: 1, cloud: 1, overX: 0.45 },
  snowLight: { name: 'หิมะตกเบา', snow: 0.4, cloud: 1, overX: 0.35 },
  snow: { name: 'หิมะตก', snow: 1, cloud: 1 },
  blizzard: { name: 'พายุหิมะ', snow: 1, cloud: 1, overX: 0.7, fog: 0.55, wind: 1 },
};
const TODS = { auto: ['อัตโนมัติ (เวลาเดิน)', -1], dawn: ['รุ่งเช้า 06:15', 0.26], morning: ['สาย 09:00', 0.375], noon: ['เที่ยง 12:00', 0.5], afternoon: ['บ่าย 15:30', 0.646], sunset: ['ตะวันตกดิน 18:00', 0.745], dusk: ['พลบค่ำ 18:50', 0.785], night: ['กลางคืน 22:00', 0.917], midnight: ['ตีสอง 02:00', 0.083] };
const wxCur = { rain: 0, snow: 0, petals: 0, leaves: 0, clear: 0, overX: 0, fog: 0, cloud: 0.5, wind: 0 };
let wxInit = false;
function setWeather(k) {
  S.wx = k; try { localStorage.setItem('ed-wx', k); } catch {}
  document.querySelectorAll('[data-wx]').forEach((e) => e.classList.toggle('active', e.dataset.wx === k));
  hud.val('wx', WX[k].name.replace(' (ตามโซน)', '')); toast('สภาพอากาศ: ' + WX[k].name);
}
function setTod(k) {
  S.todSel = k; const v = TODS[k][1];
  if (v >= 0) { S.tod = v; S.timeScale = 0; } else S.timeScale = 1;
  hud.btn('time', S.timeScale !== 1); hud.val('time', S.timeScale === 0 ? 'หยุด' : 'ปกติ');
  document.querySelectorAll('[data-tod]').forEach((e) => e.classList.toggle('active', e.dataset.tod === k));
  toast('ช่วงเวลา: ' + TODS[k][0]);
}
// ----- volume settings: engine / effects / music -----
const VOL = (() => { try { return { engine: 1, fx: 1, music: 1, ...JSON.parse(localStorage.getItem('ed-vol') || '{}') }; } catch { return { engine: 1, fx: 1, music: 1 }; } })();
audio.vol = { ...VOL };
function toggleVolPanel(on = !$('volScr').classList.contains('show')) { $('volScr').classList.toggle('show', on); }
for (const k of ['engine', 'fx', 'music']) {
  const el = $('vol_' + k), show = () => { $('vv_' + k).textContent = Math.round(VOL[k] * 100) + '%'; };
  el.value = Math.round(VOL[k] * 100); show();
  el.addEventListener('input', () => {
    VOL[k] = +el.value / 100; show(); audio.setVolume(k, VOL[k]);
    if (k === 'music') ytVolume();
    try { localStorage.setItem('ed-vol', JSON.stringify(VOL)); } catch {}
  });
}
function toggleWxPanel(on = !$('wxScr').classList.contains('show')) { $('wxScr').classList.toggle('show', on); }
// ----- windows & radio -----
const STATIONS = ['ปิด', 'Chill', 'Lo-fi', 'Synth', 'เพลงของฉัน', 'YouTube'];
const myTracks = []; let myIdx = 0;
const songEl = document.createElement('audio');
songEl.addEventListener('ended', () => nextTrack(1));
function nextTrack(d) {
  if (!myTracks.length) return;
  myIdx = (myIdx + d + myTracks.length) % myTracks.length;
  songEl.src = myTracks[myIdx].url; if (S.station === 4) songEl.play().catch(() => {});
  $('radioNow').textContent = 'กำลังเล่น: ' + myTracks[myIdx].name;
}
function setWindows(open) {
  S.winOpen = open; audio.setWindows(open); applyTopState(); ytVolume();
  hud.val('win', open ? 'เปิด' : 'ปิด'); hud.btn('win', open);
  if (CAR.open) toast(open ? 'เปิดประทุน: ลมเข้า เสียงเครื่องเต็มที่' : 'ปิดประทุน: เสียงข้างนอกเบาลง');
  else toast(open ? 'เปิดหน้าต่าง: ได้ยินเสียงเครื่องเต็มที่' : 'ปิดหน้าต่าง: เสียงข้างนอกเบาลง');
}
// convertible: closing the windows also raises the soft top (outside view, cabin roof, roof shadow)
function applyTopState() {
  const up = !CAR.open || !S.winOpen;
  for (const r of interior.roof) r.visible = up && !glbCar;   // a Blender body brings its own roof and pillars
  if (extTop) extTop.visible = CAR.open && !S.winOpen;
  shadowProxy.scale.y = up ? 1 + CAR.seat * 0.9 : 0.66;
  document.querySelectorAll('[data-l="win"]').forEach((e) => (e.textContent = CAR.open ? 'ประทุน' : 'หน้าต่าง'));
}
// ----- YouTube as a radio: the official embedded player, kept visible in a small corner window -----
let yt = null, ytReady = null;
let ytSkips = 0;
function ytParse(url) {
  try {
    const u = new URL(url.trim()); let id = u.searchParams.get('v'), list = u.searchParams.get('list');
    if (!id && /youtu\.be$/.test(u.hostname)) id = u.pathname.slice(1);
    if (!id) { const m = u.pathname.match(/\/(shorts|live|embed)\/([\w-]{6,})/); if (m) id = m[2]; }
    return id || list ? { id, list } : null;
  } catch { return null; }
}
function ytApi() {
  if (!ytReady) ytReady = new Promise((res) => {
    window.onYouTubeIframeAPIReady = res;
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => res(null); document.head.appendChild(s);
    setTimeout(() => res(null), 10000);
  });
  return ytReady;
}
const cockFov = 72;   // field of view from the driver's seat (fixed)
// ----- where the video shows: on the car's centre screen, or in a small window you can drag and resize -----
let ytMode = (() => { try { return localStorage.getItem('ed-ytmode') || 'car'; } catch { return 'car'; } })();
let ytSizeIdx = (() => { try { return +(localStorage.getItem('ed-ytsize') ?? 1); } catch { return 1; } })();
const YT_SIZES = [[320, 180], [480, 270], [640, 360]], YT_CAR = [480, 270];
function ytSize() { return ytMode === 'car' ? YT_CAR : YT_SIZES[ytSizeIdx]; }
function setYtMode(m) {
  ytMode = m; try { localStorage.setItem('ed-ytmode', m); } catch {}
  const box = $('ytBox'); box.classList.toggle('car', m === 'car'); box.style.transform = ''; box.style.visibility = '';
  if (m !== 'car') { const pos = (() => { try { return JSON.parse(localStorage.getItem('ed-ytpos') || 'null'); } catch { return null; } })(); box.style.left = (pos?.[0] ?? 12) + 'px'; box.style.top = (pos?.[1] ?? 96) + 'px'; }
  else { box.style.left = '0px'; box.style.top = '0px'; }
  yt?.setSize?.(...ytSize());
  hud.val('ytmode', m === 'car' ? 'จอรถ' : 'หน้าต่างลอย');
  document.querySelectorAll('[data-a="ytMode"]').forEach((e) => (e.textContent = m === 'car' ? 'ย้ายไปหน้าต่างลอย' : 'แสดงบนจอรถ'));
}
// projective (homography) CSS transform that maps a w x h box onto 4 screen points (TL, TR, BL, BR)
function quadMatrix(w, h, P) {
  const adj = (m) => [m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4], m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5], m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]];
  const mul = (a, b) => { const c = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[3 * i + j] = a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j]; return c; };
  const basis = (q) => { const m = [q[0], q[2], q[4], q[1], q[3], q[5], 1, 1, 1], a = adj(m), v = [a[0] * q[6] + a[1] * q[7] + a[2], a[3] * q[6] + a[4] * q[7] + a[5], a[6] * q[6] + a[7] * q[7] + a[8]]; return mul(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]); };
  const t = mul(basis(P), adj(basis([0, 0, w, 0, 0, h, w, h])));
  for (let i = 0; i < 9; i++) t[i] /= t[8];
  return `matrix3d(${t[0]},${t[3]},0,${t[6]},${t[1]},${t[4]},0,${t[7]},0,0,1,0,${t[2]},${t[5]},0,${t[8]})`;
}
const _sc = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
function updateYtScreen() {
  const box = $('ytBox');
  if (ytMode !== 'car' || !box.classList.contains('on')) return;
  const show = S.camMode === 0 && !S.garage && carScreen.parent && interior.grp.visible;
  let ok = show;
  if (ok) {
    carScreen.updateWorldMatrix(true, false);
    const P = [];
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sy], k) => {
      const v = _sc[k].set(sx * SCR_W / 2, sy * SCR_H / 2, 0).applyMatrix4(carScreen.matrixWorld).project(camera);
      if (v.z > 1 || v.z < -1) ok = false;
      P.push((v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight);
    });
    if (ok) box.style.transform = quadMatrix(YT_CAR[0], YT_CAR[1], P);
  }
  box.style.visibility = ok ? '' : 'hidden';
}
// drag the floating window by its title bar
(() => {
  const box = $('ytBox'), bar = box.querySelector('.ytbar'); let d = null;
  bar.addEventListener('pointerdown', (e) => { if (ytMode === 'car' || e.target.closest('button')) return; d = [e.clientX - box.offsetLeft, e.clientY - box.offsetTop]; bar.setPointerCapture(e.pointerId); e.preventDefault(); });
  bar.addEventListener('pointermove', (e) => { if (!d) return; box.style.left = clamp(e.clientX - d[0], 0, innerWidth - 80) + 'px'; box.style.top = clamp(e.clientY - d[1], 0, innerHeight - 40) + 'px'; });
  bar.addEventListener('pointerup', () => { if (!d) return; d = null; try { localStorage.setItem('ed-ytpos', JSON.stringify([box.offsetLeft, box.offsetTop])); } catch {} });
})();
function ytVolume() {
  if (!yt || !yt.setVolume) return;
  yt.setVolume(Math.round(70 * VOL.music * (S.winOpen ? 0.45 : 1) * (audio.on ? 1 : 0)));
}
async function playYouTube(url) {
  const p = ytParse(url);
  if (!p) { toast('ลิงก์ YouTube ไม่ถูกต้อง'); return; }
  try { localStorage.setItem('ed-yt', url); } catch {}
  if (location.protocol === 'file:') toast('YouTube อาจเล่นไม่ได้เมื่อเปิดเกมจากไฟล์ตรง ๆ ให้เปิดผ่าน bun run serve');
  await ytApi();
  if (!window.YT || !YT.Player) { ytReady = null; toast('โหลดตัวเล่น YouTube ไม่ได้ (ต้องต่ออินเทอร์เน็ต)'); return; }
  $('ytBox').classList.add('on'); setYtMode(ytMode);
  // playlists the embedded player cannot open: personal lists and YouTube's auto-generated mixes
  let list = p.list;
  if (list && /^(LL|WL|LM)$/.test(list)) { toast('เพลย์ลิสต์ส่วนตัว (วิดีโอที่ชอบ / ดูภายหลัง) เปิดในเกมไม่ได้ ให้คัดลอกเพลงไปไว้ในเพลย์ลิสต์ที่ตั้งเป็นสาธารณะหรือไม่เป็นสาธารณะ'); if (!p.id) return; list = null; }
  else if (list && /^RD/.test(list)) { if (!p.id) { toast('เพลย์ลิสต์ Mix ที่ YouTube สร้างให้อัตโนมัติ เปิดในเกมไม่ได้ ให้วางลิงก์วิดีโอหรือเพลย์ลิสต์ปกติแทน'); return; } list = null; }   // a video opened from a Mix: just play the video
  ytSkips = 0;
  const vars = { autoplay: 1, playsinline: 1, rel: 0, ...(/^https?:$/.test(location.protocol) ? { origin: location.origin } : {}), ...(list ? { listType: 'playlist', list } : {}) };
  if (yt) { if (list) yt.loadPlaylist({ listType: 'playlist', list }); else yt.loadVideoById(p.id); }
  else yt = new YT.Player('ytPlayer', { width: ytSize()[0], height: ytSize()[1], videoId: list ? undefined : p.id, playerVars: vars, events: {
    onReady: () => { ytVolume(); yt.playVideo(); },
    onStateChange: (e) => { if (e.data === 1) ytSkips = 0; },
    onError: (e) => {
      const why = { 2: 'ลิงก์ไม่ถูกต้อง', 5: 'เบราว์เซอร์เล่นวิดีโอนี้ไม่ได้', 100: 'วิดีโอถูกลบหรือเป็นส่วนตัว', 101: 'เจ้าของไม่อนุญาตให้เล่นนอก YouTube', 150: 'เจ้าของไม่อนุญาตให้เล่นนอก YouTube', 153: 'YouTube ไม่ยอมให้เล่นจากหน้านี้' }[e.data] || 'เล่นไม่ได้';
      const pl = yt.getPlaylist?.();
      if (pl && pl.length > 1 && ytSkips < Math.min(pl.length - 1, 15)) { ytSkips++; toast('ข้ามเพลงที่เล่นไม่ได้: ' + why); setTimeout(() => yt.nextVideo(), 600); }   // one blocked song should not stop the whole playlist
      else toast('เล่นไม่ได้: ' + why);
    },
  } });
  setStation(5, true);
}
function setStation(n, fromYt = false) {
  if (n === 5 && !fromYt) { const u = $('ytUrl').value || (() => { try { return localStorage.getItem('ed-yt') || ''; } catch { return ''; } })(); if (u) { $('ytUrl').value = u; playYouTube(u); } else { toggleRadioPanel(true); $('ytUrl').focus(); } return; }
  if (yt && yt.pauseVideo && n !== 5) { yt.pauseVideo(); $('ytBox').classList.remove('on'); }
  if (n === 5) ytVolume();
  if (n === 4 && !myTracks.length) { $('songFiles').click(); return; }  // pick songs first
  audio.init(); audio.attachFiles(songEl);
  S.station = n; audio.setStation(n === 5 ? 0 : n);
  if (n === 4 && !songEl.src) nextTrack(0);
  hud.val('radio', STATIONS[n]); hud.btn('radio', n > 0);
  document.querySelectorAll('[data-st]').forEach((e) => e.classList.toggle('active', +e.dataset.st === n));
  if (n !== 4) $('radioNow').textContent = n ? 'สถานี ' + STATIONS[n] : '';
  toast('วิทยุ: ' + STATIONS[n]);
}
function toggleRadioPanel(on = !$('radioScr').classList.contains('show')) { $('radioScr').classList.toggle('show', on); }
$('songFiles').addEventListener('change', (e) => {
  const files = [...e.target.files]; e.target.value = '';
  if (!files.length) return;
  const first = myTracks.length;
  for (const f of files) myTracks.push({ name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) });
  myIdx = first; songEl.src = myTracks[first].url; $('radioNow').textContent = 'กำลังเล่น: ' + myTracks[first].name;
  setStation(4);
});
$('ytGo').addEventListener('click', () => playYouTube($('ytUrl').value));
$('ytUrl').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') playYouTube($('ytUrl').value); });
try { $('ytUrl').value = localStorage.getItem('ed-yt') || ''; } catch {}
const TIMES = [1, 8, 40, 0];
function cycleTime() {
  const i = (TIMES.indexOf(S.timeScale) + 1) % TIMES.length; S.timeScale = TIMES[i];
  toast(S.timeScale === 0 ? 'หยุดเวลา' : `เวลาเดินเร็ว ×${S.timeScale}`); hud.btn('time', S.timeScale !== 1); hud.val('time', S.timeScale === 0 ? 'หยุด' : S.timeScale === 1 ? 'ปกติ' : '×' + S.timeScale);
}
function toggleGearbox() {
  car.auto = !car.auto;
  if (car.auto && car.gear === 1) car.gear = 2;
  toast(car.auto ? 'เกียร์อัตโนมัติ (AT)' : 'เกียร์ธรรมดา (MT): E/Shift = ขึ้นเกียร์, Q/Ctrl = ลดเกียร์');
  hud.setGearbox(car.auto); hud.val('gearbox', car.auto ? 'อัตโนมัติ' : 'ธรรมดา');
}
function toggleSound() { const on = audio.toggle(); setTimeout(ytVolume, 0); hud.btn('sound', on); hud.btn('vol', on); hud.val('sound', on ? 'เปิด' : 'ปิด'); toast(on ? 'เปิดเสียง' : 'ปิดเสียง'); }
function toggleFS() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  else document.exitFullscreen?.();
}
// ----- garage: separate screen with a rotating 3D preview of the car -----
let garageFromMenu = false, gYaw = 2.5, gDrag = null;
function openGarage() {
  if (S.garage) return;
  hornOn(false); garageFromMenu = $('menu').classList.contains('show');
  S.garage = true; S.paused = true; $('menu').classList.remove('show'); $('garageScr').classList.add('show');
  document.body.classList.add('nohud-g'); gYaw = 2.5;
}
function closeGarage() {
  if (!S.garage) return;
  S.garage = false; $('garageScr').classList.remove('show'); document.body.classList.remove('nohud-g');
  if (garageFromMenu || !S.started) $('menu').classList.add('show'); else S.paused = false;
}
addEventListener('pointerdown', (e) => { if (S.garage && e.target === renderer.domElement) gDrag = e.clientX; });
addEventListener('pointermove', (e) => { if (gDrag !== null) { gYaw -= (e.clientX - gDrag) * 0.01; gDrag = e.clientX; } });
addEventListener('pointerup', () => { gDrag = null; });
function togglePause() {
  if (S.garage) { closeGarage(); return; }
  hornOn(false); S.paused = !S.paused; $('menu').classList.toggle('show', S.paused); $('startBtn').textContent = 'ขับต่อ'; }
function nextRegion() {
  const { idx } = regionIdx(carS);
  const s = (idx + 1) * REGION_LEN + 150;
  placeCar(s); car.v = Math.max(car.v, 15);
  for (const [, g] of tiles) disposeGroup(g); tiles.clear();
  for (const [, g] of chunks) disposeGroup(g); chunks.clear();
  traffic.length = 0; veg.clear();
  updateChunks(); updateTiles(true);
  lastRegion = -1;
}

// touch controls
function bindHold(id, on, off) {
  const el = $(id); if (!el) return;
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('on'); on(); });
  const up = () => { el.classList.remove('on'); off(); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
}
bindHold('horn', () => hornOn(true), () => hornOn(false));
bindHold('gas', () => { touch.gas = 1; if (S.autopilot) setAutopilot(false); }, () => (touch.gas = 0));
bindHold('brake', () => { touch.brake = 1; if (S.autopilot) setAutopilot(false); }, () => (touch.brake = 0));
{
  const wh = $('wheel'), img = $('wheelImg');
  let st = null;
  wh.addEventListener('pointerdown', (e) => {
    e.preventDefault(); wh.setPointerCapture(e.pointerId);
    const r = wh.getBoundingClientRect();
    st = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, a0: 0, rot: 0 };
    st.a0 = Math.atan2(e.clientY - st.cy, e.clientX - st.cx);
    touch.steerActive = true; if (S.autopilot) setAutopilot(false);
  });
  wh.addEventListener('pointermove', (e) => {
    if (!st) return;
    const a = Math.atan2(e.clientY - st.cy, e.clientX - st.cx);
    let d = a - st.a0; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
    st.rot = clamp(st.rot + d, -2.4, 2.4); st.a0 = a;
    touch.steer = clamp(-st.rot / 2.0, -1, 1);
  });
  const up = () => { st = null; touch.steerActive = false; touch.steer = 0; };
  wh.addEventListener('pointerup', up); wh.addEventListener('pointercancel', up);
  hud.wheelImg = img;
}
addEventListener('deviceorientation', (e) => {
  if (!S.tilt || e.beta == null) return;
  const ang = (screen.orientation?.angle ?? window.orientation ?? 0);
  let a;
  if (ang === 90) a = e.beta; else if (ang === -90 || ang === 270) a = -e.beta; else a = e.gamma;
  touch.tiltSteer = clamp(-a / 28, -1, 1) * (S.tilt === 2 ? -1 : 1);
});
async function cycleTilt() {
  if (S.tilt === 0 && typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
    try { if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') return toast('ไม่ได้รับอนุญาตให้ใช้เซ็นเซอร์'); } catch { return toast('ใช้เซ็นเซอร์เอียงไม่ได้'); }
  }
  S.tilt = (S.tilt + 1) % 3;
  toast(['ปิดการเอียงเครื่อง', 'เลี้ยวด้วยการเอียงเครื่อง', 'เอียงเครื่อง (กลับทิศ)'][S.tilt]); hud.btn('tilt', S.tilt > 0); hud.val('tilt', ['ปิด', 'เปิด', 'กลับทิศ'][S.tilt]);
}
const actions = {
  auto: () => setAutopilot(!S.autopilot), cam: cycleCam, gearbox: toggleGearbox, up: () => shift(1), down: () => shift(-1),
  lights: cycleLights, time: cycleTime, next: nextRegion, mirror: cycleMirror,
  q0: () => { qi = 0; applyQuality(); }, q1: () => { qi = 1; applyQuality(); }, q2: () => { qi = 2; applyQuality(); },
  cruise: () => setCruise(!S.cruise), gap: cycleGap, spdUp: () => adjustSpeed(5), spdDown: () => adjustSpeed(-5),
  blinkL: () => setBlink(1), blinkR: () => setBlink(-1), hazard: () => setBlink(2),
  sound: toggleSound, fs: toggleFS, pause: togglePause, garage: openGarage, garageClose: closeGarage, ghosts: () => setGhosts(!haunt.enabled), ghostTry: () => tryGhosts(), wx: () => toggleWxPanel(), vol: () => toggleVolPanel(), volClose: () => toggleVolPanel(false), wxClose: () => toggleWxPanel(false), win: () => setWindows(!S.winOpen), radio: () => toggleRadioPanel(), radioClose: () => toggleRadioPanel(false), radioNext: () => setStation((S.station + 1) % 4), ytStop: () => setStation(0), ytMode: () => setYtMode(ytMode === 'car' ? 'float' : 'car'), ytSize: () => { ytSizeIdx = (ytSizeIdx + 1) % YT_SIZES.length; try { localStorage.setItem('ed-ytsize', ytSizeIdx); } catch {} yt?.setSize?.(...ytSize()); }, trackNext: () => nextTrack(1), trackPrev: () => nextTrack(-1), songs: () => $('songFiles').click(), tilt: cycleTilt,
  l0: () => setLook(0), l1: () => setLook(1), l2: () => setLook(2), l3: () => setLook(3),
};
document.querySelectorAll('[data-car]').forEach((el) => el.addEventListener('click', () => applyCar(el.dataset.car, paintIdx, true, true)));
document.querySelectorAll('[data-rim]').forEach((el) => el.addEventListener('click', () => { rimIdx = +el.dataset.rim; applyCar(carType, paintIdx, false); }));
document.querySelectorAll('[data-hood]').forEach((el) => el.addEventListener('click', () => { hoodIdx = +el.dataset.hood; applyCar(carType, paintIdx, false); }));
document.querySelectorAll('[data-paint]').forEach((el) => el.addEventListener('click', () => applyCar(carType, +el.dataset.paint, true)));
document.querySelectorAll('[data-a]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); actions[el.dataset.a]?.(); }));
// ----- phone as a joystick: bun run serve relays pad.html input over a WebSocket -----
const pad = { steer: 0, gas: 0, brake: 0, t: -1e9, n: 0 };
(async () => {
  if (!/^https?:/.test(location.protocol)) return; // opened as a file: there is no relay server
  let info = null;
  try { const r = await fetch('lan.json', { cache: 'no-store' }); if (r.ok) info = await r.json(); } catch (e) { /* not served by serve.mjs */ }
  if (!info) return;
  const connect = () => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?role=host`);
    let stTimer = 0;
    ws.onmessage = async (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'room') {
        const url = `${info.pad}?r=${m.room}`;
        await QRCode.toCanvas($('qrCanvas'), url, { width: 120, margin: 1 });
        $('qrUrl').textContent = url; $('qrBox').classList.add('on');
        stTimer = setInterval(() => { if (pad.n) ws.send(JSON.stringify({ t: 'st', kmh: Math.round(Math.abs(car.v) * 3.6), gear: gearName() })); }, 200);
      } else if (m.t === 'pads') {
        pad.n = m.n; if (!m.n) { pad.gas = pad.brake = pad.steer = 0; }
        $('qrText').textContent = m.n ? `เชื่อมต่อมือถือแล้ว ${m.n} เครื่อง` : 'สแกน QR ด้วยกล้องมือถือเพื่อใช้มือถือเป็นจอยควบคุม (Wi-Fi เดียวกัน)';
        $('qrBox').classList.toggle('linked', m.n > 0); if (m.n) toast('เชื่อมต่อจอยมือถือแล้ว');
      } else if (m.t === 'in') {
        pad.steer = m.s; pad.gas = m.g; pad.brake = m.b; pad.t = performance.now();
        if ((m.g || Math.abs(m.s) > 0.05 || m.b) && S.autopilot) setAutopilot(false);
      } else if (m.t === 'horn') hornOn(!!m.on);
      else if (m.t === 'act') {
        if (m.a === 'pause' && !S.started) { $('startBtn').click(); return; }
        if (m.a.startsWith('l') && m.a.length === 2) { setLook(S.look === +m.a[1] ? 0 : +m.a[1]); return; } // look buttons toggle
        actions[m.a]?.();
      }
    };
    ws.onclose = () => { clearInterval(stTimer); setTimeout(connect, 2000); };
  };
  connect();
})();
$('startBtn').addEventListener('click', () => {
 audio.init(); hud.btn('sound', audio.on); hud.btn('vol', audio.on); hud.val('sound', audio.on ? 'เปิด' : 'ปิด');
  S.started = true; S.paused = false; $('menu').classList.remove('show');
  if (isTouch && !document.fullscreenElement) toggleFS();
});
document.body.classList.toggle('touch', isTouch);
hud.btn('mirror', S.mirror > 0);
function cycleMirror() {
  S.mirror = (S.mirror + 1) % 3; hud.btn('mirror', S.mirror > 0); hud.val('mirror', ['ปิด', 'หลัง', 'หลัง+ข้าง'][S.mirror]);
  toast(['ปิดกระจก', 'กระจกมองหลัง', 'กระจกมองหลัง + กระจกมองข้าง'][S.mirror]);
}

// ---------------- Horn ----------------
let horning = false, hornHeld = 0;
function hornOn(v) {
  if (v === horning) return;
  horning = v;
  if (v) { audio.hornStart(); hornHeld = 0; } else audio.hornStop();
  hud.btn('horn', v);
}
function updateHorn(dt) {
  if (!horning) return;
  hornHeld += dt;
  // a car nearby may honk back (once per honk)
  if (hornHeld > 0.15 && hornHeld - dt <= 0.15) {
    const near = traffic.find((t) => Math.abs(t.s - carS) < 90);
    if (near && Math.random() < 0.45) setTimeout(() => audio.beepOther(0.06 + 0.06 * (1 - Math.abs(near.s - carS) / 90)), 500 + Math.random() * 500);
  }
}

// ---------------- Adaptive cruise ----------------
const GAPS = [[1.2, 'ใกล้'], [1.8, 'กลาง'], [2.5, 'ไกล']];
let accFollow = false;
// target speed that keeps a time gap to the car ahead in our lane (leadGap / leadV come from traffic)
function accTarget(setV) {
  const want = 7 + Math.max(0, car.v) * GAPS[S.gapLevel][0];
  if (leadGap > Math.max(120, want * 2.5)) { accFollow = false; return { v: setV, active: false, close: false }; }
  const vt = leadV + (leadGap - want) * 0.3;
  accFollow = vt < setV;
  return { v: clamp(Math.min(setV, vt), 0, setV), active: accFollow, close: leadGap < want * 0.55 };
}
function cycleGap() { S.gapLevel = (S.gapLevel + 1) % 3; hud.val('gap', GAPS[S.gapLevel][1]); toast('ระยะห่างรถคันหน้า: ' + GAPS[S.gapLevel][1]); }

// ---------------- Turn signals ----------------
function setBlink(d) {
  car.blink = car.blink === d ? 0 : d;
  car.blinkT = 0; car.blinkOn = car.blink !== 0; car.blinkArmed = false;
  if (car.blinkOn) audio.tick(true);
  hud.btn('blinkL', car.blink === 1); hud.btn('blinkR', car.blink === -1); hud.btn('hazard', car.blink === 2);
}
function updateBlink(dt) {
  if (!car.blink) { car.blinkOn = false; return; }
  car.blinkT += dt;
  const on = (car.blinkT % 0.7) < 0.36;
  if (on !== car.blinkOn) { car.blinkOn = on; audio.tick(on); }
  // self-cancel after the turn: steer past the threshold in the signalled direction, then straighten
  if (car.blink === 1 || car.blink === -1) {
    const st = car.steer * car.blink;
    if (st > 0.35) car.blinkArmed = true;
    else if (car.blinkArmed && st < 0.08) setBlink(car.blink);
  }
  const lamp = (side) => car.blinkOn && (car.blink === 2 || car.blink === side);
  blinkMatL.color.setRGB(1, 0.55, 0.05, THREE.SRGBColorSpace).multiplyScalar(lamp(1) ? 4 : 0.25);
  blinkMatR.color.setRGB(1, 0.55, 0.05, THREE.SRGBColorSpace).multiplyScalar(lamp(-1) ? 4 : 0.25);
  dashL.color.setRGB(0.2, 1, 0.3, THREE.SRGBColorSpace).multiplyScalar(lamp(1) ? 3 : 0.04);
  dashR.color.setRGB(0.2, 1, 0.3, THREE.SRGBColorSpace).multiplyScalar(lamp(-1) ? 3 : 0.04);
}

// ---------------- Collisions with scenery ----------------
const _km = new THREE.Matrix4(), _kq = new THREE.Quaternion(), _kq2 = new THREE.Quaternion(), _kv = new THREE.Vector3(), _ks = new THREE.Vector3(), _kax = new THREE.Vector3();
function knockDown(c, dir, instant = false) {
  broken.add(c.id || '');
  if (c.kind === 'squash') { // bush: flatten in place
    for (const { im, k } of c.parts) { const b = c.base; im.setMatrixAt(k, M(b[0], b[1], b[2], 0, b[3], 0, b[4] * 1.15, b[4] * 0.22, b[4] * 1.15)); im.instanceMatrix.needsUpdate = true; }
    return;
  }
  // fall over along the car's travel direction (or a pseudo-random one when rebuilt)
  const a = dir ? Math.atan2(dir.x, dir.z) : (c.x * 13.7 + c.z * 7.1) % 6.283;
  const f = { c, t: instant ? 1 : 0, ax: new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)), groupRot: c.group ? c.group.rotation.y : 0 };
  if (instant) applyFall(f); else falling.push(f);
}
function applyFall(f) {
  const e = 1 - Math.pow(1 - Math.min(1, f.t), 3), ang = e * 1.45, c = f.c;
  _kq.setFromAxisAngle(f.ax, ang);
  if (c.group) {
    _kq2.setFromAxisAngle(_kax.set(0, 1, 0), f.groupRot);
    c.group.quaternion.copy(_kq).multiply(_kq2);
    c.group.position.y = c.group.userData.y0 ?? (c.group.userData.y0 = c.group.position.y);
    return;
  }
  for (const { im, k } of c.parts) {
    const b = c.base;
    _kq2.setFromAxisAngle(_kax.set(0, 1, 0), b[3]);
    _km.compose(_kv.set(b[0], b[1] - e * 0.1, b[2]), _kq.clone().multiply(_kq2), _ks.set(b[4], b[4], b[4]));
    im.setMatrixAt(k, _km); im.instanceMatrix.needsUpdate = true;
  }
}
function nearbyColliders(out) {
  out.length = 0;
  const tx = Math.floor(car.x / TS), tz = Math.floor(car.z / TS);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const g = tiles.get((tx + dx) + ',' + (tz + dz)); if (g?.userData.cols) out.push(g.userData.cols); }
  const ci = Math.floor(carS / (CH * SP));
  for (let d = -1; d <= 1; d++) { const g = chunks.get(ci + d); if (g?.userData.cols) out.push(g.userData.cols); }
  return out;
}
const _lists = [], _hitDir = new THREE.Vector3();
let scrapeT = 0;
function updateCollisions(dt) {
  for (let i = falling.length - 1; i >= 0; i--) { const f = falling[i]; f.t += dt * 2.2; applyFall(f); if (f.t >= 1) falling.splice(i, 1); }
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), CR = (PC ? PC.W : 1.8) / 2 + 0.05, OFF = (PC ? PC.L : 4.3) / 2 - CR;
  const speed = Math.abs(car.v);
  for (const list of nearbyColliders(_lists)) for (const c of list) {
    if (c.kind !== 'solid' && broken.has(c.id)) continue;
    for (const off of [OFF, OFF / 3, -OFF / 3, -OFF]) { // car = circles along its length
      const px = car.x + fx * off, pz = car.z + fz * off;
      const dx = px - c.x, dz = pz - c.z, d2 = dx * dx + dz * dz, rr = c.r + CR;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 0.001, nx = dx / d, nz = dz / d;
      if (c.kind !== 'solid') {                          // breakable: knock it over and lose a bit of speed
        if (speed < 1) break;
        knockDown(c, _hitDir.set(fx * Math.sign(car.v), 0, fz * Math.sign(car.v)));
        car.v *= c.kind === 'squash' ? 0.9 : c.r > 0.2 ? 0.8 : 0.93;
        car.shake = Math.max(car.shake, c.kind === 'squash' ? 0.15 : 0.35);
        audio.knock(c.kind === 'squash' ? 0.4 : 0.8);
        break;
      }
      // solid: push the car out and kill the speed going into the obstacle
      const pen = rr - d;
      car.x += nx * pen; car.z += nz * pen;
      const vn = (fx * nx + fz * nz) * car.v;           // velocity along the contact normal (negative = into it)
      if (vn < -0.3) {
        const head = Math.abs(fx * nx + fz * nz);
        const impact = -vn;
        if (head > 0.75 && impact > 3) car.v = -Math.sign(car.v) * impact * 0.12; // head-on: bounce back
        else car.v *= 1 - head * 0.85;                                            // glancing: slide along
        car.yaw += (fx * nz - fz * nx) * (1 - head) * 0.15 * Math.sign(car.v || 1);
        car.shake = Math.max(car.shake, Math.min(1, impact / 12));
        if (impact > 2.5) { audio.crash(Math.min(1, impact / 15)); if (impact > 7) toast('ชน!'); }
      }
    }
  }
  // guard rails: a continuous wall at the road edge on the valley side
  const ci = Math.floor(carS / (CH * SP)), si = Math.round(carS / SP);
  for (const sd of [1, -1]) {
    const edge = ROAD_HALF + 0.85, lat = sd * carL;
    if (lat < edge - 0.9 || lat > edge + 1.2) continue;
    let has = false;
    for (let d = -1; d <= 1 && !has; d++) { const g = chunks.get(ci + d); if (g?.userData.rails?.[sd]?.has(si)) has = true; }
    if (!has) continue;
    const pen = lat - (edge - 0.9);
    const r = roadAtZ(car.z, {}), lx = Math.cos(r.h), lz = -Math.sin(r.h);
    car.x -= lx * sd * pen; car.z -= lz * sd * pen;
    const into = (Math.sin(car.yaw - r.h)) * sd * Math.sign(car.v); // heading toward the rail?
    if (into > 0.02) {
      car.yaw -= into * sd * Math.sign(car.v) * 0.5;
      const impact = Math.abs(car.v) * into;
      car.v *= 1 - Math.min(0.6, into * 1.5);
      car.shake = Math.max(car.shake, Math.min(0.8, impact / 8));
      if (impact > 2) audio.crash(Math.min(1, impact / 12));
    }
    scrapeT -= dt; if (scrapeT <= 0 && Math.abs(car.v) > 3) { audio.scrape(); scrapeT = 0.25; }
  }
}

// ---------------- Physics ----------------
const _ar = {};
let apHold = 0.2, crHold = 0;
function updateCar(dt) {
  // inputs
  let thr = 0, brk = 0, steerIn = 0;
  if (S.autopilot) {
    const look = Math.max(14, car.v * 1.1);
    const tgt = roadAtS(carS + look, _ar);
    const tx = tgt.x + Math.cos(tgt.h) * 1.9, tz = tgt.z - Math.sin(tgt.h) * 1.9;
    const want = Math.atan2(tx - car.x, tz - car.z);
    let d = want - car.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    steerIn = clamp(d * 3.2, -1, 1);
    const h1 = roadAtS(carS + 30, _ar).h, h2 = roadAtS(carS + 110, _ar).h;
    const setV = S.setSpeed / 3.6;
    const bend = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1))) / 80;    // heading change per metre ahead
    const vCurve = Math.sqrt(3.5 / Math.max(bend, 1e-4));                          // keep sideways pull near 0.35 g
    const vt = Math.min(setV, clamp(vCurve, 12, 75)) * (W.snow > 0.5 ? 0.8 : 1); // never above the set speed, slower in bends
    const acc = accTarget(vt);
    const vt2 = acc.v;
    // throttle: proportional plus a slowly learned 'holding' amount, so drag at high speed cannot leave it a few km/h short
    const err = vt2 - car.v;
    apHold = clamp(apHold + err * dt * 0.06, 0, 0.9);
    if (car.v > vt2 + 0.8) { brk = clamp((car.v - vt2) * 0.22 + (acc.close ? 0.45 : 0), 0, 1); apHold *= 0.98; }
    else thr = clamp(err * 0.45 + apHold, 0, 1);
    if (car.gear < 2) car.gear = 2;
  } else {
    const padOn = performance.now() - pad.t < 1200;
    thr = Math.max(K('KeyW', 'ArrowUp') ? 1 : 0, touch.gas, padOn ? pad.gas : 0);
    brk = Math.max(K('KeyS', 'ArrowDown') ? 1 : 0, touch.brake, padOn ? pad.brake : 0);
    if (K('Space')) brk = 1;
    // cruise control: holds the set speed; accelerator overrides, any brake cancels
    if (S.cruise) {
      if (brk > 0.1) setCruise(false, 'ยกเลิกครูซคอนโทรล (เบรก)');
      else if (car.gear === 0 || car.gear === 1) setCruise(false);
      else {
        const acc = accTarget(S.setSpeed / 3.6);           // adaptive: follow a slower car ahead
        const err = acc.v - car.v;
        crHold = clamp(crHold + err * dt * 0.06, 0, 0.9);
        const hold = acc.v < 0.5 ? 0 : clamp(err * 0.45 + 0.12 + crHold, 0, 1);
        if (thr < 0.05) {                                   // driver not pressing the accelerator
          thr = hold;
          if (err < -1.2) brk = clamp(-err * (acc.active ? 0.12 : 0.05) + (acc.close ? 0.4 : 0), 0, acc.active ? 0.8 : 0.25);
          if (acc.v < 0.5 && car.v < 0.6) { brk = 1; }     // hold at standstill behind a stopped car
        }
      }
    }
    steerIn = (K('KeyA', 'ArrowLeft') ? 1 : 0) - (K('KeyD', 'ArrowRight') ? 1 : 0);
    if (touch.steerActive) steerIn = touch.steer;
    else if (performance.now() - pad.t < 1200 && (Math.abs(pad.steer) > 0.01 || !(K('KeyA', 'ArrowLeft') || K('KeyD', 'ArrowRight')))) steerIn = pad.steer;
    else if (S.tilt) steerIn = touch.tiltSteer;
  }
  if (haunt.fx.stall > 0.5) thr = 0;                 // the engine has died on the haunted road
  const kb = !touch.steerActive && !S.tilt && !S.autopilot && performance.now() - pad.t > 1200;
  // keys are on/off: ease in, and use less lock the faster we go so a tap is a gentle correction
  if (kb) steerIn /= 1 + Math.abs(car.v) * 0.045;
  const rate = kb ? (steerIn === 0 ? 3.5 : 1.3) : 10;
  car.steer += clamp(steerIn - car.steer, -rate * dt, rate * dt);

  // automatic gearbox: D / R logic
  const av = Math.abs(car.v);
  if (car.auto && !S.autopilot) {
    if (car.gear >= 2 && brk > 0.5 && thr === 0 && av < 0.3) { car.revTimer += dt; if (car.revTimer > 0.45) { car.gear = 0; car.revTimer = 0; toast('เกียร์ R (ถอยหลัง) — กดคันเร่งค้างไว้เพื่อถอย'); } }
    else if (car.gear === 0 && brk > 0.5 && thr === 0 && av < 0.3) { car.revTimer += dt; if (car.revTimer > 0.45) { car.gear = 2; car.revTimer = 0; toast('เกียร์ D'); } }
    else car.revTimer = 0;
    if (car.gear === 0) { /* in reverse: W accelerates backward, S brakes */ }
  }
  // auto shifting
  const wheelRpm = av / CV.WR * 60 / (2 * Math.PI);
  car.shiftT = Math.max(0, car.shiftT - dt);
  if ((car.auto || S.autopilot) && car.gear >= 2 && car.shiftT <= 0) {
    const r = wheelRpm * GEARS[car.gear] * CV.FINAL;
    const up = CV.REDLINE * (0.36 + 0.53 * thr), down = CV.REDLINE * (0.17 + 0.24 * thr);
    if (r > up && car.gear < 7) { car.gear++; car.shiftT = 0.35; }
    else if (r < down && car.gear > 2) { car.gear--; car.shiftT = 0.25; }
  }
  // turbo lag: boost needs exhaust flow, so it builds slowly at low rpm and collapses quickly off throttle
  if (CAR.turbo) {
    const rr = car.rpm / CV.REDLINE, tgt = Math.min(1, thr * 1.4) * clamp((rr - 0.25) / 0.35, 0, 1);
    const spool = 0.35 + 1.6 * clamp((rr - 0.25) / 0.5, 0, 1);              // ~2.5 s to boost at low rpm, ~0.5 s high up
    car.boost += (tgt - car.boost) * Math.min(1, dt * (tgt > car.boost ? spool : 5));
  } else car.boost = 0;
  // engine rpm
  const ratio = GEARS[car.gear];
  let F = 0;
  const driven = wheelRpm * Math.abs(ratio) * CV.FINAL;
  let target;
  if (car.gear === 1 || car.shiftT > 0) target = CV.IDLE + thr * (CV.REDLINE - 1000) * (car.gear === 1 ? 1 : 0.3) + (car.shiftT > 0 ? driven * 0.8 : 0);
  else target = Math.max(driven, CV.IDLE + thr * CV.REDLINE * 0.27 * clamp(1 - driven / (CV.REDLINE * 0.33), 0, 1));
  car.rpm += (target - car.rpm) * Math.min(1, dt * (car.gear === 1 ? 6 : 14));
  if (car.rpm > CV.REDLINE) car.rpm = CV.REDLINE - 150 * Math.random();
  if (car.gear !== 1 && car.shiftT <= 0) {
    const limiter = driven >= CV.REDLINE ? 0 : 1;
    F += torque(car.rpm) * thr * limiter * ratio * CV.FINAL / CV.WR * 0.9 * (CAR.turbo ? 0.6 + 0.4 * car.boost : 1); // turbo: full pull only once spooled
    if (thr < 0.05 && av > 0.5) F -= Math.sign(car.v) * (driven / CV.REDLINE) * 1400 * (CV.MASS / 1300) * Math.sqrt(Math.abs(ratio) / 3.6);
  }
  // in auto D with brake held at standstill: hold
  if (brk > 0) { if (av < 0.4 && thr === 0) { car.v = 0; } else F -= Math.sign(car.v) * brk * 11000 * (CV.MASS / 1300); }
  F -= Math.sign(car.v) * (CAR.drag * car.v * car.v + 170 * (CV.MASS / 1300));
  if (car.offroad > 0) F -= Math.sign(car.v) * car.offroad * (500 + 1.3 * car.v * car.v) * (CAR.awd ? 0.55 : 1); // 4WD copes better off the tarmac
  const before = car.v;
  car.v += (F / CV.MASS) * dt;
  if (before !== 0 && Math.sign(before) !== Math.sign(car.v) && (brk > 0 || thr === 0)) car.v = 0;
  if (av < 0.05 && thr === 0) car.v = 0;
  car.throttle = thr; car.brake = brk;

  // steering kinematics
  const maxA = 0.6 / (1 + av * 0.085);
  const grip = 8.5 / Math.max(av, 1); // tyres hold ~0.85 g of cornering
  const yawRate = clamp(car.v * Math.tan(car.steer * maxA) / 2.6, -grip, grip);
  car.yaw += yawRate * dt;
  car.x += Math.sin(car.yaw) * car.v * dt;
  car.z += Math.cos(car.yaw) * car.v * dt;
  car.odo += av * dt;

  // road relation
  const r = roadAtZ(car.z, _ar);
  carS = r.s; carL = (car.x - r.x) * Math.cos(r.h);
  const aL = Math.abs(carL);
  car.offroad = aL > ROAD_HALF + 0.3 ? clamp((aL - ROAD_HALF) / 2, 0, 1) : 0;
  if (aL > 320) { car.x -= Math.sign(carL) * (aL - 320) / Math.cos(r.h); car.v *= 0.95; }

  // ground following
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), sx = Math.cos(car.yaw), sz = -Math.sin(car.yaw);
  const hf = groundAt(car.x + fx * 1.4, car.z + fz * 1.4), hb = groundAt(car.x - fx * 1.4, car.z - fz * 1.4);
  const hl = groundAt(car.x + sx * 0.8, car.z + sz * 0.8), hr = groundAt(car.x - sx * 0.8, car.z - sz * 0.8);
  const gy = (hf + hb + hl + hr) / 4;
  car.y += (gy - car.y) * Math.min(1, dt * 18);
  if (car.y < gy - 0.3) car.y = gy - 0.3;
  const tp = -Math.atan2(hf - hb, 2.8), tr = Math.atan2(hl - hr, 1.6);
  const acc = (car.v - (car.prevV ?? car.v)) / Math.max(dt, 1e-3); car.prevV = car.v;
  car.pitch += (tp - acc * 0.004 - car.pitch) * Math.min(1, dt * 8);
  car.roll += (tr + yawRate * car.v * 0.0035 - car.roll) * Math.min(1, dt * 8);
  car.shake = Math.max(0, car.shake - dt * 1.5);
}

// ---------------- Environment update ----------------
const SKY = {
  topDay: C(0.2, 0.43, 0.86), horDay: C(0.7, 0.82, 0.96), topNight: C(0.006, 0.01, 0.03), horNight: C(0.025, 0.035, 0.075),
  topDusk: C(0.22, 0.22, 0.48), horDusk: C(1.0, 0.52, 0.28), glowDusk: C(1.0, 0.42, 0.16), cloudDusk: C(1.0, 0.58, 0.42),
};
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color(), _land = new THREE.Color(), _sunCol = new THREE.Color(), _duskCol = new THREE.Color();
const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3(), lightDir = new THREE.Vector3();
const _bp2 = {};
const ENV = { top: _c1, hor: _c2, sunDir, moonDir, sunCol: _sunCol, duskCol: _duskCol, duskCloud: SKY.cloudDusk, land: _land, cam: camWorld };
let overAmt = 0, lightsOn = false;
function updateEnv(dt, time) {
  S.tod = (S.tod + dt * S.timeScale / 720) % 1; // 12 min per day at x1
  const a = (S.tod - 0.25) * Math.PI * 2;
  sunDir.set(-Math.cos(a) * 0.85, Math.sin(a), 0.4).normalize();
  moonDir.set(-sunDir.x * 0.8, -sunDir.y, 0.55).normalize();
  const e = sunDir.y;
  dayAmt = sstep(-0.1, 0.22, e); nightAmt = 1 - dayAmt;
  const dusk = clamp(1 - Math.abs(e + 0.02) / 0.26, 0, 1);

  // weather from the current regions
  const { idx, t } = regionIdx(carS);
  const wa = weatherOf(idx), wb = weatherOf(idx + 1);
  const p = blendParams(carS, _bp2);
  const autoCloud = lerp(0.35 + 0.65 * hash1(idx * 3 + 1), 0.35 + 0.65 * hash1(idx * 3 + 4), t) * (1 - p.mesa * 0.5);
  const P = WX[S.wx] || WX.auto, auto = !WX[S.wx] || S.wx === 'auto';
  for (const k in wxCur) {
    const tgt = auto ? (k in W ? (wa === k ? 1 - t : 0) + (wb === k ? t : 0) : k === 'cloud' ? autoCloud : 0) : (P[k] ?? (k === 'cloud' ? 0.5 : 0));
    wxCur[k] = wxInit ? wxCur[k] + (tgt - wxCur[k]) * Math.min(1, dt * 0.7 + (S.paused ? 0 : 0)) : tgt;
    if (k in W) W[k] = wxCur[k];
  }
  wxInit = true;
  const fog = Math.max(wxCur.fog, haunt.level * 0.6);
  const over = (overAmt = clamp(W.rain * 0.8 + W.snow * 0.5 + wxCur.overX, 0, 1));
  const cloudiness = wxCur.cloud;

  _c1.copy(SKY.topNight).lerp(SKY.topDay, dayAmt).lerp(SKY.topDusk, dusk * 0.5);
  _c2.copy(SKY.horNight).lerp(SKY.horDay, dayAmt).lerp(SKY.horDusk, dusk * 0.55);
  _c3.setRGB(p.haze[0], p.haze[1], p.haze[2], THREE.SRGBColorSpace).multiplyScalar(0.05 + 0.95 * dayAmt);
  _c2.lerp(_c3, 0.3 * (1 - dusk));
  const grey = _c3.setRGB(0.52, 0.55, 0.6, THREE.SRGBColorSpace).multiplyScalar(0.04 + 0.96 * dayAmt);
  _c1.lerp(grey, over * 0.88); _c2.lerp(grey, over * 0.82);
  _sunCol.setRGB(1, 0.72 + 0.26 * sstep(0, 0.4, e), 0.45 + 0.5 * sstep(0, 0.4, e), THREE.SRGBColorSpace).multiplyScalar((1 - over * 0.9) * sstep(-0.06, 0.02, e));
  _duskCol.copy(SKY.glowDusk).multiplyScalar(1.3 * (1 - over * 0.8));
  _land.setRGB(p.grass[0], p.grass[1], p.grass[2], THREE.SRGBColorSpace).multiplyScalar(0.32).lerp(C(0.2, 0.26, 0.36), 0.35);
  if (p.mesa > 0) _land.lerp(C(0.55, 0.3, 0.2), p.mesa * 0.6);
  if (fog > 0.001) { // mist / fog: pale grey that swallows the sky and the distance
    const fg = _c3.setRGB(0.66, 0.69, 0.72, THREE.SRGBColorSpace).multiplyScalar(0.05 + 0.95 * dayAmt).lerp(SKY.horDusk, dusk * 0.25 * (1 - fog));
    _c1.lerp(fg, fog * 0.75); _c2.lerp(fg, Math.min(1, fog * 1.1));
  }
  if (haunt.level > 0.01) { const hc = _c3.setRGB(0.05, 0.1, 0.08, THREE.SRGBColorSpace).multiplyScalar(0.4 + 0.6 * dayAmt); _c2.lerp(hc, haunt.level * 0.7); _c1.lerp(hc, haunt.level * 0.5); }
  scene.fog.color.copy(_c2);
  const fogFar = lerp(1150, lerp(430, 300, W.snow / Math.max(0.01, W.snow + W.rain)), Math.min(1, W.rain * 0.8 + W.snow * 0.5 + wxCur.overX * 0.3));
  const fs = Math.sqrt(fog);
  scene.fog.near = lerp(lerp(180, 25, over), 0, fs); scene.fog.far = lerp(fogFar, 65, fs) * (0.8 + 0.2 * dayAmt);

  // key light: sun by day, moon by night (same light so the shadow map is shared)
  const sunI = 3.1 * sstep(-0.02, 0.12, e) * (1 - over * 0.72);
  const moonI = 0.5 * sstep(0.0, -0.12, e) * (1 - over * 0.6);
  if (e > -0.02) { lightDir.copy(sunDir); sun.intensity = sunI; sun.color.setRGB(1, 0.6 + 0.38 * sstep(0, 0.3, e), 0.36 + 0.56 * sstep(0, 0.3, e), THREE.SRGBColorSpace); }
  else { lightDir.copy(moonDir); sun.intensity = moonI; sun.color.setRGB(0.62, 0.72, 1.0, THREE.SRGBColorSpace); }
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  const cx = Math.round(car.x + fx * 45), cy = Math.round(car.y), cz = Math.round(car.z + fz * 45);
  sun.target.position.set(cx, cy, cz);
  sun.position.set(cx + lightDir.x * 420, cy + Math.max(0.05, lightDir.y) * 420, cz + lightDir.z * 420);
  hemi.color.copy(_c1).lerp(_c2, 0.6); hemi.groundColor.setRGB(0.3, 0.27, 0.2, THREE.SRGBColorSpace).lerp(_land, 0.3).multiplyScalar(0.12 + 0.88 * dayAmt);
  hemi.intensity = 0.3 + 0.95 * dayAmt + over * 0.4 * dayAmt + dusk * 0.25;
  renderer.toneMappingExposure = lerp(1.75, 1.0, dayAmt) + over * 0.12;

  lightsOn = S.lights === 1 || (S.lights === 0 && (dayAmt < 0.55 || over > 0.6 || !!inTunnel(carS, 20)));
  glbMats.light.emissive.setRGB(lightsOn ? 1.6 : 0, lightsOn ? 1.55 : 0, lightsOn ? 1.4 : 0); glbMats.tail.emissive.setRGB(lightsOn ? 0.9 : 0.05, 0, 0);
  const hk = haunt.fx.lights; // flickers / dies on a haunted road
  headL.intensity = lightsOn && !S.garage ? 900 * hk : 0; headL2.intensity = lightsOn && !S.garage ? 160 * hk : 0;
  if (hk < 1 && lightsOn) glbMats.light.emissive.multiplyScalar(hk);
  const lampOn = sstep(0.6, 0.2, dayAmt);
  lampGlowMat.opacity = lampOn * 0.6 * haunt.fx.lamps; lampGlowMat.color.setRGB(1, 0.78, 0.5, THREE.SRGBColorSpace).multiplyScalar(1 + lampOn * 1.5);
  bulbMat.color.setRGB(0.35 + 0.65 * lampOn, 0.35 + 0.5 * lampOn, 0.35 + 0.2 * lampOn, THREE.SRGBColorSpace).multiplyScalar(1 + lampOn * 4);
  tGlowMat.opacity = 0.12 + 0.88 * nightAmt; tGlowMat.color.setScalar(0.6 + nightAmt * 2.9);
  catEyeMat.opacity = lightsOn ? 0.5 + 0.5 * nightAmt : 0; catEyeMat.color.setRGB(1, 0.7, 0.25, THREE.SRGBColorSpace).multiplyScalar(2.5);
  reflMat.color.setRGB(1, 0.55, 0.1, THREE.SRGBColorSpace).multiplyScalar(0.6 + 0.4 * dayAmt + (lightsOn ? 1.5 * nightAmt : 0));
  interior.glowMat.color.setRGB(1, 0.55, 0.2, THREE.SRGBColorSpace).multiplyScalar(0.12 + 0.9 * nightAmt);
  interior.screen.color.setRGB(0.1, 0.25, 0.45, THREE.SRGBColorSpace).multiplyScalar(0.06 + 0.25 * nightAmt);
  // wet road in the rain
  roadMat.roughness = lerp(0.88, 0.28, W.rain); roadMat.color.setScalar(1 - 0.38 * W.rain);
  wind.uTime.value = time; wind.uStrength.value = 0.8 + over * 1.4 + p.coast * 0.6 + wxCur.wind * 1.6;
  if (GPU) { gpuWind.time.value = wind.uTime.value; gpuWind.strength.value = wind.uStrength.value; gpuSun.dir.value.copy(lightDir).normalize(); gpuSun.col.value.set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(sun.intensity); }

  { const tu = tunnelNear(carS, 1500); sky.sea.visible = !(tu && tu.kind === 'under'); }   // town underpasses dip below sea level: no sea there
  sky.update(Object.assign(ENV, {
    night: nightAmt * (1 - over), time, dusk, over, day: dayAmt, dt, groundY: car.y, mount: clamp(p.mount / 380, 0, 1),
    coast: p.coast, snow: p.snow, cloudiness, fog, regA: p.a.key, regB: p.b.key, regT: p.t,
  }));
  envGroundMat.color.copy(_land).multiplyScalar(0.25 + 0.75 * dayAmt).lerp(_c2, 0.3);
  updateEnvMap(Math.abs(dt * S.timeScale) + 0.016, !envRT);
  fireflies.update(time, camWorld, car.y, nightAmt * (1 - over) * (1 - p.snow) * (1 - p.mesa * 0.8));
  birds.update(dt, time, camWorld, car.yaw, dayAmt > 0.6 && over < 0.2 && p.snow < 0.5);
}

// ---------------- Camera ----------------
const camPos = new THREE.Vector3();
let dropAmt = 0, lastWipe = 0;
function updateCamera(dt, time) {
  rig.position.set(car.x, car.y, car.z);
  rig.rotation.set(car.pitch, car.yaw, car.roll, 'YXZ');
  const targetYaw = LOOKS[S.look] + S.freeYaw;
  S.lookYaw += (targetYaw - S.lookYaw) * Math.min(1, dt * 7);
  S.lookPitch += (S.freePitch - S.lookPitch) * Math.min(1, dt * 7);
  const cockpit = S.camMode === 0;
  interior.grp.visible = cockpit || (S.camMode === 2 && !!glbCar); // seats and dash show through the windows from outside
  interior.hood.visible = S.camMode !== 2 && !glbCar;
  exterior.visible = S.camMode === 2 || !!glbCar;   // a Blender body is seen from inside too
  shadowProxy.visible = S.camMode !== 2 && !glbCar;
  if (glbTub) glbTub.visible = !cockpit;
  for (const q of glbMirrors) q.visible = !cockpit;           // the roadster's cockpit cover is only for the outside view
  const shake = car.shake * 0.04 + car.offroad * Math.min(1, Math.abs(car.v) / 15) * 0.012 + haunt.fx.shake * 0.06;
  const jx = (Math.random() - 0.5) * shake, jy = (Math.random() - 0.5) * shake;
  // subtle head bob from road speed
  const bob = Math.sin(time * 9) * 0.0025 * Math.min(1, Math.abs(car.v) / 25);
  if (fly.on && !S.garage) {
    interior.grp.visible = !!glbCar; interior.hood.visible = false; exterior.visible = true; shadowProxy.visible = false;
    if (glbTub) glbTub.visible = true; for (const q of glbMirrors) q.visible = true;
    const sp = (KF('ShiftLeft', 'ShiftRight') ? 4 : 1) * (KF('ControlLeft') ? 0.25 : 1) * 22 * dt;
    const fx = Math.sin(fly.yaw) * Math.cos(fly.pitch), fz = Math.cos(fly.yaw) * Math.cos(fly.pitch), fy = Math.sin(fly.pitch);
    const rx = Math.cos(fly.yaw), rz = -Math.sin(fly.yaw);
    const f = (KF('KeyW', 'ArrowUp') ? 1 : 0) - (KF('KeyS', 'ArrowDown') ? 1 : 0), r = (KF('KeyD', 'ArrowRight') ? 1 : 0) - (KF('KeyA', 'ArrowLeft') ? 1 : 0);
    const u = (KF('Space', 'KeyE') ? 1 : 0) - (KF('KeyQ') ? 1 : 0);
    fly.x += (fx * f - rx * r) * sp; fly.z += (fz * f - rz * r) * sp; fly.y += (fy * f + u) * sp;
    fly.y = Math.max(fly.y, groundAt(fly.x, fly.z) + 0.4);
    camera.position.set(fly.x, fly.y, fly.z);
    camera.rotation.set(fly.pitch, fly.yaw + Math.PI, 0, 'YXZ');
    camera.fov = 60; camera.updateProjectionMatrix(); camera.getWorldPosition(camWorld);
    return;
  }
  if (S.garage) {
    interior.grp.visible = false; interior.hood.visible = false; exterior.visible = true; shadowProxy.visible = false;
    if (gDrag === null) gYaw += dt * 0.25;
    const R = PC.L * 0.95 + 2.2;
    head.position.set(0, 0, 0); head.rotation.set(0, 0, 0);
    camera.position.set(Math.sin(gYaw) * R, 1.25 - CAR.seat + PC.L * 0.08, Math.cos(gYaw) * R);
    camera.lookAt(head.localToWorld(camPos.set(0, 0.55 - CAR.seat, 0)));
    camera.rotateY(-0.3); // keep the car left of the side panel
    camera.fov = 45; camera.updateProjectionMatrix(); camera.getWorldPosition(camWorld);
    return;
  }
  if (S.camMode === 2) {
    head.position.set(0, 1.4, 0);
    head.rotation.set(0, S.lookYaw, 0, 'YXZ');
    camera.position.set(0, 1.8 + CAR.seat * 0.8 - S.lookPitch * 3, -(PC.L / 2 + 5));
    camera.rotation.set(0, Math.PI, 0); camera.lookAt(head.localToWorld(camPos.set(0, 0.2, 3)));
    camera.fov = 65;
  } else {
    const back = Math.abs(S.lookYaw) > 2.2 ? sstep(2.2, 3.0, Math.abs(S.lookYaw)) : 0;
    if (cockpit) head.position.set(-0.37 + back * 0.22 + jx, 1.22 + back * 0.04 + jy + bob, -0.05 - back * 0.05);
    else head.position.set(jx, 1.12 + jy, 1.9);
    head.rotation.set(-S.lookPitch, S.lookYaw, 0, 'YXZ');
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, Math.PI, 0);
    camera.fov = cockpit ? cockFov : 72;   // narrower from the driver's seat: the windscreen fills the view (player setting)
  }
  camera.updateProjectionMatrix();
  camera.getWorldPosition(camWorld);
  if (exterior.visible) for (const w of wheels) { w.w.rotation.x += car.v / PC.r * dt; if (w.front) w.piv.rotation.y = car.steer * 0.5; }
  // steering wheel, wipers and rain drops on the windscreen
  interior.wheel.rotation.z = -car.steer * 2.0;
  const wet = Math.max(W.rain, W.snow * 0.5);
  const wipe = wet > 0.15 || haunt.fx.wipe ? (Math.sin(time * 2.6 - Math.PI / 2) * 0.5 + 0.5) : 0;
  interior.wipers.forEach((w) => (w.rotation.z = wipe * 1.7));
  dropAmt = Math.min(0.9, dropAmt + dt * wet * 0.55);
  if (wipe > 0.97 && time - lastWipe > 1) { lastWipe = time; dropAmt *= 0.15; interior.drops.material.map.offset.set(Math.random(), Math.random()); }
  if (wet < 0.05) dropAmt = Math.max(0, dropAmt - dt * 0.2);
  if (haunt.rider.visible) fitRider();
  const dropOp = dropAmt * 0.5 * (0.35 + 0.65 * dayAmt) * (W.snow > W.rain ? 0.6 : 1);
  const onGlass = !!(glassDrops && COCK[carType] && glbCar?.parent);       // model cockpit: drops live on the real windscreen shape
  interior.drops.material.opacity = onGlass ? 0 : dropOp;
  interior.drops.visible = dropAmt > 0.01 || haunt.fx.hands > 0;
  if (glassDrops) {
    glassDrops.visible = onGlass && dropAmt > 0.01 && S.camMode === 0;
    glassDrops.material.opacity = dropOp; glassDrops.material.map.offset.copy(interior.drops.material.map.offset);
  }
  handPrints.list.forEach((pm, k) => (pm.visible = haunt.fx.hands * 6 > k + 0.01)); handPrints.mat.opacity = (haunt.fx.handsFade ?? 1) * 0.9;
  for (const g of winGlass) { const tgt = S.winOpen ? -0.56 : 0; g.position.y += (0.93 + tgt - g.position.y) * Math.min(1, dt * 3); g.visible = g.position.y > 0.4 && !g.userData.off; }
}

// ---------------- Region banner ----------------
let lastRegion = -1;
function updateRegion() {
  const { idx, t } = regionIdx(carS);
  const cur = t > 0.5 ? idx + 1 : idx;
  if (cur !== lastRegion) {
    lastRegion = cur;
    const R = regionAt(cur);
    const w = weatherOf(cur);
    hud.region(R.name, R.season, w);
  }
}

// ---------------- Side mirrors ----------------
let sideOn = null, sideFrame = 0;
function renderSideMirrors() {
  const on = S.mirror === 2 && S.camMode === 0 && S.started;
  if (on !== sideOn) {
    sideOn = on;
    for (const m of sideMirrors) { m.face.material.map = on ? m.rt.texture : null; m.face.material.color.copy(on ? new THREE.Color(0xffffff) : m.staticColor); m.face.material.needsUpdate = true; }
  }
  if (!on) { for (const m of sideMirrors) m.face.material.color.copy(m.staticColor).multiplyScalar(0.12 + 0.6 * dayAmt); return; }   // a dull grey glass, dark at night
  sideFrame++;
  const vis = [interior.grp.visible, interior.hood.visible, exterior.visible];
  interior.grp.visible = false; interior.hood.visible = false; exterior.visible = true; // see our own car's flank, like a real mirror
  if (GPU) plantLodFar();
  for (let i = 0; i < sideMirrors.length; i++) {
    const m = sideMirrors[i];
    // skip a mirror the driver is not looking toward; alternate frames on lower quality
    const yawToMirror = m.side > 0 ? S.lookYaw > -0.5 : S.lookYaw < 0.5;
    if (!yawToMirror || (qi < 2 && (sideFrame + i) % 2)) continue;
    renderer.setRenderTarget(m.rt);
    renderer.render(scene, m.cam);
  }
  renderer.setRenderTarget(null); if (GPU) updatePlantLod();
  interior.grp.visible = vis[0]; interior.hood.visible = vis[1]; exterior.visible = vis[2];
}

// ---------------- Main loop ----------------
renderer.shadowMap.autoUpdate = false;
function boot() {
  setupAssets();
  haunt.setSprites({ ...Object.fromEntries(['nak', 'tani', 'krasue', 'krahang', 'pret', 'rider', 'face', 'yai_face'].filter((k) => IMG['ghost_' + k]).map((k) => [k, spriteTex('ghost_' + k, renderer)])), yai: IMG.ghost_yai_1 && IMG.ghost_yai_2 ? [spriteTex('ghost_yai_1', renderer), spriteTex('ghost_yai_2', renderer)] : null });
  applyCar(carType, paintIdx, false);
  placeCar(160);
  ensureS(3000);
  applyQuality(true);
  hud.val('gearbox', car.auto ? 'อัตโนมัติ' : 'ธรรมดา'); hud.val('mirror', ['ปิด', 'หลัง', 'หลัง+ข้าง'][S.mirror]);
  if (!WX[S.wx]) S.wx = 'auto';
  hud.val('ghosts', haunt.enabled ? 'เปิด' : 'ปิด'); hud.btn('ghosts', haunt.enabled);
  document.querySelectorAll('[data-wx]').forEach((e) => e.classList.toggle('active', e.dataset.wx === S.wx));
  document.querySelectorAll('[data-tod]').forEach((e) => e.classList.toggle('active', e.dataset.tod === S.todSel));
  hud.val('wx', WX[S.wx].name.replace(' (ตามโซน)', ''));
  updateChunks(); updateTiles(true);
  requestAnimationFrame(frame);
}
// WebGPU: a render pass clears the whole canvas even with a scissor, and a second pass can't draw over a multisampled frame,
// so the rear-view mirror is rendered into a texture and shown on a quad held just in front of the camera (one frame late)
let mirRT = null, mirQuad = null;
function gpuMirror(r, on) {
  if (!on) { if (mirQuad) mirQuad.visible = false; return; }
  const dpr = renderer.getPixelRatio(), w = Math.max(2, Math.round(r.w * dpr)), h = Math.max(2, Math.round(r.h * dpr));
  if (!mirRT) {
    mirRT = new THREE.RenderTarget(w, h, { samples: 4 });
    mirQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicNodeMaterial({ map: mirRT.texture, depthTest: false, depthWrite: false, fog: false }));
    mirQuad.renderOrder = 9999; mirQuad.frustumCulled = false; camera.add(mirQuad);
  }
  if (mirRT.width !== w || mirRT.height !== h) mirRT.setSize(w, h);
  mirQuad.visible = false;
  plantLodFar(); renderer.setRenderTarget(mirRT); renderer.render(scene, mirrorCam); renderer.setRenderTarget(null); updatePlantLod();
  const dz = 0.1, hh = dz * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), hw = hh * camera.aspect;
  mirQuad.position.set(((r.x + r.w / 2) / innerWidth * 2 - 1) * hw, (1 - (r.y + r.h / 2) / innerHeight * 2) * hh, -dz);
  mirQuad.scale.set(r.w / innerWidth * 2 * hw, r.h / innerHeight * 2 * hh, 1);
  mirQuad.visible = true;
}
let last = performance.now(), time = 0, envTime = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!gpuReady) { last = now; return; }
  const rdt = Math.min(0.05, (now - last) / 1000); last = now;
  let dt = S.paused ? 0 : rdt;
  time += dt; envTime += rdt;
  if (dt > 0) {
    updateCar(dt);
    updateCollisions(dt);
    updateBlink(dt);
    updateHorn(dt);
    updateTraffic(dt);
  }
  updateCamera(rdt, envTime);
  updateEnv(dt, envTime);
  if (S.started) haunt.update(dt, { carL, cam: camWorld, town: blendParams(carS, _bpH).shops > 0.3, carS, night: nightAmt, lookBack: S.camMode === 0 && Math.abs(S.lookYaw) > 2.2, lookYaw: S.camMode === 0 ? S.lookYaw : 0, open: !!CAR.open, carV: car.v, time: envTime });
  updateParticles(dt, envTime);
  updateChunks(); updateTiles(false); veg.update(carS); if (GPU) updatePlantLod();
  for (const r of rotors) r.rotation.z -= rdt * 1.1;
  updateRegion();
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderSideMirrors();
  renderer.shadowMap.needsUpdate = true;
  if (post.enabled) post.render(); else renderer.render(scene, camera);
  updateYtScreen();
  // rear-view mirror
  const mirrorOn = !S.garage && S.mirror > 0 && S.camMode === 0 && S.look === 0 && Math.abs(S.lookYaw) < 0.3 && S.started && !S.hideHud;
  hud.mirror(mirrorOn);
  if (GPU && !mirrorOn) gpuMirror(null, false);
  if (mirrorOn) {
    const r = hud.mirrorRect();
    const y = innerHeight - r.y - r.h;
    if (!GPU) { renderer.setScissorTest(true); renderer.setScissor(r.x, y, r.w, r.h); renderer.setViewport(r.x, y, r.w, r.h); }
    mirrorCam.aspect = r.w / r.h; mirrorCam.updateProjectionMatrix();
    const vis = [interior.grp.visible, interior.hood.visible], inside = haunt.rider.visible;
    if (inside) mirrorCam.position.set(0, 1.47 + cockOff.y, 0.32 + cockOff.z); // a real inside mirror only while someone is sitting behind you
    else { interior.grp.visible = false; interior.hood.visible = false; }
    if (GPU) gpuMirror(r, true); else renderer.render(scene, mirrorCam);
    if (inside) mirrorCam.position.set(0, 1.45 + CAR.seat, -PC.L / 2 - 0.1);
    interior.grp.visible = vis[0]; interior.hood.visible = vis[1];
    renderer.setScissorTest(false);
  }
  const hh = Math.floor(S.tod * 24), mm = Math.floor((S.tod * 24 - hh) * 60);
  hud.update({
    kmh: Math.abs(car.v) * 3.6, rpm: car.rpm, gear: gearName(), auto: car.auto, odo: car.odo / 1000,
    clock: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, day: dayAmt, autopilot: S.autopilot,
    rpmMax: Math.ceil(CV.REDLINE / 1000) + 1, redline: CV.REDLINE * 0.95, kmhMax: CAR.dial || 240,
    steer: car.steer, thr: car.throttle, brk: car.brake, cruise: S.cruise, setSpeed: (S.cruise || S.autopilot) ? S.setSpeed : 0, follow: (S.cruise || S.autopilot) && accFollow ? Math.max(0, leadGap) : -1, blinkL: car.blinkOn && (car.blink === 1 || car.blink === 2), blinkR: car.blinkOn && (car.blink === -1 || car.blink === 2),
  });
  audio.update({ rpm: car.rpm, thr: car.throttle, v: Math.abs(car.v), rain: W.rain, offroad: car.offroad, paused: S.paused || haunt.fx.stall > 0.5, boost: CAR.turbo ? car.boost : null });
}
loadAssets().then(boot);
window.__game = { ...(GPU ? { dbg: { renderer, scene, camera, post, THREE, fly, gov } } : {}), bridgeNear, groundAt, glbMats, interior, get glbCar() { return glbCar; }, get glassDrops() { return glassDrops; }, get smoothCabin() { return smoothCabin; }, haunt, tryGhosts, applyCar, CARS, setWeather, setTod, snapWx: () => { wxInit = false; }, car, S, W, placeCar, setCruise, adjustSpeed, spawnCar, traffic, setBlink, sky, IMG, broken, nearbyColliders, step: (dt) => { updateCar(dt); updateCollisions(dt); updateTraffic(dt); }, roadAtS, get carL() { return carL; }, get carS() { return carS; }, nextRegion, tiles, chunks, setQuality: (q) => { qi = q; applyQuality(); } };

// ---------------- frame-rate readout (top-left corner) ----------------
{
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:50;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,.55);color:#fff;font:600 13px/1.3 ui-monospace,Menlo,monospace;pointer-events:none';
  document.body.appendChild(el);
  let n = 0, t0 = performance.now(), worst = 0, last = t0;
  const tick = (t) => {
    n++; worst = Math.max(worst, t - last); last = t;
    if (t - t0 >= 500) {
      const fps = n * 1000 / (t - t0);
      el.textContent = `${Math.round(fps)} fps  (ช้าสุด ${worst.toFixed(0)} ms)` + (GPU && (gov.lod < 1 || gov.res < 1) ? `  รายละเอียด ${Math.round(gov.lod * 100)}%  ความคมชัด ${Math.round(gov.res * 100)}%` : '');
      // hold 30 fps or better: below 36 give detail up, above 52 take it back (resolution first, then plants)
      if (GPU && S.started && !S.paused && !document.hidden && worst < 400) {
        if (fps < 36) { if (gov.lod > 0.4) gov.lod = Math.max(0.4, gov.lod * (fps < 26 ? 0.75 : 0.88)); else gov.res = Math.max(0.5, gov.res * (fps < 26 ? 0.85 : 0.93)); }
        else if (fps > 52) { if (gov.res < 1) gov.res = Math.min(1, gov.res * 1.05); else gov.lod = Math.min(1, gov.lod * 1.05); }
        const want = Math.min(devicePixelRatio, QUALITY[qi].dpr) * gov.res;
        if (Math.abs(renderer.getPixelRatio() - want) > 1e-3) renderer.setPixelRatio(want);
      }
      n = 0; t0 = t; worst = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
