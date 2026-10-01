import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB, IDBDatabase } from 'fake-indexeddb';
import { AxiosError } from 'axios';

globalThis.indexedDB=indexedDB;
globalThis.window=new EventTarget();
const values=new Map();
globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
const locks=new Map();
Object.defineProperty(navigator,'onLine',{value:false,writable:true,configurable:true});
Object.defineProperty(navigator,'locks',{value:{async request(name,options,fn){
 if(typeof options==='function'){fn=options;options={};}
 if(options.ifAvailable&&locks.has(name))return fn(null);
 const before=locks.get(name)||Promise.resolve();let release;const done=new Promise(resolve=>{release=resolve;});locks.set(name,done);
 await before;try{return await fn({name});}finally{if(locks.get(name)===done)locks.delete(name);release();}
}},configurable:true});
const {change,load,emptyState,accountId,restoreBackup}=await import('./storage.js');
const {offlineAdapter,syncPending,network,resolvePending,correctPending,saveDraftEdit,prepareOffline,leavePendingUnsynced,resumeHeld,activePending}=await import('./transport.js');
const {readLocal,applyLocal,keyOf,remap}=await import('./model.js');
const headers=revision=>({'x-sync-revision':String(revision)});
let account=0;
function fixture(){
 const cache={};for(const [path,data]of Object.entries({
  '/api/products':[{product_id:1,product_name:'Coffee',product_category:'Hot',product_price:5}],
  '/api/products/groups':[],
  '/api/products/categories':[{p_category_id:1,p_category_name:'Hot',pos_hidden:0}],
  '/api/products/summary':[], '/api/stock/summary':{}, '/api/stock/categories':[],
  '/api/items':[{item_id:2,item_name:'Milk',stock:100,item_cost:0.1,safety_limit:10,shelf_life:3}],
  '/api/stock/recipe':[{product_id:1,item_id:2,qty:5}],
  '/api/offline/batches':[{batch_id:3,item_id:2,batch_stock:100,batch_exDate:'2099-01-01'}],
  '/api/stock/expired-batches':[], '/api/history':[], '/api/recurring-shifts':[], '/api/open-orders':[],
  '/api/seating/floors':[{floor_id:1,tables:[{t_id:1,t_name:'T1',t_status:'available'}]}],
  '/api/expenses?through=2027-12-31':[], '/api/employees':[],
 }))cache[path]={data};return {...emptyState(),cache,prepared:true,revision:10,drafts:{orders:[],nextOrder:1,activeOrderId:null}};
}
beforeEach(async()=>{
 navigator.onLine=false;account++;localStorage.setItem('auth_user',JSON.stringify({id:account,email:`${account}@test.invalid`,accessLevel:'admin'}));
 await change(state=>Object.assign(state,fixture()));
 network.defaults.adapter=async config=>({data:config.method==='get'?[]:{success:true},status:200,headers:headers(11),config});
});
const write=(url,data={},method='post')=>offlineAdapter({url,method,data});
test('occupied tables and open carts persist together; checkout commits once, retaining costs and releasing table',async()=>{
 await write('/api/seating/tables/1/status',{t_status:'occupied',open_order:true},'put');
 const state=await load();assert.equal(state.cache['/api/seating/floors'].data[0].tables[0].t_status,'occupied');
 const id=state.drafts.orders[0].checkoutOperationId;
 const payload={totalAmount:10,customerName:'T1',details:{checkout_operation_id:id,table_id:1,items:[{product_id:1,qty:2,price:5}]}};
 await write('/api/checkout',payload);await write('/api/checkout',payload);
 const reloaded=await (await import('./storage.js?reload')).load();
 assert.equal(reloaded.queue.length,2);assert.equal(reloaded.drafts.orders.length,0);
 assert.equal(reloaded.cache['/api/history'].data.length,1);
 assert.equal(reloaded.cache['/api/history'].data[0].details.total_cost,1);
 assert.equal(reloaded.cache['/api/items'].data[0].stock,90);
 assert.equal(reloaded.cache['/api/seating/floors'].data[0].tables[0].t_status,'available');
});
test('failed durable write rejects success and leaves the previous queue intact',async()=>{
 const original=IDBDatabase.prototype.transaction;
 IDBDatabase.prototype.transaction=function(...args){const tx=original.apply(this,args);if(args[1]==='readwrite')queueMicrotask(()=>tx.abort());return tx;};
 try{await assert.rejects(write('/api/products',{product_name:'Unsaved',product_category:'Hot',product_price:3}),/Could not save/);}finally{IDBDatabase.prototype.transaction=original;}
 assert.equal((await load()).queue.length,0);assert.equal((await load()).cache['/api/products'].data.length,1);
});
test('parallel tabs serialize local saves instead of replacing each other',async()=>{
 await Promise.all(Array.from({length:8},(_,i)=>write('/api/products',{product_name:'Product '+i,product_category:'Hot',product_price:2})));
 const state=await load();assert.equal(state.queue.length,8);assert.equal(state.cache['/api/products'].data.length,9);
});
test('network loss preserves an immutable operation and retry uses the same identity and payload',async()=>{
 await write('/api/products',{product_name:'Retry',product_category:'Hot',product_price:2});
 const sent=[];let first=true;
 network.defaults.adapter=async config=>{
  if(config.method==='get')return {data:[],status:200,headers:headers(11),config};
  sent.push({id:config.headers['X-Operation-Id'],data:config.data});
  if(first){first=false;throw new AxiosError('Connection lost','ERR_NETWORK',config);}
  return {data:{insertId:99},status:201,headers:headers(11),config};
 };
 navigator.onLine=true;await syncPending();assert.equal((await load()).queue.length,1);
 await syncPending();assert.equal((await load()).queue.length,0);assert.equal((await load()).archive.length,1);assert.deepEqual(sent[0],sent[1]);
});
test('rejected conflicts are removed with a reason instead of waiting for review',async()=>{
 await write('/api/products',{product_name:'First',product_category:'Hot',product_price:2});
 await write('/api/products',{product_name:'Second',product_category:'Hot',product_price:2});
 const shared=fixture();let count=0;
 network.defaults.adapter=async config=>{
  if(config.method==='get')return {data:shared.cache[keyOf(config.url)]?.data||[],status:200,headers:headers(25),config};
  count++;throw new AxiosError('Conflict','ERR_BAD_REQUEST',config,null,{status:409,data:{revision:25,error:'Another device changed this'},headers:headers(25)});
 };
 navigator.onLine=true;await syncPending();const state=await load();
 assert.equal(count,2);assert.equal(state.queue.length,0);assert.equal(state.recovery.length,2);assert.match(state.recovery[0].skipReason,/First.*Another device changed this/);
});

