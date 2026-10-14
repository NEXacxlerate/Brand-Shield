import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Sparkles, Lock, ArrowRight } from 'lucide-react';
import { BrandMark, Wordmark } from '../components/common/BrandMark';
import './ProtectBrandPage.css';

export const ProtectBrandPage: React.FC = () => {
  const navigate = useNavigate();

  const handleProtectBrand = () => {
    navigate('/setup');
  };

  return (
    <div className="protect-brand-screen">
      {/* Top Header */}
      <header className="protect-brand-header">
        <div className="protect-brand-logo">
          <BrandMark size={28} />
          <span className="protect-brand-title">
            <Wordmark upper />
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="protect-brand-main">
        {/* Hero Section */}
        <div className="protect-brand-hero">
          <h1 className="protect-brand-heading">Protect Your Brand</h1>
          <p className="protect-brand-subtitle">
            Choose how you want to get started with BrandShield AI.
          </p>
        </div>

        {/* Action Cards Grid */}
        <div className="protect-brand-grid">
          {/* Option 1: Create a Brand (UI-only, no functionality attached) */}
          <div className="protect-card card-create" data-testid="card-create-brand">
            <div className="protect-card-content">
              <div className="card-icon-box box-purple">
                <Sparkles size={22} strokeWidth={2} />
              </div>

              <div className="card-body">
                <h2 className="card-title">Create a Brand</h2>
                <p className="card-description">Set up a new brand profile.</p>
              </div>

              <div className="card-button-wrap">
                <button
                  type="button"
                  className="btn-card-create"
                  aria-label="Create a Brand"
                  data-testid="btn-create-brand"
                >
                  Create a Brand
                </button>
              </div>
            </div>
          </div>

          {/* Option 2: Protect a Brand (Clickable, navigates to existing setup page) */}
          <div
            className="protect-card card-protect"
            data-testid="card-protect-brand"
            role="button"
            tabIndex={0}
            onClick={handleProtectBrand}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleProtectBrand();
              }
            }}
            aria-label="Protect an existing brand"
          >
            <div className="protect-card-content">
              <div className="card-icon-box box-blue">
                <ShieldCheck size={22} strokeWidth={2} />
              </div>

              <div className="card-body">
                <h2 className="card-title">Protect a Brand</h2>
                <p className="card-description">
                  Configure protection for an existing brand.
                </p>
              </div>

              <div className="card-button-wrap">
                <button
                  type="button"
                  className="btn-card-protect"
                  data-testid="btn-protect-brand"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <span>Protect a Brand</span>
                  <ArrowRight size={16} strokeWidth={2.2} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Security Audit Notice */}
        <div className="protect-audit-notice">
          <Lock size={15} className="protect-lock-icon" />
          <span>
            Enterprise security verified. Zero-trust workspace with cryptographic token validation.
          </span>
        </div>
      </main>

      {/* Atmospheric glowing orbs */}
      <div className="protect-orbs-wrap" aria-hidden="true">
        <div className="protect-orb orb-primary" />
        <div className="protect-orb orb-secondary" />
        <div className="protect-orb orb-tertiary" />
      </div>
    </div>
  );
};
