const {randomUUID}=require('node:crypto');
const schema = `CREATE TABLE IF NOT EXISTS stock_purchases (
 purchase_id VARCHAR(64) PRIMARY KEY, item_id INTEGER NOT NULL,
 item_name VARCHAR(120) NOT NULL, category VARCHAR(120), uom VARCHAR(30) NOT NULL,
 supplier_name VARCHAR(120), quantity DECIMAL(14,2) NOT NULL,
 unit_cost DECIMAL(16,4) NOT NULL, total_cost DECIMAL(18,2) NOT NULL,
 purchased_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
async function recordPurchase(connection, itemId, quantity, data={}, recordedAt=null) {
 const [[item]]=await connection.execute('SELECT * FROM items WHERE item_id = ? FOR UPDATE',[itemId]);
 if(!item)throw Object.assign(Error('Ingredient not found.'),{status:404});
 const [[supplier]]=await connection.execute('SELECT supplier_name FROM suppliers WHERE item_id = ?',[itemId]);
 const snapshot=data.purchase_snapshot || {item_name:item.item_name,category:item.item_category,uom:item.uom,supplier_name:supplier?.supplier_name,unit_cost:Number(item.item_cost)};
 if(!Number.isFinite(quantity)||quantity<=0||Math.abs(quantity*100-Math.round(quantity*100))>0.00001||!Number.isFinite(Number(snapshot.unit_cost))||Number(snapshot.unit_cost)<0||!snapshot.item_name||!snapshot.uom)throw Object.assign(Error('Invalid stock purchase quantity or cost.'),{status:400});
 const purchase={purchase_id:randomUUID(),item_id:Number(itemId),item_name:snapshot.item_name,category:snapshot.category||null,uom:snapshot.uom,supplier_name:snapshot.supplier_name||null,quantity,unit_cost:Number(snapshot.unit_cost),total_cost:Math.round(quantity*Number(snapshot.unit_cost)*100)/100,purchased_at:recordedAt||new Date().toISOString()};
 if(!Number.isFinite(Date.parse(purchase.purchased_at)))throw Object.assign(Error('Invalid purchase date.'),{status:400});
 await connection.execute('INSERT INTO stock_purchases (purchase_id,item_id,item_name,category,uom,supplier_name,quantity,unit_cost,total_cost,purchased_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[purchase.purchase_id,purchase.item_id,purchase.item_name,purchase.category,purchase.uom,purchase.supplier_name,purchase.quantity,purchase.unit_cost,purchase.total_cost,new Date(purchase.purchased_at).toISOString().slice(0,19).replace('T',' ')]);
 return purchase;
}
module.exports={schema,recordPurchase};
