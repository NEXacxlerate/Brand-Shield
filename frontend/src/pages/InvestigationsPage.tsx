import React, { useState } from 'react';
import { Header } from '../components/layout/Header';
import { SeverityChip } from '../components/monitor/MonitorParts';
import { TakedownNoticeButton } from '../components/monitor/TakedownNoticeModal';
import { Empty, ErrorBox, Loading, NoBrand, Notice } from '../components/common/States';
import { ApiError } from '../api/client';
import { fmtDayTime, humanize, statusChip, statusLabel } from '../api/format';
import { sm } from '../api/sm';
import type { DetectionDetail, Resolution, Severity } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useBrand } from '../hooks/useBrand';
import { useMe } from '../hooks/useMe';
import './InvestigationsPage.css';

const STATUSES = ['new', 'reviewing', 'confirmed', 'dismissed', 'marked_official'] as const;
const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const RESOLUTIONS: Resolution[] = ['true_positive', 'false_positive', 'resolved', 'monitoring'];

export const InvestigationsPage: React.FC = () => {
  const { missing } = useBrand();
  const { canWrite } = useMe();
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [resolution, setResolution] = useState('');
  const [selected, setSelected] = useState<number | null>(null);

  const list = useApi(
    (signal) =>
      sm.detections(
        { status: status ? [status] : undefined, severity: (severity || undefined) as Severity | undefined, resolution: (resolution || undefined) as Resolution | undefined },
        signal
      ),
    [status, severity, resolution]
  );
  const items = list.data?.items ?? [];
  const row = items.find((d) => d.id === selected) ?? items[0] ?? null;
  const detail = useApi((signal) => sm.detection(row!.id, signal), [row?.id], !!row);
  const d = detail.data && row && detail.data.id === row.id ? detail.data : null;

  if (missing || list.error?.status === 404) {
    return (
      <>
        <Header title="Investigations" subtitle="Case workflow for every detection" />
        <div className="panel-content">
          <NoBrand />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Investigations" subtitle="Work each detection to a decision: status, resolution and notes are saved and audited" />
      <div className="panel-content">
        <div className="inv-wrap">
          <div className="inv-filters">
            <label>
              <span className="field-lbl">Status</span>
              <select data-voice="status_filter" className="field-input" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{statusLabel(s)}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-lbl">Severity</span>
              <select data-voice="severity_filter" className="field-input" aria-label="Filter by severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                <option value="">All</option>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>{humanize(s.toLowerCase())}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-lbl">Resolution</span>
              <select data-voice="resolution_filter" className="field-input" aria-label="Filter by resolution" value={resolution} onChange={(e) => setResolution(e.target.value)}>
                <option value="">All</option>
                {RESOLUTIONS.map((s) => (
                  <option key={s} value={s}>{humanize(s)}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="inv-grid">
            <div className="card detections-list-card">
              <div className="panel-card-head">
                <h3 className="panel-card-title">Cases{list.data ? ` (${list.data.total})` : ''}</h3>
              </div>
              <div className="detections-scroll-list">
                {list.loading && <Loading what="Loading cases" />}
                {list.error && <ErrorBox error={list.error} onRetry={list.reload} compact />}
                {list.data && items.length === 0 && <Empty>No detections match these filters.</Empty>}
                {items.map((it) => (
                  <div key={it.id} className={`detection-row-card ${row?.id === it.id ? 'active' : ''}`} onClick={() => setSelected(it.id)} data-testid="case-row">
                    <div className="detection-row-left">
                      <div className="detection-row-meta">
                        <div className="detection-row-name">{it.name || it.handle}</div>
                        <div className="detection-row-handle">
                          {humanize(it.category)} · {humanize(it.platform)}
                          {it.resolution ? ` · ${humanize(it.resolution)}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="detection-row-right">
                      <span className={`score-val band-${it.risk_band}`}>{it.score}</span>
                      <SeverityChip severity={it.severity} />
                      <span className={`chip ${statusChip(it.status)}`}>{statusLabel(it.status)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {row && !d && <div className="card inv-detail">{detail.error ? <ErrorBox error={detail.error} onRetry={detail.reload} /> : <Loading what="Loading case" />}</div>}
            {row && d && <CasePanel key={d.id} d={d} canWrite={canWrite} onSaved={() => { list.reload(); detail.reload(); }} />}
          </div>
        </div>
      </div>
    </>
  );
};

const CasePanel: React.FC<{ d: DetectionDetail; canWrite: boolean; onSaved: () => void }> = ({ d, canWrite, onSaved }) => {
  const [note, setNote] = useState('');
  const [res, setRes] = useState<Resolution>(d.resolution ?? 'monitoring');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await fn();
      setSaved(ok);
      setNote('');
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card inv-detail" data-testid="case-detail">
      <h2 className="detail-subject-title">{d.name || d.handle}</h2>
      <div className="detail-subject-chips">
        <span className={`chip ${statusChip(d.status)}`}>{statusLabel(d.status)}</span>
        <SeverityChip severity={d.severity} />
        <span className="chip chip-neutral" data-testid="case-resolution">{d.resolution ? humanize(d.resolution) : 'No resolution yet'}</span>
      </div>
      <p className="eval-sub">
        Score {d.score} ({d.risk_band} band) · found {fmtDayTime(d.found_at)} · {d.summary}
      </p>

      <label className="inv-note">
        <span className="field-lbl">Note (optional, saved with the decision)</span>
        <textarea data-voice="note" className="field-input" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <div className="detail-actions-row">
        <span className="field-lbl">Status</span>
        {(['reviewing', 'confirmed', 'dismissed'] as const).map((s) => (
          <button key={s} type="button" className="btn-secondary btn-sm" disabled={!canWrite || busy || d.status === 'marked_official'} onClick={() => void run(() => sm.setReview(d.id, s, note), `Status set to ${statusLabel(s)}.`)}>
            {statusLabel(s)}
          </button>
        ))}
      </div>
      <div className="detail-actions-row">
        <span className="field-lbl">Resolution</span>
        <select data-voice="resolution" className="field-input inv-res-select" aria-label="Resolution" value={res} onChange={(e) => setRes(e.target.value as Resolution)} disabled={!canWrite || busy}>
          {RESOLUTIONS.map((r) => (
            <option key={r} value={r}>{humanize(r)}</option>
          ))}
        </select>
        <button type="button" className="btn-primary btn-sm" disabled={!canWrite || busy} onClick={() => void run(() => sm.setResolution(d.id, res, note), `Resolution set to ${humanize(res)}.`)}>
          Save resolution
        </button>
      </div>
      {!canWrite && <div className="helper-note">Read only: your role can view but not change cases.</div>}
      {error && <Notice onClose={() => setError(null)}>{error}</Notice>}
      {saved && <Notice kind="info" onClose={() => setSaved(null)}>{saved}</Notice>}

      <TakedownNoticeButton d={d} />

      <h4 className="scored-title" style={{ marginTop: 16 }}>Timeline</h4>
      {d.history.length === 0 && <Empty>No history yet.</Empty>}
      <ul className="inv-timeline" data-testid="case-history">
        {[...d.history].reverse().map((h, i) => (
          <li key={i}>
            <strong>{fmtDayTime(h.at)}</strong> · {h.actor} · {humanize(h.kind)}
            {h.to ? `: ${h.from ? humanize(h.from) + ' to ' : ''}${humanize(h.to)}` : ''}
            {h.note ? ` (${h.note})` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
};
