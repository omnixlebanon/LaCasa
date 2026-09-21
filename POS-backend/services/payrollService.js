const db = require('../config/database');
const sql = require('../config/dialect');
const { salaryMonth, payrollTotals } = require('./payrollRules');

async function getPayroll(month, userId = null, connection = db) {
  const { start, end } = salaryMonth(month);
  const scope = userId === null ? '' : 'AND r.user_id = ?';
  const periodParams = userId === null ? [start, end] : [start, end, userId];
  const [employees] = await connection.execute(`SELECT u.user_id, u.user_name, u.user_position,
    (SELECT monthly_salary FROM employee_salary_rates sr WHERE sr.user_id = u.user_id AND sr.effective_month <= ?
      ORDER BY sr.effective_month DESC LIMIT 1) AS monthly_salary
    FROM users u ${userId === null ? '' : 'WHERE u.user_id = ?'} ORDER BY u.user_name`, userId === null ? [start] : [start, userId]);
  const [deductions] = await connection.execute(`SELECT d.user_id, d.request_id, d.order_id, d.amount, d.deducted_at,
    ${sql("JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.reason'))", "(r.payload ->> 'reason')")} AS reason, r.review_note
    FROM salary_deductions d JOIN workflow_requests r ON r.request_id = d.request_id
    WHERE d.deducted_at >= ? AND d.deducted_at < ? ${scope} ORDER BY d.deducted_at, d.deduction_id`, periodParams);
  const [attendance] = await connection.execute(sql(`SELECT r.user_id, r.request_id, r.status, r.created_at AS requested_at, r.reviewed_at,
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.shiftDate')), s.shift_date) AS shift_date,
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.scheduledStart')), TIMESTAMP(s.shift_date, s.start_time)) AS scheduled_start,
    CASE WHEN COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.scheduledStart')), TIMESTAMP(s.shift_date, s.start_time)) IS NULL THEN NULL
      ELSE GREATEST(0, CEIL(TIMESTAMPDIFF(SECOND,
        COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.scheduledStart')), TIMESTAMP(s.shift_date, s.start_time)), r.created_at) / 60)) END AS late_minutes
    FROM workflow_requests r LEFT JOIN shifts s ON s.shift_id = CAST(JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.shiftId')) AS UNSIGNED)
      AND s.user_id = r.user_id
    WHERE r.request_type = 'shift_checkin' AND r.created_at >= ? AND r.created_at < ? ${scope}
    ORDER BY r.created_at DESC, r.request_id DESC`, `SELECT r.user_id, r.request_id, r.status, r.created_at AS requested_at, r.reviewed_at,
    COALESCE(NULLIF(r.payload ->> 'shiftDate', '')::date, s.shift_date) AS shift_date,
    COALESCE(NULLIF(r.payload ->> 'scheduledStart', '')::timestamp, s.shift_date + s.start_time) AS scheduled_start,
    CASE WHEN COALESCE(NULLIF(r.payload ->> 'scheduledStart', '')::timestamp, s.shift_date + s.start_time) IS NULL THEN NULL
      ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (r.created_at -
        COALESCE(NULLIF(r.payload ->> 'scheduledStart', '')::timestamp, s.shift_date + s.start_time))) / 60)) END AS late_minutes
    FROM workflow_requests r LEFT JOIN shifts s ON s.shift_id::text = r.payload ->> 'shiftId'
      AND s.user_id = r.user_id
    WHERE r.request_type = 'shift_checkin' AND r.created_at >= ? AND r.created_at < ? ${scope}
    ORDER BY r.created_at DESC, r.request_id DESC`), periodParams);
  const [unpriced] = await connection.execute(`SELECT r.user_id, r.request_id, ${sql("JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.orderId'))", "(r.payload ->> 'orderId')")} AS order_id
    FROM workflow_requests r WHERE r.request_type = 'refund' AND r.status = 'rejected'
    AND COALESCE(r.reviewed_at, r.created_at) >= ? AND COALESCE(r.reviewed_at, r.created_at) < ? ${scope}
    AND NOT EXISTS (SELECT 1 FROM salary_deductions d WHERE d.user_id = r.user_id
      AND d.order_id = ${sql("JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.orderId'))", "(r.payload ->> 'orderId')")})`, periodParams);
  const [payments] = await connection.execute(`SELECT p.*, u.user_name AS paid_by_name FROM employee_payroll_payments p
    LEFT JOIN users u ON u.user_id = p.paid_by WHERE p.salary_month = ? ${userId === null ? '' : 'AND p.user_id = ?'}`, userId === null ? [start] : [start, userId]);
  return employees.map(employee => {
    const employeeDeductions = deductions.filter(d => d.user_id === employee.user_id);
    const checkins = attendance.filter(a => a.user_id === employee.user_id)
      .map(a => ({ ...a, late_minutes: a.late_minutes === null ? null : Number(a.late_minutes) }));
    const lateCheckins = checkins.filter(a => a.status !== 'rejected' && Number(a.late_minutes) > 0);
    const payment = payments.find(p => p.user_id === employee.user_id);
    return {
      userId: employee.user_id, name: employee.user_name, position: employee.user_position, month,
      ...payrollTotals(employee.monthly_salary, employeeDeductions, payment),
      paidBy: payment?.paid_by_name || null,
      deductions: employeeDeductions, attendance: checkins,
      lateCount: lateCheckins.length,
      lateMinutes: lateCheckins.reduce((sum, a) => sum + Number(a.late_minutes), 0),
      unpricedRefunds: unpriced.filter(r => r.user_id === employee.user_id),
    };
  });
}

async function recordRefundDeduction(connection, request, payload) {
  // Lock the employee as well as the request to serialize against salary payment recording.
  await connection.execute('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [request.user_id]);
  const [[existing]] = await connection.execute('SELECT deduction_id FROM salary_deductions WHERE user_id = ? AND order_id = ?', [request.user_id, String(payload.orderId)]);
  if (existing) return;
  const [[order]] = await connection.execute('SELECT total_amount FROM orders_history WHERE order_id = ?', [String(payload.orderId)]);
  const amount = order?.total_amount ?? payload.orderAmount;
  if (amount === undefined || amount === null || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
    throw Object.assign(new Error('The original order amount is unavailable. This refund cannot be charged to salary.'), { status: 409 });
  }
  await connection.execute(`INSERT INTO salary_deductions (user_id, request_id, order_id, amount, deducted_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`, [request.user_id, request.request_id, String(payload.orderId), amount]);
}

module.exports = { getPayroll, recordRefundDeduction };
