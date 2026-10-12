import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { useAppStore } from '../data/store';
import './LookalikeLabPage.css';

export const LookalikeLabPage: React.FC = () => {
  const { brand } = useAppStore();
  const [testInput, setTestInput] = useState('acrnebank-refund');

  const presetNames = [
    'acrnebank-refund',
    'Acme Bank Support',
    'acm3bank',
    'A C M E Bank',
    'Acme Bnak',
    'Acme Bakery',
    'Acme Hotels',
    'Acme Bank',
  ];

  // Logic to simulate dynamic response based on input
  const getNormalizationSteps = (input: string) => {
    const raw = input.trim();
    const lower = raw.toLowerCase();
    const folded = lower.replace(/rn/g, 'm').replace(/3/g, 'e').replace(/0/g, 'o');
    const clean = folded.replace(/[^a-z0-9]/g, '');
    let brandAndWords = clean;
    if (clean.includes('acme') && clean.includes('refund')) {
      brandAndWords = 'acmebank + refund';
    } else if (clean.includes('acme') && clean.includes('support')) {
      brandAndWords = 'acmebank + support';
    } else if (clean.includes('acme')) {
      brandAndWords = 'acmebank';
    }

    return [
      { step: 1, label: 'You typed', value: raw },
      { step: 2, label: 'Lower-cased', value: lower },
      { step: 3, label: 'Look-alike characters folded', value: folded },
      { step: 4, label: 'Spaces and symbols removed', value: clean },
      { step: 5, label: 'Brand and extra words', value: brandAndWords },
    ];
  };

  const steps = getNormalizationSteps(testInput);

  const testCases = [
    { name: 'acrnebank', expected: 'Flagged', result: 'Flagged', pass: true },
    { name: 'Acme Bank Support', expected: 'Flagged', result: 'Flagged', pass: true },
    { name: 'acme-bank', expected: 'Flagged', result: 'Flagged', pass: true },
    { name: 'A C M E Bank', expected: 'Flagged', result: 'Flagged', pass: true },
    { name: 'acm3bank', expected: 'Flagged', result: 'Flagged', pass: true },
    { name: 'Acme Bnak', expected: 'Flagged', result: 'Flagged', pass: true },
    { name: 'acmebank_official', expected: 'Flagged', result: 'Flagged', pass: true },
    { name: 'Acme Bakery', expected: 'Not flagged', result: 'Not flagged', pass: true },
    { name: 'Acme Hotels', expected: 'Not flagged', result: 'Not flagged', pass: true },
    { name: 'Acme Weather', expected: 'Not flagged', result: 'Not flagged', pass: true },
    { name: 'Acme Bank', expected: 'Official', result: 'Official', pass: true },
    { name: '@acmebank', expected: 'Official', result: 'Official', pass: true },
  ];

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
                <span className="compare-target">Comparing against: {brand.name}</span>
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
              <div className="match-result-container">
                <div className="match-result-head">
                  <h4 className="match-title">Flagged as a look-alike of {brand.name}</h4>
                  <p className="match-desc">
                    This name matches the brand after normalization and is not on your allowlist. It goes to the review queue with these reasons.
                  </p>
                </div>

                <div className="match-chips-row">
                  <span className="chip chip-purple">Name match 94%</span>
                  <span className="chip chip-blue">Character swap (rn → m)</span>
                  <span className="chip chip-blue">Added word: refund</span>
                </div>

                {/* Steps normalized */}
                <div className="normalization-steps-box">
                  <div className="steps-title">How the name was normalized</div>
                  <div className="steps-timeline">
                    {steps.map((st) => (
                      <div key={st.step} className="step-timeline-row">
                        <span className="step-timeline-num">{st.step}</span>
                        <span className="step-timeline-lbl">{st.label}</span>
                        <span className="step-timeline-val">{st.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side Guide Panels */}
            <div className="lookalike-side-stack">
              {/* Variations we catch */}
              <div className="card variations-card">
                <h3 className="panel-card-title">Variations we catch</h3>

                <div className="variation-item">
                  <div className="variation-head">Character swaps</div>
                  <div className="variation-example">acrnebank → acmebank</div>
                </div>

                <div className="variation-item">
                  <div className="variation-head">Digits and symbols for letters</div>
                  <div className="variation-example">acm3bank → acmebank</div>
                </div>

                <div className="variation-item">
                  <div className="variation-head">Added words</div>
                  <div className="variation-example">acmebank-support, Acme Bank Official Helpline</div>
                </div>

                <div className="variation-item">
                  <div className="variation-head">Spacing and separators</div>
                  <div className="variation-example">A C M E Bank, acme_bank</div>
                </div>

                <div className="variation-item">
                  <div className="variation-head">Transposed or missing letters</div>
                  <div className="variation-example">acmebnak, acmebnk</div>
                </div>
              </div>

              {/* How we avoid over-flagging */}
              <div className="card avoid-flagging-card">
                <h3 className="panel-card-title">How we avoid over-flagging</h3>

                <div className="avoid-rules-list">
                  <div className="avoid-rule">
                    <Check size={14} className="rule-chk" />
                    <span>
                      Only one edit away from the brand counts. “Acme Bakery” is three away.
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
              <span className="pass-rate-chip">12 of 12 pass</span>
            </div>

            <div className="test-cases-table-wrap">
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
                  {testCases.map((tc, i) => (
                    <tr key={i}>
                      <td className="case-name-cell">{tc.name}</td>
                      <td>
                        <span
                          className={`chip ${
                            tc.expected === 'Flagged'
                              ? 'chip-red'
                              : tc.expected === 'Official'
                              ? 'chip-green'
                              : 'chip-neutral'
                          }`}
                        >
                          {tc.expected}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`chip ${
                            tc.result === 'Flagged'
                              ? 'chip-red'
                              : tc.result === 'Official'
                              ? 'chip-green'
                              : 'chip-neutral'
                          }`}
                        >
                          {tc.result}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="pass-check">✓</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="page-bottom-note">
            Sample data for the fictional brand Acme Bank. Not real detections.
          </div>
        </div>
      </div>
    </>
  );
};