test('temporary product IDs are mapped before syncing dependent orders',async()=>{
 const created=await write('/api/products',{product_name:'New coffee',product_category:'Hot',product_price:2});
 await write('/api/checkout',{totalAmount:2,customerName:'Test',details:{items:[{product_id:created.data.insertId,qty:1,price:2}]}});
 const sent=[];let revision=10;
 network.defaults.adapter=async config=>{if(config.method==='get')return {data:[],status:200,headers:headers(revision),config};sent.push(JSON.parse(config.data));return {data:config.url==='/api/products'?{insertId:87}:{orderId:'saved-1',internalId:100},status:201,headers:headers(++revision),config};};
 navigator.onLine=true;await syncPending();
 assert.equal(sent[1].details.items[0].product_id,87);assert.equal(sent[1].details.offline_recipe_snapshot[0].product_id,87);assert.equal((await load()).queue.length,0);
});
test('backups and drafts are isolated by account; restore refuses to overwrite pending work',async()=>{
 const owner=accountId();const state=await load();const file={text:async()=>JSON.stringify({app:'LaCasa',version:1,owner,state})};
 await write('/api/products',{product_name:'Pending',product_category:'Hot',product_price:1});
 await assert.rejects(restoreBackup(file),/synchronize/);
 localStorage.setItem('auth_user',JSON.stringify({id:999,email:'different@test.invalid',accessLevel:'admin'}));
 assert.equal((await load()).queue.length,0);await assert.rejects(restoreBackup(file),/different account/);
});
test('calendar merges downloaded months and Sunday uses ISO weekday 7',()=>{
 const state=fixture();for(const month of ['2026-01','2026-02'])state.cache[keyOf(`/api/shifts?from=${month}-01&to=${month==='2026-01'?'2026-01-31':'2026-02-28'}`)]={data:[]};
 applyLocal(state,{url:'/api/recurring-shifts',method:'post',tempId:-12,data:{userId:1,date:'2026-01-01',startTime:'09:00',endTime:'17:00',weekdays:[7]}});
 const shifts=readLocal(state,keyOf('/api/shifts?from=2026-01-26&to=2026-02-08'));
 assert.deepEqual(shifts.map(s=>s.shift_date),['2026-02-01','2026-02-08']);
 assert.equal(remap('-12:2026-02-01',{'-12':44},'shift_id'),'44:2026-02-01');
 assert.throws(()=>readLocal(state,keyOf('/api/shifts?from=2025-12-20&to=2026-01-10')),/not downloaded/);
});
test('correcting a rejected change keeps the original and pauses remaining changes for review',async()=>{
 await write('/api/products',{product_name:'Wrong name',product_category:'Hot',product_price:1});
 await change(state=>{state.queue[0].blocked=true;state.queue[0].status=409;});
 const original=(await load()).queue[0].id;
 const server=fixture();let applied;
 network.defaults.adapter=async config=>{
  if(config.url.startsWith('/api/offline/operations/'))return {data:{applied:false},status:200,headers:headers(20),config};
  if(config.method==='get')return {data:server.cache[keyOf(config.url)]?.data||[],status:200,headers:headers(20),config};
  applied=JSON.parse(config.data);return {data:{insertId:100},status:201,headers:headers(21),config};
 };
 navigator.onLine=true;await correctPending({product_name:'Correct name',product_category:'Hot',product_price:1});
 assert.equal(applied.product_name,'Correct name');assert.equal((await load()).recovery[0].id,original);assert.notEqual((await load()).archive[0].id,original);
});
test('open cart edits are durable operations and another device downloads them',async()=>{
 const key=crypto.randomUUID();await saveDraftEdit(drafts=>{drafts.orders.push({id:key,checkoutOperationId:key,label:'Shared cart',items:[]});drafts.activeOrderId=key;});
 await saveDraftEdit(drafts=>{drafts.orders[0].items.push({product_id:1,qty:2,product_price:5});});
 assert.equal((await load()).queue.length,1);assert.equal((await load()).queue[0].data.order.items.length,1);
 let shared=[],revision=10;
 network.defaults.adapter=async config=>{
  if(config.method==='get')return {data:config.url==='/api/open-orders'?shared:fixture().cache[keyOf(config.url)]?.data||[],status:200,headers:headers(revision),config};
  shared=[JSON.parse(config.data).order];return {data:{success:true},status:200,headers:headers(++revision),config};
 };
 navigator.onLine=true;await syncPending();assert.equal((await load()).queue.length,0);
 localStorage.setItem('auth_user',JSON.stringify({id:1001,email:'other-device@test.invalid',accessLevel:'admin'}));
 await change(()=>{});await prepareOffline();
 assert.equal((await load()).drafts.orders[0].items[0].qty,2);
 shared=[];revision++;await prepareOffline();assert.equal((await load()).drafts.orders.length,0);
});
test('server failures remain visible when no offline copy exists',async()=>{
 await change(state=>{state.cache={};state.prepared=false;});navigator.onLine=true;
 network.defaults.adapter=async config=>{throw new AxiosError('503','ERR_BAD_RESPONSE',config,null,{status:503,data:{error:'Database setup is incomplete.'}});};
 await assert.rejects(offlineAdapter({url:'/api/products',method:'get'}),error=>error.response.status===503&&error.response.data.error==='Database setup is incomplete.'&&!!error.config);
});
test('a late online read cannot replace newer unsynced data',async()=>{
 let release,started;const ready=new Promise(resolve=>{started=resolve;});
 network.defaults.adapter=async config=>{started();await new Promise(resolve=>{release=resolve;});return {data:fixture().cache['/api/products'].data,status:200,headers:headers(10),config};};
 navigator.onLine=true;const pending=offlineAdapter({url:'/api/products',method:'get'});await ready;
 navigator.onLine=false;await write('/api/products',{product_name:'Saved during request',product_category:'Hot',product_price:2});release();
 const result=await pending;assert.equal(result.data.length,2);assert.equal((await load()).queue.length,1);
});
test('an email change retains pending work and older email-keyed data is recovered',async()=>{
 const user={id:2001,email:'old@fixture.invalid',accessLevel:'admin'};
 localStorage.setItem('auth_user',JSON.stringify(user));
 await change(state=>{Object.assign(state,fixture());state.queue.push({id:crypto.randomUUID(),url:'/api/products',method:'post',data:{product_name:'Legacy pending'},tempId:-1});},'2001:old@fixture.invalid');
 assert.equal((await load()).queue.length,1);
 await change(()=>{});
 localStorage.setItem('auth_user',JSON.stringify({...user,email:'new@fixture.invalid'}));
 assert.equal((await load()).queue[0].data.product_name,'Legacy pending');
});

 test('leaving an errored request unsynced preserves it, holds related work, and syncs unrelated work',async()=>{
 await write('/api/products',{product_name:'Failed',product_category:'Hot',product_price:2});
 await write('/api/products',{product_name:'Related',product_category:'Hot',product_price:3});
 const expense={id:crypto.randomUUID(),tempId:-88,url:'/api/expenses',method:'post',data:{amount:10},createdAt:new Date().toISOString()};
 await change(state=>state.queue.push(expense));
 const original=(await load()).queue[0];const sent=[];
 network.defaults.adapter=async config=>{
  sent.push(config.url);
  if(config.url==='/api/products')throw new AxiosError('Invalid','ERR_BAD_REQUEST',config,null,{status:500,data:{error:'Server could not confirm the product'}});
  return {data:{id:88},status:200,headers:headers(11),config};
 };
 navigator.onLine=true;await syncPending();await leavePendingUnsynced(original.id);
 const state=await load();assert.equal(state.queue.length,2);assert.equal(state.queue[0].deferred,true);
 assert.deepEqual(state.queue[0].data,original.data);assert.equal(state.archive[0].id,expense.id);
 assert.deepEqual(sent,['/api/products','/api/expenses']);assert.equal(activePending(state),undefined);
 await syncPending();assert.equal(sent.length,2);
 await resumeHeld(original.id);assert.equal(activePending(await load()).id,original.id);
 assert.equal((await load()).queue[0].blocked,true);
 });
 test('a network error can be held without losing its operation identity',async()=>{
 await write('/api/products',{product_name:'Network failure',product_category:'Hot',product_price:2});
 network.defaults.adapter=async config=>{throw new AxiosError('Connection lost','ERR_NETWORK',config);};
 navigator.onLine=true;await syncPending();const original=(await load()).queue[0];
 await leavePendingUnsynced(original.id);const saved=(await load()).queue[0];
 assert.equal(saved.id,original.id);assert.deepEqual(saved.sentData,original.sentData);assert.equal(saved.deferred,true);
 });

