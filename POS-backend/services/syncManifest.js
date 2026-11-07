// Last changed revision per table. Stored and committed with the business write.
const key = 'offline_resource_revisions_v1';
async function read(connection) {
 const [[row]] = await connection.query('SELECT setting_value FROM pos_settings WHERE setting_key = ?', [key]);
 try { return row ? JSON.parse(row.setting_value) : null; } catch { return null; }
}
async function record(connection, revision, tables) {
 const previous = await read(connection);
 const manifest = previous?.revision === revision - 1 ? previous : { revision: revision - 1, baseline: revision, tables: {} };
 manifest.revision = revision;
 for (const table of tables) manifest.tables[table] = revision;
 await connection.query('DELETE FROM pos_settings WHERE setting_key = ?', [key]);
 await connection.query('INSERT INTO pos_settings (setting_key,setting_value) VALUES (?,?)', [key, JSON.stringify(manifest)]);
}
// Tracking is an optimization. A missing settings migration must never fail a sale.
async function optional(connection, action) {
 await connection.query('SAVEPOINT egress_tracking');
 try { const result=await action();await connection.query('RELEASE SAVEPOINT egress_tracking');return result; }
 catch(error) {
  await connection.query('ROLLBACK TO SAVEPOINT egress_tracking');
  await connection.query('RELEASE SAVEPOINT egress_tracking');
  console.error('Incremental sync unavailable; using full refresh:',error.code||'tracking error');
  return null;
 }
}
module.exports = { read, record, optional };
