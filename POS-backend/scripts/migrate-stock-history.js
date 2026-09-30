require('dotenv').config({quiet:true});
(async()=>{
 const cloud=process.argv.includes('--supabase');const url=cloud?(process.env.SUPABASE_MIGRATION_URL||process.env.DATABASE_URL):process.env.DATABASE_URL;let db;
 if(cloud&&!url)throw Error('Missing Supabase migration connection.');
 if(url){const {Client}=require('pg');const {wrap,connectionOptions}=require('../config/postgres');const client=new Client({...connectionOptions(url),connectionTimeoutMillis:15000,query_timeout:30000});await client.connect();db=wrap(client);db.end=()=>client.end();}else db=require('../config/database');
 try{
  await db.query(require('../services/stockPurchaseService').schema);
  if(url){await db.query('ALTER TABLE stock_purchases ENABLE ROW LEVEL SECURITY');await db.query('REVOKE ALL ON stock_purchases FROM anon, authenticated');}
  console.log('Stock purchase history ready. Existing inventory preserved.');
 }finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