test('menu order stays saved offline without changing visibility or product details',async()=>{
 const created=await write('/api/products',{product_name:'Second',product_category:'Hot',product_price:2});
 await write('/api/products/menu-order',{kind:'products',entries:[{product_id:created.data.insertId},{product_id:1}]},'put');
 const state=await load();assert.deepEqual(state.cache['/api/products'].data.map(p=>p.product_name),['Second','Coffee']);
 assert.equal(state.cache['/api/products'].data[1].product_price,5);
 assert.equal(state.queue.at(-1).data.entries[0].product_id,created.data.insertId);
 await write('/api/products/menu-order',{kind:'categories',entries:[{p_category_id:1}]},'put');
 assert.equal((await load()).cache['/api/products/categories'].data[0].pos_hidden,0);
});

test('duplicate product names are rejected before saving locally, including renames',async()=>{
 await assert.rejects(write('/api/products',{product_name:' Coffee ',product_category:'Hot',product_price:8}),/already exists/);
 assert.equal((await load()).queue.length,0);
 const second=await write('/api/products',{product_name:'Tea',product_category:'Hot',product_price:3});
 await assert.rejects(write('/api/products/'+second.data.insertId,{product_name:'coffee'},'patch'),/already exists/);
 assert.equal((await load()).queue.length,1);
 await write('/api/products/1',{product_name:'Coffee',product_price:6},'patch');
 assert.equal((await load()).cache['/api/products'].data.find(p=>p.product_id===1).product_price,6);
});

