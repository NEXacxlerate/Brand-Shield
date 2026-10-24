import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Download, AlertTriangle, X, RefreshCw } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { ApiError } from '../api/client';
import { r2api } from '../api/r2';
import type { R2Alert, R2InvDetail, R2InvRow, R2Level, R2Status } from '../api/r2';
import { useBrand } from '../hooks/useBrand';
import { useApi } from '../hooks/useApi';
import { useMe } from '../hooks/useMe';
import './Round2Dashboard.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function levelClass(l: R2Level): string {
  return { CRITICAL: 'r2-critical', HIGH: 'r2-high', MEDIUM: 'r2-medium', LOW: 'r2-low' }[l] ?? '';
}

function statusLabel(s: R2Status): string {
  return { new: 'New', under_review: 'Under Review', confirmed: 'Confirmed', false_positive: 'False Positive', closed: 'Closed' }[s] ?? s;
}

function platformLabel(p: string): string {
  const M: Record<string, string> = {
    instagram: 'Instagram', facebook: 'Facebook', x: 'X (Twitter)', telegram: 'Telegram',
    linkedin: 'LinkedIn', youtube: 'YouTube', google_play: 'Google Play', app_store: 'App Store',
    third_party_apk: 'Third-party APK',
  };
  return M[p] ?? p;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Alert banner
// ---------------------------------------------------------------------------

const AlertBanner: React.FC<{ alerts: R2Alert[]; onDismiss: (id: number) => void }> = ({ alerts, onDismiss }) => {
  if (alerts.length === 0) return null;
  return (
    <div className="r2-alert-banner">
      {alerts.slice(0, 3).map((a) => (
        <div key={a.id} className={`r2-alert-item ${levelClass(a.risk_level as R2Level)}-alert`}>
          <AlertTriangle size={14} className="r2-alert-icon" />
          <span className="r2-alert-text">
            <strong>{a.risk_level} RISK</strong> — {a.name} ({platformLabel(a.platform)}) · Score {a.risk_score}/100
          </span>
          <button className="r2-alert-dismiss" onClick={() => onDismiss(a.id)} title="Dismiss alert">
            <X size={12} />
          </button>
        </div>
      ))}
      {alerts.length > 3 && (
        <div className="r2-alert-item r2-alert-more">+{alerts.length - 3} more high-risk alerts</div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Score ring
// ---------------------------------------------------------------------------

const ScoreRing: React.FC<{ score: number; level: R2Level }> = ({ score, level }) => {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = circ - (pct / 100) * circ;
  const color = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#eab308', LOW: '#22c55e' }[level] ?? '#8b9bff';
  return (
    <svg width="72" height="72" className="r2-score-ring">
      <circle cx="36" cy="36" r={r} stroke="var(--border-dim, #2a3550)" strokeWidth="6" fill="none" />
      <circle cx="36" cy="36" r={r} stroke={color} strokeWidth="6" fill="none"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 36 36)" style={{ transition: 'stroke-dashoffset 0.4s' }} />
      <text x="36" y="38" textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize="14" fontWeight="700">{score}</text>
      <text x="36" y="52" textAnchor="middle" fontSize="8" fill="var(--text-muted, #8a9bb5)">{level}</text>
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Score breakdown panel
// ---------------------------------------------------------------------------

const ScoreBreakdown: React.FC<{ bd: R2InvDetail['score_breakdown'] }> = ({ bd }) => {
  if (!bd?.breakdown) return null;
  const items = [
    { key: 'name_similarity', label: 'Name similarity' },
    { key: 'logo_similarity', label: 'Logo similarity' },
    { key: 'description_overlap', label: 'Description overlap' },
    { key: 'publisher_mismatch', label: 'Publisher mismatch' },
    { key: 'other_signals', label: 'Other signals' },
  ] as const;
  return (
    <div className="r2-breakdown">
      <p className="r2-explanation">{bd.explanation}</p>
      {items.map(({ key, label }) => {
        const item = bd.breakdown[key];
        const pct = item.weight > 0 ? Math.round((item.points / item.weight) * 100) : 0;
        return (
          <div key={key} className="r2-breakdown-row">
            <span className={`r2-check ${item.contributing ? 'r2-check-yes' : ''}`}>{item.contributing ? '✓' : '○'}</span>
            <span className="r2-breakdown-label">{label}</span>
            <div className="r2-breakdown-bar-wrap">
              <div className="r2-breakdown-bar" style={{ width: `${pct}%`, background: item.contributing ? 'var(--accent, #8b9bff)' : 'var(--border-dim)' }} />
            </div>
            <span className="r2-breakdown-pts">{item.points}/{item.weight}</span>
            <span className="r2-breakdown-hint">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Takedown report modal
// ---------------------------------------------------------------------------

const TakedownModal: React.FC<{ invId: number; onClose: () => void }> = ({ invId, onClose }) => {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    r2api.takedown(invId).then((r) => setText(r.text)).catch((e) => setErr(e instanceof ApiError ? e.message : 'Failed'));
  }, [invId]);

  const copy = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const download = () => {
    if (!text) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = `r2-takedown-${invId}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  };

  return (
    <div className="r2-modal-overlay" onClick={onClose}>
      <div className="r2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="r2-modal-head">
          <h3>Takedown Report — R2-{String(invId).padStart(6, '0')}</h3>
          <button onClick={onClose} className="r2-modal-close"><X size={16} /></button>
        </div>
        {err && <p className="r2-err">{err}</p>}
        {!text && !err && <p className="r2-muted">Generating…</p>}
        {text && <textarea className="r2-takedown-text" readOnly value={text} spellCheck={false} />}
        <div className="r2-modal-actions">
          <button className="r2-btn r2-btn-secondary" onClick={onClose}>Close</button>
          <button className="r2-btn r2-btn-secondary" onClick={download} disabled={!text}><Download size={13} /> Download</button>
          <button className="r2-btn r2-btn-primary" onClick={() => void copy()} disabled={!text}>
            {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy</>}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

const DetailPanel: React.FC<{ invId: number; onUpdated: (row: R2InvRow) => void; canWrite: boolean }> = ({ invId, onUpdated, canWrite }) => {
  const detail = useApi((sig) => r2api.detail(invId, sig), [invId]);
  const d = detail.data;
  const [note, setNote] = useState('');
  const [analyst, setAnalyst] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [showTakedown, setShowTakedown] = useState(false);

  const act = useCallback(async (fn: () => Promise<R2InvRow>, msg: string) => {
    setBusy(true); setErr(''); setOk('');
    try {
      const updated = await fn();
      setOk(msg);
      setNote('');
      onUpdated(updated);
      detail.reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Action failed.');
    } finally { setBusy(false); }
  }, [detail, onUpdated]);

  if (detail.loading) return <div className="r2-detail-panel r2-center"><span className="r2-muted">Loading…</span></div>;
  if (detail.error) return <div className="r2-detail-panel r2-center"><span className="r2-err">{detail.error.message}</span></div>;
  if (!d) return null;

  const det = d.detection;
  const bd = d.score_breakdown;

  const canStart = d.status === 'new';
  const canConfirm = d.status === 'under_review';
  const canFP = d.status === 'under_review';
  const canClose = d.status === 'confirmed';
  const canReopen = d.status === 'false_positive' || d.status === 'closed';
  const canTakedown = d.status === 'confirmed' || d.status === 'closed';

  return (
    <div className="r2-detail-panel">
      {showTakedown && <TakedownModal invId={d.id} onClose={() => setShowTakedown(false)} />}

      <div className="r2-detail-head">
        <div>
          <h2 className="r2-detail-title">{d.name || '—'}</h2>
          <p className="r2-detail-sub">{platformLabel(d.platform)} · {d.category} · Detection #{d.detection_id}</p>
        </div>
        <ScoreRing score={d.risk_score} level={d.risk_level} />
      </div>

      <div className="r2-chips">
        <span className={`r2-chip ${levelClass(d.risk_level)}`}>{d.risk_level}</span>
        <span className="r2-chip r2-chip-status">{statusLabel(d.status)}</span>
        {d.assigned_to && <span className="r2-chip r2-chip-neutral">Analyst: {d.assigned_to}</span>}
      </div>

      {/* Evidence comparison */}
      {det && (
        <div className="r2-evidence-grid">
          <div className="r2-ev-card r2-ev-official">
            <div className="r2-ev-tag">OFFICIAL</div>
            <p className="r2-ev-name">Legitimate brand asset</p>
            {det.evidence.name_similarity_pct > 0 &&
              <p className="r2-ev-stat">Name similarity: <strong>{det.evidence.name_similarity_pct}%</strong></p>}
            {det.evidence.logo_similarity_pct != null &&
              <p className="r2-ev-stat">Logo similarity: <strong>{det.evidence.logo_similarity_pct}%</strong></p>}
          </div>
          <div className="r2-ev-card r2-ev-suspect">
            <div className="r2-ev-tag r2-ev-tag-suspect">SUSPECT</div>
            <p className="r2-ev-name">{det.suspected_asset.name}</p>
            {det.suspected_asset.handle && <p className="r2-ev-stat">Handle: <strong>{det.suspected_asset.handle}</strong></p>}
            {det.suspected_asset.publisher && <p className="r2-ev-stat">Publisher: <strong>{det.suspected_asset.publisher}</strong></p>}
            {det.suspected_asset.url && (
              <p className="r2-ev-stat">
                URL: <a href={det.suspected_asset.url} target="_blank" rel="noopener noreferrer" className="r2-link">
                  {det.suspected_asset.url.slice(0, 45)}{det.suspected_asset.url.length > 45 ? '…' : ''}
                </a>
              </p>
            )}
            {det.suspected_asset.bio && <p className="r2-ev-bio">{det.suspected_asset.bio.slice(0, 120)}{det.suspected_asset.bio.length > 120 ? '…' : ''}</p>}
          </div>
        </div>
      )}

      {/* Score breakdown */}
      {bd && <ScoreBreakdown bd={bd} />}

      {/* Note input */}
      {canWrite && (
        <label className="r2-note-label">
          <span className="r2-field-lbl">Note (optional, attached to the next action)</span>
          <textarea className="r2-note-input" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}

      {/* Actions */}
      {canWrite && (
        <div className="r2-actions">
          {canStart && <button className="r2-btn r2-btn-primary" disabled={busy} onClick={() => void act(() => r2api.start(d.id, note), 'Investigation started.')}>Start Investigation</button>}
          {canConfirm && <button className="r2-btn r2-btn-danger" disabled={busy} onClick={() => void act(() => r2api.confirm(d.id, note), 'Confirmed.')}>Confirm</button>}
          {canFP && <button className="r2-btn r2-btn-secondary" disabled={busy} onClick={() => void act(() => r2api.falsePositive(d.id, note), 'Marked as false positive.')}>False Positive</button>}
          {canClose && <button className="r2-btn r2-btn-secondary" disabled={busy} onClick={() => void act(() => r2api.close(d.id, note), 'Closed.')}>Close</button>}
          {canReopen && <button className="r2-btn r2-btn-secondary" disabled={busy} onClick={() => void act(() => r2api.reopen(d.id, note), 'Reopened.')}>Reopen</button>}
          <button className="r2-btn r2-btn-secondary" disabled={busy || !note.trim()}
            onClick={() => void act(() => r2api.addNote(d.id, note), 'Note saved.')}>Add Note</button>
        </div>
      )}

      {/* Assign analyst */}
      {canWrite && (
        <div className="r2-assign-row">
          <input className="r2-assign-input" placeholder="Assign analyst…" value={analyst} onChange={(e) => setAnalyst(e.target.value)} />
          <button className="r2-btn r2-btn-secondary" disabled={busy || !analyst.trim()}
            onClick={() => void act(() => r2api.assign(d.id, analyst).then((r) => { setAnalyst(''); return r; }), `Assigned to ${analyst}.`)}>
            Assign
          </button>
        </div>
      )}

      {/* Takedown */}
      {canTakedown && (
        <button className="r2-btn r2-btn-takedown" onClick={() => setShowTakedown(true)}>Generate Takedown Report</button>
      )}

      {err && <p className="r2-err">{err}</p>}
      {ok && <p className="r2-ok">{ok}</p>}

      {/* History */}
      <h4 className="r2-section-head">Investigation History</h4>
      {d.history.length === 0 && <p className="r2-muted">No events yet.</p>}
      <ul className="r2-timeline">
        {[...d.history].reverse().map((ev) => (
          <li key={ev.id} className="r2-timeline-item">
            <span className="r2-tl-time">{fmtDate(ev.created_at)}</span>
            <span className="r2-tl-dot" />
            <span className="r2-tl-body">
              <strong>{ev.actor}</strong> · {ev.action.replace(/_/g, ' ')}
              {ev.to_status && ` → ${statusLabel(ev.to_status as R2Status)}`}
              {ev.note && <span className="r2-tl-note"> "{ev.note}"</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main dashboard page
// ---------------------------------------------------------------------------

export const Round2Dashboard: React.FC = () => {
  const { missing } = useBrand();
  const { canWrite } = useMe();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const listData = useApi(
    (sig) => r2api.list({ status: statusFilter || undefined, risk_level: levelFilter || undefined, q: searchQ || undefined }, sig),
    [statusFilter, levelFilter, searchQ]
  );
  const alertData = useApi((sig) => r2api.alerts(sig), []);

  const alerts = alertData.data?.items ?? [];
  const items = listData.data?.items ?? [];
  const counts = listData.data?.counts;
  const selectedRow = items.find((i) => i.id === selectedId) ?? items[0] ?? null;

  // Auto-sync on mount
  useEffect(() => {
    setSyncing(true);
    r2api.sync()
      .then((r) => { if (r.imported > 0) { setSyncMsg(`${r.imported} new detection${r.imported !== 1 ? 's' : ''} imported from Round 1.`); listData.reload(); } })
      .catch(() => { /* silent: sync errors don't block the page */ })
      .finally(() => setSyncing(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissAlert = async (id: number) => {
    await r2api.dismissAlert(id);
    alertData.reload();
  };

  const handleUpdated = useCallback((_row: R2InvRow) => {
    listData.reload();
  }, [listData]);

  if (missing) {
    return (
      <>
        <Header title="Risk Investigation" subtitle="Brand must be set up first." />
        <div className="panel-content"><p className="r2-muted">No brand profile found. Set up your brand first.</p></div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Risk Investigation"
        subtitle="Risk scoring, analyst workflow and investigation history on top of Round 1 detections"
      />
      <div className="panel-content r2-page">

        {/* Alert banners */}
        <AlertBanner alerts={alerts} onDismiss={(id) => void dismissAlert(id)} />

        {syncMsg && <div className="r2-sync-notice">{syncMsg}</div>}

        {/* Summary stats */}
        {counts && (
          <div className="r2-stats-row">
            <div className="r2-stat">
              <span className="r2-stat-num">{listData.data?.total ?? 0}</span>
              <span className="r2-stat-label">Total</span>
            </div>
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((l) => (
              <div key={l} className={`r2-stat r2-stat-${l.toLowerCase()}`}
                onClick={() => setLevelFilter(levelFilter === l ? '' : l)} style={{ cursor: 'pointer' }}>
                <span className="r2-stat-num">{counts.by_level[l] ?? 0}</span>
                <span className="r2-stat-label">{l}</span>
              </div>
            ))}
            <div className="r2-stat" onClick={() => setStatusFilter(statusFilter === 'new' ? '' : 'new')} style={{ cursor: 'pointer' }}>
              <span className="r2-stat-num">{counts.by_status['new'] ?? 0}</span>
              <span className="r2-stat-label">New</span>
            </div>
            <div className="r2-stat" onClick={() => setStatusFilter(statusFilter === 'confirmed' ? '' : 'confirmed')} style={{ cursor: 'pointer' }}>
              <span className="r2-stat-num">{counts.by_status['confirmed'] ?? 0}</span>
              <span className="r2-stat-label">Confirmed</span>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="r2-filters">
          <input className="r2-search" placeholder="Search by name or handle…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
          <select className="r2-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="under_review">Under Review</option>
            <option value="confirmed">Confirmed</option>
            <option value="false_positive">False Positive</option>
            <option value="closed">Closed</option>
          </select>
          <select className="r2-select" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
            <option value="">All risk levels</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <button className="r2-btn r2-btn-secondary r2-sync-btn"
            disabled={syncing}
            onClick={() => {
              setSyncing(true);
              r2api.sync()
                .then((r) => { setSyncMsg(`Sync complete: ${r.imported} imported, ${r.already_present} existing.`); listData.reload(); })
                .catch(() => setSyncMsg('Sync failed.'))
                .finally(() => setSyncing(false));
            }}>
            <RefreshCw size={13} className={syncing ? 'r2-spin' : ''} /> Sync
          </button>
        </div>

        {/* Two-column: list + detail */}
        <div className="r2-main-grid">
          {/* Left: priority queue */}
          <div className="r2-list-card card">
            <div className="r2-list-head">
              <h3>Priority Queue</h3>
              <span className="r2-muted">{listData.data?.total ?? 0} investigation{listData.data?.total !== 1 ? 's' : ''}</span>
            </div>
            <div className="r2-list-scroll">
              {listData.loading && <p className="r2-muted r2-center">Loading…</p>}
              {listData.error && <p className="r2-err r2-center">{listData.error.message}</p>}
              {listData.data && items.length === 0 && (
                <p className="r2-empty">No investigations yet. Click Sync to import Round 1 detections.</p>
              )}
              {items.map((item) => (
                <div key={item.id}
                  className={`r2-row ${selectedRow?.id === item.id ? 'r2-row-active' : ''}`}
                  onClick={() => setSelectedId(item.id)}>
                  <div className="r2-row-left">
                    <span className={`r2-level-badge ${levelClass(item.risk_level)}`}>{item.risk_level}</span>
                    <div>
                      <p className="r2-row-name">{item.name || '—'}</p>
                      <p className="r2-row-sub">{platformLabel(item.platform)} · {statusLabel(item.status)}
                        {item.assigned_to ? ` · ${item.assigned_to}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="r2-row-right">
                    <span className={`r2-score-badge ${levelClass(item.risk_level)}`}>{item.risk_score}</span>
                    {item.alerted && <span className="r2-alert-dot" title="High-risk alert fired" />}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: detail */}
          {selectedRow ? (
            <DetailPanel key={selectedRow.id} invId={selectedRow.id} onUpdated={handleUpdated} canWrite={canWrite} />
          ) : (
            <div className="r2-detail-panel r2-center r2-empty-detail">
              <p className="r2-muted">Select an investigation to see details, evidence and actions.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
