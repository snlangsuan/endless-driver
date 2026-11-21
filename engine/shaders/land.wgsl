// The land of Endless as the shaders know it: zones, the road, rivers, the sea, the island, tunnels and underpasses.
// These must match src/land.js. (A game with another land brings its own file in place of this one: see boot.js.)
const SEA = -6.;
const SEG = 1200.;
fn flws(s: i32) -> bool { return s == 0 || s == -2 || ph(vec2i(s, 51)) < .5; }      // a plain stretch that is flower fields (flwS in land.js)
fn zoneRaw(s: i32) -> i32 { if (s == 0 || s == -2) { return 0; } if (s == 1) { return 3; } if (s == 2) { return 1; } if (((s % 4) + 4) % 4 == 3) { return 2; } let h = ph(vec2i(s, 913)); if (h < .25) { return 1; } if (h < .44) { return 2; } if (h < .63) { return 3; } if (h < .74) { return 4; } if (h < .82) { return 5; } return 0; }
fn zoneOf(s: i32) -> i32 { let r = zoneRaw(s); if (s != 1 && r == zoneRaw(s - 1)) { return 0; } return r; }
fn zw(z: f32, T: i32, w: f32, f: f32) -> f32 { let p = z / SEG; let s = floor(p); if (zoneOf(i32(s)) != T) { return 0.; } return 1. - ss(w * f, w, abs(p - s - .5)); }
fn hw(z: f32) -> f32 { return zw(z, 1, .46, .7); }
fn tspan(s: i32) -> vec2f { if (zoneOf(s) != 2) { return vec2f(0.); } var v = vec2f(.33 + .17 * ph(vec2i(s, 77)), .33 + .17 * ph(vec2i(s, 78)));
  if (zoneOf(s - 1) == 0 && ph(vec2i(s, 79)) < .55) { v.x = .6 + .55 * ph(vec2i(s, 81)); } if (zoneOf(s + 1) == 0 && ph(vec2i(s, 80)) < .55) { v.y = .6 + .55 * ph(vec2i(s, 82)); } return v; }
fn tw(z: f32) -> f32 { let p = z / SEG; let s0 = i32(floor(p)); var w = 0.;
  for (var k = -1; k <= 1; k++) { let sp = tspan(s0 + k); let q = p - f32(s0 + k) - .5; let e = select(sp.y, sp.x, q < 0.); if (e > 0.) { w = max(w, 1. - ss(e - .09, e, abs(q))); } }
  return w; }
fn sw(z: f32) -> f32 { return zw(z, 3, .45, .5); }
// 1 on a stretch with the sea beside it (the coast road, the island crossing) and for 40 m into its neighbours: no rice is grown there (seaZ in land.js)
// the one flower each part of a flower stretch grows - the parts lie between its canals (flwKind in land.js): 0 sunflowers, 1 hydrangeas, 2 tulips, 3 lilies; tulc: a tulip band's colour
fn fkind(z: f32) -> f32 { let p = z / SEG; let s = i32(floor(p)); let q = p - floor(p); var part = 2; if (q < .3 + (ph(vec2i(s, 71)) - .5) * .12) { part = 0; } else if (q < .72 + (ph(vec2i(s, 72)) - .5) * .12) { part = 1; }
  if (ph(vec2i(s * 3 + part, 389)) < .25) { return 4.; } return floor(ph(vec2i(s * 3 + part, 387)) * 4.); }      // (4: marigolds - see flwKind)
fn tulc(h: f32) -> vec3f { if (h < .24) { return vec3f(.78, .05, .06); } if (h < .46) { return vec3f(.93, .70, .05); } if (h < .64) { return vec3f(.88, .36, .55); } if (h < .8) { return vec3f(.45, .12, .50); } if (h < .92) { return vec3f(.90, .40, .08); } return vec3f(.88, .86, .80); }
// plantations: plw 1 inside one of either kind (plantW in land.js); rub and oilp for rubber and for oil palm
fn plw(z: f32) -> f32 { let p = z / SEG; let s = i32(floor(p)); let q = p - floor(p); if (zoneOf(s) != 0 || flws(s) || ph(vec2i(s, 63)) < .25 || ph(vec2i(s, 67)) < .3) { return 0.; }
  let e = .72 + (ph(vec2i(s, 72)) - .5) * .12; return ss(.04, .09, q) * (1. - ss(e - .03, e - .006, q)) * (1. - ss(0., .3, tw(z))); }
