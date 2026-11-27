// --------------------------------------------------------------------------------------------------------- time of day
// The day passes on its own (one day = 12 minutes; T jumps ahead), and the weather changes on its own rhythm. The season follows the clock (see
// seasonAt below): hot, the rains, the cool, each a third of a year of the game's time.
const DAY = [0.42, 0.85, 0.3], NOON = [0.3, 0.88, -0.38], EVE = [0.85, 0.2, -0.45], DAWN = [0.7, 0.32, 0.5], MOON = [-0.4, 0.75, 0.4];
const NIGHT = { dir: MOON, sun: [0.2, 0.26, 0.42], amb: [0.05, 0.068, 0.115], zen: [0.01, 0.022, 0.065], hor: [0.035, 0.052, 0.1], ex: 1.9, night: 1, fog: 0.0015 };
// (a bright, open feel throughout, as in an open-world racer: a deep blue sky and warm sun by day, a long golden evening that goes
// a deep orange-red at dusk (it went pink and violet once: the light on everything went pink with it, like a fog), and a blue moonlit night light enough to see the land by - never the near-black of the old nights)
const KEYS = [
  { t: 0.00, ...NIGHT }, { t: 0.21, ...NIGHT },
  { t: 0.25, dir: DAWN, sun: [0, 0, 0], amb: [0.1, 0.095, 0.14], zen: [0.05, 0.07, 0.18], hor: [0.46, 0.28, 0.26], ex: 1.5, night: 0.6, fog: 0.004 },
  { t: 0.31, dir: DAWN, sun: [2.9, 2.05, 1.25], amb: [0.42, 0.45, 0.56], zen: [0.16, 0.34, 0.70], hor: [0.98, 0.78, 0.58], ex: 0.88, night: 0, fog: 0.0045 },
  { t: 0.42, dir: DAY, sun: [3.5, 3.15, 2.6], amb: [0.42, 0.53, 0.74], zen: [0.05, 0.2, 0.68], hor: [0.6, 0.77, 0.98], ex: 0.84, night: 0, fog: 0.0013 },
  { t: 0.60, dir: NOON, sun: [3.5, 3.15, 2.6], amb: [0.42, 0.53, 0.74], zen: [0.05, 0.2, 0.68], hor: [0.6, 0.77, 0.98], ex: 0.84, night: 0, fog: 0.0013 },
  { t: 0.72, dir: EVE, sun: [3.7, 1.75, 0.6], amb: [0.33, 0.29, 0.31], zen: [0.12, 0.17, 0.48], hor: [1.08, 0.56, 0.28], ex: 1.1, night: 0, fog: 0.0022 },
  { t: 0.77, dir: EVE, sun: [0, 0, 0], amb: [0.10, 0.09, 0.12], zen: [0.05, 0.06, 0.18], hor: [0.40, 0.21, 0.15], ex: 1.5, night: 0.6, fog: 0.0022 },
  { t: 0.81, ...NIGHT }, { t: 1.00, ...NIGHT },
];
let tday = 0.44, dayN = 0, headOn = -1;       // headOn: -1 automatic, 0 off, 1 on
// The seasons, by the game's clock: from the start (day 1, the beginning of the hot season) hot, then the rains, then the cool, round and round,
// each 2922 hours - a third of a year, 121 days and 18 hours; at 12 minutes a day some 24 hours of driving - and each changing into the next
// over its last three days, the grass greening or yellowing as it goes. The clock is kept between visits (endless.clock: see input.js), so the
// year goes on where it was left. seasonAt(): i (0 hot, 1 rains, 2 cool), code (as seaMode numbers them: 3 hot, 1 rains, 2 cool), day (of the
// season, 1 to 122), k (0..1: how far into the change to the next season), next (its code).
const SEASON_H = 2922, SEA_ORDER = [3, 1, 2], SEA_DRY = [0, 0, 0.25, 0.95], SEA_NAME = ['', 'ฤดูฝน', 'ฤดูหนาว', 'ฤดูร้อน'];
const seasonAt = () => { const H = (dayN + tday) * 24, q = H / SEASON_H, n = floor(q), f = q - n, i = ((n % 3) + 3) % 3;
  return { i, code: SEA_ORDER[i], next: SEA_ORDER[(i + 1) % 3], day: floor(f * SEASON_H / 24) + 1, days: Math.ceil(SEASON_H / 24), k: sm(1 - 72 / SEASON_H, 1, f) }; };
