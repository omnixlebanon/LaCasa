import './Sidebar.css';
import {
  Receipt, Armchair, ShoppingCart, LayoutDashboard, History as HistoryIcon, Package, Settings,
  ClipboardList, LayoutList, User, Coins, LogOut, X, CalendarDays, Menu
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useCurrency } from '../../global';
import { useAuth } from '../../context/AuthContext';
function Sidebar() {
  const { currency, toggleCurrency, rate, changeRate } = useCurrency();
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [tempRate, setTempRate] = useState('');
  const [isPinned, setIsPinned] = useState(() => {
    try { return localStorage.getItem('pos_sidebar_pinned') === 'true'; }
    catch { return false; }
  });
  const [isHovered, setIsHovered] = useState(false);
  const [hasKeyboardFocus, setHasKeyboardFocus] = useState(false);
  const isExpanded = isPinned || isHovered || hasKeyboardFocus || isEditingRate;
  useEffect(() => {
    try { localStorage.setItem('pos_sidebar_pinned', String(isPinned)); }
    catch { /* The toggle still works when browser storage is unavailable. */ }
  }, [isPinned]);
  const { user, logout } = useAuth()
  const isAdmin = user?.accessLevel === 'admin';
  const openSettings = () => {
    setTempRate(rate.toString())
    setIsEditingRate(true);
  };
  const closeSettings = (e) => {
    e?.stopPropagation();
    setIsEditingRate(false);
  };
  const handleRateChange = () => {
    changeRate(tempRate);
    closeSettings();
  }
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
            setIsEditingRate(false);
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
          <div className="logo">logo/name</div>
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
          {isAdmin && <NavLink to='/expenses' title='Expenses'><Receipt /><p className='navTxt'>Expenses</p></NavLink>}
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
          <div className='currency-area'>

            {/* 3. Conditionals updated to check context values ("USD" / "LBP") */}
            {!isEditingRate && currency === 'USD' && (
              <button className='changeCurrency' onClick={toggleCurrency} aria-label='Change currency from USD to LBP' title='Change currency'>
                <Coins />
                <p className='currencyTxt'>Currency</p>
                <p className='currencyType'>USD</p>
              </button>
            )}

            {!isEditingRate && currency === 'LBP' && (
              <button className='changeCurrency' onClick={toggleCurrency} aria-label='Change currency from LBP to USD' title='Change currency'>
                <Coins />
                <p className='currencyTxt'>Currency</p>
                <p className='currencyType'>L.L</p>
              </button>
            )}

            {/* 4. Display rate setting mode if state switch is true */}
            {isEditingRate && (
              <div className='currency-setting-area'>
                <div className='currency-head'>
                  <label htmlFor="rate">Current Rate</label>
                  <button className='close-btn' onClick={closeSettings} aria-label="Close currency settings"><X /></button>
                </div>
                <div className='label-input '>
                  <input
                    type="number"
                    min="1"
                    id='rate'
                    value={tempRate}
                    onChange={(e) => setTempRate(e.target.value)}
                  />
                </div>
                <div className='currency-action-btn'>
                  <button className='save-btn' onClick={handleRateChange}>Save</button>
                </div>

              </div>
            )}

            {!isEditingRate && (
              <button className='currency-settings' onClick={openSettings} aria-label='Currency settings' title='Currency settings'>
                <Settings />
                <span className="navTxt">Currency settings</span>
              </button>
            )}
          </div>
          {!isEditingRate && (
            <button className='logoOut' onClick={handleLogout} aria-label='Log out' title='Log out'>
              <LogOut />
              <p className='logOutTxt'>Log out</p>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
