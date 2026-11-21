// The world worker: builds the chunks of the world (and grows their grass) away from the page, so that driving into new country never holds a
// frame up. It loads the same scripts the page does for the world - core, the land, the plants and buildings, the chunk builder - and runs
// buildChunk and growGrass exactly as the page would; but here vbuf keeps the data instead of making a buffer of it on the graphics card, and the
// page (worldclient.js) makes the buffers from what is sent back. Each chunk is kept here too while it is in use, for its grass to be grown later.
// A classic worker from a plain file beside the page: it needs nothing of the server (a static host such as GitHub Pages serves it as it is).
self.window = self;
if (typeof GPUBufferUsage === 'undefined') self.GPUBufferUsage = { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256 };
const vbuf = (data) => data.slice();      // (a copy of its own: the arrays it is made from are used again for the next chunk)
const fail = (m) => { postMessage({ t: 'err', m: String(m) }); };
let ASSET = {}, GAME = {}; const KEPT = new Map();
// what of a chunk goes to the page: everything, the arrays moved (not copied); and what stays here for its grass - all but those arrays
const sendChunk = (t, k, c) => { const tr = [], out = {};
  for (const f in c) { const v = c[f]; if (ArrayBuffer.isView(v) && (f === 'vb' || /B$/.test(f) || f === 'col' || f === 'soft')) { out[f] = v; tr.push(v.buffer); c[f] = null; } else if (f !== 'hgc' && f !== 'hwc') out[f] = v; }
  postMessage({ t, k, c: out }, tr); };
onmessage = (e) => { const m = e.data;
  try {
    if (m.t === 'init') { ASSET = m.assets; GAME = m.game || {}; importScripts(...m.parts); postMessage({ t: 'ready' }); }
    else if (m.t === 'build') { const c = buildChunk(m.cx, m.cz); KEPT.set(m.k, c); sendChunk('chunk', m.k, c); }
    else if (m.t === 'grass') { const c = KEPT.get(m.k); if (!c) { postMessage({ t: 'grass', k: m.k, none: true }); return; }
      grassJob = null; c.dead = false; c.grassTried = false; c.grassB = null; c.nGrass = 0; let n = 0; while (!c.grassTried && n++ < 64) growGrass(c);
      const g = c.grassB; c.grassB = null; postMessage({ t: 'grass', k: m.k, nGrass: c.nGrass, grassB: g }, g ? [g.buffer] : []); }
    else if (m.t === 'drop') KEPT.delete(m.k);
    else if (m.t === 'snow') { if (typeof GRASS_SNOW !== 'undefined') GRASS_SNOW = m.v; }
  } catch (err) { fail((err && err.stack) || err); }
};
