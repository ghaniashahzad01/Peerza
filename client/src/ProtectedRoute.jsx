import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ArrowLeftRight } from 'lucide-react';

export default function ProtectedRoute({ children }) {
  const { auth, token, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-loading-screen">
        <span className="brand-mark animate-pulse">
          <ArrowLeftRight size={22} />
        </span>
        <div className="work-loading">
          <span /> Verifying session…
        </div>
      </div>
    );
  }

  if (!auth || !token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children ? children : <Outlet />;
}
