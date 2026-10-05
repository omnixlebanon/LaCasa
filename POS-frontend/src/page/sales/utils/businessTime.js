export const BUSINESS_TIMEZONE = 'Asia/Beirut';
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

// UTC fields carry Beirut calendar coordinates, not an actual UTC instant.
// Database timestamps without an offset already contain Beirut local time.
export function businessCalendar(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.test(value)) {
    return new Date(value.length === 10 ? value + 'T00:00:00Z' : value.replace(' ', 'T') + 'Z');
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return new Date(NaN);
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${String(date.getUTCMilliseconds()).padStart(3, '0')}Z`);
}

export const businessDate = value => businessCalendar(value).toISOString().slice(0, 10);
export function businessTimestamp(value) {
  const date = businessCalendar(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 19).replace('T', ' ') + ' (Asia/Beirut)' : '';
}
