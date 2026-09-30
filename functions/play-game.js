const REPOSITORY_ROOT = 'https://raw.githubusercontent.com/Hexorod/ugs/main/';
const MAX_GAME_BYTES = 35 * 1024 * 1024;
const BRIDGE_TAG = '<script src="/game-bridge"></script>';

function prependStream(stream, prefix) {
  const reader = stream.getReader();
  const first = new TextEncoder().encode(prefix);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(first);
      const pump = () => reader.read().then(({ done, value }) => {
        if (done) return controller.close();
        controller.enqueue(value);
        return pump();
      }).catch(error => controller.error(error));
      return pump();
    },
    cancel(reason) { return reader.cancel(reason); }
  });
}

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
    const metadata = await fetch(sourceUrl, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { accept: 'text/html', 'user-agent': 'WebLab-GameLoader/1.0' }
    });
    const length = Number(metadata.headers.get('content-length') || 0);
    if (length > MAX_GAME_BYTES) return new Response('This game is too large to stream safely.', { status: 413 });
    const source = await fetch(sourceUrl, {
      redirect: 'follow',
      headers: { accept: 'text/html', 'user-agent': 'WebLab-GameLoader/1.0' }
    });
    if (!source.ok) return new Response('Game file not found.', { status: source.status === 404 ? 404 : 502 });
    let body = source.body;
    if (/pokemon/i.test(path) || (length > 0 && length <= 5 * 1024 * 1024)) {
      const html = await source.text();
      body = BRIDGE_TAG + html.replace(/window\.parent\.maeExportApis_\(\);?/g, '');
    } else {
      body = prependStream(body, BRIDGE_TAG);
    }
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
    return new Response('The game source could not be reached.', { status: 502 });
  }
}
