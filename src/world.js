// ===== World generation: noise, regions, endless road, terrain height =====
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const sstep = (a, b, x) => smooth((x - a) / (b - a));

export function hash2(x, z) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const hash1 = (x) => hash2(x, 912367);

export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}
export function fbm(x, z, o) {
  let s = 0, a = 1, n = 0;
  for (let i = 0; i < o; i++) { s += a * vnoise(x, z); n += a; a *= 0.5; x = x * 2.03 + 17.1; z = z * 2.03 - 9.7; }
  return s / n;
}
export function ridged(x, z, o) {
  let s = 0, a = 1, n = 0;
  for (let i = 0; i < o; i++) { const v = 1 - Math.abs(vnoise(x, z)); s += a * v * v; n += a; a *= 0.5; x = x * 2.05 + 31.7; z = z * 2.05 + 11.3; }
  return s / n;
}
export function noise1(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const a = hash1(i), b = hash1(i + 1);
  return (a + (b - a) * u) * 2 - 1;
}
const fbm1 = (x) => (noise1(x) + 0.5 * noise1(x * 2.1 + 5.3)) / 1.5;

// ---------- Regions (places / seasons) ----------
export const REGIONS = [
  { key: 'rice', dry: 0.05, power: 1, grassDen: 1, rails: 0, grassCol: [0.4, 0.62, 0.18], name: 'ทุ่งนาชนบท', season: 'ฤดูฝน', elev: 8, hill: 5, mount: 90, twist: 0.6, coast: 0, mesa: 0, paddy: 1, flowers: 0, snow: 0, snowline: 999, lamps: 1,
    grass: [0.38, 0.62, 0.18], grass2: [0.55, 0.7, 0.22], rock: [0.45, 0.42, 0.36], sand: [0.78, 0.7, 0.5], haze: [0.75, 0.82, 0.88],
    props: [['sugarpalm', 4, [[0.22, 0.4, 0.15], [0.28, 0.45, 0.18]]], ['roundtree', 2, [[0.22, 0.45, 0.16], [0.3, 0.52, 0.2]]], ['bush', 2, [[0.28, 0.5, 0.18]]], ['house', 0.5, [[0.7, 0.22, 0.14], [0.25, 0.3, 0.5], [0.55, 0.32, 0.18]]], ['house2', 0.45, [[0.95, 0.92, 0.82], [0.88, 0.94, 0.86], [0.96, 0.88, 0.78], [0.86, 0.9, 0.96]]], ['bamboo', 1.4, [[0.55, 0.7, 0.28], [0.45, 0.62, 0.25]]], ['banana', 1.2, [[0.42, 0.65, 0.22]]], ['chedi', 0.06, [[0.93, 0.92, 0.88], [0.9, 0.72, 0.3]]]],
    density: 0.32, weathers: [['clear', 0.45], ['rain', 0.55]] },
  { key: 'town', shops: 1, dry: 0.3, power: 0, grassDen: 0.35, rails: 0, grassCol: [0.45, 0.6, 0.25], name: 'ตัวเมืองเล็ก', season: 'ฤดูร้อน', elev: 4, hill: 2, mount: 70, twist: 0.35, coast: 0, mesa: 0, paddy: 0, flowers: 0, snow: 0, snowline: 999, lamps: 1,
    grass: [0.42, 0.58, 0.24], grass2: [0.55, 0.62, 0.3], rock: [0.5, 0.48, 0.45], sand: [0.75, 0.7, 0.6], haze: [0.82, 0.84, 0.86],
    props: [['house2', 3, [[0.95, 0.92, 0.82], [0.88, 0.94, 0.86], [0.96, 0.88, 0.78], [0.86, 0.9, 0.96], [0.98, 0.97, 0.95]]], ['roundtree', 1.5, [[0.25, 0.48, 0.18], [0.3, 0.52, 0.2]]], ['palm', 0.6, [[0.3, 0.55, 0.2]]], ['bush', 1, [[0.3, 0.52, 0.2]]], ['chedi', 0.04, [[0.93, 0.92, 0.88], [0.9, 0.72, 0.3]]]],
    density: 0.9, weathers: [['clear', 0.7], ['rain', 0.3]] },
  { key: 'coast', dry: 0.15, power: 1, grassDen: 0.6, rails: 0, grassCol: [0.42, 0.6, 0.22], name: 'ถนนเลียบชายทะเล', season: 'ฤดูร้อน', elev: 6, hill: 6, mount: 150, twist: 1.0, coast: 1, mesa: 0, paddy: 0, flowers: 0, snow: 0, snowline: 999, lamps: 1,
    grass: [0.32, 0.58, 0.22], grass2: [0.45, 0.65, 0.25], rock: [0.5, 0.46, 0.4], sand: [0.93, 0.85, 0.65], haze: [0.75, 0.86, 0.95],
    props: [['palm', 5, [[0.25, 0.55, 0.2], [0.32, 0.6, 0.22]]], ['bush', 2, [[0.3, 0.55, 0.22]]], ['rock', 1, [[0.55, 0.52, 0.48]]], ['house', 0.3, [[0.2, 0.45, 0.6], [0.8, 0.5, 0.2]]], ['banana', 0.8, [[0.42, 0.65, 0.22]]], ['boat', 0, [[0.2, 0.45, 0.7], [0.75, 0.2, 0.15], [0.95, 0.95, 0.92], [0.15, 0.55, 0.45]]]],
    density: 0.32, weathers: [['clear', 1]] },
  { key: 'islands', dry: 0.1, power: 0, grassDen: 0.55, rails: 0, grassCol: [0.4, 0.6, 0.22], name: 'ข้ามทะเลเกาะแก่ง', season: 'ฤดูร้อน', elev: 9, hill: 5, mount: 40, twist: 0.45, coast: 0, isl: 1, mesa: 0, paddy: 0, flowers: 0, snow: 0, snowline: 999, lamps: 1,
    grass: [0.34, 0.58, 0.22], grass2: [0.46, 0.64, 0.26], rock: [0.52, 0.48, 0.42], sand: [0.95, 0.88, 0.7], haze: [0.74, 0.86, 0.96],
    props: [['palm', 6, [[0.25, 0.55, 0.2], [0.32, 0.6, 0.22]]], ['bush', 2, [[0.3, 0.55, 0.22]]], ['rock', 1.2, [[0.55, 0.52, 0.48]]], ['banana', 0.8, [[0.42, 0.65, 0.22]]], ['house', 0.15, [[0.2, 0.45, 0.6], [0.9, 0.9, 0.85]]], ['boat', 0, [[0.2, 0.45, 0.7], [0.75, 0.2, 0.15], [0.95, 0.95, 0.92], [0.15, 0.55, 0.45]]]],
    density: 0.3, weathers: [['clear', 0.8], ['rain', 0.2]] },
  { key: 'meadow', dry: 0, power: 1, grassDen: 1, rails: 0, grassCol: [0.42, 0.66, 0.22], name: 'ทุ่งดอกไม้บานสะพรั่ง', season: 'ฤดูใบไม้ผลิ', elev: 22, hill: 16, mount: 160, twist: 0.9, coast: 0, mesa: 0, paddy: 0, flowers: 1, snow: 0, snowline: 260, lamps: 0,
    grass: [0.42, 0.68, 0.25], grass2: [0.6, 0.75, 0.3], rock: [0.5, 0.48, 0.44], sand: [0.8, 0.75, 0.55], haze: [0.8, 0.85, 0.92],
    props: [['sakura', 3, [[1, 0.72, 0.82], [0.98, 0.8, 0.88], [0.95, 0.62, 0.76]]], ['roundtree', 3, [[0.3, 0.55, 0.2], [0.38, 0.6, 0.22]]], ['bush', 2, [[0.35, 0.6, 0.25]]], ['house', 0.3, [[0.6, 0.2, 0.2], [0.3, 0.3, 0.35]]], ['birch', 1, [[0.45, 0.66, 0.25], [0.55, 0.72, 0.3]]]],
    density: 0.28, weathers: [['petals', 1]] },
  { key: 'autumn', dry: 0.55, power: 0, grassDen: 0.85, rails: 1, grassCol: [0.72, 0.6, 0.26], name: 'ป่าใบไม้เปลี่ยนสี', season: 'ฤดูใบไม้ร่วง', elev: 40, hill: 25, mount: 220, twist: 1.3, coast: 0, mesa: 0, paddy: 0, flowers: 0, snow: 0, snowline: 230, lamps: 0,
    grass: [0.62, 0.55, 0.25], grass2: [0.72, 0.48, 0.2], rock: [0.45, 0.4, 0.36], sand: [0.7, 0.6, 0.45], haze: [0.85, 0.8, 0.75],
    props: [['roundtree', 6, [[0.9, 0.45, 0.1], [0.8, 0.2, 0.1], [0.95, 0.7, 0.15], [0.7, 0.3, 0.1]]], ['pine', 2, [[0.2, 0.38, 0.2]]], ['bush', 1, [[0.75, 0.4, 0.15]]], ['birch', 2.5, [[0.98, 0.78, 0.2], [0.92, 0.6, 0.15]]]],
    density: 0.55, weathers: [['leaves', 0.7], ['clear', 0.3]] },
  { key: 'forest', dry: 0.1, power: 0, grassDen: 0.7, rails: 1, grassCol: [0.26, 0.44, 0.17], name: 'ป่าสนบนภูเขา', season: 'ต้นฤดูหนาว', elev: 55, hill: 30, mount: 330, twist: 1.6, coast: 0, mesa: 0, paddy: 0, flowers: 0, snow: 0, snowline: 150, lamps: 0,
    grass: [0.22, 0.42, 0.18], grass2: [0.3, 0.48, 0.2], rock: [0.42, 0.42, 0.42], sand: [0.6, 0.55, 0.45], haze: [0.72, 0.78, 0.82],
    props: [['pine', 8, [[0.15, 0.32, 0.18], [0.2, 0.38, 0.2], [0.12, 0.28, 0.16]]], ['rock', 1, [[0.5, 0.5, 0.5]]], ['birch', 1, [[0.35, 0.55, 0.22]]], ['cabin', 0.12, [[0.25, 0.35, 0.25], [0.45, 0.2, 0.15]]]],
    density: 0.75, weathers: [['clear', 0.5], ['rain', 0.5]] },
  { key: 'winter', dry: 0.35, power: 0, grassDen: 0.12, rails: 1, grassCol: [0.62, 0.56, 0.4], name: 'ภูเขาหิมะ', season: 'ฤดูหนาว', elev: 85, hill: 30, mount: 380, twist: 1.4, coast: 0, mesa: 0, paddy: 0, flowers: 0, snow: 1, snowline: 0, lamps: 0,
    grass: [0.85, 0.88, 0.92], grass2: [0.95, 0.96, 0.98], rock: [0.38, 0.38, 0.42], sand: [0.85, 0.85, 0.88], haze: [0.85, 0.88, 0.92],
    props: [['snowpine', 6, [[0.15, 0.3, 0.2], [0.18, 0.34, 0.22]]], ['rock', 1, [[0.45, 0.45, 0.5]]], ['cabin', 0.2, [[0.95, 0.96, 1]]], ['deadtree', 0.4, [[0.3, 0.25, 0.2]]]],
    density: 0.45, weathers: [['snow', 0.8], ['clear', 0.2]] },
  { key: 'desert', dry: 1, power: 1, grassDen: 0.22, rails: 0, grassCol: [0.74, 0.62, 0.36], name: 'ทะเลทรายแคนยอน', season: 'ฤดูร้อน', elev: 30, hill: 10, mount: 160, twist: 0.8, coast: 0, mesa: 1, paddy: 0, flowers: 0, snow: 0, snowline: 999, lamps: 0,
    grass: [0.86, 0.66, 0.42], grass2: [0.9, 0.74, 0.5], rock: [0.7, 0.38, 0.24], sand: [0.9, 0.74, 0.5], haze: [0.92, 0.82, 0.7],
    props: [['cactus', 3, [[0.3, 0.5, 0.25], [0.35, 0.55, 0.28]]], ['rock', 3, [[0.72, 0.45, 0.3], [0.6, 0.38, 0.25]]], ['bush', 1, [[0.55, 0.5, 0.3]]], ['deadtree', 1, [[0.45, 0.38, 0.3]]]],
    density: 0.12, weathers: [['clear', 1]] },
];
for (const R of REGIONS) { R.shops ??= 0; R.isl ??= 0; } // only the town has shophouse rows
export const NREG = REGIONS.length;
export const REGION_LEN = 3600, TRANS = 1200;
const NUM_KEYS = ['isl', 'shops', 'dry', 'power', 'grassDen', 'rails', 'elev', 'hill', 'mount', 'twist', 'coast', 'mesa', 'paddy', 'flowers', 'snow', 'snowline', 'lamps', 'density'];
const COL_KEYS = ['grassCol', 'grass', 'grass2', 'rock', 'sand', 'haze'];

