// --------------------------------------------------------------------------------------------------------- the land of Ruin
// A map of 20 km by 20 km (400 square kilometres), at full size: one metre of the game is one metre of the map. Its middle is the origin; x runs
// east, z north. A dead city fills the middle - a rounded square some 14 km across - woods and hills close it in on every side, and a river
// crosses the whole map from west to east through the city's northern half.
// The streets are a grid: a line every 128 m both ways (BK), so a block is two chunks by two. Every eighth line is an arterial road (four
// lanes, 1024 m apart); in the country only every second arterial goes on, and there it winds a little. The other lines are streets, and they
// exist only where the city is dense enough. The shaders have the same functions (ruin/land.wgsl): keep them in step.
const HALF = 10000, BK = 128, WL = -3.5, HWA = 7, HWM = 3.6, START = [1.75, -5200];
// How much of a city the place is: 1 in the centre, 0 in open country. (A rounded square, its edge made ragged by noise.)
const urb = (x, z) => { const a = x * x, b = z * z; return 1 - sm(0.55, 1, Math.sqrt(Math.sqrt(a * a + b * b)) / 7600 + (pn(x / 1500 + 3, z / 1500 + 7) - 0.5) * 0.3); };
// the heart of the city, where the towers are: 1 within a kilometre and a half of the middle, gone by four
const core = (x, z) => { const a = x * x, b = z * z; return 1 - sm(0.2, 0.5, Math.sqrt(Math.sqrt(a * a + b * b)) / 7600 + (pn(x / 1500 + 3, z / 1500 + 7) - 0.5) * 0.3); };
const rural = (x, z) => 1 - sm(0.02, 0.2, urb(x, z));
// The river: its middle line is z = rivZ(x), its half width rivHW(x). rivD: metres from the water's edge (negative: in the river).
// It keeps between the east-west arterials at z = 1024 and z = 2048, so that none of them has to cross it at a slant.
const rivZ = (x) => 1536 + 250 * sin(x * 0.00085 + 0.6) + 95 * sin(x * 0.0023 + 2.1) + 30 * sin(x * 0.0061);
const rivHW = (x) => 42 + 10 * sin(x * 0.0011);
const rivSl = (x) => (rivZ(x + 1) - rivZ(x - 1)) / 2;
const rivD = (x, z) => { const s = rivSl(x); return abs(z - rivZ(x)) / Math.sqrt(1 + s * s) - rivHW(x); };
// Where line k runs: a north-south line at x = nsX(k, z), an east-west one at z = ewZ(i, x). Streets are dead straight; arterials wind in the country.
const isArt = (k) => k % 8 === 0;
const nsX = (k, z) => k * BK + (isArt(k) ? 42 * rural(k * BK, z) * sm(500, 900, abs(z - 1536)) * sin(z * 0.0052 + k * 1.7) : 0);
const ewZ = (i, x) => i * BK + (isArt(i) ? 42 * rural(x, i * BK) * sin(x * 0.0052 + i * 1.7 + 2) : 0);
// Is there a road along line k between cross lines j and j + 1? (ns: a north-south line.) Remembered: the ground asks this for every point.
const SEGS = new Map();
const segOn = (ns, k, j) => { const key = (ns ? 1 : 0) + k * 2 + j * 4096; let v = SEGS.get(key); if (v !== undefined) return v;
  const a = k * BK, b = (j + 0.5) * BK, u = ns ? urb(a, b) : urb(b, a);
  v = isArt(k) ? (k % 16 === 0 || u > 0.12) : u > 0.24 + 0.22 * ph(k + (ns ? 0 : 4096), j);
  if (SEGS.size > 60000) SEGS.clear(); SEGS.set(key, v); return v; };
