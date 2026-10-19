import {useState} from 'react';
import api from '../../api.js';

const mode=row=>Number(row.pos_hidden)?'both':Number(row.menu_hidden)?'menu':'visible';
const label=row=>mode(row)==='both'?'Hidden in POS and menu':mode(row)==='menu'?'Hidden in menu':'Visible';
export default function ProductVisibility({products,categories,groups,onChanged,disabled}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[search,setSearch]=useState('');
 const [typeFilter,setTypeFilter]=useState('all'),[statusFilter,setStatusFilter]=useState('all'),[groupFilter,setGroupFilter]=useState('all'),[categoryFilter,setCategoryFilter]=useState('all');
 async function save(kind,id,value){
  if(busy)return;setBusy(true);setError('');setMessage('');
  try{await api.patch('/api/products/'+(kind==='products'?'':kind+'/')+id+'/visibility',{hidden:value==='both',menu_hidden:value!=='visible'});await onChanged();setMessage('Visibility saved on this device. The customer menu updates after syncing.');}
  catch(e){setError(e.response?.data?.error||e.message||'Could not save visibility.');}finally{setBusy(false);}
 }
 const groupFor=c=>groups.find(g=>String(g.group_id)===String(c?.menu_group_id));
 const sections=[{kind:'groups',title:'Groups',rows:groups,key:'group_id',name:'group_name'},{kind:'categories',title:'Categories',rows:categories,key:'p_category_id',name:'p_category_name'},{kind:'products',title:'Items',rows:products,key:'product_id',name:'product_name'}].filter(section=>typeFilter==='all'||typeFilter===section.kind).map(section=>({...section,rows:section.rows.filter(row=>{
  const category=section.kind==='products'?categories.find(c=>c.p_category_name===row.product_category):section.kind==='categories'?row:null;
  const group=section.kind==='groups'?row:groupFor(category);
  const modes=[mode(row),...(section.kind==='products'&&category?[mode(category)]:[]),...(section.kind!=='groups'&&group?[mode(group)]:[])];
  const effective=modes.includes('both')?'both':modes.includes('menu')?'menu':'visible';
  return String(row[section.name]).toLowerCase().includes(search.trim().toLowerCase())
   &&(statusFilter==='all'||statusFilter==='hidden'&&effective!=='visible'||statusFilter===effective)
   &&(groupFilter==='all'||groupFilter==='none'&&!group||String(group?.group_id)===groupFilter)
   &&(categoryFilter==='all'||String(category?.p_category_id)===categoryFilter);
 })}));
 return <section className="menu-public-card menu-visibility" aria-busy={busy}>
  <h3>Visibility</h3><p>Choose where each group, category, or item appears. Group settings apply to all their categories and items. Category settings apply to all their items. Showing a group or category keeps individually hidden items hidden.</p>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <div className="visibility-toolbar">
   <input className="visibility-search" type="search" aria-label="Search visibility" placeholder="Search groups, categories, or items" value={search} onChange={e=>setSearch(e.target.value)}/>
   <div className="visibility-filters">
    <label>Show<select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="all">All types</option><option value="groups">Groups</option><option value="categories">Categories</option><option value="products">Items</option></select></label>
    <label>Visibility<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All visibility</option><option value="visible">Visible everywhere</option><option value="hidden">All hidden</option><option value="menu">Hidden from menu only</option><option value="both">Hidden from POS and menu</option></select></label>
    <label>Group<select value={groupFilter} onChange={e=>{setGroupFilter(e.target.value);setCategoryFilter('all');}}><option value="all">All groups</option><option value="none">No group</option>{groups.map(g=><option key={g.group_id} value={g.group_id}>{g.group_name}</option>)}</select></label>
    <label>Category<select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">All categories</option>{categories.filter(c=>groupFilter==='all'||groupFilter==='none'&&!c.menu_group_id||String(c.menu_group_id)===groupFilter).map(c=><option key={c.p_category_id} value={c.p_category_id}>{c.p_category_name}</option>)}</select></label>
    <button type="button" onClick={()=>{setSearch('');setTypeFilter('all');setStatusFilter('all');setGroupFilter('all');setCategoryFilter('all');}}>Clear filters</button>
   </div>
  </div>
  <p role="status">{sections.reduce((total,section)=>total+section.rows.length,0)} results</p>
  {sections.map(({kind,title,rows,key,name})=><section key={kind}><h4>{title}</h4><ul className="menu-order-list">{rows.map(row=>{
   const category=kind==='products'?categories.find(c=>c.p_category_name===row.product_category):kind==='categories'?row:null;
   const group=kind==='groups'?null:groupFor(category);
   const parent=[group,kind==='products'?category:null].filter(Boolean);
   const inherited=parent.find(p=>mode(p)==='both')||parent.find(p=>mode(p)==='menu');
   return <li key={row[key]}><span><strong>{row[name]}</strong>{inherited&&<small>{label(inherited)} by {inherited.group_name||inherited.p_category_name}</small>}</span><select aria-label={'Visibility for '+row[name]} value={mode(row)} disabled={busy||disabled} onChange={e=>save(kind,row[key],e.target.value)}><option value="visible">Visible in POS and menu</option><option value="menu">Hide from menu only</option><option value="both">Hide from POS and menu</option></select></li>;
  })}</ul>{!rows.length&&<p>No {title.toLowerCase()} match your filters.</p>}</section>)}
 </section>;
}
