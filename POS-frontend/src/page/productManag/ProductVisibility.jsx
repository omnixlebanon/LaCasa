import {useState} from 'react';
import api from '../../api.js';

const mode=row=>Number(row.pos_hidden)?'both':Number(row.menu_hidden)?'menu':'visible';
const label=row=>mode(row)==='both'?'Hidden in POS and menu':mode(row)==='menu'?'Hidden in menu':'Visible';
export default function ProductVisibility({products,categories,groups,onChanged,disabled}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[search,setSearch]=useState('');
 async function save(kind,id,value){
  if(busy)return;setBusy(true);setError('');setMessage('');
  try{await api.patch('/api/products/'+(kind==='products'?'':kind+'/')+id+'/visibility',{hidden:value==='both',menu_hidden:value!=='visible'});await onChanged();setMessage('Visibility saved on this device. The customer menu updates after syncing.');}
  catch(e){setError(e.response?.data?.error||e.message||'Could not save visibility.');}finally{setBusy(false);}
 }
 const groupFor=c=>groups.find(g=>String(g.group_id)===String(c?.menu_group_id));
 return <section className="menu-public-card menu-visibility" aria-busy={busy}>
  <h3>Visibility</h3><p>Choose where each group, category, or item appears. Group settings apply to all their categories and items. Category settings apply to all their items. Showing a group or category keeps individually hidden items hidden.</p>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <input type="search" aria-label="Search visibility" placeholder="Search groups, categories, or items" value={search} onChange={e=>setSearch(e.target.value)}/>
  {[{kind:'groups',title:'Groups',rows:groups,key:'group_id',name:'group_name'},{kind:'categories',title:'Categories',rows:categories,key:'p_category_id',name:'p_category_name'},{kind:'products',title:'Items',rows:products,key:'product_id',name:'product_name'}].map(({kind,title,rows,key,name})=><section key={kind}><h4>{title}</h4><ul className="menu-order-list">{rows.filter(row=>String(row[name]).toLowerCase().includes(search.toLowerCase())).map(row=>{
   const category=kind==='products'?categories.find(c=>c.p_category_name===row.product_category):kind==='categories'?row:null;
   const group=kind==='groups'?null:groupFor(category);
   const parent=[group,kind==='products'?category:null].filter(Boolean);
   const inherited=parent.find(p=>mode(p)==='both')||parent.find(p=>mode(p)==='menu');
   return <li key={row[key]}><span><strong>{row[name]}</strong>{inherited&&<small>{label(inherited)} by {inherited.group_name||inherited.p_category_name}</small>}</span><select aria-label={'Visibility for '+row[name]} value={mode(row)} disabled={busy||disabled} onChange={e=>save(kind,row[key],e.target.value)}><option value="visible">Visible in POS and menu</option><option value="menu">Hide from menu only</option><option value="both">Hide from POS and menu</option></select></li>;
  })}</ul>{!rows.length&&<p>No {title.toLowerCase()} yet.</p>}</section>)}
 </section>;
}
