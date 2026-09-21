const sql = require('../config/dialect');
const express = require('express');
const db = require('../config/database');
const { requireManager } = require('../middleware/auth');
const { databaseToday, listShifts } = require('../services/schedulingService');
const { recordRefundDeduction } = require('../services/payrollService');
const { sendEvidence } = require('../services/evidenceService');

const botRouter = express.Router();
const managementRouter = express.Router();

botRouter.use((req, res, next) => {
  const botSecret = process.env.BOT_API_SECRET || process.env.BOT_TOKEN;
  if (!botSecret || req.get('x-bot-secret') !== botSecret) {
    return res.status(401).json({ error: 'Invalid bot credentials.' });
  }
  next();
});

async function findTelegramUser(telegramId) {
  const [rows] = await db.execute(
    'SELECT user_id, user_name, user_position, access_level FROM users WHERE TRIM(telegram_id) = ? LIMIT 1',
    [String(telegramId).trim()]
  );
  return rows[0];
}

botRouter.get('/employee/:telegramId', async (req, res) => {
  try {
    const user = await findTelegramUser(req.params.telegramId);
    if (!user) return res.status(404).json({ error: 'Telegram account is not linked to an employee.' });
    res.json(user);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

botRouter.get('/shifts/:telegramId', async (req, res) => {
  try {
    const user = await findTelegramUser(req.params.telegramId);
    if (!user) return res.status(404).json({ error: 'Telegram account is not linked.' });
    const today = await databaseToday();
    const weekEnd = new Date(`${today}T00:00:00Z`);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + (7 - weekEnd.getUTCDay()) % 7);
    const shifts = await listShifts(today, weekEnd.toISOString().slice(0, 10), user.user_id);
    res.json({ user, shifts, today });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

botRouter.post('/requests', async (req, res) => {
  const { telegramId, type, payload } = req.body || {};
  if (!['shift_checkin', 'stock_receipt', 'stock_usage'].includes(type)) return res.status(400).json({ error: 'Invalid request type.' });
  let connection;
  try {
    const user = await findTelegramUser(telegramId);
    if (!user) return res.status(404).json({ error: 'Telegram account is not linked.' });
    if (type === 'shift_checkin') {
      if (!Number.isSafeInteger(Number(payload?.shiftId)) || Number(payload.shiftId) <= 0) {
        return res.status(400).json({ error: 'Choose a scheduled shift for today with /checkin SHIFT_ID.' });
      }
      connection = await db.getConnection();
      await connection.beginTransaction();
      const [[shift]] = await connection.execute(`SELECT shift_id, shift_date, start_time, end_time,
        ${sql(`TIMESTAMP(shift_date, start_time)`, `(shift_date + start_time)`)} AS scheduled_start,
        GREATEST(0, CEIL(${sql(`TIMESTAMPDIFF(SECOND, TIMESTAMP(shift_date, start_time), CURRENT_TIMESTAMP)`, `EXTRACT(EPOCH FROM (LOCALTIMESTAMP - (shift_date + start_time)))`)} / 60)) AS late_minutes
        FROM shifts WHERE shift_id = ? AND user_id = ? AND shift_date = CURRENT_DATE AND cancelled_at IS NULL FOR UPDATE`, [payload.shiftId, user.user_id]);
      if (!shift) throw Object.assign(new Error('This is not one of your scheduled shifts for today.'), { status: 400 });
      const [[existing]] = await connection.execute(`SELECT request_id, status FROM workflow_requests WHERE user_id = ?
        AND request_type = 'shift_checkin' AND status IN ('pending', 'approved')
        AND ${sql(`JSON_UNQUOTE(JSON_EXTRACT(payload, '$.shiftId'))`, `(payload ->> 'shiftId')`)} = ? LIMIT 1`, [user.user_id, String(shift.shift_id)]);
      if (existing) throw Object.assign(new Error(`Check-in request #${existing.request_id} is already ${existing.status} for this shift.`), { status: 409 });
      const checkinPayload = { shiftId: shift.shift_id, shiftDate: shift.shift_date, scheduledStart: shift.scheduled_start,
        startTime: shift.start_time, endTime: shift.end_time, lateMinutes: Number(shift.late_minutes) };
      const [result] = await connection.execute(`INSERT INTO workflow_requests (user_id, request_type, payload) VALUES (?, 'shift_checkin', ?)`, [user.user_id, JSON.stringify(checkinPayload)]);
      await connection.commit();
      return res.status(201).json({ requestId: result.insertId, status: 'pending', lateMinutes: checkinPayload.lateMinutes });
    }
    const [result] = await db.execute(
      'INSERT INTO workflow_requests (user_id, request_type, payload) VALUES (?, ?, ?)',
      [user.user_id, type, JSON.stringify(payload || {})]
    );
    res.status(201).json({ requestId: result.insertId, status: 'pending' });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(error.status || 500).json({ error: error.message });
  } finally { connection?.release(); }
});

botRouter.post('/refund-evidence/:requestId', async (req, res) => {
  const { telegramId, evidenceData } = req.body || {};
  if (typeof evidenceData !== 'string' || !evidenceData.startsWith('data:image/')) return res.status(400).json({ error: 'Image evidence is required.' });
  try {
    const user = await findTelegramUser(telegramId);
    if (!user) return res.status(404).json({ error: 'Telegram account is not linked.' });
    const [rows] = await db.execute(`SELECT request_id, payload FROM workflow_requests
      WHERE request_id = ? AND user_id = ? AND request_type = 'refund' AND status = 'pending' LIMIT 1`,
      [req.params.requestId, user.user_id]);
    if (!rows.length) return res.status(404).json({ error: 'Pending refund request not found for this employee.' });
    const payload = typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload;
    payload.evidenceData = evidenceData;
    payload.evidenceReceivedAt = new Date().toISOString();
    await db.execute('UPDATE workflow_requests SET payload = ? WHERE request_id = ?', [JSON.stringify(payload), req.params.requestId]);
    res.json({ success: true, requestId: rows[0].request_id });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

managementRouter.get('/management/requests', requireManager, async (req, res) => {
  try {
    const allowedTypes = new Set(['shift_checkin', 'stock_receipt', 'stock_usage', 'refund']);
    const type = req.query.type;
    if (type && !allowedTypes.has(type)) return res.status(400).json({ error: 'Invalid request type.' });
    const [rows] = await db.execute(`
      SELECT r.*, u.user_name, u.user_position, reviewer.user_name AS reviewer_name
      FROM workflow_requests r JOIN users u ON u.user_id = r.user_id
      LEFT JOIN users reviewer ON reviewer.user_id = r.reviewed_by
      ${type ? 'WHERE r.request_type = ?' : ''}
      ORDER BY ${sql(`FIELD(r.status, 'pending', 'approved', 'rejected')`, `CASE r.status WHEN 'pending' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END`)}, r.created_at DESC
    `, type ? [type] : []);
    // Load images individually so a list of receipts cannot exceed Vercel's response limit.
    res.json(rows.map(row => {
      const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : { ...row.payload };
      if (payload.evidenceData) payload.evidenceData = `/api/management/requests/${row.request_id}/evidence`;
      return { ...row, payload };
    }));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

managementRouter.get('/management/requests/:id/evidence', requireManager, async (req, res) => {
  try {
    const [[row]] = await db.execute('SELECT payload FROM workflow_requests WHERE request_id = ?', [req.params.id]);
    const payload = typeof row?.payload === 'string' ? JSON.parse(row.payload) : row?.payload;
    return sendEvidence(res, payload?.evidenceData);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

managementRouter.patch('/management/requests/:id', requireManager, async (req, res) => {
  const decision = req.body?.status;
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Invalid decision.' });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT * FROM workflow_requests WHERE request_id = ? AND status = \'pending\' FOR UPDATE', [req.params.id]);
    if (!rows.length) { await connection.rollback(); return res.status(404).json({ error: 'Pending request not found.' }); }
    const request = rows[0];
    const payload = typeof request.payload === 'string' ? JSON.parse(request.payload) : request.payload;
    if (decision === 'approved' && request.request_type === 'shift_checkin') {
      if (payload.shiftId) {
        const [[shift]] = await connection.execute('SELECT shift_id FROM shifts WHERE shift_id = ? AND user_id = ? AND cancelled_at IS NULL FOR UPDATE', [payload.shiftId, request.user_id]);
        if (!shift) throw Object.assign(new Error('The assigned shift is no longer available.'), { status: 409 });
        const [[existing]] = await connection.execute('SELECT checkin_id FROM shift_checkins WHERE shift_id = ? AND user_id = ? LIMIT 1', [payload.shiftId, request.user_id]);
        if (existing) throw Object.assign(new Error('This shift already has an approved check-in.'), { status: 409 });
      }
      await connection.execute('INSERT INTO shift_checkins (user_id, shift_id, checked_in_at, approved_by) VALUES (?, ?, ?, ?)', [request.user_id, payload.shiftId || null, request.created_at, req.user.user_id]);
    }
    if (decision === 'rejected' && request.request_type === 'refund') await recordRefundDeduction(connection, request, payload);
    if (decision === 'approved' && request.request_type === 'refund') {
      if (!payload.evidenceData?.startsWith('data:image/')) throw new Error('Refund image evidence is missing.');
      const [orders] = await connection.execute('SELECT details FROM orders_history WHERE order_id = ? FOR UPDATE', [payload.orderId]);
      if (!orders.length) throw new Error('The order no longer exists.');
      const orderDetails = typeof orders[0].details === 'string' ? JSON.parse(orders[0].details) : orders[0].details;
      for (const orderItem of orderDetails?.items || []) {
        const quantitySold = Math.max(0, Number(orderItem.qty) || 0);
        const [ingredients] = await connection.execute('SELECT item_id, qty FROM product_items WHERE product_id = ?', [orderItem.product_id]);
        for (const ingredient of ingredients) {
          const restoredQuantity = quantitySold * (Number(ingredient.qty) || 0);
          if (restoredQuantity <= 0) continue;
          await connection.execute(`INSERT INTO batches (item_id, batch_stock, batch_exDate)
            VALUES (?, ?, ${sql(`DATE_ADD(CURRENT_DATE, INTERVAL COALESCE((SELECT shelf_life FROM items WHERE item_id = ?), 0) DAY)`, `(CURRENT_DATE + COALESCE((SELECT shelf_life FROM items WHERE item_id = ?), 0))`)})`,
            [ingredient.item_id, restoredQuantity, ingredient.item_id]);
          await connection.execute(`UPDATE items SET stock = stock + ?, stockStatus = CASE
            WHEN stock + ? > safety_limit THEN 'well' ELSE 'Low' END WHERE item_id = ?`,
            [restoredQuantity, restoredQuantity, ingredient.item_id]);
        }
      }
      await connection.execute('DELETE FROM orders_history WHERE order_id = ?', [payload.orderId]);
    }
    if (decision === 'approved' && request.request_type === 'stock_receipt') {
      for (const item of payload.items || []) {
        const [matches] = await connection.execute('SELECT item_id FROM items WHERE LOWER(item_name) = LOWER(?) LIMIT 1', [item.item_name]);
        if (!matches.length) continue;
        const quantity = Math.max(0, Number(item.qty) || 0);
        await connection.execute(`INSERT INTO batches (item_id, batch_stock, batch_exDate)
          VALUES (?, ?, ${sql(`DATE_ADD(CURRENT_DATE, INTERVAL COALESCE((SELECT shelf_life FROM items WHERE item_id = ?), 0) DAY)`, `(CURRENT_DATE + COALESCE((SELECT shelf_life FROM items WHERE item_id = ?), 0))`)})`,
          [matches[0].item_id, quantity, matches[0].item_id]);
        await connection.execute(`UPDATE items SET stock = stock + ?, stockStatus = CASE
          WHEN stock + ? > safety_limit THEN 'well' ELSE 'Low' END WHERE item_id = ?`,
          [quantity, quantity, matches[0].item_id]);
      }
    }
    if (decision === 'approved' && request.request_type === 'stock_usage') {
      const ingredientName = String(payload.itemName || '').trim();
      const requestedQuantity = Number(payload.quantity);
      if (!ingredientName || !Number.isFinite(requestedQuantity) || requestedQuantity <= 0) throw new Error('Invalid stock usage request.');
      const [matches] = await connection.execute('SELECT item_id, stock FROM items WHERE LOWER(item_name) = LOWER(?) LIMIT 1 FOR UPDATE', [ingredientName]);
      if (!matches.length) throw new Error(`Ingredient "${ingredientName}" was not found.`);
      if (Number(matches[0].stock) < requestedQuantity) throw new Error(`Not enough ${ingredientName} in stock.`);
      let remaining = requestedQuantity;
      const [batches] = await connection.execute('SELECT batch_id, batch_stock FROM batches WHERE item_id = ? AND batch_stock > 0 ORDER BY batch_exDate, batch_id FOR UPDATE', [matches[0].item_id]);
      for (const batch of batches) {
        if (remaining <= 0) break;
        const deduction = Math.min(remaining, Number(batch.batch_stock));
        await connection.execute('UPDATE batches SET batch_stock = batch_stock - ? WHERE batch_id = ?', [deduction, batch.batch_id]);
        remaining -= deduction;
      }
      if (remaining > 0) throw new Error('Batch quantities do not match the available item stock.');
      await connection.execute(`UPDATE items SET stock = stock - ?, stockStatus = CASE
        WHEN stock - ? <= 0 THEN 'out of stock'
        WHEN stock - ? > safety_limit THEN 'well' ELSE 'Low' END WHERE item_id = ?`,
        [requestedQuantity, requestedQuantity, requestedQuantity, matches[0].item_id]);
    }
    await connection.execute('UPDATE workflow_requests SET status=?, reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP, review_note=? WHERE request_id=?', [decision, req.user.user_id, String(req.body?.note || ''), req.params.id]);
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback(); res.status(error.status || 500).json({ error: error.message });
  } finally { connection.release(); }
});

botRouter.get('/notifications', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT r.request_id, r.request_type, r.status, r.review_note, u.telegram_id
      FROM workflow_requests r JOIN users u ON u.user_id = r.user_id
      WHERE r.status IN ('approved', 'rejected') AND r.bot_notified_at IS NULL AND u.telegram_id IS NOT NULL
      ORDER BY r.reviewed_at LIMIT 50
    `);
    res.json(rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

botRouter.post('/notifications/:id/read', async (req, res) => {
  try {
    await db.execute('UPDATE workflow_requests SET bot_notified_at = CURRENT_TIMESTAMP WHERE request_id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = { botRouter, managementRouter };
