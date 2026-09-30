const TREE_URL = 'https://api.github.com/repos/Hexorod/ugs/git/trees/main?recursive=1';

function gameName(path) {
  const file = path.split('/').pop().replace(/\.html?$/i, '').replace(/^cl/i, '');
  return file
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d+)/g, '$1 $2')
    .replace(/(\d+)([A-Za-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled game';
}

export async function onRequestGet() {
  const cache = caches.default;
  const cacheKey = new Request('https://web-lab.internal/catalog/ugs-v1');
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const source = await fetch(TREE_URL, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'WebLab-GameCatalog/1.0' }
  });
  if (!source.ok) return new Response('Game catalog is temporarily unavailable.', { status: 502 });
  const data = await source.json();
  const games = (data.tree || [])
    .filter(item => item.type === 'blob' && /\.html?$/i.test(item.path))
    .map(item => ({ name: gameName(item.path), path: item.path, size: item.size || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const response = new Response(JSON.stringify(games), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600, s-maxage=86400', 'x-content-type-options': 'nosniff' }
  });
  await cache.put(cacheKey, response.clone());
  return response;
}
