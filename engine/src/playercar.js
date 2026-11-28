// --------------------------------------------------------------------------------------------------------- the player's car
// The car itself, seen whole from behind it (V, or Circle on a pad: view3) and from the flying camera, and casting its shadow on the road always.
// The cars (PCARS, boot.js; the one driven PCAR_ID): "2016 Mazda MX-5 Miata" and "GR86 2021", both by Galaxy Car Showroom (CC BY 4.0, see
// CREDITS.md), made into assets/mx5.bin and assets/gr86.bin by scripts/mx5.py and scripts/gr86.py (the format in scripts/pcr2.py): right-hand
// drive, no badges, the model's own textures, and the four wheels apart so that they roll and the front pair steer.
// Its place is given to the shaders relative to the eye, worked out here in double precision (its whole metres and the rest apart), so that it
// does not shimmer far from the world's origin.
// What differs between the cars beyond their models: the name and the figures the garage panel shows, and the paint - its colour (linear) and
// that of the light its metal flakes give back; and where its number plates go (plates: [height of the middle, z] at the front and the back - set
// 6 mm proud of the outermost of the bumper behind them, measured from the model).
const PCAR_INFO = {
  mx5: { name: 'MX-5', sub: 'ND 2.0 · 2016', hp: 184, kg: 1060, paint: [0.30, 0.008, 0.012], flake: [1, 0.55, 0.45], plates: [[0.35, 1.9351], [0.385, -1.9119]] },
  ae86: { name: 'AE86', sub: '', hp: 128, kg: 940, paint: [0.62, 0.62, 0.6], flake: [1, 1, 1], plates: [[0.45, 2.106], [0.45, -2.106]], plate: 'jp', paintMap: true, decal: { layer: 7, draw: (x, S) => e86Doors(x, S) } },      // (ae86.js: met on the passes; not in the garage)
  gr86: { name: 'GR86', sub: '2.4 · 2021', hp: 235, kg: 1270, paint: [0.46, 0.016, 0.008], flake: [1, 0.6, 0.42], plates: [[0.36, 2.1207], [0.47, -2.1155]] },
};
// The number plates. Each car has its kind (info.plate): 'th' unless said - a Thai plate, Bangkok's - or 'jp', a Japanese one (the AE86's).
// PLATES: for each, the plate's half width and half height (m) and the share of its square layer it takes from the top (v).
const PLATES = { th: { hw: 0.17, hh: 0.075, v: 452 / 1024 }, jp: { hw: 0.165, hh: 0.0825, v: 512 / 1024 } };
// The Thai plate: a Thai private car's - white, a thin black rim with rounded corners, black lettering, the registration across the top in
// large letters and the province under it - here ENDLESS over กรุงเทพมหานคร. Drawn once (both cars share it) on a square layer, the plate in
// the top PLATE_V of it, 34:15 as the real one.
const PLATE_V = PLATES.th.v; const plateP = {};
const pcPlate = (kind = 'th') => plateP[kind] || (plateP[kind] = kind === 'jp' ? pcPlateJP() : (async () => {
  const S = 1024, H = Math.round(S * PLATE_V), cv = document.createElement('canvas'); cv.width = S; cv.height = S; const x = cv.getContext('2d');
  const F = '"Sukhumvit Set", Thonburi, "Noto Sans Thai", Sarabun, "Leelawadee UI", Tahoma, sans-serif';
  try { await document.fonts.load(`700 100px ${F}`, 'ENDLESSกรุงเทพมหานคร'); } catch (e) {}
  x.fillStyle = '#f2f2ef'; x.fillRect(0, 0, S, S);
  const rr = (m, r) => { x.beginPath(); x.roundRect(m, m, S - 2 * m, H - 2 * m, r); };
  x.lineWidth = 9; x.strokeStyle = '#141414'; rr(16, 34); x.stroke();
  x.fillStyle = '#141414'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  // (each line squeezed to its width, as the plates' tall narrow letters are)
  const line = (t, px, w, y, wt) => { x.font = `${wt} ${px}px ${F}`; const m = x.measureText(t).width; x.save(); x.translate(S / 2, y); x.scale(min(1, w / m), 1); x.fillText(t, 0, 0); x.restore(); };
  line('ENDLESS', 232, 860, 262, 700); line('กรุงเทพมหานคร', 112, 600, 392, 600);
  return cv; })());
// The Japanese plate: a private car's - white, green lettering and a thin green rim, 330 x 165 mm (2:1); across the top the place it is
// registered, here Gunma (群馬), and its class number; below, a kana on the left and the number large. The number is the game's own.
const pcPlateJP = async () => {
  const S = 1024, H = Math.round(S * PLATES.jp.v), cv = document.createElement('canvas'); cv.width = S; cv.height = S; const x = cv.getContext('2d');
  const F = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "Noto Sans CJK JP", sans-serif';
  try { await document.fonts.load(`700 100px ${F}`, '群馬330ら12-86'); } catch (e) {}
  x.fillStyle = '#f3f3ee'; x.fillRect(0, 0, S, S);
  x.lineWidth = 8; x.strokeStyle = '#17583a'; x.beginPath(); x.roundRect(14, 14, S - 28, H - 28, 30); x.stroke();
  x.fillStyle = '#17583a'; x.textBaseline = 'alphabetic';
  const txt = (t, px, cx, y, w, wt = 700) => { x.font = `${wt} ${px}px ${F}`; const m = x.measureText(t).width; x.save(); x.translate(cx, y); x.scale(min(1, w / m), 1); x.textAlign = 'center'; x.fillText(t, 0, 0); x.restore(); };
  txt('群馬 330', 120, S / 2, 160, 470);
  txt('ら', 112, 120, 420, 120, 600);
  txt('12-86', 300, S / 2 + 70, 455, 760);
  return cv; };
