import React from 'react';
import {
  TrendingUp,
  Download,
  Clock,
  Sparkles,
  Layers
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { TickRing } from '../components/charts/TickRing';
import { SmoothLines } from '../components/charts/SmoothLines';
import { api, useAsync, toast, primaryCampaignId } from '../api';
import { downloadJson } from '../api/campaigns';
import './ThreatEvolutionPage.css';

interface ThreatEvolutionPageProps {
  onOpenMobileMenu?: () => void;
}

export const ThreatEvolutionPage: React.FC<ThreatEvolutionPageProps> = ({ onOpenMobileMenu }) => {
  const state = useAsync(async () => {
    const id = await primaryCampaignId();
    return id === null ? null : api.getThreatEvolution(id);
  }, []);
  const evo = state.data;
  const campaignLabel = evo?.campaignId ? `Campaign C-${evo.campaignId}` : 'Campaign C-1';

  const exportEvolution = () => {
    if (!evo) return;
    downloadJson(`threat-evolution-${evo.campaignId ?? 'sample'}.json`, evo);
    toast.success('Evolution exported as JSON.');
  };

  const stages = evo?.stages ?? [];
  const growthTimeline = evo?.growthTimeline ?? [];
  const stageChanges = evo?.stageChanges ?? [];
  const timeline = evo?.timeline ?? [];
  const peak = Math.max(0, ...growthTimeline.map((g) => Math.max(g.observed ?? 0, g.forecast ?? 0, g.upper ?? 0)));
  const yMax = Math.max(24, Math.ceil(peak / 6) * 6);

  const chartData = growthTimeline.map((item) => ({
    label: item.day,
    observed: item.observed,
    forecast: item.forecast,
    lower: item.lower,
    upper: item.upper
  }));

  return (
    <>
      <Header
        title="Threat Evolution"
        subtitle="Track how a threat moves from a first anomaly to an active scam, and act early."
        actions={
          <>
            <span className="tag tag-neutral" style={{ fontSize: '12.5px', height: '32px', padding: '0 12px' }}>
              {campaignLabel}
            </span>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={exportEvolution}
            >
              <Download size={14} />
              <span>Export</span>
            </button>
          </>
        }
        onOpenMobileMenu={onOpenMobileMenu}
      />

      <div className="panel-content">
        <div className="evolution-page">
          {state.loading && <div className="card"><p className="card-subtitle">Loading…</p></div>}
          {!state.loading && state.error && <div className="card"><p className="card-subtitle">{state.error}</p></div>}
          {!state.loading && !state.error && !evo && (
            <div className="card"><p className="card-subtitle">No campaigns have been found for this brand yet.</p></div>
          )}
          {evo && (<>
          {/* Threat Stages Card with 6 TickRings */}
          <div className="card">
            <div className="card-header">
              <div className="card-header-left">
                <div className="card-header-icon">
                  <Layers size={20} />
                </div>
                <div>
                  <h2 className="card-title">Threat Stages</h2>
                  <p className="card-subtitle">
                    Entities for {campaignLabel} and nearby suspects at each stage
                  </p>
                </div>
              </div>
              <a href="#view-all" className="card-action-link">View All</a>
            </div>

            <div className="tickrings-grid">
              {stages.map((st, idx) => (
                <div key={idx} className="tickring-card-item">
                  <TickRing
                    value={st.count}
                    color={st.color}
                    size={100}
                    label="Entities"
                  />
                  <div className="tickring-stage-name">{st.name}</div>
                  <div className="tickring-stage-desc">{st.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Middle 2 Columns Grid */}
          <div className="evolution-middle-grid">
            {/* Left: Campaign Growth SmoothLines + Stage Changes Table */}
            <div className="stack-col">
              {/* Campaign Growth */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-left">
                    <div className="card-header-icon">
                      <TrendingUp size={20} />
                    </div>
                    <div>
                      <h2 className="card-title">Campaign Growth</h2>
                      <p className="card-subtitle">Cumulative linked entities in {campaignLabel}</p>
                    </div>
                  </div>
                  <span className="tag tag-ai">Estimate</span>
                </div>

                <SmoothLines
                  data={chartData}
                  forecastSplitIndex={evo.splitIndex}
                  showBand={true}
                  solidColor="#FF5C5C"
                  forecastColor="#A78BFA"
                  yMax={yMax}
                  height={220}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '12px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '12px', height: '3px', background: '#FF5C5C', borderRadius: '2px' }} />
                    <span style={{ color: 'var(--ink)' }}>Observed entities</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '12px', borderTop: '2px dashed #A78BFA' }} />
                    <span style={{ color: '#A78BFA' }}>Forecast (estimate)</span>
                  </div>
                </div>
              </div>

              {/* Stage Changes Table */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-left">
                    <h2 className="card-title">Stage Changes</h2>
                  </div>
                </div>

                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Entity</th>
                        <th>From</th>
                        <th>To</th>
                        <th>When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stageChanges.map((sc, i) => (
                        <tr key={i}>
                          <td className="col-entity-input" style={{ fontWeight: 600 }} title={sc.entity}>{sc.entity}</td>
                          <td style={{ color: 'var(--dim)' }}>{sc.from}</td>
                          <td>
                            <span className="tag tag-critical">
                              {sc.to}
                            </span>
                          </td>
                          <td style={{ color: 'var(--dim)', fontSize: '12.5px' }}>{sc.when}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right: Forecast Card + Timeline */}
            <div className="stack-col">
              {/* Forecast Card */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-left">
                    <div className="card-header-icon" style={{ color: '#A78BFA' }}>
                      <Sparkles size={20} />
                    </div>
                    <h2 className="card-title">Forecast</h2>
                  </div>
                </div>

                <div className="forecast-stat-box">
                  <div className="forecast-stat-number">+{evo.forecast.next7}</div>
                  <div className="forecast-stat-label">entities in 7 days</div>
                </div>

                <div className="forecast-substat">
                  <strong>{evo.forecast.recent} vs {evo.forecast.previous}</strong> last 7 days vs the 7 before
                </div>

                <p className="forecast-explainer">
                  The trend is {evo.forecast.trend}. {evo.forecast.basis} It is an estimate, not a fact.
                </p>
              </div>

              {/* Timeline Card */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-left">
                    <div className="card-header-icon">
                      <Clock size={20} />
                    </div>
                    <div>
                      <h2 className="card-title">Timeline</h2>
                      <p className="card-subtitle">How the threat evolved, newest first</p>
                    </div>
                  </div>
                </div>

                <div className="timeline-list">
                  {timeline.map((event, idx) => (
                    <div key={idx} className="timeline-item">
                      <div className="timeline-dot" />
                      <div className="timeline-time">{event.time}</div>
                      <div className="timeline-title">{event.title}</div>
                      <div className="timeline-desc">{event.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {evo.campaignId === null && (
            <div className="page-bottom-note">
              Sample data for the fictional brand Acme Bank.
            </div>
          )}
          </>)}
        </div>
      </div>
    </>
  );
};
