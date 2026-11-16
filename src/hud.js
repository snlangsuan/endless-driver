// ===== HTML HUD: gauges, region banner, toasts, buttons, mirror frame =====
const $ = (id) => document.getElementById(id);
const WICON = { clear: 'ท้องฟ้าแจ่มใส', rain: 'ฝนตก', snow: 'หิมะตก', petals: 'กลีบดอกไม้ปลิว', leaves: 'ใบไม้ร่วง' };

export class HUD {
  constructor() {
    this.dials = $('dials'); this.g = this.dials.getContext('2d');
    this.toastT = null; this.bannerT = null; this.frame = 0;
  }
  toast(msg) {
    const el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => el.classList.remove('show'), 2200);
  }
  region(name, season, weather) {
    $('rname').textContent = name; $('rsub').textContent = season + ' · ' + (WICON[weather] || '');
    const b = $('banner');
    b.innerHTML = `<div class="b1">${name}</div><div class="b2">${season} · ${WICON[weather] || ''}</div>`;
    b.classList.add('show'); clearTimeout(this.bannerT); this.bannerT = setTimeout(() => b.classList.remove('show'), 4500);
  }
  btn(name, on) { document.querySelectorAll(`[data-a="${name}"]`).forEach((e) => e.classList.toggle('active', !!on)); }
  val(name, text) { document.querySelectorAll(`[data-v="${name}"]`).forEach((e) => (e.textContent = text)); }
  setLook(i) { for (let k = 0; k < 4; k++) this.btn('l' + k, k === i); }
  setGearbox(auto) { document.body.classList.toggle('mt', !auto); this.btn('gearbox', !auto); }
  mirror(on) { $('mirrorFrame').style.display = on ? 'block' : 'none'; }
  mirrorRect() {
    const w = Math.round(Math.min(innerWidth * 0.3, 380)), h = Math.round(w * 0.27);
    const x = Math.round(innerWidth / 2 - w / 2), y = Math.round(innerHeight * 0.03);
    const f = $('mirrorFrame');
    if (this._mr !== `${x},${y},${w},${h}`) {
      this._mr = `${x},${y},${w},${h}`;
      Object.assign(f.style, { left: x - 5 + 'px', top: y - 5 + 'px', width: w + 'px', height: h + 'px' });
    }
    return { x, y, w, h };
  }
  update(d) {
    $('clock').textContent = d.clock;
    $('odo').textContent = d.odo.toFixed(1) + ' km';
    if (this.wheelImg) this.wheelImg.style.transform = `rotate(${-d.steer * 115}deg)`;
    if (this.frame++ % 2 && d.blinkL === this._bl && d.blinkR === this._br) return;
    this._bl = d.blinkL; this._br = d.blinkR;
    this.drawDials(d);
  }
  drawDials(d) {
    const g = this.g, W = this.dials.width, H = this.dials.height;
    g.clearRect(0, 0, W, H);
    const dial = (cx, cy, r, frac, ticks, labels, red, center, sub) => {
      const a0 = Math.PI * 0.75, sw = Math.PI * 1.5;
      g.fillStyle = 'rgba(8,10,14,0.72)'; g.beginPath(); g.arc(cx, cy, r + 8, 0, Math.PI * 2); g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.25)'; g.stroke();
      if (red != null) { g.strokeStyle = 'rgba(255,60,40,0.85)'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, r - 4, a0 + sw * red, a0 + sw); g.stroke(); }
      g.strokeStyle = '#dfe6ee'; g.fillStyle = '#dfe6ee'; g.font = `${r * 0.16}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i <= ticks; i++) {
        const a = a0 + sw * (i / ticks), big = i % 2 === 0;
        g.lineWidth = big ? 2.5 : 1.2;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * (r - (big ? 14 : 9)), cy + Math.sin(a) * (r - (big ? 14 : 9))); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke();
        if (big && labels) g.fillText(labels(i), cx + Math.cos(a) * (r - 28), cy + Math.sin(a) * (r - 28));
      }
      const a = a0 + sw * Math.min(1.02, Math.max(0, frac));
      g.strokeStyle = '#ff5a2a'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(cx - Math.cos(a) * 10, cy - Math.sin(a) * 10); g.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6)); g.stroke();
      g.fillStyle = '#222'; g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = `bold ${r * 0.36}px system-ui,sans-serif`; g.fillText(center, cx, cy + r * 0.45);
      g.font = `${r * 0.14}px system-ui,sans-serif`; g.fillStyle = '#9fb0c0'; g.fillText(sub, cx, cy + r * 0.75);
    };
    const rm = d.rpmMax || 10; dial(100, 100, 86, d.rpm / (rm * 1000), rm * 2, (i) => String(i / 2), (d.redline || 8500) / (rm * 1000), d.gear, (d.auto ? 'AT' : 'MT') + ' ×1000rpm');
    const km = d.kmhMax || 240, step = km > 260 ? 20 : 10;
    dial(W - 100, 100, 86, d.kmh / km, km / step, (i) => String(i * step), null, Math.round(d.kmh), 'km/h');
    if (d.setSpeed) { // set-speed marker on the speedometer + label
      const cx = W - 100, cy = 100, r = 86, a = Math.PI * 0.75 + Math.PI * 1.5 * Math.min(1, d.setSpeed / (d.kmhMax || 240));
      g.fillStyle = '#3dff6a'; g.beginPath();
      g.moveTo(cx + Math.cos(a) * (r + 7), cy + Math.sin(a) * (r + 7));
      g.lineTo(cx + Math.cos(a - 0.06) * (r + 16), cy + Math.sin(a - 0.06) * (r + 16));
      g.lineTo(cx + Math.cos(a + 0.06) * (r + 16), cy + Math.sin(a + 0.06) * (r + 16)); g.fill();
      g.font = 'bold 13px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('SET ' + d.setSpeed, cx, cy - 34);
      if (d.follow >= 0) { // following a car ahead: car symbol + distance
        g.fillStyle = '#5fd0ff'; g.fillRect(cx - 34, cy - 58, 14, 8); g.fillRect(cx - 31, cy - 62, 8, 5);
        g.font = 'bold 12px system-ui,sans-serif'; g.textAlign = 'left'; g.fillText(Math.round(d.follow) + ' m', cx - 15, cy - 53); g.textAlign = 'center';
      }
    }
    // indicators
    g.font = 'bold 15px system-ui,sans-serif'; g.textAlign = 'center';
    g.fillStyle = d.autopilot ? '#5fe08a' : 'rgba(255,255,255,0.18)'; g.fillText('AUTO', W / 2, 46);
    g.fillStyle = d.brk > 0 ? '#ff5544' : 'rgba(255,255,255,0.18)'; g.fillText('BRAKE', W / 2, 68);
    g.fillStyle = d.cruise ? '#3dff6a' : 'rgba(255,255,255,0.18)'; g.fillText('CRUISE', W / 2, 186);
    g.fillStyle = d.day < 0.55 ? '#7ec8ff' : 'rgba(255,255,255,0.18)'; g.fillText('◐ ไฟ', W / 2, 88);
    // turn-signal arrows
    const arrow = (cx, dir, on) => {
      g.fillStyle = on ? '#3dff6a' : 'rgba(255,255,255,0.13)';
      g.beginPath(); g.moveTo(cx + dir * 14, 16); g.lineTo(cx, 6); g.lineTo(cx, 12); g.lineTo(cx - dir * 12, 12); g.lineTo(cx - dir * 12, 20); g.lineTo(cx, 20); g.lineTo(cx, 26); g.closePath(); g.fill();
    };
    arrow(W / 2 - 22, -1, d.blinkL); arrow(W / 2 + 22, 1, d.blinkR);
    // throttle bar
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(W / 2 - 6, 110, 12, 70);
    g.fillStyle = '#5fe08a'; g.fillRect(W / 2 - 6, 180 - 70 * d.thr, 12, 70 * d.thr);
  }
}
