import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { load, exportBackup, restoreBackup } from './storage.js';
import { prepareOffline, syncPending, resolvePending, correctPending, latestSharedData, activePending, isWaitingOnHeld, leavePendingUnsynced, resumeHeld, connectionState } from './transport.js';
import './offline.css';
function redact(value){if(Array.isArray(value))return value.map(redact);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,/password|token|evidence/i.test(key)?'[private]':redact(v)]));return value;}
function PendingChange({op,active,waiting,run}){
 const [editing,setEditing]=useState(false),[text,setText]=useState('');
 return <details><summary>{op.method.toUpperCase()} {op.url} — {op.deferred?'Left unsynced':waiting?'Waiting for a related unsynced request':op.blocked?'Needs review':'Waiting to sync'}</summary>
  <time>{new Date(op.createdAt).toLocaleString()}</time><pre>{JSON.stringify(redact(op.data),null,2)}</pre>
  {op.problem&&<p role="alert">{op.problem}</p>}
  {op.deferred&&<button onClick={()=>run(()=>resumeHeld(op.id))}>Review and retry later</button>}
  {active&&(op.blocked||op.problem)&&<>
   <button onClick={()=>run(()=>leavePendingUnsynced(op.id))}>Leave unsynced</button>
   <button onClick={()=>run(async()=>{if(window.confirm('Apply this saved change against the latest shared data? Review the current shared values first: this may overwrite newer values.'))await resolvePending();})}>Reviewed — retry this change</button>
   <button onClick={()=>{setText(JSON.stringify(op.data,null,2));setEditing(!editing);}}>Correct saved fields</button>
   {editing&&<div><p>Advanced recovery: correct the saved fields as JSON. Private fields are visible here. The original stays in your recovery backup.</p><textarea aria-label="Correct pending change JSON" value={text} onChange={e=>setText(e.target.value)}/><button onClick={()=>run(async()=>{const data=JSON.parse(text);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Enter a JSON object.');if(window.confirm('Save this corrected change and rebuild the local view from the shared data? Other pending changes will wait for review.')){await correctPending(data);setEditing(false);}})}>Save correction and retry</button></div>}
  </>}
 </details>;
}
export default function OfflineStatus(){
 const {user}=useAuth();const [state,setState]=useState(null);const [status,setStatus]=useState(connectionState);const [error,setError]=useState('');const [persisted,setPersisted]=useState(false);const dialog=useRef();
 const [shared,setShared]=useState(null),[shellReady,setShellReady]=useState(false);
 useEffect(()=>{let active=true;navigator.serviceWorker?.ready.then(()=>{if(active)setShellReady(true);}).catch(()=>{});return()=>{active=false;};},[]);
 useEffect(()=>{if(!user)return;let active=true;const update=()=>{load().then(s=>{if(active){setState(s);setStatus(connectionState);}}).catch(e=>{if(active)setError(e.message);});};update();window.addEventListener('offline-change',update);const timer=setInterval(update,5000);navigator.storage?.persisted?.().then(setPersisted);void syncPending({resumeAuth:true}).then(prepareOffline);return()=>{active=false;clearInterval(timer);window.removeEventListener('offline-change',update);};},[user]);
 if(!user)return null;
 const run=async fn=>{try{setError('');await fn();}catch(e){setError(e.message);}};
 return <>
  <button className={`offline-indicator ${state?.queue.length?'has-pending':''}`} title={`${state?.queue.length||0} pending changes · ${status} · ${state?.prepared?'Offline data ready':'Prepare offline data'}`} aria-label={`Open sync: ${state?.queue.length||0} pending changes, ${status}`} onClick={()=>dialog.current.showModal()}>Sync<small>{state?.queue.length||(!state?.prepared?'Setup':status==='online'?'✓':'!')}</small></button>
  <dialog ref={dialog} className="offline-dialog">
   <header><h2>Offline data & sync</h2><button onClick={()=>dialog.current.close()} aria-label="Close sync panel">✕</button></header>
   <p><strong>{status} · {state?.queue.length||0} pending changes</strong></p>
   <p>{state?.prepared?'This account’s downloaded data is saved on this device.':'Connect and prepare this device before using it offline.'}</p>
   <p>{shellReady?'App files are saved for reopening offline.':'App files are not ready for offline reopening yet. Keep this page open and connected.'}</p>
   <p>Pending changes are stored before an action succeeds. They stay here until the server confirms them. Other devices cannot see them until synced.</p>
   <p>Last synchronization: {state?.lastSync?new Date(state.lastSync).toLocaleString():'Not prepared'}</p>
   <p>{persisted?'Persistent browser storage granted.':'Persistent storage is not granted. Keep an exported backup.'} Clearing browser/site data or losing this device can erase unsynced work.</p>
   <p>Offline figures are provisional. Approvals, payroll calculations and stock validation are finalized on sync. Keep the app open when reconnecting.</p>
   {(error||state?.error)&&<p role="alert" className="offline-error">{error||state.error}</p>}
   <div className="offline-actions">
    <button onClick={()=>run(async()=>{setPersisted(await navigator.storage?.persist?.()||false);await prepareOffline();})}>Prepare / refresh offline data</button>
    <button onClick={()=>run(syncPending)}>Sync now</button>
    {state&&activePending(state)?.blocked&&<button onClick={()=>run(async()=>setShared(await latestSharedData()))}>View latest shared data</button>}
    <button onClick={()=>run(exportBackup)}>Export backup</button>
    <label>Restore backup<input type="file" accept="application/json,.json" onChange={e=>{if(e.target.files[0])void run(()=>restoreBackup(e.target.files[0]));e.target.value='';}} /></label>
   </div>
   <p>Backups contain business and pending account data. Store them privately. Restoring merges no changes: it requires an empty pending queue and the same account.</p>
   {status==='sign-in required'&&<a href="/POS/login">Sign in again to synchronize (pending changes are kept)</a>}
   <p>Leave unsynced keeps a failed request on this device and in backups. Unrelated requests can continue syncing. Related sales, stock, and table changes wait together to protect your data. Local figures still include unsynced changes.</p>
   <h3>Pending changes ({state?.queue.length||0})</h3>
   {shared&&<details open><summary>Latest shared data (pending changes are still saved separately)</summary><pre>{JSON.stringify(redact(shared),null,2)}</pre></details>}
   {(state?.queue||[]).map((op)=><PendingChange key={op.id} op={op} active={activePending(state)?.id===op.id} waiting={isWaitingOnHeld(state,op)} run={run}/>)}
   <p>Confirmed operations retained in local backup: {state?.archive.length||0}.</p>
   {!!state?.recovery?.length&&<details><summary>Original versions of corrected changes ({state.recovery.length})</summary><pre>{JSON.stringify(redact(state.recovery),null,2)}</pre></details>}
  </dialog>
 </>;
}
