import React, { useState } from 'react';
import { Header } from '../components/layout/Header';
import { CandidateTools } from '../components/monitor/CandidateTools';
import { EvidenceBox, ReasonsBox, SeverityChip } from '../components/monitor/MonitorParts';
import { Empty, ErrorBox, Loading, NoBrand, Notice, SampleNote } from '../components/common/States';
import { ApiError } from '../api/client';
import { fmtDayTime, statusChip, statusLabel } from '../api/format';
import { sm } from '../api/sm';
import type { Severity } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useBrand } from '../hooks/useBrand';
import { useMe } from '../hooks/useMe';
import './WebThreatsPage.css';

const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export const WebThreatsPage: React.FC = () => {
  const { brand, missing } = useBrand();
  const { canWrite } = useMe();
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const list = useApi((signal) => sm.detections({ category: 'web', severity: severity || undefined }, signal), [severity]);
  const items = list.data?.items ?? [];
  const row = items.find((d) => d.id === selected) ?? items[0] ?? null;
  const detail = useApi((signal) => sm.detection(row!.id, signal), [row?.id], !!row);
  const d = detail.data && row && detail.data.id === row.id ? detail.data : null;

  const review = async (status: 'reviewing' | 'confirmed' | 'dismissed') => {
    if (!row) return;
    setBusy(true);
    setActionError(null);
    try {
      await sm.setReview(row.id, status, '');
      list.reload();
      detail.reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Could not save the decision.');
    } finally {
      setBusy(false);
    }
  };

  const header = <Header title="Web Threats" subtitle="Look-alike domains and links, scored by the web risk engine" />;
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
        <div className="web-threats-wrap">
          <div className="filters-action-bar">
            <div className="filter-tabs-group" role="group" aria-label="Severity filter">
              <button type="button" className={`filter-tab ${severity === '' ? 'active' : ''}`} onClick={() => setSeverity('')}>
                All severities
              </button>
              {SEVERITIES.map((s) => (
                <button key={s} type="button" className={`filter-tab ${severity === s ? 'active' : ''}`} onClick={() => setSeverity(s)}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
          <CandidateTools kind="web" canWrite={canWrite} onChanged={list.reload} />
          <p className="eval-sub">
            Domains are scored from their name, structure and (when a key is set) Google Safe Browsing. URLs are never opened by this app. A clean reputation check is not a safety guarantee.
          </p>

          <div className="web-threats-grid">
            <div className="card detections-list-card">
              <div className="panel-card-head">
                <h3 className="panel-card-title">Suspicious domains</h3>
                <span className="sort-hint">Sorted by risk</span>
              </div>
              <div className="detections-scroll-list">
                {list.loading && <Loading what="Loading web threats" />}
                {list.error && <ErrorBox error={list.error} onRetry={list.reload} compact />}
                {list.data && items.length === 0 && <Empty>No web threats{severity ? ' with this severity' : ''}. Add a URL by hand or run a scan with web checks enabled.</Empty>}
                {items.map((it) => (
                  <div key={it.id} className={`detection-row-card ${row?.id === it.id ? 'active' : ''}`} onClick={() => setSelected(it.id)} data-testid="detection-row">
                    <div className="detection-row-left">
                      <div className="detection-row-meta">
                        <div className="detection-row-name">{it.handle || it.name}</div>
                        <div className="detection-row-handle">{it.name}</div>
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

            {row && !d && <div className="card app-detail-card">{detail.error ? <ErrorBox error={detail.error} onRetry={detail.reload} /> : <Loading what="Loading detail" />}</div>}
            {row && d && (
              <div className="card app-detail-card" data-testid="detection-detail">
                <div className="detail-meta-header">
                  <span className="detail-timestamp">Web detail · found {fmtDayTime(d.found_at)}</span>
                  {d.source === 'sample' && <span className="sample-badge">Sample data</span>}
                </div>
                <h2 className="detail-subject-title">{d.handle || d.name}</h2>
                <div className="detail-subject-chips">
                  <span className={`chip band-chip band-${d.risk_band}`}>{d.risk_band} band · {d.score}</span>
                  <SeverityChip severity={d.severity} />
                  <span className={`chip ${statusChip(d.status)}`}>{statusLabel(d.status)}</span>
                </div>
                <ReasonsBox d={d} />
                <EvidenceBox d={d} />
                <div className="detail-actions-row">
                  <button type="button" className="btn-danger-outline" disabled={!canWrite || busy} onClick={() => void review('confirmed')}>
                    Confirm threat
                  </button>
                  <button type="button" className="btn-secondary" disabled={!canWrite || busy} onClick={() => void review('reviewing')}>
                    Keep reviewing
                  </button>
                  <button type="button" className="btn-secondary" disabled={!canWrite || busy} onClick={() => void review('dismissed')}>
                    Dismiss as false positive
                  </button>
                </div>
                {actionError && <Notice onClose={() => setActionError(null)}>{actionError}</Notice>}
              </div>
            )}
          </div>
          <SampleNote brandName={brand?.name} />
        </div>
      </div>
    </>
  );
};
