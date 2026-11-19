// Serves the games on this machine (bun run serve to play, bun run dev to work on them: the page then follows the files as they are saved): http://localhost:8080 (the drive), http://localhost:8080/ruin (the dead city) and http://localhost:8080/loykrathong.
// The pages, and the files they load (endless.css, src/*.js, shaders/*.wgsl, ruin/*), all come from engine/.
import { normalize } from 'node:path';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
const pages = { '/': 'endless.html', '/endless': 'endless.html', '/loykrathong': 'loykrathong.html', '/ruin': 'ruin.html' };
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', wgsl: 'text/plain; charset=utf-8', mp3: 'audio/mpeg' };
const port = Number(process.env.PORT) || 8080;
// Live reload: the page is told when a file in engine/ is saved, over a connection it keeps open (/__live), and loads itself again - a style sheet is
// swapped in where it is, without that. The few lines that listen are added to each page as it is sent, so nothing of this is in the game's own files,
// except that a page may have a liveKeep() to put aside what should outlast the reload (src/input.js: where the car is, the hour, the weather).
// A server started again says so with a new id, and the pages still open from the one before load themselves again too. All of it is only there
// when started with --dev (bun run dev); bun run serve is the plain server, for playing.
const live = process.argv.includes('--dev'), id = Date.now().toString(36), enc = new TextEncoder(), pagesOpen = new Set();
const tell = (m) => { for (const c of pagesOpen) { try { c.enqueue(enc.encode(`data: ${m}\n\n`)); } catch (e) { pagesOpen.delete(c); } } };
const LISTEN = `<script>(() => { let id = null;
  const go = () => { try { if (typeof liveKeep === 'function') liveKeep(); } catch (e) {} location.reload(); };
  new EventSource('/__live').onmessage = (e) => { const [k, v] = e.data.split(' ');
    if (k === 'hello') { if (id && id !== v) go(); id = v; }
    else if (k === 'css') { for (const l of document.querySelectorAll('link[rel=stylesheet]')) { const u = new URL(l.href); if (u.origin === location.origin) { u.searchParams.set('t', Date.now()); l.href = u; } } }
    else go(); };
})();</script>`;
if (live) { let wait = 0, all = false;      // (an editor saves in several steps, and several files may be saved together: one message for the lot)
  watch(fileURLToPath(new URL('../engine/', import.meta.url)), { recursive: true }, (ev, f) => {
    if (!f || !/\.(html|js|css|wgsl)$/.test(f) || /(^|[/\\])\./.test(f)) return;
    if (!f.endsWith('.css')) all = true;
    clearTimeout(wait); wait = setTimeout(() => { tell(all ? 'reload' : 'css'); console.log(`${new Date().toLocaleTimeString()}  ${f}  ->  ${all ? 'reload' : 'css'}  (${pagesOpen.size})`); all = false; }, 250);
  });
  setInterval(() => tell('hello ' + id), 20000);      // (also keeps the connection from being dropped as idle by anything in between)
}
Bun.serve({ port, idleTimeout: 0, fetch: async (req) => {
  const path = decodeURIComponent(new URL(req.url).pathname);
  if (live && path === '/__live') { let c;
    return new Response(new ReadableStream({ start(k) { c = k; pagesOpen.add(c); c.enqueue(enc.encode(`retry: 700\ndata: hello ${id}\n\n`)); }, cancel() { pagesOpen.delete(c); } }),
      { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } }); }
  let name = pages[path.replace(/(\.html|\/)$/, '') || '/'];
  if (!name) { name = normalize(path).replace(/^[/\\]+/, ''); if (name.startsWith('..') || !/^[\w./-]+$/.test(name)) return new Response('not found', { status: 404 }); }   // nothing outside engine/
  const file = Bun.file(new URL('../engine/' + name, import.meta.url));
  if (!(await file.exists())) return new Response('not found', { status: 404 });
  const headers = { 'content-type': types[name.split('.').pop()] || 'application/octet-stream', 'cache-control': 'no-store' };
  if (live && name.endsWith('.html')) { const t = await file.text(), i = t.lastIndexOf('</body>'); return new Response(i < 0 ? t + LISTEN : t.slice(0, i) + LISTEN + '\n' + t.slice(i), { headers }); }
  return new Response(file, { headers });
} });
console.log(`${live ? 'live reload on\n' : ''}Endless: http://localhost:${port}\nRuin: http://localhost:${port}/ruin\nLoy Krathong: http://localhost:${port}/loykrathong`);
