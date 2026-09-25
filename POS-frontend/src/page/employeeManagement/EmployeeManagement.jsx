import LoadingState from '../../components/LoadingState.jsx';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import api from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import './EmployeeManagement.css';
import EmployeePayroll from './EmployeePayroll.jsx';

const emptyEmployee = { name: '', email: '', password: '', position: '', accessLevel: 'employee', telegramId: '' };

export default function EmployeeManagement() {
  const { user } = useAuth();
  const isAdmin = user?.accessLevel === 'admin';
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [employeeForm, setEmployeeForm] = useState(emptyEmployee);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      if (!isAdmin) return;
      const response = await api.get('/api/employees');
      setEmployees(response.data || []);
      setError('');
    } catch (requestError) {
      setLoadError(requestError.response?.data?.error || 'Could not load employee information.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { loadData(); }, [loadData]);

  const saveEmployee = async (event) => {
    event.preventDefault();
    try {
      if (editingId) await api.patch(`/api/employees/${editingId}`, employeeForm);
      else await api.post('/api/employees', employeeForm);
      setEmployeeForm(emptyEmployee);
      setEditingId(null);
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not save employee.');
    }
  };

  const editEmployee = (employee) => {
    setEditingId(employee.user_id);
    setEmployeeForm({ name: employee.user_name, email: employee.user_email, password: '', position: employee.user_position, accessLevel: employee.access_level, telegramId: employee.telegram_id || '' });
  };

  const deleteEmployee = async (id) => {
    if (!window.confirm('Delete this employee and their assigned shifts, salary records, and attendance history?')) return;
    try { await api.delete(`/api/employees/${id}`); await loadData(); }
    catch (requestError) { setError(requestError.response?.data?.error || 'Could not delete employee.'); }
  };

  return <div className="main-area employee-page">
    <div className="head-area">
      <div className="PageTitle"><Users /><h2 className="PageName">Employee Management</h2></div>
    </div>
    {error && <p className="employee-error" role="alert">{error}</p>}

    {isAdmin && <section className="employee-admin-grid">
      <form className="employee-panel employee-form" onSubmit={saveEmployee}>
        <h3>{editingId ? 'Edit employee' : 'Add employee'}</h3>
        <input aria-label="Name" placeholder="Full name" value={employeeForm.name} onChange={e => setEmployeeForm({ ...employeeForm, name: e.target.value })} required />
        <input aria-label="Email" type="email" placeholder="Email" value={employeeForm.email} onChange={e => setEmployeeForm({ ...employeeForm, email: e.target.value })} required />
        <input aria-label="Password" type="password" placeholder={editingId ? 'New password (optional)' : 'Password'} value={employeeForm.password} onChange={e => setEmployeeForm({ ...employeeForm, password: e.target.value })} required={!editingId} />
        <input aria-label="Position" placeholder="Position (e.g. Cashier)" value={employeeForm.position} onChange={e => setEmployeeForm({ ...employeeForm, position: e.target.value })} required />
        <input aria-label="Telegram ID" inputMode="numeric" pattern="[0-9]*" placeholder="Telegram ID (from /id)" value={employeeForm.telegramId} onChange={e => setEmployeeForm({ ...employeeForm, telegramId: e.target.value.trim() })} />
        <select aria-label="Access level" value={employeeForm.accessLevel} onChange={e => setEmployeeForm({ ...employeeForm, accessLevel: e.target.value })}>
          <option value="employee">Employee</option><option value="admin">Admin</option>
        </select>
        <div className="employee-form-actions">
          {editingId && <button type="button" onClick={() => { setEditingId(null); setEmployeeForm(emptyEmployee); }}>Cancel</button>}
          <button className="add-btn" type="submit"><Plus />{editingId ? 'Save employee' : 'Add employee'}</button>
        </div>
      </form>

    </section>}

    {isAdmin && <section className="employee-panel employee-list">
      <h3>Employees</h3>
      {loading || loadError ? <LoadingState label="Loading employees..." error={loadError} onRetry={loadData} /> : <div className="employee-table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Position</th><th>Access</th><th>Telegram ID</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>{employees.map(employee => <tr key={employee.user_id}><td data-label="Name">{employee.user_name}</td><td data-label="Email">{employee.user_email}</td><td data-label="Position">{employee.user_position}</td><td data-label="Access"><span className={`access-badge ${employee.access_level}`}>{employee.access_level}</span></td><td data-label="Telegram ID">{employee.telegram_id || 'Not linked'}</td><td data-label="Joined">{new Date(employee.created_at).toLocaleDateString()}</td><td data-label="Actions"><button className="icon-button edit" onClick={() => editEmployee(employee)} aria-label={`Edit ${employee.user_name}`}><Pencil /></button><button className="icon-button delete" onClick={() => deleteEmployee(employee.user_id)} aria-label={`Delete ${employee.user_name}`}><Trash2 /></button></td></tr>)}</tbody>
      </table>{!employees.length && <p>No employees found.</p>}</div>}
    </section>}

    {isAdmin && <EmployeePayroll refreshKey={employees} />}
  </div>;
}
