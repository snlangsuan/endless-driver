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
// (Stretches 0 and -2, in the middle of the map, are plain by decree - and flower fields, see flwS: left to the lot, the only flower fields
// lay at the two far ends, 18 km apart, and were hardly ever met.)
const zoneRaw = (s) => { if (s === 0 || s === -2) return 0; if (s === 1) return 3; if (s === 2) return 1; if (((s % 4) + 4) % 4 === 3) return 2;      /* a town at least every fourth stretch */
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
const flwS = (s) => s === 0 || s === -2 || ph(s, 51) < 0.3, flwAt = (z) => { const s = floor(z / SEG); return zoneOf(s) === 0 && flwS(s); };        // a plain stretch where many plots are flower fields
// A flower stretch is cut in three by its two canals, and each part between them is one place growing one flower, the whole of it: 0 sunflowers,
// 1 hydrangeas, 2 tulips (in bands of colour), 3 lilies - those four flower in the cool season - or, one part in four, 4 marigolds (ดาวเรือง),
// which are the hot season's: watered, they stay green and flower through it. (fkind in land.wgsl.)
const flwKind = (z) => { const p = z / SEG, s = floor(p), q = p - s, k = s * 3 + (q < 0.3 + (ph(s, 71) - 0.5) * 0.12 ? 0 : q < 0.72 + (ph(s, 72) - 0.5) * 0.12 ? 1 : 2); return ph(k, 389) < 0.25 ? 4 : floor(ph(k, 387) * 4); };
// Along the coast the shore is sometimes a cliff of rocks under a high road and sometimes a sand beach the road comes down to.
// beachW is 1 on the beaches; shoreX is how far from the road the water begins (pushed far away where the coast stretch starts and ends).
// Some hill stretches cross a pass by switchbacks: the road swings 100 m to either side, turning about 140 degrees round bends of
// 15 m radius, and climbs to the pass in the middle. hpW is 1 on the switchbacks (hpw in the shaders).
// (A hill stretch has either switchbacks or a tunnel: tunS says which. The tunnel is the rarer lot, but every fourth stretch has one if it is hill.)
const tunS = (s) => s !== 2 && (ph(s, 31) > 0.45 || ((s % 4) + 4) % 4 === 2);
// (and half of those stretches are a long mountain pass - tgS: the road climbs 95 m by switchbacks over nearly the whole stretch - about a
// minute's climb and a minute's descent at a drift, the pass compressed from the five-kilometre mountain roads it is after - U-bend after U-bend, with a
// concrete gutter along the uphill edge; the others have a short flight of them in the middle)
const tgS = (s) => ph(s, 34) < 0.5;
const hpW = (z) => { const p = z / SEG, s = floor(p); if (zoneOf(s) !== 1 || tunS(s)) return 0; const w = tgS(s) ? 0.47 : 0.24; return 1 - sm(w - 0.08, w, abs(p - s - 0.5)); };
const hpX = (z) => { const e = hpW(z); return e <= 0 ? 0 : e * 100 * sin(0.0262 * (z - (floor(z / SEG) + 0.5) * SEG)); };
// Where the road runs far from straight along z, distances from it must be measured square to the road, not along x.
// roadSl: the road's dx/dz. rp: the point 'off' metres to the side of the road at z (+ is the +x side). rdist: signed distance of a
// point from the centre line (rzs is left holding the z of the nearest point of the road).
const roadSl = (z) => roadX(z + 0.5) - roadX(z - 0.5);
const rp = (z, off) => { const sl = roadSl(z), n = Math.sqrt(1 + sl * sl); return [roadX(z) + off / n, z - off * sl / n]; };
let rzs = 0;
// (On a pass the road winds back and forth, so the nearest point of it may be well along z from the point asked about. It is found by looking:
// the road's points are tried every 5 m along z over as far as the point is from the road straight across (|dx| - the nearest can be no further
// along than that), up to 60 m, and the nearest of them is then refined by three steps along the road. What is returned is the distance to that
// point of the road, with the sign of the side. A single step from a guess was not enough: on the far side of a hairpin it ran on past the point
// and called it a few metres from the road (a piece of road and its gutter painted on a hilltop, the ground cut down to the road); and taken
// further from that one guess, the steps could end on the wrong leg of the road and call a point 100 m further than it was (the ground,
// which rises away from the road, stood up there in a column).)
const rdist = (x, z) => {
  const dx = x - roadX(z), e = hpW(z); rzs = z; if (e <= 0) return dx;
  const W = Math.min(abs(dx), 60), n = Math.ceil(W / 5); let zs = z, bd = 1e18;
  for (let i = -n; i <= n; i++) { const q = n ? z + W * i / n : z, ex = x - roadX(q), d2 = ex * ex + (z - q) * (z - q); if (d2 < bd) { bd = d2; zs = q; } }
  for (let it = 0; it < 3; it++) { const s1 = roadSl(zs), n1 = 1 + s1 * s1; zs += clamp(((x - roadX(zs)) * s1 + (z - zs)) / n1, -5, 5); }
  const s2 = roadSl(zs), n2 = Math.sqrt(1 + s2 * s2), ex = x - roadX(zs), ez = z - zs, dp = (ex - s2 * ez) / n2, tq = (ex * s2 + ez) / n2, k = sm(0, 0.15, e);
  rzs = mix(z, zs, k); return mix(dx, (dp < 0 ? -1 : 1) * Math.min(Math.hypot(dp, tq), Math.sqrt(bd)), k);
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
// The underpass (ทางลอด): in some towns - four in ten, drawn by the town's stretch (twS, as townW leaves it); the rest have none - at about half
// of its crossroads (the rest have traffic lights) the main road goes down a ramp into a cutting between
// concrete walls, passes under the cross street on a slab, and comes up again, so that through traffic need not stop. udOf(z) finds the one z
// belongs to (UD.zc: its middle); udip(z): how far below the street the road is at z (6.2 m under the slab, nothing 96 m out). roadY already has
// it taken off; ground() puts it back for everything but the road; roadYs is the level of the street (kerbs, footpaths, buildings).
const UD = { zc: 0 };
const UDC = new Map();          // (remembered by ten-block group: roadY asks this for every point of the ground)
const udG = (g) => { let v = UDC.get(g);
  if (v === undefined) { UDC.set(g, 0);          // (so that asking about the road's height while this is being worked out finds 'none' and does not ask again)
    const zc = (g * 10 + 2 + floor(ph(g, 520) * 6)) * 36 + 34; v = ph(g, 523) < 0.5 && townW(zc) > 0.6 && ph(twS, 527) < 0.4 && townW(zc - 104) > 0.6 && townW(zc + 104) > 0.6 && !nearRiv(zc, 112) ? zc : 0; UDC.set(g, v); }
  return v; };
// (the nearest: two can be as little as 180 m apart, their ramps meeting - the first found, as before, put one underpass's walls in the other's
// ramp and none of its own. Depth and width fall off alike either side of each, so taken from the nearer they meet level half way between.)
const udOf = (z) => { const g0 = floor((z - 34) / 360); let bd = 140, f = 0; for (let g = g0 - 1; g <= g0 + 1; g++) { const v = udG(g); if (v && abs(z - v) < bd) { bd = abs(z - v); UD.zc = v; f = 1; } } return f; };
const udip = (z) => udOf(z) ? 6.2 * (1 - sm(18, 96, abs(z - UD.zc))) : 0;
const roadYs = (z) => roadY(z) + udip(z);
// A frontage road (ถนนคู่ขนาน) runs at street level down each side of an underpass, one way with the traffic on that side, so that the shops and lanes
// along the cutting can still be reached and the cross street still be turned into. It leaves the main road 136 m out, is a full lane wide (5.4 m more
// asphalt each side: 3.6 m of lane beside the parapet, the rest the parapet itself and the gap) by the top of the ramp, and runs on past the slab.
// svW(z): how much wider than the main road's own asphalt the street is at z, each side; the shophouses, kerbs, posts and lamps stand back by it.
const SVW = 5.4;
const svW = (z) => udOf(z) ? SVW * (1 - sm(96, 136, abs(z - UD.zc))) : 0;
// Along a street, things are set out from the road's middle measured along x - the kerb, the paint on the ground, the lamps. The walls of an
// underpass and the frontage roads beside them are built square to the road instead, and where the road runs at a slant (up to 36 degrees) the two
// measures differ by a metre or two: kerbs and lamp posts then stood out in the frontage road's lane. So beside the cutting itself the
// street's things are set out square to the road as well: svSide(z, side, off) is the place off metres out on that side - by x as everywhere
// else, turning over the last 10 m before the walls begin into the place measured square to the road.
// (svQ: how far square it is - 1 beside the walls, easing to 0 over the 40 m from 96 to 136 m out, where the frontage roads end: over 10 m the
// kerb had to swing out two metres, and stood in a kink)
const svQ = (z) => (udOf(z) ? 1 - sm(96, 136, abs(z - UD.zc)) : 0);
const svSide = (z, side, off) => { const w = svQ(z); if (w <= 0) return [roadX(z) + side * off, z];
  const sl = roadSl(z), ca = 1 / Math.sqrt(1 + sl * sl); return [roadX(z) + side * off * mix(1, ca, w), z - side * off * sl * ca * w]; };
// At an underpass there are two levels one above the other, and which of them a car is on depends on how high it already is (y): udTop is true for a car
// up at street level over the slab that carries the cross street (16 m either way from the middle, 8.2 m from the road's centre line), or on the
// frontage road beyond the parapet (5.3 to 9.6 m out) beside the cutting.
// The pier of the island's fishing village: 60 m of timber deck 3.6 m wide (7 m at the head), beside the far bridge's landing, starting on the beach
// where the sand is as high as the deck and running straight out along z. pierOf(z): [x, where it starts, where it ends, the waterline]; pierAt: on its deck.
const PIER = new Map(), PIERY = SEA + 1.3;
const pierOf = (z) => { if (!isOf(z)) return null; let p = PIER.get(IS.s);
  if (!p) { const zc = IS.zc, x = roadX(zc + 165) + 40; let zs = zc + 110; while (zs < zc + 230 && ism(x, zs) < 0) zs += 0.5; p = [x, zs - 10.5, zs + 49.5, zs]; PIER.set(IS.s, p); }
  return p; };
const pierAt = (x, z) => { const p = pierOf(z); return !!p && z > p[1] && z < p[2] && abs(x - p[0]) < (z > p[2] - 10.5 ? 3.2 : 1.55); };
// (The frontage roads are at street level whatever height the car comes at: nothing else is there to be on. Only over the cutting itself does the
// car's own height say whether it is on the slab or under it. Distances are square to the road, as the walls and the frontage roads are built -
// measured along x, on a slanting road the ground's slope down into the cutting lay under the lane, the car followed it down, was taken to be
// in the cutting, and could not go on.)
const udTop = (x, z, y) => { const dp = udip(z); if (dp < 0.02) return false; const sl = roadSl(z), d = abs(x - roadX(z)) / Math.sqrt(1 + sl * sl);
  if (d > 5.2) return d < 10.6; return dp >= 0.2 && y >= roadY(z) + dp * 0.5 && abs(z - UD.zc) < 16; };
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
  const pz = z / SEG, tg = tgS(floor(pz)), hp = hpW(z) > 0 ? (tg ? 95 : 34) * (1 - sm(0.02, tg ? 0.47 : 0.24, abs(pz - floor(pz) - 0.5))) : 0;         // the climb to the pass (on a long pass 75 m)
  const base = 5 * sin(z * 0.003 + 0.4) + 2.5 * sin(z * 0.0085 + 2) + hillW(z) * (14 * sin(z * 0.0021) + 6 * sin(z * 0.0057 + 1)) + hp, sea = seaW(z);
  if (isOf(z)) { const dz = abs(z - IS.zc), t = (dz - 150) / 370;          // the island crossing: the road 9 m above the sea on the island, rising 6 m more over the middle of each bridge
    return mix(base, SEA + 9 + (t > 0 && t < 1 ? 6 * sin(PI * t) : 0), 1 - sm(520, 592, dz)); }
  return (sea <= 0 ? base : mix(base, SEA + 3.2 + (1 - beachW(z)) * (8 + 6 * ph(floor(z / SEG), 5)), sea)) - udip(z);
};
// Thai countryside: a dry verge with trees and houses beside the road, then a wide flat plain of rice paddies.
// The paddies are a grid of plots, each with its own stage (flooded, green, ripe, cut), divided by low earth bunds.
const PLX = 28, PLZ = 22, VERGE = 48;
// Along most of the plain the plots begin 48 m from the road, behind a verge of trees and houses. In the flower stretches they come right
// up to it - 14 m - so that the fields are what you drive through. flwW is 1 there; it eases off over 120 m at each end of the stretch,
// where a town has grown into it, and at the two rivers (so the bridges keep their banks). vergeAt: where the plots begin. (flw in the shaders.)
const flwW = (z) => { if (!flwAt(z)) return 0; const p = z / SEG, s = floor(p), q = p - s, r0 = (s + 0.3 + (ph(s, 71) - 0.5) * 0.12) * SEG, w0 = 10 + 5 * ph(s, 75), r1 = (s + 0.72 + (ph(s, 72) - 0.5) * 0.12) * SEG;
  // (The flowers come up to the road - 14 m from its middle - all along the stretch but for its last 36 m and the banks of its canals. They used
  // to draw back to 48 m over a long run-in at each end and either side of each canal, so that for much of the way the driver saw a wide
  // empty verge with a line of flowers far off.)
  return sm(0, 0.03, q) * (1 - sm(0.97, 1, q)) * (1 - sm(0, 0.3, townW(z))) * sm(w0 + 14, w0 + 30, abs(z - r0)) * sm(18, 34, abs(z - r1)); };
const vergeAt = (z) => mix(VERGE, 8.5, flwW(z));      // (flowers come right up to the road: 8.5 m from its middle, just beyond the poles)
// metres from the middle of the nearest town lane (soi() in the shaders)
// No lane comes out at the neck of a bridge, onto its rail: laneRiv says whether lane b would (its mouth within 16 m of the canal's banks).
// Looked up once a lane and kept; and what rivOf leaves behind it (RV) is put back, for this is asked from inside ground() and soiD(), in the
// middle of other work that has its own river in RV.
const LRV = new Map(), laneRiv = (b) => { let v = LRV.get(b); if (v === undefined) { const keep = Object.assign({}, RV), zl = b * 36 + 34; v = !!(rivOf(zl) && abs(zl - RV.zr) < RV.W / 2 + 16); Object.assign(RV, keep); if (LRV.size > 4000) LRV.clear(); LRV.set(b, v); } return v; };
// Not every lane crosses the street: four in ten go off on one side only, and meet the street at a T - laneSd(b): 0 both sides, 1 only on the
// +x side, -1 only on -x. A crossroads with its lights (xroad) always crosses. (lsd in land.wgsl is the same.) xroad is defined below; laneSd is
// only called once everything is.
const laneSd = (b) => (xroad(b) ? 0 : ph(b, 531) < 0.4 ? (ph(b, 532) < 0.5 ? 1 : -1) : 0);
const soiD = (x, z) => { const s0 = roadX(z + 0.5) - roadX(z - 0.5), b0 = Math.round((z + s0 * (x - roadX(z)) - 34) / 36); let o = 99;
  for (let b = b0 - 1; b <= b0 + 1; b++) { const zl = b * 36 + 34, s = (roadX(zl + 1) - roadX(zl - 1)) / 2; if (laneRiv(b)) continue;
    { const sd = laneSd(b); if (sd && ((x - roadX(zl)) - (z - zl) * s) / Math.sqrt(1 + s * s) * sd < -3.05) continue; }      // (not on the side it does not go off on, beyond the road itself: see soi in land.wgsl)
    { const al = ((x - roadX(zl)) - (z - zl) * s) / Math.sqrt(1 + s * s); if (abs(al) > laneL(b, al > 0 ? 1 : -1)) continue; }      // (nor past its end: laneL)
    o = min(o, abs(((x - roadX(zl)) * s + z - zl) / sqrt(1 + s * s)) - (xroad(b) ? 1.65 : 0)); }      // (a cross street is 3.3 m wider than a lane: measured from where a lane's edge would be)
  return o; };
// plot under a point: [stage 0 flooded / 1 green / 2 ripe / 3 cut, metres to the nearest bund]. A third of the plots lie under water with
// nothing or only seedlings in them, two fifths stand in ripe golden rice, the rest are green or cut (the same shares in the shaders).
function plotAt(x, z, o) {
  const px = x / PLX, pz = z / PLZ, ix = floor(px), iz = floor(pz), fx = px - ix, fz = pz - iz, h = ph(ix, iz);
  o[0] = h < 0.34 ? 0 : h < 0.48 ? 1 : h < 0.90 ? 2 : 3; o[1] = min(min(fx, 1 - fx) * PLX, min(fz, 1 - fz) * PLZ); if (flwAt(z)) o[0] = 4;      // 4: flowers - every plot of a flower stretch, and all of one kind (flwKind)
  return o;
}
// ground height; gw[0] is set to 1 where the point is under the reservoir's water
const gw = [0];
// Rice does not stand salt (its yield falls from about 3 dS/m in the soil, and sea water is some 50): there are no paddies on a stretch that has
// the sea beside it - the coast road, the island crossing - nor in the first 40 m of the stretches next to those. seaZ: 1 on such land, 0 inland.
// (What grows there instead is what grows on Thai shores: coconut, casuarina, scrub - see buildChunk. seaz in land.wgsl is the same.)
// Plantations: some of the plain's stretches - those that are neither flower fields nor a cherry avenue - are planted, from their start as far as
// their second canal (the rice begins again beyond it) - about half of them (flower fields were half the plain and plantations one stretch in
// twelve; now flowers are three in ten) - with rubber (สวนยางพารา) or with oil palm (สวนปาล์มน้ำมัน) instead of rice. plantW: 1 inside
// one, falling to 0 at its ends and where a town reaches in; rubW and oilW the same for each kind. (rub and oilp in land.wgsl are the same; the
// trees are set out in buildChunk.)
// (and of those, three in ten are not planted but rice, with an avenue of golden shower trees (ราชพฤกษ์) down the road, which flower in the hot
// season: kunAt. The rest are the plantations.)
const kunSeg = (s) => zoneOf(s) === 0 && !flwS(s) && ph(s, 63) >= 0.25 && ph(s, 67) < 0.3, kunAt = (z) => kunSeg(floor(z / SEG));
const plSeg = (s) => zoneOf(s) === 0 && !flwS(s) && ph(s, 63) >= 0.25 && ph(s, 67) >= 0.3, rubSeg = (s) => plSeg(s) && ph(s, 66) < 0.55;
const plantW = (z) => { const p = z / SEG, s = floor(p), q = p - s; if (!plSeg(s)) return 0; const e = 0.72 + (ph(s, 72) - 0.5) * 0.12; return sm(0.04, 0.09, q) * (1 - sm(e - 0.03, e - 0.006, q)) * (1 - sm(0, 0.3, townW(z))); };
const rubW = (z) => rubSeg(floor(z / SEG)) ? plantW(z) : 0, oilW = (z) => rubSeg(floor(z / SEG)) ? 0 : plantW(z);
const seaSeg = (s) => { const k = zoneOf(s); return k === 3 || k === 5; };
const seaZ = (z) => { const p = z / SEG, s = floor(p), q = (p - s) * SEG; return seaSeg(s) ? 1 : max(seaSeg(s - 1) ? 1 - sm(0, 40, q) : 0, seaSeg(s + 1) ? 1 - sm(0, 40, SEG - q) : 0); };
// Temples in the country (วัด): some stretches of plain and of hill have one, standing well back from the road - 70 to 150 m - at the end of an
// earth track of its own. watOf(s): the temple of stretch s, or null - where it stands (x, z), which side of the road, which way it faces (its
// front to the road), its great image (kind: 0 a seated Buddha, 1 a standing one, 2 a reclining one, 3 a great chedi), and y, the level its
// ground is made (the land's own height there, found the first time it is asked). Its ground is levelled by ground(), below; the buildings are
// made in buildChunk. (Towns have their temples in the street: see the blocks of a town.)
const WATS = new Map(); let watOff = false;
const watOf = (s) => { let T = WATS.get(s); if (T !== undefined) return T; T = null; const k = zoneOf(s);
  // (Looked for at two places in the stretch, near its beginning and near its end, the one drawn by lot first: the first that is clear of towns,
  // rivers, switchbacks and tunnels. On a hill always on the side away from the reservoirs.)
  if ((k === 0 || k === 1) && ph(s, 801) < 0.9) for (let t = 0; t < 2 && !T; t++) { const first = (ph(s, 802) < 0.5) === (t === 0), q = first ? 0.12 + 0.07 * ph(s, 803) : 0.81 + 0.07 * ph(s, 803), z = Math.round((s + q) * SEG / 2) * 2, side = k === 1 ? -1 : ph(s, 804) < 0.5 ? -1 : 1;
    const dist = k === 1 ? 95 + 55 * ph(s, 805) : flwS(s) ? 170 + 45 * ph(s, 805) : 72 + 46 * ph(s, 805), x =      // (among the flower fields a temple stands far back: the flowers keep the roadside)
      Math.round((roadX(z) + side * dist) / 2) * 2;
    if (townW(z) < 0.02 && townW(z - 60) < 0.02 && townW(z + 60) < 0.02 && !(rivOf(z) && abs(z - RV.zr) < RV.W / 2 + 70) && hpW(z) <= 0 && hpW(z - 150) <= 0 && hpW(z + 150) <= 0 && !(tunOf(z) && abs(z - TN.zc) < TN.hl + 50))
      T = { s, x, z, side, hill: k === 1, yaw: -side * PI / 2, kind: k === 1 ? [0, 1, 3, 0][floor(ph(s, 806) * 3.99)] : floor(ph(s, 806) * 3.99), paved: k === 0 && ph(s, 807) < 0.5, y: null }; }
  if (WATS.size > 400) WATS.clear(); WATS.set(s, T); return T; };
// (the level: the land as it would be without the temple; on the plain a little above the road, clear of the paddies' water. A place that turns
// out to be under a reservoir has no temple.)
const watY = (T) => { if (T.y === null) { watOff = true; const g = ground(T.x, T.z), wet = gw[0] > 0; watOff = false; T.y = T.hill ? g : roadY(T.z) + 0.3; if (wet) { T.dead = true; } } return T.y; };
function ground(x, z) {
  const rx = roadX(z), d = abs(rdist(x, z)), zr = rzs, hpz = hpW(z), tw = townW(z), hw = hillW(z) * (1 - tw), sea = seaW(z), fv = flwW(z), pad = sm(mix(VERGE - 8, 6.5, fv), mix(VERGE + 4, 8.5, fv), d) * (1 - sm(0, 0.15, hillW(z))) * (1 - tw) * (1 - seaZ(z)) * (1 - plantW(z)) * (1 - sm(0, 0.15, snowW(z)));
  let h = (hpz > 0 ? mix(roadY(zr), roadY(z), sm(8, 40, d)) : roadY(z)) + sm(5, 30, d) * (1 - pad) * (1 - tw) * (fbm(x * 0.03 + 7, z * 0.03, 3) - 0.5) * 1.3;
  // The paddies: each plot is a level floor sunk 0.7 m below the land beside the road, for water to stand in - level, so each takes the height
  // of the road abreast of its own middle and the plots step down the plain like shallow terraces - and between the plots run the bunds,
  // banks of earth 0.45 m higher than the floors they part (and as high as the upper floor where two levels meet). The ground's mesh has a
  // point every 2 m and the plots are 28 by 22, so the lines of points fall exactly along the bunds: a bund is a ridge one point high.
  if (pad > 0) { const pz = z / PLZ, iz = floor(pz), fz = pz - iz, px = x / PLX, fx = px - floor(px), lv = roadY((iz + 0.5) * PLZ), ln = roadY((iz + (fz < 0.5 ? -0.5 : 1.5)) * PLZ);
    const kz = 1 - sm(0.2, 1.9, min(fz, 1 - fz) * PLZ), kx = 1 - sm(0.2, 1.9, min(fx, 1 - fx) * PLX);
    // (Flowers are not rice: they want drained ground, not standing water. A flower plot is not sunk and has no bunds - it lies level with the
    // land beside the road, its tilled bed a hand higher than the paths that part the plots.)
    h = flwAt(z) ? mix(h, roadY(z) + 0.12 * (1 - max(kz, kx)), pad) : mix(h, lv - 0.7 + max(kz * (max(ln - lv, 0) + 0.45), kx * 0.45), pad); }
  // Behind a town's street the land is terraced lane by lane: everything that belongs to one lane - the lane itself, the lots along both sides
  // of it, their walls and houses - lies at one level, that of the road where the lane leaves it, and the step to the next lane's level is taken
  // in the last 2.5 m before the line half way between them. (It used to follow the road's height abreast of each point, so on a road that
  // climbs every lot sloped along its length, and the houses, walls and gate posts - each built level from one point - stood in the air at
  // their lower end.)
  if (tw > 0.3 && d > 25) { const s0 = roadX(z + 0.5) - roadX(z - 0.5), b0 = Math.round((z + s0 * (x - rx) - 34) / 36); let ds = 99, zb = 0;
    for (let b = b0 - 1; b <= b0 + 1; b++) { const zl = b * 36 + 34, s = (roadX(zl + 1) - roadX(zl - 1)) / 2, q = ((x - roadX(zl)) * s + z - zl) / Math.sqrt(1 + s * s); if (abs(q) < abs(ds)) { ds = q; zb = zl; } }
    // (the street's level - roadYs - not the road's: beside an underpass the road is down in its cutting; and less the dip here, which is put back below)
    // (a school's ground or a football field - civSites, chunks.js - lies level across both its lanes' halves, at lane b's level, taking the step
    // to lane b + 1 only at its far edge: the terrace's step ran down the middle of the pitch)
    let lv = mix(roadYs(zb), roadYs(zb + (ds > 0 ? 36 : -36)), 0.5 * sm(15.5, 18, abs(ds)));
    if (typeof civLane === 'function') { const cl = civLane(x, z); if (cl) lv = mix(roadYs(cl[0]), roadYs(cl[0] + 36), sm(34, 36, cl[1])); }
    h = mix(h, lv - udip(z), sm(25, 29, d) * sm(0.3, 0.6, tw)); }
  gw[0] = 0; const tt = tunT(z);
  if (hw > 0.001) {
    h += hw * (1 - pad) * sm(7, 70, d) * ((fbm(x * 0.005, z * 0.005) - 0.44) * 58 + (fbm(x * 0.021 + 3, z * 0.021, 3) - 0.5) * 7);
    // reservoirs lie in basins on one side of the road, about a kilometre apart, each at its own level
    const ph0 = z * 0.006 + 1, lake = hw * (1 - hpz) * (1 - sm(0, 0.1, tt)) * sm(60, 120, x - rx) * (1 - sm(270, 340, x - rx)) * sm(0.45, 0.8, 0.5 + 0.5 * sin(ph0));
    // (Its level is taken from the road abreast of its middle. Where the road climbs fast - a pass, or its foot - that can be far above the road
    // here, and the water stood up out of the plain in a column 50 m high. So there is no reservoir on a pass, and none where the road here
    // runs lower than a few metres above the water.)
    const zc = ((Math.round((ph0 - PI / 2) / TAU) * TAU + PI / 2) - 1) / 0.006, wl = roadY(zc) - 6.5, lk = lake * (1 - sm(0, 0.02, hpz)) * sm(wl + 3, wl + 8, roadY(z));
    if (lk > 0.02) {
      h -= lk * 26; if (h < wl) { h = wl; gw[0] = 1; }
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
  // Beside an underpass the land stays where it was; only the road goes down. The step up from the cutting's floor to the street is taken
  // 7.0 to 8.2 m out measured SQUARE to the road, as the walls are built (4.5 to 5.2 m out) - not along x, as it first was: on a road running
  // at a slant, 6.7 m along x is as little as 5.4 m from the road, and with the ground's points 2 m apart the slope then began in front of the
  // wall and came up through the cutting's floor in a row of white spikes. So placed, the lowest point of any slope is at least 5 m out: inside
  // the wall or behind it. Out past that the ground is made dead level a hand below the street, under the frontage road (left to its own
  // gentle rise and fall it came up through that road's surface in places).
  // (where the road is less than 20 cm down there are no walls nor frontage slabs yet: the ground is the frontage road, at the street's level from 4.4 m out)
  { const dp = udip(z); if (dp > 0) { const sl = roadSl(z), dq = d / Math.sqrt(1 + sl * sl), k = dp < 0.2 ? sm(4.0, 4.6, dq) : sm(6.0, 7.2, dq); h += dp * k;
      // (The ground's 2 m squares cannot step: they slope from the cutting's floor to the street. That slope is kept wholly under the frontage
      // road's slab, 6 to 7.2 m out - no square reaches from it past the kerb at 9.15, where it showed as a dark nick, nor far enough in for its
      // corner to stand up inside the cutting higher than the kerb along the wall's foot.)
      // (In the mouth of a lane, or of the street that crosses over the underpass, the ground is that lane's own surface, running up to the frontage road:
      // there it is kept only a finger below, not a hand, or the frontage road stood a step above the street that joins it.)
      // (The level is the street's where it is abreast of the point - at the foot of the square from it to the road, zf - not at the point's own z:
      // the frontage road is laid square to the road, and on a slanting road that climbs, the ground 10 m out, levelled to the street at its
      // own z, stood up to 15 cm proud of the frontage road's surface - poking through it in a saw-toothed edge, and leaving the road's end a step.)
      // (and wholly from where the frontage road begins - dp 0.003 - not eased in over its first 50 m: there the ground stood up through its end)
      if (dp > 0.003) { const low = d > 8 ? mix(0.025, 0.07, sm(2.3, 4.3, soiD(x, z))) : 0.07, zf = z + (x - roadX(z)) * sl / (1 + sl * sl), dpf = udip(zf);
        // (only under the frontage road's slab - to 9.15 m out - is it kept low; the footpath beyond its kerb is at the street's level, as
        // footpaths are everywhere in town: kept low with the rest, it lay a hand below the road beside it)
        const lw2 = dp < 0.2 ? 0.02 : mix(low, 0, sm(7.0, 8.2, dq));      // (up from 8.2 m, well under the slab: the ground's 2 m squares sloped up to the street in jagged dark nicks along the kerb, eased in where they show)
        h = mix(h, roadY(zf) + dpf - lw2 - 0.012, sm(0.003, 0.03, dp) * k * (1 - sm(12, 15, d))); udOf(z); } } }
  if (isBr(z) && d < 6.5) h = min(h, roadY(z) - 1.8);      // (under an island bridge's deck - its underside 1.4 m down - the ground keeps below it)
  { const w = ism(x, z); if (w > -46) { const k = isBr(z) ? 1 : sm(9.5, 22, d);          // (the road runs out to the bridge's end on a bank of its own, whatever the shore does beside it)
      if (w > 0) { h = mix(h, SEA, k); if (k > 0.97) gw[0] = 1; } else h = mix(h, SEA + 0.3, k * sm(-mix(16, 46, sm(9, 34, d)), 0, w)); } }      // (a long easy slope, but for the embankment that carries the road to the bridge)
  //      // the sea round the island, and the shore going down to it
  // a temple's ground: level over its whole compound (30 m to front and back of its middle, 25 m to either side), eased into the land over 9 m
  // (and the track from the road to its gate runs on a low bank of its own - 7.5 m to either side of its line, eased off over 4.5 more - rising
  // evenly from the road's level to the temple's: across paddies it would otherwise lie under their water)
  if (!watOff) { const T = watOf(floor(z / SEG)); if (T && abs(z - T.z) < 34) { const xr = roadX(T.z), a = (x - xr) * T.side, L = abs(T.x - xr);
      if (a > 3 && a < L + 39) { const y = watY(T); if (!T.dead) {
          if (a < L - 28 && abs(z - T.z) < 12) { const k = (1 - sm(7.5, 12, abs(z - T.z))) * sm(3, 9, a);      // (the bank is 15 m wide on top: the way, and a verge each side with its row of trees)
          h = mix(h, mix(roadY(T.z), y, clamp((a - 6) / (L - 36), 0, 1)), k); if (k > 0.5) gw[0] = 0; }
          if (abs(x - T.x) < 39) { const k = (1 - sm(30, 39, abs(x - T.x))) * (1 - sm(25, 34, abs(z - T.z))); h = mix(h, y, k); if (k > 0.5) gw[0] = 0; } } } } }
  return h;
}
// The speed limit in force at z (km/h): 50 in town, 40 on the switchbacks, 60 on hill roads and in snow, 80 along the coast, 90 in open country.
// A sign stands wherever this changes (see the chunks), and the self-driving keeps to it.
const zlim = (z) => isOf(z) && abs(z - IS.zc) < 540 ? 70 : townW(z) > 0.02 ? 50 : hpW(z) > 0.5 ? 40 : hillW(z) > 0.5 || snowW(z) > 0.5 ? 60 : seaW(z) > 0.5 ? 80 : 90;
// Traffic lights: in town, at the crossroads that comes once in every ten blocks (360 m). tlOf(g): where the lights of the g-th ten blocks stand (null: none);
// tlNext(z, dir): the next ones ahead of z going dir (+1 up the road, -1 down) as [z, their place in the cycle 0..1]; tlState: 0 green, 1 amber, 2 red.
// The cycle is 30 s: 16 green, 3 amber, 11 red (the signal head's shader works the same sum, from the same clock).
// The lights stand at a real crossroads: one lane in every ten (xroad; tlb in the shaders) is a proper two-lane street crossing the main road, with
// the shophouse rows held back from its corners. Lane b meets the main road at z = b * 36 + 34.
// - and only well inside the town (townW over 0.9 at it): at the town's edges, where the houses thin out, there are only lanes, and those short (laneLen)
const xroad = (b) => { const g = floor(b / 10); return b === g * 10 + 2 + floor(ph(g, 520) * 6) && townW(b * 36 + 34) > 0.9 && !laneRiv(b); };
// A post beside a town street (off metres out on that side) is not stood in the mouth of a lane: where its place along the road falls in one, it is
// moved along by the least that clears the mouth. (Worked out from z alone, so every chunk agrees where a pole and the next one stand.)
const clearZ = (z, side, off) => { if (townW(z) < 0.45) return z; for (const d of [0, 5, -5, 8, -8, 11, -11]) { const zz = z + d; if (soiD(roadX(zz) + side * off, zz) > 3.3 && !(typeof convDr === 'function' && convDr(zz, side, 0.3))) return zz; } return z; };
const laneLen = (zl) => mix(26, 160, sm(0.5, 0.9, townW(zl)));
// How far lane b runs out on one side (side 1: +x): to the back of its last house - a lane is made to reach the houses, and where the last lots
// are empty it ends at the last one built on, instead of running on to its full length across waste ground; a side with no house at all has
// no lane. (A cross street runs its full length.) The lots and which stand empty are the house builder's (chunks.js: u and h(0) there); laneL in
// land.wgsl is the same.
const LLC = new Map(), laneL = (b, side) => { const key = b * 2 + (side > 0 ? 1 : 0); let v = LLC.get(key); if (v !== undefined) return v; const tw0 = twS, rz0 = rzs;      // (twS, rzs, RV: put back as they were - this is asked in the middle of other work)
  const zl = b * 36 + 34, full = laneLen(zl);
  // (a lot is left empty, too, out of the town, by a river, too near the road, or squeezed by the next lane where the road bends: the builder's tests)
  if (xroad(b)) v = full; else { townW(zl); const seg = twS, keep = Object.assign({}, RV), sl = (roadX(zl + 1) - roadX(zl - 1)) / 2, ca = 1 / Math.sqrt(1 + sl * sl), sa = sl * ca, ox0 = roadX(zl); v = 0;
    for (let i = 0; i < 8; i++) { const t = side * (32.5 + i * 17); if (abs(t) + 8.5 > full) break;
      for (const ls of [1, -1]) { const hq = b * 64 + i * 4 + (side > 0 ? 2 : 0) + (ls > 0 ? 1 : 0); if (ph(hq, 500 + seg) < 0.08 || ph(hq, 510 + seg) < (i - 3) * 0.1) continue;
        const x = ox0 + t * ca + ls * 11 * sa, z = zl - t * sa + ls * 11 * ca; if (townW(z) < 0.45 || nearRiv(z, 16) || abs(rdist(x, z)) < 29) continue;
        let ok = true; for (const b2 of [b - 1, b + 1]) { const z2 = b2 * 36 + 34, s2 = (roadX(z2 + 1) - roadX(z2 - 1)) / 2; if (abs(((x - roadX(z2)) * s2 + z - z2) / Math.sqrt(1 + s2 * s2)) < 20) ok = false; }
        if (ok) v = abs(t) + 9; } }
    Object.assign(RV, keep); }
  twS = tw0; rzs = rz0; if (LLC.size > 8000) LLC.clear(); LLC.set(key, v); return v; };
const tlOf = (g) => { const zs = (g * 10 + 2 + floor(ph(g, 520) * 6)) * 36 + 34; return townW(zs) > 0.9 && !nearRiv(zs, 24) && !udG(g) ? zs : null; };      // (not where the road goes under instead)
const tlNext = (z, dir) => { for (let g = floor((z - 34) / 360), i = 0; i < 3; i++, g += dir) { const zs = tlOf(g); if (zs !== null && (zs - z) * dir > -4) return [zs, ph(g, 521)]; } return null; };
const tlState = (off, t) => { const p = (t / 30 + off) % 1; return p > 19 / 30 ? 2 : p > 16 / 30 ? 1 : 0; };
