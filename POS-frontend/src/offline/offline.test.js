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
const {offlineAdapter,syncPending,network,resolvePending}=await import('./transport.js');
const {readLocal,applyLocal,keyOf,remap}=await import('./model.js');
const headers=revision=>({'x-sync-revision':String(revision)});
let account=0;
function fixture(){
 const cache={};for(const [path,data]of Object.entries({
  '/api/products':[{product_id:1,product_name:'Coffee',product_category:'Hot',product_price:5}],
  '/api/products/categories':[{p_category_id:1,p_category_name:'Hot',pos_hidden:0}],
  '/api/products/summary':[], '/api/stock/summary':{}, '/api/stock/categories':[],
  '/api/items':[{item_id:2,item_name:'Milk',stock:100,item_cost:0.1,safety_limit:10,shelf_life:3}],
  '/api/stock/recipe':[{product_id:1,item_id:2,qty:5}],
  '/api/offline/batches':[{batch_id:3,item_id:2,batch_stock:100,batch_exDate:'2099-01-01'}],
  '/api/stock/expired-batches':[], '/api/history':[], '/api/recurring-shifts':[],
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
test('a conflict blocks later operations and cannot be silently retried',async()=>{
 await write('/api/products',{product_name:'First',product_category:'Hot',product_price:2});
 await write('/api/products',{product_name:'Second',product_category:'Hot',product_price:2});
 let count=0;
 network.defaults.adapter=async config=>{count++;throw new AxiosError('Conflict','ERR_BAD_REQUEST',config,null,{status:409,data:{revision:25,error:'Another device changed this'},headers:headers(25)});};
 navigator.onLine=true;await syncPending();await syncPending();
 assert.equal(count,1);assert.equal((await load()).queue.length,2);assert.equal((await load()).queue[0].blocked,true);
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
