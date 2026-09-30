import CurrencyControls from '../../components/CurrencyControls.jsx';
import OfflineStatus from '../../offline/OfflineStatus.jsx';
import { useState, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, History, Package, CalendarDays, LogOut, ShoppingCart, LayoutGrid, ClipboardList, LayoutList, Users, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';

export default function MobileNavigation() {
  const [logoutError, setLogoutError] = useState('');
  const menuRef = useRef(null);
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const links = [
    { to: '/', label: 'POS', Icon: ShoppingCart },
    { to: '/tables', label: 'Tables', Icon: LayoutGrid },
    ...(['admin','owner','manager'].includes(user?.accessLevel) ? [{ to: '/sales', label: 'Sales', Icon: LayoutDashboard }] : []),
    { to: '/history', label: 'History', Icon: History },
    { to: '/stock', label: 'Stock', Icon: Package },
    { to: '/shifts', label: 'Shifts', Icon: CalendarDays },
    ...(['admin','owner','manager'].includes(user?.accessLevel) ? [
      { to: '/product_management', label: 'Products', Icon: ClipboardList },
      { to: '/menu_management', label: 'Menu management', Icon: LayoutList },
    ] : []),
    { to: '/employees', label: 'Employees', Icon: Users },
  ];
  const primary = links.slice(0, 4);
  const handleLogout = async () => {
    try { await logout(); } catch { setLogoutError('Could not log out. Please try again.'); }
  };
  return <>
    <header className="mobile-header">
      <div><strong>La Casa</strong><small>{links.find(link => link.to === pathname)?.label || 'Management'}</small></div>
      <div className="mobile-header-actions">
        <OfflineStatus />
        <CurrencyControls />
        <button onClick={handleLogout} aria-label="Log out"><LogOut size={20} /></button>
      </div>
    </header>
    {logoutError && <p role="alert" className="error-message">{logoutError}</p>}
    <nav className="mobile-navigation" aria-label="Main navigation">
      {primary.map(({ to, label, Icon }) => <NavLink end key={to} to={to} onClick={() => { if (menuRef.current) menuRef.current.open = false; }}><Icon size={21} /><span>{label}</span></NavLink>)}
      <details ref={menuRef} className="mobile-more" onKeyDown={e => { if (e.key === 'Escape') { menuRef.current.open = false; menuRef.current.querySelector('summary').focus(); } }}>
        <summary><Menu size={21} /><span>More</span></summary>
        <div className="mobile-menu-panel">
          <strong>All pages</strong>
          <div className="mobile-menu-links">
            {links.map(({ to, label, Icon }) => <NavLink end key={to} to={to} onClick={() => { menuRef.current.open = false; }}><Icon size={21} /><span>{label}</span></NavLink>)}
          </div>

        </div>
      </details>
    </nav>
  </>;
}