// The roads nearest a point. RD.dn: signed metres east of the nearest north-south road's middle (hn: that road's half width, 0 if there is none
// near; kn: its line); RD.de, he, ke: the same for the nearest east-west road (metres north of it). No road runs within 13 m of the river's water
// but on a bridge.
const RD = { dn: 999, hn: 0, kn: 0, de: 999, he: 0, ke: 0 };
function roadAt(x, z) {
  RD.dn = RD.de = 999; RD.hn = RD.he = 0;
  const j = floor(z / BK), jx = floor(x / BK), ka = Math.round(x / (8 * BK)) * 8, km = Math.round(x / BK), ia = Math.round(z / (8 * BK)) * 8, im = Math.round(z / BK);
  if (segOn(1, ka, j)) { RD.dn = x - nsX(ka, z); RD.hn = HWA; RD.kn = ka; }
  if (km !== ka && abs(x - km * BK) - HWM < abs(RD.dn) - RD.hn && segOn(1, km, j)) { RD.dn = x - km * BK; RD.hn = HWM; RD.kn = km; }
  if (segOn(0, ia, jx)) { RD.de = z - ewZ(ia, x); RD.he = HWA; RD.ke = ia; }
  if (im !== ia && abs(z - im * BK) - HWM < abs(RD.de) - RD.he && segOn(0, im, jx)) { RD.de = z - im * BK; RD.he = HWM; RD.ke = im; }
  return RD;
}
// metres outside the nearest road's asphalt (negative: on it)
const roadEdge = (x, z) => { roadAt(x, z); return rivD(x, z) < 13 ? 99 : min(abs(RD.dn) - RD.hn, abs(RD.de) - RD.he); };
// Bridges: every north-south arterial that reaches the river crosses it on a concrete bridge, 15 m wide. Three in ten have fallen in the middle
// (never the one at x = 0, on the way in from the start). brOf(k): [x, the middle z, half the length, the deck's height at its south end, at its
// north end, fallen] or null.
const BRS = new Map();
const brOf = (k) => { let b = BRS.get(k); if (b !== undefined) return b; b = null;
  if (isArt(k)) { const x = k * BK, zc = rivZ(x), s = rivSl(x), hl = (rivHW(x) + 15) * Math.sqrt(1 + s * s);
    if (segOn(1, k, floor(zc / BK))) b = [x, zc, hl, ground(x, zc - hl - 1), ground(x, zc + hl + 1), k !== 0 && ph(k, 333) < 0.3]; }
  BRS.set(k, b); return b; };
// The height of a bridge's deck under (x, z), or -1e9 where there is none (off it, or in the gap of a fallen one).
const deckAt = (x, z) => { const k = Math.round(x / (8 * BK)) * 8, b = abs(x - k * BK) < 7.5 && abs(z - 1536) < 600 ? brOf(k) : null; if (!b) return -1e9;
  const t = (z - b[1]) / b[2]; if (abs(t) > 1 || (b[5] && abs(t) < 0.36)) return -1e9; return mix(b[3], b[4], t * 0.5 + 0.5) + 0.03; };
// The lie of the land. In the city it is all but level (a slow rise and fall of a few metres). In the country hills stand on that, eased down to
// nothing along the roads (a road keeps the height of the smooth hills under its own middle, so it climbs and dips but does not tilt), in the
// river's valley, and they rise to a wall of high ground round the edge of the map.
const base = (x, z) => 2.2 * sin(x * 0.0011 + 1) * sin(z * 0.0013 + 2) + 1.2 * sin(x * 0.0031 + z * 0.0023);
const hLow = (x, z) => 28 * (pn(x / 1100 + 31, z / 1100 + 17) - 0.5) + 10 * (pn(x / 420 + 5, z / 420 + 9) - 0.5);
const gw = [0];      // set to 1 where the point asked about is under the river's water
function ground(x, z) {
  gw[0] = 0;
  const rur = 1 - sm(0.02, 0.35, urb(x, z)), dr = rivD(x, z), edge = max(abs(x), abs(z));
  let h = base(x, z);
  if (rur > 0.001 || edge > 9200) {
    roadAt(x, z); const en = abs(RD.dn) - RD.hn, ee = abs(RD.de) - RD.he, k = sm(2, 40, min(en, ee)), val = sm(8, 420, dr);
    let hl = hLow(x, z); if (k < 1) hl = mix(en < ee ? hLow(x - RD.dn, z) : hLow(x, z - RD.de), hl, k);
    h += rur * val * (hl + k * ((fbm(x * 0.006 + 3, z * 0.006, 3) - 0.5) * 16 + (fbm(x * 0.03 + 7, z * 0.03, 3) - 0.5) * 1.6)) + sm(9300, 10000, edge) * 55 * k * val;
  }
  if (dr < 8) { h = mix(h, WL - 2.6, 1 - sm(-5, 7, dr)); if (h < WL) { h = WL; gw[0] = 1; } }
  return h;
}
// what the car stands on: a bridge's deck if it is over one and high enough to be on it, else the land
const surf = (x, z, y = -1e9) => { const d = deckAt(x, z); return d > -1e8 && (y < -1e8 || y > d - 2.5) ? d : ground(x, z); };
// What a block is (128 m square, numbered by its south-west corner): 0 open country, 1 an overgrown park, 2 towers, 3 an open lot (a car park, a
// camp), 4 rows of shops and flats, 5 sheds and yards, 6 houses. (lot() in the shaders.)
const lotKind = (bx, bz) => { const x = (bx + 0.5) * BK, z = (bz + 0.5) * BK, u = urb(x, z), h = ph(bx * 3 + 1, bz * 5 + 2);
  if (u < 0.2) return 0; if (h < 0.1) return 1; if (core(x, z) > 0.5) return h < 0.8 ? 2 : 3; if (u > 0.85) return h < 0.68 ? 4 : h < 0.82 ? 3 : 5; return h < 0.86 ? 6 : 5; };
