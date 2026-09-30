const MAX_GAME_BYTES = 24 * 1024 * 1024;
const BRIDGE_TAG = '<script src="/game-bridge"></script>';

function validPath(path) {
  return typeof path === 'string' && path.length <= 240 && /\.html?$/i.test(path) &&
    !path.includes('..') && !path.startsWith('/') && !path.includes('\\') &&
    path.split('/').every(part => part && !part.startsWith('.'));
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const path = requestUrl.searchParams.get('path');
  if (!validPath(path)) return new Response('Invalid game path.', { status: 400 });
  try {
    const assetPath = '/games/files/' + path.split('/').map(encodeURIComponent).join('/');
    const assetUrl = new URL(assetPath, context.request.url);
    let source = context.env.ASSETS
      ? await context.env.ASSETS.fetch(assetUrl.href)
      : await fetch(assetUrl);
    if (!source.ok && context.env.ASSETS) source = await fetch(assetUrl);
    if (!source.ok) return new Response('Game file not found.', { status: source.status === 404 ? 404 : 502 });
    const length = Number(source.headers.get('content-length') || 0);
    if (length > MAX_GAME_BYTES) return new Response('This game is too large to run on this host.', { status: 413 });
    const html = await source.text();
    const body = BRIDGE_TAG + html.replace(/window\.parent\.maeExportApis_\(\);?/g, '');
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=300, s-maxage=3600',
        'content-security-policy': "default-src * data: blob:; script-src * data: blob: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; worker-src * data: blob:; connect-src * data: blob: ws: wss:; frame-ancestors https://web-lab-safe-preview-git.pages.dev https://*.web-lab-safe-preview-git.pages.dev;",
        'cross-origin-opener-policy': 'same-origin',
        'cross-origin-embedder-policy': 'credentialless',
        'cross-origin-resource-policy': 'cross-origin',
        'permissions-policy': 'cross-origin-isolated=(self)',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff'
      }
    });
  } catch (_) {
    return new Response('The local game file could not be loaded.', { status: 502 });
  }
}
