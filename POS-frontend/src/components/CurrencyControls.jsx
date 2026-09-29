import {useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Settings,ArrowRightLeft,X} from 'lucide-react';
import {useCurrency} from '../global.jsx';
import './CurrencyControls.css';
export default function CurrencyControls(){
 const {currency,toggleCurrency,rate,changeRate}=useCurrency();
 const dialog=useRef(null);const [value,setValue]=useState(''),[error,setError]=useState('');
 function open(){setValue(String(rate));setError('');dialog.current.showModal();}
 function save(event){event.preventDefault();const next=Number(value);if(!Number.isFinite(next)||next<=0){setError('Enter an exchange rate greater than zero.');return;}changeRate(next);dialog.current.close();}
 return <><div className="currency-controls"><button type="button" className="currency-switch" onClick={toggleCurrency} aria-label={'Change currency from '+currency} title="Switch USD / L.L.">{currency==='USD'?'USD':'L.L.'}</button><button type="button" className="currency-rate-icon" aria-label="Exchange rate settings" title="Exchange rate settings" onClick={open}><Settings size={18}/></button></div>
 {createPortal(<dialog ref={dialog} className="currency-rate-dialog" aria-labelledby="currency-rate-title"><form onSubmit={save}><header><div className="currency-rate-heading"><span><ArrowRightLeft size={21}/></span><h2 id="currency-rate-title">Exchange rate</h2></div><button type="button" aria-label="Close exchange rate settings" onClick={()=>dialog.current.close()}><X size={20}/></button></header><p>Set how many Lebanese pounds equal one US dollar.</p><label htmlFor="currency-rate-value">1 USD equals</label><div className="currency-rate-input"><input id="currency-rate-value" type="number" inputMode="decimal" min="0.000001" step="any" required value={value} onChange={e=>setValue(e.target.value)} autoFocus/><span>L.L.</span></div><p className="currency-rate-current">Current rate: 1 USD = {Number(rate).toLocaleString()} L.L.</p>{error&&<p role="alert">{error}</p>}<footer><button type="button" onClick={()=>dialog.current.close()}>Cancel</button><button type="submit" className="currency-rate-save">Save rate</button></footer></form></dialog>,document.body)}</>;
}
