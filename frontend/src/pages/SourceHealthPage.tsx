import React, { useState } from 'react';
import { Header } from '../components/layout/Header';
import { useAppStore } from '../data/store';
import './SourceHealthPage.css';

export const SourceHealthPage: React.FC = () => {
  const { sources, setSources, auditLog } = useAppStore();
  const [retryingSourceId, setRetryingSourceId] = useState<string | null>(null);

  const onlineCount = sources.filter((s) => s.status === 'Online').length;
  const slowCount = sources.filter((s) => s.status === 'Slow').length;
  const unavailCount = sources.filter((s) => s.status === 'Unavailable').length;

  const handleToggleMonitor = (id: string) => {
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isMonitored: !s.isMonitored } : s))
    );
  };

  const handleRetry = (id: string) => {
    setRetryingSourceId(id);
    setTimeout(() => {
      setRetryingSourceId(null);
      alert('Source sync retry initiated. Checking live endpoints...');
    }, 1200);
  };

  return (
    <>
      <Header
        title="Source Health"
        subtitle="Where we look for impersonations, and what happens when a source is down"
      />

      <div className="panel-content">
        <div className="sources-page-wrap">
          {/* Top 4 KPI Row */}
          <div className="source-kpi-grid">
            {/* KPI 1: Online */}
            <div className="card source-kpi-card">
              <div className="source-kpi-status-row">
                <span className="live-dot dot-green" />
                <span className="source-kpi-lbl">Online</span>
              </div>
              <div className="source-kpi-num">{onlineCount}</div>
              <div className="source-kpi-sub">of 8 sources</div>
            </div>

            {/* KPI 2: Slow */}
            <div className="card source-kpi-card">
              <div className="source-kpi-status-row">
                <span className="live-dot dot-orange" />
                <span className="source-kpi-lbl">Slow</span>
              </div>
              <div className="source-kpi-num">{slowCount}</div>
              <div className="source-kpi-sub">Partial results kept</div>
            </div>

            {/* KPI 3: Unavailable */}
            <div className="card source-kpi-card">
              <div className="source-kpi-status-row">
                <span className="live-dot dot-red" />
                <span className="source-kpi-lbl">Unavailable</span>
              </div>
              <div className="source-kpi-num">{unavailCount}</div>
              <div className="source-kpi-sub">Cached results shown</div>
            </div>

            {/* KPI 4: Next scan */}
            <div className="card source-kpi-card">
              <div className="source-kpi-status-row">
                <span className="live-dot dot-blue" />
                <span className="source-kpi-lbl">Next scan</span>
              </div>
              <div className="source-kpi-num">12:10</div>
              <div className="source-kpi-sub">Every 5 minutes</div>
            </div>
          </div>

          {/* Middle 2-Column Section */}
          <div className="source-middle-grid">
            {/* Left Sources List */}
            <div className="card sources-list-container-card">
              <div className="sources-card-header">
                <h3 className="panel-card-title">Sources</h3>
                <span className="header-sync-info">
                  Checked every 5 minutes · last full sync 12 Oct 2026, 12:05 PM
                </span>
              </div>

              <div className="sources-cards-list">
                {sources.map((src) => (
                  <div key={src.id} className="source-detail-row">
                    <div className="source-row-top">
                      <div className="source-identity-left">
                        <div className="source-logo-avatar">
                          {src.name.charAt(0)}
                        </div>
                        <div className="source-title-desc">
                          <span className="source-title-name">{src.name}</span>
                          <span className="source-desc-meta">{src.description}</span>
                        </div>
                      </div>

                      <div className="source-controls-right">
                        <span
                          className={`chip ${
                            src.status === 'Online'
                              ? 'chip-green'
                              : src.status === 'Slow'
                              ? 'chip-orange'
                              : 'chip-red'
                          }`}
                        >
                          {src.status}
                        </span>

                        <label className="monitor-toggle-label">
                          <input
                            type="checkbox"
                            checked={src.isMonitored}
                            onChange={() => handleToggleMonitor(src.id)}
                            className="monitor-checkbox"
                          />
                          <span>Monitor</span>
                        </label>
                      </div>
                    </div>

                    {src.statusMessage && (
                      <div className="source-status-message">
                        {src.statusMessage}
                      </div>
                    )}

                    <div className="source-row-bottom">
                      <span className="source-sync-text">
                        Last sync {src.lastSync} · {src.syncDetail}
                      </span>

                      {(src.status === 'Slow' || src.status === 'Unavailable') && (
                        <button
                          type="button"
                          className="btn-secondary btn-sm retry-btn"
                          onClick={() => handleRetry(src.id)}
                          disabled={retryingSourceId === src.id}
                        >
                          {retryingSourceId === src.id ? 'Retrying…' : 'Retry now'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Guide and Events */}
            <div className="source-side-stack">
              {/* When a source is unavailable */}
              <div className="card guide-rule-card">
                <h3 className="panel-card-title">When a source is unavailable</h3>

                <div className="unavailable-steps-list">
                  <div className="unavailable-step-item">
                    <span className="step-circle">1</span>
                    <p className="step-msg">
                      The scan still finishes. Other sources are checked and results are saved.
                    </p>
                  </div>
                  <div className="unavailable-step-item">
                    <span className="step-circle">2</span>
                    <p className="step-msg">
                      Cached results are labelled. You see the age of the data, never an empty page.
                    </p>
                  </div>
                  <div className="unavailable-step-item">
                    <span className="step-circle">3</span>
                    <p className="step-msg">
                      We retry automatically after 1, 5 and 15 minutes, then hourly.
                    </p>
                  </div>
                  <div className="unavailable-step-item">
                    <span className="step-circle">4</span>
                    <p className="step-msg">
                      You decide. Retry by hand, or pause a source that keeps failing.
                    </p>
                  </div>
                </div>
              </div>

              {/* Recent source events */}
              <div className="card recent-events-card">
                <h3 className="panel-card-title">Recent source events</h3>

                <div className="source-events-list">
                  {auditLog.map((log) => (
                    <div key={log.id} className="event-row">
                      <div className="event-dot" />
                      <div className="event-info">
                        <span className="event-title">{log.action}, {log.target}</span>
                      </div>
                      <span className="event-time">{log.time}</span>
                    </div>
                  ))}
                </div>
              </div>
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
