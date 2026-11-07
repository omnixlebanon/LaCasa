const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {wrap}=require('../config/postgres');
const {transactionContext}=require('../config/transactionContext');
const tracking=require('../services/syncManifest');
const window=require('../services/historyWindow');
test('tracking commits with writes, rolls back with failures, and tolerates missing tracking schema',async()=>{
 const engine=new PGlite();
 try{
 const db=wrap({async query(config,values){const res=await engine.query(typeof config==='string'?config:config.text,typeof config==='string'?values:config.values);return {...res,rowCount:res.affectedRows??res.rows.length};}});
 await engine.exec('CREATE TABLE products(product_id integer PRIMARY KEY, name text);CREATE TABLE pos_settings(setting_key text PRIMARY KEY,setting_value text NOT NULL)');
 await db.beginTransaction();
 const scope=transactionContext(db);
 await scope.connection.query('INSERT INTO products(product_id,name) VALUES (?,?)',[1,'Coffee']);
 assert.deepEqual([...scope.tables],['products']);
 await tracking.optional(db,()=>tracking.record(db,1,scope.tables));
 await db.commit();
 assert.deepEqual(await tracking.read(db),{revision:1,baseline:1,tables:{products:1}});
 await db.beginTransaction();await tracking.record(db,2,new Set(['items']));await db.rollback();
 assert.equal((await tracking.read(db)).revision,1);
 await db.beginTransaction();await tracking.record(db,3,new Set(['offline_open_orders']));await db.commit();
 assert.equal((await tracking.read(db)).baseline,3); // untracked revision forces full reload
 await engine.exec('DROP TABLE pos_settings');
 await db.beginTransaction();await db.query('UPDATE products SET name = ? WHERE product_id = ?',['Tea',1]);
 assert.equal(await tracking.optional(db,()=>tracking.record(db,4,new Set(['products']))),null);
 await db.commit();assert.equal((await db.query('SELECT name FROM products'))[0][0].name,'Tea');
 }finally{await engine.close();}
});
test('history bounds use parameters, reject invalid pages, and include the whole final date',()=>{
 const result=window({from:'2026-01-01',to:'2026-01-31',limit:'500',offset:'500'},'order_date');
 assert.equal(result.where,'WHERE order_date >= ? AND order_date < ?');
 assert.deepEqual(result.values,['2026-01-01','2026-02-01',500,500]);
 for(const query of [{limit:'501'},{offset:'-1',limit:'5'},{from:'2026-02-31'},{to:'bad'}])assert.throws(()=>window(query,'order_date'));
});
