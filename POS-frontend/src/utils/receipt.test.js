import {test} from 'node:test';
import assert from 'node:assert/strict';
import {receiptData,receiptDate} from './receipt.js';
test('receipt preserves saved cash totals, discount and rate',()=>{
 const receipt=receiptData({order_id:'offline-abc',total_amount:8,customer_name:'T2',order_date:'2026-10-01T10:00:00',details:{checkout_operation_id:'abc',subtotal:10,discount:2,items:[{product_name:'Coffee',qty:2,price:5}],payment_method:'Cash',payment:{method:'cash',currency:'USD',amount_received:20,change_usd:10,change_lbp:179000,exchange_rate:89500}}});
 assert.equal(receipt.id,'abc');assert.equal(receipt.local,true);assert.equal(receipt.subtotal,10);assert.equal(receipt.total,8);assert.equal(receipt.discount,2);assert.equal(receipt.rate,89500);assert.equal(receipt.payment.change_lbp,179000);
});
test('legacy and WHISH receipts do not invent received cash or exchange rates',()=>{
 const legacy=receiptData({order_id:'old',total_amount:4,details:JSON.stringify({payment_method:'Cash',items:[{name:'Water',quantity:2,price:2}]})});
 assert.equal(legacy.rate,null);assert.equal(legacy.payment.amount_received,undefined);assert.equal(legacy.items[0].name,'Water');
 const whish=receiptData({total_amount:5,status:'refunded',details:{payment:{method:'whish'},receipt_exchange_rate:90000}});assert.equal(whish.method,'WHISH Money');assert.equal(whish.refunded,true);assert.equal(whish.rate,90000);
 assert.equal(receiptData({details:'invalid'}).items.length,0);
});
test('receipt times preserve saved local time or convert UTC to Beirut',()=>{
 assert.equal(receiptDate('2026-10-01 13:05:00'),'2026-10-01 13:05');assert.equal(receiptDate(null),'Date not recorded');assert.match(receiptDate('2026-10-01T10:05:00Z'),/13:05/);
});
