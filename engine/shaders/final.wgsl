// The last pass: tone mapping, rain and snow streaks, rain and snow on the windscreen, a little noise against banding.
@group(0) @binding(0) var s: sampler;
@group(0) @binding(1) var tS: texture_2d<f32>;
@group(0) @binding(2) var tB: texture_2d<f32>;
// a: x exposure, y rain (+) or snow (-) falling past the eye, z time, w the streaks' slant
// b: x how wet the windscreen is, y how much snow lies on it (both 0..1, and 0 unless looking out from the driver's seat), z speed (m/s), w width / height
// What a drop on the glass does depends on its size (wind pushes on its face, its weight grows faster than that, and the glass holds its rim): the
// finest stay where they land; small ones are the first to be driven up by the wind; big ones go on running down until the car is fast. So the
// drops are kept in three sizes - x big, y middling, z small - each with its own:
// c: how far the running drops have slid (down +); c.w: how misted the inside of the glass is, 0..1 · d: which way they go now (1 down .. -1 up; 0 hanging); d.w: how much snow has piled on the glass, 0..1 · e: how far the standing ones have crept up
// f: x how far into the cinematic view's film look (0..1), y the black bars' part of the height, each (cinema.js)
struct U { a: vec4f, b: vec4f, c: vec4f, d: vec4f, e: vec4f, f: vec4f };
@group(0) @binding(3) var<uniform> uu: U;
struct VO { @builtin(position) cp: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO { var o: VO; let p = vec2f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1)); o.cp = vec4f(p, 0., 1.); o.uv = vec2f(p.x * .5 + .5, .5 - p.y * .5); return o; }
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
fn hash3(p: vec2f) -> vec3f { var q = fract(vec3f(p.xyx) * vec3f(.1031, .1030, .0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yzz) * q.zyx); }
// Water on the glass, in the screen's own measure (p: x across in heights, y down). Each returns where in the drop the pixel is (xy: -1..1 from its
// middle), how much of the pixel it covers (z) and how big the drop is (w). A drop is a little fish-eye lens: through it the world is seen wide and
// upside down, so the bright sky shows in the lower half of every drop and the road in the upper.
// Beads: in each cell at most one, landing at its own moment, sitting, then shrinking away as it dries or runs off. dens: the share of cells holding one;
// el: how hard the wind leans on it (0: round) - held by its rim it does not travel, only stretches a little the way the air goes.
fn beads(p: vec2f, t: f32, sc: f32, dens: f32, el: f32) -> vec4f {
  let q = p * sc; let id = floor(q); let f = fract(q); let h = hash3(id + sc);
  if (h.z > dens) { return vec4f(0.); }
  let per = 3. + 5. * h.y; let age = fract(t / per + h.x); let c = vec2f(.25, .3) + vec2f(.5, .4) * hash3(id + 7.1 + floor(t / per + h.x)).xy;
  let r = (.09 + .11 * h.y) * mix(1., .55, age) * (1. - .2 * el); let d = (f - c) * vec2f(1. + .15 * el, 1.12 / (1. + .6 * el)); let L = length(d);
  let m = ss(r, r * .7, L) * ss(0., .03, age) * ss(1., .8, age);
  return vec4f(d / max(r, 1e-4), m, r / sc);
}
// Runs: drops that have let go and travel. sl: how far (down +; it runs backwards when the wind over the glass beats their weight); vel: which way
// they are going now, 1 down .. -1 up; near 0 the two forces balance and the drop hangs where it is, shivering.
// Going down under its own weight a drop trickles: slowly, in fits and starts, wandering from side to side, leaving a broken trail of tiny beads.
// Driven up by the wind it is another thing: it shoots straight along the air's way, fast, a drop drawn out to a point behind - no thread trailing
// after it and no wandering (drawn that way it looked like something swimming).
fn runs(p: vec2f, sl: f32, t: f32, sc: f32, dens: f32, vel: f32) -> vec4f {
  var q = p * vec2f(sc, sc / 6.); let col = floor(q.x); q.y += hash3(vec2f(col, 3.7)).x * 7.;
  let id = floor(q); let f = fract(q); let h = hash3(id + 19.3);
  if (h.z > dens) { return vec4f(0.); }
  let climb = max(-vel, 0.); let ck = ss(0., .5, climb); let hang = 1. - abs(vel);
  let tt = fract(sl * (.07 + .06 * h.x) + h.y); let mv = tt + .03 * sin(tt * 31. + h.x * 6.) * (1. - ck);      // stick and slip, on the way down
  let yd = mix(.06, .94, mv) + hang * .006 * sin(t * 23. + h.x * 40.);
  let wander = .2 * (.5 + h.y) * (1. - ck);
  let xd = .5 + wander * sin(yd * 9. + h.x * 6.) + (h.y - .5) * .4 * ck + hang * .03 * sin(t * 17. + h.y * 30.);
  let d = (f - vec2f(xd, yd)) * vec2f(1., 6.); let r = (.2 + .08 * h.y) * (1. - .4 * ck);
  // its shape: round in front; behind (the way it came from) drawn out to a point, a little under its own weight and a long way by the wind
  let along = d.y * sign(-vel); let Lt = r * (1. + 2.4 * climb); let taper = pow(clamp(1. - along / Lt, 0., 1.), .6);      // (a rounded tail, not a spike)
  let Lh = length(d * vec2f(1., 1.1)); let Le = select(Lh, mix(Lh, abs(d.x) / max(taper, .02), ck), along > 0.);      // (trickling or hanging it is simply round)
  var m = ss(r, r * .72, Le) * mix(1., step(along, Lt) * taper, step(0., along) * ck) * ss(0., .05, tt) * ss(1., .95, tt);
  var n = vec2f(d.x / max(r * mix(1., max(taper, .5), ck), 1e-4), select(d.y / r, mix(d.y / r, .45 * sin(3.1416 * clamp(along / Lt, 0., 1.)) * sign(d.y), ck), along > 0.));      // (the lens carries on smoothly from the round front into the tail)
  // the trail of beads it leaves when trickling down
  let behind = yd - f.y; let tx = .5 + wander * sin(f.y * 9. + h.x * 6.); let tb = fract(f.y * 36.); let bd = length(vec2f((f.x - tx) * 3., (tb - .5) * .5));
  let trail = ss(.12, .06, bd) * step(.03, behind) * ss(.35, .05, behind) * step(.55, hash3(vec2f(id.x, floor(f.y * 36.) + id.y * 40.)).x) * ss(.1, .5, vel) * .8;
  if (trail > m) { return vec4f(clamp(vec2f((f.x - tx) * 3., (tb - .5) * .5) / .12, vec2f(-1.), vec2f(1.)) * .5, trail, r * .3 / sc); }
  return vec4f(clamp(n, vec2f(-1.), vec2f(1.)), m, r / sc);
}
fn vn2(p: vec2f) -> f32 { let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(hash3(i).x, hash3(i + vec2f(1., 0.)).x, u.x), mix(hash3(i + vec2f(0., 1.)).x, hash3(i + vec2f(1., 1.)).x, u.x), u.y); }
fn aces(x: vec3f) -> vec3f { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), vec3f(0.), vec3f(1.)); }
// The scene as this point of the screen sees it. When the picture is drawn larger than the screen (uu.f.z: how many times, see resize() in render.js)
// it is shrunk back here, four filtered taps across the screen pixel's own footprint, so a fine edge is averaged rather than skipped over.
fn scn(uv: vec2f) -> vec3f {
  let r = uu.f.z; if (r < 1.05) { return textureSampleLevel(tS, s, uv, 0.).rgb; }
  let o = .25 * r / vec2f(textureDimensions(tS));
  return (textureSampleLevel(tS, s, uv + vec2f(-o.x, -o.y), 0.).rgb + textureSampleLevel(tS, s, uv + vec2f(o.x, -o.y), 0.).rgb
        + textureSampleLevel(tS, s, uv + vec2f(-o.x, o.y), 0.).rgb + textureSampleLevel(tS, s, uv + vec2f(o.x, o.y), 0.).rgb) * .25;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let u = uu.a; let b = uu.b;
  let ck = uu.f.x;
  var c = scn(i.uv) + textureSampleLevel(tB, s, i.uv, 0.).rgb * (.22 + .08 * ck);
  // (the film look: the red and the blue drawn a hair apart toward the edges, as a lens fringes them)
  if (ck > .001) { let q0 = (i.uv - .5) * dot(i.uv - .5, i.uv - .5) * .012 * ck;
    c = vec3f(textureSampleLevel(tS, s, i.uv + q0, 0.).r + textureSampleLevel(tB, s, i.uv + q0, 0.).r * (.22 + .08 * ck), c.g, textureSampleLevel(tS, s, i.uv - q0, 0.).b + textureSampleLevel(tB, s, i.uv - q0, 0.).b * (.22 + .08 * ck)); }
  c *= u.x;
  // the windscreen: water standing on it bends the road behind into little upside-down lenses, lit along their tops; snow settles in flakes that
  // soften into water. Seen only from the driver's seat (b.x, b.y are 0 otherwise).
  if (b.x > .01 || b.y > .01) {
    let p = vec2f(i.uv.x * b.w, i.uv.y); let t = u.z; let up = ss(9., 22., b.z); let wet = b.x; let hv = wet * wet;
    // The air over a windscreen flows up it and out toward the pillars, as from a point below the bonnet. The water is laid out along that flow
    // (pw: across it, and down it), so when the wind takes hold every drop creeps the way the air goes: up, and outward at the sides.
    let O = vec2f(.5 * b.w, 1.9); let ov = p - O; let pw = vec2f(atan2(ov.x, -ov.y) * 1.4, 1.9 - length(ov));
    let sl = uu.c.xyz; let vl = uu.d.xyz; let cr = uu.e.xyz; let wf = b.z * b.z / 484.;      // wf: the wind's push (1 at 80 km/h)
    let el = clamp(vec3f(.8 * wf - .6, 1.2 * wf - .3, .5 * wf - .8), vec3f(0.), vec3f(1.));      // how far each size of standing drop is drawn out by it
    // heavy rain: the glass runs with a sheet of water that makes everything behind it swim
    if (hv > .3) { let k = (hv - .3) * .0032; let sl2 = sl.y;
      let dv2 = vec2f(sin(pw.y * 37. + sin(pw.x * 11. + sl2) * 2.2 - sl2 * 2.6), cos(pw.x * 29. + pw.y * 13. + sl2 * 1.7)) * k;
      c = (textureSampleLevel(tS, s, i.uv + dv2, 0.).rgb + textureSampleLevel(tB, s, i.uv + dv2, 0.).rgb * .22) * u.x; }
    // Standing drops, from big down to the finest spray: more of every size the harder it rains. Standing still in heavy rain the glass carries big
    // drops; at speed it cannot - the wind strips them off and every drop that strikes is smashed small - so the faster the car, the fewer and
    // smaller the big ones, and the more, finer and shorter-lived the small (tb: how fast they come and go).
    let tb = t * (1. + 1.5 * up);
    var w = beads(pw + vec2f(0., cr.y), tb, 22., .8 * wet * (1. - .7 * up), el.y);
    var w2 = beads(pw + vec2f(3.1, 3.1 + cr.z), tb * 1.3, 41., .9 * wet, el.z); if (w2.z > w.z) { w = w2; }
    w2 = beads(pw + vec2f(5.7, 1.3), tb * 1.7, 75., .9 * mix(hv, wet, up), 0.); if (w2.z > w.z) { w = w2; }
    w2 = beads(pw + vec2f(1.3, 7.7 + cr.x), t * .8, 11., .55 * hv * (1. - up) * ss(.3, .55, wet), el.x); if (w2.z > w.z) { w = w2; }      // (no big drops from a little water: melted snow never makes them)
    if (up > .05) { w2 = beads(pw + vec2f(8.2, 4.9 + cr.z), tb * 1.5, 57., .9 * wet * up, el.z); if (w2.z > w.z) { w = w2; } }
    // running drops likewise: the big and middling ones thin out at speed, and fine quick ones take their place
    var w3 = runs(pw, sl.x, t, 7., .65 * wet * (1. - .85 * up) * ss(.3, .55, wet), vl.x); if (w3.z > w.z) { w = w3; }
    w3 = runs(pw + 4.4, sl.y, t, 12., .6 * hv * (1. - .5 * up), vl.y); if (w3.z > w.z) { w = w3; }
    w3 = runs(pw + 9.1, sl.z, t, 19., .7 * wet * mix(.35, 1., up), vl.z); if (w3.z > w.z) { w = w3; }
    if (up > .05) { w3 = runs(pw + 13.3, sl.z * 1.4, t, 30., .75 * wet * up, vl.z); if (w3.z > w.z) { w = w3; } }
    // Snow on the glass. The screen is warm from the cabin, so no flake stays snow for long: it lands, lies white and ragged a few seconds, goes
    // grey and glassy from the edges, and is a bead of water. Standing or creeping along, flakes settle faster than they melt and the glass is
    // dotted white with them. At speed most are carried over the roof by the wind without touching; those that do strike are few, smaller,
    // slide a little up the glass and melt in a moment - so what a driver at speed sees on the screen is mostly their water (which then
    // behaves as rain does: b.x carries it), with a brief white speck here and there.
    // Flakes do not melt the moment they touch: they lie a while and more land beside and on them, so that the glass gathers a scatter of white
    // - single flakes of two sizes and, standing or going slowly, clumps where several have piled together - before the warmth gets through and
    // each goes to water in its turn. (k = 2: the clumps.)
    var sn = 0.;
    for (var k = 0; k < 3; k++) {
      let fk = f32(k); let cl = step(1.5, fk); let scs = mix(17. + 14. * fk, 9., cl); let qs = pw * scs + fk * 5.3; let ids = floor(qs); let fs_ = fract(qs); let hs = hash3(ids + 51. + fk * 9.);
      if (hs.z < mix(mix(.9, .28, up), .6 * (1. - up), cl) * b.y) {
        let per = (9. + 8. * hs.y) * (1. + .6 * cl) / (1. + 4. * up); let ph = t / per + hs.x; let age = fract(ph);
        var cs = .3 + .4 * hash3(ids + 2.3 + floor(ph)).xy; cs.y -= age * .2 * up;
        let dv = fs_ - cs; let an = atan2(dv.y, dv.x);
        let grow = mix(1., ss(0., .35, age), cl);                              // a clump builds up as flakes land on it
        let rr = (.13 + .1 * hs.y) * (1. + .5 * cl) * grow * (1. - .35 * up) * (.75 + .25 * sin(an * 6. + hs.x * 9.) * sin(an * 3. + hs.y * 5.) + cl * .12 * sin(an * 11. + hs.y * 20.));
        let melt = ss(.62, .9, age); let fl = ss(rr * (1. - .45 * melt), rr * .5 * (1. - .45 * melt), length(dv)) * ss(0., .02, age) * (1. - melt) * .9;
        sn = max(sn, fl);
        let rw = rr * .32; let wd = ss(rw, rw * .7, length(dv)) * ss(.6, .85, age) * ss(1., .93, age);      // its water, showing through as the white goes. A flake is mostly air, so the bead is a third as wide.
        if (wd > w.z && wd > fl) { w = vec4f(dv / max(rw, 1e-4), wd, rw / scs); }
      }
    }
    if (w.z > .002) {
      let n = w.xy; let K = .06 + w.w * 2.5; let cen = i.uv - vec2f(n.x / b.w, n.y) * w.w;      // the drop's middle on the screen; K: how wide it sees
      let q2 = clamp(cen - vec2f(n.x / b.w, n.y) * K, vec2f(.001), vec2f(.999));
      var seen = (textureSampleLevel(tS, s, q2, 0.).rgb + textureSampleLevel(tB, s, q2, 0.).rgb * .35) * u.x;
      let rim = ss(.55, 1., length(n));
      seen = seen * (1. - .45 * rim * rim);                                                     // the edge, where the light is bent away, darker
      seen += vec3f(.95, .97, 1.) * ss(.15, .0, length(n - vec2f(-.35, -.45))) * .6 * (.25 + dot(c, vec3f(.3, .6, .1)));      // and a glint high on one side
      c = mix(c, seen, w.z);
    }
    if (sn > .002) { let lum = dot(c, vec3f(.3, .6, .1)); c = mix(c, vec3f(.86, .89, .94) * (.18 + .9 * min(lum, 1.2)), sn); }
  }
  // Snow piled on the glass of a car standing in a snowfall: it settles faster than the screen's warmth can melt it. It gathers first along the
  // bottom, where it slides down to and lies against the wipers, and in drifts where flakes have clumped; the drifts spread and join until nothing
  // can be seen out at all. What lies there is lit from behind by the day: paler where it is thin, at its edges, grey and lumpy where deep.
  var pcov = 0.;      // how much of this pixel the piled snow hides: nothing beyond it - the mist, the falling snow - shows there
  if (uu.d.w > .005) {
    let pl = uu.d.w; let p0 = vec2f(i.uv.x * b.w, i.uv.y); let pp = vec2f(p0.x * .8 + p0.y * .6, p0.y * .8 - p0.x * .6);      // (turned, so the grain of the noise does not run square to the picture)
    let n1 = vn2(pp * 3.1 + 4.) * .55 + vn2(pp * 8.3 + 9.) * .3 + vn2(pp * 21.) * .15;
    let lvl = pl * 1.45 - (n1 * .9 + (1. - i.uv.y) * .45);                     // how deep it lies here (above 0: covered)
    let cov = ss(-.02, .05, lvl);
    if (cov > .003) {
      var al = 0.; for (var k = 0; k < 5; k++) { al += dot(textureSampleLevel(tS, s, vec2f(.1 + .2 * f32(k), .35 + .1 * f32(k & 1)), 0.).rgb, vec3f(.3, .6, .1)); }
      al = min(al * .2 * u.x, 1.4);                                              // the daylight outside, taken from across the picture
      let deep = ss(.0, .45, lvl); let lump = .93 + .05 * vn2(pp * 31.) + .1 * (vn2(pp * 7. + 2.) - .5) + .05 * (vn2(pp * 15. + 5.) - .5);
      let snc = vec3f(.86, .89, .94) * (.22 + al * mix(1.15, .7, deep)) * lump;
      pcov = cov * mix(.9, 1., deep); c = mix(c, snc, pcov);
    }
  }
  // Mist on the inside of the glass: cold outside, warm damp air in the cabin, and the water in it settles on the cold screen. The heater's
  // vents along the bottom of the screen blow it clear in a patch that spreads up from the middle, so what is left is a milky border, widest
  // in the top corners and down the sides, with a ragged edge; the colder and wetter it is out, the smaller the clear patch. Through the mist
  // everything is blurred and paled, and lights spread into a glow.
  if (uu.c.w > .01) {
    let fa = uu.c.w; let qf = (i.uv - vec2f(.5, .64)) * vec2f(1., 1.3);
    let rag = .05 * sin(i.uv.x * 9. + 1.3) * sin(i.uv.y * 7. + .4) + .025 * sin(i.uv.x * 23. + i.uv.y * 17.);
    let R = mix(.78, .3, fa); let mk = ss(R, R + .24, length(qf) + rag) * min(1., fa * 1.6) * (1. - pcov);
    if (mk > .01) {
      var bl = vec3f(0.); let rad = .012 + .012 * mk;
      for (var k = 0; k < 8; k++) { let an = f32(k) * .7854 + .4; let o = vec2f(cos(an) / b.w, sin(an)) * rad * (.6 + .4 * f32(k & 1));
        bl += textureSampleLevel(tS, s, i.uv + o, 0.).rgb + textureSampleLevel(tB, s, i.uv + o, 0.).rgb * .5; }
      bl = bl * (u.x / 8.); let lb = dot(bl, vec3f(.3, .6, .1));
      let grain = .94 + .06 * fract(sin(dot(floor(i.uv * vec2f(b.w, 1.) * 260.), vec2f(12.9898, 78.233))) * 43758.5453);
      let fogc = mix(bl, vec3f(.80, .83, .87) * (.10 + .85 * min(lb, 1.3)), .55) * grain;
      c = mix(c, fogc, mk * .88);
    }
  }
  let ry = abs(u.y); let snf = step(u.y, -.01);
  if (ry > .01) {            // rain falling past the eye, or snow drifting down; the scene greyed
    let lum = dot(c, vec3f(.3, .6, .1)); c = mix(c, vec3f(lum) * vec3f(.96, 1., 1.05), .22 * ry * (1. - pcov)); var r = 0.;
    if (snf > .5) {          // snow: flakes at three depths, swaying as they come down
      for (var k = 0; k < 3; k++) {
        let fk = f32(k); let sc = 16. + fk * 14.;
        var p = vec2f(i.uv.x * sc * 1.78 + i.uv.y * sc * u.w + fk * 7.3, i.uv.y * sc - u.z * (1.5 - fk * .35));
        p.x += sin(u.z * .8 + p.y * .7 + fk) * .35;
        p.y += fract(sin(floor(p.x) * 91.7 + fk) * 43758.5453) * 9.;                 // every column falls out of step with its neighbours
        let id = floor(p); let f = fract(p); let h = fract(sin(dot(id, vec2f(127.1, 311.7))) * 43758.5453);
        let on = step(1. - (.1 + .5 * ry), h); let x0 = .2 + .6 * fract(h * 57.3);
        r += on * (1. - ss(.03, .11 - fk * .02, length(f - vec2f(x0, .5)))) * 1.6 * (.55 - .13 * fk);
      }
      c += vec3f(.72, .78, .88) * r * (.06 + lum * .5) * (.5 + .5 * ry) * 1.8 * (1. - pcov);
    } else {
      // Rain, as the eye sees it rather than as lines ruled across the picture: each drop a short stroke, brightest at its head and fading up its
      // tail, no two alike in brightness. Five depths - the near drops few, long, fast and soft, the far ones a fine quick-falling veil. The strokes
      // lean with the wind, and they spread apart toward the bottom of the picture as things do that fall past close by; driving into the rain
      // they come from further ahead, so the point they spread from drops toward the road's end and the strokes grow longer and faster.
      let a = ss(5., 30., b.z) * 1.1; let x0 = (i.uv.x - .5) / (1. + a * (i.uv.y - .35));
      for (var k = 0; k < 5; k++) {
        let fk = f32(k); let d = fk * .25;
        let len = mix(.15, .03, d) * (1. + .6 * a); let sx = mix(10., 46., d) * b.w; let sy = 1. / (len * 2.4); let v = mix(2.4, .8, d) * (1. + .8 * a);
        var p = vec2f((x0 + i.uv.y * u.w * .55) * sx + fk * 7.3, (i.uv.y - u.z * v) * sy);
        p.y += fract(sin(floor(p.x) * 91.7 + fk) * 43758.5453) * 9.;                 // every column falls out of step with its neighbours
        let id = floor(p); let f = fract(p); let h = fract(sin(dot(id, vec2f(127.1, 311.7))) * 43758.5453);
        let on = step(1. - (.12 + .5 * ry), h); let xc = .2 + .6 * fract(h * 57.3);
        let line = 1. - ss(0., mix(.05, .09, d), abs(f.x - xc));
        r += on * line * ss(.08, .5, f.y) * ss(.58, .5, f.y) * mix(.5, .22, d) * (.5 + fract(h * 13.7));
      }
      c += vec3f(.72, .78, .88) * r * (.05 + lum * .35) * (.5 + .5 * ry);
    }
  }
  let q = i.uv - .5; c *= 1. - dot(q, q) * (.22 + .78 * ck);
  c = aces(c);
  // The everyday look: bright and saturated. Vibrance lifts the duller colours more than the already strong ones (so the sky and the grass come up
  // without the red kerbs going garish), a gentle S of contrast gives the picture its punch, and the lights are warmed a touch, like a summer day.
  { let l = dot(c, vec3f(.2126, .7152, .0722)); let sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    c = max(mix(vec3f(l), c, 1.18 + .3 * (1. - ss(0., .5, sat))), vec3f(0.));
    c = mix(c, c * c * (3. - 2. * c), .22);
    c *= mix(vec3f(1.), vec3f(1.03, 1.0, .96), ss(.5, 1., l)); }
  // The film look, by ck: the shadows drawn toward teal and the lights toward a warm amber - set by each pixel's brightness, its own hue kept -
  // a soft S of contrast about the middle, the blacks lifted a touch as on a print, a shade less colour overall.
  if (ck > .001) {
    let lk = dot(c, vec3f(.2126, .7152, .0722)); let sh = 1. - ss(.0, .45, lk); let hi = ss(.4, 1., lk);
    var g = c * mix(vec3f(1.), vec3f(.86, 1.0, 1.08), sh * .5) * mix(vec3f(1.), vec3f(1.07, 1.0, .88), hi * .55);
    g = mix(g, g * g * (3. - 2. * g), .55);
    g = mix(vec3f(dot(g, vec3f(.2126, .7152, .0722))), g, .96);
    g = g * .985 + vec3f(.004, .007, .01);
    c = mix(c, clamp(g, vec3f(0.), vec3f(1.)), ck);
  }
  c = pow(max(c, vec3f(0.)), vec3f(1. / 2.2));
  let n = fract(52.9829189 * fract(dot(i.cp.xy, vec2f(.06711056, .00583715))));
  // (grain: a fine noise that moves every frame, more in the middle tones than in the lights)
  if (ck > .001) { let gp = floor(i.cp.xy / 1.5); let gn = fract(sin(dot(gp + fract(u.z * 7.13) * 91.3, vec2f(12.9898, 78.233))) * 43758.5453);
    let lg = dot(c, vec3f(.333)); c += (gn - .5) * .055 * ck * (1. - .6 * lg); }
  // (and the black bars, top and bottom, that make the picture 2.39:1)
  if (i.uv.y < uu.f.y || i.uv.y > 1. - uu.f.y) { c = vec3f(0.); }
  return vec4f(c + (n - .5) / 255., 1.);
}
