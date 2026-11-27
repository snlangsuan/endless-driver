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
// (ws: the leaves' width - or [width, length] - at a density; see LODW, LODL)
const scenePipe = (vs, fs, buffers, topology = 'triangle-list', ws = 1, depthCompare = 'less', nv = 4, layout = plScene) => device.createRenderPipeline({ layout,
  vertex: Object.assign({ module: mScene, entryPoint: vs, buffers }, vs.startsWith('vsLeaf') ? { constants: { WS: [ws].flat()[0], LS: [ws, 1].flat()[1], NV: nv } } : {}),
  fragment: { module: mScene, entryPoint: fs, targets: [{ format: HDR }] },
  primitive: { topology, cullMode: 'none' }, multisample: { count: AA },
  depthStencil: { format: DEPTH, depthWriteEnabled: depthCompare === 'less', depthCompare } });
const shadowPipe = (vs, buffers, topology = 'triangle-list', ws = 1) => device.createRenderPipeline({ layout: plShadow,
  vertex: Object.assign({ module: mShadow, entryPoint: vs, buffers }, vs === 'vsLeaf' ? { constants: { WS: [ws].flat()[0], LS: [ws, 1].flat()[1], NV: 2 } } : {}),
  primitive: { topology, cullMode: 'none' },
  depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.5 } });