test('duplicate creates leave the queue with a notice and other requests continue',async()=>{
 await write('/api/products',{product_name:'Existing elsewhere',product_category:'Hot',product_price:4});
 const original=(await load()).queue[0];
 await change(state=>state.queue.push({id:crypto.randomUUID(),tempId:-55,url:'/api/expenses',method:'post',data:{amount:5,date:'2026-09-01',category:'Internet',frequency:'none'},createdAt:new Date().toISOString()}));
 const shared=fixture();shared.cache['/api/products'].data.push({product_id:88,product_name:'Existing elsewhere',product_category:'Hot',product_price:8});
 const sent=[];
 network.defaults.adapter=async config=>{
  if(config.method==='get')return {data:shared.cache[keyOf(config.url)]?.data||[],status:200,headers:headers(10),config};
  sent.push(config.url);
  if(config.url==='/api/products')throw new AxiosError('Duplicate','ERR_BAD_REQUEST',config,null,{status:422,data:{code:'PRODUCT_NAME_EXISTS',error:'A product with this name already exists.'}});
  return {data:{id:55},status:200,headers:headers(11),config};
 };
 navigator.onLine=true;await syncPending();const state=await load();
 assert.equal(state.queue.length,0);assert.deepEqual(sent,['/api/products','/api/expenses']);
 assert.equal(state.recovery[0].id,original.id);assert.match(state.recovery[0].skipReason,/Existing elsewhere.*not added/);
 assert.equal(state.cache['/api/products'].data.filter(p=>p.product_name==='Existing elsewhere').length,1);
 assert.equal(state.cache['/api/products'].data.find(p=>p.product_id===88).product_price,8);
});
test('older blocked duplicate renames are skipped, restoring the actual product',async()=>{
 await write('/api/products/1',{product_name:'Taken name',product_price:99},'patch');
 await change(state=>{state.queue[0].blocked=true;state.queue[0].problem='duplicate key value violates unique constraint "products_product_name_key"';});
 const shared=fixture();network.defaults.adapter=async config=>{assert.equal(config.method,'get');return {data:shared.cache[keyOf(config.url)]?.data||[],status:200,headers:headers(10),config};};
 navigator.onLine=true;await syncPending();const state=await load();assert.equal(state.queue.length,0);
 assert.match(state.recovery[0].skipReason,/Taken name.*not updated/);assert.equal(state.cache['/api/products'].data[0].product_name,'Coffee');assert.equal(state.cache['/api/products'].data[0].product_price,5);
});
test('dependent orders are removed from the queue but preserved in recovery with a reason',async()=>{
 const created=await write('/api/products',{product_name:'Duplicate remote',product_category:'Hot',product_price:2});
 await write('/api/checkout',{totalAmount:2,details:{items:[{product_id:created.data.insertId,qty:1,price:2}]}});
 const shared=fixture();let mutations=0;
 network.defaults.adapter=async config=>{
  if(config.method==='get')return {data:shared.cache[keyOf(config.url)]?.data||[],status:200,headers:headers(10),config};
  mutations++;throw new AxiosError('Duplicate','ERR_BAD_REQUEST',config,null,{status:422,data:{code:'PRODUCT_NAME_EXISTS'}});
 };
 navigator.onLine=true;await syncPending();const state=await load();assert.equal(mutations,1);assert.equal(state.queue.length,0);assert.equal(state.recovery.length,2);assert.equal(state.recovery[1].url,'/api/checkout');assert.match(state.recovery[1].skipReason,/was not added/);
});

