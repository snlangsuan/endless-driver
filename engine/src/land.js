// --------------------------------------------------------------------------------------------------------- the land
// The road runs along z and wanders in x. These two functions exist in the shaders too (roadX): keep them in step.
const roadX = (z) => 60 * sin(z * 0.004) + 25 * sin(z * 0.011 + 1.3) + 9 * sin(z * 0.023 + 0.7) + seaW(z) * 16 * sin(z * 0.019) + hpX(z);   // the coast road bends more; hpX: mountain switchbacks
// The land changes along the road: hill country with forest and a reservoir (like the Wang Nam Khiao - Pak Chong road),
// then the rice plain, and back. hillW is 1 in the hills, 0 on the plain (the shaders have the same function: hw).
// Between them the road passes through a provincial town (townW is 1 there; tw in the shaders).
// The land changes along the road in stretches of 1.2 km. What a stretch is - hill country (1), a town (2), the coast road (3)
// or the open rice plain (0) - is drawn by lot from the stretch's number, so the zones never come in a fixed order.
// Between stretches the land eases back to the plain. The shaders have the same functions (zoneOf, zw, hw, tw, sw).
const SEG = 1200, SEA = -6;
const zoneRaw = (s) => { if (s === 1) return 3; if (s === 2) return 1; if (((s % 4) + 4) % 4 === 3) return 2;      /* a town at least every fourth stretch */
  const h = ph(s, 913); return h < 0.25 ? 1 : h < 0.44 ? 2 : h < 0.63 ? 3 : h < 0.74 ? 4 : 0; };      // 4: a snowfield
const zoneOf = (s) => { const r = zoneRaw(s); return s !== 1 && r === zoneRaw(s - 1) ? 0 : r; };       // never the same kind twice running: the plain comes between
const zw = (z, T, w, f) => { const p = z / SEG, s = floor(p); return zoneOf(s) !== T ? 0 : 1 - sm(w * f, w, abs(p - s - 0.5)); };
// A town has no fixed length. Its two ends are drawn by lot, each 400-600 m from the middle of its stretch; and where the stretch
// before or after it is open plain the town may grow on across the boundary, up to 1.4 km from its middle. So a town is anything
// from 800 m to nearly 3 km long. townSpan: how far it reaches back and forward, in stretches. twS: the town a point belongs to.
const TSPAN = new Map(); let twS = 0;
const townSpan = (s) => { let v = TSPAN.get(s); if (v !== undefined) return v; v = null;
  if (zoneOf(s) === 2) { v = [0.33 + 0.17 * ph(s, 77), 0.33 + 0.17 * ph(s, 78)];
    if (zoneOf(s - 1) === 0 && ph(s, 79) < 0.55) v[0] = 0.6 + 0.55 * ph(s, 81);
    if (zoneOf(s + 1) === 0 && ph(s, 80) < 0.55) v[1] = 0.6 + 0.55 * ph(s, 82); }
  TSPAN.set(s, v); return v; };
const townW = (z) => { const p = z / SEG, s0 = floor(p); let w = 0;
  for (let s = s0 - 1; s <= s0 + 1; s++) { const sp = townSpan(s); if (!sp) continue; const q = p - s - 0.5, e = q < 0 ? sp[0] : sp[1], v = 1 - sm(e - 0.09, e, abs(q)); if (v > w) { w = v; twS = s; } }
  return w; };
