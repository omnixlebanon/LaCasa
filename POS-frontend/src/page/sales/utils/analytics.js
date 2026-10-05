import { businessCalendar, businessTimestamp } from './businessTime.js';
export const PRODUCT_COLORS = ['#5185C5', '#46A28F', '#D5A34B', '#9278BD', '#D38470', '#B96F96', '#6BA5B4', '#92A568'];
export const formatNumber = value => new Intl.NumberFormat('en-US').format(value);
export const formatExportTimestamp = businessTimestamp;
const percent = (value, total) => total ? Math.round(value / total * 1000) / 10 : 0;
export function filterTransactionsByTimeframe(transactions, timeframe, now = new Date(), start, end) {
 now = businessCalendar(now);
 let from = new Date(0), to = new Date(now);
 if (timeframe === 'daily') from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
 if (timeframe === 'monthly') from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
 if (timeframe === 'yearly') from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
 if (timeframe === 'custom') {
  if (!start || !end || start > end) return [];
  from = businessCalendar(start); to = businessCalendar(end + 'T23:59:59.999');
 }
 return transactions.filter(tx => { const time = businessCalendar(tx.timestamp); return time >= from && time <= to; });
}
export function getProductMetrics(products, transactions) {
 const metrics = products.map(product => ({product, unitsSold:0, totalRevenue:0, totalCost:0, totalProfit:0,missingCost:false}));
 const byId = new Map(metrics.map(m => [m.product.id, m]));
 for (const tx of transactions) {
  const metric = byId.get(tx.productId); if (!metric) continue;
  metric.missingCost ||= tx.totalCost === null;
  metric.unitsSold += tx.quantity; metric.totalRevenue += tx.totalRevenue; metric.totalCost += tx.totalCost; metric.totalProfit += tx.totalProfit;
 }
 const units = metrics.reduce((s,m) => s+m.unitsSold,0), profit = metrics.reduce((s,m) => s+m.totalProfit,0);
 const sold = Math.max(0,...metrics.map(m=>m.unitsSold));
 const profitable = Math.max(...metrics.filter(m=>m.unitsSold>0 && !m.missingCost).map(m=>m.totalProfit));
 return metrics.map(m=>({...m, profitMargin:percent(m.totalProfit,m.totalRevenue), percentageOfTotalSales:percent(m.unitsSold,units), percentageOfTotalProfit:percent(m.totalProfit,profit), isMostSold:m.unitsSold>0 && m.unitsSold===sold, isMostProfitable:!metrics.some(value=>value.missingCost) && m.unitsSold>0 && m.totalProfit===profitable}));
}
export function getCategorySummaries(transactions) {
 const groups = new Map();
 for (const tx of transactions) {
  const value = groups.get(tx.category) || {category:tx.category, revenue:0, profit:0, color:PRODUCT_COLORS[groups.size % PRODUCT_COLORS.length]};
  value.revenue += tx.totalRevenue; value.profit = value.profit === null || tx.totalProfit === null ? null : value.profit + tx.totalProfit; groups.set(tx.category,value);
 }
 return [...groups.values()];
}
export function generateLineChartData(transactions, timeframe, products, now = new Date(), start, end) {
 now = businessCalendar(now);
 const groups = new Map();
 const key = date => timeframe==='daily' ? date.getUTCHours() : timeframe==='yearly' ? date.getUTCMonth() : timeframe==='all-time' ? date.getUTCFullYear() : date.getUTCFullYear()+'-'+String(date.getUTCMonth()+1).padStart(2,'0')+'-'+String(date.getUTCDate()).padStart(2,'0');
 const add = date => {
  const k = key(date);
  if (!groups.has(k)) groups.set(k,{label:timeframe==='daily' ? String(k).padStart(2,'0')+':00' : timeframe==='yearly' ? date.toLocaleString('en',{month:'short',timeZone:'UTC'}) : String(k), revenue:0,cost:0,profit:0,units:0,...Object.fromEntries(products.map(p=>[p.id,0]))});
  return groups.get(k);
 };
 if (timeframe==='daily') for(let h=0;h<24;h++) add(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate(),h)));
 if (timeframe==='monthly') for(let d=1;d<=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,0)).getUTCDate();d++) add(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),d)));
 if (timeframe==='yearly') for(let m=0;m<12;m++) add(new Date(Date.UTC(now.getUTCFullYear(),m,1)));
 if (timeframe==='custom' && start && end && start<=end) {
  const date = businessCalendar(start), last=businessCalendar(end);
  if ((last-date)/86400000 <= 366) for (;date<=last;date.setUTCDate(date.getUTCDate()+1)) add(date);
 }
 for(const tx of [...transactions].sort((a,b)=>businessCalendar(a.timestamp)-businessCalendar(b.timestamp))) {
  const row=add(businessCalendar(tx.timestamp)); row.revenue+=tx.totalRevenue;row.cost+=tx.totalCost;row.profit+=tx.totalProfit;row.units+=tx.quantity;if(tx.productId) row[tx.productId]=(row[tx.productId]||0)+tx.totalRevenue;
 }
 return [...groups.values()];
}
export function normalizeSales(history, summary) {
 const products = summary.map(p=>({id:String(p.product_id),name:p.product_name,sku:String(p.product_id),category:p.product_category || 'Uncategorized',unitPrice:Number(p.product_price)||0,unitCost:Number(p.cost)||0}));
 const byId = new Map(products.map(p=>[p.id,p]));
 const transactions=[]; let skipped=0;
 for(const order of history) {
  if (['refunded','cancelled','canceled','void'].includes(String(order.status).toLowerCase())) continue;
  let details=order.details;
  try { if(typeof details==='string') details=JSON.parse(details); } catch { skipped++;continue; }
  const timestamp=order.order_date || order.created_at;
  if(!Number.isFinite(businessCalendar(timestamp).getTime())) { skipped++;continue; }
  const items=details?.items;
  if(!Array.isArray(items) || !items.length) { skipped++;continue; }
  const grossSubtotal=items.reduce((sum,item)=>sum+(Number(item.qty)||0)*(Number(item.price)||0),0);
  const orderDiscount=Math.max(0,Number(details?.discount)||0);
  const revenueFactor=grossSubtotal>0 ? Math.max(0,(grossSubtotal-orderDiscount)/grossSubtotal) : 1;
  items.forEach((item,index)=>{
   const quantity=Number(item.qty), price=Number(item.price);
   if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(price)||price<0) {skipped++;return;}
   const id=String(item.product_id ?? 'archived-'+item.product_name);
   let product=byId.get(id);
   if(!product) { product={id,name:item.product_name||'Archived product',sku:id,category:'Uncategorized',unitPrice:price,unitCost:0,archived:true}; products.push(product);byId.set(id,product); }
   const snapshot = details.cost_snapshot_version === 1 && typeof item.unit_cost === 'number' && Number.isFinite(item.unit_cost) && item.unit_cost >= 0 && typeof item.total_cost === 'number' && Number.isFinite(item.total_cost) && item.total_cost >= 0;
   const unitCost = snapshot ? item.unit_cost : null;
   const revenue=quantity*price*revenueFactor, cost=snapshot ? item.total_cost : null;
   transactions.push({id:String(order.order_id)+'-'+index,orderId:String(order.order_id),paymentMethod:details?.payment?.method||details?.payment_method||order.payment_method||'',productId:id,productName:item.product_name||product.name,category:product.category,quantity,unitPrice:price,unitCost,totalRevenue:revenue,totalCost:cost,totalProfit:cost === null ? null : revenue-cost,costSource:snapshot ? item.cost_source : 'unavailable',timestamp,customerRegion:details.channel||'In store'});
  });
 }
 transactions.sort((a,b)=>businessCalendar(b.timestamp)-businessCalendar(a.timestamp));
 return {products,transactions,skipped};
}

