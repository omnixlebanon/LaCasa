import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Receipt, LayoutDashboard, History, Package, CalendarDays, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCurrency } from '../../global.jsx';

export default function MobileNavigation() {
  const [logoutError, setLogoutError] = useState('');
  const handleLogout = async () => {
    try { await logout(); } catch { setLogoutError('Could not log out. Please try again.'); }
  };
  const { user, logout } = useAuth();
  const { currency, toggleCurrency } = useCurrency();
  const links = [
    ...(user?.accessLevel === 'admin' ? [{ to: '/sales', label: 'Sales', Icon: LayoutDashboard }, { to: '/expenses', label: 'Expenses', Icon: Receipt }] : []),
    { to: '/history', label: 'History', Icon: History },
    { to: '/stock', label: 'Stock', Icon: Package },
    { to: '/shifts', label: 'Shifts', Icon: CalendarDays },
  ];
  return <>
    <header className="mobile-header">
      <div><strong>Business overview</strong><small>View only</small></div>
      <div className="mobile-header-actions">
        <button onClick={toggleCurrency} aria-label={`Change currency from ${currency}`}>{currency}</button>
        <button onClick={handleLogout} aria-label="Log out"><LogOut size={20} /></button>
      </div>
    </header>
    {logoutError && <p role="alert" className="error-message">{logoutError}</p>}
    <nav className="mobile-navigation" aria-label="Main navigation">
      {links.map(({ to, label, Icon }) => <NavLink key={to} to={to}><Icon size={21} /><span>{label}</span></NavLink>)}
    </nav>
  </>;
}
