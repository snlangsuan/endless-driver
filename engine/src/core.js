// The canvas, the device's queue, the sizes and formats everything else uses, and the small maths helpers.
device.addEventListener('uncapturederror', (e) => fail('GPU: ' + e.error.message));
const canvas = $('c'), ctx = canvas.getContext('webgpu'), FMT = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({ device, format: FMT, alphaMode: 'opaque' });
const Q = device.queue, HDR = 'rgba16float', DEPTH = 'depth24plus', SHADOW = 4096, AA = 4;
const { sin, cos, abs, min, max, floor, sqrt, hypot, atan2, PI, exp } = Math, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), mix = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

