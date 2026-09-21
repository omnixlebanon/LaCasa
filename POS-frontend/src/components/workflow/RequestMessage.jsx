import { useCurrency } from '../../global.jsx';

const requestKinds = {
  stock_receipt: 'stock receipt',
  stock_usage: 'ingredient usage',
  shift_checkin: 'shift check-in',
  refund: 'refund',
};
const hasValue = value => value !== null && value !== undefined && String(value).trim() !== '';
const hasAmount = value => hasValue(value) && Number.isFinite(Number(value));
const formatDate = value => {
  if (!hasValue(value)) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '';
};

export default function RequestMessage({ request, type }) {
  const { formatPrice } = useCurrency();
  const payload = request.payload || {};
  const kind = request.request_type || type;
  const kindLabel = requestKinds[kind] || String(kind || 'general').replaceAll('_', ' ');
  const employee = request.user_name?.trim() || 'Unknown employee';
  const items = Array.isArray(payload.items) ? payload.items.filter(item => item && typeof item === 'object') : [];
  const reportedAt = formatDate(payload.reportedAt);
  const requestedAt = formatDate(request.created_at);

  return <div className="workflow-message">
    <p><strong>{employee}</strong> submitted a <strong>{kindLabel} request</strong>.</p>
    {kind === 'stock_receipt' && <>
      {hasValue(payload.name) && <p>Name on receipt: {payload.name}.</p>}
      {items.length > 0 && <ul>{items.map((item, index) => <li key={index}>
        <strong>{item.item_name || 'Unnamed item'}</strong>
        {hasValue(item.qty) && <> — Quantity: {item.qty}{hasValue(item.uom) ? ` ${item.uom}` : ''}</>}
        {hasAmount(item.unit_price) && <> · Unit price: {formatPrice(item.unit_price)}</>}
        {hasAmount(item.total_price) && <> · Total: {formatPrice(item.total_price)}</>}
      </li>)}</ul>}
      {hasAmount(payload.grand_total) && <p className="workflow-message-total">Receipt total: {formatPrice(payload.grand_total)}</p>}
    </>}
    {kind === 'stock_usage' && <>
      {hasValue(payload.itemName) && <p>Ingredient: {payload.itemName}.</p>}
      {hasValue(payload.quantity) && <p>Quantity used: {payload.quantity}{hasValue(payload.uom) ? ` ${payload.uom}` : ''}.</p>}
      {reportedAt && <p>Reported on {reportedAt}.</p>}
    </>}
    {kind === 'shift_checkin' && <>
      {hasValue(payload.shiftId) && <p>Shift: #{payload.shiftId}.</p>}
      {requestedAt && <p>Check-in requested on {requestedAt}.</p>}
      {payload.scheduledStart && <p>Scheduled start: {formatDate(payload.scheduledStart)}.</p>}
      {hasAmount(payload.lateMinutes) && <p>{Number(payload.lateMinutes) > 0 ? `${payload.lateMinutes} minutes late` : 'On time'} · No salary deduction for lateness.</p>}
    </>}
    {kind === 'refund' && hasValue(payload.orderId) && <p>Order: #{payload.orderId}.</p>}
    {kind === 'refund' && hasAmount(payload.orderAmount) && <p>Order amount: {formatPrice(payload.orderAmount)}.</p>}
    {kind === 'refund' && request.status === 'pending' && <p className="workflow-refund-policy">Rejecting this refund deducts the full order price from this employee’s salary for the rejection month. The same order is deducted only once per employee.</p>}
    {hasValue(payload.reason) && <p>Reason: {payload.reason}</p>}
    {typeof payload.details === 'string' && payload.details.trim() && <p>Details: {payload.details}</p>}
    {typeof payload.notes === 'string' && payload.notes.trim() && <p>Notes: {payload.notes}</p>}
    {hasValue(request.review_note) && <p>Manager note: {request.review_note}</p>}
  </div>;
}
