const db=require('../config/database');
const sql=require('../config/dialect');
module.exports=async function refundOrder(orderId,{reason,returnToStock},userId){
 if(typeof reason!=='string'||!reason.trim()||reason.trim().length>500||typeof returnToStock!=='boolean')throw Object.assign(Error('Enter a reason (up to 500 characters) and choose whether to return ingredients to stock.'),{status:400});
 const connection=await db.getConnection();
 try{
  await connection.beginTransaction();
  const [[order]]=await connection.query('SELECT * FROM orders_history WHERE order_id = ? FOR UPDATE',[orderId]);
  if(!order)throw Object.assign(Error('Order not found.'),{status:404});
  if(order.status==='refunded'){await connection.commit();return {success:true,alreadyRefunded:true};}
  const details=typeof order.details==='string'?JSON.parse(order.details):order.details;
  const snapshot=details.recipe_snapshot||details.offline_recipe_snapshot;
  if(returnToStock){
   if(!Array.isArray(snapshot))throw Object.assign(Error('This older order has no saved ingredient quantities. Refund it without returning ingredients to stock, or adjust stock manually.'),{status:422});
   for(const sold of details.items||[]){
    const recipe=snapshot.find(row=>Number(row.product_id)===Number(sold.product_id));
    if(!Array.isArray(recipe?.ingredients))throw Object.assign(Error('Saved ingredient quantities are incomplete. Choose no stock return.'),{status:422});
    for(const ingredient of recipe.ingredients){
     const qty=Number(sold.qty)*Number(ingredient.qty);if(!Number.isFinite(qty)||qty<=0)throw Error('Invalid saved ingredient quantity.');
     const [[item]]=await connection.query('SELECT item_id FROM items WHERE item_id = ? FOR UPDATE',[ingredient.item_id]);if(!item)throw Object.assign(Error('An ingredient no longer exists. Choose no stock return.'),{status:422});
     await connection.query(`INSERT INTO batches (item_id,batch_stock,batch_exDate) VALUES (?, ?, ${sql('DATE_ADD(CURRENT_DATE, INTERVAL COALESCE((SELECT shelf_life FROM items WHERE item_id = ?),0) DAY)','(CURRENT_DATE + COALESCE((SELECT shelf_life FROM items WHERE item_id = ?),0))')})`,[ingredient.item_id,qty,ingredient.item_id]);
     await connection.query("UPDATE items SET stock = stock + ?, stockStatus = CASE WHEN stock + ? > safety_limit THEN 'well' ELSE 'Low' END WHERE item_id = ?",[qty,qty,ingredient.item_id]);
    }
   }
  }
  details.refund={return_to_stock:returnToStock};
  await connection.query("UPDATE orders_history SET status = 'refunded', refund_reason = ?, refunded_by = ?, refunded_at = CURRENT_TIMESTAMP, details = ? WHERE order_id = ?",[reason.trim(),userId,JSON.stringify(details),orderId]);
  await connection.commit();return {success:true,returnToStock};
 }catch(error){await connection.rollback();throw error;}finally{connection.release();}
};
