const sql = require('../config/dialect');
const db = require('../config/database');
const { dateRange, recurringOccurrences } = require('./schedulingRules');

async function databaseToday(connection = db) {
  const [[row]] = await connection.query('SELECT CURRENT_DATE AS today');
  return row.today;
}

async function listShifts(from, to, userId = null) {
  dateRange(from, to);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    // Lock the rules while expanding them so stopping a series cannot race a calendar request.
    const [rules] = await connection.execute(`SELECT * FROM recurring_shifts
      WHERE starts_on <= ? AND (stopped_from IS NULL OR stopped_from > ?)
      ${userId === null ? '' : 'AND user_id = ?'} ORDER BY recurrence_id FOR UPDATE`,
    userId === null ? [to, from] : [to, from, userId]);
    for (const rule of rules) {
      for (const date of recurringOccurrences(rule, from, to)) {
        // Cancelled occurrences keep this unique key and are never regenerated.
        await connection.execute(`INSERT INTO shifts (user_id, shift_date, start_time, end_time, notes, recurrence_id)
          VALUES (?, ?, ?, ?, ?, ?) ${sql(`ON DUPLICATE KEY UPDATE shift_id = shift_id`, `ON CONFLICT (recurrence_id, shift_date) DO NOTHING`)}`,
        [rule.user_id, date, rule.start_time, rule.end_time, rule.notes, rule.recurrence_id]);
      }
    }
    const [rows] = await connection.execute(`SELECT s.shift_id, s.user_id, s.shift_date, s.start_time, s.end_time, s.notes,
      s.recurrence_id, r.weekdays, r.month_days, r.starts_on, r.stopped_from, u.user_name, u.user_position
      FROM shifts s JOIN users u ON u.user_id = s.user_id
      LEFT JOIN recurring_shifts r ON r.recurrence_id = s.recurrence_id
      WHERE s.shift_date BETWEEN ? AND ? AND s.cancelled_at IS NULL
      ${userId === null ? '' : 'AND s.user_id = ?'} ORDER BY s.shift_date, s.start_time, s.shift_id`,
    userId === null ? [from, to] : [from, to, userId]);
    await connection.commit();
    return rows;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

module.exports = { databaseToday, listShifts };
