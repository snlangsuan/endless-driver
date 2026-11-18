// Serves the pages for playing on this machine: http://localhost:8080 (the drive) and http://localhost:8080/loykrathong
const pages = { '/': 'endless.html', '/endless': 'endless.html', '/loykrathong': 'loykrathong.html' };
const port = Number(process.env.PORT) || 8080;
Bun.serve({ port, fetch: (req) => {
  const path = new URL(req.url).pathname;
  if (path === '/loykrathong.mp3') { const f = Bun.file(new URL('../engine/loykrathong.mp3', import.meta.url)); return f.exists().then((ok) => (ok ? new Response(f, { headers: { 'content-type': 'audio/mpeg' } }) : new Response('not found', { status: 404 }))); }      // your own recording, if you put one there
  if (path === '/engine.js') return new Response(Bun.file(new URL('../engine/engine.js', import.meta.url)), { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } });      // the engine both pages load
  const name = pages[new URL(req.url).pathname.replace(/(\.html|\/)$/, '') || '/'];
  if (!name) return new Response('not found', { status: 404 });
  return new Response(Bun.file(new URL('../engine/' + name, import.meta.url)), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
} });
console.log(`Endless: http://localhost:${port}\nLoy Krathong: http://localhost:${port}/loykrathong`);
