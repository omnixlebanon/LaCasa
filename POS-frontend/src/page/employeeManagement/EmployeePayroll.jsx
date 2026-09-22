import LoadingState from '../../components/LoadingState.jsx';
import { useCallback, useEffect, useState } from 'react';
import { Banknote, Check, ChevronDown, Clock3, Pencil, RefreshCw } from 'lucide-react';
import api from '../../api.js';
import MoneyInput from '../../components/MoneyInput.jsx';
import { useCurrency } from '../../global.jsx';
import './EmployeePayroll.css';

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const timestamp = value => value ? new Date(String(value).replace(' ', 'T')).toLocaleString() : '—';
const monthLabel = value => new Date(`${value}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const statusLabels = { paid: 'Paid', unpaid: 'Unpaid', adjustment_required: 'Payment needs adjustment' };

function SalaryCard({ payroll, reload, disabled }) {
  const { formatPrice, currencyLabel } = useCurrency();
  const [editing, setEditing] = useState(false);
  const [salary, setSalary] = useState(payroll.baseSalary ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = disabled || busy;
  const saveSalary = async event => {
    event.preventDefault();
    if (locked) return;
    setBusy(true); setError('');
    try {
      await api.put(`/api/employees/${payroll.userId}/salary`, { month: payroll.month, amount: Number(salary).toFixed(2) });
      setEditing(false); await reload();
    } catch (requestError) { setError(requestError.response?.data?.error || 'Could not save salary.'); }
    finally { setBusy(false); }
  };
  const markPayment = async status => {
    if (locked) return;
    const message = status === 'paid'
      ? `Record ${formatPrice(payroll.payableAmount)} as paid to ${payroll.name} for ${monthLabel(payroll.month)}?`
      : `Mark ${payroll.name}'s salary for ${monthLabel(payroll.month)} as unpaid?`;
    if (!window.confirm(message)) return;
    setBusy(true); setError('');
    try {
      await api.put(`/api/employees/${payroll.userId}/payroll-payment`, { month: payroll.month, status, expectedAmount: payroll.payableAmount });
      await reload();
    } catch (requestError) { setError(requestError.response?.data?.error || 'Could not update payment status.'); }
    finally { setBusy(false); }
  };
  return <article className="payroll-card" aria-label={`${payroll.name} salary`}>
    <header className="payroll-card-header"><div><h4>{payroll.name}</h4><p>{payroll.position}</p></div><span className={`payroll-status ${payroll.paymentStatus}`}>{statusLabels[payroll.paymentStatus]}</span></header>
    {error && <p className="employee-error" role="alert">{error}</p>}
    <div className="payroll-metrics">
      <div><span>Monthly salary</span><strong>{payroll.baseSalary === null ? 'Not set' : formatPrice(payroll.baseSalary)}</strong><button className="payroll-edit" disabled={locked} onClick={() => { setSalary(payroll.baseSalary ?? ''); setEditing(!editing); }}><Pencil />{payroll.baseSalary === null ? 'Set salary' : 'Edit salary'}</button></div>
      <div><span>Rejected refunds</span><strong className={payroll.deductionsTotal > 0 ? 'payroll-deduction' : ''}>{payroll.deductionsTotal > 0 ? '−' : ''}{formatPrice(payroll.deductionsTotal)}</strong><small>{payroll.deductions.length} {payroll.deductions.length === 1 ? 'order' : 'orders'} deducted</small></div>
      <div><span>Net salary</span><strong className="payroll-net">{payroll.netSalary === null ? '—' : formatPrice(payroll.netSalary)}</strong><small>Salary after refund deductions</small></div>
      <div><span><Clock3 /> Late check-ins</span><strong>{payroll.lateCount}</strong><small>{payroll.lateMinutes} minutes total · No penalty</small></div>
    </div>
    {editing && <form className="payroll-salary-form" onSubmit={saveSalary}>
      <label htmlFor={`salary-${payroll.userId}`}>Monthly salary ({currencyLabel})<MoneyInput id={`salary-${payroll.userId}`} name="salary" value={salary} onChange={event => setSalary(event.target.value)} min="0" required disabled={locked} /></label>
      <p>Applies from {monthLabel(payroll.month)} onward, until another salary rate is set. Earlier months stay unchanged.</p>
      <div><button type="button" className="payroll-secondary" disabled={locked} onClick={() => setEditing(false)}>Cancel</button><button className="add-btn" type="submit" disabled={locked}>{busy ? 'Saving…' : 'Save salary'}</button></div>
    </form>}
    {payroll.netSalary < 0 && <p className="payroll-notice">Deductions exceed this month’s salary by {formatPrice(-payroll.netSalary)}. Payable amount: {formatPrice(0)}. No automatic carry-forward is applied.</p>}
    {payroll.unpricedRefunds.length > 0 && <p className="employee-error" role="alert">The original price is unavailable for rejected refund {payroll.unpricedRefunds.map(r => `#${r.request_id} (order ${r.order_id})`).join(', ')}. It has not been deducted; verify its amount before recording payment.</p>}
    <div className="payroll-payment-row">
      <p>{payroll.paidAt ? <>Recorded paid: <strong>{formatPrice(payroll.amountPaid)}</strong> on {timestamp(payroll.paidAt)}{payroll.paidBy && ` by ${payroll.paidBy}`}</> : 'Payment has not been recorded for this month.'}</p>
      <div>{payroll.paymentStatus !== 'unpaid' && <button className="payroll-secondary" disabled={locked} onClick={() => markPayment('unpaid')}>Mark unpaid</button>}{payroll.paymentStatus !== 'paid' && <button className="add-btn" disabled={locked || payroll.baseSalary === null || payroll.unpricedRefunds.length > 0} onClick={() => markPayment('paid')}><Check />{payroll.paymentStatus === 'adjustment_required' ? 'Update paid amount' : payroll.payableAmount === 0 ? 'Mark settled' : 'Mark paid'}</button>}</div>
    </div>
    {payroll.paymentStatus === 'adjustment_required' && <p className="payroll-notice">The salary or deductions changed after payment was recorded. {payroll.paymentDifference < 0 ? `${formatPrice(-payroll.paymentDifference)} was recorded above the current payable amount.` : `${formatPrice(payroll.paymentDifference)} remains due.`}</p>}
    <details className="payroll-details">
      <summary>Refund deductions &amp; attendance <ChevronDown /></summary>
      <div className="payroll-detail-body">
        <h5>Rejected refund deductions</h5><p className="payroll-help">The full order price is deducted in the month the refund is rejected, once per employee and order.</p>
        {!payroll.deductions.length ? <p className="payroll-empty">No rejected-refund deductions this month.</p> : <div className="payroll-table-wrap"><table><thead><tr><th>Order / Request</th><th>Rejected on</th><th>Reason</th><th>Deduction</th></tr></thead><tbody>{payroll.deductions.map(deduction => <tr key={deduction.request_id}><td>{deduction.order_id}<small>Request #{deduction.request_id}</small></td><td>{timestamp(deduction.deducted_at)}</td><td>{deduction.reason || '—'}{deduction.review_note && <small>{deduction.review_note}</small>}</td><td className="payroll-deduction">−{formatPrice(deduction.amount)}</td></tr>)}</tbody></table></div>}
        <h5>Bot check-ins</h5><p className="payroll-help">Lateness uses the time the check-in reached the server, not the manager’s approval time. Pending and approved late check-ins count above; rejected check-ins remain visible below.</p>
        {!payroll.attendance.length ? <p className="payroll-empty">No bot check-ins this month.</p> : <div className="payroll-table-wrap"><table><thead><tr><th>Scheduled start</th><th>Bot check-in</th><th>Arrival</th><th>Review</th></tr></thead><tbody>{payroll.attendance.map(checkin => <tr key={checkin.request_id}><td>{timestamp(checkin.scheduled_start)}</td><td>{timestamp(checkin.requested_at)}<small>Request #{checkin.request_id}</small></td><td className={Number(checkin.late_minutes) > 0 ? 'payroll-late' : ''}>{checkin.late_minutes === null ? 'Schedule unavailable' : Number(checkin.late_minutes) > 0 ? `${checkin.late_minutes} min late` : 'On time'}</td><td><span className={`payroll-review ${checkin.status}`}>{checkin.status}</span></td></tr>)}</tbody></table></div>}
      </div>
    </details>
  </article>;
}

export default function EmployeePayroll({ refreshKey }) {
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async signal => {
    if (!month) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/employees/payroll', { params: { month }, signal });
      if (!signal?.aborted) { setRows(response.data); setError(''); }
    } catch (requestError) { if (!signal?.aborted) setError(requestError.response?.data?.error || 'Could not load monthly salaries.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [month]);
  useEffect(() => {
    const controller = new AbortController(); setRows([]); load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);
  return <section className="employee-payroll" aria-label="Monthly salaries">
    <div className="payroll-section-header"><div><h3><Banknote /> Monthly salaries</h3><p>Salary, refund deductions, and attendance for each employee.</p></div><div className="payroll-month-controls"><label>Salary month<input type="month" value={month} min="2000-01" max="9998-12" onChange={event => { if (event.target.value) setMonth(event.target.value); }} disabled={loading} /></label><button className="payroll-secondary" onClick={() => load()} disabled={loading}><RefreshCw /> Refresh</button></div></div>
    {error && <p className="employee-error" role="alert">{error}</p>}
    {loading && <LoadingState label="Loading salaries..." />}
    {!loading && !rows.length && !error && <p className="payroll-empty">Add an employee to start tracking their salary.</p>}
    <div className="payroll-cards">{!loading && !error && rows.map(payroll => <SalaryCard key={`${month}-${payroll.userId}`} payroll={payroll} reload={load} disabled={loading} />)}</div>
  </section>;
}