// How wild the ground of a place is, 0 paved .. 1 all grown over; and where turf grows by it (the terrain shader paints by the same rule, so the
// blades of grass stand exactly on the green). weedAt: a patch where the asphalt of a road has broken up and weeds have come through.
const wildAt = (x, z) => { const u = urb(x, z); if (u < 0.2) return 1; const k = lotKind(floor(x / BK), floor(z / BK)); return mix(1, k === 1 ? 1 : k === 6 ? 0.75 : k === 0 ? 1 : 0.3, sm(0.2, 0.3, u)); };
const weedAt = (x, z) => pn(x * 0.05 + 11, z * 0.05) * 0.6 + pn(x * 0.23 + 3, z * 0.23) * 0.4;
// the woods: 1 deep among trees, 0 in the open (the shader darkens the ground by the same number)
const woodAt = (x, z) => sm(0.40, 0.47, (2 * pn(x * 0.004 + 40, z * 0.004) + pn(x * 0.0081 + 57, z * 0.0081 + 9)) / 3) * (1 - sm(0.05, 0.3, urb(x, z)));
// The name of the place, for the text at the top left.
const placeName = (x, z) => { const u = urb(x, z);
  if (max(abs(x), abs(z)) > 9700) return 'แนวกักกัน ขอบแผนที่';
  if (deckAt(x, z) > -1e8) return 'สะพานข้ามแม่น้ำ'; if (rivD(x, z) < 60) return 'ริมแม่น้ำ';
  if (u < 0.05) return woodAt(x, z) > 0.5 ? 'ป่ารอบเมือง' : 'ทุ่งร้างนอกเมือง'; if (u < 0.2) return 'ชานเมือง';
  return ['ชานเมือง', 'สวนสาธารณะร้าง', 'ย่านตึกสูงใจกลางเมือง', 'ลานจอดรถร้าง', 'ย่านการค้า', 'ย่านโกดังและโรงงาน', 'ย่านที่พักอาศัย'][lotKind(floor(x / BK), floor(z / BK))]; };
// ---- What the engine's shared scripts ask of a land (they were written for Endless's one long road). Ruin answers for the place the eye is:
// HERE is kept up to date by ruin/game.js. Nothing here is sea, snow, tunnel or cherry avenue.
const SEG = 1, HERE = { x: START[0], z: START[1], u: 0, wood: 0 };
const townW = () => HERE.u, hillW = () => HERE.wood, seaW = () => 0, snowW = () => 0, chyAt = () => 0, inTun = () => false, tunAt = () => false;
const roadSl = () => 0, shoreX = () => 1e9;
const roadX = () => nsX(Math.round(HERE.x / (8 * BK)) * 8, HERE.z);
// the place on the nearest north-south arterial abreast of z, off metres to its east (where the car is put down when the flying camera lands on something solid)
const rp = (z, off) => [nsX(Math.round(HERE.x / (8 * BK)) * 8, z) + off, z];
