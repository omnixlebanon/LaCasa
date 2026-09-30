export function calculateCashPayment(total,rate,currency,received){
 const cents=Math.round(Number(total)*100),fx=Number(rate),amount=Number(received);
 if(!Number.isSafeInteger(cents)||cents<=0||!Number.isFinite(fx)||fx<=0)throw Error('The order total or exchange rate is invalid.');
 if(!['USD','LBP'].includes(currency)||!Number.isFinite(amount)||amount<0)throw Error('Enter a valid amount received.');
 const due=currency==='USD'?cents:Math.round(cents*fx/100);
 const paid=currency==='USD'?Math.round(amount*100):amount;
 if(!Number.isSafeInteger(paid)||!Number.isSafeInteger(due)||(currency==='USD'&&Math.abs(amount*100-paid)>0.000001))throw Error(currency==='USD'?'Enter dollars with no more than two decimal places.':'Enter a whole amount in L.L.');
 if(paid<due)throw Error('The amount received is less than the order total.');
 const change=paid-due,dollars=currency==='USD'?Math.floor(change/500)*5:0;
 const lira=currency==='USD'?Math.round((change-dollars*100)*fx/100):change;
 if(!Number.isSafeInteger(lira))throw Error('Amount is too large.');
 return {method:'cash',currency,amount_received:amount,exchange_rate:fx,total_usd:cents/100,change_usd:dollars,change_lbp:lira};
}

export function normalizePaymentDetails(total, details) {
 if (!Object.prototype.hasOwnProperty.call(details, 'payment')) return details; // Older queued sales have no payment snapshot.
 const payment = details.payment;
 if(payment?.method==='whish'){
  const cents=Math.round(Number(total)*100);
  if(!Number.isSafeInteger(cents)||cents<=0)throw Error('The order total is invalid.');
  return {...details,payment_method:'WHISH Money',payment:{method:'whish',total_usd:cents/100}};
 }

 if (!payment || payment.method !== 'cash' || typeof payment.amount_received !== 'number' || typeof payment.exchange_rate !== 'number') throw Error('Invalid cash payment.');
 return {...details, payment_method: 'Cash', payment: calculateCashPayment(total, payment.exchange_rate, payment.currency, payment.amount_received)};
}
