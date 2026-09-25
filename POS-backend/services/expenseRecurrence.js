const { expenseMonth } = require('./expenseRules');
const invalid = message => Object.assign(new Error(message), { status: 400 });
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw invalid('Choose a valid date.');
  expenseMonth(value.slice(0, 7)); return value;
}
function recurrenceInput(body) {
  const frequency = body.frequency || 'none';
  if (!['none', 'weekly', 'monthly', 'yearly'].includes(frequency)) throw invalid('Choose weekly, monthly or yearly repetition.');
  const until = body.repeat_until ? validDate(body.repeat_until) : null;
  if (until && until < body.date) throw invalid('The end date must not precede the first bill.');
  return { frequency, until };
}
function expandExpenses(rows, from, to) {
  const result = [];
  for (const row of rows) {
    const start = String(row.expense_date).slice(0, 10);
    const limit = row.repeat_until && row.repeat_until < to ? row.repeat_until : to;
    const add = date => {
      if (date >= from && date <= limit && (!row.stopped_before || date < row.stopped_before)) result.push({ ...row, expense_date: date, occurrence_id: `${row.expense_id}:${date}`, recurring: !!row.frequency });
      if (result.length > 100000) throw invalid('Too many expense occurrences. Use a shorter range.');
    };
    if (!row.frequency) { add(start); continue; }
    const [year, month, day] = start.split('-').map(Number);
    const anchor = new Date(start + 'T00:00:00Z');
    let index = row.frequency === 'weekly' ? Math.max(0, Math.floor((new Date(from + 'T00:00:00Z') - anchor) / 604800000)) : Math.max(0, Math.floor(((Number(from.slice(0, 4)) - year) * 12 + Number(from.slice(5, 7)) - month) / (row.frequency === 'yearly' ? 12 : 1)));
    for (;; index++) {
      let date;
      if (row.frequency === 'weekly') date = new Date(+anchor + index * 604800000);
      else {
        date = new Date(Date.UTC(year, month - 1 + index * (row.frequency === 'yearly' ? 12 : 1), 1));
        date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
      }
      if (date.getUTCFullYear() > 9998) break;
      const key = date.toISOString().slice(0, 10);
      if (key > limit || (row.stopped_before && key >= row.stopped_before)) break;
      add(key);
    }
  }
  return result.sort((a, b) => b.expense_date.localeCompare(a.expense_date) || Number(b.expense_id) - Number(a.expense_id));
}
module.exports = { validDate, recurrenceInput, expandExpenses };
