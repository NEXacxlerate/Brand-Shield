import React, { useCallback, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Target, Users, Database, Lock, Check, Eye, EyeOff, X, Circle, ArrowLeft } from 'lucide-react';
import { BrandMark, Wordmark } from '../components/common/BrandMark';
import { ApiError } from '../api/client';
import { sm } from '../api/sm';
import { safeStudioNext } from '../utils/studio';
import { checkPassword, passwordProblem } from '../utils/passwordPolicy';
import '../components/common/States.css';
import './LoginPage.css';
import './RegisterPage.css';

export const DUPLICATE_EMAIL_MESSAGE = 'An account with this email already exists.';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [disabledMsg, setDisabledMsg] = useState<string | null>(null);

  const checks = checkPassword(password, name, email);
  const mismatch = confirm !== '' && confirm !== password;

  const validateFields = useCallback((): Record<string, string> => {
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const local: Record<string, string> = {};
    if (!cleanName) local.name = 'Enter your name.';
    else if (cleanName.length > 80) local.name = 'Name must be 1 to 80 characters.';
    if (!cleanEmail) {
      local.email = 'Enter your email.';
    } else if (!cleanEmail.includes('@')) {
      local.email = 'Enter a valid email address.';
    }
    const problem = passwordProblem(password, cleanName, cleanEmail);
    if (problem) local.password = problem;
    if (password !== confirm) local.confirm = 'The two passwords do not match.';
    return local;
  }, [name, email, password, confirm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFieldErrors({});
    const local = validateFields();
    if (Object.keys(local).length) { setFieldErrors(local); return; }

    setBusy(true);
    try {
      await sm.register(name.trim(), email.trim(), password, keepSignedIn);
      const next = safeStudioNext(location.search);
      if (next) window.location.assign(next);
      else navigate('/protect-brand', { replace: true });
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setErrorMsg('Failed to create the account. Please try again.');
      } else if (err.status === 403) {
        setDisabledMsg(err.message || 'Sign-up is disabled');
      } else if (err.status === 409) {
        setFieldErrors({ email: DUPLICATE_EMAIL_MESSAGE });
        setErrorMsg(DUPLICATE_EMAIL_MESSAGE);
      } else if (err.status === 422) {
        setFieldErrors(err.fields ?? {});
        setErrorMsg(Object.keys(err.fields ?? {}).length ? 'Please fix the highlighted fields.' : (err.message || 'Please fix the highlighted fields.'));
      } else if (err.status === 429) {
        setErrorMsg(err.retryAfter ? `Too many sign-up attempts. Try again in ${err.retryAfter} seconds.` : 'Too many sign-up attempts. Try again later.');
      } else {
        setErrorMsg(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const toggle = (shown: boolean, set: (v: boolean) => void, what: string) => (
    <button type="button" className="pw-toggle" onClick={() => set(!shown)} aria-label={`${shown ? 'Hide' : 'Show'} ${what}`} aria-pressed={shown}>
      {shown ? <EyeOff size={17} /> : <Eye size={17} />}
    </button>
  );

  return (
    <div className="login-screen">
      <div className="login-hero-pane">
        <div className="login-brand-header">
          <BrandMark />
          <span className="login-brand-name"><Wordmark upper /></span>
        </div>

        <div className="login-hero-copy">
          <h1 className="login-hero-title">
            Protect your brand<br />
            from day one
          </h1>
          <p className="login-hero-subtitle">
            Create your account, design your brand in Brand Studio, then let BrandShield watch for fake profiles, fake pages and look-alike apps.
          </p>
        </div>

        <div className="login-pillars-grid">
          <div className="login-pillar-card">
            <div className="pillar-icon-box pillar-blue"><Target size={18} strokeWidth={2} /></div>
            <div className="pillar-heading">Explainable scores</div>
            <div className="pillar-detail">Every score lists its reasons.</div>
          </div>
          <div className="login-pillar-card">
            <div className="pillar-icon-box pillar-green"><Users size={18} strokeWidth={2} /></div>
            <div className="pillar-heading">Human approves</div>
            <div className="pillar-detail">No takedown without a person.</div>
          </div>
          <div className="login-pillar-card">
            <div className="pillar-icon-box pillar-purple"><Database size={18} strokeWidth={2} /></div>
            <div className="pillar-heading">Evidence kept</div>
            <div className="pillar-detail">Screenshots, URLs and timestamps.</div>
          </div>
        </div>

        <div className="hero-orbs-wrap" aria-hidden="true">
          <div className="hero-orb orb-1" />
          <div className="hero-orb orb-2" />
          <div className="hero-orb orb-3" />
        </div>
      </div>

      <div className="login-form-pane">
        <Link to="/" className="login-back" data-testid="back-to-home">
          <ArrowLeft size={16} /> Back to home
        </Link>
        <div className="login-form-box">
          <h2 className="login-form-title">Create your account</h2>
          <p className="login-form-subtitle">One login for BrandShield and Brand Studio.</p>

          {disabledMsg ? (
            <div className="auth-form">
              <div className="auth-error-alert" role="alert" data-testid="signup-disabled">
                {disabledMsg}. Ask your administrator to create an account for you.
              </div>
              <p className="auth-switch">
                Already have an account? <Link to="/login">Sign in</Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="auth-form" noValidate>
              {errorMsg && (
                <div className="auth-error-alert" role="alert">{errorMsg}</div>
              )}

              <div className="form-group">
                <label htmlFor="reg-name" className="form-label">Full name</label>
                <input id="reg-name" type="text" className="form-input" value={name}
                  onChange={(e) => setName(e.target.value)} placeholder="Rita Shah"
                  autoComplete="name" maxLength={80} aria-invalid={!!fieldErrors.name} />
                {fieldErrors.name && <div className="field-error">{fieldErrors.name}</div>}
              </div>

              <div className="form-group">
                <label htmlFor="reg-email" className="form-label">Email</label>
                <input id="reg-email" type="email" className="form-input" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                  autoComplete="email" aria-invalid={!!fieldErrors.email} />
                {fieldErrors.email && <div className="field-error">{fieldErrors.email}</div>}
              </div>

              <div className="form-group">
                <label htmlFor="reg-password" className="form-label">Password</label>
                <div className="pw-field">
                  <input id="reg-password" type={showPw ? 'text' : 'password'} className="form-input"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 10 characters" autoComplete="new-password"
                    aria-describedby="pw-hints" aria-invalid={!!fieldErrors.password} />
                  {toggle(showPw, setShowPw, 'password')}
                </div>
                {fieldErrors.password && <div className="field-error">{fieldErrors.password}</div>}
                <ul className="pw-hints" id="pw-hints" data-testid="pw-hints">
                  {checks.map((c) => {
                    const state = password === '' ? 'idle' : c.ok ? 'ok' : 'bad';
                    return (
                      <li key={c.key} className={`pw-hint ${state}`} data-state={state}>
                        {state === 'ok' ? <Check size={13} strokeWidth={3} /> : state === 'bad' ? <X size={13} strokeWidth={3} /> : <Circle size={11} />}
                        <span>{c.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="form-group">
                <label htmlFor="reg-confirm" className="form-label">Confirm password</label>
                <div className="pw-field">
                  <input id="reg-confirm" type={showConfirm ? 'text' : 'password'} className="form-input"
                    value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Type the password again" autoComplete="new-password"
                    aria-invalid={mismatch || !!fieldErrors.confirm} />
                  {toggle(showConfirm, setShowConfirm, 'confirmation')}
                </div>
                {(mismatch || fieldErrors.confirm) && (
                  <div className="field-error">The two passwords do not match.</div>
                )}
              </div>

              <div
                className="checkbox-field"
                onClick={() => setKeepSignedIn(!keepSignedIn)}
                role="checkbox" aria-checked={keepSignedIn} tabIndex={0}
                onKeyDown={(e) => e.key === ' ' && setKeepSignedIn(!keepSignedIn)}
              >
                <div className={`custom-checkbox ${keepSignedIn ? 'checked' : ''}`}>
                  {keepSignedIn && <Check size={13} strokeWidth={3} />}
                </div>
                <span className="checkbox-text">Keep me signed in on this device</span>
              </div>

              <button type="submit" className="btn-primary auth-submit-btn" disabled={busy}>
                {busy ? 'Creating account…' : 'Create account →'}
              </button>

              <p className="auth-switch">
                Already have an account? <Link to="/login">Sign in</Link>
              </p>

              <div className="auth-audit-notice">
                <Lock size={15} className="notice-lock-icon" />
                <span>Every review action is written to the audit log.</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
