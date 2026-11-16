// ===== Procedural audio: engine, wind, rain, gentle ambient music =====

// Rotary exhaust generator: a train of combustion pressure pulses (2 per eccentric-shaft turn),
// each with a sharp attack and exponential decay, plus combustion noise riding on the pulse.
// Idle is deliberately irregular (port overlap) which gives the rotary "brap-brap".
function makeRotaryGen(sr, P) {
  let ck = 0, ph = 0, rate = 1, t1 = 1e9, a1 = 0, t2 = 1e9, a2 = 0, hp = 0, prev = 0, lp = 0, nz = 0, cyc = 0;
  return function step(rpm, load) {
    const f = rpm / 60 * P.ppr;
    ph += (f / sr) * rate;
    if (ph >= 1) {
      ph -= 1; cyc++;
      const idle = Math.max(0, 1 - (rpm - P.idle) / (P.redline * 0.3)) * P.rough;
      rate = 1 + (Math.random() - 0.5) * (0.22 * idle + 0.015);          // timing jitter: big at idle (rotary)
      let a = 0.35 + 0.65 * load + 0.15 * Math.min(1, rpm / P.redline);
      ck = P.clatter * (0.6 + 0.4 * (1 - load * 0.5));
      if (Math.random() < 0.3 * idle) a *= 0.25 + Math.random() * 0.35;   // weak / skipped bang at idle
      else if (P.burble && load < 0.12 && rpm > P.idle * 1.8) a *= 1 - P.burble * (0.45 + 0.5 * Math.random()) * (Math.random() < 0.55 ? 1 : 0.2); // off throttle: lean, popping, uneven
      else a *= 1 + (Math.random() - 0.5) * 0.3 * idle;
      if (cyc % 2) a *= 1 - 0.18 * idle;                                  // the two rotors are never identical
      if (P.uneven) {                                                     // flat-4 with unequal-length headers: pulses arrive in lopsided pairs
        const k = cyc & 3, fade = 1 - 0.6 * Math.min(1, rpm / P.redline);  // strongest at idle, never fully gone
        rate *= 1 + (k & 1 ? -1 : 1) * P.uneven * fade;                   // long-short-long-short pulse spacing
        a *= 1 + ([0.45, -0.5, 0.25, -0.6][k]) * Math.min(1, P.uneven * 2.6) * fade; // pairs of strong + weak bangs
      }
      t2 = t1; a2 = a1; t1 = 0; a1 = a;
    }
    const r = Math.min(1, rpm / P.redline);
    const ta = sr * 0.00025, td = sr * (P.td0 + P.td1 * (1 - r));
    const p = (t) => (t > 1e8 ? 0 : (1 - Math.exp(-t / ta)) * Math.exp(-t / td));
    const pulse = a1 * p(t1) + a2 * p(t2) * 0.9;
    t1++; t2++;
    nz += ((Math.random() * 2 - 1) - nz) * 0.35;                         // slightly coloured noise
    let s = pulse * (1 + nz * (P.noise + 0.5 * load)) + nz * 0.02 * (0.3 + load);
    if (ck > 0 && t1 < sr * 0.004) s += (Math.random() * 2 - 1) * ck * Math.exp(-t1 / (sr * 0.0007)) * 0.9; // diesel knock
    if (P.crack && t1 < sr * 0.003) s += (Math.random() * 2 - 1) * a1 * P.crack * Math.exp(-t1 / (sr * 0.00045)); // sharp port opening: the buzz / rasp
    lp += (s - lp) * Math.min(1, (0.25 + 0.55 * r) * P.bright);         // pipe smoothing, brighter at high rpm
    hp = lp - prev + 0.996 * hp; prev = lp;                               // remove DC
    return hp * 0.9;
  };
}
// engine sound profiles (generator params + exhaust filter tuning)
export const ENGINES = {
  // ppr: pulses per crank turn. drive: rasp. pipe (ms) / pfb: exhaust pipe resonance. uneven: unequal-length boxer headers
  rotary: { ppr: 2, rough: 0.8, td0: 0.0009, td1: 0.0026, noise: 0.4, clatter: 0, bright: 1.45, body: 230, bodyG: 4, nasal: 1700, nasalG: 9, res: [520, 1400], low: [2400, 6500], turbo: 1, pops: 1, gain: 0.95, drive: 2.8, pipe: 2.1, pfb: 0.3, whine: 1.6, crack: 1.1, burble: 0.7 },
  i4: { ppr: 2, rough: 0.12, td0: 0.0026, td1: 0.0045, noise: 0.18, clatter: 0, bright: 0.8, body: 120, nasal: 820, res: [240, 620], low: [900, 2800], turbo: 0, pops: 0.15, gain: 1, drive: 1.1, pipe: 5, pfb: 0.32, whine: 0.3, burble: 0.25 },
  i4t: { ppr: 2, rough: 0.15, td0: 0.0022, td1: 0.004, noise: 0.25, clatter: 0, bright: 0.9, body: 130, nasal: 1000, res: [280, 700], low: [1100, 3400], turbo: 1, pops: 0.6, gain: 1, drive: 1.4, pipe: 4.4, pfb: 0.36, whine: 0.4, burble: 0.4, flutter: 0.5 },
  // flat-4 turbo with unequal-length headers: lumpy off-beat burble at low rpm, gruff growl up top, deep long exhaust
  boxert: { ppr: 2, rough: 0.06, td0: 0.0038, td1: 0.0085, noise: 0.22, clatter: 0, bright: 0.45, body: 72, bodyG: 13, nasal: 380, nasalG: 0, res: [120, 320], low: [420, 1500], turbo: 1, pops: 0.5, gain: 1.2, drive: 1.8, pipe: 9.5, pfb: 0.58, whine: 0.1, uneven: 0.32, burble: 0.9, flutter: 1 },
  // flat-4 NA with equal headers: smooth but flat, slightly hollow mid-range
  boxer: { ppr: 2, rough: 0.06, td0: 0.003, td1: 0.0058, noise: 0.18, clatter: 0, bright: 0.7, body: 95, bodyG: 9, nasal: 560, nasalG: 3, res: [180, 460], low: [650, 2300], turbo: 0, pops: 0.3, gain: 1.05, drive: 1.2, pipe: 7, pfb: 0.5, whine: 0.2, uneven: 0.12, crack: 0.15, burble: 0.6 },
  // quiet commuter 4: soft hum, little rasp
  i4s: { ppr: 2, rough: 0.05, td0: 0.0034, td1: 0.0055, noise: 0.08, clatter: 0, bright: 0.5, body: 140, bodyG: 4, nasal: 650, nasalG: 1, res: [230, 520], low: [550, 1500], turbo: 0, pops: 0, gain: 0.75, drive: 0.6, pipe: 3.4, pfb: 0.18, whine: 0.5, burble: 0.15 },
  // high-compression direct-injection NA 4 (2.0 L class): tuned by matching harmonic balance and spectral tilt to a reference recording
  i4hc: { ppr: 2, rough: 0.04, td0: 0.00256, td1: 0.00351, noise: 0.079, clatter: 0.125, bright: 1.18, body: 103, bodyG: 11.5, nasal: 282, nasalG: -0.3, res: [142, 761], low: [3003, 7225], turbo: 0, pops: 0, gain: 0.85, drive: 1.27, pipe: 1.93, pfb: 0.23, whine: 0.25, crack: 0.106, burble: 0.12, uneven: 0.01 },
  // free-revving small 4: thin, raspy, rises to a howl
  i4r: { ppr: 2, rough: 0.1, td0: 0.0011, td1: 0.0026, noise: 0.32, clatter: 0, bright: 1.3, body: 150, bodyG: 4, nasal: 1500, nasalG: 9, res: [320, 950], low: [1600, 5200], turbo: 0, pops: 0.4, gain: 0.95, drive: 3, pipe: 2.6, pfb: 0.38, whine: 0.35, crack: 0.7, burble: 0.45 },
  v6: { ppr: 3, rough: 0.1, td0: 0.0024, td1: 0.0045, noise: 0.2, clatter: 0, bright: 0.85, body: 110, nasal: 700, res: [220, 520], low: [900, 3000], turbo: 0, pops: 0.2, gain: 1, drive: 1.3, pipe: 5.5, pfb: 0.4, whine: 0.3 },
  diesel: { ppr: 2, rough: 0.2, td0: 0.0013, td1: 0.0028, noise: 0.4, clatter: 0.55, bright: 1.1, body: 95, nasal: 600, res: [170, 340], low: [2200, 2600], turbo: 0.6, pops: 0, gain: 1.1, drive: 1.2, pipe: 3, pfb: 0.3, whine: 0.2 },
  diesel6: { ppr: 3, rough: 0.12, td0: 0.0016, td1: 0.0034, noise: 0.45, clatter: 0.4, bright: 1, body: 70, nasal: 450, res: [110, 230], low: [1800, 2200], turbo: 0.8, pops: 0, gain: 1.25, drive: 1.2, pipe: 3.8, pfb: 0.34, whine: 0.2 },
};
const WORKLET_SRC = `const makeRotaryGen = ${makeRotaryGen.toString()};
class RotaryProc extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'rpm', defaultValue: 900, automationRate: 'k-rate' }, { name: 'load', defaultValue: 0, automationRate: 'k-rate' }]; }
  constructor() { super(); this.P = { ppr: 2, idle: 900, redline: 9000, rough: 1, td0: 0.0016, td1: 0.0042, noise: 0.35, clatter: 0, bright: 1 }; this.gen = makeRotaryGen(sampleRate, this.P); this.port.onmessage = (e) => Object.assign(this.P, e.data); }
  process(inputs, outputs, params) {
    const out = outputs[0][0], rpm = params.rpm[0], load = params.load[0];
    for (let i = 0; i < out.length; i++) out[i] = this.gen(rpm, load);
    return true;
  }
}
registerProcessor('rotary', RotaryProc);`;

