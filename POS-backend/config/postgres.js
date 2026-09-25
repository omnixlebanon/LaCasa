const { Pool, types } = require('pg');

// Match the existing API: date/time values are strings, safe integer IDs are numbers.
const parsers = { getTypeParser(oid, format) {
  if ([1082, 1083, 1114, 1184].includes(oid)) return value => value;
  if (oid === 20) return value => {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : value;
  };
  return types.getTypeParser(oid, format);
} };

const ids = { business_expenses: 'expense_id', users: 'user_id', floors: 'floor_id', tablez: 't_id', items: 'item_id',
  item_categories: 'i_category_id', products: 'product_id', product_categories: 'p_category_id',
  suppliers: 'id', batches: 'batch_id', product_items: 'recipe_id', orders_history: 'internal_id',
  shifts: 'shift_id', recurring_shifts: 'recurrence_id', workflow_requests: 'request_id',
  shift_checkins: 'checkin_id', salary_deductions: 'deduction_id', payroll_payment_events: 'event_id' };
const mixedCase = new Set(['exDate', 'batch_exDate', 'stockStatus', 'totalValue', 'refillCount', 'expiredCount']);

// Only adapt parameter/result conventions, not SQL dialects. Values never become SQL.
function prepare(sql, values = []) {
  const parameters = [];
  let index = 0;
  let text = sql.trim().replace(/;\s*$/, '').replace(
    /'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\?|\b[A-Za-z_][A-Za-z_0-9]*\b/g,
    token => {
      if (token === '?') {
        if (index >= values.length) throw new Error('Missing SQL parameter');
        const value = values[index++];
        const list = Array.isArray(value) ? value : [value];
        if (!list.length) throw new Error('Empty SQL parameter list');
        return list.map(entry => { parameters.push(entry); return `$${parameters.length}`; }).join(', ');
      }
      return mixedCase.has(token) ? `"${token}"` : token;
    });
  if (index !== values.length) throw new Error('Unexpected SQL parameter');
  const table = /^INSERT\s+INTO\s+(\w+)/i.exec(text)?.[1].toLowerCase();
  const id = ids[table];
  if (id && !/\bRETURNING\b/i.test(text)) text += ` RETURNING ${id}`;
  return { text, values: parameters, id };
}

function wrap(client) {
  async function query(sql, values) {
    const { text, values: parameters, id } = prepare(sql, values);
    try {
      const result = await client.query({ text, values: parameters, types: parsers });
      return /^(SELECT|WITH|SHOW)\b/i.test(text)
        ? [result.rows, result.fields]
        : [{ affectedRows: result.rowCount, insertId: id ? result.rows[0]?.[id] : undefined }, result.fields];
    } catch (error) {
      if (error.code === '23505') { error.postgresCode = error.code; error.code = 'ER_DUP_ENTRY'; }
      throw error;
    }
  }
  return { query, execute: query,
    beginTransaction: async () => {
      await client.query('BEGIN');
      await client.query("SELECT set_config('TimeZone', $1, true)", [process.env.APP_TIMEZONE || 'Asia/Beirut']);
    }, commit: () => client.query('COMMIT'),
    rollback: () => client.query('ROLLBACK'), release: () => client.release() };
}

function connectionOptions(connectionString) {
  if (!process.env.DB_SSL_CA) return { connectionString };
  const url = new URL(connectionString);
  // pg's URL SSL parameters otherwise override the explicit CA configuration.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: true, ca: process.env.DB_SSL_CA.replaceAll('\\n', '\n') } };
}

function createDatabase() {
  const pool = new Pool({ ...connectionOptions(process.env.DATABASE_URL),
    max: Number(process.env.DB_POOL_SIZE || 3), idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000, allowExitOnIdle: true, types: parsers });
  pool.on('error', error => console.error('Idle database connection failed:', error.code));
  // Transaction-local settings also work with Supabase's transaction pooler.
  async function query(sql, values) {
    const connection = wrap(await pool.connect());
    try {
      await connection.beginTransaction();
      const result = await connection.query(sql, values);
      await connection.commit();
      return result;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  return { query, execute: query, getConnection: async () => wrap(await pool.connect()), end: () => pool.end() };
}
module.exports = { createDatabase, prepare, wrap, parsers, connectionOptions };
