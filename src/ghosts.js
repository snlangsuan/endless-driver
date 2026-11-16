// ===== Night haunting: Thai folk-legend ghosts along the road, and the passenger nobody picked up =====
// Only at night. A "haunted stretch" thickens the mist, tints the dark green and plays a low drone while a
// few legends show themselves by the roadside. Separately, a figure may sit in the back seat: you only see
// her in the rear-view mirror or when you turn round.
import * as THREE from 'three';
import { GPU, glowDef, glowPoints } from './gpu.js';
import { ROAD_HALF, hash1 } from './world.js';
import { EPISODES } from './episodes.js';
import { CARGLB } from './assets.js';
import { clone as skelClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const LEGENDS = {
  nak: 'แม่นาคพระโขนง',
  tani: 'ผีตานี (ผีต้นกล้วย)',
  krasue: 'กระสือ',
  krahang: 'กระหัง',
  pret: 'เปรต',
  yai: 'ยายสปีด',
};
const mat = (color, emissive = 0x000000, ei = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: 1, transparent: true, ...extra });
const cyl = (a, b, h, n = 10) => new THREE.CylinderGeometry(a, b, h, n);

// roadside spirit shrine (san phra phum) with offerings and a candle, and a big takhian tree wrapped in coloured cloth
function shrine(tex) {
  const g = new THREE.Group(), wood = mat(0x6b4a2e), gold = mat(0x9a7a30, 0x2a1a00, 0.3), red = mat(0x8a0f0f, 0x300000, 0.4), wh = mat(0xd8d2c4);
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  add(cyl(0.05, 0.06, 1.2, 8), wood, 0, 0.6, 0);
  add(new THREE.BoxGeometry(0.62, 0.05, 0.5), wood, 0, 1.22, 0);
  add(new THREE.BoxGeometry(0.4, 0.34, 0.32), wh, 0, 1.42, -0.03);
  const roof = add(new THREE.ConeGeometry(0.34, 0.36, 4), red, 0, 1.76, -0.03); roof.rotation.y = Math.PI / 4;
  add(cyl(0.012, 0.012, 0.22, 6), gold, 0, 2.02, -0.03);
  for (let k = 0; k < 4; k++) add(cyl(0.022, 0.022, 0.13, 8), red, -0.22 + k * 0.07, 1.31, 0.17);   // red soda bottles
  add(new THREE.SphereGeometry(0.035, 6, 5), mat(0xf2e7c0), 0.2, 1.27, 0.17);                    // a garland
  const fl = glowSprite(tex, 0xff7a2a, 0.9); fl.position.set(0.12, 1.36, 0.2); g.add(fl);           // candle / incense glow
  g.userData.flame = fl; g.userData.mats = [];
  return g;
}
function sala(tex) { // a roadside bus shelter: concrete bench, four posts, a sloping tin roof and one dying fluorescent tube
  const g = new THREE.Group(), conc = mat(0x8a8780), tin = mat(0x5a5f5c, 0, 0, { side: THREE.DoubleSide }), post = mat(0x3d4a52);
  const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o; };
  add(new THREE.BoxGeometry(3.2, 0.15, 1.8), conc, 0, 0.075, 0);
  for (const x of [-1.45, 1.45]) for (const z of [-0.75, 0.75]) add(cyl(0.05, 0.05, 2.4, 6), post, x, 1.2, z);
  add(new THREE.BoxGeometry(3.5, 0.04, 2.3), tin, 0, 2.45, 0, 0.12);
  add(new THREE.BoxGeometry(2.6, 0.06, 0.4), conc, 0, 0.48, -0.55); add(new THREE.BoxGeometry(2.6, 0.45, 0.06), conc, 0, 0.25, -0.38);
  const tube = add(new THREE.BoxGeometry(1.0, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0xd8f0e8 }), 0, 2.35, 0.1);
  const gl = glowSprite(tex, 0xbfe8d8, 3.2); gl.position.set(0, 2.2, 0.2); g.add(gl);
  g.userData.tube = tube; g.userData.tubeGlow = gl; g.userData.mats = [];
  return g;
}
function takhian(tex) {
  const g = new THREE.Group(), bark = mat(0x2a241e), leaf = mat(0x0f1a10);
  const t = new THREE.Mesh(cyl(0.45, 0.7, 7, 10), bark); t.position.y = 3.5; g.add(t);
  for (const [x, y, z, r] of [[0, 8.2, 0, 3.4], [1.8, 7.2, 0.6, 2.4], [-1.6, 7.4, -0.5, 2.6]]) { const c = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), leaf); c.position.set(x, y, z); c.scale.y = 0.7; g.add(c); }
  const cols = [0xc81e3a, 0xe0b020, 0x1e7a3a, 0xd8d0c0, 0x7a2a9a, 0xe06a1a, 0x2a5ac8];
  cols.forEach((c, k) => { const b = new THREE.Mesh(cyl(0.68 - k * 0.015, 0.7 - k * 0.015, 0.09, 12), mat(c, c, 0.08)); b.position.y = 1.0 + k * 0.1; g.add(b); });
  const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.9), mat(0xc81e3a, 0x200000, 0.2, { side: THREE.DoubleSide })); tail.position.set(0.68, 0.75, 0.2); g.add(tail);
  g.userData.mats = [];
  return g;
}

// a standing woman with long hair hiding the face (used by Mae Nak and Tani)
function woman(dressCol, glowCol) {
  const g = new THREE.Group();
  const dress = mat(dressCol, glowCol, 0.35), skin = mat(0xcfc6bb, 0x303830, 0.4), hair = mat(0x050505);
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  add(cyl(0.2, 0.42, 1.45), dress, 0, 0.73, 0);                       // long skirt
  add(cyl(0.15, 0.19, 0.55), dress, 0, 1.72, 0);                      // torso
  add(new THREE.SphereGeometry(0.12, 12, 10), skin, 0, 2.08, 0.01);   // head
  add(cyl(0.14, 0.21, 0.95, 12), hair, 0, 1.72, 0.02);                // hair falling over the face and shoulders
  add(cyl(0.135, 0.135, 0.12, 12), hair, 0, 2.17, 0);
  for (const s of [-1, 1]) add(cyl(0.035, 0.03, 0.62), skin, s * 0.2, 1.62, 0.12, 0.5, 0, s * 0.15); // arms reaching forward
  g.userData.mats = [dress, skin, hair];
  return g;
}
function bananaClump() {
  const g = new THREE.Group(), trunk = mat(0x4f5a2a), leaf = mat(0x2f5a1e, 0x0a1a08, 0.4, { side: THREE.DoubleSide });
  for (let k = 0; k < 3; k++) {
    const x = (k - 1) * 0.9, h = 2.4 + k * 0.4;
    const t = new THREE.Mesh(cyl(0.13, 0.17, h), trunk); t.position.set(x, h / 2, -0.6 - (k % 2) * 0.4); g.add(t);
    for (let j = 0; j < 5; j++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.7), leaf);
      l.position.set(x + Math.sin(j * 1.3) * 0.55, h + 0.2, t.position.z + Math.cos(j * 1.3) * 0.55);
      l.rotation.set(-0.9, j * 1.3, 0); g.add(l);
    }
  }
  g.userData.mats = [trunk, leaf];
  return g;
}
function glowSprite(tex, color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size); return s;
}

