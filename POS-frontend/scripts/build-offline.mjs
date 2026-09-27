import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const assets=(await readdir(new URL('../dist/assets/',import.meta.url))).map(file=>'/assets/'+file);
const files=['/index.html',...assets];
const version=createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0,16);
await writeFile(new URL('../dist/sw.js',import.meta.url),`
const CACHE='lacasa-shell-${version}';
const FILES=${JSON.stringify(files)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('lacasa-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/menu'))return;
 if(event.request.mode==='navigate'){
  // Use the installed shell consistently with its bundled assets; new releases activate after tabs close.
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match('/index.html'))||fetch(event.request)));return;
 }
 if(FILES.includes(url.pathname))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))||fetch(event.request)));
});
`);
console.log('Offline shell generated:',version);
