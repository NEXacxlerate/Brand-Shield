import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  RotateCw,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { useAppStore } from '../data/store';
import './AppStoreMonitoringPage.css';

export const AppStoreMonitoringPage: React.FC = () => {
  const { detections, updateDetectionStatus, markAsOfficial } = useAppStore();

  const appDetections = detections.filter((d) => d.category === 'apps');
  const [storeFilter, setStoreFilter] = useState<'all' | 'Google Play' | 'App Store' | 'Third-party APK'>('all');
  const [selectedId, setSelectedId] = useState<string>('det-2');
  const [scanning, setScanning] = useState(false);

  const filtered = appDetections.filter((d) => {
    if (storeFilter === 'all') return true;
    return d.platform === storeFilter;
  });

  const selected = appDetections.find((d) => d.id === selectedId) || appDetections[0];

  const handleScanStores = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      alert('App store scan complete: 368 APK listings reviewed across 3 marketplaces.');
    }, 1200);
  };

  return (
    <>
      <Header
        title="App Store Monitoring"
        subtitle="Apps that copy the Acme Bank name, icon, publisher or description"
      />

      <div className="panel-content">
        <div className="appstore-page-wrap">
          {/* Top Sources Bar */}
          <div className="sources-status-bar">
            <div className="sources-pills-row">
              <span className="source-lbl">Sources</span>
              <span className="source-pill">
                <span className="src-dot dot-green" />Google Play
              </span>
              <span className="source-pill alert-red">
                <span className="src-dot dot-red" />Apple App Store · unavailable
              </span>
              <span className="source-pill">
                <span className="src-dot dot-green" />Third-party APK sites
              </span>
            </div>

            <div className="source-warning-box red-warn">
              <AlertTriangle size={14} className="warn-icon-red" />
              <span>
                App Store is unreachable. Showing cached results from 12 Oct, 9:40 AM.{' '}
                <button
                  type="button"
                  className="retry-inline-btn"
                  onClick={() => alert('Retrying Apple App Store scrape worker...')}
                >
                  Retry
                </button>
              </span>
            </div>
          </div>

          {/* Filters & Scan Action */}
          <div className="filters-action-bar">
            <div className="filter-tabs-group">
              <button
                type="button"
                className={`filter-tab ${storeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setStoreFilter('all')}
              >
                All stores 5
              </button>
              <button
                type="button"
                className={`filter-tab ${storeFilter === 'Google Play' ? 'active' : ''}`}
                onClick={() => setStoreFilter('Google Play')}
              >
                Google Play 3
              </button>
              <button
                type="button"
                className={`filter-tab ${storeFilter === 'App Store' ? 'active' : ''}`}
                onClick={() => setStoreFilter('App Store')}
              >
                App Store 1
              </button>
              <button
                type="button"
                className={`filter-tab ${storeFilter === 'Third-party APK' ? 'active' : ''}`}
                onClick={() => setStoreFilter('Third-party APK')}
              >
                Third-party APK 1
              </button>
            </div>

            <button
              type="button"
              className="btn-primary scan-btn"
              onClick={handleScanStores}
              disabled={scanning}
            >
              <RotateCw size={14} className={scanning ? 'spin' : ''} />
              <span>{scanning ? 'Scanning…' : 'Scan app stores now'}</span>
            </button>
          </div>

          {/* Main 2-Column Split */}
          <div className="appstore-main-grid">
            {/* Left Suspicious Apps List */}
            <div className="card detections-list-card">
              <div className="panel-card-head">
                <h3 className="panel-card-title">Suspicious apps</h3>
                <span className="sort-hint">Sorted by risk</span>
              </div>

              <div className="detections-scroll-list">
                {filtered.map((item) => (
                  <div
                    key={item.id}
                    className={`detection-row-card ${selected?.id === item.id ? 'active' : ''}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div className="detection-row-left">
                      <div className="app-icon-squircle">A</div>
                      <div className="detection-row-meta">
                        <div className="detection-row-name">{item.name}</div>
                        <div className="detection-row-handle">
                          {item.publisher || 'Unknown'} · {item.platform}
                        </div>
                      </div>
                    </div>

                    <div className="detection-row-right">
                      <span className="score-val">{item.score}</span>
                      <span
                        className={`chip ${
                          item.status === 'New'
                            ? 'chip-blue'
                            : item.status === 'Reviewing'
                            ? 'chip-orange'
                            : item.status === 'Confirmed'
                            ? 'chip-red'
                            : 'chip-green'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right App Detail */}
            {selected && (
              <div className="card app-detail-card">
                <div className="detail-meta-header">
                  <span className="detail-timestamp">
                    App detail · found {selected.foundAt}
                  </span>
                </div>

                <div className="detail-subject-row">
                  <div className="detail-subject-info">
                    <h2 className="detail-subject-title">{selected.name}</h2>
                    <div className="detail-subject-chips">
                      <span className="package-sub">{selected.handleOrPackage}</span>
                      <span
                        className={`chip ${
                          selected.status === 'New'
                            ? 'chip-blue'
                            : selected.status === 'Reviewing'
                            ? 'chip-orange'
                            : selected.status === 'Confirmed'
                            ? 'chip-red'
                            : 'chip-green'
                        }`}
                      >
                        {selected.status}
                      </span>
                    </div>
                  </div>

                  <div className="big-risk-badge">
                    <span className="risk-num">{selected.score}</span>
                    <span className="risk-lbl">Risk</span>
                  </div>
                </div>

                {/* Warning Alert Banner */}
                <div className="publisher-alert-box">
                  <AlertTriangle size={18} className="alert-box-icon" />
                  <div className="alert-box-text">
                    Publisher differs from the official one. Official apps are published by{' '}
                    <strong>Acme Bank Ltd</strong>, this one by{' '}
                    <strong>{selected.publisher || 'Quick Tools Studio'}</strong>.
                  </div>
                </div>

                {/* OFFICIAL vs SUSPECT Comparison */}
                <div className="vs-comparison-grid">
                  {/* Official Card */}
                  <div className="vs-card official-vs">
                    <div className="vs-card-head">
                      <span className="vs-type-tag">OFFICIAL</span>
                      <span className="vs-status-tag">On allowlist</span>
                    </div>
                    <div className="vs-profile-row">
                      <div className="vs-avatar vs-avatar-official">A</div>
                      <div>
                        <div className="vs-profile-name">Acme Bank Mobile</div>
                        <div className="vs-profile-handle">com.acmebank.mobile</div>
                      </div>
                    </div>
                    <div className="vs-app-specs">
                      <div>Publisher: Acme Bank Ltd</div>
                      <div>Stores: Google Play, App Store</div>
                      <div>Downloads: 10M+</div>
                    </div>
                  </div>

                  {/* Suspect Card */}
                  <div className="vs-card suspect-vs">
                    <div className="vs-card-head">
                      <span className="vs-type-tag suspect-tag">SUSPECT</span>
                      <span className="vs-match-tag">Icon {selected.iconMatchPercent || 93}% match</span>
                    </div>
                    <div className="vs-profile-row">
                      <div className="vs-avatar vs-avatar-suspect">A</div>
                      <div>
                        <div className="vs-profile-name">{selected.name}</div>
                        <div className="vs-profile-handle">{selected.handleOrPackage}</div>
                      </div>
                    </div>
                    <div className="vs-app-specs">
                      <div>Publisher: {selected.publisher || 'Quick Tools Studio'}</div>
                      <div>Store: {selected.platform}</div>
                      <div>Downloads: {selected.downloads || '500+'} · {selected.released || 'released 6 days ago'}</div>
                    </div>
                  </div>
                </div>

                {/* Description Overlap */}
                <div className="description-overlap-card">
                  <div className="overlap-head">
                    <span className="overlap-title">Description overlap {selected.overlapPercent || 88}%</span>
                  </div>
                  <p className="overlap-snippet">
                    {selected.descriptionSnippet ||
                      'Secure mobile banking support from Acme Bank. Check balance, transfer funds and raise a support ticket.'}
                  </p>
                  <div className="overlap-keywords">
                    {(selected.descriptionKeywords || ['secure mobile banking', 'check balance', 'transfer funds']).map((kw, i) => (
                      <span key={i} className="keyword-highlight-pill">{kw}</span>
                    ))}
                  </div>
                  <div className="overlap-sub-note">
                    Highlighted phrases also appear in the official app description.
                  </div>
                </div>

                {/* Why it scored */}
                <div className="scored-breakdown-box">
                  <div className="scored-head">
                    <h4 className="scored-title">Why it scored {selected.score}</h4>
                    <span className="scored-sub">Points added by each signal</span>
                  </div>
                  <div className="signals-list">
                    {selected.reasons.map((r, i) => (
                      <div key={i} className="signal-item">
                        <span className="signal-label">{r.label}</span>
                        <span className="signal-pts">+{r.points}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="detail-actions-row">
                  <button
                    type="button"
                    className="btn-danger-outline"
                    onClick={() => updateDetectionStatus(selected.id, 'Confirmed')}
                  >
                    Confirm fake app
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => updateDetectionStatus(selected.id, 'Reviewing')}
                  >
                    Keep reviewing
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => updateDetectionStatus(selected.id, 'Dismissed')}
                  >
                    Dismiss as false positive
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => markAsOfficial(selected.id)}
                  >
                    Mark as official
                  </button>
                </div>

                <div className="analyst-confirm-note">
                  A person confirms every detection. Store screenshot and listing details are saved as evidence.
                </div>
              </div>
            )}
          </div>

          {/* Bottom Dual Panels */}
          <div className="social-bottom-dual-grid">
            {/* Excluded as official */}
            <div className="card bottom-dual-card">
              <div className="dual-card-head">
                <span className="dual-head-icon">🛡️</span>
                <h3 className="panel-card-title">Excluded as official</h3>
              </div>
              <p className="dual-card-desc">
                Matched by package ID and publisher name. Never scored.
              </p>
              <div className="allowlist-items-list">
                <div className="excluded-row">
                  <div>
                    <div className="guard-entity-title">Acme Bank Mobile · com.acmebank.mobile</div>
                    <div className="guard-entity-sub">Acme Bank Ltd · Google Play, App Store</div>
                  </div>
                  <span className="chip chip-green">Official · not flagged</span>
                </div>
                <div className="excluded-row">
                  <div>
                    <div className="guard-entity-title">Acme UPI · com.acmebank.upi</div>
                    <div className="guard-entity-sub">Acme Bank Ltd · Google Play</div>
                  </div>
                  <span className="chip chip-green">Official · not flagged</span>
                </div>
              </div>
            </div>

            {/* False-positive guard */}
            <div className="card bottom-dual-card">
              <div className="dual-card-head">
                <span className="dual-head-icon">✓</span>
                <h3 className="panel-card-title">False-positive guard</h3>
              </div>
              <p className="dual-card-desc">
                Apps that share a word with your name but not your look or content are cleared.
              </p>
              <div className="allowlist-items-list">
                <div className="excluded-row">
                  <div>
                    <div className="guard-entity-title">Acme Weather · com.acme.weather</div>
                    <div className="guard-entity-sub">Acme Corp · icon 8%, description 4%</div>
                  </div>
                  <span className="chip chip-neutral">Not flagged</span>
                </div>
                <div className="excluded-row">
                  <div>
                    <div className="guard-entity-title">Acme Fitness Tracker · com.acmefit.app</div>
                    <div className="guard-entity-sub">Acme Fit Pvt Ltd · icon 5%, description 2%</div>
                  </div>
                  <span className="chip chip-neutral">Not flagged</span>
                </div>
              </div>
              <Link to="/lookalike" className="see-names-link">
                See how names are matched →
              </Link>
            </div>
          </div>

          <div className="page-bottom-note">
            Sample data for the fictional brand Acme Bank. Not real detections.
          </div>
        </div>
      </div>
    </>
  );
};
