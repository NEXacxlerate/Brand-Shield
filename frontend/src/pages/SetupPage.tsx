import React, { useEffect, useRef, useState } from 'react';
import { BrandMark, Wordmark } from '../components/common/BrandMark';
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck,
  Plus,
  Trash2,
  Smartphone,
  AtSign,
  ArrowRight,
  ArrowLeft,
  Users,
  CheckCircle2
} from 'lucide-react';
import { ApiError } from '../api/client';
import { fmtBytes, sourceStatusLabel } from '../api/format';
import { sm } from '../api/sm';
import type { ScanScope } from '../api/types';
import { ErrorBox, Loading, Notice } from '../components/common/States';
import { useApi } from '../hooks/useApi';
import { refreshBrand, setBrandCache, useBrand } from '../hooks/useBrand';
import { checkLogoFile } from '../utils/logoCheck';
import './SetupPage.css';

const ACCOUNT_PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'x', label: 'X (Twitter)' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'telegram', label: 'Telegram' },
];

const COMMON_INDUSTRIES = [
  'Fintech & Banking',
  'E-Commerce & Retail',
  'Technology & SaaS',
  'Cryptocurrency & Web3',
  'Healthcare & Pharma',
  'Entertainment & Media',
  'Logistics & Delivery',
  'Telecommunications',
];

