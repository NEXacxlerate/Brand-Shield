import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, RefreshCw } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { CandidateTools } from '../components/monitor/CandidateTools';
import { EvidenceBox, ReasonsBox, SeverityChip } from '../components/monitor/MonitorParts';
import { Empty, ErrorBox, Loading, NoBrand, Notice, SampleNote } from '../components/common/States';
import { ApiError } from '../api/client';
import { fmtDayTime, statusChip, statusLabel } from '../api/format';
import { sm } from '../api/sm';
import type { Severity, UrlExamples, UrlTestResult, UrlVerdict } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useBrand } from '../hooks/useBrand';
import { useMe } from '../hooks/useMe';
import { useScan } from '../hooks/useScan';
import { useUrlTest } from '../hooks/useUrlTest';
import '../components/common/States.css';
import './LookalikeLabPage.css';
import './WebThreatsPage.css';

const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const VERDICT_LABEL: Record<UrlVerdict, string> = {
  official: 'Official domain',
  lookalike: 'Look-alike domain',
  related: 'Related: review',
  unrelated: 'No look-alike signal',
  not_comparable: 'Cannot be compared',
};
const verdictChip = (v: UrlVerdict) => (v === 'lookalike' ? 'chip-red' : v === 'official' ? 'chip-green' : v === 'related' ? 'chip-orange' : 'chip-neutral');

/** hostname = subdomain + registrable domain (name highlighted) + TLD. Everything is rendered as text, never as HTML. */
const HostParts: React.FC<{ r: UrlTestResult }> = ({ r }) => {
  const p = r.parts;
  return (
    <div className="wt-host" data-testid="host-parts">
      {p.subdomain && <span className="wt-host-sub">{p.subdomain}.</span>}
      <span className="wt-host-name">{p.domain_label}</span>
      <span className="wt-host-tld">.{p.tld}</span>
    </div>
  );
};

const PartRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="step-timeline-row wt-part-row">
    <span className="step-timeline-lbl">{label}</span>
    <span className="step-timeline-val">{value}</span>
  </div>
);

interface ExampleRun {
  input: string;
  expected: UrlVerdict;
  result: UrlVerdict;
  pass: boolean;
}

