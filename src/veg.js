// ===== Near-road grass & flowers, fireflies, birds =====
import * as THREE from 'three';
import { GPU, glowDef, glowPoints } from './gpu.js';
import { road, SP, ROAD_HALF, ensureS, roadAtZ, blendParams, heightCore, hash2, vnoise, sstep } from './world.js';
import { buildGrassGeos, makeTintMat } from './models.js';
import { buildProcGrass, grassMaterial } from './procgen.js';

const FLOWER_COLS = [[1, 0.3, 0.45], [1, 0.85, 0.2], [1, 1, 1], [0.75, 0.45, 1], [1, 0.55, 0.15]];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Vegetation {
  constructor(scene) {
    this.scene = scene;
    this.geo = buildGrassGeos();
    this.mat = makeTintMat({ swayBase: 0, swayAmp: 0.16, flat: false, side: THREE.DoubleSide });
    this.gmat = this.mat;
    if (GPU) { this.geo.grass = buildProcGrass(); this.gmat = grassMaterial(); }   // WebGPU: curved blades, coloured root to tip
    this.chunks = new Map();
    this.density = 1;
  }
  build(ci) {
    const CH = 100, i0 = ci * CH, i1 = i0 + CH;
    ensureS(i1 * SP + 4);
    const grass = [], flowers = [];
    const r = {}, p = {};
    const per = Math.round(100 * this.density * (GPU ? 2.2 : 1));
    for (let i = i0; i < i1; i++) {
      const h = road.h[i], lx = Math.cos(h), lz = -Math.sin(h), fx = Math.sin(h), fz = Math.cos(h);
      blendParams(i * SP, p);
      const den = p.grassDen;
      if (den < 0.02) continue;
      for (let k = 0; k < per; k++) {
        const u1 = hash2(i * 131 + k, 7), u2 = hash2(i * 17 + k * 3, 11), u3 = hash2(k * 7 + i, i * 3 + 1);
        const side = u1 < 0.5 ? -1 : 1;
        const L = side * (ROAD_HALF + 1.4 + Math.pow(u2, 1.6) * 85);
        const along = (u3 - 0.5) * SP;
        const x = road.x[i] + lx * L + fx * along, z = road.z[i] + lz * L + fz * along;
        const patch = 0.5 + 0.5 * vnoise(x * 0.045, z * 0.045);
        if (hash2(i + k * 977, k) > den * (0.25 + 0.95 * patch) * (1 - Math.abs(L) / 95)) continue;
        roadAtZ(z, r);
        const y = heightCore(x, z, r, p);
        if (y < 0.4) continue;
        const sc = 0.65 + hash2(k, i) * 0.65;
        const isFlower = p.flowers > 0.3 && hash2(i * 3, k * 5) < (0.12 + 0.3 * patch) * p.flowers;
        const v = 0.78 + 0.4 * hash2(k * 9, i) * (0.6 + 0.4 * patch);
        const gc = p.grassCol;
        // dry/green variation
        const dry = sstep(0.55, 0.95, hash2(i * 5 + k, 3));
        const col = [gc[0] * v * (1 + dry * 0.25), gc[1] * v * (1 - dry * 0.05), gc[2] * v * (1 - dry * 0.3)];
        const item = [x, y - 0.05, z, hash2(i, k) * 6.28, sc, isFlower ? FLOWER_COLS[Math.floor(hash2(k, i * 7) * FLOWER_COLS.length)] : col];
        (isFlower ? flowers : grass).push(item);
      }
    }
    const grp = new THREE.Group();
    const ox = road.x[i0], oz = road.z[i0];
    grp.position.set(ox, 0, oz);
    const mk = (geo, list) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, geo === this.geo.grass ? this.gmat : this.mat, list.length);
      list.forEach((it, n) => {
        _m.compose(_v.set(it[0] - ox, it[1], it[2] - oz), _q.setFromEuler(_e.set(0, it[3], 0)), _s.set(it[4], it[4] * (0.8 + (n % 5) * 0.1), it[4]));
        im.setMatrixAt(n, _m);
        im.setColorAt(n, _c.setRGB(it[5][0], it[5][1], it[5][2], THREE.SRGBColorSpace));
      });
      im.computeBoundingSphere(); im.receiveShadow = true;
      grp.add(im);
    };
    mk(this.geo.grass, grass); mk(this.geo.flower, flowers);
    this.scene.add(grp);
    return grp;
  }
  update(carS) {
    const c0 = Math.max(0, Math.floor((carS - 150) / 200)), c1 = Math.floor((carS + 420) / 200);
    for (const [k, g] of this.chunks) if (k < c0 || k > c1) { this.dispose(g); this.chunks.delete(k); }
    let built = 0;
    for (let c = c0; c <= c1; c++) if (!this.chunks.has(c) && built < 1) { this.chunks.set(c, this.build(c)); built++; }
  }
  clear() { for (const [, g] of this.chunks) this.dispose(g); this.chunks.clear(); }
  dispose(g) { this.scene.remove(g); g.traverse((o) => o.isInstancedMesh && o.dispose()); }
}