const pTerrain = scenePipe('vsTerrain', 'fsTerrain', LB_TERRAIN), pBranch = scenePipe('vsBranch', 'fsBranch', LB_BRANCH), pBox = scenePipe('vsBox', 'fsBox', LB_BOX);
// A tree's leaves come in four densities: every leaf nearby, then a half, a quarter and (far off, past 250 m) an eighth of them, each drawn
// wider and longer by the square root of that (LODW, LODL), so that together they cover just as much of the crown: the crowns are as full far
// off as near. (They were a third, a ninth and a twenty-seventh, only widened, by 1.75, 3.1 and 5.4 - a fifth of the leaf at the last: the far
// woods looked thin and see-through.) The thinned-out ones are strips of 6 vertices, not 10: at their distance the finer bend and outline of a
// leaf cannot be seen. LODV is the count to draw with each; leaves in the shadow map are always of 6.
// Grass keeps its own densities (GLODN, GLODW: a third and a ninth, widened) and pipelines - its blades are not made longer.
// (at ultra a leaf near to is a strip of 6 lengths - 14 vertices - so that a long one, a banana's blade or a palm's leaflet, bends in a curve and
// not at three corners, and the second density is drawn with 4 lengths, not 2: the bend of each leaf seen out to 150 m. At high it stays 4 and
// 2: with 6, among the coconut palms of the island - each now some 1700 leaflets - high fell to 40 a second. More - 8 lengths
// near, and the leaves' full reach half as far again - took ultra under 22 a second on an M4 at the screen's own size.)
const LODN = [1, 2, 4, 8], LODW = LODN.map(Math.sqrt), LODL = LODW, LODV = ULTRA ? [14, 10, 6, 6] : [10, 6, 6, 6];
const GLODN = [1, 3, 9], GLODW = [1, 1.75, 3.1], GLODV = [10, 6, 6];
const pLeaf = LODW.map((w, l) => scenePipe('vsLeaf', 'fsLeaf', LB_LEAF, 'triangle-strip', [w, LODL[l]], 'less', LODV[l] / 2 - 1));
const pGrass = GLODW.map((w, l) => scenePipe('vsLeaf', 'fsLeaf', LB_LEAF, 'triangle-strip', w, 'less', GLODV[l] / 2 - 1));
const pSky = scenePipe('vsSky', 'fsSky', [], 'triangle-list', 1, 'less-equal');
// Leaves and grass culled on the graphics card (cull.wgsl, and main.js): each frame a compute pass lists, for every chunk's leaves and grass, which
// instances are in view, and the draws use those lists (vsLeafC). ?cull=0 in the page's address draws them all, as before - for comparing.
// CU: idx, the lists of the frame one after another (each begun on a 256-byte boundary, as a dynamic offset must be); args, each draw's
// indirect arguments, 256 bytes apart; par, each draw's numbers for the culling (the sides of the view, the eye, how many, how wide).
const CULL = !/[?&]cull=0\b/.test(location.search), CULLD = 512;
const bglCullR = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }, { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage', hasDynamicOffset: true } }] });
const pLeafC = LODW.map((w, l) => scenePipe('vsLeafC', 'fsLeaf', [], 'triangle-strip', [w, LODL[l]], 'less', LODV[l] / 2 - 1, device.createPipelineLayout({ bindGroupLayouts: [bglScene, bglCullR] })));
const pGrassC = GLODW.map((w, l) => scenePipe('vsLeafC', 'fsLeaf', [], 'triangle-strip', w, 'less', GLODV[l] / 2 - 1, device.createPipelineLayout({ bindGroupLayouts: [bglScene, bglCullR] })));
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
const pTerrainS = shadowPipe('vsTerrain', LB_TERRAIN), pBranchS = shadowPipe('vsBranch', LB_BRANCH), pLeafS = shadowPipe('vsLeaf', LB_LEAF, 'triangle-strip', [LODW[1], LODL[1]]), pLeafS2 = shadowPipe('vsLeaf', LB_LEAF, 'triangle-strip', [LODW[2], LODL[2]]);
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
// The people of the towns (chunks.js; vsPpl/fsPpl): two figures, a man and a woman, each 1 high, facing +z, arms at their sides, clothed and
// with hair, and of each a form with fewer triangles for the distance - assets/people.bin, made by scripts/people.mjs from a model by Marc Ed
// (see CREDITS.md). Each vertex: place, normal, which part it is of (0 body, 1 head, 2/3 upper arms, 4/5 forearms, 6/7 thighs, 8/9 shins,
// 10 hair, 11/12 feet, 13/14 hands, 15 long hair, 20 shirt, 22-25 sleeves, 26-29 trouser legs, 30 skirt), and how far it moves with its limb
// and with the limb's lower half - which is how the vertex stage walks them, skin and cloth giving at each joint. Every person drawn is one
// of these, by instances; what one does not wear is drawn to nothing. PPL[sex][far]: { vb, ib, ni }.
const PPL = (() => { const B = ASSET.people; if (!B) return null; const dv = new DataView(B), nm = dv.getUint32(4, true), M = []; let o = 8;
  for (let i = 0; i < nm; i++) { const nv = dv.getUint32(o, true), ni = dv.getUint32(o + 4, true); o += 8; const v = new Float32Array(B.slice(o, o + nv * 36)); o += nv * 36; const ix = new Uint32Array(B.slice(o, o + ni * 4)); o += ni * 4;
    M.push({ vb: vbuf(v), ib: vbuf(ix, GPUBufferUsage.INDEX), ni }); }
  return [[M[0], M[1]], [M[2], M[3]]]; })();
const LB_PPL = [{ arrayStride: 36, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32x3' }] },
  { arrayStride: 48, stepMode: 'instance', attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x4' }, { shaderLocation: 4, offset: 16, format: 'float32x4' }, { shaderLocation: 5, offset: 32, format: 'float32x4' }] }];
const pPpl = scenePipe('vsPpl', 'fsPpl', LB_PPL), pPplS = shadowPipe('vsPpl', LB_PPL);
// A market's fruit (chunks.js: goods): each a ball - an eight-sided shape with every face cut in four and rounded, 32 triangles - set by
// instances: where, how big, which kind, its own number. Drawn only from near to (main.js); from far the heaps are painted boxes.
const FRUIT = (() => { const P = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], F = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]], V = [], I = [], key = new Map();
  const vtx = (p) => { const l = Math.hypot(p[0], p[1], p[2]), q = [p[0] / l, p[1] / l, p[2] / l], k = q.map((e) => Math.round(e * 1e4)).join(); let j = key.get(k); if (j === undefined) { j = V.length / 3; key.set(k, j); V.push(q[0], q[1], q[2]); } return j; }, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  for (const f of F) { const a = P[f[0]], b = P[f[1]], c = P[f[2]], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); for (const t of [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]) I.push(vtx(t[0]), vtx(t[1]), vtx(t[2])); }
  return { vb: vbuf(new Float32Array(V)), ib: vbuf(new Uint16Array(I), GPUBufferUsage.INDEX), ni: I.length }; })();
