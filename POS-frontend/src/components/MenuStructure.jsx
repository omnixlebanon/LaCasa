import {useEffect,useState} from 'react';
import api from '../api.js';
import LoadingState from './LoadingState.jsx';
import '../page/menuManag/MenuManag.css';
function NameEditor({name,maxLength,busy,onSave}){
 const [value,setValue]=useState(name);useEffect(()=>setValue(name),[name]);
 return <form className="menu-structure-form" onSubmit={e=>{e.preventDefault();void onSave(value.trim());}}><input aria-label={'Rename '+name} value={value} maxLength={maxLength} required onChange={e=>setValue(e.target.value)}/><button disabled={busy||!value.trim()||value.trim()===name}>Rename</button></form>;
}
export default function MenuStructure({categoriesOnly=false,groupsOnly=false,onChanged}){
 const [groups,setGroups]=useState([]),[categories,setCategories]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [groupError,setGroupError]=useState(''),[categoryError,setCategoryError]=useState('');
 const [groupName,setGroupName]=useState(''),[categoryName,setCategoryName]=useState('');
 const [assignmentCategory,setAssignmentCategory]=useState(''),[assignmentGroup,setAssignmentGroup]=useState('');
 async function refresh(){
  const [g,c]=await Promise.allSettled([api.get('/api/products/groups'),api.get('/api/products/categories')]);
  if(g.status==='fulfilled'&&Array.isArray(g.value.data)){setGroups(g.value.data);setGroupError('');}else setGroupError(g.reason?.response?.data?.error||'Could not load groups. Try again.');
  if(c.status==='fulfilled'&&Array.isArray(c.value.data)){setCategories(c.value.data);setCategoryError('');}else setCategoryError(c.reason?.response?.data?.error||'Could not load categories. Try again.');
 }
 useEffect(()=>{refresh().catch(e=>setError(e.response?.data?.error||e.message)).finally(()=>setLoading(false));},[]);
 async function run(fn){if(busy)return;setBusy(true);setError('');setMessage('');try{await fn();await refresh();await onChanged?.();setMessage('Saved on this device. The customer menu updates after syncing.');}catch(e){setError(e.response?.data?.error||e.message);}finally{setBusy(false);}}
 return <section className="menu-public-card menu-structure" aria-busy={busy}><h3>{groupsOnly?'Manage groups':categoriesOnly?'Manage categories':'Groups and categories'}</h3>
 {error&&<p role="alert" className="menu-order-error">{error}</p>}{message&&<p role="status">{message}</p>}
 {(groupError||categoryError)&&<div role="alert"><p>{groupError}</p><p>{categoryError}</p><button disabled={busy} onClick={()=>run(refresh)}>Retry loading</button></div>}
 {loading?<LoadingState label="Loading groups and categories"/>:<>
 {!categoriesOnly&&<section className="menu-group-assignment" aria-label="Assign category to group">
  <h4>Assign category to group</h4><p>Choose an existing category and the group it should belong to.</p>
  <form onSubmit={e=>{e.preventDefault();void run(async()=>{await api.patch('/api/products/categories/'+assignmentCategory+'/group',{menu_group_id:Number(assignmentGroup)});setAssignmentCategory('');});}}>
   <label>Category<select required value={assignmentCategory} disabled={busy||!!categoryError} onChange={e=>setAssignmentCategory(e.target.value)}><option value="">Choose a category</option>{categories.map(c=><option key={c.p_category_id} value={c.p_category_id}>{c.p_category_name} ({groups.find(g=>String(g.group_id)===String(c.menu_group_id))?.group_name||'No group'})</option>)}</select></label>
   <label>Group<select required value={assignmentGroup} disabled={busy||!!groupError} onChange={e=>setAssignmentGroup(e.target.value)}><option value="">Choose a group</option>{groups.map(g=><option key={g.group_id} value={g.group_id}>{g.group_name}</option>)}</select></label>
   <button type="submit" disabled={busy||!!groupError||!!categoryError||!assignmentCategory||!assignmentGroup}>Assign category</button>
  </form>
  {!groups.length&&<p>Add a group below to start assigning categories.</p>}
 </section>}
 {!categoriesOnly&&<><h4>Menu groups</h4><form className="menu-structure-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api.post('/api/products/groups',{group_name:groupName.trim()});setGroupName('');});}}><input aria-label="New group name" placeholder="New group name" required maxLength={60} value={groupName} onChange={e=>setGroupName(e.target.value)}/><button disabled={busy||!groupName.trim()}>Add group</button></form>
 <p>Each group appears in the main menu navigation and can contain multiple categories. Removing a category keeps its products under More.</p>
 <ul className="menu-order-list">{groups.map(g=>{
  const members=categories.filter(c=>String(c.menu_group_id)===String(g.group_id));
  return <li className="menu-group-editor" key={g.group_id}><div className="menu-group-heading"><NameEditor name={g.group_name} maxLength={60} busy={busy} onSave={name=>run(()=>api.patch('/api/products/groups/'+g.group_id,{group_name:name}))}/><button disabled={busy} onClick={()=>{if(window.confirm('Delete '+g.group_name+'? Its categories and products will stay and appear under More.'))void run(()=>api.delete('/api/products/groups/'+g.group_id));}}>Delete</button></div>
   <h5>Categories in {g.group_name}</h5>
   <ul className="menu-order-list">{members.map(c=><li key={c.p_category_id}><span>{c.p_category_name}</span><button type="button" disabled={busy||!!categoryError||!!groupError} aria-label={'Remove '+c.p_category_name+' from '+g.group_name} onClick={()=>run(()=>api.patch('/api/products/categories/'+c.p_category_id+'/group',{menu_group_id:null}))}>Remove</button></li>)}</ul>
   {!categoryError&&!members.length&&<p>No categories in this group yet.</p>}
  </li>;
 })}</ul>{!groupError&&!groups.length&&<p>No groups yet. Add your first group above.</p>}</>}
 {!groupsOnly&&<><h4>Categories</h4><form className="menu-structure-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api.post('/api/products/category',{category_name:categoryName.trim()});setCategoryName('');});}}><input aria-label="New category name" placeholder="New category name" required maxLength={30} value={categoryName} onChange={e=>setCategoryName(e.target.value)}/><button disabled={busy||!categoryName.trim()}>Add category</button></form>
 <p>Change ordering and group assignments in Menu Management. Renaming a category keeps its products and group.</p>
 <ul className="menu-order-list">{categories.map(c=><li key={c.p_category_id}><NameEditor name={c.p_category_name} maxLength={30} busy={busy} onSave={name=>run(()=>api.put('/api/products/category',{old_name:c.p_category_name,new_name:name}))}/><button disabled={busy} onClick={()=>{if(window.confirm('Delete '+c.p_category_name+'? Its products will remain uncategorized.'))void run(()=>api.delete('/api/products/category/'+encodeURIComponent(c.p_category_name)));}}>Delete</button></li>)}</ul>
 {!categoryError&&!categories.length&&<p>No categories yet. Add your first category above.</p>}
 </>}
 </>}
 </section>;
}
