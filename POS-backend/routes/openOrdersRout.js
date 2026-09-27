const express = require('express');
const db = require('../config/database');
const sql = require('../config/dialect');
const router = express.Router();

async function saveOpenOrder(order, userId, connection = db) {
  const key = order?.checkoutOperationId;
  if (!/^[a-f0-9-]{36}$/i.test(key || '') || !Array.isArray(order.items)) throw Object.assign(new Error('Invalid open order.'), { status: 400 });
  const [[completed]] = await connection.query('SELECT order_key FROM offline_completed_orders WHERE order_key = ?', [key]);
  if (completed) throw Object.assign(new Error('This order was already completed on another device. Its local edits are preserved for review.'), { status: 409 });
  const data = JSON.stringify({ ...order, id: key });
  await connection.query(`INSERT INTO offline_open_orders (order_key, order_data, user_id) VALUES (?, ?, ?)
    ${sql('ON DUPLICATE KEY UPDATE order_data = VALUES(order_data), user_id = VALUES(user_id)', 'ON CONFLICT (order_key) DO UPDATE SET order_data = EXCLUDED.order_data, user_id = EXCLUDED.user_id')}`, [key, data, userId]);
}
router.get('/open-orders', async (req, res, next) => {
  try { const [rows] = await db.query('SELECT order_data FROM offline_open_orders'); res.json(rows.map(row => JSON.parse(row.order_data))); }
  catch (error) { next(error); }
});
router.put('/open-orders/:key', async (req, res) => {
  try {
    if (req.body?.order?.checkoutOperationId !== req.params.key) return res.status(400).json({ error: 'Open order identity cannot change.' });
    await saveOpenOrder(req.body.order, req.user.user_id); res.json({ success: true });
  } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});
router.delete('/open-orders/:key', async (req, res, next) => {
  try { await db.query('DELETE FROM offline_open_orders WHERE order_key = ?', [req.params.key]); res.json({ success: true }); }
  catch (error) { next(error); }
});
module.exports = { router, saveOpenOrder };
