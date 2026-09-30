import {useEffect,useMemo,useState} from 'react';
import {PackagePlus,Search} from 'lucide-react';
import api from '../../api.js';
import {useCurrency} from '../../global.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import './StockHistory.css';

export default function StockHistory(){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [search,setSearch]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('');
 const {formatPrice}=useCurrency();
 async function refresh(){setLoading(true);setError('');try{const res=await api.get('/api/stock/history');setRows(res.data);}catch(e){setError(e.response?.data?.error||e.message);}finally{setLoading(false);}}
 useEffect(()=>{refresh();window.addEventListener('offline-snapshot',refresh);return()=>window.removeEventListener('offline-snapshot',refresh);},[]);
 const day=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Beirut',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
 const filtered=useMemo(()=>rows.filter(row=>{
  const text=[row.item_name,row.category,row.supplier_name].filter(Boolean).join(' ').toLowerCase();
  const date=day(row.purchased_at);
  return text.includes(search.trim().toLowerCase())&&(!from||date>=from)&&(!to||date<=to);
 }).sort((a,b)=>new Date(b.purchased_at)-new Date(a.purchased_at)),[rows,search,from,to]);
 return <section className="stock-history-page" aria-label="Stock History">
  <div className="stock-history-heading"><PackagePlus/><h2>Stock History</h2></div>
  <p className="stock-history-intro">Purchased stock, with the quantity and ingredient cost recorded when it was added. Tracking starts with new stock additions; older purchases are not included.</p>
  {loading||error?<LoadingState label="Loading stock purchases..." error={error} onRetry={refresh}/>:<>
   <div className="stock-history-totals"><div><span>Purchases shown</span><strong>{filtered.length.toLocaleString()}</strong></div><div><span>Recorded purchase value</span><strong>{formatPrice(filtered.reduce((sum,row)=>sum+Number(row.total_cost),0))}</strong></div></div>
   <div className="stock-history-filters"><label className="stock-history-search"><span>Search purchases</span><div><Search size={18}/><input type="search" placeholder="Ingredient, category or supplier" value={search} onChange={e=>setSearch(e.target.value)}/></div></label><label>From<input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label></div>
   {filtered.length===0?<div className="stock-history-empty"><PackagePlus size={32}/><h3>{rows.length?'No matching purchases':'No stock purchases recorded yet'}</h3><p>{rows.length?'Try another search or date range.':'Add a batch from Stock to record a purchase here.'}</p></div>:<div className="stock-history-table"><table><thead><tr><th>Date</th><th>Ingredient</th><th>Supplier</th><th>Quantity bought</th><th>Unit cost</th><th>Total cost</th></tr></thead><tbody>{filtered.map(row=><tr key={row.purchase_id}>
    <td data-label="Date">{new Date(row.purchased_at).toLocaleString(undefined,{timeZone:'Asia/Beirut',dateStyle:'medium',timeStyle:'short'})}{row.pending_sync&&<small className="stock-history-pending">Awaiting sync</small>}</td>
    <td data-label="Ingredient"><strong>{row.item_name}</strong><small>{row.category||'Uncategorized'}</small></td><td data-label="Supplier">{row.supplier_name||'Not recorded'}</td><td data-label="Quantity bought">{Number(row.quantity).toLocaleString()} {row.uom}</td><td data-label="Unit cost">{formatPrice(Number(row.unit_cost))} / {row.uom}</td><td data-label="Total cost"><strong>{formatPrice(Number(row.total_cost))}</strong></td>
   </tr>)}</tbody></table></div>}
  </>}
 </section>;
}
