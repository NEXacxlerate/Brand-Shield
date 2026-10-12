import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Download,
  Globe,
  Radio
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { SmoothLines } from '../components/charts/SmoothLines';
import { RingSegments } from '../components/charts/RingSegments';
import { BarSpark } from '../components/charts/BarSpark';
import { api, useAsync } from '../api';
import type { BrandMonitorView } from '../api/monitor';
import './BrandMonitorPage.css';

interface BrandMonitorPageProps {
  onOpenMobileMenu?: () => void;
}

export const BrandMonitorPage: React.FC<BrandMonitorPageProps> = ({ onOpenMobileMenu }) => {
  const { data, loading, error } = useAsync(() => api.getBrandMonitor(), []);
  if (!data) {
    return (
      <>
        <Header
          title="Brand Monitor"
          subtitle="Holistic external ecosystem surveillance & anti-counterfeit protection"
          onOpenMobileMenu={onOpenMobileMenu}
        />
        <div className="panel-content">
          <div className="brand-page">
            <div className="card">
              <p className="card-subtitle">{loading ? 'Loading…' : error ?? 'No monitoring data yet.'}</p>
            </div>
          </div>
        </div>
      </>
    );
  }
  return <BrandMonitorView_ view={data} onOpenMobileMenu={onOpenMobileMenu} />;
};

