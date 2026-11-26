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
  // The tyres in a drift, made after a recording of one (its engine left out): not a clean note, nor hiss either, but a rough band about
  // 850 Hz as wide as a hand, wandering up and down by a hundred or so, with a second near 1.5 kHz that comes and goes over seconds, and a
  // faint scrub above to 3 kHz - made of a saw-tooth note and hiss cut to the same band together. (Hiss cut to narrow bands at 1-2 kHz alone,
  // as first made, sounded like wind whistling; a clean note alone, like a siren. Balanced as the recording is: the 1.5 kHz band 8 dB under
  // the main one, the scrub 13.)
  const squeal = (vr, fr) => { const o = AC.createOscillator(), vib = AC.createOscillator(), vd = AC.createGain(), bp = AC.createBiquadFilter(), am = AC.createGain(), fl = AC.createOscillator(), fd = AC.createGain(), out = AC.createGain();
    o.type = 'sawtooth'; o.frequency.value = 800; vib.frequency.value = vr; vd.gain.value = 22; vib.connect(vd); vd.connect(o.frequency);
    bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 1.4; am.gain.value = 0.7; fl.type = 'triangle'; fl.frequency.value = fr; fd.gain.value = 0.3; fl.connect(fd); fd.connect(am.gain);
    out.gain.value = 0; o.connect(bp); bp.connect(am); am.connect(out); out.connect(master); o.start(); vib.start(); fl.start(); return { f: o.frequency, g: out.gain, bp: bp.frequency }; };
  SND = { master, fx, tq1: squeal(23, 31), tq2: squeal(17, 43), wind: band(noise(), 'bandpass', 380, 0.5), leaves: band(noise(), 'bandpass', 2600, 0.8), rush: band(noise(), 'lowpass', 300, 0.4),
    nb, rain: band(noise(), 'bandpass', 5200, 0.35), rainLow: band(noise(), 'lowpass', 900, 0.3), sea: band(noise(), 'lowpass', 480, 0.3), foam: band(noise(), 'highpass', 2200, 0.3), cic1: cic(5200, 92), cic2: cic(6100, 71), spray: band(noise(), 'highpass', 2600, 0.4), sq1: band(noise(), 'bandpass', 850, 5), sq2: band(noise(), 'bandpass', 1500, 6), sqLow: band(noise(), 'bandpass', 2600, 1.2), gut: band(noise(), 'lowpass', 140, 0.8), tBird: 0, tCrick: 0, tDog: 0, vill: 0, tVill: 0 };
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
// A wheel dropping into a gutter (down) or climbing out of it: a dull thud - a short low note falling away - and the clack of the tyre on the edge.
function gutThump(k, down) {
  if (!SND || AC.state !== 'running') return; const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain(), n = AC.createBufferSource(), f = AC.createBiquadFilter(), ng = AC.createGain();
  // (a thud pitched up into what small speakers can play - at 45-95 Hz it went unheard on a laptop - with a clack of the tyre on the edge over it)
  o.type = 'triangle'; o.frequency.setValueAtTime(down ? 190 : 230, t); o.frequency.exponentialRampToValueAtTime(down ? 85 : 110, t + 0.16);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18 * k, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22); o.connect(g); g.connect(SND.master); o.start(t); o.stop(t + 0.25);
  n.buffer = SND.nb; f.type = 'bandpass'; f.frequency.value = down ? 900 : 1300; f.Q.value = 1.2; ng.gain.setValueAtTime(0.22 * k, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  n.connect(f); f.connect(ng); ng.connect(SND.master); n.start(t, Math.random() * 4); n.stop(t + 0.1);
}
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
  for (let i = 0; i < n; i++) voice('sine', t + i * 0.034, [[0, f], [0.02, f * 1.01]], [[0.004, 1], [0.016, 0.9], [0.024, 0]], vol * 0.08, pan);      // (at 0.16 they stood out over everything else at night)
}
// Dogs. A voice is not a buzzing tone that slides in pitch (which is how these first sounded: like a toy): it is a rough, breathy source shaped by
// the mouth. So each sound is made of a harsh tone and a breath of noise together, passed through two resonances that stand for the mouth (they
// open as the bark opens), roughened by a fast flutter, and then - since these dogs are somewhere off in the dark - dulled by distance and
// followed by a faint echo off the houses.
function dogOut(pan, far, echo = 1) {      // far: 0.35 (a long way off) .. 1 (near); echo: 0 for none (barks are dry)
  const lp = AC.createBiquadFilter(), g = AC.createGain(), dl = AC.createDelay(0.5), dg = AC.createGain(); lp.type = 'lowpass'; lp.frequency.value = 600 + 1300 * far * far; lp.Q.value = 0.5; g.gain.value = 1;      // (always a long way off: dull, the edges gone)
  dl.delayTime.value = 0.21 + 0.2 * (1 - far); dg.gain.value = (0.2 + 0.15 * (1 - far)) * echo;
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
// Barks. Five ways of making a bark out of tones and noise were tried, each tuned until it measured like a recording of village dogs - as long,
// as high, as rough, as noisy - and each was something else to the ear: a beep, a ghost, a seal. What makes a bark a bark is in finer detail
// than such measures hold. So the barks are no longer made up: eight real ones are written down closely (barkdata.js - 26 narrow bands, level
// and phase of each 200 times a second) and built again from those numbers, once, the first time a dog barks. A dog's own voice is that
// played a little faster or slower.
let BARKB = null;
function barkBufs() {
  if (BARKB) return BARKB; BARKB = []; if (typeof BARK_DATA === 'undefined') return BARKB;
  const D = BARK_DATA, sr = AC.sampleRate;
  for (const s of D.barks) { const raw = atob(s), nf = raw.length / (D.nb * 2), n = floor((nf - 1) / D.fr * sr), buf = AC.createBuffer(1, n, sr), o = buf.getChannelData(0), re = new Float32Array(nf), im = new Float32Array(nf);
    for (let b = 0; b < D.nb; b++) { const w = TAU * (D.f0 + D.bw * b) / sr;
      for (let f = 0; f < nf; f++) { const k = (b * nf + f) * 2, x = raw.charCodeAt(k), y = raw.charCodeAt(k + 1); re[f] = (x > 127 ? x - 256 : x) / 127; im[f] = (y > 127 ? y - 256 : y) / 127; }
      for (let i = 0; i < n; i++) { const x = i * D.fr / sr, f = floor(x), u = x - f, g = min(f + 1, nf - 1); o[i] += (re[f] + (re[g] - re[f]) * u) * cos(w * i) - (im[f] + (im[g] - im[f]) * u) * sin(w * i); } }
    let m = 0; for (let i = 0; i < n; i++) m = max(m, abs(o[i])); for (let i = 0; i < n; i++) o[i] /= m || 1;
    BARKB.push(buf); }
  return BARKB;
}
function bark(t, k0, vol, dest) {      // one bark: k0 this dog's own voice (1 = as written down; higher is a smaller dog)
  const B = barkBufs(); if (!B.length) return 0; const buf = B[floor(Math.random() * B.length)], src = AC.createBufferSource(), g = AC.createGain();
  src.buffer = buf; src.playbackRate.value = k0; g.gain.value = vol * 1.3; src.connect(g); g.connect(dest); src.start(t); return buf.duration / k0;
}
// A dog barking, in the rhythm measured: runs of barks 0.2 to 0.47 s from one to the next (most often 0.29) - usually two or three to a run,
// now and then as many as ten - and between runs a pause of two thirds of a second to a few seconds. One to three runs, all in its own voice.
function barks(t, v, dest) {
  const k0 = rnd(0.9, 1.1); let a = t;
  for (let r = 0, nr = 1 + floor(rnd(0, 2.6)); r < nr; r++) { let n = 1; while (n < 10 && Math.random() < 0.66) n++;
    for (let i = 0; i < n; i++) { bark(a, k0 * rnd(0.97, 1.03), v * rnd(0.75, 1), dest); a += 0.2 + 0.27 * Math.pow(Math.random(), 1.6); }
    a += rnd(0.5, 1.6); }
}
// One dog at a time, doing one thing: barking (three times in five) or howling - never one over the other, which made a muddle.
// test ('howl' or 'bark'): played at once and plainly, for listening to (no key calls it now).
function dogVoice(t, vol, test = '') {
  const isBark = test === 'bark' || (!test && Math.random() < 0.6), pan = test ? 0 : rnd(-0.9, 0.9), far = test ? 1 : rnd(0.35, 1), dest = dogOut(pan, far, isBark ? 0 : 1), v = test ? 0.5 : vol * (0.35 + 0.65 * far) * 0.3;
  if (isBark) { barks(t, v * 0.6, dest); return; }
  let a = t; for (let i = 0, n = 1 + floor(rnd(0, 2)); i < n; i++) { const d = rnd(1.4, 3); howl(a, rnd(360, 560), d, v * 0.5, dest); a += d + rnd(0.6, 1.9); }
}
const TQ = 0.053, SQ1 = 0.48, SQ2 = 0.3, SQ3 = 0.045;      // (the drift's levels: see initSound)
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
  // The tyres, sliding: a screech as the car goes sideways - two narrow bands of hiss up at 1 to 2 kHz, wavering as the rubber grips and lets go,
  // (The levels are high because the bands are narrow: a band a hundred hertz wide keeps a few per cent of the hiss it is cut from - at the
  // first levels the screech was all but lost under the wind.)
  // over a lower scrubbing roar - loudest well into a drift and at speed, faint on dirt; and the rumble of a wheel run along a gutter, beating
  // on the joints of the channel's sections as the wheel runs over them.
  // (On a wet road the tyres hardly screech - the water takes it - and hiss through the spray instead, the more so sideways; on snow a duller,
  // lower scrub.)
  const wt = AT.wet || 0, slick = 1 - (car.grip === undefined ? 1 : car.grip), snowy = max(0, slick - 0.3 * wt) / 0.55;
  set(SND.spray.g, fly.on ? 0 : wt * 0.0009 * sp * (1 + 2.5 * abs(Math.sin(car.slip || 0))) * (1 - 0.7 * coverK), 0.1);
  { const sl = fly.on ? 0 : abs(Math.sin(car.slip || 0)), on = typeof onRoad === 'undefined' || onRoad ? 1 : 0.2, k = sm(0.1, 0.55, sl) * sm(3, 12, sp) * on * (1 - 0.65 * wt) * (1 - 0.5 * snowy), wob = vnoise(time * 7.3, 3.1) - 0.5, wob2 = vnoise(time * 11.1, 7.7) - 0.5;
    // (A drift's screech swells in over about half a second as the slide builds - it came in at full strength at once - and dies away quickly
    // when the slide is caught, so that the next one swells in again.)
    SND.dOn = k > 0.05 ? min(1, (SND.dOn || 0) + dt / 0.6) : max(0, (SND.dOn || 0) - dt / 0.3); const kd = k * sm(0, 1, SND.dOn);
    const cen = (830 + 220 * (vnoise(time * 1.1, 5.5) - 0.5) + 50 * wob + 70 * sl) * (1 - 0.35 * snowy), on15 = 0.25 + 0.75 * sm(0.4, 0.65, vnoise(time * 0.3, 9.1));
    set(SND.tq1.g, TQ * kd * (0.8 + 0.4 * wob2), 0.05); set(SND.tq1.f, cen, 0.04); set(SND.tq1.bp, cen * 1.15, 0.1);
    set(SND.tq2.g, TQ * 0.6 * kd * on15, 0.05); set(SND.tq2.f, cen * 1.012 + 15 * wob2, 0.04); set(SND.tq2.bp, cen * 1.8, 0.1);
    set(SND.sq1.g, SQ1 * kd * (0.8 + 0.4 * wob2), 0.06); set(SND.sq1.f, cen, 0.05);
    set(SND.sq2.g, SQ2 * kd * on15, 0.06); set(SND.sq2.f, cen * 1.8, 0.05);
    set(SND.sqLow.g, SQ3 * kd * (1 - 0.5 * snowy), 0.08);
    set(SND.gut.g, fly.on ? 0 : 0.4 * (car.gut || 0) * sm(2, 10, sp) * (0.7 + 0.3 * sin(time * sp * 3.1)), 0.03); }
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
  if (crk > 0.1 && t > SND.tCrick) { cricket(t + 0.03, crk * 0.7); SND.tCrick = t + rnd(0.5, 2.1) / crk; }
  // houses near? (the town, or a house on the plain within earshot) - then at night the dogs
  if (t > SND.tVill) { SND.tVill = t + 1; let v = tn; for (const c of chunks.values()) if (c.house) { const d = hypot(c.house[0] - px, c.house[2] - pz); v = max(v, 1 - d / 220); } SND.vill = v; }
  SND.info = 'เสียง: ลม ' + (w < 0.8 ? 'เบา' : w < 1.8 ? 'ปานกลาง' : 'แรง') + (AT.rain > 0.05 ? ' · ฝน' : '') + (AT.storm > 0.5 ? ' · ฟ้าร้อง' : '') + (sv > 0.05 ? ' · คลื่นทะเล' : '') + (morning * trees * calm > 0.05 ? ' · นก' : '') + (cicV > 0.1 ? ' · จักจั่น' : '') + (crk > 0.1 ? ' · จิ้งหรีด' : '') + (dark > 0.6 && SND.vill > 0.1 ? ' · หมา' : '') + (mute ? ' (ปิดเสียงอยู่)' : '');
  if (dark > 0.6 && SND.vill > 0.1) { if (!SND.tDog) SND.tDog = t + rnd(1, 5); if (t > SND.tDog) { dogVoice(t + 0.05, SND.vill); SND.tDog = t + rnd(14, 45); } } else SND.tDog = 0;
}
