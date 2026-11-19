// --------------------------------------------------------------------------------------------------------- sound
// Everything heard is synthesised here, nothing is loaded: wind (rising and falling with the gusts, hissing in the leaves),
// the sea (swell, breakers, foam), birds in the morning where there are trees, cicadas at dusk, crickets after dark,
// dogs barking and howling round houses at night. Sound starts with the first key or click (browsers require that); M mutes.
let AC = null, SND = null;      // (mute, and how loud: gameVol - both in input.js, with the settings panel)
function initSound() {
  if (AC) return; const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
  AC = new C(); const master = AC.createGain(); master.gain.value = mute ? 0 : 0.9 * gameVol; master.connect(AC.destination);
  const fx = AC.createGain(); fx.gain.value = fxVol; fx.connect(master);      // the one-off sounds - thunder, birds, crickets, dogs - go through this, so they can be turned down apart from the steady ones (wind, rain, sea, the car)
  const nb = AC.createBuffer(1, AC.sampleRate * 5, AC.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noise = () => { const n = AC.createBufferSource(); n.buffer = nb; n.loop = true; n.start(0, Math.random() * 4); return n; };
  const band = (src, type, f, q, out = master) => { const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const gn = AC.createGain(); gn.gain.value = 0; src.connect(fl); fl.connect(gn); gn.connect(out); return { f: fl.frequency, g: gn.gain, node: gn }; };
  // cicadas: a narrow band of hiss high up, chopped fast; two of them a little apart in pitch
  const cic = (f, rate) => { const b = band(noise(), 'bandpass', f, 14, AC.createGain()), am = AC.createGain(), lfo = AC.createOscillator(), out = AC.createGain(); b.g.value = 1; am.gain.value = 0.5; lfo.type = 'square'; lfo.frequency.value = rate; const depth = AC.createGain(); depth.gain.value = 0.5; lfo.connect(depth); depth.connect(am.gain); lfo.start(); b.node.connect(am); am.connect(out); out.gain.value = 0; out.connect(master); return out.gain; };
  SND = { master, fx, wind: band(noise(), 'bandpass', 380, 0.5), leaves: band(noise(), 'bandpass', 2600, 0.8), rush: band(noise(), 'lowpass', 300, 0.4),
    nb, rain: band(noise(), 'bandpass', 5200, 0.35), rainLow: band(noise(), 'lowpass', 900, 0.3), sea: band(noise(), 'lowpass', 480, 0.3), foam: band(noise(), 'highpass', 2200, 0.3), cic1: cic(5200, 92), cic2: cic(6100, 71), tBird: 0, tCrick: 0, tDog: 0, vill: 0, tVill: 0 };
}
// one short voice: an oscillator whose pitch follows a list of [time, Hz] and whose loudness follows [time, level]; pan -1..1
function voice(type, t0, fq, env, vol, pan = 0, bp = 0) {
  const o = AC.createOscillator(), gn = AC.createGain(); o.type = type; let last = o;
  o.frequency.setValueAtTime(fq[0][1], t0 + fq[0][0]); for (let i = 1; i < fq.length; i++) o.frequency.exponentialRampToValueAtTime(fq[i][1], t0 + fq[i][0]);
  gn.gain.setValueAtTime(0, t0); for (const e of env) gn.gain.linearRampToValueAtTime(e[1] * vol, t0 + e[0]);
  if (bp) { const fl = AC.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = bp; fl.Q.value = 1.6; o.connect(fl); last = fl; }
  last.connect(gn); let out = gn; if (AC.createStereoPanner) { const pn = AC.createStereoPanner(); pn.pan.value = pan; gn.connect(pn); out = pn; }
  out.connect(SND.fx); const end = t0 + env[env.length - 1][0] + 0.05; o.start(t0); o.stop(end);
}
const rnd = (a, b) => a + Math.random() * (b - a);
function thunder(t, vol) {      // a crack that falls away into a long rumble
  const n = AC.createBufferSource(), f = AC.createBiquadFilter(), gn = AC.createGain(); n.buffer = SND.nb; n.loop = true; f.type = 'lowpass';
  f.frequency.setValueAtTime(1100, t); f.frequency.exponentialRampToValueAtTime(70, t + 2.4);
  gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + 0.04); gn.gain.linearRampToValueAtTime(vol * 0.35, t + 0.5); gn.gain.linearRampToValueAtTime(vol * 0.55, t + 1.2); gn.gain.linearRampToValueAtTime(0, t + 4.8);
  n.connect(f); f.connect(gn); gn.connect(SND.fx); n.start(t, Math.random() * 3); n.stop(t + 5);
}
function birdCall(t, vol) {
  const k = Math.random(), pan = rnd(-0.9, 0.9);
  if (k < 0.3) {            // a koel: pairs of rising whistles, each pair higher and more urgent
    const n = 3 + floor(rnd(0, 4)); for (let i = 0; i < n; i++) { const f = 720 * (1 + i * 0.07), a = t + i * 0.62; voice('sine', a, [[0, f], [0.14, f], [0.36, f * 1.42]], [[0.03, 1], [0.3, 0.8], [0.42, 0]], vol * 0.5, pan); }
  } else if (k < 0.5) {     // a dove: three soft low coos
    for (let i = 0; i < 3; i++) { const a = t + i * 0.36 + (i === 2 ? 0.1 : 0); voice('sine', a, [[0, 470], [0.12, 520], [0.26, 440]], [[0.05, 1], [0.2, 0.8], [0.3, 0]], vol * 0.45, pan); }
  } else if (k < 0.8) {     // a small bird: a run of quick chirps, each a sweep
    const n = 2 + floor(rnd(0, 4)), f0 = rnd(2100, 3400), up = Math.random() < 0.5 ? 1.5 : 0.62, gap = rnd(0.16, 0.3);
    for (let i = 0; i < n; i++) { const a = t + i * gap, f = f0 * rnd(0.9, 1.1); voice('sine', a, [[0, f], [0.11, f * up]], [[0.015, 1], [0.09, 0.7], [0.13, 0]], vol * 0.3, pan); }
  } else {                  // a bulbul-like phrase: a few liquid notes of different pitch
    let a = t; for (let i = 0; i < 4 + floor(rnd(0, 3)); i++) { const f = rnd(1700, 3300), d = rnd(0.08, 0.16); voice('sine', a, [[0, f], [d * 0.5, f * rnd(0.8, 1.25)], [d, f * rnd(0.85, 1.2)]], [[0.01, 1], [d * 0.8, 0.8], [d + 0.02, 0]], vol * 0.33, pan); a += d + rnd(0.02, 0.09); }
  }
}
function cricket(t, vol) {      // a chirp of three or four quick pulses
  const f = rnd(4100, 4900), pan = rnd(-1, 1), n = 3 + floor(rnd(0, 2));
  for (let i = 0; i < n; i++) voice('sine', t + i * 0.034, [[0, f], [0.02, f * 1.01]], [[0.004, 1], [0.016, 0.9], [0.024, 0]], vol * 0.16, pan);
}
// Dogs. A voice is not a buzzing tone that slides in pitch (which is how these first sounded: like a toy): it is a rough, breathy source shaped by
// the mouth. So each sound is made of a harsh tone and a breath of noise together, passed through two resonances that stand for the mouth (they
// open as the bark opens), roughened by a fast flutter, and then - since these dogs are somewhere off in the dark - dulled by distance and
// followed by a faint echo off the houses.
function dogOut(pan, far) {      // far: 0.35 (a long way off) .. 1 (near)
  const lp = AC.createBiquadFilter(), g = AC.createGain(), dl = AC.createDelay(0.5), dg = AC.createGain(); lp.type = 'lowpass'; lp.frequency.value = 600 + 1300 * far * far; lp.Q.value = 0.5; g.gain.value = 1;      // (always a long way off: dull, the edges gone)
  dl.delayTime.value = 0.21 + 0.2 * (1 - far); dg.gain.value = 0.2 + 0.15 * (1 - far);
  lp.connect(g); lp.connect(dl); dl.connect(dg); dg.connect(g);      // (the echo comes back more than once, fading: open country and house walls)
  let out = g; if (AC.createStereoPanner) { const pn = AC.createStereoPanner(); pn.pan.value = pan; g.connect(pn); out = pn; }
  out.connect(SND.fx); return lp;
}
// Howls, shaped after a recording of village dogs howling at night that was measured (pitch, length and overtones of each howl; none of the
// recording itself is used). What the measurements showed, against what had been guessed: the note is almost a pure tone - the second overtone
// a tenth to a third as strong as the note, the rest next to nothing - not a harsh buzzing one; it does not waver (under 1 %); it does not climb
// slowly from far below - it starts close under its note, reaches its highest about a fifth of the way in (a tenth or so up), and from there
// sinks slowly, a sixth to a quarter lower by the end, dropping away in the last moments; the notes lie between 350 and 560 Hz and last one to
// three seconds. Now and then one starts with a yelp far above and falls onto its note within half a second.
function howl(t, f, d, vol, dest) {      // one howl: f its highest held note (Hz), d its length (s)
  const o = AC.createOscillator(), o2 = AC.createOscillator(), g2 = AC.createGain(), n = AC.createBufferSource(), ng = AC.createGain(), nf = AC.createBiquadFilter(), env = AC.createGain();
  const yelp = Math.random() < 0.15, tp = t + d * (0.15 + Math.random() * 0.1), fall = 0.76 + Math.random() * 0.1;
  for (const [x, k] of [[o, 1], [o2, 2]]) { const F = x.frequency;
    if (yelp) { F.setValueAtTime(f * 1.55 * k, t); F.exponentialRampToValueAtTime(f * k, t + 0.4); }
    else { F.setValueAtTime(f * 0.88 * k, t); F.exponentialRampToValueAtTime(f * k, tp); }
    F.linearRampToValueAtTime(f * (fall + 0.08) * k, t + d * 0.6); F.linearRampToValueAtTime(f * fall * k, t + d * 0.86); F.exponentialRampToValueAtTime(f * fall * 0.7 * k, t + d); }
  o.type = 'sine'; o2.type = 'sine'; g2.gain.value = 0.12 + Math.random() * 0.15;
  n.buffer = SND.nb; n.loop = true; nf.type = 'bandpass'; nf.frequency.value = f * 1.5; nf.Q.value = 2; ng.gain.value = 0.03;      // a little breath
  env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(vol, t + (yelp ? 0.05 : 0.18)); env.gain.linearRampToValueAtTime(vol * 0.8, t + d * 0.7); env.gain.linearRampToValueAtTime(0, t + d);
  o.connect(env); o2.connect(g2); g2.connect(env); n.connect(nf); nf.connect(ng); ng.connect(env); env.connect(dest);
  for (const x of [o, o2]) { x.start(t); x.stop(t + d + 0.05); } n.start(t, Math.random() * 3); n.stop(t + d + 0.05);
}
// Barks, likewise shaped after a measured recording of dogs barking (nothing of the recording is used). A bark heard across a village turned out
// to be nothing like the harsh falling buzz first guessed: it is a short clear yelp of a note, 0.11 to 0.15 s long, loudest 0.03 s in; its pitch
// RISES through it, from about 450 Hz to 550-600; nearly all its sound lies in a narrow band about that note, with a weaker overtone an octave
// up and a trace of the next. They come in runs, about 0.27 s from one to the next, with pauses of a second or so between runs; and now and
// then one is drawn out for half a second, holding its note and sagging a little.
function bark(t, f, d, vol, dest) {      // one bark: f the note it ends on (Hz), d its length (s)
  const env = AC.createGain(), long = d > 0.25;
  env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(vol, t + 0.03); env.gain.linearRampToValueAtTime(vol * (long ? 0.8 : 0.45), t + d * 0.6); env.gain.linearRampToValueAtTime(0, t + d);
  for (const [k, g] of [[1, 1], [2, 0.32], [3, 0.1]]) { const o = AC.createOscillator(), og = AC.createGain(), F = o.frequency; o.type = 'sine'; og.gain.value = g;
    F.setValueAtTime(f * 0.78 * k, t); F.exponentialRampToValueAtTime(f * 0.95 * k, t + Math.min(0.05, d * 0.4));
    if (long) { F.linearRampToValueAtTime(f * k, t + d * 0.4); F.linearRampToValueAtTime(f * 0.9 * k, t + d); } else F.linearRampToValueAtTime(f * 1.04 * k, t + d);
    o.connect(og); og.connect(env); o.start(t); o.stop(t + d + 0.03); }
  const n = AC.createBufferSource(), nf = AC.createBiquadFilter(), ng = AC.createGain(); n.buffer = SND.nb; n.loop = true; nf.type = 'bandpass'; nf.frequency.value = f * 2; nf.Q.value = 1.5; ng.gain.value = 0.12;      // a little breath at the start
  ng.gain.setValueAtTime(0.25, t); ng.gain.linearRampToValueAtTime(0.04, t + 0.05); n.connect(nf); nf.connect(ng); ng.connect(env); n.start(t, Math.random() * 3); n.stop(t + d + 0.03);
  env.connect(dest);
}
function barks(t, v, dest) {      // a dog barking: one to three runs of two to five barks, all on its own note
  const f = rnd(520, 620); let a = t;
  for (let r = 0, nr = 1 + floor(rnd(0, 2.6)); r < nr; r++) { const n = 2 + floor(rnd(0, 4));
    for (let i = 0; i < n; i++) { const long = Math.random() < 0.08, d = long ? rnd(0.35, 0.7) : rnd(0.11, 0.15); bark(a, f * rnd(0.95, 1.06) * (long ? 0.88 : 1), d, v * rnd(0.75, 1), dest); a += long ? d + 0.15 : rnd(0.24, 0.31); }
    a += rnd(0.6, 1.3); }
}
// One dog at a time, doing one thing: barking (three times in five) or howling - never one over the other, which made a muddle.
// test: played at once and plainly, for listening to (keys B: a howl, N: barking).
function dogVoice(t, vol, test = '') {
  const pan = test ? 0 : rnd(-0.9, 0.9), far = test ? 1 : rnd(0.35, 1), dest = dogOut(pan, far), v = test ? 0.5 : vol * (0.35 + 0.65 * far) * 0.3;
  if (test === 'bark' || (!test && Math.random() < 0.6)) { barks(t, v * 0.6, dest); return; }
  let a = t; for (let i = 0, n = 1 + floor(rnd(0, 2)); i < n; i++) { const d = rnd(1.4, 3); howl(a, rnd(360, 560), d, v * 0.5, dest); a += d + rnd(0.6, 1.9); }
}
function updateSound(dt) {
  if (!SND || AC.state !== 'running') { if (AC && AC.state === 'suspended') AC.resume(); return; }
  const t = AC.currentTime, px = fly.on ? fly.x : car.x, pz = fly.on ? fly.z : car.z, set = (prm, v, tc = 0.25) => prm.setTargetAtTime(v, t, tc);
  const hl = hillW(pz), tn = townW(pz), sea = seaW(pz), trees = clamp(0.45 + 0.55 * hl - 0.3 * tn - 0.2 * sea, 0.1, 1);
  // wind: the same gusts that move the trees, heard as they pass
  const gs = vnoise(px * 0.02 - time * 0.35, pz * 0.02 - time * 0.22), w = AT.wind * (0.35 + 1.1 * gs);
  const out = 1 - 0.85 * coverK;          // in a tunnel or under an underpass the wind, the leaves and the rain are shut out, and the car's own noise comes back off the walls
  set(SND.wind.g, (0.003 + 0.011 * w * w * 0.5) * out, 0.5); set(SND.wind.f, 140 + 90 * w, 0.5);
  set(SND.leaves.g, 0.004 * w * w * trees * 0.5 * out, 0.4); set(SND.leaves.f, 2200 + 500 * w);
  const sp = fly.on ? 0 : abs(car.v); set(SND.rush.g, 0.0004 * sp * sp ** 0.5 * (1 + 1.6 * coverK), 0.15); set(SND.rush.f, 180 + sp * 14, 0.15);      // air and tyres at speed
  // the sea: each swell builds, breaks and hisses back down the sand
  let sv = 0; if (sea > 0.01) { const d = shoreX(pz) - (px - roadX(pz)); sv = sea * clamp(1 - max(d, 0) / 150, 0, 1) ** 2; }
  const ph1 = time * 0.85 + sin(time * 0.23) * 1.3, sw = Math.pow(0.5 + 0.5 * sin(ph1), 2.2), fm = Math.pow(0.5 + 0.5 * sin(ph1 - 0.9), 4);
  set(SND.sea.g, sv * (0.07 + 0.2 * sw), 0.3); set(SND.sea.f, 300 + 600 * sw, 0.3); set(SND.foam.g, sv * (0.008 + 0.05 * fm), 0.3);
  // what hour it is: morning, dusk, dark
  const bump = (c, wd) => max(0, 1 - abs(tday - c) / wd), calm = (1 - 0.6 * AT.mist) * (1 - AT.rain);
  set(SND.rain.g, 0.05 * AT.rain * out, 0.5); set(SND.rainLow.g, 0.09 * AT.rain * AT.rain * (1 - 0.6 * coverK), 0.5);
  const morning = max(bump(0.31, 0.11), 0.1 * (1 - AT.night) * bump(0.5, 0.3)), dusk = bump(0.71, 0.09), dark = AT.night;
  const cicV = dusk * trees * calm * (0.7 + 0.3 * sin(time * 0.4));
  set(SND.cic1, 0.05 * cicV, 0.8); set(SND.cic2, 0.035 * cicV * (0.5 + 0.5 * sin(time * 0.17 + 2)), 0.8);
  if (morning * trees * calm > 0.05 && t > SND.tBird) { birdCall(t + 0.05, 0.5 * (0.4 + 0.6 * morning) * trees); SND.tBird = t + rnd(0.3, 2.6) / (0.25 + morning * trees); }
  const crk = sm(0.5, 0.95, dark) * (1 - 0.7 * tn);
  if (crk > 0.1 && t > SND.tCrick) { cricket(t + 0.03, crk * 0.7); SND.tCrick = t + rnd(0.3, 1.4) / crk; }
  // houses near? (the town, or a house on the plain within earshot) - then at night the dogs
  if (t > SND.tVill) { SND.tVill = t + 1; let v = tn; for (const c of chunks.values()) if (c.house) { const d = hypot(c.house[0] - px, c.house[2] - pz); v = max(v, 1 - d / 220); } SND.vill = v; }
  SND.info = 'เสียง: ลม ' + (w < 0.8 ? 'เบา' : w < 1.8 ? 'ปานกลาง' : 'แรง') + (AT.rain > 0.05 ? ' · ฝน' : '') + (AT.storm > 0.5 ? ' · ฟ้าร้อง' : '') + (sv > 0.05 ? ' · คลื่นทะเล' : '') + (morning * trees * calm > 0.05 ? ' · นก' : '') + (cicV > 0.1 ? ' · จักจั่น' : '') + (crk > 0.1 ? ' · จิ้งหรีด' : '') + (dark > 0.6 && SND.vill > 0.1 ? ' · หมา' : '') + (mute ? ' (ปิดเสียงอยู่)' : '');
  if (dark > 0.6 && SND.vill > 0.1) { if (!SND.tDog) SND.tDog = t + rnd(1, 5); if (t > SND.tDog) { dogVoice(t + 0.05, SND.vill); SND.tDog = t + rnd(14, 45); } } else SND.tDog = 0;
}
