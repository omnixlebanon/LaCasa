require('dotenv').config({quiet:true});
const fs=require('node:fs');
const path=require('node:path');
const data=require('../data/lacasa-recipes.json');
async function main(){
 const target=process.argv[2]; if(!['local','live'].includes(target))throw Error('Specify local or live');
 const apply=process.argv.includes('--apply');
 let db;
 if(target==='local')db=await require('mysql2/promise').createConnection({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,dateStrings:true});
 else{const {Client}=require('pg');const {wrap,connectionOptions}=require('../config/postgres');const c=new Client(connectionOptions(process.env.SUPABASE_MIGRATION_URL||process.env.DATABASE_URL));await c.connect();db=wrap(c);db.end=()=>c.end();}
 try{
  await db.beginTransaction();
  if(target==='live')await db.query('LOCK TABLE items, product_items, item_categories, products IN SHARE ROW EXCLUSIVE MODE');
  const snapshot={};for(const table of ['items','product_items','item_categories','products'])snapshot[table]=(await db.query(`SELECT * FROM ${table} FOR UPDATE`))[0];
  const ingredients=new Map();for(const recipe of data.recipes)for(const item of recipe.ingredients){if(ingredients.has(item.name)&&ingredients.get(item.name).unit!==item.unit)throw Error('Inconsistent ingredient unit');ingredients.set(item.name,item);}
  const ready=data.recipes.filter(r=>!r.missing.length&&r.ingredients.length);
  for(const r of ready){const p=snapshot.products.find(p=>p.product_name===r.product);if(!p)throw Error(`Product missing: ${r.product}`);if(snapshot.product_items.some(link=>Number(link.product_id)===Number(p.product_id)))throw Error(`Recipe already exists: ${r.product}; review before replacing`);}
  for(const item of ingredients.values()){const existing=snapshot.items.find(i=>i.item_name.toLowerCase()===item.name.toLowerCase());if(existing&&existing.uom!==item.unit)throw Error(`Unit mismatch: ${item.name}`);}
  if(!apply){console.log(JSON.stringify({target,ingredients:ingredients.size,ready:ready.length,pending:data.recipes.length-ready.length}));await db.rollback();return;}
  const backup=path.join(__dirname,'../catalog-backups',`recipe-import-${target}-${Date.now()}.json`);fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,JSON.stringify(snapshot,null,2),{flag:'wx'});
  const category='Drink Ingredients';if(!snapshot.item_categories.some(c=>c.i_category_name===category))await db.execute('INSERT INTO item_categories (i_category_name) VALUES (?)',[category]);
  let added=0,linked=0;
  for(const item of ingredients.values()){
   let existing=snapshot.items.find(i=>i.item_name.toLowerCase()===item.name.toLowerCase());
   if(!existing){const [result]=await db.execute("INSERT INTO items (item_name,item_category,uom,stock,safety_limit,item_cost,shelf_life,stockStatus) VALUES (?,?,?,0,0,0,0,'out of stock')",[item.name,category,item.unit]);existing={item_id:result.insertId};added++;}
   item.id=existing.item_id;
  }
  for(const r of ready){const p=snapshot.products.find(p=>p.product_name===r.product);for(const i of r.ingredients){await db.execute('INSERT INTO product_items (product_id,item_id,qty) VALUES (?,?,?)',[p.product_id,ingredients.get(i.name).id,i.quantity]);linked++;}}
  const [links]=await db.query('SELECT COUNT(*) AS count FROM product_items');if(Number(links[0].count)!==snapshot.product_items.length+linked)throw Error('Recipe verification failed');
  await db.commit();console.log(JSON.stringify({target,ingredientsAdded:added,recipesLinked:ready.length,ingredientLinks:linked,pendingRecipes:data.recipes.length-ready.length,backup}));
 }catch(e){await db.rollback().catch(()=>{});throw e;}finally{await db.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
