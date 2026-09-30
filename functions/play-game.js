const REPOSITORY_ROOT = 'https://raw.githubusercontent.com/Hexorod/ugs/main/';
const MAX_GAME_BYTES = 35 * 1024 * 1024;

function validPath(path) {
  return typeof path === 'string' && path.length <= 240 && /\.html?$/i.test(path) &&
    !path.includes('..') && !path.startsWith('/') && !path.includes('\\') &&
    path.split('/').every(part => part && !part.startsWith('.'));
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const path = requestUrl.searchParams.get('path');
  if (!validPath(path)) return new Response('Invalid game path.', { status: 400 });
  const sourceUrl = REPOSITORY_ROOT + path.split('/').map(encodeURIComponent).join('/');
  try {
    const source = await fetch(sourceUrl, {
      redirect: 'follow',
      headers: { accept: 'text/html', 'user-agent': 'WebLab-GameLoader/1.0' }
    });
    if (!source.ok) return new Response('Game file not found.', { status: source.status === 404 ? 404 : 502 });
    const length = Number(source.headers.get('content-length') || 0);
    if (length > MAX_GAME_BYTES) return new Response('This game is too large to stream safely.', { status: 413 });
    return new Response(source.body, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=3600, s-maxage=86400',
        'content-security-policy': "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self';",
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff'
      }
    });
  } catch (_) {
    return new Response('The game source could not be reached.', { status: 502 });
  }
}
