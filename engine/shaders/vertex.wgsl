// Vertex stages, shared by the picture and by the shadow map (which uses the light's matrix as vp).
struct TO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) w: f32, @location(3) rel: vec3f };
@vertex fn vsTerrain(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) w: f32) -> TO { var o: TO; o.wp = p; o.n = n; o.w = w; o.rel = p - g.cam.xyz; o.cp = g.vp * vec4f(o.rel, 1.); return o; }
@vertex fn vsLeaf(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f) -> LO { return leafV(vi, a, b, c); }
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
@vertex fn vsBranch(@location(0) v: vec3f, @location(1) p0: vec4f, @location(2) p1: vec4f, @location(3) h: vec2f) -> BO { return branchV(v, p0, p1, h); }
