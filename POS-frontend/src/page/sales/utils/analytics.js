export const PRODUCT_COLORS = ['#5185C5', '#46A28F', '#D5A34B', '#9278BD', '#D38470', '#B96F96', '#6BA5B4', '#92A568'];
export const formatNumber = value => new Intl.NumberFormat('en-US').format(value);
export function formatExportTimestamp(value) {
 const date = new Date(value);
 if (!Number.isFinite(date.getTime())) return '';
 const pad = number => String(number).padStart(2, '0');
 const offset = -date.getTimezoneOffset();
 const zone = `UTC${offset >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
 // An explicit timezone label keeps spreadsheet imports as text, avoiding date-cell ##### overflow.
 return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} (${zone})`;
}
const percent = (value, total) => total ? Math.round(value / total * 1000) / 10 : 0;
export function filterTransactionsByTimeframe(transactions, timeframe, now = new Date(), start, end) {
 let from = new Date(0), to = new Date(now);
 if (timeframe === 'daily') from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
 if (timeframe === 'monthly') from = new Date(now.getFullYear(), now.getMonth(), 1);
 if (timeframe === 'yearly') from = new Date(now.getFullYear(), 0, 1);
 if (timeframe === 'custom') {
  if (!start || !end || start > end) return [];
  from = new Date(start + 'T00:00:00'); to = new Date(end + 'T23:59:59.999');
 }
 return transactions.filter(tx => { const time = new Date(tx.timestamp); return time >= from && time <= to; });
}
export function getProductMetrics(products, transactions) {
 const metrics = products.map(product => ({product, unitsSold:0, totalRevenue:0, totalCost:0, totalProfit:0}));
 const byId = new Map(metrics.map(m => [m.product.id, m]));
 for (const tx of transactions) {
  const metric = byId.get(tx.productId); if (!metric) continue;
  metric.unitsSold += tx.quantity; metric.totalRevenue += tx.totalRevenue; metric.totalCost += tx.totalCost; metric.totalProfit += tx.totalProfit;
 }
 const units = metrics.reduce((s,m) => s+m.unitsSold,0), profit = metrics.reduce((s,m) => s+m.totalProfit,0);
 const sold = Math.max(0,...metrics.map(m=>m.unitsSold));
 const profitable = Math.max(...metrics.filter(m=>m.unitsSold>0).map(m=>m.totalProfit));
 return metrics.map(m=>({...m, profitMargin:percent(m.totalProfit,m.totalRevenue), percentageOfTotalSales:percent(m.unitsSold,units), percentageOfTotalProfit:percent(m.totalProfit,profit), isMostSold:m.unitsSold>0 && m.unitsSold===sold, isMostProfitable:m.unitsSold>0 && m.totalProfit===profitable}));
}
export function getCategorySummaries(transactions) {
 const groups = new Map();
 for (const tx of transactions) {
  const value = groups.get(tx.category) || {category:tx.category, revenue:0, profit:0, color:PRODUCT_COLORS[groups.size % PRODUCT_COLORS.length]};
  value.revenue += tx.totalRevenue; value.profit += tx.totalProfit; groups.set(tx.category,value);
 }
 return [...groups.values()];
}
export function generateLineChartData(transactions, timeframe, products, now = new Date(), start, end) {
 const groups = new Map();
 const key = date => timeframe==='daily' ? date.getHours() : timeframe==='yearly' ? date.getMonth() : timeframe==='all-time' ? date.getFullYear() : date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
 const add = date => {
  const k = key(date);
  if (!groups.has(k)) groups.set(k,{label:timeframe==='daily' ? String(k).padStart(2,'0')+':00' : timeframe==='yearly' ? date.toLocaleString('en',{month:'short'}) : String(k), revenue:0,cost:0,profit:0,units:0,...Object.fromEntries(products.map(p=>[p.id,0]))});
  return groups.get(k);
 };
 if (timeframe==='daily') for(let h=0;h<24;h++) add(new Date(now.getFullYear(),now.getMonth(),now.getDate(),h));
 if (timeframe==='monthly') for(let d=1;d<=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();d++) add(new Date(now.getFullYear(),now.getMonth(),d));
 if (timeframe==='yearly') for(let m=0;m<12;m++) add(new Date(now.getFullYear(),m,1));
 if (timeframe==='custom' && start && end && start<=end) {
  const date = new Date(start+'T00:00:00'), last=new Date(end+'T00:00:00');
  if ((last-date)/86400000 <= 366) for (;date<=last;date.setDate(date.getDate()+1)) add(date);
 }
 for(const tx of [...transactions].sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp))) {
  const row=add(new Date(tx.timestamp)); row.revenue+=tx.totalRevenue;row.cost+=tx.totalCost;row.profit+=tx.totalProfit;row.units+=tx.quantity;row[tx.productId]=(row[tx.productId]||0)+tx.totalRevenue;
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
  if(!Number.isFinite(new Date(timestamp).getTime())) { skipped++;continue; }
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
   const revenue=quantity*price*revenueFactor, cost=quantity*product.unitCost;
   transactions.push({id:String(order.order_id)+'-'+index,orderId:String(order.order_id),productId:id,productName:item.product_name||product.name,category:product.category,quantity,unitPrice:price,unitCost:product.unitCost,totalRevenue:revenue,totalCost:cost,totalProfit:revenue-cost,timestamp,customerRegion:details.channel||'In store'});
  });
 }
 transactions.sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
 return {products,transactions,skipped};
}
