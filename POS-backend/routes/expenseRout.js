const express = require('express');
const db = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { expenseInput, expenseMonth, expenseId } = require('../services/expenseRules');
const { validDate, recurrenceInput, expandExpenses } = require('../services/expenseRecurrence');
const router = express.Router();
router.use(requireAdmin);
function fail(res, error) {
  if (!error.status) console.error('Expense request failed:', error);
  const missing = ['42P01', 'ER_NO_SUCH_TABLE'].includes(error.code);
  res.status(error.status || 500).json({ error: error.status ? error.message : missing ? 'Expenses are not set up yet. Run the expenses database migration.' : 'Could not process expenses. Please try again.' });
}
router.get('/expenses', async (req, res) => {
  try {
    let start, through;
    if (req.query.month) {
      const range = expenseMonth(req.query.month); start = range.start;
      through = new Date(new Date(range.end + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
    } else { start = req.query.from ? validDate(req.query.from) : '2000-01-01'; through = validDate(req.query.through); }
    if (start > through) throw Object.assign(new Error('Invalid expense range.'), { status: 400 });
    const [rows] = await db.execute(`SELECT e.expense_id, e.category, e.description, e.amount, e.expense_date, r.frequency, r.repeat_until, r.stopped_before FROM business_expenses e LEFT JOIN expense_recurrences r ON r.expense_id = e.expense_id WHERE e.expense_date <= ? AND (e.expense_date >= ? OR r.expense_id IS NOT NULL)`, [through, start]);
    res.json(expandExpenses(rows, start, through));
  } catch (error) { fail(res, error); }
});
router.post('/expenses', async (req, res) => {
  let connection;
  try {
    const data = expenseInput(req.body), recurrence = recurrenceInput(req.body);
    connection = await db.getConnection(); await connection.beginTransaction();
    const [result] = await connection.execute('INSERT INTO business_expenses (category, description, amount, expense_date, recorded_by) VALUES (?, ?, ?, ?, ?)', [data.category, data.description, data.amount, data.date, req.user.user_id]);
    if (recurrence.frequency !== 'none') await connection.execute('INSERT INTO expense_recurrences (expense_id, frequency, repeat_until) VALUES (?, ?, ?)', [result.insertId, recurrence.frequency, recurrence.until]);
    await connection.commit(); res.status(201).json({ id: result.insertId });
  } catch (error) { if (connection) await connection.rollback(); fail(res, error); }
  finally { connection?.release(); }
});
router.patch('/expenses/:id/stop', async (req, res) => {
  try {
    const id = expenseId(req.params.id), from = validDate(req.body?.from);
    const [[today]] = await db.query('SELECT CURRENT_DATE AS today');
    if (from < today.today) throw Object.assign(new Error('Choose today or a future date to preserve past bills.'), { status: 400 });
    const [result] = await db.execute('UPDATE expense_recurrences SET stopped_before = ? WHERE expense_id = ? AND stopped_before IS NULL', [from, id]);
    if (!result.affectedRows) return res.status(409).json({ error: 'This schedule was already stopped or does not exist.' });
    res.json({ success: true });
  } catch (error) { fail(res, error); }
});
async function requireOneTime(id) {
  const [rows] = await db.execute('SELECT expense_id FROM expense_recurrences WHERE expense_id = ?', [id]);
  if (rows.length) throw Object.assign(new Error('Repeating bills cannot be edited or deleted. Stop future repeats and create a new bill to preserve history.'), { status: 409 });
}
router.patch('/expenses/:id', async (req, res) => {
  try {
    const id = expenseId(req.params.id), data = expenseInput(req.body);
    await requireOneTime(id);
    const [result] = await db.execute('UPDATE business_expenses SET category = ?, description = ?, amount = ?, expense_date = ? WHERE expense_id = ?', [data.category, data.description, data.amount, data.date, id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Expense not found.' });
    res.json({ success: true });
  } catch (error) { fail(res, error); }
});
router.delete('/expenses/:id', async (req, res) => {
  try {
    await requireOneTime(expenseId(req.params.id));
    const [result] = await db.execute('DELETE FROM business_expenses WHERE expense_id = ?', [expenseId(req.params.id)]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Expense not found.' });
    res.json({ success: true });
  } catch (error) { fail(res, error); }
});
module.exports = router;
