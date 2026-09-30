import {useEffect,useState} from 'react';
import api from '../../api.js';
import MoneyInput from '../../components/MoneyInput.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import {useCurrency} from '../../global.jsx';
export default function PositionSalaries({onChanged}){
 const {formatPrice,currencyLabel}=useCurrency();
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [position,setPosition]=useState(''),[month,setMonth]=useState(new Date().toISOString().slice(0,7)),[amount,setAmount]=useState('');
 async function load(){setLoading(true);try{const res=await api.get('/api/employees/position-salaries');setRows(res.data);setError('');}catch(e){setError(e.response?.data?.error||e.message);}finally{setLoading(false);}}
 useEffect(()=>{load();},[]);
 async function save(e){e.preventDefault();if(busy)return;setBusy(true);setError('');try{await api.put('/api/employees/position-salaries',{position,month,amount:Number(amount).toFixed(2)});await load();onChanged();setPosition('');setAmount('');}catch(e){setError(e.response?.data?.error||e.message);}finally{setBusy(false);}}
 return <section className="employee-panel position-salaries"><h3>Default salaries by position</h3><p>Set a monthly default for positions such as Cashier or Barista. Individual salary settings take priority. Admin and Owner accounts do not receive a salary.</p>
 <form className="position-salary-form" onSubmit={save}><label>Position<input value={position} maxLength={50} required placeholder="e.g. Cashier" disabled={busy} onChange={e=>setPosition(e.target.value)}/></label><label>Effective from<input type="month" min="2000-01" max="9998-12" required value={month} disabled={busy} onChange={e=>setMonth(e.target.value)}/></label><label>Monthly salary ({currencyLabel})<MoneyInput value={amount} onChange={e=>setAmount(e.target.value)} min="0" required disabled={busy}/></label><button type="submit" className="add-btn" disabled={busy}>{busy?'Saving...':'Save default'}</button></form>
 {loading?<LoadingState label="Loading salary defaults..."/>:error?<p className="employee-error" role="alert">{error}<button type="button" onClick={load}>Retry</button></p>:<div className="position-salary-list">{!rows.length?<p>No position defaults yet.</p>:rows.map(row=><article key={row.position_key+row.effective_month}><div><strong>{row.position_name}</strong><small>From {row.effective_month.slice(0,7)}</small></div><strong>{formatPrice(Number(row.monthly_salary))}</strong><button className="payroll-secondary" type="button" onClick={()=>{setPosition(row.position_name);setMonth(row.effective_month.slice(0,7));setAmount(Number(row.monthly_salary));}}>Edit</button></article>)}</div>}
 </section>;
}
