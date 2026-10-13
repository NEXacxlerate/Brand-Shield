import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { ScoreRing } from '../components/charts/ScoreRing';
import { Header } from '../components/layout/Header';
import { ActionRow, EvidenceBox, ExcludedCard, GuardCard, ReasonsBox, SourcesBar } from '../components/monitor/MonitorParts';
import { Empty, ErrorBox, Loading, NoBrand, Notice, SampleNote } from '../components/common/States';
import { fmtDayTime, platformLabel, SOURCE_LABEL, statusChip, statusLabel } from '../api/format';
import { useBrand } from '../hooks/useBrand';
import { useMe } from '../hooks/useMe';
import { useMonitor } from '../hooks/useMonitor';
import './AppStoreMonitoringPage.css';

const TABS: { key: string; label: string; count: (c: { all: number; by_platform: Record<string, number> }) => number }[] = [
  { key: 'all', label: 'All stores', count: (c) => c.all },
  { key: 'google_play', label: 'Google Play', count: (c) => c.by_platform.google_play ?? 0 },
  { key: 'app_store', label: 'App Store', count: (c) => c.by_platform.app_store ?? 0 },
  { key: 'third_party_apk', label: 'Third-party APK', count: (c) => c.by_platform.third_party_apk ?? 0 },
];

