import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ allowedAccess }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (allowedAccess && !allowedAccess.includes(user.accessLevel)) return <Navigate to="/" replace />;
  return <Outlet />;
};

export default ProtectedRoute;