// ---------- Each lap round the loop is different ----------
// Lap 0 is the hand-made order. On later laps the regions come in a shuffled order (the coast and its islands stay together),
// and every visit gets its own terrain amplitude, curviness, plant mix and tint, so a place you come back to is not the same.
const RCACHE = new Map(), ORDERS = new Map();
function lapOrder(lap) {
  if (ORDERS.has(lap)) return ORDERS.get(lap);
  let order = REGIONS.map((_, i) => i);
  if (lap > 0) {
    const ci = REGIONS.findIndex((r) => r.key === 'coast'), ii = REGIONS.findIndex((r) => r.key === 'islands');
    const units = order.filter((i) => i !== ii).map((i) => (i === ci ? [ci, ii] : [i]));
    const prevLast = lapOrder(lap - 1)[NREG - 1];
    for (let tries = 0; tries < 20; tries++) {
      for (let i = units.length - 1; i > 0; i--) { const j = Math.floor(hash1(lap * 31.7 + i * 7.3 + tries * 101) * (i + 1)); [units[i], units[j]] = [units[j], units[i]]; }
      if (units[0][0] !== prevLast) break;
    }
    order = units.flat();
  }
  ORDERS.set(lap, order);
  return order;
}
export function regionAt(idx) {
  idx = Math.max(0, idx);
  if (RCACHE.has(idx)) return RCACHE.get(idx);
  const lap = Math.floor(idx / NREG), base = REGIONS[lapOrder(lap)[idx % NREG]];
  let R = base;
  if (lap > 0) {
    const h = (k) => hash1(idx * 17.13 + k * 3.71), j = (k, a, b) => a + (b - a) * h(k);
    const wet = base.key === 'coast' || base.key === 'islands' || base.key === 'town';   // tied to sea level: keep their height
    R = { ...base, lap,
      elev: wet ? base.elev : base.elev * j(1, 0.75, 1.3), hill: base.hill * j(2, 0.65, 1.45), mount: base.mount * j(3, 0.7, 1.35),
      twist: base.twist * j(4, 0.6, 1.5), density: base.density * j(5, 0.65, 1.45), grassDen: Math.min(1, base.grassDen * j(6, 0.75, 1.25)) };
    const tint = [j(7, 0.88, 1.1), j(8, 0.9, 1.1), j(9, 0.85, 1.08)];
    for (const k of ['grass', 'grass2', 'grassCol']) R[k] = base[k].map((v, i) => Math.min(1, v * tint[i]));
    R.props = base.props.map((pr, i) => [pr[0], pr[1] * j(20 + i, 0.35, 1.9), pr[2]]);   // a different mix of trees, rocks and houses
  }
  RCACHE.set(idx, R);
  return R;
}
export function regionIdx(s) {
  s = Math.max(0, s);
  const idx = Math.floor(s / REGION_LEN);
  const local = s - idx * REGION_LEN;
  const t = local > REGION_LEN - TRANS ? smooth((local - (REGION_LEN - TRANS)) / TRANS) : 0;
  return { idx, t };
}
export function weatherOf(idx) {
  const ws = regionAt(idx).weathers;
  let r = hash1(idx * 13 + 5), tot = 0;
  for (const w of ws) tot += w[1];
  r *= tot;
  for (const w of ws) { if ((r -= w[1]) <= 0) return w[0]; }
  return ws[0][0];
}
// Blended region parameters at road distance s
export function blendParams(s, out = {}) {
  const { idx, t } = regionIdx(s);
  const a = regionAt(idx), b = regionAt(idx + 1);
  for (const k of NUM_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  for (const k of COL_KEYS) {
    const o = out[k] || (out[k] = [0, 0, 0]);
    o[0] = a[k][0] + (b[k][0] - a[k][0]) * t; o[1] = a[k][1] + (b[k][1] - a[k][1]) * t; o[2] = a[k][2] + (b[k][2] - a[k][2]) * t;
  }
  out.a = a; out.b = b; out.t = t; out.idx = idx;
  return out;
}

// ---------- Endless road (z strictly increasing => x(z) function) ----------
export const SP = 2; // sample spacing (m)
export const ROAD_HALF = 5.5;
export const road = { x: [], y: [], z: [], h: [] };
const _bp = {};
function roadHeading(s) {
  const tw = blendParams(s, _bp).twist;
  const h = 0.8 * noise1(s * 0.00042 + 3.3) + 0.25 * noise1(s * 0.0013 + 11) + tw * 0.22 * noise1(s * 0.0035 + 50);
  return clamp(h, -1.2, 1.2);
}
function baseElev(s) {
  const p = blendParams(s, _bp);
  const amp = 3 + p.hill * 0.5;
  return Math.max(2.5, p.elev + amp * fbm1(s * 0.0011) + 1.5 * noise1(s * 0.006));
}
// ---------- Rivers and canals crossing the road, with a bridge (decided per kilometre, deterministic) ----------
// small: a canal (khlong) 10-16 m wide under a short concrete bridge; big: a river 60-100 m wide under a long bridge on piers.
// The terrain is cut into a channel across the road; main.js lays a water sheet at b.wl in it.
const BR = new Map(), _bpB = {};
export function bridgeOfKm(km) {
  if (BR.has(km)) return BR.get(km);
  let b = null;
  if (km > 0) {
    // put the crossing where the road runs straight, so the river clearly passes under it rather than along it
    let sb = 0, bestTurn = 1e9;
    for (let k = 0; k < 9; k++) {
      const c = km * 1000 + 220 + k * 70, a = roadHeading(c - 90), z = roadHeading(c + 90), turn = Math.abs(Math.atan2(Math.sin(z - a), Math.cos(z - a)));
      if (turn < bestTurn) { bestTurn = turn; sb = c; }
    }
    const h = hash1(km * 17.31 + 4), p = blendParams(sb, _bpB), e = baseElev(sb);
    const ok = p.shops < 0.3 && p.coast < 0.3 && p.mesa < 0.3 && p.isl < 0.3 && bestTurn < 0.14;
    if (ok && (h < 0.3 || km === 2)) b = { s: sb, big: false, w: 6 + hash1(km * 9.1) * 3, bank: 3.5, deck: e, wl: e - 2.3, name: hash1(km * 5.3) };
    else if (ok && h < 0.42) b = { s: sb, big: true, w: 30 + hash1(km * 9.1) * 20, bank: 10, deck: e, wl: e - 7, name: hash1(km * 5.3) };
    if (b) { b.bed = b.wl - (b.big ? 3.5 : 1.8); b.half = b.w + b.bank + (b.big ? 4 : 1.5); b.appr = b.big ? 220 : 60; }   // the deck spans the water and both banks
  }
  BR.set(km, b);
  return b;
}
// ---------- Sea crossings between islands (the 'islands' region) ----------
// Each islands stretch: mainland/coast -> long cable-stayed bridge -> an island -> a girder bridge on piers -> the next island
// (which runs on into the next region). The road climbs onto each bridge from the island and drops back on the far side;
// heightCore floods everything that is not island, and the sea plane (sky.js, y = 0) shows through.
const SEA = new Map();
function seaOfRegion(idx) {
  if (SEA.has(idx)) return SEA.get(idx);
  let list = [];
  if (idx >= 0 && regionAt(idx).key === 'islands') {
    const S0 = idx * REGION_LEN, h = (k) => hash1(idx * 29.7 + k);
    const A = { s: S0 + 620 + h(1) * 60, half: 280 + h(2) * 70, rise: 9, stay: true },     // the long one: cable-stayed main span
      B = { s: S0 + 1780 + h(3) * 80, half: 170 + h(4) * 60, rise: 3, stay: false };     // a lower girder bridge
    list = [A, B].map((b, k) => ({ ...b, sea: true, big: true, deck: 9.5, wl: 0, bed: -8, w: b.half, bank: 0, appr: 160, name: h(5 + k), main: b.stay ? 150 + h(7) * 50 : 0 }));
  }
  SEA.set(idx, list);
  return list;
}
export function seaBridgeNear(s, pad = 0) {
  const idx = Math.floor(s / REGION_LEN);
  for (const k of [idx, idx - 1]) for (const b of seaOfRegion(k)) if (Math.abs(s - b.s) < b.half + pad) return b;
  return null;
}
// deck height along a sea bridge: a gentle crest in the middle (ships pass under the long one)
export function seaDeckAt(b, s) { const d = Math.min(1, Math.abs(s - b.s) / b.half); return b.deck + b.rise * 0.5 * (1 + Math.cos(Math.PI * d)); }
// 1 on an island, 0 out over the water along the road
function islandLand(s) { const b = seaBridgeNear(s, 60); return b ? sstep(b.half - 40, b.half + 25, Math.abs(s - b.s)) : 1; }
export function bridgeNear(s) {
  const sb = seaBridgeNear(s, 400); if (sb && Math.abs(s - sb.s) < sb.half + sb.appr + 60) return sb;
  const k = Math.floor(s / 1000);
  for (const kk of [k, k - 1, k + 1]) { const b = bridgeOfKm(kk); if (b && Math.abs(s - b.s) < b.half + b.appr + 60) return b; }
  return null;
}
// ---------- Tunnels (decided per kilometre, deterministic) ----------
// 'mtn': in mountain country the road bores through a hill (heightCore raises a ridge over it, main.js builds the tube and portals).
// 'under': in town the road dips 7 m below the street into a cut with retaining walls, and runs under a cross street.
const TUN = new Map(), _bpT = {};
export function tunnelOfKm(km) {
  if (TUN.has(km)) return TUN.get(km);
  let t = null;
  if (km > 2 && !bridgeOfKm(km) && !bridgeOfKm(km - 1) && !bridgeOfKm(km + 1)) {
    const c = km * 1000 + 500, p = blendParams(c, _bpT), h = hash1(km * 41.7 + 9);
    if (p.mount > 180 && p.coast < 0.2 && p.isl < 0.2 && p.shops < 0.2 && h < 0.5) {
      const len = 240 + hash1(km * 3.3) * 300;
      t = { kind: 'mtn', s0: c - len / 2, s1: c + len / 2, H: 18 + hash1(km * 7.7) * 12, ramp: 0, name: hash1(km * 2.1) };
    } else if (p.shops > 0.7 && blendParams(c + 900, _bpT).coast < 0.05 && h < 0.55) t = { kind: 'under', s0: c - 24, s1: c + 24, D: 6.8, ramp: 120, name: hash1(km * 2.1) };
  }
  TUN.set(km, t);
  return t;
}
export function tunnelNear(s, pad = 0) {
  const k = Math.floor(s / 1000);
  for (const kk of [k, k - 1, k + 1]) { const t = tunnelOfKm(kk); if (t && s >= t.s0 - t.ramp - pad && s <= t.s1 + t.ramp + pad) return t; }
  return null;
}
export function inTunnel(s, pad = 0) { const t = tunnelNear(s, pad); return t && s >= t.s0 - pad && s <= t.s1 + pad ? t : null; }
// how far the road is sunk below the street at s (underpasses only)
export function underDip(t, s) {
  if (!t || t.kind !== 'under') return 0;
  const d = s < t.s0 ? t.s0 - s : s > t.s1 ? s - t.s1 : 0;
  return t.D * (1 - sstep(0, t.ramp, d));
}
export function onBridge(s) { const b = bridgeNear(s); return b && Math.abs(s - b.s) <= b.half ? b : null; }
function roadElev(s) {
  let y = baseElev(s);
  const b = bridgeNear(s);
  if (b) { const d = Math.abs(s - b.s); y = b.sea && d <= b.half ? seaDeckAt(b, s) : lerp(y, b.deck, 1 - sstep(b.half, b.half + b.appr, d)); }   // the road levels out across the bridge
  y -= underDip(tunnelNear(s), s);   // underpass: the road dips below the street
  return y;
}
function genStep() {
  const i = road.x.length;
  if (i === 0) { road.x.push(0); road.z.push(0); road.y.push(roadElev(0)); road.h.push(roadHeading(0)); return; }
  const hm = roadHeading((i - 0.5) * SP);
  road.x.push(road.x[i - 1] + Math.sin(hm) * SP);
  road.z.push(road.z[i - 1] + Math.cos(hm) * SP);
  road.y.push(roadElev(i * SP));
  road.h.push(roadHeading(i * SP));
}
export function ensureS(s) { while ((road.x.length - 2) * SP < s) genStep(); }
export function ensureZ(z) { if (!road.z.length) genStep(); while (road.z[road.z.length - 1] < z) genStep(); }

export function roadAtZ(z, out) {
  ensureZ(z + 20);
  const Z = road.z;
  if (z <= Z[0]) { out.x = road.x[0]; out.y = road.y[0]; out.h = road.h[0]; out.s = 0; return out; }
  let lo = 0, hi = Z.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (Z[m] <= z) lo = m; else hi = m; }
  const t = (z - Z[lo]) / (Z[hi] - Z[lo]);
  out.x = lerp(road.x[lo], road.x[hi], t); out.y = lerp(road.y[lo], road.y[hi], t);
  out.h = lerp(road.h[lo], road.h[hi], t); out.s = (lo + t) * SP;
  return out;
}
export function roadAtS(s, out) {
  s = Math.max(0, s);
  ensureS(s + 4);
  const f = s / SP, i = Math.floor(f), t = f - i;
  out.x = lerp(road.x[i], road.x[i + 1], t); out.y = lerp(road.y[i], road.y[i + 1], t);
  out.z = lerp(road.z[i], road.z[i + 1], t); out.h = lerp(road.h[i], road.h[i + 1], t); out.s = s;
  return out;
}

