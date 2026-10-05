require('dotenv').config({quiet:true});
(async()=>{
 const target=process.argv[2];if(!['local','live'].includes(target))throw Error('Specify local or live');let db;
 if(target==='local')db=await require('mysql2/promise').createConnection({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
 else{const {Client}=require('pg');const {wrap,connectionOptions}=require('../config/postgres');const c=new Client(connectionOptions(process.env.SUPABASE_MIGRATION_URL||process.env.DATABASE_URL));await c.connect();db=wrap(c);db.end=()=>c.end();}
 try{
 await db.query('CREATE TABLE IF NOT EXISTS pos_settings (setting_key VARCHAR(60) PRIMARY KEY, setting_value TEXT NOT NULL)');
 await db.query('CREATE TABLE IF NOT EXISTS offline_sync_state (id INTEGER PRIMARY KEY, revision BIGINT NOT NULL DEFAULT 0)');
 await db.query('CREATE TABLE IF NOT EXISTS offline_open_orders (order_key VARCHAR(36) PRIMARY KEY, order_data TEXT NOT NULL, user_id INTEGER NOT NULL)');
 await db.query('CREATE TABLE IF NOT EXISTS offline_completed_orders (order_key VARCHAR(36) PRIMARY KEY, receipt TEXT NOT NULL)');
 await db.query('CREATE TABLE IF NOT EXISTS offline_sync_operations (operation_id VARCHAR(36) PRIMARY KEY, owner_id VARCHAR(40) NOT NULL, fingerprint VARCHAR(64) NOT NULL, response_status INTEGER NOT NULL, response_body TEXT NOT NULL)');
 await db.query(target==='live'?'INSERT INTO offline_sync_state (id,revision) VALUES (1,0) ON CONFLICT (id) DO NOTHING':'INSERT IGNORE INTO offline_sync_state (id,revision) VALUES (1,0)');
 if(target==='live')for(const t of ['pos_settings','offline_sync_state','offline_sync_operations','offline_open_orders','offline_completed_orders']){await db.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);await db.query(`REVOKE ALL ON ${t} FROM anon, authenticated`);}
 console.log(target+': offline sync schema ready');
 }finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
