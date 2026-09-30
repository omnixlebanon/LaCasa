import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {calculateCashPayment,normalizePaymentDetails} from './cashPayment.js';
const backend=createRequire(import.meta.url)('../../../POS-backend/services/cashPayment.js');
for(const [name,calculate,normalize] of [['frontend',calculateCashPayment,normalizePaymentDetails],['backend',backend.calculateCashPayment,backend.normalizePaymentDetails]]) {
 test(name+' cash change and validation',()=>{
  for(const [total,received,usd,lbp] of [[12.7,20,5,205850],[10,20,10,0],[12.7,50,35,205850],[12.7,15,0,205850],[12.7,12.7,0,0]]) {
   const p=calculate(total,89500,'USD',received);assert.equal(p.change_usd,usd);assert.equal(p.change_lbp,lbp);
  }
  assert.equal(calculate(10,89500,'LBP',1000000).change_lbp,105000);
  assert.equal(calculate(10,90000,'LBP',1000000).change_lbp,100000);
  assert.equal(calculate(10,89500,'LBP',1000000).change_usd,0);
  for(const args of [[10,89500,'USD',9],[10,89500,'USD',10.001],[10,89500,'LBP',1000000.5],[10,0,'USD',20],[10,89500,'EUR',20]])assert.throws(()=>calculate(...args));
  assert.deepEqual(normalize(10,{items:[]}),{items:[]});
  assert.deepEqual(normalize(10,{payment:{method:'whish',change_usd:500}}),{payment_method:'WHISH Money',payment:{method:'whish',total_usd:10}});
  assert.throws(()=>normalize(-1,{payment:{method:'whish'}}));
  assert.throws(()=>normalize(10,{payment:{method:'unsupported'}}));
  const p=normalize(10,{payment:{method:'cash',currency:'USD',amount_received:20,exchange_rate:89500,change_usd:900}});
  assert.equal(p.payment.change_usd,10);assert.equal(p.payment_method,'Cash');
 });
}
