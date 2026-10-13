import React, { useEffect, useRef, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Empty, ErrorBox, Loading, Notice, SampleNote } from '../components/common/States';
import { ApiError } from '../api/client';
import { RetryCostDialog, isConfirmationRequired, retryNeedsConfirm } from '../components/common/ConfirmDialog';
import { ageWords, fmtClock, fmtClock24, fmtDayTime, fmtFull, scheduleWords, sourceStatusLabel } from '../api/format';
import { sm } from '../api/sm';
import type { Scan, SourceItem, SourceList } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useBrand } from '../hooks/useBrand';
import { useMe } from '../hooks/useMe';
import './SourceHealthPage.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12:10" today, "13 Oct 12:10" on another day. */
function nextScanText(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const same = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return same ? fmtClock24(iso) : `${d.getDate()} ${MONTHS[d.getMonth()]} ${fmtClock24(iso)}`;
}

const CHECK_WORDS: Record<string, string> = { '5m': 'every 5 minutes', '15m': 'every 15 minutes', '1h': 'hourly', '1d': 'daily' };

/** "1m,5m,15m,1h,6h" -> "after 1, 5 and 15 minutes, then hourly, up to every 6 hours" (falls back to the design text). */
export function describeRetry(policy: string | null | undefined): string {
  const fallback = 'We retry automatically after 1, 5 and 15 minutes, then hourly.';
  if (!policy) return fallback;
  const steps = policy.split(',').map((s) => s.trim());
  const mins = steps.filter((s) => /^\d+m$/.test(s)).map((s) => parseInt(s, 10));
  const hours = steps.filter((s) => /^\d+h$/.test(s)).map((s) => parseInt(s, 10));
  if (!mins.length) return fallback;
  const head = mins.length > 1 ? `${mins.slice(0, -1).join(', ')} and ${mins[mins.length - 1]}` : `${mins[0]}`;
  let out = `We retry automatically after ${head} minutes`;
  if (hours.length) out += `, then hourly${hours[hours.length - 1] > 1 ? `, backing off to every ${hours[hours.length - 1]} hours` : ''}`;
  return `${out}. A retry you start by hand ignores the wait.`;
}

interface EventRow {
  key: string;
  title: string;
  at: string | null;
}

/** There is no separate source-event feed in the API: events are built from the source reports of the latest scans. */
export function eventsFromScans(scans: Scan[], limit = 6): EventRow[] {
  const out: EventRow[] = [];
  for (const s of scans) {
    const at = s.finished_at || s.started_at || s.created_at;
    const found = s.result ? `, ${s.result.new_detections} new ${s.result.new_detections === 1 ? 'detection' : 'detections'}` : '';
    out.push({ key: `scan-${s.id}`, title: s.status === 'completed' ? `Scan finished${found}` : `Scan ${s.status}${found}, ${s.message}`, at });
    for (const r of s.source_report ?? []) {
      if (r.status !== 'online') out.push({ key: `scan-${s.id}-${r.collector}`, title: `${r.collector} ${r.status}, ${r.message}`, at });
    }
  }
  return out.slice(0, limit);
}

