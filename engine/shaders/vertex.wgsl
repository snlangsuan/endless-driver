// Vertex stages, shared by the picture and by the shadow map (which uses the light's matrix as vp).
struct TO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) w: f32, @location(3) rel: vec3f };
@vertex fn vsTerrain(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) w: f32) -> TO { var o: TO; o.wp = p; o.n = n; o.w = w; o.rel = p - g.cam.xyz; o.cp = g.vp * vec4f(o.rel, 1.); return o; }
@vertex fn vsLeaf(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f) -> LO { return leafV(vi, a, b, c); }
// The leaves or grass of a chunk as the graphics card culled them (cull.wgsl): cIdx lists the instances still in view, each the place of its
// twelve numbers in cInst - the chunk's own leaf or grass buffer, read here as storage.
@group(1) @binding(0) var<storage, read> cInst: array<vec4f>;
@group(1) @binding(1) var<storage, read> cIdx: array<u32>;
@vertex fn vsLeafC(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> LO { let j = cIdx[ii] * 3u; return leafV(vi, cInst[j], cInst[j + 1u], cInst[j + 2u]); }
struct XO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f, @location(3) @interpolate(flat) ln: vec3f, @location(4) @interpolate(flat) m: vec4f };
// a box (walls, floors, roof sheets, posts): a centre + turn about the vertical, b size + tilt about its long axis, c material + seed
@vertex fn vsBox(@location(0) v: vec3f, @location(1) nv: vec3f, @location(2) a: vec4f, @location(3) b: vec4f, @location(4) c: vec4f) -> XO {
  var o: XO; var vv = v; var nn = nv;
  if (c.w > .5 && c.w < 1.5) {                      // a gable: the top edge is pulled in to a ridge along x
    if (v.y > 0.) { vv.z = 0.; }
    if (abs(nv.z) > .5) { nn = normalize(vec3f(0., b.z * .5, sign(nv.z) * b.y)); }
  }
  if (c.w > 128500. && hrsOpen(c.w) > .5) { vv = vec3f(0.); }      // a shop's shutter, down only while the shop is shut: while it is open, folded away to nothing (in the shadows too)
  var l = vv * b.xyz;
  if (c.x > 37.5 && c.x < 38.5) {                   // a flag is cloth: it is made of narrow upright strips (the seed says how far each is from the pole), and here a wave
    let d = c.y + l.x; let W = g.misc.y; let t = g.cam.w; let gs = gust(a.xz);      // runs out along them from the pole, bigger toward the free end and with the wind; in a calm the cloth hangs
    let wg = W * (.5 + gs); let fly_ = ss(.35, 1.2, wg); let calm = 1. - fly_;      // with no wind to speak of the flag does not fly at all: it hangs down beside the pole
    l.z += fly_ * (d * (.05 + .06 * min(wg, 3.)) * sin(t * (3.5 + 3. * W) - d * 3.6 + a.x) + d * d * .035 * sin(t * 2.3 - d * 1.9 + a.z)) + calm * d * .03 * sin(t * .9 + d * 2.);
    l.x -= d * .82 * calm; l.y -= d * (.80 * calm + .06 * d * fly_ * max(0., 1.4 - wg));
  }
  let ct = cos(b.w); let st = sin(b.w);
  l = vec3f(l.x, l.y * ct - l.z * st, l.y * st + l.z * ct); var n = vec3f(nn.x, nn.y * ct - nn.z * st, nn.y * st + nn.z * ct);
  let cy = cos(a.w); let sy = sin(a.w);
  var lo = vec3f(l.x * cy + l.z * sy, l.y, -l.x * sy + l.z * cy);
  if (c.x > 37.5 && c.x < 38.5) {                   // a flag streams the way the wind blows (the same way the trees lean), whichever way its pole's bracket was turned:
    let wd = vec3f(.824, 0., .566);                 // so two flags on opposite sides of a street fly the same way
    lo = vec3f(cy, 0., -sy) * (-c.y) + wd * (c.y + l.x) + vec3f(0., l.y, 0.) + vec3f(-wd.z, 0., wd.x) * l.z;
  }
  let w0 = lo + a.xyz;
  var wf = w0; if (c.w > 1.5 && c.w < 2.5) { let t = g.cam.w; wf.y += .10 * sin(w0.x * .42 + w0.z * .17 + t * 1.3) + .07 * sin(w0.z * .5 - w0.x * .2 + t * .9); }      // afloat: rides the swell
  let w = wf; o.wp = w; o.n = vec3f(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy); o.lp = vv * b.xyz; o.ln = nv; o.m = c;
  // Places far from the origin are drawn from where they stand relative to the eye, not from their world position: 40 km out a world
  // coordinate is only good to 4 mm, and every corner of every box would jitter from frame to frame.
  o.cp = g.vp * vec4f(lo + (a.xyz - g.cam.xyz) + vec3f(0., wf.y - w0.y, 0.), 1.);
  return o;
}
struct CO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f, @location(3) @interpolate(flat) m: f32 };
@vertex fn vsCar(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f, @location(3) m: f32) -> CO { var o: CO; o.wp = p; o.n = n; o.lp = lp; o.m = m; o.cp = g.vp * vec4f(p - g.cam.xyz, 1.); return o; }
// A sculpted thing (a temple's image): a mesh of its own, each vertex a place, a normal and a material (as the made tubes number them: 6 whitewash, 7 gilding). Painted by fsBranch.
@vertex fn vsMesh(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) m: f32) -> BO { var o: BO; o.wp = p; o.n = n; o.uv = vec2f(p.x + p.z, p.y); o.m = m + 1.; o.cp = g.vp * vec4f(p - g.cam.xyz, 1.); return o; }
@vertex fn vsBranch(@location(0) v: vec3f, @location(1) p0: vec4f, @location(2) p1: vec4f, @location(3) h: vec2f) -> BO { return branchV(v, p0, p1, h); }
// ---- the player's car (playercar.js): its place relative to the eye (hi - eye + lo: its whole metres and the rest apart, for precision),
// heading (hi.w) and pitch (lo.w); wh: x the wheels' turn as they roll, y the front wheels' steer, z the brake lamps, w the body's lean on its
// springs; hub: each wheel's hub (and hub[0].w the body's nose dip, hub[1].w its rise and fall on the road, hub[2].w the sideways tilt of the surface it stands on).
// (pc, fl: the paint's colour and that of the light its flakes give back, linear - each car its own)
struct PcU { hi: vec4f, lo: vec4f, wh: vec4f, hub: array<vec4f, 4>, pc: vec4f, fl: vec4f };
@group(1) @binding(0) var<uniform> pu: PcU;
// (uv: the place on the model's textures; tl: the layers of the texture array to take the colour and the normal from, 255 for none)
struct PcO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) c: vec4f, @location(3) @interpolate(flat) k: u32, @location(4) lp: vec3f, @location(5) uv: vec2f, @location(6) @interpolate(flat) tl: vec2u };
@vertex fn vsPc(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) c: vec4f, @location(3) k: vec4u, @location(4) uv: vec2f) -> PcO {
  var q = p; var m = n; let w = k.y;
  // (part 9: the soft top - mx5.py. With the top down - hub[3].w, 0 up .. 1 down - it folds away: drawn back to its rear edge and laid
  // flat in the well behind the seats, below the body's waist, as the real car's does - nothing of it left standing; on the way its front bow
  // swings up and over. Folded only part of the way down it stood behind the seats as a hump, which read as a pillar left in place.)
  if (w == 9u && pu.hub[3].w > .001) { let t = pu.hub[3].w; let e = t * t * (3. - 2. * t); let zr = -1.27; let f = clamp((q.z - zr) / 1.2, 0., 1.);
    q.z = zr + .02 + (q.z - zr) * mix(1., .17, e); q.y = mix(q.y, .80 + (q.y - .831) * .03, e) + sin(t * 3.14159) * .3 * f;
    q.x = q.x * mix(1., .86, e); m = normalize(mix(m, vec3f(0., 1., 0.), e * .9)); }
  // (part 10: the doors' glass - down into the doors with the top)
  if (w == 10u && pu.hub[3].w > .001) { let t = pu.hub[3].w; q.y -= .46 * t * t * (3. - 2. * t); }
  if (w > 0u && w < 9u) {
    // (wheel 1-4 rolls; 5-8 is a part of wheel 1-4 that only steers with it - a brake calliper)
    let wi = (w - 1u) % 4u; let h = pu.hub[wi].xyz; var d = q - h; var dn = m;
    if (w <= 4u) { let ca = cos(pu.wh.x); let sa = sin(pu.wh.x);
      d = vec3f(d.x, d.y * ca - d.z * sa, d.y * sa + d.z * ca); dn = vec3f(dn.x, dn.y * ca - dn.z * sa, dn.y * sa + dn.z * ca); }
    if (wi < 2u) { let cs = cos(pu.wh.y); let sn = sin(pu.wh.y); d = vec3f(d.x * cs + d.z * sn, d.y, -d.x * sn + d.z * cs); dn = vec3f(dn.x * cs + dn.z * sn, dn.y, -dn.x * sn + dn.z * cs); }
    q = h + d; m = dn;
  } else {
    // (the body, not the wheels: leaned and dipped about a point between the axles at about the height of its springs)
    let pv = vec3f(0., .45, 0.); var d = q - pv; var dn = m; let cr = cos(pu.wh.w); let sr = sin(pu.wh.w);
    d = vec3f(d.x * cr - d.y * sr, d.x * sr + d.y * cr, d.z); dn = vec3f(dn.x * cr - dn.y * sr, dn.x * sr + dn.y * cr, dn.z);
    let cd = cos(pu.hub[0].w); let sd = sin(pu.hub[0].w); d = vec3f(d.x, d.y * cd + d.z * sd, d.z * cd - d.y * sd); dn = vec3f(dn.x, dn.y * cd + dn.z * sd, dn.z * cd - dn.y * sd);
    q = pv + d + vec3f(0., pu.hub[1].w, 0.); m = dn;
  }
  // (the whole car, wheels and all, tilted sideways to the surface under its wheels: hub[2].w)
  { let cg = cos(pu.hub[2].w); let sg = sin(pu.hub[2].w); q = vec3f(q.x * cg - q.y * sg, q.x * sg + q.y * cg, q.z); m = vec3f(m.x * cg - m.y * sg, m.x * sg + m.y * cg, m.z); }
  let cp = cos(pu.lo.w); let sp = sin(pu.lo.w); let y2 = q.y * cp + q.z * sp; let z2 = q.z * cp - q.y * sp; let ny2 = m.y * cp + m.z * sp; let nz2 = m.z * cp - m.y * sp;
  let c0 = cos(pu.hi.w); let s0 = sin(pu.hi.w);
  let rel = (pu.hi.xyz - g.cam.xyz) + pu.lo.xyz + vec3f(q.x * c0 + z2 * s0, y2, -q.x * s0 + z2 * c0);
  var o: PcO; o.cp = g.vp * vec4f(rel, 1.); o.wp = rel + g.cam.xyz; o.n = vec3f(m.x * c0 + nz2 * s0, ny2, -m.x * s0 + nz2 * c0); o.c = c; o.k = k.x; o.lp = q; o.uv = uv; o.tl = k.zw; return o;
}

