import { createBrowserRouter, RouterProvider, Outlet, Navigate, useLocation } from 'react-router-dom';
import './App.css'
import RequestActivity from './components/RequestActivity.jsx';
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './page/login/Login.jsx';
import Sidebar from './layout/sidebar/Sidebar.jsx';
import Tables from './page/tables/Tables.jsx';
import Order from './page/order/Order.jsx';
import Sales from './page/sales/Sales.jsx';
import OrderHistory from './page/history/History.jsx';
import Stock from './page/stock/Stock.jsx';
import ProductManag from './page/productManag/ProductManag.jsx';
import MenuManag from './page/menuManag/MenuManag.jsx';
import EmployeeManagement from './page/employeeManagement/EmployeeManagement.jsx';
import Shifts from './page/shifts/Shifts.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

import useMobile from './hooks/useMobile.js';
import MobileNavigation from './layout/sidebar/MobileNavigation.jsx';

const Layout = () => {
  const isMobile = useMobile();
  const { pathname } = useLocation();
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading POS System...</div>;
  }
  if (loading==true || !user) {
    return <Navigate to="/login" replace />;
  }
  const mobileHome = user.accessLevel === 'admin' ? '/sales' : '/history';
  const mobileAllowed = ['/sales', '/history', '/stock', '/shifts'].includes(pathname.replace(/\/$/, ''));
  return (
    <>
      {isMobile ? <MobileNavigation /> : <Sidebar />}
      {isMobile && !mobileAllowed ? <Navigate to={mobileHome} replace /> : <Outlet />}
    </>
  );
};

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />
  },
  {
    path: "/",
    element: <Layout />, // Gated with our session checks above
    children: [
      {
        index: true, 
        element: <Order />
      },
      {
        path: "tables",
        element: <Tables />
      }, 
      {
        element: <ProtectedRoute allowedAccess={['admin']} />,
        children: [
          { path: "sales", element: <Sales /> },
          { path: "product_management", element: <ProductManag /> },
          { path: "menu_management", element: <MenuManag /> },
          { path: "employees", element: <EmployeeManagement /> }
        ]
      },
      {
        path: "history",
        element: <OrderHistory />
      }, 
      {
        path: "stock",
        element: <Stock />
      }, 
      {
        path: "shifts",
        element: <Shifts />
      },
      {
        path: "employee_management",
        element: <Navigate to="/employees" replace />
      }
    ]
  },
  {
    path: "*",
    element: <Navigate to="/" replace />
  }
], {
  basename: "/POS",
});

function App() {
  return (
    <AuthProvider>
      <RequestActivity />
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
