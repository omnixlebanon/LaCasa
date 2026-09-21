import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, Repeat2, Pencil } from 'lucide-react';
import api from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import WorkflowRequests from '../../components/workflow/WorkflowRequests.jsx';
import { dateKey, monthDays } from './calendar.js';
import './Shifts.css';

const emptyForm = { userId: '', startTime: '', endTime: '', notes: '' };
const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dateLabel = date => date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const timeLabel = value => String(value || '').slice(0, 5);

export default function Shifts() {
  const { user } = useAuth();
  const isAdmin = user?.accessLevel === 'admin';
  const currentUserId = user?.id ?? user?.user_id;
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [recurringSchedules, setRecurringSchedules] = useState([]);
  const [repeat, setRepeat] = useState(false);
  const [recurringDays, setRecurringDays] = useState([]);
  const [stopDate, setStopDate] = useState(() => dateKey(new Date()));
  const [editingShift, setEditingShift] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const days = useMemo(() => monthDays(month), [month]);
  const from = dateKey(days[0]);
  const to = dateKey(days[days.length - 1]);
  const load = useCallback(async (signal) => {
    setLoading(true);
    try {
      const [shiftResponse, employeeResponse, recurringResponse] = await Promise.all([
        api.get('/api/shifts', { params: { from, to }, signal }), isAdmin ? api.get('/api/employees', { signal }) : Promise.resolve(null),
        api.get('/api/recurring-shifts', { signal }),
      ]);
      if (signal?.aborted) return;
      setShifts((shiftResponse.data || []).filter(shift => isAdmin || String(shift.user_id) === String(currentUserId)));
      setRecurringSchedules((recurringResponse.data || []).filter(schedule => isAdmin || String(schedule.user_id) === String(currentUserId)));
      if (employeeResponse) setEmployees(employeeResponse.data || []);
      setError('');
    } catch (requestError) {
      if (signal?.aborted) return;
      setError(requestError.response?.data?.error || 'Could not load shifts. Please refresh and try again.');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [isAdmin, currentUserId, from, to]);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);
  const byDate = useMemo(() => shifts.reduce((groups, shift) => {
    const key = String(shift.shift_date).slice(0, 10);
    (groups[key] ||= []).push(shift);
    return groups;
  }, {}), [shifts]);
  const selectedShifts = byDate[selectedDate] || [];
  const selectDay = date => {
    if (busy) return;
    setEditingShift(null);
    setForm(emptyForm);
    setSelectedDate(dateKey(date));
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setMessage('');
  };
  const editShift = shift => {
    setEditingShift(shift);
    setEditDate(String(shift.shift_date).slice(0, 10));
    setRepeat(false);
    setForm({ userId: String(shift.user_id), startTime: timeLabel(shift.start_time), endTime: timeLabel(shift.end_time), notes: shift.notes || '' });
    setError(''); setMessage('');
    requestAnimationFrame(() => {
      document.querySelector('.shifts-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.querySelector('.shifts-form select')?.focus({ preventScroll: true });
    });
  };
  const cancelEdit = () => { setEditingShift(null); setForm(emptyForm); setError(''); };
  const saveShift = async event => {
    event.preventDefault();
    if (busy) return;
    if (form.startTime >= form.endTime) { setError('End time must be after start time.'); return; }
    if (repeat && !recurringDays.length) { setError('Select at least one weekday to repeat every week.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      if (editingShift) {
        await api.patch(`/api/shifts/${editingShift.shift_id}`, { ...form, date: editDate });
        setSelectedDate(editDate);
        const target = new Date(`${editDate}T00:00:00`);
        setMonth(new Date(target.getFullYear(), target.getMonth(), 1));
        setEditingShift(null);
      } else {
        await api.post(repeat ? '/api/recurring-shifts' : '/api/shifts', { ...form, date: selectedDate, ...(repeat ? { weekdays: recurringDays } : {}) });
      }
      setForm(current => ({ ...current, userId: '', notes: '' }));
      setMessage(editingShift ? 'Shift updated.' : repeat ? 'Weekly schedule added. It will repeat on the selected weekdays until stopped.' : 'Shift added. You can add another employee to this day.');
      // Changing months triggers its own load; do not overwrite it with the old month's data.
      if (!editingShift || editDate.slice(0, 7) === dateKey(month).slice(0, 7)) await load();
    } catch (requestError) { setError(requestError.response?.data?.error || 'Could not save shift.'); }
    finally { setBusy(false); }
  };
  const deleteShift = async shift => {
    if (busy || !window.confirm(`Remove ${shift.user_name}'s shift on ${selectedDate}?${shift.recurrence_id ? ' Only this occurrence will be removed; the repeating schedule will continue.' : ''}`)) return;
    setBusy(true); setError(''); setMessage('');
    try { await api.delete(`/api/shifts/${shift.shift_id}`); if (editingShift?.shift_id === shift.shift_id) cancelEdit(); await load(); }
    catch (requestError) { setError(requestError.response?.data?.error || 'Could not remove shift.'); }
    finally { setBusy(false); }
  };

  const stopRecurring = async schedule => {
    if (busy || !stopDate || !window.confirm(`Stop ${schedule.user_name}'s repeating schedule from ${stopDate} onward? Earlier shifts and shifts with check-ins will be kept.`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api.patch(`/api/recurring-shifts/${schedule.recurrence_id}/stop`, { from: stopDate });
      await load(); setMessage(`Repeating schedule stopped from ${stopDate}.`);
    } catch (requestError) { setError(requestError.response?.data?.error || 'Could not stop repeating schedule.'); }
    finally { setBusy(false); }
  };

  return <div className="main-area shifts-page">
    <div className="head-area"><div className="PageTitle"><CalendarDays /><h2 className="PageName">{isAdmin ? 'Shift Management' : 'My Shifts'}</h2></div></div>
    {error && <p className="shifts-error" role="alert">{error}</p>}
    {message && <p className="shifts-success" role="status">{message}</p>}
    <div className="shifts-layout">
      <section className="shifts-calendar" aria-label="Shift calendar">
        <div className="shifts-toolbar">
          <h3 aria-live="polite">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
          <div><button disabled={busy} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft /></button><button disabled={busy} onClick={() => selectDay(new Date())}>Today</button><button disabled={busy} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight /></button></div>
        </div>
        <p className="shifts-hint">{isAdmin ? 'Select any day to assign employees. Each day can have multiple shifts.' : 'Select a day to see your shift details.'}</p>
        {loading && <p role="status">Loading shifts…</p>}
        <div className="shifts-calendar-scroll"><div className="shifts-month-grid">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div className="shifts-weekday" key={day}>{day}</div>)}
          {days.map(date => {
            const key = dateKey(date);
            const dayShifts = byDate[key] || [];
            return <button type="button" disabled={busy} key={key} className={`shifts-day${date.getMonth() !== month.getMonth() ? ' outside' : ''}${key === selectedDate ? ' selected' : ''}${key === dateKey(new Date()) ? ' today' : ''}`} onClick={() => selectDay(date)} aria-pressed={key === selectedDate} aria-label={`${dateLabel(date)}, ${dayShifts.length} shifts${isAdmin ? '. Select to assign an employee' : ''}`}>
              <span className="shifts-day-number">{date.getDate()}{isAdmin && <Plus aria-hidden="true" />}</span>
              {dayShifts.slice(0, 3).map(shift => <span className="shifts-chip" key={shift.shift_id}><strong>{shift.user_name || user?.name}{shift.recurrence_id && ' ↻'}</strong><span>{timeLabel(shift.start_time)}–{timeLabel(shift.end_time)}</span></span>)}
              {dayShifts.length > 3 && <span className="shifts-more">+{dayShifts.length - 3} more</span>}
            </button>;
          })}
        </div></div>
      </section>
      <section className="shifts-detail" aria-label="Selected day">
        <h3>{dateLabel(new Date(`${selectedDate}T00:00:00`))}</h3>
        <p>{selectedShifts.length} {selectedShifts.length === 1 ? 'shift' : 'shifts'} scheduled</p>
        <div className="shifts-day-list">
          {!loading && !selectedShifts.length && <p>No shifts scheduled for this day.</p>}
          {selectedShifts.map(shift => <article className="shifts-assignment" key={shift.shift_id}><div><strong>{shift.user_name || user?.name}</strong><span>{timeLabel(shift.start_time)}–{timeLabel(shift.end_time)}</span>{shift.recurrence_id && <small className="shifts-repeat-badge"><Repeat2 /> Repeats {shift.weekdays ? 'weekly' : 'monthly'}</small>}{shift.notes && <small>{shift.notes}</small>}</div>{isAdmin && <div className="shifts-assignment-actions"><button className="shifts-edit" disabled={busy || loading} onClick={() => editShift(shift)} title="Edit shift" aria-label={`Edit ${shift.user_name}'s ${timeLabel(shift.start_time)} shift`}><Pencil /></button><button disabled={busy} onClick={() => deleteShift(shift)} title={shift.recurrence_id ? 'Remove this date only' : 'Remove shift'} aria-label={`Remove ${shift.user_name}'s ${timeLabel(shift.start_time)} shift`}><Trash2 /></button></div>}</article>)}
        </div>
        {isAdmin && <form className="shifts-form" onSubmit={saveShift}>
          <h4>{editingShift ? 'Edit shift' : repeat ? 'Add a repeating schedule' : 'Add employee to this day'}</h4>
          {editingShift?.recurrence_id && <p className="shifts-hint">Changes apply to this shift only. The repeating schedule will continue unchanged.</p>}
          <fieldset disabled={busy || loading}>
            {editingShift && <label>Date<input type="date" required value={editDate} onChange={e => setEditDate(e.target.value)} /></label>}
            <label>Employee<select value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })} required><option value="">Select employee</option>{employees.map(employee => <option key={employee.user_id} value={employee.user_id}>{employee.user_name}</option>)}</select></label>
            <div className="shifts-time-row"><label>Start time<input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} required /></label><label>End time<input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} required /></label></div>
            {!editingShift && <label className="shifts-repeat-toggle"><input type="checkbox" checked={repeat} onChange={e => { setRepeat(e.target.checked); if (!recurringDays.length) setRecurringDays([new Date(`${selectedDate}T00:00:00Z`).getUTCDay() || 7]); }} /><span>Repeat on selected weekdays every week</span></label>}
            {repeat && <div className="shifts-repeat-options">
              <p id="repeat-weekdays-label">Days of the week</p>
              <div className="shifts-weekday-picker" role="group" aria-labelledby="repeat-weekdays-label">{weekdayNames.map((name, index) => {
                const day = index + 1;
                return <button type="button" key={day} aria-label={name} aria-pressed={recurringDays.includes(day)} onClick={() => setRecurringDays(current => current.includes(day) ? current.filter(d => d !== day) : [...current, day].sort((a, b) => a - b))}>{name}</button>;
              })}</div>
              <p className="shifts-repeat-hint">Starts {selectedDate}. Repeats every week on the selected days until stopped.</p>
            </div>}
            <label>Notes (optional)<textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
            <button type="submit" className="shifts-add">{editingShift ? <Pencil /> : <Plus />}{busy ? 'Saving…' : editingShift ? 'Save changes' : repeat ? 'Create weekly schedule' : 'Assign shift'}</button>
          {editingShift && <button type="button" className="shifts-cancel" onClick={cancelEdit}>Cancel editing</button>}
          </fieldset>
        </form>}
      </section>
    </div>
    {recurringSchedules.length > 0 && <section className="shifts-recurring-section">
      <div className="shifts-recurring-header"><h3><Repeat2 /> Repeating schedules</h3>{isAdmin && <label>Stop schedules from<input aria-label="Stop schedules from" type="date" min={dateKey(new Date())} value={stopDate} onChange={e => setStopDate(e.target.value)} disabled={busy} /></label>}</div>
      <div className="shifts-recurring-list">{recurringSchedules.map(schedule => {
        const selected = schedule.weekdays ?? schedule.month_days;
        const dates = typeof selected === 'string' ? JSON.parse(selected) : selected;
        const repetition = schedule.weekdays ? `${dates.map(day => weekdayNames[day - 1]).join(', ')} every week` : `Days ${dates.join(', ')} each month`;
        return <article key={schedule.recurrence_id}><div><strong>{schedule.user_name}</strong><p>{timeLabel(schedule.start_time)}–{timeLabel(schedule.end_time)} · {repetition}</p><small>From {schedule.starts_on}{schedule.stopped_from ? ` · Stops before ${schedule.stopped_from}` : ' · No end date'}</small></div>{isAdmin && <button disabled={busy || !stopDate} onClick={() => stopRecurring(schedule)}>Stop repeating</button>}</article>;
      })}</div>
    </section>}
    {isAdmin && <WorkflowRequests type="shift_checkin" title="Shift Check-in Approvals" emptyMessage="No shift check-ins are waiting for review." />}
  </div>;
}
