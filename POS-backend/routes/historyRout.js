const sql = require('../config/dialect');
const express = require('express');
const processOrderCheckout =require('../services/historyService.js');
const db = require('../config/database.js')
const router = express.Router();
const { sendEvidence } = require('../services/evidenceService');

router.get('/history',async (req,res)=>{
    try {
        const [rows] = await db.execute(`SELECT * FROM orders_history`);
        res.json(rows.map(row => ({ ...row, refund_evidence: row.refund_evidence
          ? `/api/history/${encodeURIComponent(row.order_id)}/evidence` : null })));
    } catch (err) {
        res.status(500).json({error: err.message})
    }

})
router.get('/history/:orderId/evidence', async (req, res) => {
  try {
    const [[row]] = await db.execute('SELECT refund_evidence FROM orders_history WHERE order_id = ?', [req.params.orderId]);
    return sendEvidence(res, row?.refund_evidence);
  } catch (error) { res.status(500).json({ error: error.message }); }
});
router.post('/checkout', async (req, res) => {
  try {
    const { totalAmount, customerName, details } = req.body;

    if (typeof totalAmount !== 'number' || totalAmount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid order amount." });
    }
    const result = await processOrderCheckout(
        totalAmount, 
        customerName, 
        details || {}
    );

    if (result.success) {
      return res.status(201).json(result);
    } else {
      return res.status(500).json({ success: false, error: result.error || "An error occurred during checkout." });
    }

  } catch (error) {
    console.error("Unhandled Route Error:", error);
    return res.status(500).json({ success: false, error: "An unexpected server error occurred." });
  }
});
router.post('/history/:orderId/refund-request', async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'A refund reason is required.' });
  if (req.body?.confirmed !== true) return res.status(400).json({ error: 'Refund confirmation is required.' });
  try {
    const [orders] = await db.execute("SELECT order_id, total_amount FROM orders_history WHERE order_id = ? AND status <> 'refunded'", [req.params.orderId]);
    if (!orders.length) return res.status(404).json({ error: 'Order not found or already refunded.' });
    const [existing] = await db.execute(`SELECT request_id FROM workflow_requests
      WHERE user_id = ? AND request_type = 'refund' AND status = 'pending'
      AND ${sql(`JSON_UNQUOTE(JSON_EXTRACT(payload, '$.orderId'))`, `(payload ->> 'orderId')`)} = ? LIMIT 1`, [req.user.user_id, req.params.orderId]);
    if (existing.length) return res.status(409).json({ error: `Refund request #${existing[0].request_id} is already pending.` });
    const [result] = await db.execute(
      "INSERT INTO workflow_requests (user_id, request_type, payload) VALUES (?, 'refund', ?)",
      [req.user.user_id, JSON.stringify({ orderId: req.params.orderId, orderAmount: Number(orders[0].total_amount), reason, confirmed: true, evidenceData: null })]
    );
    res.status(201).json({ success: true, requestId: result.insertId });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
module.exports = router;
