import React, { useEffect, useState } from 'react';
import { BrandMark, Wordmark } from '../components/common/BrandMark';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Target, Users, Database, Lock, Check } from 'lucide-react';
import { ApiError } from '../api/client';
import { sm } from '../api/sm';
import { safeStudioNext } from '../utils/studio';
import '../components/common/States.css';
import './LoginPage.css';
import './RegisterPage.css';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Demo sign-in is opt-in: it only shows when VITE_DEMO_EMAIL and VITE_DEMO_PASSWORD are set (local .env.local, never committed).
  const envDemoEmail = (import.meta.env.VITE_DEMO_EMAIL as string | undefined) || '';
  const envDemoPassword = (import.meta.env.VITE_DEMO_PASSWORD as string | undefined) || '';
  // The server advertises its shared demo account (DEMO_EMAIL / DEMO_PASSWORD on the backend); no password lives in the frontend bundle.
  const [serverDemo, setServerDemo] = useState<{ email: string; password: string } | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    sm.demo(ctl.signal)
      .then((d) => {
        if (!ctl.signal.aborted && d.enabled && d.email && d.password) setServerDemo({ email: d.email, password: d.password });
      })
      .catch(() => undefined); // no demo (or the server is unreachable): the button simply does not show
    return () => ctl.abort();
  }, []);
  const demoEmail = serverDemo?.email || envDemoEmail;
  const demoPassword = serverDemo?.password || envDemoPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email.trim() || !password) {
      setErrorMsg('Enter your work email and password.');
      return;
    }
    setBusy(true);
    try {
      await sm.login(email.trim(), password, keepSignedIn);
      const next = safeStudioNext(location.search); // signed out inside Brand Studio: go back there
      if (next) window.location.assign(next);
      else navigate('/protect-brand', { replace: true });
    } catch (err) {
      // The server's own message is shown: "Incorrect email or password", the 429 rate-limit text, or the network message.
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      {/* Left Column */}
      <div className="login-hero-pane">
        <div className="login-brand-header">
          <BrandMark />
          <span className="login-brand-name"><Wordmark upper /></span>
        </div>

        <div className="login-hero-copy">
          <h1 className="login-hero-title">
            A Safer Digital Space<br />
            for Everyone
          </h1>
          <p className="login-hero-subtitle">
            Find fake social profiles, fake brand pages and look-alike apps that imitate your brand. Your official accounts and apps are never flagged.
          </p>
        </div>

        {/* 3 feature cards */}
        <div className="login-pillars-grid">
          <div className="login-pillar-card">
            <div className="pillar-icon-box pillar-blue">
              <Target size={18} strokeWidth={2} />
            </div>
            <div className="pillar-heading">Explainable scores</div>
            <div className="pillar-detail">Every score lists its reasons.</div>
          </div>

          <div className="login-pillar-card">
            <div className="pillar-icon-box pillar-green">
              <Users size={18} strokeWidth={2} />
            </div>
            <div className="pillar-heading">Human approves</div>
            <div className="pillar-detail">No takedown without a person.</div>
          </div>

          <div className="login-pillar-card">
            <div className="pillar-icon-box pillar-purple">
              <Database size={18} strokeWidth={2} />
            </div>
            <div className="pillar-heading">Evidence kept</div>
            <div className="pillar-detail">Screenshots, URLs and timestamps.</div>
          </div>
        </div>

        {/* Glowing atmospheric orbs */}
        <div className="hero-orbs-wrap" aria-hidden="true">
          <div className="hero-orb orb-1" />
          <div className="hero-orb orb-2" />
          <div className="hero-orb orb-3" />
        </div>
      </div>

      {/* Right Column */}
      <div className="login-form-pane">
        <div className="login-form-box">
          <h2 className="login-form-title">Welcome back</h2>
          <p className="login-form-subtitle">Sign in to your brand protection workspace.</p>

          <form onSubmit={handleSubmit} className="auth-form">
            {from === '/setup' && !errorMsg && (
              <div className="state-inline info" role="status">
                Sign in as an administrator to set up your brand profile.
              </div>
            )}
            {errorMsg && (
              <div className="auth-error-alert" role="alert">
                {errorMsg}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email" className="form-label">Work email</label>
              <input
                id="email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="password" className="form-label">Password</label>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => alert('Password reset by email is not available yet. Ask your administrator to reset your password.')}
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="password"
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>

            <div
              className="checkbox-field"
              onClick={() => setKeepSignedIn(!keepSignedIn)}
              role="checkbox"
              aria-checked={keepSignedIn}
              tabIndex={0}
              onKeyDown={(e) => e.key === ' ' && setKeepSignedIn(!keepSignedIn)}
            >
              <div className={`custom-checkbox ${keepSignedIn ? 'checked' : ''}`}>
                {keepSignedIn && <Check size={13} strokeWidth={3} />}
              </div>
              <span className="checkbox-text">Keep me signed in on this device</span>
            </div>

            {demoEmail && demoPassword && (
              <button
                type="button"
                className="demo-credentials-btn"
                data-testid="demo-credentials"
                onClick={() => {
                  setEmail(demoEmail);
                  setPassword(demoPassword);
                  setErrorMsg(null);
                }}
              >
                Use demo credentials
              </button>
            )}
            {demoEmail && demoPassword && (
              <p className="demo-credentials-note" data-testid="demo-note">
                Shared demo account: anything created with it can be seen by other visitors and may be reset at any time.
              </p>
            )}

            <button type="submit" className="btn-primary auth-submit-btn" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in →'}
            </button>

            <p className="auth-switch">
              New here? <Link to="/register">Create an account</Link>
            </p>

            <div className="auth-audit-notice">
              <Lock size={15} className="notice-lock-icon" />
              <span>
                Sessions use short-lived tokens. Every review action is written to the audit log.
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