// Fireflies near the ground at night
export class Fireflies {
  constructor(scene, tex) {
    this.n = 260;
    this.pos = new Float32Array(this.n * 3); this.col = new Float32Array(this.n * 3); this.base = [];
    for (let i = 0; i < this.n; i++) this.base.push([(Math.random() - 0.5) * 90, Math.random() * 3 + 0.3, (Math.random() - 0.5) * 90, Math.random() * 10, 0.5 + Math.random()]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const pm = { map: tex, size: 0.35, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
    this.pts = GPU ? glowPoints(g, glowDef(pm)) : new THREE.Points(g, new THREE.PointsMaterial(pm));
    this.geo = g;
    this.pts.frustumCulled = false; scene.add(this.pts);
    this.anchor = new THREE.Vector3();
  }
  update(t, cam, groundY, amount) {
    this.pts.visible = amount > 0.02;
    if (!this.pts.visible) return;
    // anchor drifts in steps so fireflies stay put in the world while driving
    if (Math.abs(cam.x - this.anchor.x) > 45 || Math.abs(cam.z - this.anchor.z) > 45) this.anchor.set(cam.x, 0, cam.z);
    for (let i = 0; i < this.n; i++) {
      const b = this.base[i];
      let x = b[0] + Math.sin(t * 0.3 * b[4] + b[3]) * 2 + this.anchor.x, z = b[2] + Math.cos(t * 0.25 * b[4] + b[3]) * 2 + this.anchor.z;
      const dx = x - cam.x, dz = z - cam.z;
      if (dx > 45) x -= 90; else if (dx < -45) x += 90;
      if (dz > 45) z -= 90; else if (dz < -45) z += 90;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = groundY + b[1] + Math.sin(t * 0.7 + b[3]) * 0.4; this.pos[i * 3 + 2] = z;
      const blink = Math.max(0, Math.sin(t * 1.3 * b[4] + b[3] * 3)) ** 3 * amount * 3;
      this.col[i * 3] = 0.7 * blink; this.col[i * 3 + 1] = 1.0 * blink; this.col[i * 3 + 2] = 0.25 * blink;
    }
    const a = this.geo.attributes; a.position.needsUpdate = true; a.color.needsUpdate = true;
  }
}

// A small flock of birds crossing the sky now and then
export class Birds {
  constructor(scene) {
    this.n = 9;
    this.arr = new Float32Array(this.n * 4 * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.arr, 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1a1a1e }));
    this.lines.frustumCulled = false; scene.add(this.lines);
    this.timer = 6; this.active = false;
  }
  update(dt, t, cam, carYaw, ok) {
    this.timer -= dt;
    if (!this.active && this.timer < 0 && ok) {
      this.active = true; this.life = 26;
      const side = Math.random() < 0.5 ? 1 : -1, ahead = 90 + Math.random() * 90;
      const fx = Math.sin(carYaw), fz = Math.cos(carYaw), sx = Math.cos(carYaw), sz = -Math.sin(carYaw);
      this.o = new THREE.Vector3(cam.x + fx * ahead + sx * side * 140, cam.y + 30 + Math.random() * 30, cam.z + fz * ahead + sz * side * 140);
      this.v = new THREE.Vector3(-sx * side * 9 + fx * 4, 0.3, -sz * side * 9 + fz * 4);
      this.off = []; for (let i = 0; i < this.n; i++) { const r = Math.ceil(i / 2) * (i % 2 ? 1 : -1); this.off.push([r * 2.2, Math.random() * 0.8, -Math.abs(r) * 2.5, Math.random() * 6]); }
    }
    this.lines.visible = this.active;
    if (!this.active) return;
    this.life -= dt; if (this.life < 0) { this.active = false; this.timer = 25 + Math.random() * 40; return; }
    this.o.addScaledVector(this.v, dt);
    const h = Math.atan2(this.v.x, this.v.z), cx = Math.cos(h), cz = -Math.sin(h), fx = Math.sin(h), fz = Math.cos(h);
    for (let i = 0; i < this.n; i++) {
      const [a, b, c, ph] = this.off[i];
      const px = this.o.x + cx * a + fx * c, py = this.o.y + b, pz = this.o.z + cz * a + fz * c;
      const flap = Math.sin(t * 9 + ph) * 0.45, span = 0.9;
      const k = i * 12;
      this.arr.set([px - cx * span, py + flap, pz - cz * span, px, py, pz, px, py, pz, px + cx * span, py + flap, pz + cz * span], k);
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