// a hunched old woman who runs beside your car at any speed (animated, so not a billboard)
function granny() {
  const g = new THREE.Group(), skin = mat(0xb9a690, 0x201810, 0.25), blouse = mat(0xd9d4c8, 0x202020, 0.2), sarong = mat(0x3a2a40, 0x100810, 0.2), hair = mat(0xb8b8b4, 0x202020, 0.3);
  const body = new THREE.Group(); body.position.y = 0.95; body.rotation.x = 0.45; g.add(body); // bent forward
  const add = (p, geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; };
  add(body, cyl(0.17, 0.2, 0.6), blouse, 0, 0.3, 0);
  add(body, new THREE.SphereGeometry(0.12, 10, 8), skin, 0, 0.72, 0.05);
  add(body, new THREE.SphereGeometry(0.075, 8, 6), hair, 0, 0.8, -0.07);           // grey bun
  add(body, new THREE.SphereGeometry(0.125, 10, 8), hair, 0, 0.75, -0.01).scale.set(1, 0.6, 1);
  add(g, cyl(0.2, 0.26, 0.5), sarong, 0, 0.78, 0);
  const limbs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.1, 0.62, 0); g.add(leg); add(leg, cyl(0.045, 0.04, 0.62), skin, 0, -0.31, 0); limbs.push(leg);
    const arm = new THREE.Group(); arm.position.set(s * 0.2, 0.52, 0); body.add(arm); add(arm, cyl(0.035, 0.03, 0.5), skin, 0, -0.25, 0); limbs.push(arm);
  }
  g.userData.limbs = limbs; g.userData.mats = [skin, blouse, sarong, hair];
  for (const m of g.userData.mats) m.userData.base = m.opacity;
  return g;
}
// Yai Speed from Blender: a rigged old woman with a run cycle and a hunched standing pose (assets/cars/yai.glb)
function yaiModel(ghostly = true) {
  const src = CARGLB.yai; if (!src) return null;
  const g = skelClone(src), mats = [];   // skinned: bones must be cloned with the mesh
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const m = o.material.clone(); m.transparent = true; m.userData.base = 1;
    if (ghostly) { m.emissive = m.color.clone().multiplyScalar(0.08); }       // a faint pallor so she reads in the dark
    o.material = m; mats.push(m); o.castShadow = true;
  });
  const mixer = new THREE.AnimationMixer(g), clip = (n) => src.animations.find((a) => a.name === n);
  const run = clip('run') && mixer.clipAction(clip('run')), stand = clip('stand') && mixer.clipAction(clip('stand'));
  (stand || run)?.play();
  g.userData = { mats, mixer, run, stand, head: g.getObjectByName('head'), limbs: [], yai3d: true };
  return g;
}
function yaiPose(mesh, running) {
  const u = mesh.userData; if (!u.yai3d || u.running === running) return;
  u.running = running;
  if (running) { u.run.reset().play(); u.stand && u.stand.crossFadeTo(u.run, 0.25, false); }
  else if (u.stand) { u.stand.reset().play(); u.run.crossFadeTo(u.stand, 0.3, false); }
}

// generated photo billboards (assets/ghost_*.webp), used when available
const BOARD_H = { nak: 2.05, tani: 3.3, krasue: 1.9, krahang: 2.6, pret: 7.8, rider: 1.05, yai: 1.55, face: 0.62 };
function board(type, map) {
  const h = BOARD_H[type], w = h * map.image.width / map.image.height;
  const m = new THREE.MeshBasicMaterial({ map, color: 0x9ea8a4, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, depthWrite: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), m);
  return { mesh, mats: [m] };
}
function buildGhost(type, tex, spr) {
  const g = new THREE.Group(); let mats = [];
  if (type === 'yai' && CARGLB.yai) { const y = yaiModel(); g.add(y); mats = y.userData.mats; g.userData = { ...y.userData }; g.userData.mats = mats; for (const m of mats) m.userData.base = m.opacity; return g; }
  if (type === 'yai' && spr && spr[0]) { // two photo frames swapped in time with her stride
    const frames = spr.map((t) => board('yai', t)); frames.forEach((f, k) => { f.mesh.visible = k === 0; g.add(f.mesh); });
    g.userData.frames = frames.map((f) => f.mesh); g.userData.board = frames[0].mesh; mats = frames.flatMap((f) => f.mats); g.userData.limbs = [];
  } else if (type === 'yai') { const y = granny(); g.add(y); mats = y.userData.mats; g.userData.limbs = y.userData.limbs; }
  else if (spr) { const b = board(type, spr); g.add(b.mesh); mats = b.mats; g.userData.board = b.mesh; if (type === 'krasue') b.mesh.position.y = -1.5; } // head at the top, the glowing entrails hanging below it
  else if (type === 'nak') { const w = woman(0xe9e7df, 0x6a7a74); const baby = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), w.userData.mats[0]); baby.position.set(0, 1.62, 0.22); w.add(baby); g.add(w); mats = w.userData.mats; g.add(glowSprite(tex, 0x8fa8a0, 3.2)).position.y = 1.4; }
  else if (type === 'tani') { const w = woman(0x2c6a3a, 0x1f5a2a); g.add(w); const b = bananaClump(); g.add(b); mats = [...w.userData.mats, ...b.userData.mats]; g.add(glowSprite(tex, 0x6fd88a, 3.5)).position.y = 1.5; }
  else if (type === 'krasue') {
    const head = new THREE.Group(), skin = mat(0xd8cfc4, 0x404840, 0.5), hair = mat(0x050505);
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin));
    const h2 = new THREE.Mesh(cyl(0.15, 0.24, 0.55, 12), hair); h2.position.y = -0.15; head.add(h2);
    const glow = glowSprite(tex, 0x9cff7a, 1.6); glow.position.y = -0.5; head.add(glow);
    const glow2 = glowSprite(tex, 0x5fd848, 3.5); glow2.position.y = -0.35; head.add(glow2);
    g.add(head); g.userData.head = head; mats = [skin, hair];
  } else if (type === 'krahang') {
    const body = mat(0x2a2018, 0x100804, 0.3), wing = mat(0x8a7350, 0x201408, 0.3, { side: THREE.DoubleSide });
    const b = new THREE.Mesh(cyl(0.16, 0.2, 1.3), body); g.add(b);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), body); hd.position.y = 0.8; g.add(hd);
    const wings = [];
    for (const s of [-1, 1]) {                        // rice-winnower "wings" held in both hands
      const piv = new THREE.Group(); piv.position.set(s * 0.18, 0.45, 0); g.add(piv);
      const w = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), wing); w.position.x = s * 0.62; w.rotation.y = Math.PI / 2; piv.add(w); wings.push(piv);
    }
    g.userData.wings = wings; mats = [body, wing];
  } else if (type === 'pret') {
    const skin = mat(0x3a3530, 0x0a0a0a, 0.2), add = (geo, x, y, z, rz = 0) => { const o = new THREE.Mesh(geo, skin); o.position.set(x, y, z); o.rotation.z = rz; g.add(o); };
    for (const s of [-1, 1]) { add(cyl(0.06, 0.09, 4.2), s * 0.22, 2.1, 0); add(cyl(0.04, 0.05, 3.4), s * 0.42, 5.2, 0.05, s * 0.05); }
    add(cyl(0.2, 0.26, 2.6), 0, 5.4, 0);                // thin ribbed trunk
    add(cyl(0.05, 0.05, 0.5), 0, 6.95, 0);              // long neck
    add(new THREE.SphereGeometry(0.16, 10, 8), 0, 7.3, 0);
    add(cyl(0.012, 0.012, 0.06), 0, 7.24, 0.16);        // a mouth the size of a needle's eye
    mats = [skin];
  }
  g.userData.mats = mats;
  for (const m of mats) m.userData.base = m.opacity;
  return g;
}

