const fs = require('node:fs');
const path = require('node:path');
const db = require('./database');

async function migrate(connection = db) {
  if (process.env.DATABASE_URL) throw new Error('This is a legacy MySQL migration. Supabase uses scripts/migrate-supabase.js and config/supabase-schema.sql.');
  const statements = fs.readFileSync(path.join(__dirname, 'scheduling-payroll.sql'), 'utf8').split(';').map(s => s.trim()).filter(Boolean);
  for (const statement of statements) await connection.query(statement);
  const [recurringColumns] = await connection.query('SHOW COLUMNS FROM recurring_shifts');
  if (!recurringColumns.some(c => c.Field === 'weekdays')) await connection.query('ALTER TABLE recurring_shifts ADD COLUMN weekdays JSON NULL');
  if (recurringColumns.some(c => c.Field === 'month_days' && c.Null === 'NO')) await connection.query('ALTER TABLE recurring_shifts MODIFY COLUMN month_days JSON NULL');
  const [columns] = await connection.query('SHOW COLUMNS FROM shifts');
  if (!columns.some(c => c.Field === 'recurrence_id')) {
    await connection.query(`ALTER TABLE shifts ADD COLUMN recurrence_id INT NULL,
      ADD CONSTRAINT fk_shift_recurrence FOREIGN KEY (recurrence_id) REFERENCES recurring_shifts(recurrence_id) ON DELETE SET NULL`);
  }
  if (!columns.some(c => c.Field === 'cancelled_at')) await connection.query('ALTER TABLE shifts ADD COLUMN cancelled_at TIMESTAMP NULL');
  const [indexes] = await connection.query('SHOW INDEX FROM shifts');
  if (!indexes.some(i => i.Key_name === 'uq_shift_recurrence_date')) await connection.query('ALTER TABLE shifts ADD UNIQUE KEY uq_shift_recurrence_date (recurrence_id, shift_date)');
  // Existing rejections are included when their original order price is still available.
  await connection.query(`INSERT INTO salary_deductions (user_id, request_id, order_id, amount, deducted_at)
    SELECT r.user_id, r.request_id, JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.orderId')),
      COALESCE(o.total_amount, CAST(JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.orderAmount')) AS DECIMAL(12,2))),
      COALESCE(r.reviewed_at, r.created_at)
    FROM workflow_requests r LEFT JOIN orders_history o ON o.order_id = JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.orderId'))
    WHERE r.request_type = 'refund' AND r.status = 'rejected'
      AND (o.total_amount IS NOT NULL OR JSON_TYPE(JSON_EXTRACT(r.payload, '$.orderAmount')) IN ('INTEGER', 'DOUBLE', 'DECIMAL'))
    ORDER BY COALESCE(r.reviewed_at, r.created_at), r.request_id
    ON DUPLICATE KEY UPDATE deduction_id = deduction_id`);
}

if (require.main === module) {
  migrate().then(() => console.log('Recurring shifts and payroll migration applied.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db.end());
}
module.exports = migrate;
