// ===== Sky dome, clouds, distant mountain layers, sea: WebGPU build (TSL node materials; same look as sky.js) =====
import * as THREE from 'three';
import { cloudTextures, overcastTexture } from './models.js';
import { h3, n3 } from './gpu.js';
const T = THREE;

function skyMaterial(u) {
  const m = new T.MeshBasicNodeMaterial({ side: T.BackSide, depthWrite: false, depthTest: false, fog: false });
  m.colorNode = T.Fn(() => {
    const d = T.positionLocal.normalize(), y = d.y, hy = T.max(y, 0);
    const col = T.mix(u.hor, u.top, T.pow(T.smoothstep(0, 0.62, hy), 0.62)).toVar();
    col.assign(T.mix(col, u.hor.mul(1.12), T.exp(hy.mul(-22)).mul(0.6)));                         // bright haze band on the horizon
    const dh = T.normalize(d.xz.add(1e-5)), sh = T.normalize(u.sunDir.xz.add(1e-5));
    const az = T.max(T.dot(dh, sh), 0);
    col.addAssign(u.duskCol.mul(T.pow(az, 3).mul(0.9).add(0.15)).mul(T.exp(hy.mul(-5))).mul(u.dusk));
    col.addAssign(u.duskCol.mul(0.25).mul(T.pow(az.oneMinus(), 2)).mul(T.exp(hy.mul(-9))).mul(u.dusk).mul(T.vec3(0.6, 0.5, 1)));
    const sd = T.max(T.dot(d, u.sunDir), 0);
    col.addAssign(u.sunCol.mul(T.pow(sd, 6).mul(0.18).add(T.pow(sd, 48).mul(0.5)).add(T.pow(sd, 700).mul(2.5))));
    col.addAssign(u.sunCol.mul(T.smoothstep(0.99955, 0.9997, sd)).mul(30).mul(u.over.oneMinus()));   // HDR sun disk (blooms)
    T.If(u.night.greaterThan(0.01), () => {
      const p = d.mul(140), c = T.floor(p), f = T.fract(p).sub(0.5), h = h3(c);
      const off = T.vec3(h3(c.add(1.3)), h3(c.add(2.7)), h3(c.add(5.1))).sub(0.5);
      const st = T.smoothstep(0, 0.11, T.length(f.sub(off.mul(0.6)))).oneMinus().mul(T.step(0.982, h)).mul(h3(c.add(9.1)).mul(1.6).add(0.4));
      const tw = T.sin(u.time.mul(3).add(h.mul(80))).mul(0.35).add(0.65);
      const band = T.vec3(0.35, 0.55, 0.75).normalize();
      const mw = T.exp(T.pow(T.dot(d, band).mul(4.5), 2).negate()).mul(T.smoothstep(0.35, 0.75, n3(d.mul(6)).mul(0.6).add(n3(d.mul(15)).mul(0.4))));
      const starCol = T.mix(T.vec3(0.75, 0.85, 1), T.vec3(1, 0.85, 0.7), h3(c.add(3.3)));
      col.addAssign(starCol.mul(st).mul(tw).mul(3).add(T.vec3(0.3, 0.32, 0.45).mul(mw).mul(0.35)).mul(u.night).mul(T.smoothstep(-0.02, 0.25, y)).mul(u.over.oneMinus()));
      const md = T.dot(d, u.moonDir), disk = T.smoothstep(0.99962, 0.9998, md), crater = n3(d.mul(900)).mul(0.15).add(0.85);
      col.addAssign(T.vec3(1, 0.97, 0.9).mul(disk).mul(3).mul(crater).mul(u.night).mul(u.over.mul(0.8).oneMinus()));
      col.addAssign(T.vec3(0.5, 0.6, 0.8).mul(T.pow(T.max(md, 0), 300)).mul(0.25).mul(u.night));
    });
    col.assign(T.mix(col, u.hor.mul(0.75), T.smoothstep(-0.2, 0, y).oneMinus()));
    return col;
  })();
  return m;
}

