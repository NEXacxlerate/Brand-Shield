import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  RotateCw,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { useAppStore } from '../data/store';
import './SocialMonitoringPage.css';

export const SocialMonitoringPage: React.FC = () => {
  const { detections, updateDetectionStatus, markAsOfficial } = useAppStore();

  const socialDetections = detections.filter((d) => d.category === 'social');
  const [filterType, setFilterType] = useState<'all' | 'fake_profile' | 'fake_brand_page' | 'scam_account'>('all');
  const [selectedId, setSelectedId] = useState<string>('det-1');
  const [scanning, setScanning] = useState(false);

  const filtered = socialDetections.filter((d) => {
    if (filterType === 'all') return true;
    return d.type === filterType;
  });

  const selected = socialDetections.find((d) => d.id === selectedId) || socialDetections[0];

  const handleScanNow = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      alert('Social scan complete: 486 accounts analyzed. No new threats.');
    }, 1200);
  };

  return (
    <>
      <Header
        title="Social Media Monitoring"
        subtitle="Fake profiles, fake brand pages and scam accounts using the Acme Bank identity"
      />

      <div className="panel-content">
        <div className="social-page-wrap">
          {/* Top Sources Bar */}
          <div className="sources-status-bar">
            <div className="sources-pills-row">
              <span className="source-lbl">Sources</span>
              <span className="source-pill"><span className="src-dot dot-green" />Instagram</span>
              <span className="source-pill"><span className="src-dot dot-green" />Facebook</span>
              <span className="source-pill"><span className="src-dot dot-green" />X</span>
              <span className="source-pill warn"><span className="src-dot dot-orange" />Telegram · slow</span>
              <span className="source-pill"><span className="src-dot dot-green" />LinkedIn</span>
            </div>

            <div className="source-warning-box">
              <AlertTriangle size={14} className="warn-icon" />
              <span>Telegram is responding slowly. Results may be incomplete. Retrying in 4 minutes. <a href="#details" className="warn-details-link">Details</a></span>
            </div>
          </div>

          {/* Filter Tabs & Scan Action */}
          <div className="filters-action-bar">
            <div className="filter-tabs-group">
              <button
                type="button"
                className={`filter-tab ${filterType === 'all' ? 'active' : ''}`}
                onClick={() => setFilterType('all')}
              >
                All 6
              </button>
              <button
                type="button"
                className={`filter-tab ${filterType === 'fake_profile' ? 'active' : ''}`}
                onClick={() => setFilterType('fake_profile')}
              >
                Fake profiles 3
              </button>
              <button
                type="button"
                className={`filter-tab ${filterType === 'fake_brand_page' ? 'active' : ''}`}
                onClick={() => setFilterType('fake_brand_page')}
              >
                Fake brand pages 1
              </button>
              <button
                type="button"
                className={`filter-tab ${filterType === 'scam_account' ? 'active' : ''}`}
                onClick={() => setFilterType('scam_account')}
              >
                Scam accounts 2
              </button>
            </div>

            <button
              type="button"
              className="btn-primary scan-btn"
              onClick={handleScanNow}
              disabled={scanning}
            >
              <RotateCw size={14} className={scanning ? 'spin' : ''} />
              <span>{scanning ? 'Scanning…' : 'Scan social platforms now'}</span>
            </button>
          </div>

          {/* Main 2-Column Split */}
          <div className="social-main-grid">
            {/* Left Detections List */}
            <div className="card detections-list-card">
              <div className="panel-card-head">
                <h3 className="panel-card-title">Detections</h3>
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
                      <div className="platform-symbol">
                        {item.platform.charAt(0)}
                      </div>
                      <div className="detection-row-meta">
                        <div className="detection-row-name">{item.name}</div>
                        <div className="detection-row-handle">
                          {item.handleOrPackage} · {item.platform} · {item.type.replace('_', ' ')}
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

            {/* Right Detection Detail */}
            {selected && (
              <div className="card detection-detail-card">
                <div className="detail-meta-header">
                  <span className="detail-timestamp">
                    Detection detail · {selected.foundAt}
                  </span>
                </div>

                <div className="detail-subject-row">
                  <div className="detail-subject-info">
                    <h2 className="detail-subject-title">{selected.name}</h2>
                    <div className="detail-subject-chips">
                      <span className="handle-sub">{selected.handleOrPackage} on {selected.platform}</span>
                      <span className="chip chip-purple">{selected.type.replace('_', ' ')}</span>
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
                        <div className="vs-profile-name">Acme Bank</div>
                        <div className="vs-profile-handle">@acmebank</div>
                      </div>
                    </div>
                    <p className="vs-bio-text">
                      Official page of Acme Bank. We will never ask for your PIN, OTP or KYC details over DM.
                    </p>
                    <div className="vs-footer-stats">
                      <span>Followers: 2.4M</span>
                      <span>Joined: 2014</span>
                      <span>Link: acmebank.com</span>
                    </div>
                  </div>

                  {/* Suspect Card */}
                  <div className="vs-card suspect-vs">
                    <div className="vs-card-head">
                      <span className="vs-type-tag suspect-tag">SUSPECT</span>
                      <span className="vs-match-tag">Logo {selected.logoMatchPercent || 91}% match</span>
                    </div>
                    <div className="vs-profile-row">
                      <div className="vs-avatar vs-avatar-suspect">A</div>
                      <div>
                        <div className="vs-profile-name">{selected.name}</div>
                        <div className="vs-profile-handle">{selected.handleOrPackage}</div>
                      </div>
                    </div>
                    <p className="vs-bio-text">
                      {selected.bioSnippet ||
                        'Official Acme Bank support. DM us your KYC details to avoid account block.'}
                    </p>
                    <div className="vs-footer-stats">
                      <span>Followers: {selected.followers || '214'}</span>
                      <span>Joined: {selected.joined || '12 days ago'}</span>
                      <span>Link: acme-kyc-update.in</span>
                    </div>
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

                {/* Evidence kept */}
                <div className="evidence-kept-box">
                  <div className="evidence-title">Evidence kept</div>
                  <div className="evidence-row">
                    <span className="evidence-link">Profile screenshot</span>
                    <span className="evidence-link">Profile URL</span>
                    <span className="evidence-text">Captured {selected.foundAt}</span>
                    <span className="evidence-sha">
                      SHA-256 {selected.evidence.sha256.substring(0, 4)}…{selected.evidence.sha256.substring(selected.evidence.sha256.length - 4)}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="detail-actions-row">
                  <button
                    type="button"
                    className="btn-danger-outline"
                    onClick={() => updateDetectionStatus(selected.id, 'Confirmed')}
                  >
                    Confirm impersonation
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
                  A person confirms every detection. No takedown request is sent automatically.
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
                These matched your allowlist by exact handle and were never scored.
              </p>
              <div className="allowlist-items-list">
                <div className="excluded-row">
                  <span>@acmebank on Instagram</span>
                  <span className="chip chip-green">Official · not flagged</span>
                </div>
                <div className="excluded-row">
                  <span>@AcmeBank on X</span>
                  <span className="chip chip-green">Official · not flagged</span>
                </div>
                <div className="excluded-row">
                  <span>acmebank on Facebook</span>
                  <span className="chip chip-green">Official · not flagged</span>
                </div>
                <div className="excluded-row">
                  <span>company/acmebank on LinkedIn</span>
                  <span className="chip chip-green">Official · not flagged</span>
                </div>
                <div className="excluded-row">
                  <span>@acmebank on YouTube</span>
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
                Similar-sounding names that belong to other businesses are cleared automatically.
              </p>
              <div className="allowlist-items-list">
                <div className="excluded-row">
                  <div>
                    <div className="guard-entity-title">Acme Bakery · Facebook page</div>
                    <div className="guard-entity-sub">Category Bakery, logo 6% match</div>
                  </div>
                  <span className="chip chip-neutral">Not flagged</span>
                </div>
                <div className="excluded-row">
                  <div>
                    <div className="guard-entity-title">Acme Hotels · Instagram</div>
                    <div className="guard-entity-sub">Category Hospitality, logo 4% match</div>
                  </div>
                  <span className="chip chip-neutral">Not flagged</span>
                </div>
                <div className="excluded-row">
                  <div>
                    <div className="guard-entity-title">@acme_weather · X</div>
                    <div className="guard-entity-sub">Category Weather app, logo 3% match</div>
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
