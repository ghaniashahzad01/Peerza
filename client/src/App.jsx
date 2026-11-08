import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import ProtectedRoute from './ProtectedRoute';
import PublicRoute from './PublicRoute';
import AuthPage from './AuthPage';
import DashboardLayout from './DashboardLayout';
import { ArrowLeftRight } from 'lucide-react';

function RootRedirect() {
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

  return auth && token ? <Navigate to="/discover" replace /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Authentication Routes */}
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<AuthPage initialMode="login" />} />
            <Route path="/register" element={<AuthPage initialMode="register" />} />
          </Route>

          {/* Protected Application Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/discover" element={<DashboardLayout />} />
            <Route path="/matches" element={<DashboardLayout />} />
            <Route path="/messages" element={<DashboardLayout />} />
            <Route path="/sessions" element={<DashboardLayout />} />
            <Route path="/saved" element={<DashboardLayout />} />
            <Route path="/saved-people" element={<DashboardLayout />} />
            <Route path="/profile" element={<DashboardLayout />} />
            <Route path="/profile/edit" element={<DashboardLayout />} />
            <Route path="/profile/:id" element={<DashboardLayout />} />
            <Route path="/users/:id" element={<DashboardLayout />} />
          </Route>

          {/* Root and Fallback Routes */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