// The AE86's doors: a tofu shop's name, in Japanese (the shop is the game's own) - its delivery car, white over black - in black lettering on the white of each door, over the field
// scripts/ae86.py painted out. Drawn into the paint's own map (layer 7) as it is decoded. Where the doors are on that map, read from the
// model: the car's left (x < 0) at u 0.43..0.64, its right at u 0.94..0.73 (mirrored), the door's upper white between v 0.81 and 0.86 (the lettering 0.82..0.857); v grows
// up the car, so the lettering is drawn upside down on the map, and on both sides it then reads from left to right.
const E86_SHOP = ['みどり豆腐店', '毎朝配達'];
function e86Doors(x, S) {
  const F = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", "Hiragino Sans", "Noto Sans JP", serif';
  const one = (u0, u1, v0, v1) => {
    x.save(); x.translate(S * (u0 + u1) / 2, S * (v0 + v1) / 2); x.scale(1, -1);
    const w = S * abs(u1 - u0), h = S * (v1 - v0); x.fillStyle = '#121212'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    const line = (t, px, y, wt) => { x.font = `${wt} ${px}px ${F}`; const m = x.measureText(t).width; x.save(); x.translate(0, y); x.scale(min(1, w / m), 1); x.fillText(t, 0, 0); x.restore(); };
    line(E86_SHOP[0], h * 0.62, h * 0.12, 700); line(E86_SHOP[1], h * 0.3, h * 0.48, 600);
    x.restore(); };
  one(0.455, 0.61, 0.82, 0.857);       // the left door
  one(0.755, 0.91, 0.82, 0.857);       // the right
}
function pcBuild(B, id) {
  if (!B) return null;
  const dv = new DataView(B), nv = dv.getUint32(4, true), ni = dv.getUint32(8, true), hub = new Float32Array(B, 12, 12);
  // (the model's textures, colour and normal maps, as one array of 1024 x 1024 layers with their smaller sizes below them for the distance - each
  // image decoded and put in as it comes, the car drawn meanwhile with what is there; see scripts/pcr2.py)
  const nt = dv.getUint32(60, true), imgs = []; let o = 64;
  for (let i = 0; i < nt; i++) { const l = dv.getUint32(o, true); imgs.push(new Uint8Array(B, o + 4, l)); o += 4 + l; }
  const TS = 1024, mips = Math.log2(TS) + 1, tex = device.createTexture({ size: [TS, TS, nt + 1], mipLevelCount: mips, format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
  const live = { on: true }, DEC = (PCAR_INFO[id] || {}).decal;
  imgs.forEach(async (d, li) => { try { let bm = await createImageBitmap(new Blob([d]), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    // (a car's own lettering drawn over its map - info.decal - before it goes in; the map brought to 1024 first, as every layer is)
    if (DEC && DEC.layer === li) { const cv = document.createElement('canvas'); cv.width = cv.height = TS; const x = cv.getContext('2d'); x.drawImage(bm, 0, 0, TS, TS);
      try { await document.fonts.load('700 40px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif', E86_SHOP.join('')); } catch (e) {}
      DEC.draw(x, TS); bm = await createImageBitmap(cv, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }); }
    for (let m = 0, s = TS; m < mips && live.on; m++, s >>= 1) { const q = m ? await createImageBitmap(bm, { resizeWidth: s, resizeHeight: s, resizeQuality: 'high', colorSpaceConversion: 'none', premultiplyAlpha: 'none' }) : bm;
      if (live.on) Q.copyExternalImageToTexture({ source: q }, { texture: tex, origin: [0, 0, li], mipLevel: m }, [s, s]); } } catch (e) { console.warn(id + ' texture', li, e); } });
  const smp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', maxAnisotropy: ULTRA ? 16 : 8 });
  // (and the number plates, which the models have not: a layer of their own after the model's - pcPlate - and a quad at each end, material 15)
  const info = PCAR_INFO[id] || PCAR_INFO.mx5, PL = info.plates || [], PK = PLATES[info.plate] ? info.plate : 'th', PD = PLATES[PK];
  pcPlate(PK).then((cv) => { for (let m = 0, s = TS; m < mips && live.on; m++, s >>= 1) createImageBitmap(cv, { resizeWidth: s, resizeHeight: s, resizeQuality: 'high' })
    .then((q) => { if (live.on) Q.copyExternalImageToTexture({ source: q }, { texture: tex, origin: [0, 0, nt], mipLevel: Math.log2(TS / s) }, [s, s]); }); }).catch((e) => console.warn('plate', e));
  const vAll = new Uint8Array((nv + PL.length * 4) * 40), iAll = new Uint32Array(ni + PL.length * 6), vd = new DataView(vAll.buffer);
  vAll.set(new Uint8Array(B, o, nv * 40)); iAll.set(new Uint32Array(B, o + nv * 40, ni));
  PL.forEach(([yc, zc], j) => { const sg = Math.sign(zc), b0 = nv + j * 4;
    // (34 x 15 cm, as a Thai car's - 33 x 16.5 a Japanese; read from outside: seen from behind the car's left, +x, is on the left, from in front on the right)
    [[-1, 1], [1, 1], [1, -1], [-1, -1]].forEach(([a, c], q) => { const b = (b0 + q) * 40, x = a * PD.hw * sg;
      vd.setFloat32(b, x, true); vd.setFloat32(b + 4, yc + c * PD.hh, true); vd.setFloat32(b + 8, zc, true);
      vd.setFloat32(b + 12, 0, true); vd.setFloat32(b + 16, 0, true); vd.setFloat32(b + 20, sg, true);
      vAll.set([255, 255, 255, 255, 15, 0, nt, 255], b + 24); vd.setFloat32(b + 32, (a + 1) / 2, true); vd.setFloat32(b + 36, (1 - c) / 2 * PD.v, true); });
    iAll.set([b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3], ni + j * 6); });
  const vb = vbuf(vAll), ib = vbuf(iAll, GPUBufferUsage.INDEX);
  const ub = device.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }), U = new Float32Array(36);
  for (let w = 0; w < 4; w++) U.set([hub[w * 3], hub[w * 3 + 1], hub[w * 3 + 2], 0], 12 + w * 4);
  U.set(info.paint, 28); U.set(info.flake, 32);      // (pu.pc, pu.fl)
  U[31] = info.paintMap ? 1 : 0;      // (pu.pc.w: the paint takes the colours of its own map as well - the AE86's two tones and the lettering on its doors)
  const bgl = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} },
    { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: '2d-array' } }, { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} }] });
  const bg = device.createBindGroup({ layout: bgl, entries: [{ binding: 0, resource: { buffer: ub } }, { binding: 2, resource: tex.createView({ dimension: '2d-array' }) }, { binding: 3, resource: smp }] });
  const LB = [{ arrayStride: 40, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'unorm8x4' }, { shaderLocation: 3, offset: 28, format: 'uint8x4' }, { shaderLocation: 4, offset: 32, format: 'float32x2' }] }];
  const pipe = scenePipe('vsPc', 'fsPc', LB, 'triangle-list', 1, 'less', 4, device.createPipelineLayout({ bindGroupLayouts: [bglScene, bgl] }));
  const pipeS = device.createRenderPipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [bglShadow, bgl] }), vertex: { module: mShadow, entryPoint: 'vsPc', buffers: LB },
    primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.5 } });
  // (where the wheels stand, from the hubs in the file: each wheel's place on the car's plan, the wheelbase and the track, and the tyres' radius -
  // the hub's height over the ground they stand on)
  const WH = [0, 1, 2, 3].map((w) => [hub[w * 3], hub[w * 3 + 2]]), base = (hub[2] + hub[5] - hub[8] - hub[11]) / 2, track = (hub[0] - hub[3] + hub[6] - hub[9]) / 2, tyre = (hub[1] + hub[4] + hub[7] + hub[10]) / 4;
  return { id, info, WH, base, track, tyre, vb, ib, ni: iAll.length, ub, U, bg, pipe, pipeS, tex, live, ox: 0, oz: 0, spin: 0, pv: 0, brake: 0, cam: null, cp: null, phd: null, roll: 0, rollV: 0, dive: 0, diveV: 0, wa: 0, hop: 0, hopV: 0, t: 0 };
}
let PCAR = pcBuild(ASSET[PCAR_ID], PCAR_ID);
// Another car chosen (the garage panel): its model fetched if it has not been, then put in the old one's place - where it is on the road, how
// it moves and the camera behind it carried over - and its own way of driving taken (CARS, drive.js). Remembered. done(ok) when it is there.
let pcLoading = null;
function pcSwitch(id, done) {
  if (!PCARS.includes(id) || (PCAR && PCAR.id === id)) { if (done) done(true); return; }
  try { localStorage.setItem('endless.car', id); } catch (e) {}
  const go = () => { const old = PCAR, C = pcBuild(ASSET[id], id); if (!C) { if (done) done(false); return; }
    if (old) { for (const k of ['ox', 'oz', 'spin', 'pv', 'brake', 'cam', 'cp', 'phd', 'roll', 'rollV', 'dive', 'diveV', 'wa', 'hop', 'hopV', 't', 'gy', 'gp', 'gr', 'yMp']) C[k] = old[k];
      old.live.on = false; old.vb.destroy(); old.ib.destroy(); old.ub.destroy(); old.tex.destroy(); }
    PCAR = C; PCAR_ID = id; if (typeof CARS !== 'undefined' && CARS[id]) CARP = CARS[id];
    if (auto.limit > CARP.top) setLimit(CARP.top); else drvRead();      // (the self-driving's speed brought down to what this car can do)
    if (done) done(true); };
  if (ASSET[id]) { go(); return; }
  const want = id; pcLoading = id;
  fetch('assets/' + id + '.bin').then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then((b) => { ASSET[id] = b; if (pcLoading === want) { pcLoading = null; go(); } })
    .catch((e) => { console.warn('car ' + id, e); if (pcLoading === want) pcLoading = null; if (done) done(false); });
}
// The height of the road or ground under a wheel as it is drawn: the ground is a mesh of points every 2 m (chunks.js), flat between them in
// triangles, not the curve ground() follows - over a crest or a hollow they part by centimetres, and on a cambered road by more. Built roads
// (bridge decks, tunnels, the slab over an underpass) are taken as they are.
function pcSurfY(x, z, y) {
  // (On a bridge, a wheel of a car that is up on the deck stands at the deck's height wherever it is - even out past the deck's edge, where a
  // car sliding sideways by the rail has its tail: reckoned from what lies under it there - the sea's floor, 15 m down - that one wheel pulled
  // the drawn car down through the bridge and over on its side, hanging under the deck, while the car itself was still up on the road.)
  if (brSpan(z) && y > roadY(z) - 0.5 && abs(x - roadX(z)) < 9) return roadY(z) + 0.03;
  const s = surf(x, z, y), g0 = ground(x, z); if (abs(s - g0) > 0.02) return s;
  const fx = x / GS, fz = z / GS, i = floor(fx), j = floor(fz), u = fx - i, v = fz - j, X = i * GS, Z = j * GS;
  const ya = ground(X, Z), yb = ground(X + GS, Z), yc = ground(X, Z + GS);
  if (u + v < 1) return ya + u * (yb - ya) + v * (yc - ya);
  const yd = ground(X + GS, Z + GS); return yd + (1 - u) * (yc - yd) + (1 - v) * (yb - yd);
}
// Each frame, before the passes: where each car is and how its wheels stand - the player's (PCAR, by car) and, racing, the rival's
// (rival.js: RIV.C by RIV.s). (spin: the wheels' turn, by the distance rolled on its tyres; the brake lamps lit while the car is slowing hard)
// The MX-5's soft top: down or up (the T key; kept between visits). It folds over a little more than two seconds - PCAR.top,
// 0 up .. 1 down, which the vertex stage folds the roof's own vertices by (vsPc, part 9). Only the MX-5 has one.
let TOP_DOWN = false; try { TOP_DOWN = localStorage.getItem('endless.top') === '1'; } catch (e) {}
// (Not in the rain or the snow: the top will not come down while either falls - topWet - and if it is down when they begin, it goes up by
// itself (pcUpdate) and stays up; the driver's wish is not kept - it has to be opened again by hand once the sky has cleared.)
const topWet = () => typeof AT !== 'undefined' && (AT.rain > 0.08 || AT.snow > 0.15);
function topToggle() { if (PCAR_ID !== 'mx5') return false; if (!TOP_DOWN && topWet()) return 'wet'; TOP_DOWN = !TOP_DOWN; try { localStorage.setItem('endless.top', TOP_DOWN ? '1' : '0'); } catch (e) {} return true; }
// The MX-5's driver (DRV): with a top that comes down the car is seen into, so someone sits at its wheel - a man in a white T-shirt and shorts
// and a black cap - one figure of the people's own model (render.js PPL, vsPpl: seated, c.y 4), set in the driver's seat each frame from where
// the car stands. Drawn from outside the car only: from the driver's own eye there is nobody to see.
const DRV = { buf: device.createBuffer({ size: 48, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }), a: new Float32Array(12), on: false,
  set(C, S) { this.on = PCAR_ID === 'mx5' && !!PPL; if (!this.on) return; const cy = cos(S.yaw), sy = sin(S.yaw), lx = DRV_AT[0], lz = DRV_AT[2], A = this.a;
    A[0] = S.x + (C.ox || 0) + lx * cy + lz * sy; A[1] = C.gy + DRV_AT[1] + (C.hop || 0); A[2] = S.z + (C.oz || 0) - lx * sy + lz * cy; A[3] = S.yaw;
    A[4] = 1.72; A[5] = 0.137; A[6] = -1; A[7] = 0; A[8] = A[1]; A[9] = 4; A[10] = 1; A[11] = 0; device.queue.writeBuffer(this.buf, 0, A); this.capSet(); },
  // His cap, a thing of its own (a baseball cap: a round crown of six panels, a button on top, a stiff peak out over the eyes), black: built
  // once in the head's own measure and set on the head each frame - the people's model has no hat, and its hair pulled into the shape of one
  // was no cap at all. (Drawn as a sculpted thing: pMesh.)
  cap: (() => { const P = [], N = [], I = [], cx = 0, cy = 0.952, cz = -0.004, rx = 0.053, ry = 0.06, rz = 0.067, nr = 8, ns = 24;
    // the crown: fitted close to the head, sitting above the ears - its band a level line round the brow - taller and fuller at the front, where
    // its two stiff panels stand nearly upright, rounding over to the back; a button on top; a strap's tab at the nape
    for (let i = 0; i <= nr; i++) { const el = (i / nr) * PI / 2 * 0.985; for (let j = 0; j < ns; j++) { const az = j / ns * TAU, fr = 0.5 + 0.5 * cos(az), ce = Math.pow(cos(el), 0.62 - 0.14 * fr), x = ce * sin(az), y = Math.pow(sin(el), 0.9) * (1 + 0.07 * fr), z = ce * cos(az);
      P.push(cx + rx * x, cy + ry * y, cz + rz * z); N.push(x, 0.25 + y, z); } }
    for (let i = 0; i < nr; i++) for (let j = 0; j < ns; j++) { const a = i * ns + j, b = i * ns + (j + 1) % ns; I.push(a, b, a + ns, b, b + ns, a + ns); }
    { const t = P.length / 3; P.push(cx, cy + ry * 1.04, cz); N.push(0, 1, 0); for (let j = 0; j < ns; j++) I.push(nr * ns + j, nr * ns + (j + 1) % ns, t); }
    { const b0 = P.length / 3, yb = cy + ry * 1.035; for (let j = 0; j < 8; j++) { const a = j / 8 * TAU; P.push(cx + 0.0065 * sin(a), yb, cz + 0.0065 * cos(a)); N.push(sin(a), 0.3, cos(a)); } P.push(cx, yb + 0.006, cz); N.push(0, 1, 0); for (let j = 0; j < 8; j++) I.push(b0 + j, b0 + (j + 1) % 8, b0 + 8); }
    { const b0 = P.length / 3, zs = cz - rz * 1.0; for (const [x, y] of [[-0.012, 0.004], [0.012, 0.004], [-0.012, 0.016], [0.012, 0.016]]) { P.push(cx + x, cy + y, zs - 0.006); N.push(0, 0, -1); } I.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2); }
    // the peak: short, stiff, curved - arched across, its sides drooping - reaching a hand's breadth out from the band and tipping down a little
    const nv = 13, nu = 4, pk = (u, v) => { const a = (u - 0.5) * 2.0, w = 1 - 0.22 * v * v; return [cx + rx * 1.0 * sin(a) * w, cy + 0.003 - 0.012 * v - 0.016 * (1 - cos(a)) * (0.6 + 0.4 * v), cz + rz * cos(a) * 0.99 + 0.05 * v * (0.5 + 0.5 * cos(a))]; };
    for (const sgn of [1, -1]) { const b0 = P.length / 3; for (let i = 0; i <= nu; i++) for (let j = 0; j < nv; j++) { const q = pk(j / (nv - 1), i / nu), a = (j / (nv - 1) - 0.5) * 2.0; P.push(q[0], q[1] - (sgn < 0 ? 0.003 : 0), q[2]); N.push(0.35 * sin(a) * sgn, sgn, 0.2 * sgn); }
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv - 1; j++) { const a = b0 + i * nv + j; I.push(a, a + 1, a + nv, a + 1, a + nv + 1, a + nv); } }
    const n = P.length / 3; return { P, N, n, I: new Uint32Array(I), V: new Float32Array(n * 7), vb: device.createBuffer({ size: n * 28, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }), ib: vbuf(new Uint32Array(I), GPUBufferUsage.INDEX) }; })(),
  capSet() { const K = this.cap, A = this.a, H = A[4], cy = cos(A[3]), sy = sin(A[3]), V = K.V, y0 = A[1] + 0.57 - 0.52 * H;
    for (let i = 0; i < K.n; i++) { const x = K.P[i * 3] * H, y = K.P[i * 3 + 1] * H, z = K.P[i * 3 + 2] * H, nx = K.N[i * 3], nz = K.N[i * 3 + 2], o = i * 7;
      V[o] = A[0] + x * cy + z * sy; V[o + 1] = y0 + y; V[o + 2] = A[2] - x * sy + z * cy; const ny = K.N[i * 3 + 1], nl = Math.hypot(nx, ny, nz) || 1;
      // (black cotton, not a black hole: a very dark grey that still takes the light - a colour of its own, 100 + five bits each of r, g, b)
      V[o + 3] = (nx * cy + nz * sy) / nl; V[o + 4] = ny / nl; V[o + 5] = (-nx * sy + nz * cy) / nl; V[o + 6] = 100 + 5 + 32 * 5 + 1024 * 6; }
    device.queue.writeBuffer(K.vb, 0, V); },
  drawCap(p, shadow) { if (!this.on) return 0; const K = this.cap; p.setPipeline(shadow ? pMeshS : pMesh); p.setVertexBuffer(0, K.vb); p.setIndexBuffer(K.ib, 'uint32'); p.drawIndexed(K.I.length); return K.I.length / 3; },
  draw(p, shadow, near) { if (!this.on) return 0; const M = PPL[0][near ? 0 : 1]; p.setPipeline(shadow ? pPplS : pPpl); p.setVertexBuffer(0, M.vb); p.setVertexBuffer(1, this.buf); p.setIndexBuffer(M.ib, 'uint32'); p.drawIndexed(M.ni, 1); return M.ni / 3; } };