export const WebThreatsPage: React.FC = () => {
  const { brand, missing } = useBrand();
  const { canWrite } = useMe();
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // ---- the lab: compare a typed domain with this brand's official domains
  const [testInput, setTestInput] = useState('');
  const live = useUrlTest(testInput, !missing);
  const examples = useApi<UrlExamples>((signal) => sm.testUrls(signal), [brand?.id]);
  const [runs, setRuns] = useState<ExampleRun[] | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  useEffect(() => setRuns(null), [brand?.id]);
  useEffect(() => {
    // Pre-fill with the brand's own registered domain, never a made-up look-alike. With none registered the field stays empty.
    if (examples.data) setTestInput((cur) => cur || (examples.data?.derived ? '' : examples.data?.official_domain ?? ''));
  }, [examples.data]);

  const runExamples = async () => {
    if (!examples.data) return;
    setRunning(true);
    setRunError(null);
    try {
      const out = await Promise.all(
        examples.data.items.map(async (ex) => {
          const r = await sm.lookalikeTestUrl(ex.input);
          return { input: ex.input, expected: ex.expected, result: r.verdict, pass: r.verdict === ex.expected };
        }),
      );
      setRuns(out);
    } catch (e) {
      setRunError(e instanceof ApiError ? e.message : 'Could not run the examples.');
    } finally {
      setRunning(false);
    }
  };
  const officialDomains = brand?.domains ?? [];
  const noDomains = !!brand && officialDomains.length === 0;
  const r = live.result;
  const passed = runs?.filter((x) => x.pass).length ?? 0;

  const scan = useScan('all', () => { list.reload(); });

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

  const header = <Header title="Web Threats" subtitle="Test a domain against your official domains, then review the web threats found" />;
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
          <div className="lookalike-page-wrap wt-lab">
            <div className="card test-name-card">
              <div className="test-name-head">
                <h3 className="panel-card-title">Test a domain or URL</h3>
                <span className="compare-target" data-testid="compare-target">
                  Comparing against: {brand?.name ?? ''}
                  {officialDomains.length > 0 && <> · official domains: {officialDomains.join(', ')}</>}
                </span>
              </div>
              {noDomains && (
                <Notice kind="info">
                  No official domain is registered for {brand?.name}, so only the name is compared. <Link to="/brand">Add your official domains in Brand Registry</Link>.
                </Notice>
              )}
              <div className="test-input-group">
                <label className="test-lbl" htmlFor="wt-input">Domain or URL (never opened)</label>
                <input data-voice="test_url"
                  id="wt-input"
                  type="text"
                  className="test-input-field"
                  value={testInput}
                  maxLength={2048}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setTestInput(e.target.value)}
                />
              </div>
              <div className="preset-pills-row">
                {(examples.data?.items ?? []).map((ex) => (
                  <button key={ex.input} type="button" className={`preset-pill-btn ${testInput === ex.input ? 'active' : ''}`} onClick={() => setTestInput(ex.input)} title={ex.technique}>
                    {ex.input}
                  </button>
                ))}
              </div>
              {examples.data?.derived && examples.data.note && <p className="eval-sub">{examples.data.note}</p>}

              <div className={`match-result-container wt-result v-${r?.verdict ?? 'none'}`} data-testid="match-result" aria-live="polite">
                {live.error && <ErrorBox error={live.error} compact />}
                {!r && !live.error && live.loading && testInput.trim() && <Loading what="Comparing the domain" />}
                {!testInput.trim() && <Empty>Type a domain or URL to see how it compares with your official domains.</Empty>}
                {r && testInput.trim() && (
                  <>
                    <div className="match-result-head">
                      <h4 className="match-title" data-testid="verdict-headline">{r.headline}</h4>
                      <p className="match-desc">{r.explanation}</p>
                    </div>
                    <div className="match-chips-row">
                      <span className={`chip ${verdictChip(r.verdict)}`} data-testid="verdict-chip">{VERDICT_LABEL[r.verdict]}</span>
                      {r.verdict !== 'not_comparable' && <span className="chip chip-purple">Domain score {r.score}/100</span>}
                      {r.name_match_percent != null && <span className="chip chip-purple">Name match {r.name_match_percent}%</span>}
                      {r.techniques.map((t) => (
                        <span key={t} className="chip chip-blue" data-testid="technique">{t}</span>
                      ))}
                    </div>
                    {r.parts.ok && r.parts.registrable_domain && (
                      <div className="normalization-steps-box">
                        <div className="steps-title">How the address was read</div>
                        <HostParts r={r} />
                        <div className="steps-timeline">
                          <PartRow label="You typed" value={r.input} />
                          <PartRow label="Hostname" value={r.parts.hostname ?? ''} />
                          {r.parts.is_idn && <PartRow label="Shown to people as" value={r.parts.hostname_unicode ?? ''} />}
                          <PartRow label="Subdomain" value={r.parts.subdomain_labels.length ? r.parts.subdomain_labels.join(' . ') : 'none'} />
                          <PartRow label="Registrable domain" value={r.parts.registrable_domain} />
                          <PartRow label="Top-level domain" value={`.${r.parts.tld}`} />
                          <PartRow label="Compared with" value={r.compared_with ?? (r.official_domains.length ? 'no official domain matched' : 'brand name only')} />
                          {(r.parts.port != null || r.parts.has_credentials) && (
                            <PartRow
                              label="Port / credentials"
                              value={`${r.parts.port != null ? `port ${r.parts.port}` : 'default port'}${r.parts.has_credentials ? ', has a user@ prefix (a known trick)' : ''}`}
                            />
                          )}
                        </div>
                      </div>
                    )}
                    {r.reasons.length > 0 && (
                      <ul className="wt-reasons" data-testid="reasons">
                        {r.reasons.map((x, i) => (
                          <li key={i}>
                            {x.note} <span className="cell-muted">(+{x.points})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="wt-rep-note">{r.reputation_note}</p>
                  </>
                )}
              </div>

              <div className="wt-examples-head">
                <span className={`pass-rate-chip ${!runs ? 'idle' : passed < runs.length ? 'fail' : ''}`} data-testid="pass-rate">
                  {runs ? `${passed} of ${runs.length} pass` : examples.data ? `${examples.data.items.length} examples, not run yet` : 'Not run yet'}
                </span>
                <button type="button" className="btn-secondary btn-sm" onClick={() => void runExamples()} disabled={running || !examples.data}>
                  {running ? 'Running…' : 'Run examples'}
                </button>
              </div>
              {runError && <Notice onClose={() => setRunError(null)}>{runError}</Notice>}
              {examples.error && <ErrorBox error={examples.error} onRetry={examples.reload} compact />}
              {runs && (
                <table className="test-cases-table" data-testid="example-results">
                  <thead>
                    <tr>
                      <th>Example</th>
                      <th>Expected</th>
                      <th>Result</th>
                      <th style={{ textAlign: 'center' }}>Pass</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((x) => (
                      <tr key={x.input}>
                        <td className="case-name-cell">{x.input}</td>
                        <td><span className={`chip ${verdictChip(x.expected)}`}>{VERDICT_LABEL[x.expected]}</span></td>
                        <td><span className={`chip ${verdictChip(x.result)}`}>{VERDICT_LABEL[x.result]}</span></td>
                        <td style={{ textAlign: 'center' }}>{x.pass ? <span className="pass-check">✓</span> : <span className="pass-cross">✗</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="lookalike-side-stack">
              <div className="card avoid-flagging-card">
                <h3 className="panel-card-title">How domains are compared</h3>
                <div className="avoid-rules-list">
                  {[
                    'Only the registrable domain counts (the name plus its top-level domain, like example.com). A match on your official list is official, never by substring.',
                    'Look-alikes are caught by a swapped top-level domain, look-alike letters (including other alphabets and xn-- punycode), added words, separators and typos.',
                    'Your brand inside a subdomain, or before an @ sign, is a deception trick: the real site is the registrable domain.',
                    'The address is never opened and no reputation service is called here. A clean result is not a safety guarantee.',
                  ].map((t) => (
                    <div className="avoid-rule" key={t}>
                      <Check size={14} className="rule-chk" />
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
                <Link to="/brand" className="edit-brands-link">
                  Edit official domains →
                </Link>
              </div>
            </div>
          </div>

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {scan.scanning && (
                    <span className="cell-muted" style={{ fontSize: '0.78rem' }}>
                      {scan.progress}% — {scan.message}
                    </span>
                  )}
                  {scan.last && !scan.scanning && (
                    <span className="cell-muted" style={{ fontSize: '0.78rem' }}>Scan complete</span>
                  )}
                  {scan.error && <span className="chip chip-red" style={{ fontSize: '0.75rem' }}>{scan.error}</span>}
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={scan.scanning || !canWrite}
                    onClick={() => void scan.start()}
                    title="Run a full scan to find new suspicious domains (TLD variants, Certificate Transparency)"
                  >
                    <RefreshCw size={13} style={{ marginRight: 4 }} />
                    {scan.scanning ? 'Scanning…' : 'Scan now'}
                  </button>
                </div>
              </div>
              <div className="detections-scroll-list">
                {list.loading && <Loading what="Loading web threats" />}
                {list.error && <ErrorBox error={list.error} onRetry={list.reload} compact />}
                {list.data && items.length === 0 && !scan.scanning && (
                  <Empty>No web threats{severity ? ' with this severity' : ''}. Click <strong>Scan now</strong> to find TLD variants and certificate-logged lookalike domains.</Empty>
                )}
                {list.data && items.length === 0 && scan.scanning && <Loading what="Scanning for web threats" />}
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