fn rubk(z: f32) -> f32 { return step(ph(vec2i(i32(floor(z / SEG)), 66)), .7); }
fn rub(z: f32) -> f32 { return plw(z) * rubk(z); }
fn oilp(z: f32) -> f32 { return plw(z) * (1. - rubk(z)); }
fn seas(s: i32) -> bool { let k = zoneOf(s); return k == 3 || k == 5; }
fn seaz(z: f32) -> f32 { let p = z / SEG; let s = i32(floor(p)); let q = (p - floor(p)) * SEG; if (seas(s)) { return 1.; }
  var o = 0.; if (seas(s - 1)) { o = 1. - ss(0., 40., q); } if (seas(s + 1)) { o = max(o, 1. - ss(0., 40., SEG - q)); } return o; }
fn nw(z: f32) -> f32 { return zw(z, 4, .46, .6); }
fn roadX(z: f32) -> f32 { return 60. * sin(z * .004) + 25. * sin(z * .011 + 1.3) + 9. * sin(z * .023 + .7) + sw(z) * 16. * sin(z * .019) + hpx(z); }
fn tunS(s: i32) -> bool { return s != 2 && (ph(vec2i(s, 31)) > .45 || ((s % 4) + 4) % 4 == 2); }      // a hill stretch with a tunnel and not switchbacks (tunS in land.js)
fn hpw(z: f32) -> f32 { let p = z / SEG; let s = floor(p); let si = i32(s); if (zoneOf(si) != 1 || tunS(si)) { return 0.; } let w = select(.24, .47, ph(vec2i(si, 34)) < .5); return 1. - ss(w - .08, w, abs(p - s - .5)); }      // (tgS in land.js: a long pass)
fn hpx(z: f32) -> f32 { let e = hpw(z); if (e <= 0.) { return 0.; } return e * 100. * sin(.0262 * (z - (floor(z / SEG) + .5) * SEG)); }
// 1 where the plots of a flower stretch come up to the road (flwW in the script)
// the cherry stretches (chyAt in src/land.js): 1 a hill whose woods are mostly cherry, 2 a flat stretch with an avenue, 0 neither
// a golden shower stretch (kunAt in land.js): rice, and an avenue of ราชพฤกษ์ down the road
fn kun(z: f32) -> bool { let s = i32(floor(z / SEG)); return zoneOf(s) == 0 && !flws(s) && ph(vec2i(s, 63)) >= .25 && ph(vec2i(s, 67)) < .3; }
fn chy(z: f32) -> i32 { let s = i32(floor(z / SEG)); let k = zoneOf(s); if (k == 1 && ph(vec2i(s, 61)) < .55) { return 1; }
  if (k == 0 && !flws(s) && ph(vec2i(s, 63)) < .25) { return 2; } return 0; }
fn flw(z: f32, twz: f32) -> f32 { let p = z / SEG; let s = i32(floor(p)); if (zoneOf(s) != 0 || !flws(s)) { return 0.; }
  let q = p - f32(s); let r0 = (f32(s) + .3 + (ph(vec2i(s, 71)) - .5) * .12) * SEG; let w0 = 10. + 5. * ph(vec2i(s, 75)); let r1 = (f32(s) + .72 + (ph(vec2i(s, 72)) - .5) * .12) * SEG;
  return ss(0., .03, q) * (1. - ss(.97, 1., q)) * (1. - ss(0., .3, twz)) * ss(w0 + 14., w0 + 30., abs(z - r0)) * ss(18., 34., abs(z - r1)); }
