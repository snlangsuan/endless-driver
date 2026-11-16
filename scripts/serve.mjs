// Serves the game for playing on this machine: http://localhost:8080
const file = new URL('../engine/endless.html', import.meta.url);
const port = Number(process.env.PORT) || 8080;
Bun.serve({ port, fetch: () => new Response(Bun.file(file), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }) });
console.log(`Endless: http://localhost:${port}`);