function seaMaterial(s) {
  const m = new T.MeshBasicNodeMaterial({ transparent: true, fog: true });
  const wave = (p, dx, dz, f, sp, a) => { const dir = T.vec2(dx, dz).normalize(); return dir.mul(T.cos(T.dot(p, dir).mul(f).add(s.time.mul(sp)))).mul(a * f); };
  m.colorNode = T.Fn(() => {
    const W = T.positionWorld, p = W.xz;
    const g = wave(p, 1, 0.3, 0.06, 1.1, 0.5).add(wave(p, -0.4, 1, 0.11, 1.6, 0.25)).add(wave(p, 0.7, -0.8, 0.31, 2.4, 0.08)).add(wave(p, -0.9, -0.2, 0.73, 3.3, 0.03)).add(wave(p, 0.2, 0.95, 1.7, 4.1, 0.012));
    const N = T.vec3(g.x.negate(), 1, g.y.negate()).normalize();
    const V = T.cameraPosition.sub(W).normalize();
    const fres = T.pow(T.max(T.dot(N, V), 0).oneMinus(), 5).mul(0.98).add(0.02);
    const R0 = T.reflect(V.negate(), N), R = T.vec3(R0.x, R0.y.abs(), R0.z);
    const refl = T.mix(s.hor, s.top, T.pow(T.smoothstep(0, 0.6, R.y), 0.7));
    const water = T.mix(s.deep, s.shallow, N.x.mul(0.25).add(0.25));
    const col = T.mix(water.mul(s.day.mul(0.9).add(0.1)), refl, fres).toVar();
    const rd = T.max(T.dot(R, s.sunDir), 0);
    col.addAssign(s.sunCol.mul(T.pow(rd, 380)).mul(12).add(s.sunCol.mul(T.pow(rd, 40)).mul(0.12)));
    return T.vec4(col, 0.94);
  })();
  m.opacityNode = T.float(0.94);
  return m;
}

function ringMaterial(tex, rep, off) {
  const m = new T.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: T.BackSide, fog: false, alphaTest: 0.01 });
  const uvn = T.vec2(T.uv().x.mul(rep).add(off), T.uv().y);
  const U = { tA: T.texture(tex, uvn), tB: T.texture(tex, uvn), mixT: T.uniform(0), haze: T.uniform(0), opacity: T.uniform(1), hor: T.uniform(new T.Color()), light: T.uniform(new T.Color(1, 1, 1)) };
  const c = T.mix(U.tA, U.tB, U.mixT);
  m.colorNode = T.vec4(T.mix(c.rgb.mul(U.light), U.hor, U.haze), c.a.mul(U.opacity));
  m.opacityNode = c.a.mul(U.opacity);
  m.userData.U = U;
  return m;
}

function ringTexture(seed, roughness) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 256; const g = c.getContext('2d');
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const ph = [r() * 9, r() * 9, r() * 9, r() * 9];
  const H = (x) => {
    const u = x / 2048 * Math.PI * 2;
    let h = 0.5 + 0.28 * Math.sin(u * 3 + ph[0]) + 0.16 * Math.sin(u * 7 + ph[1]) + 0.1 * Math.sin(u * 13 + ph[2]) * roughness + 0.06 * Math.sin(u * 29 + ph[3]) * roughness;
    h += (Math.abs(Math.sin(u * 47 + ph[1])) - 0.5) * 0.05 * roughness;
    return Math.max(0.12, h);
  };
  // body
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgb(255,255,255)'); grd.addColorStop(1, 'rgb(205,210,220)');
  g.fillStyle = grd; g.beginPath(); g.moveTo(0, 256);
  for (let x = 0; x <= 2048; x += 4) g.lineTo(x, 256 - H(x) * 220);
  g.lineTo(2048, 256); g.fill();
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


export const REGION_PANO = { rice: 'mountains_green', town: 'mountains_green', coast: 'islands', meadow: 'mountains_green', autumn: 'mountains_green', forest: 'mountains_green', winter: 'mountains_snow', desert: 'mountains_desert' };

