import React from 'react';
import { RotateCw } from 'lucide-react';
import { ScoreRing } from '../components/charts/ScoreRing';
import { Header } from '../components/layout/Header';
import { ActionRow, EvidenceBox, ExcludedCard, GuardCard, ReasonsBox, SeverityChip, SourcesBar } from '../components/monitor/MonitorParts';
import { CandidateTools } from '../components/monitor/CandidateTools';
import { Empty, ErrorBox, Loading, NoBrand, Notice, SampleNote } from '../components/common/States';
import { fmtDayTime, platformLabel, statusChip, statusLabel, typeLabel } from '../api/format';
import { useBrand } from '../hooks/useBrand';
import { useMe } from '../hooks/useMe';
import { useMonitor } from '../hooks/useMonitor';
import './SocialMonitoringPage.css';

const TABS: { key: string; label: string; count: (c: { all: number; by_type: Record<string, number> }) => number }[] = [
  { key: 'all', label: 'All', count: (c) => c.all },
  { key: 'fake_profile', label: 'Fake profiles', count: (c) => c.by_type.fake_profile ?? 0 },
  { key: 'fake_brand_page', label: 'Fake brand pages', count: (c) => c.by_type.fake_brand_page ?? 0 },
  { key: 'scam_account', label: 'Scam accounts', count: (c) => c.by_type.scam_account ?? 0 },
];