export const SourceHealthPage: React.FC = () => {
  const { brand } = useBrand();
  const { canWrite } = useMe();
  const src = useApi((signal) => sm.sources(signal), []);
  const scans = useApi((signal) => sm.scans(5, signal), []);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [confirmItem, setConfirmItem] = useState<{ item: SourceItem; credits?: number; remaining?: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  const data = src.data;
  const items = data?.items ?? [];

  const patchItem = (id: number, patch: Partial<SourceItem>) =>
    src.setData((d) => (d ? ({ ...d, items: d.items.map((s) => (s.id === id ? { ...s, ...patch } : s)) } as SourceList) : d));

  const handleToggleMonitor = async (item: SourceItem) => {
    const prev = item.monitored;
    setError(null);
    patchItem(item.id, { monitored: !prev }); // optimistic
    try {
      const updated = await sm.setMonitored(item.id, !prev);
      patchItem(item.id, updated);
    } catch (e) {
      patchItem(item.id, { monitored: prev }); // roll back
      setError(e instanceof ApiError ? e.message : 'Could not change monitoring for this source.');
    }
  };

  /** The server runs the retry and answers with the finished result. If it ever answers "queued/running", poll the list until the row changes. */
  const pollUntilSettled = (id: number, before: SourceItem, left: number) => {
    pollTimer.current = setTimeout(async () => {
      try {
        const fresh = await sm.sources();
        src.setData(fresh);
        const row = fresh.items.find((s) => s.id === id);
        const settled = !row || row.status !== before.status || row.last_sync_at !== before.last_sync_at;
        if (!settled && left > 0) pollUntilSettled(id, before, left - 1);
      } catch {
        /* the next manual reload will show the error */
      }
    }, 2000);
  };

  /** A retry that can spend paid credits first asks for confirmation and shows the cost; the server enforces the same rule (409). */
  const handleRetry = async (item: SourceItem, confirmed = false) => {
    if (!confirmed && retryNeedsConfirm(item)) {
      setConfirmItem({ item });
      return;
    }
    setConfirmItem(null);
    setRetryingId(item.id);
    setError(null);
    setInfo(null);
    try {
      const r = await sm.retrySource(item.id, confirmed);
      patchItem(item.id, r.source);
      if (r.state !== 'done') pollUntilSettled(item.id, item, 10);
      setInfo(`${item.name}: retry finished, source is ${sourceStatusLabel(r.status).toLowerCase()}.`);
      src.reload();
      scans.reload();
    } catch (e) {
      if (isConfirmationRequired(e)) {
        const b = e.body as { estimated_credits?: number; credits_remaining?: number | null };
        setConfirmItem({ item, credits: b.estimated_credits, remaining: b.credits_remaining });
      } else {
        setError(e instanceof ApiError ? e.message : 'Retry failed.'); // e.g. 409: nothing to retry / not monitored
      }
    } finally {
      setRetryingId(null);
    }
  };

  const credits = data?.tavily_credits ?? null;
  const used = credits ? Math.max(credits.used, credits.reported_used ?? 0) : 0;
  const usedPct = credits && credits.budget > 0 ? Math.min(100, Math.round((used / credits.budget) * 100)) : 0;
  const events = eventsFromScans(scans.data?.items ?? []);

  return (
    <>
      {confirmItem && (
        <RetryCostDialog
          item={confirmItem.item}
          credits={confirmItem.credits}
          remaining={confirmItem.remaining}
          onConfirm={() => void handleRetry(confirmItem.item, true)}
          onCancel={() => setConfirmItem(null)}
        />
      )}
      <Header
        title="Source Health"
        subtitle="Where we look for impersonations, and what happens when a source is down"
      />

      <div className="panel-content">
        <div className="sources-page-wrap">
          {src.loading && <Loading what="Loading sources" />}
          {src.error && <ErrorBox error={src.error} onRetry={src.reload} />}
          {error && <Notice onClose={() => setError(null)}>{error}</Notice>}
          {info && <Notice kind="info" onClose={() => setInfo(null)}>{info}</Notice>}

          {data && (
            <>
              {/* Top 4 KPI Row */}
              <div className="source-kpi-grid">
                {/* KPI 1: Online */}
                <div className="card source-kpi-card">
                  <div className="source-kpi-status-row">
                    <span className="live-dot dot-green" />
                    <span className="source-kpi-lbl">Online</span>
                  </div>
                  <div className="source-kpi-num" data-testid="kpi-online">{data.summary.online}</div>
                  <div className="source-kpi-sub">of {data.summary.total} sources</div>
                </div>

                {/* KPI 2: Slow */}
                <div className="card source-kpi-card">
                  <div className="source-kpi-status-row">
                    <span className="live-dot dot-orange" />
                    <span className="source-kpi-lbl">Slow</span>
                  </div>
                  <div className="source-kpi-num">{data.summary.slow}</div>
                  <div className="source-kpi-sub">Partial results kept</div>
                </div>

                {/* KPI 3: Unavailable */}
                <div className="card source-kpi-card">
                  <div className="source-kpi-status-row">
                    <span className="live-dot dot-red" />
                    <span className="source-kpi-lbl">Unavailable</span>
                  </div>
                  <div className="source-kpi-num">{data.summary.unavailable}</div>
                  <div className="source-kpi-sub">Cached results shown</div>
                </div>

                {/* KPI 4: Next scan */}
                <div className="card source-kpi-card">
                  <div className="source-kpi-status-row">
                    <span className="live-dot dot-blue" />
                    <span className="source-kpi-lbl">Next scan</span>
                  </div>
                  <div className="source-kpi-num" data-testid="kpi-next-scan">{nextScanText(data.summary.next_scan_at)}</div>
                  <div className="source-kpi-sub">
                    {data.summary.next_scan_at ? scheduleWords(data.summary.schedule) || 'Scheduled' : 'No scan scheduled'}
                  </div>
                </div>
              </div>

              {/* Middle 2-Column Section */}
              <div className="source-middle-grid">
                {/* Left Sources List */}
                <div className="card sources-list-container-card">
                  <div className="sources-card-header">
                    <h3 className="panel-card-title">Sources</h3>
                    <span className="header-sync-info">
                      {data.summary.schedule && CHECK_WORDS[data.summary.schedule]
                        ? `Checked ${CHECK_WORDS[data.summary.schedule]}`
                        : 'Automatic checks off'}
                      {data.summary.last_full_sync_at ? ` · last full sync ${fmtFull(data.summary.last_full_sync_at)}` : ' · no sync yet'}
                    </span>
                  </div>

                  <div className="sources-cards-list">
                    {items.length === 0 && <Empty>No sources yet.</Empty>}
                    {items.map((s) => (
                      <div key={s.id} className={`source-detail-row status-${s.status}`} data-testid={`source-${s.slug}`}>
                        <div className="source-row-top">
                          <div className="source-identity-left">
                            <div className="source-logo-avatar">
                              {s.name.charAt(0)}
                            </div>
                            <div className="source-title-desc">
                              <span className="source-title-name">{s.name}</span>
                              <span className="source-desc-meta">{s.description}</span>
                            </div>
                          </div>

                          <div className="source-controls-right">
                            <span
                              className={`chip ${
                                s.status === 'online'
                                  ? 'chip-green'
                                  : s.status === 'slow'
                                  ? 'chip-orange'
                                  : 'chip-red'
                              }`}
                            >
                              {sourceStatusLabel(s.status)}
                            </span>

                            <label className="monitor-toggle-label">
                              <input
                                type="checkbox"
                                checked={s.monitored}
                                onChange={() => void handleToggleMonitor(s)}
                                className="monitor-checkbox"
                                disabled={!canWrite}
                                aria-label={`Monitor ${s.name}`}
                              />
                              <span>Monitor</span>
                            </label>
                          </div>
                        </div>

                        {s.message && (
                          <div className="source-status-message">
                            {s.message}
                          </div>
                        )}

                        <div className="source-row-bottom">
                          <span className="source-sync-text">
                            {s.last_sync_at ? `Last sync ${fmtClock(s.last_sync_at)}` : 'Not synced yet'}
                            {s.detail ? ` · ${s.detail}` : ''}
                            {s.status === 'unavailable' && s.cached_age_seconds != null ? ` · cached ${ageWords(s.cached_age_seconds)} ago` : ''}
                            {s.status !== 'online' && s.next_retry_at ? ` · next retry ${fmtDayTime(s.next_retry_at)}` : ''}
                          </span>

                          {(s.status === 'slow' || s.status === 'unavailable') && (
                            <button
                              type="button"
                              className="btn-secondary btn-sm retry-btn"
                              onClick={() => void handleRetry(s)}
                              disabled={retryingId === s.id || !canWrite}
                            >
                              {retryingId === s.id ? 'Retrying…' : 'Retry now'}
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
                          <strong>The scan still finishes.</strong> Other sources are checked and results are saved.
                        </p>
                      </div>
                      <div className="unavailable-step-item">
                        <span className="step-circle">2</span>
                        <p className="step-msg">
                          <strong>Cached results are labelled.</strong> You see the age of the data, never an empty page.
                        </p>
                      </div>
                      <div className="unavailable-step-item">
                        <span className="step-circle">3</span>
                        <p className="step-msg">{describeRetry(data.summary.retry_policy)}</p>
                      </div>
                      <div className="unavailable-step-item">
                        <span className="step-circle">4</span>
                        <p className="step-msg">
                          <strong>You decide.</strong> Retry by hand, or pause a source that keeps failing.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Recent source events */}
                  <div className="card recent-events-card">
                    <h3 className="panel-card-title">Recent source events</h3>

                    <div className="source-events-list">
                      {scans.loading && <Loading />}
                      {scans.error && <ErrorBox error={scans.error} onRetry={scans.reload} compact />}
                      {scans.data && events.length === 0 && <Empty>No scans have run yet.</Empty>}
                      {events.map((ev) => (
                        <div key={ev.key} className="event-row">
                          <div className="event-dot" />
                          <div className="event-info">
                            <span className="event-title">{ev.title}</span>
                          </div>
                          <span className="event-time">{fmtDayTime(ev.at)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="helper-note">Built from the source reports of recent scans. A separate source-event feed does not exist yet.</div>
                  </div>

                  {/* Tavily credit meter */}
                  <div className="card guide-rule-card" data-testid="credit-meter">
                    <h3 className="panel-card-title">Search credits (Tavily)</h3>
                    {credits ? (
                      <>
                        <div className="credit-meter-track" role="progressbar" aria-valuemin={0} aria-valuemax={credits.budget} aria-valuenow={used}>
                          <div className={`credit-meter-fill ${usedPct >= 80 ? 'high' : ''}`} style={{ width: `${usedPct}%` }} />
                        </div>
                        <div className="credit-meter-text">
                          {used} of {credits.budget} credits used in {credits.month} · {Math.max(0, credits.budget - used)} left
                        </div>
                        {data.data_mode === 'sample' && (
                          <div className="helper-note">Sample data is on: no live searches are made, so no credits are used.</div>
                        )}
                      </>
                    ) : (
                      <Empty>No credit information from the server.</Empty>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          <SampleNote brandName={brand?.name} />
        </div>
      </div>
    </>
  );
};
