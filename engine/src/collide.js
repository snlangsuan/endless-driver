// --------------------------------------------------------------------------------------------------------- what the car meets
// What stops the car (the chunks' col lists) and what it flattens (their soft lists). Used by any game's driving.
// How far a car standing at (x, z), its floor at height y, is into something solid (0: clear of everything). The car is taken as a circle
// 0.85 m across the half; a thing counts if any of it is between the car's sill and its roof (see the chunks: col).
function solidAt(x, z, y, r = 0.85) {      // (r: asked with a wider circle, it tells of things near the car's path as well as in it - the self-driving looks ahead so)
  let pen = 0;
  for (const c of chunks.values()) { if (abs(c.x - x) > 46 || abs(c.z - z) > 46) continue; const A = c.col;
    for (let i = 0; i < A.length; i += 8) { const dx = x - A[i], dz = z - A[i + 1], hx = A[i + 4], hz = A[i + 5], rr = hx + hz + r; if (abs(dx) > rr || abs(dz) > rr) continue;
      if (A[i + 6] > y + 1.25 || A[i + 7] < y + 0.45) continue;
      const ex = max(abs(dx * A[i + 2] - dz * A[i + 3]) - hx, 0), ez = max(abs(dx * A[i + 3] + dz * A[i + 2]) - hz, 0), d = r - Math.sqrt(ex * ex + ez * ez); if (d > pen) pen = d; } }
  // (and people: nobody is driven through - each within reach of the car stops it as a post would)
  for (let i = 0; i < PNEAR.length; i += 2) { const d = r + 0.3 - Math.hypot(x - PNEAR[i], z - PNEAR[i + 1]); if (d > pen) pen = d; }
  return pen;
}
// The people near the car, [x, z, x, z ...], found each frame (main.js): those of the footpaths' stream (render.js STROLL puts them in), and
// those of the chunks about it - pplNear, which works out where each is as the vertex stage does (vsPpl: standing or seated where it was set;
// walking a line out and back, or round a ring, stopping now and then), from the chunk's own copy of its list (pplA), counting only those the
// hour has out (POP: the first part of the men, and of the women).
const PNEAR = [];
// (where one who is not seated stands when the car comes at it: stepped back as vsPpl has it - to 2.3 m from the car, whichever way it
// points; not at all once the car is as good as still)
function dodged(x, z) { const sp = abs(car.v), k0 = min(1, max(0, (sp * 3.6 - 0.5) / 3.5)), k = k0 * k0 * (3 - 2 * k0); if (k <= 0) return [x, z];
  const fx = sin(car.yaw), fz = cos(car.yaw), ld = min(12, sp * 0.4), lead = min(12, max(-6, car.v * 0.4)), cx = car.x + fx * (lead - ld), cz = car.z + fz * (lead - ld), px = x - cx, pz = z - cz;
  let ox = px, oz = pz; const dl = Math.hypot(ox, oz); if (dl >= 2.3) return [x, z]; if (dl < 0.02) { ox = fz; oz = -fx; } else { ox /= dl; oz /= dl; } return [x + ox * (2.3 - dl) * k, z + oz * (2.3 - dl) * k]; }
function pplNear(t) { const fr = (v) => v - floor(v), mx = (a, b, k) => a + (b - a) * k;
  for (const c of chunks.values()) { const A = c.pplA; if (!A || abs(c.x - car.x) > 60 || abs(c.z - car.z) > 60) continue; const nM = Math.round(c.nPplM * POP), nW = Math.round((c.nPpl - c.nPplM) * POP);
    for (let k = 0; k < c.nPpl; k++) { if (k < c.nPplM ? k >= nM : k - c.nPplM >= nW) continue; const o = k * 12; let x = A[o], z = A[o + 2]; const spd = A[o + 6], R = A[o + 7], lb = A[o + 11];
      if (abs(x - car.x) > 34 + R || abs(z - car.z) > 34 + R) continue;
      if (spd > 0) { const sd = A[o + 5], yaw = A[o + 3], Tp = mx(9, 19, fr(sd * 31.7)), Pd = (fr(sd * 47.3) >= 0.25 ? 1 : 0) * mx(2.5, 6, fr(sd * 13.9)) * (lb > 0 ? 1 : 0.6), tt = t + sd * 100, cyc = floor(tt / Tp), mv = Tp - Pd, tw = cyc * mv + min(tt - cyc * Tp, mv);
        if (lb > 0) { const dl = fr(sd * 7.77) > 0.5 ? 1 : -1; let hx = R + dl * 0.22, hz = lb + dl * 0.22; const r = min(hx, hz, 0.8), per = 4 * (hx + hz - 2 * r) + TAU * r; let d = fr(spd * tw / per + sd * 3) * per, pu = 0, pv = 0, q = 0;
          for (let j = 0; j < 4; j++) { const ls = 2 * (hz - r); if (d < ls) { pu = hx; pv = d - (hz - r); break; } d -= ls; if (d < 1.5708 * r) { const f = d / r; pu = hx - r + r * cos(f); pv = hz - r + r * sin(f); break; } d -= 1.5708 * r; const sw = hx; hx = hz; hz = sw; q++; }
          const th = q * 1.5708, lx = (pu * cos(th) - pv * sin(th)) * dl, lz = pu * sin(th) + pv * cos(th); x += lx * cos(yaw) + lz * sin(yaw); z += -lx * sin(yaw) + lz * cos(yaw); }
        else { const u = fr(tw / (2 * R / spd) + sd), s = R * (1 - abs(2 * u - 1)); x += sin(yaw) * s; z += cos(yaw) * s; } }
      if (abs(x - car.x) < 14 && abs(z - car.z) < 14) { const q = spd < 0 ? [x, z] : dodged(x, z); PNEAR.push(q[0], q[1]); } } } }
// Shrubs and saplings under the car are pressed flat, and stand up again slowly once it has gone. CRUSH: up to eight of them at a time, each
// [x, z, how far down 0..1, its reach]; the shaders bend every leaf and twig near such a place down toward the ground by that much.
const CRUSH = []; for (let i = 0; i < 8; i++) CRUSH.push([0, 0, 0, 1]);
function crushRecover(dt) { for (const q of CRUSH) q[2] = max(0, q[2] - dt / 9); }      // nine seconds to stand up again (every frame, whoever is steering - see main.js)
function crush(dt) {
  if (abs(car.v) < 0.3) return;
  for (const c of chunks.values()) { if (abs(c.x - car.x) > 40 || abs(c.z - car.z) > 40) continue; const A = c.soft;
    for (let i = 0; i < A.length; i += 3) { if (hypot(car.x - A[i], car.z - A[i + 1]) > A[i + 2] * 0.75 + 0.9) continue;
      let q = CRUSH.find((k) => k[0] === A[i] && k[1] === A[i + 1]); if (!q) { q = CRUSH[0]; for (const k of CRUSH) if (k[2] < q[2]) q = k; q[0] = A[i]; q[1] = A[i + 1]; q[3] = A[i + 2] * 1.15; }
      q[2] = min(1, q[2] + dt * 6 + dt / 9); } }
}