export class Sky {
  constructor(scene) {
    this.u = {
      top: T.uniform(new THREE.Color()), hor: T.uniform(new THREE.Color()), sunDir: T.uniform(new THREE.Vector3(0, 1, 0)),
      moonDir: T.uniform(new THREE.Vector3(0, 1, 0)), sunCol: T.uniform(new THREE.Color()), duskCol: T.uniform(new THREE.Color()),
      night: T.uniform(0), time: T.uniform(0), dusk: T.uniform(0), over: T.uniform(0),
    };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(4500, 48, 24), skyMaterial(this.u));
    this.dome.renderOrder = -20; this.dome.frustumCulled = false; scene.add(this.dome);

    // distant mountain layers (beyond fog)
    this.rings = [];
    [[2600, 0.35, 11, 1.0], [3200, 0.22, 29, 0.8], [3900, 0.12, 53, 0.6]].forEach(([rad, , seed, rough], i) => {
      const m = new THREE.MeshBasicMaterial({ map: ringTexture(seed, rough), transparent: true, fog: false, depthWrite: false, side: THREE.BackSide, alphaTest: 0.02 });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, rad * 0.16, 96, 1, true), m);
      mesh.renderOrder = -17 + (2 - i); mesh.frustumCulled = false; mesh.rotation.y = i * 1.7;
      scene.add(mesh); this.rings.push({ mesh, rad, i });
    });
    this.rings.reverse(); // far first

    // clouds
    const texs = cloudTextures(5);
    this.clouds = [];
    for (let i = 0; i < 46; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texs[i % texs.length], transparent: true, fog: false, depthWrite: false, opacity: 0.9 }));
      const s = 260 + Math.random() * 520; sp.scale.set(s, s * 0.5, 1);
      sp.userData = { ox: (Math.random() - 0.5) * 4200, oz: (Math.random() - 0.5) * 4200, y: 300 + Math.random() * 300, sp: 2 + Math.random() * 3 };
      sp.renderOrder = -10; scene.add(sp); this.clouds.push(sp);
    }
    const ot = overcastTexture(); ot.repeat.set(4, 4);
    this.overcast = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshBasicMaterial({ map: ot, transparent: true, fog: false, depthWrite: false, opacity: 0, side: THREE.DoubleSide }));
    this.overcast.rotation.x = Math.PI / 2; this.overcast.renderOrder = -9; scene.add(this.overcast);

    // sea
    this.seaU = {
      top: T.uniform(new THREE.Color()), hor: T.uniform(new THREE.Color()), sunCol: T.uniform(new THREE.Color()), sunDir: T.uniform(new THREE.Vector3()),
      deep: T.uniform(new THREE.Color().setRGB(0.02, 0.16, 0.22, THREE.SRGBColorSpace)), shallow: T.uniform(new THREE.Color().setRGB(0.1, 0.42, 0.45, THREE.SRGBColorSpace)),
      time: T.uniform(0), day: T.uniform(1),
    };
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), seaMaterial(this.seaU));
    this.sea.rotation.x = -Math.PI / 2; this.sea.receiveShadow = false; scene.add(this.sea);
    this._c = new THREE.Color(); this._c2 = new THREE.Color();
  }
  // replace procedural mountain layers with generated panoramas (one texture per landscape type)
  setPanos(texs) {
    this.panos = texs;
    const any = Object.values(texs)[0];
    this.rings.forEach((r) => {
      r.rad = [1500, 2100, 2800][r.i];
      const geo = new THREE.CylinderGeometry(r.rad, r.rad, r.rad * 0.3, 128, 1, true);
      const mat = ringMaterial(any, 4 + r.i * 2, r.i * 0.37);
      r.mesh.geometry.dispose(); r.mesh.geometry = geo; r.mesh.material = mat; r.pano = true;
    });
  }
  setClouds(texs) {
    if (!texs.length) return;
    this.clouds.forEach((c, i) => {
      const t = texs[i % texs.length]; c.material.map = t; c.material.needsUpdate = true;
      const w = 300 + Math.random() * 600; c.scale.set(w, w * t.image.height / t.image.width, 1);
    });
  }
  update(e) {
    const u = this.u;
    u.top.value.copy(e.top); u.hor.value.copy(e.hor); u.sunDir.value.copy(e.sunDir); u.moonDir.value.copy(e.moonDir);
    u.sunCol.value.copy(e.sunCol); u.duskCol.value.copy(e.duskCol); u.night.value = e.night; u.time.value = e.time; u.dusk.value = e.dusk; u.over.value = e.over;
    const cam = e.cam;
    this.dome.position.copy(cam);
    // mountain layers: nearer = darker, more of the land colour; farther = closer to the horizon colour
    const mixes = [0.18, 0.32, 0.5];
    if (this.panos) {
      const hz = [0.12, 0.32, 0.52];
      const pa = this.panos[REGION_PANO[e.regA]] , pb = this.panos[REGION_PANO[e.regB]];
      for (const r of this.rings) {
        const U = r.mesh.material.userData.U;
        const sy = 0.55 + 0.7 * e.mount; r.mesh.scale.y = sy;
        r.mesh.position.set(cam.x, e.groundY + r.rad * 0.3 * sy * 0.35, cam.z); // bottom edge ~15% below the road level
        U.tA.value = pa || U.tA.value; U.tB.value = pb || U.tB.value; U.mixT.value = e.regT;
        U.hor.value.copy(e.hor);
        U.haze.value = Math.min(1, hz[r.i] + e.over * 0.55 + (1 - e.day) * 0.15);
        U.light.value.setRGB(1, 1, 1).lerp(e.duskCloud, e.dusk * 0.35).multiplyScalar(0.06 + 0.94 * e.day);
        U.opacity.value = (1 - e.over * 0.6) * (1 - (e.fog || 0));
      }
    }
    for (const r of this.rings) {
      if (r.pano) continue;
      r.mesh.position.set(cam.x, e.groundY - r.rad * 0.02 + (1 - e.mount) * -r.rad * 0.04, cam.z);
      r.mesh.scale.y = 0.45 + e.mount * 0.75 * (1 - e.coast * 0.4);
      this._c.copy(e.hor).lerp(e.land, mixes[r.i] * (0.4 + 0.6 * e.day) * (1 - e.over * 0.7));
      if (e.snow > 0) this._c.lerp(this._c2.copy(e.hor).multiplyScalar(1.1), e.snow * 0.35);
      r.mesh.material.color.copy(this._c);
      r.mesh.material.opacity = (1 - e.over * 0.85) * (1 - (e.fog || 0));
    }
    // clouds: lit colour (sun-tinted), darker at night
    const lit = this._c.setRGB(1, 1, 1, THREE.SRGBColorSpace).lerp(e.duskCloud, e.dusk * 0.75).multiplyScalar(0.06 + 0.94 * e.day);
    lit.lerp(this._c2.copy(e.hor).multiplyScalar(0.9), e.over * 0.6);
    for (const c of this.clouds) {
      const d = c.userData;
      d.ox += e.dt * d.sp;
      const x = (((d.ox - cam.x) % 4200) + 6300) % 4200 - 2100 + cam.x, z = (((d.oz - cam.z) % 4200) + 6300) % 4200 - 2100 + cam.z;
      c.position.set(x, d.y + e.groundY, z);
      c.material.color.copy(lit);
      const dist = Math.hypot(x - cam.x, z - cam.z);
      c.material.opacity = (0.75 + 0.25 * e.over) * Math.max(0, Math.min(1, (2000 - dist) / 500)) * (0.55 + 0.45 * e.cloudiness) * (1 - (e.fog || 0) * 0.95);
      c.visible = c.material.opacity > 0.01;
    }
    this.overcast.position.set(cam.x, e.groundY + 260, cam.z);
    this.overcast.material.color.copy(e.hor).multiplyScalar(0.92);
    this.overcast.material.opacity = e.over * 0.95;
    this.overcast.material.map.offset.x += e.dt * 0.002;
    // sea
    const s = this.seaU;
    s.top.value.copy(e.top); s.hor.value.copy(e.hor); s.sunCol.value.copy(e.sunCol); s.sunDir.value.copy(e.sunDir.y > -0.05 ? e.sunDir : e.moonDir);
    if (e.sunDir.y < -0.05) s.sunCol.value.setRGB(0.4, 0.45, 0.55).multiplyScalar(e.night * 0.6);
    s.time.value = e.time; s.day.value = e.day;
    this.sea.position.set(cam.x, 0, cam.z);
  }
}
