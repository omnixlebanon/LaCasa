import axios from 'axios';
import { accountId, load, change } from './storage.js';
import { keyOf, readLocal, applyLocal, remap } from './model.js';
export const network = axios.create({baseURL:import.meta.env?.VITE_API_URL || (import.meta.env?.DEV?'http://localhost:8080':''),withCredentials:true,timeout:15000});
export let connectionState = 'online';
const announce=()=>window.dispatchEvent(new Event('offline-change'));
const httpError=message=>Object.assign(new Error(message),{response:{data:{error:message}}});
let warming;
function isAuth(url){return url.startsWith('/api/auth/')||url.startsWith('/api/public/');}
function response(config,data,status=200){return {data,status,statusText:'Saved on this device',headers:{},config};}
export async function prepareOffline() {
 if(warming)return warming;
 const owner=accountId();if(!owner||!navigator.onLine)return;
 warming=(async()=>{
  const user=JSON.parse(localStorage.getItem('auth_user'));const month=new Date().toISOString().slice(0,7);const year=Number(month.slice(0,4));
  const urls=['/api/products','/api/products/categories','/api/items','/api/stock/categories','/api/stock/recipe','/api/stock/summary','/api/products/summary','/api/seating/floors','/api/history','/api/recurring-shifts','/api/offline/batches'];
  for(let offset=-1;offset<=12;offset++){const from=new Date(Date.UTC(year,offset,1)).toISOString().slice(0,10);const to=new Date(Date.UTC(year,offset+1,0)).toISOString().slice(0,10);urls.push(`/api/shifts?from=${from}&to=${to}`);}
  if(user.accessLevel==='admin')urls.push('/api/employees',`/api/expenses?through=${year+1}-12-31`,`/api/employees/payroll?month=${month}`);
  if(user.accessLevel==='admin'||/manager|owner|supervisor/i.test(user.position||''))urls.push('/api/stock/expired-batches',...['refund','stock_receipt','stock_usage','shift_checkin'].map(type=>'/api/management/requests?type='+type));
  for(let attempt=0;attempt<3;attempt++){
   if((await load(owner)).queue.length)return;
   const cache={};let revision=null,consistent=true;
   for(const url of urls){if(accountId()!==owner)return;const res=await network.get(url,{headers:{'X-Offline-Account-Id':owner.split(':')[0]}});const rev=res.headers['x-sync-revision'];if(rev===undefined)throw Error('Deploy the offline backend and run its migration first.');if(revision!==null&&revision!==rev)consistent=false;revision=rev;cache[keyOf(url)]={data:res.data,downloadedAt:new Date().toISOString()};}
   if(!consistent)continue;
   await change(state=>{if(state.queue.length)return;state.cache=cache;state.revision=Number(revision);state.prepared=true;state.lastSync=new Date().toISOString();state.error=null;},owner);
   connectionState='online';announce();return;
  }
  throw Error('Shared data is changing. Please prepare offline data again when updates finish.');
 })().catch(async error=>{connectionState=error.response?.status===401?'sign-in required':'offline';await change(s=>{s.error=error.response?.data?.error||error.message;},owner).catch(()=>{});}).finally(()=>{warming=null;announce();});
 return warming;
}
export async function syncPending({resumeAuth=false}={}) {
 const owner=accountId();if(!owner||!navigator.onLine||!navigator.locks)return;
 return navigator.locks.request('lacasa-sync-'+owner,{ifAvailable:true},async lock=>{
  if(!lock)return;
  let completed=false;
  for(;;){
   if(accountId()!==owner)return;
   const snapshot=await load(owner);const op=snapshot.queue[0];if(!op){if(completed)await prepareOffline();return;}
   if(op.blocked){if(resumeAuth&&op.status===401){await change(s=>{s.queue[0].blocked=false;},owner);continue;}return;}
   if(!op.sentData){await change(s=>{const first=s.queue[0];first.sentData=remap(first.data,s.idMap);first.sentUrl=first.url.split('/').map(segment=>encodeURIComponent(remap(decodeURIComponent(segment),s.idMap,'shift_id'))).join('/');first.expectedRevision=s.revision;},owner);continue;}
   try{
    connectionState='syncing';announce();
    const res=await network.request({url:op.sentUrl,method:op.method,data:op.sentData,headers:{'X-Operation-Id':op.id,'X-Base-Revision':String(op.expectedRevision),'X-Offline-Created-At':op.createdAt,'X-Offline-Account-Id':owner.split(':')[0]}});
    if(res.headers['x-sync-revision']===undefined)throw Error('Server has not confirmed durable sync. Pending data kept.');
    await change(s=>{
     if(s.queue[0]?.id!==op.id)throw Error('Pending operation changed during sync');
     const data=res.data;const realId=data.insertId??data.id??data.item_id??data.user_id??data.shift_id??data.recurrence_id??data.requestId??data.i_category_id??data.batch_id;
     if(realId!==undefined)s.idMap[op.tempId]=realId;
     if(data.shift_id&&op.method!=='post'&&op.sentUrl.startsWith('/api/shifts/'))s.idMap[decodeURIComponent(op.sentUrl.split('/').at(-1))]=data.shift_id;
     if(data.orderId)s.idMap['offline-'+op.id]=data.orderId;
     Object.assign(s.idMap,data.offlineIdMap||{});
     for(const entry of Object.values(s.cache))entry.data=remap(entry.data,s.idMap);
     s.drafts=remap(s.drafts,s.idMap);
     s.revision=Number(res.headers['x-sync-revision']);s.archive.push({...op,acknowledgedAt:new Date().toISOString(),serverResponse:data});s.queue.shift();s.error=null;s.lastSync=new Date().toISOString();
    },owner);
    completed=true;connectionState='online';announce();
   }catch(error){
    const status=error.response?.status;connectionState=status===401?'sign-in required':status===409?'conflict':status?'sync paused':'offline';
    await change(s=>{s.error=error.response?.data?.error||error.message;if(status&&status<500&&s.queue[0]?.id===op.id){s.queue[0].blocked=true;s.queue[0].problem=s.error;s.queue[0].conflictRevision=error.response?.data?.revision;s.queue[0].status=status;}},owner);announce();return;
   }
  }
 });
}
export async function resolvePending() {
 const revision=await network.get('/api/offline/revision');
 await change(s=>{const op=s.queue[0];if(!op)return;op.expectedRevision=Number(revision.headers['x-sync-revision']);op.blocked=false;op.problem=null;s.error=null;});
 return syncPending();
}
export async function offlineAdapter(config){
 const url=keyOf(config.url,config.params),method=(config.method||'get').toLowerCase();
 const body=typeof config.data==='string'?JSON.parse(config.data):config.data;
 if(isAuth(url))return network.request({...config,adapter:undefined});
 const owner=accountId();if(!owner)return network.request({...config,adapter:undefined});
 if(method==='get'){
  let state=await load(owner);
  if(state.queue.length||!navigator.onLine){try{return response(config,readLocal(state,url));}catch(error){throw httpError(error.message);}}
  try{
   const res=await network.request({...config,adapter:undefined});connectionState='online';
   // Only extend a coherent snapshot at the same revision. Otherwise prepare a new one.
   if(Number(res.headers['x-sync-revision'])===state.revision)await change(s=>{if(!s.queue.length)s.cache[url]={data:res.data,downloadedAt:new Date().toISOString()};},owner);
   else void prepareOffline();
   return res;
  }catch(error){if(error.response&&error.response.status<500&&error.response.status!==401)throw error;connectionState=error.response?.status===401?'sign-in required':'offline';announce();return response(config,readLocal(state,url));}
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
window.addEventListener('online',()=>{void syncPending().then(prepareOffline);});
window.addEventListener('offline',()=>{connectionState='offline';announce();});
const retryTimer=setInterval(()=>{if(accountId()&&navigator.onLine)void syncPending();},15000);
retryTimer.unref?.();
