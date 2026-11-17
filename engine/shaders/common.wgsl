// Shared by every stage: the uniform block, the land (road, zones, heights - these must match src/land.js), noise, wind.
// SHADOW_RES (the shadow map's size) is declared by src/shaders.js, in front of this text.
struct G { vp: mat4x4f, sm: mat4x4f, cam: vec4f, sun: vec4f, sunCol: vec4f, fwd: vec4f, right: vec4f, up: vec4f,
  fog: vec4f, res: vec4f, amb: vec4f, misc: vec4f, zen: vec4f, hor: vec4f, camM: vec4f };
// cam.w time · fwd/right/up: camera basis (right.w, up.w = tan half fov x, y) · fog: x density, y far edge, z cloud cover, w dry season
// misc: x headlights, y wind, z exposure, w night
@group(0) @binding(0) var<uniform> g: G;
const SEA = -6.;
const SEG = 1200.;
fn zoneRaw(s: i32) -> i32 { if (s == 1) { return 3; } if (s == 2) { return 1; } if (((s % 4) + 4) % 4 == 3) { return 2; } let h = ph(vec2i(s, 913)); if (h < .25) { return 1; } if (h < .44) { return 2; } if (h < .63) { return 3; } if (h < .74) { return 4; } return 0; }
fn zoneOf(s: i32) -> i32 { let r = zoneRaw(s); if (s != 1 && r == zoneRaw(s - 1)) { return 0; } return r; }
fn zw(z: f32, T: i32, w: f32, f: f32) -> f32 { let p = z / SEG; let s = floor(p); if (zoneOf(i32(s)) != T) { return 0.; } return 1. - ss(w * f, w, abs(p - s - .5)); }
fn hw(z: f32) -> f32 { return zw(z, 1, .46, .7); }
fn tspan(s: i32) -> vec2f { if (zoneOf(s) != 2) { return vec2f(0.); } var v = vec2f(.33 + .17 * ph(vec2i(s, 77)), .33 + .17 * ph(vec2i(s, 78)));
  if (zoneOf(s - 1) == 0 && ph(vec2i(s, 79)) < .55) { v.x = .6 + .55 * ph(vec2i(s, 81)); } if (zoneOf(s + 1) == 0 && ph(vec2i(s, 80)) < .55) { v.y = .6 + .55 * ph(vec2i(s, 82)); } return v; }
fn tw(z: f32) -> f32 { let p = z / SEG; let s0 = i32(floor(p)); var w = 0.;
  for (var k = -1; k <= 1; k++) { let sp = tspan(s0 + k); let q = p - f32(s0 + k) - .5; let e = select(sp.y, sp.x, q < 0.); if (e > 0.) { w = max(w, 1. - ss(e - .09, e, abs(q))); } }
  return w; }
fn sw(z: f32) -> f32 { return zw(z, 3, .45, .5); }
fn nw(z: f32) -> f32 { return zw(z, 4, .46, .6); }
fn roadX(z: f32) -> f32 { return 60. * sin(z * .004) + 25. * sin(z * .011 + 1.3) + 9. * sin(z * .023 + .7) + sw(z) * 16. * sin(z * .019) + hpx(z); }
fn hpw(z: f32) -> f32 { let p = z / SEG; let s = floor(p); let si = i32(s); if (zoneOf(si) != 1 || (si != 2 && ph(vec2i(si, 31)) > .6)) { return 0.; } return 1. - ss(.16, .24, abs(p - s - .5)); }
fn hpx(z: f32) -> f32 { let e = hpw(z); if (e <= 0.) { return 0.; } return e * 100. * sin(.0262 * (z - (floor(z / SEG) + .5) * SEG)); }
// 1 where the plots of a flower stretch come up to the road (flwW in the script)
fn flw(z: f32, twz: f32) -> f32 { let p = z / SEG; let s = i32(floor(p)); if (zoneOf(s) != 0 || (s != 4 && ph(vec2i(s, 51)) >= .5)) { return 0.; }
  let q = p - f32(s); let r0 = (f32(s) + .3 + (ph(vec2i(s, 71)) - .5) * .12) * SEG; let w0 = 10. + 5. * ph(vec2i(s, 75)); let r1 = (f32(s) + .72 + (ph(vec2i(s, 72)) - .5) * .12) * SEG;
  return ss(0., .1, q) * (1. - ss(.9, 1., q)) * (1. - ss(0., .3, twz)) * ss(w0 + 30., w0 + 70., abs(z - r0)) * ss(34., 74., abs(z - r1)); }
