import {useEffect,useState} from 'react';
import api from '../api.js';
import LoadingState from './LoadingState.jsx';
import '../page/menuManag/MenuManag.css';
function NameEditor({name,maxLength,busy,onSave}){
 const [value,setValue]=useState(name);useEffect(()=>setValue(name),[name]);
 return <form className="menu-structure-form" onSubmit={e=>{e.preventDefault();void onSave(value.trim());}}><input aria-label={'Rename '+name} value={value} maxLength={maxLength} required onChange={e=>setValue(e.target.value)}/><button disabled={busy||!value.trim()||value.trim()===name}>Rename</button></form>;
}
export default function MenuStructure({categoriesOnly=false,onChanged}){
 const [groups,setGroups]=useState([]),[categories,setCategories]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [groupName,setGroupName]=useState(''),[categoryName,setCategoryName]=useState('');
 async function refresh(){const [g,c]=await Promise.all([api.get('/api/products/groups'),api.get('/api/products/categories')]);setGroups(g.data);setCategories(c.data);}
 useEffect(()=>{refresh().catch(e=>setError(e.response?.data?.error||e.message)).finally(()=>setLoading(false));},[]);
 async function run(fn){if(busy)return;setBusy(true);setError('');setMessage('');try{await fn();await refresh();await onChanged?.();setMessage('Saved on this device. The customer menu updates after syncing.');}catch(e){setError(e.response?.data?.error||e.message);}finally{setBusy(false);}}
 async function moveGroup(index,direction){const next=[...groups];[next[index],next[index+direction]]=[next[index+direction],next[index]];await api.put('/api/products/menu-order',{kind:'groups',entries:next.map(g=>({group_id:Number(g.group_id)}))});}
 return <section className="menu-public-card menu-structure" aria-busy={busy}><h3>{categoriesOnly?'Manage categories':'Groups and categories'}</h3>
 {error&&<p role="alert" className="menu-order-error">{error}</p>}{message&&<p role="status">{message}</p>}
 {loading?<LoadingState label="Loading groups and categories"/>:<>
 {!categoriesOnly&&<><h4>Menu groups</h4><form className="menu-structure-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api.post('/api/products/groups',{group_name:groupName.trim()});setGroupName('');});}}><input aria-label="New group name" placeholder="New group name" required maxLength={60} value={groupName} onChange={e=>setGroupName(e.target.value)}/><button disabled={busy||!groupName.trim()}>Add group</button></form>
 <ul className="menu-order-list">{groups.map((g,i)=><li key={g.group_id}><NameEditor name={g.group_name} maxLength={60} busy={busy} onSave={name=>run(()=>api.patch('/api/products/groups/'+g.group_id,{group_name:name}))}/><div className="menu-order-controls"><button aria-label={'Move '+g.group_name+' up'} disabled={busy||i===0} onClick={()=>run(()=>moveGroup(i,-1))}>?</button><button aria-label={'Move '+g.group_name+' down'} disabled={busy||i===groups.length-1} onClick={()=>run(()=>moveGroup(i,1))}>?</button><button disabled={busy} onClick={()=>{if(window.confirm('Delete '+g.group_name+'? Its categories and products will stay and appear under More.'))void run(()=>api.delete('/api/products/groups/'+g.group_id));}}>Delete</button></div></li>)}</ul></>}
 <h4>Categories</h4><form className="menu-structure-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api.post('/api/products/category',{category_name:categoryName.trim()});setCategoryName('');});}}><input aria-label="New category name" placeholder="New category name" required maxLength={30} value={categoryName} onChange={e=>setCategoryName(e.target.value)}/><button disabled={busy||!categoryName.trim()}>Add category</button></form>
 <p>Choose a group for each category. Categories without a group appear under More. Renaming a category keeps its products and group.</p>
 <ul className="menu-order-list">{categories.map(c=><li key={c.p_category_id}><NameEditor name={c.p_category_name} maxLength={30} busy={busy} onSave={name=>run(()=>api.put('/api/products/category',{old_name:c.p_category_name,new_name:name}))}/><select aria-label={'Group for '+c.p_category_name} disabled={busy} value={c.menu_group_id??''} onChange={e=>run(()=>api.patch('/api/products/categories/'+c.p_category_id+'/group',{menu_group_id:e.target.value===''?null:Number(e.target.value)}))}><option value="">More (no group)</option>{groups.map(g=><option key={g.group_id} value={g.group_id}>{g.group_name}</option>)}</select><button disabled={busy} onClick={()=>{if(window.confirm('Delete '+c.p_category_name+'? Its products will remain uncategorized.'))void run(()=>api.delete('/api/products/category/'+encodeURIComponent(c.p_category_name)));}}>Delete</button></li>)}</ul>
 {!categories.length&&<p>No categories yet.</p>}
 </>}
 </section>;
}