const pFruit = scenePipe('vsFruit', 'fsFruit', [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }, { arrayStride: 32, stepMode: 'instance', attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x4' }, { shaderLocation: 2, offset: 16, format: 'float32x4' }] }]);
// How many of a town's people are about at an hour, of those there by day (1): a country town - next to none from eleven at night till four,
// a few from then (the market's people, the early ones), filling up from six to eight; thinning from six in the evening, half by nine.
let POP = 1; const popAt = (h) => { const P = [[0, 0.03], [4, 0.03], [5, 0.12], [6, 0.35], [8, 1], [18, 1], [21, 0.45], [23, 0.03], [24, 0.03]]; for (let i = 1; i < P.length; i++) if (h <= P[i][0]) return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * (h - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return 0.03; };
// Those who walk the length of a town: a stream of people along each footpath, both ways, that belongs to no chunk - where each is, is worked
// out from the time alone, so they are there whenever the eye comes by, and walk on from one end of the town to the other. Walker i of a side
// starts at i * S along the road and goes at its class's pace (i mod 8: four paces up the road, four down), stopping every so often for a few
// seconds - to look in at a shop, or out at the street - and going on; some go two together. Each keeps its own line along the footpath (5.7
// to 7 m out from the road's middle, wandering a little). None where there is no town, nor by an underpass or a bridge. step works out those
// within reach of the eye, each frame, into one list (men near, men far, women near, women far - near: the full figure); vsPpl takes them as
// "led": placed as given, the last number minus how far it is walking, the eighth how far along its stride.
const STROLL = (() => { if (!PPL) return null; const N = 420, S = 8, REACH = 150, inst = new Float32Array(N * 12), buf = device.createBuffer({ size: inst.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  let spans = null, spanAt = 0;
  const G = [[], [], [], []], cnt = [0, 0, 0, 0], off = [0, 0, 0, 0], smo = (a, b, x) => { const t = min(1, max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const step = (ex, ey, ez) => { for (const g of G) g.length = 0; const t = time, Wk = [[], []]; PNEAR.length = 0;
    // (the town's stretches of footpath about the eye - each a run of the road where there is town and no underpass or river - found again
    // whenever the eye has moved on 25 m)
    if (!spans || abs(ez - spanAt) > 25) { spanAt = ez; spans = []; const ok = (z) => townW(z) >= 0.8 && !(udOf(z) && svW(z) > 0.02) && !nearRiv(z, 22), z0 = floor((ez - REACH - 40) / 5) * 5, z1 = z0 + 2 * REACH + 80;
      for (let z = z0; z <= z1;) { if (!ok(z)) { z += 5; continue; } let a = z, b = z; if (z === z0) while (a > z0 - 6000 && ok(a - 5)) a -= 5; while (b < z1 + 6000 && ok(b + 5)) b += 5; spans.push([a, b]); z = b + 5; } }
    // Each stretch has its own people, a walker to every S of it: walker i starts i * S along and goes at its class's pace. Come near the end of
    // the stretch it turns off the footpath toward the buildings and goes in among them, out of sight (it is not drawn more than 7 m in); and
    // comes out again there to walk back the other way (its way along the road folded over on itself: w, 0 to 2 L, the last E of each half
    // spent going in or coming out). Nobody walks out of the town into nothing, and nobody stops and turns about at its edge.
    for (const [sa, sb2] of spans) { const a = sa + 3, L = sb2 - sa - 6; if (L < 30) continue; const ik = floor(sa / 5) * 64, nI = floor(L / S);
      for (let sI = 0; sI < 2; sI++) for (let c = 0; c < 8; c++) { const side = sI ? 1 : -1, d0 = c < 4 ? 1 : -1, v = d0 * (0.8 + 0.2 * (c % 4)), Tp = 11 + 2.3 * c, Pd = c % 3 === 0 ? 0 : 3 + (c % 4), mv = Tp - Pd;
        for (let i = c; i < nI; i += 8) { const h = (j) => ph(i * 2 + sI + ik, 9100 + j), sd = h(0); if (h(9) >= POP) continue; const tt = t + sd * 100, cyc = floor(tt / Tp), ft = tt - cyc * Tp, tw = cyc * mv + min(ft, mv);
          const w = (((i * S + v * tw) % (2 * L)) + 2 * L) % (2 * L), back = w >= L, E = 9; let zf = back ? 2 * L - w : w, dep = 0, dw = 0;
          if (w > L - E && w < L + E) { dep = w < L ? w - (L - E) : L + E - w; zf = L - E; dw = w < L ? 1 : -1; } else if (w < E) { dep = E - w; zf = E; dw = -1; } else if (w > 2 * L - E) { dep = w - (2 * L - E); zf = E; dw = 1; }
          const z = a + zf; if (dep > 7 || abs(z - ez) > REACH) continue;
          const dir = back ? -d0 : d0; let yw = 0; if (dep > 0) { const al = atan2(roadSl(z), 1) + (dir < 0 ? PI : 0), pe = atan2(roadSl(z), 1) + side * PI / 2 * (dw * d0 > 0 ? 1 : -1); let df = pe - al; df -= Math.round(df / TAU) * TAU; yw = al + df * smo(0, 0.8, dep); }
          // (each direction keeps to its own half of the footpath, more or less)
          Wk[sI].push({ z, dep, yw, lat: 5.75 + (dir * side > 0 ? 0.65 : 0) + 0.6 * h(1) + 0.15 * sin(z * 0.07 + sd * 40), two: h(2) < 0.3, dir, v, side, h, sd, stp: Pd ? smo(mv - 0.4, mv, ft) * smo(Tp, Tp - 0.4, ft) : 0, ph: abs(v) * (tw + 1e4) }); } } }
    // Those who cross the road, at a crossroads' zebra crossings: they wait at the kerb while the main road's lights are green, and cross when
    // they turn red (land.js: tlOf, tlState - red is the last 11 s of every 30), to wait on the far side for the next red to cross back.
    for (let g0 = floor((ez - 34) / 360), g2 = g0 - 1; g2 <= g0 + 1; g2++) { const zs = tlOf(g2); if (zs === null || abs(zs - ez) > REACH) continue; const u = t / 30 + ph(g2, 521), cyc = floor(u), p = u - cyc;
      for (const e of [-6, 6]) for (let k = 0; k < 3; k++) { const h = (j) => ph(g2 * 8 + k + (e > 0 ? 4 : 0), 9700 + j); if (h(0) >= POP * 0.75) continue;
        const q = min(1, max(0, (p * 30 - 19.5 - h(1) * 0.8) / 9.2)), st = (cyc + (h(2) < 0.5 ? 1 : 0)) % 2 ? 1 : -1, z = zs + e + (k - 1) * 0.75, ya = atan2(roadSl(z), 1), qq = rp(z, st * 6.3 * (1 - 2 * q)), y = ground(qq[0], qq[1]) + 0.015;
        const sdm = h(3), wm = ph(floor(sdm * 9999), 78) < 0.5, H = (wm ? 1.5 : 1.6) + 0.2 * h(4), walking = q > 0 && q < 1;
        G[(wm ? 2 : 0) + (Math.hypot(qq[0] - ex, qq[1] - ez) < 18 ? 0 : 1)].push(qq[0], y, qq[1], ya - st * PI / 2, H, sdm, 0, (12.6 * q + 1e3) % (0.84 * H), y, wm ? 1 : 0, 0.92 + 0.2 * ph(floor(sdm * 9999), 77), -(walking ? 1 : 0.001)); } }
    // (no two through one another: any two that come within a pace of each other step aside, each its own way, and back as they pass)
    for (const L of Wk) { L.sort((a, b) => a.z - b.z); for (let a = 0; a < L.length; a++) for (let b2 = a + 1; b2 < L.length && L[b2].z - L[a].z < 1.6; b2++) { const A = L[a], B = L[b2], need = 0.62 + (A.two ? 0.3 : 0) + (B.two ? 0.3 : 0), dl = A.lat - B.lat;
        if (abs(dl) < need) { const k = (need - abs(dl)) * 0.5 * smo(1.6, 0.7, B.z - A.z) * (dl > 0 || (dl === 0 && A.sd > B.sd) ? 1 : -1); A.push = (A.push || 0) + k; B.push = (B.push || 0) - k; } } }
    for (const L of Wk) for (const w of L) { const { z, dir, side, h, sd, stp } = w, la = min(7.35, max(5.45, w.lat + (w.push || 0))), lat = side * (la + w.dep), ya = w.dep > 0 ? w.yw : atan2(roadSl(z), 1) + (dir < 0 ? PI : 0), out = la < 6.7 ? 1 : -1;
      for (let m = 0, nm = w.two ? 2 : 1; m < nm; m++) { const hm = (j) => m ? h(20 + j) : h(j), sdm = hm(0), wm = ph(floor(sdm * 9999), 78) < 0.5, H = (wm ? 1.5 : 1.6) + 0.2 * hm(3);
        const q = rp(z - m * 0.25 * dir, lat + m * side * 0.62 * out), y = ground(q[0], q[1]) + 0.015; if (abs(q[0] - ex) > REACH) continue;
        // (stopped, it turns to the shops or the street - two together to each other)
        const turn = stp * (nm > 1 ? (m ? -1 : 1) * 1.2 * side * dir * out : (h(4) < 0.6 ? 1 : -1) * side * dir * 1.4);
        G[(wm ? 2 : 0) + (Math.hypot(q[0] - ex, q[1] - ez) < 18 ? 0 : 1)].push(q[0], y, q[1], ya + turn, H, sdm, 0, w.ph % (0.84 * H), y, wm ? 1 : 0, 0.92 + 0.2 * ph(floor(sdm * 9999), 77), -max(1 - stp, 0.001)); } }
    // The rubber tappers: from a little before four in the morning till past five, in a plantation, one or two to a plot (140 m of the road: twenty
    // rows), each working along a row away from the road, tree by tree - half a minute at each, then on to the next, 3.5 m; ten trees, then
    // the next row - a lamp on the forehead, and its light on the trunk and the ground before it. (The rows are the
    // plantation's own: z = 7 j, a tree every 3.5 m of x - chunks.js.) The lamp is drawn as a glow (below) at the brow, turned as the head is.
    nG = 0; { const hr = tday * 24, on = smo(3.6, 4.0, hr) * smo(5.5, 5.1, hr);
      if (on > 0) for (let P = floor((ez - 150) / 140); P * 140 < ez + 150; P++) for (let kT = 0, nTp = ph(P, 9500) < 0.4 ? 2 : 1; kT < nTp; kT++) { const hj = (m) => ph(P * 4 + kT, 9510 + m); if (hj(0) > on) continue;
        const side = hj(1) < 0.5 ? -1 : 1, u = t / 28 + hj(2) * 50, nT = floor(u), f = u - nT, go = smo(0, 0.16, f), j = P * 20 + (floor(hj(6) * 20) + floor(nT / 10)) % 20, zr = j * 7; if (rubW(zr) < 0.5 || nearRiv(zr, 26)) continue;
        const xi = ((nT % 10) + 10) % 10 + go - 1, x = Math.round((roadX(zr) + side * 14) / 3.5) * 3.5 + side * xi * 3.5;
        if (abs(x - ex) > 130) continue; const walking = f < 0.16 && xi > -0.99, sdm = hj(3), wm = hj(4) < 0.4, H = (wm ? 1.5 : 1.6) + 0.2 * hj(5), zz = zr + 0.75, y = ground(x, zz) + 0.015;
        const ya = walking ? side * PI / 2 : PI + side * 0.5 * (1 - smo(0.16, 0.24, f));
        G[(wm ? 2 : 0) + (Math.hypot(x - ex, zz - ez) < 18 ? 0 : 1)].push(x, y, zz, ya, H, sdm, 0, (xi * 3.5 + 1e3) % (0.84 * H), y, (wm ? 1 : 0) + 2, 1, -(walking ? 1 : 0.001));
        if (nG < NG) { const hy = y + 0.965 * H, k = nG * 8; gl[k] = x + sin(ya) * 0.11 - ex; gl[k + 1] = hy - ey; gl[k + 2] = zz + cos(ya) * 0.11 - ez; gl[k + 3] = 0.16; gl[k + 4] = sin(ya); gl[k + 5] = cos(ya); gl[k + 6] = 1; gl[k + 7] = 0; nG++; }
        // (its light: a pool on the ground before it, and a patch on the trunk it is at - not while it walks between trees)
        if (nG + 1 < NG && !walking) { let k = nG * 8; gl[k] = x + sin(ya) * 0.9 - ex; gl[k + 1] = y + 0.06 - ey; gl[k + 2] = zz + cos(ya) * 0.9 - ez; gl[k + 3] = 1.5; gl[k + 4] = 0; gl[k + 5] = 0; gl[k + 6] = 0.5; gl[k + 7] = 1; nG++;
          k = nG * 8; gl[k] = x - ex; gl[k + 1] = y + 0.78 * H - ey; gl[k + 2] = zr + 0.2 - ez; gl[k + 3] = 0.34; gl[k + 4] = 0; gl[k + 5] = 1; gl[k + 6] = 0.55; gl[k + 7] = 2; nG++; } } }
    if (nG) device.queue.writeBuffer(gbuf, 0, gl, 0, nG * 8);
    // (those of them near the car are in its way: collide.js)
    for (const g of G) for (let k = 0; k < g.length; k += 12) if (abs(g[k] - car.x) < 14 && abs(g[k + 2] - car.z) < 14) { const q = dodged(g[k], g[k + 2]); PNEAR.push(q[0], q[1]); }
    let o = 0; for (let k = 0; k < 4; k++) { const g = G[k], n = min(g.length / 12, N - o); off[k] = o; cnt[k] = n; inst.set(n * 12 === g.length ? g : g.slice(0, n * 12), o * 12); o += n; }
    if (o) device.queue.writeBuffer(buf, 0, inst, 0, o * 12); };
  const draw = (p, shadow) => { if (cnt[0] + cnt[1] + cnt[2] + cnt[3] === 0) return 0; let tr = 0; p.setPipeline(shadow ? pPplS : pPpl); p.setVertexBuffer(1, buf);
    for (let k = 0; k < 4; k++) { if (!cnt[k]) continue; const M = PPL[k >> 1][shadow ? 1 : k & 1]; p.setVertexBuffer(0, M.vb); p.setIndexBuffer(M.ib, 'uint32'); p.drawIndexed(M.ni, cnt[k], 0, 0, off[k]); tr += M.ni / 3 * cnt[k]; }
    return tr; };
  // (a lamp: a small bright disc with a wide soft glow round it, added to the picture; brightest seen from in front)
  const NG = 64, gl = new Float32Array(NG * 8), gbuf = device.createBuffer({ size: gl.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }); let nG = 0;
  const pGlow = device.createRenderPipeline({ layout: plScene,
    vertex: { module: mScene, entryPoint: 'vsGlow', buffers: [{ arrayStride: 32, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }, { shaderLocation: 1, offset: 16, format: 'float32x4' }] }] },
    fragment: { module: mScene, entryPoint: 'fsGlow', targets: [{ format: HDR, blend: { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } } }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' }, multisample: { count: AA }, depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'less' } });
  const glow = (p) => { if (!nG) return; p.setPipeline(pGlow); p.setVertexBuffer(0, gbuf); p.draw(6, nG); };
  return { step, draw, glow }; })();
// unit cube shared by every box
const cubeV = [], cubeI = [];
for (const [nx, ny, nz, ux, uy, uz, vx, vy, vz] of [[1, 0, 0, 0, 0, 1, 0, 1, 0], [-1, 0, 0, 0, 0, -1, 0, 1, 0], [0, 1, 0, 1, 0, 0, 0, 0, 1], [0, -1, 0, 1, 0, 0, 0, 0, -1], [0, 0, 1, -1, 0, 0, 0, 1, 0], [0, 0, -1, 1, 0, 0, 0, 1, 0]]) {
  const b = cubeV.length / 6;
  for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) cubeV.push((nx + ux * a + vx * c) / 2, (ny + uy * a + vy * c) / 2, (nz + uz * a + vz * c) / 2, nx, ny, nz);
  cubeI.push(b, b + 1, b + 2, b, b + 2, b + 3);
}
const vbCube = vbuf(new Float32Array(cubeV)), ibCube = vbuf(new Uint16Array(cubeI), GPUBufferUsage.INDEX);

// --------------------------------------------------------------------------------------------------------- render targets
// The picture's quality (QUAL, the settings panel: 0 low, 1 medium, 2 high, 3 ultra; remembered - one who had chosen 'smooth' before has medium).
// QP, by quality: dpr, the most screen points to a CSS pixel; ss, how many points to a CSS pixel the picture itself is drawn with at the least (more
// than the screen has: drawn larger and shrunk back, see resize below); base, the size it starts at and is given back up to; floor, the smallest
// the frame-rate keeper (main.js) may draw it; lod and grass, how far out the leaves, twigs and little things and the grass are drawn at their
// full density (lodK); keep, the extra size never dropped all at once; hold, the frame rate the picture is drawn smaller to keep (ultra: the
// finest picture that still runs at 30 a second - no lower than the screen's own size - where the others give way from just under 60).
// Low and medium also hold the frame rate as the old 'smooth' setting did (smooth: for recording the screen or a slower machine).
let QUAL = 2; try { const q = localStorage.getItem('endless.qual'); if (q !== null && q !== '') QUAL = clamp(Number(q) | 0, 0, 3); else if (localStorage.getItem('endless.smooth') === '1') QUAL = 1; } catch (e) {}
// (each floor at or above the size of the quality below it at the start: drawn smaller to hold the rate, medium came out coarser than low)
const QP = [{ dpr: 1, ss: 1, base: 0.75, floor: 0.5, lod: 0.6, grass: 0.6 }, { dpr: 1, ss: 1, base: 1, floor: 0.75, lod: 0.8, grass: 0.8 },
  { dpr: 1.5, ss: 1.5, base: 1, floor: 0.8, lod: 1, grass: 1 }, { dpr: 2, ss: 2, base: 1, floor: 0.5, lod: 1.25, grass: 1.2, keep: true, hold: 30 }];
// smooth: low or medium. The picture is drawn at the screen's own count of
// points at most (not 1.5 times it), and may be made much smaller and the far leaves and grass much thinner to keep the frame rate up (main.js).
let smooth = QUAL <= 1;
// fpsCap: the frame rate is held to this many pictures a second (settings panel: 60 or 30), or 0 for as many as the display shows (see frame() in main.js).
// viewK: how far the land is drawn, as a part of the full 380 m (settings panel: 1, 0.75 or 0.55); the haze closes in to match.
let viewK = 1; try { const v = Number(localStorage.getItem('endless.view')); if (v === 0.75 || v === 0.55) viewK = v; } catch (e) {}
let fpsCap = 0; try { const c = Number(localStorage.getItem('endless.cap')); if (c === 30 || c === 60) fpsCap = c; } catch (e) {}
let W = 0, H = 0, scale = QP[QUAL].base, tMS, tDepth, tScene, vMS, vDepth, vScene, bloomT = [], bloomV = [], bgBloom = [], bgFinal;
const NB = 5;
// The screen gets its own count of points (up to 1.5 a CSS pixel); the picture itself is drawn at 1.5 a CSS pixel at the least (not with 'smooth'),
// so on a plain 1x screen (a 1080p monitor) it is drawn half as large again each way and shrunk back in the last pass (scn() in final.wgsl): far
// finer edges on wires, leaves and the road's markings. ssK: how many times larger than the screen the full-size picture is now (1 on a sharp screen).
// The frame-rate keeper (main.js) gives the extra size up first, before anything else, and all at once.
// (ssOn: whether the extra size is drawn now - main.js takes it only while the frame rate holds with it, see there; ssWait, ssBack, ssOK its timing)
let ssOn = !!QP[QUAL].keep, ssWait = 20, ssBack = 120, ssOK = 0;
const dprScreen = () => min(devicePixelRatio || 1, QP[QUAL].dpr), ssCan = () => QP[QUAL].ss / dprScreen() > 1.01, ssK = () => (ssOn && ssCan() ? QP[QUAL].ss / dprScreen() : 1);
let CVW = 0, CVH = 0;
function resize() {
  const dpr = dprScreen(), cw = max(64, floor(canvas.clientWidth * dpr)), ch = max(64, floor(canvas.clientHeight * dpr));
  const w = max(64, floor(cw * ssK() * scale)), h = max(64, floor(ch * ssK() * scale));
  if (cw !== CVW || ch !== CVH) { CVW = cw; CVH = ch; canvas.width = CVW; canvas.height = CVH; }
  if (w === W && h === H) return;
  W = w; H = h;
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

