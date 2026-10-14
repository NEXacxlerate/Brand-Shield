import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { LogoCompareCard } from '../components/common/LogoCompareCard';
import { Header } from '../components/layout/Header';
import { Empty, ErrorBox, Loading, NoBrand, Notice, SampleNote } from '../components/common/States';
import { sm } from '../api/sm';
import type { TestCaseRun, Verdict } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useBrand } from '../hooks/useBrand';
import { useLookalike } from '../hooks/useLookalike';
import { useMe } from '../hooks/useMe';
import { brandExamples } from '../utils/brandExamples';
import '../components/common/States.css';
import './LookalikeLabPage.css';

const VERDICT_LABEL: Record<Verdict, string> = { flagged: 'Flagged', not_flagged: 'Not flagged', official: 'Official' };
const verdictChip = (v: Verdict) => (v === 'flagged' ? 'chip-red' : v === 'official' ? 'chip-green' : 'chip-neutral');

export const LookalikeLabPage: React.FC = () => {
  const { brand, missing } = useBrand();
  const { canWrite } = useMe();
  const brandName = brand?.name ?? '';
  const [testInput, setTestInput] = useState('');
  const live = useLookalike(testInput, !missing);
  const ex = brandExamples(brandName);

  // Test cases: the list comes from the server; results only exist after "Run test cases" (computed by the real engine).
  const cases = useApi((signal) => sm.testCases(signal), []);
  const [run, setRun] = useState<TestCaseRun | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  useEffect(() => {
    setRun(null);
  }, [brand?.id]);

  const runCases = async () => {
    setRunning(true);
    setRunError(null);
    try {
      setRun(await sm.runTestCases());
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Could not run the test cases.');
    } finally {
      setRunning(false);
    }
  };

  // Quick picks and the first input come from this brand's own test cases (built from the registered name).
  const presetNames = (cases.data?.items ?? []).slice(0, 8).map((c) => c.name);
  const firstPick = (cases.data?.items ?? []).find((c) => c.expected === 'flagged')?.name ?? presetNames[0] ?? '';
  useEffect(() => {
    if (firstPick) setTestInput((cur) => cur || firstPick);
  }, [firstPick]);

  const r = live.result;
  const rows = run
    ? run.items.map((it) => ({ key: it.id, name: it.name, expected: it.expected, result: it.result as Verdict | null, pass: it.pass as boolean | null }))
    : (cases.data?.items ?? []).map((it) => ({ key: it.id, name: it.name, expected: it.expected, result: null as Verdict | null, pass: null as boolean | null }));

  return (
    <>
      <Header
        title="Look-alike Lab"
        subtitle="See how names are normalized and matched before anything is flagged"
      />

      <div className="panel-content">
        <div className="lookalike-page-wrap">
          {/* Top 2-Column Split */}
          <div className="lookalike-top-grid">
            {/* Left Interactive Tester */}
            <div className="card test-name-card">
              <div className="test-name-head">
                <h3 className="panel-card-title">Test a name</h3>
                <span className="compare-target">Comparing against: {brandName}</span>
              </div>

              <div className="test-input-group">
                <label className="test-lbl">Profile name, handle or app name</label>
                <input
                  type="text"
                  className="test-input-field"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                />
              </div>

              {/* Preset clickable pills */}
              <div className="preset-pills-row">
                {presetNames.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`preset-pill-btn ${testInput === p ? 'active' : ''}`}
                    onClick={() => setTestInput(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>

              {/* Match Result Container */}
              <div className="match-result-container" data-testid="match-result" aria-live="polite">
                {missing && <NoBrand />}
                {!missing && live.error && <ErrorBox error={live.error} compact />}
                {!missing && !r && !live.error && (live.loading || testInput.trim()) && <Loading what="Testing the name" />}
                {!missing && !testInput.trim() && <Empty>Type a name to see how it is matched.</Empty>}
                {r && (
                  <>
                    <div className="match-result-head">
                      <h4 className="match-title" data-testid="verdict-headline">{r.headline}</h4>
                      <p className="match-desc">{r.explanation}</p>
                    </div>

                    <div className="match-chips-row">
                      <span className={`chip ${verdictChip(r.verdict)}`} data-testid="verdict-chip">{VERDICT_LABEL[r.verdict]}</span>
                      <span className="chip chip-purple">Name match {r.match_percent}%</span>
                      {r.reasons.map((x, i) => (
                        <span key={i} className="chip chip-blue">{x.label}</span>
                      ))}
                    </div>

                    {/* Steps normalized */}
                    <div className="normalization-steps-box">
                      <div className="steps-title">How the name was normalized</div>
                      <div className="steps-timeline">
                        {r.normalization.map((st) => (
                          <div key={st.step} className="step-timeline-row">
                            <span className="step-timeline-num">{st.step}</span>
                            <span className="step-timeline-lbl">{st.label}</span>
                            <span className="step-timeline-val">{st.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Right Side Guide Panels */}
            <div className="lookalike-side-stack">
              {/* Variations we catch */}
              <div className="card variations-card">
                <h3 className="panel-card-title">Variations we catch</h3>

                <div className="variation-item">
                  <div className="variation-head">Character swaps</div>
                  <div className="variation-example">{ex.swap} → {ex.compact}</div>
                </div>

                <div className="variation-item">
                  <div className="variation-head">Digits and symbols for letters</div>
                  <div className="variation-example">{ex.digit} → {ex.compact}</div>
                </div>

                <div className="variation-item">
                  <div className="variation-head">Added words</div>
                  <div className="variation-example">{ex.addedWord}, {ex.addedPhrase}</div>
                </div>

                <div className="variation-item">
                  <div className="variation-head">Spacing and separators</div>
                  <div className="variation-example">{ex.spaced}, {ex.separated}</div>
                </div>

                <div className="variation-item">
                  <div className="variation-head">Transposed or missing letters</div>
                  <div className="variation-example">{ex.transposed}, {ex.missing}</div>
                </div>
              </div>

              {/* How we avoid over-flagging */}
              <div className="card avoid-flagging-card">
                <h3 className="panel-card-title">How we avoid over-flagging</h3>

                <div className="avoid-rules-list">
                  <div className="avoid-rule">
                    <Check size={14} className="rule-chk" />
                    <span>
                      Only close edits of the brand count. “{ex.other}” is a different business, not a typo of {brandName || 'the brand'}.
                    </span>
                  </div>
                  <div className="avoid-rule">
                    <Check size={14} className="rule-chk" />
                    <span>
                      Extra words must be known impersonation words such as support, refund or official.
                    </span>
                  </div>
                  <div className="avoid-rule">
                    <Check size={14} className="rule-chk" />
                    <span>
                      Official handles and package IDs are skipped before any name check.
                    </span>
                  </div>
                  <div className="avoid-rule">
                    <Check size={14} className="rule-chk" />
                    <span>
                      A name alone never decides. Logo, bio and publisher are scored too.
                    </span>
                  </div>
                </div>

                <Link to="/brand" className="edit-brands-link">
                  Edit brand names and aliases →
                </Link>
              </div>
            </div>
          </div>

          {/* Bottom Test Cases Section */}
          <div className="card test-cases-card">
            <div className="test-cases-header">
              <div>
                <h3 className="panel-card-title">Test cases</h3>
                <p className="test-cases-sub">
                  Run on this page with the same logic as above. Includes legitimate names that must not be flagged.
                </p>
              </div>
              <div className="cases-header-actions">
                <span className={`pass-rate-chip ${!run ? 'idle' : run.failed > 0 ? 'fail' : ''}`} data-testid="pass-rate">
                  {run ? `${run.passed} of ${run.total} pass` : cases.data ? `${cases.data.total} cases, not run yet` : 'Not run yet'}
                </span>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => void runCases()}
                  disabled={running || !canWrite || missing}
                  title={canWrite ? undefined : 'Your role can view but not run the test cases'}
                >
                  {running ? 'Running…' : 'Run test cases'}
                </button>
              </div>
            </div>
            {runError && <Notice onClose={() => setRunError(null)}>{runError}</Notice>}

            <div className="test-cases-table-wrap">
              {cases.loading && <Loading what="Loading test cases" />}
              {cases.error && <ErrorBox error={cases.error} onRetry={cases.reload} compact />}
              <table className="test-cases-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Expected</th>
                    <th>Result</th>
                    <th style={{ textAlign: 'center' }}>Pass</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((tc) => (
                    <tr key={tc.key}>
                      <td className="case-name-cell">{tc.name}</td>
                      <td>
                        <span className={`chip ${verdictChip(tc.expected)}`}>{VERDICT_LABEL[tc.expected]}</span>
                      </td>
                      <td>
                        {tc.result ? (
                          <span className={`chip ${verdictChip(tc.result)}`}>{VERDICT_LABEL[tc.result]}</span>
                        ) : (
                          <span className="chip chip-neutral">Not run</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {tc.pass === null ? <span className="cell-muted">·</span> : tc.pass ? <span className="pass-check">✓</span> : <span className="pass-cross">✗</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <LogoCompareCard brand={brand} missing={missing} canWrite={canWrite} />

          <SampleNote brandName={brandName} />
        </div>
      </div>
    </>
  );
};
