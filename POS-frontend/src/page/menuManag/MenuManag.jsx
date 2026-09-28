import { useEffect, useState } from "react";
import MenuStructure from "../../components/MenuStructure.jsx";
import api from "../../api.js";
import LoadingState from "../../components/LoadingState.jsx";
import { LayoutList, ExternalLink, ArrowUp, ArrowDown } from "lucide-react";
import './MenuManag.css';

function MenuManag() {
    const [products,setProducts]=useState([]),[categories,setCategories]=useState([]);
    const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
    const [selected,setSelected]=useState(null);
    async function refresh(){
        setLoading(true);setError('');
        try{const [p,c]=await Promise.all([api.get('/api/products'),api.get('/api/products/categories')]);setProducts(p.data);setCategories(c.data);}
        catch(e){setError(e.response?.data?.error||'Could not load the menu.');}finally{setLoading(false);}
    }
    useEffect(()=>{void refresh();},[]);
    const sorted=(rows,key)=>[...rows].sort((a,b)=>(a.menu_position??2147483647)-(b.menu_position??2147483647)||Number(a[key])-Number(b[key]));
    const categoryList=sorted(categories,'p_category_id');
    const selectedName=selected??categoryList[0]?.p_category_name??'';
    const productList=sorted(products,'product_id');
    const visibleProducts=productList.filter(p=>(p.product_category||'')===selectedName);
    async function move(kind,row,direction){
        if(busy)return;
        const key=kind==='categories'?'p_category_id':'product_id';
        const all=kind==='categories'?categoryList:productList;
        const visible=kind==='categories'?categoryList:visibleProducts;
        const at=visible.findIndex(item=>item[key]===row[key]),other=visible[at+direction];
        if(!other)return;
        const next=[...all],from=next.findIndex(item=>item[key]===row[key]),to=next.findIndex(item=>item[key]===other[key]);
        [next[from],next[to]]=[next[to],next[from]];
        setBusy(true);setError('');setMessage('');
        try{
            await api.put('/api/products/menu-order',{kind,entries:next.map(item=>({[key]:Number(item[key])}))});
            const saved=next.map((item,index)=>({...item,menu_position:index}));
            if(kind==='categories')setCategories(saved);else setProducts(saved);
            setMessage('Order saved on this device. The customer menu updates after syncing.');
        }catch(e){setError(e.response?.data?.error||'Could not save the order.');}finally{setBusy(false);}
    }
    function controls(kind,row,index,length){const name=row.p_category_name||row.product_name;return <div className="menu-order-controls"><button type="button" disabled={busy||index===0} aria-label={'Move '+name+' up'} onClick={()=>move(kind,row,-1)}><ArrowUp size={18}/></button><button type="button" disabled={busy||index===length-1} aria-label={'Move '+name+' down'} onClick={()=>move(kind,row,1)}><ArrowDown size={18}/></button></div>;}
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
        <MenuStructure onChanged={refresh}/>
        {error&&<div role="alert" className="menu-order-error">{error} <button onClick={refresh} disabled={busy}>Reload menu</button></div>}
        {message&&<p role="status">{message}</p>}
        {loading?<LoadingState label="Loading menu"/>:<div className="menu-order-layout" aria-busy={busy}>
            <section className="menu-public-card"><h3>Category order</h3><p>Use the arrows to change category order within each customer-menu group. Manage the groups and assignments above.</p>
                <ol className="menu-order-list">{categoryList.map((category,index)=><li key={category.p_category_id}><span>{category.p_category_name}{!!Number(category.pos_hidden)&&<small>Hidden</small>}</span>{controls('categories',category,index,categoryList.length)}</li>)}</ol>
                {!categoryList.length&&<p>No categories yet. Add one in Product Management.</p>}
            </section>
            <section className="menu-public-card"><h3>Product order</h3><label className="menu-category-picker">Category<select value={selectedName} onChange={e=>setSelected(e.target.value)} disabled={busy}>{categoryList.map(category=><option key={category.p_category_id} value={category.p_category_name}>{category.p_category_name}</option>)}<option value="">Uncategorized</option></select></label>
                <ol className="menu-order-list">{visibleProducts.map((product,index)=><li key={product.product_id}><span>{product.product_name}{!!Number(product.pos_hidden)&&<small>Hidden</small>}</span>{controls('products',product,index,visibleProducts.length)}</li>)}</ol>
                {!visibleProducts.length&&<p>No products in this category.</p>}
            </section>
        </div>}
    </div>;
}
export default MenuManag;
