import { useEffect, useState } from 'react';
import { accountId, change, load } from './storage.js';

export const editDrafts = fn => change(state => fn(state.drafts));

// Render a cart edit only after it has been committed to device storage.
export default function useDrafts() {
 const [drafts,setDrafts]=useState({orders:[],nextOrder:1,activeOrderId:null});
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  let mounted=true;const owner=accountId();
  const refresh=()=>load(owner).then(state=>{if(mounted&&state.drafts){setDrafts(state.drafts);setReady(true);}}).catch(error=>{if(mounted)alert('Cannot read saved orders: '+error.message);});
  window.addEventListener('offline-change',refresh);
  change(()=>{},owner).then(refresh).catch(error=>alert('Cannot save orders: '+error.message));
  return()=>{mounted=false;window.removeEventListener('offline-change',refresh);};
 },[]);
 const set=(key,value)=>editDrafts(d=>{d[key]=typeof value==='function'?value(d[key]):value;}).catch(error=>alert('Order change was not saved: '+error.message));
 return {...drafts,ready,setOrders:value=>set('orders',value),setNextOrder:value=>set('nextOrder',value),setActiveOrderId:value=>set('activeOrderId',value)};
}
