import axios from 'axios';
import { accountId, load, change, announceSnapshot } from './storage.js';
import { keyOf, readLocal, applyLocal, remap } from './model.js';
export const network = axios.create({baseURL:import.meta.env?.VITE_API_URL || (import.meta.env?.DEV?'http://localhost:8080':''),withCredentials:true,timeout:15000});
export let connectionState = 'online';
const announce=()=>window.dispatchEvent(new Event('offline-change'));
const httpError=message=>Object.assign(new Error(message),{response:{data:{error:message}}});
let warming;
// Keep held requests in the encrypted queue and backups, without sending them.
// Related business operations stay together so a skipped prerequisite is never bypassed.
function syncGroup(op){
 const resource=op.url.split('/')[2];
 if(['products','items','stock','checkout','history','seating','open-orders','management'].includes(resource))return 'sales-stock-tables';
 if(['employees','shifts','recurring-shifts'].includes(resource))return 'employees-shifts';
 return resource;
}
export function activePending(state){
 const held=new Set(state.queue.filter(op=>op.deferred).map(syncGroup));
 return state.queue.find(op=>!op.deferred&&!held.has(syncGroup(op)));
}
export function isWaitingOnHeld(state,op){return !op.deferred&&state.queue.some(held=>held.deferred&&syncGroup(held)===syncGroup(op));}
export async function leavePendingUnsynced(id){
 const owner=accountId();
 await navigator.locks.request('lacasa-sync-'+owner,async()=>{
  await change(state=>{
   const op=activePending(state);
   if(!op||op.id!==id||!op.problem)throw Error('This request changed. Reopen the sync panel.');
   op.deferred=true;op.deferredAt=new Date().toISOString();state.error=null;
  },owner);
 });
 await syncPending();
}
export async function resumeHeld(id){
 const owner=accountId();
 await navigator.locks.request('lacasa-sync-'+owner,async()=>{
  await change(state=>{
   const op=state.queue.find(pending=>pending.id===id&&pending.deferred);
   if(!op)throw Error('This saved request is no longer on hold.');
   op.deferred=false;op.blocked=true;
   op.problem='Review this saved request before retrying. '+(op.problem||'');
  },owner);
 });
 announce();
}

