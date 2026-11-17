// Fragment stages of the picture: shadow, sky, sea, ground, leaves, branches and made things, boxes (houses, signs...).
@group(0) @binding(1) var tSh: texture_depth_2d;
@group(0) @binding(2) var sSh: sampler_comparison;
@group(0) @binding(3) var tMir: texture_2d<f32>;
@group(0) @binding(4) var sMir: sampler;
@group(0) @binding(5) var tSign: texture_2d<f32>;
fn shadow(wp: vec3f) -> f32 {
  let s = g.sm * vec4f(wp - g.cam.xyz, 1.); let uv = vec2f(s.x * .5 + .5, .5 - s.y * .5);
  if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1. || s.z > 1.) { return 1.; }
  let e = 1.3 / SHADOW_RES; var a = 0.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) { a += textureSampleCompareLevel(tSh, sSh, uv + vec2f(f32(x), f32(y)) * e, s.z - .0012); } }
  let edge = ss(.5, .44, max(abs(uv.x - .5), abs(uv.y - .5)));
  return mix(1., a / 9., edge);
}
// the colour of the far distance in a given direction: the sky's horizon, glowing toward the sun
fn horizon(rd: vec3f) -> vec3f {
  let hd = normalize(vec3f(rd.x, 0., rd.z) + vec3f(1e-5, 0., 0.));
  let sd = max(dot(hd, normalize(vec3f(g.sun.x, 0., g.sun.z) + vec3f(1e-5, 0., 0.))), 0.);
  return g.hor.rgb + g.sunCol.rgb * (pow(sd, 6.) * .05 + pow(sd, 40.) * .08) * ss(-.1, .5, 1. - g.sun.y);
}
fn sky(n: vec3f) -> vec3f { let up = n.y * .5 + .5; return g.amb.rgb * (.30 + .70 * up * up) + g.sunCol.rgb * vec3f(.05, .045, .03) * max(-n.y, 0.); }
fn head(wp: vec3f, n: vec3f) -> vec3f {
  let v = g.cam.xyz - wp; let d = length(v); let l = v / d;
  let cone = ss(.80, .97, dot(-l, g.fwd.xyz));
  return vec3f(1., .93, .78) * g.misc.x * cone * (max(dot(n, l), 0.) * .85 + .15) / (1. + d * d * .003);
}
// the sea: turquoise over the shallows, deep blue further out, waves that mirror the sky and glitter under the sun, foam at the rocks
fn seaC(wp: vec3f, V: vec3f, sh: f32) -> vec3f {
  let t = g.cam.w; let P = wp.xz; let d = distance(g.cam.xyz, wp);
  let u = wp.x - roadX(wp.z) - shoreX(wp.z); let b = bch(wp.z);          // u: metres out from the waterline
  let calm = (.3 + .7 * ss(0., 22., u)) / (1. + d * .012);
  let wv = vec2f(vn(P * .35 + vec2f(t * .5, t * .2)) - .5 + (vn(P * 1.3 - vec2f(t * .6, 0.)) - .5) * .5, vn(P * .35 + vec2f(9., -t * .45)) - .5 + (vn(P * 1.3 + vec2f(3., t * .7)) - .5) * .5);
  let n = normalize(vec3f(wv.x * .5 * calm, 1., wv.y * .5 * calm));
  let L = g.sun.xyz; let R = reflect(-V, n);
  let refl = mix(horizon(R), g.zen.rgb, pow(ss(0., .8, max(R.y, 0.)), .55)) + g.sunCol.rgb * (pow(max(dot(R, L), 0.), 260.) * 3. + pow(max(dot(R, L), 0.), 24.) * .05) * sh;
  let fr = .025 + .975 * pow(1. - max(dot(V, n), 0.), 5.);
  let lc = g.amb.rgb * 1.5 + g.sunCol.rgb * .16;
  var water = mix(vec3f(.008, .085, .20), vec3f(.02, .30, .33), 1. - ss(14., 130., u)) * lc;
  let bed = mix(vec3f(.10, .12, .10), vec3f(.42, .46, .36), b) * lc;         // sand or rock showing through the shallows
  water = mix(bed, water, ss(-1., mix(7., 20., b), u));
  var c = mix(water, refl, fr);
  let roll = u * .17 + t * .5 + vn(P * .045) * 4.;                           // lines of breakers rolling in
  let crest = pow(.5 + .5 * sin(roll), 10.) * ss(38., 5., u) * ss(-1., 3., u) * ss(.3, .65, vn(P * .5 + vec2f(0., t * .15)));
  let lace = ss(2.6, .2, u + swash(wp.z)) * (.55 + .45 * vn(P * 2.2 + vec2f(t * .3, 0.)));
  c = mix(c, g.amb.rgb * 1.2 + g.sunCol.rgb * .25 * sh, clamp(crest * .85 + lace, 0., 1.) * .85);
  return mix(c, horizon(-V), 1. - exp(-d * g.fog.x * .55));
}
fn fogged(c: vec3f, wp: vec3f) -> vec3f {
  let v = wp - g.cam.xyz; let d = length(v); let hc = horizon(v / d);
  return mix(c, hc, max(1. - exp(-d * g.fog.x), ss(g.fog.y * .72, g.fog.y, d)));
}
@fragment fn fsTerrain(i: TO) -> @location(0) vec4f {
  let wp = i.wp; let P = wp.xz; var n = normalize(i.n);
  // px: how much ground one pixel covers (m). A pattern of F cycles to the metre can only be drawn while px * F is well under 1; past that it is
  // faded to its mean value, or it would crawl and sparkle as the car moves. (So: fine grain near, coarser grain further off, tone only far away.)
  // Pf: the place within a 256 m tile, worked out from the position relative to the eye (exact) and the eye's own place in the tile (g.camM,
  // reckoned in double precision by the script). All fine grain is drawn from Pf: an absolute position is only good to millimetres far from the origin.
  let Pf = fract((i.rel.xz + g.camM.xy) / 256.) * 256.;
  let dPx = dpdx(i.rel.xz); let dPy = dpdy(i.rel.xz); let pxa = length(dPx); let pxb = length(dPy); let px = sqrt(max(sqrt(pxa * pxb) * max(pxa, pxb), 1e-10));      // between the pixel's mean size and its long side on the ground
  let n1 = fbm(P * .045); let n2 = vn(P * .55); let n3 = mix(.5, vn(P * 3.7), 1. - ss(.5, 1.4, px * 3.7)); let n4 = mix(.5, vnp(Pf * 14., 3584.), 1. - ss(.5, 1.4, px * 14.));
  let e = .12; let f3 = 1. - ss(.5, 1.4, px * 3.7); let r3 = vn(P * 3.7); let bx = (vn((P + vec2f(e, 0.)) * 3.7) - r3) * f3; let bz = (vn((P + vec2f(0., e)) * 3.7) - r3) * f3;
  let rd = abs(rdist(wp.xz));
  // dry verge: patchy turf over red-brown laterite soil
  // Seen close, the ground has grain: on the turf, blades lying this way and that over dark thatch, straw among the green, hollows between
  // the clumps; on bare earth, grit, small stones, hairline cracks and pale dust where it has baked hard. Beyond 60 m only the tones are left.
  let dcam = length(i.rel); let nk = 1. - ss(16., 60., dcam); let Vg = -i.rel / max(dcam, .01);
  let e2 = .02; let Pr = vec2f(Pf.x * .809 + Pf.y * .588, Pf.y * .809 - Pf.x * .588);      // turned, so the fine grain does not line up with the coarse
  let f5 = 1. - ss(.5, 1.4, px * 34.); let r5 = vn(Pr * 23.) * .6 + vn(Pr * 51. + 7.) * .4; let n5 = mix(.5, r5, f5);
  let fbx = (vn((Pr + vec2f(e2, 0.)) * 23.) * .6 + vn((Pr + vec2f(e2, 0.)) * 51. + 7.) * .4 - r5) * f5; let fbz = (vn((Pr + vec2f(0., e2)) * 23.) * .6 + vn((Pr + vec2f(0., e2)) * 51. + 7.) * .4 - r5) * f5;
  let tfv = turf(P); let rag = (mix(.5, vnp(Pf * 6., 1536.), 1. - ss(.5, 1.4, px * 6.)) * .55 + n5 * .45 - .5) * .17;                 // the turf's edge is ragged: tufts push out over the earth
  let Pb = stkw(Pf); let s1 = stk(Pb, vec2f(.955, .296), 0., px); let s2 = stk(Pb, vec2f(.17, .985), 31., px); let s3 = stk(Pb, vec2f(-.80, .60), 57., px);
  let wsel = vn(P * 1.3 + 5.); let blades = max(mix(s1, s2, ss(.35, .65, wsel)), s3 * .85);
  let straw = vec3f(.27, .22, .08);
  let gcol = mix(mix(vec3f(.085, .135, .025), vec3f(.150, .170, .045), n1), straw * .85, g.fog.w * .75);      // the blades' own colours
  var grass = mix(mix(vec3f(.045, .050, .020), gcol * .45, .5), gcol * 1.2, ss(.42, .82, blades));          // thatch in the gaps, lit blades over it
  grass = mix(grass, straw * 1.05, ss(.74, .9, s3) * ss(.4, .7, vn(P * .7 + 21.)) * .7);                      // dead blades, more in some patches
  grass *= (.62 + .62 * n2) * (.80 + .40 * n3);                                                             // clumps and the hollows between them
  grass = mix(gcol * (.70 + .55 * n2) * (.9 + .2 * n3), grass, nk);
  let graze = pow(1. - max(Vg.y, 0.), 3.);
  grass = mix(grass, mix(gcol, vec3f(dot(gcol, vec3f(.3, .6, .1))), .2), graze * .45);                                        // looking along the ground you see only the tips
  var soil = mix(vec3f(.27, .15, .085), vec3f(.20, .13, .09), pn(P * .21)) * (.68 + .55 * n3);
  soil = mix(soil, vec3f(.34, .24, .155) * (.8 + .3 * n3), ss(.5, .8, vn(P * .9 + 13.)) * .4);
  let gedge = tfv - .40 + rag + graze * .05; let gm = ss(-.03, .03, gedge);                                 // seen along the ground the grass hides the gaps
  if (nk > .01) {
    soil *= 1. + nk * ((n5 - .5) * .7 + (n4 - .5) * .4);
    soil *= 1. - .35 * nk * f5 * ss(.035, .0, abs(vnp(Pf * 4.296875 + 40., 1100.) - .5)) * ss(.45, .7, vn(P * .5 + 3.));
    let pb = pebble(Pr * 17., .22); soil = mix(soil, mix(soil * .7, mix(vec3f(.24, .19, .15), vec3f(.36, .31, .26), pb.y), .75) * (.6 + .6 * pb.z), pb.x * nk * f5);
    let lf = pebble(Pr * vec2f(9., 14.) + 70., .03 + .09 * ss(.5, .8, vn(P * .3))); soil = mix(soil, mix(vec3f(.17, .11, .05), vec3f(.30, .22, .10), lf.y), lf.x * nk * .8 * (1. - ss(.5, 1.4, px * 20.)));      // dry leaves and bits of straw
  }
  var alb = mix(soil * (1. - .28 * ss(-.14, 0., gedge)), grass, gm);                                         // the earth is darker and damper in under the edge of the turf
  var bump = .9; var gloss = .02; var wet = 0.;
  // hill country: darker turf under the forest, bare rock where the slope is steep
  let twz = tw(wp.z); let swz = sw(wp.z); let hz_ = hw(wp.z) * (1. - twz); let slope = 1. - n.y; let nwz = nw(wp.z);
  let fq = P * .012 + vec2f(40., 0.); let fm = (2. * pn(fq) + pn(fq * 2.03 + vec2f(17.1, 9.7))) / 3.; let wood = hz_ * ss(.37, .45, fm);      // the script plants the forest by this same number (fbm, two octaves)
  alb = mix(alb, mix(mix(vec3f(.060, .095, .025), vec3f(.11, .13, .04), n2), vec3f(.10, .075, .04) * (.7 + .6 * n3), ss(.45, .7, vn(P * 1.9 + 3.)) * .6) * (.75 + .4 * n4), wood * .9);      // shaded turf and leaf litter
  let ck = chy(wp.z);
  var canopy = vec3f(.05, .10, .03) * (.7 + .6 * vn(P * .2)); if (ck == 1) { canopy = mix(canopy, vec3f(.40, .12, .22) * (.75 + .5 * vn(P * .13 + 5.)), ss(.25, .45, vn(P * .06 + 11.)) * .85); }      // a cherry hill is pink from far off too
  alb = mix(alb, canopy, wood * ss(120., 300., dcam) * mix(.7, .85, f32(ck == 1)));
  let strata = sin(wp.y * 1.1 + n1 * 7.) * .5 + .5;
  let rk = ss(.30, .50, slope + (n2 - .5) * .14) * max(hz_, swz);
  alb = mix(alb, mix(vec3f(.23, .20, .17), vec3f(.36, .32, .27), strata) * (.6 + .7 * n2) * (.8 + .4 * n4), rk); bump = mix(bump, 2.2, rk);
  // rice paddies
  let fv = flw(wp.z, twz); let pad = ss(mix(44., 10., fv), mix(52., 14., fv), rd) * (1. - ss(0., .15, hw(wp.z))) * (1. - twz) * (1. - ss(0., .15, swz)) * (1. - ss(0., .15, nwz));
  let pc = P / vec2f(28., 22.); let f = fract(pc); let hsh = ph(vec2i(floor(pc)));
  let ed = min(min(f.x, 1. - f.x) * 28., min(f.y, 1. - f.y) * 22.);
  let bund = 1. - ss(.55, .95, ed);
  var field = vec3f(.060, .095, .028) * (.8 + .4 * n3);                                   // wet earth under green rice
  if (hsh < .24) { field = vec3f(.15, .12, .075); wet = 1.; }                              // flooded, newly planted
  else if (hsh >= .62 && hsh < .86) { field = vec3f(.20, .16, .07) * (.8 + .4 * n3); }       // ripe
  else if (hsh >= .86) { field = vec3f(.27, .21, .11) * (.7 + .5 * n4) * (.85 + .15 * sin(P.x * 22.)); }   // cut: stubble in rows
  let sgi = i32(floor(wp.z / SEG));
  if (zoneOf(sgi) == 0 && (sgi == 4 || ph(vec2i(sgi, 51)) < .5) && ph(vec2i(i32(floor(pc.x)) + 50, i32(floor(pc.y)))) < .75) {
    field = vec3f(.075, .085, .035) * (.8 + .4 * n3) * (.85 + .15 * sin(P.x * 9.)); wet = 0.;
    // from far off a field in bloom is a sheet of colour: the ground takes the colour of its flowers where the flowers themselves are too small or too far to draw
    let fcol = select(vec3f(.78, .42, .58), vec3f(.90, .58, .04), ph(vec2i(i32(floor(pc.x)), i32(floor(pc.y)) + 50)) < .8);
    field = mix(field, fcol * .6 * (.8 + .4 * n2), max(.2, ss(35., 110., dcam)) * (.75 + .25 * sin(P.x * 9.))); }      // a flower field: tilled rows
  let bundCol = mix(vec3f(.20, .14, .085), vec3f(.12, .15, .04), ss(.35, .65, n2)) * (.7 + .5 * n3);
  alb = mix(alb, mix(field, bundCol, bund), pad); wet *= pad * (1. - bund);
  // river and canal: muddy grown-over banks, brown-green water; no road is painted across (the bridge carries it)
  let rv = rivOf(wp.z); var rivK = 0.;
  if (rv.y > 0.) {
    let dr = abs(wp.z - rv.x - rivM(wp.x, rv)); rivK = 1. - ss(rv.y * .5 + 1.5, rv.y * .5 + 4., dr); let bankK = 1. - ss(rv.y * .5 + 2., rv.y * .5 + 8., dr);
    var bank = mix(vec3f(.17, .12, .07), vec3f(.09, .13, .04), ss(.3, .7, n2)) * (.7 + .5 * n3);
    if (rv.w < .5) { bank = mix(bank, vec3f(.36, .35, .33) * (.8 + .3 * n4), 1. - ss(rv.y * .5 + .8, rv.y * .5 + 2.6, dr)); }      // a canal has concrete sides
    alb = mix(alb, bank, bankK); wet *= 1. - bankK;
  }
  let lake = ss(.35, .65, i.w) * (1. - ss(0., .1, swz)); wet = max(wet, lake); alb = mix(alb, mix(vec3f(.03, .07, .07), vec3f(.085, .075, .04), rivK), lake);
  bump = mix(bump, .5, pad);
  // the road: gravel shoulders, asphalt, white edge lines, dashed yellow centre line
  let asp = (1. - ss(3.5, 3.75, rd)) * (1. - rivK);
  alb = mix(alb, mix(soil, vec3f(.33, .19, .11), .5) * (.75 + .5 * n3), (1. - ss(3.8, 5.2 + rag * 6., rd)) * .9 * (1. - twz) * (1. - swz) * (1. - rivK));
  // snowfield: everything level lies under snow
  if (nwz > .01) { alb = mix(alb, vec3f(.70, .73, .80) * (.9 + .1 * n2) * (.96 + .04 * n4), nwz * ss(.5, .2, slope + (n2 - .5) * .2)); bump = mix(bump, .25, nwz); gloss = mix(gloss, .3, nwz); }
  // coast road: red-and-white kerb on the sea side; on the land side a red cycle lane, its own kerb, then the foot of the wall
  let dxs = wp.x - roadX(wp.z); let pnw = pinew(wp.z); let swk = swz * (1. - pnw);
  let kerb = mix(vec3f(.72, .72, .69), vec3f(.58, .06, .05), step(.5, fract(Pf.y / 1.6))) * (.85 + .2 * n4);
  alb = mix(alb, kerb, swk * step(0., dxs) * ss(3.7, 3.78, rd) * (1. - ss(4.02, 4.1, rd)));
  alb = mix(alb, vec3f(.36, .115, .085) * (.8 + .3 * n4) * (.9 + .2 * n2), swk * step(dxs, 0.) * ss(3.7, 3.8, rd) * (1. - ss(5.7, 5.78, rd)));
  alb = mix(alb, kerb, swk * step(dxs, 0.) * ss(5.74, 5.8, rd) * (1. - ss(6.05, 6.12, rd)));
  alb = mix(alb, vec3f(.62, .62, .58) * (.85 + .2 * n4), swk * step(dxs, 0.) * ss(.19, .16, abs(rd - 3.95)) * step(.5, fract(wp.z / 2.4)));     // white blocks dividing the red lane from the road
  // the beach: pale dry sand, darker and shining where the waves have just been; rocks are dark and wet at the waterline
  let su = dxs - shoreX(wp.z); let bz_ = bch(wp.z); let sw5 = ss(.25, .5, swz); let damp = ss(-9., -1., su + swash(wp.z));
  let sandM = sw5 * bz_ * ss(17., 24., dxs);
  let sand = mix(vec3f(.40, .345, .24), vec3f(.21, .175, .12), damp) * (.9 + .15 * n2) * (.93 + .12 * n4) * (.97 + .03 * sin(su * 7. + n2 * 9.));
  alb = mix(alb, sand, sandM); bump = mix(bump, .3, sandM); gloss = mix(gloss, .5 * damp, sandM);
  alb *= 1. - .5 * sw5 * (1. - bz_) * ss(-2.5, 0., su);
  let pin0 = mix(mix(6.15, 4.15, step(0., dxs)), 3.85, pnw);
  alb = mix(alb, mix(vec3f(.30, .19, .10), vec3f(.36, .30, .20), ss(.4, .7, n2)) * (.7 + .5 * n3) * (.85 + .3 * n4), pnw * ss(pin0, pin0 + .5, rd) * (1. - ss(mix(17., 30., step(dxs, 0.)), mix(23., 40., step(dxs, 0.)), abs(dxs))) * .9 * (1. - sandM));
  // in town. Behind the street the land is yards of swept earth and rough grass, cut by lanes (ซอย) of patched concrete that leave the
  // main road every 36 m. The shophouses stand on a concrete apron poured in bays; along the road a tiled footpath and a painted kerb.
  var zebra = 0.;
  if (twz > .01) {
    let so = soi(P); let tk = twz * (1. - rivK);
    let yard = mix(mix(soil, vec3f(.30, .235, .165) * (.75 + .4 * n3), .45), grass * .92, ss(-.03, .03, tfv - .52 + rag));      // swept earth, grass only where nobody walks
    alb = mix(alb, yard, tk);
    let cq = fract(P / 3.2); let cj = ss(0., .025, min(min(cq.x, 1. - cq.x), min(cq.y, 1. - cq.y)));
    let conc = vec3f(.30, .29, .27) * (.75 + .35 * n2) * (.85 + .3 * n4) * (.78 + .22 * cj);
    alb = mix(alb, mix(conc, conc * vec3f(.62, .6, .56), ss(.55, .8, vn(P * .21 + 3.)) * .6), tk * (1. - ss(25.5, 27.5 + n2 * 2., rd)));
    let lane = (1. - ss(1.85, 2.05, abs(so.x))) * step(abs(so.y), 160.);
    let lcol = vec3f(.21, .205, .20) * (.72 + .4 * n2) * (.85 + .3 * n4) * (.78 + .22 * ss(0., .03, abs(fract(so.y / 5.) - .5)));
    alb = mix(alb, mix(lcol, vec3f(.075, .075, .08) * (.8 + .4 * n4), ss(.5, .7, vn(P * .13 + so.z))), tk * lane);     // some lengths resurfaced in asphalt
    alb = mix(alb, vec3f(.20, .15, .10) * (.7 + .5 * n3), tk * (1. - lane) * (1. - ss(2.0, 2.9, abs(so.x))) * ss(26., 28., rd) * .7);      // worn earth at the lane's edges
    let ft = 1. - ss(.5, 1.4, px * 5.); let tq = fract(Pf / .4); let joint = mix(.8, ss(0., .06, min(min(tq.x, 1. - tq.x), min(tq.y, 1. - tq.y))), ft);
    let tile = mix(vec3f(.34, .33, .32), vec3f(.40, .27, .22), mix(.5, step(.5, fract((floor(Pf.x / .4) + floor(Pf.y / .4)) * .5)), ft) * .55);      // grey and brick-red paving blocks
    let kb = mix(kerb, mix(vec3f(.72, .72, .69), vec3f(.74, .58, .06), step(.5, fract(Pf.y / 1.6))) * (.85 + .2 * n4), step(.5, fract(so.z * .37))); let kbare = step(.6, fract(so.z * .61));      // four blocks in ten have bare kerbs
    let pave = mix(tile * (.8 + .25 * n4) * (.68 + .32 * joint), mix(kb, vec3f(.50, .49, .46) * (.85 + .2 * n4), kbare), 1. - ss(3.95, 4.02, rd));
    alb = mix(alb, pave, tk * (1. - ss(7.7, 8.0, rd)) * (1. - lane * ss(4.0, 4.1, rd))); bump = mix(bump, .3, twz);
    let zc = abs(so.x - 5.5);
    zebra = twz * step(zc, 1.6) * step(rd, 3.0) * step(.5, fract(dxs / 1.1)) * step(fract(so.z * .5), .25);
  }
  var road = vec3f(.034, .035, .038) * (.72 + .5 * n4) * (.85 + .3 * n2);
  road = mix(road, vec3f(.52, .52, .48), ss(.08, .04, abs(rd - 3.2)));
  road = mix(road, vec3f(.58, .42, .04), ss(.09, .05, rd) * max(step(.5, fract(wp.z / 9.)), ss(0., .2, hpw(wp.z))));      // a solid line round the switchbacks
  road = mix(road, vec3f(.55, .55, .52) * (.8 + .25 * n4), zebra);
  road = mix(road, vec3f(.56, .58, .63) * (.9 + .1 * n4), nwz * .85 * (1. - ss(.55, .25, min(abs(rd - .95), abs(rd - 2.55)))) * ss(.3, .6, vn(P * .45) + .15));      // snow on the road, worn away in the wheel tracks
  alb = mix(alb, road, asp); bump = mix(bump, .25, asp); gloss = mix(gloss, .22, asp);
  // under the cherries: fallen petals, on the verges and the road's edges and (on a cherry hill) all through the wood; fewer where the wheels run
  if (ck > 0 && nk > .01) {
    var area = 1. - ss(9., 17., rd); if (ck == 1) { area = max(area, wood * .8); }
    let pc = P * 10.; let ci = floor(pc); let pd = length(fract(pc) - .5 - (vec2f(h2(ci + 7.3), h2(ci + 19.1)) - .5) * .55);
    let dens = area * (.12 + .50 * vn(P * .35 + 3.)) * (1. - .75 * asp * ss(3.1, 2.2, rd));
    let pet = step(h2(ci), dens) * ss(.26, .18, pd) * nk * (1. - ss(.5, 1.4, px * 10.));
    alb = mix(alb, mix(vec3f(.62, .16, .30), vec3f(.84, .46, .58), h2(ci + 3.1)), pet * .92);
  }
  n = normalize(n - vec3f(bx + fbx * nk * 1.4 * (1. - asp * .7), 0., bz + fbz * nk * 1.4 * (1. - asp * .7)) * bump * (1. - wet));
  let L = g.sun.xyz; let V = normalize(g.cam.xyz - wp);
  let ndl = max(dot(n, L), 0.);
  let sh = shadow(wp + normalize(i.n) * .12);
  let E = g.sunCol.rgb * sh;
  var c = alb * (E * ndl + sky(n));
  c += E * pow(max(dot(n, normalize(V + L)), 0.), 24.) * ndl * gloss;
  c += alb * head(wp, n);
  // street lamps in town throw warm pools of light on the road at night
  let zk = round((wp.z - 16.) / 32.) * 32. + 16.; let ld = length(vec2f(wp.x - (roadX(zk) - 3.4), wp.z - zk));
  c += alb * vec3f(1., .72, .36) * (g.misc.w * max(twz, swz) * 2.6 * ss(24., 3., ld) / (1. + ld * ld * .03));
  // standing water in the flooded plots mirrors the sky, with a little mud showing when you look straight down
  if (wet > .01) {
    let t = g.cam.w; var rip = vec3f(vn(P * 1.3 + vec2f(t * .3, 0.)) - .5, 0., vn(P * 1.3 + vec2f(7., t * .25)) - .5) * .05;
    if (g.sun.w > .01) { let rc = P * 1.7; let rf_ = fract(rc) - .5; let rh = h2(floor(rc)); let tp = fract(t * 1.4 + rh * 7.); let rl = length(rf_); rip += vec3f(rf_.x, 0., rf_.y) / max(rl, .01) * (sin((rl - tp * .5) * 42.) * ss(.5, .1, rl) * ss(.08, .0, abs(rl - tp * .5)) * (1. - tp) * .5 * g.sun.w); }      // rings where the drops fall
    let wn = normalize(vec3f(0., 1., 0.) + rip); let R = reflect(-V, wn);
    let refl = mix(horizon(R), g.zen.rgb, pow(ss(0., .8, max(R.y, 0.)), .55)) + g.sunCol.rgb * pow(max(dot(R, L), 0.), 500.) * 2.5 * sh;
    let fr = .05 + .95 * pow(1. - max(dot(V, wn), 0.), 4.);
    c = mix(c, mix(c * .6, refl, max(fr, lake * .35)), wet);
  }
  // rain: the road darkens and shines, puddles mirror the sky
  let rw = g.amb.w;
  if (rw > .01) {
    let pud = ss(.42, .68, vn(P * .33) * .7 + n2 * .3); let kk = rw * (asp * (.3 + .7 * pud) + (1. - asp) * .15 * pud);
    let Rr = reflect(-V, normalize(mix(n, vec3f(0., 1., 0.), .85))); let rf = mix(horizon(Rr), g.zen.rgb, pow(ss(0., .8, max(Rr.y, 0.)), .55)) + g.sunCol.rgb * pow(max(dot(Rr, L), 0.), 200.) * sh;
    c = mix(c * (1. - .3 * rw), rf, clamp((.04 + .96 * pow(1. - max(V.y, 0.), 5.)) * 1.7, 0., 1.) * kk);
    // drops bursting on the road: each one a small bright point where it lands and a ring that spreads from it and fades (round, as a splash is)
    let dq = Pf * 5.; let di = floor(dq); let dh = h2(di); let dt = g.cam.w * (2.2 + dh) + dh * 7.; let dp = fract(dt);
    let dOn = step(1. - (.12 + .3 * g.sun.w), h2(di + floor(dt) * 3.7));
    let dr = length(fract(dq) - .5 - (vec2f(h2(di + 1.3), h2(di + 2.7)) - .5) * .5);
    let splash = (ss(.03, .0, abs(dr - dp * .22)) * (1. - dp) + ss(.05, .0, dr) * step(dp, .18) * 1.5) * dOn * (1. - ss(.5, 1.4, px * 20.));
    c += (g.amb.rgb + g.sunCol.rgb * .1) * (splash * .45 * g.sun.w * asp);
  }
  let land = fogged(c, wp);
  let seaM = sw5 * ss(-.15, .15, su + swash(wp.z));
  if (seaM > .001) { return vec4f(mix(land, seaC(wp, V, sh), seaM), 1.); }
  return vec4f(land, 1.);
}
@fragment fn fsLeaf(i: LO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var n = normalize(i.n); if (!ff) { n = -n; }
  let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  var alb = i.col * mix(.50, 1.18, i.uv.y) * (.74 + .26 * ss(0., .3, abs(i.uv.x)));
  var trv = i.pr.y;
  if (i.pr.y > 39.) {          // a spray of cherry blossom: small round five-petalled flowers set close together, a few gaps, each with a darker eye
    let sd = (i.pr.y - 41.) / 4.; trv = .55;
    let q = vec2f(i.uv.x * 1.5 + 1.5 + .35 * sin(i.uv.y * 9. + sd * 20.), i.uv.y * 5. + .3 * sin(i.uv.x * 5. + sd * 31.)); let cl = floor(q); let hh = h2(cl + sd * 37.); let hh2 = h2(cl * 1.7 + sd * 11. + 5.);
    let dd = fract(q) - .5 - (vec2f(hh, fract(hh2 * 7.3)) - .5) * .5; let rr = length(dd); let an = atan2(dd.y, dd.x) + hh * 6.;
    if (hh2 < .2 || rr > .17 + .16 * fract(hh * 5.7) + .11 * abs(cos(an * 2.5))) { discard; }      // each flower its own size and place in its cell, so no grid shows
    alb = mix(i.col * vec3f(.55, .22, .30), i.col * (.92 + .3 * hh), ss(.04, .15, rr));
  } else
  if (i.pr.y > 29.) {          // banana leaf, cut from the strip: a long paddle with a wavy edge and a round end, a thick pale midrib, close veins running out to the edge, and notches torn in along the veins - few on a young leaf, many and deep on an old one
    let sd = (i.pr.y - 31.) / 4.; let ax = abs(i.uv.x); let v = i.uv.y; trv = .5;
    var wv = min(pow(ss(0., .12, v), .65), sqrt(max(1. - pow(max(v - .80, 0.) / .20, 2.), 0.))) * (.84 + .16 * sin(3.14159 * v));
    wv *= 1. - .05 * sin(v * 46. + sd * 40.) - .03 * sin(v * 17. + sd * 9.);
    if (ax > wv && (ax > .07 || v > .3)) { discard; }
    let sg = step(0., i.uv.x); let s = v * 24. - ax * 2.4 + sd * 7.; let cell = floor(s);
    let hs = h2(vec2f(cell + sg * 57., sd * 53. + 3.)); let hd = h2(vec2f(cell * 1.7 + sg * 31., sd * 17. + 1.)); let amt = .10 + sd * .62;
    if (hs < amt && v > .1) { let dep = wv * (.10 + .8 * hd * (1. - .45 * sd)); if (ax > dep && fract(s) < (.14 + .4 * hd) * (.55 + sd) * (ax - dep) / max(wv - dep, .02)) { discard; } }
    let vein = .91 + .09 * sin(s * 31.);
    alb = i.col * vein * mix(1.12, .86, ax / max(wv, .05)) * mix(.88, 1.08, v);
    alb = mix(alb, vec3f(.40, .45, .15), ss(.085, .03, ax));
    alb = mix(alb, vec3f(.24, .17, .07), ss(.8, 1., ax / max(wv, .05)) * ss(.45, .9, sd) * .8);
  } else
  if (i.pr.y > 19.) {          // a flower seen from above or the side: eight petals round a dark eye
    trv = .7; let q = vec2f(i.uv.x, i.uv.y * 2. - 1.); let rr = length(q); let an = atan2(q.y, q.x);
    if (rr > .52 + .44 * abs(cos(an * 4.))) { discard; }
    alb = mix(i.col * (.75 + .4 * rr) * (.9 + .1 * cos(an * 8.)), i.col * vec3f(.35, .22, .08), ss(.26, .18, rr));
  } else
  if (i.pr.y > 9.) {           // casuarina: a hanging spray of long thin needles
    trv = 1.;
    if (distance(g.cam.xyz, i.wp) < 75.) {
      let sx = i.uv.x * 3.4 * (1. + i.uv.y * .35) + sin(i.uv.y * 4. + i.uv.x * 2.) * .12; let fr = abs(fract(sx) - .5);
      if (fr > .13 && !(abs(i.uv.x) < .07 && i.uv.y < .5)) { discard; }
      alb = i.col * (.8 + .5 * h2(vec2f(floor(sx), 3.))) * mix(.7, 1.15, i.uv.y);
    } else { alb = i.col * .8; }
  } else
  if (i.pr.y > 1.5) {          // a sprig of a broadleaf tree: four pairs of leaves and one at the tip, on a thin twig
    let sd = (i.pr.y - 3.) * .25; trv = 1.; let ax = abs(i.uv.x); let dcam = distance(g.cam.xyz, i.wp);
    if (dcam > 60.) { let q = vec2f(i.uv.x, i.uv.y * 2. - 1.); if (dot(q, q) > 1.) { discard; } alb = i.col * .95; }
    else {
      let yy = i.uv.y * 4. - ax * 1.3 + .25; let j = floor(yy); let fy = fract(yy);
      let q = vec2f((ax - .54) / .45, (fy - .5) / .40);
      let lf = step(dot(q, q), 1.) * step(0., j) * step(j, 3.);
      let qt = vec2f(i.uv.x / .34, (i.uv.y - .86) / .14); let tip = step(dot(qt, qt), 1.);
      let twig = step(ax, .04) * step(i.uv.y, .8);
      if (max(max(lf, tip), twig) < .5) { discard; }
      let id = h2(vec2f(j + sign(i.uv.x) * 7. + tip * 31., sd * 97.));
      let rib = mix(ss(.0, .16, abs(q.y)), ss(.0, .12, abs(qt.x)), tip);                      // the pale midrib of each leaf
      let vein = .92 + .08 * sin((ax + abs(q.y) * .8) * 46.);
      alb = i.col * (.72 + .5 * id) * mix(1.25, 1., rib) * vein * mix(1., .78, ss(.6, 1., dot(q, q)) * (1. - tip));
      alb = mix(alb, i.col * vec3f(1.5, 1.35, .7), step(.93, id) * .6);                           // the odd yellowing leaf
      if (twig > .5 && max(lf, tip) < .5) { alb = vec3f(.10, .075, .05); trv = 0.; }
      n = normalize(n + (vec3f(id, h2(vec2f(id * 9., 3.)), h2(vec2f(id * 5., 8.))) - .5) * .7);   // every leaf faces its own way
    }
  }
  let ndl = dot(n, L);
  let ao = i.pr.x;
  let E = g.sunCol.rgb * shadow(i.wp + L * .2);
  // light through the leaf from behind: warm and bright, the look of living foliage
  let through = (max(-ndl, 0.) * .8 + .1) * trv;
  var c = alb * E * (max(ndl, 0.) + through * vec3f(1.35, 1.3, .65));
  c += alb * (sky(n) + sky(-n) * .45) * ao;
  c += (E + sky(n) * .6) * pow(max(dot(n, normalize(V + L)), 0.), 28.) * (.10 + .55 * g.amb.w) * max(ndl, .15 * g.amb.w);      // wet leaves glisten
  c += E * alb * pow(max(dot(-V, L), 0.), 5.) * .5 * ao;
  c += alb * head(i.wp, n) * 1.2;
  return vec4f(fogged(c, i.wp), 1.);
}
@fragment fn fsBranch(i: BO) -> @location(0) vec4f {
  let n = normalize(i.n); let L = g.sun.xyz;
  let fur = vn(vec2f(i.uv.x * 26., i.uv.y * .9)) * .6 + vn(vec2f(i.uv.x * 60., i.uv.y * 3.)) * .4;
  var alb = mix(vec3f(.045, .032, .024), vec3f(.20, .15, .105), ss(.3, .7, fur)) * (.8 + .4 * vn(i.wp.xy * 7.));
  var nb = n;
  if (i.m < .5) {
    let fx = vn(vec2f(i.uv.x * 26. + .6, i.uv.y * .9)) * .6 + vn(vec2f(i.uv.x * 60. + 1.2, i.uv.y * 3.)) * .4;
    let tg = normalize(cross(vec3f(0., 1., 0.), n) + vec3f(1e-4, 0., 0.)); nb = normalize(n - tg * (fx - fur) * 2.2);
    alb *= .55 + .9 * ss(.25, .75, fur);                                                             // deep in the furrows it is dark
    alb = mix(alb, vec3f(.30, .33, .25), ss(.62, .8, vn(i.wp.xy * 1.7 + i.wp.z)) * .55);              // pale lichen
    alb *= (.8 + .2 * vn(vec2f(i.uv.x * 7., i.uv.y * 11.))) * (1. - .35 * g.amb.w);                                             // cross cracks
  }
  if (i.m > .5) { alb = vec3f(.40, .39, .37) * (.8 + .3 * vn(i.wp.xy * 9.)); }
  if (i.m > 1.5) { alb = vec3f(.012); }
  if (i.m > 2.5) { alb = mix(vec3f(.16, .22, .07), vec3f(.24, .22, .10), fur); }
  if (i.m > 2.5 && i.m < 3.5) { alb = mix(alb, vec3f(.22, .15, .08), ss(.55, .8, vn(vec2f(i.uv.x * 9., i.uv.y * 2.))) * .6); }   // dry brown sheaths on banana stems
  if (i.m > 3.5) { alb = mix(vec3f(.16, .11, .07), vec3f(.30, .24, .18), fur); }      // fence wood, weathered
  if (i.m > 4.5) { alb = vec3f(.46, .47, .48) * (.85 + .2 * fur); }
  if (i.m > 5.5) { alb = mix(vec3f(.22, .04, .10), vec3f(.32, .08, .14), fur); }                    // banana flower bud
  if (i.m > 6.5) { alb = vec3f(.80, .79, .75) * (.88 + .14 * fur); }                                // whitewash (a chedi)
  if (i.m > 7.5) { alb = vec3f(.82, .62, .12); }                                                    // gilding
  if (i.m > 8.5) { alb = mix(vec3f(.16, .26, .04), vec3f(.30, .36, .07), ss(.3, .7, vn(i.wp.xz * 9. + i.wp.y * 5.))) * (.85 + .2 * fur); }      // green bananas on the bunch
  if (i.m > 9.5) { let st = vn(vec2f(i.uv.x * 44., i.uv.y * 1.3)); alb = mix(vec3f(.30, .22, .11), vec3f(.52, .42, .23), st) * (.85 + .3 * fur); alb = mix(alb, vec3f(.15, .10, .06), ss(.62, .88, vn(vec2f(i.uv.x * 7., i.uv.y * 2.2))) * .6); }      // foot of a banana stem: dry brown sheaths, stringy, with dark patches
  if (i.m > 10.5) { let st = vn(vec2f(i.uv.x * 30., i.uv.y * 1.1)); alb = mix(vec3f(.30, .38, .11), vec3f(.46, .47, .20), st); alb = mix(alb, vec3f(.30, .21, .10), ss(.5, .8, vn(vec2f(i.uv.x * 6., i.uv.y * 1.4))) * .6); }      // top of the stem: yellow-green sheaths, streaked brown      // banana stem: pale green, with brown dried sheaths
  let E = g.sunCol.rgb * shadow(i.wp + n * .08);
  var c = alb * (E * max(dot(nb, L), 0.) + sky(nb) * .8) + alb * head(i.wp, nb);
  return vec4f(fogged(c, i.wp), 1.);
}
// what a mirror shows: the sky, and below the horizon the land behind with the road running away over it
fn mirEnv(wp: vec3f, R: vec3f) -> vec3f {
  var c = mix(horizon(R), g.zen.rgb, pow(ss(0., .8, max(R.y, 0.)), .55));
  if (R.y < -.004) {
    let t = 1.1 / -R.y; let P = wp.xz + R.xz * t; let rd = abs(rdist(P)); let twz = tw(P.y);
    var gc = mix(mix(vec3f(.10, .13, .04), vec3f(.28, .27, .25), twz) * (.8 + .4 * vn(P * .2)), vec3f(.034, .035, .038), 1. - ss(3.5, 3.8, rd));
    gc = mix(gc, vec3f(.5), ss(.12, .05, abs(rd - 3.2))); gc = mix(gc, vec3f(.55, .40, .04), ss(.12, .05, rd) * step(.5, fract(P.y / 9.)));
    gc = mix(gc, vec3f(.07, .11, .04) * (.7 + .6 * vn(P * .07)), ss(9., 16., rd) * (1. - twz));                                 // the trees and fields beyond the verge, as a darker green
    gc *= g.amb.rgb * 1.3 + g.sunCol.rgb * .45;
    c = mix(gc, horizon(R), max(1. - exp(-t * g.fog.x * 1.5), ss(150., 340., t)));
  }
  return c;
}
// The car: one smooth shell. Where the glass, lamps, grille, arches and seams lie is decided here from the place on the body
// (lp: x to the left, y up, z ahead, metres). m: 0 body, 1 a wheel (lp then is measured from its hub), 2 dark inner parts, 3 plain paint.
@fragment fn fsCar(i: CO) -> @location(0) vec4f {
  let n = normalize(i.n); let V = normalize(g.cam.xyz - i.wp); let L = g.sun.xyz; let lp = i.lp; let ax = abs(lp.x); let night = g.misc.w;
  if (i.m > 3.5) {             // the cabin: lit softly by the sky through the glass
    var nn = n; if (dot(nn, V) < 0.) { nn = -nn; }
    let mi = i32(i.m + .5); var a = vec3f(.030, .030, .034) * (.75 + .5 * vn(lp.xz * 120. + lp.y * 70.)); var em = vec3f(0.); var rf = 0.;
    if (mi == 4) {
      if (lp.y < .975 && lp.y > .88 && nn.z < -.3) { a = vec3f(.075, .05, .035) * (.85 + .3 * vn(lp.xy * 60.)); a *= .4 + .6 * step(.004, abs(lp.y - .965)); }      // a stitched leather band across the fascia
      let vx = min(min(abs(lp.x - .68), abs(lp.x + .70)), min(abs(lp.x - .12), abs(lp.x + .1)));
      if (vx < .065 && lp.y > .905 && lp.y < .955 && nn.z < -.3) { a = vec3f(.008) + vec3f(.03) * step(.6, fract(lp.y * 110.)); }                                  // air vents
      let gq = vec2f(lp.x + .36, lp.y - 1.012);
      if (abs(gq.x) < .135 && abs(gq.y) < .048 && nn.z < -.35) {                                                                                                  // the instruments under their hood
        a = vec3f(.004); let sp = g.sunCol.w;
        for (var k = 0; k < 2; k++) { let c0 = vec2f(mix(-.068, .068, f32(k)), -.004); let q = gq - c0; let r = length(q); let an = atan2(q.x, -q.y);
          let val = mix(clamp(sp / 240., 0., 1.), clamp(.12 + sp / 200., 0., 1.), f32(k)); let na = mix(-2.3, 2.3, val);
          em += vec3f(.75, .8, .9) * (step(abs(r - .040), .0012) + step(abs(fract(an * 2.6 + .5) - .5), .06) * step(.031, r) * step(r, .039) * step(abs(an), 2.4)) * .9;
          em += vec3f(1., .16, .08) * step(abs(sin(an - na) * r), .0016) * step(0., cos(an - na)) * step(r, .034) * 2.;
          em += vec3f(.5) * step(r, .006); }
      }
    }
    if (mi == 5) { a = vec3f(.022, .021, .02) * (.8 + .4 * vn(i.wp.xy * 300.)); if (lp.x > 1.5) { a = vec3f(.05, .05, .055); } rf = .04; }
    if (mi == 7) { a = vec3f(.13, .128, .122) * (.9 + .15 * vn(lp.yz * 150. + lp.x * 90.)); }
    if (mi == 8) { let q = lp.xy; a = vec3f(.004); let rd = step(abs(fract(q.x * 14. + q.y * 6.) - .5), .03) + step(abs(fract(q.y * 22. - q.x * 5.) - .5), .04);
      em = (vec3f(.02, .05, .09) + vec3f(.10, .16, .22) * rd + vec3f(.9, .5, .1) * step(length(q - vec2f(.01, -.005)), .006)) * step(abs(q.x - .005), .132) * step(abs(q.y), .044) * .8; }
    if (mi == 9) {             // mirror glass: flat, so it gives a true picture; a dark rim; in the inside mirror the rear window framed by the cabin
      let q = lp.xy; let Rm = reflect(-V, nn); var mc = mirEnv(i.wp, Rm) * .9;
      let bk = -vec3f(sin(g.res.z), 0., cos(g.res.z)); let rt = normalize(cross(bk, vec3f(0., 1., 0.))); let dzm = dot(Rm, bk);
      if (g.res.w > .5 && dzm > .05) { let um = vec2f(dot(Rm, rt) / dzm / 1.45, Rm.y / dzm / .725); if (abs(um.x) < 1. && abs(um.y) < 1.) { mc = textureSampleLevel(tMir, sMir, vec2f(um.x * .5 + .5, .5 - um.y * .5), 0.).rgb * .92; } }
      if (lp.z > .5) { let win = ss(.80, .74, abs(q.x)) * ss(.62, .50, abs(q.y - .12)); let hd = step(length(vec2f((abs(q.x) - .5) / .2, (q.y + .9) / .55)), 1.); mc = mix(vec3f(.014, .014, .016), mc * .8, win * (1. - hd)); }
      let rim = ss(.90, .97, max(abs(q.x), abs(q.y) * mix(1., .93, lp.z)));
      return vec4f(mix(mc, vec3f(.01), rim), 1.);
    }
    let Rc = reflect(-V, nn); let envc = mix(horizon(Rc), g.zen.rgb, pow(ss(0., .8, max(Rc.y, 0.)), .55));
    let lit = sky(nn) * .85 + g.sunCol.rgb * (.05 + .10 * max(nn.y, 0.) * ss(.5, 1.1, lp.z));
    return vec4f(a * lit + envc * rf + em * (.6 + .6 * g.misc.w), 1.);
  }
  if (dot(n, V) < -.05) { discard; }                       // nothing of the shell is seen from within
  var alb = vec3f(.30, .017, .02); var gloss = 1.; var refl = .5; var emi = vec3f(0.);
  if (i.m > 1.5 && i.m < 2.5) { alb = vec3f(.012); gloss = 0.; refl = 0.; }
  else if (i.m > .5 && i.m < 1.5) {
    let r = length(lp.yz); let a = atan2(lp.y, lp.z);
    if (r > .228) { alb = vec3f(.02) * (.75 + .35 * step(.5, fract(a * 11.)) * step(.338, r)); gloss = .1; refl = .02; }
    else { let sp = abs(fract(a / 6.2832 * 5.) - .5); let spoke = max(step(sp, .13 + .12 * (1. - r / .228)), max(step(r, .055), step(.2, r))); alb = mix(vec3f(.012), vec3f(.50, .51, .53), spoke); gloss = spoke; refl = .35 * spoke; }
  } else if (i.m < .5) {
    let belt = 1.04 + (1.05 - lp.z) * .04;
    let dw = min(length(vec2f(lp.z - 1.325, lp.y - .34)), length(vec2f(lp.z + 1.325, lp.y - .34)));
    if (ax > .45 && dw < .41) { discard; }                  // the wheel arches are cut out of the shell
    if ((ax > .45 && dw < .475) || lp.y < .37) { alb = vec3f(.022); gloss = .08; refl = .03; }      // dark plastic round the arches and under the sills
    let side = step(.5, abs(n.x)) * step(belt + .035, lp.y) * step(n.y, .62) * step(-1.42, lp.z) * step(lp.z, .58) * step(.045, abs(lp.z + .14));
    let quarter = step(.5, abs(n.x)) * step(belt + .05, lp.y) * step(n.y, .55) * step(-1.74, lp.z) * step(lp.z, -1.5);
    let screen = step(.33, n.z) * step(1.16, lp.y) * step(abs(n.x), .42) * step(lp.z, .98);
    let rear = step(n.z, -.3) * step(1.24, lp.y) * step(abs(n.x), .42) * step(lp.z, -1.3) * step(n.y, .93);
    if (max(max(side, quarter), max(screen, rear)) > .5) { alb = vec3f(.008, .010, .012); gloss = 2.; refl = .95; }
    else if (ax > .5 && abs(lp.y - (belt + .02)) < .012 && lp.z > -1.9 && lp.z < .62 && abs(n.x) > .4) { alb = vec3f(.40, .41, .43); gloss = 1.6; refl = .85; }      // a bright strip under the windows
    else if (abs(n.x) > .45 && lp.y > belt + .03 && lp.z > -1.92 && lp.z < .66 && n.y < .7) { alb = vec3f(.012); gloss = .5; refl = .2; }                       // pillars and window surrounds, black
    else {
      let seam = min(min(abs(lp.z - .60), abs(lp.z + .14)), abs(lp.z + 1.02));
      if (ax > .6 && lp.y > .38 && lp.y < belt + .02 && seam < .006) { alb *= .25; refl = .1; }       // door shuts
      if (ax > .86 && abs(lp.y - (belt - .09)) < .012 && (abs(lp.z - .28) < .07 || abs(lp.z + .5) < .07)) { alb = vec3f(.4); }      // door handles
    }
    let face = step(.4, n.z) * step(1.82, lp.z); let gw = .46 - .10 * (.80 - lp.y) / .18;
    if (face > .5) {
      if (lp.y > .62 && lp.y < .80 && ax < gw) {                                             // the grille: wide and shallow, dark bars, a bright strip along its foot
        alb = vec3f(.006) + vec3f(.045) * step(.62, fract(lp.y * 44.)) * step(.08, fract(lp.x * 9.)); gloss = .4; refl = .08;
        if (lp.y < .632) { alb = vec3f(.42, .43, .45); gloss = 1.5; refl = .8; }
      }
      if (lp.y >= .45 && lp.y < .59 && ax < .27 && lp.y > .465 && lp.y < .575) { alb = vec3f(.60); gloss = .2; refl = .1; }      // a blank front plate
      if (lp.y < .45) {                                                                     // the valance: dark, a slatted intake, a vent at each side with a strip of light, a silver guard
        alb = vec3f(.02); gloss = .08; refl = .03;
        if (ax < .5 && lp.y > .30 && lp.y < .42) { alb = vec3f(.005) + vec3f(.03) * step(.7, fract(lp.y * 50.)); }
        if (ax > .60 && ax < .78 && lp.y > .33) { alb = vec3f(.008); if (lp.y > .425 && lp.y < .44) { alb = vec3f(.6); emi = vec3f(1., .93, .75) * (g.misc.x * 2.); } }
        if (lp.y < .295 && ax < .45) { alb = vec3f(.34, .35, .36); gloss = .8; refl = .4; }
      }
    }
    let lampTop = .845 - (ax - .46) * .10;
    if (lp.z > 1.7 && lp.y > .735 && lp.y < lampTop && ax >= gw + .004 && ax < .87 && (face > .5 || (ax > .8 && lp.y < .81))) {      // head lamps: they start at the grille's corners and narrow round onto the wings
      alb = vec3f(.025, .027, .03); gloss = 2.; refl = .9;
      if (lp.y > lampTop - .017) { alb = vec3f(.75); emi = vec3f(.9, .94, 1.) * (.6 + 1.6 * g.misc.x); }                                      // the running light along the top edge
      if (min(length(vec2f(ax - .57, lp.y - .782)), length(vec2f(ax - .67, lp.y - .778))) < .026) { alb = vec3f(.65); emi = vec3f(1., .95, .82) * g.misc.x * 6.; }
    }
    if (lp.z < -1.9 && lp.y < .49) { alb = vec3f(.02); gloss = .08; refl = .03; }                              // rear lower bumper
    if (lp.z < -1.93 && lp.y > .93 && lp.y < 1.035 && ax > .28 && ax < .86) { alb = vec3f(.30, .008, .008); refl = .5; emi = vec3f(.9, .03, .02) * (.12 + 1.3 * night + .9 * step(.5, g.misc.x)); }   // tail lamps
    if (lp.z < -2.08 && ax < .26 && lp.y > .60 && lp.y < .74) { alb = vec3f(.62); refl = .1; }                    // a blank number plate
  }
  let ndl = max(dot(n, L), 0.); let E = g.sunCol.rgb * shadow(i.wp + n * .06);
  let R = reflect(-V, n); let env = mix(horizon(R), g.zen.rgb, pow(ss(0., .8, max(R.y, 0.)), .55)) * mix(.22, 1., ss(-.25, .05, R.y));
  let fr = .05 + .95 * pow(1. - max(dot(n, V), 0.), 5.);
  var c = alb * (E * ndl + sky(n)) + env * refl * fr + E * pow(max(dot(n, normalize(V + L)), 0.), 140.) * gloss * 1.6 + emi;
  return vec4f(fogged(c, i.wp), 1.);
}
fn bar(p: vec2f, c: vec2f, h: vec2f) -> f32 { let q = abs(p - c) - h; return step(max(q.x, q.y), 0.); }
// a whole number written in seven-segment figures across the unit square q; places to the left of its first figure are left blank
fn num(q: vec2f, n: i32, cnt: i32) -> f32 {
  if (q.x < 0. || q.x >= 1. || q.y < 0. || q.y > 1.) { return 0.; }
  let fx = q.x * f32(cnt); let di = cnt - 1 - i32(floor(fx)); var v = n; for (var k = 0; k < di; k++) { v = v / 10; }
  if (v == 0 && di > 0) { return 0.; }
  let cell = vec2f(fract(fx) * 1.25 - .125, q.y); return seg7w(cell, v % 10) * step(0., cell.x) * step(cell.x, 1.); }
