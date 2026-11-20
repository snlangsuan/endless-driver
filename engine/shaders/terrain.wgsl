// The ground of Endless and its sea: the fragment stage that paints the terrain (road, paddies, town, beach) and the sea's colour.
// (A game with another land brings its own file in place of this one: see boot.js.)
// the sea: turquoise over the shallows, deep blue further out, waves that mirror the sky and glitter under the sun, foam at the rocks
fn seaC(wp: vec3f, V: vec3f, sh: f32) -> vec3f {
  let t = g.cam.w; let P = wp.xz; let d = distance(g.cam.xyz, wp);
  var u = wp.x - roadX(wp.z) - shoreX(wp.z); var b = bch(wp.z);          // u: metres out from the waterline
  let ui = ism(wp.xz); if (ui > -90.) { u = ui; b = 1.; }               // (round the island: measured from its own shores, which are sand)
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
@fragment fn fsTerrain(i: TO) -> @location(0) vec4f {
  let wp = i.wp; let P = wp.xz; var n = normalize(i.n);
  // px: how much ground one pixel covers (m). A pattern of F cycles to the metre can only be drawn while px * F is well under 1; past that it is
  // faded to its mean value, or it would crawl and sparkle as the car moves. (So: fine grain near, coarser grain further off, tone only far away.)
  // Pf: the place within a 256 m tile, worked out from the position relative to the eye (exact) and the eye's own place in the tile (g.camM,
  // reckoned in double precision by the script). All fine grain is drawn from Pf: an absolute position is only good to millimetres far from the origin.
  let Pf = fract((i.rel.xz + g.camM.xy) / 256.) * 256.;
  let dPx = dpdx(i.rel.xz); let dPy = dpdy(i.rel.xz); let pxa = length(dPx); let pxb = length(dPy); let px = sqrt(max(sqrt(pxa * pxb) * max(pxa, pxb), 1e-10));      // between the pixel's mean size and its long side on the ground
  // (Each grain is worked out only where it can still be told apart - where its fade is above nothing. Faded out it is its mean value exactly, so
  // the picture is the same; and from the driver's seat most of the ground on screen is too far, or seen too flat, for the fine ones.)
  let n1 = fbm(P * .045); let n2 = vn(P * .55);
  let e = .12; let f3 = 1. - ss(.5, 1.4, px * 3.7); var n3 = .5; var bx = 0.; var bz = 0.;
  if (f3 > 0.) { let r3 = vn(P * 3.7); n3 = mix(.5, r3, f3); bx = (vn((P + vec2f(e, 0.)) * 3.7) - r3) * f3; bz = (vn((P + vec2f(0., e)) * 3.7) - r3) * f3; }
  let f14 = 1. - ss(.5, 1.4, px * 14.); var n4 = .5; if (f14 > 0.) { n4 = mix(.5, vnp(Pf * 14., 3584.), f14); }
  if (i.w < -.5) { discard; }                      // the mouth of a tunnel: the ground is not drawn where it would lie across the opening
  let rd = abs(rdist(wp.xz)) + (tunk(wp.z) + isb(wp.z)) * 999.;      // (over a tunnel, and under a bridge to the island, there is no road on the ground)
  // dry verge: patchy turf over red-brown laterite soil
  // Seen close, the ground has grain: on the turf, blades lying this way and that over dark thatch, straw among the green, hollows between
  // the clumps; on bare earth, grit, small stones, hairline cracks and pale dust where it has baked hard. Beyond 60 m only the tones are left.
  let dcam = length(i.rel); let nk = 1. - ss(16., 60., dcam); let Vg = -i.rel / max(dcam, .01);
  let e2 = .02; let Pr = vec2f(Pf.x * .809 + Pf.y * .588, Pf.y * .809 - Pf.x * .588);      // turned, so the fine grain does not line up with the coarse
  let f5 = 1. - ss(.5, 1.4, px * 34.); var n5 = .5; var fbx = 0.; var fbz = 0.;
  if (f5 > 0.) { let r5 = vn(Pr * 23.) * .6 + vn(Pr * 51. + 7.) * .4; n5 = mix(.5, r5, f5);
    fbx = (vn((Pr + vec2f(e2, 0.)) * 23.) * .6 + vn((Pr + vec2f(e2, 0.)) * 51. + 7.) * .4 - r5) * f5; fbz = (vn((Pr + vec2f(0., e2)) * 23.) * .6 + vn((Pr + vec2f(0., e2)) * 51. + 7.) * .4 - r5) * f5; }
  let f6 = 1. - ss(.5, 1.4, px * 6.); var n6 = .5; if (f6 > 0.) { n6 = mix(.5, vnp(Pf * 6., 1536.), f6); }
  let tfv = turf(P); let rag = (n6 * .55 + n5 * .45 - .5) * .17;                 // the turf's edge is ragged: tufts push out over the earth
  var blades = .5; var s3 = .5;      // (the strokes of the blades: their broadest scale fades out at 7 cycles to the metre, and beyond 60 m - nk - they are not used at all)
  if (nk > 0. && px * 7. < 1.4) { let Pb = stkw(Pf); let s1 = stk(Pb, vec2f(.955, .296), 0., px); let s2 = stk(Pb, vec2f(.17, .985), 31., px); s3 = stk(Pb, vec2f(-.80, .60), 57., px);
    let wsel = vn(P * 1.3 + 5.); blades = max(mix(s1, s2, ss(.35, .65, wsel)), s3 * .85); }
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
    if (f5 > 0.) { soil *= 1. - .35 * nk * f5 * ss(.035, .0, abs(vnp(Pf * 4.296875 + 40., 1100.) - .5)) * ss(.45, .7, vn(P * .5 + 3.));
      let pb = pebble(Pr * 17., .22); soil = mix(soil, mix(soil * .7, mix(vec3f(.24, .19, .15), vec3f(.36, .31, .26), pb.y), .75) * (.6 + .6 * pb.z), pb.x * nk * f5); }
    if (px * 20. < 1.4) { let lf = pebble(Pr * vec2f(9., 14.) + 70., .03 + .09 * ss(.5, .8, vn(P * .3))); soil = mix(soil, mix(vec3f(.17, .11, .05), vec3f(.30, .22, .10), lf.y), lf.x * nk * .8 * (1. - ss(.5, 1.4, px * 20.))); }      // dry leaves and bits of straw
  }
  var alb = mix(soil * (1. - .28 * ss(-.14, 0., gedge)), grass, gm);                                         // the earth is darker and damper in under the edge of the turf
  // Under the rubber trees: the ground is in shade the year round and deep in their fallen leaves - brown litter, little grass - from the back of
  // the verge on.
  let plz = plw(wp.z); let rbz = plz * rubk(wp.z); let opz = plz - rbz;
  if (rbz > 0.) { let lit = rbz * ss(8., 12., rd) * (.72 + .2 * ss(.3, .7, n2));
    alb = mix(alb, mix(vec3f(.150, .100, .055), vec3f(.230, .165, .085), vn(P * .8 + 31.)) * (.7 + .5 * n3) * (.85 + .3 * n4), lit); }
  // Under the oil palms: shade too, but a palm drops no litter of small leaves - the ground keeps a low green cover, darker and damper than the
  // open verge, with bare trodden earth in a ring round each palm's foot (the palms stand on a lattice: see buildChunk).
  if (opz > 0.) { let cov = opz * ss(8., 12., rd); alb = mix(alb, mix(vec3f(.060, .095, .030), vec3f(.105, .125, .045), n2) * (.75 + .4 * n3) * (.85 + .3 * n4), cov * .7);
    let row = round(P.y / 7.8); let pq = vec2f(P.x - (round((P.x - 4.5 * (row - 2. * floor(row * .5))) / 9.) * 9. + 4.5 * (row - 2. * floor(row * .5))), P.y - row * 7.8);
    alb = mix(alb, vec3f(.20, .145, .09) * (.75 + .4 * n3), cov * (1. - ss(1.1, 1.9 + rag * 4., length(pq))) * .8);
    let dzp = abs(P.y - (round((P.y - 3.9) / 15.6) * 15.6 + 3.9));      // under the heaps of cut fronds down every other lane: brown with their rot
    alb = mix(alb, mix(vec3f(.17, .115, .06), vec3f(.26, .19, .10), n2) * (.7 + .5 * n3), cov * (1. - ss(.9, 1.6 + rag * 5., dzp)) * (1. - ss(80., 95., rd)) * .75); }
  // The drive of a house in the fields (marked in the grid by chunks.js: i.w negative says how far it is to the drive's middle line, -.45 on it ..
  // -.05 at 4 m): earth beaten hard and pale by coming and going, the two wheel tracks barest and a shade darker, thin grass left standing between
  // them, and the turf closing in raggedly at the sides.
  if (i.w < -.05 && i.w > -.5) { let dl = (1. - (-i.w - .05) / .4) * 4.;
    let worn = 1. - ss(1.35, 1.95, dl + rag * 5. + (n2 - .5) * .5);
    if (worn > 0.) { let rut = 1. - ss(.28, .6, abs(dl - .8)); let mid = ss(.5, .22, dl) * ss(.3, .55, n2 + (n3 - .5) * .6);
      let bare = mix(soil, vec3f(.36, .26, .17) * (.8 + .3 * n3), .6) * (1. - .16 * rut);
      alb = mix(alb, mix(bare, grass * .9, mid * .75), worn); } }
  var bump = .9; var gloss = .02; var wet = 0.;
  // hill country: darker turf under the forest, bare rock where the slope is steep
  let twz = tw(wp.z); let swz = sw(wp.z); let hz_ = hw(wp.z) * (1. - twz); let slope = 1. - n.y; let nwz = max(nw(wp.z), g.camM.z);
  let fq = P * .012 + vec2f(40., 0.); var wood = 0.; if (hz_ > 0.) { let fm = (2. * pn(fq) + pn(fq * 2.03 + vec2f(17.1, 9.7))) / 3.; wood = hz_ * ss(.37, .45, fm); }      // the script plants the forest by this same number (fbm, two octaves)
  // (what belongs to one kind of country - forest floor, rock, paddies, the coast's kerbs, sand, pine needles - is only worked out where that country is)
  let ck = chy(wp.z);
  if (wood > 0.) {
  alb = mix(alb, mix(mix(vec3f(.060, .095, .025), vec3f(.11, .13, .04), n2), vec3f(.10, .075, .04) * (.7 + .6 * n3), ss(.45, .7, vn(P * 1.9 + 3.)) * .6) * (.75 + .4 * n4), wood * .9);      // shaded turf and leaf litter
  var canopy = vec3f(.05, .10, .03) * (.7 + .6 * vn(P * .2)); if (ck == 1) { canopy = mix(canopy, vec3f(.40, .12, .22) * (.75 + .5 * vn(P * .13 + 5.)), ss(.25, .45, vn(P * .06 + 11.)) * .85); }      // a cherry hill is pink from far off too
  alb = mix(alb, canopy, wood * ss(120., 300., dcam) * mix(.7, .85, f32(ck == 1))); }
  if (max(hz_, swz) > 0.) { let strata = sin(wp.y * 1.1 + n1 * 7.) * .5 + .5;
  let rk = ss(.30, .50, slope + (n2 - .5) * .14) * max(hz_, swz);
  alb = mix(alb, mix(vec3f(.23, .20, .17), vec3f(.36, .32, .27), strata) * (.6 + .7 * n2) * (.8 + .4 * n4), rk); bump = mix(bump, 2.2, rk); }
  // rice paddies
  let fv = flw(wp.z, twz); let pad = ss(mix(44., 6.5, fv), mix(52., 8.5, fv), rd) * (1. - ss(0., .15, hw(wp.z))) * (1. - twz) * (1. - seaz(wp.z)) * (1. - plz) * (1. - ss(0., .15, nwz));
  if (pad > 0.) {
  let pc = P / vec2f(28., 22.); let f = fract(pc); let hsh = ph(vec2i(floor(pc)));
  let ed = min(min(f.x, 1. - f.x) * 28., min(f.y, 1. - f.y) * 22.);
  let bund = 1. - ss(1.0, 1.8, ed);                                                        // (the bank and its slopes: see ground() in land.js)
  // What is in the plot. Rice stands in hills a hand's span apart in rows (25 cm each way, as rice is transplanted in Thailand: the blades themselves are set out so, in chunks.js):
  // near to, the ground shows the rows - each hill a dark foot with the wet between; far off they run together into the crop's own colour.
  let hq = vec2f(fract(P.x / .25) - .5, fract(P.y / .25) - .5); let hill = (1. - ss(.2, .46, abs(hq.x))) * (.75 + .25 * (1. - ss(.2, .45, abs(hq.y))));      // 1 along a row of hills (rows, not dots: drawn as dots the ground looked printed)
  let rowN = 1. - ss(.5, 1.4, px * 4.);                                                    // 1 where the rows can be told apart
  let empty = step(ph(vec2i(i32(floor(pc.x)) + 7, i32(floor(pc.y)) + 3)), .5);
  var field = mix(vec3f(.060, .105, .028), vec3f(.045, .060, .025), .5 * rowN * (1. - hill)) * (.8 + .4 * n3) * mix(1., .6, rowN); wet = .45 * rowN * (1. - hill);      // green rice: water glints between the rows
  if (hsh < .34) {                                                                         // under water: bare mud, or seedlings in their rows
    // (not a sheet of water: ploughed mud, wet and dark, with water standing in its low places in ragged pools, and clods and furrows showing)
    let pool = ss(.38, .62, vn(P * .16 + 2.) * .6 + vn(P * .55 + 7.) * .4); let fur = .5 + .5 * sin(P.x * 5.2 + n2 * 3.);
    field = mix(vec3f(.21, .15, .09) * (.75 + .35 * fur), vec3f(.13, .10, .065), pool) * (.8 + .4 * n3); wet = .12 + .88 * pool;
    if (empty < .5) { let sd = mix(.22, hill, rowN); field = mix(field, vec3f(.07, .13, .03), sd * .8); wet = 1. - sd * .7; } }
  else if (hsh >= .48 && hsh < .90) {                                                      // ripe: gold, paler along the bowed ears, darker down between the rows
    field = mix(vec3f(.17, .16, .045), vec3f(.25, .21, .06), n2) * (.8 + .3 * n3) * mix(1.2, .45 + .3 * hill, rowN) * (.9 + .15 * vn(P * .35 + 4.)); wet = 0.; }
  else if (hsh >= .90) { field = vec3f(.24, .19, .10) * (.7 + .5 * n4) * mix(1., .75 + .45 * hill, rowN); wet = .35 * (1. - hill) * ss(.4, .7, n2); }   // cut: stubble in rows, water lying in the low places
  let sgi = i32(floor(wp.z / SEG));
  if (zoneOf(sgi) == 0 && flws(sgi)) {
    // tilled earth, raked into beds along the rows the flowers stand in (as far apart as chunks.js sets each kind), dark furrows between
    let fk0 = fkind(wp.z); let per = select(select(select(.6, .45, fk0 == 2.), 1.3, fk0 == 1.), .7, fk0 == 0.);
    let fur = ss(.55, .92, abs(fract(P.x / per) - .5) * 2.) * (1. - ss(.5, 1.4, px * 2. / per));
    field = mix(vec3f(.185, .125, .075), vec3f(.085, .058, .036), fur) * (.78 + .44 * n3) * (.9 + .2 * n4); wet = 0.;
    // from far off a field in bloom is a sheet of colour: the ground takes the colour of its flowers where the flowers themselves are too small or too far to draw
    let fk = fkind(wp.z); var fcol = vec3f(.88, .60, .04);                                                                    // sunflowers
    if (fk == 1.) { fcol = mix(vec3f(.28, .38, .80), vec3f(.70, .42, .72), ss(.35, .65, vn(P * .05 + 3.))); }              // hydrangeas: blue, turning mauve and pink in patches
    if (fk == 2.) { fcol = tulc(ph(vec2i(i32(floor(P.x / 5.)), 61))); }                                                     // tulips: a band of one colour, then the next
    if (fk == 3.) { let hp = ph(vec2i(i32(floor(pc.x)), i32(floor(pc.y)) + 50)); fcol = vec3f(.84, .82, .76); if (hp > .4) { fcol = vec3f(.88, .46, .12); } if (hp > .75) { fcol = vec3f(.80, .30, .48); } }      // lilies: a plot of white, a plot of orange, a plot of pink
    // (under sunflowers, hydrangeas and lilies the ground is hidden by leaves: seen through the stems it is dark green, not bare tilled earth)
    if (fk != 2.) { field = mix(field, mix(vec3f(.028, .060, .016), vec3f(.13, .10, .045), fdry() * .8) * (.8 + .4 * n3), .85 * (1. - .55 * fur)); }      // (the furrows still show as lines of earth between the rows)
    // (by season: out of bloom there is little of the flowers' colour in the field - it is the green of the plants, or in the hot season their straw)
    let blm = fbloom(); let lfc = mix(vec3f(.050, .110, .022), vec3f(.20, .16, .06), fdry()); fcol = mix(lfc, fcol, blm);
    field = mix(field, fcol * .6 * (.8 + .4 * n2), max(select(.2, .05, fk != 2.), ss(35., 110., dcam)) * (.75 + .25 * sin(P.x * 9.)));
    // Looked down on, single plants leave the ground showing between them and a field seems thin: so where the eye looks steeply down the
    // ground under the plants is the soft green of the leaves lower in the crop, with a wash of the flowers' colour - no shapes. (Cards of
    // flowers laid over the field, and flower heads painted on the ground, were both tried for this: paper, and a printed cloth.)
    let tk = ss(.38, .75, Vg.y);
    field = mix(field, mix(mix(mix(vec3f(.026, .066, .013), vec3f(.058, .125, .024), vn(P * 4.5)), vec3f(.15, .12, .05), fdry() * .8) * (.7 + .5 * n3), fcol * .5, .3), tk * select(.85, .5, fk == 2.)); }
  let bundCol = mix(vec3f(.20, .14, .085), vec3f(.12, .15, .04), ss(.35, .65, n2)) * (.7 + .5 * n3);
  alb = mix(alb, mix(field, bundCol, bund), pad); wet *= pad * (1. - bund); }
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
  // rdT: distance from the road's edge as the street sees it - where frontage roads widen the street beside an underpass, the extra asphalt is
  // counted as road and the footpath and everything beyond it are painted that much further out
  let sv = select(0., svw(wp.z), twz > .01); let rdT = max(min(rd, 3.4), rd - sv);
  let asp = (1. - ss(3.5, 3.75, rdT)) * (1. - rivK);
  alb = mix(alb, mix(soil, vec3f(.33, .19, .11), .5) * (.75 + .5 * n3), (1. - ss(3.8, 5.2 + rag * 6., rd)) * .9 * (1. - twz) * (1. - swz) * (1. - rivK));
  // snowfield: everything level lies under snow
  if (nwz > .01) { alb = mix(alb, vec3f(.70, .73, .80) * (.9 + .1 * n2) * (.96 + .04 * n4), nwz * ss(.5, .2, slope + (n2 - .5) * .2)); bump = mix(bump, .25, nwz); gloss = mix(gloss, .3, nwz); }
  // coast road: red-and-white kerb on the sea side; on the land side a red cycle lane, its own kerb, then the foot of the wall
  let dxs = wp.x - roadX(wp.z); let pnw = pinew(wp.z); let swk = swz * (1. - pnw);
  let kerb = mix(vec3f(.72, .72, .69), vec3f(.58, .06, .05), step(.5, fract(Pf.y / 1.6))) * (.85 + .2 * n4);
  if (swk > 0.) {
  alb = mix(alb, kerb, swk * step(0., dxs) * ss(3.7, 3.78, rd) * (1. - ss(4.02, 4.1, rd)));
  alb = mix(alb, vec3f(.36, .115, .085) * (.8 + .3 * n4) * (.9 + .2 * n2), swk * step(dxs, 0.) * ss(3.7, 3.8, rd) * (1. - ss(5.7, 5.78, rd)));
  alb = mix(alb, kerb, swk * step(dxs, 0.) * ss(5.74, 5.8, rd) * (1. - ss(6.05, 6.12, rd)));
  alb = mix(alb, vec3f(.62, .62, .58) * (.85 + .2 * n4), swk * step(dxs, 0.) * ss(.19, .16, abs(rd - 3.95)) * step(.5, fract(wp.z / 2.4))); }     // white blocks dividing the red lane from the road
  // the beach: pale dry sand, darker and shining where the waves have just been; rocks are dark and wet at the waterline
  let su = dxs - shoreX(wp.z); let bz_ = bch(wp.z); let sw5 = ss(.25, .5, swz); let damp = ss(-9., -1., su + swash(wp.z));
  let sandM = sw5 * bz_ * ss(17., 24., dxs);
  if (sandM > 0.) { let sand = mix(vec3f(.40, .345, .24), vec3f(.21, .175, .12), damp) * (.9 + .15 * n2) * (.93 + .12 * n4) * (.97 + .03 * sin(su * 7. + n2 * 9.));
  alb = mix(alb, sand, sandM); bump = mix(bump, .3, sandM); gloss = mix(gloss, .5 * damp, sandM); }
  let iw = ism(P);                                    // round the island and on the mainland's shore facing it: a strip of sand above the waterline, damp at the water's edge
  if (iw > -25.) { let sI = ss(-24., -11., iw); alb = mix(alb, mix(vec3f(.40, .345, .24), vec3f(.21, .175, .12), ss(-3.5, -.5, iw + swash(wp.z) * .5)) * (.9 + .15 * n2) * (.93 + .12 * n4), sI); bump = mix(bump, .3, sI); }
  alb *= 1. - .5 * sw5 * (1. - bz_) * ss(-2.5, 0., su);
  let pin0 = mix(mix(6.15, 4.15, step(0., dxs)), 3.85, pnw);
  if (pnw > 0.) { alb = mix(alb, mix(vec3f(.30, .19, .10), vec3f(.36, .30, .20), ss(.4, .7, n2)) * (.7 + .5 * n3) * (.85 + .3 * n4), pnw * ss(pin0, pin0 + .5, rd) * (1. - ss(mix(17., 30., step(dxs, 0.)), mix(23., 40., step(dxs, 0.)), abs(dxs))) * .9 * (1. - sandM)); }
  // in town. Behind the street the land is yards of swept earth and rough grass, cut by lanes (ซอย) of patched concrete that leave the
  // main road every 36 m. The shophouses stand on a concrete apron poured in bays; along the road a tiled footpath and a painted kerb.
  var zebra = 0.; var xm = 0.; var lm = 0.;      // lm: in the mouth of any lane, where the road's white edge line is broken      // xm: in the mouth of a cross street, where the main road's kerb paint and edge lines stop
  if (twz > .01) {
    let so = soi(P); let tk = twz * (1. - rivK);
    let yard = mix(mix(soil, vec3f(.30, .235, .165) * (.75 + .4 * n3), .45), grass * .92, ss(-.03, .03, tfv - .52 + rag));      // swept earth, grass only where nobody walks
    alb = mix(alb, yard, tk);
    let cq = fract(P / 3.2); let cj = ss(0., .025, min(min(cq.x, 1. - cq.x), min(cq.y, 1. - cq.y)));
    let conc = vec3f(.30, .29, .27) * (.75 + .35 * n2) * (.85 + .3 * n4) * (.78 + .22 * cj);
    alb = mix(alb, mix(conc, conc * vec3f(.62, .6, .56), ss(.55, .8, vn(P * .21 + 3.)) * .6), tk * (1. - ss(25.5, 27.5 + n2 * 2., rdT)));
    let xr = tlb(so.z); let lw = 1.85 + 1.65 * xr;                    // xr: this lane is a cross street (two lanes of asphalt, a centre line, zebra crossings on the main road each side of it)
    // A lane is as long as its town is deep there: the full 160 m in the town proper, a short stub at the edges where the houses thin out - and it
    // stops where the town does (on a slanting road its far end would else run out of the town and across the fields to end in a paddy).
    let zl = so.z * 36. + 34.; let Ll = lanel(zl); let lk = step(.5, tw(zl)) * (1. - rivK) * ss(.35, .6, twz) * (1. - lriv(zl));
    let lane = (1. - ss(lw, lw + .2, abs(so.x))) * step(abs(so.y), Ll) * lk;
    let lcol = vec3f(.21, .205, .20) * (.72 + .4 * n2) * (.85 + .3 * n4) * (.78 + .22 * ss(0., .03, abs(fract(so.y / 5.) - .5)));
    alb = mix(alb, mix(lcol, vec3f(.075, .075, .08) * (.8 + .4 * n4), max(max(xr, ss(.5, .7, vn(P * .13 + so.z))), 1. - ss(10., 16., abs(so.y)))), lane);     // some lengths resurfaced in asphalt
    alb = mix(alb, vec3f(.60, .47, .06), xr * lane * step(abs(so.x), .07) * step(.45, fract(so.y / 6.)) * step(9., abs(so.y)));
    alb = mix(alb, vec3f(.62, .62, .58), xr * lk * step(abs(abs(so.x) - 3.3), .06) * step(8.5, abs(so.y)) * step(abs(so.y), Ll));
    alb = mix(alb, vec3f(.20, .15, .10) * (.7 + .5 * n3), tk * lk * (1. - lane) * (1. - ss(lw + .15, lw + 1.05, abs(so.x))) * step(abs(so.y), Ll) * ss(26., 28., rdT) * .7);      // worn earth at the lane's edges
    let ft = 1. - ss(.5, 1.4, px * 5.); let tq = fract(Pf / .4); let joint = mix(.8, ss(0., .06, min(min(tq.x, 1. - tq.x), min(tq.y, 1. - tq.y))), ft);
    let tile = mix(vec3f(.34, .33, .32), vec3f(.40, .27, .22), mix(.5, step(.5, fract((floor(Pf.x / .4) + floor(Pf.y / .4)) * .5)), ft) * .55);      // grey and brick-red paving blocks
    let kb = mix(kerb, mix(vec3f(.72, .72, .69), vec3f(.74, .58, .06), step(.5, fract(Pf.y / 1.6))) * (.85 + .2 * n4), step(.5, fract(so.z * .37))); let kbare = step(.6, fract(so.z * .61));      // four blocks in ten have bare kerbs
    // (no footpath and no kerb across the mouth of any lane - 1 - lane, below: its own surface runs out to the road's asphalt)
    let pave = mix(tile * (.8 + .25 * n4) * (.68 + .32 * joint), mix(kb, vec3f(.50, .49, .46) * (.85 + .2 * n4), kbare), 1. - ss(3.95, 4.02, rdT));
    alb = mix(alb, pave, tk * (1. - ss(7.7, 8.0, rdT)) * (1. - lane));
    // A lane joins the road as a road does: asphalt for its first lengths (above), and the kerb turned in along both its sides across the footpath.
    // (No stop line is painted across its mouth: tried, a white bar there read as the lane being closed off.)
    let kret = lk * step(abs(so.y), Ll) * ss(lw + .16, lw + .2, abs(so.x)) * (1. - ss(lw + .42, lw + .46, abs(so.x))) * ss(3.9, 4.0, rdT) * (1. - ss(7.7, 8.0, rdT));
    alb = mix(alb, mix(mix(vec3f(.72, .72, .69), mix(vec3f(.58, .06, .05), vec3f(.74, .58, .06), step(.5, fract(so.z * .37))), step(.5, fract(so.y / 1.6))) * (.85 + .2 * n4), vec3f(.50, .49, .46) * (.85 + .2 * n4), kbare), kret);
    bump = mix(bump, .3, twz); let ud = udk(wp.z); xm = xr * twz * lane * (1. - ud); lm = twz * lane * (1. - ud);
    let zc = mix(abs(so.x - 5.5), abs(abs(so.x) - 6.0), xr);
    zebra = twz * step(zc, 1.6) * step(rdT, 3.0) * step(.5, fract(dxs / 1.1)) * max(xr, step(fract(so.z * .5), .25)) * (1. - ud) * step(sv, .05);      // (none either where the frontage roads leave the main road)
  }
  var road = vec3f(.034, .035, .038) * (.72 + .5 * n4) * (.85 + .3 * n2);
  road = mix(road, vec3f(.52, .52, .48), ss(.08, .04, abs(rdT - 3.2)) * (1. - lm));      // (rdT: beside an underpass, the frontage road's outer edge too)
  road = mix(road, vec3f(.58, .42, .04), ss(.09, .05, rd) * max(step(.5, fract(wp.z / 9.)), ss(0., .2, hpw(wp.z))) * (1. - xm));      // a solid line round the switchbacks
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
  if (g.misc.w * max(twz, swz) > 0.) { let zk = round((wp.z - 16.) / 32.) * 32. + 16.; let ld = length(vec2f(wp.x - (roadX(zk) - 3.4), wp.z - zk));
  c += alb * vec3f(1., .72, .36) * (g.misc.w * max(twz, swz) * 2.6 * ss(24., 3., ld) / (1. + ld * ld * .03)); }
  // standing water in the flooded plots mirrors the sky, with a little mud showing when you look straight down
  if (wet > .01) {
    let t = g.cam.w; var rip = vec3f(vn(P * 1.3 + vec2f(t * .3, 0.)) - .5, 0., vn(P * 1.3 + vec2f(7., t * .25)) - .5) * .05;
    if (g.sun.w > .01) { let rc = P * 1.7; let rf_ = fract(rc) - .5; let rh = h2(floor(rc)); let tp = fract(t * 1.4 + rh * 7.); let rl = length(rf_); rip += vec3f(rf_.x, 0., rf_.y) / max(rl, .01) * (sin((rl - tp * .5) * 42.) * ss(.5, .1, rl) * ss(.08, .0, abs(rl - tp * .5)) * (1. - tp) * .5 * g.sun.w); }      // rings where the drops fall
    let wn = normalize(vec3f(0., 1., 0.) + rip); let R = reflect(-V, wn);
    let refl = mix(horizon(R), g.zen.rgb, pow(ss(0., .8, max(R.y, 0.)), .55)) + g.sunCol.rgb * pow(max(dot(R, L), 0.), 500.) * 2.5 * sh;
    let fr = .05 + .95 * pow(1. - max(dot(V, wn), 0.), 4.);
    // paddy water is a hand deep over mud and thick with it: it never mirrors the sky cleanly as a lake does. The mud shows through it even
    // at a low angle, in clouded patches, and what it does reflect it reflects browned.
    let pdw = 1. - lake; let murk = .55 + .45 * vn(P * .7 + 3.) * vn(P * 2.3 + 9.);
    var refl2 = mix(refl, refl * vec3f(.78, .74, .62), pdw); var fr2 = mix(max(fr, lake * .35), min(fr, .42) * murk, pdw); var deep = mix(.6, .78, pdw);
    // A town's canal lies low between concrete walls, with houses and trees along it: what it mirrors is mostly those, not the open sky, so it is
    // dark green-brown water with a dull sheen - left to mirror the bright horizon it came out as pale as the concrete and read as pavement.
    let cnl = lake * rivK * step(rv.w, .5) * step(.001, rv.y);
    if (cnl > 0.) { let cw = mix(vec3f(.030, .048, .030), vec3f(.050, .058, .030), murk) * (g.amb.rgb * 1.6 + g.sunCol.rgb * .22 * sh);
      c = mix(c, cw, cnl); refl2 = mix(refl2, refl * vec3f(.30, .36, .30), cnl); fr2 = mix(fr2, min(fr, .5), cnl); deep = mix(deep, 1., cnl); }
    c = mix(c, mix(c * deep, refl2, fr2), wet);
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
  let seaM = max(sw5 * ss(-.15, .15, su + swash(wp.z)), ss(-.15, .15, iw + swash(wp.z) * .5));
  if (seaM > .001) { return vec4f(mix(land, seaC(wp, V, sh), seaM), 1.); }
  return vec4f(land, 1.);
}