export class Haunt {
  constructor({ scene, camera, roadAtS, groundAt, glowTex, toast, banner, audio, sprites = {} }) {
    Object.assign(this, { scene, camera, roadAtS, groundAt, tex: glowTex, toast, banner, audio, sprites });
    // what the haunting does to the car and the screen (read by main.js every frame)
    this.fx = { lights: 1, lamps: 1, stall: 0, traffic: 1, shake: 0, hands: 0, wipe: 0 };
    this.hands = 0; this.handsT = 0;
    this.props = []; this.events = []; this.seenTypes = new Set(); this.evT = 0; this.scare = null; this.flash = 0; this.heartK = 0;
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;opacity:0;background:radial-gradient(ellipse at 50% 55%,rgba(0,0,0,0) 38%,rgba(4,10,6,.92) 100%)';
    const fl = document.createElement('div');
    fl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;opacity:0;background:#e8f0ec;mix-blend-mode:screen';
    const sub = document.createElement('div');
    sub.style.cssText = 'position:fixed;left:50%;bottom:17%;transform:translateX(-50%);max-width:min(760px,86vw);text-align:center;pointer-events:none;z-index:5;opacity:0;transition:opacity .8s;font-size:clamp(15px,2.1vw,22px);line-height:1.5;text-shadow:0 0 8px #000,0 0 3px #000;letter-spacing:.02em';
    document.body.append(ov, fl, sub); this.ovEl = ov; this.flEl = fl; this.subEl = sub;
    this.timers = []; this.clock = 0; this.heart = 0; this.ep = null;
    // the jump-scare face, hung just in front of the camera and normally hidden
    this.face = new THREE.Group(); this.face.visible = false; this.face.renderOrder = 10;
    if (camera) camera.add(this.face);
    this.periGroup = new THREE.Group(); this.peris = [];   // scares that sit around you in the car (main.js adds this to the cabin)
    this.enabled = true; this.level = 0; this.active = false; this.end = 0; this.ghosts = []; this.cool = 0; this.nextCheckKm = -1;
    this._r = {};
    // will-o'-the-wisps (ผีโขมด) drifting over the fields during a haunting
    const n = 40, g = new THREE.BufferGeometry(); this.wispPos = new Float32Array(n * 3); this.wispSeed = [...Array(n)].map((_, i) => hash1(i * 7.3));
    g.setAttribute('position', new THREE.BufferAttribute(this.wispPos, 3));
    const pm = { map: glowTex, size: 1.4, color: 0x7dffb0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending };
    if (GPU) { const def = glowDef(pm); this.wisps = glowPoints(g, def); Object.defineProperty(this.wisps, 'wmat', { value: def }); }
    else this.wisps = new THREE.Points(g, new THREE.PointsMaterial(pm));
    this.wispGeo = g;
    this.wisps.frustumCulled = false; scene.add(this.wisps);
    // back-seat passenger (added to the cabin by main.js)
    if (sprites.rider) { const b = board('rider', sprites.rider); this.rider = new THREE.Group(); this.rider.add(b.mesh); this.rider.userData.mats = b.mats; b.mesh.position.y = 0.62; b.mats[0].color.set(0x8c9490); }
    else { this.rider = woman(0xe6e3da, 0x48544f); this.rider.scale.setScalar(0.62); this.rider.position.y = 0.08; } // seated: legs hidden by the seat
    this.rider.visible = false; this.rider.position.x = 0.32; this.rider.position.z = -1.1; // behind the passenger seat, facing forward
    for (const m of this.rider.userData.mats) m.userData.base = m.opacity;
    this.riderT = 0; this.riderSeen = false;
  }
  // photo billboards become available once the images have loaded
  setSprites(map) {
    this.sprites = map;
    this.buildFace('nak');
    if (map.rider) {
      const parent = this.rider.parent, b = board('rider', map.rider), r = new THREE.Group();
      r.add(b.mesh); r.userData.mats = b.mats; b.mesh.position.y = 0.62; b.mats[0].color.set(0x8c9490);
      r.visible = false; r.position.set(0.32, 0, -1.1);
      if (parent) { parent.remove(this.rider); parent.add(r); }
      this.rider = r;
    }
  }
  // the face that lunges at you. dist: how far in front of the eye (0.5 = against your face, 0.95 = on the far side of the windscreen)
  buildFace(kind = 'nak', dist = 0.5) {
    for (const c of [...this.face.children]) this.face.remove(c);
    const own = { nak: this.sprites.face || this.sprites.nak, yai: this.sprites.yai_face || this.sprites.face || this.sprites.nak, krasue: this.sprites.krasue, tani: this.sprites.tani, pret: this.sprites.pret, krahang: this.sprites.krahang, rider: this.sprites.rider };
    const sp = own[kind] || this.sprites.face || this.sprites.nak;
    if (!sp) { const w = woman(0xe9e7df, 0x6a7a74); w.scale.setScalar(0.45); w.position.set(0, -0.98, -0.6); w.traverse((o) => { if (o.material) { o.material.depthTest = false; o.renderOrder = 10; } }); this.face.add(w); return; }
    const key = sp === this.sprites.face ? 'face' : sp === this.sprites.yai_face ? 'face' : kind in BOARD_H ? kind : 'nak';
    const b = board(key, sp); b.mats[0].color.set(0xb8c2bc); b.mats[0].depthTest = false; b.mesh.renderOrder = 10;
    const H = BOARD_H[key], k = dist / 0.5;
    // place the sprite so its head (near the top of the picture) sits in the middle of your view
    const headFrac = { face: 0.55, nak: 0.9, tani: 0.82, krasue: 0.84, pret: 0.94, krahang: 0.88, rider: 0.86 }[key] ?? 0.9;
    const scl = { face: 1, nak: 1, tani: 0.75, krasue: 0.8, pret: 0.27, krahang: 0.8, rider: 1 }[key] ?? 1;
    b.mesh.scale.setScalar(scl * k); b.mesh.position.set(0, -H * headFrac * scl * k, -dist);
    this.face.add(b.mesh);
  }
  // "every time the lights come back she is closer": hops toward you in the headlights, then the face
  approach(type, hops = [48, 30, 17, 8], final = true) { this.scare = { kind: 'approach', t: 0, dur: 99, type, hops, i: -1, final }; this.audio.duck?.(hops.length * 1.5, 0.15); }
  // ---- scares placed around you, not in the middle of the screen ----
  // window: a face pressed to the driver's side window | passenger: someone sitting beside you | roof: hanging upside down over the top of
  // the windscreen | behind: right behind your seat | They wait at the edge of your sight; when you turn to look, they come at you.
  peri(kind, type, dur = 10, opts = {}) {
    const EYE = new THREE.Vector3(-0.37, 1.22, -0.05);
    const at = { window: [-1.02, 1.17, 0.12], passenger: [0.38, 1.12, -0.12], roof: [-0.3, 1.36, 0.42], behind: [-0.12, 1.16, -0.72], side: [-1.05, 1.0, -0.35] }[kind];
    const keyOf = { krasue: 'krasue', yai: this.sprites.yai_face ? 'face' : 'face', pret: 'pret', tani: 'tani', rider: 'rider', krahang: 'krahang' };
    let key = keyOf[type] || 'face', sp = key === 'face' ? (type === 'yai' && this.sprites.yai_face) || this.sprites.face : this.sprites[key];
    if (!sp) { key = 'face'; sp = this.sprites.face; } if (!sp) return;
    const b = board(key, sp), H = BOARD_H[key];
    const headFrac = { face: 0.55, tani: 0.82, krasue: 0.84, pret: 0.94, krahang: 0.88, rider: 0.86 }[key] ?? 0.9;
    const scl = kind === 'passenger' && key === 'rider' ? 1 : { face: 0.85, tani: 0.62, krasue: 0.72, pret: 0.24, krahang: 0.7, rider: 0.9 }[key] ?? 0.8;
    b.mats[0].color.set(0x8f9a95); b.mesh.renderOrder = 4;
    const holder = new THREE.Group(), inner = new THREE.Group(); holder.add(inner); inner.add(b.mesh);
    b.mesh.scale.setScalar(scl); b.mesh.position.y = -H * headFrac * scl;            // the head sits on the anchor point
    if (kind === 'roof') inner.rotation.z = Math.PI;                                  // hanging upside down, hair falling up the glass
    holder.position.set(...at); holder.lookAt(this.periGroup.localToWorld(EYE.clone())); this.periGroup.add(holder);
    const target = Math.atan2(at[0] - EYE.x, at[2] - EYE.z);                         // which way you have to look to see it
    const p = { kind, type, holder, mats: b.mats, t: 0, dur, target, seenT: 0, lunge: opts.lunge ? 0.001 : 0, home: holder.position.clone(), EYE };
    this.peris.push(p); this.setOpacity(holder, 0);
    if (!opts.quiet) { this.audio.whisper?.(); this.heart = Math.max(this.heart, 0.8); }
    return p;
  }
  updatePeris(dt, st) {
    for (const p of [...this.peris]) {
      p.t += dt;
      const fadeIn = Math.min(1, p.t / (p.kind === 'roof' ? 0.15 : 0.6));
      // are you looking at it? (cockpit view yaw; looking back counts for things behind you)
      const yaw = st.lookYaw ?? 0, look = p.kind === 'behind' ? st.lookBack : Math.abs(Math.atan2(Math.sin(yaw - p.target), Math.cos(yaw - p.target))) < 0.5;
      if (p.kind === 'roof') { if (!p.lunge && p.t > p.dur - 0.5) p.lunge = 0.001; }   // always in view: it drops at you in the end
      else if (!p.lunge && look && p.t > 0.4) { p.seenT += dt; if (p.seenT > 0.2) p.lunge = 0.001; }
      if (p.lunge) {                                                     // it comes at your face
        if (p.lunge < 0.01) { this.audio.duck?.(1.5, 0); this.audio.sting?.(1.3); this.audio.scream?.(1); this.flash = 0.45; this.fx.shake = 1; this.heart = 1; }
        p.lunge += dt; const k = Math.min(1, p.lunge / 0.32);
        p.holder.position.lerpVectors(p.home, p.EYE, k * 0.78); p.holder.lookAt(this.periGroup.localToWorld(p.EYE.clone()));
        this.setOpacity(p.holder, p.lunge < 0.55 ? 1 : 0);
        if (Math.random() < 0.3) this.fx.lights = 0.1;
        if (p.lunge > 0.6) this.removePeri(p);
        continue;
      }
      const sway = Math.sin(p.t * 1.7) * 0.01; p.holder.position.y = p.home.y + sway;
      this.setOpacity(p.holder, fadeIn * (p.t > p.dur ? Math.max(0, 1 - (p.t - p.dur) * 2) : 1));
      if (p.t > p.dur + 0.5) this.removePeri(p);
      this.heart = Math.max(this.heart, 0.7);
    }
  }
  removePeri(p) { this.periGroup.remove(p.holder); this.peris = this.peris.filter((x) => x !== p); }
  // something lands on the windscreen and stays there, looking in at you
  cling(type, sec = 3.5) { this.buildFace(type, 0.95); this.scare = { kind: 'cling', t: 0, dur: sec, type }; this.audio.sting?.(1); this.audio.scream?.(0.6); this.audio.knock1?.(); this.fx.shake = 0.8; this.heart = 1; }
  // start a haunted stretch now (also used by the "try it" button)
  start(carS, type) {
    this.clearGhosts(); this.active = true; this.end = carS + 6000;
    const all = Object.keys(EPISODES).filter((k) => k !== this.lastEp);
    type = type && EPISODES[type] ? type : all[Math.floor(Math.random() * all.length)];
    this.lastEp = type;
    this.ep = { type, s0: carS, beat: 0, t: 0, e: {}, side: Math.random() < 0.5 ? 1 : -1 };
    this.wispBase = carS; this.startS = carS; this.evT = 20; this.seenTypes.clear();
    this.prop('shrine', carS + 90, Math.random() < 0.5 ? 1 : -1);
    this.audio.howl?.();
  }
  // ---- helpers the episodes use ----
  ent(type, s, L, y = 0) { const g = { type, s, L, y, mesh: buildGhost(type, this.tex, this.sprites[type]), t: 0, fade: 0, want: 0, scale: 1 }; this.scene.add(g.mesh); this.setOpacity(g.mesh, 0); this.ghosts.push(g); return g; }
  kill(g) { if (!g) return; this.scene.remove(g.mesh); this.ghosts = this.ghosts.filter((x) => x !== g); }
  prop(kind, s, sideK) {
    const mesh = kind === 'shrine' ? shrine(this.tex) : kind === 'banana' ? bananaClump() : kind === 'sala' ? sala(this.tex) : takhian(this.tex);
    const L = Math.sign(sideK) * (kind === 'sala' ? ROAD_HALF + 2.3 : kind === 'shrine' ? ROAD_HALF + 2.2 : kind === 'banana' ? ROAD_HALF + 1.5 + Math.abs(sideK) * 2.5 : ROAD_HALF + 7 * Math.max(0.6, Math.abs(sideK)));
    const p = { s, L, mesh, kind }; this.props.push(p); this.scene.add(mesh); return p;
  }
  later(sec, f) { this.timers.push([this.clock + sec, f]); }
  cue(ep, at, f) { ep.cues = ep.cues || {}; if (ep.t >= at && !ep.cues[at]) { ep.cues[at] = 1; f(); } }
  speak(text) { // a slow, low whisper of the line through the speakers when a Thai voice is installed
    try {
      const ss = window.speechSynthesis; if (!ss || !this.audio.on) return;
      const v = ss.getVoices().find((x) => /^th/i.test(x.lang)); if (!v) return;
      const u = new SpeechSynthesisUtterance(text.replace(/["()]/g, '').replace(/\.\.\./g, ', ')); u.voice = v; u.lang = v.lang; u.rate = 0.72; u.pitch = 0.35; u.volume = 0.9 * (this.audio?.vol?.fx ?? 1);
      ss.cancel(); ss.speak(u);
    } catch {}
  }
  say(text, kind = 'narr', dur) {
    if (kind === 'voice') this.speak(text);
    return;   // no on-screen text: the story is told by what you see and hear
    const el = this.subEl; el.textContent = text;
    el.style.fontStyle = kind === 'voice' ? 'normal' : 'italic'; el.style.color = kind === 'voice' ? '#e6efe9' : '#a9b8b0';
    el.style.opacity = '1'; clearTimeout(this.subT);
    this.subT = setTimeout(() => (el.style.opacity = '0'), (dur || Math.max(3.5, text.length * 0.09)) * 1000);
  }
  flickerLights() { const k = Math.floor(this.clock * 14 + Math.sin(this.clock * 31) * 3) % 3; this.fx.lights = Math.min(this.fx.lights, k === 0 ? 0.05 : 1); }
  endEpisode() {
    const ep = this.ep; if (!ep) return;
    const E = EPISODES[ep.type]; this.ep = null;

    this.end = this.stNow ? this.stNow.carS + 250 : 0;           // the mist lifts a little further on
  }
  // ยายสปีด: shows up behind, runs up to the driver's window, keeps pace whatever your speed, then overtakes
  spawnYai(atS, standAt = null) {
    this.clearYai();
    this.yai = { at: atS, mesh: buildGhost('yai', this.tex, this.sprites.yai), phase: standAt ? 'stand' : 'wait', s0: standAt ? standAt.s : 0, L: standAt ? standAt.L : 0, off: -40, t: 0, fade: 0, seen: false };
    this.scene.add(this.yai.mesh);
  }
  clearYai() { if (this.yai) this.scene.remove(this.yai.mesh); this.yai = null; }
  clearGhosts() {
    for (const g of this.ghosts) this.scene.remove(g.mesh);
    for (const p of this.props) this.scene.remove(p.mesh);
    for (const p of [...this.peris]) this.removePeri(p);
    this.ghosts = []; this.props = []; this.active = false; this.scare = null; this.fx.stall = 0; this.ep = null; this.timers = [];
    if (this.rider.visible && this.riderStory) this.rider.visible = false;
  }
  clear() { this.clearYai(); this.clearGhosts(); }
  // sit someone in the back seat (only at night)
  seatRider(where = 'back') {
    this.rider.visible = true; this.riderT = 0; this.riderSeen = false; this.riderStory = !!this.ep; this.setOpacity(this.rider, 1);
    if (where === 'front') this.rider.position.set(0.37, 0.12, -0.12); else this.rider.position.set(0.32, 0, -1.1);
    this.riderHome = this.rider.position.clone();
  }
  riderOff() { this.rider.visible = false; }
  creep(z) { if (!this.rider.visible) return; this.rider.position.z = -z * 1.3 + 0.0; this.rider.position.x = 0.32 - (1.1 - z) * 0.4; this.audio.whisper?.(); this.audio.breath?.(); }   // she has moved closer (you only notice in the mirror)
  leanRider(dt) { this.rider.position.x += (0.05 - this.rider.position.x) * dt * 0.6; this.rider.position.z += (-0.55 - this.rider.position.z) * dt * 0.6; this.rider.position.y += (0.15 - this.rider.position.y) * dt * 0.6; }
  jump(kind = 'nak') {
    this.buildFace(kind); this.scare = { kind: 'face', t: 0, dur: 0.95 }; this.flash = 0.6; this.heart = 1;
    this.audio.duck?.(2.2, 0.0); this.audio.sting?.(1.4); this.audio.scream?.(1.1); this.fx.shake = 1;
  }
  setOpacity(o, a) { for (const m of o.userData.mats || []) { m.opacity = (m.userData.base ?? 1) * a; } o.visible = a > 0.02; }

  update(dt, st) {
    this.stNow = st;
    const { carS, night, lookBack, carV } = st;
    this.cool -= dt;
    if (!this.enabled || night < 0.6) { if (this.active && night < 0.3) this.clear(); }
    // each night is rolled once: most nights are quiet; a haunted night gets one (sometimes two) things, at a random point
    const kmNow = Math.floor(carS / 1000);
    if (night < 0.3 || (this.nightRoll && kmNow - this.nightRoll.km > 40)) this.nightRoll = null;   // a new night (or a very long one: count it again every 40 km)
    else if (night > 0.8 && !this.nightRoll) {
      const haunted = this.forceNight || Math.random() < 0.35; this.forceNight = false;
      this.nightRoll = { km: kmNow, haunted, budget: haunted ? (Math.random() < 0.25 ? 2 : 1) : 0, waitKm: 1 + Math.floor(Math.random() * 12) };
    }
    const km = Math.floor(carS / 1000);
    if (this.enabled && night > 0.8 && km !== this.nextCheckKm) {
      this.nextCheckKm = km;
      const nr = this.nightRoll;
      if (nr && nr.budget > 0 && --nr.waitKm <= 0 && !this.active && this.cool <= 0) {
        const r = Math.random();
        if (r < 0.2 && !this.rider.visible && Math.abs(carV) > 5) { this.seatRider(); nr.budget--; }
        else if (!st.town) { this.start(carS, !this.yai && Math.abs(carV) > 15 && r < 0.35 ? 'yai' : undefined); nr.budget--; }
        if (nr.budget < (nr.haunted ? 2 : 0)) { this.cool = 300; nr.waitKm = 4 + Math.floor(Math.random() * 10); }
      }
    }
    if (this.active && carS > this.end) this.clearGhosts();
    const tgt = this.active ? 1 : 0;
    this.level += (tgt - this.level) * Math.min(1, dt * 0.35);
    this.heart = Math.max(this.level * 0.2, this.heart * Math.exp(-dt * 0.5));
    this.fx.lights = 1; this.fx.stall = 0;
    // timed lines and sounds
    this.clock += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i][0] <= this.clock) { const f = this.timers[i][1]; this.timers.splice(i, 1); f(); }
    // the story of this road
    if (this.ep) { this.ep.t += dt; this.stNow = st; EPISODES[this.ep.type].update(this, this.ep, st, dt); }
    // omens by the roadside
    for (const p of this.props) {
      const r = this.roadAtS(p.s, this._r), lx = Math.cos(r.h), lz = -Math.sin(r.h), x = r.x + lx * p.L, z = r.z + lz * p.L;
      p.mesh.position.set(x, this.groundAt(x, z), z); p.mesh.rotation.y = Math.atan2(-lx * Math.sign(p.L), -lz * Math.sign(p.L));
      const fl = p.mesh.userData.flame; if (fl) fl.material.opacity = 0.55 + 0.45 * Math.sin(st.time * 13 + p.s) * Math.sin(st.time * 7.3);
      const tg = p.mesh.userData.tubeGlow; if (tg) { const on = p.dead ? 0 : Math.sin(st.time * 23) * Math.sin(st.time * 3.7 + p.s) > -0.35 ? 1 : 0.1; tg.material.opacity = 0.7 * on; p.mesh.userData.tube.material.color.setScalar(0.2 + 0.7 * on); }
    }
    // figures: placed by the episode (road distance s, lateral L, height y), fading in and out
    for (const g of this.ghosts) {
      g.t += dt;
      const r = this.roadAtS(g.s, this._r), lx = Math.cos(r.h), lz = -Math.sin(r.h);
      const x = r.x + lx * g.L, z = r.z + lz * g.L;
      g.mesh.position.set(x, this.groundAt(x, z) + (g.y || 0), z);
      g.mesh.scale.setScalar(g.scale || 1);
      if (g.mesh.userData.board) g.mesh.rotation.y = Math.atan2(st.cam.x - x, st.cam.z - z); // photo billboards always face you
      else g.mesh.rotation.y = Math.atan2(st.cam.x - x, st.cam.z - z);
      if (g.mesh.userData.wings) for (const [k, w] of g.mesh.userData.wings.entries()) w.rotation.z = (k ? -1 : 1) * Math.sin(g.t * 9) * 0.6;
      g.fade += (g.want - g.fade) * Math.min(1, dt * (g.want ? 1.4 : 3));
      this.setOpacity(g.mesh, g.fade * (g.hold ? 1 : 0.85 + 0.15 * Math.sin(g.t * 3.1) * Math.sin(g.t * 1.7)));
      if (g.fade > 0.3) { const d = Math.hypot(st.cam.x - x, st.cam.z - z); this.heart = Math.max(this.heart, Math.min(1, 1.15 - d / 140)); if (!g.seen) { g.seen = true; this.seenTypes.add(g.type); } }
    }
    // small things in between, while the story runs
    if (this.active && carS - this.startS > 150) {
      this.evT -= dt;
      if (this.evT <= 0 && !this.scare) {
        this.evT = 14 + Math.random() * 12;
        const pick = (a) => a[Math.floor(Math.random() * a.length)];
        const who = pick(['krasue', 'yai', 'krasue']), ev = pick(['reveal', 'mirror', 'hands', 'window', 'passenger', 'roof', 'cross', 'behind', 'flicker']);
        this.evT = 9 + Math.random() * 9;
        if (ev === 'reveal') { this.audio.duck?.(1.6, 0.05); this.scare = { kind: 'reveal', t: 0, dur: 1.6, type: who }; }
        else if (ev === 'mirror') { this.scare = { kind: 'mirror', t: 0, dur: 3.2, type: who }; this.audio.whisper?.(); }
        else if (ev === 'hands') { this.handsT = 0; this.hands = Math.max(this.hands, 0.01); }
        else if (ev === 'window') this.peri('window', pick(['krasue', 'yai', 'face']), 9);
        else if (ev === 'passenger') this.peri('passenger', 'rider', 12, { quiet: true });
        else if (ev === 'roof') { this.audio.knock1?.(); this.peri('roof', pick(['face', 'krasue']), 6); }
        else if (ev === 'behind') { this.audio.breath?.(); this.peri('behind', pick(['face', 'yai']), 14, { quiet: true }); }
        else if (ev === 'cross') this.scare = { kind: 'cross', t: 0, dur: 1.4, type: pick(['krasue', 'tani']) };
        else if (ev === 'flicker') this.scare = { kind: 'flicker', t: 0, dur: 0.8 + Math.random() * 0.8 };
        else if (ev === 'whisper') this.audio.whisper?.();
        else this.audio.howl?.();
      }
    }
    this.updatePeris(dt, st);
    let heart = this.heart;
    const sc = this.scare;
    if (sc) {
      sc.t += dt;
      if (sc.kind === 'flicker') { sc.k = (sc.k || 0) - dt; if (sc.k <= 0) { sc.k = 0.04 + Math.random() * 0.12; sc.on = Math.random() < 0.45; } this.fx.lights = sc.on ? 1 : 0.04; heart = Math.max(heart, 0.6); }
      if (sc.kind === 'blackout') {
        this.fx.lights = 0; this.fx.stall = 1; heart = 1;
        if (sc.t >= sc.dur) { // the lights come back... and someone is standing right there
          const ahead = Math.max(16, Math.abs(carV) * 1.25);
          const gh = { type: 'nak', s: carS + ahead, L: st.carL, side: 1, mesh: buildGhost('nak', this.tex, this.sprites.nak), seen: true, gone: false, t: 0, fade: 1, stalk: 2 };
          this.scene.add(gh.mesh); this.ghosts.push(gh); this.seenTypes.add('nak');
          this.setOpacity(gh.mesh, 1); this.audio.sting?.(1); this.flash = 0.25;
        }
      }
      if (sc.kind === 'face') {   // she lunges: flickers in, grows toward you, the picture shakes
        heart = 1; const on = sc.t < 0.28 ? Math.floor(sc.t * 28) % 2 === 0 : sc.t < sc.dur;
        this.face.visible = on; const k = 1 + sc.t * 0.35; this.face.scale.setScalar(k);
        this.face.position.set((Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.03, 0); this.fx.shake = Math.max(this.fx.shake, 1 - sc.t / sc.dur);
        this.fx.lights = Math.random() < 0.5 ? 0.1 : 1;
      }
      if (sc.kind === 'reveal') {   // lights die... come back on a figure much too close... die again... and it is gone
        const T = sc.t;
        this.fx.lights = T < 0.45 ? 0 : T < 1.0 ? 1 : T < 1.35 ? 0 : 1; this.fx.stall = T < 1.35 ? 0.6 : 0;
        if (T >= 0.45 && !sc.g) { const st = this.stNow, side = Math.random() < 0.5 ? 1 : -1; sc.g = this.ent(sc.type, st.carS + 9 + Math.abs(st.carV) * 0.45, st.carL + side * 2.6, sc.type === 'krasue' ? 1.3 : 0); sc.g.fade = 1; sc.g.want = 1; sc.g.hold = true; this.audio.sting?.(0.9); this.heart = 1; this.fx.shake = 0.5; }
        if (T >= 1.0 && sc.g) { this.kill(sc.g); sc.g = null; }
      }
      if (sc.kind === 'approach') {
        const st = this.stNow, step = Math.floor(sc.t / 1.5), ph = sc.t - step * 1.5;
        this.fx.stall = 0.7; this.heart = 1;
        if (step >= sc.hops.length) { if (sc.g) this.kill(sc.g); sc.g = null; this.scare = null; if (sc.final) { if (sc.type === 'pret') this.peri('roof', 'pret', 9); else this.peri('passenger', 'rider', 14); } }
        else {
          this.fx.lights = ph < 0.35 ? 0 : 1;
          if (ph >= 0.35 && sc.i !== step) {
            sc.i = step; if (sc.g) this.kill(sc.g);
            sc.g = this.ent(sc.type, st.carS + sc.hops[step], st.carL); sc.g.fade = 1; sc.g.want = 1; sc.g.hold = true; if (sc.type === 'pret') sc.g.scale = 1.4;
            this.audio.sting?.(0.35 + step * 0.2); this.fx.shake = 0.2 + step * 0.15;
          }
          if (sc.g) { sc.g.s = Math.max(sc.g.s, st.carS + 4); sc.g.L = st.carL; }
        }
      }
      if (sc.kind === 'cling') {   // pressed against the glass; the wipers sweep over her and she does not move
        this.face.visible = true; this.heart = 1; this.fx.wipe = 1;
        this.face.position.set(Math.sin(sc.t * 2.3) * 0.02, Math.sin(sc.t * 1.7) * 0.015 - (sc.t > sc.dur - 0.4 ? (sc.t - sc.dur + 0.4) * 3 : 0), 0);
        if (Math.random() < 0.04) this.fx.lights = 0.05;
        if (sc.t >= sc.dur) { this.face.visible = false; this.fx.wipe = 0; this.audio.knock?.(); this.audio.scratch?.(); }
      }
      if (sc.kind === 'cross') {   // something darts across the road right in front of the car
        const st = this.stNow;
        if (!sc.g) { sc.g = this.ent(sc.type, st.carS + 15 + Math.abs(st.carV) * 0.5, st.carL + 9, sc.type === 'krasue' ? 1.4 : 0); sc.g.fade = 1; sc.g.want = 1; sc.g.hold = true; sc.side = Math.random() < 0.5 ? 1 : -1; sc.g.L = st.carL + 9 * sc.side; this.audio.sting?.(0.7); }
        sc.g.s = Math.max(sc.g.s, st.carS + 6); sc.g.L -= sc.side * 16 * dt;
        if (sc.t > sc.dur - 0.05) { this.kill(sc.g); sc.g = null; }
      }
      if (sc.kind === 'mirror') {   // someone standing in the road behind you, only in the mirror
        const st = this.stNow;
        if (!sc.g) { sc.g = this.ent(sc.type, st.carS - 9, st.carL, sc.type === 'krasue' ? 1.3 : 0); sc.g.fade = 1; sc.g.want = 1; sc.g.hold = true; }
        sc.g.s = st.carS - 9 + Math.sin(sc.t * 0.7) * 0.4; sc.g.L = st.carL;
        if (sc.t > sc.dur - 0.05) { this.kill(sc.g); sc.g = null; }
      }
      if (sc.t >= sc.dur) { if (sc.kind === 'face') this.face.visible = false; this.scare = null; }
    }
    // streetlights die on that road; the darkness closes in at the edges of your sight
    this.fx.lamps = 1 - 0.9 * this.level;
    this.fx.traffic = 1 - this.level;
    this.flash = Math.max(0, this.flash - dt * 2.5);
    // handprints on the windscreen: they slap onto the glass one by one, then slowly fade
    if (this.hands > 0) {
      const n0 = Math.floor(this.handsT / 0.55); this.handsT += dt; const n1 = Math.floor(this.handsT / 0.55);
      if (n1 !== n0 && n1 <= 6) { this.audio.knock1?.(); this.heart = Math.max(this.heart, 0.8); }
      this.fx.hands = Math.min(6, this.handsT / 0.55) / 6;
      this.fx.handsFade = this.handsT < 5 ? 1 : Math.max(0, 1 - (this.handsT - 5) / 6);
      if (this.handsT > 11) { this.hands = 0; this.fx.hands = 0; }
    }
    this.fx.shake = Math.max(0, this.fx.shake - dt * 1.6);
    this.heartK += (heart - this.heartK) * Math.min(1, dt * 1.5);
    this.audio.heart?.(dt, this.level > 0.05 || this.heartK > 0.1 ? this.heartK : 0);
    this.ovEl.style.opacity = (this.level * 0.7 + this.heartK * 0.2 * (0.6 + 0.4 * Math.sin(st.time * (6 + this.heartK * 5)))).toFixed(3);
    this.flEl.style.opacity = this.flash.toFixed(3);
    const y = this.yai;
    if (y && (carS >= y.at || y.phase === 'stand')) {
      y.t += dt;
      if (y.phase === 'wait') { y.phase = 'catch'; y.off = -45; }
      if (y.phase === 'stand') y.off = y.s0 - carS;                                  // waiting at the shelter
      else if (y.phase === 'catch') { y.off += Math.max(6, 0.25 * Math.abs(carV)) * dt; if (y.off >= -0.2) { y.phase = 'pace'; y.pace = 0; } }
      else if (y.phase === 'pace') { y.off = 0.2 + Math.sin(y.t * 1.3) * 0.25; y.pace += dt; if (y.pace > (y.paceDur || 6) && !y.hold) y.phase = 'pass'; }
      else if (y.phase === 'pass') { y.off += (8 + 0.4 * Math.abs(carV)) * dt; if (y.off > 60) y.phase = 'gone'; }
      const s = carS + y.off, r = this.roadAtS(s, this._r), lx = Math.cos(r.h), lz = -Math.sin(r.h);
      const L = y.phase === 'stand' ? y.L : st.carL - 2.4;                            // otherwise the driver's (right-hand) side
      const x = r.x + lx * L, z = r.z + lz * L;
      const running = y.phase !== 'stand' && !(y.phase === 'pace' && Math.abs(carV) < 1);
      const stride = (Math.abs(carV) + 4) * 0.9, sw = Math.sin(y.t * stride);
      y.mesh.position.set(x, this.groundAt(x, z), z);
      if (y.mesh.userData.yai3d) {
        yaiPose(y.mesh, running);
        const u = y.mesh.userData; u.run.timeScale = Math.min(9, Math.max(1, (Math.abs(carV) + 3) / 3.2)); u.mixer.update(dt);
        if (y.phase === 'stand') y.mesh.rotation.y = Math.atan2(st.cam.x - x, st.cam.z - z);   // she watches you come
        else y.mesh.rotation.y = Math.atan2(Math.sin(r.h), Math.cos(r.h));
        if (u.head && (y.phase === 'pace' || y.phase === 'stand')) u.head.rotateY(y.phase === 'pace' ? 1.0 : 0);  // turns her head to look in at you
      } else {
        y.mesh.rotation.y = Math.atan2(Math.sin(r.h), Math.cos(r.h));
        if (y.phase === 'pace') y.mesh.rotation.y += 0.5;
        y.mesh.userData.limbs.forEach((l, k) => (l.rotation.x = (k % 2 ? -1 : 1) * (k < 2 ? 1 : -1) * sw * 0.9));
        const fr = y.mesh.userData.frames;
        if (fr) {
          const cx = st.cam.x - x, cz = st.cam.z - z; y.mesh.rotation.y = Math.atan2(cx, cz);
          const fwdRight = Math.sign(Math.sin(r.h) * cz - Math.cos(r.h) * cx) || 1;
          const k = Math.floor(y.t * stride / Math.PI) % 2;
          fr.forEach((m, i) => { m.visible = i === k; m.scale.x = -fwdRight; });
        }
        if (running) y.mesh.position.y += Math.abs(Math.sin(y.t * stride)) * 0.12;
      }
      y.fade += ((y.phase === 'gone' ? 0 : 1) - y.fade) * Math.min(1, dt * 2);
      this.setOpacity(y.mesh, y.fade);
      if (y.fade > 0.3) this.heart = Math.max(this.heart, Math.min(1, 1.1 - Math.abs(y.off) / 60));
      if (!y.seen && y.phase === 'pace') { y.seen = true; this.seenTypes.add('yai'); this.audio.ghostCall?.('yai'); this.audio.sting?.(0.6); }
      if (running && y.phase !== 'gone') this.audio.patter?.(dt, stride, y.off);
      if (y.phase === 'gone' && y.fade < 0.02) this.clearYai();
    }
    // wisps hover over the fields on both sides, a little ahead of the car
    (this.wisps.wmat || this.wisps.material).opacity = this.level * 0.85;
    if (this.level > 0.02) {
      for (let i = 0; i < this.wispSeed.length; i++) {
        const sd = this.wispSeed[i], s = carS + 20 + ((sd * 997 + st.time * 3 * (0.5 + sd)) % 260);
        const r = this.roadAtS(s, this._r), lx = Math.cos(r.h), lz = -Math.sin(r.h), L = (sd < 0.5 ? -1 : 1) * (14 + sd * 60 + Math.sin(st.time * 0.5 + i) * 4);
        const x = r.x + lx * L, z = r.z + lz * L;
        this.wispPos[i * 3] = x; this.wispPos[i * 3 + 1] = this.groundAt(x, z) + 1.2 + Math.sin(st.time * 1.7 + i * 2.1) * 0.6; this.wispPos[i * 3 + 2] = z;
      }
      this.wispGeo.attributes.position.needsUpdate = true;
    }
    // the back-seat passenger: there until you turn round and look at her
    if (this.rider.visible) {
      this.riderT += dt;
      if (night < 0.3) this.rider.visible = false;
      if (lookBack && !this.riderSeen && !this.riderStory) { this.riderSeen = true; this.riderLeft = 0.7; this.audio.ghostCall?.('rider'); this.audio.sting?.(1); this.flash = 0.5; }
      if (this.riderSeen) { this.riderLeft -= dt; this.rider.position.z = -1.1 + (0.7 - this.riderLeft) * 0.9; if (this.riderLeft <= 0) this.rider.visible = false; } // lunges forward, then gone
      else if (!this.riderStory) this.rider.position.z = -1.1;
      if (this.riderT > 70 && !this.riderSeen && !this.riderStory) this.rider.visible = false;
    }
    this.audio.spook?.(this.level);
    this.audio.radioFx?.(dt, Math.max(this.level, this.rider.visible ? 0.85 : 0));
  }
}
export { LEGENDS };
