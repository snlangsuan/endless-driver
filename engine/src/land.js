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
  const h = ph(s, 913); return h < 0.25 ? 1 : h < 0.44 ? 2 : h < 0.63 ? 3 : h < 0.74 ? 4 : h < 0.82 ? 5 : 0; };      // 4: a snowfield, 5: the crossing to an island
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
// พญาเสือโคร่ง (wild Himalayan cherry) in bloom: 1 on a hill stretch whose woods and roadside are mostly cherry, 2 on a flat stretch with an avenue of them
const chyAt = (z) => { const s = floor(z / SEG), k = zoneOf(s); return k === 1 && ph(s, 61) < 0.55 ? 1 : k === 0 && !flwAt(z) && ph(s, 63) < 0.25 ? 2 : 0; };
const flwAt = (z) => { const s = floor(z / SEG); return zoneOf(s) === 0 && (s === 4 || ph(s, 51) < 0.5); };        // a plain stretch where many plots are flower fields
// Along the coast the shore is sometimes a cliff of rocks under a high road and sometimes a sand beach the road comes down to.
// beachW is 1 on the beaches; shoreX is how far from the road the water begins (pushed far away where the coast stretch starts and ends).
// Some hill stretches cross a pass by switchbacks: the road swings 100 m to either side, turning about 140 degrees round bends of
// 15 m radius, and climbs to the pass in the middle. hpW is 1 on the switchbacks (hpw in the shaders).
// (A hill stretch has either switchbacks or a tunnel: tunS says which. The tunnel is the rarer lot, but every fourth stretch has one if it is hill.)
const tunS = (s) => s !== 2 && (ph(s, 31) > 0.45 || ((s % 4) + 4) % 4 === 2);
const hpW = (z) => { const p = z / SEG, s = floor(p); return zoneOf(s) !== 1 || tunS(s) ? 0 : 1 - sm(0.16, 0.24, abs(p - s - 0.5)); };
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
// The island (zone 5): the middle 1040 m of such a stretch is sea. An island some 340 m across lies in the middle of it, and the road reaches it and
// leaves it again over two suspension bridges, each 370 m long. isOf(z): z is in such a stretch (IS.zc: its middle, IS.s: its number).
// ism(x, z): metres into the water (positive) or inland from the waterline (negative); the shaders have the same function. isBr(z): on a bridge.
const IS = { zc: 0, s: 0 };
const isOf = (z) => { const s = floor(z / SEG); if (zoneOf(s) !== 5) return 0; IS.zc = (s + 0.5) * SEG; IS.s = s; return 1; };
const ism = (x, z) => { if (!isOf(z)) return -99; const dz = z - IS.zc, s = ((IS.s % 64) + 64) % 64, dx = (x - roadX(IS.zc)) * 0.8, an = atan2(dz, dx);
  return min(500 + 14 * sin(x * 0.021 + s) + 7 * sin(x * 0.057 + 2) - abs(dz), hypot(dx, dz) - (170 + 18 * sin(an * 3 + s) + 9 * sin(an * 7 + 1))); };