fn seg7w(p: vec2f, d: i32) -> f32 {
  var tbl = array<i32, 10>(126, 48, 109, 121, 51, 91, 95, 112, 127, 123); let m = tbl[clamp(d, 0, 9)]; var s = 0.;
  s = max(s, bar(p, vec2f(.5, .915), vec2f(.31, .085)) * f32((m >> 6u) & 1)); s = max(s, bar(p, vec2f(.86, .71), vec2f(.1, .29)) * f32((m >> 5u) & 1));
  s = max(s, bar(p, vec2f(.86, .29), vec2f(.1, .29)) * f32((m >> 4u) & 1)); s = max(s, bar(p, vec2f(.5, .085), vec2f(.31, .085)) * f32((m >> 3u) & 1));
  s = max(s, bar(p, vec2f(.14, .29), vec2f(.1, .29)) * f32((m >> 2u) & 1)); s = max(s, bar(p, vec2f(.14, .71), vec2f(.1, .29)) * f32((m >> 1u) & 1));
  s = max(s, bar(p, vec2f(.5, .5), vec2f(.31, .08)) * f32(m & 1));
  return s;
}
fn seg7(p: vec2f, d: i32) -> f32 {
  var tbl = array<i32, 10>(126, 48, 109, 121, 51, 91, 95, 112, 127, 123); let m = tbl[clamp(d, 0, 9)]; var s = 0.;
  s = max(s, bar(p, vec2f(.5, .92), vec2f(.26, .07)) * f32((m >> 6u) & 1)); s = max(s, bar(p, vec2f(.86, .71), vec2f(.08, .2)) * f32((m >> 5u) & 1));
  s = max(s, bar(p, vec2f(.86, .29), vec2f(.08, .2)) * f32((m >> 4u) & 1)); s = max(s, bar(p, vec2f(.5, .08), vec2f(.26, .07)) * f32((m >> 3u) & 1));
  s = max(s, bar(p, vec2f(.14, .29), vec2f(.08, .2)) * f32((m >> 2u) & 1)); s = max(s, bar(p, vec2f(.14, .71), vec2f(.08, .2)) * f32((m >> 1u) & 1));
  s = max(s, bar(p, vec2f(.5, .5), vec2f(.26, .06)) * f32(m & 1));
  return s;
}
// strong sign colours
fn pal2(h: f32) -> vec3f {
  if (h < .22) { return vec3f(.70, .06, .05); } if (h < .40) { return vec3f(.85, .65, .05); } if (h < .56) { return vec3f(.06, .22, .55); }
  if (h < .70) { return vec3f(.05, .40, .18); } if (h < .86) { return vec3f(.85, .84, .80); } return vec3f(.80, .30, .05);
}
// paint colours of town walls
fn pal(h: f32) -> vec3f {
  if (h < .30) { return vec3f(.82, .76, .62); } if (h < .40) { return vec3f(.80, .70, .42); } if (h < .47) { return vec3f(.55, .68, .78); }
  if (h < .53) { return vec3f(.78, .58, .55); } if (h < .92) { return vec3f(.82, .80, .73); } return vec3f(.58, .74, .64);      // mostly cream and off-white, as Thai towns are painted
}
// houses: weathered board walls, corrugated sheet roofs, dark openings, posts
@fragment fn fsBox(i: XO) -> @location(0) vec4f {
  let n = normalize(i.n); let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  var uv = i.lp.xy; if (abs(i.ln.y) > .5) { uv = i.lp.xz; } else if (abs(i.ln.x) > .5) { uv = i.lp.zy; }
  let mat = i32(i.m.x + .5); let sd = i.m.y; var alb = vec3f(.5); var gloss = 0.; var emi = vec3f(0.); let night = g.misc.w; let dcb = distance(g.cam.xyz, i.wp); let fN = 1. - ss(12., 30., dcb);      // fN: 1 near, 0 where a wall's fine grain is smaller than a pixel (there it is left out)
  if (mat == 0) {            // upright boards, each its own shade, dark joints, grain
    let b = uv.x / .17; let id = floor(b); let fb = fract(b);
    let tone = mix(vec3f(.30, .19, .11), vec3f(.26, .24, .21), step(.55, sd));       // teak brown or sun-greyed
    alb = tone * (.7 + .5 * h2(vec2f(id, sd * 91.))) * (.85 + .3 * vn(vec2f(uv.x * 40., uv.y * 2.)));
    alb *= ss(0., .07, fb) * ss(1., .93, fb) * .8 + .2;
  } else if (mat == 1) {     // corrugated roof sheets: rust red, zinc grey or faded blue, streaked by rain
    let rib = sin(uv.x * 42.) * .5 + .5;
    alb = mix(vec3f(.36, .11, .07), vec3f(.44, .45, .46), step(.4, sd)); if (sd > .78) { alb = vec3f(.14, .26, .40); }
    alb *= (.62 + .38 * rib) * (.75 + .35 * vn(vec2f(uv.x * 3., uv.y * .7))) ; gloss = .35;
    alb = mix(alb, vec3f(.25, .12, .06), ss(.62, .8, vn(uv * 1.7 + sd * 30.)) * .5);
  } else if (mat == 2) { alb = vec3f(.62, .60, .55) * (.85 + .2 * vn(uv * 6.)); }
  else if (mat == 3) { alb = vec3f(.025, .022, .02); }
  else if (mat == 6) {       // the floors of a shophouse over its shop: a strip of mezzanine glass, painted render; the back and the end walls
    let hh = i.m.z * .5; let y0 = i.lp.y + hh + 3.05; let ux = i.lp.x / 4. + .5;
    var wall = pal(sd) * (.84 + .16 * vn(vec2f(i.lp.x * 1.6 + sd * 9., y0 * .6))) * mix(.98, .93 + .1 * vn(uv * 11.), fN);
    wall = mix(wall, wall * .62, ss(.45, .85, vn(vec2f(uv.x * 2.4 + sd * 5., y0 * .22))) * .55);        // streaks of rain grime
    wall *= 1. - .2 * ss(.27, .04, fract((y0 - 5.) / 3.)) * step(5., y0) * ss(.35, .7, vn(vec2f(uv.x * 3.1 + sd * 7., 1.5)));      // dark runs down the wall under the window sills
    let fy = fract((y0 - 5.) / 3.); let up = step(5., y0);
    wall *= 1. - .22 * step(fy, .03) * up * (1. - ss(40., 80., dcb));
    if (i.ln.z > .5) {
      if (y0 > 3.45 && y0 < 4.8) {
        let band = step(.07, ux) * step(ux, .93); let mul = ss(0., .05, abs(fract(ux * 4.) - .5) - .44);
        wall = mix(wall, mix(vec3f(.05, .065, .08), vec3f(.52, .52, .50), mul), band);
        emi = vec3f(1., .74, .40) * night * step(.6, h2(vec2f(sd * 19., 5.))) * band * (1. - mul) * .9; gloss = band * .5;
      }
    } else if (i.ln.z < -.5) {      // the back: bare render gone grey, a louvred window and a bathroom vent on every floor, a waste pipe down the wall
      wall = mix(wall, vec3f(.50, .49, .46) * (.8 + .25 * vn(uv * 3.)), .55);
      wall = mix(wall, wall * .6, ss(.45, .8, vn(vec2f(uv.x * 3. + sd * 7., y0 * .3))) * .6);
      let wn = step(.5, ux) * step(ux, .82) * step(.36, fy) * step(fy, .74) * up; let lv = .55 + .45 * step(.5, fract(y0 * 9.));
      wall = mix(wall, vec3f(.07, .09, .10) * lv, wn); emi = vec3f(1., .8, .55) * night * wn * step(.6, h2(vec2f(sd * 23., floor((y0 - 5.) / 3.)))) * .7;
      wall = mix(wall, vec3f(.05), step(.16, ux) * step(ux, .28) * step(.62, fy) * step(fy, .76) * up);
      wall = mix(wall, vec3f(.28, .30, .34), step(abs(ux - .93), .014));
    } else if (abs(i.ln.x) > .5) {   // an end wall: the concrete frame shows through the render, rain has drawn long stains down it
      let dz = i.lp.z; let fr_ = max(step(.46, abs(fract(dz / 4.) - .5)), step(fy, .07) * up);
      wall = mix(wall, wall * vec3f(.86, .85, .83), fr_ * .7);
      wall = mix(wall, wall * .55, ss(.4, .9, vn(vec2f(dz * 1.3 + sd * 11., y0 * .12))) * ss(2., 0., hh - i.lp.y) * .7);
      wall = mix(wall, wall * .7, ss(.55, .8, vn(vec2f(dz * .4, y0 * .5) + sd * 3.)) * .45);
    }
    if (i.ln.y > .5) { wall = vec3f(.33, .32, .30) * (.8 + .3 * vn(i.lp.xz * 2.)); }
    if (i.ln.y < -.5) { wall = vec3f(.42, .41, .39); emi = vec3f(1., .82, .55) * night * .5 * step(abs(i.lp.x), .7) * step(4., i.lp.z); }      // the shop's ceiling and its strip lights
    alb = wall;
  }
  else if (mat == 31) {      // shelves of goods from floor to ceiling
    let c2 = vec2f(uv.x / .24, uv.y / .44); let id = floor(c2); let f = fract(c2); let hsh = h2(id + sd * 57.);
    let goods = mix(pal2(hsh), pal(fract(hsh * 7.3)), step(.5, fract(hsh * 3.7))) * (.55 + .45 * h2(id * 1.7 + sd));
    alb = mix(vec3f(.07, .06, .05), goods, step(.14, f.y) * step(f.y, .14 + .5 + .3 * hsh) * step(.1, f.x));
    alb = mix(alb, vec3f(.34, .31, .27), step(f.y, .09)); alb = mix(alb, vec3f(.20, .17, .14), ss(25., 70., dcb)); emi = alb * night * 1.3;
  }
  else if (mat == 42) {      // a modern shop shelf: white steel, levels 30 cm apart, small packets in rows (each kind four facings wide), a white price strip along every shelf's edge
    let c2 = vec2f(uv.x / .11, uv.y / .30); let id = floor(c2); let f = fract(c2); let grp = h2(vec2f(floor(id.x / 4.), id.y) + sd * 13.);
    let goods = mix(pal2(grp), vec3f(.86, .85, .80), .2 + .45 * h2(id + sd * 57.)) * (.72 + .28 * h2(id * 1.7 + sd));
    alb = mix(vec3f(.78, .78, .76), goods, step(.17, f.y) * step(f.y, .6 + .3 * grp) * step(.1, f.x));
    alb = mix(alb, vec3f(.94, .94, .91), step(f.y, .12)); if (abs(i.ln.y) > .5) { alb = vec3f(.86); }
    alb = mix(alb, vec3f(.62, .62, .60), ss(25., 70., dcb));
  }
  else if (mat == 43) {      // a wall of drinks chillers: glass doors in dark frames, bright inside, bottles and cans in rows on white wire shelves
    let dw = fract(uv.x / .78); let c2 = vec2f(uv.x / .078, uv.y / .36); let id = floor(c2); let f = fract(c2); let grp = h2(vec2f(floor(id.x / 3.), id.y) + sd * 31.);
    let bt = step(.18, f.x) * step(f.x, .82) * step(.1, f.y) * step(f.y, .8);
    alb = mix(vec3f(.84, .88, .90), mix(pal2(grp), vec3f(.92), .18 + .3 * h2(id + 5.)), bt); alb = mix(alb, vec3f(.80, .84, .86), ss(25., 70., dcb));
    alb = mix(alb, vec3f(.06), max(step(dw, .05), step(.95, dw))); emi = alb * .2; gloss = .5;
  }
  else if (mat == 45) {      // a traffic signal head: a black case with three lamps on its front, red above amber above green; which is lit follows the clock
    alb = vec3f(.025); gloss = .3;        // (seed: the signal's place in its 30 s cycle - 16 s green, 3 amber, 11 red - as tlState in land.js)
    if (i.ln.z > .5) {
      let ph_ = fract(g.cam.w / 30. + sd); var on = 2; if (ph_ > 16. / 30.) { on = 1; } if (ph_ > 19. / 30.) { on = 0; }
      if (sd > .9995) { on = 0; if (ph_ > .655) { on = 2; } if (ph_ > .90) { on = 1; } if (ph_ > .97) { on = 0; } }      // (seed 1 + place: the side street's head, green inside the main road's red)
      for (var j = 0; j < 3; j++) {
        let r = length(i.lp.xy - vec2f(0., .34 - f32(j) * .34)); if (r > .135) { continue; }
        var lc = vec3f(1., .06, .04); if (j == 1) { lc = vec3f(1., .62, .05); } if (j == 2) { lc = vec3f(.08, 1., .45); }
        alb = lc * .10; if (j == on) { alb = lc; emi = lc * (2.2 + 2.5 * night) * (1. - .5 * ss(.06, .135, r)); }
      }
    }
  }
  else if (mat == 46) {      // the lights for people crossing: red above, green below; green while the main road is stopped
    alb = vec3f(.025); gloss = .3;
    if (i.ln.z > .5) {
      let ph_ = fract(g.cam.w / 30. + sd); let walk = ph_ > .665 && ph_ < .93;
      for (var j = 0; j < 2; j++) {
        let r = length(i.lp.xy - vec2f(0., .15 - f32(j) * .30)); if (r > .11) { continue; }
        var lc = vec3f(1., .06, .04); if (j == 1) { lc = vec3f(.08, 1., .45); }
        alb = lc * .10; if ((j == 1) == walk) { alb = lc; emi = lc * (2. + 2.5 * night); }
      }
    }
  }
  else if (mat == 44) {      // a shop ceiling: white tiles, set with rows of light panels that are on day and night
    let q = i.lp.xz; let lp = step(.3, fract(q.x / 1.2)) * step(.72, fract(q.y / 1.25));
    alb = vec3f(.86, .86, .84) * (.97 + .03 * step(.03, fract(q.x / .6)) * step(.03, fract(q.y / .6))); emi = vec3f(1., 1., .94) * lp * (1.1 + 1.6 * night);
  }
  else if (mat == 32) {      // roller shutter: steel slats, bare or painted, rust creeping up from the foot
    let hh = i.m.z * .5; let slat = mix(.92, .68 + .32 * ss(.0, .5, abs(fract(uv.y * 11.) - .5) * 2.), fN);
    alb = mix(vec3f(.36, .37, .38), pal(fract(sd * 5.3)) * .62, step(.55, sd)) * slat * (.88 + .15 * vn(uv * 5.));
    alb = mix(alb, vec3f(.25, .12, .06) * slat, ss(.9, .0, i.lp.y + hh) * ss(.35, .7, vn(vec2f(uv.x * 4., sd * 9.))) * .7); gloss = .3;
  }
  else if (mat == 37) {      // a speed limit sign: a white disc ringed in red, the figure (kept in m.z) in black; plain grey behind
    let q = i.lp.xy / .375; let r = length(q); if (r > 1.) { discard; }
    let nn = i32(i.m.z + .5); let p = vec2f(q.x * 1.9 + 1., q.y * 1.25 + .5); let cell = vec2f(fract(p.x) * 1.25 - .125, p.y);
    var dv = nn % 10; if (p.x < 1.) { dv = (nn / 10) % 10; }
    let ink = seg7(cell, dv) * step(0., cell.x) * step(cell.x, 1.) * step(0., p.y) * step(p.y, 1.) * step(0., p.x) * step(p.x, 2.);
    alb = mix(mix(vec3f(.88), vec3f(.03), ink), vec3f(.75, .04, .03), step(.76, r)); gloss = .2;
    if (i.ln.z < .5) { alb = vec3f(.42, .43, .44); }
  }
  else if (mat == 41) { alb = vec3f(.86, .85, .81) * (.9 + .1 * vn(uv * 5.)); alb = mix(alb, alb * .78, ss(.5, .85, vn(vec2f(uv.x * 2.5, uv.y * .3))) * .35); }      // whitewash, a little weathered
  else if (mat == 39) {      // a wheel: only the round of it is drawn (seed 0: the box is thin along x; 1: thin along z)
    var q = i.lp.yz; var face = abs(i.ln.x); if (sd > .5) { q = i.lp.xy; face = abs(i.ln.z); }
    let r = length(q) / (i.m.z * .5); if (face < .5 || r > 1.) { discard; }
    alb = mix(vec3f(.025), vec3f(.30, .31, .32), step(r, .5) * step(.12, r)); gloss = .2 * step(r, .5);
  }
  else if (mat == 40) {      // kerb stones along a town street: painted red and white or yellow and white, or left bare, block by block (as the ground beside them is painted)
    let so = soi(i.wp.xz); let st = step(.5, fract(i.wp.z / 1.6));
    let kc = mix(mix(vec3f(.72, .72, .69), vec3f(.58, .06, .05), st), mix(vec3f(.72, .72, .69), vec3f(.74, .58, .06), st), step(.5, fract(so.z * .37)));
    alb = mix(kc, vec3f(.50, .49, .46), step(.6, fract(so.z * .61))) * (.85 + .2 * vn(i.wp.xz * 9.));
  }
  else if (mat == 38) { let t = (i.lp.y / i.m.z + .5) * 6.; alb = mix(vec3f(.62, .04, .08), vec3f(.88), step(1., t) * step(t, 5.)); alb = mix(alb, vec3f(.08, .09, .32), step(2., t) * step(t, 4.)); }      // the Thai flag: red, white, blue (double), white, red
  else if (mat == 33) { alb = pal2(sd) * (.9 + .1 * vn(uv * 14.)); gloss = .35; }      // plastic and paintwork in strong colours: stools, crates, motorcycles
  else if (mat == 34) { alb = vec3f(.50, .51, .52) * (.88 + .14 * vn(vec2f(uv.x * 4., uv.y * 40.))); gloss = .9; }      // stainless steel
  else if (mat == 35) {      // folding wooden shop doors (บานเฟี้ยม): narrow leaves, old paint
    let b = uv.x / .44; let fb = fract(b); let hh = i.m.z * .5;
    let tone = mix(vec3f(.28, .18, .10), mix(vec3f(.15, .29, .28), vec3f(.19, .25, .37), step(.5, fract(sd * 3.))), step(.4, sd));
    alb = tone * (.72 + .4 * h2(vec2f(floor(b), sd * 91.))) * (.82 + .3 * vn(vec2f(uv.x * 30., uv.y * 2.)));
    alb *= ss(0., .06, fb) * ss(1., .94, fb) * .75 + .25; alb *= 1. - .25 * step(abs(abs(fract(b) - .5) - .25), .2) * step(abs(i.lp.y + hh * .1), hh * .7) * step(.86, fract(uv.y / (hh * .72)));
  }
  else if (mat == 36) { var q = uv; if (abs(i.ln.y) > .5) { q = i.lp.xz; } alb = mix(pal2(sd), vec3f(.78, .77, .72), step(.5, fract(q.x / .14))) * (.75 + .2 * vn(q * 3.)); }      // striped canvas awning (narrow stripes)
  else if (mat == 23) {      // a sign board. The name in one row of large letters of even height, with the small marks Thai writes above some letters and below a few;
    // under it a row of small figures (the telephone number). A lightbox at night, unless the height slot is negative (road signs are not lit).
    var q = i.lp.xy; if (abs(i.ln.x) > .5) { q = i.lp.zy; }
    if (i.ln.z < -.5 || i.ln.x > .5) { q.x = -q.x; }                 // so the words read the right way round on every face
    let hgt = abs(i.m.z); var bg = pal2(sd); var fg = vec3f(.95, .93, .86); let brand = sd > 1.5;      // (seed 2: the convenience store's board, see below)
    if (dot(bg, vec3f(.3, .6, .1)) > .45) { fg = mix(vec3f(.60, .04, .04), vec3f(.05, .13, .45), step(.5, h2(vec2f(sd * 13., 2.)))); }      // on yellow or white: red or blue letters
    if (i.m.z < 0. && dot(bg, vec3f(.3, .6, .1)) > .45) { fg = vec3f(.04); }
    // which words: a shop name (0-47) or, on a road board, one of the road words (48-63); written across, or downward on a tall board
    var wd = hgt * 4.; if (i.m.w > 10.05) { wd = i.m.w - 10.; }
    var idx = floor(h2(vec2f(sd * 91., 5.)) * 46.99); if (i.m.z < 0.) { idx = 48. + floor(h2(vec2f(sd * 57., 9.)) * 15.99); }
    if (brand) { idx = 47.; bg = vec3f(.24, .07, .36); fg = vec3f(.97, .96, .92); }      // the made-up chain's colours: purple, white letters, a yellow line above and below
    var ink = 0.;
    if (hgt > wd * 1.4) {
      let u = q.x / (wd * .86) + .5; let v = .5 - q.y / (hgt * .92);
      if (u > 0. && u < 1. && v > 0. && v < 1.) { ink = textureSampleLevel(tSign, sMir, vec2f(1024. + (idx % 16. + u) * 64., (floor(idx / 16.) + v) * 256.) / vec2f(2048., 1024.), 0.).r; }
    } else {
      var tw = wd * .92; var th = tw / 4.; if (th > hgt * .86) { th = hgt * .86; tw = th * 4.; }
      let u = q.x / tw + .5; let v = .5 - q.y / th;
      if (u > 0. && u < 1. && v > 0. && v < 1.) { ink = textureSampleLevel(tSign, sMir, vec2f((idx % 4. + u) * 256., (floor(idx / 4.) + v) * 64.) / vec2f(2048., 1024.), 0.).r; }
    }
    alb = mix(bg, fg, mix(ink, .25, ss(20., 55., dcb))) * (.9 + .1 * vn(q * 6.));
    if (brand) { let vv = abs(q.y) / hgt; alb = mix(alb, vec3f(.95, .72, .08), step(.36, vv) * step(vv, .43)); }
    emi = alb * night * 1.4 * step(0., i.m.z); gloss = .25;
    if (abs(i.ln.y) > .5 || (abs(i.ln.z) > .5 && abs(i.ln.x) > .5)) { alb = vec3f(.2); }
  }
  else if (mat == 24) {      // retaining wall of fitted rubble stone, pale mortar between
    let q = uv * vec2f(2.4, 3.4) + vec2f(floor(uv.y * 3.4) * .5, 0.); let id = floor(q); let f = fract(q);
    let jt = vec2f(h2(id), h2(id + 7.)) * .25; let ed = min(min(f.x - jt.x * .5, 1. - f.x), min(f.y - jt.y * .5, 1. - f.y));
    alb = mix(vec3f(.40, .38, .34), mix(vec3f(.27, .26, .25), vec3f(.36, .33, .29), h2(id + 3.)) * (.8 + .4 * vn(uv * 9.)), ss(.02, .09, ed));
  }
  else if (mat == 22) {      // air conditioner: a pale box with the dark round grille of its fan
    let q = i.lp.xy; let r = length((q - vec2f(-.12, 0.)) / vec2f(.21, .21));
    alb = vec3f(.62, .62, .60) * (.9 + .1 * vn(uv * 20.));
    if (i.ln.z > .5) { alb = mix(alb, vec3f(.10, .10, .11) * (.6 + .4 * step(.5, fract(r * 6.))), step(r, 1.)); }
  }
  else if (mat == 7 || mat == 8) {   // taller block (7) or a concrete house (8): rows of windows on every side
    var hx = i.lp.x; if (abs(i.ln.x) > .5) { hx = i.lp.z; }
    let cw = select(3.4, 3.0, mat == 7); let ch = select(3.0, 3.2, mat == 7);
    let y0 = i.lp.y + i.m.z * .5; let fx = fract(hx / cw + .5); let fy = fract(y0 / ch); let fl = floor(y0 / ch);
    let win = step(.22, fx) * step(fx, .78) * step(.34, fy) * step(fy, .80) * (1. - step(.5, abs(i.ln.y)));
    var wall = select(pal(sd), mix(vec3f(.72, .72, .70), pal(sd), .35), mat == 7) * (.8 + .2 * vn(vec2f(hx * 1.5 + sd * 9., y0 * .3)));
    wall *= 1. - .25 * step(fy, .06) * (1. - ss(80., 160., dcb));
    let lit = night * step(.55, h2(vec2f(floor(hx / cw + .5) + sd * 31., fl + sd * 17.)));
    alb = mix(wall, mix(vec3f(.04, .055, .07), vec3f(.10, .15, .20), fy), win); emi = vec3f(1., .74, .40) * lit * win * 1.5; gloss = win * .5;
    if (i.ln.y > .5) { alb = vec3f(.33, .32, .30); }
  }
  else if (mat == 9) {       // roof tiles in rows: terracotta, blue or green glaze
    let r = fract(uv.y / .34);
    alb = mix(vec3f(.50, .19, .11), vec3f(.13, .22, .40), step(.6, sd)); if (sd > .82) { alb = vec3f(.12, .30, .20); }
    alb *= (.6 + .4 * r) * (.8 + .3 * h2(vec2f(floor(uv.x / .25), floor(uv.y / .34)))); gloss = .25;
  }
  else if (mat == 11) {      // kilometre stone: white-painted concrete, black figures. Toward the road: a mark, the route number, the kilometre. On the sides, which meet the traffic: a name and how far it is.
    alb = vec3f(.88, .88, .85) * (.88 + .14 * vn(i.lp.xy * 14.) ) * (.92 + .08 * vn(uv * 3.));
    let n = i32(i.m.z + .5); var ink = 0.; let y = i.lp.y;
    if (i.m.z >= 0. && abs(i.ln.z) > .5) { let x = i.lp.x * sign(i.ln.z);
      ink = max(max(step(abs(y - .262 - abs(x) * .55), .013) * step(abs(x), .085), step(abs(x), .02) * step(abs(y - .25), .04)), step(abs(abs(x) - .018), .008) * step(abs(y - .2), .014));      // a plain mark where the emblem goes: wings raised, body, legs
      ink = max(ink, num(vec2f(x / .20 + .5, (y - .12) / .075 + .5), i32(sd + .5), 4));
      ink = max(ink, num(vec2f(x / .34 + .5, (y + .10) / .21 + .5), n, 3));
    } else if (i.m.z >= 0. && abs(i.ln.x) > .5) { let u = -i.lp.z * sign(i.ln.x); let gx = u / .034 + 40.;
      ink = step(.22, fract(gx)) * step(h2(vec2f(floor(gx), f32(n))), .82) * step(abs(u), .1) * step(abs(y - .15), .012 + .014 * h2(vec2f(floor(gx), 3.)));
      ink = max(ink, num(vec2f(u / .17 + .5, (y + .06) / .14 + .5), select(n % 47 + 3, 50 - n % 47, i.ln.x > 0.), 2)); }
    alb = mix(alb, vec3f(.04), ink);
  }
  else if (mat == 16) {      // weatherboard: overlapping horizontal planks, each a little different, sun-bleached and stained
    let b = uv.y / .17; let id = floor(b); let fb = fract(b);
    let tone = mix(vec3f(.33, .21, .12), vec3f(.30, .27, .23), step(.5, sd)) * mix(1., .8, step(.8, fract(sd * 7.)));
    alb = tone * (.72 + .45 * h2(vec2f(id, sd * 91.))) * (.85 + .3 * vn(vec2f(uv.x * 3., id * 7.))) * (.9 + .15 * vn(vec2f(uv.x * 60., uv.y * 4.)));
    alb *= mix(.45, 1., ss(0., .16, fb)) * mix(1., 1.12, ss(.75, 1., fb));           // shadow under each lap, light on its lower edge
    alb = mix(alb, alb * vec3f(.6, .62, .55), ss(.55, .8, vn(vec2f(uv.x * 1.3 + sd * 20., uv.y * .35))) * .5);   // rain stains
  }
  else if (mat == 17) {      // window glass: dark inside, a reflection of the sky at a slant, lit at night in some
    let fr = .06 + .94 * pow(1. - max(dot(n, V), 0.), 4.); let R = reflect(-V, n);
    alb = vec3f(.03, .04, .05);
    emi = mix(horizon(R), g.zen.rgb, ss(0., .7, max(R.y, 0.))) * fr * .7 + vec3f(1., .74, .40) * night * step(.45, sd) * 1.3;
    gloss = .8;
  }
  else if (mat == 18) {      // painted cement render: soft blotches, red dust splashed up from the ground, streaks below the eaves
    let hh = i.m.z * .5;
    alb = pal(sd) * (.86 + .14 * vn(uv * 1.4 + sd * 9.)) * mix(.98, .93 + .1 * vn(uv * 11.), fN);
    alb = mix(alb, vec3f(.36, .22, .14), ss(.7, 0., i.lp.y + hh) * .5 * step(.5, i.m.z));
    alb = mix(alb, alb * .72, ss(.5, .85, vn(vec2f(uv.x * 2.2 + sd * 5., uv.y * .3))) * ss(.2, 1.2, i.lp.y + hh) * .35);
  }
  else if (mat == 19) { alb = vec3f(.60, .59, .56) * (.82 + .2 * vn(uv * 9.)) * mix(.96, .9 + .12 * vn(uv * 40.), 1. - ss(4., 12., dcb)); gloss = .15; }
  else if (mat == 12) { alb = vec3f(.50, .51, .52) * (.7 + .3 * abs(sin(i.lp.y * 21.))) * (.85 + .2 * vn(i.lp.xy * 5.)); gloss = .5; }   // steel guard rail, ribbed
  else if (mat == 13) { alb = mix(vec3f(.80, .79, .76), vec3f(.75, .04, .03), step(.22, i.lp.y) * step(i.lp.y, .34)); emi = vec3f(.8, .05, .03) * g.misc.x * .15 * step(.22, i.lp.y) * step(i.lp.y, .34); }   // marker post with a red reflector band
  else if (mat == 20) { let bd = vec3f(i.lp.x, i.lp.y, i.lp.z) * 22.; alb = mix(vec3f(.95, .50, .03), vec3f(1., .78, .08), vn(bd.xy + bd.z)) * (.75 + .35 * abs(sin(bd.x + bd.y + bd.z))); emi = alb * g.sunCol.rgb * .04; }   // marigold garland
  else if (mat == 14) { alb = mix(vec3f(.62, .08, .06), vec3f(.80, .60, .12), step(.5, fract(i.lp.y * 9.)) * .6); gloss = .3; }      // spirit house: red and gold
  else if (mat == 15) { alb = vec3f(.82, .62, .12) * (.8 + .3 * vn(uv * 20.)); gloss = .6; }
  else if (mat == 10) { alb = vec3f(.6); emi = vec3f(1., .8, .5) * night * 9.; }
  else if (mat == 30) {      // a bridge deck: the road carried across, concrete at its edges and underneath
    let n4 = vn(i.wp.xz * 14.); alb = vec3f(.40, .39, .37) * (.8 + .3 * n4) * (.9 + .15 * vn(uv * 1.3));
    if (i.ln.y > .5) {
      let rd = abs(rdist(i.wp.xz)); var road = vec3f(.034, .035, .038) * (.72 + .5 * n4) * (.85 + .3 * vn(i.wp.xz * .55));
      road = mix(road, vec3f(.52, .52, .48), ss(.08, .04, abs(rd - 3.2)));
      road = mix(road, vec3f(.58, .42, .04), ss(.09, .05, rd) * step(.5, fract(i.wp.z / 9.)));
      alb = mix(alb, road, 1. - ss(3.5, 3.75, rd)); gloss = .2;
    }
  }
  else if (mat == 25) {      // a wooden boat: oiled planks, a band of bright paint under the gunwale
    let hh = i.m.z * .5; alb = vec3f(.30, .18, .09) * (.7 + .5 * vn(vec2f(uv.x * 3., uv.y * 22.)));
    alb = mix(alb, pal2(sd), step(hh - .16, i.lp.y) * step(abs(i.ln.y), .5)); alb = mix(alb, vec3f(.7), step(hh - .04, i.lp.y) * step(abs(i.ln.y), .5)); gloss = .2;
  }
  else if (mat == 26) { alb = mix(vec3f(.74, .74, .70), vec3f(.60, .06, .05), step(.5, fract(i.wp.z / 1.6))) * (.85 + .2 * vn(i.wp.xz * 9.)); }      // kerb stones painted red and white
  else if (mat == 27) {      // a panel of steel bars (fence or sliding gate): upright bars in a frame, painted; drawn broader with distance (never thinner than a pixel), closing to a plain panel far off
    let hh = i.m.z * .5; let bar = step(abs(fract(uv.x / .115) - .5), max(.085, dcb * .0125)); let rail = max(step(hh - .05, abs(uv.y)), step(abs(uv.y + hh * .45), .02));
    if (abs(i.ln.z) > .5 && max(bar, rail) < .5) { discard; }
    alb = vec3f(.05, .05, .055); if (sd > .4) { alb = vec3f(.22, .07, .05); } if (sd > .7) { alb = vec3f(.05, .14, .09); } if (sd > .9) { alb = vec3f(.5, .5, .52); } gloss = .45;
  }
  else if (mat == 28) {      // ventilation blocks: a concrete screen of square openings
    let f = fract(uv / .19); let hw_ = .3 * ss(60., 25., dcb); let hole = step(abs(f.x - .5), hw_) * step(abs(f.y - .5), hw_);      // the openings close up with distance
    if (abs(i.ln.z) > .5 && hole > .5) { discard; }
    alb = vec3f(.52, .51, .48) * (.8 + .25 * vn(uv * 12.));
  }
  else if (mat == 29) { alb = mix(pal2(sd) * .8, vec3f(.55, .54, .51), step(.5, fract(atan2(i.lp.z, i.lp.x) / 6.2832 * 8.))); }      // beach umbrella: striped canvas
  else if (mat == 5) {       // yellow warning sign: black border and an elephant
    let q = i.lp.zy; let edge = max(abs(q.x), abs(q.y));
    let r = vec2f(q.x + q.y, q.y - q.x) * .7071;                    // the sign hangs as a diamond: turn the drawing upright
    let body = length((r - vec2f(-.02, -.01)) / vec2f(.15, .095)); let hd = length((r - vec2f(.15, .04)) / vec2f(.075, .08));
    let legs = step(abs(abs(r.x + .02) - .09), .03) * step(-.19, r.y) * step(r.y, -.02); let trunk = step(abs(r.x - .21), .018) * step(-.13, r.y) * step(r.y, .05);
    var ink = max(max(step(body, 1.), step(hd, 1.)), max(legs, trunk));
    if (sd > .33) { let cx = .075 * sin(r.y * 15.); ink = max(step(abs(r.x - cx), .03) * step(abs(r.y), .19), step(abs(r.x - .075 * sin(2.85)) * 1.3 + (r.y - .19), .075) * step(.19, r.y)); }     // winding road
    if (sd > .66) { let ramp = -.13 + (r.x + .2) * .5; ink = max(step(r.y, ramp) * step(-.15, r.y) * step(abs(r.x), .2), step(abs(r.x - .02), .07) * step(ramp, r.y) * step(r.y, ramp + .09)); }   // steep hill
    alb = mix(vec3f(.85, .62, .03), vec3f(.02), max(ink, step(.325, edge) * step(edge, .36))); gloss = .1;
  }
  else { alb = vec3f(.16, .11, .07) * (.7 + .5 * vn(vec2f(uv.x * 30., uv.y * 2.))); }
  // walls are darker tucked up under the eaves and where they meet the ground
  var ao = 1.;
  if (i.m.z > .5 && abs(i.ln.y) < .5 && mat != 38) { let hh = i.m.z * .5; ao = mix(.55, 1., ss(0., .45, hh - i.lp.y)) * mix(.72, 1., max(ss(0., .5, i.lp.y + hh), f32(mat == 6))); }      // (a shophouse's upper floors do not start at the ground)
  let ndl = max(dot(n, L), 0.);
  let E = g.sunCol.rgb * shadow(i.wp + n * .1);
  if (i.m.w > 2.5 && i.m.w < 3.5) { emi += alb * (.36 + .7 * night); }      // (shape 3) indoors under the shop's own lights, which are on all the time
  var c = alb * (E * ndl + sky(n) * ao) + E * pow(max(dot(n, normalize(V + L)), 0.), 40.) * ndl * gloss + alb * head(i.wp, n) + emi;
  return vec4f(fogged(c, i.wp), 1.);
}
// the sky: gradient, sun or moon, drifting clouds, stars
struct SO { @builtin(position) cp: vec4f, @location(0) q: vec2f };
@vertex fn vsSky(@builtin(vertex_index) i: u32) -> SO { var o: SO; let p = vec2f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1)); o.cp = vec4f(p, 1., 1.); o.q = p; return o; }
@fragment fn fsSky(i: SO) -> @location(0) vec4f {
  let rd = normalize(g.fwd.xyz + g.right.xyz * (i.q.x * g.right.w) + g.up.xyz * (i.q.y * g.up.w));
  let y = max(rd.y, 0.); let hz = horizon(rd);
  var c = mix(hz, g.zen.rgb, pow(ss(0., .8, y), .55));
  let sd = max(dot(rd, g.sun.xyz), 0.);
  c += g.sunCol.rgb * (pow(sd, 8.) * .04 + pow(sd, 90.) * .12 + pow(sd, 1200.) * 1.2 + ss(.99955, .9998, sd) * 14.);
  let q = (g.cam.xz * .08 + rd.xz * (900. / max(rd.y, .03))) * .00055 + vec2f(g.cam.w * .0018, 0.);
  let dn = fbm(q) * .65 + fbm(q * 3.1 + 5.) * .35;
  let lo = mix(.64, .26, g.fog.z); let cov = ss(lo, lo + .2, dn) * ss(0., .14, rd.y);
  let lit = mix(g.amb.rgb * 1.1 + g.hor.rgb * .25, g.sunCol.rgb * .42 + g.hor.rgb * .35, ss(lo, lo + .35, dn + sd * .2)) * mix(1., .6, ss(.6, 1., g.fog.z));
  let hh = h2(floor(rd.xz / max(rd.y, .05) * 90.));
  c += vec3f(.9, .95, 1.) * step(.9965, hh) * g.misc.w * .6 * ss(.02, .2, rd.y) * (1. - cov);
  c = mix(c, lit, cov * .9);
  // lightning: a forked stroke down the sky, and the cloud round it lit from within
  let fl = g.zen.w;
  if (fl > .01) {
    var da = atan2(rd.z, rd.x) - g.hor.w; da = da - 6.2832 * round(da / 6.2832);
    let path = (vn(vec2f(rd.y * 14., g.fwd.w * 50.)) - .5) * .16 + (vn(vec2f(rd.y * 55., g.fwd.w * 31.)) - .5) * .035;
    let dd = abs(da - path); let on = ss(.01, .03, rd.y) * ss(.6, .4, rd.y);
    c += vec3f(.75, .8, 1.) * fl * (on * (ss(.004, .0008, dd) * 7. + ss(.07, 0., dd) * .4) + .5 * ss(1.3, 0., abs(da)) * ss(0., .15, rd.y));
  }
  // far ranges of hills on the horizon, paler with distance
  let hd = normalize(vec3f(rd.x, 0., rd.z) + vec3f(1e-5, 0., 0.)).xz;
  let toSea = 1. - sw(g.cam.z) * ss(.02, .45, rd.x);
  let m0 = (.050 + .120 * fbm(hd * 1.5 + 13.) + .015 * fbm(hd * 8. + 2.)) * toSea;
  let m1 = (.030 + .075 * fbm(hd * 2.3 + 3.) + .012 * fbm(hd * 11. + 7.)) * toSea;
  let m2 = (.012 + .040 * fbm(hd * 3.4 + 21.) + .008 * fbm(hd * 17.)) * toSea;
  c = mix(c, mix(hz, g.amb.rgb * .70 + g.hor.rgb * .22, .34), ss(m0 + .004, m0, rd.y));
  c = mix(c, mix(hz, g.amb.rgb * .55 + g.hor.rgb * .16, .55), ss(m1 + .003, m1, rd.y));
  c = mix(c, mix(hz, g.amb.rgb * vec3f(.30, .46, .30) + g.hor.rgb * .08, .74), ss(m2 + .002, m2, rd.y));
  // out to sea: a few steep limestone islands on the horizon, different on every stretch of coast
  let sk = sw(g.cam.z);
  if (sk > .01 && rd.x > 0.) {
    let az = atan2(rd.z, rd.x); let sid = floor(g.cam.z / SEG); var ih = 0.;
    for (var k = 0; k < 5; k++) {
      let r1 = h2(vec2f(sid * 3.1 + f32(k) * 1.7, 7.)); let r2 = h2(vec2f(sid + f32(k) * 5.3, 2.));
      let tt = (az - (r1 - .5) * 2.5) / (.03 + .09 * r2);
      ih = max(ih, (.006 + .028 * r2) * pow(max(1. - tt * tt, 0.), .55) * (.7 + .6 * fbm(vec2f(az * 40., f32(k) * 3.))));
    }
    let isl = ss(ih + .0012, ih - .0004, rd.y) * step(.001, ih) * sk;
    c = mix(c, mix(hz, g.amb.rgb * vec3f(.26, .40, .33) + g.hor.rgb * .10, .55), isl);
  }
  var outc = mix(hz * .9, c, ss(-.02, .02, rd.y));
  if (rd.y < -.0015 && g.cam.y > SEA) {
    let hp = g.cam.xyz + rd * ((SEA - g.cam.y) / rd.y);
    let m = step(.01, sw(hp.z)) * ss(-1., 1., hp.x - roadX(hp.z) - shoreX(hp.z));
    if (m > .001) { outc = mix(outc, seaC(hp, -rd, 1.), m); }
  }
  return vec4f(outc, 1.);
}
