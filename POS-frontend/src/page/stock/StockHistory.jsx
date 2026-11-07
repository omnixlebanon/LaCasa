import {useEffect,useMemo,useState,useRef} from 'react';
import {PackagePlus,Search} from 'lucide-react';
import {historyPages} from '../../utils/historyPages.js';
import {load} from '../../offline/storage.js';
import {useCurrency} from '../../global.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import './StockHistory.css';

export default function StockHistory(){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [search,setSearch]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('');
 const {formatPrice}=useCurrency();
 const olderMode=useRef(false),resourceVersion=useRef();
 async function refresh(older=false){if(older===true)olderMode.current=true;setLoading(true);setError('');try{resourceVersion.current=(await load()).cache['/api/stock/history']?.downloadedAt;setRows(await historyPages('/api/stock/history',olderMode.current?{}:{recent:'1'}));}catch(e){setError(e.response?.data?.error||e.message);}finally{setLoading(false);}}
 useEffect(()=>{refresh();const onSnapshot=()=>{void load().then(state=>{if(state.cache['/api/stock/history']?.downloadedAt!==resourceVersion.current)void refresh();}).catch(()=>{});};window.addEventListener('offline-snapshot',onSnapshot);return()=>window.removeEventListener('offline-snapshot',onSnapshot);},[]);
 const day=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Beirut',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
 const filtered=useMemo(()=>rows.filter(row=>{
  const text=[row.item_name,row.category,row.supplier_name].filter(Boolean).join(' ').toLowerCase();
  const date=day(row.purchased_at);
  return text.includes(search.trim().toLowerCase())&&(!from||date>=from)&&(!to||date<=to);
 }).sort((a,b)=>new Date(b.purchased_at)-new Date(a.purchased_at)),[rows,search,from,to]);
 return <section className="stock-history-page" aria-label="Stock History">
  {loading||error?<LoadingState label="Loading stock purchases..." error={error} onRetry={refresh}/>:<>
   <p>Recent 90 days are saved for offline use. <button type="button" onClick={()=>refresh(true)}>Load older purchases (online)</button></p>
   <div className="stock-history-totals"><div><span>Purchases shown</span><strong>{filtered.length.toLocaleString()}</strong></div><div><span>Recorded purchase value</span><strong>{formatPrice(filtered.reduce((sum,row)=>sum+Number(row.total_cost),0))}</strong></div></div>
   <div className="stock-history-filters"><label className="stock-history-search"><span>Search purchases</span><div><Search size={18}/><input type="search" placeholder="Ingredient, category or supplier" value={search} onChange={e=>setSearch(e.target.value)}/></div></label><label>From<input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label></div>
   {filtered.length===0?<div className="stock-history-empty"><PackagePlus size={32}/><h3>{rows.length?'No matching purchases':'No stock purchases recorded yet'}</h3><p>{rows.length?'Try another search or date range.':'Add a batch from Stock to record a purchase here.'}</p></div>:<div className="stock-history-table"><table><thead><tr><th>Date</th><th>Ingredient</th><th>Supplier</th><th>Quantity bought</th><th>Unit cost</th><th>Total cost</th></tr></thead><tbody>{filtered.map(row=><tr key={row.purchase_id}>
    <td data-label="Date">{new Date(row.purchased_at).toLocaleString(undefined,{timeZone:'Asia/Beirut',dateStyle:'medium',timeStyle:'short'})}{row.pending_sync&&<small className="stock-history-pending">Awaiting sync</small>}</td>
    <td data-label="Ingredient"><strong>{row.item_name}</strong><small>{row.category||'Uncategorized'}</small></td><td data-label="Supplier">{row.supplier_name||'Not recorded'}</td><td data-label="Quantity bought">{Number(row.quantity).toLocaleString()} {row.uom}</td><td data-label="Unit cost">{formatPrice(Number(row.unit_cost))} / {row.uom}</td><td data-label="Total cost"><strong>{formatPrice(Number(row.total_cost))}</strong></td>
   </tr>)}</tbody></table></div>}
  </>}
 </section>;
}