test('a failed refresh cannot block removing a rejected request',async()=>{
 await write('/api/products',{product_name:'Remote duplicate',product_category:'Hot',product_price:2});
 const original=(await load()).queue[0];
 network.defaults.adapter=async config=>{if(config.method==='get')throw new AxiosError('Offline','ERR_NETWORK',config);throw new AxiosError('Duplicate','ERR_BAD_REQUEST',config,null,{status:422,data:{code:'PRODUCT_NAME_EXISTS'}});};
 navigator.onLine=true;await syncPending();const state=await load();assert.equal(state.queue.length,0);assert.equal(state.recovery[0].id,original.id);
});

test('an already paused needs-review request is skipped without a manual retry',async()=>{
 await write('/api/products/1',{product_price:6},'patch');
 await change(state=>{state.queue[0].blocked=true;state.queue[0].status=409;state.queue[0].problem='Review this remaining change against the latest shared data.';});
 const shared=fixture();network.defaults.adapter=async config=>{assert.equal(config.method,'get');return {data:shared.cache[keyOf(config.url)]?.data||[],status:200,headers:headers(10),config};};
 navigator.onLine=true;await syncPending();const state=await load();assert.equal(state.queue.length,0);assert.equal(state.recovery.length,1);assert.match(state.recovery[0].skipReason,/not updated/);
});

test('manual sync handles old deferred review requests with string status codes',async()=>{
 await write('/api/products/1',{product_price:6},'patch');
 await change(state=>{Object.assign(state.queue[0],{blocked:true,deferred:true,status:'409',problem:'Review this remaining change against the latest shared data.'});});
 const shared=fixture();network.defaults.adapter=async config=>({data:shared.cache[keyOf(config.url)]?.data||[],status:200,headers:headers(10),config});
 navigator.onLine=true;await syncPending({manual:true});assert.equal((await load()).queue.length,0);assert.equal((await load()).recovery.length,1);
});

