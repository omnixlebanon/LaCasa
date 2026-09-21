const sql = require('../config/dialect');
const express = require('express');
const db = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { getPayroll } = require('../services/payrollService');
const { salaryMonth, salaryAmount } = require('../services/payrollRules');

const router = express.Router();

router.get('/employees/payroll', requireAdmin, async (req, res) => {
  try { res.json(await getPayroll(req.query.month)); }
  catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

router.put('/employees/:id/salary', requireAdmin, async (req, res) => {
  let connection;
  try {
    const { start } = salaryMonth(req.body?.month);
    const amount = salaryAmount(req.body?.amount);
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [[employee]] = await connection.execute('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [req.params.id]);
    if (!employee) throw Object.assign(new Error('Employee not found.'), { status: 404 });
    await connection.execute(`INSERT INTO employee_salary_rates (user_id, effective_month, monthly_salary, updated_by) VALUES (?, ?, ?, ?)
      ${sql(`ON DUPLICATE KEY UPDATE monthly_salary = VALUES(monthly_salary), updated_by = VALUES(updated_by)`, `ON CONFLICT (user_id, effective_month) DO UPDATE SET monthly_salary = EXCLUDED.monthly_salary, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`)}`, [employee.user_id, start, amount, req.user.user_id]);
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(error.status || 500).json({ error: error.message });
  } finally { connection?.release(); }
});

router.put('/employees/:id/payroll-payment', requireAdmin, async (req, res) => {
  let connection;
  try {
    const { start } = salaryMonth(req.body?.month);
    const status = req.body?.status;
    if (!['paid', 'unpaid'].includes(status)) throw Object.assign(new Error('Choose paid or unpaid.'), { status: 400 });
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [[employee]] = await connection.execute('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [req.params.id]);
    if (!employee) throw Object.assign(new Error('Employee not found.'), { status: 404 });
    const [payroll] = await getPayroll(req.body.month, employee.user_id, connection);
    if (status === 'paid' && (payroll.baseSalary === null || payroll.unpricedRefunds.length)) {
      throw Object.assign(new Error('Set a salary and resolve any refunds with missing order amounts before marking paid.'), { status: 409 });
    }
    // A stale screen must not mark a different amount paid after another manager reviews a refund.
    if (status === 'paid' && Number(req.body.expectedAmount) !== payroll.payableAmount) {
      throw Object.assign(new Error('The salary amount changed. Refresh the salary details before marking paid.'), { status: 409 });
    }
    if ((status === 'paid' && payroll.paymentStatus === 'paid') || (status === 'unpaid' && payroll.paymentStatus === 'unpaid')) {
      await connection.commit(); return res.json({ success: true });
    }
    const amount = status === 'paid' ? payroll.payableAmount : 0;
    await connection.execute(`INSERT INTO employee_payroll_payments (user_id, salary_month, status, amount_paid, paid_at, paid_by)
      VALUES (?, ?, ?, ?, ${sql(`IF(? = 'paid', CURRENT_TIMESTAMP, NULL)`, `CASE WHEN ? = 'paid' THEN CURRENT_TIMESTAMP ELSE NULL END`)}, ?)
      ${sql(`ON DUPLICATE KEY UPDATE status = VALUES(status), amount_paid = VALUES(amount_paid), paid_at = VALUES(paid_at), paid_by = VALUES(paid_by)`, `ON CONFLICT (user_id, salary_month) DO UPDATE SET status = EXCLUDED.status, amount_paid = EXCLUDED.amount_paid, paid_at = EXCLUDED.paid_at, paid_by = EXCLUDED.paid_by`)}`,
    [employee.user_id, start, status, amount, status, req.user.user_id]);
    await connection.execute('INSERT INTO payroll_payment_events (user_id, salary_month, status, amount, recorded_by) VALUES (?, ?, ?, ?, ?)',
      [employee.user_id, start, status, amount, req.user.user_id]);
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(error.status || 500).json({ error: error.message });
  } finally { connection?.release(); }
});

module.exports = router;
