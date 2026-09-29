import { useEffect, useState } from "react";
import api from "../../api.js";
import LoadingState from "../../components/LoadingState.jsx";
import { LayoutList, ExternalLink, ArrowUp, ArrowDown } from "lucide-react";
import './MenuManag.css';

function MenuManag() {
    const [products,setProducts]=useState([]),[categories,setCategories]=useState([]),[groups,setGroups]=useState([]);
    const [selectedGroup,setSelectedGroup]=useState(null),[groupsReady,setGroupsReady]=useState(false);
    const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
    const [selected,setSelected]=useState(null);
    async function refresh(){
        setLoading(true);setError('');
        try{const [p,c,g]=await Promise.allSettled([api.get('/api/products'),api.get('/api/products/categories'),api.get('/api/products/groups')]);if(g.status==='fulfilled'){setGroups(g.value.data);setGroupsReady(true);}else setGroupsReady(false);if(p.status==='fulfilled')setProducts(p.value.data);if(c.status==='fulfilled')setCategories(c.value.data);const failure=[p,c,g].find(result=>result.status==='rejected');if(failure)throw failure.reason;}
        catch(e){setError(e.response?.data?.error||'Could not load the menu.');}finally{setLoading(false);}
    }
    useEffect(()=>{void refresh();},[]);
    const sorted=(rows,key)=>[...rows].sort((a,b)=>(a.menu_position??2147483647)-(b.menu_position??2147483647)||Number(a[key])-Number(b[key]));
    const categoryList=sorted(categories,'p_category_id');
    const groupList=sorted(groups,'group_id');
    const groupKey=selectedGroup??String(groupList[0]?.group_id??'');
    const visibleCategories=categoryList.filter(category=>String(category.menu_group_id??'')===groupKey);
    const selectedName=selected??categoryList[0]?.p_category_name??'';
    const productList=sorted(products,'product_id');
    const visibleProducts=productList.filter(p=>(p.product_category||'')===selectedName);
    async function move(kind,row,direction){
        if(busy)return;
        const key=kind==='groups'?'group_id':kind==='categories'?'p_category_id':'product_id';
        const all=kind==='groups'?groupList:kind==='categories'?categoryList:productList;
        const visible=kind==='groups'?groupList:kind==='categories'?visibleCategories:visibleProducts;
        const at=visible.findIndex(item=>item[key]===row[key]),other=visible[at+direction];
        if(!other)return;
        const next=[...all],from=next.findIndex(item=>item[key]===row[key]),to=next.findIndex(item=>item[key]===other[key]);
        [next[from],next[to]]=[next[to],next[from]];
        setBusy(true);setError('');setMessage('');
        try{
            await api.put('/api/products/menu-order',{kind,entries:next.map(item=>({[key]:Number(item[key])}))});
            const saved=next.map((item,index)=>({...item,menu_position:index}));
            if(kind==='groups')setGroups(saved);else if(kind==='categories')setCategories(saved);else setProducts(saved);
            setMessage('Order saved on this device. The customer menu updates after syncing.');
        }catch(e){setError(e.response?.data?.error||'Could not save the order.');}finally{setBusy(false);}
    }
    async function assignGroup(category,value){
        if(busy)return;setBusy(true);setError('');setMessage('');
        try{const menu_group_id=value===''?null:Number(value);await api.patch('/api/products/categories/'+category.p_category_id+'/group',{menu_group_id});setCategories(rows=>rows.map(row=>row.p_category_id===category.p_category_id?{...row,menu_group_id}:row));setMessage('Category placement saved. The customer menu updates after syncing.');}
        catch(e){setError(e.response?.data?.error||'Could not move category.');}finally{setBusy(false);}
    }
    function controls(kind,row,index,length){const name=row.group_name||row.p_category_name||row.product_name;return <div className="menu-order-controls"><button type="button" disabled={busy||index===0} aria-label={'Move '+name+' up'} onClick={()=>move(kind,row,-1)}><ArrowUp size={18}/></button><button type="button" disabled={busy||index===length-1} aria-label={'Move '+name+' down'} onClick={()=>move(kind,row,1)}><ArrowDown size={18}/></button></div>;}
    return <div className="main-area">
        <div className="head-area">
            <div className="PageTitle"><LayoutList /><h2>Menu Management</h2></div>
            <a className="menu-open-link" href="/menu" target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />Open Menu</a>
        </div>
        <section className="menu-public-card">
            <h3>Customer menu</h3>
            <p>Open the public La Casa menu to preview what customers see. No login is required.</p>
            <p>Share this address with customers: <a href="/menu" target="_blank" rel="noopener noreferrer">{window.location.origin}/menu</a></p>
            <p className="menu-public-note">Manage names, prices, descriptions and images in Product Management. Products and categories hidden from the POS are also hidden from the menu. Open menus refresh automatically.</p>
        </section>
        {error&&<div role="alert" className="menu-order-error">{error} <button onClick={refresh} disabled={busy}>Reload menu</button></div>}
        {message&&<p role="status">{message}</p>}
        {loading?<LoadingState label="Loading menu"/>:<div className="menu-order-layout" aria-busy={busy}>
            <section className="menu-public-card"><h3>Group order</h3><p>Arrange the main sections of the customer menu.</p><ol className="menu-order-list">{groupList.map((group,index)=><li key={group.group_id}><span>{group.group_name}</span>{controls('groups',group,index,groupList.length)}</li>)}</ol>{groupsReady&&!groupList.length&&<p>Add groups in Product Management.</p>}</section>
            <section className="menu-public-card"><h3>Category placement</h3><label className="menu-category-picker">Group<select disabled={busy||!groupsReady} value={groupKey} onChange={e=>setSelectedGroup(e.target.value)}>{groupList.map(g=><option key={g.group_id} value={g.group_id}>{g.group_name}</option>)}<option value="">More (no group)</option></select></label><p>Reorder categories here, or choose a different group to move them.</p>
                <ol className="menu-order-list menu-category-placement">{visibleCategories.map((category,index)=><li key={category.p_category_id}><span>{category.p_category_name}{!!Number(category.pos_hidden)&&<small>Hidden</small>}</span><select aria-label={'Move '+category.p_category_name+' to group'} disabled={busy||!groupsReady} value={category.menu_group_id??''} onChange={e=>assignGroup(category,e.target.value)}><option value="">More (no group)</option>{groupList.map(g=><option key={g.group_id} value={g.group_id}>{g.group_name}</option>)}</select>{controls('categories',category,index,visibleCategories.length)}</li>)}</ol>
                {!visibleCategories.length&&<p>No categories in this group. Select another group or More to move categories here.</p>}
            </section>
            <section className="menu-public-card"><h3>Product order</h3><label className="menu-category-picker">Category<select value={selectedName} onChange={e=>setSelected(e.target.value)} disabled={busy}>{categoryList.map(category=><option key={category.p_category_id} value={category.p_category_name}>{category.p_category_name}</option>)}<option value="">Uncategorized</option></select></label>
                <ol className="menu-order-list">{visibleProducts.map((product,index)=><li key={product.product_id}><span>{product.product_name}{!!Number(product.pos_hidden)&&<small>Hidden</small>}</span>{controls('products',product,index,visibleProducts.length)}</li>)}</ol>
                {!visibleProducts.length&&<p>No products in this category.</p>}
            </section>
        </div>}
    </div>;
}
export default MenuManag;
