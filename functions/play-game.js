const MAX_GAME_BYTES = 24 * 1024 * 1024;
const BRIDGE_TAG = '<script src="/game-bridge"></script>';
const FIT_STYLE = '<style id="web-lab-fit">html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#000}body>canvas,body>iframe,#game,#canvas,.game-container{max-width:100%;max-height:100%;pointer-events:auto}canvas{image-rendering:auto;touch-action:none}</style>';
const STANDALONE_CONTROLS = '<style id="web-lab-standalone">#web-lab-back{position:fixed;z-index:2147483647;top:10px;left:10px;padding:8px 11px;border:1px solid #668177;border-radius:8px;background:rgba(5,9,13,.88);color:#eafff6;font:700 13px system-ui;text-decoration:none;opacity:.35;transition:opacity .15s}#web-lab-back:hover,#web-lab-back:focus{opacity:1}</style><a id="web-lab-back" href="https://web-lab-safe-preview-git.pages.dev/">Back to Web Lab</a>';

function validPath(path) {
  return typeof path === 'string' && path.length <= 240 && /\.html?$/i.test(path) &&
    !path.includes('..') && !path.startsWith('/') && !path.includes('\\') &&
    path.split('/').every(part => part && !part.startsWith('.'));
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const path = requestUrl.searchParams.get('path');
  const standalone = requestUrl.searchParams.get('standalone') === '1';
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
    let cleaned = html.replace(/window\.parent\.maeExportApis_\(\);?/g, '');
    if (standalone) cleaned = /<body[\s>]/i.test(cleaned) ? cleaned.replace(/<body([^>]*)>/i, `<body$1>${STANDALONE_CONTROLS}`) : STANDALONE_CONTROLS + cleaned;
    const body = (standalone ? '' : BRIDGE_TAG) + (/<head[\s>]/i.test(cleaned) ? cleaned.replace(/<head([^>]*)>/i, `<head$1>${FIT_STYLE}`) : FIT_STYLE + cleaned);
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
