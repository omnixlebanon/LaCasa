export function receiptData(order){
 let details=order.details||{};try{if(typeof details==='string')details=JSON.parse(details);}catch{details={};}
 const items=(Array.isArray(details.items)?details.items:[]).map(item=>({name:item.product_name||item.name||'Item',qty:Number(item.qty??item.quantity)||0,price:Number(item.price)||0}));
 const total=Number(order.total_amount)||0;
 const payment=details.payment||{};
 const rate=Number(details.receipt_exchange_rate||payment.exchange_rate);
 const id=String(order.order_id||order.id||details.checkout_operation_id||'');
 const local=id.startsWith('offline-');
 return {items,total,subtotal:Number.isFinite(Number(details.subtotal))?Number(details.subtotal):items.reduce((sum,item)=>sum+item.qty*item.price,0),discount:Number(details.discount)||0,
  customer:order.customer_name||details.order_label||'Guest',type:details.order_type,method:details.payment_method||order.payment_method||(payment.method==='whish'?'WHISH Money':payment.method==='cash'?'Cash':'Not recorded'),
  payment,rate:Number.isFinite(rate)&&rate>0?rate:null,id:local?id.slice(8):id,local,reference:details.checkout_operation_id||null,refunded:order.status==='refunded',date:order.order_date||order.created_at};
}
export function receiptDate(value){
 if(!value)return 'Date not recorded';
 const text=String(value).replace(' ','T');
 if(!Number.isFinite(Date.parse(text)))return 'Date not recorded';
 if(!/(Z|[+-]\d{2}:?\d{2})$/i.test(text))return text.slice(0,16).replace('T',' ');
 return new Date(text).toLocaleString('en-GB',{timeZone:'Asia/Beirut',dateStyle:'medium',timeStyle:'short'});
}