const BrandMonitorView_: React.FC<{ view: BrandMonitorView; onOpenMobileMenu?: () => void }> = ({ view, onOpenMobileMenu }) => {
  const { grade, score, takedowns, activityWeeks, severities, platforms } = view;
  const totalIncidents = severities.reduce((n, s) => n + s.count, 0);
  const maxActivity = Math.max(50, ...activityWeeks.map((w) => Math.max(w.newThreats, w.inReview, w.takenDown)));

  // Grade ring calculations (72% arc with knob and tick scale)
  const size = 200;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = (score / 100) * circumference;

  // Knob position at score %
  const angle = (score / 100) * 2 * Math.PI - Math.PI / 2;
  const knobX = center + radius * Math.cos(angle);
  const knobY = center + radius * Math.sin(angle);

  const trackerData = activityWeeks.map((w) => ({
    label: w.week,
    observed: w.newThreats,
    series2: w.inReview,
    series3: w.takenDown
  }));

  return (
    <>
      <Header
        title="Brand Monitor"
        subtitle="Holistic external ecosystem surveillance & anti-counterfeit protection"
        actions={
          <>
            <span className="tag tag-neutral" style={{ height: '32px', padding: '0 12px', fontSize: '12.5px' }}>
              Acme Bank Brand Twin
            </span>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => alert('Generating Brand Health Executive Brief...')}
            >
              <Download size={14} />
              <span>Export</span>
            </button>
          </>
        }
        onOpenMobileMenu={onOpenMobileMenu}
      />

      <div className="panel-content">
        <div className="brand-page">
          {/* Top Row: Brand Risk Grade Ring + Takedown Status 6 Mini Cards */}
          <div className="brand-top-grid">
            {/* Brand Risk Grade Ring */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <div className="card-header-icon" style={{ color: '#FF9A4D' }}>
                    <ShieldAlert size={20} />
                  </div>
                  <h2 className="card-title">Brand Risk Grade</h2>
                </div>
              </div>

              <div className="grade-ring-container">
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                  <defs>
                    <linearGradient id="grade-grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#F5C542" />
                      <stop offset="100%" stopColor="#FF9A4D" />
                    </linearGradient>
                    <filter id="grade-glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="6" />
                    </filter>
                  </defs>

                  {/* Track ring */}
                  <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.08)"
                    strokeWidth={strokeWidth}
                  />

                  {/* Blurred glow arc */}
                  <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke="url(#grade-grad)"
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${arcLength} ${circumference - arcLength}`}
                    strokeDashoffset={circumference / 4}
                    strokeLinecap="round"
                    filter="url(#grade-glow)"
                    opacity="0.6"
                  />

                  {/* Main sharp arc */}
                  <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke="url(#grade-grad)"
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${arcLength} ${circumference - arcLength}`}
                    strokeDashoffset={circumference / 4}
                    strokeLinecap="round"
                  />

                  {/* Knob indicator */}
                  <circle
                    cx={knobX}
                    cy={knobY}
                    r={7}
                    fill="#FFFFFF"
                    stroke="#FF9A4D"
                    strokeWidth={3}
                  />

                  {/* Center Letter D & Score 72 of 100 */}
                  <text
                    x={center}
                    y={center - 6}
                    textAnchor="middle"
                    fill="#EDEDF2"
                    fontSize="42"
                    fontWeight="800"
                    fontFamily="Manrope"
                  >
                    {grade}
                  </text>
                  <text
                    x={center}
                    y={center + 24}
                    textAnchor="middle"
                    fill="#FF9A4D"
                    fontSize="13"
                    fontWeight="700"
                    fontFamily="Manrope"
                  >
                    Score {score} of 100
                  </text>
                </svg>

                <p className="grade-caption">
                  Grade by risk score: A 0-19, B 20-39, C 40-59, D 60-79, F 80-100
                </p>
              </div>
            </div>

            {/* Takedown Status 6 Mini Cards */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <div className="card-header-icon" style={{ color: '#5AA9FF' }}>
                    <ShieldCheck size={20} />
                  </div>
                  <h2 className="card-title">Takedown Status</h2>
                </div>
              </div>

              <div className="takedown-mini-cards">
                {takedowns.map((td, idx) => (
                  <div key={idx} className="takedown-mini-card">
                    <span className="takedown-mini-num">{td.count}</span>
                    <span className="takedown-mini-label">{td.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Middle Row: Activity Tracker (SmoothLines) + Brand Severity (RingSegments) */}
          <div className="brand-middle-grid">
            {/* Activity Tracker */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <div className="card-header-icon">
                    <TrendingUp size={20} />
                  </div>
                  <div>
                    <h2 className="card-title">Activity Tracker</h2>
                    <p className="card-subtitle">12-week velocity of incoming vs neutralized threats</p>
                  </div>
                </div>
              </div>

              <SmoothLines
                data={trackerData}
                forecastSplitIndex={-1}
                showBand={false}
                solidColor="#FF5C5C"
                secondaryColor="#5AA9FF"
                tertiaryColor="#34D399"
                yMax={maxActivity}
                height={220}
              />

              <div style={{ display: 'flex', gap: '20px', marginTop: '12px', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '12px', height: '3px', background: '#FF5C5C', borderRadius: '2px' }} />
                  <span style={{ color: 'var(--ink)' }}>New threats</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '12px', height: '3px', background: '#5AA9FF', borderRadius: '2px' }} />
                  <span style={{ color: 'var(--ink)' }}>In review</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '12px', height: '3px', background: '#34D399', borderRadius: '2px' }} />
                  <span style={{ color: 'var(--ink)' }}>Taken down</span>
                </div>
              </div>
            </div>

            {/* Brand Severity RingSegments */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <h2 className="card-title">Brand Severity</h2>
                </div>
              </div>

              <RingSegments
                segments={severities}
                centerValue={totalIncidents}
                centerCaption="Total Incidents"
                size={170}
              />

              <div className="donut-legend" style={{ marginTop: '16px' }}>
                {severities.map((sev, idx) => (
                  <div key={idx} className="donut-legend-item">
                    <div className="donut-legend-left">
                      <span className="donut-legend-dot" style={{ background: sev.color }} />
                      <span>{sev.label}</span>
                    </div>
                    <span style={{ fontWeight: 700, color: '#EDEDF2' }}>{sev.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Platform Distribution 5 Cards */}
          <div>
            <div className="card-header" style={{ marginBottom: '14px' }}>
              <div className="card-header-left">
                <div className="card-header-icon">
                  <Radio size={20} />
                </div>
                <h2 className="card-title">Platform Distribution</h2>
              </div>
            </div>

            <div className="platform-cards-grid">
              {platforms.map((p, idx) => (
                <div key={idx} className="card platform-card">
                  <div className="platform-card-header">
                    <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#EDEDF2' }}>
                      {p.name}
                    </span>
                    <Globe size={18} color="var(--dim)" />
                  </div>

                  <div className="platform-card-body">
                    <div className="platform-card-stat">
                      <span className="platform-count">{p.count}</span>
                      <div className="change-pill bad">
                        <TrendingUp size={11} strokeWidth={2} />
                        <span>{p.change}</span>
                      </div>
                    </div>

                    <BarSpark data={p.bars} color="#7F95FF" width={100} height={34} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom 3 Cards: Digital Twin, Takedown Queue, Monitoring Coverage */}
          <div className="brand-bottom-grid">
            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <h2 className="card-title" style={{ fontSize: '15px' }}>Brand Digital Twin</h2>
                </div>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--dim)', lineHeight: '1.5', marginBottom: '10px' }}>
                Monitors registered trademarks: Acme Bank™, AcmePay, com.acmebank.mobile across 48 TLDs, app stores, and messaging networks.
              </p>
              <div style={{ fontSize: '12px', color: 'var(--pri)', fontWeight: 600 }}>
                14 official assets actively safeguarded
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <h2 className="card-title" style={{ fontSize: '15px' }}>Takedown Queue</h2>
                </div>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--dim)', lineHeight: '1.5', marginBottom: '10px' }}>
                {view.queueCount} cases queued for registrar dispatch and legal takedown notice generation. {view.awaitingCount} awaiting internal approval.
              </p>
              <div style={{ fontSize: '12px', color: '#5BE0AE', fontWeight: 600 }}>
                {view.isSample ? 'Average platform turnaround: 14.2 hours' : ''}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <h2 className="card-title" style={{ fontSize: '15px' }}>Monitoring Coverage</h2>
                </div>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--dim)', lineHeight: '1.5', marginBottom: '10px' }}>
                {view.coverage.length
                  ? view.coverage.map((c) => `${c.channel}: ${c.entities} (${c.mode})`).join(' · ')
                  : 'Active crawls on Google Play, APKPure, Telegram public channels, Instagram business profiles and certificate transparency logs.'}
              </p>
              <div style={{ fontSize: '12px', color: '#BBA8FF', fontWeight: 600 }}>
                {view.isSample ? 'Next scheduled sync in 8 minutes' : ''}
              </div>
            </div>
          </div>

          <div className="page-bottom-note">
            {view.isSample ? 'Sample data for the fictional brand Acme Bank.' : 'Live data for your brand. Channels marked sample or not connected are not live crawls.'}
          </div>
        </div>
      </div>
    </>
  );
};