const isBr = (z) => isOf(z) && abs(z - IS.zc) > 150 && abs(z - IS.zc) < 520;
const nearRiv = (z, m) => (rivOf(z) && abs(z - RV.zr) < RV.W / 2 + m) || (isOf(z) && abs(z - IS.zc) > 150 - m && abs(z - IS.zc) < 520 + m);      // near a river's crossing, or the sea's
const brSpan = (z) => (rivOf(z) && abs(z - RV.zb) < RV.W / 2 + 7) || isBr(z);
const brAt = (x, z) => brSpan(z) && abs(x - roadX(z)) < 4.4;
// Tunnels. A hill stretch that has no switchbacks has a mountain standing across the road in its middle, and the road goes through it in a
// tunnel 220-320 m long. tunOf(z) finds the tunnel of z's stretch and leaves it in TN (zc: its middle, hl: half its length); inTun: z is inside
// it; tunT: how much of the mountain stands over the road at z (it rises over the first 30 m inside each mouth); tunAt: on the tunnel's floor.
// The shaders have tunk(z) (1 inside), so the ground above is not painted as road.
const TN = { zc: 0, hl: 0 };
const tunOf = (z) => { const s = floor(z / SEG); if (zoneOf(s) !== 1 || !tunS(s)) return 0; TN.zc = (s + 0.5) * SEG; TN.hl = 110 + 50 * ph(s, 42); return 1; };
const inTun = (z) => tunOf(z) && abs(z - TN.zc) < TN.hl;
const tunT = (z) => tunOf(z) ? 1 - sm(TN.hl - 30, TN.hl, abs(z - TN.zc)) : 0;
const tunAt = (x, z) => inTun(z) && abs(x - roadX(z)) < 4.75;
// The underpass (ทางลอด): at about half of a town's crossroads (the rest have traffic lights) the main road goes down a ramp into a cutting between
// concrete walls, passes under the cross street on a slab, and comes up again, so that through traffic need not stop. udOf(z) finds the one z
// belongs to (UD.zc: its middle); udip(z): how far below the street the road is at z (6.2 m under the slab, nothing 96 m out). roadY already has
// it taken off; ground() puts it back for everything but the road; roadYs is the level of the street (kerbs, footpaths, buildings).
const UD = { zc: 0 };
const UDC = new Map();          // (remembered by ten-block group: roadY asks this for every point of the ground)
const udG = (g) => { let v = UDC.get(g);
  if (v === undefined) { UDC.set(g, 0);          // (so that asking about the road's height while this is being worked out finds 'none' and does not ask again)
    const zc = (g * 10 + 2 + floor(ph(g, 520) * 6)) * 36 + 34; v = ph(g, 523) < 0.5 && townW(zc) > 0.6 && townW(zc - 104) > 0.6 && townW(zc + 104) > 0.6 && !nearRiv(zc, 112) ? zc : 0; UDC.set(g, v); }
  return v; };
const udOf = (z) => { const g0 = floor((z - 34) / 360); for (let g = g0 - 1; g <= g0 + 1; g++) { const v = udG(g); if (v && abs(z - v) < 110) { UD.zc = v; return 1; } } return 0; };
const udip = (z) => udOf(z) ? 6.2 * (1 - sm(18, 96, abs(z - UD.zc))) : 0;
const roadYs = (z) => roadY(z) + udip(z);
// At an underpass there are two levels one above the other, and which of them a car is on depends on how high it already is (y): udTop is true for a car
// up at street level over the slab that carries the cross street (16 m either way from the middle, 8.2 m from the road's centre line), or on the
// footpath behind the parapet (5.3 to 8.2 m out) beside the cutting.
// The pier of the island's fishing village: 60 m of timber deck 3.6 m wide (7 m at the head), beside the far bridge's landing, starting on the beach
// where the sand is as high as the deck and running straight out along z. pierOf(z): [x, where it starts, where it ends, the waterline]; pierAt: on its deck.
const PIER = new Map(), PIERY = SEA + 1.3;
const pierOf = (z) => { if (!isOf(z)) return null; let p = PIER.get(IS.s);
  if (!p) { const zc = IS.zc, x = roadX(zc + 165) + 40; let zs = zc + 110; while (zs < zc + 230 && ism(x, zs) < 0) zs += 0.5; p = [x, zs - 10.5, zs + 49.5, zs]; PIER.set(IS.s, p); }
  return p; };
