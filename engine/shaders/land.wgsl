// The land of Endless as the shaders know it: zones, the road, rivers, the sea, the island, tunnels and underpasses.
// These must match src/land.js. (A game with another land brings its own file in place of this one: see boot.js.)
const SEA = -6.;
const SEG = 1200.;
fn zoneRaw(s: i32) -> i32 { if (s == 1) { return 3; } if (s == 2) { return 1; } if (((s % 4) + 4) % 4 == 3) { return 2; } let h = ph(vec2i(s, 913)); if (h < .25) { return 1; } if (h < .44) { return 2; } if (h < .63) { return 3; } if (h < .74) { return 4; } if (h < .82) { return 5; } return 0; }
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
fn tunS(s: i32) -> bool { return s != 2 && (ph(vec2i(s, 31)) > .45 || ((s % 4) + 4) % 4 == 2); }      // a hill stretch with a tunnel and not switchbacks (tunS in land.js)
fn hpw(z: f32) -> f32 { let p = z / SEG; let s = floor(p); let si = i32(s); if (zoneOf(si) != 1 || tunS(si)) { return 0.; } return 1. - ss(.16, .24, abs(p - s - .5)); }
fn hpx(z: f32) -> f32 { let e = hpw(z); if (e <= 0.) { return 0.; } return e * 100. * sin(.0262 * (z - (floor(z / SEG) + .5) * SEG)); }
// 1 where the plots of a flower stretch come up to the road (flwW in the script)
// the cherry stretches (chyAt in src/land.js): 1 a hill whose woods are mostly cherry, 2 a flat stretch with an avenue, 0 neither
fn chy(z: f32) -> i32 { let s = i32(floor(z / SEG)); let k = zoneOf(s); if (k == 1 && ph(vec2i(s, 61)) < .55) { return 1; }
  if (k == 0 && s != 4 && ph(vec2i(s, 51)) >= .5 && ph(vec2i(s, 63)) < .25) { return 2; } return 0; }
fn flw(z: f32, twz: f32) -> f32 { let p = z / SEG; let s = i32(floor(p)); if (zoneOf(s) != 0 || (s != 4 && ph(vec2i(s, 51)) >= .5)) { return 0.; }
  let q = p - f32(s); let r0 = (f32(s) + .3 + (ph(vec2i(s, 71)) - .5) * .12) * SEG; let w0 = 10. + 5. * ph(vec2i(s, 75)); let r1 = (f32(s) + .72 + (ph(vec2i(s, 72)) - .5) * .12) * SEG;
  return ss(0., .1, q) * (1. - ss(.9, 1., q)) * (1. - ss(0., .3, twz)) * ss(w0 + 30., w0 + 70., abs(z - r0)) * ss(34., 74., abs(z - r1)); }
// the lanes of a town leave the road square to it every 36 m. x: signed metres from the middle of the nearest lane, y: metres along it from the road, z: its number
fn soi(P: vec2f) -> vec3f {
  let s0 = roadX(P.y + .5) - roadX(P.y - .5); let b0 = round((P.y + s0 * (P.x - roadX(P.y)) - 34.) / 36.); var o = vec3f(99., 0., 0.);
  // (the lane reckoned nearest first; the ones either side of it are only asked where it is far enough off - 14 of the 18 m to half way - that one of them might be nearer)
  for (var j = 0; j < 3; j++) { let b = b0 + f32((j + 1) / 2) * f32(1 - 2 * (j & 1)); let zl = b * 36. + 34.; let s = (roadX(zl + 1.) - roadX(zl - 1.)) * .5; let iv = inverseSqrt(1. + s * s); let d = P - vec2f(roadX(zl), zl);
    let ds = (d.x * s + d.y) * iv; if (abs(ds) < abs(o.x)) { o = vec3f(ds, (d.x - d.y * s) * iv, b); }
    if (j == 0 && abs(ds) < 14.) { break; } }
  return o; }
// the island crossing (zone 5; ism and isBr in land.js). ism: metres into the sea (positive) or inland from the waterline; isb: 1 where the road is on a bridge
fn ism(P: vec2f) -> f32 { let si = i32(floor(P.y / SEG)); if (zoneOf(si) != 5) { return -99.; } let zc = (f32(si) + .5) * SEG; let dz = P.y - zc; let s = f32(((si % 64) + 64) % 64);
  let dx = (P.x - roadX(zc)) * .8; let an = atan2(dz, dx);
  return min(500. + 14. * sin(P.x * .021 + s) + 7. * sin(P.x * .057 + 2.) - abs(dz), length(vec2f(dx, dz)) - (170. + 18. * sin(an * 3. + s) + 9. * sin(an * 7. + 1.))); }
fn isb(z: f32) -> f32 { let si = i32(floor(z / SEG)); if (zoneOf(si) != 5) { return 0.; } let dz = abs(z - (f32(si) + .5) * SEG); return step(150., dz) * step(dz, 520.); }
// 1 inside a tunnel (inTun in land.js): the mountain's ground above is then not painted as road
fn tunk(z: f32) -> f32 { let s = i32(floor(z / SEG)); if (zoneOf(s) != 1 || !tunS(s)) { return 0.; }
  return step(abs(z - (f32(s) + .5) * SEG), 110. + 50. * ph(vec2i(s, 42))); }
// lane b of a town (see soi) is a proper cross street, one in every ten (xroad in land.js)
fn tlb(b: f32) -> f32 { let g = floor(b / 10.); return step(abs(b - (g * 10. + 2. + floor(ph(vec2i(i32(g), 520)) * 6.))), .5); }
// 1 along an underpass and its ramps (udOf in land.js, but for the tests of town and river made there): no crossings are painted down in it
fn udk(z: f32) -> f32 { let g0 = floor((z - 34.) / 360.); var o = 0.;
  for (var k = -1; k <= 1; k++) { let g = g0 + f32(k); let zc = (g * 10. + 2. + floor(ph(vec2i(i32(g), 520)) * 6.)) * 36. + 34.; if (ph(vec2i(i32(g), 523)) < .5 && abs(z - zc) < 100.) { o = 1.; } }
  return o; }
// how much wider than the main road's asphalt the street is at z, each side: the frontage roads beside an underpass (svW in land.js, and its underpass
// found with every test udG makes there: the town all round it, no river or sea crossing near)
fn svw(z: f32) -> f32 { let g0 = floor((z - 34.) / 360.); var o = 0.;
  for (var k = -1; k <= 1; k++) { let g = g0 + f32(k); let zc = (g * 10. + 2. + floor(ph(vec2i(i32(g), 520)) * 6.)) * 36. + 34.; let dz = abs(z - zc);
    if (dz < 136. && ph(vec2i(i32(g), 523)) < .5 && tw(zc) > .6 && tw(zc - 104.) > .6 && tw(zc + 104.) > .6) {
      let r = rivOf(zc); let si = i32(floor(zc / SEG)); let di = abs(zc - (f32(si) + .5) * SEG);
      if (!(r.y > 0. && abs(zc - r.x) < r.y * .5 + 112.) && !(zoneOf(si) == 5 && di > 38. && di < 632.)) { o = 5.4 * (1. - ss(96., 136., dz)); } } }
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
