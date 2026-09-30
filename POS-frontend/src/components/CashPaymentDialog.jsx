import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,Banknote,Wallet} from 'lucide-react';
import {calculateCashPayment} from '../utils/cashPayment.js';
import './CashPaymentDialog.css';
export default function CashPaymentDialog({total,rate,busy,error,onCancel,onConfirm}){
 const dialog=useRef(null);const [method,setMethod]=useState(''),[currency,setCurrency]=useState('USD'),[amount,setAmount]=useState('');
 useEffect(()=>{dialog.current.showModal();},[]);
 let payment,issue='';try{if(amount!=='')payment=calculateCashPayment(total,rate,currency,amount);}catch(e){issue=e.message;}
 const money=n=>Number(n).toLocaleString(undefined,{maximumFractionDigits:0});
 return createPortal(<dialog ref={dialog} className="cash-payment-dialog" aria-labelledby="payment-title" onCancel={e=>{e.preventDefault();if(!busy)onCancel();}}><form onSubmit={e=>{e.preventDefault();if(!busy){if(method==='whish')onConfirm({method:'whish'});else if(payment&&method==='cash')onConfirm(payment);}}}><header><h2 id="payment-title">Payment</h2><button type="button" aria-label="Cancel payment" disabled={busy} onClick={onCancel}><X/></button></header><div className="payment-total"><span>Order total</span><strong>${Number(total).toFixed(2)}</strong><small>{money(Math.round(Number(total)*Number(rate)))} L.L. | 1 USD = {money(rate)} L.L.</small></div>
 <div className="payment-methods"><button type="button" disabled={busy} aria-pressed={method==='cash'} onClick={()=>setMethod('cash')}><Banknote/>Cash</button><button type="button" disabled={busy} aria-pressed={method==='whish'} onClick={()=>setMethod('whish')}><Wallet/>WHISH Money</button></div>
 {method==='whish'&&<p role="status">Confirm to record this order as paid with WHISH Money.</p>}
 {method==='cash'&&<><label htmlFor="cash-currency">Cash received in</label><select id="cash-currency" value={currency} disabled={busy} onChange={e=>{setCurrency(e.target.value);setAmount('');}}><option value="USD">US dollars (USD)</option><option value="LBP">Lebanese pounds (L.L.)</option></select><label htmlFor="cash-received">Amount received</label><input id="cash-received" autoComplete="off" type="number" inputMode="decimal" min="0" step={currency==='USD'?'0.01':'1'} value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} required/>
 {issue&&<p role="alert" className="payment-error">{issue}</p>}
 {payment&&<div className="payment-change" role="status"><h3>Change to give</h3>{currency==='USD'&&<p><strong>${payment.change_usd.toFixed(2)}</strong> in US dollars</p>}<p><strong>{money(payment.change_lbp)} L.L.</strong> in Lebanese pounds</p>{currency==='USD'}</div>}</>}
 {error&&<p role="alert" className="payment-error">{error}</p>}
 <footer><button type="button" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className="confirm-cash-payment" disabled={busy||(method!=='whish'&&(method!=='cash'||!payment))}>{busy?'Saving...':'Confirm payment'}</button></footer></form></dialog>,document.body);
}
