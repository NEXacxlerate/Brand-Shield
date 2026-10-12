import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  AlertCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { useAppStore } from '../data/store';
import './BrandProfilePage.css';

export const BrandProfilePage: React.FC = () => {
  const {
    brand,
    setBrand,
    officialAccounts,
    officialApps,
    addOfficialAccount,
    removeOfficialAccount,
    addOfficialApp,
    removeOfficialApp,
  } = useAppStore();

  const [companyName, setCompanyName] = useState(brand.name);
  const [industry, setIndustry] = useState(brand.industry);
  const [aliases, setAliases] = useState<string[]>(brand.aliases || []);
  const [newAlias, setNewAlias] = useState('');
  const [keywords, setKeywords] = useState<string[]>(brand.keywords || []);
  const [newKeyword, setNewKeyword] = useState('');
  const [domains, setDomains] = useState<string[]>(brand.domains || []);
  const [newDomain, setNewDomain] = useState('');

  // Add account inputs
  const [accPlatform, setAccPlatform] = useState<'Instagram' | 'X' | 'Facebook' | 'LinkedIn' | 'YouTube'>('Instagram');
  const [accHandle, setAccHandle] = useState('');

  // Add app inputs
  const [showAddApp, setShowAddApp] = useState(false);
  const [appName, setAppName] = useState('');
  const [appPackage, setAppPackage] = useState('');
  const [appPublisher, setAppPublisher] = useState('Acme Bank Ltd');
  const [appStore, setAppStore] = useState('Google Play');

  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleAddAlias = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newAlias.trim()) {
      e.preventDefault();
      if (!aliases.includes(newAlias.trim())) {
        setAliases([...aliases, newAlias.trim()]);
      }
      setNewAlias('');
    }
  };

  const handleAddKeyword = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newKeyword.trim()) {
      e.preventDefault();
      if (!keywords.includes(newKeyword.trim())) {
        setKeywords([...keywords, newKeyword.trim()]);
      }
      setNewKeyword('');
    }
  };

  const handleAddDomain = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newDomain.trim()) {
      e.preventDefault();
      if (!domains.includes(newDomain.trim())) {
        setDomains([...domains, newDomain.trim()]);
      }
      setNewDomain('');
    }
  };

  const handleSaveProfile = () => {
    setBrand((prev) => ({
      ...prev,
      name: companyName,
      industry,
      aliases,
      keywords,
      domains,
    }));
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accHandle.trim()) return;
    addOfficialAccount(accPlatform, accHandle);
    setAccHandle('');
  };

  const handleCreateApp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!appName.trim() || !appPackage.trim()) return;
    addOfficialApp(appName, appPackage, appPublisher, [appStore]);
    setAppName('');
    setAppPackage('');
    setShowAddApp(false);
  };

  return (
    <>
      <Header
        title="Brand Profile"
        subtitle="Tell us what is official. Everything else is compared against it."
      />

      <div className="panel-content">
        <div className="brand-profile-page">
          {/* Main 2-column layout */}
          <div className="profile-layout-grid">
            {/* Left Column: Sections 1, 2, 3 */}
            <div className="profile-sections-col">
              {/* SECTION 1: Brand identity */}
              <div className="card profile-section-card">
                <div className="section-head">
                  <h2 className="section-title">1. Brand identity</h2>
                  <p className="section-desc">
                    Names and keywords are used to find look-alikes. Official domains are used for link checks.
                  </p>
                </div>

                <div className="two-field-row">
                  <div className="form-field">
                    <label className="field-lbl">Company or brand name</label>
                    <input
                      type="text"
                      className="field-input"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label className="field-lbl">Industry (helps avoid false positives)</label>
                    <input
                      type="text"
                      className="field-input"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                    />
                  </div>
                </div>

                {/* Aliases */}
                <div className="form-field">
                  <label className="field-lbl">Aliases and spellings people use</label>
                  <div className="tags-input-container">
                    {aliases.map((alias, i) => (
                      <span key={i} className="interactive-tag-pill">
                        {alias}
                        <button
                          type="button"
                          className="tag-remove"
                          onClick={() => setAliases(aliases.filter((_, idx) => idx !== i))}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      className="inline-tag-input"
                      placeholder="Add an alias and press Enter"
                      value={newAlias}
                      onChange={(e) => setNewAlias(e.target.value)}
                      onKeyDown={handleAddAlias}
                    />
                  </div>
                </div>

                {/* Keywords & Domains */}
                <div className="two-field-row">
                  <div className="form-field">
                    <label className="field-lbl">Keywords to watch</label>
                    <div className="tags-input-container">
                      {keywords.map((kw, i) => (
                        <span key={i} className="interactive-tag-pill">
                          {kw}
                          <button
                            type="button"
                            className="tag-remove"
                            onClick={() => setKeywords(keywords.filter((_, idx) => idx !== i))}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        className="inline-tag-input"
                        placeholder="Add keyword"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyDown={handleAddKeyword}
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <label className="field-lbl">Official domains</label>
                    <div className="tags-input-container">
                      {domains.map((dom, i) => (
                        <span key={i} className="interactive-tag-pill pill-green">
                          {dom}
                          <button
                            type="button"
                            className="tag-remove"
                            onClick={() => setDomains(domains.filter((_, idx) => idx !== i))}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        className="inline-tag-input"
                        placeholder="Add domain"
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value)}
                        onKeyDown={handleAddDomain}
                      />
                    </div>
                  </div>
                </div>

                {/* Official Logo Box */}
                <div className="official-logo-box">
                  <div className="logo-preview-square">A</div>
                  <div className="logo-box-info">
                    <div className="logo-box-title">Official logo</div>
                    <div className="logo-box-desc">
                      Used for logo matching on profile pictures and app icons.
                    </div>
                    <div className="logo-box-specs">
                      ✓ PNG or SVG ✓ 512 × 512 px ✓ 84 KB (max 2 MB) ✓ Square
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => alert('Select a new PNG/SVG file to update brand logo.')}
                  >
                    Replace logo
                  </button>
                </div>
              </div>

              {/* SECTION 2: Official social accounts */}
              <div className="card profile-section-card">
                <div className="section-head-with-badge">
                  <div>
                    <h2 className="section-title">2. Official social accounts</h2>
                    <p className="section-desc">
                      These accounts are excluded from every scan. Matching is by exact handle and URL, never by name alone.
                    </p>
                  </div>
                  <span className="count-allowlist-badge">
                    {officialAccounts.length} accounts on the allowlist
                  </span>
                </div>

                <div className="official-accounts-list">
                  {officialAccounts.map((acc) => (
                    <div key={acc.id} className="official-account-item">
                      <div className="account-item-left">
                        <div className="platform-avatar">
                          {acc.platform.charAt(0)}
                        </div>
                        <div className="account-handle-info">
                          <span className="account-handle-title">
                            {acc.handle} on {acc.platform}
                          </span>
                          <span className="account-url-sub">{acc.url}</span>
                        </div>
                      </div>

                      <div className="account-item-right">
                        <span
                          className={`chip ${
                            acc.status === 'Verified' ? 'chip-green' : 'chip-orange'
                          }`}
                        >
                          {acc.status}
                        </span>
                        <button
                          type="button"
                          className="item-delete-btn"
                          onClick={() => removeOfficialAccount(acc.id)}
                          title="Remove from allowlist"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add account row */}
                <div className="add-account-subform">
                  <div className="subform-title">Add an official account</div>
                  <form onSubmit={handleCreateAccount} className="add-account-row">
                    <div className="add-field-group">
                      <label className="sub-lbl">Platform</label>
                      <select
                        className="field-select"
                        value={accPlatform}
                        onChange={(e) => setAccPlatform(e.target.value as any)}
                      >
                        <option value="Instagram">Instagram</option>
                        <option value="X">X</option>
                        <option value="Facebook">Facebook</option>
                        <option value="LinkedIn">LinkedIn</option>
                        <option value="YouTube">YouTube</option>
                      </select>
                    </div>

                    <div className="add-field-group flex-fill">
                      <label className="sub-lbl">Handle</label>
                      <input
                        type="text"
                        className="field-input"
                        placeholder="@yourbrand"
                        value={accHandle}
                        onChange={(e) => setAccHandle(e.target.value)}
                      />
                    </div>

                    <button type="submit" className="btn-secondary add-btn">
                      Add to allowlist
                    </button>
                  </form>
                  <p className="subform-hint">
                    Enter the exact handle your organization owns.
                  </p>
                </div>
              </div>

              {/* SECTION 3: Official mobile apps */}
              <div className="card profile-section-card">
                <div className="section-head">
                  <h2 className="section-title">3. Official mobile apps</h2>
                  <p className="section-desc">
                    The publisher name is what separates your app from a copy. Apps from any other publisher are scored as suspicious.
                  </p>
                </div>

                <div className="official-apps-table-wrap">
                  <table className="apps-table">
                    <thead>
                      <tr>
                        <th>App</th>
                        <th>Package or bundle ID</th>
                        <th>Publisher</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {officialApps.map((app) => (
                        <tr key={app.id}>
                          <td className="app-name-cell">
                            <div className="app-icon-badge">
                              {app.name.charAt(0)}
                            </div>
                            <div>
                              <div className="app-main-title">{app.name}</div>
                              <div className="app-stores-sub">
                                {app.stores.join(' · ')}
                              </div>
                            </div>
                          </td>
                          <td className="package-id-cell">{app.packageId}</td>
                          <td className="publisher-cell">{app.publisher}</td>
                          <td>
                            <span className="chip chip-green">Verified</span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="item-delete-btn"
                              onClick={() => removeOfficialApp(app.id)}
                              title="Remove app"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {showAddApp && (
                  <form onSubmit={handleCreateApp} className="add-app-popup-box">
                    <div className="two-field-row">
                      <div className="form-field">
                        <label className="field-lbl">App Name</label>
                        <input
                          type="text"
                          className="field-input"
                          placeholder="Acme Pay"
                          value={appName}
                          onChange={(e) => setAppName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-field">
                        <label className="field-lbl">Package or Bundle ID</label>
                        <input
                          type="text"
                          className="field-input"
                          placeholder="com.acme.pay"
                          value={appPackage}
                          onChange={(e) => setAppPackage(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="two-field-row">
                      <div className="form-field">
                        <label className="field-lbl">Publisher</label>
                        <input
                          type="text"
                          className="field-input"
                          value={appPublisher}
                          onChange={(e) => setAppPublisher(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-field">
                        <label className="field-lbl">Store</label>
                        <select
                          className="field-select"
                          value={appStore}
                          onChange={(e) => setAppStore(e.target.value)}
                        >
                          <option value="Google Play">Google Play</option>
                          <option value="App Store">Apple App Store</option>
                        </select>
                      </div>
                    </div>
                    <div className="add-app-actions">
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => setShowAddApp(false)}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary btn-sm">
                        Confirm App
                      </button>
                    </div>
                  </form>
                )}

                <div className="apps-action-row">
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setShowAddApp(true)}
                  >
                    <Plus size={14} />
                    <span>Add an official app</span>
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => alert('Enter App Store or Google Play listing link to import metadata automatically.')}
                  >
                    Import from store listing URL
                  </button>
                </div>
              </div>

              {/* Bottom Save Bar */}
              <div className="profile-bottom-save-bar">
                <span className="save-note-text">
                  Changes are applied to the next scan after you save.
                </span>
                <div className="save-btn-group">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => window.location.reload()}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSaveProfile}
                  >
                    {savedSuccess ? 'Saved successfully ✓' : 'Save brand profile'}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Health, Allowlist stats, Detection guide */}
            <div className="profile-side-col">
              {/* Profile health card */}
              <div className="card side-panel-card">
                <h3 className="side-card-title">Profile health</h3>
                <div className="health-gauge-row">
                  <div className="health-circle-badge">
                    <span className="health-pct-num">86%</span>
                  </div>
                  <div className="health-gauge-text">
                    Good coverage. Fix one unreachable URL to reach 100%.
                  </div>
                </div>

                <div className="health-checklist">
                  <div className="checklist-item ok">
                    <Check size={14} className="chk-icon" />
                    <span>Brand name and aliases</span>
                  </div>
                  <div className="checklist-item ok">
                    <Check size={14} className="chk-icon" />
                    <span>Official logo meets requirements</span>
                  </div>
                  <div className="checklist-item ok">
                    <Check size={14} className="chk-icon" />
                    <span>Official domains added</span>
                  </div>
                  <div className="checklist-item ok">
                    <Check size={14} className="chk-icon" />
                    <span>Apps include publisher names</span>
                  </div>
                  <div className="checklist-item warn">
                    <AlertCircle size={14} className="chk-icon-warn" />
                    <span>YouTube URL could not be reached</span>
                  </div>
                </div>
              </div>

              {/* Allowlist: never flagged */}
              <div className="card side-panel-card">
                <h3 className="side-card-title">Allowlist: never flagged</h3>
                <div className="allowlist-tri-stats">
                  <div className="allowlist-stat">
                    <span className="allowlist-num">{officialAccounts.length}</span>
                    <span className="allowlist-lbl">Accounts</span>
                  </div>
                  <div className="allowlist-stat">
                    <span className="allowlist-num">{officialApps.length}</span>
                    <span className="allowlist-lbl">Apps</span>
                  </div>
                  <div className="allowlist-stat">
                    <span className="allowlist-num">{domains.length}</span>
                    <span className="allowlist-lbl">Domains</span>
                  </div>
                </div>
                <p className="allowlist-explanation">
                  Every detection is checked against this list before it is scored, so your own accounts and apps never reach the review queue.
                </p>
              </div>

              {/* How this profile guides detection */}
              <div className="card side-panel-card">
                <h3 className="side-card-title">How this profile guides detection</h3>
                <div className="guide-steps-list">
                  <div className="guide-step">
                    <span className="guide-step-idx">1</span>
                    <span className="guide-step-text">
                      Search platforms and stores for your names, aliases and keywords.
                    </span>
                  </div>
                  <div className="guide-step">
                    <span className="guide-step-idx">2</span>
                    <span className="guide-step-text">
                      Exclude anything on the allowlist by exact handle, URL or package ID.
                    </span>
                  </div>
                  <div className="guide-step">
                    <span className="guide-step-idx">3</span>
                    <span className="guide-step-text">
                      Compare names, logos, publishers and descriptions with your official ones.
                    </span>
                  </div>
                  <div className="guide-step">
                    <span className="guide-step-idx">4</span>
                    <span className="guide-step-text">
                      Score each match with reasons, then queue it for a person to review.
                    </span>
                  </div>
                </div>

                <Link to="/lookalike" className="guide-bottom-link">
                  Test name variations in the Look-alike Lab →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