// ---------- Terrain height ----------
export const TI = { L: 0 };
export function heightCore(x, z, r, p) {
  const ch = Math.cos(r.h);
  const L = (x - r.x) * ch; TI.L = L;
  const aL = Math.abs(L);
  const tn = tunnelNear(r.s, 60), dip = underDip(tn, r.s), ry = r.y + dip;   // ry: street level (the road itself may be sunk in an underpass)
  let nat = ry + p.hill * fbm(x * 0.006, z * 0.006, 3);
  if (p.paddy > 0.01) {
    const f = p.paddy * (1 - sstep(180, 380, aL));
    nat = lerp(nat, r.y - 0.7 + 0.25 * vnoise(x * 0.02, z * 0.02), f);
  }
  let mm = 1;
  if (p.coast > 0 && L < 0) mm = 1 - p.coast;
  const m = ridged(x * 0.0017, z * 0.0017, 4);
  nat += m * m * p.mount * sstep(40, 480, aL) * mm;
  if (p.mesa > 0.01) {
    const mn = fbm(x * 0.0045 + 50, z * 0.0045 - 20, 3);
    nat += p.mesa * sstep(0.1, 0.18, mn) * (38 + 10 * vnoise(x * 0.01, z * 0.01)) * sstep(50, 140, aL);
  }
  if (p.coast > 0.01 && L < 0) {
    const sea = -2 - (aL - 70) * 0.06;
    nat = lerp(nat, Math.min(nat, sea), p.coast * sstep(20, 90, aL));
  }
  let land = 1, floor = 0;
  if (p.isl > 0.01) {                                        // islands in the open sea
    land = islandLand(r.s);
    const W = 240 + 90 * vnoise(x * 0.003 + 7, z * 0.003 - 3);              // how far the island reaches from the road
    const on = land * (1 - sstep(W - 80, W, aL));
    floor = -5 - Math.min(12, aL * 0.02) + 1.5 * vnoise(x * 0.01, z * 0.01);
    let hI = lerp(floor, Math.max(nat, 1.2 + 2 * on), on);
    const m2 = ridged(x * 0.0012 + 20, z * 0.0012 - 40, 3);
    hI = Math.max(hI, (m2 * m2 * 300 - 110) * 0.55 - 200 * (1 - sstep(260, 520, aL)));            // other islands out at sea
    nat = lerp(nat, hI, p.isl);
  }
  const w = sstep(ROAD_HALF + 3, ROAD_HALF + 3 + 18 + p.hill * 0.7, aL);
  let out = lerp(r.y - 0.35 + dip * sstep(ROAD_HALF + 3.5, ROAD_HALF + 5, aL), nat, w);   // the trench floor runs out past the retaining walls, so no slope shows in front of them
  if (tn && tn.kind === 'mtn') {                                    // a ridge over the tunnel; a slot is left along the road (the tube and portals fill it)
    const d = Math.max(tn.s0 - r.s, r.s - tn.s1, 0);
    const hill = r.y + tn.H * (1 - sstep(0, 55, d)) * (0.75 + 0.25 * vnoise(x * 0.02, z * 0.02)) - Math.max(0, aL - 12) * 0.18;
    out = Math.max(out, lerp(out, hill, sstep(ROAD_HALF + 4.5, ROAD_HALF + 8.5, aL)));   // starts beyond the tube walls, so no hillside pokes into the tube
  }
  if (p.isl > 0.01 && land < 1) out = lerp(out, lerp(floor, out, land), p.isl);   // no embankment out over the water: the bridge stands in the sea
  const b = bridgeNear(r.s);
  if (b && !b.sea) {                                                   // the river channel
    if (!b.P) { const q = roadAtS(b.s, {}); b.P = { x: q.x, z: q.z, fx: Math.sin(q.h), fz: Math.cos(q.h), lx: Math.cos(q.h), lz: -Math.sin(q.h) }; }
    const lat = (x - b.P.x) * b.P.lx + (z - b.P.z) * b.P.lz;
    const d = Math.abs((x - b.P.x) * b.P.fx + (z - b.P.z) * b.P.fz + (b.big ? 14 : 4) * noise1(lat * (b.big ? 0.004 : 0.01) + b.name * 50) * sstep(40, 120, Math.abs(lat)));
    // flat bed, steep banks; the channel only runs through ground about as low as the road (it never slices up a hillside)
    if (d < b.w + b.bank) { const keep = 1 - sstep(b.deck + 1.5, b.deck + 5, out); if (keep > 0) out = Math.min(out, lerp(out, lerp(b.bed, out, sstep(b.w * 0.9, b.w + b.bank, d)), keep)); }
  }
  return out;
}
const _r = {}, _p = {};
export function groundAt(x, z) {
  roadAtZ(z, _r);
  blendParams(_r.s, _p);
  const h = heightCore(x, z, _r, _p);
  const aL = Math.abs(TI.L);
  if (aL < ROAD_HALF + 0.2) return _r.y;
  if (aL < ROAD_HALF + 1.6) return lerp(_r.y, h, (aL - ROAD_HALF - 0.2) / 1.4);
  return h;
}
