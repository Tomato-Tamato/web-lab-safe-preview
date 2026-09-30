const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;

function textResponse(message, status) {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function isBlockedHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1' || host.startsWith('fc') || host.startsWith('fd') || /^fe[89ab]/.test(host)) return true;

  const parts = host.split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d+$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some(value => value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19));
}

function parseTarget(value) {
  let target;
  try { target = new URL(value); } catch (_) { throw new Error('Enter a valid website URL.'); }
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.');
  if (target.username || target.password) throw new Error('URLs containing usernames or passwords are blocked.');
  if (isBlockedHostname(target.hostname)) throw new Error('Private and local network addresses are blocked.');
  target.hash = '';
  return target;
}

function sanitizeHtml(html, finalUrl, proxyOrigin, nonce) {
  const escapedUrl = finalUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  let safe = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/<form\b[^>]*>/gi, '<div class="proxy-disabled-form">')
    .replace(/<\/form\s*>/gi, '</div>');
  safe = safe.replace(/<a\b[^>]*>/gi, tag => {
    const withoutTarget = tag.replace(/\s(?:target|download)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    return withoutTarget.replace(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i, (attribute, doubleQuoted, singleQuoted, bare) => {
      const href = doubleQuoted ?? singleQuoted ?? bare ?? '';
      try {
        const destination = new URL(href.replace(/&amp;/gi, '&'), finalUrl);
        if (!['http:', 'https:'].includes(destination.protocol)) return ' href="#"';
        return ` href="${proxyOrigin}/proxy?url=${encodeURIComponent(destination.href)}"`;
      } catch (_) { return ' href="#"'; }
    });
  });
  const head = `<base href="${escapedUrl}"><style>#safe-proxy-banner{position:sticky;top:0;z-index:2147483647;padding:10px 14px;background:#132238;color:#e8fff8;border-bottom:1px solid #2dd4a8;font:13px/1.4 system-ui,sans-serif}#safe-proxy-banner strong{color:#61e8c4}.proxy-disabled-form{outline:1px dashed #d29a3a}</style>`;
  const banner = `<div id="safe-proxy-banner"><strong>Safe proxy preview</strong> — scripts, sign-ins, forms, cookies, and private-network access are disabled.</div>`;
  const reporter = `<script nonce="${nonce}">(()=>{const report=()=>{const target=new URL(location.href).searchParams.get('url');if(target)parent.postMessage({type:'web-lab-proxy-location',url:target},'*')};document.addEventListener('click',event=>{const link=event.target.closest&&event.target.closest('a[href]');if(!link)return;try{const target=new URL(link.href).searchParams.get('url');if(target)parent.postMessage({type:'web-lab-proxy-location',url:target},'*')}catch(_){}});report()})()</script>`;
  safe = /<head\b[^>]*>/i.test(safe) ? safe.replace(/<head\b[^>]*>/i, match => `${match}${head}`) : `${head}${safe}`;
  safe = /<body\b[^>]*>/i.test(safe) ? safe.replace(/<body\b[^>]*>/i, match => `${match}${banner}`) : `${banner}${safe}`;
  return /<\/body\s*>/i.test(safe) ? safe.replace(/<\/body\s*>/i, `${reporter}</body>`) : `${safe}${reporter}`;
}

async function fetchTarget(initialTarget) {
  let target = initialTarget;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response;
    try {
      response = await fetch(target.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: 'text/html,application/xhtml+xml,text/plain;q=0.9', 'user-agent': 'WebLab-SafePreview/1.0' }
      });
    } finally { clearTimeout(timer); }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return response;
      if (redirect === MAX_REDIRECTS) throw new Error('Too many redirects.');
      target = parseTarget(new URL(location, target).href);
      continue;
    }
    return { response, target };
  }
  throw new Error('Too many redirects.');
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const rawTarget = requestUrl.searchParams.get('url');
  if (!rawTarget) return textResponse('Missing url parameter.', 400);

  try {
    const initialTarget = parseTarget(rawTarget);
    const result = await fetchTarget(initialTarget);
    const response = result.response || result;
    const finalTarget = result.target || initialTarget;
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!['text/html', 'application/xhtml+xml', 'text/plain'].some(type => contentType.startsWith(type))) {
      return textResponse('This safe preview only supports HTML and plain-text pages.', 415);
    }
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_BYTES) return textResponse('The page is too large for safe preview.', 413);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return textResponse('The page is too large for safe preview.', 413);
    const decoded = new TextDecoder().decode(bytes);
    const nonce = crypto.randomUUID().replace(/-/g, '');
    const body = contentType.startsWith('text/plain') ? `<pre>${decoded.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>` : sanitizeHtml(decoded, finalTarget.href, requestUrl.origin, nonce);
    return new Response(body, {
      status: response.ok ? 200 : response.status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': `sandbox allow-scripts; default-src 'none'; img-src http: https: data:; style-src 'unsafe-inline' http: https:; font-src http: https: data:; media-src http: https:; script-src 'nonce-${nonce}'; connect-src 'none'; frame-src 'none'; form-action 'none'; object-src 'none'; base-uri http: https:`,
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN'
      }
    });
  } catch (error) {
    const message = error && error.name === 'AbortError' ? 'The remote site took too long to respond.' : (error.message || 'The safe preview failed.');
    const blocked = /blocked|private|local network|username|password/i.test(message);
    return textResponse(message, blocked ? 403 : 502);
  }
}