test('manual sync removes legacy review requests with missing or server-error status after receipt verification',async()=>{
 for(const status of [undefined,500,'500',403]){
  navigator.onLine=false;await write('/api/products/1',{product_price:6},'patch');
  await change(state=>{Object.assign(state.queue[0],{blocked:true,deferred:true,status,problem:'Old failure'});});
  let checks=0;const shared=fixture();network.defaults.adapter=async config=>{
   assert.equal(config.method,'get');if(config.url.includes('/operations/')){checks++;return {data:{applied:false},status:200,headers:headers(10),config};}
   return {data:shared.cache[keyOf(config.url)]?.data||[],status:200,headers:headers(10),config};
  };
  navigator.onLine=true;await syncPending({manual:true});assert.equal((await load()).queue.length,0);assert.equal(checks,1);
 }
 assert.equal((await load()).recovery.length,4);
});
test('manual sync recovers an already applied review request instead of discarding it',async()=>{
 await write('/api/products/1',{product_price:6},'patch');
 await change(state=>{const op=state.queue[0];Object.assign(op,{blocked:true,status:500,problem:'Lost response',sentData:op.data,sentUrl:op.url,expectedRevision:10});});
 const shared=fixture();network.defaults.adapter=async config=>({data:config.url.includes('/operations/')?{applied:true}:config.method==='get'?shared.cache[keyOf(config.url)]?.data||[]:{success:true},status:200,headers:headers(11),config});
 navigator.onLine=true;await syncPending({manual:true});const state=await load();assert.equal(state.queue.length,0);assert.equal(state.archive.length,1);assert.equal(state.recovery.length,0);
});

test('a skipped product cannot remain cached and block adding it again',async()=>{
 await write('/api/products',{product_name:'Shia pudding',product_category:'Shia Pudding',product_price:4});
 await change(state=>{const op=state.queue.shift();state.recovery.push({...op,skippedAt:new Date().toISOString(),skipReason:'Rejected'});});
 assert.equal(readLocal(await load(),'/api/products').some(p=>p.product_name==='Shia pudding'),false);
 await write('/api/products',{product_name:'Shia pudding',product_category:'Shia Pudding',product_price:4});
 const state=await load();assert.equal(state.queue.length,1);assert.equal(state.cache['/api/products'].data.filter(p=>p.product_name==='Shia pudding').length,1);
});

test('cart compaction never changes a request that may have reached the server',async()=>{
 const key=crypto.randomUUID();await saveDraftEdit(drafts=>drafts.orders.push({id:key,checkoutOperationId:key,items:[]}));
 await change(state=>{state.queue[0].sentData=structuredClone(state.queue[0].data);});
 await saveDraftEdit(drafts=>drafts.orders[0].items.push({product_id:1,qty:1,product_price:5}));
 const state=await load();assert.equal(state.queue.length,2);assert.equal(state.queue[0].data.order.items.length,0);assert.equal(state.queue[1].data.order.items.length,1);
});

test('group assignment and category renaming preserve products and visibility offline',async()=>{
 const group=await write('/api/products/groups',{group_name:'Drinks'});
 await write('/api/products/categories/1/group',{menu_group_id:group.data.insertId},'patch');
 await write('/api/products/category',{old_name:'Hot',new_name:'Hot drinks'},'put');
 let state=await load();assert.equal(state.cache['/api/products/categories'].data[0].menu_group_id,group.data.insertId);assert.equal(state.cache['/api/products/categories'].data[0].pos_hidden,0);assert.equal(state.cache['/api/products'].data[0].product_category,'Hot drinks');
 await assert.rejects(write('/api/products/category',{category_name:'hot DRINKS'}),/already exists/);
 await write('/api/products/groups/'+group.data.insertId,{},'delete');state=await load();assert.equal(state.cache['/api/products/categories'].data[0].menu_group_id,null);assert.equal(state.cache['/api/products'].data.length,1);
});

test('disabled chatbot requests cannot create offline operations',async()=>{
 await assert.rejects(write('/api/history/123/refund-request',{reason:'Test'}),/disabled/);
 await assert.rejects(offlineAdapter({url:'/api/management/requests',method:'get'}),/disabled/);
 assert.equal((await load()).queue.length,0);
});

test('offline refund preserves the sale and optionally restores saved ingredient quantities',async()=>{
 const checkout=crypto.randomUUID();await write('/api/checkout',{totalAmount:10,details:{checkout_operation_id:checkout,items:[{product_id:1,qty:2,price:5}]}});
 assert.equal((await load()).cache['/api/items'].data[0].stock,90);
 await write('/api/history/offline-'+checkout+'/refund',{reason:'Not prepared',returnToStock:true});
 let state=await load();assert.equal(state.cache['/api/items'].data[0].stock,100);assert.equal(state.cache['/api/history'].data[0].status,'refunded');assert.equal(state.cache['/api/history'].data.length,1);
 await assert.rejects(write('/api/history/offline-'+checkout+'/refund',{reason:'Again',returnToStock:true}),/already been refunded/);
 const next=crypto.randomUUID();await write('/api/checkout',{totalAmount:10,details:{checkout_operation_id:next,items:[{product_id:1,qty:2,price:5}]}});
 await write('/api/history/offline-'+next+'/refund',{reason:'Already consumed',returnToStock:false});assert.equal((await load()).cache['/api/items'].data[0].stock,90);
});

