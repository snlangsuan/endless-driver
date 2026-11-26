// Vertex stages, shared by the picture and by the shadow map (which uses the light's matrix as vp).
struct TO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) w: f32, @location(3) rel: vec3f };
@vertex fn vsTerrain(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) w: f32) -> TO { var o: TO; o.wp = p; o.n = n; o.w = w; o.rel = p - g.cam.xyz; o.cp = g.vp * vec4f(o.rel, 1.); return o; }
@vertex fn vsLeaf(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f) -> LO { return leafV(vi, a, b, c); }
// The leaves or grass of a chunk as the graphics card culled them (cull.wgsl): cIdx lists the instances still in view, each the place of its
// twelve numbers in cInst - the chunk's own leaf or grass buffer, read here as storage.
@group(1) @binding(0) var<storage, read> cInst: array<vec4f>;
@group(1) @binding(1) var<storage, read> cIdx: array<u32>;
@vertex fn vsLeafC(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> LO { let j = cIdx[ii] * 3u; return leafV(vi, cInst[j], cInst[j + 1u], cInst[j + 2u]); }
struct XO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f, @location(3) @interpolate(flat) ln: vec3f, @location(4) @interpolate(flat) m: vec4f };
// a box (walls, floors, roof sheets, posts): a centre + turn about the vertical, b size + tilt about its long axis, c material + seed
@vertex fn vsBox(@location(0) v: vec3f, @location(1) nv: vec3f, @location(2) a: vec4f, @location(3) b: vec4f, @location(4) c: vec4f) -> XO {
  var o: XO; var vv = v; var nn = nv;
  if (c.w > .5 && c.w < 1.5) {                      // a gable: the top edge is pulled in to a ridge along x
    if (v.y > 0.) { vv.z = 0.; }
    if (abs(nv.z) > .5) { nn = normalize(vec3f(0., b.z * .5, sign(nv.z) * b.y)); }
  }
  var l = vv * b.xyz;
  if (c.x > 37.5 && c.x < 38.5) {                   // a flag is cloth: it is made of narrow upright strips (the seed says how far each is from the pole), and here a wave
    let d = c.y + l.x; let W = g.misc.y; let t = g.cam.w; let gs = gust(a.xz);      // runs out along them from the pole, bigger toward the free end and with the wind; in a calm the cloth hangs
    let wg = W * (.5 + gs); let fly_ = ss(.35, 1.2, wg); let calm = 1. - fly_;      // with no wind to speak of the flag does not fly at all: it hangs down beside the pole
    l.z += fly_ * (d * (.05 + .06 * min(wg, 3.)) * sin(t * (3.5 + 3. * W) - d * 3.6 + a.x) + d * d * .035 * sin(t * 2.3 - d * 1.9 + a.z)) + calm * d * .03 * sin(t * .9 + d * 2.);
    l.x -= d * .82 * calm; l.y -= d * (.80 * calm + .06 * d * fly_ * max(0., 1.4 - wg));
  }
  let ct = cos(b.w); let st = sin(b.w);
  l = vec3f(l.x, l.y * ct - l.z * st, l.y * st + l.z * ct); var n = vec3f(nn.x, nn.y * ct - nn.z * st, nn.y * st + nn.z * ct);
  let cy = cos(a.w); let sy = sin(a.w);
  var lo = vec3f(l.x * cy + l.z * sy, l.y, -l.x * sy + l.z * cy);
  if (c.x > 37.5 && c.x < 38.5) {                   // a flag streams the way the wind blows (the same way the trees lean), whichever way its pole's bracket was turned:
    let wd = vec3f(.824, 0., .566);                 // so two flags on opposite sides of a street fly the same way
    lo = vec3f(cy, 0., -sy) * (-c.y) + wd * (c.y + l.x) + vec3f(0., l.y, 0.) + vec3f(-wd.z, 0., wd.x) * l.z;
  }
  let w0 = lo + a.xyz;
  var wf = w0; if (c.w > 1.5 && c.w < 2.5) { let t = g.cam.w; wf.y += .10 * sin(w0.x * .42 + w0.z * .17 + t * 1.3) + .07 * sin(w0.z * .5 - w0.x * .2 + t * .9); }      // afloat: rides the swell
  let w = wf; o.wp = w; o.n = vec3f(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy); o.lp = vv * b.xyz; o.ln = nv; o.m = c;
  // Places far from the origin are drawn from where they stand relative to the eye, not from their world position: 40 km out a world
  // coordinate is only good to 4 mm, and every corner of every box would jitter from frame to frame.
  o.cp = g.vp * vec4f(lo + (a.xyz - g.cam.xyz) + vec3f(0., wf.y - w0.y, 0.), 1.);
  return o;
}
struct CO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f, @location(3) @interpolate(flat) m: f32 };
@vertex fn vsCar(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f, @location(3) m: f32) -> CO { var o: CO; o.wp = p; o.n = n; o.lp = lp; o.m = m; o.cp = g.vp * vec4f(p - g.cam.xyz, 1.); return o; }
// A sculpted thing (a temple's image): a mesh of its own, each vertex a place, a normal and a material (as the made tubes number them: 6 whitewash, 7 gilding). Painted by fsBranch.
@vertex fn vsMesh(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) m: f32) -> BO { var o: BO; o.wp = p; o.n = n; o.uv = vec2f(p.x + p.z, p.y); o.m = m + 1.; o.cp = g.vp * vec4f(p - g.cam.xyz, 1.); return o; }
@vertex fn vsBranch(@location(0) v: vec3f, @location(1) p0: vec4f, @location(2) p1: vec4f, @location(3) h: vec2f) -> BO { return branchV(v, p0, p1, h); }
// ---- the player's car (playercar.js): its place relative to the eye (hi - eye + lo: its whole metres and the rest apart, for precision),
// heading (hi.w) and pitch (lo.w); wh: x the wheels' turn as they roll, y the front wheels' steer, z the brake lamps, w the body's lean on its
// springs; hub: each wheel's hub (and hub[0].w the body's nose dip, hub[1].w its rise and fall on the road, hub[2].w the sideways tilt of the surface it stands on).
// (pc, fl: the paint's colour and that of the light its flakes give back, linear - each car its own)
struct PcU { hi: vec4f, lo: vec4f, wh: vec4f, hub: array<vec4f, 4>, pc: vec4f, fl: vec4f };
@group(1) @binding(0) var<uniform> pu: PcU;
// (uv: the place on the model's textures; tl: the layers of the texture array to take the colour and the normal from, 255 for none)
struct PcO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) c: vec4f, @location(3) @interpolate(flat) k: u32, @location(4) lp: vec3f, @location(5) uv: vec2f, @location(6) @interpolate(flat) tl: vec2u };
@vertex fn vsPc(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) c: vec4f, @location(3) k: vec4u, @location(4) uv: vec2f) -> PcO {
  var q = p; var m = n; let w = k.y;
  if (w > 0u) {
    // (wheel 1-4 rolls; 5-8 is a part of wheel 1-4 that only steers with it - a brake calliper)
    let wi = (w - 1u) % 4u; let h = pu.hub[wi].xyz; var d = q - h; var dn = m;
    if (w <= 4u) { let ca = cos(pu.wh.x); let sa = sin(pu.wh.x);
      d = vec3f(d.x, d.y * ca - d.z * sa, d.y * sa + d.z * ca); dn = vec3f(dn.x, dn.y * ca - dn.z * sa, dn.y * sa + dn.z * ca); }
    if (wi < 2u) { let cs = cos(pu.wh.y); let sn = sin(pu.wh.y); d = vec3f(d.x * cs + d.z * sn, d.y, -d.x * sn + d.z * cs); dn = vec3f(dn.x * cs + dn.z * sn, dn.y, -dn.x * sn + dn.z * cs); }
    q = h + d; m = dn;
  } else {
    // (the body, not the wheels: leaned and dipped about a point between the axles at about the height of its springs)
    let pv = vec3f(0., .45, 0.); var d = q - pv; var dn = m; let cr = cos(pu.wh.w); let sr = sin(pu.wh.w);
    d = vec3f(d.x * cr - d.y * sr, d.x * sr + d.y * cr, d.z); dn = vec3f(dn.x * cr - dn.y * sr, dn.x * sr + dn.y * cr, dn.z);
    let cd = cos(pu.hub[0].w); let sd = sin(pu.hub[0].w); d = vec3f(d.x, d.y * cd + d.z * sd, d.z * cd - d.y * sd); dn = vec3f(dn.x, dn.y * cd + dn.z * sd, dn.z * cd - dn.y * sd);
    q = pv + d + vec3f(0., pu.hub[1].w, 0.); m = dn;
  }
  // (the whole car, wheels and all, tilted sideways to the surface under its wheels: hub[2].w)
  { let cg = cos(pu.hub[2].w); let sg = sin(pu.hub[2].w); q = vec3f(q.x * cg - q.y * sg, q.x * sg + q.y * cg, q.z); m = vec3f(m.x * cg - m.y * sg, m.x * sg + m.y * cg, m.z); }
  let cp = cos(pu.lo.w); let sp = sin(pu.lo.w); let y2 = q.y * cp + q.z * sp; let z2 = q.z * cp - q.y * sp; let ny2 = m.y * cp + m.z * sp; let nz2 = m.z * cp - m.y * sp;
  let c0 = cos(pu.hi.w); let s0 = sin(pu.hi.w);
  let rel = (pu.hi.xyz - g.cam.xyz) + pu.lo.xyz + vec3f(q.x * c0 + z2 * s0, y2, -q.x * s0 + z2 * c0);
  var o: PcO; o.cp = g.vp * vec4f(rel, 1.); o.wp = rel + g.cam.xyz; o.n = vec3f(m.x * c0 + nz2 * s0, ny2, -m.x * s0 + nz2 * c0); o.c = c; o.k = k.x; o.lp = q; o.uv = uv; o.tl = k.zw; return o;
}
