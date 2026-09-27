const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();
function contextualDatabase(pool) {
 return new Proxy(pool, { get(target, key) {
  const current = context.getStore();
  if (current && key === 'getConnection') return async () => current.connection;
  if (current && ['query','execute'].includes(key)) return current.connection[key];
  const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
 }});
}
function transactionContext(raw) {
 const state = { failed: false, dirty: false };
 async function query(sql, values) { const result = await raw.query(sql, values); if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql) && result[0]?.affectedRows) state.dirty = true; return result; }
 state.connection = { query, execute: query, beginTransaction: async()=>{}, commit: async()=>{}, rollback: async()=>{state.failed=true;}, release:()=>{} };
 return state;
}
module.exports = { context, contextualDatabase, transactionContext };
