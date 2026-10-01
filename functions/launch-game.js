const CACHE_NAME = 'web-lab-active-game-v1';

function validPath(path) {
  return typeof path === 'string' && path.length <= 240 && /\.html?$/i.test(path) &&
    !path.includes('..') && !path.startsWith('/') && !path.includes('\\') &&
    path.split('/').every(part => part && !part.startsWith('.'));
}

export function onRequestGet(context) {
  const url = new URL(context.request.url);
  const path = url.searchParams.get('path');
  if (!validPath(path)) return new Response('Invalid game path.', { status: 400 });
  const standalone = url.searchParams.get('standalone') === '1';
  const playUrl = `/play-game?path=${encodeURIComponent(path)}&runtime=20260930-8${standalone ? '&standalone=1' : ''}`;
  const body = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preparing game</title>
  <style>html,body{height:100%;margin:0;background:#05080d;color:#eef4fb;font:16px system-ui}body{display:grid;place-items:center}.box{text-align:center;padding:28px}.spin{width:26px;height:26px;margin:0 auto 14px;border:3px solid #314154;border-top-color:#8af5c4;border-radius:50%;animation:s .7s linear infinite}@keyframes s{to{transform:rotate(360deg)}}p{color:#9babc0}</style>
  <div class="box"><div class="spin"></div><strong>Downloading game for local play…</strong><p id="status">Preparing browser storage</p></div>
  <script>
  (async()=>{const target=${JSON.stringify(playUrl)},status=document.querySelector('#status');try{
    if(!('serviceWorker'in navigator)||!('caches'in window))throw Error('Local cache unavailable');
    status.textContent='Setting up local game cache';
    await navigator.serviceWorker.register('/game-sw',{scope:'/'});
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)await Promise.race([new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true})),new Promise(resolve=>setTimeout(resolve,1500))]);
    await caches.delete(${JSON.stringify(CACHE_NAME)});
    const cache=await caches.open(${JSON.stringify(CACHE_NAME)});
    status.textContent='Downloading selected game';
    const response=await fetch(target,{cache:'no-store'});
    if(!response.ok)throw Error('Game download failed');
    await cache.put(target,response.clone());
    status.textContent='Starting local copy';
    location.replace(target);
  }catch(error){status.textContent='Local caching is unavailable; starting normally';setTimeout(()=>location.replace(target),600)}})();
  <\/script>`;
  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
