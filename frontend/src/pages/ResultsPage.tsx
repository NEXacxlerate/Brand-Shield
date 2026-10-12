import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ShieldAlert,
  Share2,
  FileText,
  UserPlus,
  FolderPlus,
  AlertTriangle,
  Sparkles,
  ExternalLink,
  Save,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { SemiGauge } from '../components/charts/SemiGauge';
import { api, errorMessage, toast, useAsync } from '../api';
import type { InvestigationView, Lifecycle } from '../api/investigations';
import './ResultsPage.css';

interface ResultsPageProps {
  onOpenMobileMenu?: () => void;
}

const LIFECYCLE: { key: Lifecycle; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'investigating', label: 'Investigating' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'resolved', label: 'Resolved' }
];

export const ResultsPage: React.FC<ResultsPageProps> = ({ onOpenMobileMenu }) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const caseParam = params.get('case');
  const { data, loading, error, reload } = useAsync(() => api.getInvestigation(caseParam), [caseParam]);
  const [analystNotes, setAnalystNotes] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const [completedActions, setCompletedActions] = useState<Record<string, boolean>>({});

  const run = async (fn: () => Promise<string | void>) => {
    try {
      const msg = await fn();
      if (msg) toast.success(msg);
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };

  const setStatus = (d: InvestigationView, status: Lifecycle, msg: string) =>
    run(async () => {
      await api.setCaseStatus(d.caseId, status);
      reload();
      return msg;
    });

  const handleAssign = (d: InvestigationView) =>
    run(async () => {
      const name = await api.assignToMe(d.caseId);
      reload();
      return `Assigned to ${name}`;
    });

  const handleSaveNote = async (d: InvestigationView) => {
    const text = analystNotes.trim();
    if (!text) return;
    const ok = await run(() => api.addNote(d.caseId, text));
    if (ok) {
      setAnalystNotes('');
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
      reload();
    }
  };

  const handleReport = (d: InvestigationView) =>
    run(async () => {
      await api.draftReport(d.caseId);
      return 'DRAFT dossier created. Nothing has been filed: it must be approved in Reports first.';
    });

  const handleAction = async (d: InvestigationView, key: string, title: string) => {
    let ok = false;
    if (key === 'monitor') {
      ok = await run(async () => {
        await api.monitorCase(d);
        return 'Added to the watchlist';
      });
    } else if (key === 'block_report') {
      ok = await handleReport(d);
    } else if (key === 'escalate') {
      ok = await setStatus(d, 'investigating', 'Escalated: case is now Investigating');
    } else if (key === 'verify') {
      ok = await setStatus(d, 'on_hold', 'Case put on hold pending verification');
    }
    if (ok) setCompletedActions((prev) => ({ ...prev, [title]: true }));
  };

  if (loading || error || !data) {
    return (
      <>
        <Header title="Investigation" subtitle="" onOpenMobileMenu={onOpenMobileMenu} />
        <div className="panel-content">
          <div className="results-page">
            {loading ? (
              <div style={{ color: 'var(--dim)', fontSize: '13px' }}>Loading…</div>
            ) : (
              <div className="card">{error ?? 'No investigations yet. Start one from the Investigate page.'}</div>
            )}
          </div>
        </div>
      </>
    );
  }

  const D = data;
  const currentIdx = LIFECYCLE.findIndex((l) => l.key === D.lifecycle);

  return (
    <>
      <Header
        title={`Investigation ${D.caseId}`}
        subtitle={`${D.target} • ${D.type} • ${D.mode}`}
        actions={
          <>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => handleAssign(D)}
            >
              <UserPlus size={14} />
              <span>Assign</span>
            </button>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => navigate('/graph')}
            >
              <FolderPlus size={14} />
              <span>Add to campaign</span>
            </button>
            <button
              type="button"
              className="btn-primary btn-small"
              onClick={() => navigate('/reports')}
            >
              <FileText size={14} />
              <span>Generate report</span>
            </button>
          </>
        }
        onOpenMobileMenu={onOpenMobileMenu}
      />

      <div className="panel-content">
        <div className="results-page">
          {/* Case Lifecycle Bar */}
          <div className="case-lifecycle-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
                Case lifecycle:
              </span>
              <div className="lifecycle-stages">
                {LIFECYCLE.map((l, idx) => (
                  <React.Fragment key={l.key}>
                    {idx > 0 && <span className="lifecycle-arrow">→</span>}
                    <div
                      className={`lifecycle-chip${idx < currentIdx ? ' done' : idx === currentIdx ? ' current' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setStatus(D, l.key, `Case marked ${l.label}`)}
                    >
                      {idx < currentIdx ? <CheckCircle2 size={13} /> : idx === currentIdx ? <Clock size={13} /> : null}
                      <span>{l.label}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="assigned-to-badge">
              <span>Assigned to</span>
              <div className="user-avatar" style={{ width: '28px', height: '28px', fontSize: '12px' }}>
                {(D.assignedTo || '?').charAt(0).toUpperCase()}
              </div>
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{D.assignedTo || 'Unassigned'}</span>
            </div>
          </div>

          {/* 3 Columns Grid */}
          <div className="results-columns-grid">
            {/* Column 1 */}
            <div className="col-stacked">
              {/* Risk Score */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-left">
                    <div className="card-header-icon">
                      <ShieldAlert size={20} />
                    </div>
                    <h2 className="card-title">Risk Score</h2>
                  </div>
                  <span className={`tag tag-${D.severity.toLowerCase()}`}>{D.severity}</span>
                </div>

                <SemiGauge
                  value={D.riskScore}
                  label={D.riskLabel}
                  sublabel="Sum of weighted signals, capped at 100."
                  size={240}
                />
                {D.method && (
                  <p style={{ fontSize: '12px', color: 'var(--dim)', marginTop: '8px' }}>{D.method}</p>
                )}
              </div>

              {/* Threat Classification */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-left">
                    <h2 className="card-title">Threat Classification</h2>
                  </div>
                </div>

                {D.classifications.map((item, idx) => (
                  <div key={idx} className="classification-item">
                    <div className="classification-label-row">
                      <span>{item.label}</span>
                      <span style={{ color: 'var(--dim)' }}>{item.percentage}% match</span>
                    </div>
                    <div className="progress-bar-track">
                      <div
                        className={`progress-bar-fill ${
                          item.percentage >= 85
                            ? 'progress-fill-critical'
                            : item.percentage >= 70
                            ? 'progress-fill-high'
                            : item.percentage >= 50
                            ? 'progress-fill-medium'
                            : 'progress-fill-primary'
                        }`}
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Key Findings */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-left">
                    <div className="card-header-icon" style={{ color: '#FF9A4D' }}>
                      <AlertTriangle size={20} />
                    </div>
                    <h2 className="card-title">Key Findings</h2>
                  </div>
                </div>

                <div className="findings-list">
                  {D.keyFindings.map((finding, idx) => (
                    <div key={idx} className="finding-row">
                      <span className="finding-bullet">•</span>
                      <span>{finding}</span>
                    </div>
                  ))}
                </div>

                <a href="#evidence" className="card-action-link" style={{ fontSize: '12.5px' }}>
                  Evidence references ({D.evidenceCount})
                </a>
              </div>
            </div>

            {/* Column 2 */}
            <div className="col-stacked">
              {/* Investigation Summary */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-left">
                    <div className="card-header-icon" style={{ color: '#A78BFA' }}>
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <h2 className="card-title">Investigation Summary</h2>
                      <p className="card-subtitle">Written from the evidence on this page</p>
                    </div>
                  </div>
                  {D.summarySource !== 'rules' && <span className="tag tag-ai">AI-generated</span>}
                </div>

                <p style={{ fontSize: '13.5px', color: 'var(--ink)', lineHeight: '1.65', marginBottom: '14px' }}>
                  {D.summary}
                </p>

                {D.summarySource && (
                  <p style={{ fontSize: '12px', color: 'var(--dim)', marginBottom: '8px' }}>
                    {D.summarySource === 'ai' ? 'Summary written from computed facts (AI)' : 'Summary written from computed facts (rules)'}
                  </p>
                )}

                <p style={{ fontSize: '12px', color: 'var(--dim)', fontStyle: 'italic' }}>
                  Verified links come from shared identifiers. Inferred links come from similarity and need a human check.
                </p>
              </div>

              {/* Related Entities Table */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-left">
                    <div className="card-header-icon">
                      <Share2 size={20} />
                    </div>
                    <div>
                      <h2 className="card-title">Related Entities</h2>
                      <p className="card-subtitle">Domains, profiles, URLs and numbers connected to this input</p>
                    </div>
                  </div>
                  <Link to="/graph" className="btn-secondary btn-small">
                    <span>Open graph</span>
                    <ExternalLink size={13} />
                  </Link>
                </div>

                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Entity</th>
                        <th>Type</th>
                        <th>Risk</th>
                        <th>Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {D.relatedEntities.map((item, idx) => (
                        <tr key={idx}>
                          <td
                            className="col-entity-input"
                            style={{ fontWeight: 600 }}
                            title={item.entity}
                          >
                            {item.entity}
                          </td>
                          <td className="cell-text" style={{ color: 'var(--dim)', fontSize: '12.5px' }} title={item.type}>{item.type}</td>
                          <td>
                            <span className={`tag tag-${item.risk.toLowerCase()}`}>
                              {item.risk}
                            </span>
                          </td>
                          <td>
                            <span className={`tag ${item.link === 'Verified' ? 'tag-info' : 'tag-neutral'}`}>
                              {item.link}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Column 3 */}
            <div className="col-stacked">
              {/* Recommended Actions */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-left">
                    <div>
                      <h2 className="card-title">Recommended Actions</h2>
                      <p className="card-subtitle">Each one needs a person to approve it</p>
                    </div>
                  </div>
                </div>

                <div className="actions-list">
                  {D.actions.map((act, idx) => {
                    const isDone = completedActions[act.title];
                    return (
                      <div key={idx} className="action-row">
                        <div className="action-info">
                          <div className="action-title">{act.title}</div>
                          <div className="action-desc">{act.desc}</div>
                        </div>
                        <button
                          type="button"
                          className={isDone ? 'btn-secondary btn-small' : 'btn-primary btn-small'}
                          onClick={() => handleAction(D, act.key, act.title)}
                        >
                          {isDone ? 'Done ✓' : 'Do'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Analyst Notes */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-left">
                    <h2 className="card-title">Analyst Notes</h2>
                  </div>
                </div>

                <textarea
                  className="input-text"
                  style={{
                    height: '110px',
                    padding: '12px',
                    lineHeight: '1.5',
                    resize: 'vertical',
                    width: '100%',
                    marginBottom: '12px'
                  }}
                  value={analystNotes}
                  onChange={(e) => setAnalystNotes(e.target.value)}
                  placeholder="Record forensic observations or takedown requests..."
                />

                {D.notes.map((n) => (
                  <p key={n.id} style={{ fontSize: '12px', color: 'var(--dim)', marginBottom: '8px' }}>
                    {n.author ? `${n.author}: ` : ''}{n.text}
                  </p>
                ))}

                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                  {noteSaved && <span style={{ fontSize: '12px', color: '#5BE0AE' }}>Saved!</span>}
                  <button type="button" className="btn-secondary btn-small" onClick={() => handleSaveNote(D)}>
                    <Save size={13} />
                    <span>Save note</span>
                  </button>
                </div>
              </div>

              {/* Generate Report */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-left">
                    <h2 className="card-title">Generate Report</h2>
                  </div>
                </div>

                <p style={{ fontSize: '12.5px', color: 'var(--dim)', marginBottom: '14px' }}>
                  Executive summary for people, technical data for systems.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn-primary btn-small"
                    onClick={() => handleReport(D)}
                  >
                    <FileText size={13} />
                    <span>PDF</span>
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => {
                      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(D, null, 2));
                      const dlAnchor = document.createElement('a');
                      dlAnchor.setAttribute('href', dataStr);
                      dlAnchor.setAttribute('download', `${D.caseId}.json`);
                      dlAnchor.click();
                    }}
                  >
                    <span>JSON</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {D.summarySource === null && (
            <div className="page-bottom-note">
              Sample case for the fictional brand Acme Bank.
            </div>
          )}
        </div>
      </div>
    </>
  );
};
