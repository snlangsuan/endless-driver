// The land of Ruin as the shaders know it: the dead city's reach, the river, the grid of roads, what each block is.
// These must match ruin/land.js (the same names there). Put after common.wgsl in place of the engine's own land.wgsl.
const SEA = -1000.;
const SEG = 1200.;
const BK = 128.;
fn urb(P: vec2f) -> f32 { let a = P * P; return 1. - ss(.55, 1., sqrt(sqrt(a.x * a.x + a.y * a.y)) / 7600. + (pn(P / 1500. + vec2f(3., 7.)) - .5) * .3); }
fn core(P: vec2f) -> f32 { let a = P * P; return 1. - ss(.2, .5, sqrt(sqrt(a.x * a.x + a.y * a.y)) / 7600. + (pn(P / 1500. + vec2f(3., 7.)) - .5) * .3); }
fn rural(P: vec2f) -> f32 { return 1. - ss(.02, .2, urb(P)); }
fn rivZ(x: f32) -> f32 { return 1536. + 250. * sin(x * .00085 + .6) + 95. * sin(x * .0023 + 2.1) + 30. * sin(x * .0061); }
// metres from the river's edge (negative: in the water)
fn rivD(P: vec2f) -> f32 { let s = (rivZ(P.x + 1.) - rivZ(P.x - 1.)) * .5; return abs(P.y - rivZ(P.x)) / sqrt(1. + s * s) - (42. + 10. * sin(P.x * .0011)); }
fn nsX(k: i32, z: f32) -> f32 { let x = f32(k) * BK; if (k % 8 != 0) { return x; } return x + 42. * rural(vec2f(x, z)) * ss(500., 900., abs(z - 1536.)) * sin(z * .0052 + f32(k) * 1.7); }
fn ewZ(i: i32, x: f32) -> f32 { let z = f32(i) * BK; if (i % 8 != 0) { return z; } return z + 42. * rural(vec2f(x, z)) * sin(x * .0052 + f32(i) * 1.7 + 2.); }
fn segOn(ns: bool, k: i32, j: i32) -> bool { let a = f32(k) * BK; let b = (f32(j) + .5) * BK; var u = urb(vec2f(b, a)); if (ns) { u = urb(vec2f(a, b)); }
  if (k % 8 == 0) { return k % 16 == 0 || u > .12; } return u > .24 + .22 * ph(vec2i(k + select(4096, 0, ns), j)); }
// The roads nearest a point. dn: signed metres east of the nearest north-south road's middle, hn: its half width (0: none); de, he: the same for
// the nearest east-west road (metres north of it).
struct Rd { dn: f32, hn: f32, de: f32, he: f32 };
fn roadAt(P: vec2f) -> Rd {
  var r = Rd(999., 0., 999., 0.);
  let j = i32(floor(P.y / BK)); let jx = i32(floor(P.x / BK));
  let ka = i32(round(P.x / (8. * BK))) * 8; let km = i32(round(P.x / BK)); let ia = i32(round(P.y / (8. * BK))) * 8; let im = i32(round(P.y / BK));
  if (segOn(true, ka, j)) { r.dn = P.x - nsX(ka, P.y); r.hn = 7.; }
  if (km != ka && abs(P.x - f32(km) * BK) - 3.6 < abs(r.dn) - r.hn) { if (segOn(true, km, j)) { r.dn = P.x - f32(km) * BK; r.hn = 3.6; } }
  if (segOn(false, ia, jx)) { r.de = P.y - ewZ(ia, P.x); r.he = 7.; }
  if (im != ia && abs(P.y - f32(im) * BK) - 3.6 < abs(r.de) - r.he) { if (segOn(false, im, jx)) { r.de = P.y - f32(im) * BK; r.he = 3.6; } }
  return r;
}
// what a block is: 0 open country, 1 a park, 2 towers, 3 an open lot, 4 shops and flats, 5 sheds and yards, 6 houses (lotKind in land.js)
fn lot(P: vec2f) -> i32 { let b = floor(P / BK); let C = (b + .5) * BK; let u = urb(C); let h = ph(vec2i(i32(b.x) * 3 + 1, i32(b.y) * 5 + 2));
  if (u < .2) { return 0; } if (h < .1) { return 1; } if (core(C) > .5) { return select(3, 2, h < .8); } if (u > .85) { if (h < .68) { return 4; } return select(5, 3, h < .82); } return select(5, 6, h < .86); }
// how wild the ground is, 0 paved .. 1 grown over (wildAt in land.js)
fn wildK(P: vec2f, u: f32) -> f32 { if (u < .2) { return 1.; } let k = lot(P); var w = .3; if (k <= 1) { w = 1.; } else if (k == 6) { w = .75; } return mix(1., w, ss(.2, .3, u)); }
fn weed(P: vec2f) -> f32 { return pn(P * .05 + vec2f(11., 0.)) * .6 + pn(P * .23 + vec2f(3., 0.)) * .4; }
fn woodK(P: vec2f, u: f32) -> f32 { return ss(.40, .47, (2. * pn(P * .004 + vec2f(40., 0.)) + pn(P * .0081 + vec2f(57., 9.))) / 3.) * (1. - ss(.05, .3, u)); }
// ---- What the engine's shared stages ask of a land (they were written for Endless). Here there is no town-along-a-road, sea, snow, lane or tunnel.
fn tw(z: f32) -> f32 { return 0.; }
fn sw(z: f32) -> f32 { return 0.; }
fn nw(z: f32) -> f32 { return 0.; }
fn roadX(z: f32) -> f32 { return 0.; }
fn rdist(P: vec2f) -> f32 { return roadAt(P).dn; }
fn soi(P: vec2f) -> vec3f { return vec3f(99., 0., 0.); }
fn tlb(b: f32) -> f32 { return 0.; }
fn rub(z: f32) -> f32 { return 0.; }
fn fkind(z: f32) -> f32 { return 5.; }      // (the plain flower: 4 is now the marigold)
fn tulc(h: f32) -> vec3f { return vec3f(.8); }
fn oilp(z: f32) -> f32 { return 0.; }
fn ism(P: vec2f) -> f32 { return -99.; }
fn tunk(z: f32) -> f32 { return 0.; }
fn chy(z: f32) -> i32 { return 0; }
fn kun(z: f32) -> bool { return false; }
fn shoreX(z: f32) -> f32 { return 1e9; }