// Value noise on the whole-number hash: the script has the same function (pn), so both get the same numbers. turf() says where the
// ground is grown over and where it is bare earth; the blades of grass are planted by the same rule, so they stand exactly on the turf.
fn pn(p: vec2f) -> f32 { let i = vec2i(floor(p)); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(ph(i), ph(i + vec2i(1, 0)), u.x), mix(ph(i + vec2i(0, 1)), ph(i + vec2i(1, 1)), u.x), u.y); }
fn turf(P: vec2f) -> f32 { return pn(P * .09) * .5 + pn(P * .37) * .32 + pn(P * 1.3) * .18; }
// blades of grass lying one way: fine streaks close by, the same in broader tufts further off (each scale fades out before it is too fine for the pixels)
// vn with its lattice wrapped every n cells: with a position taken modulo 256 m it has no seam where the position wraps
fn vnp(p: vec2f, n: f32) -> f32 { let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f); let a = i - n * floor(i / n); let b = (i + 1.) - n * floor((i + 1.) / n);
  return mix(mix(h2(a), h2(vec2f(b.x, a.y)), u.x), mix(h2(vec2f(a.x, b.y)), h2(b), u.x), u.y); }
fn stk(P: vec2f, a: vec2f, off: f32, px: f32) -> f32 {
  // short blades, each lying a little off the others' line: the ground is bent by a slow noise first, and a blade is only three or four
  // times as long as it is wide (long straight strokes in three fixed directions read as woven cord, not grass)
  let Pw = P + (vec2f(vn(P * 13. + off), vn(P * 13. + off + 9.3)) - .5) * .09 + (vec2f(vn(P * 3.1 + off + 4.), vn(P * 3.1 + off + 14.)) - .5) * .30;
  let q = vec2f(dot(Pw, a), dot(Pw, vec2f(-a.y, a.x)));
  return .5 + (vn(vec2f(q.x * 75., q.y * 24.) + off) - .5) * (1. - ss(.5, 1.4, px * 75.)) * .8 + (vn(vec2f(q.x * 24., q.y * 9.) + off + 11.) - .5) * (1. - ss(.5, 1.4, px * 24.)) * .55
    + (vn(vec2f(q.x * 7., q.y * 4.5) + off + 23.) - .5) * (1. - ss(.5, 1.4, px * 7.)) * .26; }
// stones lying on bare earth. x: 1 on a stone, y: which stone, z: how near its middle (for the light on its rounded top)
fn pebble(P: vec2f, dens: f32) -> vec3f {
  let c = floor(P); var o = vec3f(0.);
  for (var j = -1; j <= 1; j++) { for (var k = -1; k <= 1; k++) {
    let id = c + vec2f(f32(k), f32(j)); let h = h2(id); if (h > dens) { continue; }
    let ctr = id + .5 + (vec2f(h2(id + 3.1), h2(id + 7.7)) - .5) * .7; let dv = (P - ctr) * vec2f(1., .7 + .6 * h2(id + 2.3)); let d = length(dv) / (.13 + .30 * h2(id + 11.3));
    if (d < 1.) { o = vec3f(1., h2(id + 5.), 1. - d * d); } } }
  return o; }
// the lanes of a town leave the road square to it every 36 m. x: signed metres from the middle of the nearest lane, y: metres along it from the road, z: its number
fn soi(P: vec2f) -> vec3f {
  let s0 = roadX(P.y + .5) - roadX(P.y - .5); let b0 = round((P.y + s0 * (P.x - roadX(P.y)) - 34.) / 36.); var o = vec3f(99., 0., 0.);
  for (var k = -1; k <= 1; k++) { let b = b0 + f32(k); let zl = b * 36. + 34.; let s = (roadX(zl + 1.) - roadX(zl - 1.)) * .5; let iv = inverseSqrt(1. + s * s); let d = P - vec2f(roadX(zl), zl);
    let ds = (d.x * s + d.y) * iv; if (abs(ds) < abs(o.x)) { o = vec3f(ds, (d.x - d.y * s) * iv, b); } }
  return o; }
