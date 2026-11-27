// The canvas, the device's queue, the sizes and formats everything else uses, and the small maths helpers.
// (IN_WORKER: this file is also loaded by the world worker - see worldworker.js - which builds the chunks and has no canvas and no device)
const IN_WORKER = typeof document === 'undefined';
if (!IN_WORKER) device.addEventListener('uncapturederror', (e) => fail('GPU: ' + e.error.message));
const canvas = IN_WORKER ? null : $('c'), ctx = IN_WORKER ? null : canvas.getContext('webgpu'), FMT = IN_WORKER ? null : navigator.gpu.getPreferredCanvasFormat();
if (!IN_WORKER) ctx.configure({ device, format: FMT, alphaMode: 'opaque' });
// ULTRA: the ultra picture quality (QUAL 3, render.js), as it was when the page was loaded - what it changes is built in at the start (the shadow map
// twice as fine each way, 8192: 2.3 cm to a point of it; the shaders' finer work, const ULTRA in them): changing to it or from it loads the page again.
const ULTRA = (() => { try { return !IN_WORKER && localStorage.getItem('endless.qual') === '3'; } catch (e) { return false; } })();
const Q = IN_WORKER ? null : device.queue, HDR = 'rgba16float', DEPTH = 'depth24plus', SHADOW = ULTRA ? 8192 : 4096, AA = 4;
const { sin, cos, abs, min, max, floor, sqrt, hypot, atan2, PI, exp } = Math, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), mix = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// Noise and chance, the same for every game: hash/vnoise/fbm (smooth noise for heights), ph (a whole-number hash the shaders have too), rng (a seeded dice).
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vnoise = (x, y) => { const ix = floor(x), iy = floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy); return mix(mix(hash(ix, iy), hash(ix + 1, iy), ux), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), ux), uy); };
const fbm = (x, y, o = 4) => { let s = 0, a = 0.5; for (let i = 0; i < o; i++) { s += a * vnoise(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 9.7; a *= 0.5; } return s / (1 - a * 2 + 1e-9) * (1 - 0) ; };
const ph = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
// the same value noise and the same rule as pn() and turf() in the shaders: where the ground is turf and where bare earth
const pn = (x, y) => { const ix = floor(x), iy = floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy); return mix(mix(ph(ix, iy), ph(ix + 1, iy), ux), mix(ph(ix, iy + 1), ph(ix + 1, iy + 1), ux), uy); };
const turfAt = (x, z) => pn(x * 0.09, z * 0.09) * 0.5 + pn(x * 0.37, z * 0.37) * 0.32 + pn(x * 1.3, z * 1.3) * 0.18;
// a sign board carries its own width (in its last number), so that the words can be fitted to it
const signW = (B) => { for (let i = 0; i < B.length; i += 12) if (B[i + 8] === 23) B[i + 11] = 10 + Math.max(B[i + 4], B[i + 6]); return B; };
const rng = (seed) => { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
