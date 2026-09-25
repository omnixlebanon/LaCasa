const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ quiet: true });
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const demoProducts = new Set(['Signature Beef Burger Platter', 'Freshly Baked House Bread (Loaf)', 'Freshly Baked House Bread (Loa', 'Premium Grilled Ribeye Steak']);
const demoItems = ['Premium White Flour','Beef Ribeye (Local)','Local Vine Tomatoes','Whole Milk 3.5%','Extra Virgin Olive Oil','Fine Sea Salt','Green Cardamom Ground','Biodegradable Burger Boxes','Local Sparkling Water 330ml','Tahini Paste'];
async function main() {
 const target = process.argv[2];
 if (!['local','live'].includes(target)) throw new Error('Specify local or live');
 const apply = process.argv.includes('--apply');
 const clearAll = process.argv.includes('--all');
 let db;
 if (target === 'local') db = await require('mysql2/promise').createConnection({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,dateStrings:true});
 else { const {Client}=require('pg'); const {wrap,connectionOptions}=require('../config/postgres'); const c=new Client(connectionOptions(process.env.SUPABASE_MIGRATION_URL||process.env.DATABASE_URL)); await c.connect(); db=wrap(c); db.end=()=>c.end(); }
 try {
  await db.beginTransaction();
  const tables=['orders_history','items','batches','suppliers','product_items','item_categories','workflow_requests','salary_deductions'];
  if (target==='live') await db.query(`LOCK TABLE ${tables.join(',')} IN SHARE ROW EXCLUSIVE MODE`);
  const snapshot={};
  for(const table of tables) snapshot[table]=(await db.query(`SELECT * FROM ${table} FOR UPDATE`))[0];
  const orders=clearAll ? snapshot.orders_history : snapshot.orders_history.filter(row=>{const entries=parse(row.details)?.items;return Array.isArray(entries)&&entries.length>0&&entries.every(item=>demoProducts.has(item.product_name));});
  const items=clearAll ? snapshot.items : snapshot.items.filter(row=>demoItems.includes(row.item_name));
  const orderIds=new Set(orders.map(row=>row.order_id));
  const requests=snapshot.workflow_requests.filter(row=>(row.request_type==='refund'&&(clearAll||orderIds.has(String(parse(row.payload)?.orderId))))||(clearAll&&['stock_receipt','stock_usage'].includes(row.request_type)));
  const result={target,clearAll,demoOrders:orders.length,otherOrders:snapshot.orders_history.length-orders.length,demoIngredients:items.length,relatedRefundRequests:requests.length};
  if(!apply) {console.log(JSON.stringify(result));await db.rollback();return;}
  const dir=path.join(__dirname,'../catalog-backups');fs.mkdirSync(dir,{recursive:true});
  const backup=path.join(dir,`demo-cleanup-${target}-${Date.now()}.json`);
  fs.writeFileSync(backup,JSON.stringify(snapshot,null,2),{flag:'wx'});
  for(const row of orders) {await db.execute('DELETE FROM salary_deductions WHERE order_id = ?',[row.order_id]);await db.execute('DELETE FROM orders_history WHERE internal_id = ?',[row.internal_id]);}
  for(const row of requests) await db.execute('DELETE FROM workflow_requests WHERE request_id = ?',[row.request_id]);
  for(const row of items) {
   for(const table of ['product_items','suppliers','batches']) await db.execute(`DELETE FROM ${table} WHERE item_id = ?`,[row.item_id]);
   await db.execute('DELETE FROM items WHERE item_id = ?',[row.item_id]);
  }
  const [remainingOrders]=await db.query('SELECT COUNT(*) AS count FROM orders_history');
  const [remainingItems]=await db.query('SELECT COUNT(*) AS count FROM items');
  if(Number(remainingOrders[0].count)!==result.otherOrders||Number(remainingItems[0].count)!==snapshot.items.length-items.length) throw new Error('Cleanup count verification failed');
  await db.commit();console.log(JSON.stringify({...result,remainingOrders:Number(remainingOrders[0].count),remainingIngredients:Number(remainingItems[0].count),backup}));
 }catch(e){await db.rollback().catch(()=>{});throw e;}finally{await db.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