// Set by hand in the sky panel (input.js): tHold keeps the hour where it was put; seaMode 0 lets the season follow the clock, 1 rainy, 2 cool, 3 hot
// and dry; wxS is how strong the weather picked by hand (wxCur 0, its make-up in WXP[0]) is, 0..1.
let tHold = false, seaMode = 0, wxS = 0.5, windSet = -1;      // windSet: -1 the wind as the place and the weather make it, or 0..1 set by hand (0 dead calm .. 1 a gale)
const AT = { dir: [0, 1, 0], sun: [0, 0, 0], amb: [0, 0, 0], zen: [0, 0, 0], hor: [0, 0, 0], ex: 1, night: 0, fog: 0, cover: 0, dry: 0, mist: 0, rain: 0, storm: 0, wet: 0, flash: 0, wind: 1, snow: 0, snowM: 0, snowG: 0, cool: 0 };      // cool: how far it is the cool season, 0..1 - the snowfield is under snow only then      // snowM: snow chosen by hand, anywhere; snowG: how white the ground has gone under it
let wxAuto = true, wxCur = 1, wxNext = 0; const WXP = [[0, 0, 0, 0], [0, 0, 0, 0], [0.62, 0, 0, 0], [0.9, 0.12, 0.35, 0], [1, 0.3, 0.9, 0], [1, 0.3, 1, 1], [0.3, 0.45, 0, 0], [0.5, 1, 0, 0]];      // cover, mist, rain, storm
const LT = { t0: -9, next: 0, az: 0, seed: 0, dist: 1 };
const wxName = () => (AT.storm > 0.5 ? 'ฝนฟ้าคะนอง' : AT.rain > 0.6 ? 'ฝนตกหนัก' : AT.rain > 0.08 ? 'ฝนตกเบา' : AT.snow > 0.3 ? 'หิมะตก' : AT.mist > 0.7 ? 'หมอกหนา' : AT.mist > 0.25 ? 'หมอกบาง' : AT.cover > 0.75 ? 'ฟ้าครึ้ม' : AT.cover > 0.4 ? 'เมฆมาก' : AT.cover < 0.15 && AT.night < 0.5 ? 'แดดจ้า' : 'ฟ้าใส') + (wxAuto ? ' (อัตโนมัติ)' : ' (เลือกเอง)');
function atmos(z) {
  let i = 0; while (i < KEYS.length - 2 && tday >= KEYS[i + 1].t) i++;
  const a = KEYS[i], b = KEYS[i + 1], f = clamp((tday - a.t) / (b.t - a.t), 0, 1);
  for (const k of ['dir', 'sun', 'amb', 'zen', 'hor']) for (let j = 0; j < 3; j++) AT[k][j] = mix(a[k][j], b[k][j], f);
  AT.ex = mix(a.ex, b.ex, f); AT.night = mix(a.night, b.night, f); AT.fog = mix(a.fog, b.fog, f);
  // some nights have no moon
  const moon = AT.night > 0.9 && hash(dayN, 77) < 0.4 ? 0.45 : 1; if (AT.night > 0.9) for (let j = 0; j < 3; j++) { AT.sun[j] *= moon; AT.amb[j] *= moon * 0.75 + 0.25; }
  // weather and season by place
// Weather: clear and glaring, cloud, light or heavy rain, thunderstorms, thin or thick fog. Left to itself (wxAuto) it changes at random
  // every few minutes (clear skies most often, storms and thick fog rarely); Y turns that off and on, R steps to the next kind by hand.
  if (wxAuto && time > wxNext) {          // drawn by lot, the commoner kinds more often; each lasts a minute and a half to four minutes
    const wgt = [0, 7, 3, 1.2, 0.7, 0.4, 1, 0.3]; let r = Math.random() * 13.6; wxCur = 1; while (wxCur < 7 && r > wgt[wxCur]) { r -= wgt[wxCur]; wxCur++; }
    wxNext = time + 90 + Math.random() * 150;
  }
  const P = WXP[wxCur], cv = P[0], ms = P[1], rn = P[2], st = P[3], rate = wxAuto && time > 3 ? 0.002 : 0.03;      // a change of its own comes on slowly
  // Fog left to itself keeps to its hours: thick from the small hours to early morning, burnt off by the sun from half past seven to half past
  // ten, none through the day and the afternoon, coming back slowly late at night - and much less of it in the hot dry season (AT.dry, last
  // frame's). Fog chosen by hand comes whatever the hour.
  const hr = tday * 24, fogK = wxAuto ? (hr < 12 ? 1 - sm(7.5, 10.5, hr) : 0.7 * sm(19, 23.5, hr)) * (1 - 0.6 * sm(0.5, 0.95, AT.dry)) : 1;
  AT.cover += (max(cv, rn) - AT.cover) * rate; AT.mist += (ms * fogK - AT.mist) * rate; AT.rain += (rn - AT.rain) * rate; AT.storm += (st - AT.storm) * rate;
  // the season (see seasonAt): how dry the land is, and whether it is the cool season - chosen by hand in the sky panel, that season throughout
  { const S = seasonAt(); AT.dry = seaMode ? SEA_DRY[seaMode] : mix(SEA_DRY[S.code], SEA_DRY[S.next], S.k); AT.cool = seaMode ? (seaMode === 2 ? 1 : 0) : mix(S.code === 2 ? 1 : 0, S.next === 2 ? 1 : 0, S.k); }
  { const sn = snowW(z) * AT.cool; AT.rain *= 1 - sn; AT.storm *= 1 - sn; AT.snow = sn * sm(0.15, 0.6, AT.cover + 0.25); }       // over the snowfield, in the cool season, it snows instead
  // snow picked in the sky panel falls wherever you are, and settles: the ground whitens while it falls (faster the harder it falls) and goes back slowly after
  AT.snowM += ((P[4] || 0) - AT.snowM) * rate; AT.snow = max(AT.snow, AT.snowM);
  AT.snowG = clamp(AT.snowG + (AT.snowM > 0.05 ? AT.snowM * 0.0015 : -0.0006), 0, 1);
  AT.wet = clamp(AT.wet + (AT.rain > 0.05 ? AT.rain * 0.006 : -0.0005), 0, 1);                 // the road stays wet a while after the rain
  // (AT.dry, set above from the season: green after the rains, just yellowing in the cool, burnt in the hot. The flower fields bloom in the cool
  // season, half of them in the rains, hardly any in the hot - see fbloom in common.wgsl)
  // The mist of early morning (the dawn keys' fog, four times the day's) belongs to damp ground: thick after the rains and in the cool season,
  // all but gone in the hot dry one, when the air is clear from first light (what haze there is then is the day's own).
  if (AT.fog > 0.003) AT.fog = 0.003 + (AT.fog - 0.003) * (1 - 0.85 * sm(0.3, 0.9, AT.dry));
  const over = sm(0.6, 1, AT.cover), grey = (AT.zen[0] + AT.zen[1] + AT.zen[2]) / 3 + (AT.hor[0] + AT.hor[1] + AT.hor[2]) / 6;
  for (let j = 0; j < 3; j++) { AT.sun[j] *= 1 - 0.8 * over; AT.zen[j] = mix(AT.zen[j], grey * 0.9, over * 0.85); AT.hor[j] = mix(AT.hor[j], grey * 1.05, over * 0.7); AT.amb[j] = mix(AT.amb[j], (AT.amb[0] + AT.amb[1] + AT.amb[2]) / 3 * 1.15, over * 0.7); }
  const glare = (1 - sm(0, 0.25, AT.cover)) * (1 - AT.night), dim = 1 - 0.35 * AT.rain - 0.25 * AT.storm;
  for (let j = 0; j < 3; j++) { AT.sun[j] *= (1 + 0.25 * glare) * (1 - 0.6 * AT.rain); AT.amb[j] *= dim; AT.zen[j] *= dim; AT.hor[j] *= dim; }
  AT.ex *= 1 + 0.07 * glare;
  AT.fog += (AT.mist * AT.mist * 0.03 + AT.rain * 0.005) * (1 - AT.night * 0.5);
  // lightning: a flash that flickers twice and dies, somewhere round the sky; thunder follows after a moment
  if (AT.storm > 0.5 && time > LT.next) { LT.t0 = time; LT.next = time + (2 + Math.random() * 10) * (!wxAuto && wxCur === 0 ? 1.7 - 1.2 * wxS : 1); LT.az = Math.random() * TAU; LT.seed = Math.random(); LT.dist = 0.2 + Math.random() * 0.8; if (SND && AC.state === 'running') thunder(AC.currentTime + LT.dist * 2.6, 0.55 * (1.25 - LT.dist)); }
  const le = time - LT.t0; AT.flash = AT.storm > 0.3 && le < 0.7 ? (le < 0.07 ? 1 : le < 0.14 ? 0.2 : le < 0.24 ? 0.85 : max(0, 1 - (le - 0.24) / 0.4) * 0.5) * (1.3 - LT.dist) : 0;
  if (AT.flash > 0) for (let j = 0; j < 3; j++) { const cl = [0.6, 0.66, 0.9][j] * AT.flash; AT.amb[j] += cl * 1.3; AT.zen[j] += cl * 0.3; AT.hor[j] += cl * 0.4; }
  AT.wind = (0.6 + 1.4 * vnoise(z / 700 + 20, 4.4) + 0.5 * over + 1.3 * seaW(z) + 0.6 * AT.rain + 1.2 * AT.storm) * (0.45 + 1.1 * vnoise(time * 0.035, 9.1));   // and it rises and drops as time passes          // the wind changes from place to place; stronger under heavy cloud and by the sea
  if (windSet >= 0) AT.wind += (windSet * 5.5 * (0.85 + 0.3 * vnoise(time * 0.05, 3.3)) - AT.wind) * 1;      // set by hand: steady at that strength, but for a slow breathing of a sixth either way (a wind never blows quite evenly)
  return AT;
}
const seasonName = () => { if (seaMode) return SEA_NAME[seaMode] + ' (เลือกเอง)'; const S = seasonAt(); return `${SEA_NAME[S.code]} วันที่ ${S.day}/${S.days}`; };
const todName = () => (tday < 0.22 || tday >= 0.79 ? 'กลางคืน' : tday < 0.36 ? 'เช้า' : tday < 0.66 ? 'กลางวัน' : 'เย็น');

