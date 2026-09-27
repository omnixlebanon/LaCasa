export const keyOf = (url, params={}) => {const u=new URL(url,'https://local');for(const [k,v]of Object.entries(params||{}))if(v!==undefined&&v!==null)u.searchParams.set(k,v);u.searchParams.sort();return u.pathname+u.search;};
const pathOf = key => key.split('?')[0].split('/').map(decodeURIComponent).join('/');
const copy = value => structuredClone(value);
const same = (a,b)=>String(a)===String(b);
export function cached(state,path){const exact=state.cache[path];if(exact)return exact.data;const key=Object.keys(state.cache).find(k=>pathOf(k)===path);return key?state.cache[key].data:undefined;}
function each(state,path,fn){for(const [key,value]of Object.entries(state.cache))if(pathOf(key)===path)value.data=fn(value.data,key);}
function upsert(rows,key,id,patch){const existing=rows.find(r=>same(r[key],id));if(existing)Object.assign(existing,patch);else rows.push({[key]:id,...patch});return rows;}
function localDay(date=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Beirut',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));}
function deductStock(state,itemId,quantity){
 const batches=cached(state,'/api/offline/batches');let remaining=quantity;
 if(batches)for(const batch of batches.filter(b=>same(b.item_id,itemId)).sort((a,b)=>String(a.batch_exDate).localeCompare(String(b.batch_exDate))||Number(a.batch_id)-Number(b.batch_id))){const used=Math.min(remaining,Number(batch.batch_stock));batch.batch_stock=Number(batch.batch_stock)-used;remaining-=used;if(remaining<=0)break;}
 each(state,'/api/items',rows=>rows.map(item=>same(item.item_id,itemId)?{...item,stock:batches?batches.filter(b=>same(b.item_id,itemId)).reduce((sum,b)=>sum+Number(b.batch_stock),0):Math.max(0,Number(item.stock)-quantity)}:item));
}
function receiveStock(state,itemId,quantity,id,createdAt){
 const item=(cached(state,'/api/items')||[]).find(i=>same(i.item_id,itemId));if(!item)return;
 const expiry=new Date(Date.parse(localDay(createdAt)+'T00:00:00Z')+Number(item.shelf_life||0)*86400000).toISOString().slice(0,10);
 each(state,'/api/offline/batches',rows=>[...rows,{batch_id:id,item_id:itemId,batch_stock:quantity,batch_exDate:expiry}]);
 item.stock=Number(item.stock||0)+quantity;
}
function summaries(state){
 const products=cached(state,'/api/products')||[];const items=cached(state,'/api/items')||[];const recipes=cached(state,'/api/stock/recipe')||[];
 const batches=cached(state,'/api/offline/batches');
 if(batches){for(const item of items){item.exDate=batches.filter(b=>same(b.item_id,item.item_id)&&Number(b.batch_stock)>0).map(b=>b.batch_exDate).sort()[0]||null;item.stockStatus=Number(item.stock)<=0?'out of stock':Number(item.stock)>Number(item.safety_limit)?'well':'Low';}each(state,'/api/stock/expired-batches',()=>batches.filter(b=>Number(b.batch_stock)>0&&b.batch_exDate<localDay()).map(b=>({...b,item_name:items.find(i=>same(i.item_id,b.item_id))?.item_name,uom:items.find(i=>same(i.item_id,b.item_id))?.uom})));}
 each(state,'/api/products/summary',()=>products.map(p=>{const linked=recipes.filter(r=>same(r.product_id,p.product_id)).map(r=>{const i=items.find(i=>same(i.item_id,r.item_id));return {id:r.item_id,name:i?.item_name,qty:Number(r.qty),uom:i?.uom,item_cost:Number(i?.item_cost||0)};});const cost=linked.reduce((s,i)=>s+i.qty*i.item_cost,0);return {...p,cost,profit:Number(p.product_price)-cost,linked_items:linked};}));
 each(state,'/api/stock/summary',()=>({totalStockValue:items.reduce((s,i)=>s+Number(i.stock)*Number(i.item_cost),0),expiredItemsCount:items.filter(i=>i.exDate&&i.exDate<=new Date().toISOString().slice(0,10)).length,needsRefillCount:items.filter(i=>Number(i.stock)<=Number(i.safety_limit)).length}));
}
export function applyLocal(state,op) {
 const path=pathOf(op.url), parts=path.split('/'), data=op.data||{}, method=op.method, id=op.tempId;
 const response={success:true,offline:true,insertId:id,id,item_id:id,user_id:id,shift_id:id,recurrence_id:id,requestId:id,i_category_id:id};
 if(path.startsWith('/api/open-orders/')){
  each(state,'/api/open-orders',rows=>method==='delete'?rows.filter(order=>order.checkoutOperationId!==parts[3]):upsert(rows,'checkoutOperationId',parts[3],copy(data.order)));
 } else if(path==='/api/checkout'){
  if(!Array.isArray(data.details?.items)||!data.details.items.length||!Number.isFinite(Number(data.totalAmount))||Number(data.totalAmount)<=0)throw Error('A sale needs items and a positive total.');
  const ingredients=cached(state,'/api/items')||[],recipes=cached(state,'/api/stock/recipe')||[];
  data.details.offline_recipe_snapshot=data.details.offline_recipe_snapshot||data.details.items.map(sold=>({product_id:sold.product_id,ingredients:recipes.filter(r=>same(r.product_id,sold.product_id)).map(r=>({item_id:r.item_id,qty:Number(r.qty),item_cost:Number(ingredients.find(i=>same(i.item_id,r.item_id))?.item_cost||0)}))}));
  const details=copy(data.details);details.offline_operation_id=op.id;
  details.items=details.items.map(sold=>{const recipe=details.offline_recipe_snapshot.find(r=>same(r.product_id,sold.product_id)).ingredients;const unit_cost=Math.round(recipe.reduce((sum,r)=>sum+r.qty*r.item_cost,0)*100)/100;return {...sold,unit_cost,total_cost:Math.round(unit_cost*sold.qty*100)/100,cost_source:recipe.length?'offline_checkout_recipe':'no_recipe'};});
  details.cost_snapshot_version=1;details.total_cost=details.items.reduce((sum,item)=>sum+Math.round(item.total_cost*100),0)/100;
  each(state,'/api/history',rows=>[...rows,{internal_id:id,order_id:'offline-'+op.id,customer_name:data.customerName,total_amount:data.totalAmount,details,order_date:op.createdAt,status:'completed',pending_sync:true}]);
  each(state,'/api/seating/floors',floors=>{for(const f of floors)for(const t of f.tables)if(same(t.t_id,details.table_id)||t.t_name===details.table_name)t.t_status='available';return floors;});
  for(const sold of details.items||[])for(const recipe of details.offline_recipe_snapshot.find(r=>same(r.product_id,sold.product_id)).ingredients)deductStock(state,recipe.item_id,Number(sold.qty)*Number(recipe.qty));
  if(state.drafts){state.drafts.orders=state.drafts.orders.filter(order=>order.checkoutOperationId!==op.id);if(!state.drafts.orders.some(order=>order.id===state.drafts.activeOrderId))state.drafts.activeOrderId=state.drafts.orders.at(-1)?.id||null;}
  each(state,'/api/open-orders',rows=>rows.filter(order=>order.checkoutOperationId!==data.details.checkout_operation_id));
 } else if(path==='/api/seating/layout'){
  each(state,'/api/seating/floors',()=>copy(data.floors));
 } else if(path.startsWith('/api/seating/tables/')){
  each(state,'/api/seating/floors',floors=>{for(const f of floors)for(const t of f.tables)if(same(t.t_id,parts[4])||t.t_name===data.t_name){t.t_status=data.t_status;if(data.open_order&&state.drafts){const drafts=state.drafts;let order=drafts.orders.find(o=>same(o.tableId,t.t_id));if(!order){const key=crypto.randomUUID();drafts.nextOrder++;order={id:key,checkoutOperationId:key,label:t.t_name,tableId:t.t_id,tableName:t.t_name,orderType:'dine-in',items:[]};drafts.orders.push(order);}drafts.activeOrderId=order.id;data.order=copy(order);each(state,'/api/open-orders',rows=>upsert(rows,'checkoutOperationId',order.checkoutOperationId,copy(order)));}}return floors;});
 } else if(path==='/api/products/menu-order'){
  const key=data.kind==='categories'?'p_category_id':'product_id';
  each(state,data.kind==='categories'?'/api/products/categories':'/api/products',rows=>rows.map(row=>({...row,menu_position:data.entries.findIndex(entry=>same(entry[key],row[key]))})).sort((a,b)=>a.menu_position-b.menu_position));
 } else if(path==='/api/products/category'||path.startsWith('/api/products/category/')){
  each(state,'/api/products/categories',rows=>{if(method==='post')rows.push({p_category_id:id,p_category_name:data.category_name,pos_hidden:0});if(method==='put')for(const c of rows)if(c.p_category_name===data.old_name)c.p_category_name=data.new_name;return method==='delete'?rows.filter(c=>c.p_category_name!==decodeURIComponent(parts[4])):rows;});
  each(state,'/api/products',rows=>rows.map(p=>({...p,product_category:method==='put'&&p.product_category===data.old_name?data.new_name:method==='delete'&&p.product_category===decodeURIComponent(parts[4])?null:p.product_category})));
 } else if(path.startsWith('/api/products/categories/')){
  each(state,'/api/products/categories',rows=>rows.map(c=>same(c.p_category_id,parts[4])?{...c,pos_hidden:data.hidden?1:0}:c));
 } else if(path.startsWith('/api/products')){
  if((path==='/api/products'&&method==='post'||parts.length===4&&method==='patch')&&data.product_name!==undefined){
   if(typeof data.product_name!=='string'||!data.product_name.trim()||data.product_name.trim().length>120)throw Error('Product name must contain 1?120 characters.');
   data.product_name=data.product_name.trim();
   const duplicate=(cached(state,'/api/products')||[]).find(product=>!same(product.product_id,method==='patch'?parts[3]:null)&&String(product.product_name).trim().toLowerCase()===data.product_name.toLowerCase());
   if(duplicate)throw Error('A product with this name already exists. Edit the existing product or choose a different name.');
  }
  each(state,'/api/products',rows=>{if(path==='/api/products')return upsert(rows,'product_id',id,{...data,pos_hidden:0});if(method==='delete')return rows.filter(p=>!same(p.product_id,parts[3]));return rows.map(p=>same(p.product_id,parts[3])?{...p,...(parts[4]==='visibility'?{pos_hidden:data.hidden?1:0}:data)}:p);});
 } else if(path==='/api/items'||/^\/api\/stock\/[^/]+\/(edit|delete|batch)$/.test(path)){
  each(state,'/api/items',rows=>{if(method==='delete')return rows.filter(i=>!same(i.item_id,parts[3]));const itemId=path==='/api/items'?id:parts[3];const old=rows.find(i=>same(i.item_id,itemId))||{};const patch={};const fields={stock_name:'item_name',stock_category:'item_category',stock_uom:'uom',stock_limit:'safety_limit',stock_cost:'item_cost',stock_shelf_life:'shelf_life',stock_supplier:'supplier_name',stock_supplier_contact:'supplier_contact'};for(const [from,to]of Object.entries(fields))if(data[from]!==undefined)patch[to]=data[from];if(parts[4]==='batch')patch.stock=Number(old.stock||0)+Number(data.batch_stock);return upsert(rows,'item_id',itemId,{stock:0,item_cost:0,safety_limit:0,...old,...patch});});
  if(method==='delete')each(state,'/api/stock/recipe',rows=>rows.filter(r=>!same(r.item_id,parts[3])));
  if(parts[4]==='batch'){const item=(cached(state,'/api/items')||[]).find(i=>same(i.item_id,parts[3]));item.stock-=Number(data.batch_stock);receiveStock(state,parts[3],Number(data.batch_stock),id,op.createdAt);}
  if(method==='delete')each(state,'/api/offline/batches',rows=>rows.filter(b=>!same(b.item_id,parts[3])));
 } else if(path.startsWith('/api/stock/categories')){
  const rows=cached(state,'/api/stock/categories')||[];const old=rows.find(c=>same(c.i_category_id,parts[4]));
  each(state,'/api/stock/categories',rows=>method==='delete'?rows.filter(c=>!same(c.i_category_id,parts[4])):upsert(rows,'i_category_id',method==='post'?id:parts[4],data));
  if(old)each(state,'/api/items',rows=>rows.map(i=>i.item_category===old.i_category_name?{...i,item_category:method==='delete'?null:data.i_category_name}:i));
 } else if(path.startsWith('/api/stock/recipe/')){
  each(state,'/api/stock/recipe',rows=>{if(method==='post')rows.push({recipe_id:id,product_id:Number(parts[4]),item_id:data.item_id,qty:data.qty});if(method==='patch')for(const i of data.linked_items)for(const r of rows)if(same(r.product_id,parts[4])&&same(r.item_id,i.id))r.qty=i.qty;return method==='delete'?rows.filter(r=>!(same(r.product_id,parts[4])&&same(r.item_id,parts[5]))):rows;});
 } else if(path==='/api/stock/discard-expired'){
  // Pending disposal remains visible for review; the server validates exact batches on sync.
  const ids=(data.batches||[]).map(b=>b.batch_id);
  const batches=cached(state,'/api/stock/expired-batches')||[];
  each(state,'/api/items',rows=>rows.map(item=>({...item,stock:Math.max(0,Number(item.stock)-batches.filter(b=>same(b.item_id,item.item_id)&&ids.some(id=>same(id,b.batch_id))).reduce((sum,b)=>sum+Number(b.batch_stock),0))})));
  each(state,'/api/stock/expired-batches',rows=>rows.filter(b=>!ids.some(id=>same(id,b.batch_id))));
  each(state,'/api/offline/batches',rows=>rows.map(b=>ids.some(id=>same(id,b.batch_id))?{...b,batch_stock:0}:b));
 } else if(path.startsWith('/api/expenses')){
  each(state,'/api/expenses',(rows,key)=>{
   if(method==='delete')return rows.filter(r=>!same(r.expense_id,parts[3]));
   if(parts[4]==='stop')return rows.filter(r=>!same(r.expense_id,parts[3])||r.expense_date<data.from);
   const row={expense_id:method==='post'?id:Number(parts[3]),category:data.category,description:data.description,amount:data.amount,expense_date:data.date,frequency:data.frequency==='none'?null:data.frequency,repeat_until:data.repeat_until||null,recurring:data.frequency&&data.frequency!=='none',pending_sync:true};
   rows=rows.filter(r=>!same(r.expense_id,row.expense_id));const params=new URL(key,'https://local').searchParams;const from=params.get('from')||(params.get('month')?params.get('month')+'-01':'2000-01-01');const to=params.get('through')||(params.get('month')?new Date(Date.UTC(Number(params.get('month').slice(0,4)),Number(params.get('month').slice(5,7)),0)).toISOString().slice(0,10):'9999-01-01');
   for(const occurrence of expenseOccurrences(row,from,to))rows.push(occurrence);return rows;
  });
 } else if(/^\/api\/employees\/[^/]+\/(salary|payroll-payment)$/.test(path)){
  each(state,'/api/employees/payroll',rows=>rows.map(r=>{
   if(!same(r.userId,parts[3])||r.month.slice(0,7)!==data.month.slice(0,7))return r;
   const salary=parts[4]==='salary'?Number(data.amount):r.baseSalary;
   const net=salary===null?null:Math.round((salary-Number(r.deductionsTotal||0))*100)/100;
   const payable=net===null?null:Math.max(0,net);
   if(parts[4]==='payroll-payment'&&data.status==='paid'&&(payable===null||Number(data.expectedAmount)!==payable))throw Error('Refresh salary details before marking paid.');
   const paid=parts[4]==='payroll-payment'?(data.status==='paid'?payable:0):Number(r.amountPaid||0);
   const wasPaid=parts[4]==='payroll-payment'?data.status==='paid':r.paymentStatus!=='unpaid';
   return {...r,baseSalary:salary,netSalary:net,payableAmount:payable,amountPaid:paid,paymentDifference:payable===null?null:payable-paid,paymentStatus:wasPaid?(paid===payable?'paid':'adjustment_required'):'unpaid',pending_sync:true};
  }));
 } else if(path.startsWith('/api/employees')){
  each(state,'/api/employees',rows=>{if(method==='delete')return rows.filter(r=>!same(r.user_id,parts[3]));const old=rows.find(r=>same(r.user_id,parts[3]))||{};return upsert(rows,'user_id',method==='post'?id:parts[3],{...old,user_name:data.name,user_email:data.email,user_position:data.position,access_level:data.accessLevel,telegram_id:data.telegramId,created_at:old.created_at||op.createdAt});});
 } else if(path.startsWith('/api/shifts')||path.startsWith('/api/recurring-shifts')){
  const recurring=parts[2]==='recurring-shifts';
  if(recurring&&method==='post')each(state,'/api/recurring-shifts',rows=>[...rows,{recurrence_id:id,user_id:data.userId,user_name:(cached(state,'/api/employees')||[]).find(u=>same(u.user_id,data.userId))?.user_name,starts_on:data.date,start_time:data.startTime,end_time:data.endTime,weekdays:data.weekdays,notes:data.notes}]);
  if(recurring&&parts[4]==='stop'){each(state,'/api/recurring-shifts',rows=>rows.map(r=>same(r.recurrence_id,parts[3])?{...r,stopped_from:data.from}:r));each(state,'/api/shifts',rows=>rows.filter(r=>!same(r.recurrence_id,parts[3])||r.shift_date<data.from));}
  else each(state,'/api/shifts',(rows,key)=>{
   if(method==='delete')return rows.filter(r=>!same(r.shift_id,parts[3]));
   const params=new URL(key,'https://local').searchParams;const from=params.get('from')||data.date,to=params.get('to')||data.date;
   const name=(cached(state,'/api/employees')||[]).find(u=>same(u.user_id,data.userId))?.user_name;
   if(recurring){for(let date=data.date;date<=to;date=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10)){if(date>=from&&(data.weekdays||[]).map(Number).includes(new Date(date+'T00:00:00Z').getUTCDay()||7))rows.push({shift_id:String(id)+':'+date,recurrence_id:id,user_id:data.userId,user_name:name,shift_date:date,start_time:data.startTime,end_time:data.endTime,notes:data.notes,pending_sync:true});}return rows;}
   rows=rows.filter(r=>!same(r.shift_id,parts[3]));if(data.date>=from&&data.date<=to)rows.push({shift_id:method==='post'?id:parts[3],user_id:data.userId,user_name:name,shift_date:data.date,start_time:data.startTime,end_time:data.endTime,notes:data.notes,pending_sync:true});return rows;
  });
 } else if(path.startsWith('/api/history/')&&path.endsWith('/refund-request')){
  each(state,'/api/management/requests',rows=>[...rows,{request_id:id,request_type:'refund',status:'pending',payload:{orderId:parts[3],...data},created_at:op.createdAt,pending_sync:true}]);
 } else if(path.startsWith('/api/management/requests/')){
  const request=Object.entries(state.cache).filter(([key])=>pathOf(key)==='/api/management/requests').flatMap(([,v])=>v.data).find(r=>same(r.request_id,parts[4]));
  const payload=typeof request?.payload==='string'?JSON.parse(request.payload):request?.payload;
  if(request&&data.status==='approved'){
   if(request.request_type==='stock_receipt')for(const [index,entry]of (payload.items||[]).entries()){const ingredient=(cached(state,'/api/items')||[]).find(i=>i.item_name.toLowerCase()===entry.item_name.toLowerCase());if(ingredient)receiveStock(state,ingredient.item_id,Math.max(0,Number(entry.qty)||0),id-index,op.createdAt);}
   if(request.request_type==='stock_usage'){const ingredient=(cached(state,'/api/items')||[]).find(i=>i.item_name.toLowerCase()===payload.itemName.toLowerCase());if(!ingredient||Number(ingredient.stock)<Number(payload.quantity))throw Error('Not enough stock for this usage.');deductStock(state,ingredient.item_id,Number(payload.quantity));}
   if(request.request_type==='refund'){
    if(!payload.evidenceData)throw Error('Refund image evidence is missing.');
    const order=(cached(state,'/api/history')||[]).find(o=>same(o.order_id,payload.orderId));const details=typeof order?.details==='string'?JSON.parse(order.details):order?.details;
    for(const [index,sold]of (details?.items||[]).entries())for(const recipe of details.offline_recipe_snapshot?.find(r=>same(r.product_id,sold.product_id))?.ingredients||(cached(state,'/api/stock/recipe')||[]).filter(r=>same(r.product_id,sold.product_id)))receiveStock(state,recipe.item_id,Number(sold.qty)*Number(recipe.qty),id-index,op.createdAt);
    each(state,'/api/history',rows=>rows.filter(o=>!same(o.order_id,payload.orderId)));
   }
  }
  each(state,'/api/management/requests',rows=>rows.map(r=>same(r.request_id,parts[4])?{...r,status:data.status,pending_sync:true}:r));
 } else throw Error('This action cannot be saved offline yet. No changes were discarded.');
 const categories=cached(state,'/api/products/categories')||[];
 each(state,'/api/products',rows=>rows.map(p=>({...p,category_hidden:categories.find(c=>c.p_category_name===p.product_category)?.pos_hidden||0})));
 summaries(state);return response;
}
export function expenseOccurrences(row,from,to){
 const result=[];const start=row.expense_date;const [y,m,d]=start.split('-').map(Number);if(!row.recurring)return start>=from&&start<=to?[{...row,occurrence_id:`${row.expense_id}:${start}`}]:[];
 for(let i=0;i<10000;i++){let date;if(row.frequency==='weekly')date=new Date(Date.parse(start+'T00:00:00Z')+i*604800000);else{date=new Date(Date.UTC(y,m-1+i*(row.frequency==='yearly'?12:1),1));date.setUTCDate(Math.min(d,new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()));}const key=date.toISOString().slice(0,10);if(key>to||(row.repeat_until&&key>row.repeat_until))break;if(key>=from)result.push({...row,expense_date:key,occurrence_id:`${row.expense_id}:${key}`});}return result;
}
export function readLocal(state,key){
 const path=pathOf(key),params=new URL(key,'https://local').searchParams;
 if(path==='/api/products'||path==='/api/products/categories'){
  let rows=copy(cached(state,path));if(!rows)throw Error('Connect once to download this page for offline use.');
  if(params.get('scope')==='pos')rows=rows.filter(r=>!Number(r.pos_hidden)&&!Number(r.category_hidden));return rows;
 }
 if(state.cache[key])return copy(state.cache[key].data);
 const candidates=Object.entries(state.cache).filter(([k])=>pathOf(k)===path);
 if(path==='/api/shifts'){
  const from=params.get('from'),to=params.get('to');
  const ranges=candidates.map(([k,v])=>({from:new URL(k,'https://local').searchParams.get('from'),to:new URL(k,'https://local').searchParams.get('to'),rows:v.data})).sort((a,b)=>a.from.localeCompare(b.from));
  let covered=from;
  for(const range of ranges)if(range.from<=covered&&range.to>=covered)covered=new Date(Date.parse(range.to+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  if(covered>to)return copy([...new Map(ranges.flatMap(r=>r.rows).filter(r=>r.shift_date>=from&&r.shift_date<=to).map(r=>[r.shift_id,r])).values()]);
 }
 if(path==='/api/expenses'){
  const month=params.get('month');const from=params.get('from')||(month?month+'-01':'2000-01-01');const through=params.get('through')||(month?new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).toISOString().slice(0,10):null);
  const match=candidates.find(([k])=>{const p=new URL(k,'https://local').searchParams;return !p.has('month')&&(!p.get('from')||p.get('from')<=from)&&p.get('through')>=through;});if(match)return copy(match[1].data.filter(r=>r.expense_date>=from&&r.expense_date<=through));
 }
 if(path==='/api/management/requests'&&candidates.length){const rows=candidates.flatMap(([,v])=>v.data);return copy([...new Map(rows.map(r=>[r.request_id,r])).values()].filter(r=>!params.get('type')||r.request_type===params.get('type')));}
 throw Error('This period or page is not downloaded. Connect and prepare offline data first.');
}
export function remap(value,map,key=''){
 if(Array.isArray(value))return value.map(v=>remap(v,map,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v,map,k)]));
 if(/(^id$|Id$|_id$)/.test(key)&&map[value]!==undefined)return map[value];
 if(key==='shift_id'&&typeof value==='string'&&/^-\d+:\d{4}-\d{2}-\d{2}$/.test(value)){const [id,date]=value.split(':');if(map[id]!==undefined)return map[id]+':'+date;}
 return value;
}