// ---- People (render.js: PPL; chunks.js): a figure, drawn once for each person. a: where it stands (its feet) and which way it faces · b: its
// height, its own number, its walking speed (0: it stands) and how far it walks before it turns back · c: the ground's height where its walk
// ends, 1 for a woman, its girth. pw: which part the vertex is of, how far it moves with its limb (of the head: with the head), and how far
// with the limb's lower half. The limbs are moved here, each turned about its joint by as much as the vertex is its own: walking, the legs
// swing from the hip by turns and the knee of the one coming forward bends, the arms swing against the legs, the body rises a little at each
// step; it goes along its way and back, by the distance gone - so its feet do not slide - turning round at each end. Standing, it shifts its
// weight, looks about, and one in three holds a forearm up - a telephone, a bag.
struct PpO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f, @location(3) @interpolate(flat) pk: vec3f };
// A market's fruit (render.js FRUIT): a ball at a.xyz, a.w its radius; b.x its kind, b.y its own number - which turns it, so that no two lie
// alike. Mangoes are long, and lie on their sides; rose apples are bell-shaped, narrower at the stalk.
// (Sacks, eggs and coconuts are balls of the same pipeline: kinds 8, 9, 10.)
@vertex fn vsFruit(@location(0) p0: vec3f, @location(1) a: vec4f, @location(2) b: vec4f) -> PpO {
  let ty = i32(b.x + .5); var q = p0; var m = p0;
  if (ty == 1) { q = vec3f(p0.x * 1.45, p0.y * .85, p0.z * .9); m = normalize(vec3f(p0.x / 1.45, p0.y / .85, p0.z / .9)); }
  if (ty == 3) { let k = 1. - .35 * ss(-.2, 1., p0.y); q = vec3f(p0.x * k, p0.y * 1.1, p0.z * k); }
  if (ty == 7) { q = vec3f(p0.x * 1.2, p0.y * .95, p0.z * .95); m = normalize(vec3f(p0.x / 1.2, p0.y / .95, p0.z / .95)); }
  // (a sack: squat, flat where its mouth is open; an egg: long, on its end; a young coconut: its top pared to a point)
  if (ty == 8) { q = vec3f(p0.x, min(p0.y, .55) * .85, p0.z); }
  if (ty == 9) { q = vec3f(p0.x, p0.y * 1.3, p0.z); }
  if (ty == 10) { q = vec3f(p0.x, p0.y * (1. + .25 * ss(.3, 1., p0.y)), p0.z); }
  // (a water jar: taller than round, its top cut off at the mouth)
  if (ty == 11) { q = vec3f(p0.x, min(p0.y, .72) * 1.2, p0.z); }
  // (a bulb: a little long; a banana: a long finger curving up and out from the bunch's middle - b.y holds which way it faces)
  if (ty == 12) { q = vec3f(p0.x, p0.y * 1.25, p0.z); }
  // (garlic: squat, pointed at the top; a shallot: a teardrop; a chilli: long and thin, lying down; a woven tray: a shallow dish)
  if (ty == 14) { q = vec3f(p0.x, p0.y * .8 + .15 * ss(.4, 1., p0.y), p0.z); }
  if (ty == 15) { q = vec3f(p0.x * (1. - .4 * ss(-.2, 1., p0.y)), p0.y * 1.2, p0.z * (1. - .4 * ss(-.2, 1., p0.y))); }
  if (ty == 16) { q = vec3f(p0.x * .35, p0.y * 2.4, p0.z * .35); m = normalize(vec3f(p0.x / .35, p0.y / 2.4, p0.z / .35)); }
  // (a pot: an upright drum, its top flat at the brim; a plastic basin: a wide bowl, open, flat-bottomed)
  if (ty == 18) { q = vec3f(p0.x, clamp(p0.y, -.75, .62), p0.z); if (p0.y > .62) { m = vec3f(0., 1., 0.); } }
  if (ty == 19) { let w = .72 + .28 * ss(-.6, .1, p0.y); q = vec3f(p0.x * w, clamp(p0.y, -.6, .1) * .5, p0.z * w); if (p0.y > .1) { m = vec3f(0., 1., 0.); } }
  if (ty == 17) { let rim = ss(.6, .95, length(p0.xz)); q = vec3f(p0.x, clamp(p0.y, -.25, .05) * .3 + rim * .06, p0.z); }
  if (ty == 13) { let L = p0.y * 2.6; q = vec3f(p0.x * .42, L, p0.z * .42 + .9 * (1. - p0.y) * (1. - p0.y) - .2); m = normalize(vec3f(p0.x / .42, p0.y / 2.6, p0.z / .42)); }
  var yw = b.y * 40.; if (ty == 13) { yw = b.y * 6.2832; } let cy = cos(yw); let sy = sin(yw); var tl = (fract(b.y * 7.7) - .5) * select(.9, .15, ty == 3 || ty >= 8); if (ty == 13) { tl = -.5; } if (ty == 16) { tl = 1.5708; } if (ty == 17) { tl = 0.; }
  q = prx(q, vec3f(0.), tl); m = prx(m, vec3f(0.), tl);
  q = vec3f(q.x * cy + q.z * sy, q.y, -q.x * sy + q.z * cy); m = vec3f(m.x * cy + m.z * sy, m.y, -m.x * sy + m.z * cy);
  let rel = (a.xyz - g.cam.xyz) + q * a.w;
  var o: PpO; o.cp = g.vp * vec4f(rel, 1.); o.wp = rel + g.cam.xyz; o.n = m; o.lp = p0; o.pk = vec3f(b.x, b.y, 0.); return o;
}
fn prx(p: vec3f, piv: vec3f, a: f32) -> vec3f { let d = p - piv; let c = cos(a); let s = sin(a); return piv + vec3f(d.x, d.y * c - d.z * s, d.y * s + d.z * c); }
@vertex fn vsPpl(@location(0) p0: vec3f, @location(1) n0: vec3f, @location(2) pw: vec3f, @location(3) a: vec4f, @location(4) b: vec4f, @location(5) c: vec4f) -> PpO {
  let t = g.cam.w; let H = b.x; let sd = b.y; let pr = i32(pw.x + .5); var q = p0; var m = n0; let Z = vec3f(0.); let wL = pw.y; let wLo = pw.z;
  // (the clothes move as the part of the body they are on: the shirt and the skirt as the trunk, sleeves and trouser legs as the limbs)
  let gm = pr >= 20; var pi_ = pr; if (gm) { pi_ = pr - 20; } if (pr == 30) { pi_ = 0; } let hairp = pr == 10 || pr == 15;
  var walk = 0.; var s = 0.; var yw = a.w;
  // (walking. Its time first: every so often it stops a few seconds - to look at something - and then goes on; tw is its time spent walking,
  // stp how far it is stopped. Then its way: out along a line and back, turning round at each end over a moment; or, given a ring (c.w), round
  // and round a rectangle with rounded corners, b.w by c.w, either way about (keeping to its right of those coming the other way), and where
  // it stops it turns to what is beside it. Its legs keep time with the ground it covers - two steps to every .84 of its height, the thighs
  // swinging .4 either way, which is what sets a foot down where the body passes over it, so the feet do not slide)
  var stp = 0.; var lpos = vec2f(0.); var ring = false; let led = c.w < 0.;
  // (led: one of the stream along the footpaths - render.js STROLL - set where it is each frame; it brings how far it is walking and its stride)
  if (led) { walk = -c.w; s = b.w; }
  if (b.z > 0.) { let Tp = mix(9., 19., fract(sd * 31.7)); let Pd = step(.25, fract(sd * 47.3)) * mix(2.5, 6., fract(sd * 13.9)) * select(.6, 1., c.w > 0.);
    let tt = t + sd * 100.; let cyc = floor(tt / Tp); let ft = tt - cyc * Tp; let mv = Tp - Pd; let tw = cyc * mv + min(ft, mv);
    stp = ss(mv - .4, mv, ft) * ss(Tp, Tp - .4, ft) * step(.01, Pd); walk = 1. - stp;
    if (c.w > 0.) { ring = true; let dl = select(-1., 1., fract(sd * 7.77) > .5); var hx = b.w + dl * .22; var hz = c.w + dl * .22; let r = min(min(hx, hz), .8);
      let per = 4. * (hx + hz - 2. * r) + 6.2832 * r; s = b.z * tw; var d = fract(s / per + sd * 3.) * per; var pu = 0.; var pv = 0.; var hh = 0.; var k = 0.;
      for (var j = 0; j < 4; j++) { let ls = 2. * (hz - r); if (d < ls) { pu = hx; pv = d - (hz - r); break; } d -= ls;
        if (d < 1.5708 * r) { let f = d / r; pu = hx - r + r * cos(f); pv = hz - r + r * sin(f); hh = -f; break; } d -= 1.5708 * r; let sw = hx; hx = hz; hz = sw; k += 1.; }
      let th = k * 1.5708; let ct = cos(th); let st = sin(th); lpos = vec2f((pu * ct - pv * st) * dl, pu * st + pv * ct);
      yw += (hh - th) * dl + stp * 1.5708 * select(-1., 1., fract((cyc + sd) * 5.3) > .5); }
    else { let T = 2. * b.w / b.z; let u = fract(tw / T + sd); s = b.w * (1. - abs(2. * u - 1.)); let e = .45 / T;
      yw += 3.14159 * (ss(.5 - e, .5 + e, u) + select(ss(-e, e, u) - 1., ss(1. - e, 1. + e, u), u > .75)) + stp * 1.5708 * select(-1., 1., fract((cyc + sd) * 5.3) > .5); } }
  let phi = s / (.84 * H) * 6.2832 + sd * 20.; let A = .4 * walk; let sg = select(-1., 1., p0.x > 0.);
  // (c.y: 1 a woman; and 2 more: one who wears a lamp on the forehead - a rubber tapper. b.z < 0: seated)
  // (c.y 4: the driver of the open car - playercar.js DRV: a man, seated low, legs out to the pedals, both hands up on the wheel, a cap on)
  let drv = c.y > 3.5; let wmn = (c.y - 2. * step(1.5, c.y)) * (1. - f32(drv)); let sit = b.z < 0.;
  let skirt = wmn * step(fract(sd * 5.13), .55) * (1. - step(1.5, c.y)); let longh = step(fract(sd * 3.71), mix(.06, .8, wmn)) * (1. - f32(drv));
  // (what this one does not wear - a skirt, or trousers under one, or long hair - is drawn to nothing)
  let gone = (pr == 30 && skirt < .5) || (pr >= 26 && pr <= 29 && skirt > .5) || (pr == 15 && longh < .5);
  // (the hair stood off the scalp by its thickness, thinning to the hairline; the clothes looser on some than on others)
  if (pr == 10) { q += n0 * wLo * (mix(.004, .009, fract(sd * 9.7)) + .007 * longh + .003 * wmn); }
  if (gm) { q += n0 * .007 * fract(sd * 13.3); }
  let leg = (pi_ >= 6 && pi_ <= 9) || pi_ == 11 || pi_ == 12; let arm = (pi_ >= 2 && pi_ <= 5) || pi_ == 13 || pi_ == 14;
  if (leg || (pi_ == 0 && p0.y < .56)) {
    // (the shirt's hem and the skirt go with both legs, part way, and with neither at the middle)
    let cloth = pr == 20 || pr == 30; let sgl = select(sg, clamp(p0.x * 22., -1., 1.) * .6, cloth);
    // (seated: both thighs forward and level, the shins hanging)
    var th = select(A * sin(phi) * sgl, 1.45, sit); var kb = select(1.5 * A * pow(max(cos(phi) * sg, 0.), 1.5), 1.45, sit);
    if (drv) { th = 1.3; kb = .55; }
    q = mix(q, prx(q, vec3f(0., .31, 0.), kb), wLo); m = mix(m, prx(m, Z, kb), wLo);
    q = mix(q, prx(q, vec3f(0., .52, 0.), -th), wL); m = mix(m, prx(m, Z, -th), wL); }
  // arms: swinging against the legs; standing, hanging - or the right forearm held up
  if (arm || (pi_ == 0 && p0.y >= .56 && abs(p0.x) > .06)) {
    let hold = (1. - walk) * step(.66, fract(sd * 7.31)) * step(0., sg);
    var ta = -.55 * A * sin(phi) * sg + hold * (.35 + .08 * sin(t * 1.1 + sd * 40.)) + (1. - walk) * .03 * sin(t * .9 + sd * 30. + sg);
    var eb = .12 + .5 * A * max(-sin(phi) * sg, 0.) + hold * (1.55 + .12 * sin(t * .7 + sd * 11.)) + f32(sit) * .55 * (1. - hold);
    if (drv) { ta = 1.05; eb = .35; }
    let wa = wL * step(.5, f32(arm) + step(.085, abs(p0.x)));
    q = mix(q, prx(q, vec3f(0., .6585, 0.), -eb), wLo * f32(arm)); m = mix(m, prx(m, Z, -eb), wLo * f32(arm));
    q = mix(q, prx(q, vec3f(0., .8, 0.), -ta), wa); m = mix(m, prx(m, Z, -ta), wa); }
  // the head looks about (more, standing)
  if (pi_ == 1 || hairp || (pi_ == 0 && p0.y > .84)) { let hy = (.5 - .35 * walk) * select(1., 0., drv) * sin(t * .37 + sd * 30.) * sin(t * .11 + sd * 7.) * wL; let ch = cos(hy); let sh = sin(hy);
    q = vec3f(q.x * ch + q.z * sh, q.y, -q.x * sh + q.z * ch); m = vec3f(m.x * ch + m.z * sh, m.y, -m.x * sh + m.z * ch); }
  // the whole of it: its girth, its weight shifted from foot to foot standing, the rise at each step walking
  q.x *= c.z; q.z *= mix(1., c.z, .7);
  q.x += q.y * .025 * sin(t * .6 + sd * 20.) * (1. - walk) * (1. - f32(sit)); q.y -= .52 * (1. - cos(A * sin(phi)));
  // (seated: let down till the thighs lie on the seat, .47 m up)
  if (sit) { q.y -= .52 - .57 / H; }
  q *= H;
  let cy = cos(yw); let sy = sin(yw); let dirv = vec2f(sin(a.w), cos(a.w));
  var base = vec3f(a.x + dirv.x * s, mix(a.y, c.x, s / max(b.w, .01)), a.z + dirv.y * s);
  if (led) { base = a.xyz; }
  if (ring) { base = vec3f(a.x + lpos.x * dirv.y + lpos.y * dirv.x, a.y, a.z - lpos.x * dirv.x + lpos.y * dirv.y); }
  // (nobody is run down: whoever the moving car comes within 2.3 m of steps back from it, to that far off; those sitting stay, and stop it.
  // Only by where the car is - not by which way it points: sliding sideways through a bend its nose swings across the footpath, and reckoned
  // along its heading a whole row of people there was shoved aside and back as it went by. collide.js works out the same: dodged)
  if (!sit) { let cf = vec2f(sin(g.res.z), cos(g.res.z)); let ld = clamp(g.sunCol.w / 3.6 * .4, 0., 12.); let c0 = g.wake[0].xy - cf * ld; let pp = base.xz - c0;
    let off = pp; let dl = length(off); let sdv = select(off / max(dl, 1e-3), vec2f(cf.y, -cf.x), dl < .02);
    let ps = sdv * max(2.3 - dl, 0.) * ss(.5, 4., g.sunCol.w); base = vec3f(base.x + ps.x, base.y, base.z + ps.y); }
  let rel = (base - g.cam.xyz) + vec3f(q.x * cy + q.z * sy, q.y, -q.x * sy + q.z * cy);
  m = normalize(m);
  var o: PpO; o.cp = g.vp * vec4f(rel, 1.); if (gone) { o.cp = vec4f(2., 2., 2., 1.); } o.wp = rel + g.cam.xyz; o.n = vec3f(m.x * cy + m.z * sy, m.y, -m.x * sy + m.z * cy); o.lp = p0; o.pk = vec3f(pw.x, sd, c.y); return o;
}
// A lamp's glow (render.js STROLL): a disc facing the eye at ps.xyz (from the eye), ps.w across; at.xy the way the lamp points.
struct GlO { @builtin(position) cp: vec4f, @location(0) uv: vec2f, @location(1) k: f32, @location(2) wp: vec3f };
@vertex fn vsGlow(@builtin(vertex_index) vi: u32, @location(0) ps: vec4f, @location(1) at: vec4f) -> GlO {
  var cn = array<vec2f, 6>(vec2f(-1., -1.), vec2f(1., -1.), vec2f(1., 1.), vec2f(-1., -1.), vec2f(1., 1.), vec2f(-1., 1.)); let q = cn[vi];
  // (bigger the further off, so that it is still a point of light across the plantation; brightest from in front, dim from behind)
  let dist = length(ps.xyz); let sz = ps.w * (1.5 + dist * .09); var rel = ps.xyz + (g.right.xyz * q.x + g.up.xyz * q.y) * sz;
  let facing = dot(normalize(vec2f(-ps.x, -ps.z)), at.xy);
  var o: GlO; o.k = at.z * (.4 + .6 * ss(-.2, .7, facing));
  // (at.w 1: not a lamp but its light lying on the ground - flat, of its own size; 2: on a trunk - upright, facing +z; k negative marks these)
  if (at.w > .5) { rel = ps.xyz + vec3f(q.x, 0., q.y) * ps.w; if (at.w > 1.5) { rel = ps.xyz + vec3f(q.x * .45, q.y, 0.) * ps.w; } o.k = -at.z; }
  o.cp = g.vp * vec4f(rel, 1.); o.uv = q; o.wp = rel + g.cam.xyz; return o;
}
