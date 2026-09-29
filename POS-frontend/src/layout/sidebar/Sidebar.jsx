import CurrencyControls from '../../components/CurrencyControls.jsx';
import OfflineStatus from '../../offline/OfflineStatus.jsx';
import './Sidebar.css';
import {
  Armchair, ShoppingCart, LayoutDashboard, History as HistoryIcon, Package, Settings,
  ClipboardList, LayoutList, User, Coins, LogOut, X, CalendarDays, Menu
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
function Sidebar() {
  const [isPinned, setIsPinned] = useState(() => {
    try { return localStorage.getItem('pos_sidebar_pinned') === 'true'; }
    catch { return false; }
  });
  const [isHovered, setIsHovered] = useState(false);
  const [hasKeyboardFocus, setHasKeyboardFocus] = useState(false);
  const isExpanded = isPinned || isHovered || hasKeyboardFocus;
  useEffect(() => {
    try { localStorage.setItem('pos_sidebar_pinned', String(isPinned)); }
    catch { /* The toggle still works when browser storage is unavailable. */ }
  }, [isPinned]);
  const { user, logout } = useAuth()
  const isAdmin = user?.accessLevel === 'admin';
  const handleLogout = async () => {
    try {
      await logout();           
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };
  return (
    <>
      <aside
        className={`sidebar${isExpanded ? ' is-expanded' : ''}${isPinned ? ' is-pinned' : ''}`}
        aria-label="Main navigation"
        onPointerEnter={(event) => { if (event.pointerType !== 'touch') setIsHovered(true); }}
        onPointerLeave={() => setIsHovered(false)}
        onFocusCapture={(event) => {
          if (event.target.matches(':focus-visible')) setHasKeyboardFocus(true);
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setHasKeyboardFocus(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setIsPinned(false);
            setIsHovered(false);
            setHasKeyboardFocus(false);
          }
        }}
      >
        <div className="sidebar-header">
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={isPinned ? 'Unpin sidebar' : 'Keep sidebar open'}
            title={isPinned ? 'Unpin sidebar' : 'Keep sidebar open'}
            aria-expanded={isExpanded}
            aria-pressed={isPinned}
            aria-controls="sidebar-navigation"
            onClick={() => setIsPinned((pinned) => !pinned)}
          ><Menu aria-hidden="true" /></button>
          <div className="logo">La Casa</div>
        </div>
        <nav className='navbar' id="sidebar-navigation" aria-label="Pages">
          <NavLink to='/tables' title='Tables'>
            <Armchair />
            <p className='navTxt'>Tables</p>
          </NavLink>
          <NavLink to='/' title='Active Order'>
            <ShoppingCart />
            <p className='navTxt'>Active Order</p>
          </NavLink>
          {isAdmin && <NavLink to='/sales' title='Sales'>
              <LayoutDashboard />
              <p className='navTxt'>Sales</p>
            </NavLink>}
          <NavLink to='/history' title='Order History'>
            <HistoryIcon />
            <p className='navTxt'>Order History</p>
          </NavLink>
          <NavLink to='/stock' title='Stock'>
            <Package />
            <p className='navTxt'>Stock</p>
          </NavLink>
          {isAdmin && <NavLink to='/product_management' title='Product Management'>
            <ClipboardList />
            <p className='navTxt'>Product Management</p>
          </NavLink>}
          {isAdmin && <NavLink to='/menu_management' title='Menu Management'>
            <LayoutList />
            <p className='navTxt'>Menu Management</p>
          </NavLink>}
          {isAdmin && <NavLink to='/employees' title='Employee Management'>
            <User />
            <p className='navTxt'>Employee Management</p>
          </NavLink>}
          <NavLink to='/shifts' title={isAdmin ? 'Shifts' : 'My Shifts'}>
            <CalendarDays />
            <p className='navTxt'>{isAdmin ? 'Shifts' : 'My Shifts'}</p>
          </NavLink>
        </nav>

        <div className='sidebar-bottomSection'>
          <OfflineStatus />
          <CurrencyControls />
            <button className='logoOut' onClick={handleLogout} aria-label='Log out' title='Log out'>
              <LogOut />
              <p className='logOutTxt'>Log out</p>
            </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
