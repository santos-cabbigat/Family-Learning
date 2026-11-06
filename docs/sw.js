const CACHE='family-learning-0.2.1-levela-fit';
const BASE=new URL('./',self.location).pathname;
const ASSETS=['','index.html','style.css','app.js','core.js','store.js','drive.js','install.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','config.json','lessons.js','learning-core.js','lesson-store.js','lessons.css','vendor/fflate.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(p=>BASE+p)))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('family-learning-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='APPLY_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE)||url.pathname.endsWith('/version.json')||url.pathname.endsWith('/sw.js'))return;
 if(event.request.mode==='navigate'){event.respondWith(caches.match(BASE+'index.html').then(cached=>cached||fetch(event.request)));return;}
 if(ASSETS.some(p=>url.pathname===BASE+p))event.respondWith(caches.match(event.request,{ignoreSearch:true}).then(cached=>cached||fetch(event.request)));
});
