// Expiration is a calendar date; a timestamp suffix must not shift its day.
export function expirationDate(value) {
    if (typeof value !== 'string') return '';
    const match = /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/.exec(value);
    if (!match) return '';
    const key = match[1];
    const date = new Date(`${key}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key ? key : '';
}

export function expirationStatus(value, today = new Date()) {
    const date = expirationDate(value);
    if (!date) return { date: '', label: 'N/A', className: 'exDate_unknown' };
    const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const days = Math.round((Date.parse(`${date}T00:00:00Z`) - todayUTC) / 86400000);
    if (days <= 0) return { date, label: days === 0 ? 'Expires today' : 'Expired', className: 'exDate_danger' };
    if (days >= 30) return { date, showDate: true, className: 'exDate_good' };
    return { date, label: `${days} ${days === 1 ? 'day' : 'days'} left`, className: days < 5 ? 'exDate_bad' : 'exDate_good' };
}
