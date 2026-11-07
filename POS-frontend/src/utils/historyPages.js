import api from '../api.js';
import {load} from '../offline/storage.js';
import {readLocal} from '../offline/model.js';
// All pages must belong to one server revision. Never present a partial report.
export async function historyPages(path, params={}, signal) {
 const state=await load();
 if(!navigator.onLine||state.queue.length){
  const cutoff=state.snapshotDay?new Date(Date.parse(state.snapshotDay)-89*86400000).toISOString().slice(0,10):null;
  if(params.recent==='1'||(cutoff&&params.from>=cutoff)){
   const rows=readLocal(state,path);
   return rows.filter(row=>{const day=String(row.order_date||row.purchased_at).slice(0,10);return (!params.from||day>=params.from)&&(!params.to||day<=params.to);});
  }
  throw Error(navigator.onLine?'Wait for pending changes to sync before loading older history.':'Connect to load older history and complete historical reports. Recent history is available offline.');
 }
 for(let attempt=0;attempt<3;attempt++){
  const rows=[];let revision;
  for(let offset=0;;offset+=500){
   const res=await api.get(path,{params:{...params,limit:500,offset},signal});
   const current=res.headers['x-sync-revision'];
   if(res.headers['x-history-pagination']!=='1')throw Error('The history service needs updating. Please retry after the backend update.');
   if(current===undefined)throw Error('History could not be verified. Please retry.');
   if(revision!==undefined&&revision!==current)break;
   revision=current;rows.push(...res.data);
   if(res.data.length<500)return rows;
  }
 }
 throw Error('History is changing. Please retry to load a complete report.');
}