test('sync progress tracks completed requests and stops on failure',async()=>{
 await write('/api/products',{product_name:'Progress one',product_category:'Hot',product_price:2});
 await write('/api/products',{product_name:'Progress two',product_category:'Hot',product_price:2});
 const transport=await import('./transport.js');let sent=0;
 network.defaults.adapter=async config=>{
  assert.equal(transport.syncProgress.active,true);assert.equal(transport.syncProgress.total,2);assert.equal(transport.syncProgress.done,sent);
  if(sent++)throw new AxiosError('Network lost','ERR_NETWORK',config);
  return {data:{insertId:100},status:201,headers:headers(11),config};
 };
 navigator.onLine=true;await syncPending();assert.equal(transport.syncProgress.active,false);assert.equal(transport.syncProgress.done,1);assert.equal((await load()).queue.length,1);
});

test('cash payment survives encrypted offline storage and rejects insufficient cash',async()=>{
 const payload={totalAmount:5,customerName:'Cash test',details:{items:[{product_id:1,qty:1,price:5}],payment:{method:'cash',currency:'USD',amount_received:12.3,exchange_rate:89500}}};
 await offlineAdapter({url:'/api/checkout',method:'post',data:payload});
 const saved=await load();
 assert.equal(saved.queue[0].data.details.payment.change_usd,5);
 assert.equal(saved.queue[0].data.details.payment.change_lbp,205850);
 assert.deepEqual(saved.cache['/api/history'].data[0].details.payment,saved.queue[0].data.details.payment);
 payload.details.payment.amount_received=1;
 await assert.rejects(()=>offlineAdapter({url:'/api/checkout',method:'post',data:payload}),/less than/);
 assert.equal((await load()).queue.length,1);
});

test('purchased stock keeps its original quantity and cost after use, edits and deletion',async()=>{
 await offlineAdapter({url:'/api/stock/2/batch',method:'post',data:{batch_stock:20}});
 let saved=await load();
 const purchase=saved.cache['/api/stock/history'].data[0];
 assert.equal(purchase.quantity,20);assert.equal(purchase.total_cost,2);
 assert.equal(saved.queue[0].data.purchase_snapshot.unit_cost,0.1);
 await offlineAdapter({url:'/api/checkout',method:'post',data:{totalAmount:5,details:{items:[{product_id:1,qty:1,price:5}]}}});
 await offlineAdapter({url:'/api/stock/2/edit',method:'patch',data:{stock_name:'New milk',stock_cost:5}});
 await offlineAdapter({url:'/api/stock/2/delete',method:'delete'});
 saved=await load();
 assert.deepEqual(saved.cache['/api/stock/history'].data[0],purchase);
});

test('paid payroll updates sales costs offline once, preserves paid amount after salary edits, and clears on unpaid',async()=>{
 await change(state=>{
  state.cache['/api/employees/payroll?month=2026-09']={data:[{userId:7,name:'Cashier',month:'2026-09',baseSalary:600,deductionsTotal:50,payableAmount:550,amountPaid:0,paymentStatus:'unpaid',unpricedRefunds:[]}]};
  state.cache['/api/employees/payroll-costs']={data:[]};
 });
 await write('/api/employees/7/payroll-payment',{month:'2026-09',status:'paid',expectedAmount:550},'put');
 let saved=await load();let costs=saved.cache['/api/employees/payroll-costs'].data;
 assert.equal(costs.length,1);assert.equal(costs[0].amount_paid,550);assert.equal(costs[0].paid_at,saved.queue[0].createdAt);
 await write('/api/employees/7/payroll-payment',{month:'2026-09',status:'paid',expectedAmount:550},'put');
 assert.equal((await load()).cache['/api/employees/payroll-costs'].data.length,1);
 await write('/api/employees/7/salary',{month:'2026-09',amount:650},'put');
 assert.equal((await load()).cache['/api/employees/payroll-costs'].data[0].amount_paid,550);
 await write('/api/employees/7/payroll-payment',{month:'2026-09',status:'paid',expectedAmount:600},'put');
 costs=(await load()).cache['/api/employees/payroll-costs'].data;assert.equal(costs.length,1);assert.equal(costs[0].amount_paid,600);
 await write('/api/employees/7/payroll-payment',{month:'2026-09',status:'unpaid'},'put');
 assert.equal((await load()).cache['/api/employees/payroll-costs'].data.length,0);
 await assert.rejects(write('/api/employees/7/payroll-payment',{month:'2026-08',status:'paid',expectedAmount:550},'put'),/Download this salary month/);
});

