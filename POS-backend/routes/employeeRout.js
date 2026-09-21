const sql = require('../config/dialect');
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { databaseToday, listShifts } = require('../services/schedulingService');
const { shiftInput, weekdays, validDate, badRequest } = require('../services/schedulingRules');

const router = express.Router();
const accessLevels = new Set(['admin', 'employee']);

router.get('/employees', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT user_id, user_name, user_email, user_position, access_level, telegram_id, created_at
      FROM users ORDER BY user_name
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/employees', requireAdmin, async (req, res) => {
  const { name, email, password, position, accessLevel = 'employee', telegramId = null } = req.body;
  if (![name, email, password, position].every(value => typeof value === 'string' && value.trim())) {
    return res.status(400).json({ error: 'Name, email, password, and position are required.' });
  }
  if (!accessLevels.has(accessLevel)) return res.status(400).json({ error: 'Invalid access level.' });
  const normalizedTelegramId = telegramId === null || telegramId === '' ? null : String(telegramId).trim();
  if (normalizedTelegramId && !/^\d+$/.test(normalizedTelegramId)) return res.status(400).json({ error: 'Telegram ID must contain digits only.' });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await db.execute(
      `INSERT INTO users (user_name, user_email, user_password_hash, user_position, access_level, telegram_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name.trim(), email.trim().toLowerCase(), passwordHash, position.trim(), accessLevel, normalizedTelegramId]
    );
    res.status(201).json({ user_id: result.insertId });
  } catch (error) {
    res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ error: error.code === 'ER_DUP_ENTRY' ? 'Name or email already exists.' : error.message });
  }
});

router.patch('/employees/:id', requireAdmin, async (req, res) => {
  const { name, email, password, position, accessLevel, telegramId } = req.body;
  if (accessLevel && !accessLevels.has(accessLevel)) return res.status(400).json({ error: 'Invalid access level.' });
  try {
    const fields = [];
    const values = [];
    for (const [column, value] of [['user_name', name], ['user_email', email], ['user_position', position], ['access_level', accessLevel]]) {
      if (typeof value === 'string' && value.trim()) {
        fields.push(`${column} = ?`);
        values.push(column === 'user_email' ? value.trim().toLowerCase() : value.trim());
      }
    }
    if (telegramId !== undefined) {
      const normalizedTelegramId = telegramId === null || telegramId === '' ? null : String(telegramId).trim();
      if (normalizedTelegramId && !/^\d+$/.test(normalizedTelegramId)) return res.status(400).json({ error: 'Telegram ID must contain digits only.' });
      fields.push('telegram_id = ?');
      values.push(normalizedTelegramId);
    }
    if (password) {
      fields.push('user_password_hash = ?');
      values.push(await bcrypt.hash(password, 12));
    }
    if (!fields.length) return res.status(400).json({ error: 'No changes supplied.' });
    values.push(req.params.id);
    const [result] = await db.execute(`UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`, values);
    if (!result.affectedRows) return res.status(404).json({ error: 'Employee not found.' });
    res.json({ success: true });
  } catch (error) {
    res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ error: error.code === 'ER_DUP_ENTRY' ? 'Name or email already exists.' : error.message });
  }
});

router.delete('/employees/:id', requireAdmin, async (req, res) => {
  if (Number(req.params.id) === Number(req.user.user_id)) return res.status(400).json({ error: 'You cannot delete your own account.' });
  try {
    const [result] = await db.execute('DELETE FROM users WHERE user_id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Employee not found.' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/shifts', async (req, res) => {
  try {
    const today = await databaseToday();
    const from = req.query.from || `${today.slice(0, 7)}-01`;
    const to = req.query.to || new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
    res.json(await listShifts(from, to, req.user.access_level === 'admin' ? null : req.user.user_id));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/shifts', requireAdmin, async (req, res) => {
  try {
    const { userId, date, startTime, endTime, notes } = shiftInput(req.body);
    const [result] = await db.execute(
      'INSERT INTO shifts (user_id, shift_date, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?)',
      [userId, date, startTime, endTime, notes]
    );
    res.status(201).json({ shift_id: result.insertId });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.patch('/shifts/:id', requireAdmin, async (req, res) => {
  let connection;
  try {
    const input = shiftInput(req.body);
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [[shift]] = await connection.execute('SELECT shift_id, recurrence_id, shift_date FROM shifts WHERE shift_id = ? AND cancelled_at IS NULL FOR UPDATE', [req.params.id]);
    if (!shift) throw Object.assign(new Error('Shift not found.'), { status: 404 });
    const [[checkin]] = await connection.execute(`SELECT request_id FROM workflow_requests WHERE request_type = 'shift_checkin'
      AND status IN ('pending', 'approved') AND ${sql(`JSON_UNQUOTE(JSON_EXTRACT(payload, '$.shiftId'))`, `(payload ->> 'shiftId')`)} = ? LIMIT 1`, [String(shift.shift_id)]);
    if (checkin) throw Object.assign(new Error('A shift with a pending or approved check-in cannot be edited.'), { status: 409 });
    let shiftId = shift.shift_id;
    if (shift.recurrence_id && input.date !== String(shift.shift_date).slice(0, 10)) {
      // Keep the original occurrence as cancelled so calendar expansion cannot recreate it.
      await connection.execute('UPDATE shifts SET cancelled_at = CURRENT_TIMESTAMP WHERE shift_id = ?', [shiftId]);
      const [result] = await connection.execute('INSERT INTO shifts (user_id, shift_date, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?)',
        [input.userId, input.date, input.startTime, input.endTime, input.notes]);
      shiftId = result.insertId;
    } else {
      await connection.execute('UPDATE shifts SET user_id = ?, shift_date = ?, start_time = ?, end_time = ?, notes = ? WHERE shift_id = ?',
        [input.userId, input.date, input.startTime, input.endTime, input.notes, shiftId]);
    }
    await connection.commit();
    res.json({ success: true, shift_id: shiftId });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(error.status || 500).json({ error: error.message });
  } finally { connection?.release(); }
});

router.delete('/shifts/:id', requireAdmin, async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [[shift]] = await connection.execute('SELECT shift_id FROM shifts WHERE shift_id = ? AND cancelled_at IS NULL FOR UPDATE', [req.params.id]);
    if (!shift) throw Object.assign(new Error('Shift not found.'), { status: 404 });
    const [[checkin]] = await connection.execute(`SELECT request_id FROM workflow_requests WHERE request_type = 'shift_checkin'
      AND status IN ('pending', 'approved') AND ${sql(`JSON_UNQUOTE(JSON_EXTRACT(payload, '$.shiftId'))`, `(payload ->> 'shiftId')`)} = ? LIMIT 1`, [String(shift.shift_id)]);
    if (checkin) throw Object.assign(new Error('A shift with a pending or approved check-in cannot be removed.'), { status: 409 });
    await connection.execute('UPDATE shifts SET cancelled_at = CURRENT_TIMESTAMP WHERE shift_id = ?', [shift.shift_id]);
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(error.status || 500).json({ error: error.message });
  } finally { connection?.release(); }
});

router.post('/recurring-shifts', requireAdmin, async (req, res) => {
  try {
    const shift = shiftInput(req.body);
    const days = weekdays(req.body.weekdays);
    const [result] = await db.execute(`INSERT INTO recurring_shifts (user_id, starts_on, weekdays, start_time, end_time, notes)
      VALUES (?, ?, ?, ?, ?, ?)`, [shift.userId, shift.date, JSON.stringify(days), shift.startTime, shift.endTime, shift.notes]);
    res.status(201).json({ recurrence_id: result.insertId });
  } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

router.get('/recurring-shifts', async (req, res) => {
  try {
    const isAdmin = req.user.access_level === 'admin';
    const [rows] = await db.execute(`SELECT r.*, u.user_name FROM recurring_shifts r JOIN users u ON u.user_id = r.user_id
      WHERE (r.stopped_from IS NULL OR r.stopped_from > CURRENT_DATE) ${isAdmin ? '' : 'AND r.user_id = ?'} ORDER BY u.user_name, r.start_time`, isAdmin ? [] : [req.user.user_id]);
    res.json(rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.patch('/recurring-shifts/:id/stop', requireAdmin, async (req, res) => {
  let connection;
  try {
    const from = req.body?.from;
    if (!validDate(from) || from < await databaseToday()) throw badRequest('Stop date must be today or later.');
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [[rule]] = await connection.execute('SELECT * FROM recurring_shifts WHERE recurrence_id = ? FOR UPDATE', [req.params.id]);
    if (!rule) throw Object.assign(new Error('Repeating schedule not found.'), { status: 404 });
    const stopDate = rule.stopped_from && rule.stopped_from < from ? rule.stopped_from : from;
    await connection.execute('UPDATE recurring_shifts SET stopped_from = ? WHERE recurrence_id = ?', [stopDate, rule.recurrence_id]);
    await connection.execute(`UPDATE shifts s SET cancelled_at = CURRENT_TIMESTAMP WHERE recurrence_id = ? AND shift_date >= ? AND cancelled_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM workflow_requests r WHERE r.request_type = 'shift_checkin' AND r.status IN ('pending', 'approved')
        AND ${sql(`JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.shiftId'))`, `(r.payload ->> 'shiftId')`)} = ${sql(`CAST(s.shift_id AS CHAR)`, `CAST(s.shift_id AS TEXT)`)})`, [rule.recurrence_id, stopDate]);
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(error.status || 500).json({ error: error.message });
  } finally { connection?.release(); }
});

module.exports = router;
