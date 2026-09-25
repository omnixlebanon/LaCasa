import { useCallback, useEffect, useState } from 'react';
import { Receipt, Pencil, Trash2, RefreshCw } from 'lucide-react';
import api from '../../api.js';
import { useCurrency } from '../../global.jsx';
import MoneyInput from '../../components/MoneyInput.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import './Expenses.css';

const categories = { water: 'Water', electricity: 'Electricity', internet: 'Internet', rent: 'Rent', furniture: 'Furniture / tables', equipment: 'Equipment', maintenance: 'Maintenance', other: 'Other' };
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const emptyForm = () => ({ category: 'electricity', description: '', amount: '', date: localDate(), frequency: 'none', repeat_until: '' });
export default function Expenses({ onChanged }) {
  const { formatPrice, currencyLabel } = useCurrency();
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const load = useCallback(async signal => {
    setLoading(true); setLoadError('');
    try {
      const response = await api.get('/api/expenses', { params: { month }, signal });
      if (!signal?.aborted) setRows(response.data);
    } catch (e) { if (!signal?.aborted) setLoadError(e.response?.data?.error || 'Could not load expenses. Please try again.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [month]);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const save = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const data = { ...form, amount: form.amount === '' ? '' : Number(form.amount).toFixed(2) };
      if (editing) await api.patch(`/api/expenses/${editing}`, data);
      else await api.post('/api/expenses', data);
      setMessage(editing ? 'Expense updated.' : 'Expense recorded.');
      setEditing(null); setForm(emptyForm());
      const savedMonth = data.date.slice(0, 7);
      if (savedMonth !== month) setMonth(savedMonth); else await load();
      await onChanged?.();
    } catch (e) { setError(e.response?.data?.error || 'Could not save expense. Please try again.'); }
    finally { setBusy(false); }
  };
  const remove = async row => {
    if (busy || !window.confirm(`Delete "${row.description}" (${formatPrice(row.amount)})?`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api.delete(`/api/expenses/${row.expense_id}`);
      if (editing === row.expense_id) { setEditing(null); setForm(emptyForm()); }
      setMessage('Expense deleted.'); await load(); await onChanged?.();
    } catch (e) { setError(e.response?.data?.error || 'Could not delete expense.'); }
    finally { setBusy(false); }
  };
  const stop = async row => {
    const from = window.prompt('Stop repeating from this date (YYYY-MM-DD). Past bills are kept.', localDate());
    if (!from || busy) return;
    setBusy(true); setError('');
    try { await api.patch(`/api/expenses/${row.expense_id}/stop`, { from }); setMessage('Future repeats stopped.'); await load(); await onChanged?.(); }
    catch (e) { setError(e.response?.data?.error || 'Could not stop repeating.'); }
    finally { setBusy(false); }
  };
  return <section className="expenses-page" id="sales-expenses" aria-label="Manage expenses">
    <div className="head-area"><div className="PageTitle"><Receipt /><h2>Business Expenses</h2></div>
      <div className="expenses-controls"><label>Expense records month<input aria-label="Expense month" type="month" min="2000-01" max="9998-12" value={month} disabled={busy || loading} onChange={e => { if (e.target.value) setMonth(e.target.value); }} /></label><button type="button" disabled={busy || loading} onClick={() => load()}><RefreshCw size={18} /> Refresh</button></div>
    </div>
    <p className="expenses-hint">Manage bills and purchases below. Total Expenses at the top follows the Sales date filter; this list shows the selected expense records month. Sales deducts these bills on their scheduled dates. Repeating bills appear automatically, including in future months; they are scheduled expenses, not payment confirmations.</p>
    {message && <p className="expenses-message" role="status">{message}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    <form className="expenses-form" onSubmit={save}>
      <h3>{editing ? 'Edit expense' : 'Record an expense'}</h3>
      <fieldset disabled={busy || loading || !!loadError}>
        <label>Category<select name="category" value={form.category} onChange={update}>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Date<input type="date" name="date" min="2000-01-01" max="9998-12-31" value={form.date} onChange={update} required /></label>
        <label>Description<input name="description" maxLength={200} value={form.description} onChange={update} placeholder="e.g. September electricity bill or 4 dining tables" required /></label>
        <label>Amount ({currencyLabel})<MoneyInput name="amount" value={form.amount} onChange={update} min="0" required /></label>
        {!editing && <label>Repeat<select name="frequency" value={form.frequency} onChange={update}><option value="none">One-time expense</option><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="yearly">Every year</option></select></label>}
        {!editing && form.frequency !== 'none' && <label>Repeat until (optional)<input type="date" name="repeat_until" min={form.date} max="9998-12-31" value={form.repeat_until} onChange={update} /><small>Same day each period; shorter months use their last day. To change an amount later, stop this schedule and create a new one.</small></label>}
        <div className="expenses-form-actions">{editing && <button type="button" onClick={() => { setEditing(null); setForm(emptyForm()); setError(''); }}>Cancel</button>}<button className="add-btn" type="submit">{busy ? 'Saving...' : editing ? 'Save changes' : 'Add expense'}</button></div>
      </fieldset>
    </form>
    {loading || loadError ? <LoadingState label="Loading expenses..." error={loadError} onRetry={() => load()} /> : <>

      <section className="expenses-list" aria-label="Expenses for selected month">
        {!rows.length && <p className="expenses-empty">No expenses recorded for this month.</p>}
        {rows.map(row => <article key={row.occurrence_id}><div><span className="expenses-category">{categories[row.category] || row.category}</span><h3>{row.description}</h3><time dateTime={row.expense_date}>{new Date(`${row.expense_date}T00:00:00`).toLocaleDateString()}</time>{row.recurring && <p className="expenses-hint">Repeats {row.frequency}{row.repeat_until ? ` through ${row.repeat_until}` : ''}{row.stopped_before ? `; stopped from ${row.stopped_before}` : ''}</p>}</div><strong>{formatPrice(row.amount)}</strong><div className="expenses-actions">{row.recurring ? (!row.stopped_before && <button disabled={busy} onClick={() => stop(row)}>Stop repeating</button>) : <><button disabled={busy} aria-label={`Edit ${row.description}`} onClick={() => { setEditing(row.expense_id); setForm({ category: row.category, description: row.description, amount: Number(row.amount), date: row.expense_date }); setError(''); document.querySelector('.expenses-form')?.scrollIntoView({ behavior: 'smooth' }); }}><Pencil size={18} /></button><button disabled={busy} aria-label={`Delete ${row.description}`} onClick={() => remove(row)}><Trash2 size={18} /></button></>}</div></article>)}
      </section>
    </>}
  </section>;
}