const hillW = (z) => zw(z, 1, 0.46, 0.7), seaW = (z) => zw(z, 3, 0.45, 0.5), snowW = (z) => zw(z, 4, 0.46, 0.6);
const flwAt = (z) => { const s = floor(z / SEG); return zoneOf(s) === 0 && (s === 4 || ph(s, 51) < 0.5); };        // a plain stretch where many plots are flower fields
// Along the coast the shore is sometimes a cliff of rocks under a high road and sometimes a sand beach the road comes down to.
// beachW is 1 on the beaches; shoreX is how far from the road the water begins (pushed far away where the coast stretch starts and ends).
// Some hill stretches cross a pass by switchbacks: the road swings 100 m to either side, turning about 140 degrees round bends of
// 15 m radius, and climbs to the pass in the middle. hpW is 1 on the switchbacks (hpw in the shaders).
const hpW = (z) => { const p = z / SEG, s = floor(p); return zoneOf(s) !== 1 || (s !== 2 && ph(s, 31) > 0.6) ? 0 : 1 - sm(0.16, 0.24, abs(p - s - 0.5)); };
const hpX = (z) => { const e = hpW(z); return e <= 0 ? 0 : e * 100 * sin(0.0262 * (z - (floor(z / SEG) + 0.5) * SEG)); };
// Where the road runs far from straight along z, distances from it must be measured square to the road, not along x.
// roadSl: the road's dx/dz. rp: the point 'off' metres to the side of the road at z (+ is the +x side). rdist: signed distance of a
// point from the centre line (rzs is left holding the z of the nearest point of the road).
const roadSl = (z) => roadX(z + 0.5) - roadX(z - 0.5);
const rp = (z, off) => { const sl = roadSl(z), n = Math.sqrt(1 + sl * sl); return [roadX(z) + off / n, z - off * sl / n]; };
let rzs = 0;
const rdist = (x, z) => {
  const dx = x - roadX(z), e = hpW(z); rzs = z; if (e <= 0) return dx;
  const sl = roadSl(z), zs = z + clamp(dx * sl / (1 + sl * sl), -40, 40), s2 = roadSl(zs), k = sm(0, 0.15, e);
  rzs = mix(z, zs, k); return mix(dx, ((x - roadX(zs)) - s2 * (z - zs)) / Math.sqrt(1 + s2 * s2), k);
};
// Rivers and canals cross the plain: in every plain stretch a river (20-30 m wide, winding) and further on a canal (8 m, nearly straight).
// rivOf(z) finds the one belonging to this part of the road and leaves it in RV; rivM is its winding (how far its middle is from zr at x).
// The road goes over on a bridge of length W + 14 centred at RV.zb. The shaders have rivOf and rivM too.
const RV = { zr: 0, W: 0, sd: 0, amp: 1, zb: 0, wl: 0 };
const rivM = (x) => RV.amp * (10 * sin(x * 0.013 + RV.sd) + 5 * sin(x * 0.031 + RV.sd * 2));
const rivOf = (z) => {
  const p = z / SEG, s = floor(p), zn = zoneOf(s); if (zn !== 0 && zn !== 2) return 0;
  if (zn === 2) { RV.zr = (s + 0.5 + (ph(s, 73) - 0.5) * 0.2) * SEG; RV.W = 9; RV.sd = ph(s, 79) * 6.28; RV.amp = 0.12; }       // a town has a canal through its middle
  else { const i = p - s < 0.5 ? 0 : 1; RV.zr = (s + (i ? 0.72 : 0.3) + (ph(s, 71 + i) - 0.5) * 0.12) * SEG;
    RV.W = i ? 8 : 20 + 10 * ph(s, 75); RV.sd = ph(s, 77 + i) * 6.28; RV.amp = i ? 0.25 : 1; }
  RV.zb = RV.zr + rivM(roadX(RV.zr)); RV.wl = roadY(RV.zr) - 2.6; return 1;
};
const nearRiv = (z, m) => rivOf(z) && abs(z - RV.zr) < RV.W / 2 + m;
const brSpan = (z) => rivOf(z) && abs(z - RV.zb) < RV.W / 2 + 7;
const brAt = (x, z) => brSpan(z) && abs(x - roadX(z)) < 4.4;
const surf = (x, z) => brAt(x, z) ? roadY(z) + 0.03 : ground(x, z);          // what the car stands on: the land, or a bridge deck
const beachW = (z) => sm(0.2, 0.75, 0.5 + 0.5 * sin(z * 0.0058 + 2.2));
const shore0 = (z) => 31 + 46 * beachW(z) + 4 * sin(z * 0.031) + 2.5 * sin(z * 0.083 + 2);
const shoreX = (z) => shore0(z) + (1 - sm(0.5, 0.9, seaW(z))) * 500;
// On some coasts (and always the first) the beach road runs through an avenue of casuarinas (ต้นสนทะเล) meeting overhead.
// pineWt is 1 there (pinew in the shaders); that kind of coast road has no wall, kerbs or rail: flat sandy ground under the trees on both sides.
const pineWt = (z) => zoneOf(floor(z / SEG)) === 3 ? sm(0.55, 0.75, seaW(z)) * sm(0.25, 0.45, beachW(z)) * sm(0.4, 0.6, 0.5 + 0.5 * sin(z * 0.0105 + 1)) : 0;      // avenue and open beach take turns, about 300 m each
const pineAt = (z) => pineWt(z) > 0.5;
const railGap = (k) => beachW(k * 4) > 0.6 && ((k % 40) + 40) % 40 < 3;        // openings in the guard rail where you can drive down to the sand
const roadY = (z) => {
  const pz = z / SEG, hp = hpW(z) > 0 ? 34 * (1 - sm(0.02, 0.24, abs(pz - floor(pz) - 0.5))) : 0;         // the climb to the pass
  const base = 5 * sin(z * 0.003 + 0.4) + 2.5 * sin(z * 0.0085 + 2) + hillW(z) * (14 * sin(z * 0.0021) + 6 * sin(z * 0.0057 + 1)) + hp, sea = seaW(z);
  return sea <= 0 ? base : mix(base, SEA + 3.2 + (1 - beachW(z)) * (8 + 6 * ph(floor(z / SEG), 5)), sea);
};
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vnoise = (x, y) => { const ix = floor(x), iy = floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy); return mix(mix(hash(ix, iy), hash(ix + 1, iy), ux), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), ux), uy); };
const fbm = (x, y, o = 4) => { let s = 0, a = 0.5; for (let i = 0; i < o; i++) { s += a * vnoise(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 9.7; a *= 0.5; } return s / (1 - a * 2 + 1e-9) * (1 - 0) ; };
// Thai countryside: a dry verge with trees and houses beside the road, then a wide flat plain of rice paddies.
// The paddies are a grid of plots, each with its own stage (flooded, green, ripe, cut), divided by low earth bunds.
const PLX = 28, PLZ = 22, VERGE = 48;
// Along most of the plain the plots begin 48 m from the road, behind a verge of trees and houses. In the flower stretches they come right
// up to it - 14 m - so that the fields are what you drive through. flwW is 1 there; it eases off over 120 m at each end of the stretch,
// where a town has grown into it, and at the two rivers (so the bridges keep their banks). vergeAt: where the plots begin. (flw in the shaders.)
const flwW = (z) => { if (!flwAt(z)) return 0; const p = z / SEG, s = floor(p), q = p - s, r0 = (s + 0.3 + (ph(s, 71) - 0.5) * 0.12) * SEG, w0 = 10 + 5 * ph(s, 75), r1 = (s + 0.72 + (ph(s, 72) - 0.5) * 0.12) * SEG;
  return sm(0, 0.1, q) * (1 - sm(0.9, 1, q)) * (1 - sm(0, 0.3, townW(z))) * sm(w0 + 30, w0 + 70, abs(z - r0)) * sm(34, 74, abs(z - r1)); };
const vergeAt = (z) => mix(VERGE, 14, flwW(z));
const ph = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
// the same value noise and the same rule as pn() and turf() in the shaders: where the ground is turf and where bare earth
const pn = (x, y) => { const ix = floor(x), iy = floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy); return mix(mix(ph(ix, iy), ph(ix + 1, iy), ux), mix(ph(ix, iy + 1), ph(ix + 1, iy + 1), ux), uy); };
const turfAt = (x, z) => pn(x * 0.09, z * 0.09) * 0.5 + pn(x * 0.37, z * 0.37) * 0.32 + pn(x * 1.3, z * 1.3) * 0.18;
// metres from the middle of the nearest town lane (soi() in the shaders)
const soiD = (x, z) => { const s0 = roadX(z + 0.5) - roadX(z - 0.5), b0 = Math.round((z + s0 * (x - roadX(z)) - 34) / 36); let o = 99;
  for (let b = b0 - 1; b <= b0 + 1; b++) { const zl = b * 36 + 34, s = (roadX(zl + 1) - roadX(zl - 1)) / 2; o = min(o, abs(((x - roadX(zl)) * s + z - zl) / sqrt(1 + s * s))); }
  return o; };
