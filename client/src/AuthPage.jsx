import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, ArrowRight, Check, Compass, Eye, EyeOff, MessageCircle, Sparkles, Video } from 'lucide-react';
import api from './api';
import { useAuth } from './AuthContext';

export default function AuthPage({ initialMode = 'login' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();

  const isRegister = initialMode === 'register' || location.pathname === '/register';
  const [authError, setAuthError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form submit handler
  async function handleSubmit(e) {
    e.preventDefault();
    setAuthError('');
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const mode = isRegister ? 'register' : 'login';

    try {
      const { data } = await api.post(`/auth/${mode}`, Object.fromEntries(form));
      login(data.token, data.user);
      navigate('/discover', { replace: true });
    } catch (err) {
      setAuthError(err.response?.data?.message || 'Could not connect. Check that the server is running.');
    } finally {
      setSubmitting(false);
    }
  }

  // Quick 1-click demo login
  async function loginAsDemo(email) {
    setAuthError('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/login', { email, password: 'PeerzaDemo2025!' });
      login(data.token, data.user);
      navigate('/discover', { replace: true });
    } catch (err) {
      setAuthError(err.response?.data?.message || 'Demo login failed. Make sure demo accounts are seeded.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page-shell">
      <div className="auth-page-container">
        {/* Brand & Introduction */}
        <div className="auth-page-hero">
          <div className="brand" style={{ padding: 0 }}>
            <span className="brand-mark">
              <ArrowLeftRight size={20} />
            </span>
            peerza<span className="brand-dot">.</span>
          </div>

          <div className="eyebrow" style={{ marginTop: '28px' }}>
            <span className="eyebrow-spark">✳</span> PEER SKILL EXCHANGE
          </div>

          <h1>
            Trade what you know.
            <br />
            <span>Learn what you don't.</span>
          </h1>

          <p className="intro" style={{ maxWidth: '440px', marginTop: '12px' }}>
            Peerza connects curious learners for one-to-one skill swaps, real-time messaging, and interactive video calls.
          </p>

          <div className="auth-feature-pills">
            <span>
              <Compass size={14} /> Complementary Matching
            </span>
            <span>
              <MessageCircle size={14} /> Real-Time Chat
            </span>
            <span>
              <Video size={14} /> Jitsi Video Calling
            </span>
          </div>

          {/* Quick Demo Sign-in */}
          <div className="auth-demo-box">
            <div className="auth-demo-title">
              <Sparkles size={14} /> Explore Instantly with Demo Accounts:
            </div>
            <div className="auth-demo-buttons">
              <button
                type="button"
                className="demo-btn"
                disabled={submitting}
                onClick={() => loginAsDemo('maya@peerza.demo')}
              >
                <b>Maya Chen</b>
                <small>Design / Figma</small>
              </button>
              <button
                type="button"
                className="demo-btn"
                disabled={submitting}
                onClick={() => loginAsDemo('jordan@peerza.demo')}
              >
                <b>Jordan Lee</b>
                <small>React / Tech</small>
              </button>
              <button
                type="button"
                className="demo-btn"
                disabled={submitting}
                onClick={() => loginAsDemo('amina@peerza.demo')}
              >
                <b>Amina Yusuf</b>
                <small>Illustration / Art</small>
              </button>
            </div>
          </div>
        </div>

        {/* Public Authentication Card */}
        <div className="auth-page-card">
          <div className="section-kicker">
            <span /> {isRegister ? 'JOIN THE COMMUNITY' : 'WELCOME BACK'}
          </div>

          <h2>{isRegister ? 'Come as you are.' : 'Sign in to Peerza.'}</h2>
          <p>
            {isRegister
              ? 'A skill you know could be someone else’s big breakthrough.'
              : 'Your skill swaps, messages, and progress are right where you left them.'}
          </p>

          <form onSubmit={handleSubmit}>
            {isRegister && (
              <label>
                Your name
                <input name="name" placeholder="How should we call you?" required maxLength="80" />
              </label>
            )}

            <label>
              Email address
              <input name="email" type="email" placeholder="you@example.com" required />
            </label>

            <label>
              Password
              <div className="password-input-wrap">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  minLength="8"
                  placeholder="At least 8 characters"
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {authError && <div className="form-error">{authError}</div>}

            <button className="primary-button full-button" disabled={submitting}>
              {submitting ? 'Connecting…' : isRegister ? 'Create your account' : 'Sign in'}{' '}
              <ArrowRight size={16} />
            </button>
          </form>

          <div className="auth-switch">
            {isRegister ? 'Already part of Peerza?' : 'New around here?'}{' '}
            <Link
              to={isRegister ? '/login' : '/register'}
              onClick={() => {
                setAuthError('');
                setShowPassword(false);
              }}
            >
              {isRegister ? 'Sign in' : 'Create an account'}
            </Link>
          </div>

          <div className="auth-footnote">
            <Check size={14} /> Your data and privacy stay yours. Always.
          </div>
        </div>
      </div>
    </div>
  );
}
