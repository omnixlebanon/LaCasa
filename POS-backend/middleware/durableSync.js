const crypto = require('node:crypto');
const db = require('../config/database');
const { context, transactionContext } = require('../config/transactionContext');
// One transactional revision protects concurrent devices, including older online clients.
module.exports = async function durableSync(req, res, next) {
 if (req.path.endsWith('/evidence') || !['GET','POST','PUT','PATCH','DELETE'].includes(req.method)) return next();
 const operation = req.get('X-Operation-Id');
 const createdAt=operation&&req.get('X-Offline-Created-At');
 if(createdAt){if(!Number.isFinite(Date.parse(createdAt))||Date.parse(createdAt)>Date.now()+300000)return res.status(400).json({error:'Invalid device time. Correct the device clock before syncing.'});req.offlineDate=new Intl.DateTimeFormat('sv-SE',{timeZone:process.env.APP_TIMEZONE||'Asia/Beirut',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(createdAt));}
 if(req.get('X-Offline-Account-Id') && req.get('X-Offline-Account-Id')!==String(req.user?.user_id))return res.status(401).json({error:'Sign in to the account that owns these pending changes.'});
 if (operation && !/^[a-f0-9-]{36}$/i.test(operation)) return res.status(400).json({error:'Invalid operation ID.'});
 let raw;
 const send = res.json.bind(res);
 try {
  raw = await db.getConnection(); await raw.beginTransaction();
  const [[state]] = await raw.query('SELECT revision FROM offline_sync_state WHERE id = 1 FOR UPDATE');
  let revision = Number(state.revision);
  const owner = String(req.user?.user_id || 'bot');
  if(req.user) {
   const [[account]] = await raw.query('SELECT user_id, access_level FROM users WHERE user_id = ?', [req.user.user_id]);
   if(!account) {await raw.rollback();raw.release();return res.status(401).json({error:'Account no longer exists. Pending changes remain on this device.'});}
   req.user.access_level=account.access_level;
   if (account.access_level === 'payroll_only') { await raw.rollback(); raw.release(); raw=null; return res.status(403).json({error:'This employee has no POS access.'}); }
  }
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify([req.method,req.originalUrl,req.body||{}])).digest('hex');
  if(operation) {
   const [[saved]]=await raw.query('SELECT * FROM offline_sync_operations WHERE operation_id = ?', [operation]);
   if(saved) {
    await raw.rollback();raw.release();raw=null;
    if(saved.owner_id!==owner||saved.fingerprint!==fingerprint)return res.status(409).json({error:'Operation ID was already used for different data.'});
    const receipt=typeof saved.response_body==='string'?JSON.parse(saved.response_body):saved.response_body;
    res.set('X-Sync-Revision',String(receipt.revision));
    return res.status(saved.response_status).json(receipt.body);
   }
   const expected=req.get('X-Base-Revision');
   if(expected===undefined||Number(expected)!==revision) {
    await raw.rollback();raw.release();raw=null;
    res.set('X-Sync-Revision',String(revision));
    return res.status(409).json({code:'SYNC_CONFLICT',error:'Another device changed the shared data. Review before applying your pending changes.',revision});
   }
  }
  const scope=transactionContext(raw);
  let finished=false;
  res.json = body => {
   if(finished)return res;finished=true;
   (async()=>{
    try {
     if(res.statusCode>=400||scope.failed) { await raw.rollback(); if(scope.failed&&res.statusCode<400){res.statusCode=500;body={error:'Transaction was rolled back.'};} }
     else {
      if(scope.dirty){revision++;await raw.query('UPDATE offline_sync_state SET revision = ? WHERE id = 1',[revision]);}
      if(operation)await raw.query('INSERT INTO offline_sync_operations (operation_id,owner_id,fingerprint,response_status,response_body) VALUES (?,?,?,?,?)',[operation,owner,fingerprint,res.statusCode,JSON.stringify({body,revision})]);
      await raw.commit();
     }
     res.set('X-Sync-Revision',String(revision));res.set('Cache-Control','no-store');send(body);
    } catch(error){await raw.rollback().catch(()=>{});if(!res.headersSent){res.statusCode=503;send({error:'Sync could not be confirmed. Keep your pending changes and retry.'});}}
    finally{raw.release();}
   })();return res;
  };
  // Finish the transaction even if the caller disconnects. Retrying its operation
  // ID then returns the committed receipt without performing the write again.
  context.run(scope,next);
 }catch(error){if(raw){await raw.rollback().catch(()=>{});raw.release();}console.error('Offline sync:',error.message);const missing=['42P01','ER_NO_SUCH_TABLE'].includes(error.code);res.status(503);send({code:missing?'SYNC_SCHEMA_MISSING':'SYNC_UNAVAILABLE',error:missing?'Offline database setup is incomplete. Run the offline migration on the backend database.':'The database is temporarily unavailable. Please retry; pending local changes are preserved.'});}
};
