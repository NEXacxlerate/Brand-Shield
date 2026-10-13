import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShieldCheck,
  Lightbulb,
  ArrowRight,
  ClipboardCheck,
  User,
  Smartphone,
  Building2,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Sparkline } from '../components/charts/Sparkline';
import { Donut } from '../components/charts/Donut';
import { Empty, ErrorBox, Loading, NoBrand, Notice, SampleNote } from '../components/common/States';
import { bandChip, fmtClock, fmtFull, platformLabel, riskBandLabel, statusChip, statusLabel, timeAgo, typeLabel } from '../api/format';
import { sm } from '../api/sm';
import type { DetectionType, Scan } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useBrand } from '../hooks/useBrand';
import { useMe } from '../hooks/useMe';
import { useScan } from '../hooks/useScan';
import './DashboardPage.css';

interface DashboardPageProps {
  onOpenMobileMenu?: () => void;
}

const TYPE_COLOR: Record<DetectionType, string> = {
  fake_app: '#4f9dff',
  fake_profile: '#a78bfa',
  scam_account: '#f0566a',
  fake_brand_page: '#f59e55',
};

/** "name similarity, bio content and account signals" */
function joinWords(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function scanSummary(scan: Scan): string {
  const r = scan.result;
  if (scan.state === 'error') return scan.message || 'The scan failed.';
  if (!r) return scan.message;
  const parts = [`Scan finished: ${r.new_detections} new ${r.new_detections === 1 ? 'detection' : 'detections'}, ${r.sources_online} of ${r.sources_checked} sources online.`];
  if (r.unavailable_sources.length || r.partial_sources.length) {
    parts.push('Some sources were slow or unavailable; results from the others were saved.');
  }
  return parts.join(' ');
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onOpenMobileMenu }) => {
  const navigate = useNavigate();
  const { canWrite } = useMe();
  const { reload: reloadBrand } = useBrand();
  const dash = useApi((signal) => sm.dashboard(signal), []);
  const scan = useScan('all', () => {
    dash.reload();
    void reloadBrand();
  });

  const d = dash.data;
  const noBrand = dash.error?.status === 404;
  const brandName = d?.brand.name ?? '';

  const open = (id: number, type: string) => navigate(`${type === 'fake_app' ? '/apps' : '/social'}?detection=${id}`);

  const header = (
    <Header
      title="Dashboard"
      subtitle={brandName ? `Brand risk overview for ${brandName}` : 'Brand risk overview'}
      onOpenMobileMenu={onOpenMobileMenu}
    />
  );

  if (noBrand) {
    return (
      <>
        {header}
        <div className="panel-content">
          <NoBrand />
        </div>
      </>
    );
  }

  if (!d) {
    return (
      <>
        {header}
        <div className="panel-content">
          {dash.error ? <ErrorBox error={dash.error} onRetry={dash.reload} /> : <Loading what="Loading dashboard" />}
        </div>
      </>
    );
  }

  const k = d.kpis;
  const lastScan = d.last_scan_at ? `Last scan ${fmtFull(d.last_scan_at)}` : 'No scan yet';
  const statusLine = `${lastScan} · ${d.sources_online} of ${d.sources_total} sources online${
    d.next_scan_at ? ` · Next scan ${fmtClock(d.next_scan_at)}` : ''
  }`;

  const impersonationTypesData = d.by_type.map((t) => ({
    label: typeLabel(t.type),
    value: t.count,
    color: TYPE_COLOR[t.type] ?? '#8b9bff',
    percentage: t.percent,
  }));
  const maxPlatform = Math.max(1, ...d.by_platform.map((p) => p.count));

  const top = d.top_detection;
  const signalWords = (d.why_flagged?.reasons ?? []).map((r) => r.label.toLowerCase());
  const uniqueSignals = Array.from(new Set(signalWords)).slice(0, 3);

  const kpiTile = (
    label: string,
    kpi: { value: number; delta_week?: number; trend?: number[] },
    tone: 'blue' | 'red' | 'purple',
    icon: React.ReactNode,
    color: string,
  ) => (
    <div className="dash-kpi-card card">
      <div className="kpi-head-row">
        <span className={`kpi-icon-chip tone-${tone}`}>{icon}</span>
        <span className="kpi-label-text">{label}</span>
      </div>
      <div className="kpi-value-row">
        <span className="kpi-big-num">{kpi.value}</span>
      </div>
      <div className="kpi-footer-row">
        {kpi.delta_week !== undefined && (
          <span className="kpi-delta-chip">↑ {kpi.delta_week} this week</span>
        )}
        {kpi.trend && kpi.trend.length >= 2 && (
          <div className="kpi-mini-spark">
            <Sparkline data={kpi.trend} color={color} width={120} height={32} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {header}

      <div className="panel-content">
        <div className="pdf-dashboard-page">
          {dash.error && <ErrorBox error={dash.error} onRetry={dash.reload} compact />}

          {/* Hero Banner Box */}
          <div className="dash-hero-card">
            <span className="dash-hero-glow glow-a" aria-hidden="true" />
            <span className="dash-hero-glow glow-b" aria-hidden="true" />
            <div className="dash-hero-text">
              <h2 className="dash-hero-title">
                Protect {brandName} across social media and app stores
              </h2>
              <p className="dash-hero-sub">
                We compare public profiles, pages and apps against your official assets. Anything on your allowlist is never flagged.
              </p>
              <div className="dash-hero-status">
                <span className="live-dot" />
                <span data-testid="hero-status">{statusLine}</span>
              </div>
            </div>

            <div className="dash-hero-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void scan.start()}
                disabled={scan.scanning || !canWrite}
                title={canWrite ? undefined : 'Your role can view but not start scans'}
              >
                <span>{scan.scanning ? `Scanning… ${scan.progress}%` : 'Run scan now'}</span>
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

          {scan.error && <Notice>{scan.error}</Notice>}
          {scan.last && !scan.error && <Notice kind="info">{scanSummary(scan.last)}</Notice>}

          {/* Row 1: 4 KPI Cards */}
          <div className="dash-kpi-row">
            {kpiTile('Total detections', k.total_detections, 'blue', <ClipboardCheck size={17} />, '#5b8def')}
            {kpiTile('Social impersonations', k.social_impersonations, 'red', <User size={17} />, '#f0566a')}
            {kpiTile('Suspicious apps', k.suspicious_apps, 'purple', <Smartphone size={17} />, '#a78bfa')}

            {/* KPI 4 */}
            <div className="dash-kpi-card card">
              <div className="kpi-head-row">
                <span className="kpi-icon-chip tone-green"><ShieldCheck size={17} /></span>
                <span className="kpi-label-text">Official assets protected</span>
              </div>
              <div className="kpi-value-row">
                <span className="kpi-big-num">{k.official_assets.value}</span>
              </div>
              <div className="kpi-footer-row">
                <div className="kpi-protected-badge">
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
                  data={impersonationTypesData.map((t) => ({ label: t.label, percentage: t.percentage, color: t.color }))}
                  totalValue={String(k.total_detections.value)}
                  totalLabel="Detections"
                />
              </div>
              <div className="types-legend-list">
                {impersonationTypesData.length === 0 && <Empty>No detections yet.</Empty>}
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
                {d.by_platform.length === 0 && <Empty>Nothing found yet.</Empty>}
                {d.by_platform.map((src, idx) => (
                  <div key={idx} className="source-bar-row">
                    <span className="source-bar-name">{platformLabel(src.platform)}</span>
                    <div className="source-bar-track">
                      <div
                        className="source-bar-fill"
                        style={{ width: `${(src.count / maxPlatform) * 100}%` }}
                      />
                    </div>
                    <span className="source-bar-count">{src.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 3: Needs Review */}
            <div className="card dash-panel-card review-card">
              <div className="panel-card-head">
                <h3 className="panel-card-title">Needs review</h3>
                <Link to="/social" className="head-link">
                  View all
                </Link>
              </div>
              <div className="needs-review-list">
                {d.needs_review.length === 0 && <Empty>Nothing needs review.</Empty>}
                {d.needs_review.map((item) => (
                  <div
                    key={item.id}
                    className="review-item-row"
                    onClick={() => open(item.id, item.type)}
                  >
                    <span className={`review-item-icon tone-${item.type === 'fake_app' ? 'purple' : item.type === 'fake_brand_page' ? 'blue' : 'red'}`}>
                      {item.type === 'fake_app' ? <Smartphone size={16} /> : item.type === 'fake_brand_page' ? <Building2 size={16} /> : <User size={16} />}
                    </span>
                    <div className="review-item-text">
                      <span className="review-item-name">{item.name}</span>
                      <span className="review-item-sub">
                        {platformLabel(item.platform)} · {typeLabel(item.type).toLowerCase()} · {timeAgo(item.found_at)}
                      </span>
                    </div>
                    <span className={`chip ${bandChip(item.risk_band)}`}>{riskBandLabel(item.risk_band)}</span>
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
                    {d.recent.length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          <Empty>No detections yet. Run a scan to look for impersonations.</Empty>
                        </td>
                      </tr>
                    )}
                    {d.recent.map((row) => (
                      <tr key={row.id} onClick={() => open(row.id, row.type)}>
                        <td className="main-entity-cell">
                          <div className="entity-main-name">{row.name}</div>
                          <div className="entity-sub-reason">{row.summary}</div>
                        </td>
                        <td className="cell-muted">{platformLabel(row.platform)}</td>
                        <td className="cell-muted">{typeLabel(row.type, true)}</td>
                        <td className="cell-bold">{row.score}/100</td>
                        <td>
                          <span className={`chip ${statusChip(row.status)}`}>
                            {statusLabel(row.status)}
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
                  <Lightbulb size={16} className="sparkle-icon" />
                  <h3 className="panel-card-title">Why it was flagged</h3>
                </div>
                {top ? (
                  <>
                    <p className="why-flagged-body">
                      <strong>{top.name}</strong> on {platformLabel(top.platform)} scored {top.score}.{' '}
                      {top.on_allowlist ? 'It is on your allowlist.' : 'It is not on your allowlist'}
                      {!top.on_allowlist && uniqueSignals.length > 0
                        ? `, and its ${joinWords(uniqueSignals)} point to ${brandName}.`
                        : !top.on_allowlist
                        ? '.'
                        : ''}
                    </p>
                    <div className="why-flagged-tags">
                      {top.tags.map((tag, i) => (
                        <span key={i} className="tag-pill">{tag}</span>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn-primary review-btn"
                      onClick={() => open(top.id, top.platform === 'google_play' || top.platform === 'app_store' || top.platform === 'third_party_apk' ? 'fake_app' : 'social')}
                    >
                      Review detection
                    </button>
                  </>
                ) : (
                  <Empty>No flagged detection to explain yet.</Empty>
                )}
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
                  {d.sources.slice(0, 6).map((src) => (
                    <div key={src.id} className="source-mini-row">
                      <div className="source-mini-left">
                        <span
                          className={`source-status-dot ${
                            src.status === 'online'
                              ? 'dot-green'
                              : src.status === 'slow'
                              ? 'dot-orange'
                              : 'dot-red'
                          }`}
                        />
                        <span className="source-mini-name">{src.name}</span>
                      </div>
                      <span className="source-mini-status">
                        {src.status === 'online'
                          ? 'Online'
                          : src.status === 'slow'
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
          <SampleNote brandName={brandName} />
        </div>
      </div>
    </>
  );
};
