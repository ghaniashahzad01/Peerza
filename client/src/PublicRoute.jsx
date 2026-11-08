import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ArrowLeftRight } from 'lucide-react';

export default function PublicRoute({ children }) {
  const { auth, token, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading-screen">
        <span className="brand-mark animate-pulse">
          <ArrowLeftRight size={22} />
        </span>
        <div className="work-loading">
          <span /> Loading Peerza…
        </div>
      </div>
    );
  }

  if (auth && token) {
    return <Navigate to="/discover" replace />;
  }

  return children ? children : <Outlet />;
}
