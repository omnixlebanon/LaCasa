const express = require('express');
const db = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { expenseInput, expenseMonth, expenseId } = require('../services/expenseRules');
const router = express.Router();
router.use(requireAdmin);
function fail(res, error) {
  if (!error.status) console.error('Expense request failed:', error);
  const missing = ['42P01', 'ER_NO_SUCH_TABLE'].includes(error.code);
  res.status(error.status || 500).json({ error: error.status ? error.message : missing ? 'Expenses are not set up yet. Run the expenses database migration.' : 'Could not process expenses. Please try again.' });
}
router.get('/expenses', async (req, res) => {
  try {
    const { start, end } = expenseMonth(req.query.month);
    const [rows] = await db.execute('SELECT expense_id, category, description, amount, expense_date FROM business_expenses WHERE expense_date >= ? AND expense_date < ? ORDER BY expense_date DESC, expense_id DESC', [start, end]);
    res.json(rows);
  } catch (error) { fail(res, error); }
});
router.post('/expenses', async (req, res) => {
  try {
    const data = expenseInput(req.body);
    const [result] = await db.execute('INSERT INTO business_expenses (category, description, amount, expense_date, recorded_by) VALUES (?, ?, ?, ?, ?)', [data.category, data.description, data.amount, data.date, req.user.user_id]);
    res.status(201).json({ id: result.insertId });
  } catch (error) { fail(res, error); }
});
router.patch('/expenses/:id', async (req, res) => {
  try {
    const id = expenseId(req.params.id), data = expenseInput(req.body);
    const [result] = await db.execute('UPDATE business_expenses SET category = ?, description = ?, amount = ?, expense_date = ? WHERE expense_id = ?', [data.category, data.description, data.amount, data.date, id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Expense not found.' });
    res.json({ success: true });
  } catch (error) { fail(res, error); }
});
router.delete('/expenses/:id', async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM business_expenses WHERE expense_id = ?', [expenseId(req.params.id)]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Expense not found.' });
    res.json({ success: true });
  } catch (error) { fail(res, error); }
});
module.exports = router;