function isAuth(url){return url.startsWith('/api/auth/')||url.startsWith('/api/public/');}
function response(config,data,status=200){return {data,status,statusText:'Saved on this device',headers:{},config};}
function draftOperation(order,method='put'){
 return {id:crypto.randomUUID(),tempId:-(Date.now()*1000+Math.floor(Math.random()*1000)),method,url:'/api/open-orders/'+order.checkoutOperationId,data:method==='put'?{order:structuredClone(order)}:{},createdAt:new Date().toISOString()};
}
export async function saveDraftEdit(fn){
 const result=await change(state=>{
  if(!state.prepared)throw Error('Prepare offline data in Sync before editing orders.');
  const before=new Map(state.drafts.orders.map(order=>[order.checkoutOperationId,JSON.stringify(order)]));
  const result=fn(state.drafts);
  for(const order of state.drafts.orders){if(before.get(order.checkoutOperationId)!==JSON.stringify(order)){const op=draftOperation(order);applyLocal(state,op);state.queue.push(op);}before.delete(order.checkoutOperationId);}
  for(const previous of before.values()){const op=draftOperation(JSON.parse(previous),'delete');applyLocal(state,op);state.queue.push(op);}
  return result;
 });
 void syncPending();return result;
}
async function downloadSnapshot(owner) {
 const user=JSON.parse(localStorage.getItem('auth_user'));
 const month=new Date().toISOString().slice(0,7),year=Number(month.slice(0,4));
 const urls=['/api/products','/api/products/categories','/api/items','/api/stock/categories','/api/stock/recipe','/api/stock/summary','/api/products/summary','/api/seating/floors','/api/history','/api/recurring-shifts','/api/offline/batches','/api/open-orders'];
 for(let offset=-1;offset<=12;offset++){
  const from=new Date(Date.UTC(year,offset,1)).toISOString().slice(0,10);
  const to=new Date(Date.UTC(year,offset+1,0)).toISOString().slice(0,10);
  urls.push(`/api/shifts?from=${from}&to=${to}`);
 }
 if(user.accessLevel==='admin')urls.push('/api/employees',`/api/expenses?through=${year+1}-12-31`,`/api/employees/payroll?month=${month}`);
 if(user.accessLevel==='admin'||/manager|owner|supervisor/i.test(user.position||''))urls.push('/api/stock/expired-batches',...['refund','stock_receipt','stock_usage','shift_checkin'].map(type=>'/api/management/requests?type='+type));
 const previous=await load(owner);
 urls.push(...Object.keys(previous.cache).filter(key=>/^\/api\/(shifts|expenses|employees\/payroll)\?/.test(key)));
 for(let attempt=0;attempt<3;attempt++){
  const cache={};let revision=null,consistent=true;
  for(const url of new Set(urls)){
   if(accountId()!==owner)throw Error('Account changed while downloading.');
   const res=await network.get(url,{headers:{'X-Offline-Account-Id':owner.split(':')[0]}});
   const rev=res.headers['x-sync-revision'];
   if(rev===undefined)throw Error('Deploy the offline backend and run its migration first.');
   if(revision!==null&&revision!==rev)consistent=false;
   revision=rev;cache[keyOf(url)]={data:res.data,downloadedAt:new Date().toISOString()};
  }
  if(consistent)return {cache,revision:Number(revision)};
 }
 throw Error('Shared data is changing. Please prepare offline data again when updates finish.');
}
export async function prepareOffline() {
 if(warming)return warming;
 const owner=accountId();if(!owner||!navigator.onLine)return;
 warming=(async()=>{
  if((await load(owner)).queue.length)return;
  const snapshot=await downloadSnapshot(owner);
  await change(state=>{
   if(state.queue.length)return;
   Object.assign(state,snapshot);
   const shared=state.cache['/api/open-orders'].data;
   const seen=new Set(state.drafts.syncedKeys||[]);
   const selected=state.drafts.orders.find(order=>order.id===state.drafts.activeOrderId)?.checkoutOperationId;
   const localOnly=state.drafts.orders.filter(order=>!seen.has(order.checkoutOperationId)&&!shared.some(other=>other.checkoutOperationId===order.checkoutOperationId));
   state.drafts.orders=[...shared,...localOnly];
   state.drafts.activeOrderId=state.drafts.orders.find(order=>order.checkoutOperationId===selected)?.id||state.drafts.orders[0]?.id||null;
   state.drafts.syncedKeys=[...new Set([...seen,...shared.map(order=>order.checkoutOperationId)])];
   for(const order of localOnly){const op=draftOperation(order);applyLocal(state,op);state.queue.push(op);}
   state.prepared=true;state.lastSync=new Date().toISOString();state.error=null;
  },owner);
  connectionState='online';announceSnapshot();
 })().catch(async error=>{
  connectionState=error.response?.status===401?'sign-in required':'offline';
  await change(s=>{s.error=error.response?.data?.error||error.message;},owner).catch(()=>{});
 }).finally(()=>{warming=null;announce();void syncPending();});
 return warming;
}
export async function latestSharedData() {
 const snapshot=await downloadSnapshot(accountId());
 return Object.fromEntries(Object.entries(snapshot.cache).map(([key,entry])=>[key,entry.data]));
}
export async function correctPending(data) {
 const owner=accountId();
 await navigator.locks.request('lacasa-sync-'+owner,async()=>{
  const before=await load(owner),op=activePending(before);
  if(!op?.blocked)throw Error('Only a paused change can be corrected.');
  const receipt=await network.get('/api/offline/operations/'+op.id,{headers:{'X-Offline-Account-Id':owner.split(':')[0]}});
  if(receipt.data.applied)throw Error('This change is already on the server. Retry it unchanged to recover its receipt.');
  const snapshot=await downloadSnapshot(owner);
  await change(state=>{
   if(activePending(state)?.id!==op.id)throw Error('The pending queue changed. Reopen the review.');
   const original=activePending(state);
   state.recovery=state.recovery||[];state.recovery.push({...original,supersededAt:new Date().toISOString()});
   state.queue[state.queue.findIndex(pending=>pending.id===original.id)]={...original,id:crypto.randomUUID(),data,blocked:false,problem:null,sentData:undefined,sentUrl:undefined,expectedRevision:undefined};
   Object.assign(state,snapshot);const drafts=state.drafts;delete state.drafts;
   for(const pending of state.queue){
    pending.data=remap(pending.data,state.idMap);
    const url=pending.url.split('/').map(segment=>encodeURIComponent(remap(decodeURIComponent(segment),state.idMap,'shift_id'))).join('/');
    pending.url=url;applyLocal(state,pending);
    if(pending.id!==activePending(state)?.id&&!pending.deferred){pending.blocked=true;pending.status=409;pending.problem='Review this remaining change against the latest shared data.';}
   }
   state.drafts=drafts;state.error=null;
  },owner);
 });
 await syncPending();
}
function duplicateProduct(op,code,message){
 return ['post','patch'].includes(op.method)&&/^\/api\/products(?:\/-?\d+)?$/.test(op.url)&&
  (code==='PRODUCT_NAME_EXISTS'||/products_product_name_key|A product with this name already exists/i.test(message||''));
}
function referencesId(op,id){
 const values=value=>value&&typeof value==='object'?Object.values(value).some(values):String(value)===String(id);
 return op.url.split('/').some(part=>decodeURIComponent(part)===String(id))||values(op.data);
}
function rejectedRequest(op,status,message,code){
 return duplicateProduct(op,code,message)||[400,404,409,422].includes(Number(status))||(op.blocked&&/Review this remaining change against the latest shared data/i.test(message||''));
}
async function skipDuplicateProduct(owner,op,reason=op.problem,code){
 // Removing a rejected request must not depend on unrelated snapshot endpoints.
 connectionState='skipping rejected request';announce();
 await change(state=>{
  if(activePending(state)?.id!==op.id)throw Error('The pending queue changed. Retry sync.');
  const name=op.data.product_name||op.data.category_name||op.data.description||op.data.customerName||op.url;
  const duplicate=duplicateProduct(op,code,reason);
  const notice=duplicate
   ? (op.method==='post'?`"${name}" was not added because a product with this name already exists.`:`"${name}" was not updated because that product name already exists. None of this request's changes were applied.`)
   : `"${name}" was not ${op.method==='post'?'added':op.method==='delete'?'deleted':'updated'}. Reason: ${reason||'The server rejected this change.'}`;
  state.recovery=state.recovery||[];
  state.recovery.push({...op,skippedAt:new Date().toISOString(),skipReason:notice});
  state.queue=state.queue.filter(pending=>pending.id!==op.id);
  // Keep the prior revision so skipping never silently accepts concurrent edits.
  const drafts=state.drafts;
  // The next full refresh restores server values. Keep provisional local data until then.
  for(const pending of state.queue){
   if(op.method==='post'&&referencesId(pending,op.tempId)){
    pending.blocked=true;pending.status=422;pending.problem=`This change depends on "${name}", which was not added.`;
    continue;
   }
  }
  state.drafts=drafts;state.error=null;
 },owner);
 announceSnapshot();
}
export async function dismissSyncNotices(){await change(state=>{for(const record of state.recovery||[])if(record.skippedAt)record.noticeRead=true;});}
export async function syncPending({resumeAuth=false,manual=false}={}) {
 const owner=accountId();if(!owner||!navigator.onLine||!navigator.locks)return;
 return navigator.locks.request('lacasa-sync-'+owner,{ifAvailable:true},async lock=>{
  if(!lock){if(manual){connectionState='sync already running';announce();}return;}
  if(manual)await change(state=>{for(const op of state.queue)if(op.deferred&&rejectedRequest(op,op.status,op.problem))op.deferred=false;},owner);
  let completed=false;
  for(;;){
   if(accountId()!==owner)return;
   const snapshot=await load(owner);const op=activePending(snapshot);if(!op){connectionState=snapshot.queue.length?'requests left unsynced':'online';announce();if(completed)await prepareOffline();if(manual&&snapshot.queue.length)await change(state=>{state.error='Requests are left unsynced. Open a saved request and choose Review and retry later to resume it.';},owner);return;}
   if(op.blocked&&rejectedRequest(op,op.status,op.problem)){try{await skipDuplicateProduct(owner,op);completed=true;continue;}catch(error){await change(state=>{state.error=error.response?.data?.error||error.message;},owner);return;}}
   if(op.blocked){if(resumeAuth&&op.status===401){await change(s=>{activePending(s).blocked=false;},owner);continue;}connectionState=op.status===401?'sign-in required':'sync paused';await change(state=>{state.error=op.problem||'This request could not be confirmed. Sign in or retry when the server is available.';},owner);announce();return;}
   if(!op.sentData){await change(s=>{const first=activePending(s);first.sentData=remap(first.data,s.idMap);first.sentUrl=first.url.split('/').map(segment=>encodeURIComponent(remap(decodeURIComponent(segment),s.idMap,'shift_id'))).join('/');first.expectedRevision??=s.revision;},owner);continue;}
   try{
    connectionState='syncing';announce();
    const res=await network.request({url:op.sentUrl,method:op.method,data:op.sentData,headers:{'X-Operation-Id':op.id,'X-Base-Revision':String(op.expectedRevision),'X-Offline-Created-At':op.createdAt,'X-Offline-Account-Id':owner.split(':')[0]}});
    if(res.headers['x-sync-revision']===undefined)throw Error('Server has not confirmed durable sync. Pending data kept.');
    await change(s=>{
     if(activePending(s)?.id!==op.id)throw Error('Pending operation changed during sync');
     const data=res.data;const realId=data.insertId??data.id??data.item_id??data.user_id??data.shift_id??data.recurrence_id??data.requestId??data.i_category_id??data.batch_id;
     if(realId!==undefined)s.idMap[op.tempId]=realId;
     if(data.shift_id&&op.method!=='post'&&op.sentUrl.startsWith('/api/shifts/'))s.idMap[decodeURIComponent(op.sentUrl.split('/').at(-1))]=data.shift_id;
     if(data.orderId)s.idMap['offline-'+op.id]=data.orderId;
     Object.assign(s.idMap,data.offlineIdMap||{});
     for(const entry of Object.values(s.cache))entry.data=remap(entry.data,s.idMap);
     s.drafts=remap(s.drafts,s.idMap);
     const sharedKey=op.url.startsWith('/api/open-orders/')?op.url.split('/').at(-1):op.data.order?.checkoutOperationId;
     if(sharedKey)s.drafts.syncedKeys=[...new Set([...(s.drafts.syncedKeys||[]),sharedKey])];
     s.revision=Number(res.headers['x-sync-revision']);s.archive.push({id:op.id,method:op.method,url:op.url,createdAt:op.createdAt,acknowledgedAt:new Date().toISOString(),serverResponse:data});s.queue.splice(s.queue.findIndex(pending=>pending.id===op.id),1);s.error=null;s.lastSync=new Date().toISOString();
    },owner);
    completed=true;connectionState='online';announce();
   }catch(error){
    if(rejectedRequest(op,error.response?.status,error.response?.data?.error,error.response?.data?.code)){
     try{await skipDuplicateProduct(owner,op,error.response?.data?.error,error.response?.data?.code);completed=true;continue;}catch(refreshError){await change(state=>{state.error='Could not refresh the catalog. The rejected request is still saved. '+refreshError.message;},owner);return;}
    }
    const status=error.response?.status;connectionState=status===401?'sign-in required':status===409?'conflict':status?'sync paused':'offline';
    await change(s=>{s.error=error.response?.data?.error||error.message;if(activePending(s)?.id===op.id){activePending(s).blocked=!!status&&status!==503;activePending(s).problem=s.error;activePending(s).conflictRevision=error.response?.data?.revision;activePending(s).status=status;if(status===409)for(const later of s.queue.filter(pending=>pending.id!==op.id&&!pending.deferred)){later.blocked=true;later.status=409;later.problem='Review this remaining change against the latest shared data.';}}},owner);announce();return;
   }
  }
 });
}
export async function resolvePending() {
 const revision=await network.get('/api/offline/revision');
 await change(s=>{const op=activePending(s);if(!op)return;op.expectedRevision=Number(revision.headers['x-sync-revision']);op.blocked=false;op.problem=null;s.error=null;});
 return syncPending();
}
async function offlineAdapterImpl(config){
 const url=keyOf(config.url,config.params),method=(config.method||'get').toLowerCase();
 const body=typeof config.data==='string'?JSON.parse(config.data):config.data;
 if(isAuth(url))return network.request({...config,adapter:undefined});
 const owner=accountId();if(!owner)return network.request({...config,adapter:undefined});
 if(method==='get'){
  let state=await load(owner);
  if(state.queue.length||!navigator.onLine){try{return response(config,readLocal(state,url));}catch(error){throw httpError(error.message);}}
  try{
   const res=await network.request({...config,headers:{...config.headers,'X-Offline-Account-Id':owner.split(':')[0]},adapter:undefined});connectionState='online';
   const latest=await load(owner);
   if(latest.queue.length)return response(config,readLocal(latest,url));
   // Only extend a coherent snapshot at the same revision. Otherwise prepare a new one.
   if(Number(res.headers['x-sync-revision'])===state.revision)await change(s=>{if(!s.queue.length&&Number(res.headers['x-sync-revision'])===s.revision)s.cache[url]={data:res.data,downloadedAt:new Date().toISOString()};},owner);
   else void prepareOffline();
   return res;
  }catch(error){if(error.response&&error.response.status<500&&error.response.status!==401)throw error;connectionState=error.response?.status===401?'sign-in required':'offline';announce();try{return response(config,readLocal(state,url));}catch{throw error;}}
 }
 const op={id:url==='/api/checkout'?body?.details?.checkout_operation_id||crypto.randomUUID():crypto.randomUUID(),tempId:-(Date.now()*1000+Math.floor(Math.random()*1000)),method,url,data:body||{},createdAt:new Date().toISOString()};
 let result;
 try{result=await change(state=>{
  if(!state.prepared||state.revision===null)throw Error('Prepare offline data in Sync before saving changes. This ensures your work can be recovered.');
  const saved=[...state.queue,...state.archive].find(existing=>existing.id===op.id);
  if(saved)return saved.serverResponse||{success:true,offline:true};
  const user=JSON.parse(localStorage.getItem('auth_user'));
  if(user.accessLevel!=='admin'&&/^\/api\/(products|employees|expenses|shifts|recurring-shifts)/.test(url))throw Error('Administrator access required.');
  op.data=remap(op.data,state.idMap);op.url=op.url.split('/').map(segment=>encodeURIComponent(remap(decodeURIComponent(segment),state.idMap,'shift_id'))).join('/');
  const result=applyLocal(state,{...op,url:decodeURI(op.url)});state.queue.push(op);return result;
 },owner);}catch(error){throw httpError('Could not save on this device: '+(error?.message||'Storage is unavailable.'));}
 // A successful response is returned only AFTER the IndexedDB transaction commits.
 void syncPending();return response(config,result,method==='post'?201:200);
}
export async function offlineAdapter(config){
 try{return await offlineAdapterImpl(config);}
 catch(error){const failure=error||new Error('Request failed');failure.config=config;throw failure;}
}
window.addEventListener('online',()=>{void syncPending().then(prepareOffline);});
window.addEventListener('offline',()=>{connectionState='offline';announce();});
const retryTimer=setInterval(()=>{
 if(accountId()&&navigator.onLine)void syncPending().then(async()=>{
  const state=await load();if(state.queue.length)return;
  const current=await network.get('/api/offline/revision');
  if(!state.prepared||Number(current.headers['x-sync-revision'])!==state.revision)await prepareOffline();
 }).catch(()=>{});
},15000);
retryTimer.unref?.();
