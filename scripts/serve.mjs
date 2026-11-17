// Serves the pages for playing on this machine: http://localhost:8080 (the drive) and http://localhost:8080/loykrathong
const pages = { '/': 'endless.html', '/endless': 'endless.html', '/loykrathong': 'loykrathong.html' };
const port = Number(process.env.PORT) || 8080;
Bun.serve({ port, fetch: (req) => {
  const name = pages[new URL(req.url).pathname.replace(/(\.html|\/)$/, '') || '/'];
  if (!name) return new Response('not found', { status: 404 });
  return new Response(Bun.file(new URL('../engine/' + name, import.meta.url)), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
} });
console.log(`Endless: http://localhost:${port}\nLoy Krathong: http://localhost:${port}/loykrathong`);
