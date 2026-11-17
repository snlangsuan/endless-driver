// --------------------------------------------------------------------------------------------------------- matrices
const mul = (o, a, b) => { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; };
const mV2 = new Float32Array(16), mP2 = new Float32Array(16), UBR = new Float32Array(UBN);
const mV = new Float32Array(16), mP = new Float32Array(16), mL = new Float32Array(16), mO = new Float32Array(16);
const view = (m, e, f, r, u) => { m[0] = r[0]; m[4] = r[1]; m[8] = r[2]; m[12] = -(r[0] * e[0] + r[1] * e[1] + r[2] * e[2]); m[1] = u[0]; m[5] = u[1]; m[9] = u[2]; m[13] = -(u[0] * e[0] + u[1] * e[1] + u[2] * e[2]);
  m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2]; m[14] = f[0] * e[0] + f[1] * e[1] + f[2] * e[2]; m[3] = 0; m[7] = 0; m[11] = 0; m[15] = 1; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// --------------------------------------------------------------------------------------------------------- frame
const hud = $('hud');
let last = performance.now(), time = 0, fN = 0, fT = 0, fWorst = 0, fps = 60, onRoad = true, tris = 0;
const NEAR = 0.3, FAR = 1500, TANH = Math.tan(62 * PI / 360), SHR = 95; let shL = null, shYaw = 0, upOK = 0, rBest = 0, rPrev = 0, rFlat = 0, rSince = 99, rLid = 1, rLidN = 0, rKnown = 0;
updateChunks(car.x, car.z, 30);
function frame(now) {
  requestAnimationFrame(frame);
  const dtr = now - last; last = now; let dt = min(dtr / 1000, 0.1); time += dt;
  fN++; fT += dtr; if (dtr > fWorst) fWorst = dtr;
  if (fT > 500) {
    fps = fN * 1000 / fT;
    // hold 30 fps or better: lower the render resolution when slow, give it back when there is room
    // The picture is drawn smaller when the frame rate is low and back at full size when it has recovered. "Low" is judged against the best
    // rate this display has shown, so a screen that runs at 30 or 50 Hz is not mistaken for a slow one; and if a step down did not help
    // (the rate is capped, or the machine is not held back by pixels) the best rate is taken to be the one we have.
    if (fWorst < 400) {
      if (fps > rBest) rBest = fps;
      if (rPrev) { rFlat = fps < rPrev * 1.04 ? rFlat + 1 : 0; rPrev = 0; if (rFlat >= 2) { rBest = fps; rFlat = 0; rKnown = 1; } }
      const dn = rKnown ? min(34, rBest * 0.8) : 34, up = min(55, rBest * 0.92);      // (until a step down has been seen not to help, 34 is the mark: a slow machine must not be taken for a capped display)
      if (rLidN > 0 && --rLidN === 0) rLid = 1;
      rSince++;
      if (fps < dn && scale > 0.5) { scale = max(0.5, scale * 0.9); upOK = 0; rPrev = fps; if (rSince <= 2) { rLid = scale; rLidN = 120; } }
      else if (fps > up && scale < rLid) { if (++upOK >= 8) { scale = min(rLid, scale * 1.06); upOK = 0; rSince = 0; } }
      else upOK = 0;
    }
    hud.textContent = `${fps.toFixed(0)} fps · ช้าสุด ${fWorst.toFixed(0)} ms · ${W}x${H} · ${(tris / 1e6).toFixed(1)}M สามเหลี่ยม\n${hpW(car.z) > 0.5 ? 'ทางเขาโค้งหักศอก' : seaW(car.z) > 0.5 ? 'ถนนเลียบทะเล' : townW(car.z) > 0.5 ? 'ในเมือง' : hillW(car.z) > 0.5 ? 'ถนนเขา ป่า อ่างเก็บน้ำ' : snowW(car.z) > 0.5 ? 'ทุ่งหิมะ' : flwAt(car.z) ? 'ทุ่งดอกไม้และนาข้าว' : 'ทุ่งนา'} · ${todName()} ${wxName()} ${AT.dry > 0.5 ? 'หน้าแล้ง' : 'หน้าฝน'} · ${fly.on ? 'กล้องบิน' : (abs(car.v) * 3.6).toFixed(0) + ' km/h ' + (onRoad ? 'บนถนน' : 'นอกถนน')} · ${auto.on ? 'ขับอัตโนมัติ' : 'ขับเอง'} (จำกัด ${auto.limit} km/h)\n${SND ? SND.info || '' : 'กดปุ่มใดก็ได้เพื่อเปิดเสียง'}`;
    fN = 0; fT = 0; fWorst = 0;
  }
  resize();
  if (fly.on) flyMove(dt); else onRoad = drive(dt);
  updateSound(dt); if (SHOW_CAR) placeCar(dt);
  // camera
  let ex, ey, ez, yaw, pit;
  if (fly.on) { ex = fly.x; ey = fly.y; ez = fly.z; yaw = fly.yaw; pit = fly.pit; }
  else if (SHOW_CAR && view3) { const ya = car.yaw + car.ly; ex = car.x - sin(ya) * 6.5; ez = car.z - cos(ya) * 6.5; ey = max(car.y + 2.5, ground(ex, ez) + 0.8); yaw = ya; pit = -0.13 + car.lp; }
  else { const so = SHOW_CAR ? 1 : 0; ex = car.x - so * (0.36 * cos(car.yaw) + 0.1 * sin(car.yaw)); ez = car.z + so * (0.36 * sin(car.yaw) - 0.1 * cos(car.yaw)); ey = car.y + 1.24 + (onRoad ? 0 : (sin(car.bump) * 0.035 + sin(car.bump * 2.7) * 0.02) * min(1, abs(car.v))); yaw = car.yaw + car.ly; pit = car.pit * 0.85 + car.lp; }
  updateChunks(ex, ez, 1);
  ex = Math.fround(ex); ey = Math.fround(ey); ez = Math.fround(ez);      // the eye exactly as the shaders will have it (they subtract it from every position)
  const cp = cos(pit), f = [sin(yaw) * cp, sin(pit), cos(yaw) * cp], r = nrm3(cross(f, [0, 1, 0])), u = cross(r, f), e = [ex, ey, ez], O3 = [0, 0, 0];
  view(mV, O3, f, r, u);            // all matrices are for positions relative to the eye
  const asp = W / H; mP.fill(0); mP[0] = 1 / (TANH * asp); mP[5] = 1 / TANH; mP[10] = FAR / (NEAR - FAR); mP[11] = -1; mP[14] = NEAR * FAR / (NEAR - FAR);
  mul(UB, mP, mV);
  // the shadow map: a box of light around the area in front of the camera
  tday += dt / 720; if (tday >= 1) { tday -= 1; dayN++; }
  const T = atmos(ez), L = nrm3(T.dir.slice());
  // The shadow map must not shimmer. So: the light it is drawn from moves in small steps, not every frame; the box of
  // light lies ahead along the view, but is turned only when the view has swung 17 degrees away from it; and its middle
  // moves only by whole texels, so that a shadow edge falls on the same texels from one frame to the next.
  if (!shL || shL[0] * L[0] + shL[1] * L[1] + shL[2] * L[2] < 1 - 2e-6 * max(shL[1] * shL[1], 0.04)) shL = L.slice();      // steps of 0.02 (low sun) to 0.1 degree
  { let dy = yaw - shYaw; dy -= Math.round(dy / TAU) * TAU; if (abs(dy) > 0.3) shYaw = yaw; } const yq = shYaw;
  const lf = [-shL[0], -shL[1], -shL[2]], lr = nrm3(cross(lf, [0, 1, 0])), lu = cross(lr, lf), TEX = 2 * SHR / SHADOW, d3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sc = [ex + sin(yq) * SHR * 0.6, ey, ez + cos(yq) * SHR * 0.6], qx = Math.round(d3(sc, lr) / TEX) * TEX - d3(sc, lr), qy = Math.round(d3(sc, lu) / TEX) * TEX - d3(sc, lu);
  for (let j = 0; j < 3; j++) sc[j] += lr[j] * qx + lu[j] * qy;
  const le = [sc[0] + shL[0] * 300 - ex, sc[1] + shL[1] * 300 - ey, sc[2] + shL[2] * 300 - ez];
  view(mL, le, lf, lr, lu);
  mO.fill(0); mO[0] = 1 / SHR; mO[5] = 1 / SHR; mO[10] = 1 / (1 - 700); mO[14] = 1 / (1 - 700); mO[15] = 1;
  mul(UBS, mO, mL); UB.set(UBS.subarray(0, 16), 16);
  const hl = (headOn === -1 ? (T.night > 0.5 ? 1 : 0) : headOn) * 1.6;
  UB.set([ex, ey, ez, time, L[0], L[1], L[2], T.rain, T.sun[0], T.sun[1], T.sun[2], abs(car.v) * 3.6, f[0], f[1], f[2], LT.seed, r[0], r[1], r[2], TANH * asp, u[0], u[1], u[2], TANH,
    T.fog, 360, T.cover, T.dry, W, H, car.yaw, fly.on || view3 ? 0 : 1, T.amb[0], T.amb[1], T.amb[2], T.wet, hl, T.wind, T.ex, T.night, T.zen[0], T.zen[1], T.zen[2], T.flash, T.hor[0], T.hor[1], T.hor[2], LT.az], 32);
  UB[80] = ((ex % 256) + 256) % 256; UB[81] = ((ez % 256) + 256) % 256;      // where the eye stands in its 256 m tile (camM)
  UBS.set(UB.subarray(16, UBN), 16);
  Q.writeBuffer(ubo, 0, UB); Q.writeBuffer(uboS, 0, UBS);
  Q.writeBuffer(uFinal, 0, new Float32Array([T.ex, T.snow > T.rain ? -T.snow : T.rain, time, 0.25 + 0.12 * T.wind]));

  const enc = device.createCommandEncoder();
  // 1. shadows
  let p = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: vShadow, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
  p.setBindGroup(0, bgShadow);
  for (const c of chunks.values()) {
    const d = hypot(c.x - sc[0], c.z - sc[2]), dc = hypot(c.x - ex, c.z - ez); if (d > SHR * 1.45 + CH + 40 / max(shL[1], 0.2) + (c.reach || 0)) continue;      // (with room for the long shadows of a low sun)
    p.setPipeline(pTerrainS); p.setVertexBuffer(0, c.vb); p.setIndexBuffer(ibGrid, 'uint16'); p.drawIndexed(gridI.length);
    if (c.nSeg) { p.setPipeline(pBranchS); p.setVertexBuffer(0, vbTube); p.setVertexBuffer(1, c.segB); p.setIndexBuffer(ibTube, 'uint16'); p.drawIndexed(tubeI.length, c.nSegFar); }
    if (c.nBox) { p.setPipeline(pBoxS); p.setVertexBuffer(0, vbCube); p.setVertexBuffer(1, c.boxB); p.setIndexBuffer(ibCube, 'uint16'); p.drawIndexed(36, c.nBox); }
    if (c.nLeaf) { const l = dc > 120 ? 2 : 1; p.setPipeline(l === 2 ? pLeafS2 : pLeafS); p.setVertexBuffer(0, c.leafB); p.draw(10, floor(c.nLeaf / LODN[l])); }
  }
  if (SHOW_CAR) { p.setPipeline(pCarS); p.setVertexBuffer(0, carVB); p.setIndexBuffer(carIB, 'uint16'); p.drawIndexed(CAR.idx.length); }
  p.end();
  // 1b. what the mirrors see: the land behind the car, drawn small and without the finest detail (only from the driver's seat)
  if (SHOW_CAR && !fly.on && !view3) {
    const f2 = [-sin(car.yaw), 0, -cos(car.yaw)], r2 = nrm3(cross(f2, [0, 1, 0])), u2 = cross(r2, f2), e2 = [car.x, car.y + 1.3, car.z];
    view(mV2, O3, f2, r2, u2); mP2.fill(0); mP2[0] = 1 / 1.45; mP2[5] = 1 / 0.725; mP2[10] = FAR / (NEAR - FAR); mP2[11] = -1; mP2[14] = NEAR * FAR / (NEAR - FAR);
    UBR.set(UB); mul(UBR, mP2, mV2); UBR.set([e2[0], e2[1], e2[2]], 32); UBR[80] = ((Math.fround(e2[0]) % 256) + 256) % 256; UBR[81] = ((Math.fround(e2[2]) % 256) + 256) % 256;
    UBR.set([f2[0], f2[1], f2[2]], 44); UBR.set([r2[0], r2[1], r2[2], 1.45, u2[0], u2[1], u2[2], 0.725], 48);
    { const dd = [Math.fround(e2[0]) - ex, Math.fround(e2[1]) - ey, Math.fround(e2[2]) - ez]; for (let q = 0; q < 4; q++) UBR[28 + q] = UB[28 + q] + UB[16 + q] * dd[0] + UB[20 + q] * dd[1] + UB[24 + q] * dd[2]; }      // the shadow matrix, re-based on the mirror's eye
    Q.writeBuffer(uboR, 0, UBR);
    p = enc.beginRenderPass({ colorAttachments: [{ view: vMirMS, resolveTarget: vMir, clearValue: [0, 0, 0, 1], loadOp: 'clear', storeOp: 'discard' }], depthStencilAttachment: { view: vMirD, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' } });
    p.setBindGroup(0, bgSceneR);
    for (const c of chunks.values()) {
      const dx = c.x - e2[0], dz = c.z - e2[2], d = hypot(dx, dz); if (d > 210 || (d > CH && (dx * f2[0] + dz * f2[2]) / d < 0.15)) continue;
      p.setPipeline(pTerrain); p.setVertexBuffer(0, c.vb); p.setIndexBuffer(ibGrid, 'uint16'); p.drawIndexed(gridI.length);
      if (c.nSegFar) { p.setPipeline(pBranch); p.setVertexBuffer(0, vbTube); p.setVertexBuffer(1, c.segB); p.setIndexBuffer(ibTube, 'uint16'); p.drawIndexed(tubeI.length, c.nSegFar); }
      if (c.nBox) { p.setPipeline(pBox); p.setVertexBuffer(0, vbCube); p.setVertexBuffer(1, c.boxB); p.setIndexBuffer(ibCube, 'uint16'); p.drawIndexed(36, c.nBox); }
      if (c.nLeaf && d < 170) { p.setPipeline(pLeaf[2]); p.setVertexBuffer(0, c.leafB); p.draw(10, floor(c.nLeaf / LODN[2])); }
    }
    p.setPipeline(pSky); p.draw(3); p.end();
  }
  // 2. the picture, in HDR
  p = enc.beginRenderPass({ colorAttachments: [{ view: vMS, resolveTarget: vScene, clearValue: [0, 0, 0, 1], loadOp: 'clear', storeOp: 'discard' }],
    depthStencilAttachment: { view: vDepth, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' } });
  p.setBindGroup(0, bgScene); tris = 0; let grassBudget = 1;
  if (SHOW_CAR) { p.setPipeline(pCar); p.setVertexBuffer(0, carVB); p.setIndexBuffer(carIB, 'uint16'); p.drawIndexed(CAR.idx.length); }
  for (const c of chunks.values()) {
    const dx = c.x - ex, dz = c.z - ez, d = hypot(dx, dz);
    if (d > 380) continue;
    if (d < 150 && !c.grassTried && grassBudget > 0) { grassBudget--; growGrass(c); }      // (before the test below: grass must be there already when a chunk comes into view)
    else if (d > 230 && c.grassB) { c.grassB.destroy(); c.grassB = null; c.nGrass = 0; c.grassTried = false; }
    if (d > CH) {                          // behind the camera or off to the side of what the screen shows
      // In plan the screen's edge runs at slope k from the eye; a chunk is a disc of radius Rc about its middle (its own corners at 45 m, and the
      // buildings and crowns that stand on its edge and reach beyond), so its middle may be Rc * sqrt(1 + k^2) outside that edge before nothing of it shows.
      const fh = hypot(f[0], f[2]) || 1, fw = (dx * f[0] + dz * f[2]) / fh, k = TANH * (W / H) / max(cp - TANH * abs(f[1]), 0.05), Rc = 66 + (c.reach || 0);
      if (abs(f[1]) < 0.3 ? (fw < -Rc || Math.sqrt(max(d * d - fw * fw, 0)) > k * max(fw, 0) + Rc * hypot(1, k)) : (dx * f[0] + dz * f[2]) / d < -0.35) continue;
    }
    p.setPipeline(pTerrain); p.setVertexBuffer(0, c.vb); p.setIndexBuffer(ibGrid, 'uint16'); p.drawIndexed(gridI.length); tris += GN * GN * 2;
    if (c.nSeg) { const n = d < 110 ? c.nSeg : c.nSegFar; p.setPipeline(pBranch); p.setVertexBuffer(0, vbTube); p.setVertexBuffer(1, c.segB); p.setIndexBuffer(ibTube, 'uint16'); p.drawIndexed(tubeI.length, n); tris += n * SIDES * 2; }
    if (c.nBox) { p.setPipeline(pBox); p.setVertexBuffer(0, vbCube); p.setVertexBuffer(1, c.boxB); p.setIndexBuffer(ibCube, 'uint16'); p.drawIndexed(36, c.nBox); tris += c.nBox * 12; }
    if (c.nLeaf) { const l = d < 75 ? 0 : d < 180 ? 1 : 2, n = floor(c.nLeaf / LODN[l]); p.setPipeline(pLeaf[l]); p.setVertexBuffer(0, c.leafB); p.draw(10, n); tris += n * 8; }
    if (c.nGrass && d < 130) { const l = d < 48 ? 0 : d < 85 ? 1 : 2, n = floor(c.nGrass / LODN[l]); p.setPipeline(pLeaf[l]); p.setVertexBuffer(0, c.grassB); p.draw(10, n); tris += n * 8; }
  }
  p.setPipeline(pSky); p.draw(3);
  p.end();
  // 3. bloom: bright parts spread down a chain of smaller images and added back up
  const pass = (v, pipe, bg, load = 'clear') => { const q = enc.beginRenderPass({ colorAttachments: [{ view: v, clearValue: [0, 0, 0, 1], loadOp: load, storeOp: 'store' }] }); q.setPipeline(pipe); q.setBindGroup(0, bg); q.draw(3); q.end(); };
  pass(bloomV[0], pBright, bgBloom.bright);
  for (let i = 1; i < NB; i++) pass(bloomV[i], pDown, bgBloom.down[i - 1]);
  for (let i = NB - 1; i > 0; i--) pass(bloomV[i - 1], pUp, bgBloom.up[i], 'load');
  // 4. to the screen: exposure, filmic curve, vignette
  p = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store' }] });
  p.setPipeline(pFinal); p.setBindGroup(0, bgFinal); p.draw(3); p.end();
  Q.submit([enc.finish()]);
}
requestAnimationFrame(frame);
try { if (localStorage.getItem('endless.noui')) document.body.classList.add('noui'); } catch (err) {}
window.__dbg = { snd: () => ({ state: AC && AC.state, now: AC && AC.currentTime, S: SND }), auto, car, fly, chunks, AT, setT: (t) => { tday = t; }, setWx: (k) => { wxAuto = false; wxCur = k; }, HUTS, get fps() { return fps; }, get tris() { return tris; } };
