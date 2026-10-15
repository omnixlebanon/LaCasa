import { useEffect, useState } from 'react';
import { network } from '../../offline/transport.js';

const themes = [['default','Everyday','☕'],['christmas','Christmas','❄'],['halloween','Halloween','🎃'],['ramadan','Ramadan','☾'],['new-year','New Year','✦']];
const badges = [['christmas','Christmas Special'],['halloween','Halloween Special'],['ramadan','Ramadan Special'],['new-year','New Year Special'],['limited-time','Limited Time'],['new','New'],['most-popular','Most Popular']];
export default function MenuAppearance({ products, section = 'themes' }) {
    const [badgeTab,setBadgeTab]=useState('all');
    const [value,setValue]=useState(null),[saved,setSaved]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[query,setQuery]=useState('');
    async function load() {
        setBusy(true);setError('');setMessage('');
        try { const {data}=await network.get('/api/settings/menu-appearance');setValue(data);setSaved(JSON.stringify(data)); }
        catch(e) { setError(e.response?.data?.error||'Could not load appearance. Connect to the server and retry.'); }
        finally { setBusy(false); }
    }
    useEffect(()=>{void load();},[]);
    const dirty=value&&JSON.stringify(value)!==saved;
    const update=patch=>{setValue(current=>({...current,...patch}));setMessage('');};
    function toggle(id,badge) {
        const selected=value.badges[id]||[];
        const next=selected.includes(badge)?selected.filter(item=>item!==badge):[...selected,badge];
        const mapping={...value.badges};if(next.length)mapping[id]=next;else delete mapping[id];
        update({badges:mapping});
    }
    async function save() {
        setBusy(true);setError('');setMessage('');
        try { const {data}=await network.put('/api/settings/menu-appearance',value);setValue(data);setSaved(JSON.stringify(data));setMessage('Appearance saved. The customer menu updates within 30 seconds.'); }
        catch(e) { setError(e.response?.data?.error||'Could not save appearance. Your selections are still here; reconnect and retry.'); }
        finally { setBusy(false); }
    }
    const visible=products.filter(product=>product.product_name.toLowerCase().includes(query.toLowerCase()));
    const visibleBadges=badgeTab==='all'?badges:badges.filter(([id])=>id===badgeTab);
    return <section className="menu-public-card menu-appearance" aria-busy={busy}>
        <h3>{section==='themes'?'Themes':'Item Badges'}</h3><p>{section==='themes'?'Dress up the customer menu for the season.':'Highlight selected items with holiday ribbons and promotional badges.'}</p>
        {error&&<p role="alert" className="menu-order-error">{error} {!value&&<button type="button" disabled={busy} onClick={load}>Retry</button>}</p>}
        {!value&&!error&&<p>Loading appearance…</p>}
        {value&&<><fieldset hidden={section!=='themes'} disabled={busy}><legend>Seasonal theme</legend><div className="menu-theme-options">{themes.map(([id,label,icon])=><label key={id} className={'menu-theme-option theme-'+id}><input type="radio" name="menu-season" checked={value.theme===id} onChange={()=>update({theme:id})}/><span aria-hidden="true">{icon}</span><strong>{label}</strong></label>)}</div>
            <label className="menu-decoration-toggle"><input type="checkbox" checked={value.decorations} onChange={e=>update({decorations:e.target.checked})}/>Show seasonal decorations (snow, lantern, pumpkins or sparkles)</label>
        </fieldset>
        <fieldset hidden={section!=='badges'} disabled={busy}><legend>Item banners &amp; badges</legend><p>Choose one or more badges for each item. Holiday badges work independently of the menu theme.</p>
            <div className="menu-badge-nav" role="group" aria-label="Badge categories">
                {[['all','All badges'],...badges].map(([id,label])=><button key={id} type="button" aria-pressed={badgeTab===id} onClick={()=>setBadgeTab(id)}>{label.replace(' Special','')}{id!=='all'&&<span>{products.filter(product=>(value.badges[product.product_id]||[]).includes(id)).length}</span>}</button>)}
            </div>
            <label className="menu-category-picker">Find an item<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by item name"/></label>
            <div className="menu-badge-products">{visible.map(product=><div className="menu-badge-product" key={product.product_id}><strong>{product.product_name}{!!Number(product.pos_hidden)&&<small> (hidden from menu)</small>}</strong><div className="menu-badge-options">{visibleBadges.map(([id,label])=><label key={id} className={'menu-badge-choice badge-'+id}><input type="checkbox" checked={(value.badges[product.product_id]||[]).includes(id)} onChange={()=>toggle(product.product_id,id)}/>{label}</label>)}</div></div>)}{!visible.length&&<p>No matching items.</p>}</div>
        </fieldset>
        <div className="menu-appearance-actions"><button type="button" className="menu-open-link" disabled={busy||!dirty} onClick={save}>{busy?'Saving…':'Save appearance'}</button><button type="button" disabled={busy||!dirty} onClick={()=>{setValue(JSON.parse(saved));setError('');setMessage('');}}>Discard changes</button><span>{dirty?'Unsaved changes':'All changes saved'}</span></div>
        <p className="menu-public-note">Saving appearance requires an internet connection. Changes affect the customer menu only.</p>
        {message&&<p role="status">{message}</p>}</>}
    </section>;
}
