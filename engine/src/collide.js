// --------------------------------------------------------------------------------------------------------- what the car meets
// What stops the car (the chunks' col lists) and what it flattens (their soft lists). Used by any game's driving.
// How far a car standing at (x, z), its floor at height y, is into something solid (0: clear of everything). The car is taken as a circle
// 0.85 m across the half; a thing counts if any of it is between the car's sill and its roof (see the chunks: col).
function solidAt(x, z, y) {
  let pen = 0;
  for (const c of chunks.values()) { if (abs(c.x - x) > 46 || abs(c.z - z) > 46) continue; const A = c.col;
    for (let i = 0; i < A.length; i += 8) { const dx = x - A[i], dz = z - A[i + 1], hx = A[i + 4], hz = A[i + 5], rr = hx + hz + 0.85; if (abs(dx) > rr || abs(dz) > rr) continue;
      if (A[i + 6] > y + 1.25 || A[i + 7] < y + 0.45) continue;
      const ex = max(abs(dx * A[i + 2] - dz * A[i + 3]) - hx, 0), ez = max(abs(dx * A[i + 3] + dz * A[i + 2]) - hz, 0), d = 0.85 - Math.sqrt(ex * ex + ez * ez); if (d > pen) pen = d; } }
  return pen;
}
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