const pierAt = (x, z) => { const p = pierOf(z); return !!p && z > p[1] && z < p[2] && abs(x - p[0]) < (z > p[2] - 10.5 ? 3.2 : 1.55); };
const udTop = (x, z, y) => { const dp = udip(z); if (dp < 0.2 || y < roadY(z) + dp * 0.5) return false; const d = abs(x - roadX(z)); return d < 8.2 && (abs(z - UD.zc) < 16 || d > 5.3); };
const surf = (x, z, y = -1e9) => udTop(x, z, y) ? roadYs(z) + 0.03 : brAt(x, z) || tunAt(x, z) ? roadY(z) + 0.03 : pierAt(x, z) ? max(ground(x, z), PIERY + 0.06) : ground(x, z);          // what the car stands on: the land, a bridge deck, or a tunnel's floor
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
  if (isOf(z)) { const dz = abs(z - IS.zc), t = (dz - 150) / 370;          // the island crossing: the road 9 m above the sea on the island, rising 6 m more over the middle of each bridge
    return mix(base, SEA + 9 + (t > 0 && t < 1 ? 6 * sin(PI * t) : 0), 1 - sm(520, 592, dz)); }
  return (sea <= 0 ? base : mix(base, SEA + 3.2 + (1 - beachW(z)) * (8 + 6 * ph(floor(z / SEG), 5)), sea)) - udip(z);
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
  for (let b = b0 - 1; b <= b0 + 1; b++) { const zl = b * 36 + 34, s = (roadX(zl + 1) - roadX(zl - 1)) / 2; o = min(o, abs(((x - roadX(zl)) * s + z - zl) / sqrt(1 + s * s)) - (xroad(b) ? 1.65 : 0)); }      // (a cross street is 3.3 m wider than a lane: measured from where a lane's edge would be)
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
  gw[0] = 0; const tt = tunT(z);
  if (hw > 0.001) {
    h += hw * (1 - pad) * sm(7, 70, d) * ((fbm(x * 0.005, z * 0.005) - 0.44) * 58 + (fbm(x * 0.021 + 3, z * 0.021, 3) - 0.5) * 7);
    // reservoirs lie in basins on one side of the road, about a kilometre apart, each at its own level
    const ph0 = z * 0.006 + 1, lake = hw * (1 - hpz) * (1 - sm(0, 0.1, tt)) * sm(60, 120, x - rx) * (1 - sm(270, 340, x - rx)) * sm(0.45, 0.8, 0.5 + 0.5 * sin(ph0));
    if (lake > 0.02) {
      const zc = ((Math.round((ph0 - PI / 2) / TAU) * TAU + PI / 2) - 1) / 0.006, wl = roadY(zc) - 6.5;
      h -= lake * 26; if (h < wl) { h = wl; gw[0] = 1; }
    }
  }
  if (tt > 0) {          // the mountain the tunnel goes through: it stands over the road too. Where the ground at a mouth lies inside the tunnel's own
    h += tt * (32 + 14 * (fbm(x * 0.012 + 9, z * 0.012) - 0.5));      // opening, gw is set to -2 and the terrain is not drawn there (see fsTerrain)
    if (d < 6.3 && h < roadY(z) + 7.3 && inTun(z)) gw[0] = -2;
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
  { const dp = udip(z); if (dp > 0) h += dp * sm(6.7, 7.9, d); }          // beside an underpass the land stays where it was; only the road goes down
  { const w = ism(x, z); if (w > -46) { const k = isBr(z) ? 1 : sm(9.5, 22, d);          // (the road runs out to the bridge's end on a bank of its own, whatever the shore does beside it)
      if (w > 0) { h = mix(h, SEA, k); if (k > 0.97) gw[0] = 1; } else h = mix(h, SEA + 0.3, k * sm(-mix(16, 46, sm(9, 34, d)), 0, w)); } }      // (a long easy slope, but for the embankment that carries the road to the bridge)
  //      // the sea round the island, and the shore going down to it
  return h;
}
const rng = (seed) => { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
// The speed limit in force at z (km/h): 50 in town, 40 on the switchbacks, 60 on hill roads and in snow, 80 along the coast, 90 in open country.
// A sign stands wherever this changes (see the chunks), and the self-driving keeps to it.
const zlim = (z) => isOf(z) && abs(z - IS.zc) < 540 ? 70 : townW(z) > 0.02 ? 50 : hpW(z) > 0.5 ? 40 : hillW(z) > 0.5 || snowW(z) > 0.5 ? 60 : seaW(z) > 0.5 ? 80 : 90;
// Traffic lights: in town, at the crossroads that comes once in every ten blocks (360 m). tlOf(g): where the lights of the g-th ten blocks stand (null: none);
// tlNext(z, dir): the next ones ahead of z going dir (+1 up the road, -1 down) as [z, their place in the cycle 0..1]; tlState: 0 green, 1 amber, 2 red.
// The cycle is 30 s: 16 green, 3 amber, 11 red (the signal head's shader works the same sum, from the same clock).
// The lights stand at a real crossroads: one lane in every ten (xroad; tlb in the shaders) is a proper two-lane street crossing the main road, with
// the shophouse rows held back from its corners. Lane b meets the main road at z = b * 36 + 34.
const xroad = (b) => { const g = floor(b / 10); return b === g * 10 + 2 + floor(ph(g, 520) * 6); };
const tlOf = (g) => { const zs = (g * 10 + 2 + floor(ph(g, 520) * 6)) * 36 + 34; return townW(zs) > 0.6 && !nearRiv(zs, 24) && !udG(g) ? zs : null; };      // (not where the road goes under instead)
const tlNext = (z, dir) => { for (let g = floor((z - 34) / 360), i = 0; i < 3; i++, g += dir) { const zs = tlOf(g); if (zs !== null && (zs - z) * dir > -4) return [zs, ph(g, 521)]; } return null; };
const tlState = (off, t) => { const p = (t / 30 + off) % 1; return p > 19 / 30 ? 2 : p > 16 / 30 ? 1 : 0; };
