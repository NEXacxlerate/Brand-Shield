import React, { useState } from 'react';
import {
  Dna,
  SlidersHorizontal,
  CheckCircle2,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Radar } from '../components/charts/Radar';
import { api, useAsync, toast, errorMessage, primaryCampaignId } from '../api';
import './ScamDnaPage.css';

const CLUSTER_COLORS = ['#FF5C5C', '#FF9A4D', '#F5C542', '#5AA9FF', '#A78BFA', '#34D399'];

/** Split text into plain and highlighted parts; `tokens` are matched case-insensitively. */
function highlight(text: string, tokens: string[]): React.ReactNode {
  const toks = [...new Set(tokens.filter((t) => t.trim()))].sort((a, b) => b.length - a.length);
  if (!toks.length) return text;
  const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${toks.map(escape).join('|')})`, 'gi');
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="highlight-token">{part}</span>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

interface ScamDnaPageProps {
  onOpenMobileMenu?: () => void;
}

export const ScamDnaPage: React.FC<ScamDnaPageProps> = ({ onOpenMobileMenu }) => {
  const state = useAsync(async () => {
    const id = await primaryCampaignId();
    return id === null ? null : api.getScamDna(id);
  }, []);
  const dna = state.data;
  const [confirmed, setConfirmed] = useState(false);
  const campaignLabel = dna?.campaignId ? `Campaign C-${dna.campaignId}` : 'Campaign C-1';
  const radarAxes = dna?.radarAxes ?? [];
  const reasons = dna?.reasons ?? [];
  const closestCampaigns = dna?.closestCampaigns ?? [];
  const learningLoop = dna?.learningLoop ?? [];

  const handleConfirm = async () => {
    if (!dna || dna.campaignId === null) {
      toast.error('Sign in to the server to confirm a campaign.');
      return;
    }
    try {
      const r = await api.confirmCampaign(dna.campaignId);
      setConfirmed(true);
      toast.success(`Confirmed. ${r.learned} item${r.learned === 1 ? '' : 's'} added to the playbooks.`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // Campaign map: group points by cluster to draw a blob + name per cluster.
  const mapPoints = (dna?.map ?? []).map((p) => ({ ...p, cx: p.x * 380 + 20, cy: p.y * 120 + 20 }));
  const clusters = [...new Set(mapPoints.map((p) => p.cluster))].map((name, i) => {
    const pts = mapPoints.filter((p) => p.cluster === name);
    return {
      name,
      color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
      cx: pts.reduce((a, p) => a + p.cx, 0) / pts.length,
      cy: pts.reduce((a, p) => a + p.cy, 0) / pts.length
    };
  });
  const colorOf = (name: string) => clusters.find((c) => c.name === name)?.color ?? '#8B8B98';

  return (
    <>
      <Header
        title="Scam DNA"
        subtitle="A scam can change its name, logo or domain. Its operating pattern is harder to hide."
        actions={
          <>
            <span className="tag tag-neutral" style={{ height: '32px', padding: '0 12px', fontSize: '12.5px' }}>
              {campaignLabel}
            </span>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => alert('Opening case comparison matrix...')}
            >
              <SlidersHorizontal size={14} />
              <span>Compare cases</span>
            </button>
          </>
        }
        onOpenMobileMenu={onOpenMobileMenu}
      />

      <div className="panel-content">
        <div className="dna-page">
          {state.loading && <div className="card"><p className="card-subtitle">Loading…</p></div>}
          {!state.loading && state.error && <div className="card"><p className="card-subtitle">{state.error}</p></div>}
          {!state.loading && !state.error && !dna && (
            <div className="card"><p className="card-subtitle">No campaigns have been found for this brand yet.</p></div>
          )}
          {dna && (<>
          {/* Top Row: [Attack DNA + Side by Side] / Why These Match / Closest Known Campaigns */}
          <div className="dna-grid-row dna-grid-top">
            <div className="stack-col">
            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <div className="card-header-icon">
                    <Dna size={20} />
                  </div>
                  <div>
                    <h2 className="card-title">Attack DNA</h2>
                    <p className="card-subtitle">Six signal families that tie entities together</p>
                  </div>
                </div>
                <span className="tag tag-ai">Illustrative</span>
              </div>

              <div className="radar-wrap" style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
                <Radar axes={radarAxes} size={290} />
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <div>
                    <h2 className="card-title">Side by Side</h2>
                    <p className="card-subtitle">Shared wording is highlighted</p>
                  </div>
                </div>
              </div>

              <div className="side-by-side-grid">
                <div className="side-by-side-box">
                  <div className="side-box-title">{dna.sideBySide.knownLabel}</div>
                  <div>{highlight(dna.sideBySide.known, dna.sideBySide.tokens)}</div>
                </div>

                <div className="side-by-side-box">
                  <div className="side-box-title">{dna.sideBySide.caseLabel}</div>
                  <div>{highlight(dna.sideBySide.case, dna.sideBySide.tokens)}</div>
                </div>
              </div>
            </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <div className="card-header-icon" style={{ color: '#5AA9FF' }}>
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h2 className="card-title">Why These Match</h2>
                    <p className="card-subtitle">Each family shows the evidence behind it</p>
                  </div>
                </div>
              </div>

              <div className="match-reasons-list">
                {reasons.map((r, i) => (
                  <div key={i} className="match-reason-item">
                    <div className="match-reason-header">
                      <span className="match-reason-name">{r.name}</span>
                      <span className={`tag ${r.strength === 'Strong' ? 'tag-critical' : 'tag-high'}`}>
                        {r.strength}
                      </span>
                    </div>

                    <div className="progress-bar-track" style={{ height: '5px' }}>
                      <div
                        className={`progress-bar-fill ${r.percent >= 85 ? 'progress-fill-critical' : 'progress-fill-high'}`}
                        style={{ width: `${r.percent}%` }}
                      />
                    </div>

                    <div className="match-reason-note">{r.note}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Left: Closest Known Campaigns */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <h2 className="card-title">Closest Known Campaigns</h2>
                </div>
              </div>

              <div className="closest-list">
                <div className="closest-row closest-head">
                  <span>Playbook</span>
                  <span>Text similarity</span>
                  <span>Risk</span>
                </div>
                {closestCampaigns.map((c, i) => (
                  <div key={i} className="closest-row">
                    <div className="closest-main">
                      <div className="closest-name" title={c.playbook}>{c.playbook}</div>
                      <div className="closest-desc" title={c.wording}>{c.wording}</div>
                    </div>
                    <div className="closest-sim">
                      <div className="progress-bar-track" style={{ height: '5px' }}>
                        <div className="progress-bar-fill progress-fill-primary" style={{ width: c.similarity }} />
                      </div>
                      <span className="closest-pct">{c.similarity}</span>
                    </div>
                    <div className="closest-risk">
                      <span className={`tag tag-${c.risk.toLowerCase()}`}>{c.risk}</span>
                    </div>
                  </div>
                ))}
              </div>

              <p style={{ fontSize: '11.5px', color: 'var(--dim)', marginTop: '14px', fontStyle: 'italic' }}>
                {dna.note || 'Similarity is a text comparison, not a probability that the case is that scam.'}
              </p>
            </div>

          </div>

          {/* Bottom Row: Learning Loop + Campaign Map */}
          <div className="dna-grid-row dna-grid-bottom">
            {/* Left: Learning Loop */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <div className="card-header-icon" style={{ color: '#34D399' }}>
                    <RefreshCw size={20} />
                  </div>
                  <h2 className="card-title">Learning Loop</h2>
                </div>
              </div>

              <div className="learning-loop-steps">
                {learningLoop.map((step, idx) => (
                  <div key={idx} className="learning-step-item">
                    <div className="learning-step-icon">
                      <CheckCircle2 size={16} />
                    </div>
                    <span className="learning-step-label">{step}</span>
                  </div>
                ))}
              </div>

              <p style={{ fontSize: '12.5px', color: 'var(--dim)', marginBottom: '14px' }}>
                Confirming a campaign adds its wording to the playbooks so similar scams are caught earlier.
              </p>

              <button
                type="button"
                className={confirmed ? 'btn-secondary' : 'btn-primary'}
                style={{ width: '100%' }}
                onClick={handleConfirm}
              >
                {confirmed ? 'Confirmed and Added to Playbooks ✓' : 'Confirm and add to playbooks'}
              </button>
            </div>

            {/* Right: Campaign Map */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <h2 className="card-title">Campaign Map</h2>
                </div>
              </div>

              <div className="campaign-map-container">
                <svg width="100%" height="160" viewBox="0 0 420 160">
                  {/* Cluster blobs */}
                  {clusters.map((c) => (
                    <g key={c.name}>
                      <circle cx={c.cx} cy={c.cy} r={30} fill={c.color} fillOpacity={0.12} stroke={c.color} strokeWidth="1" strokeDasharray="3 3" />
                      <text x={c.cx} y={c.cy - 34 < 10 ? c.cy + 46 : c.cy - 34} textAnchor="middle" fill={c.color} fontSize="10" fontWeight="700">{c.name}</text>
                    </g>
                  ))}

                  {/* Playbook and campaign points */}
                  {mapPoints.filter((p) => !p.current).map((p, i) => (
                    <circle key={i} cx={p.cx} cy={p.cy} r={3.5} fill={colorOf(p.cluster)}>
                      <title>{p.label}</title>
                    </circle>
                  ))}

                  {/* Current Case Dot */}
                  {mapPoints.filter((p) => p.current).map((p, i) => (
                    <g key={`cur-${i}`}>
                      <circle cx={p.cx} cy={p.cy} r="5" fill="#FFFFFF" stroke={colorOf(p.cluster)} strokeWidth="2" />
                      <text x={p.cx} y={p.cy + 20 > 156 ? p.cy - 12 : p.cy + 20} textAnchor="middle" fill="#FFFFFF" fontSize="10.5" fontWeight="800">Case C-{dna.campaignId ?? 1}</text>
                    </g>
                  ))}
                </svg>
              </div>

              <div style={{ fontSize: '11.5px', color: 'var(--dim)', textAlign: 'center' }}>
                Campaigns with similar fingerprints sit close together. Illustrative layout.
              </div>
            </div>
          </div>

          {dna.campaignId === null && (
            <div className="page-bottom-note">
              Sample data for the fictional brand Acme Bank. Scores shown are illustrative.
            </div>
          )}
          </>)}
        </div>
      </div>
    </>
  );
};
