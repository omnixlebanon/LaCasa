// Isolated real-browser smoke test. Uses fixture data only; never connects to the POS database.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { spawn } from 'node:child_process';

const root=resolve(import.meta.dirname,'..');
const profile=await mkdtemp(join(tmpdir(),'lacasa-offline-browser-'));
const browser=process.env.BROWSER_EXE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const storageModule='data:text/javascript;base64,'+(await readFile(join(root,'src/offline/storage.js'))).toString('base64');
const catalog=[{product_id:1,product_name:'Test coffee',product_category:'Drinks',product_price:5,pos_hidden:0,category_hidden:0}];
let revision=1,shared=[],history=[],checkouts=0;
const receipts=new Map();
const server=http.createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://local').pathname;
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
   const payload=path==='/api/products'?catalog:path==='/api/products/categories'?[{p_category_id:1,p_category_name:'Drinks',pos_hidden:0}]:path==='/api/open-orders'?shared:path==='/api/history'?history:path==='/api/stock/summary'?{}:path==='/api/offline/revision'?{ready:true}:[];
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
 diagnose=async()=>console.log(JSON.stringify({page:await evaluate('document.body.innerText.slice(0,1500)'),local:await state()},null,2));
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
 await until(async()=>{const s=await state();return s.drafts.orders.length===0&&s.queue.some(op=>op.url==='/api/checkout');},'durable offline checkout');
 await command('Page.reload');await until(()=>evaluate("!!document.querySelector('.product-card-btn')"),'second offline reload');
 assert.equal((await state()).cache['/api/history'].data.length,1,'offline sale lost on reload');
 await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await until(async()=>(await state()).queue.length===0,'reconnect synchronization');
 assert.equal(checkouts,1);assert.equal(history.length,1);assert.equal(shared.length,0);
 console.log('PASS: mobile layout, offline reopening, durable cart, shared open order, offline checkout, reconnect and one sale only.');
}catch(error){await diagnose?.().catch(()=>{});throw error;}
finally{
 ws?.close();child?.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 await pause(500);
 const absolute=resolve(profile);assert(absolute.startsWith(resolve(tmpdir())+sep)&&absolute.split(sep).at(-1).startsWith('lacasa-offline-browser-'));
 await rm(absolute,{recursive:true,force:true,maxRetries:4,retryDelay:300});
}
