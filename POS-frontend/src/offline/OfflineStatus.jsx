import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { load, exportBackup, restoreBackup } from './storage.js';
import { prepareOffline, syncPending, resolvePending, connectionState } from './transport.js';
import './offline.css';
function redact(value){if(Array.isArray(value))return value.map(redact);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,/password|token|evidence/i.test(key)?'[private]':redact(v)]));return value;}
export default function OfflineStatus(){
 const {user}=useAuth();const [state,setState]=useState(null);const [status,setStatus]=useState(connectionState);const [error,setError]=useState('');const [persisted,setPersisted]=useState(false);const dialog=useRef();
 useEffect(()=>{if(!user)return;let active=true;const update=()=>{load().then(s=>{if(active){setState(s);setStatus(connectionState);}}).catch(e=>{if(active)setError(e.message);});};update();window.addEventListener('offline-change',update);const timer=setInterval(update,5000);navigator.storage?.persisted?.().then(setPersisted);void syncPending({resumeAuth:true}).then(prepareOffline);return()=>{active=false;clearInterval(timer);window.removeEventListener('offline-change',update);};},[user]);
 if(!user)return null;
 const run=async fn=>{try{setError('');await fn();}catch(e){setError(e.message);}};
 return <>
  <button className={`offline-indicator ${state?.queue.length?'has-pending':''}`} title={`${state?.queue.length||0} pending changes · ${status} · ${state?.prepared?'Offline data ready':'Prepare offline data'}`} aria-label={`Open sync: ${state?.queue.length||0} pending changes, ${status}`} onClick={()=>dialog.current.showModal()}>Sync<small>{state?.queue.length||(!state?.prepared?'Setup':status==='online'?'✓':'!')}</small></button>
  <dialog ref={dialog} className="offline-dialog">
   <header><h2>Offline data & sync</h2><button onClick={()=>dialog.current.close()} aria-label="Close sync panel">✕</button></header>
   <p><strong>{status} · {state?.queue.length||0} pending changes</strong></p>
   <p>{state?.prepared?'This account’s downloaded data is saved on this device.':'Connect and prepare this device before using it offline.'}</p>
   <p>Pending changes are stored before an action succeeds. They stay here until the server confirms them. Other devices cannot see them until synced.</p>
   <p>Last synchronization: {state?.lastSync?new Date(state.lastSync).toLocaleString():'Not prepared'}</p>
   <p>{persisted?'Persistent browser storage granted.':'Persistent storage is not granted. Keep an exported backup.'} Clearing browser/site data or losing this device can erase unsynced work.</p>
   <p>Offline figures are provisional. Approvals, payroll calculations and stock validation are finalized on sync. Keep the app open when reconnecting.</p>
   {(error||state?.error)&&<p role="alert" className="offline-error">{error||state.error}</p>}
   <div className="offline-actions">
    <button onClick={()=>run(async()=>{setPersisted(await navigator.storage?.persist?.()||false);await prepareOffline();})}>Prepare / refresh offline data</button>
    <button onClick={()=>run(syncPending)}>Sync now</button>
    <button onClick={()=>run(exportBackup)}>Export backup</button>
    <label>Restore backup<input type="file" accept="application/json,.json" onChange={e=>{if(e.target.files[0])void run(()=>restoreBackup(e.target.files[0]));e.target.value='';}} /></label>
   </div>
   <p>Backups contain business and pending account data. Store them privately. Restoring merges no changes: it requires an empty pending queue and the same account.</p>
   {status==='sign-in required'&&<a href="/POS/login">Sign in again to synchronize (pending changes are kept)</a>}
   <h3>Pending changes ({state?.queue.length||0})</h3>
   {(state?.queue||[]).map((op,index)=><details key={op.id}><summary>{op.method.toUpperCase()} {op.url} — {op.blocked?'Needs review':'Waiting to sync'}</summary><time>{new Date(op.createdAt).toLocaleString()}</time><pre>{JSON.stringify(redact(op.data),null,2)}</pre>{op.problem&&<p>{op.problem}</p>}{index===0&&op.blocked&&<button onClick={()=>run(async()=>{if(window.confirm('Review the online data on another device before continuing. Apply this saved change against the latest shared data? This may overwrite newer values.'))await resolvePending();})}>I reviewed the conflict — retry this change</button>}</details>)}
   <p>Confirmed operations retained in local backup: {state?.archive.length||0}.</p>
  </dialog>
 </>;
}
