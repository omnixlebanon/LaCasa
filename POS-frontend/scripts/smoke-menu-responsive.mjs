import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {spawn} from 'node:child_process';
// Fixtures only: this check never connects to the app's database or API.
const root=resolve(import.meta.dirname,'../dist');
const profile=await mkdtemp(join(tmpdir(),'menu-responsive-'));
const user={id:1,name:'Preview',email:'preview@test.invalid',accessLevel:'admin'};
const badges=['christmas','halloween','ramadan','new-year','limited-time','new','most-popular'];
const products=Array.from({length:9},(_,i)=>({product_id:i+1,product_name:'Seasonal Coffee',product_description:'Freshly prepared coffee.',product_category:'Drinks',product_price:3,product_image:'',menu_position:i}));
const appearance={theme:'default',decorations:true,badges:Object.fromEntries(badges.map((id,i)=>[i+1,[id]]))};
appearance.badges[8]=badges;
const fixtures={'/api/auth/me':{success:true,user},'/api/public/menu':{products,groups:[],appearance},'/api/products':products,'/api/products/categories':[{p_category_id:1,p_category_name:'Drinks',menu_group_id:1}],'/api/products/groups':[{group_id:1,group_name:'Drinks'}],'/api/settings/menu-appearance':appearance,'/api/settings/exchange-rate':{rate:89500},'/api/offline/revision':{ready:true}};
const server=http.createServer(async(req,res)=>{
    try {
        const path=new URL(req.url,'http://test').pathname;
        if(path.startsWith('/api/')) {res.setHeader('Content-Type','application/json');res.setHeader('X-Sync-Revision','1');return res.end(JSON.stringify(fixtures[path]??[]));}
        const file=path.startsWith('/POS')?join(root,'index.html'):path==='/menu'?join(root,'menu/index.html'):join(root,path);
        assert.ok(file.startsWith(root));
        res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
    } catch {res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
let child,ws;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<200;i++){try{if(await fn())return;}catch{}await pause(100);}throw Error('Timeout: '+label);}
try {
    child=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
    let port;await until(async()=>{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];return port;},'Chrome');
    const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
    ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    let seq=0;const pending=new Map();
    ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
    const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error(method+' timed out')),20000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;};
    await command('Page.enable');
    await command('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('auth_user',JSON.stringify(${JSON.stringify(user)}));`});
    for(const width of [320,375,600,768,1024,1440]) {
        await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=600});
        await command('Page.navigate',{url:origin+'/menu'});
        await until(()=>evaluate("document.querySelectorAll('.menu-item').length===9"),'menu');
        await evaluate('document.fonts.ready');
        for(const mode of ['light','dark']) {
            await evaluate(`document.documentElement.dataset.theme='${mode}'`);
            const metrics=await evaluate(`(()=>{const cards=[...document.querySelectorAll('.menu-item')];return {width:innerWidth,scroll:document.documentElement.scrollWidth,heights:cards.map(c=>c.getBoundingClientRect().height),pumpkins:document.querySelectorAll('.item-pumpkin-pair svg').length,year:document.querySelector('.year-number').textContent};})()`);
            assert.ok(metrics.scroll<=width+1,JSON.stringify({width,mode,...metrics}));
            assert.ok(metrics.heights.every(h=>Math.abs(h-metrics.heights[0])<1),'Decorations changed card heights: '+JSON.stringify(metrics));
            assert.equal(metrics.pumpkins,4);assert.ok(/^\d{4}$/.test(metrics.year));
            for (const theme of ['default','christmas','ramadan','halloween','new-year']) {
                await evaluate(`window.MenuSeason.apply({theme:'${theme}',decorations:true})`);
                assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`${theme} overflow at ${width}px`);
            }
        }
        await command('Page.navigate',{url:origin+'/POS/menu_management'});
        await until(()=>evaluate("!!document.querySelector('.menu-page-nav') && !document.querySelector('.loading-state') && !!document.querySelector('.menu-theme-option')"),'management');
        for(const page of ['Menu Order','Themes','Item Badges']) {
            await evaluate(`[...document.querySelectorAll('.menu-page-nav button')].find(b=>b.textContent==='${page}').click()`);await pause(80);
            const metrics=await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('.menu-management-page *')].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().right>innerWidth+1).slice(0,5).map(e=>e.className)})`);
            assert.ok(metrics.scroll<=width+1,JSON.stringify({width,page,...metrics}));
        }
        console.log('PASS menu light/dark and all management pages:',width+'px');
    }
} finally {
    ws?.close();child?.kill();await new Promise(r=>server.close(r));
    await pause(500);await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
