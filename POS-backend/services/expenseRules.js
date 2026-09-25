const categories = ['water', 'electricity', 'internet', 'rent', 'furniture', 'equipment', 'maintenance', 'other'];
const invalid = message => Object.assign(new Error(message), { status: 400 });
function expenseMonth(month) {
  if (typeof month !== 'string' || !/^(20\d{2}|[3-9]\d{3})-(0[1-9]|1[0-2])$/.test(month) || month > '9998-12') throw invalid('Choose a valid month.');
  const start = `${month}-01`;
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return { start, end: date.toISOString().slice(0, 10) };
}
function expenseInput(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Enter valid expense details.');
  const { category, date, amount } = body;
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!categories.includes(category)) throw invalid('Choose a valid expense category.');
  if (!description || description.length > 200) throw invalid('Enter a description of up to 200 characters.');
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) throw invalid('Choose a valid expense date.');
  expenseMonth(date.slice(0, 7));
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(String(amount)) || Number(amount) <= 0) throw invalid('Enter an amount greater than zero with at most two decimal places in USD.');
  return { category, date, description, amount: Number(amount).toFixed(2) };
}
function expenseId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw invalid('Invalid expense ID.');
  return Number(value);
}
module.exports = { categories, expenseInput, expenseMonth, expenseId };