export function normalizePayrollCosts(rows) {
 return rows.map(row=>({id:`payroll-${row.user_id}-${String(row.salary_month).slice(0,7)}`,description:`Salary: ${row.employee_name}`,salaryMonth:String(row.salary_month).slice(0,7),timestamp:String(row.paid_at).replace(' ','T'),totalRevenue:0,totalCost:Number(row.amount_paid),totalProfit:-Number(row.amount_paid),quantity:0,pending_sync:row.pending_sync}));
}

export function getCostCategories(ingredientCost, expenses, payrollCost) {
 const categories={water:'Utilities',electricity:'Utilities',internet:'Utilities',rent:'Rent',furniture:'Furniture',equipment:'Equipment',maintenance:'Maintenance',other:'Other'};
 const totals=new Map();
 const add=(name,value)=>{const cents=Math.round(Number(value)*100);if(Number.isFinite(cents)&&cents>0)totals.set(name,(totals.get(name)||0)+cents);};
 add('Ingredients',ingredientCost);
 for(const expense of expenses)add(categories[expense.category]||'Other',expense.totalCost);
 add('Payroll',payrollCost);
 const names=['Ingredients','Utilities','Rent','Payroll','Furniture','Equipment','Maintenance','Other'];
 return names.filter(name=>totals.has(name)).map(name=>({name,value:totals.get(name)/100,color:PRODUCT_COLORS[names.indexOf(name)]}));
}

export function getPaymentBreakdown(transactions){
 const totals=new Map();
 for(const tx of transactions){
  const method=String(tx.paymentMethod||'').trim().toLowerCase();
  const name=method==='cash'?'Cash':['whish','wish','whish money','wish money'].includes(method)?'WHISH Money':'Unrecorded / other';
  const amount=Number(tx.totalRevenue);
  if(Number.isFinite(amount)&&amount>0)totals.set(name,(totals.get(name)||0)+amount);
 }
 return ['Cash','WHISH Money','Unrecorded / other'].filter(name=>totals.has(name)).map((name)=>({name,value:Math.round(totals.get(name)*100)/100,color:{Cash:'#46A28F','WHISH Money':'#9278BD','Unrecorded / other':'#D5A34B'}[name]})).filter(row=>row.value>0);
}
