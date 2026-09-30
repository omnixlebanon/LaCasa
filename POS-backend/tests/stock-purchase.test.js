const test=require('node:test');const assert=require('node:assert/strict');const {PGlite}=require('@electric-sql/pglite');const {wrap}=require('../config/postgres');
const {schema,recordPurchase}=require('../services/stockPurchaseService');
test('purchase history is a fixed snapshot, survives ingredient deletion and rolls back with stock transactions',async()=>{
 const engine=new PGlite();
 const db=wrap({async query(config,values){const result=await engine.query(typeof config==='string'?config:config.text,typeof config==='string'?values:config.values);return {...result,rowCount:result.affectedRows??result.rows.length};},release(){}});
 try{
  await engine.exec(schema+`; CREATE TABLE items(item_id integer PRIMARY KEY,item_name text,item_category text,uom text,item_cost numeric); CREATE TABLE suppliers(item_id integer,supplier_name text); INSERT INTO items VALUES(1,'Milk','Dairy','ml',0.01);`);
  await db.beginTransaction();const first=await recordPurchase(db,1,1000,{},'2026-09-30T08:00:00Z');await db.commit();
  assert.equal(first.total_cost,10);
  await db.execute('UPDATE items SET item_cost = 5 WHERE item_id = 1');
  const offline=await recordPurchase(db,1,100,{purchase_snapshot:{item_name:'Milk',uom:'ml',unit_cost:0.01}},'2026-09-29T08:00:00Z');
  assert.equal(offline.total_cost,1);
  await db.beginTransaction();await recordPurchase(db,1,20);await db.rollback();
  await assert.rejects(recordPurchase(db,1,-1),/Invalid/);
  await db.execute('DELETE FROM items WHERE item_id = 1');
  const [rows]=await db.execute('SELECT * FROM stock_purchases ORDER BY purchased_at');assert.equal(rows.length,2);assert.equal(Number(rows[1].quantity),1000);assert.equal(Number(rows[1].unit_cost),0.01);
 }finally{await engine.close();}
});
