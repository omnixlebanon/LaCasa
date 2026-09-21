function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '2000-01-01' && value <= '9998-12-31';
}

function dateRange(from, to) {
  if (!validDate(from) || !validDate(to) || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 93) {
    throw badRequest('Choose a valid date range of at most 94 days.');
  }
  return { from, to };
}

function shiftInput(body) {
  const { userId, date, startTime, endTime, notes = '' } = body || {};
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0 || !validDate(date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime || '') ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime || '') || startTime >= endTime) {
    throw badRequest('Employee, date, and a valid start/end time are required.');
  }
  if (typeof notes !== 'string' || notes.trim().length > 255) throw badRequest('Notes must be at most 255 characters.');
  return { userId: Number(userId), date, startTime, endTime, notes: notes.trim() };
}

function monthDays(value) {
  if (!Array.isArray(value) || !value.length || value.some(day => !Number.isInteger(day) || day < 1 || day > 31)) {
    throw badRequest('Select at least one calendar date from 1 to 31.');
  }
  return [...new Set(value)].sort((a, b) => a - b);
}

function monthlyOccurrences(series, from, to) {
  dateRange(from, to);
  const days = monthDays(typeof series.month_days === 'string' ? JSON.parse(series.month_days) : series.month_days);
  const first = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const dates = [];
  while (first.toISOString().slice(0, 10) <= to) {
    const year = first.getUTCFullYear();
    const month = first.getUTCMonth();
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (const day of days) {
      if (day > lastDay) continue;
      const key = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
      if (key >= from && key <= to && key >= series.starts_on && (!series.stopped_from || key < series.stopped_from)) dates.push(key);
    }
    first.setUTCMonth(month + 1);
  }
  return dates;
}

// ISO weekdays: Monday = 1, Sunday = 7, independent of the machine's timezone.
function weekdays(value) {
  if (!Array.isArray(value) || !value.length || value.some(day => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw badRequest('Select at least one weekday, Monday through Sunday.');
  }
  return [...new Set(value)].sort((a, b) => a - b);
}

function weeklyOccurrences(series, from, to) {
  dateRange(from, to);
  const selected = weekdays(typeof series.weekdays === 'string' ? JSON.parse(series.weekdays) : series.weekdays);
  const dates = [];
  for (const date = new Date(`${from}T00:00:00Z`); date.toISOString().slice(0, 10) <= to; date.setUTCDate(date.getUTCDate() + 1)) {
    const key = date.toISOString().slice(0, 10);
    if (selected.includes(date.getUTCDay() || 7) && key >= series.starts_on && (!series.stopped_from || key < series.stopped_from)) dates.push(key);
  }
  return dates;
}

function recurringOccurrences(series, from, to) {
  return series.weekdays !== null && series.weekdays !== undefined
    ? weeklyOccurrences(series, from, to) : monthlyOccurrences(series, from, to);
}

module.exports = { badRequest, validDate, dateRange, shiftInput, monthDays, monthlyOccurrences, weekdays, weeklyOccurrences, recurringOccurrences };