export const SetupPage: React.FC = () => {
  const navigate = useNavigate();
  const { brand: activeBrand, loading: brandLoading } = useBrand();
  // "?new=1" (Add another brand): start from an empty form and create a brand instead of editing the current one.
  const [params] = useSearchParams();
  const isNew = params.get('new') === '1';
  const [createdNew, setCreatedNew] = useState(false);
  const brand = isNew && !createdNew ? null : activeBrand;
  const [step, setStep] = useState(1);

  // Step 1: Detailed Brand Identity Inputs
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');
  const [aliasesText, setAliasesText] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [domainsText, setDomainsText] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  // Step 2: Official Assets Inputs
  // 2A: Social Accounts
  const [accPlatform, setAccPlatform] = useState('instagram');
  const [accHandle, setAccHandle] = useState('');
  const [accBusy, setAccBusy] = useState(false);
  const [accError, setAccError] = useState<string | null>(null);

  // 2B: Mobile Apps
  const [appName, setAppName] = useState('');
  const [appPackage, setAppPackage] = useState('');
  const [appPublisher, setAppPublisher] = useState('');
  const [appStore, setAppStore] = useState('all');
  const [appBusy, setAppBusy] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);

  // Step 3: First Scan Inputs
  const [scanScope, setScanScope] = useState<ScanScope>('all');
  const [scanDepth, setScanDepth] = useState<'standard' | 'deep'>('standard');
  const [alertEmail, setAlertEmail] = useState('');
  const [runImmediate, setRunImmediate] = useState(true);

  // Status & Error
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Prefill existing brand data if already available
  useEffect(() => {
    if (brand && !prefilled) {
      setCompanyName(brand.name || '');
      setIndustry(brand.industry || '');
      setDescription(brand.description || '');
      setAliasesText((brand.aliases || []).join(', '));
      setKeywordsText((brand.keywords || []).join(', '));
      setDomainsText((brand.domains || []).join(', '));
      if (!appPublisher && brand.name) {
        setAppPublisher(brand.name);
      }
      setPrefilled(true);
    }
  }, [brand, prefilled, appPublisher]);

  const sources = useApi((signal) => sm.sources(signal), [], step === 3);

  const pickLogo = async (file: File | undefined) => {
    setLogoError(null);
    if (!file) return;
    const res = await checkLogoFile(file);
    if (!res.ok) {
      setPendingLogo(null);
      setLogoError(res.error);
      return;
    }
    setPendingLogo(file);
  };

  /** Step 1: Save full Brand Identity */
  const saveBrand = async (): Promise<boolean> => {
    const name = companyName.trim();
    if (!name) {
      setError('Please enter your company or brand name.');
      return false;
    }

    const aliases = aliasesText
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);

    const keywords = keywordsText
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const domains = domainsText
      .split(',')
      .map((d) => d.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, ''))
      .filter(Boolean);

    setBusy(true);
    setError(null);
    try {
      let saved = brand
        ? await sm.updateBrand(brand.id, {
            name,
            industry: industry.trim(),
            description: description.trim(),
            aliases,
            keywords,
            domains,
          })
        : await sm.createBrand({
            name,
            industry: industry.trim(),
            description: description.trim(),
            aliases,
            keywords,
            domains,
          });

      if (pendingLogo) {
        await sm.uploadLogo(saved.id, pendingLogo);
        saved = await sm.brand(saved.id);
        setPendingLogo(null);
      }

      setBrandCache(saved);
      if (isNew) {
        setPrefilled(true);
        setCreatedNew(true);
      }
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the brand profile.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Step 2A: Add Official Social Account */
  const handleAddAccount = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!brand) return;
    const handle = accHandle.trim();
    if (!handle) {
      setAccError('Enter an official account handle or profile username.');
      return;
    }
    setAccBusy(true);
    setAccError(null);
    try {
      await sm.addAccount(brand.id, accPlatform, handle);
      setAccHandle('');
      await refreshBrand();
    } catch (err) {
      setAccError(err instanceof ApiError ? err.message : 'Could not add the account.');
    } finally {
      setAccBusy(false);
    }
  };

  const handleRemoveAccount = async (accId: number) => {
    if (!brand) return;
    try {
      await sm.removeAccount(brand.id, accId);
      await refreshBrand();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove account.');
    }
  };

  /** Step 2B: Add Official Mobile App */
  const handleAddApp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!brand) return;
    const name = appName.trim();
    const pkg = appPackage.trim();
    if (!name || !pkg) {
      setAppError('Please enter both the app name and package/bundle ID.');
      return;
    }
    setAppBusy(true);
    setAppError(null);
    try {
      const stores = appStore === 'all' ? ['google_play', 'apple'] : [appStore];
      await sm.addApp(brand.id, {
        name,
        package_id: pkg,
        publisher: appPublisher.trim() || brand.name,
        stores,
      });
      setAppName('');
      setAppPackage('');
      await refreshBrand();
    } catch (err) {
      setAppError(err instanceof ApiError ? err.message : 'Could not add the app.');
    } finally {
      setAppBusy(false);
    }
  };

  const handleRemoveApp = async (appId: number) => {
    if (!brand) return;
    try {
      await sm.removeApp(brand.id, appId);
      await refreshBrand();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove app.');
    }
  };

  /** Step 3: Launch First Scan */
  const launch = async () => {
    setBusy(true);
    setError(null);
    if (runImmediate) {
      try {
        await sm.startScan(scanScope);
      } catch (e) {
        // 409 = scan already in progress
        if (!(e instanceof ApiError && e.status === 409)) {
          setError(`${e instanceof ApiError ? e.message : 'The scan could not be started.'} You can start it from the dashboard.`);
          setBusy(false);
          return;
        }
      }
    }
    void refreshBrand();
    navigate('/dashboard');
  };

  const handleContinue = async () => {
    setError(null);
    if (step === 1) {
      if (await saveBrand()) {
        setStep(2);
      }
    } else if (step === 2) {
      setStep(3);
    } else {
      await launch();
    }
  };

  const handleBack = () => {
    setError(null);
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const logo = brand?.logo ?? null;
  const officialAccounts = brand?.official_accounts ?? [];
  const officialApps = brand?.official_apps ?? [];

  return (
    <div className="setup-container">
      {/* Top Bar */}
      <header className="setup-topbar">
        <div className="setup-logo">
          <BrandMark />
          <span className="setup-logo-text"><Wordmark /></span>
        </div>
        <NavLink to="/dashboard" className="skip-link">
          Skip setup for now →
        </NavLink>
      </header>

      {/* Hero Header */}
      <div className="setup-hero">
        <h1 className="setup-title">Set up brand protection in three steps</h1>
        <p className="setup-subtitle">
          Configure your genuine brand assets so our AI detection engine knows what to protect and never flags your real presence.
        </p>

        {/* Stepper */}
        <div className="setup-stepper">
          <div
            className={`step-item ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}`}
            onClick={() => setStep(1)}
            role="button"
            tabIndex={0}
          >
            <span className="step-num">{step > 1 ? '✓' : '1'}</span>
            <span className="step-label">Brand Details</span>
          </div>
          <div
            className={`step-item ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}`}
            onClick={() => { if (brand) setStep(2); }}
            role="button"
            tabIndex={0}
          >
            <span className="step-num">{step > 2 ? '✓' : '2'}</span>
            <span className="step-label">Official Assets</span>
          </div>
          <div
            className={`step-item ${step === 3 ? 'active' : ''}`}
            onClick={() => { if (brand) setStep(3); }}
            role="button"
            tabIndex={0}
          >
            <span className="step-num">3</span>
            <span className="step-label">First Scan</span>
          </div>
        </div>
      </div>

      {/* Main Dual-Card Layout */}
      <div className="setup-card-grid">
        {/* Left Side: Step Context & Guidance */}
        <div className="setup-info-card">
          <div className="step-badge">STEP {step} OF 3</div>
          <h2 className="step-heading">
            {step === 1 && 'Brand Identity & Signals'}
            {step === 2 && 'Allowlist Official Assets'}
            {step === 3 && 'First Scan Configuration'}
          </h2>
          <p className="step-description">
            {step === 1 &&
              'Provide comprehensive details about your brand. Names, keywords, domains, and your logo are what impersonators copy and what our scanner uses to spot look-alikes.'}
            {step === 2 &&
              'Add your genuine social handles and official mobile apps. Every item entered here is placed on your strict Allowlist and will never be flagged as a suspicious imitation.'}
            {step === 3 &&
              'Configure the scope and parameters for your initial baseline scan across social platforms, app stores, and threat feeds.'}
          </p>

          <div className="step-callout">
            <ShieldCheck size={20} className="callout-icon" />
            <span>
              {step === 1 && 'Detailed aliases & keywords increase detection accuracy by over 85%.'}
              {step === 2 && 'Strict allowlisting ensures zero false positives against your genuine assets.'}
              {step === 3 && 'Every candidate is analyzed with an explainable breakdown for human review.'}
            </span>
          </div>

          {step === 2 && (
            <div className="setup-summary-statbox">
              <div className="statbox-item">
                <span className="statbox-num">{officialAccounts.length}</span>
                <span className="statbox-lbl">Social Accounts</span>
              </div>
              <div className="statbox-item">
                <span className="statbox-num">{officialApps.length}</span>
                <span className="statbox-lbl">Mobile Apps</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Detailed Step Form */}
        <div className="setup-form-card">
          {/* STEP 1: Detailed Brand Input Fields */}
          {step === 1 && (
            <div className="step-form-content">
              {/* Row 1: Name and Industry */}
              <div className="setup-row-2col">
                <div className="setup-field">
                  <label htmlFor="companyName" className="setup-label">
                    Company or brand name <span className="required-star">*</span>
                  </label>
                  <input data-voice="brand_name"
                    id="companyName"
                    type="text"
                    className="setup-input"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Acme Corp or BrandShield"
                    required
                  />
                </div>

                <div className="setup-field">
                  <label htmlFor="industry" className="setup-label">
                    Industry / Sector
                  </label>
                  <input data-voice="industry"
                    id="industry"
                    type="text"
                    list="industry-suggestions"
                    className="setup-input"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. Fintech & Banking"
                  />
                  <datalist id="industry-suggestions">
                    {COMMON_INDUSTRIES.map((ind) => (
                      <option key={ind} value={ind} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Brand Description */}
              <div className="setup-field">
                <label htmlFor="description" className="setup-label">
                  Brand description & public positioning
                </label>
                <textarea data-voice="description"
                  id="description"
                  className="setup-textarea"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does your company do? Used by AI analysis to calibrate context and eliminate false positives."
                />
              </div>

              {/* Aliases & Alternate Spellings */}
              <div className="setup-field">
                <label htmlFor="aliases" className="setup-label">
                  Aliases, abbreviations & alternate spellings
                </label>
                <input data-voice="aliases"
                  id="aliases"
                  type="text"
                  className="setup-input"
                  value={aliasesText}
                  onChange={(e) => setAliasesText(e.target.value)}
                  placeholder="e.g. Acme, AcmePay, Acme App, AcmeBank (comma-separated)"
                />
                <span className="field-hint">
                  Separate multiple aliases with commas. Impersonators often target variations of your name.
                </span>
              </div>

              {/* Keywords and Domains in 2 Columns */}
              <div className="setup-row-2col">
                <div className="setup-field">
                  <label htmlFor="keywords" className="setup-label">
                    High-risk keywords to watch
                  </label>
                  <input data-voice="keywords"
                    id="keywords"
                    type="text"
                    className="setup-input"
                    value={keywordsText}
                    onChange={(e) => setKeywordsText(e.target.value)}
                    placeholder="support, login, rewards, giveaway, airdrop"
                  />
                  <span className="field-hint">Comma-separated terms commonly used in phishing scams.</span>
                </div>

                <div className="setup-field">
                  <label htmlFor="domains" className="setup-label">
                    Official primary domains
                  </label>
                  <input data-voice="domains"
                    id="domains"
                    type="text"
                    className="setup-input"
                    value={domainsText}
                    onChange={(e) => setDomainsText(e.target.value)}
                    placeholder="acme.com, acmepay.io"
                  />
                  <span className="field-hint">Your genuine website addresses (comma-separated).</span>
                </div>
              </div>

              {/* Logo Upload Box */}
              <div className="setup-field">
                <label className="setup-label">Official brand logo</label>
                <div className="logo-upload-box">
                  <div className="logo-preview-badge">
                    {(companyName || brand?.name || 'A').charAt(0).toUpperCase()}
                  </div>
                  <div className="logo-preview-info">
                    <div className="logo-status-title">
                      {pendingLogo ? 'New logo selected' : logo ? 'Official logo uploaded' : 'Upload official logo'}
                    </div>
                    <div className="logo-meta">
                      {pendingLogo
                        ? `${pendingLogo.name} · ${fmtBytes(pendingLogo.size)} · will be saved on continue`
                        : logo
                        ? `✓ ${logo.format.toUpperCase()} · ${logo.width} × ${logo.height} px · ${fmtBytes(logo.size_bytes)} · ${logo.square ? 'square' : 'not square'}`
                        : 'PNG, JPEG or WebP, at least 256 × 256 px, roughly square, max 2 MB'}
                    </div>
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    data-testid="setup-logo-input"
                    onChange={(e) => {
                      void pickLogo(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className="btn-secondary btn-sm replace-btn"
                    onClick={() => fileInput.current?.click()}
                  >
                    {logo || pendingLogo ? 'Change Logo' : 'Browse File'}
                  </button>
                </div>
                {logoError && <Notice>{logoError}</Notice>}
              </div>
            </div>
          )}

          {/* STEP 2: Detailed Official Assets Inputs (Accounts & Apps) */}
          {step === 2 && (
            <div className="step-form-content">
              {/* SUBSECTION 2A: Official Social Media Accounts */}
              <div className="asset-input-section">
                <div className="section-title-row">
                  <div className="section-title-group">
                    <h3 className="asset-section-title">Official Social Media Profiles</h3>
                    <p className="asset-section-desc">
                      Add your official account handles on each platform to guarantee they are never flagged.
                    </p>
                  </div>
                  <span className="asset-counter-pill">
                    {officialAccounts.length} allowlisted
                  </span>
                </div>

                {/* Add Social Account Input Form */}
                <form onSubmit={handleAddAccount} className="asset-add-inline-form">
                  <div className="asset-field-select-wrap">
                    <label htmlFor="accPlatform" className="sr-only">Platform</label>
                    <select data-voice="account_platform"
                      id="accPlatform"
                      className="setup-select"
                      value={accPlatform}
                      onChange={(e) => setAccPlatform(e.target.value)}
                    >
                      {ACCOUNT_PLATFORMS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="asset-field-input-wrap">
                    <label htmlFor="accHandle" className="sr-only">Handle</label>
                    <div className="input-with-icon">
                      <AtSign size={16} className="input-leading-icon" />
                      <input data-voice="account_handle"
                        id="accHandle"
                        type="text"
                        className="setup-input pl-icon"
                        placeholder="official_handle (e.g. @acmebank)"
                        value={accHandle}
                        onChange={(e) => setAccHandle(e.target.value)}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn-secondary asset-add-btn"
                    disabled={accBusy || !accHandle.trim()}
                  >
                    <Plus size={16} />
                    <span>{accBusy ? 'Adding…' : 'Add Account'}</span>
                  </button>
                </form>
                {accError && <Notice onClose={() => setAccError(null)}>{accError}</Notice>}

                {/* Live List of Added Official Accounts */}
                <div className="asset-items-list" data-testid="accounts-list">
                  {officialAccounts.length === 0 ? (
                    <div className="empty-assets-note">
                      No official social accounts added yet. Add your genuine handles above.
                    </div>
                  ) : (
                    officialAccounts.map((acc) => (
                      <div key={acc.id} className="asset-row-card">
                        <div className="asset-row-left">
                          <span className="platform-tag">{acc.platform}</span>
                          <span className="asset-handle-text">{acc.handle}</span>
                        </div>
                        <div className="asset-row-right">
                          <span className="chip-allowlist">✓ Allowlisted</span>
                          <button
                            type="button"
                            className="btn-icon-danger"
                            onClick={() => void handleRemoveAccount(acc.id)}
                            title={`Remove ${acc.handle}`}
                            aria-label={`Remove ${acc.handle}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* SUBSECTION 2B: Official Mobile Apps */}
              <div className="asset-input-section mt-4">
                <div className="section-title-row">
                  <div className="section-title-group">
                    <h3 className="asset-section-title">Official Mobile Apps</h3>
                    <p className="asset-section-desc">
                      Protect against copycat and malicious clone apps on Google Play and Apple App Store.
                    </p>
                  </div>
                  <span className="asset-counter-pill">
                    {officialApps.length} allowlisted
                  </span>
                </div>

                {/* Add Mobile App Input Form */}
                <form onSubmit={handleAddApp} className="app-add-form-grid">
                  <div className="setup-field">
                    <label htmlFor="appName" className="setup-sublabel">App Display Name</label>
                    <input data-voice="app_name"
                      id="appName"
                      type="text"
                      className="setup-input input-sm"
                      placeholder="e.g. Acme Mobile Banking"
                      value={appName}
                      onChange={(e) => setAppName(e.target.value)}
                    />
                  </div>

                  <div className="setup-field">
                    <label htmlFor="appPackage" className="setup-sublabel">Package / Bundle ID</label>
                    <input data-voice="app_package"
                      id="appPackage"
                      type="text"
                      className="setup-input input-sm"
                      placeholder="e.g. com.acme.banking or id123456"
                      value={appPackage}
                      onChange={(e) => setAppPackage(e.target.value)}
                    />
                  </div>

                  <div className="setup-field">
                    <label htmlFor="appPublisher" className="setup-sublabel">Publisher Name</label>
                    <input data-voice="app_publisher"
                      id="appPublisher"
                      type="text"
                      className="setup-input input-sm"
                      placeholder="e.g. Acme Financial Inc"
                      value={appPublisher}
                      onChange={(e) => setAppPublisher(e.target.value)}
                    />
                  </div>

                  <div className="setup-field">
                    <label htmlFor="appStore" className="setup-sublabel">Marketplace</label>
                    <div className="app-store-add-row">
                      <select data-voice="app_store"
                        id="appStore"
                        className="setup-select select-sm"
                        value={appStore}
                        onChange={(e) => setAppStore(e.target.value)}
                      >
                        <option value="all">Google Play & App Store</option>
                        <option value="google_play">Google Play Only</option>
                        <option value="apple">Apple App Store Only</option>
                      </select>
                      <button
                        type="submit"
                        className="btn-secondary asset-add-btn"
                        disabled={appBusy || !appName.trim() || !appPackage.trim()}
                      >
                        <Plus size={16} />
                        <span>{appBusy ? 'Adding…' : 'Add App'}</span>
                      </button>
                    </div>
                  </div>
                </form>
                {appError && <Notice onClose={() => setAppError(null)}>{appError}</Notice>}

                {/* Live List of Added Official Apps */}
                <div className="asset-items-list" data-testid="apps-list">
                  {officialApps.length === 0 ? (
                    <div className="empty-assets-note">
                      No official mobile apps added yet (optional if your brand operates web-only).
                    </div>
                  ) : (
                    officialApps.map((a) => (
                      <div key={a.id} className="asset-row-card">
                        <div className="asset-row-left">
                          <Smartphone size={16} className="text-muted" />
                          <div className="asset-app-info">
                            <span className="asset-app-name">{a.name}</span>
                            <span className="asset-app-pkg">{a.package_id} · {a.publisher}</span>
                          </div>
                        </div>
                        <div className="asset-row-right">
                          <span className="chip-allowlist">✓ Verified App</span>
                          <button
                            type="button"
                            className="btn-icon-danger"
                            onClick={() => void handleRemoveApp(a.id)}
                            title={`Remove ${a.name}`}
                            aria-label={`Remove ${a.name}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Detailed First Scan Controls & Parameters */}
          {step === 3 && (
            <div className="step-form-content">
              {/* Scan Scope Radio Cards */}
              <div className="setup-field">
                <label className="setup-label">Select initial scan scope</label>
                <div className="scan-scope-cards-grid">
                  <div
                    className={`scan-scope-card ${scanScope === 'all' ? 'selected' : ''}`}
                    onClick={() => setScanScope('all')}
                    role="radio"
                    aria-checked={scanScope === 'all'}
                    tabIndex={0}
                  >
                    <div className="scope-card-icon-box">
                      <ShieldCheck size={22} />
                    </div>
                    <div className="scope-card-text">
                      <div className="scope-card-title">Full Coverage (Recommended)</div>
                      <div className="scope-card-desc">
                        Scan social networks, app stores, and public threat feeds simultaneously.
                      </div>
                    </div>
                    <div className="scope-radio-dot">
                      {scanScope === 'all' && <div className="dot-inner" />}
                    </div>
                  </div>

                  <div
                    className={`scan-scope-card ${scanScope === 'social' ? 'selected' : ''}`}
                    onClick={() => setScanScope('social')}
                    role="radio"
                    aria-checked={scanScope === 'social'}
                    tabIndex={0}
                  >
                    <div className="scope-card-icon-box">
                      <Users size={22} />
                    </div>
                    <div className="scope-card-text">
                      <div className="scope-card-title">Social Profiles & Impersonators</div>
                      <div className="scope-card-desc">
                        Target Instagram, X, Facebook, LinkedIn, YouTube for imitation accounts.
                      </div>
                    </div>
                    <div className="scope-radio-dot">
                      {scanScope === 'social' && <div className="dot-inner" />}
                    </div>
                  </div>

                  <div
                    className={`scan-scope-card ${scanScope === 'apps' ? 'selected' : ''}`}
                    onClick={() => setScanScope('apps')}
                    role="radio"
                    aria-checked={scanScope === 'apps'}
                    tabIndex={0}
                  >
                    <div className="scope-card-icon-box">
                      <Smartphone size={22} />
                    </div>
                    <div className="scope-card-text">
                      <div className="scope-card-title">Mobile App Marketplaces</div>
                      <div className="scope-card-desc">
                        Hunt for copycat apps and publisher squatters on App Store & Google Play.
                      </div>
                    </div>
                    <div className="scope-radio-dot">
                      {scanScope === 'apps' && <div className="dot-inner" />}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scan Configuration Rows */}
              <div className="setup-row-2col">
                <div className="setup-field">
                  <label htmlFor="scanDepth" className="setup-label">Scan Analysis Mode</label>
                  <select data-voice="scan_depth"
                    id="scanDepth"
                    className="setup-select"
                    value={scanDepth}
                    onChange={(e) => setScanDepth(e.target.value as 'standard' | 'deep')}
                  >
                    <option value="standard">Standard Triage (Fast, high-confidence matches)</option>
                    <option value="deep">Deep Forensic Discovery (Exhaustive query chain & logo OCR)</option>
                  </select>
                </div>

                <div className="setup-field">
                  <label htmlFor="alertEmail" className="setup-label">Alert recipient email (optional)</label>
                  <input data-voice="alert_email"
                    id="alertEmail"
                    type="email"
                    className="setup-input"
                    placeholder="security-alerts@yourbrand.com"
                    value={alertEmail}
                    onChange={(e) => setAlertEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Active Intelligence Sources Preview */}
              <div className="setup-field">
                <label className="setup-label">Active intelligence sources ready to query</label>
                <div className="setup-scan-preview">
                  {sources.loading && <Loading what="Verifying collector engines…" />}
                  {sources.error && <ErrorBox error={sources.error} onRetry={sources.reload} compact />}
                  {sources.data && (
                    <>
                      <div className="setup-scan-sources-wrap">
                        {sources.data.items.map((s) => (
                          <div key={s.id} className="source-health-chip">
                            <span className="source-status-bulb" />
                            <span className="source-chip-name">{s.name}</span>
                            <span className="source-chip-type">({sourceStatusLabel(s.status)})</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Immediate Scan Toggle */}
              <div
                className="checkbox-field"
                onClick={() => setRunImmediate(!runImmediate)}
                role="checkbox"
                aria-checked={runImmediate}
                tabIndex={0}
              >
                <div className={`custom-checkbox ${runImmediate ? 'checked' : ''}`}>
                  {runImmediate && <CheckCircle2 size={14} />}
                </div>
                <span className="checkbox-text">
                  Execute first discovery scan immediately upon completion
                </span>
              </div>
            </div>
          )}

          {error && <Notice>{error}</Notice>}

          {/* Action Footer Navigation (Back / Continue) */}
          <div className="setup-action-footer">
            {step > 1 ? (
              <button
                type="button"
                className="btn-secondary setup-back-btn"
                onClick={handleBack}
                disabled={busy}
              >
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
            ) : <div />}

            <button
              type="button"
              className="btn-primary continue-btn"
              onClick={() => void handleContinue()}
              disabled={busy || (step === 1 && brandLoading)}
              data-testid="setup-continue-btn"
            >
              <span>
                {busy
                  ? (step === 3 ? 'Starting Scan…' : 'Saving Profile…')
                  : step < 3
                  ? 'Continue to Next Step'
                  : 'Start First Scan & Open Dashboard'}
              </span>
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
