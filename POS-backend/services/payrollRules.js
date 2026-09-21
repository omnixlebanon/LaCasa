const { badRequest } = require('./schedulingRules');

function salaryMonth(value) {
  if (typeof value !== 'string' || !/^(20\d{2}|[3-9]\d{3})-(0[1-9]|1[0-2])$/.test(value) || value > '9998-12') {
    throw badRequest('Choose a valid salary month.');
  }
  const start = `${value}-01`;
  const endDate = new Date(`${start}T00:00:00Z`);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  return { start, end: endDate.toISOString().slice(0, 10) };
}

function salaryAmount(value) {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(String(value))) throw badRequest('Enter a non-negative salary with at most two decimal places.');
  return (Math.round(Number(value) * 100) / 100).toFixed(2);
}

function payrollTotals(salary, deductions, payment) {
  const salaryCents = salary === null || salary === undefined ? null : Math.round(Number(salary) * 100);
  const deductionCents = deductions.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
  const netCents = salaryCents === null ? null : salaryCents - deductionCents;
  const payableCents = netCents === null ? null : Math.max(0, netCents);
  const paidCents = payment?.status === 'paid' ? Math.round(Number(payment.amount_paid) * 100) : 0;
  return {
    baseSalary: salaryCents === null ? null : salaryCents / 100,
    deductionsTotal: deductionCents / 100,
    netSalary: netCents === null ? null : netCents / 100,
    payableAmount: payableCents === null ? null : payableCents / 100,
    amountPaid: paidCents / 100,
    paymentStatus: payment?.status === 'paid' ? (paidCents === payableCents ? 'paid' : 'adjustment_required') : 'unpaid',
    paymentDifference: payableCents === null ? null : (payableCents - paidCents) / 100,
    paidAt: payment?.paid_at || null,
  };
}

module.exports = { salaryMonth, salaryAmount, payrollTotals };
