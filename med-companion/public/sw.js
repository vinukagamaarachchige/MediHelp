const VERSION = 'companion-v4';
const CONTENT = VERSION + '-content';
const META = VERSION + '-preferences';
const FLAG = new Request(self.location.origin + '/__offline_preference');
const MAX_AGE = 24 * 60 * 60 * 1000;
async function enabled() { return !!(await (await caches.open(META)).match(FLAG)); }
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('companion-') && ![CONTENT,META].includes(key)) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
 if (!['ENABLE_OFFLINE','CLEAR_OFFLINE','OFFLINE_STATUS'].includes(event.data?.type) || !event.source?.url || new URL(event.source.url).origin !== self.location.origin) return;
 event.waitUntil((async () => {
  if(event.data.type==='OFFLINE_STATUS'){event.ports[0]?.postMessage({ok:true,enabled:await enabled()});return;}
  if (event.data.type === 'ENABLE_OFFLINE') {
   const response=await fetch('/api/settings',{credentials:'same-origin',cache:'no-store'});
   if(!response.ok || !(await response.json()).deviceAuthorized)throw new Error('Device authorization required');
   await (await caches.open(META)).put(FLAG,new Response('enabled'));
  }
  else { await caches.delete(CONTENT); await caches.delete(META); }
  event.ports[0]?.postMessage({ok:true});
 })().catch(() => event.ports[0]?.postMessage({ok:false})));
});
function cacheable(url, request) {
 if (url.origin !== self.location.origin || request.method !== 'GET') return false;
 if (url.pathname === '/api/medications') return !url.search || url.search === '?active=true';
 if (url.pathname === '/api/schedule') return !url.search || url.search === '?range=week';
 if (url.pathname.startsWith('/api/')) return false;
 return ['/', '/week', '/pillbox', '/offline.html', '/manifest.json', '/icon.svg'].includes(url.pathname) || url.pathname.startsWith('/_next/static/') || (url.pathname.startsWith('/_next/data/') && /\/(index|week|pillbox)\.json$/.test(url.pathname));
}
async function save(cache, request, response) {
 const headers = new Headers(response.headers); headers.set('X-Companion-Saved-At',new Date().toISOString());
 const body=await response.clone().arrayBuffer();
 if(body.byteLength>12*1024*1024)return;
 const keys=await cache.keys();if(keys.length>=200 && !await cache.match(request))await cache.delete(keys[0]);
 await cache.put(request,new Response(body,{status:response.status,statusText:response.statusText,headers}));
}
self.addEventListener('fetch', event => {
 const request=event.request; const url=new URL(request.url);
 if(url.origin===self.location.origin && url.pathname==='/api/settings'){
  event.respondWith((async()=>{
   const response=await fetch(request);
   let revoke=request.method==='DELETE' && url.searchParams.get('forget')==='true';
   if(request.method==='GET' && response.ok){try{revoke=!(await response.clone().json()).deviceAuthorized}catch{}}
   if(revoke){await caches.delete(CONTENT);await caches.delete(META);}
   return response;
  })());return;
 }

 if (request.method !== 'GET' && url.origin === self.location.origin && (url.pathname.startsWith('/api/doses/') || url.pathname.startsWith('/api/medications'))) {
  event.respondWith((async () => {
   const response=await fetch(request);
   if (response.ok && await enabled()) {
    const cache=await caches.open(CONTENT);
    for (const key of await cache.keys()) if (new URL(key.url).pathname.startsWith('/api/')) await cache.delete(key);
   }
   return response;
  })());
  return;
 }
 if (!cacheable(url,request)) return;
 event.respondWith((async () => {
  if (!await enabled()) return fetch(request);
  const cache=await caches.open(CONTENT);
  try {
   const response=await fetch(request);
   if(response.status===401 || response.status===403){await caches.delete(CONTENT);await caches.delete(META);}
   else if (response.ok && await enabled()) await save(cache,request,response);
   return response;
  } catch {
   const saved=await cache.match(request);
   if (saved && Date.now()-new Date(saved.headers.get('X-Companion-Saved-At')).getTime()<MAX_AGE) {
    const headers=new Headers(saved.headers);headers.set('X-Companion-Offline','true');
    return new Response(await saved.arrayBuffer(),{status:saved.status,headers});
   }
   if (request.mode==='navigate') return new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Companion offline</title><main style="font:20px/1.6 system-ui;max-width:550px;margin:60px auto;padding:24px"><h1>📴 Connect to refresh your schedule</h1><p>No recent saved information is available for this page. Reconnect, then open Companion again.</p><a href="/">Try Today again</a></main>',{status:503,headers:{'Content-Type':'text/html'}});
   return new Response(JSON.stringify({error:'No recent offline information is available. Reconnect to refresh.'}),{status:503,headers:{'Content-Type':'application/json'}});
  }
 })());
});
self.addEventListener('push', event => {
 let data={};try{data=event.data.json()}catch{}
 event.waitUntil(self.registration.showNotification(data.title || 'Medication reminder',{body:data.body || 'Open Companion to check your schedule.',icon:'/icon.svg',tag:data.tag || 'med-reminder',data:{url:'/'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil(self.clients.matchAll({type:'window'}).then(clients=>clients.length?clients[0].focus():self.clients.openWindow('/')));
});
