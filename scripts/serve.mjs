// Serve dist/ on the local network and relay phone controllers to the game: bun run serve
// The game (host) shows a QR code; a phone that scans it opens pad.html and becomes a joystick.
import os from 'node:os';
import QRCode from 'qrcode';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const port = +(process.env.PORT || 8080);
const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address)
  .sort((a, b) => (/^192\.168\./.test(b) - /^192\.168\./.test(a)));
const base = ips.length ? `http://${ips[0]}:${port}/` : `http://localhost:${port}/`;
// phones need HTTPS for tilt steering (motion sensors only work on secure pages): self-signed certificate made once with openssl
const sport = +(process.env.HTTPS_PORT || 8443);
function makeCert() {
  const dir = new URL('./.cert/', import.meta.url).pathname, key = dir + 'key.pem', crt = dir + 'cert.pem', tag = dir + 'ips.txt';
  const want = ['localhost', ...ips].join(',');
  if (fs.existsSync(key) && fs.existsSync(crt) && fs.existsSync(tag) && fs.readFileSync(tag, 'utf8') === want) return { key: fs.readFileSync(key), cert: fs.readFileSync(crt) };
  try {
    fs.mkdirSync(dir, { recursive: true });
    const san = ['DNS:localhost', ...ips.map((ip) => 'IP:' + ip)].join(',');
    fs.writeFileSync(dir + 'openssl.cnf', `[req]\ndistinguished_name=dn\nx509_extensions=v3\nprompt=no\n[dn]\nCN=Endless\n[v3]\nsubjectAltName=${san}\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`);
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '800', '-config', dir + 'openssl.cnf'], { stdio: 'ignore' });
    fs.writeFileSync(tag, want);
    return { key: fs.readFileSync(key), cert: fs.readFileSync(crt) };
  } catch (e) { console.log('(no openssl: phone joystick runs without HTTPS, tilt steering will be unavailable)'); return null; }
}
const tls = makeCert();
const padBase = tls && ips.length ? `https://${ips[0]}:${sport}/` : base;

const rooms = new Map(); // code -> { host, pads:Set }
const newCode = () => { let c; do c = String(Math.floor(1000 + Math.random() * 9000)); while (rooms.has(c)); return c; };

const app = {
  hostname: '0.0.0.0',
  async fetch(req, server) {
    const url = new URL(req.url);
    let p = decodeURIComponent(url.pathname);
    if (p === '/ws') {
      const role = url.searchParams.get('role'), room = url.searchParams.get('room') || '';
      return server.upgrade(req, { data: { role, room } }) ? undefined : new Response('Upgrade failed', { status: 400 });
    }
    if (p === '/lan.json') return Response.json({ url: base, pad: padBase + 'pad.html' });
    if (p.endsWith('/')) p += 'index.html';
    if (p.includes('..')) return new Response('Bad request', { status: 400 });
    const f = Bun.file(new URL(`../dist${p}`, import.meta.url).pathname);
    return (await f.exists()) ? new Response(f, { headers: { 'Cache-Control': 'no-store' } }) : new Response('Not found', { status: 404 });
  },
  websocket: {
    open(ws) {
      const d = ws.data;
      if (d.role === 'host') {
        d.room = newCode(); rooms.set(d.room, { host: ws, pads: new Set() });
        ws.send(JSON.stringify({ t: 'room', room: d.room }));
      } else {
        const r = rooms.get(d.room);
        if (!r) { ws.send(JSON.stringify({ t: 'err', msg: 'ไม่พบเกม ลองสแกน QR ใหม่' })); ws.close(); return; }
        r.pads.add(ws); ws.send(JSON.stringify({ t: 'ok' }));
        r.host.send(JSON.stringify({ t: 'pads', n: r.pads.size }));
      }
    },
    message(ws, msg) {
      const r = rooms.get(ws.data.room); if (!r) return;
      if (ws.data.role === 'host') { for (const p of r.pads) p.send(msg); } // state for the phones
      else r.host.send(msg);                                                // input for the game
    },
    close(ws) {
      const r = rooms.get(ws.data.room); if (!r) return;
      if (ws.data.role === 'host') { for (const p of r.pads) p.send(JSON.stringify({ t: 'err', msg: 'เกมถูกปิดแล้ว' })); rooms.delete(ws.data.room); }
      else { r.pads.delete(ws); r.host.send(JSON.stringify({ t: 'pads', n: r.pads.size })); }
    },
  },
};
Bun.serve({ ...app, port });
if (tls) Bun.serve({ ...app, port: sport, tls });
console.log(`Endless: http://localhost:${port}`);
console.log('Open the game on this computer, then scan the QR code in the game menu with your phone (same Wi-Fi).');
if (tls) console.log(`Phone joystick uses ${padBase} (self-signed): on the warning page tap "Show details" -> "visit this website" / "Advanced" -> "Proceed" once.`);
if (ips.length) console.log(`  computer on the LAN: ${base}\n` + await QRCode.toString(base, { type: 'terminal', small: true }));
