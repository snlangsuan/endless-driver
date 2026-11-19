// The ground of Ruin: a city years after its people were gone. Asphalt cracked and bleached, its paint worn half away, weeds through every
// break; paving heaved and stained; yards and parks gone to grass; the woods' floor; the river. Put in place of the engine's terrain.wgsl.
fn seaC(wp: vec3f, V: vec3f, sh: f32) -> vec3f { return vec3f(0.); }      // (the sky's stage asks for a sea: there is none here)
// The paint of one road: d metres from its middle, hw its half width, t metres along it, oth metres outside the asphalt of the road that crosses
// (no paint inside a crossroads). An arterial (four lanes) has a double yellow line, lane dashes and edge lines; a street a broken yellow line and edges.
fn paint(c: vec3f, d: f32, hw: f32, t: f32, oth: f32, wear: f32) -> vec3f {
  let a = abs(d); let on = ss(.4, 1.2, oth) * wear; let dash = step(.62, fract(t / 9.)); var o = c;
  let wh = vec3f(.40, .40, .37); let yl = vec3f(.44, .32, .05);
  if (hw > 5.) { o = mix(o, yl, ss(.08, .04, abs(a - .17)) * on); o = mix(o, wh, ss(.08, .04, abs(a - 3.5)) * dash * on); }
  else { o = mix(o, yl, ss(.08, .04, a) * dash * on); }
  return mix(o, wh, ss(.08, .04, abs(a - (hw - .35))) * on);
}
@fragment fn fsTerrain(i: TO) -> @location(0) vec4f {
  let wp = i.wp; let P = wp.xz; var n = normalize(i.n);
  // (the grain of turf and earth is the engine's own: see terrain.wgsl of Endless for how each part is made)
  let Pf = fract((i.rel.xz + g.camM.xy) / 256.) * 256.;
  let dPx = dpdx(i.rel.xz); let dPy = dpdy(i.rel.xz); let pxa = length(dPx); let pxb = length(dPy); let px = sqrt(max(sqrt(pxa * pxb) * max(pxa, pxb), 1e-10));
  let n1 = fbm(P * .045); let n2 = vn(P * .55); let n3 = mix(.5, vn(P * 3.7), 1. - ss(.5, 1.4, px * 3.7)); let n4 = mix(.5, vnp(Pf * 14., 3584.), 1. - ss(.5, 1.4, px * 14.));
  let e = .12; let f3 = 1. - ss(.5, 1.4, px * 3.7); let r3 = vn(P * 3.7); let bx = (vn((P + vec2f(e, 0.)) * 3.7) - r3) * f3; let bz = (vn((P + vec2f(0., e)) * 3.7) - r3) * f3;
  let dcam = length(i.rel); let nk = 1. - ss(16., 60., dcam); let Vg = -i.rel / max(dcam, .01);
  let e2 = .02; let Pr = vec2f(Pf.x * .809 + Pf.y * .588, Pf.y * .809 - Pf.x * .588);
  let f5 = 1. - ss(.5, 1.4, px * 34.); let r5 = vn(Pr * 23.) * .6 + vn(Pr * 51. + 7.) * .4; let n5 = mix(.5, r5, f5);
  let fbx = (vn((Pr + vec2f(e2, 0.)) * 23.) * .6 + vn((Pr + vec2f(e2, 0.)) * 51. + 7.) * .4 - r5) * f5; let fbz = (vn((Pr + vec2f(0., e2)) * 23.) * .6 + vn((Pr + vec2f(0., e2)) * 51. + 7.) * .4 - r5) * f5;
  let tfv = turf(P); let rag = (mix(.5, vnp(Pf * 6., 1536.), 1. - ss(.5, 1.4, px * 6.)) * .55 + n5 * .45 - .5) * .17;
  let Pb = stkw(Pf); let s1 = stk(Pb, vec2f(.955, .296), 0., px); let s2 = stk(Pb, vec2f(.17, .985), 31., px); let s3 = stk(Pb, vec2f(-.80, .60), 57., px);
  let wsel = vn(P * 1.3 + 5.); let blades = max(mix(s1, s2, ss(.35, .65, wsel)), s3 * .85);
  let straw = vec3f(.27, .22, .08);
  let gcol = mix(mix(vec3f(.075, .125, .025), vec3f(.140, .165, .045), n1), straw * .85, max(g.fog.w * .75, .18));
  var grass = mix(mix(vec3f(.045, .050, .020), gcol * .45, .5), gcol * 1.2, ss(.42, .82, blades));
  grass = mix(grass, straw * 1.05, ss(.74, .9, s3) * ss(.4, .7, vn(P * .7 + 21.)) * .7);
  grass *= (.62 + .62 * n2) * (.80 + .40 * n3);
  grass = mix(gcol * (.70 + .55 * n2) * (.9 + .2 * n3), grass, nk);
  let graze = pow(1. - max(Vg.y, 0.), 3.);
  grass = mix(grass, mix(gcol, vec3f(dot(gcol, vec3f(.3, .6, .1))), .2), graze * .45);
  var soil = mix(vec3f(.22, .15, .095), vec3f(.18, .14, .10), pn(P * .21)) * (.68 + .55 * n3);
  soil = mix(soil, vec3f(.30, .24, .17) * (.8 + .3 * n3), ss(.5, .8, vn(P * .9 + 13.)) * .4);
  // hairline cracks (in earth baked hard, in concrete, in asphalt): the lines along which a slow noise passes its middle value
  let crackF = ss(.035, .0, abs(vnp(Pf * 4.296875 + 40., 1100.) - .5)) * f5 * nk;
  let crackB = ss(.011, .0, abs(vn(P * .5 + 3.) * .55 + vn(P * 1.9 + 8.) * .27 + vn(P * 6.7 + 2.) * .18 - .5)) * (1. - ss(.5, 1.4, px * 9.));      // the long breaks, a hand wide
  if (nk > .01) {
    soil *= 1. + nk * ((n5 - .5) * .7 + (n4 - .5) * .4);
    soil *= 1. - .35 * crackF * ss(.45, .7, vn(P * .5 + 3.));
    let pb = pebble(Pr * 17., .22); soil = mix(soil, mix(soil * .7, mix(vec3f(.24, .21, .18), vec3f(.36, .33, .29), pb.y), .75) * (.6 + .6 * pb.z), pb.x * nk * f5);
    let lf = pebble(Pr * vec2f(9., 14.) + 70., .05 + .12 * ss(.5, .8, vn(P * .3))); soil = mix(soil, mix(vec3f(.17, .11, .05), vec3f(.30, .22, .10), lf.y), lf.x * nk * .8 * (1. - ss(.5, 1.4, px * 20.)));
  }
  // What the place is: u how much of a city, wl how wild its ground. Where the ground is not turf it is bare earth in the wild and old concrete
  // in the city - poured in bays, cracked, stained dark where water stands.
  let u = urb(P); let wl = wildK(P, u); let rb = rivD(P);
  let gedge = tfv - mix(.60, .38, wl) + rag + graze * .05; let gm = ss(-.03, .03, gedge);
  let cq = fract(P / 3.2); let cj = ss(0., .025, min(min(cq.x, 1. - cq.x), min(cq.y, 1. - cq.y)));
  var conc = vec3f(.27, .265, .25) * (.72 + .36 * n2) * (.85 + .3 * n4) * (.74 + .26 * cj);
  conc = mix(conc, conc * vec3f(.55, .56, .50), ss(.5, .8, vn(P * .21 + 3.)) * .7); conc *= 1. - .6 * max(crackF * .6, crackB);
  conc = mix(conc, vec3f(.07, .10, .035) * (.8 + .4 * n3), crackB * .55);      // moss in the breaks
  var alb = mix(mix(soil, conc, 1. - wl) * (1. - .28 * ss(-.14, 0., gedge)), grass, gm);
  var bump = mix(.5, .9, wl); var gloss = .02;
  // the woods: shaded turf and leaf litter under the trees; from far off, the colour of the crowns
  let wd = woodK(P, u); let slope = 1. - n.y;
  alb = mix(alb, mix(mix(vec3f(.055, .090, .025), vec3f(.10, .12, .04), n2), vec3f(.10, .075, .04) * (.7 + .6 * n3), ss(.45, .7, vn(P * 1.9 + 3.)) * .6) * (.75 + .4 * n4), wd * .9);
  alb = mix(alb, vec3f(.045, .090, .028) * (.7 + .6 * vn(P * .2)), wd * ss(120., 300., dcam) * .7);
  let strata = sin(wp.y * 1.1 + n1 * 7.) * .5 + .5; let rk = ss(.30, .50, slope + (n2 - .5) * .14) * (1. - ss(.1, .3, u));
  alb = mix(alb, mix(vec3f(.23, .20, .17), vec3f(.36, .32, .27), strata) * (.6 + .7 * n2) * (.8 + .4 * n4), rk); bump = mix(bump, 2.2, rk);
  // the river's banks: mud and reeds in the country, a stained concrete revetment through the city
  let bankK = 1. - ss(1.5, 9., rb);
  let bank = mix(mix(vec3f(.17, .13, .08), vec3f(.08, .12, .04), ss(.3, .7, n2)) * (.7 + .5 * n3), vec3f(.30, .30, .27) * (.6 + .4 * n2) * (.8 + .3 * n4) * (1. - .5 * crackB), (1. - wl) * ss(.3, .5, u));
  alb = mix(alb, bank, bankK);
  let lake = ss(.35, .65, i.w); alb = mix(alb, vec3f(.035, .060, .045), lake);
  // the roads
  let r = roadAt(P); let en = abs(r.dn) - r.hn; let ee = abs(r.de) - r.he; let open = ss(11., 15., rb);
  let aN = (1. - ss(0., .3, en)) * step(.5, r.hn) * open; let aE = (1. - ss(0., .3, ee)) * step(.5, r.he) * open; let asp0 = max(aN, aE);
  // Where the asphalt has broken up, earth and weeds show in ragged patches (the script grows grass there by the same number); the edges of
  // the road crumble in the same way, more in the country.
  let wv = weed(P) + rag * .6; let brk = max(ss(.645, .69, wv), ss(.9, .0, -min(en, ee) + (wv - .5) * 5. * mix(.4, 1.2, wl)) * step(.5, max(r.hn, r.he)));
  let asp = asp0 * (1. - brk);
  let city = ss(.25, .35, u);
  // footpaths beside the city's streets: paving blocks heaved and gappy, a kerb whose paint has nearly gone
  let ft = 1. - ss(.5, 1.4, px * 5.); let tq = fract(Pf / .4); let joint = mix(.8, ss(0., .07, min(min(tq.x, 1. - tq.x), min(tq.y, 1. - tq.y))), ft);
  let tile = mix(vec3f(.30, .29, .28), vec3f(.33, .25, .21), mix(.5, step(.5, fract((floor(Pf.x / .4) + floor(Pf.y / .4)) * .5)), ft) * .5) * (.72 + .3 * n4) * (.62 + .38 * joint) * (.75 + .35 * n2);
  let kerb = mix(vec3f(.42, .42, .40), mix(vec3f(.50, .50, .48), vec3f(.42, .10, .08), step(.5, fract((Pf.x + Pf.y) / 1.6))), ss(.45, .6, vn(P * .3 + 7.))) * (.8 + .25 * n4);
  let pN = ss(0., .06, en) * (1. - ss(3.1, 3.3, en)) * step(.5, r.hn) * (1. - aE); let pE = ss(0., .06, ee) * (1. - ss(3.1, 3.3, ee)) * step(.5, r.he) * (1. - aN);
  let eo = min(select(99., en, r.hn > .5 && en > 0.), select(99., ee, r.he > .5 && ee > 0.));
  let pave = max(pN, pE) * city * open * (1. - ss(.58, .64, wv));
  alb = mix(alb, mix(mix(kerb, tile, ss(.26, .32, eo)), vec3f(.07, .10, .035) * (.8 + .4 * n3), crackB * .6), pave);
  // old asphalt: grey, bleached in patches, darker where it was mended, cracked; dead leaves and silt along its edges; here and there a dark dried stain
  var road = vec3f(.050, .050, .052) * (.72 + .5 * n4) * (.80 + .4 * n2);
  road = mix(road, vec3f(.085, .083, .078) * (.8 + .4 * n4), ss(.4, .7, vn(P * .17 + 9.)) * .8);
  road = mix(road, vec3f(.028, .028, .030), ss(.62, .68, vn(P * .09 + 31.)) * .7);
  road *= 1. - .55 * max(crackF * .6 * ss(.4, .6, vn(P * .4 + 2.)), crackB * ss(.35, .6, vn(P * .08 + 19.)));
  road = mix(road, vec3f(.050, .075, .030) * (.8 + .4 * n3), crackB * ss(.5, .65, vn(P * .25 + 14.)) * .5);      // green in the cracks
  let wear = ss(.30, .56, vn(P * .11 + 5.) * .7 + n2 * .3) * (.55 + .45 * n4);
  if (aN > .01) { road = paint(road, r.dn, r.hn, P.y, select(99., ee, r.he > .5), wear); }
  if (aE > .01 && aE >= aN) { road = paint(road, r.de, r.he, P.x, select(99., en, r.hn > .5), wear); }
  let silt = ss(-1.6, -.1, max(en * aN + (1. - aN) * -9., ee * aE + (1. - aE) * -9.)) * ss(.35, .65, vn(P * .5 + 17.) * .6 + n3 * .4);
  road = mix(road, mix(vec3f(.15, .11, .07), vec3f(.20, .16, .10), n3) * (.7 + .5 * n5), silt * .85 * (1. - min(aN, aE)));
  let bs = pebble(P * .21 + 13., .07 * city); let bs2 = pebble(P * .9 + 40., .5);
  road = mix(road, vec3f(.055, .012, .010) * (.7 + .5 * n4), max(bs.x * ss(.0, .5, bs.z + (n3 - .5) * .6), bs2.x * bs.x) * .85);
  alb = mix(alb, road, asp); bump = mix(bump, .3, max(asp, pave)); gloss = mix(gloss, .16, asp);
  n = normalize(n - vec3f(bx + fbx * nk * 1.4 * (1. - asp * .7), 0., bz + fbz * nk * 1.4 * (1. - asp * .7)) * bump * (1. - lake));
  let L = g.sun.xyz; let V = normalize(g.cam.xyz - wp);
  let ndl = max(dot(n, L), 0.);
  let sh = shadow(wp + normalize(i.n) * .12);
  let E = g.sunCol.rgb * sh;
  var c = alb * (E * ndl + sky(n));
  c += E * pow(max(dot(n, normalize(V + L)), 0.), 24.) * ndl * gloss;
  c += alb * head(wp, n);
  // the river: slow green-brown water that mirrors the sky, ruffled a little, ringed where rain falls
  if (lake > .01) {
    let t = g.cam.w; var rip = vec3f(vn(P * .9 + vec2f(t * .3, 0.)) - .5, 0., vn(P * .9 + vec2f(7., t * .25)) - .5) * .06 + vec3f(vn(P * .13 + vec2f(t * .08, 3.)) - .5, 0., 0.) * .05;
    if (g.sun.w > .01) { let rc = P * 1.7; let rf_ = fract(rc) - .5; let rh = h2(floor(rc)); let tp = fract(t * 1.4 + rh * 7.); let rl = length(rf_); rip += vec3f(rf_.x, 0., rf_.y) / max(rl, .01) * (sin((rl - tp * .5) * 42.) * ss(.5, .1, rl) * ss(.08, .0, abs(rl - tp * .5)) * (1. - tp) * .5 * g.sun.w); }
    let wn = normalize(vec3f(0., 1., 0.) + rip); let R = reflect(-V, wn);
    let refl = mix(horizon(R), g.zen.rgb, pow(ss(0., .8, max(R.y, 0.)), .55)) + g.sunCol.rgb * pow(max(dot(R, L), 0.), 400.) * 2.5 * sh;
    let fr = .04 + .96 * pow(1. - max(dot(V, wn), 0.), 4.);
    let deep = mix(vec3f(.045, .060, .030), vec3f(.020, .045, .040), ss(0., -20., rb)) * (g.amb.rgb * 1.4 + E * .25);
    c = mix(c, mix(deep, refl * vec3f(.86, .88, .80), max(fr, .22)), lake);
  }
  // rain: the roads darken and shine, puddles mirror the sky, drops burst on the asphalt
  let rw = g.amb.w;
  if (rw > .01) {
    let pud = ss(.42, .68, vn(P * .33) * .7 + n2 * .3); let kk = rw * (asp * (.3 + .7 * pud) + (1. - asp) * .15 * pud);
    let Rr = reflect(-V, normalize(mix(n, vec3f(0., 1., 0.), .85))); let rf = mix(horizon(Rr), g.zen.rgb, pow(ss(0., .8, max(Rr.y, 0.)), .55)) + g.sunCol.rgb * pow(max(dot(Rr, L), 0.), 200.) * sh;
    c = mix(c * (1. - .3 * rw), rf, clamp((.04 + .96 * pow(1. - max(V.y, 0.), 5.)) * 1.7, 0., 1.) * kk);
    let dq = Pf * 5.; let di = floor(dq); let dh = h2(di); let dt = g.cam.w * (2.2 + dh) + dh * 7.; let dp = fract(dt);
    let dOn = step(1. - (.12 + .3 * g.sun.w), h2(di + floor(dt) * 3.7));
    let dr = length(fract(dq) - .5 - (vec2f(h2(di + 1.3), h2(di + 2.7)) - .5) * .5);
    let splash = (ss(.03, .0, abs(dr - dp * .22)) * (1. - dp) + ss(.05, .0, dr) * step(dp, .18) * 1.5) * dOn * (1. - ss(.5, 1.4, px * 20.));
    c += (g.amb.rgb + g.sunCol.rgb * .1) * (splash * .45 * g.sun.w * asp);
  }
  return vec4f(fogged(c, wp), 1.);
}