// signed distance from the road's centre line, measured square to the road on the switchbacks
fn rdist(P: vec2f) -> f32 {
  let dx = P.x - roadX(P.y); let e = hpw(P.y); if (e <= 0.) { return dx; }
  let s = roadX(P.y + .5) - roadX(P.y - .5); let zs = P.y + clamp(dx * s / (1. + s * s), -40., 40.);
  let s2 = roadX(zs + .5) - roadX(zs - .5);
  return mix(dx, ((P.x - roadX(zs)) - s2 * (P.y - zs)) / sqrt(1. + s2 * s2), ss(0., .15, e));
}
fn rivOf(z: f32) -> vec4f {          // x: where it crosses, y: width (0: none here), z: seed, w: how much it winds
  let p = z / SEG; let s = floor(p); let si = i32(s); let zn = zoneOf(si); if (zn != 0 && zn != 2) { return vec4f(0.); }
  if (zn == 2) { return vec4f((s + .5 + (ph(vec2i(si, 73)) - .5) * .2) * SEG, 9., ph(vec2i(si, 79)) * 6.28, .12); }
  let i = step(.5, p - s); let ii = i32(i);
  return vec4f((s + mix(.3, .72, i) + (ph(vec2i(si, 71 + ii)) - .5) * .12) * SEG, mix(20. + 10. * ph(vec2i(si, 75)), 8., i), ph(vec2i(si, 77 + ii)) * 6.28, mix(1., .25, i));
}
fn rivM(x: f32, r: vec4f) -> f32 { return r.w * (10. * sin(x * .013 + r.z) + 5. * sin(x * .031 + r.z * 2.)); }
fn pinew(z: f32) -> f32 { let si = i32(floor(z / SEG)); if (zoneOf(si) != 3) { return 0.; } return ss(.55, .75, sw(z)) * ss(.25, .45, bch(z)) * ss(.4, .6, .5 + .5 * sin(z * .0105 + 1.)); }
fn bch(z: f32) -> f32 { return ss(.2, .75, .5 + .5 * sin(z * .0058 + 2.2)); }
fn shoreX(z: f32) -> f32 { return 31. + 46. * bch(z) + 4. * sin(z * .031) + 2.5 * sin(z * .083 + 2.) + (1. - ss(.5, .9, sw(z))) * 500.; }
fn swash(z: f32) -> f32 { let t = g.cam.w; return sin(t * .7 + z * .06) * .7 + sin(t * .43 + z * .021) * .5; }
fn h2(p: vec2f) -> f32 { var q = fract(p.xyx * vec3f(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn vn(p: vec2f) -> f32 { let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(h2(i), h2(i + vec2f(1., 0.)), u.x), mix(h2(i + vec2f(0., 1.)), h2(i + vec2f(1., 1.)), u.x), u.y); }
fn fbm(p: vec2f) -> f32 { var s = 0.; var a = .5; var q = p; for (var i = 0; i < 4; i++) { s += a * vn(q); q = q * 2.03 + vec2f(17.1, 9.7); a *= .5; } return s / .9375; }
fn ph(c: vec2i) -> f32 { var h = bitcast<u32>(c.x) * 374761393u + bitcast<u32>(c.y) * 668265263u; h = (h ^ (h >> 13u)) * 1274126177u; h = h ^ (h >> 16u); return f32(h) / 4294967296.; }
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
// wind: the whole plant leans with height; nearby parts share a phase so leaves stay on their branches
fn gust(p: vec2f) -> f32 { let t = g.cam.w; return vn(p * .02 - vec2f(t * .35, t * .22)); }      // gusts travel over the land with the wind
fn wind(p: vec2f, hgt: f32) -> vec2f {
  let t = g.cam.w; let W = g.misc.y; let gs = gust(p); let ph = dot(p, vec2f(.021, .017));
  let sway = vec2f(sin(t * 2.1 + ph) + .4 * sin(t * 4.3 + ph * 2.1), cos(t * 1.7 + ph * 1.3) + .35 * sin(t * 3.7 + ph));
  return pow(hgt, 1.5) * .008 * W * (vec2f(.8, .55) * (.15 + 1.0 * gs) + sway * (.25 + .5 * gs));
}
// The whole movement of a point of a plant: the trunk's sway (wind), and on top of it the bough's own - the further out from the
// trunk, the more it streams downwind, dips, and tosses.
fn wind3(p: vec2f, hgt: f32, reach: f32) -> vec3f {
  let w = wind(p, hgt); let W = g.misc.y; let gs = gust(p); let t = g.cam.w; let ph = dot(p, vec2f(.37, .29));
  let k = pow(reach, 1.25) * (.02 + .0012 * min(hgt, 12.));
  let hz = vec2f(.8, .55) * (W * (.25 + 1.3 * gs) + (sin(t * 2.6 + ph) * .5 + sin(t * 4.1 + ph * 1.7) * .3) * W * (.3 + .5 * gs)) * k;
  return vec3f(w.x + hz.x, -length(hz) * .35 + sin(t * 3.3 + ph * 2.3) * W * k * .25, w.y + hz.y);
}
struct LO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f,
  @location(3) @interpolate(flat) col: vec3f, @location(4) @interpolate(flat) pr: vec2f };
override WS: f32 = 1.;
// One leaf or blade: a strip of 10 vertices bent, tapered and moved here from 12 numbers per instance.
// a: base xyz, length · b: yaw, elevation, half width, droop · c: kind (0 leaf, 1 palm leaflet, 2 grass, 3 green rice, 4 ripe rice, 5 banana leaf), seed, shade, height above the plant's foot
fn leafV(vi: u32, a: vec4f, b: vec4f, c: vec4f) -> LO {
  var o: LO;
  let u = f32(vi & 1u) * 2. - 1.; let v = f32(vi >> 1u) / 4.;
  let kind = i32(c.x + .5);
  let cy = cos(b.x); let sy = sin(b.x); let ce = cos(b.y); let se = sin(b.y);
  var dir = vec3f(ce * cy, se, ce * sy); var side = vec3f(-sy, 0., cy);
  var shp = pow(max(sin(3.14159 * pow(v, .75)), 0.), .6);
  if (kind == 0) { shp = 1.; }                                         // a sprig: the fragment stage cuts the leaves out of it
  if (kind == 1) { shp = pow(max(sin(3.14159 * pow(v, .5)), 0.), .5); }
  let blade = kind >= 2 && kind <= 4;
  if (blade) { shp = 1. - v * .93; }
  if (kind == 5) { shp = 1.; }      // a whole banana leaf: narrow at the stalk, then a long even paddle, rounded at the end
  if (kind == 7) { shp = 1. - v * .6; }
  if (kind == 8) { shp = 1. - v * .35; }
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
  let pk = !blade && kind != 9; var hgt = c.w; var rch = 0.; if (pk) { hgt = floor(c.w) / 32.; rch = fract(c.w) * 32.; }      // leaves of trees carry height and reach packed together
  let w = wind3(a.xz, hgt + v * a.w * se, rch); let gs = gust(a.xz);
  p += w;
  if (blade) { let bend = g.misc.y * (.08 + .5 * gs) * v * v * a.w * .55; p.x += .8 * bend; p.z += .55 * bend; p.y -= bend * .35; }      // waves run through grass and rice
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
  let snl = nw(a.z); if (snl > .01) { col = mix(col, vec3f(.74, .77, .82), snl * (.3 + .5 * c.z)); }                                      // snow lying on the leaves
  o.col = col; o.pr = vec2f(c.z, tr + 2. * f32(kind == 0) + 4. * c.y * f32(kind == 0) + 10. * f32(kind == 8) + 20. * f32(kind == 9) + (30. + 4. * c.y) * f32(kind == 5));
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
  o.m = (1. - plant) * (h.y + 1.);
  o.wp = p + g.cam.xyz; o.n = nn; o.uv = vec2f(atan2(v.y, v.x) / 6.2832, p.y + g.cam.y); o.cp = g.vp * vec4f(p, 1.);
  return o;
}
