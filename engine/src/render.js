// --------------------------------------------------------------------------------------------------------- pipelines
const UBN = 152, UB = new Float32Array(UBN), UBS = new Float32Array(UBN);
const ubo = device.createBuffer({ size: UBN * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
const uboS = device.createBuffer({ size: UBN * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
const tShadow = device.createTexture({ size: [SHADOW, SHADOW], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
const vShadow = tShadow.createView();
const bglScene = device.createBindGroupLayout({ entries: [
  { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} },
  { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
  { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
  { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} }, { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
  { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: {} }] });
const bglShadow = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} }] });
// The mirrors show a real picture: the scene behind the car is drawn once more, small, from a camera looking back (uboR), into tMir,
// and the mirror glass looks its reflection up in that picture. While that picture is being drawn a blank stands in for it.
const MIRW = 512, MIRH = 256, uboR = device.createBuffer({ size: UBN * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
const vMirMS = device.createTexture({ size: [MIRW, MIRH], format: HDR, sampleCount: AA, usage: GPUTextureUsage.RENDER_ATTACHMENT }).createView();
const vMirD = device.createTexture({ size: [MIRW, MIRH], format: DEPTH, sampleCount: AA, usage: GPUTextureUsage.RENDER_ATTACHMENT }).createView();
const vMir = device.createTexture({ size: [MIRW, MIRH], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING }).createView();
const vBlank = device.createTexture({ size: [1, 1], format: HDR, usage: GPUTextureUsage.TEXTURE_BINDING }).createView();
const sShadowCmp = device.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' }), sMirror = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
// Sign writing. The words on shop signs and road boards are real Thai, written once at start-up with the machine's own Thai typeface
// onto a sheet (no image file is loaded) which the sign material reads. Left half: 64 names written across, in cells 256 x 64.
// Right half: the same names written downward, letter under letter, in cells 64 x 256, for tall boards. The last 16 are for road boards.
// (signW, which writes each sign board's width into it for the words, is in core.js: the world worker needs it too)
const SIGNS = ['อาหารตามสั่ง', 'ก๋วยเตี๋ยวเรือ', 'ข้าวมันไก่', 'ร้านขายยา', 'ห้างทอง', 'ซ่อมมอเตอร์ไซค์', 'ตัดผมชาย', 'เสริมสวย', 'วัสดุก่อสร้าง', 'กาแฟสด', 'ซักอบรีด', 'ร้านชำ', 'มินิมาร์ท', 'คลินิก', 'ทันตกรรม', 'ร้านดอกไม้',
  'อะไหล่ยนต์', 'ร้านหนังสือ', 'เครื่องเขียน', 'ถ่ายรูปด่วน', 'มือถือ ซิม', 'เบเกอรี่', 'ส้มตำ ไก่ย่าง', 'โจ๊ก ต้มเลือดหมู', 'เสื้อผ้าแฟชั่น', 'รองเท้า กระเป๋า', 'หอพัก ห้องว่าง', 'ให้เช่า', 'ขายส่ง ขายปลีก', 'น้ำแข็ง น้ำดื่ม', 'ข้าวแกง', 'ขนมไทย',
  'ผลไม้สด', 'เครื่องใช้ไฟฟ้า', 'เฟอร์นิเจอร์', 'ร้านแว่นตา', 'อู่ซ่อมรถ', 'ล้างอัดฉีด', 'ยางรถยนต์', 'แก๊ส', 'ข้าวสาร', 'ของฝาก', 'นวดแผนไทย', 'โรงรับจำนำ', 'ปุ๋ย ยาเกษตร', 'อาหารสัตว์', 'เปิด 24 ชม.', '1 มาร์ท',
  'ตัวเมือง', 'ตลาดสด', 'วัด', 'โรงเรียน', 'ชายหาด', 'น้ำตก', 'อุทยาน', 'ขับช้าๆ', 'เขตชุมชน', 'ลดความเร็ว', 'ระวังทางโค้ง', 'จุดชมวิว', 'ที่พักริมทาง', 'สะพาน', 'ใช้เกียร์ต่ำ', 'เดินทางปลอดภัย'];
const vSign = (() => {
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 1024; const x = cv.getContext('2d'), FONT = '"Sukhumvit Set", Thonburi, "Noto Sans Thai", Sarabun, "Leelawadee UI", Tahoma, sans-serif';
  x.fillStyle = '#000'; x.fillRect(0, 0, 2048, 1024); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;
  SIGNS.forEach((t, i) => {
    x.font = '700 40px ' + FONT; const w = x.measureText(t).width, k = Math.min(1, 236 / w), cx = (i % 4) * 256 + 128, cy = floor(i / 4) * 64 + 34;
    x.save(); x.translate(cx, cy); x.scale(k, 1); x.fillText(t, 0, 0); x.restore();
    const cl = (seg ? [...seg.segment(t)].map((q) => q.segment) : [...t]).filter((q) => q.trim()).slice(0, 8), n = cl.length, fs = Math.min(40, 236 / n * 0.86); x.font = '700 ' + fs + 'px ' + FONT;
    cl.forEach((ch, j) => x.fillText(ch, 1024 + (i % 16) * 64 + 32, floor(i / 16) * 256 + 128 + (j - (n - 1) / 2) * (236 / n)));
  });
  const tx = device.createTexture({ size: [2048, 1024], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
  Q.copyExternalImageToTexture({ source: cv }, { texture: tx }, [2048, 1024]); return tx.createView();
})();
const mkScene = (buf, mir) => device.createBindGroup({ layout: bglScene, entries: [{ binding: 0, resource: { buffer: buf } }, { binding: 1, resource: vShadow }, { binding: 2, resource: sShadowCmp }, { binding: 3, resource: mir }, { binding: 4, resource: sMirror }, { binding: 5, resource: vSign }] });
const bgScene = mkScene(ubo, vMir), bgSceneR = mkScene(uboR, vBlank);
const bgShadow = device.createBindGroup({ layout: bglShadow, entries: [{ binding: 0, resource: { buffer: uboS } }] });
const plScene = device.createPipelineLayout({ bindGroupLayouts: [bglScene] }), plShadow = device.createPipelineLayout({ bindGroupLayouts: [bglShadow] });
const LB_TERRAIN = [{ arrayStride: 28, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32' }] }];
const LB_LEAF = [{ arrayStride: 48, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }, { shaderLocation: 1, offset: 16, format: 'float32x4' }, { shaderLocation: 2, offset: 32, format: 'float32x4' }] }];
const LB_BRANCH = [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
  { arrayStride: 40, stepMode: 'instance', attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x4' }, { shaderLocation: 2, offset: 16, format: 'float32x4' }, { shaderLocation: 3, offset: 32, format: 'float32x2' }] }];
const LB_BOX = [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] },
  { arrayStride: 48, stepMode: 'instance', attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x4' }, { shaderLocation: 3, offset: 16, format: 'float32x4' }, { shaderLocation: 4, offset: 32, format: 'float32x4' }] }];
const scenePipe = (vs, fs, buffers, topology = 'triangle-list', ws = 1, depthCompare = 'less', nv = 4, layout = plScene) => device.createRenderPipeline({ layout,
  vertex: Object.assign({ module: mScene, entryPoint: vs, buffers }, vs.startsWith('vsLeaf') ? { constants: { WS: ws, NV: nv } } : {}),
  fragment: { module: mScene, entryPoint: fs, targets: [{ format: HDR }] },
  primitive: { topology, cullMode: 'none' }, multisample: { count: AA },
  depthStencil: { format: DEPTH, depthWriteEnabled: depthCompare === 'less', depthCompare } });
const shadowPipe = (vs, buffers, topology = 'triangle-list', ws = 1) => device.createRenderPipeline({ layout: plShadow,
  vertex: Object.assign({ module: mShadow, entryPoint: vs, buffers }, vs === 'vsLeaf' ? { constants: { WS: ws, NV: 2 } } : {}),
  primitive: { topology, cullMode: 'none' },
  depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.5 } });
const pTerrain = scenePipe('vsTerrain', 'fsTerrain', LB_TERRAIN), pBranch = scenePipe('vsBranch', 'fsBranch', LB_BRANCH), pBox = scenePipe('vsBox', 'fsBox', LB_BOX);
// leaves come in four densities: every leaf nearby, then a third, a ninth and (far off) a twenty-seventh of them, made wider to cover the same area
// (and the thinned-out ones are strips of 6 vertices, not 10: at their distance the finer bend and outline of a leaf cannot be seen. LODV is the
// count to draw with each; leaves in the shadow map are always of 6)
const LODW = [1, 1.75, 3.1, 5.4], LODN = [1, 3, 9, 27], LODV = [10, 6, 6, 6];
const pLeaf = LODW.map((w, l) => scenePipe('vsLeaf', 'fsLeaf', LB_LEAF, 'triangle-strip', w, 'less', LODV[l] / 2 - 1));
const pSky = scenePipe('vsSky', 'fsSky', [], 'triangle-list', 1, 'less-equal');
// Leaves and grass culled on the graphics card (cull.wgsl, and main.js): each frame a compute pass lists, for every chunk's leaves and grass, which
// instances are in view, and the draws use those lists (vsLeafC). ?cull=0 in the page's address draws them all, as before - for comparing.
// CU: idx, the lists of the frame one after another (each begun on a 256-byte boundary, as a dynamic offset must be); args, each draw's
// indirect arguments, 256 bytes apart; par, each draw's numbers for the culling (the sides of the view, the eye, how many, how wide).
const CULL = !/[?&]cull=0\b/.test(location.search), CULLD = 512;
const bglCullR = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }, { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage', hasDynamicOffset: true } }] });
const pLeafC = LODW.map((w, l) => scenePipe('vsLeafC', 'fsLeaf', [], 'triangle-strip', w, 'less', LODV[l] / 2 - 1, device.createPipelineLayout({ bindGroupLayouts: [bglScene, bglCullR] })));
const bglCull = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage', hasDynamicOffset: true } },
  { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage', hasDynamicOffset: true } }, { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } }] });
const pCull = device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [bglCull] }), compute: { module: mod(WGSL.cull, 'cull'), entryPoint: 'cull' } });
const CU = { idx: null, idxN: 0, ver: 0, A: new Uint32Array(CULLD * 64), P: new Float32Array(CULLD * 64),
  args: device.createBuffer({ size: CULLD * 256, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST }), par: device.createBuffer({ size: CULLD * 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }) };
// (room for n entries in the lists; made larger - and every bind group made again - when a frame needs more)
const cullRoom = (n) => { if (n <= CU.idxN) return; if (CU.idx) CU.idx.destroy(); CU.idxN = Math.ceil(n * 1.4 / 64) * 64; CU.idx = device.createBuffer({ size: CU.idxN * 4, usage: GPUBufferUsage.STORAGE }); CU.ver++; };
// (a chunk's leaf or grass buffer, made with STORAGE so that it can be culled, has its two bind groups, kept on it: one to cull, one to draw)
const cullBG = (b) => { if (b._cv !== CU.ver) { const n = b.size / 48, li = { buffer: CU.idx, size: n * 4 };
    b._cg = device.createBindGroup({ layout: bglCull, entries: [{ binding: 0, resource: { buffer: b } }, { binding: 1, resource: li }, { binding: 2, resource: { buffer: CU.args, size: 16 } }, { binding: 3, resource: { buffer: CU.par, size: 128 } }] });
    b._rg = device.createBindGroup({ layout: bglCullR, entries: [{ binding: 0, resource: { buffer: b } }, { binding: 1, resource: li }] }); b._cv = CU.ver; } return b; };
const pBoxS = shadowPipe('vsBox', LB_BOX);
const LB_CAR = [{ arrayStride: 40, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32x3' }, { shaderLocation: 3, offset: 36, format: 'float32' }] }];
const pCar = scenePipe('vsCar', 'fsCar', LB_CAR), pCarS = shadowPipe('vsCar', LB_CAR);
const LB_MESH = [{ arrayStride: 28, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32' }] }];
const pMesh = scenePipe('vsMesh', 'fsBranch', LB_MESH), pMeshS = shadowPipe('vsMesh', LB_MESH);      // sculpted things: a chunk's meshB / meshIB (see sculpt in chunks.js)
const pTerrainS = shadowPipe('vsTerrain', LB_TERRAIN), pBranchS = shadowPipe('vsBranch', LB_BRANCH), pLeafS = shadowPipe('vsLeaf', LB_LEAF, 'triangle-strip', LODW[1]), pLeafS2 = shadowPipe('vsLeaf', LB_LEAF, 'triangle-strip', LODW[2]);
const sLin = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
const postPipe = (fs, blend) => device.createRenderPipeline({ layout: 'auto', vertex: { module: mPost, entryPoint: 'vs' },
  fragment: { module: mPost, entryPoint: fs, targets: [{ format: HDR, blend }] } });
const ADD = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
const pBright = postPipe('fsBright'), pDown = postPipe('fsDown'), pUp = postPipe('fsUp', ADD);
const pFinal = device.createRenderPipeline({ layout: 'auto', vertex: { module: mFinal, entryPoint: 'vs' }, fragment: { module: mFinal, entryPoint: 'fs', targets: [{ format: FMT }] } });
const uFinal = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

// For a game on this engine with things of its own (see main.js): EXTRA is a buffer of boxes drawn every frame besides the chunks' (things that move -
// the game refills it); gameTick(dt), if set, is called once a frame; deadWorld = 1 puts every lamp and lit window out (a place without power).
const EXTRA = { boxB: null, nBox: 0 }; let gameTick = null, deadWorld = 0, hudText = null;      // hudText: if set, the whole of the text at the top left is what it returns
// tube mesh shared by every trunk and branch piece: 8 sides
const SIDES = 8;
const tubeV = new Float32Array((SIDES + 1) * 6), tubeI = new Uint16Array(SIDES * 6);
for (let k = 0; k <= SIDES; k++) { const a = k / SIDES * TAU; tubeV.set([cos(a), sin(a), 0, cos(a), sin(a), 1], k * 6); }
for (let k = 0; k < SIDES; k++) tubeI.set([2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 2, 2 * k + 1, 2 * k + 3], k * 6);
const vbuf = (data, usage = GPUBufferUsage.VERTEX) => { const b = device.createBuffer({ size: max(16, (data.byteLength + 3) & ~3), usage: usage | GPUBufferUsage.COPY_DST }); Q.writeBuffer(b, 0, data); return b; };
const vbTube = vbuf(tubeV), ibTube = vbuf(tubeI, GPUBufferUsage.INDEX);
// and one of 16 sides, for big round made things seen close and far (a temple's images: with 8 a great seated figure showed its flat sides)
const tubeV16 = new Float32Array(17 * 6), tubeI16 = new Uint16Array(16 * 6);
for (let k = 0; k <= 16; k++) { const a = k / 16 * TAU; tubeV16.set([cos(a), sin(a), 0, cos(a), sin(a), 1], k * 6); }
for (let k = 0; k < 16; k++) tubeI16.set([2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 2, 2 * k + 1, 2 * k + 3], k * 6);
const vbTube16 = vbuf(tubeV16), ibTube16 = vbuf(tubeI16, GPUBufferUsage.INDEX);
// and one of 4 sides, a third of the triangles: for twigs, for everything beyond 85 m, and for shadows
const tubeV4 = new Float32Array(5 * 6), tubeI4 = new Uint16Array(4 * 6);
// (its corners stand out 1.4 times the radius, so that seen from any side it is as wide as the round tube: a distant wire is kept one pixel
// wide by its radius, and a square of the bare radius, seen flat on, came out thinner than that and broke up into dashes)
for (let k = 0; k <= 4; k++) { const a = (k + 0.5) / 4 * TAU; tubeV4.set([cos(a) * 1.4, sin(a) * 1.4, 0, cos(a) * 1.4, sin(a) * 1.4, 1], k * 6); }
for (let k = 0; k < 4; k++) tubeI4.set([2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 2, 2 * k + 1, 2 * k + 3], k * 6);
const vbTube4 = vbuf(tubeV4), ibTube4 = vbuf(tubeI4, GPUBufferUsage.INDEX);
// unit cube shared by every box
const cubeV = [], cubeI = [];
for (const [nx, ny, nz, ux, uy, uz, vx, vy, vz] of [[1, 0, 0, 0, 0, 1, 0, 1, 0], [-1, 0, 0, 0, 0, -1, 0, 1, 0], [0, 1, 0, 1, 0, 0, 0, 0, 1], [0, -1, 0, 1, 0, 0, 0, 0, -1], [0, 0, 1, -1, 0, 0, 0, 1, 0], [0, 0, -1, 1, 0, 0, 0, 1, 0]]) {
  const b = cubeV.length / 6;
  for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) cubeV.push((nx + ux * a + vx * c) / 2, (ny + uy * a + vy * c) / 2, (nz + uz * a + vz * c) / 2, nx, ny, nz);
  cubeI.push(b, b + 1, b + 2, b, b + 2, b + 3);
}
const vbCube = vbuf(new Float32Array(cubeV)), ibCube = vbuf(new Uint16Array(cubeI), GPUBufferUsage.INDEX);

// --------------------------------------------------------------------------------------------------------- render targets
// smooth: the 'smooth' picture setting (sky panel) - for recording the screen or a slower machine. The picture is drawn at the screen's own count of
// points at most (not 1.5 times it), and may be made much smaller and the far leaves and grass much thinner to keep the frame rate up (main.js).
let smooth = false; try { smooth = localStorage.getItem('endless.smooth') === '1'; } catch (e) {}
// fpsCap: the frame rate is held to this many pictures a second (settings panel: 60 or 30), or 0 for as many as the display shows (see frame() in main.js).
// viewK: how far the land is drawn, as a part of the full 380 m (settings panel: 1, 0.75 or 0.55); the haze closes in to match.
let viewK = 1; try { const v = Number(localStorage.getItem('endless.view')); if (v === 0.75 || v === 0.55) viewK = v; } catch (e) {}
let fpsCap = 0; try { const c = Number(localStorage.getItem('endless.cap')); if (c === 30 || c === 60) fpsCap = c; } catch (e) {}
let W = 0, H = 0, scale = smooth ? 0.8 : 1, tMS, tDepth, tScene, vMS, vDepth, vScene, bloomT = [], bloomV = [], bgBloom = [], bgFinal;
const NB = 5;
function resize() {
  const dpr = min(devicePixelRatio || 1, smooth ? 1 : 1.5) * scale;
  const w = max(64, floor(canvas.clientWidth * dpr)), h = max(64, floor(canvas.clientHeight * dpr));
  if (w === W && h === H) return;
  W = w; H = h; canvas.width = W; canvas.height = H;
  for (const t of [tMS, tDepth, tScene, ...bloomT]) t && t.destroy();
  tMS = device.createTexture({ size: [W, H], format: HDR, sampleCount: AA, usage: GPUTextureUsage.RENDER_ATTACHMENT });
  tDepth = device.createTexture({ size: [W, H], format: DEPTH, sampleCount: AA, usage: GPUTextureUsage.RENDER_ATTACHMENT });
  tScene = device.createTexture({ size: [W, H], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
  vMS = tMS.createView(); vDepth = tDepth.createView(); vScene = tScene.createView();
  bloomT = []; bloomV = []; bgBloom = [];
  for (let i = 0; i < NB; i++) { const t = device.createTexture({ size: [max(1, W >> (i + 1)), max(1, H >> (i + 1))], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING }); bloomT.push(t); bloomV.push(t.createView()); }
  const bg = (p, v) => device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: sLin }, { binding: 1, resource: v }] });
  bgBloom = { bright: bg(pBright, vScene), down: bloomV.map((v) => bg(pDown, v)), up: bloomV.map((v) => bg(pUp, v)) };
  bgFinal = device.createBindGroup({ layout: pFinal.getBindGroupLayout(0), entries: [{ binding: 0, resource: sLin }, { binding: 1, resource: vScene }, { binding: 2, resource: bloomV[0] }, { binding: 3, resource: { buffer: uFinal } }] });
}