// plot under a point: [stage 0 flooded / 1 green / 2 ripe / 3 cut, metres to the nearest bund]
function plotAt(x, z, o) {
  const px = x / PLX, pz = z / PLZ, ix = floor(px), iz = floor(pz), fx = px - ix, fz = pz - iz, h = ph(ix, iz);
  o[0] = h < 0.24 ? 0 : h < 0.62 ? 1 : h < 0.86 ? 2 : 3; o[1] = min(min(fx, 1 - fx) * PLX, min(fz, 1 - fz) * PLZ); if (flwAt(z) && ph(ix + 50, iz) < 0.75) o[0] = ph(ix, iz + 50) < 0.8 ? 4 : 5;      // 4: marigolds, 5: cosmos
  return o;
}
// ground height; gw[0] is set to 1 where the point is under the reservoir's water
const gw = [0];
function ground(x, z) {
  const rx = roadX(z), d = abs(rdist(x, z)), zr = rzs, hpz = hpW(z), tw = townW(z), hw = hillW(z) * (1 - tw), sea = seaW(z), fv = flwW(z), pad = sm(mix(VERGE - 8, 8, fv), mix(VERGE + 4, 14, fv), d) * (1 - sm(0, 0.15, hillW(z))) * (1 - tw) * (1 - sm(0, 0.15, sea)) * (1 - sm(0, 0.15, snowW(z)));
  let h = (hpz > 0 ? mix(roadY(zr), roadY(z), sm(8, 40, d)) : roadY(z)) + sm(5, 30, d) * (1 - pad) * (1 - tw) * (fbm(x * 0.03 + 7, z * 0.03, 3) - 0.5) * 1.3 - pad * 0.45;
  gw[0] = 0;
  if (hw > 0.001) {
    h += hw * (1 - pad) * sm(7, 70, d) * ((fbm(x * 0.005, z * 0.005) - 0.44) * 58 + (fbm(x * 0.021 + 3, z * 0.021, 3) - 0.5) * 7);
    // reservoirs lie in basins on one side of the road, about a kilometre apart, each at its own level
    const ph0 = z * 0.006 + 1, lake = hw * (1 - hpz) * sm(60, 120, x - rx) * (1 - sm(270, 340, x - rx)) * sm(0.45, 0.8, 0.5 + 0.5 * sin(ph0));
    if (lake > 0.02) {
      const zc = ((Math.round((ph0 - PI / 2) / TAU) * TAU + PI / 2) - 1) / 0.006, wl = roadY(zc) - 6.5;
      h -= lake * 26; if (h < wl) { h = wl; gw[0] = 1; }
    }
  }
  // the coast road: on one side the land falls over rocks into the sea, on the other a bank rises behind a retaining wall
  if (sea > 0.001) {
    const dx = x - rx;
    if (dx > 0) {
      const sx = shoreX(z);
      if (dx >= sx) { h = SEA; gw[0] = 1; }
      else {
        const s0 = shore0(z), b = beachW(z), k = sm(7, mix(min(s0 - 1.5, 34), 24, b), dx);
        const foot = mix(SEA + 0.12, SEA + 0.05 + 1.8 * clamp((s0 - dx) / (s0 - 24), 0, 1), b);
        let hs = h + (foot - h) * k + k * (1 - k) * 4 * (fbm(x * 0.08, z * 0.08, 3) - 0.5) * 7 * (1 - 0.75 * b);
        hs += sm(s0 + 8, s0 + 70, dx) * sm(0, 50, sx - dx) * (1.5 + fbm(x * 0.02 + 3, z * 0.02) * 16);          // headlands close the bay at each end
        h = mix(h, max(hs, SEA + 0.04), sm(0, 0.5, sea));
      }
    }
    else { const pw = pineWt(z); h += sea * (sm(7.4, 12, -dx) * 2.9 * (1 - pw) + sm(mix(11, 34, pw), mix(80, 120, pw), -dx) * (9 + fbm(x * 0.01 + 5, z * 0.01) * 26)); }   // the wall itself is built of boxes; the ground only ramps up behind it
  }
  // a river or canal: the land is cut down to the bed, the water lies level
  if (rivOf(z)) {
    const dr = abs(z - RV.zr - rivM(x)), hwid = RV.W / 2;
    if (dr < hwid + 7) {
      h = mix(h, RV.wl - 1.6, RV.amp < 0.5 ? 1 - sm(hwid - 0.3, hwid + 1.2, dr) : 1 - sm(hwid - 1.5, hwid + 5, dr));
      if (h < RV.wl) { h = RV.wl; gw[0] = 1; }
    }
  }
  return h;
}
const rng = (seed) => { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

