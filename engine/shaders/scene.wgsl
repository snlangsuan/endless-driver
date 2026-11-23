// Fragment stages of the picture: shadow, sky, leaves, branches and made things, boxes (houses, signs...). The ground is in terrain.wgsl.
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
// the same for leaves and twigs, at a ninth of the cost: one look-up (the sampler itself blends the four texels round the point). Their own
// outlines are too fine and too many for the difference to show, and they are most of what a forest draws.
fn shadowF(wp: vec3f) -> f32 {
  let s = g.sm * vec4f(wp - g.cam.xyz, 1.); let uv = vec2f(s.x * .5 + .5, .5 - s.y * .5);
  if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1. || s.z > 1.) { return 1.; }
  return mix(1., textureSampleCompareLevel(tSh, sSh, uv, s.z - .0012), ss(.5, .44, max(abs(uv.x - .5), abs(uv.y - .5))));
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
fn fogged(c: vec3f, wp: vec3f) -> vec3f {
  let v = wp - g.cam.xyz; let d = length(v); let hc = horizon(v / d);
  return mix(c, hc, max(1. - exp(-d * g.fog.x), ss(g.fog.y * .72, g.fog.y, d)));
}
// One flower head of kind ft (0 sunflower, 1 hydrangea, 2 tulip, 3 lily, else a plain eight-petalled one), drawn in a square: q from -1 to 1
// both ways, yv from 0 at its foot to 1 at its top; sd its own seed; col its colour. Returns the colour, and 0 in w where there is no flower.
fn fhead(ft: f32, q: vec2f, yv: f32, sd: f32, col: vec3f) -> vec4f {
  let rr = length(q); let an = atan2(q.y, q.x); var alb = col;
    if (ft < .5) {               // a sunflower: a ring of many narrow petals round a broad dark disc of seeds
    if (rr > .60 + .36 * abs(cos(an * 9.))) { return vec4f(0.); }
    alb = mix(col * (.8 + .3 * rr), vec3f(.11, .065, .03) * (.7 + .6 * h2(floor(q * 16.))), ss(.42, .36, rr));
  } else if (ft < 1.5) {       // a hydrangea's mophead: a dome of small four-petalled florets, each with a pale eye; rounded - lit above, in
    // shade beneath; here and there a floret not yet open, green-white
    if (rr > .93 + .05 * sin(an * 11. + sd * 20.)) { return vec4f(0.); }
    let g2 = q * 4.6 + vec2f(.5 * floor(q.y * 4.6), sd * 3.); let c2 = fract(g2) - .5; let fl = length(c2); let hh = h2(floor(g2) + sd * 31.); let pa = atan2(c2.y, c2.x) + hh * 6.;
    let pet = ss(.5, .34, fl * (1. + .22 * cos(pa * 4.)));
    alb = col * (.5 + .55 * pet) * (.82 + .3 * hh) * (.62 + .5 * (q.y * .5 + .5)) * (1. - .3 * rr * rr); alb = mix(alb, vec3f(.80, .82, .62), ss(.09, .03, fl) * .6);
    alb = mix(alb, vec3f(.62, .72, .45), step(.9, hh) * .6);
  } else if (ft < 2.5) {       // a tulip, seen from the side: a cup, widest below the middle, three points at the lip
    let y = yv; if (abs(q.x) > .78 * pow(sin(3.14159 * clamp(y * .8 + .12, 0., 1.)), .55) || y > .80 + .19 * abs(cos(q.x * 4.7))) { return vec4f(0.); }
    alb = col * (.62 + .5 * y) * (1. - .28 * ss(.07, .0, abs(abs(q.x) - .27)));
  } else if (ft < 3.5) {       // a lily. Half of them are seen face on - six long pointed petals, three broad and three narrower between,
    // each with a groove down it, bent back at the tip; a green-yellow throat; freckles toward it; six stamens with rust-brown anthers. The
    // other half are seen from the side: a trumpet - a narrow tube at the stalk, flaring, the petal tips curling out and back.
    if (sd < .55) { let k3 = cos(an * 3. + sd * 9.); let len = mix(.74, .96, step(0., k3)); let wd = pow(abs(k3), mix(1.1, .7, step(0., k3)));
      if (rr > .16 + (len - .16) * wd) { return vec4f(0.); }
      alb = col * (.80 + .28 * rr) * (1. - .16 * ss(.2, .0, 1. - abs(k3)) * step(.25, rr)); alb = mix(alb, vec3f(.50, .62, .18), ss(.3, .08, rr));
      alb = mix(alb, col * vec3f(.45, .2, .12), step(.72, h2(floor(q * 26.))) * ss(.5, .25, rr) * step(.16, rr) * .8);
      let sa = fract(an / 1.0472 + .5 + sd) - .5; alb = mix(alb, vec3f(.42, .16, .04), step(abs(sa), .11) * ss(.06, .02, abs(rr - .38)) + step(abs(sa), .035) * step(rr, .38) * step(.14, rr) * .5);
    } else { let y = yv; let w = .09 + .62 * pow(y, 2.4) + .2 * ss(.72, 1., y);
      if (abs(q.x) > w || y > .86 + .13 * cos(q.x * 5.5)) { return vec4f(0.); }
      alb = col * (.70 + .4 * y) * (1. - .22 * ss(.05, .0, abs(abs(q.x) - w * .45))); alb = mix(alb, vec3f(.36, .50, .16), ss(.3, .05, y));
      alb = mix(alb, vec3f(.42, .16, .04), step(.9, y) * step(abs(abs(q.x) - .13), .035) * .9); }
  } else if (ft < 4.5) {       // a marigold: a full round head of crowded ruffled petals, no eye to be seen - ring within ring, each a little
    // darker at its frilled edge, the outline scalloped
    if (rr > .86 + .1 * cos(an * 13. + sd * 9.)) { return vec4f(0.); }
    let ring = fract(rr * 6.5 + .3 * sin(an * 9. + sd * 20.)); alb = col * (.72 + .38 * (1. - rr)) * (.82 + .22 * ss(.1, .7, ring)) * (.9 + .18 * h2(floor(vec2f(an * 4., rr * 9.) + sd * 13.)));
  } else {                     // (elsewhere) eight petals round a dark eye
    if (rr > .52 + .44 * abs(cos(an * 4.))) { return vec4f(0.); }
    alb = mix(col * (.75 + .4 * rr) * (.9 + .1 * cos(an * 8.)), col * vec3f(.35, .22, .08), ss(.26, .18, rr)); }
  return vec4f(alb, 1.);
}
@fragment fn fsLeaf(i: LO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var n = normalize(i.n); if (!ff) { n = -n; }
  let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  var alb = i.col * mix(.50, 1.18, i.uv.y) * (.74 + .26 * ss(0., .3, abs(i.uv.x)));
  var trv = i.pr.y; var fl = 0.;      // (fl: 1 for a flower head)
  if (i.pr.y > 89.) {          // a chain of golden shower flowers (ราชพฤกษ์), hanging from its stalk: open flowers crowded along it, five round
    // yellow petals each, smaller toward the tip, which ends in a few green-yellow buds
    let sd = (i.pr.y - 91.) / 4.; trv = .5; let v = i.uv.y; let ax = i.uv.x;
    let q = vec2f(ax * 1.6, v * 11.); let cl = floor(q.y); let hh = h2(vec2f(cl, sd * 31.)); let cx = (hh - .5) * .9; let dd = vec2f(q.x - cx, fract(q.y) - .5); let rr = length(dd);
    let rad = mix(.72, .34, v) * (.85 + .3 * hh); let an = atan2(dd.y, dd.x) + hh * 6.;
    if (rr > rad * (.78 + .22 * abs(cos(an * 2.5))) && length(vec2f(ax * 1.6, 0.)) > .09) { discard; }
    alb = mix(i.col * (.82 + .3 * hh), vec3f(.55, .62, .16), ss(.78, .97, v)); alb = mix(alb * .7, alb, ss(.05, .3, rr / max(rad, .01)));
  } else
  if (i.pr.y > 79.) {          // A broad leaf on its stalk, as a sunflower's or a hydrangea's: heart-shaped - broadest a third of the way out, drawn
    // to a point, a notch where the stalk joins - with a saw-toothed edge, a pale midrib, side veins running out from it toward the edge, the
    // blade a little quilted between them; matt, darker toward the edge.
    let sd = (i.pr.y - 80.6) / 4.; trv = .28; let y = i.uv.y; let ax = abs(i.uv.x);
    let w = pow(max(sin(3.14159 * pow(clamp((y - .1) / .9, 0., 1.), .55)), 0.), .85) * (1. - .22 * y) * (1. - .07 * abs(sin(y * 46. + sd * 20.)));
    if (y < .1) { if (ax > .05) { discard; } alb = vec3f(.16, .24, .07); }      // the stalk
    else { if (ax > w) { discard; }
      let vq = fract(y * 6.5 - ax * 1.9 + sd * 3.) - .5; let vein = ss(.09, .02, abs(vq)) * ss(.02, .12, ax);
      alb = i.col * (.86 + .22 * (.5 - abs(vq))) * mix(1.08, .8, ax / max(w, .05)) * mix(.92, 1.06, y);
      alb = mix(alb, vec3f(.12, .21, .06), max(vein * .3, ss(.05, .015, ax) * .7)); }
  } else
  if (i.pr.y > 69.) {          // A sprig of a rubber tree: its leaves are of three leaflets - long pointed ovals spread from the end of a thin stalk -
    // and two such leaves are cut from the card, one above the other. Glossy mid green with a pale midrib; in the dry season the tree 'winters':
    // the leaves yellow and redden before they fall.
    let sd = (i.pr.y - 71.) / 4.; trv = .55; let P = vec2f(i.uv.x * .42, i.uv.y); var hit = 0.; var rib = 0.; var tone = 1.;
    for (var k = 0; k < 2; k++) { let y0 = .08 + .4 * f32(k); let len = .44 - .06 * f32(k); let sway = (fract(sd * 7.3 + f32(k) * .37) - .5) * .5;
      for (var j = -1; j <= 1; j++) { let a = f32(j) * (.72 + .2 * fract(sd * 3.1)) + sway; let d = vec2f(sin(a), cos(a)); let r = P - vec2f(0., y0) - d * .05;
        let al = dot(r, d) / len; if (al < 0. || al > 1.) { continue; } let ac = abs(r.x * d.y - r.y * d.x); let hw = len * .2 * pow(sin(3.14159 * pow(al, .8)), .75);
        if (ac < hw) { hit = 1.; rib = max(rib, ss(.012, .004, ac)); tone = .86 + .22 * f32(j + 1) * .5 + .12 * f32(k) - .25 * ac / max(hw, .01); } } }
    if (abs(P.x) < .008 && P.y < .5) { hit = 1.; tone = .7; }
    if (hit < .5) { discard; }
    alb = i.col * vec3f(.95, 1.15, .75) * tone; alb = mix(alb, vec3f(.30, .36, .12), rib * .7);
    alb = mix(alb, mix(vec3f(.42, .30, .05), vec3f(.40, .14, .04), fract(sd * 5.7)), g.fog.w * .55 * step(.35, fract(sd * 9.1)));
  } else
  if (i.pr.y > 49.) {          // A hill of rice, cut from an upright card: a sheaf of long narrow leaves fanning up and out from one foot, green
    // below and paler toward the tips; and when ripe, above them the ears - each a stalk that arches over and hangs outward under its own
    // weight, beaded with grain, gold. (One card shows a dozen leaves and ears: the plain could not be filled leaf by leaf.)
    let ripe = step(59., i.pr.y); let sd = (i.pr.y - 51. - 10. * ripe) / 4.; trv = .6; let x = i.uv.x; let v = i.uv.y;
    var hit = 0.; var colr = vec3f(0.);
    // Only near to (within 22 m) is the sheaf drawn leaf by leaf. Further off a hill is a ragged-topped tuft, green below and - ripe - gold
    // above: from there no more can be told, and the leaf-by-leaf work, done for every pixel of every card of a whole field, is what costs.
    if (distance(g.cam.xyz, i.wp) > 22.) {
      let top = .78 + .16 * sin(x * 9. + sd * 40.) * sin(x * 23. + sd * 17.); if (v > top || abs(x) > .5 + .45 * v) { discard; }
      let gcol = mix(vec3f(.05, .13, .02), vec3f(.13, .23, .04), v); let rcol = mix(vec3f(.28, .25, .06), vec3f(.50, .36, .08), ss(.45, .8, v)) * (.85 + .3 * fract(sd * 7.3));
      hit = 1.; colr = mix(gcol, rcol, ripe * ss(.2, .55, v));
    } else {
    for (var k = 0; k < 8; k++) { let fk = f32(k); let h = fract(sin(fk * 12.9898 + sd * 78.233) * 43758.5453); let h1 = fract(h * 57.31);
      let len = mix(.55, .8, h1) * mix(1., .86, ripe); if (v > len) { continue; } let t = v / len;
      let cx = (h - .5) * .16 + ((fk + .5) / 8. - .5) * (1.25 + .5 * h1) * pow(t, 1.5) * .8;
      if (abs(x - cx) < .058 * (1. - t * .85) + .012) { hit = 1.; let g0 = mix(vec3f(.045, .12, .02), vec3f(.13, .24, .04), t); colr = mix(g0, vec3f(.26, .25, .06), ripe * (.25 + .6 * t) * (.6 + .6 * h)) * (.8 + .4 * h1); } }
    if (ripe > .5) { for (var k = 0; k < 5; k++) { let fk = f32(k); let h = fract(sin(fk * 39.346 + sd * 11.135) * 43758.5453); let h1 = fract(h * 91.7);
      let dir = select(-1., 1., h > .5); let xs = (h1 - .5) * .5; let ys = .60 + .2 * h1; let t = (x - xs) * dir / (.42 + .2 * h); if (t < 0. || t > 1.) { continue; }
      let yl = ys + .30 * sin(t * 2.2) - .46 * t * t; let th = .014 + .034 * ss(.12, .45, t) * (1. - .5 * ss(.8, 1., t)) * (.75 + .25 * sin(t * 46. + h * 9.));
      if (abs(v - yl) < th) { hit = 1.; colr = mix(vec3f(.30, .27, .07), vec3f(.52, .36, .08), ss(.1, .3, t)) * (.8 + .35 * h1) * (.88 + .12 * sin(t * 46. + h * 9.)); } } }
    }
    if (hit < .5) { discard; }
    alb = colr * mix(.55, 1.1, v);
  } else
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
  if (i.pr.y > 19.) {          // a flower head, cut from a card that faces the eye: which flower is in pr.y (see leafV)
    // (A flower is a card turned to face the eye, so it is lit as if face on to whatever lights it: given a leaf's glow through it from behind,
    // the pale and bright kinds - white lilies, yellow marigolds and sunflowers - shone as if lit from within, looking toward the sun or not.
    // So less of the light comes through a petal, and none is brighter than real ones are, 85% at most.)
    trv = .4; let fv = (i.pr.y - 20.) / 2.; let h4 = fhead(floor(fv), vec2f(i.uv.x, i.uv.y * 2. - 1.), i.uv.y, clamp((fract(fv) - .05) / .8, 0., 1.), i.col); if (h4.w < .5) { discard; }
    alb = h4.rgb * min(1., .85 / max(max(h4.r, max(h4.g, h4.b)), 1e-3)); fl = 1.;
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
  let E = g.sunCol.rgb * shadowF(i.wp + L * .2);
  // light through the leaf from behind: warm and bright, the look of living foliage
  let through = (max(-ndl, 0.) * .8 + .1) * trv;
  var c = alb * E * (max(ndl, 0.) + through * vec3f(1.35, 1.3, .65));
  c += alb * (sky(n) + sky(-n) * .45) * ao;
  c += (E + sky(n) * .6) * pow(max(dot(n, normalize(V + L)), 0.), 28.) * (.10 + .55 * g.amb.w) * max(ndl, .15 * g.amb.w);      // wet leaves glisten
  c += E * alb * pow(max(dot(-V, L), 0.), 5.) * .5 * ao * (1. - .8 * fl);
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
    // a rubber tree's bark (every tree back from the road in a rubber plantation is one): smooth, pale grey-brown, blotched with paler lichen and
    // a little green - not the dark furrowed bark of the other trees
    let rb = rub(i.wp.z); if (rb > .5 && abs(rdist(i.wp.xz)) > 10.5) { let bl = vn(i.wp.xy * 2.3 + i.wp.z * 1.7);
      alb = mix(vec3f(.21, .185, .15), vec3f(.36, .34, .29), ss(.35, .7, bl)) * (.85 + .25 * fur) * (.9 + .2 * vn(vec2f(i.uv.x * 5., i.uv.y * 14.)));
      alb = mix(alb, vec3f(.24, .29, .19), ss(.66, .85, vn(i.wp.xy * 1.1 + 7. + i.wp.z)) * .45) * (1. - .3 * g.amb.w); nb = normalize(mix(nb, n, .6)); }
    // an oil palm's trunk (every plant back from the road in an oil palm plantation is one): not bark but the weathered butts of its old fronds,
    // lozenges in rows that step round the trunk - grey-brown and fibrous, pale on their upper faces, black in the gaps between, moss in patches
    if (oilp(i.wp.z) > .5 && abs(rdist(i.wp.xz)) > 10.5) { let row = floor(i.uv.y / .2); let qx = i.uv.x * 9. + row * .5; let cx = fract(qx) - .5; let cy = fract(i.uv.y / .2) - .5;
      let hh = h2(vec2f(floor(qx), row)); let dm = abs(cx) * 1.25 + abs(cy);
      alb = mix(vec3f(.19, .15, .11), vec3f(.34, .29, .22), hh) * (.75 + .35 * fur) * (.8 + .5 * (cy + .5));
      alb = mix(alb, vec3f(.030, .024, .018), ss(.5, .72, dm));
      alb = mix(alb, vec3f(.10, .15, .055), ss(.6, .82, vn(i.wp.xy * 1.4 + i.wp.z * 1.1)) * .5 * (1. - ss(.5, .72, dm))) * (1. - .3 * g.amb.w);
      nb = normalize(n + vec3f(0., -cy * 1.1, 0.) + normalize(cross(vec3f(0., 1., 0.), n) + vec3f(1e-4, 0., 0.)) * cx * .9); }
  }
  if (i.m > .5) { alb = vec3f(.40, .39, .37) * (.8 + .3 * vn(i.wp.xy * 9.)); }
  if (i.m > 1.5) { alb = vec3f(.012); }
  if (i.m > 2.5) { alb = mix(vec3f(.16, .22, .07), vec3f(.24, .22, .10), fur); }
  if (i.m > 2.5 && i.m < 3.5) { alb = mix(alb, vec3f(.22, .15, .08), ss(.55, .8, vn(vec2f(i.uv.x * 9., i.uv.y * 2.))) * .6); }   // dry brown sheaths on banana stems
  if (i.m > 3.5) { alb = mix(vec3f(.16, .11, .07), vec3f(.30, .24, .18), fur); }      // fence wood, weathered
  if (i.m > 4.5) { alb = vec3f(.46, .47, .48) * (.85 + .2 * fur); }
  if (i.m > 5.5) { alb = mix(vec3f(.22, .04, .10), vec3f(.32, .08, .14), fur); }                    // banana flower bud
  if (i.m > 6.5) { alb = vec3f(.80, .79, .75) * (.88 + .14 * fur); }                                // whitewash (a chedi)
  if (i.m > 7.5) { alb = vec3f(.86, .56, .09); }                                                    // gilding
  if (i.m > 8.5) { alb = mix(vec3f(.16, .26, .04), vec3f(.30, .36, .07), ss(.3, .7, vn(i.wp.xz * 9. + i.wp.y * 5.))) * (.85 + .2 * fur); }      // green bananas on the bunch
  if (i.m > 9.5) { let st = vn(vec2f(i.uv.x * 44., i.uv.y * 1.3)); alb = mix(vec3f(.30, .22, .11), vec3f(.52, .42, .23), st) * (.85 + .3 * fur); alb = mix(alb, vec3f(.15, .10, .06), ss(.62, .88, vn(vec2f(i.uv.x * 7., i.uv.y * 2.2))) * .6); }      // foot of a banana stem: dry brown sheaths, stringy, with dark patches
  if (i.m > 10.5) { let st = vn(vec2f(i.uv.x * 30., i.uv.y * 1.1)); alb = mix(vec3f(.30, .38, .11), vec3f(.46, .47, .20), st); alb = mix(alb, vec3f(.30, .21, .10), ss(.5, .8, vn(vec2f(i.uv.x * 6., i.uv.y * 1.4))) * .6); }      // top of the stem: yellow-green sheaths, streaked brown      // banana stem: pale green, with brown dried sheaths
  if (i.m > 11.5) { let age = fract(i.m); let young = mix(vec3f(.07, .17, .025), vec3f(.13, .24, .04), fur); let old = mix(vec3f(.42, .30, .05), vec3f(.52, .26, .04), fur);      // a coconut: green, ripening through yellow to orange
    alb = mix(young, old, ss(.45, .8, age)) * (.85 + .25 * vn(i.wp.xy * 23.)); alb = mix(alb, vec3f(.20, .14, .07), ss(.6, .85, vn(i.wp.xz * 31. + i.wp.y * 17.)) * .35); }      // scuffed brown here and there
  // a bunch of oil palm fruit: close-packed, purple-black where the fruits are shaded and unripe, orange-red where they have ripened, bristling
  if (i.m > 13.5) { let rp = ss(.42, .7, vn(i.wp.xz * 6. + i.wp.y * 4.)); alb = mix(vec3f(.035, .018, .030), vec3f(.36, .11, .025), rp) * (.6 + .8 * vn(i.wp.xy * 37. + i.wp.z * 29.)); }
  if (i.m > 14.5) { alb = vec3f(.52, .035, .03); }      // paintwork (a motorcycle's body): red
  if (i.m > 15.5) { alb = vec3f(.03, .09, .36); }       // blue
  if (i.m > 16.5) { alb = vec3f(.62, .62, .60); }       // white
  // The parked scooter (assets/scooter.bin; see chunks.js): 18 tyre rubber, 19 dark metal (rims, brakes, mirrors' backs), 20 bright metal,
  // 21 clear lamp glass, 22 red lamps, 23 amber, 24 white (the plate, the dials), 25 the orange spring of the shock absorber, 26 the seat, 27 window glass;
  // its paint is 41 on in the colour of the palette (red, sky blue, black, white, dark blue, silver, green, yellow), and 51 on the same darker.
  var shine = 0.;
  if (i.m > 17.5) { alb = vec3f(.022, .022, .024); shine = .12; }
  if (i.m > 18.5) { alb = vec3f(.06, .062, .066); shine = .5; }
  if (i.m > 19.5) { alb = vec3f(.55, .56, .58); shine = 1.; }
  if (i.m > 20.5) { alb = vec3f(.62, .64, .66); shine = 1.2; }
  if (i.m > 21.5) { alb = vec3f(.50, .025, .02); shine = 1.; }
  if (i.m > 22.5) { alb = vec3f(.80, .36, .03); shine = 1.; }
  if (i.m > 23.5) { alb = vec3f(.74, .74, .72); shine = .2; }
  if (i.m > 24.5) { alb = vec3f(.62, .20, .03); shine = .5; }
  if (i.m > 25.5) { alb = vec3f(.03, .028, .026); shine = .15; }
  if (i.m > 26.5) { alb = vec3f(.025, .03, .035); shine = 1.1; }      // 27: window glass, dark
  if (i.m > 40.5) { let k = i32(i.m - 40.5) % 10; var pc = array<vec3f, 8>(vec3f(.50, .02, .02), vec3f(.09, .34, .66), vec3f(.012, .012, .014), vec3f(.70, .70, .68), vec3f(.025, .06, .26), vec3f(.36, .37, .38), vec3f(.04, .22, .09), vec3f(.75, .52, .03));
    alb = pc[min(k, 7)]; if (i.m > 50.5) { alb *= .45; } shine = .8; }
  // a model coloured vertex by vertex (assets/pickup.bin): the material is 100 + the colour in five bits each, + 32768 x (1 + the paint's place
  // in the palette) where it is body paint - there the paint's colour, shaded by how light the model's own grey was
  if (i.m > 99.5) { let q = u32(i.m - 101. + .5); var cc = vec3f(f32(q & 31u), f32((q >> 5u) & 31u), f32((q >> 10u) & 31u)) / 31.; cc = cc * cc; alb = cc; shine = .25 * ss(.02, .25, dot(cc, vec3f(.333)));      // (rubber and black trim hardly shine: at a grazing angle a tyre gave back the sky, pale blue)
    let pk = q >> 15u; if (pk > 0u) { var pc2 = array<vec3f, 8>(vec3f(.50, .02, .02), vec3f(.09, .34, .66), vec3f(.012, .012, .014), vec3f(.70, .70, .68), vec3f(.025, .06, .26), vec3f(.36, .37, .38), vec3f(.04, .22, .09), vec3f(.75, .52, .03));
      alb = pc2[min(pk - 1u, 7u)] * clamp(dot(cc, vec3f(.333)) / .55, .55, 1.15); shine = .8; } }
  let E = g.sunCol.rgb * shadowF(i.wp + n * .08);
  var c = alb * (E * max(dot(nb, L), 0.) + sky(nb) * .8) + alb * head(i.wp, nb);
  // gilding is metal: it shines where the sun strikes it and gives back the sky in its own colour, and is a deeper gold in its hollows; whitewash
  // has a soft sheen. (Without this a gilded image was matt mustard.)
  if (i.m > 7.5 && i.m < 8.5) { let V = normalize(g.cam.xyz - i.wp); let R = reflect(-V, n); let fr = .25 + .75 * pow(1. - max(dot(V, n), 0.), 3.);
    let warm = vec3f(1., .72, .22); let env = mix(horizon(R), g.zen.rgb, pow(ss(0., .8, max(R.y, 0.)), .55)) * mix(.55, 1., ss(-.3, .2, R.y));
    c = alb * (E * max(dot(n, L), 0.) * .75 + sky(n) * .55) * (.93 + .14 * vn(i.wp.xy * 3. + i.wp.z * 2.)) + warm * env * fr * .34 + warm * E * (pow(max(dot(R, L), 0.), 40.) * 1.6 + pow(max(dot(R, L), 0.), 6.) * .18); }
  else if (i.m > 6.5 && i.m < 7.5) { let V = normalize(g.cam.xyz - i.wp); c += E * pow(max(dot(reflect(-V, n), L), 0.), 16.) * .12; }
  // (a scooter's paint, metal and glass: a sharp highlight and the sky given back at a grazing angle)
  if (shine > 0.) { let V = normalize(g.cam.xyz - i.wp); let R = reflect(-V, n); let fr = .04 + .96 * pow(1. - max(dot(V, n), 0.), 5.);
    c += E * pow(max(dot(R, L), 0.), 60.) * shine * 1.2 + mix(horizon(R), g.zen.rgb, ss(0., .7, max(R.y, 0.))) * fr * shine * .5; }
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
  let mat = i32(i.m.x + .5); let sd = i.m.y; var alb = vec3f(.5); var gloss = 0.; var emi = vec3f(0.); let night = g.misc.w * (1. - g.camM.w);      /* (camM.w: a place without power - no lamp or window is lit) */ let dcb = distance(g.cam.xyz, i.wp); let fN = 1. - ss(12., 30., dcb);      // fN: 1 near, 0 where a wall's fine grain is smaller than a pixel (there it is left out)
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
  else if (mat == 52) { alb = vec3f(.034, .035, .038) * (.72 + .5 * vn(i.wp.xz * 9.)) * (.85 + .3 * vn(i.wp.xz * .55)); gloss = .22; }      // asphalt, as the road's is (terrain.wgsl), for a made way laid on the ground
  else if (mat == 50) {      // a plain painted thing of a given colour, which the seed holds: five bits each of red, green and blue (seed = (r + 32 g + 1024 b) / 32768)
    let q = u32(sd * 32768. + .5); alb = vec3f(f32(q & 31u), f32((q >> 5u) & 31u), f32((q >> 10u) & 31u)) / 31.; alb = alb * alb * (.85 + .2 * vn(uv * 3.)); gloss = .3;
  }
  else if (mat == 51) {      // a wide bridge's deck, four lanes along its length (local z): old asphalt between concrete kerbs with what is left of its lines; bare stained concrete on its sides and underneath
    let n4 = vn(i.wp.xz * 14.); alb = vec3f(.36, .35, .33) * (.75 + .3 * n4) * (.85 + .2 * vn(uv * 1.3));
    alb = mix(alb, alb * vec3f(.5, .5, .44), ss(.4, .8, vn(vec2f(uv.x * .8, uv.y * 3.))) * .6);
    if (i.ln.y > .5) { let a = abs(i.lp.x); var road = vec3f(.050, .050, .052) * (.72 + .5 * n4) * (.80 + .4 * vn(i.wp.xz * .55)); let wear = ss(.30, .56, vn(i.wp.xz * .11 + 5.));
      road = mix(road, vec3f(.44, .32, .05), ss(.08, .04, abs(a - .17)) * wear);
      road = mix(road, vec3f(.40, .40, .37), max(ss(.08, .04, abs(a - 3.5)) * step(.62, fract(i.wp.z / 9.)), ss(.08, .04, abs(a - 6.65))) * wear);
      alb = mix(alb, road, 1. - ss(7., 7.15, a)); gloss = .16; }
  }
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
  else if (mat == 48) {      // the concrete of an old tunnel: grey gone brown, dark where water has run down it for years, green with algae where it stays
    var q = vec2f(i.wp.x + i.wp.z, i.wp.y);        // damp, sooty higher up, with the lines of the boards it was cast against and the joints between pours
    let flat_ = step(.6, abs(n.y)); if (flat_ > .5) { q = i.wp.xz * vec2f(1., .35); }      // (a level face - the walkway's top - is marked in plan, or its marks would follow the height and read as steps)
    var cc = vec3f(.30, .28, .24) * (.65 + .55 * vn(q * .8)) * (.85 + .3 * vn(q * 7.));
    let run = ss(.42, .78, vn(vec2f(q.x * 1.6, q.y * .11 + 3.)));
    cc = mix(cc, vec3f(.075, .068, .058), run * .7);
    cc = mix(cc, vec3f(.10, .14, .055), ss(.5, .8, vn(q * .55 + 9.)) * ss(.25, .7, run) * .7);
    cc = mix(cc, vec3f(.035), ss(.45, .9, vn(q * .3 + 20.)) * .4);
    cc *= mix((.9 + .1 * step(.06, fract(q.y / .45))) * (.9 + .1 * ss(0., .01, abs(fract(q.x / 6.) - .5))), 1., flat_);
    alb = cc; gloss = .08 + .25 * run;
  }
  else if (mat == 53) {      // a switchback's gutter (chunks.js): precast concrete, weathered grey on top; inside dark and damp, stained by the water, silt and leaves on its floor
    // (seed: which piece - 0 the floor, 1 the face down from the road, 2 the outer lip, 3 an end - times 2, plus 1 on the road's +x side; m.w: 20 + the piece's length)
    let kind = floor(sd * .5 + .01); let sg = (sd - kind * 2.) * 2. - 1.; let q = i.wp.xz + vec2f(i.wp.y * .7, 0.);
    var cc = vec3f(.40, .39, .36) * (.78 + .32 * vn(q * 2.3 + 4.)) * (.9 + .2 * vn(q * 19.));
    cc = mix(cc, vec3f(.22, .20, .17), ss(.5, .85, vn(q * .7 + 11.)) * .5);
    var inner = 0.; var dep = 0.;
    if (kind < .5) { inner = step(.5, i.ln.y); dep = .2; }
    else if (kind < 1.5) { inner = step(.5, -i.ln.x * sg); dep = i.m.z * .5 - i.lp.y; }
    else if (kind < 2.5) { inner = step(.5, i.ln.x * sg); dep = i.m.z * .5 - i.lp.y - .04; }
    if (inner > .5) {
      // inside: darker the deeper, a tide line of grime where the water runs, green slime low down
      var ic = vec3f(.17, .16, .14) * (.75 + .4 * vn(q * 6. + 2.)) * mix(1., .5, ss(.0, .2, dep));
      ic = mix(ic, vec3f(.07, .065, .05), ss(.11, .15, dep) * .7);
      ic = mix(ic, vec3f(.06, .09, .035), ss(.12, .2, dep) * ss(.4, .7, vn(q * 1.3 + 7.)) * .8);
      if (kind < .5) {
        // the floor: silt and grit in the middle, fallen leaves caught in drifts, darkest along the foot of each wall
        let a = abs(i.lp.x);
        ic = mix(ic, vec3f(.13, .10, .07) * (.8 + .4 * vn(q * 9.)), ss(.35, .7, vn(q * 1.7 + 3.)) * .7);
        let lv = ss(.62, .8, vn(q * 5.5 + 13.)) * ss(.3, .6, vn(q * .6 + 21.));
        ic = mix(ic, mix(vec3f(.16, .08, .03), vec3f(.22, .15, .05), vn(q * 23.)), lv * .85);
        ic *= mix(.45, 1., ss(.31, .2, a));
        gloss = .06 + .5 * g.amb.w; ic *= 1. - .35 * g.amb.w;
      }
      cc = ic;
    } else if (kind > .5 && kind < 2.5 && i.ln.y > .5) {
      // the top of a wall: a worn edge, darker where tyres have run over it
      cc *= .85 + .15 * vn(q * 8.); cc = mix(cc, vec3f(.10, .10, .10), ss(.5, .8, vn(vec2f(q.x * .3, q.y * 3.) + 5.)) * .35);
    }
    // the joints between the 2 m lengths, dark lines across
    cc *= mix(.35, 1., ss(.0, .025, (i.m.w - 20.) * .5 - abs(i.lp.z)));
    alb = cc;
  }
  else if (mat == 47) {      // a concrete slab carrying a road along its length (local x): asphalt down the middle with a broken yellow centre line and white edge lines; bare concrete beside it and on its sides
    let n4 = vn(i.wp.xz * 14.); alb = vec3f(.40, .39, .37) * (.8 + .3 * n4) * (.9 + .15 * vn(uv * 1.3));
    if (i.ln.y > .5) {
      // (The cross street meets a frontage road on each side of the cutting, ten metres apart: the whole of it up here is one crossroads, so no
      // line of the cross street's is painted on it - an edge line or a centre line here was a solid line drawn across the junction. Nor is there a stop line across
      // the frontage roads: tried, a white bar across a lane read as the lane being closed.)
      let az = abs(i.lp.z); let ax = abs(i.lp.x); var road = vec3f(.034, .035, .038) * (.72 + .5 * n4) * (.85 + .3 * vn(i.wp.xz * .55));
      road = mix(road, vec3f(.52, .52, .48), ss(.08, .04, abs(ax - 5.5)) * step(3.6, az));      // the frontage roads crossing it, their inner edge lines stopping at the cross street
      alb = mix(alb, road, max(1. - ss(3.5, 3.6, az), step(5.2, ax) * (1. - ss(9.1, 9.2, ax)))); gloss = .22;
    }
  }
  else if (mat == 49) {      // a frontage road beside an underpass: asphalt from the parapet out to the kerb, a white edge line along each side
    let n4 = vn(i.wp.xz * 14.); alb = vec3f(.40, .39, .37) * (.8 + .3 * n4);
    // (where the road bends, each length is made a little long to close the wedge to the next, and its outer corner then stood out past the kerb onto
    // the footpath, a dark nick between the kerb stones: nothing of it is drawn more than 9.2 m out from the road, measured square to it)
    { let sl = roadX(i.wp.z + .5) - roadX(i.wp.z - .5); if (abs(i.wp.x - roadX(i.wp.z)) * inverseSqrt(1. + sl * sl) > 9.2) { discard; } }
    if (i.ln.y > .5) {
      let pd = 7.175 + i.lp.x * sd; var road = vec3f(.034, .035, .038) * (.72 + .5 * n4) * (.85 + .3 * vn(i.wp.xz * .55));      // pd: metres out from the road's middle, square to it (the box is 3.95 wide about 7.175 - from 5.2 to the kerb at 9.15; its seed is its side)
      // (where a lane or the cross street over the underpass joins it, the asphalt runs on across the footpath's strip to meet that street's own, and the outer edge line stops)
      let so = soi(i.wp.xz); let lw = 1.85 + 1.65 * tlb(so.z); let xm = 1. - ss(lw, lw + .2, abs(so.x));
      road = mix(road, vec3f(.52, .52, .48), max(ss(.08, .04, abs(pd - 5.5)), ss(.08, .04, abs(pd - 8.6)) * (1. - xm)));
      let tq = fract(i.wp.xz / .4); let joint = ss(0., .06, min(min(tq.x, 1. - tq.x), min(tq.y, 1. - tq.y)));
      let tile = mix(vec3f(.34, .33, .32), vec3f(.40, .27, .22), step(.5, fract((floor(i.wp.x / .4) + floor(i.wp.z / .4)) * .5)) * .55) * (.8 + .25 * n4) * (.68 + .32 * joint);
      // (beyond the kerb line the slab is not drawn: the ground under it is the footpath there, with its kerb and the kerb turned in at every lane's
      // mouth - painted over by this slab's own paving, the corner where the cross street meets it was a pale square with no kerb)
      alb = road; gloss = .22;
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
    var q = i.lp.yz; var face = abs(i.ln.x); if ((sd > .5 && sd < 1.5) || sd > 3.5) { q = i.lp.xy; face = abs(i.ln.z); }
    let r = length(q) / (i.m.z * .5); if (face < .5 || r > 1.) { discard; }
    if (sd > 1.5) {
      // A wire wheel (seed 2: a motorcycle's, 3: a bicycle's, thin along x; 4 and 5: the same, thin along z): a tyre, a bright rim, spokes with daylight between them (from
      // near to; further off the gaps are only dark), and the hub - a motorcycle's with its brake disc.
      let bic = step(2.5, sd) * step(sd, 3.5) + step(4.5, sd); let tyre = mix(.76, .9, bic); let rim = tyre - mix(.08, .05, bic); let hub = mix(.16, .08, bic); let ns = mix(18., 28., bic);
      let sp = abs(fract(atan2(q.y, q.x) * ns / 6.2832) - .5) * 6.2832 / ns * r;
      if (r > hub && r < rim && sp > mix(.014, .007, bic) + dcb * .0035) { if (dcb < 28.) { discard; } alb = vec3f(.05); }
      else if (r > tyre) { alb = vec3f(.022) * (.8 + .4 * step(.5, fract(atan2(q.y, q.x) * 14.))); }
      else if (r > rim) { alb = vec3f(.55, .56, .58); gloss = .8; }
      else if (r > hub) { alb = vec3f(.50, .51, .53); gloss = .6; }
      else { alb = vec3f(.28, .28, .30); gloss = .4; }
      if (bic < .5 && r < .36 && r > hub && sp > .03) { alb = vec3f(.42, .43, .45) * (.8 + .2 * step(.5, fract(atan2(q.y, q.x) * 3.82))); gloss = .7; }
    } else { alb = mix(vec3f(.025), vec3f(.30, .31, .32), step(r, .5) * step(.12, r)); gloss = .2 * step(r, .5); }
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
    // (a seed of 3 or more names the road word itself: 3 + its number among the sixteen, and the fraction is the seed for the board's colour)
    let named = sd >= 3.; let sd0 = sd; let sd = select(sd0, fract(sd0), named);
    let hgt = abs(i.m.z); var bg = pal2(sd); var fg = vec3f(.95, .93, .86); let brand = sd > 1.5;      // (seed 2: the convenience store's board, see below)
    if (dot(bg, vec3f(.3, .6, .1)) > .45) { fg = mix(vec3f(.60, .04, .04), vec3f(.05, .13, .45), step(.5, h2(vec2f(sd * 13., 2.)))); }      // on yellow or white: red or blue letters
    if (i.m.z < 0. && dot(bg, vec3f(.3, .6, .1)) > .45) { fg = vec3f(.04); }
    // which words: a shop name (0-47) or, on a road board, one of the road words (48-63); written across, or downward on a tall board
    var wd = hgt * 4.; if (i.m.w > 10.05) { wd = i.m.w - 10.; }
    var idx = floor(h2(vec2f(sd * 91., 5.)) * 46.99); if (i.m.z < 0.) { idx = 48. + floor(h2(vec2f(sd * 57., 9.)) * 15.99); } if (named) { idx = 48. + floor(sd0 - 3.); }
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
    if (g.camM.w > .5) {      // a dead city: some panes whole and dusty, most broken to black holes, a few boarded up; soot on the wall above windows a fire came out of
      let wc = floor(hx / cw + .5) + sd * 31.; let bh = h2(vec2f(wc, fl + sd * 17.) + 3.7);
      var pane = mix(vec3f(.012), vec3f(.085, .095, .10) * (.7 + .5 * fy), step(.5, bh)); if (bh > .9) { pane = vec3f(.20, .14, .08) * (.7 + .4 * vn(vec2f(hx * 9., y0 * 1.5))); }
      let jag = step(bh, .5) * step(fy, .34 + .40 * vn(vec2f(hx * 6., fl * 7.))) * step(h2(vec2f(wc, fl) + 9.1), .5);      // jagged glass left standing in the frame
      pane = mix(pane, vec3f(.10, .12, .13), jag * .7);
      alb = mix(wall, pane, win); gloss = win * .5 * step(.5, bh) * step(bh, .9);
      let below = h2(vec2f(wc, fl - 1. + sd * 17.) + 3.7);
      alb *= 1. - .75 * step(below, .09) * (1. - win) * step(.2, fx) * step(fx, .8) * ss(.9, .0, fy) * (1. - step(.5, abs(i.ln.y)));
    }
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
  else if (mat == 10) { alb = vec3f(.6); emi = vec3f(1., .8, .5) * max(night, .55 * step(3.5, i.m.w) * step(i.m.w, 4.5)) * 9.; }      // a lamp: lit at night (shape 4, a tunnel's: by day as well)
  else if (mat == 30) {      // a bridge deck: the road carried across, concrete at its edges and underneath
    // (The lengths overlap a little at their joints, and where the deck crests the end of one stands a hair - a fraction of a millimetre - above
    // the next one's top: that sliver of pale concrete showed as a dashed white line across the road, plainest at night. The top 5 cm of the
    // ends are not drawn; the road of the next length is just beneath.)
    if (abs(i.ln.z) > .5 && i.lp.y > i.m.z * .5 - .05) { discard; }
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
  // Petals on a bridge's deck or a tunnel's floor (mat 30) in a stretch of cherries or golden showers, in their season: no tree stands over these,
  // so fewer than on the road beside - those the wind and the traffic have carried on - and in a tunnel fewer still, the further in. (The ground
  // has its own, thicker, in terrain.wgsl; without these the petals stopped dead at the end of the deck.)
  if (mat == 30 && i.ln.y > .5) { let kn = kun(i.wp.z); let pse = select(g.ssn.x, ss(.55, .85, g.fog.w), kn);
    if ((chy(i.wp.z) > 0 || kn) && pse > .01) {
      // (swept as on the road: where the car has just passed they are blown out to both sides of its line, and lie scattered there a few seconds)
      let tp = g.cam.w; var wk = 0.; var wage = 0.; var wout = vec2f(0.);
      for (var q = 0; q < 7; q++) { let wa = g.wake[q]; let wb = g.wake[q + 1]; if (wa.w * wb.w < .0004 || tp - wb.z > 8.) { continue; }
        let ab = wb.xy - wa.xy; let hh = clamp(dot(i.wp.xz - wa.xy, ab) / max(dot(ab, ab), .0001), 0., 1.); let dv = i.wp.xz - (wa.xy + ab * hh); let dS = length(dv);
        let k = (1. - ss(1.2, 4.2, dS)) * mix(wa.w, wb.w, hh); if (k > wk) { wk = k; wage = tp - mix(wa.z, wb.z, hh); wout = dv / max(dS, .05); } }
      wk *= (1. - .9 * ss(.15, .6, g.amb.w)) * (1. - ss(5., 8., wage));
      let P = (i.wp.xz - wout * (1. - exp(-wage * 2.2)) * 3. * wk) * 10.; let ci = floor(P); let pd = length(fract(P) - .5 - (vec2f(h2(ci + 7.3), h2(ci + 19.1)) - .5) * .55);
      let dens = (.06 + .16 * vn(i.wp.xz * .35 + 3.)) * (1. - .85 * tunk(i.wp.z)) * (1. - ss(.02, .1, tw(i.wp.z)))      // (no trees are planted in a town)
        * (1. - .75 * ss(1.8, .4, abs(rdist(i.wp.xz) - 1.7) - .3 * vn(i.wp.xz * .9)));      // (fewest in the wheel tracks)
      let pt = step(h2(ci), dens * (1. - .55 * wk)) * ss(.26, .18, pd) * (1. - ss(16., 60., distance(g.cam.xyz, i.wp))); let tn = h2(ci + 3.1);
      alb = mix(alb, select(mix(vec3f(.62, .16, .30), vec3f(.84, .46, .58), tn), mix(vec3f(.86, .60, .03), vec3f(.95, .78, .12), tn), kn), pt * .92 * ss(.02, .3, pse)); } }
  var ao = 1.;
  if (i.m.z > .5 && abs(i.ln.y) < .5 && mat != 38) { let hh = i.m.z * .5; ao = mix(.55, 1., ss(0., .45, hh - i.lp.y)) * mix(.72, 1., max(ss(0., .5, i.lp.y + hh), f32(mat == 6))); }      // (a shophouse's upper floors do not start at the ground)
  // A place long abandoned (deadWorld, see render.js): walls stained by years of rain, green creeping up them from the ground, moss on what lies flat, rust on painted steel.
  if (g.camM.w > .5) {
    if (mat == 2 || mat == 6 || mat == 7 || mat == 8 || mat == 18 || mat == 19 || mat == 41 || mat == 16 || mat == 0 || mat == 1 || mat == 9 || mat == 51) {
      let upw = i.lp.y + abs(i.m.z) * .5; let side = 1. - step(.5, abs(i.ln.y)); let q = vec2f(i.wp.x + i.wp.z, i.wp.y);
      alb = mix(alb, alb * vec3f(.50, .47, .40), ss(.35, .8, vn(vec2f(q.x * 1.7, q.y * .13) + sd * 7.)) * .7 * side);
      let cr = ss(1., .0, (upw - (1. + 9. * vn(vec2f(q.x * .11, sd * 13.)) * vn(vec2f(q.x * .9, 3.)))) / 2.5 + (vn(q * 1.9) - .5) * 1.2) * side;      // creeper, to a different height along every wall
      alb = mix(alb, mix(vec3f(.045, .085, .025), vec3f(.085, .12, .035), vn(q * 5.)), cr * .9);
      alb = mix(alb, vec3f(.07, .09, .04) * (.7 + .6 * vn(i.wp.xz * 1.3)), (1. - side) * step(0., i.ln.y) * ss(.4, .7, vn(i.wp.xz * .35 + sd * 5.)) * .7 * f32(mat != 51));
    }
    if (mat == 50 || mat == 33 || mat == 34 || mat == 12 || mat == 32 || mat == 27) { let rs = vn(uv * 3.1 + sd * 50.) * .55 + vn(uv * 11. + sd * 20.) * .45; alb = mix(alb, vec3f(.19, .085, .04) * (.6 + .7 * vn(uv * 9.)), ss(.54, .70, rs) * .85); alb *= .8 + .2 * vn(uv * 1.3 + 4.); gloss *= .4; }
  }
  let ndl = max(dot(n, L), 0.);
  let E = g.sunCol.rgb * shadow(i.wp + n * .1);
  if (i.m.w > 4.5 && i.m.w < 5.5) { alb *= .30; emi += alb * vec3f(1.25, 1.05, .75) * .9; }      // (shape 5) inside a tunnel: dim concrete under the yellow of its lamps, not the light of the sky
  if (i.m.w > 2.5 && i.m.w < 3.5) { emi += alb * (.36 + .7 * night); }      // (shape 3) indoors under the shop's own lights, which are on all the time
  // Snow lying - in the snowfield in the cool season, or everywhere when snow is chosen (camM.z), as on the ground (terrain.wgsl) - on what is
  // built too: the top of every wall, rail, roof and deck under the open sky, and on the roads that are built rather than painted on the
  // ground (bridge decks, the slab over an underpass, the frontage roads) the same cover as the road beside them, worn away in the wheel
  // tracks. (Left bare, every bridge was a dark strip across a white land.) Not in a tunnel, nor indoors.
  { let snw = max(nw(i.wp.z) * g.ssn.x, g.camM.z);
    if (snw > .01 && n.y > .6 && tunk(i.wp.z) < .5 && !(i.m.w > 2.5 && i.m.w < 5.5) && mat != 10) {
      let roadM = mat == 30 || mat == 47 || mat == 49 || mat == 51;
      var cov = snw * ss(.3, .6, vn(i.wp.xz * .45) + select(.45, .15, roadM));
      var sc = vec3f(.70, .73, .80);
      if (roadM) { let rd = abs(rdist(i.wp.xz)); cov *= .85 * (1. - ss(.55, .25, min(abs(rd - .95), abs(rd - 2.55)))); sc = vec3f(.56, .58, .63); }
      alb = mix(alb, sc * (.9 + .1 * vn(i.wp.xz * 7.)), cov); gloss = mix(gloss, .3, cov); emi *= 1. - .8 * cov;
    } }
  var c = alb * (E * ndl + sky(n) * ao) + E * pow(max(dot(n, normalize(V + L)), 0.), 40.) * ndl * gloss + alb * head(i.wp, n) + emi;
  // Rain on the roads that are built rather than painted on the ground - bridge decks, the slab over an underpass, the frontage roads beside
  // it, a tunnel's apron: wet as the road either side of them is (they stayed dry, a dry strip across a shining road). The same darkening,
  // the same mirror in the puddles and the same splashes as the ground's road has (see the terrain); not inside a tunnel.
  { let rw = g.amb.w;
    if (rw > .01 && i.ln.y > .5 && (mat == 30 || mat == 47 || mat == 49) && tunk(i.wp.z) < .5) {
      let P = i.wp.xz; let pud = ss(.42, .68, vn(P * .33) * .7 + vn(P * .55) * .3); let kk = rw * (.3 + .7 * pud);
      let Rr = reflect(-V, normalize(mix(n, vec3f(0., 1., 0.), .85))); let rf = mix(horizon(Rr), g.zen.rgb, pow(ss(0., .8, max(Rr.y, 0.)), .55)) + E * pow(max(dot(Rr, L), 0.), 200.);
      c = mix(c * (1. - .3 * rw), rf, clamp((.04 + .96 * pow(1. - max(V.y, 0.), 5.)) * 1.7, 0., 1.) * kk);
      let dq = P * 5.; let di = floor(dq); let dh = h2(di); let dt = g.cam.w * (2.2 + dh) + dh * 7.; let dp = fract(dt);
      let dOn = step(1. - (.12 + .3 * g.sun.w), h2(di + floor(dt) * 3.7)); let dr = length(fract(dq) - .5 - (vec2f(h2(di + 1.3), h2(di + 2.7)) - .5) * .5);
      let splash = (ss(.03, .0, abs(dr - dp * .22)) * (1. - dp) + ss(.05, .0, dr) * step(dp, .18) * 1.5) * dOn * (1. - ss(20., 45., dcb));
      c += (g.amb.rgb + g.sunCol.rgb * .1) * (splash * .45 * g.sun.w);
    } }
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
  var dn = 0.; if (rd.y > 0.) { dn = fbm(q) * .65 + fbm(q * 3.1 + 5.) * .35; }      // (no cloud shows below the horizon)
  let lo = mix(.64, .26, g.fog.z); let cov = ss(lo, lo + .2, dn) * ss(0., .14, rd.y);
  let lit = mix(g.amb.rgb * 1.1 + g.hor.rgb * .25, g.sunCol.rgb * .42 + g.hor.rgb * .35, ss(lo, lo + .35, dn + sd * .2)) * mix(1., .6, ss(.6, 1., g.fog.z));
  if (g.misc.w > 0.) { let hh = h2(floor(rd.xz / max(rd.y, .05) * 90.));
  c += vec3f(.9, .95, 1.) * step(.9965, hh) * g.misc.w * .6 * ss(.02, .2, rd.y) * (1. - cov); }
  c = mix(c, lit, cov * .9);
  // lightning: a forked stroke down the sky, and the cloud round it lit from within
  let fl = g.zen.w;
  if (fl > .01) {
    var da = atan2(rd.z, rd.x) - g.hor.w; da = da - 6.2832 * round(da / 6.2832);
    let path = (vn(vec2f(rd.y * 14., g.fwd.w * 50.)) - .5) * .16 + (vn(vec2f(rd.y * 55., g.fwd.w * 31.)) - .5) * .035;
    let dd = abs(da - path); let on = ss(.01, .03, rd.y) * ss(.6, .4, rd.y);
    c += vec3f(.75, .8, 1.) * fl * (on * (ss(.004, .0008, dd) * 7. + ss(.07, 0., dd) * .4) + .5 * ss(1.3, 0., abs(da)) * ss(0., .15, rd.y));
  }
  // (in a thick fog the eye is inside it: overhead too there is only its white, a little brighter toward the sun - no blue, no clouds)
  c = mix(c, hz * (1. + .25 * y) + g.sunCol.rgb * pow(sd, 6.) * .08, ss(.013, .034, g.fog.x) * .92);
  // far ranges of hills on the horizon, paler with distance
  let hd = normalize(vec3f(rd.x, 0., rd.z) + vec3f(1e-5, 0., 0.)).xz;
  let toSea = 1. - sw(g.cam.z) * ss(.02, .45, rd.x);
  // (they are many kilometres off: in any haze they are lost in it before the nearest things are. g.fog.x is about 0.002 on a clear noon, 0.004
  // on a clear morning or in light rain, 0.008 and more in a light fog (less in the dry season), 0.03 in a thick one: so they show whole only in
  // clear air, fade through the morning haze and light rain, and are gone in any fog - left as they were, they stood dark through a white fog)
  let hk = 1. - ss(.0026, .0072, g.fog.x);
  if (rd.y < .2) {      // (the highest of them stands .185 above the horizon: the sky over that is not asked)
  let m0 = (.050 + .120 * fbm(hd * 1.5 + 13.) + .015 * fbm(hd * 8. + 2.)) * toSea;
  c = mix(c, mix(hz, g.amb.rgb * .70 + g.hor.rgb * .22, .34), ss(m0 + .004, m0, rd.y) * hk);
  if (rd.y < .125) {      // (the nearer two ranges are lower: .12 and .062 at most)
  let m1 = (.030 + .075 * fbm(hd * 2.3 + 3.) + .012 * fbm(hd * 11. + 7.)) * toSea;
  c = mix(c, mix(hz, g.amb.rgb * .55 + g.hor.rgb * .16, .55), ss(m1 + .003, m1, rd.y) * hk);
  if (rd.y < .065) {
  let m2 = (.012 + .040 * fbm(hd * 3.4 + 21.) + .008 * fbm(hd * 17.)) * toSea;
  c = mix(c, mix(hz, g.amb.rgb * vec3f(.30, .46, .30) + g.hor.rgb * .08, .74), ss(m2 + .002, m2, rd.y) * hk); } } }
  // out to sea: a few steep limestone islands on the horizon, different on every stretch of coast
  let sk = sw(g.cam.z);
  if (sk > .01 && rd.x > 0.) {
    let az = atan2(rd.z, rd.x); let sid = floor(g.cam.z / SEG); var ih = 0.;
    for (var k = 0; k < 5; k++) {
      let r1 = h2(vec2f(sid * 3.1 + f32(k) * 1.7, 7.)); let r2 = h2(vec2f(sid + f32(k) * 5.3, 2.));
      let tt = (az - (r1 - .5) * 2.5) / (.03 + .09 * r2);
      ih = max(ih, (.006 + .028 * r2) * pow(max(1. - tt * tt, 0.), .55) * (.7 + .6 * fbm(vec2f(az * 40., f32(k) * 3.))));
    }
    let isl = ss(ih + .0012, ih - .0004, rd.y) * step(.001, ih) * sk * hk;
    c = mix(c, mix(hz, g.amb.rgb * vec3f(.26, .40, .33) + g.hor.rgb * .10, .55), isl);
  }
  var outc = mix(hz * .9, c, ss(-.02, .02, rd.y));
  if (rd.y < -.0015 && g.cam.y > SEA) {
    let hp = g.cam.xyz + rd * ((SEA - g.cam.y) / rd.y);
    let m = max(step(.01, sw(hp.z)) * ss(-1., 1., hp.x - roadX(hp.z) - shoreX(hp.z)), ss(-1., 1., ism(hp.xz)));
    if (m > .001) { outc = mix(outc, seaC(hp, -rd, 1.), m); }
  }
  return vec4f(outc, 1.);
}
// The player's car (vsPc, playercar.js): lit as the world is - sun with the world's shadows on it, the sky - with a sheen to each kind of
// surface: the paint deep red under a clear coat that gives back the sky, the glass dark and mirror-like, chrome and the wheels' metal bright,
// tyres matte; the head lamps lit with the lights, the tail lamps with the lights and brighter on the brake.
@fragment fn fsPc(i: PcO) -> @location(0) vec4f {
  let V = normalize(g.cam.xyz - i.wp); var n = normalize(i.n); if (dot(n, V) < 0.) { n = -n; }
  let k = i.k; let L = g.sun.xyz; let lights = g.misc.x;
  var alb = pow(i.c, vec3f(2.2)); var spec = .25; var refl = .05; var sh = 24.; var em = vec3f(0.);
  if (k == 0u) { alb = vec3f(.24, .006, .010); spec = 1.2; refl = .45; sh = 90.; }
  else if (k == 2u) { alb = vec3f(.008, .009, .011); spec = 2.; refl = .9; sh = 300.; }
  else if (k == 3u) { alb = max(alb, vec3f(.05)); spec = 1.; refl = .45; sh = 60.; }
  else if (k == 4u) { alb *= .55; spec = .04; refl = .01; sh = 8.; }
  else if (k == 5u) { alb = vec3f(.10, .105, .11); spec = 2.; refl = .85; sh = 250.; em = vec3f(1., .94, .82) * lights * 5.; }
  else if (k == 6u) { alb = vec3f(.30, .01, .01); spec = 1.5; refl = .5; sh = 160.; em = vec3f(1., .04, .02) * (lights * 1.2 + pu.wh.z * 4.); }
  else if (k == 7u) { alb = vec3f(.45, .18, .02); spec = 1.5; refl = .5; sh = 160.; }
  else if (k == 8u) { spec = .08; refl = .02; }
  else if (k == 9u) { alb = vec3f(.012); spec = .7; refl = .3; sh = 60.; }
  else if (k == 10u) { alb = vec3f(.035, .033, .03); spec = .4; refl = .12; sh = 30.; }
  let E = g.sunCol.rgb * shadowF(i.wp + n * .05); let ndl = max(dot(n, L), 0.);
  var c = alb * (E * ndl + sky(n));
  let R = reflect(-V, n); let fr = mix(refl * .12, refl, pow(1. - max(dot(V, n), 0.), 5.));
  var env = mix(horizon(R), g.zen.rgb, ss(0., .7, max(R.y, 0.))); if (R.y < 0.) { env = mix(env, g.amb.rgb * .25, ss(0., -.25, R.y)); }
  c += env * fr + E * pow(max(dot(R, L), 0.), sh) * spec * ndl;
  return vec4f(fogged(c + em, i.wp), 1.);
}
// Tyre smoke (playercar.js): each puff a disc turned to face the eye, soft at its edge and lumpy within, lit by the sky and the sun - white smoke,
// or brown dust off the road - and fogged with the distance.
struct SmO { @builtin(position) cp: vec4f, @location(0) uv: vec2f, @location(1) a: f32, @location(2) wp: vec3f, @location(3) sd: f32, @location(4) du: f32 };
@vertex fn vsSmoke(@builtin(vertex_index) vi: u32, @location(0) ps: vec4f, @location(1) at: vec4f) -> SmO {
  var cn = array<vec2f, 6>(vec2f(-1., -1.), vec2f(1., -1.), vec2f(1., 1.), vec2f(-1., -1.), vec2f(1., 1.), vec2f(-1., 1.)); let q = cn[vi];
  let rel = ps.xyz + (g.right.xyz * q.x + g.up.xyz * q.y) * ps.w;
  var o: SmO; o.cp = g.vp * vec4f(rel, 1.); o.uv = q; o.a = at.x; o.wp = rel + g.cam.xyz; o.sd = at.z; o.du = at.y; return o;
}
@fragment fn fsSmoke(i: SmO) -> @location(0) vec4f {
  let r = length(i.uv); if (r > 1.) { discard; }
  let nz = vn(i.uv * 2.2 + i.sd * 17.) * .6 + vn(i.uv * 4.7 + i.sd * 31.) * .4;
  let a = i.a * ss(1., .15, r) * (.45 + .8 * nz);
  let col = mix(vec3f(.78, .78, .80), vec3f(.52, .42, .30), i.du) * (g.amb.rgb * 1.15 + g.sunCol.rgb * .5);
  return vec4f(fogged(col, i.wp), clamp(a, 0., 1.));
}
// Tyre marks (playercar.js): a strip from a to b on the road, w wide; dark rubber, streaked along its length by the tread, softer at its edges.
struct MkO { @builtin(position) cp: vec4f, @location(0) uv: vec2f, @location(1) a: f32, @location(2) wp: vec3f };
@vertex fn vsMark(@builtin(vertex_index) vi: u32, @location(0) aw: vec4f, @location(1) ba: vec4f) -> MkO {
  var cn = array<vec2f, 6>(vec2f(0., -1.), vec2f(1., -1.), vec2f(1., 1.), vec2f(0., -1.), vec2f(1., 1.), vec2f(0., 1.)); let q = cn[vi];
  let d = ba.xyz - aw.xyz; let sd = normalize(vec3f(-d.z, 0., d.x) + vec3f(1e-6, 0., 0.)) * aw.w * .5;
  let rel = mix(aw.xyz, ba.xyz, q.x) + sd * q.y;
  var o: MkO; o.cp = g.vp * vec4f(rel, 1.); o.uv = vec2f(q.x, q.y); o.a = ba.w; o.wp = rel + g.cam.xyz; return o;
}
@fragment fn fsMark(i: MkO) -> @location(0) vec4f {
  let edge = ss(1., .55, abs(i.uv.y)); let tread = .7 + .3 * step(.5, fract(i.uv.y * 3.5 + .25));
  let a = i.a * edge * tread * (.75 + .25 * vn(i.wp.xz * 3.));
  return vec4f(fogged(vec3f(.012, .012, .013) * (g.amb.rgb + g.sunCol.rgb * .3), i.wp), clamp(a, 0., .85));
}
