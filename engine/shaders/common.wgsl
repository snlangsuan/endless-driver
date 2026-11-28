// Shared by every stage: the uniform block, noise, the ground's grain, wind, and the shapes of leaves and branches.
// The land itself (roads, zones, heights) is in land.wgsl, which src/shaders.js puts after this text.
// SHADOW_RES (the shadow map's size) and ULTRA (the ultra picture quality: the finer work below is done only then) are declared by src/shaders.js,
// in front of this text.
struct G { vp: mat4x4f, sm: mat4x4f, cam: vec4f, sun: vec4f, sunCol: vec4f, fwd: vec4f, right: vec4f, up: vec4f,
  fog: vec4f, res: vec4f, amb: vec4f, misc: vec4f, zen: vec4f, hor: vec4f, camM: vec4f, crush: array<vec4f, 8>, wake: array<vec4f, 8>, ssn: vec4f };
// ssn: x how far it is the cool season (0..1): the snowfield (nw) is under snow only then, and green upland the rest of the year; y the hour (0..24)
// wake: where the car has just been, newest first - x, z, the time it was there, w how hard its passing blows (0: none, or no such point)
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
// How dry the grass is at a place (0 green .. 1 straw), and the straw's colour. The season (g.fog.w) does not turn all the grass at once: it
// goes in broad patches - hollows that hold the damp stay green weeks longer, banks and thin soil bleach first - so even in the hot season
// the land is a mosaic of tan, olive and green, not one sheet of yellow. Dry grass is tan and beige, hardly yellow at all. The ground's paint
// (terrain.wgsl) and the blades that stand on it (leafV, below) ask the same, so they turn together.
fn dryK(P: vec2f) -> f32 { let m = vn(P * .021 + 17.) * .6 + vn(P * .083 + 5.) * .4; return clamp(g.fog.w * 1.6 - (1. - m) * 1.5, 0., 1.) * min(g.fog.w * 3., 1.); }
fn strawC(k: f32) -> vec3f { return mix(vec3f(.125, .105, .058), vec3f(.205, .175, .105), k); }
fn vn(p: vec2f) -> f32 { let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(h2(i), h2(i + vec2f(1., 0.)), u.x), mix(h2(i + vec2f(0., 1.)), h2(i + vec2f(1., 1.)), u.x), u.y); }
fn fbm(p: vec2f) -> f32 { var s = 0.; var a = .5; var q = p; for (var i = 0; i < 4; i++) { s += a * vn(q); q = q * 2.03 + vec2f(17.1, 9.7); a *= .5; } return s / .9375; }
fn ph(c: vec2i) -> f32 { var h = bitcast<u32>(c.x) * 374761393u + bitcast<u32>(c.y) * 668265263u; h = (h ^ (h >> 13u)) * 1274126177u; h = h ^ (h >> 16u); return f32(h) / 4294967296.; }
// Shop hours (chunks.js HRS). A country town shuts early: by six to eight in the evening most shops have pulled their shutters down and put
// out their lights, a grocery keeps open a little later, and only the convenience store is open all night. A box that belongs to a shop
// keeping hours carries 1000 * H in its shape slot, H = 1 + c + 12 o: the shop opens at 5.5 + o / 2 o'clock and shuts at 17 + c / 2
// (and 128 more: a shutter, there only while the shop is shut). hrsOpen: 1 while it is open (and for a box with no hours), else 0.
fn hrsOpen(w: f32) -> f32 { var k = floor(w / 1000.); if (k < .5) { return 1.; } if (k > 128.5) { k -= 128.; }
  let c = (k - 1.) % 12.; let o = floor((k - 1.) / 12.); let h = g.ssn.y; return step(5.5 + o * .5, h) * (1. - step(17. + c * .5, h)); }
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
// wind: the whole plant leans with height; nearby parts share a phase so leaves stay on their branches
// The flower fields by season (g.fog.w: 0 after the rains, about a quarter in the cool season, near 1 in the hot dry one). fbloom: the share of the
// plants' flowers that are out - all of them in the cool season, when such fields flower; about one in twelve in the rains, the rest still in bud; hardly
// any in the hot season. fdry: how far the plants have yellowed and dried by then.
fn fbloom() -> f32 { return mix(.08, 1., ss(.05, .2, g.fog.w)) * (1. - .88 * ss(.45, .85, g.fog.w)); }
fn fdry() -> f32 { return ss(.45, .85, g.fog.w); }
// (by the kind of flower: a marigold field (4) is the hot season's - watered, it is green all year and flowers through the hot season, a few out
// in the rains, some in the cool; the others as above)
fn fbloomK(ft: f32) -> f32 { if (ft == 4.) { return max(mix(.12, .4, ss(.05, .2, g.fog.w)), ss(.45, .85, g.fog.w)); } return fbloom(); }
fn fdryK(ft: f32) -> f32 { if (ft == 4.) { return 0.; } return fdry(); }
fn gust(p: vec2f) -> f32 { let t = g.cam.w; return vn(p * .02 - vec2f(t * .35, t * .22)); }      // gusts travel over the land with the wind
// How far a low plant (grass, rice, a flower) is bent at p: the wind's steady push, and on it waves that run downwind over the field - a long
// swell and a quicker ripple - so that it bows and rises again, row after row, the harder the wind the more. A function of the place and the
// time only, so that a flower's stem, leaves and head, a few centimetres apart, bend together.
fn fbend(p: vec2f, gs: f32) -> f32 { let t = g.cam.w; let W = g.misc.y; let a = dot(p, vec2f(.824, .567));
  let wv = .55 * sin(a * .42 - t * (1.6 + .25 * W)) + .3 * sin(a * 1.1 - t * (3.1 + .3 * W) + sin(dot(p, vec2f(-.567, .824)) * .21) * 2.) + .15 * sin(a * 2.3 - t * 5.2);
  return W * (.08 + .5 * gs) * max(.15, 1. + .85 * wv * ss(.6, 2.2, W)); }
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
override LS: f32 = 1.;      // how much longer the leaves of trees are drawn: the far densities, fewer of them, are made longer as well as wider so the crowns stay as full (render.js)
override NV: f32 = 4.;      // how many lengths the strip is cut into: 4 (10 vertices) close by, 2 (6 vertices) for the thinned-out leaves further off and for shadows
// One leaf or blade: a strip of 10 vertices bent, tapered and moved here from 12 numbers per instance.
// (kind 10 is a spray of blossom, 14 a sprig of rubber leaves - three leaflets to a leaf: see scene.wgsl)
// a: base xyz, length · b: yaw, elevation, half width, droop · c: kind (0 leaf, 1 palm leaflet, 2 grass, 3 green rice, 4 ripe rice, 5 banana leaf), seed, shade, height above the plant's foot
fn leafV(vi: u32, a0: vec4f, b0: vec4f, c0: vec4f) -> LO {
  var o: LO;
  // (c0.z: the leaf's shade, 0 to 1, and - a tree's - its species in twos on top of it: plants.js)
  let spc = floor(c0.z * .5); let c = vec4f(c0.x, c0.y, c0.z - 2. * spc, c0.w);
  let u = f32(vi & 1u) * 2. - 1.; let v = f32(vi >> 1u) / NV;
  var kind = i32(c.x + .5);
  // (19: a golden shower's leaf - drawn as any broadleaf sprig, but half of them fall in the hot season, when the tree flowers)
  let gsl = kind == 19; if (gsl) { kind = 0; }
  var a = a0; var b = b0; if (gsl && c.y < .55 * ss(.55, .85, g.fog.w)) { a.w = 0.; }
  if (kind == 11 && c.w > .5) {
    // A petal lying on the ground (a0: where; b0.x and c.y: its own numbers), not seen while it lies - the ground is painted with them - but
    // taken up into the air: by the car's passing (g.wake), thrown up and out to the side of its line, whirling, and coming down again within
    // three seconds; and by a strong wind in its gusts, lifted and carried off downwind in a long low hop, over and over.
    let tp = g.cam.w; let hs = b0.x; var size = 0.; var off = vec3f(0.);
    if (distance(a0.xz, g.cam.xz) < 70.) {
      var wk = 0.; var wage = 0.; var wout = vec2f(0.);
      for (var q = 0; q < 7; q++) { let wa = g.wake[q]; let wb = g.wake[q + 1]; if (wa.w * wb.w < .0004 || tp - wb.z > 3.2) { continue; }
        let ab = wb.xy - wa.xy; let hh = clamp(dot(a0.xz - wa.xy, ab) / max(dot(ab, ab), .0001), 0., 1.); let dv = a0.xz - (wa.xy + ab * hh); let dS = length(dv);
        let k = (1. - ss(1.4, 3.8, dS)) * mix(wa.w, wb.w, hh); if (k > wk) { wk = k; wage = tp - mix(wa.z, wb.z, hh); wout = dv / max(dS, .05); } }
      let ua = wage * (1.6 + 1.6 * hs); let rise = ua * exp(1. - ua);
      // (wet petals stick to the ground - g.amb.w: how wet it is - and are hardly taken up at all)
      let dryk = 1. - .9 * ss(.15, .6, g.amb.w); wk *= dryk;
      let carVis = wk * ss(0., .08, wage) * (1. - ss(2.2, 3.1, wage));
      let act = ss(1., 3.2, g.misc.y) * ss(.42, .62, gust(a0.xz)) * dryk; let tt = fract(tp * (.16 + .14 * c.y) + hs * 7.);
      let windVis = act * ss(0., .1, tt) * (1. - ss(.85, 1., tt));
      if (carVis > windVis) { let o2 = wout * wk * (1. - exp(-wage * 2.)) * (1. + 2.5 * hs) + vec2f(sin(tp * 5. + hs * 40.), cos(tp * 4.3 + hs * 23.)) * .5 * wk * rise;
        off = vec3f(o2.x, wk * (.35 + 2.4 * hs * hs) * rise, o2.y); }
      else { let o2 = vec2f(.824, .567) * tt * (1.5 + 5. * c.y) * act + vec2f(sin(tt * 9. + hs * 40.), cos(tt * 7. + hs * 23.)) * .25;
        off = vec3f(o2.x, act * sin(3.14159 * tt) * (.15 + 1.6 * c.y * c.y), o2.y); }
      size = a0.w * max(carVis, windVis);
    }
    a = vec4f(a0.xyz + off, size);
    b = vec4f(hs * 6.2832 + tp * (2. + 3. * c.y), sin(tp * 3.1 + hs * 50.) * 1.2, b0.z, 0.);
  } else if (kind == 11) {        // a petal in the air: it falls from where it was put (b0.y is how far down the ground is), swinging from side to side, turning over, carried off by the wind; then another starts
    let tt = fract(g.cam.w * (.045 + .035 * c.y) + b0.x); let drift = tt * b0.y * (.12 + .55 * g.misc.y * (.3 + gust(a0.xz)));
    a = vec4f(a0.x + sin(tt * 11. + b0.x * 40.) * .35 + .8 * drift, a0.y - tt * b0.y, a0.z + cos(tt * 8. + b0.x * 23.) * .35 + .55 * drift, a0.w * ss(0., .04, tt));
    b = vec4f(b0.x * 6.2832 + g.cam.w * (2. + 3. * c.y), sin(g.cam.w * 3.1 + b0.x * 50.) * 1.2, b0.z, 0.);
  }
  // The wild Himalayan cherry (sprays of kind 10, its petals 11) flowers in the cool season, when it has hardly a leaf; the rest of the year it is
  // in green leaf. Each spray is blossom or leaf by its own number against how far it is the cool season (g.ssn.x), so as the season comes and
  // goes the trees flower and leaf a spray at a time; and petals fall, and lie, only while they flower.
  let cbl = kind == 10 && c.y < g.ssn.x * 1.02; let clf = kind == 10 && !cbl;
  // (a petal whose droop - b0.w - is 1 is a golden shower's: yellow, and about only in the hot season)
  let gsp = kind == 11 && b0.w > .5;
  if (kind == 11) { a.w *= select(ss(.02, .3, g.ssn.x), ss(.55, .85, g.fog.w), gsp); }
  // the golden shower's chains of flowers hang only in the hot season
  if (kind == 18) { a.w *= ss(.55, .85, g.fog.w); }
  var bud = 0.; if (kind == 9 && c.y > fbloomK(fkind(a0.z))) { bud = 1.; a = vec4f(a0.x, a0.y + a0.w * .3, a0.z, a0.w * .34); b = vec4f(b0.x, b0.y, b0.z * .3, b0.w); }      // a flower not out (or over): a small green bud in its place
  // (a tree's leaves - not grass, rice, flowers, nor a petal in the air - drawn longer at the far densities: LS)
  if (!((kind >= 2 && kind <= 4) || kind == 9 || (kind >= 11 && kind <= 13) || kind == 15 || kind == 17)) { a.w *= LS; }
  let cy = cos(b.x); let sy = sin(b.x); let ce = cos(b.y); let se = sin(b.y);
  var dir = vec3f(ce * cy, se, ce * sy); var side = vec3f(-sy, 0., cy);
  var shp = pow(max(sin(3.14159 * pow(v, .75)), 0.), .6);
  if (kind == 0 || kind == 10) { shp = 1.; }                                         // a sprig: the fragment stage cuts the leaves out of it
  if (kind == 1) { shp = pow(max(sin(3.14159 * pow(v, .5)), 0.), .5); }
  let blade = (kind >= 2 && kind <= 4) || kind == 17;      // (17: the stem of a flower plant - a blade that does not flutter, see below)
  if (blade) { shp = 1. - v * .93; }
  if (kind == 5) { shp = 1.; }      // a whole banana leaf: narrow at the stalk, then a long even paddle, rounded at the end
  if (kind == 7) { shp = 1. - v * .35; }      // (a dead leaf: the fragment stage tears it to tatters)
  if (kind == 8) { shp = 1. - v * .35; }
  if (kind >= 12) { shp = 1.; }                                        // a hill of rice: a card the fragment stage cuts the leaves and ears from (12 green, 13 ripe)
  if (kind == 9) { shp = 1.; }                                         // a flower head: a square the fragment stage cuts petals from                                // a spray of needles: the fragment stage draws the needles
  var vv = v;
  if (kind == 9) {                                                     // a flower head turns its face to the eye (leaning back a little, each its own way), and is hung by its middle
    let tc = normalize(a.xz - g.cam.xz + vec2f(1e-4, 0.)); let j = (c.y - .5) * 1.2; let cj = cos(j); let sj = sin(j); let t2 = vec2f(tc.x * cj - tc.y * sj, tc.x * sj + tc.y * cj);
    // (Seen from above it leans further back, to go on facing the eye: a head stood nearly upright showed only its edge from a height, and a whole
    // field of them looked thin from there.)
    let vd = normalize(g.cam.xyz - a.xyz); let lean = max(1.5708 - b.y, .85 * asin(clamp(vd.y, 0., 1.))); let cl = sin(lean); let sl = cos(lean);
    dir = vec3f(t2.x * cl, sl, t2.y * cl); side = vec3f(-t2.y, 0., t2.x); vv = v - .5;
  }
  if (kind == 15) { shp = 1.; }
  var p = (a.xyz - g.cam.xyz) + a.w * (dir * vv + vec3f(0., -1., 0.) * (b.w * v * v * .5));      // relative to the eye from here on
  let tng = normalize(dir + vec3f(0., -b.w * v, 0.));
  var n = normalize(cross(side, tng));
  let t = g.cam.w;
  let pk = !blade && kind != 9 && (kind < 12 || kind == 14 || kind == 18 || kind == 20); var hgt = c.w; var rch = 0.; if (pk) { hgt = floor(c.w) / 32.; rch = fract(c.w) * 32.; }      // leaves of trees carry height and reach packed together
  if (kind == 15) { hgt = .4 + floor(c.w) / 50.; }      // (a flower's leaf: its height up the stem, unpacked - see the bend, below)
  let gs = gust(a.xz); let w = wind3G(a.xz, hgt + v * a.w * se * (1. - f32(kind == 15)), rch, gs);
  p += w;
  if (hgt < 3.4) { let cr = crushed(a.xz, hgt); if (cr.z > .003) {      // (nothing that high is pressed down)
    let up = hgt + v * a.w * se; p.y -= up * cr.z * .86; p = vec3f(p.x + cr.x * cr.z * (.25 + .35 * hgt), p.y, p.z + cr.y * cr.z * (.25 + .35 * hgt)); } }      // flat under the car, splayed a little outward
  if (blade || kind == 12 || kind == 13 || kind == 16) { let bend = fbend(a.xz, gs) * v * v * a.w * .55; p.x += .8 * bend; p.z += .55 * bend; p.y -= bend * .35; }      // waves run through grass and rice
  if (kind == 9) { let bend = fbend(a.xz, gs) * c.w * .55; p.x += .8 * bend; p.z += .55 * bend; p.y -= bend * .35; }      // rides on the tip of its stalk
  // A flower plant moves all of a piece: its stem (17) bends with the wind's waves as grass does; a leaf on it (15: its height up the stem
  // and the stem's length are packed in c.w) and its head (9) are carried by exactly as much as the stem has moved where they sit - and none of
  // the three has the small flutter of its own that leaves and blades have, which shook them apart from one another.
  if (kind == 15) { let hh = floor(c.w) / 50.; let ls = max(fract(c.w) * 5., .05); let bend = fbend(a.xz, gs) * hh * hh / ls * .55; p.x += .8 * bend; p.z += .55 * bend; p.y -= bend * .35; }
  let own = 1. - f32(kind == 9 || kind == 15 || kind == 17);
  let fl = own * g.misc.y * (.4 + 1.2 * gs) * sin(t * (6. + c.y * 4.) + c.y * 40. + a.x * 1.7) * .07 * v * a.w;
  p += mix(n, side, f32(blade)) * fl + side * (fl * .4 * (1. - f32(blade)));
  if (!blade) { let bp = h2(floor(a.xz / 1.3) + floor(a.y / 1.3) * 7.); p += vec3f(.8, .35, .55) * (g.misc.y * (.2 + gs) * .006 * min(hgt, 9.) * sin(t * 3.1 + bp * 6.2832)); }      // each bough tosses on its own
  p += side * (u * b.z * shp * WS);
  o.wp = p + g.cam.xyz; o.n = normalize(n + side * (u * .35)); o.uv = vec2f(u, v); o.cp = g.vp * vec4f(p, 1.);
  var col = mix(vec3f(.070, .140, .020), vec3f(.045, .100, .020), c.y);
  var tr = 1.;
  if (c.y > .86) { col = vec3f(.14, .15, .03); }
  if (kind == 1) { col = mix(vec3f(.07, .15, .03), vec3f(.10, .17, .035), c.y); }
  if (kind == 2) { col = mix(vec3f(.08, .14, .03), vec3f(.135, .175, .045), c.y); if (c.y > .8) { col = vec3f(.22, .195, .10); } }
  // (20: a sugar palm's fan - a stiff grey-green; the old ones yellowing, the dead - seeds over .9 - brown)
  if (kind == 20) { col = mix(vec3f(.060, .115, .050), vec3f(.095, .150, .060), fract(c.y * 5.3)); col = mix(col, vec3f(.20, .19, .06), ss(.7, .85, c.y)); if (c.y > .9) { col = vec3f(.21, .15, .08); } }
  // (16: a tuft of grass - a card the fragment stage cuts into a handful of blades - in the grass's own colours, yellowing with it in the dry season)
  if (kind == 16) { col = mix(mix(vec3f(.075, .135, .03), vec3f(.13, .17, .045), c.y), strawC(fract(c.y * 5.7)), dryK(a.xz) * (.45 + .55 * fract(c.y * 3.3))); }
  if (kind == 3 || kind == 17) { col = mix(vec3f(.085, .20, .025), vec3f(.13, .23, .035), c.y); }
  if (kind == 4) { col = mix(mix(vec3f(.12, .16, .05), vec3f(.17, .19, .06), c.y), strawC(c.y) * 1.08, .45 + .55 * dryK(a.xz)); }      // (tall wild grass: tan when dry, olive after the rains - it was one saturated yellow)
  if (kind == 5) { col = mix(vec3f(.085, .19, .032), vec3f(.05, .135, .026), c.y); if (c.y > .93) { col = vec3f(.20, .21, .05); } }
  if (kind == 7) { col = mix(vec3f(.20, .13, .06), vec3f(.26, .19, .09), c.y); tr = .3; }
  if (kind == 6) { col = mix(vec3f(.70, .06, .32), vec3f(.85, .30, .50), c.y); if (c.y > .8) { col = vec3f(.85, .80, .75); } }
  // dry season: grass turns to straw, trees yellow a little
  if (kind == 2) { col = mix(col, strawC(fract(c.y * 5.7)), dryK(a.xz) * (.45 + .55 * fract(c.y * 3.3))); }
  // (by species: a mango's leaves dark and leathery, its new flush - the odd sprig - coppery red; a rain tree's fine and a deep even green; a
  // dipterocarp's a paler olive; a bodhi's a deep glossy green, its new leaves pinkish; the rest as they were)
  if (kind == 0 && spc > .5) {
    if (spc == 6.) { col = mix(vec3f(.035, .085, .020), vec3f(.050, .110, .024), c.y); if (c.y > .9) { col = vec3f(.13, .060, .035); } }
    if (spc == 1.) { col = mix(vec3f(.045, .105, .022), vec3f(.060, .125, .026), c.y); }
    if (spc == 2.) { col = mix(vec3f(.075, .130, .030), vec3f(.100, .155, .040), c.y); if (c.y > .9) { col = vec3f(.20, .13, .04); } }
    if (spc == 7.) { col = mix(vec3f(.035, .105, .030), vec3f(.055, .135, .034), c.y); if (c.y > .9) { col = vec3f(.20, .12, .09); } }
  }
  if (kind == 0) { col = mix(col, vec3f(.13, .13, .03), g.fog.w * .4); }
  if (kind == 8) { col = mix(vec3f(.060, .105, .050), vec3f(.105, .150, .065), c.y); }
  if (kind == 9) { let ft = fkind(a.z); col = mix(vec3f(.92, .60, .03), vec3f(.97, .76, .08), c.y);      // a flower head, of the kind its stretch grows (the kind goes on to the fragment stage in tr)
    if (ft == 1.) { col = mix(vec3f(.28, .38, .82), vec3f(.72, .42, .74), ss(.35, .65, vn(a.xz * .05 + 3.))) * (.85 + .3 * c.y); }
    if (ft == 2.) { col = tulc(ph(vec2i(i32(floor(a.x / 5.)), 61))) * (.88 + .24 * c.y); }
    if (ft == 3.) { let hp = ph(vec2i(i32(floor(a.x / 28.)), i32(floor(a.z / 22.)) + 50)); col = vec3f(.92, .90, .84); if (hp > .25) { col = vec3f(.93, .42, .06); } if (hp > .5) { col = vec3f(.86, .20, .44); } if (hp > .8) { col = vec3f(.95, .78, .08); } col *= .92 + .12 * c.y; }
    if (ft == 4.) { let hp = ph(vec2i(i32(floor(a.x / 24.)), i32(floor(a.z / 20.)) + 90)); col = select(vec3f(.96, .70, .05), vec3f(.94, .42, .03), hp < .62) * (.88 + .2 * c.y); }      // marigolds: a plot of orange, a plot of yellow
    col = mix(col, col * vec3f(.62, .5, .36), fdryK(ft) * .8); if (bud > .5) { col = mix(vec3f(.10, .19, .04), vec3f(.26, .22, .08), fdryK(ft)); }
    tr = .1 + 2. * mix(ft, 2., bud) + select(1.6, .8, ft == 4. && bud < .5) * c.y; }      // (a marigold's seed is kept under .9: its number must stay below the banana leaf's)      // (a bud is drawn with the tulip's closed shape, whatever the flower)      // (and the head's own seed with it, in the fraction)
  let snl = max(nw(a.z) * g.ssn.x, g.camM.z); if (snl > .01) { col = mix(col, vec3f(.74, .77, .82), snl * (.3 + .5 * c.z)); }                                      // snow lying on the leaves
  if (kind == 15) { col = mix(vec3f(.050, .125, .022), vec3f(.085, .175, .032), c.y); tr = .6; }
  if (kind == 15 || kind == 17) { col = mix(col, mix(vec3f(.24, .19, .07), vec3f(.17, .12, .05), c.y), fdryK(fkind(a0.z)) * (.55 + .4 * c.y)); }
  if (kind == 18) { col = mix(vec3f(.93, .66, .03), vec3f(.98, .80, .10), c.y); tr = .55; }      // golden shower: deep to pale yellow      // flower plants, dried up in the hot season
  if (cbl || kind == 11) { col = mix(vec3f(.62, .09, .26), vec3f(.80, .24, .42), c.y); if (c.y > .85) { col = vec3f(.88, .46, .60); } }
  if (gsp) { col = mix(vec3f(.90, .62, .03), vec3f(.98, .80, .12), c.y); }      // cherry blossom: deep pink to nearly white
  if (clf) { col = mix(vec3f(.075, .17, .03), vec3f(.12, .22, .045), fract(c.y * 7.3)); col = mix(col, vec3f(.16, .15, .04), g.fog.w * .35); }      // and its leaves: a fresh mid green, dulled a little in the hot season
  o.col = col; o.pr = vec2f(c.z + 2. * spc, tr + (90. + 4. * c.y) * f32(kind == 18) + (40. + 4. * c.y) * f32(cbl) + 2. * f32(kind == 0 || clf) + 4. * fract(c.y * 7.3) * f32(clf) + 4. * c.y * f32(kind == 0) + 10. * f32(kind == 8) + 20. * f32(kind == 9) + (30. + 4. * c.y) * f32(kind == 5) + (50. + 4. * c.y) * f32(kind == 12) + (60. + 4. * c.y) * f32(kind == 13) + (70. + 4. * c.y) * f32(kind == 14) + (80. + 4. * c.y) * f32(kind == 15) + (100. + 4. * c.y) * f32(kind == 7) + (110. + 4. * c.y) * f32(kind == 16) + (120. + 4. * c.y) * f32(kind == 20));
  return o;
}
struct BO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) @interpolate(flat) m: f32 };
// One piece of trunk or branch: a tapered tube between two points (p0 r0 → p1 r1), h = heights above the foot for the wind
fn branchV(v: vec3f, p0: vec4f, p1: vec4f, h0: vec2f) -> BO {
  var o: BO;
  // (a tree's piece carries its species with its heights, in 4096s - chunks.js: taken off here, and sent on as the material, below zero)
  var h = h0; var spc = 0.; if (h0.x >= 0.) { spc = floor(h0.x / 4096.); h = h0 - vec2f(spc * 4096.); }
  let ax = p1.xyz - p0.xyz; let d = ax / max(length(ax), 1e-4);
  // (the round's own bearings, by which the bark is laid round it: taken from a fixed line in the world - along x, or z for a piece that itself
  // runs along x - so that they turn smoothly from one piece of a trunk to the next. Taken from straight up, a trunk's pieces - each nearly
  // upright, leaning its own way - had theirs turned any way at all, and the bark's furrows broke at every joint: a seam round the trunk.)
  var rf = vec3f(1., 0., 0.); if (abs(d.x) > .8) { rf = vec3f(0., 0., 1.); }
  let x = normalize(rf - d * dot(rf, d)); let y = cross(d, x);
  let nn = x * v.x + y * v.y;
  let pc = mix(p0.xyz - g.cam.xyz, p1.xyz - g.cam.xyz, v.z); var rr = mix(p0.w, p1.w, v.z);      // relative to the eye
  if (h.x < -.5) { rr = max(rr, length(pc) * .0009); }      // a wire is never drawn thinner than a pixel: it would break up into flickering dots
  var p = pc + nn * rr;
  // (a piece of a plant - trunk, bough, a made piece that sways - reaches a little past both its ends, by 0.6 of its thickness there: where two
  // meet at a bend the outer side stood open, a dark wedge across the trunk at every joint)
  if (h.x > -.5 || h.x < -1.5) { p += d * (v.z * 2. - 1.) * rr * .6; }
  let plant = step(-.5, h.x);                                  // h.x = -1 marks a made thing: h.y 0 concrete pole, 1 wire, 2 green stem
  let hd = max(h, vec2f(0.)); let w = wind3(mix(p0.xz, p1.xz, v.z), mix(floor(hd.x), floor(hd.y), v.z) / 32., mix(fract(hd.x), fract(hd.y), v.z) * 32.) * plant;
  p += w;
  // a made thing fixed to a plant goes with it in the wind, all of a piece: h.x = -2 - height for one that rides as a bough does (a coconut, a
  // banana plant's own parts), -102 - height for one held to a trunk, which moves only as the trunk does there (the tapper's cup on a rubber tree)
  if (h.x < -100.) { p += wind3(p0.xz, -h.x - 102., .03); }
  // (by the height of the point itself along the piece - h.x gives it at the piece's first end - so that pieces laid end to end, a palm's trunk
  // or a frond's rib, stay joined as they sway: each moved all of a piece by its first end's height, they parted at every joint in a wind)
  else if (h.x < -1.5) { p += wind3(mix(p0.xz, p1.xz, v.z), max(-h.x - 2. + (p1.y - p0.y) * v.z, 0.), .5); }
  { let hh = mix(floor(hd.x), floor(hd.y), v.z) / 32.; let pw = mix(p0.xz, p1.xz, v.z); let cr = crushed(pw, hh) * plant; if (cr.z > .003) { p.y -= hh * cr.z * .86; p = vec3f(p.x + cr.x * cr.z * (.25 + .35 * hh), p.y, p.z + cr.y * cr.z * (.25 + .35 * hh)); } }
  o.m = (1. - plant) * (h.y + 1.) - plant * spc;
  o.wp = p + g.cam.xyz; o.n = nn; o.uv = vec2f(atan2(v.y, v.x) / 6.2832, p.y + g.cam.y); o.cp = g.vp * vec4f(p, 1.);
  return o;
}
