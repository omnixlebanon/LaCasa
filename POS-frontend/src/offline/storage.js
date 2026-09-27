let opened;
const updates=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('lacasa-offline-updates');
updates?.unref?.();
if(updates)updates.onmessage=event=>{if(event.data.owner===accountId())window.dispatchEvent(new Event(event.data.snapshot?'offline-snapshot':'offline-change'));};
export function announceSnapshot(){window.dispatchEvent(new Event('offline-snapshot'));updates?.postMessage({owner:accountId(),snapshot:true});}
const request = req => new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
function database() {
 if(!opened) opened = new Promise((resolve,reject)=>{
  const req=indexedDB.open('lacasa-offline-v1',1);
  req.onupgradeneeded=()=>{req.result.createObjectStore('accounts');req.result.createObjectStore('keys');};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 return opened;
}
async function read(store,key){const db=await database();return request(db.transaction(store).objectStore(store).get(key));}
async function write(store,key,value){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite',{durability:'strict'});tx.objectStore(store).put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Local save failed'));tx.onabort=()=>reject(tx.error||new Error('Local save was aborted'));});}
async function encryptionKey(owner){let key=await read('keys',owner);if(!key){key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await write('keys',owner,key);}return key;}
export const accountId = () => { try {const user=JSON.parse(localStorage.getItem('auth_user'));return user?.id ? String(user.id) : null;}catch{return null;} };
export function emptyState(){return {version:1,cache:{},queue:[],archive:[],recovery:[],revision:null,lastSync:null,prepared:false,idMap:{},error:null};}
export function ensureDrafts(state,owner=accountId()) {
 if(state.drafts)return state.drafts;
 const legacyOwner=localStorage.getItem('lacasa-legacy-drafts-owner');
 const legacy=(!legacyOwner||legacyOwner.split(':')[0]===owner.split(':')[0])&&localStorage.getItem('pos_orders');
 if(!legacyOwner)localStorage.setItem('lacasa-legacy-drafts-owner',owner);
 const orders=legacy?JSON.parse(legacy):[];
 state.drafts={orders:orders.map(order=>({...order,checkoutOperationId:order.checkoutOperationId||crypto.randomUUID()})),nextOrder:Number(localStorage.getItem('pos_nextOrder')||1),activeOrderId:legacy?Number(localStorage.getItem('pos_activeOrderId'))||null:null};
 return state.drafts;
}
export async function load(owner=accountId()) {
 if(!owner)throw new Error('Sign in online first.');
 let saved=await read('accounts',owner),keyOwner=owner;
 // Older builds included the email in the key. Keep pending work accessible
 // after an employee changes their email; never overwrite the original copy.
 if(!saved&&!owner.includes(':')){
  const db=await database();const keys=await request(db.transaction('accounts').objectStore('accounts').getAllKeys());
  const legacy=keys.filter(key=>String(key).startsWith(owner+':'));
  if(legacy.length>1)throw Error('Multiple older account backups exist on this device. Export and recover them before continuing.');
  if(legacy.length){keyOwner=legacy[0];saved=await read('accounts',keyOwner);}
 }
 if(!saved)return emptyState();
 const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:saved.iv},await encryptionKey(keyOwner),saved.data);
 return JSON.parse(new TextDecoder().decode(bytes));
}
async function save(owner,state){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await encryptionKey(owner),new TextEncoder().encode(JSON.stringify(state)));await write('accounts',owner,{iv,data});window.dispatchEvent(new Event('offline-change'));updates?.postMessage({owner});}
export async function change(fn,owner=accountId()) {
 if(!owner)throw new Error('Sign in online first.');
 if(!navigator.locks)throw new Error('This browser cannot safely save offline changes. Use a current browser over HTTPS.');
 return navigator.locks.request('lacasa-data-'+owner,async()=>{const state=await load(owner);ensureDrafts(state,owner);const result=await fn(state);await save(owner,state);return result;});
}
export async function exportBackup() {
 const owner=accountId();const state=await load(owner);
 const blob=new Blob([JSON.stringify({app:'LaCasa',version:1,owner,exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='lacasa-offline-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function restoreBackup(file) {
 const backup=JSON.parse(await file.text());const saved=backup.state;
 if(backup.app!=='LaCasa'||backup.version!==1||String(backup.owner).split(':')[0]!==accountId()||!Array.isArray(saved?.queue)||!Array.isArray(saved?.archive)||!saved.cache||!saved.idMap||!Array.isArray(saved.drafts?.orders)||saved.queue.some(op=>!/^[-a-f0-9]{36}$/i.test(op.id)||!op.url?.startsWith('/api/')||!['post','put','patch','delete'].includes(op.method)))throw Error('Backup belongs to a different account or is invalid.');
 await change(state=>{
  if(state.queue.length||state.drafts.orders.length)throw Error('Export and synchronize pending changes, and finish open carts before restoring.');
  for(const key of ['cache','queue','revision','lastSync','prepared','idMap','drafts'])state[key]=saved[key];
  state.archive=[...new Map([...saved.archive,...state.archive].map(op=>[op.id,op])).values()];
  state.recovery=[...(state.recovery||[]),...(saved.recovery||[])];
  state.error='Backup restored. Reconnect to verify pending operations.';
 });
}