test('WHISH checkout persists the payment type and syncs without a payment API',async()=>{
 await write('/api/checkout',{totalAmount:5,details:{items:[{product_id:1,qty:1,price:5}],payment:{method:'whish'}}});
 let state=await load();const payment=state.cache['/api/history'].data[0].details;
 assert.equal(payment.payment_method,'WHISH Money');assert.deepEqual(payment.payment,{method:'whish',total_usd:5});
 assert.equal(state.queue.length,1);assert.equal(state.queue[0].data.details.payment.method,'whish');
 let checkoutCount=0;
 network.defaults.adapter=async config=>{
  if(config.method==='post'){assert.equal(config.url,'/api/checkout');const data=JSON.parse(config.data);assert.equal(data.details.payment.method,'whish');checkoutCount++;return {data:{success:true,orderId:'whish-sale'},status:201,headers:headers(11),config};}
  return {data:[],status:200,headers:headers(11),config};
 };
 navigator.onLine=true;await syncPending();assert.equal(checkoutCount,1);assert.equal((await load()).queue.length,0);
});

test('offline account roles enforce owner protection and role assignment',async()=>{
 await change(state=>{state.cache['/api/employees'].data=[{user_id:9,access_level:'owner',user_name:'Owner'},{user_id:10,access_level:'admin',user_name:'Admin'},{user_id:11,access_level:'employee',user_name:'Employee'}];});
 const auth=JSON.parse(localStorage.getItem('auth_user'));const role=value=>localStorage.setItem('auth_user',JSON.stringify({...auth,accessLevel:value}));
 role('manager');
 assert.equal(readLocal(await load(),'/api/employees').some(r=>r.access_level==='admin'),false);
 await assert.rejects(write('/api/employees/9',{name:'Changed'},'patch'),/cannot change/);
 await assert.rejects(write('/api/employees',{name:'New',accessLevel:'manager'}),/Only an Owner or Admin/);
 role('owner');await write('/api/employees',{name:'New manager',accessLevel:'manager'});
 role('admin');await write('/api/employees',{name:'Admin-created manager',accessLevel:'manager'});await assert.rejects(write('/api/employees',{name:'Second owner',accessLevel:'owner'}),/Only one Owner/);
 role('employee');await write('/api/employees',{name:'New employee',accessLevel:'employee'});assert.deepEqual(readLocal(await load(),'/api/employees'),[]);
 await assert.rejects(write('/api/employees',{name:'Admin',accessLevel:'admin'}),/cannot assign/);
});
test('position defaults update eligible offline payroll while preserving overrides and paid amounts',async()=>{
 await change(state=>{
  state.cache['/api/employees/payroll?month=2026-09']={data:[{userId:7,position:'Cashier',month:'2026-09',salarySource:'position',baseSalary:500,deductionsTotal:0,amountPaid:500,paymentStatus:'paid'},{userId:8,position:'Cashier',month:'2026-09',salarySource:'individual',baseSalary:700}]};
  state.cache['/api/employees/payroll?month=2026-08']={data:[{userId:7,position:'Cashier',month:'2026-08',salarySource:'position',baseSalary:500}]};
 });
 await write('/api/employees/position-salaries',{position:'Cashier',month:'2026-09',amount:600},'put');
 const state=await load();const rows=state.cache['/api/employees/payroll?month=2026-09'].data;
 assert.equal(rows[0].baseSalary,600);assert.equal(rows[0].amountPaid,500);assert.equal(rows[0].paymentStatus,'adjustment_required');assert.equal(rows[1].baseSalary,700);
 assert.equal(state.cache['/api/employees/payroll?month=2026-08'].data[0].baseSalary,500);
});

test('checkout returns a receipt only after the saved sale is durable',async()=>{
 const response=await write('/api/checkout',{totalAmount:5,customerName:'T1',details:{items:[{product_id:1,product_name:'Coffee',qty:1,price:5}],receipt_exchange_rate:89500,payment:{method:'whish'}}});
 const sale=(await load()).cache['/api/history'].data[0];assert.deepEqual(response.data.receipt,sale);assert.equal(response.data.orderId,sale.order_id);
});
