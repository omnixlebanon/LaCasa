import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canReuseResource} from './resources.js';
import {salesRefreshKey} from '../page/sales/utils/refreshKey.js';
const day='2026-11-07';
const previous={prepared:true,snapshotRevision:10,snapshotDay:day};
const manifest={revision:12,baseline:1,tables:{offline_open_orders:12,orders_history:9}};
test('cart-only changes reuse history while changed resources are replaced',()=>{
 assert.equal(canReuseResource('/api/history',previous,manifest,12,day),true);
 assert.equal(canReuseResource('/api/open-orders',previous,manifest,12,day),false);
 const checkout={...manifest,tables:{orders_history:12,batches:12,items:12,monthly_order_sequences:12}};
 assert.equal(canReuseResource('/api/history',previous,checkout,12,day),false);
 assert.equal(canReuseResource('/api/items',previous,checkout,12,day),false);
 assert.equal(canReuseResource('/api/products/groups',previous,checkout,12,day),true);
});
test('cascades invalidate recipe and batches even without direct writes to child tables',()=>{
 for(const table of ['products','items'])assert.equal(canReuseResource('/api/stock/recipe',previous,{...manifest,tables:{[table]:12}},12,day),false);
 assert.equal(canReuseResource('/api/offline/batches',previous,{...manifest,tables:{items:12}},12,day),false);
});
test('unknown mutations, legacy writers, corrupt tracking, role changes and date rollover fall back to full download',()=>{
 for(const value of [null,{...manifest,revision:11},{...manifest,baseline:11},{...manifest,tables:{unknown:12}},{...manifest,tables:{users:12}},{...manifest,tables:{items:'12'}},{revision:12}])assert.equal(canReuseResource('/api/products',previous,value,12,day),false);
 assert.equal(canReuseResource('/api/products',previous,manifest,12,'2026-11-08'),false);
 assert.equal(canReuseResource('/api/products',{...previous,snapshotRevision:undefined},manifest,12,day),false);
});
test('sales stays unchanged for cart changes and refreshes for sales, costs, payroll, expenses and calendar changes',()=>{
 const state={queue:[]};
 const before={revision:10,baseline:1,tables:{orders_history:8,offline_open_orders:10}};
 const key=salesRefreshKey(before,10,state,day);
 assert.equal(salesRefreshKey(manifest,12,state,day)===key,false); // history revision also changed
 assert.equal(salesRefreshKey({...manifest,tables:{orders_history:8,offline_open_orders:12}},12,state,day),key);
 for(const table of ['orders_history','items','product_items','business_expenses','payroll_payment_events'])assert.notEqual(salesRefreshKey({...manifest,tables:{orders_history:8,[table]:12}},12,state,day),key);
 assert.notEqual(salesRefreshKey(before,10,{queue:[{url:'/api/checkout',id:'sale'}]},day),key);
 assert.notEqual(salesRefreshKey(before,10,state,'2026-11-08'),key);
});
