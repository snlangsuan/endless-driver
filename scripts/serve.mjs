// Serves the game for playing on this machine: http://localhost:8080 (the drive) and http://localhost:8080/loykrathong.
// The pages, and the files they load (endless.css, src/*.js, shaders/*.wgsl), all come from engine/.
import { normalize } from 'node:path';
const pages = { '/': 'endless.html', '/endless': 'endless.html', '/loykrathong': 'loykrathong.html' };
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', wgsl: 'text/plain; charset=utf-8', mp3: 'audio/mpeg' };
const port = Number(process.env.PORT) || 8080;
Bun.serve({ port, fetch: async (req) => {
  const path = decodeURIComponent(new URL(req.url).pathname);
  let name = pages[path.replace(/(\.html|\/)$/, '') || '/'];
  if (!name) { name = normalize(path).replace(/^[/\\]+/, ''); if (name.startsWith('..') || !/^[\w./-]+$/.test(name)) return new Response('not found', { status: 404 }); }   // nothing outside engine/
  const file = Bun.file(new URL('../engine/' + name, import.meta.url));
  if (!(await file.exists())) return new Response('not found', { status: 404 });
  return new Response(file, { headers: { 'content-type': types[name.split('.').pop()] || 'application/octet-stream', 'cache-control': 'no-store' } });
} });
console.log(`Endless: http://localhost:${port}\nLoy Krathong: http://localhost:${port}/loykrathong`);
