const SCRIPT = `const CACHE_NAME='web-lab-active-game-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||(url.pathname!=='/play-game'&&!url.pathname.startsWith('/games/files/')))return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache=>{
    const saved=await cache.match(event.request);
    if(saved)return saved;
    const response=await fetch(event.request);
    if(response.ok)await cache.put(event.request,response.clone());
    return response;
  }));
});`;

export function onRequestGet() {
  return new Response(SCRIPT, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-cache',
      'service-worker-allowed': '/',
      'x-content-type-options': 'nosniff'
    }
  });
}
