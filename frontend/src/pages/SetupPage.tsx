import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Shield, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../data/store';
import './SetupPage.css';

export const SetupPage: React.FC = () => {
  const navigate = useNavigate();
  const { brand, setBrand } = useAppStore();
  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState(brand.name || 'Acme Bank');
  const [aliasesText, setAliasesText] = useState(
    brand.aliases && brand.aliases.length > 0
      ? brand.aliases.join(', ')
      : 'Acme, AcmeBank, Acme Bank India'
  );

  const handleContinue = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      // Update store
      const splitAliases = aliasesText
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      setBrand((prev) => ({
        ...prev,
        name: companyName,
        aliases: splitAliases,
      }));
      navigate('/dashboard');
    }
  };

  return (
    <div className="setup-container">
      {/* Top Bar */}
      <header className="setup-topbar">
        <div className="setup-logo">
          <div className="logo-shield">
            <Shield size={18} strokeWidth={2.4} />
          </div>
          <span className="setup-logo-text">ScamMind AI</span>
        </div>
        <NavLink to="/dashboard" className="skip-link">
          Skip setup for now
        </NavLink>
      </header>

      {/* Hero Header */}
      <div className="setup-hero">
        <h1 className="setup-title">Set up brand protection in three steps</h1>
        <p className="setup-subtitle">
          Tell us what is official. We will find everything that is not.
        </p>

        {/* Stepper */}
        <div className="setup-stepper">
          <div className={`step-item ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}`}>
            <span className="step-num">1</span>
            <span className="step-label">Brand</span>
          </div>
          <div className={`step-item ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}`}>
            <span className="step-num">2</span>
            <span className="step-label">Official assets</span>
          </div>
          <div className={`step-item ${step === 3 ? 'active' : ''}`}>
            <span className="step-num">3</span>
            <span className="step-label">First scan</span>
          </div>
        </div>
      </div>

      {/* Main Dual-Card Layout */}
      <div className="setup-card-grid">
        {/* Left Side: Step Details */}
        <div className="setup-info-card">
          <div className="step-badge">STEP {step} OF 3</div>
          <h2 className="step-heading">
            {step === 1 && 'Name your brand'}
            {step === 2 && 'List official assets'}
            {step === 3 && 'Start your first scan'}
          </h2>
          <p className="step-description">
            {step === 1 &&
              'Your name and logo are what impersonators copy. We use them to spot profiles, pages and apps that look like yours.'}
            {step === 2 &&
              'Add your official social accounts, app packages and domains so our engine never flags your genuine presence.'}
            {step === 3 &&
              'Scan all supported social platforms and app marketplaces to uncover live impostors and unauthorized listings.'}
          </p>

          <div className="step-callout">
            <ShieldCheck size={20} className="callout-icon" />
            <span>Anything you list as official is never flagged.</span>
          </div>
        </div>

        {/* Right Side: Step Form */}
        <div className="setup-form-card">
          {step === 1 && (
            <div className="step-form-content">
              <div className="setup-field">
                <label htmlFor="companyName" className="setup-label">
                  Company or brand name
                </label>
                <input
                  id="companyName"
                  type="text"
                  className="setup-input"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Bank"
                />
              </div>

              <div className="setup-field">
                <label htmlFor="aliases" className="setup-label">
                  Other names people use (optional)
                </label>
                <input
                  id="aliases"
                  type="text"
                  className="setup-input"
                  value={aliasesText}
                  onChange={(e) => setAliasesText(e.target.value)}
                  placeholder="Acme, AcmeBank, Acme Bank India"
                />
              </div>

              <div className="logo-upload-box">
                <div className="logo-preview-badge">A</div>
                <div className="logo-preview-info">
                  <div className="logo-status-title">Official logo uploaded</div>
                  <div className="logo-meta">✓ PNG · 512 × 512 · 84 KB · square</div>
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-sm replace-btn"
                  onClick={() => alert('Select a new logo PNG/SVG to upload.')}
                >
                  Replace
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="step-form-content">
              <div className="setup-field">
                <label className="setup-label">Official Accounts Verified</label>
                <div className="mini-account-pill-list">
                  <span className="mini-pill">@acmebank (Instagram)</span>
                  <span className="mini-pill">@AcmeBank (X)</span>
                  <span className="mini-pill">acmebank (Facebook)</span>
                </div>
              </div>
              <div className="setup-field">
                <label className="setup-label">Official Mobile Apps</label>
                <div className="mini-account-pill-list">
                  <span className="mini-pill">Acme Bank Mobile (com.acmebank.mobile)</span>
                  <span className="mini-pill">Acme UPI (com.acmebank.upi)</span>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="step-form-content">
              <div className="setup-scan-preview">
                <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', marginBottom: '14px' }}>
                  Ready to scan 8 threat intelligence sources including Instagram, X, Facebook, Google Play, and Telegram.
                </p>
                <div className="setup-scan-sources">
                  <span className="source-dot-pill">Instagram Online</span>
                  <span className="source-dot-pill">Google Play Online</span>
                  <span className="source-dot-pill">X Online</span>
                </div>
              </div>
            </div>
          )}

          <div className="setup-action-footer">
            <button
              type="button"
              className="btn-primary continue-btn"
              onClick={handleContinue}
            >
              {step < 3 ? 'Continue' : 'Launch Protection Dashboard'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
