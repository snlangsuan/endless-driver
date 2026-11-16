// ===== Sky dome, clouds, distant mountain layers, sea =====
import * as THREE from 'three';
import { cloudTextures, overcastTexture } from './models.js';

const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const SKY_FS = `
uniform vec3 top, hor, sunCol, sunDir, duskCol, moonDir;
uniform float night, time, dusk, over;
varying vec3 vDir;
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y), f.z); }
void main(){
  vec3 d = normalize(vDir); float y = d.y; float hy = max(y, 0.0);
  vec3 col = mix(hor, top, pow(smoothstep(0.0, 0.62, hy), 0.62));
  col = mix(col, hor * 1.12, exp(-hy * 22.0) * 0.6);                       // bright haze band on the horizon
  vec2 dh = normalize(d.xz + 1e-5), sh = normalize(sunDir.xz + 1e-5);
  float az = max(dot(dh, sh), 0.0);
  col += duskCol * (pow(az, 3.0) * 0.9 + 0.15) * exp(-hy * 5.0) * dusk;      // sunset glow toward the sun
  col += duskCol * 0.25 * pow(1.0 - az, 2.0) * exp(-hy * 9.0) * dusk * vec3(0.6, 0.5, 1.0); // pinkish anti-twilight
  float sd = max(dot(d, sunDir), 0.0);
  col += sunCol * (pow(sd, 6.0) * 0.18 + pow(sd, 48.0) * 0.5 + pow(sd, 700.0) * 2.5);
  col += sunCol * smoothstep(0.99955, 0.9997, sd) * 30.0 * (1.0 - over);   // HDR sun disk (blooms)
  if (night > 0.01) {
    vec3 p = d * 140.0; vec3 c = floor(p); vec3 f = fract(p) - 0.5; float h = h3(c);
    vec3 off = vec3(h3(c + 1.3), h3(c + 2.7), h3(c + 5.1)) - 0.5;
    float st = smoothstep(0.11, 0.0, length(f - off * 0.6)) * step(0.982, h) * (0.4 + 1.6 * h3(c + 9.1));
    float tw = 0.65 + 0.35 * sin(time * 3.0 + h * 80.0);
    vec3 band = normalize(vec3(0.35, 0.55, 0.75));
    float mw = exp(-pow(dot(d, band) * 4.5, 2.0)) * smoothstep(0.35, 0.75, n3(d * 6.0) * 0.6 + n3(d * 15.0) * 0.4);
    vec3 starCol = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.7), h3(c + 3.3));
    col += (starCol * st * tw * 3.0 + vec3(0.3, 0.32, 0.45) * mw * 0.35) * night * smoothstep(-0.02, 0.25, y) * (1.0 - over);
    float md = dot(d, moonDir);
    float disk = smoothstep(0.99962, 0.9998, md);
    float crater = 0.85 + 0.15 * n3(d * 900.0);
    col += vec3(1.0, 0.97, 0.9) * disk * 3.0 * crater * night * (1.0 - over * 0.8);
    col += vec3(0.5, 0.6, 0.8) * pow(max(md, 0.0), 300.0) * 0.25 * night;
  }
  if (y < 0.0) col = mix(col, hor * 0.75, smoothstep(0.0, -0.2, y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SEA_VS = `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;
const SEA_FS = `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform vec3 top, hor, sunCol, sunDir, deep, shallow;
uniform float time, day;
varying vec3 vWorld;
vec2 wave(vec2 p, vec2 dir, float f, float sp, float a){ float ph = dot(p, dir) * f + time * sp; return dir * cos(ph) * a * f; }
void main(){
  #include <logdepthbuf_fragment>
  vec2 p = vWorld.xz;
  vec2 g = wave(p, normalize(vec2(1.0, 0.3)), 0.06, 1.1, 0.5) + wave(p, normalize(vec2(-0.4, 1.0)), 0.11, 1.6, 0.25)
         + wave(p, normalize(vec2(0.7, -0.8)), 0.31, 2.4, 0.08) + wave(p, normalize(vec2(-0.9, -0.2)), 0.73, 3.3, 0.03)
         + wave(p, normalize(vec2(0.2, 0.95)), 1.7, 4.1, 0.012);
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  vec3 refl = mix(hor, top, pow(smoothstep(0.0, 0.6, R.y), 0.7));
  vec3 water = mix(deep, shallow, 0.25 + 0.25 * N.x);
  vec3 col = mix(water * (0.1 + 0.9 * day), refl, fres);
  float sp = pow(max(dot(R, sunDir), 0.0), 380.0);
  col += sunCol * sp * 12.0 + sunCol * pow(max(dot(R, sunDir), 0.0), 40.0) * 0.12;
  gl_FragColor = vec4(col, 0.94);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

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

const RING_VS = `varying vec2 vUv;
#include <common>
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FS = `uniform sampler2D tA, tB; uniform float mixT, haze, opacity, rep, off; uniform vec3 hor, light;
varying vec2 vUv;
void main(){
  vec2 uv = vec2(vUv.x * rep + off, vUv.y);
  vec4 a = texture2D(tA, uv), b = texture2D(tB, uv);
  vec4 c = mix(a, b, mixT);
  c.rgb = mix(c.rgb * light, hor, haze);
  gl_FragColor = vec4(c.rgb, c.a * opacity);
  if (gl_FragColor.a < 0.01) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export const REGION_PANO = { rice: 'mountains_green', town: 'mountains_green', coast: 'islands', meadow: 'mountains_green', autumn: 'mountains_green', forest: 'mountains_green', winter: 'mountains_snow', desert: 'mountains_desert' };

export class Sky {
  constructor(scene) {
    this.u = {
      top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
      moonDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, duskCol: { value: new THREE.Color() },
      night: { value: 0 }, time: { value: 0 }, dusk: { value: 0 }, over: { value: 0 },
    };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(4500, 48, 24), new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    }));
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
    this.seaU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() },
      deep: { value: new THREE.Color().setRGB(0.02, 0.16, 0.22, THREE.SRGBColorSpace) }, shallow: { value: new THREE.Color().setRGB(0.1, 0.42, 0.45, THREE.SRGBColorSpace) },
      time: { value: 0 }, day: { value: 1 },
    }]);
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.ShaderMaterial({
      uniforms: this.seaU, vertexShader: SEA_VS, fragmentShader: SEA_FS, fog: true, transparent: true,
    }));
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
      const mat = new THREE.ShaderMaterial({
        uniforms: { tA: { value: any }, tB: { value: any }, mixT: { value: 0 }, haze: { value: 0 }, opacity: { value: 1 }, rep: { value: 4 + r.i * 2 }, off: { value: r.i * 0.37 }, hor: { value: new THREE.Color() }, light: { value: new THREE.Color(1, 1, 1) } },
        vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
      });
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
        const U = r.mesh.material.uniforms;
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
