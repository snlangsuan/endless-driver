// Shared by every stage: the uniform block, noise, the ground's grain, wind, and the shapes of leaves and branches.
// The land itself (roads, zones, heights) is in land.wgsl, which src/shaders.js puts after this text.
// SHADOW_RES (the shadow map's size) is declared by src/shaders.js, in front of this text.
struct G { vp: mat4x4f, sm: mat4x4f, cam: vec4f, sun: vec4f, sunCol: vec4f, fwd: vec4f, right: vec4f, up: vec4f,
  fog: vec4f, res: vec4f, amb: vec4f, misc: vec4f, zen: vec4f, hor: vec4f, camM: vec4f, crush: array<vec4f, 8> };
// cam.w time · fwd/right/up: camera basis (right.w, up.w = tan half fov x, y) · fog: x density, y far edge, z cloud cover, w dry season
// crush: plants the car has pressed down - x, z where, z how far (0..1), w how far round · misc: x headlights, y wind, z exposure, w night · camM: xy the eye's place in its 256 m tile, z snow lying everywhere (snow chosen by hand)
@group(0) @binding(0) var<uniform> g: G;
// Value noise on the whole-number hash: the script has the same function (pn), so both get the same numbers. turf() says where the
// ground is grown over and where it is bare earth; the blades of grass are planted by the same rule, so they stand exactly on the turf.
fn pn(p: vec2f) -> f32 { let i = vec2i(floor(p)); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(ph(i), ph(i + vec2i(1, 0)), u.x), mix(ph(i + vec2i(0, 1)), ph(i + vec2i(1, 1)), u.x), u.y); }
fn turf(P: vec2f) -> f32 { return pn(P * .09) * .5 + pn(P * .37) * .32 + pn(P * 1.3) * .18; }
// blades of grass lying one way: fine streaks close by, the same in broader tufts further off (each scale fades out before it is too fine for the pixels)
// vn with its lattice wrapped every n cells: with a position taken modulo 256 m it has no seam where the position wraps
fn vnp(p: vec2f, n: f32) -> f32 { let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f); let a = i - n * floor(i / n); let b = (i + 1.) - n * floor((i + 1.) / n);
  return mix(mix(h2(a), h2(vec2f(b.x, a.y)), u.x), mix(h2(vec2f(a.x, b.y)), h2(b), u.x), u.y); }
fn stkw(P: vec2f) -> vec2f { return P + (vec2f(vn(P * 13.), vn(P * 13. + 9.3)) - .5) * .09 + (vec2f(vn(P * 3.1 + 4.), vn(P * 3.1 + 14.)) - .5) * .30; }      // the ground, bent (once for all three directions of stroke)
fn stk(Pw: vec2f, a: vec2f, off: f32, px: f32) -> f32 {
  // short blades, each lying a little off the others' line: the ground is bent by a slow noise first, and a blade is only three or four
  // times as long as it is wide (long straight strokes in three fixed directions read as woven cord, not grass)
  let q = vec2f(dot(Pw, a), dot(Pw, vec2f(-a.y, a.x)));
  var o = .5 + (vn(vec2f(q.x * 7., q.y * 4.5) + off + 23.) - .5) * (1. - ss(.5, 1.4, px * 7.)) * .26;      // (the finer two only where they still show)
  if (px * 24. < 1.4) { o += (vn(vec2f(q.x * 24., q.y * 9.) + off + 11.) - .5) * (1. - ss(.5, 1.4, px * 24.)) * .55; }
  if (px * 75. < 1.4) { o += (vn(vec2f(q.x * 75., q.y * 24.) + off) - .5) * (1. - ss(.5, 1.4, px * 75.)) * .8; }
  return o; }
