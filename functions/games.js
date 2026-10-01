export async function onRequestGet(context) {
  const cache = caches.default;
  const cacheKey = new Request('https://web-lab.internal/catalog/local-v9');
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const catalogUrl = new URL('/games/catalog.json', context.request.url);
  const source = context.env.ASSETS
    ? await context.env.ASSETS.fetch(new Request(catalogUrl, context.request))
    : await fetch(catalogUrl);
  if (!source.ok) return new Response('Game catalog is temporarily unavailable.', { status: 502 });
  const games = await source.json();
  const response = new Response(JSON.stringify(games), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600, s-maxage=86400', 'x-content-type-options': 'nosniff' }
  });
  await cache.put(cacheKey, response.clone());
  return response;
}
