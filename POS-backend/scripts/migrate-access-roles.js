require('dotenv').config({quiet:true});
(async()=>{
 const cloud=process.argv.includes('--supabase');const url=cloud?(process.env.SUPABASE_MIGRATION_URL||process.env.DATABASE_URL):process.env.DATABASE_URL;let db;
 if(cloud&&!url)throw Error('Missing Supabase migration connection.');
 if(url){const {Client}=require('pg');const {wrap,connectionOptions}=require('../config/postgres');const client=new Client({...connectionOptions(url),connectionTimeoutMillis:15000,query_timeout:30000});await client.connect();db=wrap(client);db.end=()=>client.end();}else db=require('../config/database');
 try{
  if(url){
   await db.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_access_level_check');
   await db.query("ALTER TABLE users ADD CONSTRAINT users_access_level_check CHECK (access_level IN ('admin','owner','manager','employee'))");
   await db.query("CREATE UNIQUE INDEX IF NOT EXISTS users_single_owner ON users (access_level) WHERE access_level = 'owner'");
  }else{
   await db.query("ALTER TABLE users MODIFY access_level ENUM('admin','owner','manager','employee') NOT NULL DEFAULT 'employee'");
   const [columns]=await db.query("SHOW COLUMNS FROM users LIKE 'owner_slot'");
   if(!columns.length)await db.query("ALTER TABLE users ADD COLUMN owner_slot TINYINT GENERATED ALWAYS AS (CASE WHEN access_level = 'owner' THEN 1 ELSE NULL END) STORED, ADD UNIQUE KEY users_single_owner (owner_slot)");
  }
  await db.query(`CREATE TABLE IF NOT EXISTS position_salary_defaults (
 position_key VARCHAR(50) NOT NULL, position_name VARCHAR(50) NOT NULL,
 effective_month DATE NOT NULL, monthly_salary DECIMAL(12,2) NOT NULL,
 PRIMARY KEY(position_key,effective_month)
)`);
  if(url){await db.query('ALTER TABLE position_salary_defaults ENABLE ROW LEVEL SECURITY');await db.query('REVOKE ALL ON position_salary_defaults FROM anon, authenticated');}
  console.log('Access roles and position salary defaults ready. Existing accounts preserved; Owner remains unassigned.');
 }finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
