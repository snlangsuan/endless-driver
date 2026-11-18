// --------------------------------------------------------------------------------------------------------- time of day
// The day passes on its own (one day = 12 minutes; T jumps ahead), and the weather and the season change with the distance
// driven, on their own rhythms. So coming round to the same kind of place again, it is another hour, another sky, another season.
const DAY = [0.42, 0.85, 0.3], NOON = [0.3, 0.88, -0.38], EVE = [0.85, 0.2, -0.45], DAWN = [0.7, 0.32, 0.5], MOON = [-0.4, 0.75, 0.4];
const NIGHT = { dir: MOON, sun: [0.11, 0.14, 0.21], amb: [0.018, 0.026, 0.046], zen: [0.004, 0.008, 0.02], hor: [0.012, 0.018, 0.035], ex: 2.0, night: 1, fog: 0.0021 };
const KEYS = [
  { t: 0.00, ...NIGHT }, { t: 0.21, ...NIGHT },
  { t: 0.25, dir: DAWN, sun: [0, 0, 0], amb: [0.05, 0.06, 0.09], zen: [0.03, 0.05, 0.12], hor: [0.20, 0.14, 0.12], ex: 1.6, night: 0.6, fog: 0.006 },
  { t: 0.31, dir: DAWN, sun: [2.4, 1.9, 1.35], amb: [0.42, 0.46, 0.52], zen: [0.30, 0.42, 0.62], hor: [0.80, 0.80, 0.80], ex: 0.9, night: 0, fog: 0.009 },
  { t: 0.42, dir: DAY, sun: [3.2, 2.95, 2.5], amb: [0.46, 0.54, 0.68], zen: [0.14, 0.32, 0.76], hor: [0.72, 0.82, 0.95], ex: 0.82, night: 0, fog: 0.0021 },
  { t: 0.60, dir: NOON, sun: [3.2, 2.95, 2.5], amb: [0.46, 0.54, 0.68], zen: [0.14, 0.32, 0.76], hor: [0.72, 0.82, 0.95], ex: 0.82, night: 0, fog: 0.0021 },
  { t: 0.72, dir: EVE, sun: [3.3, 1.55, 0.6], amb: [0.26, 0.26, 0.36], zen: [0.11, 0.19, 0.46], hor: [0.95, 0.56, 0.30], ex: 1.15, night: 0, fog: 0.003 },
  { t: 0.77, dir: EVE, sun: [0, 0, 0], amb: [0.05, 0.05, 0.08], zen: [0.03, 0.04, 0.10], hor: [0.22, 0.12, 0.08], ex: 1.6, night: 0.6, fog: 0.003 },
  { t: 0.81, ...NIGHT }, { t: 1.00, ...NIGHT },
];
let tday = 0.44, dayN = 0, headOn = -1;       // headOn: -1 automatic, 0 off, 1 on
const AT = { dir: [0, 1, 0], sun: [0, 0, 0], amb: [0, 0, 0], zen: [0, 0, 0], hor: [0, 0, 0], ex: 1, night: 0, fog: 0, cover: 0, dry: 0, mist: 0, rain: 0, storm: 0, wet: 0, flash: 0, wind: 1, snow: 0 };
let wxAuto = true, wxCur = 1, wxNext = 0; const WXP = [0, [0, 0, 0, 0], [0.62, 0, 0, 0], [0.9, 0.12, 0.35, 0], [1, 0.3, 0.9, 0], [1, 0.3, 1, 1], [0.3, 0.45, 0, 0], [0.5, 1, 0, 0]];      // cover, mist, rain, storm
const LT = { t0: -9, next: 0, az: 0, seed: 0, dist: 1 };
const wxName = () => (AT.storm > 0.5 ? 'ฝนฟ้าคะนอง' : AT.rain > 0.6 ? 'ฝนตกหนัก' : AT.rain > 0.08 ? 'ฝนตกเบา' : AT.snow > 0.3 ? 'หิมะตก' : AT.mist > 0.7 ? 'หมอกหนา' : AT.mist > 0.25 ? 'หมอกบาง' : AT.cover > 0.75 ? 'ฟ้าครึ้ม' : AT.cover > 0.4 ? 'เมฆมาก' : AT.cover < 0.15 && AT.night < 0.5 ? 'แดดจ้า' : 'ฟ้าใส') + (wxAuto ? ' (สุ่ม)' : ' (เลือกเอง)');
function atmos(z) {
  let i = 0; while (i < KEYS.length - 2 && tday >= KEYS[i + 1].t) i++;
  const a = KEYS[i], b = KEYS[i + 1], f = clamp((tday - a.t) / (b.t - a.t), 0, 1);
  for (const k of ['dir', 'sun', 'amb', 'zen', 'hor']) for (let j = 0; j < 3; j++) AT[k][j] = mix(a[k][j], b[k][j], f);
  AT.ex = mix(a.ex, b.ex, f); AT.night = mix(a.night, b.night, f); AT.fog = mix(a.fog, b.fog, f);
  // some nights have no moon
  const moon = AT.night > 0.9 && hash(dayN, 77) < 0.4 ? 0.04 : 1; if (AT.night > 0.9) for (let j = 0; j < 3; j++) { AT.sun[j] *= moon; AT.amb[j] *= moon * 0.75 + 0.25; }
  // weather and season by place
// Weather: clear and glaring, cloud, light or heavy rain, thunderstorms, thin or thick fog. Left to itself (wxAuto) it changes at random
  // every few minutes; Y turns that off and on, R steps to the next kind by hand.
  if (wxAuto && time > wxNext) {          // drawn by lot, the commoner kinds more often; each lasts a minute and a half to four minutes
    const wgt = [0, 3, 3, 2, 1.5, 1, 1.5, 1]; let r = Math.random() * 13; wxCur = 1; while (wxCur < 7 && r > wgt[wxCur]) { r -= wgt[wxCur]; wxCur++; }
    wxNext = time + 90 + Math.random() * 150;
  }
  const P = WXP[wxCur], cv = P[0], ms = P[1], rn = P[2], st = P[3], rate = wxAuto && time > 3 ? 0.002 : 0.03;      // a change of its own comes on slowly
  AT.cover += (max(cv, rn) - AT.cover) * rate; AT.mist += (ms - AT.mist) * rate; AT.rain += (rn - AT.rain) * rate; AT.storm += (st - AT.storm) * rate;
  { const sn = snowW(z); AT.rain *= 1 - sn; AT.storm *= 1 - sn; AT.snow = sn * sm(0.15, 0.6, AT.cover + 0.25); }       // over the snowfield it snows instead
  AT.wet = clamp(AT.wet + (AT.rain > 0.05 ? AT.rain * 0.006 : -0.0005), 0, 1);                 // the road stays wet a while after the rain
  AT.dry = sm(0.35, 0.7, vnoise(z / 5200 + 9, 1.7));
  if (chyAt(z)) { const q = z / SEG - floor(z / SEG); AT.dry = mix(AT.dry, 0.22, sm(0, 0.06, q) * sm(1, 0.94, q)); }      // the cherries flower in the cool season: the grass still green, only just beginning to yellow
  const over = sm(0.6, 1, AT.cover), grey = (AT.zen[0] + AT.zen[1] + AT.zen[2]) / 3 + (AT.hor[0] + AT.hor[1] + AT.hor[2]) / 6;
  for (let j = 0; j < 3; j++) { AT.sun[j] *= 1 - 0.8 * over; AT.zen[j] = mix(AT.zen[j], grey * 0.9, over * 0.85); AT.hor[j] = mix(AT.hor[j], grey * 1.05, over * 0.7); AT.amb[j] = mix(AT.amb[j], (AT.amb[0] + AT.amb[1] + AT.amb[2]) / 3 * 1.15, over * 0.7); }
  const glare = (1 - sm(0, 0.25, AT.cover)) * (1 - AT.night), dim = 1 - 0.35 * AT.rain - 0.25 * AT.storm;
  for (let j = 0; j < 3; j++) { AT.sun[j] *= (1 + 0.25 * glare) * (1 - 0.6 * AT.rain); AT.amb[j] *= dim; AT.zen[j] *= dim; AT.hor[j] *= dim; }
  AT.ex *= 1 + 0.07 * glare;
  AT.fog += (AT.mist * AT.mist * 0.03 + AT.rain * 0.005) * (1 - AT.night * 0.5);
  // lightning: a flash that flickers twice and dies, somewhere round the sky; thunder follows after a moment
  if (AT.storm > 0.5 && time > LT.next) { LT.t0 = time; LT.next = time + 2 + Math.random() * 10; LT.az = Math.random() * TAU; LT.seed = Math.random(); LT.dist = 0.2 + Math.random() * 0.8; if (SND && AC.state === 'running') thunder(AC.currentTime + LT.dist * 2.6, 0.55 * (1.25 - LT.dist)); }
  const le = time - LT.t0; AT.flash = AT.storm > 0.3 && le < 0.7 ? (le < 0.07 ? 1 : le < 0.14 ? 0.2 : le < 0.24 ? 0.85 : max(0, 1 - (le - 0.24) / 0.4) * 0.5) * (1.3 - LT.dist) : 0;
  if (AT.flash > 0) for (let j = 0; j < 3; j++) { const cl = [0.6, 0.66, 0.9][j] * AT.flash; AT.amb[j] += cl * 1.3; AT.zen[j] += cl * 0.3; AT.hor[j] += cl * 0.4; }
  AT.wind = (0.6 + 1.4 * vnoise(z / 700 + 20, 4.4) + 0.5 * over + 1.3 * seaW(z) + 0.6 * AT.rain + 1.2 * AT.storm) * (0.45 + 1.1 * vnoise(time * 0.035, 9.1));   // and it rises and drops as time passes          // the wind changes from place to place; stronger under heavy cloud and by the sea
  return AT;
}
const todName = () => (tday < 0.22 || tday >= 0.79 ? 'กลางคืน' : tday < 0.36 ? 'เช้า' : tday < 0.66 ? 'กลางวัน' : 'เย็น');

