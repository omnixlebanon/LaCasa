import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Printer,X} from 'lucide-react';
import {receiptData,receiptDate} from '../utils/receipt.js';
import './ReceiptDialog.css';
const usd=value=>'$'+Number(value).toFixed(2);
const lbp=value=>Math.round(Number(value)).toLocaleString('en-US')+' L.L.';
export default function ReceiptDialog({order,onClose,autoPrint=false}){
 const dialog=useRef(null);const [paper,setPaper]=useState(()=>{try{return ['58','80','a4'].includes(localStorage.getItem('receipt-paper'))?localStorage.getItem('receipt-paper'):'80';}catch{return '80';}}),[error,setError]=useState('');
 useEffect(()=>{dialog.current.showModal();},[]);
 const closeRef=useRef(onClose);closeRef.current=onClose;
 const printRef=useRef(null),pageStyle=useRef(null);
 function preparePage(){
  pageStyle.current?.remove();pageStyle.current=null;
  if(paper==='a4')return;
  const sample=dialog.current.querySelector('.receipt-paper').cloneNode(true);
  // Measure at the printed width, without the preview's padding or viewport constraint.
  Object.assign(sample.style,{position:'fixed',visibility:'hidden',width:paper==='58'?'48mm':'72mm',maxWidth:'none',height:'auto',padding:'0',margin:'0',display:'flow-root'});
  document.body.appendChild(sample);
  // Keep short receipts portrait as well; some drivers rotate wider-than-tall pages.
  const heightMm=Math.max(Number(paper)+1,Math.ceil(sample.getBoundingClientRect().height*25.4/96)+3);
  sample.remove();
  const style=document.createElement('style');style.dataset.receiptPage='true';
  style.textContent=`@media print { @page { size: ${paper}mm ${heightMm}mm; margin:0; } @page receipt { size: ${paper}mm ${heightMm}mm; } }`;
  document.head.appendChild(style);pageStyle.current=style;
 }
 useEffect(()=>()=>{pageStyle.current?.remove();pageStyle.current=null;},[paper]);
 printRef.current=()=>{preparePage();window.print();};
 useEffect(()=>{
  if(!autoPrint)return;
  const afterPrint=()=>closeRef.current();
  window.addEventListener('afterprint',afterPrint);
  const timer=setTimeout(()=>{try{printRef.current();}catch{setError('Printing could not start. Retry below or use Order History to reprint.');}},150);
  return()=>{clearTimeout(timer);window.removeEventListener('afterprint',afterPrint);};
 },[autoPrint]);
 const receipt=receiptData(order),payment=receipt.payment;
 function print(){setError('');try{printRef.current();}catch{setError('Could not open printing. You can try again or reprint from Order History.');}}
 return createPortal(<dialog ref={dialog} className="receipt-dialog" aria-labelledby="receipt-title" style={{'--receipt-width':paper==='a4'?'180mm':paper==='58'?'48mm':'72mm'}} onCancel={event=>{event.preventDefault();onClose();}}>
  <header className="receipt-controls"><h2 id="receipt-title">Receipt</h2><button type="button" onClick={onClose} aria-label="Close receipt"><X size={20}/></button></header>
  <div className="receipt-toolbar"><label>Paper size<select value={paper} onChange={event=>{setPaper(event.target.value);try{localStorage.setItem('receipt-paper',event.target.value);}catch{}}}><option value="80">80 mm receipt</option><option value="58">58 mm receipt</option><option value="a4">A4</option></select></label><button type="button" className="receipt-print-button" onClick={print}><Printer size={18}/>Print receipt</button></div>
  {error&&<p className="receipt-print-error" role="alert">{error}</p>}
  <div className="receipt-preview"><article className="receipt-paper">
   <header><h1>LA CASA</h1><p>Sales receipt</p>{receipt.refunded&&<strong className="receipt-refunded">REFUNDED</strong>}</header>
   <p className="receipt-reference">{receipt.local?'Device receipt':'Order'}: {receipt.id}</p>
   <p>{receiptDate(receipt.date)}</p><p>{receipt.customer}{receipt.type==='dine-in'?' / Dine-in':receipt.type==='takeout'?' / Takeaway':''}</p>
   <table><thead><tr><th>Item</th><th>Qty</th><th>USD</th></tr></thead><tbody>{receipt.items.map((item,index)=><tr key={index}><td>{item.name}<small>{usd(item.price)} each</small></td><td>{item.qty}</td><td>{usd(item.price*item.qty)}</td></tr>)}</tbody></table>
   {!receipt.items.length&&<p>Item details not recorded.</p>}
   {receipt.discount>0&&<><div className="receipt-line"><span>Subtotal</span><span>{usd(receipt.subtotal)}</span></div><div className="receipt-line"><span>Discount</span><span>-{usd(receipt.discount)}</span></div></>}
   <div className="receipt-line receipt-total"><strong>Total</strong><strong>{usd(receipt.total)}</strong></div>
   {receipt.rate&&<><div className="receipt-line"><span>Total in L.L.</span><span>{lbp(receipt.total*receipt.rate)}</span></div></>}
   <div className="receipt-payment"><div className="receipt-line"><span>Payment</span><strong>{receipt.method}</strong></div>
   {payment.method==='cash'&&Number.isFinite(payment.amount_received)&&<>
    <div className="receipt-line"><span>Received</span><span>{payment.currency==='LBP'?lbp(payment.amount_received):usd(payment.amount_received)}</span></div>
    {Number.isFinite(payment.change_usd)&&Number.isFinite(payment.change_lbp)&&<div className="receipt-line"><span>Change</span><span>{payment.currency==='USD'?usd(payment.change_usd)+' + ':''}{lbp(payment.change_lbp)}</span></div>}
   </>}
   </div><footer>Thank you for visiting La Casa!</footer>
  </article></div>
  <footer className="receipt-controls"><span>Choose the matching paper size in your printer settings.</span><button type="button" onClick={onClose}>Done</button></footer>
 </dialog>,document.body);
}
