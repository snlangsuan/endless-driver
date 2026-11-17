// --------------------------------------------------------------------------------------------------------- sound
// Everything heard is synthesised here, nothing is loaded: wind (rising and falling with the gusts, hissing in the leaves),
// the sea (swell, breakers, foam), birds in the morning where there are trees, cicadas at dusk, crickets after dark,
// dogs barking and howling round houses at night. Sound starts with the first key or click (browsers require that); M mutes.
let AC = null, SND = null, mute = false;
function initSound() {
  if (AC) return; const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
  AC = new C(); const master = AC.createGain(); master.gain.value = 0.9; master.connect(AC.destination);
  const nb = AC.createBuffer(1, AC.sampleRate * 5, AC.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noise = () => { const n = AC.createBufferSource(); n.buffer = nb; n.loop = true; n.start(0, Math.random() * 4); return n; };
  const band = (src, type, f, q, out = master) => { const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const gn = AC.createGain(); gn.gain.value = 0; src.connect(fl); fl.connect(gn); gn.connect(out); return { f: fl.frequency, g: gn.gain, node: gn }; };
  // cicadas: a narrow band of hiss high up, chopped fast; two of them a little apart in pitch
  const cic = (f, rate) => { const b = band(noise(), 'bandpass', f, 14, AC.createGain()), am = AC.createGain(), lfo = AC.createOscillator(), out = AC.createGain(); b.g.value = 1; am.gain.value = 0.5; lfo.type = 'square'; lfo.frequency.value = rate; const depth = AC.createGain(); depth.gain.value = 0.5; lfo.connect(depth); depth.connect(am.gain); lfo.start(); b.node.connect(am); am.connect(out); out.gain.value = 0; out.connect(master); return out.gain; };
  SND = { master, wind: band(noise(), 'bandpass', 380, 0.5), leaves: band(noise(), 'bandpass', 2600, 0.8), rush: band(noise(), 'lowpass', 300, 0.4),
    nb, rain: band(noise(), 'bandpass', 5200, 0.35), rainLow: band(noise(), 'lowpass', 900, 0.3), sea: band(noise(), 'lowpass', 480, 0.3), foam: band(noise(), 'highpass', 2200, 0.3), cic1: cic(5200, 92), cic2: cic(6100, 71), tBird: 0, tCrick: 0, tDog: 0, vill: 0, tVill: 0 };
}
// one short voice: an oscillator whose pitch follows a list of [time, Hz] and whose loudness follows [time, level]; pan -1..1
function voice(type, t0, fq, env, vol, pan = 0, bp = 0) {
  const o = AC.createOscillator(), gn = AC.createGain(); o.type = type; let last = o;
  o.frequency.setValueAtTime(fq[0][1], t0 + fq[0][0]); for (let i = 1; i < fq.length; i++) o.frequency.exponentialRampToValueAtTime(fq[i][1], t0 + fq[i][0]);
  gn.gain.setValueAtTime(0, t0); for (const e of env) gn.gain.linearRampToValueAtTime(e[1] * vol, t0 + e[0]);
  if (bp) { const fl = AC.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = bp; fl.Q.value = 1.6; o.connect(fl); last = fl; }
  last.connect(gn); let out = gn; if (AC.createStereoPanner) { const pn = AC.createStereoPanner(); pn.pan.value = pan; gn.connect(pn); out = pn; }
  out.connect(SND.master); const end = t0 + env[env.length - 1][0] + 0.05; o.start(t0); o.stop(end);
}
const rnd = (a, b) => a + Math.random() * (b - a);
function thunder(t, vol) {      // a crack that falls away into a long rumble
  const n = AC.createBufferSource(), f = AC.createBiquadFilter(), gn = AC.createGain(); n.buffer = SND.nb; n.loop = true; f.type = 'lowpass';
  f.frequency.setValueAtTime(1100, t); f.frequency.exponentialRampToValueAtTime(70, t + 2.4);
  gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + 0.04); gn.gain.linearRampToValueAtTime(vol * 0.35, t + 0.5); gn.gain.linearRampToValueAtTime(vol * 0.55, t + 1.2); gn.gain.linearRampToValueAtTime(0, t + 4.8);
  n.connect(f); f.connect(gn); gn.connect(SND.master); n.start(t, Math.random() * 3); n.stop(t + 5);
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
function dogVoice(t, vol) {
  const pan = rnd(-0.9, 0.9), far = rnd(0.35, 1), pitch = rnd(0.8, 1.3);
  if (Math.random() < 0.3) {    // a howl: up, held with a waver, sinking away
    const f = 360 * pitch, d = rnd(1.8, 3.2);
    voice('sawtooth', t, [[0, f * 0.8], [0.45, f * 1.6], [d * 0.6, f * 1.55], [d, f * 0.95]], [[0.25, 0.9], [d * 0.6, 1], [d, 0]], vol * far * 0.16, pan, 760 * pitch);
    voice('sine', t, [[0, f * 0.8], [0.45, f * 1.6], [d * 0.6, f * 1.57], [d, f * 0.95]], [[0.25, 0.8], [d * 0.6, 1], [d, 0]], vol * far * 0.2, pan);
  } else {                      // barking: bursts of two to six
    const n = 2 + floor(rnd(0, 5)); let a = t;
    for (let i = 0; i < n; i++) { const f = 500 * pitch * rnd(0.92, 1.08); voice('sawtooth', a, [[0, f * 1.15], [0.03, f], [0.13, f * 0.55]], [[0.012, 1], [0.07, 0.7], [0.15, 0]], vol * far * 0.3, pan, 950 * pitch); voice('square', a, [[0, f * 2.3], [0.1, f * 1.2]], [[0.01, 0.5], [0.12, 0]], vol * far * 0.06, pan, 1900); a += rnd(0.22, 0.42); }
  }
}
function updateSound(dt) {
  if (!SND || AC.state !== 'running') { if (AC && AC.state === 'suspended') AC.resume(); return; }
  const t = AC.currentTime, px = fly.on ? fly.x : car.x, pz = fly.on ? fly.z : car.z, set = (prm, v, tc = 0.25) => prm.setTargetAtTime(v, t, tc);
  const hl = hillW(pz), tn = townW(pz), sea = seaW(pz), trees = clamp(0.45 + 0.55 * hl - 0.3 * tn - 0.2 * sea, 0.1, 1);
  // wind: the same gusts that move the trees, heard as they pass
  const gs = vnoise(px * 0.02 - time * 0.35, pz * 0.02 - time * 0.22), w = AT.wind * (0.35 + 1.1 * gs);
  set(SND.wind.g, 0.003 + 0.011 * w * w * 0.5, 0.5); set(SND.wind.f, 140 + 90 * w, 0.5);
  set(SND.leaves.g, 0.004 * w * w * trees * 0.5, 0.4); set(SND.leaves.f, 2200 + 500 * w);
  const sp = fly.on ? 0 : abs(car.v); set(SND.rush.g, 0.0004 * sp * sp ** 0.5, 0.15); set(SND.rush.f, 180 + sp * 14, 0.15);      // air and tyres at speed
  // the sea: each swell builds, breaks and hisses back down the sand
  let sv = 0; if (sea > 0.01) { const d = shoreX(pz) - (px - roadX(pz)); sv = sea * clamp(1 - max(d, 0) / 150, 0, 1) ** 2; }
  const ph1 = time * 0.85 + sin(time * 0.23) * 1.3, sw = Math.pow(0.5 + 0.5 * sin(ph1), 2.2), fm = Math.pow(0.5 + 0.5 * sin(ph1 - 0.9), 4);
  set(SND.sea.g, sv * (0.07 + 0.2 * sw), 0.3); set(SND.sea.f, 300 + 600 * sw, 0.3); set(SND.foam.g, sv * (0.008 + 0.05 * fm), 0.3);
  // what hour it is: morning, dusk, dark
  const bump = (c, wd) => max(0, 1 - abs(tday - c) / wd), calm = (1 - 0.6 * AT.mist) * (1 - AT.rain);
  set(SND.rain.g, 0.05 * AT.rain, 0.5); set(SND.rainLow.g, 0.09 * AT.rain * AT.rain, 0.5);
  const morning = max(bump(0.31, 0.11), 0.1 * (1 - AT.night) * bump(0.5, 0.3)), dusk = bump(0.71, 0.09), dark = AT.night;
  const cicV = dusk * trees * calm * (0.7 + 0.3 * sin(time * 0.4));
  set(SND.cic1, 0.05 * cicV, 0.8); set(SND.cic2, 0.035 * cicV * (0.5 + 0.5 * sin(time * 0.17 + 2)), 0.8);
  if (morning * trees * calm > 0.05 && t > SND.tBird) { birdCall(t + 0.05, 0.5 * (0.4 + 0.6 * morning) * trees); SND.tBird = t + rnd(0.3, 2.6) / (0.25 + morning * trees); }
  const crk = sm(0.5, 0.95, dark) * (1 - 0.7 * tn);
  if (crk > 0.1 && t > SND.tCrick) { cricket(t + 0.03, crk * 0.7); SND.tCrick = t + rnd(0.3, 1.4) / crk; }
  // houses near? (the town, or a house on the plain within earshot) - then at night the dogs
  if (t > SND.tVill) { SND.tVill = t + 1; let v = tn; for (const c of chunks.values()) if (c.house) { const d = hypot(c.house[0] - px, c.house[2] - pz); v = max(v, 1 - d / 220); } SND.vill = v; }
  SND.info = 'เสียง: ลม ' + (w < 0.8 ? 'เบา' : w < 1.8 ? 'ปานกลาง' : 'แรง') + (AT.rain > 0.05 ? ' · ฝน' : '') + (AT.storm > 0.5 ? ' · ฟ้าร้อง' : '') + (sv > 0.05 ? ' · คลื่นทะเล' : '') + (morning * trees * calm > 0.05 ? ' · นก' : '') + (cicV > 0.1 ? ' · จักจั่น' : '') + (crk > 0.1 ? ' · จิ้งหรีด' : '') + (dark > 0.6 && SND.vill > 0.1 ? ' · หมา' : '') + (mute ? ' (ปิดเสียงอยู่)' : '');
  if (dark > 0.6 && SND.vill > 0.1) { if (!SND.tDog) SND.tDog = t + rnd(1, 5); if (t > SND.tDog) { dogVoice(t + 0.05, SND.vill); SND.tDog = t + rnd(2.5, 11); } } else SND.tDog = 0;
}
