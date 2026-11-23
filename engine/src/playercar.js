// --------------------------------------------------------------------------------------------------------- the player's car
// The car itself, seen whole from behind it (V, or Circle on a pad: view3) and from the flying camera, and casting its shadow on the road always.
// From "2016 Mazda MX-5 Miata" by Galaxy Car Showroom (CC BY 4.0, see CREDITS.md), made into assets/mx5.bin by scripts/mx5.py (its format there):
// right-hand drive, no badges, colours from the model's textures, and the four wheels apart so that they roll and the front pair steer.
// Its place is given to the shaders relative to the eye, worked out here in double precision (its whole metres and the rest apart), so that it
// does not shimmer far from the world's origin.
const PCAR = (() => {
  if (!ASSET.mx5) return null;
  const B = ASSET.mx5, dv = new DataView(B), nv = dv.getUint32(4, true), ni = dv.getUint32(8, true), hub = new Float32Array(B, 12, 12);
  const vb = vbuf(new Uint8Array(B, 60, nv * 32)), ib = vbuf(new Uint32Array(B, 60 + nv * 32, ni), GPUBufferUsage.INDEX);
  const ub = device.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }), U = new Float32Array(28);
  for (let w = 0; w < 4; w++) U.set([hub[w * 3], hub[w * 3 + 1], hub[w * 3 + 2], 0], 12 + w * 4);
  const bgl = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} }] });
  const bg = device.createBindGroup({ layout: bgl, entries: [{ binding: 0, resource: { buffer: ub } }] });
  const LB = [{ arrayStride: 32, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'unorm8x4' }, { shaderLocation: 3, offset: 28, format: 'uint8x4' }] }];
  const pipe = scenePipe('vsPc', 'fsPc', LB, 'triangle-list', 1, 'less', 4, device.createPipelineLayout({ bindGroupLayouts: [bglScene, bgl] }));
  const pipeS = device.createRenderPipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [bglShadow, bgl] }), vertex: { module: mShadow, entryPoint: 'vsPc', buffers: LB },
    primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.5 } });
  return { vb, ib, ni, ub, U, bg, pipe, pipeS, ox: 0, oz: 0, spin: 0, pv: 0, brake: 0, cam: null, cp: null, phd: null, roll: 0, rollV: 0, dive: 0, diveV: 0, wa: 0, hop: 0, hopV: 0, t: 0 };
})();
// The height of the road or ground under a wheel as it is drawn: the ground is a mesh of points every 2 m (chunks.js), flat between them in
// triangles, not the curve ground() follows - over a crest or a hollow they part by centimetres, and on a cambered road by more. Built roads
// (bridge decks, tunnels, the slab over an underpass) are taken as they are.
function pcSurfY(x, z, y) {
  const s = surf(x, z, y), g0 = ground(x, z); if (abs(s - g0) > 0.02) return s;
  const fx = x / GS, fz = z / GS, i = floor(fx), j = floor(fz), u = fx - i, v = fz - j, X = i * GS, Z = j * GS;
  const ya = ground(X, Z), yb = ground(X + GS, Z), yc = ground(X, Z + GS);
  if (u + v < 1) return ya + u * (yb - ya) + v * (yc - ya);
  const yd = ground(X + GS, Z + GS); return yd + (1 - u) * (yc - yd) + (1 - v) * (yb - yd);
}
// Each frame, before the passes: where the car is and how its wheels stand. (spin: the wheels' turn, by the distance rolled on 0.32 m tyres;
// the brake lamps lit while the car is slowing hard)
function pcUpdate(dt, ex, ey, ez) {
  const C = PCAR; if (!C) return;
  C.spin += car.v * dt / 0.32;
  const dec = dt > 0 ? (C.pv - abs(car.v)) / dt : 0; C.pv = abs(car.v); C.brake += ((K('Space') > 0 || dec > 2.5 ? 1 : 0) - C.brake) * (1 - Math.exp(-dt * 12));
  // The body on its springs. It leans out of a turn by the sideways pull - the speed times how fast the travel is turning - up to 4 degrees,
  // dips its nose braking and lifts it accelerating, up to 2; each on a spring that is damped, so that it settles with a little swing, not at
  // once. The wheels stay on the road.
  const wr = (q) => q - Math.round(q / TAU) * TAU, hd = car.hd !== undefined ? car.hd : car.yaw, yr = C.phd === null || dt <= 0 ? 0 : wr(hd - C.phd) / dt; C.phd = hd;
  const aLat = clamp(car.v * yr, -12, 12), aLon = clamp(-dec, -10, 10), sp = (x, v, t, w) => { const a = (t - x) * w * w - 2 * 0.55 * w * v; v += a * dt; return [x + v * dt, v]; };
  // (drifting the body leans further - the tyres sideways, the weight thrown onto the outer pair - up to 6 degrees, and swings more on its springs)
  const dr = DRIFT && abs(car.slip || 0) > 0.08 ? 1 : 0;
  if (dt > 0 && dt < 0.2) { [C.roll, C.rollV] = sp(C.roll, C.rollV, clamp(aLat * (dr ? 0.0085 : 0.0062), dr ? -0.105 : -0.07, dr ? 0.105 : 0.07), dr ? 6.5 : 8); [C.dive, C.diveV] = sp(C.dive, C.diveV, clamp(aLon * 0.0035, -0.035, 0.035), 9); }
  // The front wheels turned as far as the car's travel is bending - the wheelbase over the radius (2.31 m) - and, sliding, pointed along the
  // travel rather than the nose: the wheel held against the slide, as a driver holds it. (Turned by the steering itself they stood 29 degrees
  // over at any speed, and the wrong way in a drift.)
  const want = clamp(wr(hd - car.yaw) + Math.atan(2.31 * yr / max(abs(car.v), 2)) * Math.sign(car.v || 1), -0.6, 0.6); C.wa += (want - C.wa) * (1 - Math.exp(-dt * 10));
  // Sliding, the car is drawn turned about a point near its front wheels, not its middle: the front runs along the line the car is travelling
  // and the tail swings out - as a drifting car is seen to. (Turned about its middle, it spun on the spot like a top, both ends swinging.)
  const PZ = 1.0, ox = (sin(hd) - sin(car.yaw)) * PZ, oz = (cos(hd) - cos(car.yaw)) * PZ; C.ox = ox; C.oz = oz;
  // Set on its four wheels: the height under each, and the car's height, pitch and sideways tilt from them - laid on the surface as it is drawn,
  // so that no wheel sinks into it or stands off it. (Placed by one height under its middle and its pitch alone, it stood level across a
  // cambered road or a slope - one side sunk, the other in the air - and up to 10 cm off over crests and hollows.)
  const cy = cos(car.yaw), sy = sin(car.yaw), WH = [[0.735, 1.194], [-0.733, 1.194], [0.735, -1.114], [-0.733, -1.114]], hy4 = WH.map(([lx, lz]) => pcSurfY(car.x + ox + lx * cy + lz * sy, car.z + oz - lx * sy + lz * cy, car.y + 1));
  const yM = (hy4[0] + hy4[1] + hy4[2] + hy4[3]) / 4 + 0.012, pit = Math.atan2((hy4[0] + hy4[1] - hy4[2] - hy4[3]) / 2, 2.308), rl = Math.atan2((hy4[0] + hy4[2] - hy4[1] - hy4[3]) / 2, 1.468);
  if (C.gy === undefined || dt > 0.3 || abs(C.gy - yM) > 1.5) { C.gy = yM; C.gp = pit; C.gr = rl; }
  const kq = 1 - Math.exp(-dt * 25); C.gy += (yM - C.gy) * kq; C.gp += (pit - C.gp) * kq; C.gr += (rl - C.gr) * kq;
  const U = C.U, hx = Math.fround(car.x + ox), hy = Math.fround(C.gy), hz = Math.fround(car.z + oz);
  U[0] = hx; U[1] = hy; U[2] = hz; U[3] = car.yaw; U[4] = car.x + ox - hx; U[5] = C.gy - hy; U[6] = car.z + oz - hz; U[7] = C.gp; U[23] = C.gr;
  // (and the road under the tyres: the body shakes a little on it, more the faster - a few millimetres - and on rough ground or in the gutter more)
  C.t += dt; const va = min(1, abs(car.v) / 25), rough = (car.gut || 0) > 0.5 ? 2.5 : abs(rdist(car.x, car.z)) > 4.6 ? 3 : 1;
  const shake = (Math.sin(C.t * 23.1) * 0.6 + Math.sin(C.t * 37.7) * 0.4) * 0.0025 * va * rough;
  if (dt > 0 && dt < 0.2) [C.hop, C.hopV] = (() => { const t = shake * 1.2, w = 14; let v = C.hopV + ((t - C.hop) * w * w - 2 * 0.35 * w * C.hopV) * dt; return [C.hop + v * dt, v]; })();
  U[8] = C.spin % TAU; U[9] = C.wa; U[10] = C.brake; U[11] = C.roll + shake * 0.6; U[15] = C.dive; U[19] = C.hop;
  Q.writeBuffer(C.ub, 0, U);
}
// drawn into the shadow map always (from the driver's seat its shadow lies on the road beside it), and into the picture when it can be seen
function pcDraw(p, shadow) {
  const C = PCAR; if (!C) return;
  if (!shadow && !(view3 || fly.on)) return;
  p.setPipeline(shadow ? C.pipeS : C.pipe); p.setBindGroup(1, C.bg); p.setVertexBuffer(0, C.vb); p.setIndexBuffer(C.ib, 'uint32'); p.drawIndexed(C.ni);
}
// The camera behind the car (view3), as from a following car: it swings round after the car's heading - mostly its nose, a third of the way to
// its travel, so a drift is seen at an angle and not side-on - and it is not bolted to the car: its place follows on springs (quicker across,
// slower up and down), so the car moves about in the picture as it brakes, pulls away and turns, and the camera looks at a point just ahead of
// it. (Fixed to the car the car stood still in the middle of the picture whatever it did, like a cut-out stuck on the screen.)
function pcCam(dt) {
  const C = PCAR, wr = (q) => q - Math.round(q / TAU) * TAU, hd = car.hd !== undefined && abs(car.v) > 1 ? car.hd : car.yaw, tgt = car.yaw + wr(hd - car.yaw) * 0.35;
  if (C.cam === null || !C.cp || dt > 0.5) { C.cam = tgt; C.cp = null; }
  C.cam += wr(tgt - C.cam) * (1 - Math.exp(-dt * (COMFORT ? 2.6 : 3.6)));
  // (the place it springs toward is led by the car's own speed, by about what the spring lags behind - or at speed the camera trailed far back
  // and the car shrank in the picture)
  // (Kept above the ground only off the road: in a tunnel the ground is the mountain over it, and the camera was put up there, over the roof;
  // on the road - an underpass's cutting, a bridge - the road's own height is the floor.)
  const floorAt = (x, z) => (inTun(z) || inTun(car.z) || abs(rdist(x, z)) < 6 ? car.y + (roadY(z) - roadY(car.z)) : ground(x, z)) + 0.6;
  const rk = COMFORT ? 5 : 7, ld = car.v / rk * 0.8, ya = C.cam + car.ly, dx = car.x + C.ox - sin(ya) * 5.2 + sin(hd) * ld, dz = car.z + C.oz - cos(ya) * 5.2 + cos(hd) * ld, dy = max(car.y + 1.7, floorAt(dx, dz));
  if (!C.cp) C.cp = [dx, dy, dz];
  const kh = 1 - Math.exp(-dt * rk), kv = 1 - Math.exp(-dt * 4);
  C.cp[0] += (dx - C.cp[0]) * kh; C.cp[2] += (dz - C.cp[2]) * kh; C.cp[1] += (dy - C.cp[1]) * kv; C.cp[1] = max(C.cp[1], floorAt(C.cp[0], C.cp[2]) - 0.1);
  const lx = car.x + C.ox + sin(car.yaw) * 1.2 - C.cp[0], ly = car.y + 0.85 - C.cp[1], lz = car.z + C.oz + cos(car.yaw) * 1.2 - C.cp[2];
  return [C.cp[0], C.cp[1], C.cp[2], atan2(lx, lz) + car.ly, atan2(ly, Math.hypot(lx, lz)) + car.lp];
}
// Tyre smoke. Drifting, the rear tyres burn: a puff is given off from each at the road, the more the further the car is sideways and the faster
// it goes - less on a wet road, where the water takes it, and off the road it is dust, brown. Each puff drifts on with a little of the car's
// way, rises, swells from a hand's breadth to some metres and thins away over two seconds and more. Drawn last in the picture, see-through,
// over the scene and behind nothing (vsSmoke/fsSmoke).
const SMOKE = (() => {
  if (!PCAR) return null;
  const N = 220, inst = new Float32Array(N * 8), buf = device.createBuffer({ size: inst.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  const pipe = device.createRenderPipeline({ layout: plScene,
    vertex: { module: mScene, entryPoint: 'vsSmoke', buffers: [{ arrayStride: 32, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }, { shaderLocation: 1, offset: 16, format: 'float32x4' }] }] },
    fragment: { module: mScene, entryPoint: 'fsSmoke', targets: [{ format: HDR, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' }, multisample: { count: AA }, depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'less' } });
  return { N, inst, buf, pipe, P: [], acc: [0, 0], n: 0 };
})();
function smokeStep(dt, ex, ey, ez) {
  const S = SMOKE; if (!S || dt <= 0) return;
  const C = PCAR, sl = abs(car.slip || 0), v = abs(car.v), wet = (typeof AT !== 'undefined' && AT.wet) || 0, off = abs(rdist(car.x, car.z)) > 4.6;
  const k = DRIFT && !fly.on ? clamp((sl - 0.15) / 0.4, 0, 1) * min(1, v / 15) * (1 - 0.75 * wet) : 0;
  if (k > 0) { const c = cos(car.yaw), s = sin(car.yaw);
    for (let w = 0; w < 2; w++) { S.acc[w] += dt * 38 * k; while (S.acc[w] >= 1 && S.P.length < S.N) { S.acc[w] -= 1;
      const lx = (w ? -0.74 : 0.74) + (Math.random() - 0.5) * 0.2, lz = -1.11 + (Math.random() - 0.5) * 0.3, x = car.x + C.ox + lx * c + lz * s, z = car.z + C.oz - lx * s + lz * c;
      const vx = sin(car.hd || car.yaw) * car.v * 0.22 + (Math.random() - 0.5) * 1.2, vz = cos(car.hd || car.yaw) * car.v * 0.22 + (Math.random() - 0.5) * 1.2;
      S.P.push({ x, y: car.y + 0.12, z, vx, vy: 0.3 + Math.random() * 0.4, vz, age: 0, life: 1.8 + Math.random() * 1.2, sd: Math.random(), dust: off ? 1 : 0, a0: 0.22 + 0.18 * k }); } S.acc[w] = min(S.acc[w], 1); } }
  const dr = Math.exp(-dt * 1.4); let n = 0;
  for (let i = S.P.length - 1; i >= 0; i--) { const q = S.P[i]; q.age += dt; if (q.age > q.life) { S.P.splice(i, 1); continue; }
    q.vx *= dr; q.vz *= dr; q.vy = q.vy * dr + 0.35 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; }
  for (const q of S.P) { const f = q.age / q.life, o = n * 8; S.inst[o] = q.x - ex; S.inst[o + 1] = q.y - ey; S.inst[o + 2] = q.z - ez; S.inst[o + 3] = 0.3 + q.age * 1.5;
    S.inst[o + 4] = q.a0 * Math.pow(1 - f, 1.5) * min(1, q.age * 10); S.inst[o + 5] = q.dust; S.inst[o + 6] = q.sd; S.inst[o + 7] = 0; n++; }
  S.n = n; if (n) Q.writeBuffer(S.buf, 0, S.inst, 0, n * 8);
}
function smokeDraw(p) { const S = SMOKE; if (!S || !S.n) return; p.setPipeline(S.pipe); p.setVertexBuffer(0, S.buf); p.draw(6, S.n); }
// Tyre marks. Sliding - drifting, or braking hard - each tyre lays a dark streak of rubber on the road: the rear pair dark, the front faint,
// darker the further the car is sideways. A streak is made of short lengths, one every 30 cm a wheel moves, kept in a ring (MK.N of them,
// some hundreds of metres of marks) so the oldest go as new ones are laid; the last few hundred fade away first. Each length is a strip on the
// road between two points a few millimetres above it (vsMark/fsMark), drawn after the ground and before the smoke.
const MARKS = (() => {
  if (!PCAR) return null;
  const N = 1600, seg = new Float64Array(N * 8), inst = new Float32Array(N * 8), buf = device.createBuffer({ size: inst.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  const pipe = device.createRenderPipeline({ layout: plScene,
    vertex: { module: mScene, entryPoint: 'vsMark', buffers: [{ arrayStride: 32, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }, { shaderLocation: 1, offset: 16, format: 'float32x4' }] }] },
    fragment: { module: mScene, entryPoint: 'fsMark', targets: [{ format: HDR, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } } }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' }, multisample: { count: AA }, depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'less-equal', depthBias: -4, depthBiasSlopeScale: -2 } });
  return { N, seg, inst, buf, pipe, head: 0, count: 0, last: [null, null, null, null] };
})();
function marksStep(dt, ex, ey, ez) {
  const M = MARKS; if (!M) return;
  const C = PCAR, sl = abs(car.slip || 0), v = abs(car.v), brk = K('Space') > 0.5 && v > 9 ? 0.55 : 0;
  const k = max(DRIFT && v > 6 ? clamp((sl - 0.12) / 0.35, 0, 1) : 0, brk) * (1 - 0.6 * ((typeof AT !== 'undefined' && AT.wet) || 0));
  const c = cos(car.yaw), s = sin(car.yaw), hubs = [[0.735, 1.194], [-0.733, 1.194], [0.735, -1.114], [-0.733, -1.114]];
  for (let w = 0; w < 4; w++) {
    const lx = hubs[w][0], lz = hubs[w][1], x = car.x + C.ox + lx * c + lz * s, z = car.z + C.oz - lx * s + lz * c, y = car.y + 0.012;
    const a = k * (w < 2 ? 0.35 : 0.8), L = M.last[w];
    if (a < 0.03 || fly.on) { M.last[w] = null; continue; }
    if (!L) { M.last[w] = [x, y, z, a]; continue; }
    const d = Math.hypot(x - L[0], z - L[2]); if (d < 0.3) continue;
    if (d < 3) { const o = M.head * 8; M.seg.set([L[0], L[1], L[2], x, y, z, 0.2, (a + L[3]) / 2], o); M.head = (M.head + 1) % M.N; M.count = min(M.N, M.count + 1); }
    M.last[w] = [x, y, z, a];
  }
  let n = 0;
  for (let i = 0; i < M.count; i++) { const j = (M.head - 1 - i + M.N) % M.N, o = j * 8, q = n * 8, dx = M.seg[o] - ex, dz = M.seg[o + 2] - ez; if (dx * dx + dz * dz > 250 * 250) continue;
    const age = i / M.N, fade = 1 - sm(0.75, 1, age);
    M.inst[q] = dx; M.inst[q + 1] = M.seg[o + 1] - ey; M.inst[q + 2] = dz; M.inst[q + 3] = M.seg[o + 6];
    M.inst[q + 4] = M.seg[o + 3] - ex; M.inst[q + 5] = M.seg[o + 4] - ey; M.inst[q + 6] = M.seg[o + 5] - ez; M.inst[q + 7] = M.seg[o + 7] * fade; n++; }
  M.n = n; if (n) Q.writeBuffer(M.buf, 0, M.inst, 0, n * 8);
}
function marksDraw(p) { const M = MARKS; if (!M || !M.n) return; p.setPipeline(M.pipe); p.setVertexBuffer(0, M.buf); p.draw(6, M.n); }