// the lanes of a town leave the road square to it every 36 m. x: signed metres from the middle of the nearest lane, y: metres along it from the road, z: its number
// laneSd in land.js: 0 a lane crossing the street, 1 or -1 one that goes off on that side only (a T junction)
fn lsd(b: f32) -> f32 { if (tlb(b) > .5) { return 0.; } if (ph(vec2i(i32(b), 531)) < .4) { return select(-1., 1., ph(vec2i(i32(b), 532)) < .5); } return 0.; }
fn soi(P: vec2f) -> vec3f {
  let s0 = roadX(P.y + .5) - roadX(P.y - .5); let b0 = round((P.y + s0 * (P.x - roadX(P.y)) - 34.) / 36.); var o = vec3f(99., 0., 0.);
  // (the lane reckoned nearest first; the ones either side of it are only asked where it is far enough off - 14 of the 18 m to half way - that one of them might be nearer)
  for (var j = 0; j < 3; j++) { let b = b0 + f32((j + 1) / 2) * f32(1 - 2 * (j & 1)); let zl = b * 36. + 34.; let s = (roadX(zl + 1.) - roadX(zl - 1.)) * .5; let iv = inverseSqrt(1. + s * s); let d = P - vec2f(roadX(zl), zl);
    let ds = (d.x * s + d.y) * iv; let al = (d.x - d.y * s) * iv; let sd = lsd(b); if (sd != 0. && al * sd < -3.05) { continue; }      // (a lane that goes off on one side only: not on the other - though across the road itself it counts, for its zebra crossing reaches the far kerb; the far edge line, 3.2 m out, is left whole)
    if (abs(ds) < abs(o.x)) { o = vec3f(ds, al, b); }
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
// - and only well inside the town: at its edges, where the houses thin out, there are only lanes (lanel: how long the lane at zl is, by how much town there is at it)
fn tlb(b: f32) -> f32 { let g = floor(b / 10.); return step(abs(b - (g * 10. + 2. + floor(ph(vec2i(i32(g), 520)) * 6.))), .5) * step(.9, tw(b * 36. + 34.)) * (1. - lriv(b * 36. + 34.)); }
// 1 where the lane at zl would come out at the neck of a bridge, onto its rail: there is none there (nearRiv(zl, 16) in land.js)
fn lriv(zl: f32) -> f32 { let r = rivOf(zl); return step(.001, r.y) * step(abs(zl - r.x), r.y * .5 + 16.); }
fn lanel(zl: f32) -> f32 { return mix(26., 160., ss(.5, .9, tw(zl))); }
// 1 along an underpass and its ramps (udOf in land.js, but for the tests of town and river made there): no crossings are painted down in it
fn udk(z: f32) -> f32 { let g0 = floor((z - 34.) / 360.); var o = 0.;
  for (var k = -1; k <= 1; k++) { let g = g0 + f32(k); let zc = (g * 10. + 2. + floor(ph(vec2i(i32(g), 520)) * 6.)) * 36. + 34.; if (ph(vec2i(i32(g), 523)) < .5 && abs(z - zc) < 100.) { o = 1.; } }
  return o; }
// how much wider than the main road's asphalt the street is at z, each side: the frontage roads beside an underpass (svW in land.js, and its underpass
// found with every test udG makes there: the town all round it, no river or sea crossing near)
// how far the street's things are set out square to the road, not along x (svSide in land.js): 1 beside the cutting, easing to 0 from 96 to 136 m out
// how far below the street the road is at z beside an underpass (udip in land.js), with every test of its finding as in svw below - and, as there,
// from the nearest one (bd): two can be 180 m apart, their ramps meeting
fn udd(z: f32) -> f32 { let g0 = floor((z - 34.) / 360.); var o = 0.; var bd = 1e9;
  for (var k = -1; k <= 1; k++) { let g = g0 + f32(k); let zc = (g * 10. + 2. + floor(ph(vec2i(i32(g), 520)) * 6.)) * 36. + 34.; let dz = abs(z - zc);
    if (dz < 96. && dz < bd && ph(vec2i(i32(g), 523)) < .5 && tw(zc) > .6 && tw(zc - 104.) > .6 && tw(zc + 104.) > .6) {
      let r = rivOf(zc); let si = i32(floor(zc / SEG)); let di = abs(zc - (f32(si) + .5) * SEG);
      if (!(r.y > 0. && abs(zc - r.x) < r.y * .5 + 112.) && !(zoneOf(si) == 5 && di > 38. && di < 632.)) { o = 6.2 * (1. - ss(18., 96., dz)); bd = dz; } } }
  return o; }
fn svq(z: f32) -> f32 { let g0 = floor((z - 34.) / 360.); var o = 0.; var bd = 1e9;
  for (var k = -1; k <= 1; k++) { let g = g0 + f32(k); let zc = (g * 10. + 2. + floor(ph(vec2i(i32(g), 520)) * 6.)) * 36. + 34.; let dz = abs(z - zc);
    if (dz < 136. && dz < bd && ph(vec2i(i32(g), 523)) < .5 && tw(zc) > .6 && tw(zc - 104.) > .6 && tw(zc + 104.) > .6) {
      let r = rivOf(zc); let si = i32(floor(zc / SEG)); let di = abs(zc - (f32(si) + .5) * SEG);
      if (!(r.y > 0. && abs(zc - r.x) < r.y * .5 + 112.) && !(zoneOf(si) == 5 && di > 38. && di < 632.)) { o = 1. - ss(96., 136., dz); bd = dz; } } }
  return o; }
fn svw(z: f32) -> f32 { let g0 = floor((z - 34.) / 360.); var o = 0.; var bd = 1e9;
  for (var k = -1; k <= 1; k++) { let g = g0 + f32(k); let zc = (g * 10. + 2. + floor(ph(vec2i(i32(g), 520)) * 6.)) * 36. + 34.; let dz = abs(z - zc);
    if (dz < 136. && dz < bd && ph(vec2i(i32(g), 523)) < .5 && tw(zc) > .6 && tw(zc - 104.) > .6 && tw(zc + 104.) > .6) {
      let r = rivOf(zc); let si = i32(floor(zc / SEG)); let di = abs(zc - (f32(si) + .5) * SEG);
      if (!(r.y > 0. && abs(zc - r.x) < r.y * .5 + 112.) && !(zoneOf(si) == 5 && di > 38. && di < 632.)) { o = 5.4 * (1. - ss(96., 136., dz)); bd = dz; } } }
  return o; }
// signed distance from the road's centre line, measured square to the road on the switchbacks
fn rdist(P: vec2f) -> f32 { return rdz(P).x; }
// rdist, and the z of the road's point it is measured from (rzs in land.js): x the distance, y that z
fn rdz(P: vec2f) -> vec2f {
  // (as rdist in land.js: the road's points tried every 5 m along z over |dx| (up to 60 m), the nearest refined by three steps, and the distance to it, signed by side)
  let dx = P.x - roadX(P.y); let e = hpw(P.y); if (e <= 0.) { return vec2f(dx, P.y); }
  let W = min(abs(dx), 60.); let n = i32(ceil(W / 5.)); var zs = P.y; var bd = 1e18;
  for (var i = -n; i <= n; i++) { var q = P.y; if (n > 0) { q = P.y + W * f32(i) / f32(n); } let ex = P.x - roadX(q); let d2 = ex * ex + (P.y - q) * (P.y - q); if (d2 < bd) { bd = d2; zs = q; } }
  for (var it = 0; it < 3; it++) { let s1 = roadX(zs + .5) - roadX(zs - .5); zs += clamp(((P.x - roadX(zs)) * s1 + (P.y - zs)) / (1. + s1 * s1), -5., 5.); }
  let s2 = roadX(zs + .5) - roadX(zs - .5); let n2 = sqrt(1. + s2 * s2); let ex = P.x - roadX(zs); let ez = P.y - zs;
  let dp = (ex - s2 * ez) / n2; let tq = (ex * s2 + ez) / n2; let k = ss(0., .15, e);
  return vec2f(mix(dx, select(1., -1., dp < 0.) * min(length(vec2f(dp, tq)), sqrt(bd)), k), mix(P.y, zs, k));
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