// (where he sits, in the car's own measure - x to its left, up from the ground under it, ahead: the right-hand seat)
const DRV_AT = [-0.36, -0.34, -0.56];
function pcUpdate(dt, ex, ey, ez) {
  if (TOP_DOWN && PCAR_ID === 'mx5' && topWet()) { TOP_DOWN = false; try { localStorage.setItem('endless.top', '0'); } catch (e) {} if (typeof padNote === 'function') padNote(AT.snow > 0.15 ? 'หิมะตก · ปิดประทุนอัตโนมัติ' : 'ฝนตก · ปิดประทุนอัตโนมัติ'); }
  if (PCAR) { const tg = TOP_DOWN && PCAR_ID === 'mx5' ? 1 : 0, t0 = PCAR.top === undefined ? tg : PCAR.top; PCAR.top = t0 + clamp(tg - t0, -dt / 2.2, dt / 2.2); }
  if (PCAR) { pcPose(PCAR, car, dt, K('Space') > 0); DRV.set(PCAR, car); }
  if (typeof RIV !== 'undefined' && RIV.C && RIV.s) pcPose(RIV.C, RIV.s, dt, RIV.s.brk > 0);
  if (typeof E86 !== 'undefined' && E86.C && E86.s) pcPose(E86.C, E86.s, dt, E86.s.brk > 0);
}
// C: the car's model and its state on the springs; S: where it is and how it moves (x y z yaw hd v slip gut, as car); braking: its brake held
function pcPose(C, S, dt, braking) {
  C.spin += S.v * dt / C.tyre;
  const dec = dt > 0 ? (C.pv - abs(S.v)) / dt : 0; C.pv = abs(S.v); C.brake += ((braking || dec > 2.5 ? 1 : 0) - C.brake) * (1 - Math.exp(-dt * 12));
  // The body on its springs. It leans out of a turn by the sideways pull - the speed times how fast the travel is turning - up to 4 degrees,
  // dips its nose braking and lifts it accelerating, up to 2; each on a spring that is damped, so that it settles with a little swing, not at
  // once. The wheels stay on the road.
  const wr = (q) => q - Math.round(q / TAU) * TAU, hd = S.hd !== undefined ? S.hd : S.yaw, yr = C.phd === null || dt <= 0 ? 0 : wr(hd - C.phd) / dt; C.phd = hd;
  const aLat = clamp(S.v * yr, -12, 12), aLon = clamp(-dec, -10, 10), sp = (x, v, t, w) => { const a = (t - x) * w * w - 2 * 0.55 * w * v; v += a * dt; return [x + v * dt, v]; };
  // (drifting the body leans further - the tyres sideways, the weight thrown onto the outer pair - up to 6 degrees, and swings more on its springs)
  // (by degrees with the slide, from 5 to 17 degrees sideways: switched on at 5 the body jumped from the one lean to the other)
  const dr = DRIFT ? sm(0.08, 0.3, abs(S.slip || 0)) : 0, rc = 0.07 + 0.035 * dr;
  if (dt > 0 && dt < 0.2) { [C.roll, C.rollV] = sp(C.roll, C.rollV, clamp(aLat * (0.0062 + 0.0023 * dr), -rc, rc), 8 - 1.5 * dr); [C.dive, C.diveV] = sp(C.dive, C.diveV, clamp(aLon * 0.0035, -0.035, 0.035), 9); }
  // The front wheels turned as far as the car's travel is bending - the wheelbase over the radius - and, sliding, pointed along the
  // travel rather than the nose: the wheel held against the slide, as a driver holds it. (Turned by the steering itself they stood 29 degrees
  // over at any speed, and the wrong way in a drift.)
  const want = clamp(wr(hd - S.yaw) + Math.atan(C.base * yr / max(abs(S.v), 2)) * Math.sign(S.v || 1), -0.6, 0.6); C.wa += (want - C.wa) * (1 - Math.exp(-dt * 10));
  // Sliding, the car is drawn turned about a point near its front wheels, not its middle: the front runs along the line the car is travelling
  // and the tail swings out - as a drifting car is seen to. (Turned about its middle, it spun on the spot like a top, both ends swinging.)
  const PZ = 1.0, ox = (sin(hd) - sin(S.yaw)) * PZ, oz = (cos(hd) - cos(S.yaw)) * PZ; C.ox = ox; C.oz = oz;
  // Set on its four wheels: the height under each, and the car's height, pitch and sideways tilt from them - laid on the surface as it is drawn,
  // so that no wheel sinks into it or stands off it. (Placed by one height under its middle and its pitch alone, it stood level across a
  // cambered road or a slope - one side sunk, the other in the air - and up to 10 cm off over crests and hollows.)
  const cy = cos(S.yaw), sy = sin(S.yaw), WH = C.WH, hy4 = WH.map(([lx, lz]) => pcSurfY(S.x + ox + lx * cy + lz * sy, S.z + oz - lx * sy + lz * cy, S.y + 1));
  C.hy4 = hy4; C.wx = WH.map(([lx, lz]) => [S.x + ox + lx * cy + lz * sy, S.z + oz - lx * sy + lz * cy]);
  const yM = (hy4[0] + hy4[1] + hy4[2] + hy4[3]) / 4 + 0.012, pit = Math.atan2((hy4[0] + hy4[1] - hy4[2] - hy4[3]) / 2, C.base), rl = Math.atan2((hy4[0] + hy4[2] - hy4[1] - hy4[3]) / 2, C.track);
  if (C.gy === undefined || dt > 0.3 || abs(C.gy - yM) > 1.5) { C.gy = yM; C.gp = pit; C.gr = rl; C.yMp = yM; }
  // (The height follows the land as it rises and falls under the car at once; only a step - more than the car's own travel could climb in the
  // frame on a 40% slope, as onto a deck or down into the gutter - is eased. Eased throughout, the car trailed the road by its speed times the
  // slope over 25: down an underpass's ramp, or down a hill at speed, it stood a hand's breadth and more in the air, and sank into the climbs.)
  { const dY = yM - (C.yMp ?? yM); C.yMp = yM; if (abs(dY) < abs(S.v) * dt * 0.4 + 0.008) C.gy += dY; }
  const kq = 1 - Math.exp(-dt * 25); C.gy += (yM - C.gy) * kq; C.gp += (pit - C.gp) * kq; C.gr += (rl - C.gr) * kq;
  const U = C.U, hx = Math.fround(S.x + ox), hy = Math.fround(C.gy), hz = Math.fround(S.z + oz);
  U[0] = hx; U[1] = hy; U[2] = hz; U[3] = S.yaw; U[4] = S.x + ox - hx; U[5] = C.gy - hy; U[6] = S.z + oz - hz; U[7] = C.gp; U[23] = C.gr;
  // (and the road under the tyres: the body shakes a little on it, more the faster - a few millimetres - and on rough ground or in the gutter more)
  C.t += dt; const va = min(1, abs(S.v) / 25), rough = (S.gut || 0) > 0.5 ? 2.5 : abs(rdist(S.x, S.z)) > 4.6 ? 3 : 1;
  const shake = (Math.sin(C.t * 23.1) * 0.6 + Math.sin(C.t * 37.7) * 0.4) * 0.0025 * va * rough;
  if (dt > 0 && dt < 0.2) [C.hop, C.hopV] = (() => { const t = shake * 1.2, w = 14; let v = C.hopV + ((t - C.hop) * w * w - 2 * 0.35 * w * C.hopV) * dt; return [C.hop + v * dt, v]; })();
  U[8] = C.spin % TAU; U[9] = C.wa; U[10] = C.brake; U[11] = C.roll + shake * 0.6; U[15] = C.dive; U[19] = C.hop; U[27] = C.top || 0;
  Q.writeBuffer(C.ub, 0, U);
}
// drawn into the shadow map always (from the driver's seat its shadow lies on the road beside it), and into the picture when it can be seen
// (the rival's car always, wherever the eye is: from the driver's seat it is seen through the windscreen and in the mirrors' place)
function pcDraw(p, shadow) {
  const one = (C) => { p.setPipeline(shadow ? C.pipeS : C.pipe); p.setBindGroup(1, C.bg); p.setVertexBuffer(0, C.vb); p.setIndexBuffer(C.ib, 'uint32'); p.drawIndexed(C.ni); };
  if (PCAR && (shadow || view3 || fly.on || (typeof cineOn === 'function' && cineOn()))) one(PCAR);
  if (typeof RIV !== 'undefined' && RIV.C && RIV.s) one(RIV.C);
  if (typeof E86 !== 'undefined' && E86.C && E86.s) one(E86.C);
}
// Whether a sliding car's swung-out tail is into something: its two rear corners as drawn - turned about a point near its front (pcPose) -
// against what is solid (solidAt), a bridge's balustrade and the coast road's rail. (Only the car's middle was stopped by them: sideways in a
// drift its tail swept through the balustrade, and through the scooters parked along a town's footpath.) C: the car's model (its wheels).
function pcTailHit(C, x, z, y, yaw, hd) {
  if (!C) return false;
  const ox = sin(hd) - sin(yaw), oz = cos(hd) - cos(yaw), c = cos(yaw), s = sin(yaw), lz = min(C.WH[2][1], C.WH[3][1]) - 0.8;
  for (const lx of [0.92, -0.92]) { const px = x + ox + lx * c + lz * s, pz = z + oz - lx * s + lz * c, d = px - roadX(pz);
    if (solidAt(px, pz, y, 0.12) > 0) return true;
    if (brSpan(pz) && abs(d) > 4.3) return true;
    if (seaW(pz) >= 0.35 && pineWt(pz) <= 0.35 && d > 4.2 && !railGap(floor(pz / 4))) return true; }
  return false;
}
// How much of a slide a car can hold just here without its tail swung into anything: its way looked along for 10 m (heading hd, the road
// turning kk a metre), at the slide sl it wants, then at less of it, until its tail is clear - 1: all of it, 0: none. (Knocked back only once
// it had struck, the car was seen to drift into the posts and the lamp posts by the road and bounce off them: it should never have hit them.)
function pcSlideRoom(C, x, z, y, hd, kk, sl) {
  if (!C || abs(sl) < 0.05) return 1;
  for (const f of [1, 0.7, 0.45, 0.25, 0.1]) { let ok = true;
    for (const d of [0, 3, 6, 10]) { const h = hd + kk * d, hm = hd + kk * d / 2; if (pcTailHit(C, x + sin(hm) * d, z + cos(hm) * d, y, h + sl * f, h)) { ok = false; break; } }
    if (ok) return f; }
  return 0;
}
// The cars that smoke and mark the road: the player's, and the rival's while there is one ({ C: its model, S: its state, i: which })
const pcCars = () => { const L = []; if (PCAR && !fly.on) L.push({ C: PCAR, S: car, i: 0 }); if (typeof RIV !== 'undefined' && RIV.C && RIV.s) L.push({ C: RIV.C, S: RIV.s, i: 1 }); return L; };
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
// (A light haze, not a wall: 16 puffs a second from each tyre, half as thick, gone in a second or two, and thinned out near the eye. At 38 a
// second, nearly twice as thick and lasting up to three seconds, it hung in a bank behind the car, and the cinematic view's cameras, following
// low behind, saw nothing of the car through it.)
const SMOKE = (() => {
  if (!PCAR) return null;
  const N = 360, inst = new Float32Array(N * 8), buf = device.createBuffer({ size: inst.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  const pipe = device.createRenderPipeline({ layout: plScene,
    vertex: { module: mScene, entryPoint: 'vsSmoke', buffers: [{ arrayStride: 32, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }, { shaderLocation: 1, offset: 16, format: 'float32x4' }] }] },
    fragment: { module: mScene, entryPoint: 'fsSmoke', targets: [{ format: HDR, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' }, multisample: { count: AA }, depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'less' } });
  return { N, inst, buf, pipe, P: [], acc: [0, 0, 0, 0], n: 0 };
})();
function smokeStep(dt, ex, ey, ez) {
  const S = SMOKE; if (!S || dt <= 0) return;
  const wet = (typeof AT !== 'undefined' && AT.wet) || 0;
  for (const { C, S: T, i } of pcCars()) { const sl = abs(T.slip || 0), v = abs(T.v), off = abs(rdist(T.x, T.z)) > 4.6;
  const k = DRIFT ? clamp((sl - 0.15) / 0.4, 0, 1) * min(1, v / 15) * (1 - 0.75 * wet) : 0;
  if (k > 0) { const c = cos(T.yaw), s = sin(T.yaw);
    for (let w = 0; w < 2; w++) { const a = i * 2 + w; S.acc[a] += dt * 16 * k; while (S.acc[a] >= 1 && S.P.length < S.N) { S.acc[a] -= 1;
      const lx = C.WH[w + 2][0] + (Math.random() - 0.5) * 0.2, lz = C.WH[w + 2][1] + (Math.random() - 0.5) * 0.3, x = T.x + C.ox + lx * c + lz * s, z = T.z + C.oz - lx * s + lz * c;
      const vx = sin(T.hd || T.yaw) * T.v * 0.22 + (Math.random() - 0.5) * 1.2, vz = cos(T.hd || T.yaw) * T.v * 0.22 + (Math.random() - 0.5) * 1.2;
      S.P.push({ x, y: T.y + 0.12, z, vx, vy: 0.3 + Math.random() * 0.4, vz, age: 0, life: 1.2 + Math.random() * 0.8, sd: Math.random(), dust: off ? 1 : 0, a0: 0.12 + 0.1 * k }); } S.acc[a] = min(S.acc[a], 1); } } }
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
  return { N, seg, inst, buf, pipe, head: 0, count: 0, last: [[null, null, null, null], [null, null, null, null]] };
})();
function marksStep(dt, ex, ey, ez) {
  const M = MARKS; if (!M) return;
  const live = [], cs = pcCars();
  for (let j = 0; j < 2; j++) if (!cs.some((q) => q.i === j)) M.last[j] = [null, null, null, null];      // (a car gone, its streaks end)
  for (const { C, S: T, i } of cs) { const sl = abs(T.slip || 0), v = abs(T.v), brk = (i ? T.brk > 0.5 : K('Space') > 0.5) && v > 9 ? 0.55 : 0;
  const k = max(DRIFT && v > 6 ? clamp((sl - 0.12) / 0.35, 0, 1) : 0, brk) * (1 - 0.6 * ((typeof AT !== 'undefined' && AT.wet) || 0));
  // (each wheel's place and the height of the road under it as pcPose laid the car on them - at the car's own height one side of a
  // cambered road, or a crest, had the mark under the road, and it was lost there)
  if (!C.wx) continue;
  const ML = M.last[i];
  for (let w = 0; w < 4; w++) {
    const x = C.wx[w][0], z = C.wx[w][1], y = C.hy4[w] + 0.008, L = ML[w];
    // (a streak once begun runs on until the slide has nearly gone, not cut off and begun again as the slip wavers round where it starts, which
    // broke it into dashes)
    const a = k * (w < 2 ? 0.35 : 0.8);
    if (L ? a < 0.012 : a < 0.03) { ML[w] = null; continue; }
    if (!L) { ML[w] = [x, y, z, a]; continue; }
    const d = Math.hypot(x - L[0], z - L[2]);
    if (d > 3) { ML[w] = [x, y, z, a]; continue; }
    if (d < 0.3) { if (d > 0.01) live.push([L[0], L[1], L[2], x, y, z, 0.2, (a + L[3]) / 2]); continue; }
    const o = M.head * 8; M.seg.set([L[0], L[1], L[2], x, y, z, 0.2, (a + L[3]) / 2], o); M.head = (M.head + 1) % M.N; M.count = min(M.N, M.count + 1);
    ML[w] = [x, y, z, a];
  }
  }
  let n = 0;
  // (and the length still being laid, from the last laid point up to the tyre itself, drawn each frame - or the streak ended up to 30 cm behind
  // the wheel, apart from it)
  for (const g of live) { const q = n * 8; M.inst[q] = g[0] - ex; M.inst[q + 1] = g[1] - ey; M.inst[q + 2] = g[2] - ez; M.inst[q + 3] = g[6];
    M.inst[q + 4] = g[3] - ex; M.inst[q + 5] = g[4] - ey; M.inst[q + 6] = g[5] - ez; M.inst[q + 7] = g[7]; n++; }
  for (let i = 0; i < M.count && n < M.N; i++) { const j = (M.head - 1 - i + M.N) % M.N, o = j * 8, q = n * 8, dx = M.seg[o] - ex, dz = M.seg[o + 2] - ez; if (dx * dx + dz * dz > 250 * 250) continue;
    const age = i / M.N, fade = 1 - sm(0.75, 1, age);
    M.inst[q] = dx; M.inst[q + 1] = M.seg[o + 1] - ey; M.inst[q + 2] = dz; M.inst[q + 3] = M.seg[o + 6];
    M.inst[q + 4] = M.seg[o + 3] - ex; M.inst[q + 5] = M.seg[o + 4] - ey; M.inst[q + 6] = M.seg[o + 5] - ez; M.inst[q + 7] = M.seg[o + 7] * fade; n++; }
  M.n = n; if (n) Q.writeBuffer(M.buf, 0, M.inst, 0, n * 8);
}
// The shade under each car (vsUnder/fsUnder): the ground beneath a car sees little of the sky, so it is darker there whatever the sun does - a
// soft dark patch the size of the car and a little over, darkest under its middle, laid on the road at each corner's height (pcSurfY). Without
// it a car whose shadow fell behind it, seen from the side by the cinematic view's low cameras, had the road as bright under it as round it,
// and looked to float above it.
const UNDER = (() => {
  if (!PCAR) return null;
  const inst = new Float32Array(2 * 6 * 6), buf = device.createBuffer({ size: inst.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  const pipe = device.createRenderPipeline({ layout: plScene,
    vertex: { module: mScene, entryPoint: 'vsUnder', buffers: [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] }] },
    fragment: { module: mScene, entryPoint: 'fsUnder', targets: [{ format: HDR, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } } }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' }, multisample: { count: AA }, depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'less-equal', depthBias: -4, depthBiasSlopeScale: -2 } });
  return { inst, buf, pipe, n: 0 };
})();
function underStep(ex, ey, ez) {
  const U = UNDER; if (!U) return; let n = 0;
  for (const { C, S: T } of pcCars()) { const c = cos(T.yaw), s = sin(T.yaw), ox = T.x + C.ox, oz = T.z + C.oz;
    const K = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const lx = a * 1.12, lz = b * 2.55, x = ox + lx * c + lz * s, z = oz - lx * s + lz * c; return [x - ex, pcSurfY(x, z, T.y + 1) + 0.02 - ey, z - ez, a, b]; });
    for (const q of [0, 1, 2, 0, 2, 3]) { const k = K[q], o = n * 6; U.inst[o] = k[0]; U.inst[o + 1] = k[1]; U.inst[o + 2] = k[2]; U.inst[o + 3] = k[3]; U.inst[o + 4] = k[4]; U.inst[o + 5] = 0; n++; } }
  U.n = n; if (n) Q.writeBuffer(U.buf, 0, U.inst, 0, n * 6);
}
function underDraw(p) { const U = UNDER; if (!U || !U.n) return; p.setPipeline(U.pipe); p.setVertexBuffer(0, U.buf); p.draw(U.n); }
function marksDraw(p) { const M = MARKS; if (!M || !M.n) return; p.setPipeline(M.pipe); p.setVertexBuffer(0, M.buf); p.draw(6, M.n); }
