import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  TrendingUp,
  ShieldCheck,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Sparkline } from '../components/charts/Sparkline';
import { Donut } from '../components/charts/Donut';
import { useAppStore } from '../data/store';
import './DashboardPage.css';

interface DashboardPageProps {
  onOpenMobileMenu?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onOpenMobileMenu }) => {
  const navigate = useNavigate();
  const { brand, detections, sources, officialAccounts, officialApps } = useAppStore();
  const [scanning, setScanning] = useState(false);

  const totalDetections = detections.length;
  const socialDetections = detections.filter((d) => d.category === 'social').length;
  const appDetections = detections.filter((d) => d.category === 'apps').length;
  const totalOfficial = officialAccounts.length + officialApps.length;

  const handleRunScan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      alert('Scan complete! 8 sources queried. Threat intelligence up-to-date.');
    }, 1500);
  };

  const impersonationTypesData = [
    { label: 'Fake app', value: 5, color: '#4f9dff', percentage: 45 },
    { label: 'Fake profile', value: 3, color: '#a78bfa', percentage: 27 },
    { label: 'Scam account', value: 2, color: '#f0566a', percentage: 18 },
    { label: 'Fake brand page', value: 1, color: '#f59e55', percentage: 10 },
  ];

  const whereWeFoundThemData = [
    { label: 'Google Play', count: 3, max: 4 },
    { label: 'Instagram', count: 2, max: 4 },
    { label: 'X', count: 2, max: 4 },
    { label: 'Facebook', count: 1, max: 4 },
    { label: 'Telegram', count: 1, max: 4 },
    { label: 'App Store', count: 1, max: 4 },
    { label: 'Third-party APK', count: 1, max: 4 },
  ];

  const needsReviewItems = [
    {
      id: 'det-1',
      name: '@acrne_bank_support',
      detail: 'Instagram · scam account · 2 minutes ago',
      level: 'High',
    },
    {
      id: 'det-2',
      name: 'Acme Bank Support Help',
      detail: 'Google Play · fake app · 18 minutes ago',
      level: 'High',
    },
    {
      id: 'det-3',
      name: 'Acme Bank Official Helpline',
      detail: 'Facebook · fake brand page · 1 hour ago',
      level: 'High',
    },
    {
      id: 'det-7',
      name: '@acme_bank_rewards',
      detail: 'Instagram · scam account · 3 hours ago',
      level: 'High',
    },
    {
      id: 'det-8',
      name: 'Acme Bank Mobile Lite',
      detail: 'Third-party APK · fake app · 4 hours ago',
      level: 'High',
    },
  ];

  const recentDetections = [
    {
      id: 'det-1',
      name: '@acrne_bank_support',
      sub: '“rn” reads as “m”, added word “support”',
      platform: 'Instagram',
      type: 'Scam account',
      match: '94/100',
      status: 'New',
      statusClass: 'chip-blue',
    },
    {
      id: 'det-2',
      name: 'Acme Bank Support Help',
      sub: 'Different publisher, icon 93% match',
      platform: 'Google Play',
      type: 'Fake app',
      match: '91/100',
      status: 'Reviewing',
      statusClass: 'chip-orange',
    },
    {
      id: 'det-3',
      name: 'Acme Bank Official Helpline',
      sub: 'Added words, logo 84% match',
      platform: 'Facebook',
      type: 'Fake page',
      match: '88/100',
      status: 'Reviewing',
      statusClass: 'chip-orange',
    },
    {
      id: 'det-4',
      name: '@acmebank.india',
      sub: 'Added word “india”, logo copied',
      platform: 'X',
      type: 'Fake profile',
      match: '91/100',
      status: 'Confirmed',
      statusClass: 'chip-red',
    },
    {
      id: 'det-5',
      name: 'Acme Bnak Mobile',
      sub: 'Letters swapped, icon 95% match',
      platform: 'Google Play',
      type: 'Fake app',
      match: '93/100',
      status: 'Confirmed',
      statusClass: 'chip-red',
    },
    {
      id: 'det-6',
      name: 'A C M E Bank',
      sub: 'Spacing change, asks for loan fees',
      platform: 'Telegram',
      type: 'Fake profile',
      match: '82/100',
      status: 'New',
      statusClass: 'chip-blue',
    },
  ];

  return (
    <>
      <Header
        title="Dashboard"
        subtitle={`Brand risk overview for ${brand.name}`}
        onOpenMobileMenu={onOpenMobileMenu}
      />

      <div className="panel-content">
        <div className="pdf-dashboard-page">
          {/* Hero Banner Box */}
          <div className="dash-hero-card">
            <div className="dash-hero-text">
              <h2 className="dash-hero-title">
                Protect {brand.name} across social media and app stores
              </h2>
              <p className="dash-hero-sub">
                We compare public profiles, pages and apps against your official assets. Anything on your allowlist is never flagged.
              </p>
              <div className="dash-hero-status">
                <span className="live-dot" />
                <span>Last scan 12 Oct 2026, 11:58 AM · 6 of 8 sources online</span>
              </div>
            </div>

            <div className="dash-hero-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={handleRunScan}
                disabled={scanning}
              >
                <span>{scanning ? 'Scanning…' : 'Run scan now'}</span>
                <ArrowRight size={15} />
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate('/brand')}
              >
                Edit brand profile
              </button>
            </div>
          </div>

          {/* Row 1: 4 KPI Cards */}
          <div className="dash-kpi-row">
            {/* KPI 1 */}
            <div className="dash-kpi-card card">
              <div className="kpi-label-text">Total detections</div>
              <div className="kpi-value-row">
                <span className="kpi-big-num">{totalDetections}</span>
              </div>
              <div className="kpi-footer-row">
                <div className="kpi-change-text" style={{ color: '#8b9bff' }}>
                  <TrendingUp size={13} />
                  <span>↑ 4 this week</span>
                </div>
                <div className="kpi-mini-spark">
                  <Sparkline data={[4, 6, 8, 7, 9, 10, 11]} color="#6366f1" />
                </div>
              </div>
            </div>

            {/* KPI 2 */}
            <div className="dash-kpi-card card">
              <div className="kpi-label-text">Social impersonations</div>
              <div className="kpi-value-row">
                <span className="kpi-big-num">{socialDetections}</span>
              </div>
              <div className="kpi-footer-row">
                <div className="kpi-change-text" style={{ color: '#f0566a' }}>
                  <TrendingUp size={13} />
                  <span>↑ 2 this week</span>
                </div>
                <div className="kpi-mini-spark">
                  <Sparkline data={[2, 3, 3, 4, 5, 5, 6]} color="#f0566a" />
                </div>
              </div>
            </div>

            {/* KPI 3 */}
            <div className="dash-kpi-card card">
              <div className="kpi-label-text">Suspicious apps</div>
              <div className="kpi-value-row">
                <span className="kpi-big-num">{appDetections}</span>
              </div>
              <div className="kpi-footer-row">
                <div className="kpi-change-text" style={{ color: '#f0566a' }}>
                  <TrendingUp size={13} />
                  <span>↑ 3 this week</span>
                </div>
                <div className="kpi-mini-spark">
                  <Sparkline data={[1, 2, 2, 3, 3, 4, 5]} color="#f0566a" />
                </div>
              </div>
            </div>

            {/* KPI 4 */}
            <div className="dash-kpi-card card">
              <div className="kpi-label-text">Official assets protected</div>
              <div className="kpi-value-row">
                <span className="kpi-big-num">{totalOfficial}</span>
              </div>
              <div className="kpi-footer-row">
                <div className="kpi-protected-badge">
                  <ShieldCheck size={14} color="#34d399" />
                  <span>Never flagged</span>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: 3 Visual Analysis Cards */}
          <div className="dash-tri-grid">
            {/* Card 1: Impersonation Types */}
            <div className="card dash-panel-card">
              <div className="panel-card-head">
                <h3 className="panel-card-title">Impersonation types</h3>
              </div>
              <div className="donut-wrap">
                <Donut
                  data={impersonationTypesData}
                  totalValue={String(totalDetections)}
                  totalLabel="Detections"
                />
              </div>
              <div className="types-legend-list">
                {impersonationTypesData.map((t, idx) => (
                  <div key={idx} className="legend-row-item">
                    <div className="legend-item-left">
                      <span className="dot-marker" style={{ background: t.color }} />
                      <span className="legend-label-text">{t.label}</span>
                    </div>
                    <span className="legend-count-val">{t.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 2: Where we found them */}
            <div className="card dash-panel-card">
              <div className="panel-card-head">
                <h3 className="panel-card-title">Where we found them</h3>
              </div>
              <div className="source-bars-list">
                {whereWeFoundThemData.map((src, idx) => (
                  <div key={idx} className="source-bar-row">
                    <div className="source-bar-info">
                      <span className="source-bar-name">{src.label}</span>
                      <span className="source-bar-count">{src.count}</span>
                    </div>
                    <div className="source-bar-track">
                      <div
                        className="source-bar-fill"
                        style={{ width: `${(src.count / src.max) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 3: Needs Review */}
            <div className="card dash-panel-card">
              <div className="panel-card-head">
                <h3 className="panel-card-title">Needs review</h3>
                <Link to="/social" className="head-link">
                  View all
                </Link>
              </div>
              <div className="needs-review-list">
                {needsReviewItems.map((item) => (
                  <div
                    key={item.id}
                    className="review-item-row"
                    onClick={() => navigate('/social')}
                  >
                    <div className="review-item-text">
                      <span className="review-item-name">{item.name}</span>
                      <span className="review-item-sub">{item.detail}</span>
                    </div>
                    <span className="chip chip-red">{item.level}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 3: Recent Detections + Why Flagged & Source Health */}
          <div className="dash-split-bottom">
            {/* Left: Recent Detections Table */}
            <div className="card dash-table-card">
              <div className="panel-card-head">
                <h3 className="panel-card-title">Recent detections</h3>
                <Link to="/social" className="head-link">
                  View all
                </Link>
              </div>

              <div className="dash-table-wrap">
                <table className="dash-data-table">
                  <thead>
                    <tr>
                      <th>Name or handle</th>
                      <th>Platform</th>
                      <th>Type</th>
                      <th>Match</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDetections.map((row, idx) => (
                      <tr
                        key={idx}
                        onClick={() =>
                          navigate(row.platform.includes('Play') || row.platform.includes('Store') ? '/apps' : '/social')
                        }
                      >
                        <td className="main-entity-cell">
                          <div className="entity-main-name">{row.name}</div>
                          <div className="entity-sub-reason">{row.sub}</div>
                        </td>
                        <td className="cell-muted">{row.platform}</td>
                        <td className="cell-muted">{row.type}</td>
                        <td className="cell-bold">{row.match}</td>
                        <td>
                          <span className={`chip ${row.statusClass}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Stack */}
            <div className="dash-right-stack">
              {/* Why it was flagged card */}
              <div className="card why-flagged-card">
                <div className="why-flagged-head">
                  <Sparkles size={16} className="sparkle-icon" />
                  <h3 className="panel-card-title">Why it was flagged</h3>
                </div>
                <p className="why-flagged-body">
                  <strong>@acrne_bank_support</strong> on Instagram scored 94. It is not on your allowlist, and its name, logo and bio all point to {brand.name}.
                </p>
                <div className="why-flagged-tags">
                  <span className="tag-pill">“rn” reads as “m”</span>
                  <span className="tag-pill">Added word: support</span>
                  <span className="tag-pill">Logo 91% match</span>
                  <span className="tag-pill">Bio asks for KYC</span>
                </div>
                <button
                  type="button"
                  className="btn-primary review-btn"
                  onClick={() => navigate('/social')}
                >
                  Review detection
                </button>
              </div>

              {/* Source health mini card */}
              <div className="card source-mini-card">
                <div className="panel-card-head">
                  <h3 className="panel-card-title">Source health</h3>
                  <Link to="/sources" className="head-link">
                    Manage
                  </Link>
                </div>
                <div className="source-mini-list">
                  {sources.slice(0, 6).map((src) => (
                    <div key={src.id} className="source-mini-row">
                      <div className="source-mini-left">
                        <span
                          className={`source-status-dot ${
                            src.status === 'Online'
                              ? 'dot-green'
                              : src.status === 'Slow'
                              ? 'dot-orange'
                              : 'dot-red'
                          }`}
                        />
                        <span className="source-mini-name">{src.name}</span>
                      </div>
                      <span className="source-mini-status">
                        {src.status === 'Online'
                          ? 'Online'
                          : src.status === 'Slow'
                          ? 'Slow, retrying'
                          : 'Unavailable, cached'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Note */}
          <div className="page-bottom-note">
            Sample data for the fictional brand Acme Bank. Not real detections.
          </div>
        </div>
      </div>
    </>
  );
};
