import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { ErrorBox, Loading, Notice } from '../components/common/States';
import { ApiError } from '../api/client';
import { fmtDayTime, humanize, pct } from '../api/format';
import { sm } from '../api/sm';
import type { Evaluation, Verdict } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useMe } from '../hooks/useMe';
import './EvaluationPage.css';

const VERDICT_LABEL: Record<Verdict, string> = { flagged: 'Flagged', not_flagged: 'Not flagged', official: 'Official' };
const verdictChip = (v: Verdict) => (v === 'flagged' ? 'chip-red' : v === 'official' ? 'chip-green' : 'chip-neutral');

export const EvaluationPage: React.FC = () => {
  const { canWrite } = useMe();
  const ev = useApi((signal) => sm.evaluation(signal), []);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      ev.setData(await sm.runEvaluation());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not run the evaluation.');
    } finally {
      setRunning(false);
    }
  };

  const d: Evaluation | null = ev.data;

  return (
    <>
      <Header title="Evaluation" subtitle="How well the look-alike matcher finds impersonations, and how that was measured" />

      <div className="panel-content">
        <div className="evaluation-page-wrap">
          <div className="eval-toolbar">
            <Link to="/settings" className="head-link">← Back to Settings</Link>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => void run()}
              disabled={running || !canWrite}
              title={canWrite ? undefined : 'Analysts and administrators can re-run the evaluation'}
            >
              {running ? 'Running…' : 'Re-run evaluation'}
            </button>
          </div>
          {error && <Notice onClose={() => setError(null)}>{error}</Notice>}
          {ev.loading && <Loading what="Loading evaluation" />}
          {ev.error && <ErrorBox error={ev.error} onRetry={ev.reload} />}

          {d && (
            <>
              {d.synthetic.dataset && (
                <div className="eval-caveat" role="note" data-testid="eval-dataset">
                  <strong>{d.synthetic.dataset.banner}</strong> Dataset {d.synthetic.dataset.name} v{d.synthetic.dataset.version}, {d.synthetic.dataset.size} cases.
                  {d.synthetic.algorithm_version && ` Algorithm: social and app ${d.synthetic.algorithm_version.social_app}, web ${d.synthetic.algorithm_version.web}.`}{' '}
                  {d.synthetic.dataset.split}. ML classifier: {d.synthetic.ml_classifier}.
                </div>
              )}
              <div className="eval-caveat" role="note" data-testid="eval-label">
                <strong>Read this first.</strong> {d.label}
              </div>

              {/* Headline numbers */}
              <div className="source-kpi-grid">
                <div className="card source-kpi-card">
                  <div className="source-kpi-status-row"><span className="live-dot dot-blue" /><span className="source-kpi-lbl">Precision (synthetic)</span></div>
                  <div className="source-kpi-num" data-testid="eval-overall-precision">{pct(d.synthetic.overall.precision)}</div>
                  <div className="source-kpi-sub">{d.synthetic.overall.tp} true, {d.synthetic.overall.fp} false positives</div>
                </div>
                <div className="card source-kpi-card">
                  <div className="source-kpi-status-row"><span className="live-dot dot-blue" /><span className="source-kpi-lbl">Recall (synthetic)</span></div>
                  <div className="source-kpi-num" data-testid="eval-overall-recall">{pct(d.synthetic.overall.recall)}</div>
                  <div className="source-kpi-sub">{d.synthetic.overall.fn} missed of {d.synthetic.overall.n_pos}</div>
                </div>
                <div className="card source-kpi-card">
                  <div className="source-kpi-status-row"><span className="live-dot dot-blue" /><span className="source-kpi-lbl">F1 (synthetic)</span></div>
                  <div className="source-kpi-num" data-testid="eval-overall-f1">{pct(d.synthetic.overall.f1)}</div>
                  <div className="source-kpi-sub">{d.synthetic.brands} brands, seed {d.synthetic.seed}</div>
                </div>
                <div className="card source-kpi-card">
                  <div className="source-kpi-status-row"><span className="live-dot dot-green" /><span className="source-kpi-lbl">Reviewer precision</span></div>
                  <div className="source-kpi-num" data-testid="eval-reviewer-precision">{pct(d.detection.precision)}</div>
                  <div className="source-kpi-sub">
                    {d.detection.true_positives} confirmed, {d.detection.false_positives} dismissed
                  </div>
                </div>
              </div>

              {d.synthetic.confusion && (
                <div className="card eval-card" data-testid="eval-confusion">
                  <h3 className="panel-card-title">Confusion matrix (synthetic, flagged vs not flagged)</h3>
                  <p className="eval-sub">
                    False positive rate {pct(d.synthetic.confusion.false_positive_rate)} · false negative rate {pct(d.synthetic.confusion.false_negative_rate)} · accuracy {pct(d.synthetic.confusion.accuracy)}
                  </p>
                  <div className="test-cases-table-wrap">
                    <table className="test-cases-table">
                      <thead>
                        <tr><th />
                          <th>Flagged</th>
                          <th>Not flagged</th></tr>
                      </thead>
                      <tbody>
                        <tr><td className="case-name-cell">Real impersonation</td><td>{d.synthetic.confusion.matrix.tp} (TP)</td><td>{d.synthetic.confusion.matrix.fn} (FN)</td></tr>
                        <tr><td className="case-name-cell">Not impersonation</td><td>{d.synthetic.confusion.matrix.fp} (FP)</td><td>{d.synthetic.confusion.matrix.tn} (TN)</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <h4 className="scored-title" style={{ marginTop: 14 }}>Hard negatives by group</h4>
                  <div className="test-cases-table-wrap">
                    <table className="test-cases-table">
                      <thead><tr><th>Group</th><th>Cases</th><th>Wrongly flagged</th><th>False positive rate</th></tr></thead>
                      <tbody>
                        {d.synthetic.confusion.negative_groups.map((g) => (
                          <tr key={g.group}><td className="case-name-cell">{humanize(g.group)}</td><td>{g.n}</td><td>{g.flagged}</td><td>{pct(g.false_positive_rate)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="eval-sub">Authorized resellers carry the brand name, so a name-only matcher flags them; they are cleared by the allowlist once marked official, not by scoring.</p>
                </div>
              )}

              {d.by_category && (
                <div className="card eval-card" data-testid="eval-by-category">
                  <h3 className="panel-card-title">Per class: reviewer decisions by category</h3>
                  <div className="test-cases-table-wrap">
                    <table className="test-cases-table">
                      <thead><tr><th>Category</th><th>Detections</th><th>Confirmed</th><th>Dismissed</th><th>Precision</th></tr></thead>
                      <tbody>
                        {d.by_category.map((c) => (
                          <tr key={c.category}><td className="case-name-cell">{humanize(c.category)}</td><td>{c.total}</td><td>{c.confirmed}</td><td>{c.dismissed}</td><td>{pct(c.precision)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Per technique */}
              <div className="card eval-card">
                <h3 className="panel-card-title">By technique (synthetic names)</h3>
                <p className="eval-sub">
                  {d.synthetic.per_technique} generated names per technique and brand. Computed {fmtDayTime(d.synthetic.computed_at)}
                  {d.synthetic.cached ? ' (cached for this server process)' : ''}.
                </p>
                <div className="test-cases-table-wrap">
                  <table className="test-cases-table" data-testid="eval-technique-table">
                    <thead>
                      <tr>
                        <th>Technique</th>
                        <th>Precision</th>
                        <th>Recall</th>
                        <th>F1</th>
                        <th>Found</th>
                        <th>Missed</th>
                        <th>False alarms</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.synthetic.by_technique.map((t) => (
                        <tr key={t.technique}>
                          <td className="case-name-cell">{humanize(t.technique)}</td>
                          <td>{pct(t.precision)}</td>
                          <td>{pct(t.recall)}</td>
                          <td>{pct(t.f1)}</td>
                          <td>{t.tp}</td>
                          <td>{t.fn}</td>
                          <td>{t.fp}</td>
                        </tr>
                      ))}
                      <tr className="eval-overall-row">
                        <td className="case-name-cell">Overall</td>
                        <td>{pct(d.synthetic.overall.precision)}</td>
                        <td>{pct(d.synthetic.overall.recall)}</td>
                        <td>{pct(d.synthetic.overall.f1)}</td>
                        <td>{d.synthetic.overall.tp}</td>
                        <td>{d.synthetic.overall.fn}</td>
                        <td>{d.synthetic.overall.fp}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Labelled look-alike cases */}
              <div className="card eval-card">
                <div className="test-cases-header">
                  <div>
                    <h3 className="panel-card-title">Labelled look-alike test names</h3>
                    <p className="eval-sub">
                      {d.lookalike_tests.summary} · precision {pct(d.lookalike_tests.precision)} · recall {pct(d.lookalike_tests.recall)} · run {fmtDayTime(d.lookalike_tests.ran_at)}
                    </p>
                  </div>
                  <span className={`pass-rate-chip ${d.lookalike_tests.failed > 0 ? 'fail' : ''}`} data-testid="eval-cases-summary">{d.lookalike_tests.summary}</span>
                </div>
                <div className="test-cases-table-wrap">
                  <table className="test-cases-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Expected</th>
                        <th>Result</th>
                        <th>Match</th>
                        <th style={{ textAlign: 'center' }}>Pass</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.lookalike_tests.items.map((it) => (
                        <tr key={it.id}>
                          <td className="case-name-cell">{it.name}</td>
                          <td><span className={`chip ${verdictChip(it.expected)}`}>{VERDICT_LABEL[it.expected]}</span></td>
                          <td><span className={`chip ${verdictChip(it.result)}`}>{VERDICT_LABEL[it.result]}</span></td>
                          <td>{it.match_percent}%</td>
                          <td style={{ textAlign: 'center' }}>{it.pass ? <span className="pass-check">✓</span> : <span className="pass-cross">✗</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Reviewer decisions */}
              <div className="card eval-card">
                <h3 className="panel-card-title">Real results: reviewer decisions</h3>
                <p className="eval-sub">{d.detection.definition}</p>
                <div className="eval-decisions">
                  <span className="chip chip-red">Confirmed {d.reviewed.confirmed}</span>
                  <span className="chip chip-neutral">Dismissed {d.reviewed.dismissed}</span>
                  <span className="chip chip-green">Marked official {d.reviewed.marked_official}</span>
                  <span className="chip chip-blue">Pending {d.reviewed.pending}</span>
                </div>
                {d.detection.precision === null && <p className="eval-sub">No detections have been confirmed or dismissed yet, so there is no real precision to show.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};
