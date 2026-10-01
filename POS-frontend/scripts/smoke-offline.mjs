// Isolated real-browser smoke test. Uses fixture data only; never connects to the POS database.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { spawn } from 'node:child_process';

const fullDay=process.argv.includes('--full-day');
const root=resolve(import.meta.dirname,'..');
const profile=await mkdtemp(join(tmpdir(),'lacasa-offline-browser-'));
const browser=process.env.BROWSER_EXE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const storageModule='data:text/javascript;base64,'+(await readFile(join(root,'src/offline/storage.js'))).toString('base64');
const catalog=[{product_id:1,product_name:'Test coffee',product_category:'Drinks',product_price:5,pos_hidden:0,category_hidden:0}];
if(fullDay)for(let id=2;id<=100;id++)catalog.push({...catalog[0],product_id:id,product_name:'Test product '+id});
let revision=1,shared=[],history=[],checkouts=0;
const receipts=new Map();
const server=http.createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://local').pathname;
  if(path.startsWith('/test-modules/')){
   const name=path.split('/').at(-1);if(!['transport.js','storage.js','model.js','cashPayment.js','accessPolicy.js','axios.js'].includes(name)){res.statusCode=404;return res.end();}
   let source=await readFile(name==='axios.js'?join(root,'node_modules/axios/dist/esm/axios.js'):join(root,['cashPayment.js','accessPolicy.js'].includes(name)?'src/utils':'src/offline',name),'utf8');
   if(name==='model.js')source=source.replace('../utils/cashPayment.js','./cashPayment.js');
   source=source.replace('../utils/accessPolicy.js','./accessPolicy.js');
   if(name==='transport.js')source=source.replace("from 'axios'","from './axios.js'");
   res.setHeader('Content-Type','text/javascript');return res.end(source);
  }
  if(path.startsWith('/api/')){
   let body='';for await(const chunk of req)body+=chunk;
   const data=body?JSON.parse(body):{};
   res.setHeader('Content-Type','application/json');res.setHeader('X-Sync-Revision',String(revision));
   if(req.method!=='GET'){
    const id=req.headers['x-operation-id'];
    if(receipts.has(id)){const saved=receipts.get(id);res.setHeader('X-Sync-Revision',saved.revision);return res.end(JSON.stringify(saved.data));}
    if(Number(req.headers['x-base-revision'])!==revision){res.statusCode=409;return res.end(JSON.stringify({error:'Conflict',revision}));}
    let result={success:true};
    if(path.startsWith('/api/open-orders/'))shared=req.method==='DELETE'?shared.filter(order=>order.checkoutOperationId!==path.split('/').at(-1)):[...shared.filter(order=>order.checkoutOperationId!==data.order.checkoutOperationId),data.order];
    if(path==='/api/checkout'){checkouts++;result={success:true,orderId:'test-sale-'+checkouts};history.push({order_id:result.orderId,total_amount:data.totalAmount,details:data.details,order_date:req.headers['x-offline-created-at']});shared=shared.filter(order=>order.checkoutOperationId!==data.details.checkout_operation_id);}
    revision++;receipts.set(id,{data:result,revision});res.setHeader('X-Sync-Revision',String(revision));return res.end(JSON.stringify(result));
   }
   if(path==='/api/employees/payroll-costs')return res.end(JSON.stringify([{user_id:7,employee_name:'Test cashier',salary_month:new Date().toISOString().slice(0,7)+'-01',amount_paid:600,paid_at:new Date().toISOString()}]));
   const payload=path==='/api/seating/floors'?[{floor_id:1,floor_name:'Test floor',tables:[{t_id:1,t_name:'T1',t_status:'available',t_seats:2,t_type:'square'}]}]:path==='/api/products'?catalog:path==='/api/products/categories'?[{p_category_id:1,p_category_name:'Drinks',pos_hidden:0}]:path==='/api/open-orders'?shared:path==='/api/history'?history:path==='/api/stock/summary'?{}:path==='/api/offline/revision'?{ready:true}:[];
   return res.end(JSON.stringify(payload));
  }
  const requested=resolve(root,'dist','.'+path);
  if(!requested.startsWith(join(root,'dist')+sep)){res.statusCode=400;return res.end();}
  let file;
  try{file=await readFile(requested);}catch{file=await readFile(join(root,'dist/index.html'));}
  const type=path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/html';
  res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store');res.end(file);
 }catch(error){res.statusCode=500;res.end(error.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let child,ws,diagnose;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){const started=Date.now();while(Date.now()-started<25000){const result=await fn();if(result)return result;await pause(100);}throw Error('Timed out: '+label);}
try{
 child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 child.on('error',error=>console.error(error.message));
 const port=await until(async()=>{try{return (await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{return null;}},'browser startup');
 const target=await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin+'/POS')}`,{method:'PUT'})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let sequence=0;const requests=new Map();
 ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const pending=requests.get(message.id);if(!pending)return;requests.delete(message.id);clearTimeout(pending.timer);if(message.error)pending.reject(Error(message.error.message));else pending.resolve(message.result);}};
 function command(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{requests.delete(id);reject(Error('CDP timeout: '+method));},25000);requests.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
 async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text+': '+result.exceptionDetails.exception?.description);return result.result?.value;}
 const state=()=>evaluate(`import(${JSON.stringify(storageModule)}).then(m=>m.load())`);
 diagnose=async()=>{const saved=await state();console.log(JSON.stringify({page:await evaluate('document.body.innerText.slice(0,1500)'),local:fullDay?{queue:saved.queue.length,first:saved.queue[0],error:saved.error,recovery:saved.recovery.length}:saved},null,2));};
 await command('Page.enable');await command('Network.enable');
 await command('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('auth_user',JSON.stringify({id:1,email:'test@fixture.invalid',name:'Test admin',accessLevel:'admin'}));`});
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await command('Page.navigate',{url:origin+'/POS'});
 await until(async()=>{try{return (await state()).prepared;}catch{return false;}},'offline data preparation');
 await evaluate('navigator.serviceWorker.ready.then(()=>true)');
 await until(()=>evaluate("!!document.querySelector('.product-card-btn')"),'product display');
 assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'mobile layout overflows');
 await evaluate("document.querySelector('.mobile-order-context button').click()");
 await until(async()=>(await state()).drafts.orders.length===1,'create cart');
 await evaluate("document.querySelector('.product-card-btn').click()");
 await until(async()=>{const s=await state();return s.drafts.orders[0]?.items[0]?.qty===1&&s.queue.length===0;},'sync cart');
 assert.equal(shared[0].items[0].qty,1,'open cart was not shared');
 await command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 await evaluate("document.querySelector('.product-card-btn').click()");
 await until(async()=>{const s=await state();return s.drafts.orders[0]?.items[0]?.qty===2&&s.queue.length>0;},'offline cart edit');
 await command('Page.reload');
 await until(()=>evaluate("!!document.querySelector('.product-card-btn')"),'offline shell reload');
 assert.equal((await state()).drafts.orders[0].items[0].qty,2,'cart lost on offline reload');
 await evaluate("document.querySelectorAll('.mobile-order-tabs button')[1].click()");
 const boxes=await evaluate("(() => {const a=document.querySelector('.offline-indicator').getBoundingClientRect(),b=document.querySelector('.check-in-btn').getBoundingClientRect();return {overlap:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top};})()");
 assert.equal(boxes.overlap,false,'sync button overlaps checkout');
 await evaluate("document.querySelector('.check-in-btn').click()");
 await until(()=>evaluate("!!document.querySelector('.cash-payment-dialog[open]')"),'payment dialog');
 assert.equal((await state()).drafts.orders.length,1,'opening payment keeps the order');
 await evaluate("document.querySelector('[aria-label=\"Cancel payment\"]').click()");
 assert.equal((await state()).drafts.orders.length,1,'cancelling payment keeps the order');
 await evaluate("document.querySelector('.check-in-btn').click()");
 await until(()=>evaluate("!!document.querySelector('.cash-payment-dialog[open]')"),'reopened payment');

 await evaluate("document.querySelectorAll('.payment-methods button')[1].click()");
 assert.equal(await evaluate("document.querySelector('.confirm-cash-payment').disabled"),false,'WHISH can be recorded without cash details');
 await evaluate("document.querySelectorAll('.payment-methods button')[0].click()");
 await evaluate("(() => {const input=document.querySelector('#cash-currency');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(input,'LBP');input.dispatchEvent(new Event('change',{bubbles:true}));})()");
 await evaluate("(() => {const input=document.querySelector('#cash-received');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'1000000');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await until(()=>evaluate("!!document.querySelector('.payment-change')"),'lira change');
 assert.match(await evaluate("document.querySelector('.payment-change').textContent"),/105,000/);
 assert.doesNotMatch(await evaluate("document.querySelector('.payment-change').textContent"),/US dollars/);
 await evaluate("(() => {const input=document.querySelector('#cash-currency');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(input,'USD');input.dispatchEvent(new Event('change',{bubbles:true}));})()");

 await evaluate("(() => {const input=document.querySelector('#cash-received');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'17.3');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await until(()=>evaluate("!document.querySelector('.confirm-cash-payment').disabled"),'cash ready');
 assert.match(await evaluate("document.querySelector('.payment-change').textContent"),/\$5.00/);
 await evaluate("window.print=()=>{window.receiptPrints=(window.receiptPrints||0)+1;};");
 await evaluate("document.querySelector('.confirm-cash-payment').click()");

 await until(async()=>{const s=await state();return s.drafts.orders.length===0&&s.queue.some(op=>op.url==='/api/checkout');},'durable offline checkout');
 await until(()=>evaluate("!!document.querySelector('.receipt-dialog[open]')"),'saved receipt preview');
 assert.match(await evaluate("document.querySelector('.receipt-paper').textContent"),/Test coffee/);
 assert.match(await evaluate("document.querySelector('.receipt-paper').textContent"),/205,850/);
 await until(()=>evaluate('window.receiptPrints===1'),'automatic receipt print');
 assert.doesNotMatch(await evaluate("document.querySelector('.receipt-paper').textContent"),/1 USD =/);
 assert.equal(await evaluate('window.receiptPrints'),1);
 assert.equal((await state()).queue.filter(op=>op.url==='/api/checkout').length,1,'printing must not create another sale');
 await command('Emulation.setEmulatedMedia',{media:'print'});
 assert.equal(await evaluate("getComputedStyle(document.querySelector('#root')).display"),'none');
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.receipt-toolbar')).display"),'none');
 assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.receipt-paper')).display"),'none');
 await command('Emulation.setEmulatedMedia',{media:''});
 await evaluate("document.querySelector('[aria-label=\"Close receipt\"]').click()");

 await command('Page.reload');await until(()=>evaluate("!!document.querySelector('.product-card-btn')"),'second offline reload');
 assert.equal((await state()).cache['/api/history'].data.length,1,'offline sale lost on reload');
 await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await until(async()=>(await state()).queue.length===0,'reconnect synchronization');
 assert.equal(checkouts,1);assert.equal(history[0].details.payment.amount_received,17.3);assert.equal(history[0].details.payment.change_usd,5);assert.equal(history[0].details.payment.change_lbp,205850);assert.equal(history.length,1);assert.equal(shared.length,0);
 if(fullDay){
  await evaluate(`import('/test-modules/transport.js').then(m=>{window.dayTransport=m;m.network.defaults.baseURL=location.origin;})`);
  await command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  const began=Date.now();
  for(let batch=0;batch<50;batch++){
   await evaluate(`(async()=>{const m=window.dayTransport;for(let n=0;n<10;n++){
    const id=crypto.randomUUID();
    await m.saveDraftEdit(d=>{d.orders.push({id,checkoutOperationId:id,label:'Full day test',items:[]});d.activeOrderId=id;});
    for(let qty=1;qty<=5;qty++)await m.saveDraftEdit(d=>{d.orders.find(o=>o.id===id).items=[{product_id:1,product_name:'Test coffee',qty,product_price:5}];});
    await m.offlineAdapter({url:'/api/seating/tables/1/status',method:'put',data:{t_status:'occupied'}});
    await m.offlineAdapter({url:'/api/checkout',method:'post',data:{totalAmount:25,customerName:'Full day test',details:{checkout_operation_id:id,table_id:1,items:[{product_id:1,qty:5,price:5}]}}});
   }return true;})()`);
   if((batch+1)%10===0)console.log('Full-day test: '+((batch+1)*10)+' orders saved offline');
  }
  const saved=await state();assert.equal(saved.queue.filter(op=>op.url==='/api/checkout').length,500);assert.equal(saved.queue.length,1500);assert.equal(saved.cache['/api/history'].data.length,501);
  console.log('500 orders and 2,500 cart edits saved in '+((Date.now()-began)/1000).toFixed(1)+'s; encrypted state payload '+(Buffer.byteLength(JSON.stringify(saved))/1048576).toFixed(2)+' MiB');
  await command('Page.reload');await until(()=>evaluate("!!document.querySelector('.product-card-btn')"),'full day offline reload');
  assert.equal((await state()).queue.filter(op=>op.url==='/api/checkout').length,500);
  await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  const syncStart=Date.now();
  while((await state()).queue.length){if(Date.now()-syncStart>300000)throw Error('Full-day sync exceeded five minutes');await pause(1000);}
  assert.equal(checkouts,501);assert.equal(history.length,501);assert.equal(new Set(history.map(sale=>sale.order_id)).size,501);
  await command('Page.reload');await pause(1000);assert.equal(checkouts,501);
  console.log('PASS: 500 offline orders survived reload and synced exactly once in '+((Date.now()-syncStart)/1000).toFixed(1)+'s.');
 }
 if(!fullDay){
  await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/POS/employees`});
  await until(()=>evaluate("!!document.querySelector('.employee-page-nav')"),'employee navigation');
  assert.equal(await evaluate("!!document.querySelector('.employee-payroll')"),false,'salary controls are separate from employee management');
  await evaluate("document.querySelector('.employee-page-nav a[href$=\"/employees/payroll\"]').click()");
  await until(()=>evaluate("!!document.querySelector('.employee-payroll')"),'separate payroll page');
  assert.equal(await evaluate("!!document.querySelector('.position-salary-form')"),true,'position defaults form');
  await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/POS/sales`});
  await until(()=>evaluate("!!document.querySelector('.sales-kpi-grid')"),'sales with payroll');
  assert.equal(await evaluate("!!document.querySelector('.sales-cost-chart')"),false);
  await evaluate("Array.from(document.querySelectorAll('.sales-chart-tab')).find(el=>el.textContent==='Total Cost by Expense').click()");
  await until(()=>evaluate("!!document.querySelector('.sales-cost-chart')"),'cost pie tab');
  assert.match(await evaluate("document.querySelector('.sales-cost-chart').textContent"),/Total Cost by Expense/);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.sales-alert-type')).some(el=>['Payroll Paid','Total Expenses','Saved Order Costs','Result After Expenses'].includes(el.textContent))"),false);
  await evaluate("Array.from(document.querySelectorAll('.sales-chart-tab')).find(el=>el.textContent.trim()==='Cash / WHISH').click()");
  await until(()=>evaluate("!!document.querySelector('.sales-payment-chart')"),'payment pie');
  assert.match(await evaluate("document.querySelector('.sales-payment-chart').textContent"),/Cash/);
  await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/POS/`});
  await until(()=>evaluate("!!document.querySelector('.product-card-btn')"),'new WHISH order');
  await evaluate("document.querySelector('.mobile-order-context button').click()");
  await until(async()=>(await state()).drafts.orders.length===1,'WHISH draft');
  await command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await evaluate("document.querySelector('.product-card-btn').click()");
  await until(async()=>(await state()).drafts.orders[0]?.items.length===1,'WHISH item');
  await evaluate("document.querySelectorAll('.mobile-order-tabs button')[1].click()");
  await evaluate("document.querySelector('.check-in-btn').click()");
  await until(()=>evaluate("!!document.querySelector('.cash-payment-dialog[open]')"),'WHISH payment dialog');
  await evaluate("document.querySelectorAll('.payment-methods button')[1].click()");
  await evaluate("window.receiptPrints=0;window.print=()=>{window.receiptPrints++;window.dispatchEvent(new Event('afterprint'));};");
  await evaluate("document.querySelector('.confirm-cash-payment').click()");
  await until(async()=>(await state()).drafts.orders.length===0,'WHISH saved offline');
  await until(()=>evaluate("window.receiptPrints===1&&!document.querySelector('.receipt-dialog[open]')"),'automatic print closes receipt');
  await command('Page.reload');await until(()=>evaluate("!!document.querySelector('.product-card-btn')"),'WHISH offline reload');
  assert.equal((await state()).cache['/api/history'].data.at(-1).details.payment.method,'whish');
  await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await until(async()=>(await state()).queue.length===0,'WHISH sync');
  assert.equal(checkouts,2);assert.equal(history.at(-1).details.payment.method,'whish');
  await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/POS/history`});
  await until(()=>evaluate("!!document.querySelector('.history-print-btn')"),'history receipt button');
  await evaluate("document.querySelector('.history-print-btn').click()");
  await until(()=>evaluate("!!document.querySelector('.receipt-dialog[open]')"),'reprint preview');
  assert.match(await evaluate("document.querySelector('.receipt-paper').textContent"),/WHISH Money/);
  assert.equal(checkouts,2,'reprinting must not create a sale');
  await evaluate("window.print=()=>{};document.querySelector('.receipt-print-button').click()");
 const receiptPdf=await command('Page.printToPDF',{preferCSSPageSize:true,displayHeaderFooter:false});
 const pdfText=Buffer.from(receiptPdf.data,'base64').toString('latin1');
 const pageBox=pdfText.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
 assert.ok(pageBox,'receipt PDF has page dimensions');
 assert.ok(Math.abs(Number(pageBox[1])-80*72/25.4)<2,'receipt uses the 80 mm roll');
 assert.ok(Number(pageBox[2])<200*72/25.4,'short receipt does not use a full-length page');
 assert.equal((pdfText.match(/\/Type\s*\/Page\b/g)||[]).length,1,'short receipt fits one page');



 }
 console.log('PASS: mobile layout, offline reopening, durable cart, shared open order, offline checkout, reconnect and one sale only.');
}catch(error){await diagnose?.().catch(()=>{});throw error;}
finally{
 ws?.close();child?.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 await pause(500);
 const absolute=resolve(profile);assert(absolute.startsWith(resolve(tmpdir())+sep)&&absolute.split(sep).at(-1).startsWith('lacasa-offline-browser-'));
 await rm(absolute,{recursive:true,force:true,maxRetries:4,retryDelay:300});
}