export class Audio {
  constructor() { this.ctx = null; this.on = false; }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(ctx.destination);
    // everything outside the cabin (engine, wind, tyres, turbo, other cars) goes through the window: open = full, closed = muffled
    this.out = ctx.createGain(); this.cabin = ctx.createBiquadFilter(); this.cabin.type = 'lowpass'; this.cabin.Q.value = 0.5;
    this.cabin.connect(this.master);
    // player volume settings: engine / effects / music (0..1, saved by the game)
    const vol = this.vol || (this.vol = { engine: 1, fx: 1, music: 1 });
    this.engBus = ctx.createGain(); this.engBus.gain.value = vol.engine; this.engBus.connect(this.cabin);
    this.fxOut = ctx.createGain(); this.fxOut.gain.value = vol.fx; this.out.connect(this.fxOut); this.fxOut.connect(this.cabin);
    this.fxBus = ctx.createGain(); this.fxBus.gain.value = vol.fx; this.fxBus.connect(this.master);
    this.musBus = ctx.createGain(); this.musBus.gain.value = vol.music; this.musBus.connect(this.master);
    this.radioBus = ctx.createGain();
    // radio path: bus -> gate (dropouts) -> tone (turns into a thin old AM radio when something is wrong) -> master
    this.rGate = ctx.createGain(); this.rTone = ctx.createBiquadFilter(); this.rTone.type = 'lowpass'; this.rTone.frequency.value = 20000;
    this.rHp = ctx.createBiquadFilter(); this.rHp.type = 'highpass'; this.rHp.frequency.value = 10;
    this.radioBus.connect(this.rGate); this.rGate.connect(this.rHp); this.rHp.connect(this.rTone); this.rTone.connect(this.musBus);
    this.setWindows(this.winOpen ?? false, true);
    // engine: pulse-train rotary (see makeRotaryGen) -> exhaust/muffler resonances
    const shaper = (amt) => { const ws = ctx.createWaveShaper(), n = 1024, k = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n / 2) - 1; k[i] = Math.tanh(x * amt) / Math.tanh(amt); } ws.curve = k; ws.oversample = '4x'; return ws; };
    this.eGain = ctx.createGain(); this.eGain.gain.value = 0; this.eGain.connect(this.engBus);
    this.eIn = ctx.createGain(); this.eIn.gain.value = 1.6;
    const rasp = shaper(1.8);
    const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 160; body.Q.value = 1.1; body.gain.value = 7;
    this.eRes = ctx.createBiquadFilter(); this.eRes.type = 'peaking'; this.eRes.Q.value = 2.5; this.eRes.gain.value = 6;   // muffler resonance (tracks rpm a little)
    const nasal = ctx.createBiquadFilter(); nasal.type = 'peaking'; nasal.frequency.value = 1250; nasal.Q.value = 1.6; nasal.gain.value = 4;
    this.eLow = ctx.createBiquadFilter(); this.eLow.type = 'lowpass'; this.eLow.Q.value = 0.7;
    // short comb = reflections inside the exhaust pipe
    const pipe = ctx.createDelay(0.05); pipe.delayTime.value = 0.0042; const pfb = ctx.createGain(); pfb.gain.value = 0.42;
    const combOut = ctx.createGain();
    this.eIn.connect(rasp); rasp.connect(body); body.connect(this.eRes); this.eRes.connect(nasal); nasal.connect(this.eLow);
    this.eLow.connect(combOut); this.eLow.connect(pipe); pipe.connect(pfb); pfb.connect(pipe); pipe.connect(combOut);
    combOut.connect(this.eGain);
    this.rpmTarget = 900; this.loadTarget = 0;
    this.P = { ppr: 2, idle: 900, redline: 9000, rough: 1, td0: 0.0016, td1: 0.0042, noise: 0.35, clatter: 0, bright: 1 };
    this.eBody = body; this.eNasal = nasal; this.ePipe = pipe; this.ePfb = pfb;
    const startWorklet = async () => {
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      this.engineNode = new AudioWorkletNode(ctx, 'rotary', { numberOfOutputs: 1, outputChannelCount: [1] });
      this.engineNode.connect(this.eIn);
      this.engineNode.port.postMessage(this.P);
    };
    const startScript = () => { // fallback for browsers/sandboxes without AudioWorklet
      const gen = makeRotaryGen(ctx.sampleRate, this.P), sp = ctx.createScriptProcessor(1024, 0, 1);
      sp.onaudioprocess = (e) => { const o = e.outputBuffer.getChannelData(0); for (let i = 0; i < o.length; i++) o[i] = gen(this.rpmTarget, this.loadTarget); };
      sp.connect(this.eIn); this.engineNode = sp;
    };
    this.engineReady = (ctx.audioWorklet ? startWorklet() : Promise.reject(new Error('no AudioWorklet'))).catch((e) => { console.warn('engine: AudioWorklet unavailable, using ScriptProcessor', e && e.message); startScript(); });
    // eccentric-shaft / gear whine
    this.whine = ctx.createOscillator(); this.whine.type = 'sine'; this.whineG = ctx.createGain(); this.whineG.gain.value = 0;
    this.whine.connect(this.whineG); this.whineG.connect(this.engBus);
    // turbo spool whistle
    this.turbo = ctx.createOscillator(); this.turbo.type = 'sine'; this.turboG = ctx.createGain(); this.turboG.gain.value = 0;
    this.turbo.connect(this.turboG); this.turboG.connect(this.engBus);
    for (const o of [this.whine, this.turbo]) o.start();
    this.boost = 0; this.prevThr = 0; this.lastT = ctx.currentTime; this.popT = 0;
    // noise
    const buf = (this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate));
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const mkNoise = (type, f, q) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(this.out); s.start(); return { g, fl };
    };
    this.wind = mkNoise('bandpass', 500, 0.6);
    this.rain = mkNoise('highpass', 2500, 0.3);
    this.rumble = mkNoise('lowpass', 120, 1);
    this.whoosh = mkNoise('bandpass', 2200, 1.4); this.whoosh.g.disconnect(); this.whoosh.g.connect(this.engBus); // turbo intake rush
    // music
    this.mGain = ctx.createGain(); this.mGain.gain.value = 0.5; this.mGain.connect(this.radioBus);
    const delay = ctx.createDelay(); delay.delayTime.value = 0.45;
    const fb = ctx.createGain(); fb.gain.value = 0.35;
    this.mGain.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(this.radioBus);
    this.chord = 0; this.nextChord = ctx.currentTime + 0.5; this.bar = 0;
    this.setStation(this.station ?? 0);
    if (this.profName) this.setProfile(this.profName, this.prof.redline);
    this.on = true;
  }
  setProfile(name, redline) {
    const E = ENGINES[name] || ENGINES.rotary;
    this.prof = { ...E, redline }; this.profName = name;
    if (!this.ctx) return;
    if (this.smpName !== name) { if (this.smp) { this.dropSamples(this.smp); this.smp = null; this.smpOld = null; } this.loadSamples(name); }
    Object.assign(this.P, { ppr: E.ppr, rough: E.rough, td0: E.td0, td1: E.td1, noise: E.noise, clatter: E.clatter, bright: E.bright, uneven: E.uneven || 0, crack: E.crack || 0, burble: E.burble || 0, redline, idle: redline * 0.1 });
    this.engineNode?.port?.postMessage(this.P);
    const t = this.ctx.currentTime;
    this.eBody.frequency.setTargetAtTime(E.body, t, 0.05);
    this.eBody.gain.setTargetAtTime(E.bodyG ?? 7, t, 0.05);
    this.eNasal.frequency.setTargetAtTime(E.nasal, t, 0.05);
    this.eNasal.gain.setTargetAtTime(E.nasalG ?? 4, t, 0.05);
    // exhaust character: how hard the pulses drive the rasp, pipe length and how much it rings
    this.eIn.gain.setTargetAtTime(E.drive ?? 1.6, t, 0.05);
    this.ePipe.delayTime.setTargetAtTime((E.pipe ?? 4.2) / 1000, t, 0.05);
    this.ePfb.gain.setTargetAtTime(E.pfb ?? 0.42, t, 0.05);
  }
  // ----- recorded engine sounds (assets/engines/<engine>_<rpm>[_off].ogg, embedded as window.__ENGINES) -----
  // Each file is a steady loop recorded at one rpm. While driving we play the two nearest loops, pitch them to the
  // current rpm and cross-fade between them; "_off" loops (lift-off / coasting) blend in when the throttle is closed.
  async loadSamples(name) {
    const list = (window.__ENGINES || {})[name];
    this.smp = null; this.smpName = name;
    if (!list || !this.ctx) return;
    const ctx = this.ctx;
    const bufs = await Promise.all(list.map(async (s) => ({ ...s, buf: await ctx.decodeAudioData(await (await fetch(s.data)).arrayBuffer()) })));
    if (this.smpName !== name) return;                                           // car changed while decoding
    const bus = ctx.createGain(); bus.gain.value = 0;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.Q.value = 0.6; bus.connect(tone); tone.connect(this.engBus); // darker when coasting
    const voices = bufs.map((s) => {
      const src = ctx.createBufferSource(); src.buffer = s.buf; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(bus);
      src.start(ctx.currentTime, Math.random() * s.buf.duration);
      return { rpm: s.rpm, off: s.off, src, g };
    });
    if (this.smpOld) this.dropSamples(this.smpOld);
    this.smp = { bus, tone, voices }; this.smpOld = this.smp;
  }
  dropSamples(s) { const t = this.ctx.currentTime; s.bus.gain.setTargetAtTime(0, t, 0.05); setTimeout(() => s.voices.forEach((v) => v.src.stop()), 400); }
  updateSamples(rpm, load, paused, t) {
    const S = this.smp; if (!S) return false;
    const pick = (off) => {                                                      // the two loops bracketing rpm
      const vs = S.voices.filter((v) => !!v.off === off).sort((a, b) => a.rpm - b.rpm);
      if (!vs.length) return null;
      let lo = vs[0], hi = vs[vs.length - 1];
      for (const v of vs) { if (v.rpm <= rpm) lo = v; if (v.rpm >= rpm) { hi = v; break; } }
      const k = hi === lo ? 0 : (rpm - lo.rpm) / (hi.rpm - lo.rpm);
      return [[lo, Math.cos(k * Math.PI / 2)], [hi, Math.sin(k * Math.PI / 2)]];
    };
    const on = pick(false), off = pick(true) || on, wOn = off === on ? 1 : 0.25 + 0.75 * Math.min(1, load * 1.6);
    for (const v of S.voices) v.w = 0;
    for (const [v, w] of on) v.w += w * wOn;
    if (off !== on) for (const [v, w] of off) v.w += w * (1 - wOn);
    for (const v of S.voices) {
      v.g.gain.setTargetAtTime(v.w, t, 0.04);
      v.src.playbackRate.setTargetAtTime(Math.max(0.3, Math.min(3, rpm / v.rpm)), t, 0.02);
    }
    S.bus.gain.setTargetAtTime(paused ? 0 : 0.32 + load * 0.3, t, 0.05);
    S.tone.frequency.setTargetAtTime(2200 + load * 9000 + Math.min(1, rpm / 6000) * 2500, t, 0.05);
    return true;
  }
  // ----- haunting -----
  spook(level) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.drone && level > 0.01) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(this.fxBus);
      for (const f of [55, 58.3, 82.4]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = f > 80 ? 0.35 : 0.6; o.connect(og); og.connect(g); o.start(); }
      const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 3;
      const ng = ctx.createGain(); ng.gain.value = 0.25; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13; const lg = ctx.createGain(); lg.gain.value = 0.22; lfo.connect(lg); lg.connect(ng.gain); lfo.start();
      n.connect(bp); bp.connect(ng); ng.connect(g); n.start();
      this.drone = g;
    }
    if (this.drone) this.drone.gain.setTargetAtTime(this.on ? level * 0.09 : 0, t, 0.5);
    if (Math.abs((this.spookLv || 0) - level) > 0.05) { this.spookLv = level; this.applyRadioVol(); }
  }
  // ghost sounds go through their own bus: louder than the car, with a long cold reverb tail
  fearOut() {
    if (this.fearBus) return this.fearBus;
    const ctx = this.ctx, g = ctx.createGain(); g.gain.value = 3.2;
    const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * (i < 200 ? i / 200 : 1); }
    const conv = ctx.createConvolver(); conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.55;
    g.connect(this.fxBus); g.connect(conv); conv.connect(wet); wet.connect(this.fxBus);
    return (this.fearBus = g);
  }
  // everything else drops away for a moment (the silence before something happens)
  duck(sec = 1.5, depth = 0.04) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, back = this.winOpen ? 1 : 0.11;
    this.out.gain.cancelScheduledValues(t); this.out.gain.setTargetAtTime(back * depth, t, 0.06); this.out.gain.setTargetAtTime(back, t + sec, 0.4);
    if (this.rGate) { this.rGate.gain.cancelScheduledValues(t); this.rGate.gain.setTargetAtTime(0.02, t, 0.06); this.rGate.gain.setTargetAtTime(1, t + sec, 0.5); }
  }
  scream(k = 1) { // a woman's shriek: a sawtooth through vowel formants, pitch tearing upward, with breath noise
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this.fearOut(), dur = 1.3;
    const o = ctx.createOscillator(), v = ctx.createOscillator(), vg = ctx.createGain(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(620, t); o.frequency.exponentialRampToValueAtTime(1180, t + 0.25); o.frequency.exponentialRampToValueAtTime(980, t + dur);
    v.frequency.value = 9; vg.gain.value = 45; v.connect(vg); vg.connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * k, t + 0.04); g.gain.setValueAtTime(0.16 * k, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    for (const [f, q, a] of [[950, 9, 1], [1500, 10, 0.7], [2900, 12, 0.45]]) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; const bg = ctx.createGain(); bg.gain.value = a * 3; o.connect(bp); bp.connect(bg); bg.connect(g); }
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 3200; hp.Q.value = 1; const ng = ctx.createGain(); ng.gain.setValueAtTime(0.12 * k, t); ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(hp); hp.connect(ng); ng.connect(out); g.connect(out);
    o.start(t); v.start(t); n.start(t, Math.random()); o.stop(t + dur + 0.05); v.stop(t + dur + 0.05); n.stop(t + dur);
  }
  ghostCall(type) {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const voice = (f0, f1, dur, vol, wave = 'sine', vib = 6) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), v = ctx.createOscillator(), vg = ctx.createGain();
      o.type = wave; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      v.frequency.value = vib; vg.gain.value = f0 * 0.02; v.connect(vg); vg.connect(o.frequency);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
      const d = ctx.createDelay(); d.delayTime.value = 0.23; const fb = ctx.createGain(); fb.gain.value = 0.45;
      o.connect(g); g.connect(this.fearOut()); g.connect(d); d.connect(fb); fb.connect(d); d.connect(this.fearOut());
      o.start(t); v.start(t); o.stop(t + dur + 0.1); v.stop(t + dur + 0.1);
    };
    const hiss = (dur, vol, f = 1800) => { const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 2; const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur); s.connect(bp); bp.connect(g); g.connect(this.fearOut()); s.start(t, Math.random()); s.stop(t + dur); };
    if (type === 'nak') voice(560, 360, 3, 0.05, 'sine', 5);                       // a long, sad wail
    else if (type === 'tani') { voice(420, 300, 2.5, 0.04, 'triangle', 4); hiss(2, 0.03, 900); }
    else if (type === 'krasue') { voice(1250, 1500, 2.2, 0.03, 'sine', 11); voice(1870, 1700, 2.2, 0.02, 'sine', 9); }
    else if (type === 'krahang') for (let k = 0; k < 7; k++) { const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; const g = ctx.createGain(), tt = t + k * 0.22; g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.18, tt + 0.05); g.gain.linearRampToValueAtTime(0, tt + 0.16); s.connect(lp); lp.connect(g); g.connect(this.fearOut()); s.start(tt, Math.random()); s.stop(tt + 0.2); }
    else if (type === 'pret') voice(2300, 2600, 2.8, 0.03, 'sine', 3);             // the thin, high whistle of a pret
    else if (type === 'yai') { voice(700, 520, 0.5, 0.05, 'triangle', 18); setTimeout(() => this.on && voice(680, 500, 0.5, 0.05, 'triangle', 18), 600); } // a cackle
    else if (type === 'rider') { for (const f of [233, 247, 311, 330]) voice(f, f * 0.94, 1.4, 0.05, 'sawtooth', 7); hiss(1.2, 0.08, 2500); }
  }
  // ----- scares -----
  howl() { // village dogs howling somewhere out in the dark (a bad omen)
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, n = 2 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) {
      const t = ctx.currentTime + k * (0.6 + Math.random() * 1.4), f = 430 + Math.random() * 160, dur = 2.2 + Math.random() * 1.5;
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter(), v = ctx.createOscillator(), vg = ctx.createGain(), pan = ctx.createStereoPanner();
      o.type = 'sawtooth'; o2.type = 'sine';
      for (const osc of [o, o2]) { osc.frequency.setValueAtTime(f * 0.8, t); osc.frequency.linearRampToValueAtTime(f * 1.25, t + dur * 0.3); osc.frequency.linearRampToValueAtTime(f * 1.15, t + dur * 0.75); osc.frequency.exponentialRampToValueAtTime(f * 0.7, t + dur); }
      v.frequency.value = 5.5; vg.gain.value = f * 0.025; v.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
      lp.type = 'lowpass'; lp.frequency.value = 1500; pan.pan.value = Math.random() * 1.6 - 0.8;
      const vol = 0.022 / (1 + k * 0.6);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.4); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
      const d = ctx.createDelay(); d.delayTime.value = 0.31; const fb = ctx.createGain(); fb.gain.value = 0.4;
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(pan); pan.connect(this.out); g.connect(d); d.connect(fb); fb.connect(d); d.connect(this.out);
      for (const osc of [o, o2, v]) { osc.start(t); osc.stop(t + dur + 0.1); }
    }
  }
  heart(dt, k) { // your own heartbeat, faster and louder as something gets closer
    if (!this.ctx || !this.on || k < 0.05) return;
    this.hbT = (this.hbT || 0) - dt; if (this.hbT > 0) return;
    this.hbT = 1.15 - 0.6 * k;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [dt2, a] of [[0, 1], [0.16, 0.65]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(62, t + dt2); o.frequency.exponentialRampToValueAtTime(38, t + dt2 + 0.14);
      g.gain.setValueAtTime(0, t + dt2); g.gain.linearRampToValueAtTime(0.11 * k * a, t + dt2 + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + dt2 + 0.2);
      o.connect(g); g.connect(this.fearOut()); o.start(t + dt2); o.stop(t + dt2 + 0.22);
    }
  }
  sting(k = 1) { // the jump-scare hit: a dissonant shriek over a low boom
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime, g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * k, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 1.8); g.connect(this.fearOut());
    for (const f of [1046, 1108, 1480, 1568, 740]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.92, t + 1.6);
      const og = ctx.createGain(); og.gain.value = 0.18; o.connect(og); og.connect(g); o.start(t); o.stop(t + 1.8);
    }
    const b = ctx.createOscillator(), bg = ctx.createGain(); b.type = 'sine'; b.frequency.setValueAtTime(90, t); b.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    bg.gain.setValueAtTime(0.5 * k, t); bg.gain.exponentialRampToValueAtTime(0.001, t + 0.9); b.connect(bg); bg.connect(this.fearOut()); b.start(t); b.stop(t + 1);
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const sg = ctx.createGain(); sg.gain.setValueAtTime(0.12 * k, t); sg.gain.exponentialRampToValueAtTime(0.001, t + 0.7); s.connect(hp); hp.connect(sg); sg.connect(this.fearOut()); s.start(t, Math.random()); s.stop(t + 0.8);
  }
  knock1() { // a palm slapping the glass
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime, s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), o = ctx.createOscillator(), og = ctx.createGain();
    s.buffer = this.noiseBuf; lp.type = 'lowpass'; lp.frequency.value = 1800; g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.1); og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    s.connect(lp); lp.connect(g); g.connect(this.fxBus); o.connect(og); og.connect(this.fxBus); s.start(t, Math.random()); s.stop(t + 0.15); o.start(t); o.stop(t + 0.16);
  }
  knock() { // three slow knocks on the roof
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx;
    for (let k = 0; k < 3; k++) {
      const t = ctx.currentTime + k * (0.55 + Math.random() * 0.15), o = ctx.createOscillator(), g = ctx.createGain(), s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), sg = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
      g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(g); g.connect(this.fearOut()); o.start(t); o.stop(t + 0.2);
      s.buffer = this.noiseBuf; lp.type = 'lowpass'; lp.frequency.value = 900; sg.gain.setValueAtTime(0.3, t); sg.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      s.connect(lp); lp.connect(sg); sg.connect(this.fearOut()); s.start(t, Math.random()); s.stop(t + 0.08);
    }
  }
  whisper() { // breathy whispering right beside one ear
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime, pan = ctx.createStereoPanner(); pan.pan.value = Math.random() < 0.5 ? -0.85 : 0.85; pan.connect(this.fearOut());
    const n = 5 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const tt = t + k * (0.18 + Math.random() * 0.2), s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), d = 0.12 + Math.random() * 0.25;
      s.buffer = this.noiseBuf; bp.type = 'bandpass'; bp.frequency.value = 1800 + Math.random() * 2500; bp.Q.value = 3 + Math.random() * 4;
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.09, tt + d * 0.3); g.gain.linearRampToValueAtTime(0, tt + d);
      s.connect(bp); bp.connect(g); g.connect(pan); s.start(tt, Math.random()); s.stop(tt + d + 0.02);
    }
  }
  sputter() { // the engine coughs and dies for a moment
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx;
    for (let k = 0; k < 4; k++) {
      const t = ctx.currentTime + k * 0.17, s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = this.noiseBuf; lp.type = 'lowpass'; lp.frequency.value = 300; g.gain.setValueAtTime(0.3 / (k + 1), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      s.connect(lp); lp.connect(g); g.connect(this.engBus); s.start(t, Math.random()); s.stop(t + 0.14);
    }
  }
  babyCry(k = 1) { // a newborn's thin, hiccuping cry
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    for (let n = 0; n < 4; n++) {
      const t = t0 + n * 0.85 + Math.random() * 0.15, dur = 0.55 + Math.random() * 0.25, f = 470 + Math.random() * 60;
      const o = ctx.createOscillator(), g = ctx.createGain(), bp = ctx.createBiquadFilter(), bp2 = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.85, t); o.frequency.linearRampToValueAtTime(f * 1.12, t + dur * 0.25); o.frequency.linearRampToValueAtTime(f * 0.8, t + dur);
      bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 2.5; bp2.type = 'bandpass'; bp2.frequency.value = 3100; bp2.Q.value = 3;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.11 * k, t + 0.05); g.gain.setValueAtTime(0.11 * k, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(bp); o.connect(bp2); bp.connect(g); bp2.connect(g); g.connect(this.fearOut()); o.start(t); o.stop(t + dur + 0.05);
    }
  }
  sob(k = 0.6) { // a woman weeping softly in the dark
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    for (let n = 0; n < 3; n++) {
      const t = t0 + n * (0.7 + Math.random() * 0.4), dur = 0.5 + Math.random() * 0.3, s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), o = ctx.createOscillator(), og = ctx.createGain();
      s.buffer = this.noiseBuf; bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.5;
      o.type = 'triangle'; o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(240, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * k, t + 0.08); g.gain.linearRampToValueAtTime(0, t + dur);
      og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.025 * k, t + 0.1); og.gain.linearRampToValueAtTime(0, t + dur);
      s.connect(bp); bp.connect(g); g.connect(this.fearOut()); o.connect(og); og.connect(this.fearOut());
      s.start(t, Math.random()); s.stop(t + dur); o.start(t); o.stop(t + dur);
    }
  }
  breath() { // ragged, wheezing breaths right behind your head
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    for (let n = 0; n < 6; n++) {
      const t = t0 + n * 0.62, s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), inh = n % 2 === 0;
      s.buffer = this.noiseBuf; bp.type = 'bandpass'; bp.frequency.value = inh ? 1600 : 900; bp.Q.value = 1.2;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(inh ? 0.07 : 0.1, t + 0.2); g.gain.linearRampToValueAtTime(0, t + 0.5);
      s.connect(bp); bp.connect(g); g.connect(this.fearOut()); s.start(t, Math.random()); s.stop(t + 0.55);
    }
  }
  door() { // a car door opening / shutting
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), sg = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); o.connect(g); g.connect(this.fearOut()); o.start(t); o.stop(t + 0.3);
    s.buffer = this.noiseBuf; lp.type = 'lowpass'; lp.frequency.value = 1400; sg.gain.setValueAtTime(0.25, t); sg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    s.connect(lp); lp.connect(sg); sg.connect(this.fearOut()); s.start(t, Math.random()); s.stop(t + 0.12);
  }
  drop() { // something small drops and rolls away under the seat
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    for (let n = 0; n < 9; n++) {
      const t = t0 + (n === 0 ? 0 : 0.18 + n * 0.11 + n * n * 0.012), o = ctx.createOscillator(), g = ctx.createGain(), v = n === 0 ? 0.25 : 0.06 / (1 + n * 0.3);
      o.type = 'sine'; o.frequency.setValueAtTime(n === 0 ? 420 : 260 + Math.random() * 60, t);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07); o.connect(g); g.connect(this.fearOut()); o.start(t); o.stop(t + 0.08);
    }
  }
  bell() { // a temple bell far away
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime, g = ctx.createGain(), d = ctx.createDelay(), fb = ctx.createGain();
    g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.001, t + 6); d.delayTime.value = 0.37; fb.gain.value = 0.35;
    g.connect(this.fearOut()); g.connect(d); d.connect(fb); fb.connect(d); d.connect(this.fearOut());
    for (const [f, a] of [[196, 1], [392.5, 0.5], [523, 0.35], [741, 0.25], [1047, 0.12]]) { const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = f; og.gain.value = a; o.connect(og); og.connect(g); o.start(t); o.stop(t + 6); }
  }
  flap(sec = 3) { // big woven trays beating the air above the car
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    for (let t = 0; t < sec; t += 0.32 + Math.random() * 0.06) {
      const tt = t0 + t, s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = this.noiseBuf; lp.type = 'lowpass'; lp.frequency.value = 420; g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.3, tt + 0.05); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.22);
      s.connect(lp); lp.connect(g); g.connect(this.fearOut()); s.start(tt, Math.random()); s.stop(tt + 0.25);
    }
  }
  scratch() { // something scraping across the roof
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime, s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), am = ctx.createOscillator(), ag = ctx.createGain();
    s.buffer = this.noiseBuf; bp.type = 'bandpass'; bp.frequency.setValueAtTime(2200, t); bp.frequency.linearRampToValueAtTime(1300, t + 1.6); bp.Q.value = 6;
    am.frequency.value = 23; ag.gain.value = 0.06; am.connect(ag); ag.connect(g.gain);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.2); g.gain.linearRampToValueAtTime(0, t + 1.7);
    s.connect(bp); bp.connect(g); g.connect(this.fearOut()); s.start(t, Math.random()); s.stop(t + 1.8); am.start(t); am.stop(t + 1.8);
  }
  patter(dt, stride, off) { // bare feet slapping the road beside the car
    if (!this.ctx || !this.on) return;
    this.patT = (this.patT || 0) - dt; if (this.patT > 0) return;
    this.patT = Math.PI / Math.max(4, stride);
    const ctx = this.ctx, t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.5;
    const g = ctx.createGain(), v = 0.12 / (1 + Math.abs(off) * 0.15);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(bp); bp.connect(g); g.connect(this.out); s.start(t, Math.random()); s.stop(t + 0.06);
  }
  // ----- the radio misbehaves on a haunted road / with someone in the back seat -----
  radioFx(dt, k) {
    if (!this.ctx || !this.rTone) return;
    const ctx = this.ctx, t = ctx.currentTime, on = this.on && this.station > 0;
    this.rTone.frequency.setTargetAtTime(20000 - 17500 * k, t, 0.4);
    this.rHp.frequency.setTargetAtTime(10 + 380 * k, t, 0.4);
    if (!on || k < 0.05) { this.rGate.gain.setTargetAtTime(1, t, 0.1); return; }
    this.fxT = (this.fxT || 0) - dt;
    if (this.fxT > 0) return;
    this.fxT = 0.6 + Math.random() * 3.5 / k;
    const pick = Math.random();
    if (pick < 0.35) { // static crackle
      const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
      const g = ctx.createGain(), d = 0.2 + Math.random() * 0.8; g.gain.setValueAtTime(0, t);
      for (let q = 0; q < 8; q++) g.gain.setValueAtTime(Math.random() < 0.5 ? 0.09 * k : 0.01, t + (q / 8) * d);
      g.gain.setValueAtTime(0, t + d); s.connect(hp); hp.connect(g); g.connect(this.fxBus); s.start(t, Math.random()); s.stop(t + d + 0.05);
    } else if (pick < 0.55) { // signal drops out for a moment
      const d = 0.25 + Math.random() * 0.6; this.rGate.gain.setValueAtTime(this.rGate.gain.value, t); this.rGate.gain.linearRampToValueAtTime(0.03, t + 0.05); this.rGate.gain.setValueAtTime(0.03, t + d); this.rGate.gain.linearRampToValueAtTime(1, t + d + 0.1);
    } else if (pick < 0.8) { // a whisper between stations
      const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400 + Math.random() * 900; bp.Q.value = 4;
      const g = ctx.createGain(), am = ctx.createOscillator(), amg = ctx.createGain(), d = 1.2 + Math.random();
      am.frequency.value = 5 + Math.random() * 4; amg.gain.value = 0.05 * k; am.connect(amg); amg.connect(g.gain);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * k, t + 0.3); g.gain.linearRampToValueAtTime(0, t + d);
      s.connect(bp); bp.connect(g); g.connect(this.fxBus); s.start(t, Math.random()); am.start(t); s.stop(t + d); am.stop(t + d);
    } else { // the song slows and sags, then recovers
      this.onWarble?.(0.82 + Math.random() * 0.08, 1.2 + Math.random());
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(220, t + 1.6);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025 * k, t + 0.4); g.gain.linearRampToValueAtTime(0, t + 1.6); o.connect(g); g.connect(this.fxBus); o.start(t); o.stop(t + 1.7);
    }
  }
  // ----- windows -----
  setWindows(open, now = false) {
    this.winOpen = open; if (!this.ctx) return;
    const t = this.ctx.currentTime, k = now ? 0.001 : 0.35;                  // closing takes a moment, like the glass going up
    this.out.gain.setTargetAtTime(open ? 1 : 0.11, t, k);                  // closed: about 19 dB quieter (sealed cabin)...
    this.cabin.frequency.setTargetAtTime(open ? 18000 : 1100, t, k);        // ...the low hum still comes through, the rasp mostly doesn't
    this.applyRadioVol();
  }
  // ----- radio: 0 off, 1-3 built-in stations, 4 the player's own files -----
  setStation(n) {
    this.station = n; if (!this.ctx) return;
    this.nextChord = this.ctx.currentTime + 0.15; this.bar = 0;
    if (this.fileEl) { if (n === 4) this.fileEl.play().catch(() => {}); else this.fileEl.pause(); }
    this.applyRadioVol();
  }
  setVolume(kind, v) { // kind: engine | fx | music
    this.vol = this.vol || { engine: 1, fx: 1, music: 1 }; this.vol[kind] = v;
    if (!this.ctx) return; const t = this.ctx.currentTime;
    if (kind === 'engine') this.engBus.gain.setTargetAtTime(v, t, 0.05);
    else if (kind === 'fx') { this.fxOut.gain.setTargetAtTime(v, t, 0.05); this.fxBus.gain.setTargetAtTime(v, t, 0.05); }
    else this.musBus.gain.setTargetAtTime(v, t, 0.05);
  }
  setRadioVol(v) { this.radioVol = v; this.applyRadioVol(); }
  applyRadioVol() {
    if (!this.ctx) return;
    const v = (this.radioVol ?? 0.7) * (this.station ? 1 : 0) * (this.winOpen ? 0.45 : 1) * (1 - 0.7 * (this.spookLv || 0)); // open windows: the road drowns the radio; something else drowns it on a haunted road
    this.radioBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
  }
  attachFiles(el) { // <audio> element playing the player's own songs
    if (!this.ctx || this.fileSrc) return;
    this.fileEl = el; this.fileSrc = this.ctx.createMediaElementSource(el);
    const g = this.ctx.createGain(); g.gain.value = 1.4; this.fileSrc.connect(g); g.connect(this.radioBus);
  }
  note(type, midi, t, dur, vol, dest, attack = 0.01, cutoff = 0) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); f.connect(g); } else o.connect(g);
    g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  drum(kind, t, vol, dest) {
    const ctx = this.ctx;
    if (kind === 'k') { // kick: pitch-dropping sine
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.4); return;
    }
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(), g = ctx.createGain(), len = kind === 's' ? 0.18 : 0.045;
    f.type = kind === 's' ? 'bandpass' : 'highpass'; f.frequency.value = kind === 's' ? 1800 : 7000; f.Q.value = kind === 's' ? 0.7 : 0.5;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f); f.connect(g); g.connect(dest); src.start(t, Math.random()); src.stop(t + len + 0.02);
  }
  playBar() {
    const s = this.station, d = this.mGain;
    if (s === 1) { this.playChord(); return; }                            // "Chill": slow ambient pads
    const t = this.nextChord, b = this.bar++;
    if (s === 2) { // "Lo-fi": 78 bpm, jazzy chords, lazy drums
      const beat = 60 / 78, prog = [[50, 57, 60, 64, 65], [55, 59, 62, 65, 69], [48, 55, 59, 62, 64], [57, 60, 64, 67, 71]];
      const ch = prog[b % 4];
      ch.forEach((n, i) => this.note('triangle', i ? n + 12 : n, t + i * 0.012, beat * 3.8, i ? 0.07 : 0.16, d, 0.02, 1400));
      for (let i = 0; i < 4; i++) {
        const sw = i % 2 ? 0.06 : 0;
        if (i === 0 || i === 2.5) this.drum('k', t + i * beat, 0.5, d);
        if (i === 1 || i === 3) this.drum('s', t + i * beat + sw, 0.12, d);
        this.drum('h', t + i * beat, 0.05, d); this.drum('h', t + (i + 0.55) * beat, 0.035, d);
      }
      this.drum('k', t + 2.5 * beat, 0.4, d);
      if (b % 2) this.note('sine', ch[2] + 24, t + beat * (1 + Math.floor(Math.random() * 2)), 1.4, 0.06, d);
      this.nextChord = t + beat * 4;
    } else { // "Synth": 104 bpm, driving bass + arpeggio
      const beat = 60 / 104, roots = [45, 41, 48, 43], r = roots[b % 4], arp = [0, 7, 12, 15, 12, 7, 3, 7];
      for (let i = 0; i < 8; i++) this.note('sawtooth', r - 12 + (i % 2 ? 12 : 0), t + i * beat / 2, beat * 0.45, 0.07, d, 0.005, 600);
      for (let i = 0; i < 16; i++) this.note('square', r + 24 + arp[i % 8], t + i * beat / 4, beat * 0.22, 0.025, d, 0.003, 2600);
      [0, 3, 7].forEach((iv) => this.note('sawtooth', r + 12 + iv, t, beat * 4, 0.02, d, 0.6, 1800));
      for (let i = 0; i < 4; i++) { this.drum('k', t + i * beat, 0.45, d); if (i % 2) this.drum('s', t + i * beat, 0.1, d); this.drum('h', t + (i + 0.5) * beat, 0.04, d); }
      this.nextChord = t + beat * 4;
    }
  }
  toggle() {
    if (!this.ctx) { this.init(); return this.on; }
    this.on = !this.on;
    this.master.gain.setTargetAtTime(this.on ? 0.8 : 0, this.ctx.currentTime, 0.05);
    return this.on;
  }
  playChord() {
    const ctx = this.ctx, t = this.nextChord;
    const prog = [[57, 64, 69, 72], [53, 60, 65, 69], [55, 62, 67, 71], [52, 59, 64, 67]];
    const notes = prog[this.chord++ % prog.length];
    notes.forEach((n, i) => {
      const o = ctx.createOscillator(); o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = 440 * Math.pow(2, (n - 69) / 12) * (i === 0 ? 0.5 : 1);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(i === 0 ? 0.5 : 0.22, t + 1.8); g.gain.linearRampToValueAtTime(0, t + 7.8);
      o.connect(g); g.connect(this.mGain); o.start(t); o.stop(t + 8);
    });
    // a few sparkling notes
    for (let k = 0; k < 3; k++) {
      const n = notes[1 + Math.floor(Math.random() * 3)] + 12;
      const tt = t + 1 + k * 2 + Math.random();
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 440 * Math.pow(2, (n - 69) / 12);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.25, tt + 0.02); g.gain.exponentialRampToValueAtTime(0.001, tt + 2.2);
      o.connect(g); g.connect(this.mGain); o.start(tt); o.stop(tt + 2.3);
    }
    this.nextChord = t + 8;
  }
  update({ rpm, thr, v, rain, offroad, paused, boost = null }) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    const dt = Math.min(0.1, t - this.lastT); this.lastT = t;
    const f = rpm / 60 * 2;                          // 2-rotor firing frequency
    const load = paused ? 0 : thr;
    const E = this.prof || ENGINES.rotary, RL = (this.prof && this.prof.redline) || 9000;
    const r = Math.min(1, rpm / RL);
    this.rpmTarget = rpm; this.loadTarget = load;
    if (this.engineNode && this.engineNode.parameters) {
      this.engineNode.parameters.get('rpm').setTargetAtTime(rpm, t, 0.015);
      this.engineNode.parameters.get('load').setTargetAtTime(load, t, 0.03);
    }
    this.eRes.frequency.setTargetAtTime(E.res[0] + r * (E.res[1] - E.res[0]), t, 0.05);
    this.eLow.frequency.setTargetAtTime(E.low[0] + r * E.low[1] + load * 2500, t, 0.04);
    const rec = this.updateSamples(rpm, load, paused, t);                      // real recordings replace the synth
    this.eGain.gain.setTargetAtTime(paused || rec ? 0 : (0.2 + load * 0.26 + r * 0.1) * E.gain, t, 0.035);
    this.eIn.gain.setTargetAtTime((E.drive ?? 1.6) * (0.65 + 0.6 * load), t, 0.03); // more rasp under load
    this.whine.frequency.setTargetAtTime(f * 2.25, t, 0.03);
    this.whineG.gain.setTargetAtTime(paused ? 0 : (0.002 + r * r * 0.007) * (E.whine ?? 0.3), t, 0.05);
    // turbo: boost builds with load above ~2500 rpm
    const target = E.turbo * Math.min(1, load * 1.4) * Math.min(1, Math.max(0, (r - 0.25) / 0.35)); // part throttle still spools
    if (boost != null) this.boost = boost * E.turbo;  // follow the car's own turbo (with its lag)
    else this.boost += (target - this.boost) * Math.min(1, dt * (target > this.boost ? 2.2 : 6));
    this.turbo.frequency.setTargetAtTime(1900 + this.boost * 4200 + r * 900, t, 0.05);       // spool whistle rises with boost
    this.turboG.gain.setTargetAtTime(paused ? 0 : this.boost * 0.14, t, 0.05);
    this.whoosh.fl.frequency.setTargetAtTime(1500 + this.boost * 2600, t, 0.08);
    this.whoosh.g.gain.setTargetAtTime(paused ? 0 : this.boost * this.boost * 0.24, t, 0.06);
    // lift-off: blow-off valve + overrun pops / crackles
    if (!paused && this.prevThr > 0.5 && thr < 0.15 && this.boost > 0.35) { if (E.flutter) this.flutter(this.boost * E.flutter); else this.blowOff(this.boost); }
    if (!paused && thr < 0.1 && r > 0.42 && E.pops > 0) {
      this.popT -= dt;
      if (this.popT <= 0) { if (Math.random() < E.pops) this.pop(0.5 + Math.random() * 0.5); this.popT = 0.05 + Math.random() * 0.25 / Math.max(r, 0.3); }
    }
    this.prevThr = thr;
    this.wind.g.gain.setTargetAtTime(paused ? 0 : Math.min(0.35, v * v * 0.00028), t, 0.2);
    this.wind.fl.frequency.setTargetAtTime(300 + v * 18, t, 0.2);
    this.rain.g.gain.setTargetAtTime(paused ? 0 : rain * 0.09, t, 0.5);
    this.rumble.g.gain.setTargetAtTime(paused ? 0 : offroad * Math.min(1, v / 10) * 0.5, t, 0.1);
    if (this.station && this.station < 4 && t > this.nextChord - 0.3) this.playBar();
  }
  flutter(amt) { // compressor surge on lift-off without a blow-off valve: "chu-tu-tu-tu"
    const ctx = this.ctx, t0 = ctx.currentTime, n = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const t = t0 + 0.03 + i * (0.045 + i * 0.004), src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900 - i * 90; bp.Q.value = 1.6;
      const g = ctx.createGain(), k = amt * 0.25 * Math.pow(0.82, i);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(k, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      src.connect(bp); bp.connect(g); g.connect(this.engBus); src.start(t, Math.random()); src.stop(t + 0.05);
    }
  }
  blowOff(amt) { // turbo blow-off valve "pssshh"
    const ctx = this.ctx, t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(3200, t); bp.frequency.exponentialRampToValueAtTime(1400, t + 0.45); bp.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3 * amt, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(bp); bp.connect(g); g.connect(this.engBus); src.start(t, Math.random()); src.stop(t + 0.55);
  }
  pop(amt) { // overrun backfire crackle
    const ctx = this.ctx, t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + Math.random() * 1500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.32 * amt, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05 + Math.random() * 0.05);
    src.connect(lp); lp.connect(g); g.connect(this.engBus); src.start(t, Math.random() * 1.5); src.stop(t + 0.12);
  }
  // dual-tone car horn: hold to sound
  hornStart() {
    if (!this.ctx || !this.on || this.horn) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain(); out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.22, t + 0.015);
    const shape = ctx.createWaveShaper(); const k = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; k[i] = Math.tanh(x * 3); } shape.curve = k;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
    const oscs = [415, 523].map((f) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(shape); o.start(t); return o; });
    shape.connect(bp); bp.connect(out); out.connect(this.out);
    this.horn = { out, oscs };
  }
  hornStop() {
    if (!this.horn) return;
    const t = this.ctx.currentTime, h = this.horn; this.horn = null;
    h.out.gain.cancelScheduledValues(t); h.out.gain.setValueAtTime(h.out.gain.value, t); h.out.gain.linearRampToValueAtTime(0, t + 0.05);
    h.oscs.forEach((o) => o.stop(t + 0.06));
  }
  // short horn from another car (quieter, a bit lower)
  beepOther(vol = 0.08) {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime, g = ctx.createGain(), bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 1;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.setValueAtTime(vol, t + 0.22); g.gain.linearRampToValueAtTime(0, t + 0.28);
    g.gain.setValueAtTime(0, t + 0.36); g.gain.linearRampToValueAtTime(vol, t + 0.38); g.gain.setValueAtTime(vol, t + 0.5); g.gain.linearRampToValueAtTime(0, t + 0.56);
    for (const f of [370, 466]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(bp); o.start(t); o.stop(t + 0.6); }
    bp.connect(g); g.connect(this.out);
  }
  tick(on) { // turn-signal relay
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o.type = 'square'; o.frequency.value = on ? 1900 : 1500; f.type = 'bandpass'; f.frequency.value = on ? 2400 : 1800; f.Q.value = 3;
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    o.connect(f); f.connect(g); g.connect(this.fxBus); o.start(t); o.stop(t + 0.03);
  }
  click() {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square'; o.frequency.value = 180; g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g); g.connect(this.fxBus); o.start(t); o.stop(t + 0.07);
  }
  knock(amt = 1) { // small object knocked over (post / sign / bush)
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500 + Math.random() * 600; bp.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.35 * amt, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src.connect(bp); bp.connect(g); g.connect(this.out); src.start(t, Math.random()); src.stop(t + 0.3);
  }
  scrape() { // metal on guard rail
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200 + Math.random() * 1500; bp.Q.value = 6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.03); g.gain.linearRampToValueAtTime(0, t + 0.28);
    src.connect(bp); bp.connect(g); g.connect(this.out); src.start(t, Math.random()); src.stop(t + 0.3);
  }
  crash(amt = 1) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    this.rumble.g.gain.cancelScheduledValues(t); this.rumble.g.gain.setValueAtTime(1.2 * amt, t); this.rumble.g.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    g.gain.setValueAtTime(0.3 * amt, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.5);
  }
}
