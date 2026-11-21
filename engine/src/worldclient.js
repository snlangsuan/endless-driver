// The page's side of the world worker (worldworker.js). updateChunks (chunks.js, or a game's own) still says which chunks are wanted, nearest first;
// here they are asked of the worker a few at a time and, as they come back, their buffers are made on the graphics card - a few each frame, so that
// no frame does much of it - and the chunk joins the others. Grass is asked for the same way (growGrass is replaced by the asking). If the page
// cannot start a worker the chunks are built here as before.
// (?worker=0 in the page's address builds them here instead, the old way - for comparing the two)
const WW = /[?&]worker=0\b/.test(location.search) ? null : (() => { try { return new Worker('src/worldworker.js'); } catch (e) { return null; } })();
const wwParts = (GAME.worldParts || PARTS.filter((p) => ['core', 'land', 'plants', 'buildings', 'chunks'].includes(p) || /\/(land|world)$/.test(p))).map((p) => new URL(srcOf(p), location.href).href);
const wwInFlight = new Set(), wwDone = [], wwGrass = []; let wwReady = false, wwInitial = null;
if (WW) {
  WW.onmessage = (e) => { const m = e.data; if (m.t === 'ready') wwReady = true; else if (m.t === 'chunk') wwDone.push(m); else if (m.t === 'grass') wwGrass.push(m); else if (m.t === 'err') fail('world worker: ' + m.m); };
  WW.onerror = (e) => fail('world worker: ' + e.message);
  const as = {}; for (const k in ASSET) as[k] = ASSET[k].slice(0);
  WW.postMessage({ t: 'init', parts: wwParts, assets: as, game: { parts: GAME.parts, worldParts: GAME.worldParts } });
  // (a chunk is let go: the worker lets go of its copy too)
  const drop0 = dropChunk; dropChunk = (c) => { drop0(c); if (c.key) WW.postMessage({ t: 'drop', k: c.key }); };
  // (grass: asked for once; when it comes the chunk has it. A chunk whose grass was let go - it went out of range - may ask again)
  growGrass = (c) => { if (c.grassAsked || c.dead) return; c.grassAsked = true; WW.postMessage({ t: 'grass', k: c.key }); };
}
// (leaves and grass also as storage: so that the graphics card can cull them - see CU in render.js)
const wwUse = (f) => (/IB$/.test(f) ? GPUBufferUsage.INDEX : f === 'leafB' || f === 'grassB' ? GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE : GPUBufferUsage.VERTEX);
const wwUpload = (c) => { for (const f in c) { const v = c[f]; if (ArrayBuffer.isView(v) && (f === 'vb' || /B$/.test(f))) c[f] = vbuf(v, wwUse(f)); } return c; };
// Called by updateChunks with what it wants (nearest first: [distance, cx, cz, key]), how many may be finished this time, and what is still in
// range. Returns how many chunks are still to come.
// (the season: when the cool season comes or goes, the snowfield's grass is grown again - deep in snow, or a meadow)
let wwSnow = -1;
function chunkQueue(want, budget, keep) {
  if (typeof GRASS_SNOW !== 'undefined' && typeof AT !== 'undefined') { const sv = AT.cool > 0.5 ? 1 : 0; if (sv !== wwSnow) { const first = wwSnow < 0; wwSnow = sv; GRASS_SNOW = sv; if (WW) WW.postMessage({ t: 'snow', v: sv });
    if (!first) for (const c of chunks.values()) if (snowW(c.z) > 0.05 && c.grassB) { c.grassB.destroy(); c.grassB = null; c.nGrass = 0; c.grassTried = false; c.grassAsked = false; } } }
  if (!WW) { for (let i = 0; i < want.length && i < budget; i++) chunks.set(want[i][3], buildChunk(want[i][1], want[i][2])); return want.length; }
  // what has come back: made into buffers, up to budget of them (and never more than about 6 MB of buffers in one frame, unless at the start)
  let made = 0, bytes = 0;
  while (wwDone.length && made < budget && (budget > 2 || bytes < 6e6)) { const m = wwDone.shift(); wwInFlight.delete(m.k);
    if (!keep.has(m.k) || chunks.has(m.k)) { WW.postMessage({ t: 'drop', k: m.k }); continue; }
    for (const f in m.c) if (ArrayBuffer.isView(m.c[f])) bytes += m.c[f].byteLength;
    const c = wwUpload(m.c); c.key = m.k; chunks.set(m.k, c); made++; }
  // grass that has come back: one each time
  if (wwGrass.length) { const m = wwGrass.shift(); for (const c of chunks.values()) if (c.key === m.k) { c.grassAsked = false; if (!c.dead && !m.none) { c.nGrass = m.nGrass; c.grassB = m.grassB ? vbuf(m.grassB, wwUse('grassB')) : null; c.grassTried = true; } break; } }
  // and what is wanted next: asked a few at a time, so that the nearest are always the next made, wherever the car turns
  for (const w of want) { if (wwInFlight.size >= 3) break; if (wwInFlight.has(w[3]) || chunks.has(w[3])) continue; wwInFlight.add(w[3]); WW.postMessage({ t: 'build', cx: w[1], cz: w[2], k: w[3] }); }
  let left = 0; for (const w of want) if (!chunks.has(w[3])) left++; return left;
}
// (the start: the loading screen waits until the chunks round the car are there - see boot.js)
const worldReady = (x, z) => new Promise((ok) => { const step = () => { if (updateChunks(x(), z(), 30) === 0) ok(); else setTimeout(step, 16); }; step(); });