export const AppStoreMonitoringPage: React.FC = () => {
  const m = useMonitor('apps');
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
      title="App Store Monitoring"
      subtitle={`Apps that copy the ${brandName || 'brand'} name, icon, publisher or description`}
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

  const suspect = detail?.suspect;

  return (
    <>
      {header}

      <div className="panel-content">
        <div className="appstore-page-wrap">
          {/* Top Sources Bar */}
          <SourcesBar state={m.sources} variant="apps" onRetried={m.reloadAll} />

          {/* Filters & Scan Action */}
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
              <span>{scan.scanning ? `Scanning… ${scan.progress}%` : 'Scan app stores now'}</span>
            </button>
          </div>
          {scan.error && <Notice>{scan.error}</Notice>}
          {scan.last && !scan.error && (
            <Notice kind="info">
              {scan.last.result
                ? `App store scan finished: ${scan.last.result.accounts_or_apps_checked} candidates checked, ${scan.last.result.new_detections} new ${scan.last.result.new_detections === 1 ? 'detection' : 'detections'}.`
                : scan.last.message}
            </Notice>
          )}

          {/* Main 2-Column Split */}
          <div className="appstore-main-grid">
            {/* Left Suspicious Apps List */}
            <div className="card detections-list-card">
              <div className="panel-card-head">
                <h3 className="panel-card-title">Suspicious apps</h3>
                <span className="sort-hint">Sorted by risk</span>
              </div>

              <div className="detections-scroll-list">
                {list.loading && <Loading what="Loading apps" />}
                {list.error && <ErrorBox error={list.error} onRetry={list.reload} compact />}
                {list.data && items.length === 0 && (
                  <Empty>{m.filter === 'all' ? 'No suspicious apps yet. Run a scan to check the stores.' : 'No apps from this store.'}</Empty>
                )}
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`detection-row-card ${selectedRow?.id === item.id ? 'active' : ''}`}
                    onClick={() => m.select(item.id)}
                    data-testid="detection-row"
                  >
                    <div className="detection-row-left">
                      <div className="app-icon-squircle">{item.name.charAt(0).toUpperCase()}</div>
                      <div className="detection-row-meta">
                        <div className="detection-row-name">{item.name}</div>
                        <div className="detection-row-handle">
                          {item.publisher || 'Unknown'} · {platformLabel(item.platform)}
                          {item.stale ? ' · cached' : ''}
                        </div>
                      </div>
                    </div>

                    <div className="detection-row-right">
                      <span className={`score-val band-${item.risk_band}`}>{item.score}</span>
                      <span className={`chip ${statusChip(item.status)}`}>{statusLabel(item.status)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right App Detail */}
            {selectedRow && !detail && (
              <div className="card app-detail-card">
                {m.detail.error ? <ErrorBox error={m.detail.error} onRetry={m.detail.reload} /> : <Loading what="Loading app" />}
              </div>
            )}
            {selectedRow && detail && (
              <div className="card app-detail-card" data-testid="detection-detail">
                <div className="detail-meta-header">
                  <span className="detail-timestamp">
                    App detail · found {fmtDayTime(detail.found_at)}
                    {detail.stale ? ` · cached${detail.cached_at ? ` ${fmtDayTime(detail.cached_at)}` : ''}` : ''}
                  </span>
                  {detail.source === 'sample' && (
                    <span className="sample-badge" data-testid="detail-sample-badge">Sample data</span>
                  )}
                </div>

                <div className="detail-subject-row">
                  <div className="detail-subject-info">
                    <h2 className="detail-subject-title">{detail.name}</h2>
                    <div className="detail-subject-chips">
                      <span className="package-sub">{detail.package_id ?? detail.handle ?? ''}</span>
                      <span className={`chip ${statusChip(detail.status)}`} data-testid="detail-status">
                        {statusLabel(detail.status)}
                      </span>
                    </div>
                  </div>

                  <ScoreRing score={detail.score} band={detail.risk_band} />
                </div>

                {/* Warning Alert Banner: only when the publisher really differs */}
                {detail.publisher_differs && (
                  <div className="publisher-alert-box">
                    <AlertTriangle size={18} className="alert-box-icon" />
                    <div className="alert-box-text">
                      Publisher differs from the official one. Official apps are published by{' '}
                      <strong>{detail.official_publisher || detail.official?.publisher || 'the brand'}</strong>, this one by{' '}
                      <strong>{detail.publisher || 'an unknown publisher'}</strong>.
                    </div>
                  </div>
                )}

                {/* OFFICIAL vs SUSPECT Comparison */}
                <div className="vs-comparison-grid">
                  {/* Official Card */}
                  <div className="vs-card official-vs">
                    <div className="vs-card-head">
                      <span className="vs-type-tag">OFFICIAL</span>
                      <span className="vs-status-tag">{detail.official?.on_allowlist ? 'On allowlist' : 'No official app listed'}</span>
                    </div>
                    <div className="vs-profile-row">
                      <div className="vs-avatar vs-avatar-official">{(detail.official?.name || brandName || 'A').charAt(0).toUpperCase()}</div>
                      <div>
                        <div className="vs-profile-name">{detail.official?.name || brandName}</div>
                        <div className="vs-profile-handle">{detail.official?.package_id ?? ''}</div>
                      </div>
                    </div>
                    <div className="vs-app-specs">
                      {detail.official?.publisher && <div>Publisher: <strong>{detail.official.publisher}</strong></div>}
                      {detail.official?.stores && detail.official.stores.length > 0 && (
                        <div>Stores: <strong>{detail.official.stores.map((s) => (SOURCE_LABEL as Record<string, string>)[s] ?? s).join(', ')}</strong></div>
                      )}
                      {detail.official?.downloads && <div>Downloads: <strong>{detail.official.downloads}</strong></div>}
                      {!detail.official?.publisher && <div>No official app is on the allowlist yet.</div>}
                    </div>
                  </div>

                  {/* Suspect Card */}
                  <div className="vs-card suspect-vs">
                    <div className="vs-card-head">
                      <span className="vs-type-tag suspect-tag">SUSPECT</span>
                      <span className="vs-match-tag" title={detail.logo?.reason ?? undefined}>
                        {suspect?.icon_match_percent != null ? `Icon ${suspect.icon_match_percent}% match` : 'Icon not compared'}
                      </span>
                    </div>
                    <div className="vs-profile-row">
                      <div className="vs-avatar vs-avatar-suspect">{detail.name.charAt(0).toUpperCase()}</div>
                      <div>
                        <div className="vs-profile-name">{detail.name}</div>
                        <div className="vs-profile-handle">{detail.package_id ?? ''}</div>
                      </div>
                    </div>
                    <div className="vs-app-specs">
                      <div>Publisher: <strong className="vs-hot">{detail.publisher || 'Unknown'}</strong></div>
                      <div>Store: <strong>{platformLabel(detail.platform)}</strong></div>
                      {(suspect?.downloads || suspect?.released) && (
                        <div>
                          Downloads: <strong>{suspect?.downloads ?? 'n/a'}</strong>
                          {suspect?.released ? ` · ${suspect.released}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Description Overlap: the server reports points, not a percentage, and no matched phrases */}
                <div className="description-overlap-card">
                  <div className="overlap-head">
                    <span className="overlap-title">
                      {detail.description && detail.description.overlap_points > 0
                        ? `Description overlap +${detail.description.overlap_points} points`
                        : 'No description overlap found'}
                    </span>
                  </div>
                  <p className="overlap-snippet">{detail.description?.snippet || 'No description was collected.'}</p>
                </div>

                <ReasonsBox d={detail} />
                <EvidenceBox d={detail} />

                {/* Action buttons */}
                <ActionRow confirmLabel="Confirm fake app" disabled={!canWrite || m.busyId === detail.id || detail.status === 'marked_official'} onAction={act} />
                {m.actionError && <Notice onClose={m.clearActionError}>{m.actionError}</Notice>}

                <div className="analyst-confirm-note">
                  A person confirms every detection. Store screenshot and listing details are saved as evidence.
                </div>
              </div>
            )}
          </div>

          {/* Bottom Dual Panels */}
          <div className="social-bottom-dual-grid">
            <ExcludedCard state={m.excluded} kind="app" description="Matched by package ID and publisher name. Never scored." />
            <GuardCard state={m.guard} kind="apps" description="Apps that share a word with your name but not your look or content are cleared." />
          </div>

          <SampleNote brandName={brandName} />
        </div>
      </div>
    </>
  );
};