export const SocialMonitoringPage: React.FC = () => {
  const m = useMonitor('social');
  const { brand, missing } = useBrand();
  const { canWrite } = useMe();
  const brandName = brand?.name ?? '';

  const { items, selectedRow, list, scan } = m;
  const detail = m.detail.data && selectedRow && m.detail.data.id === selectedRow.id ? m.detail.data : null;
  const counts = list.data?.counts;

  const act = (a: 'confirmed' | 'reviewing' | 'dismissed' | 'official') => {
    if (!selectedRow) return;
    if (a === 'official') void m.markOfficial(selectedRow.id);
    else void m.review(selectedRow.id, a);
  };

  const header = (
    <Header
      title="Social Media Monitoring"
      subtitle={`Fake profiles, fake brand pages and scam accounts using the ${brandName || 'brand'} identity`}
    />
  );

  if (missing || list.error?.status === 404) {
    return (
      <>
        {header}
        <div className="panel-content">
          <NoBrand />
        </div>
      </>
    );
  }

  return (
    <>
      {header}

      <div className="panel-content">
        <div className="social-page-wrap">
          {/* Top Sources Bar */}
          <SourcesBar state={m.sources} variant="social" onRetried={m.reloadAll} />

          {/* Filter Tabs & Scan Action */}
          <div className="filters-action-bar">
            <div className="filter-tabs-group">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`filter-tab ${m.filter === t.key ? 'active' : ''}`}
                  onClick={() => m.setFilter(t.key)}
                >
                  {t.label}
                  {counts ? ` ${t.count(counts)}` : ''}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn-primary scan-btn"
              onClick={() => void scan.start()}
              disabled={scan.scanning || !canWrite}
              title={canWrite ? undefined : 'Your role can view but not start scans'}
            >
              <RotateCw size={14} className={scan.scanning ? 'spin' : ''} />
              <span>{scan.scanning ? `Scanning… ${scan.progress}%` : 'Scan social platforms now'}</span>
            </button>
          </div>
          <CandidateTools kind="social" canWrite={canWrite} onChanged={m.reloadAll} />
          {scan.error && <Notice>{scan.error}</Notice>}
          {scan.last && !scan.error && (
            <Notice kind="info">
              {scan.last.result
                ? `Social scan finished: ${scan.last.result.accounts_or_apps_checked} candidates checked, ${scan.last.result.new_detections} new ${scan.last.result.new_detections === 1 ? 'detection' : 'detections'}.`
                : scan.last.message}
            </Notice>
          )}

          {/* Main 2-Column Split */}
          <div className="social-main-grid">
            {/* Left Detections List */}
            <div className="card detections-list-card">
              <div className="panel-card-head">
                <h3 className="panel-card-title">Detections</h3>
                <span className="sort-hint">Sorted by risk</span>
              </div>

              <div className="detections-scroll-list">
                {list.loading && <Loading what="Loading detections" />}
                {list.error && <ErrorBox error={list.error} onRetry={list.reload} compact />}
                {list.data && items.length === 0 && (
                  <Empty>
                    {m.filter === 'all' ? 'No detections yet. Run a scan to look for impersonations.' : 'No detections of this type.'}
                  </Empty>
                )}
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`detection-row-card ${selectedRow?.id === item.id ? 'active' : ''}`}
                    onClick={() => m.select(item.id)}
                    data-testid="detection-row"
                  >
                    <div className="detection-row-left">
                      <div className="platform-symbol">
                        {platformLabel(item.platform).charAt(0)}
                      </div>
                      <div className="detection-row-meta">
                        <div className="detection-row-name">{item.name}</div>
                        <div className="detection-row-handle">
                          {item.handle ?? item.package_id ?? item.name} · {platformLabel(item.platform)} · {typeLabel(item.type)}
                        </div>
                      </div>
                    </div>

                    <div className="detection-row-right">
                      <span className={`score-val band-${item.risk_band}`}>{item.score}</span>
                      <SeverityChip severity={item.severity} />
                      <span className={`chip ${statusChip(item.status)}`}>{statusLabel(item.status)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Detection Detail */}
            {selectedRow && !detail && (
              <div className="card detection-detail-card">
                {m.detail.error ? <ErrorBox error={m.detail.error} onRetry={m.detail.reload} /> : <Loading what="Loading detection" />}
              </div>
            )}
            {selectedRow && detail && (
              <div className="card detection-detail-card" data-testid="detection-detail">
                <div className="detail-meta-header">
                  <span className="detail-timestamp">
                    Detection detail · {fmtDayTime(detail.found_at)}
                  </span>
                  {detail.source === 'sample' && (
                    <span className="sample-badge" data-testid="detail-sample-badge">Sample data</span>
                  )}
                </div>

                <div className="detail-subject-row">
                  <div className="detail-subject-info">
                    <h2 className="detail-subject-title">{detail.name}</h2>
                    <div className="detail-subject-chips">
                      <span className="handle-sub">{detail.handle ?? detail.package_id ?? detail.name} on {platformLabel(detail.platform)}</span>
                      <span className="chip chip-purple">{typeLabel(detail.type)}</span>
                      <span className={`chip ${statusChip(detail.status)}`} data-testid="detail-status">
                        {statusLabel(detail.status)}
                      </span>
                      <SeverityChip severity={detail.severity} />
                    </div>
                  </div>

                  <ScoreRing score={detail.score} band={detail.risk_band} />
                </div>

                {/* OFFICIAL vs SUSPECT Comparison */}
                <div className="vs-comparison-grid">
                  {/* Official Card */}
                  <div className="vs-card official-vs">
                    <div className="vs-card-head">
                      <span className="vs-type-tag">OFFICIAL</span>
                      <span className="vs-status-tag">
                        {detail.official?.on_allowlist ? 'On allowlist' : `No official ${platformLabel(detail.platform)} account listed`}
                      </span>
                    </div>
                    <div className="vs-profile-row">
                      <div className="vs-avatar vs-avatar-official">{(detail.official?.name || brandName || 'A').charAt(0).toUpperCase()}</div>
                      <div>
                        <div className="vs-profile-name">{detail.official?.name || brandName}</div>
                        <div className="vs-profile-handle">{detail.official?.handle ?? ''}</div>
                      </div>
                    </div>
                    <p className="vs-bio-text">
                      {detail.official?.bio || 'The official page bio is not collected, so it is not shown.'}
                    </p>
                    <div className="vs-footer-stats">
                      {detail.official?.followers != null && <span>Followers: <strong>{detail.official.followers}</strong></span>}
                      {detail.official?.joined != null && <span>Joined: <strong>{detail.official.joined}</strong></span>}
                      {detail.official?.link && <span>Link: <strong>{detail.official.link}</strong></span>}
                    </div>
                  </div>

                  {/* Suspect Card */}
                  <div className="vs-card suspect-vs">
                    <div className="vs-card-head">
                      <span className="vs-type-tag suspect-tag">SUSPECT</span>
                      <span className="vs-match-tag" title={detail.logo?.reason ?? undefined}>
                        {detail.suspect?.logo_match_percent != null ? `Logo ${detail.suspect.logo_match_percent}% match` : 'Logo not compared'}
                      </span>
                    </div>
                    <div className="vs-profile-row">
                      <div className="vs-avatar vs-avatar-suspect">{detail.name.charAt(0).toUpperCase()}</div>
                      <div>
                        <div className="vs-profile-name">{detail.name}</div>
                        <div className="vs-profile-handle">{detail.handle ?? detail.package_id ?? ''}</div>
                      </div>
                    </div>
                    <p className="vs-bio-text">{detail.suspect?.bio || 'No bio was collected.'}</p>
                    <div className="vs-footer-stats">
                      {detail.suspect?.followers != null && <span>Followers: <strong>{detail.suspect.followers}</strong></span>}
                      {detail.suspect?.joined != null && <span>Joined: <strong>{detail.suspect.joined}</strong></span>}
                      {(detail.suspect?.link || detail.profile_url) && <span>Link: <strong className="vs-hot">{detail.suspect?.link || detail.profile_url}</strong></span>}
                    </div>
                  </div>
                </div>

                <ReasonsBox d={detail} />
                <EvidenceBox d={detail} />

                {/* Action buttons */}
                <ActionRow confirmLabel="Confirm impersonation" disabled={!canWrite || m.busyId === detail.id || detail.status === 'marked_official'} onAction={act} />
                {m.actionError && <Notice onClose={m.clearActionError}>{m.actionError}</Notice>}

                <div className="analyst-confirm-note">
                  A person confirms every detection. No takedown request is sent automatically.
                </div>
              </div>
            )}
          </div>

          {/* Bottom Dual Panels */}
          <div className="social-bottom-dual-grid">
            <ExcludedCard state={m.excluded} kind="account" description="These matched your allowlist by exact handle and were never scored." />
            <GuardCard state={m.guard} kind="social" description="Similar-sounding names that belong to other businesses are cleared automatically." />
          </div>

          <SampleNote brandName={brandName} />
        </div>
      </div>
    </>
  );
};