// stones lying on bare earth. x: 1 on a stone, y: which stone, z: how near its middle (for the light on its rounded top)
fn pebble(P: vec2f, dens: f32) -> vec3f {
  let c = floor(P); var o = vec3f(0.);
  for (var j = -1; j <= 1; j++) { for (var k = -1; k <= 1; k++) {
    let id = c + vec2f(f32(k), f32(j)); let h = h2(id); if (h > dens) { continue; }
    let ctr = id + .5 + (vec2f(h2(id + 3.1), h2(id + 7.7)) - .5) * .7; let dv = (P - ctr) * vec2f(1., .7 + .6 * h2(id + 2.3)); let d = length(dv) / (.13 + .30 * h2(id + 11.3));
    if (d < 1.) { o = vec3f(1., h2(id + 5.), 1. - d * d); } } }
  return o; }
fn h2(p: vec2f) -> f32 { var q = fract(p.xyx * vec3f(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn vn(p: vec2f) -> f32 { let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(h2(i), h2(i + vec2f(1., 0.)), u.x), mix(h2(i + vec2f(0., 1.)), h2(i + vec2f(1., 1.)), u.x), u.y); }
fn fbm(p: vec2f) -> f32 { var s = 0.; var a = .5; var q = p; for (var i = 0; i < 4; i++) { s += a * vn(q); q = q * 2.03 + vec2f(17.1, 9.7); a *= .5; } return s / .9375; }
fn ph(c: vec2i) -> f32 { var h = bitcast<u32>(c.x) * 374761393u + bitcast<u32>(c.y) * 668265263u; h = (h ^ (h >> 13u)) * 1274126177u; h = h ^ (h >> 16u); return f32(h) / 4294967296.; }
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
// wind: the whole plant leans with height; nearby parts share a phase so leaves stay on their branches
fn gust(p: vec2f) -> f32 { let t = g.cam.w; return vn(p * .02 - vec2f(t * .35, t * .22)); }      // gusts travel over the land with the wind
fn wind(p: vec2f, hgt: f32) -> vec2f { return windG(p, hgt, gust(p)); }
fn windG(p: vec2f, hgt: f32, gs: f32) -> vec2f {      // (gs: the gust there, for a caller that has it already - a leaf asks for it at every one of its corners)
  let t = g.cam.w; let W = g.misc.y; let ph = dot(p, vec2f(.021, .017));
  let sway = vec2f(sin(t * 2.1 + ph) + .4 * sin(t * 4.3 + ph * 2.1), cos(t * 1.7 + ph * 1.3) + .35 * sin(t * 3.7 + ph));
  return pow(hgt, 1.5) * .008 * W * (vec2f(.8, .55) * (.15 + 1.0 * gs) + sway * (.25 + .5 * gs));
}
// The whole movement of a point of a plant: the trunk's sway (wind), and on top of it the bough's own - the further out from the
// trunk, the more it streams downwind, dips, and tosses.
fn wind3(p: vec2f, hgt: f32, reach: f32) -> vec3f { return wind3G(p, hgt, reach, gust(p)); }
fn wind3G(p: vec2f, hgt: f32, reach: f32, gs: f32) -> vec3f {
  let w = windG(p, hgt, gs); let W = g.misc.y; let t = g.cam.w; let ph = dot(p, vec2f(.37, .29));
  let k = pow(reach, 1.25) * (.02 + .0012 * min(hgt, 12.));
  let hz = vec2f(.8, .55) * (W * (.25 + 1.3 * gs) + (sin(t * 2.6 + ph) * .5 + sin(t * 4.1 + ph * 1.7) * .3) * W * (.3 + .5 * gs)) * k;
  return vec3f(w.x + hz.x, -length(hz) * .35 + sin(t * 3.3 + ph * 2.3) * W * k * .25, w.y + hz.y);
}
// How far a point of a plant is pressed down by the car (0..1) and which way it is pushed out: only what stands lower than a car is bent.
fn crushed(P: vec2f, hgt: f32) -> vec3f {
  var f = 0.; var dirv = vec2f(0.);
  for (var i = 0; i < 8; i++) { let q = g.crush[i]; if (q.z < .003) { continue; } let dv = P - q.xy; let k = q.z * (1. - ss(q.w * .75, q.w, length(dv))); if (k > f) { f = k; dirv = dv / max(length(dv), .05); } }
  return vec3f(dirv, f * (1. - ss(2.2, 3.4, hgt)));
}
struct LO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f,
  @location(3) @interpolate(flat) col: vec3f, @location(4) @interpolate(flat) pr: vec2f };
override WS: f32 = 1.;
override NV: f32 = 4.;      // how many lengths the strip is cut into: 4 (10 vertices) close by, 2 (6 vertices) for the thinned-out leaves further off and for shadows
// One leaf or blade: a strip of 10 vertices bent, tapered and moved here from 12 numbers per instance.
// (kind 10 is a spray of blossom, see scene.wgsl)
// a: base xyz, length · b: yaw, elevation, half width, droop · c: kind (0 leaf, 1 palm leaflet, 2 grass, 3 green rice, 4 ripe rice, 5 banana leaf), seed, shade, height above the plant's foot
fn leafV(vi: u32, a0: vec4f, b0: vec4f, c: vec4f) -> LO {
  var o: LO;
  let u = f32(vi & 1u) * 2. - 1.; let v = f32(vi >> 1u) / NV;
  let kind = i32(c.x + .5);
  var a = a0; var b = b0;
  if (kind == 11) {        // a petal in the air: it falls from where it was put (b0.y is how far down the ground is), swinging from side to side, turning over, carried off by the wind; then another starts
    let tt = fract(g.cam.w * (.045 + .035 * c.y) + b0.x); let drift = tt * b0.y * (.12 + .55 * g.misc.y * (.3 + gust(a0.xz)));
    a = vec4f(a0.x + sin(tt * 11. + b0.x * 40.) * .35 + .8 * drift, a0.y - tt * b0.y, a0.z + cos(tt * 8. + b0.x * 23.) * .35 + .55 * drift, a0.w * ss(0., .04, tt));
    b = vec4f(b0.x * 6.2832 + g.cam.w * (2. + 3. * c.y), sin(g.cam.w * 3.1 + b0.x * 50.) * 1.2, b0.z, 0.);
  }
  let cy = cos(b.x); let sy = sin(b.x); let ce = cos(b.y); let se = sin(b.y);
  var dir = vec3f(ce * cy, se, ce * sy); var side = vec3f(-sy, 0., cy);
  var shp = pow(max(sin(3.14159 * pow(v, .75)), 0.), .6);
  if (kind == 0 || kind == 10) { shp = 1.; }                                         // a sprig: the fragment stage cuts the leaves out of it
  if (kind == 1) { shp = pow(max(sin(3.14159 * pow(v, .5)), 0.), .5); }
  let blade = kind >= 2 && kind <= 4;
  if (blade) { shp = 1. - v * .93; }
  if (kind == 5) { shp = 1.; }      // a whole banana leaf: narrow at the stalk, then a long even paddle, rounded at the end
  if (kind == 7) { shp = 1. - v * .6; }
  if (kind == 8) { shp = 1. - v * .35; }
  if (kind >= 12) { shp = 1.; }                                        // a hill of rice: a card the fragment stage cuts the leaves and ears from (12 green, 13 ripe)
  if (kind == 9) { shp = 1.; }                                         // a flower head: a square the fragment stage cuts petals from                                // a spray of needles: the fragment stage draws the needles
  var vv = v;
  if (kind == 9) {                                                     // a flower head turns its face to the eye (leaning back a little, each its own way), and is hung by its middle
    let tc = normalize(a.xz - g.cam.xz + vec2f(1e-4, 0.)); let j = (c.y - .5) * 1.2; let cj = cos(j); let sj = sin(j); let t2 = vec2f(tc.x * cj - tc.y * sj, tc.x * sj + tc.y * cj);
    dir = vec3f(t2.x * ce, se, t2.y * ce); side = vec3f(-t2.y, 0., t2.x); vv = v - .5;
  }
  var p = (a.xyz - g.cam.xyz) + a.w * (dir * vv + vec3f(0., -1., 0.) * (b.w * v * v * .5));      // relative to the eye from here on
  let tng = normalize(dir + vec3f(0., -b.w * v, 0.));
  var n = normalize(cross(side, tng));
  let t = g.cam.w;
  let pk = !blade && kind != 9 && kind < 12; var hgt = c.w; var rch = 0.; if (pk) { hgt = floor(c.w) / 32.; rch = fract(c.w) * 32.; }      // leaves of trees carry height and reach packed together
  let gs = gust(a.xz); let w = wind3G(a.xz, hgt + v * a.w * se, rch, gs);
  p += w;
  if (hgt < 3.4) { let cr = crushed(a.xz, hgt); if (cr.z > .003) {      // (nothing that high is pressed down)
    let up = hgt + v * a.w * se; p.y -= up * cr.z * .86; p = vec3f(p.x + cr.x * cr.z * (.25 + .35 * hgt), p.y, p.z + cr.y * cr.z * (.25 + .35 * hgt)); } }      // flat under the car, splayed a little outward
  if (blade || kind >= 12) { let bend = g.misc.y * (.08 + .5 * gs) * v * v * a.w * .55; p.x += .8 * bend; p.z += .55 * bend; p.y -= bend * .35; }      // waves run through grass and rice
  if (kind == 9) { let bend = g.misc.y * (.08 + .5 * gs) * c.w * .55; p.x += .8 * bend; p.z += .55 * bend; p.y -= bend * .35; }      // rides on the tip of its stalk
  let fl = g.misc.y * (.4 + 1.2 * gs) * sin(t * (6. + c.y * 4.) + c.y * 40. + a.x * 1.7) * .07 * v * a.w;
  p += mix(n, side, f32(blade)) * fl + side * (fl * .4 * (1. - f32(blade)));
  if (!blade) { let bp = h2(floor(a.xz / 1.3) + floor(a.y / 1.3) * 7.); p += vec3f(.8, .35, .55) * (g.misc.y * (.2 + gs) * .006 * min(hgt, 9.) * sin(t * 3.1 + bp * 6.2832)); }      // each bough tosses on its own
  p += side * (u * b.z * shp * WS);
  o.wp = p + g.cam.xyz; o.n = normalize(n + side * (u * .35)); o.uv = vec2f(u, v); o.cp = g.vp * vec4f(p, 1.);
  var col = mix(vec3f(.070, .140, .020), vec3f(.045, .100, .020), c.y);
  var tr = 1.;
  if (c.y > .86) { col = vec3f(.14, .15, .03); }
  if (kind == 1) { col = mix(vec3f(.07, .15, .03), vec3f(.10, .17, .035), c.y); }
  if (kind == 2) { col = mix(vec3f(.11, .17, .03), vec3f(.17, .20, .045), c.y); if (c.y > .8) { col = vec3f(.24, .21, .07); } }
  if (kind == 3) { col = mix(vec3f(.085, .20, .025), vec3f(.13, .23, .035), c.y); }
  if (kind == 4) { col = mix(vec3f(.30, .24, .06), vec3f(.36, .27, .08), c.y); }
  if (kind == 5) { col = mix(vec3f(.10, .23, .03), vec3f(.065, .17, .025), c.y); if (c.y > .93) { col = vec3f(.20, .21, .05); } }
  if (kind == 7) { col = mix(vec3f(.20, .13, .06), vec3f(.26, .19, .09), c.y); tr = .3; }
  if (kind == 6) { col = mix(vec3f(.70, .06, .32), vec3f(.85, .30, .50), c.y); if (c.y > .8) { col = vec3f(.85, .80, .75); } }
  // dry season: grass turns to straw, trees yellow a little
  if (kind == 2) { col = mix(col, vec3f(.27, .22, .08), g.fog.w * .8); }
  if (kind == 0) { col = mix(col, vec3f(.13, .13, .03), g.fog.w * .4); }
  if (kind == 8) { col = mix(vec3f(.060, .105, .050), vec3f(.105, .150, .065), c.y); }
  if (kind == 9) { col = mix(vec3f(.90, .48, .03), vec3f(.95, .72, .06), c.y); if (c.z < .8) { col = mix(vec3f(.80, .25, .50), vec3f(.88, .84, .86), step(.6, c.y)); } tr = .7; }      // a flower head
  let snl = max(nw(a.z), g.camM.z); if (snl > .01) { col = mix(col, vec3f(.74, .77, .82), snl * (.3 + .5 * c.z)); }                                      // snow lying on the leaves
  if (kind == 10 || kind == 11) { col = mix(vec3f(.62, .09, .26), vec3f(.80, .24, .42), c.y); if (c.y > .85) { col = vec3f(.88, .46, .60); } }      // cherry blossom: deep pink to nearly white
  o.col = col; o.pr = vec2f(c.z, tr + (40. + 4. * c.y) * f32(kind == 10) + 2. * f32(kind == 0) + 4. * c.y * f32(kind == 0) + 10. * f32(kind == 8) + 20. * f32(kind == 9) + (30. + 4. * c.y) * f32(kind == 5) + (50. + 4. * c.y) * f32(kind == 12) + (60. + 4. * c.y) * f32(kind == 13));
  return o;
}
struct BO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) @interpolate(flat) m: f32 };
// One piece of trunk or branch: a tapered tube between two points (p0 r0 → p1 r1), h = heights above the foot for the wind
fn branchV(v: vec3f, p0: vec4f, p1: vec4f, h: vec2f) -> BO {
  var o: BO;
  let ax = p1.xyz - p0.xyz; let d = ax / max(length(ax), 1e-4);
  var upv = vec3f(0., 1., 0.); if (abs(d.y) > .95) { upv = vec3f(1., 0., 0.); }
  let x = normalize(cross(upv, d)); let y = cross(d, x);
  let nn = x * v.x + y * v.y;
  let pc = mix(p0.xyz - g.cam.xyz, p1.xyz - g.cam.xyz, v.z); var rr = mix(p0.w, p1.w, v.z);      // relative to the eye
  if (h.x < -.5) { rr = max(rr, length(pc) * .0009); }      // a wire is never drawn thinner than a pixel: it would break up into flickering dots
  var p = pc + nn * rr;
  let plant = step(-.5, h.x);                                  // h.x = -1 marks a made thing: h.y 0 concrete pole, 1 wire, 2 green stem
  let hd = max(h, vec2f(0.)); let w = wind3(mix(p0.xz, p1.xz, v.z), mix(floor(hd.x), floor(hd.y), v.z) / 32., mix(fract(hd.x), fract(hd.y), v.z) * 32.) * plant;
  p += w;
  if (h.x < -1.5) { p += wind3(p0.xz, -h.x - 2., .5); }      // a made thing fixed to a plant (a coconut): it goes with the tree, all of a piece - moved as the tree's top is, by its height (-h.x - 2)
  { let hh = mix(floor(hd.x), floor(hd.y), v.z) / 32.; let pw = mix(p0.xz, p1.xz, v.z); let cr = crushed(pw, hh) * plant; if (cr.z > .003) { p.y -= hh * cr.z * .86; p = vec3f(p.x + cr.x * cr.z * (.25 + .35 * hh), p.y, p.z + cr.y * cr.z * (.25 + .35 * hh)); } }
  o.m = (1. - plant) * (h.y + 1.);
  o.wp = p + g.cam.xyz; o.n = nn; o.uv = vec2f(atan2(v.y, v.x) / 6.2832, p.y + g.cam.y); o.cp = g.vp * vec4f(p, 1.);
  return o;
}
