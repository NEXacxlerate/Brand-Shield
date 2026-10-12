import React, { useEffect, useState } from 'react';
import {
  SlidersHorizontal,
  Play,
  Sparkles,
  HelpCircle,
  Download
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { SmoothLines } from '../components/charts/SmoothLines';
import { api, useAsync, toast, errorMessage, brandId } from '../api';
import { downloadJson } from '../api/campaigns';
import type { SimVM } from '../api/simulator';
import './ThreatSimulatorPage.css';

interface ThreatSimulatorPageProps {
  onOpenMobileMenu?: () => void;
}

export const ThreatSimulatorPage: React.FC<ThreatSimulatorPageProps> = ({ onOpenMobileMenu }) => {
  const [selectedHorizon, setSelectedHorizon] = useState<'7' | '14' | '30'>('7');
  const [assumption, setAssumption] = useState<'repeat' | 'accelerate' | 'slow'>('repeat');
  const [toggleNotice, setToggleNotice] = useState(true);
  const [toggleDeindex, setToggleDeindex] = useState(true);
  const [toggleAdvisory, setToggleAdvisory] = useState(false);
  // The user's own assumption (not a measurement): how much the growth drops if they act.
  const [assumedDrop, setAssumedDrop] = useState(30);
  const [chosenCampaign, setChosenCampaign] = useState<number | null>(null);
  const [runTick, setRunTick] = useState(0);

  const camps = useAsync(async () => api.listCampaigns(await brandId()), []);
  const campaignId: number | null = chosenCampaign ?? camps.data?.[0]?.id ?? null;

  const [sim, setSim] = useState<SimVM | null>(null);
  const [simLoading, setSimLoading] = useState(true);
  const [simError, setSimError] = useState<string | null>(null);

  const actions = [
    toggleNotice ? 'Platform takedown notice sent' : '',
    toggleDeindex ? 'Search engine de-indexing' : '',
    toggleAdvisory ? 'Public consumer advisory' : ''
  ].filter(Boolean);
  const actionsKey = actions.join('|');

  // Read-only call, re-run (debounced 300 ms) whenever a control changes.
  useEffect(() => {
    if (campaignId === null) {
      setSimLoading(camps.loading);
      return;
    }
    let alive = true;
    setSimLoading(true);
    const t = setTimeout(() => {
      api
        .runSimulation({
          campaignId,
          horizonDays: Number(selectedHorizon) as 7 | 14 | 30,
          assumption,
          actions,
          assumedDropPct: Math.min(100, Math.max(0, assumedDrop))
        })
        .then((r) => {
          if (!alive) return;
          setSim(r);
          setSimError(null);
        })
        .catch((e: unknown) => {
          if (alive) setSimError(errorMessage(e));
        })
        .finally(() => {
          if (alive) setSimLoading(false);
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, selectedHorizon, assumption, actionsKey, assumedDrop, runTick, camps.loading]);

  // Chart: the observed past, then the two projections from "today".
  let chartPoints: { label: string; observed?: number; forecast?: number; series3?: number }[] = [];
  let splitIndex = -1;
  if (sim) {
    if (sim.sample) {
      chartPoints = sim.observed.map((_, i) => ({
        label: `Day ${i}`,
        observed: sim.observed[i],
        forecast: sim.doNothing[i],
        series3: sim.actToday[i]
      }));
    } else {
      const n = sim.observed.length;
      const total = n + sim.doNothing.length - 1;
      const step = total > 25 ? 7 : 2;
      splitIndex = n - 1;
      chartPoints = Array.from({ length: total }, (_, i) => {
        const d = i - (n - 1);
        const label = d === 0 ? 'today' : d % step === 0 ? (d < 0 ? `${d}d` : `+${d}d`) : '';
        if (i < n) {
          return {
            label,
            observed: sim.observed[i],
            forecast: i === n - 1 ? sim.doNothing[0] : undefined,
            series3: i === n - 1 ? sim.actToday[0] : sim.observed[i]
          };
        }
        return { label, forecast: sim.doNothing[d], series3: sim.actToday[d] };
      });
    }
  }
  const peak = Math.max(0, ...chartPoints.map((p) => Math.max(p.observed ?? 0, p.forecast ?? 0, p.series3 ?? 0)));
  const yMax = Math.max(24, Math.ceil(peak / 6) * 6);
  const pl = (n: number, word: string) => (n === 1 ? word : `${word}s`);

  const exportSimulation = () => {
    if (!sim) return;
    downloadJson(`simulation-${campaignId ?? 'sample'}.json`, { campaign_id: campaignId, assumed_drop_pct: assumedDrop, assumption, actions, ...sim });
    toast.success('Simulation exported as JSON.');
  };

  return (
    <>
      <Header
        title="Threat Simulator"
        subtitle="Predict how the threat may evolve and simulate future risks."
        actions={
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={exportSimulation}
          >
            <Download size={14} />
            <span>Export simulation</span>
          </button>
        }
        onOpenMobileMenu={onOpenMobileMenu}
      />

      <div className="panel-content">
        <div className="simulator-page">
          {/* Scenario Configuration Card */}
          <div className="card">
            <div className="card-header">
              <div className="card-header-left">
                <div className="card-header-icon">
                  <SlidersHorizontal size={20} />
                </div>
                <h2 className="card-title">Scenario Parameters</h2>
              </div>
            </div>

            <div className="scenario-card-content">
              <div className="scenario-controls-row">
                {/* 1. Campaign & Time Horizon */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--dim)' }}>
                    Target Campaign
                  </label>
                  <select
                    className="input-text"
                    style={{ cursor: 'pointer' }}
                    value={campaignId ?? ''}
                    onChange={(e) => setChosenCampaign(Number(e.target.value))}
                  >
                    {(camps.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>C-{c.id} {c.name}</option>
                    ))}
                  </select>

                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--dim)', marginTop: '6px' }}>
                    Simulation Horizon
                  </label>
                  <div className="time-horizon-chips">
                    <button
                      type="button"
                      className={`time-chip ${selectedHorizon === '7' ? 'active' : ''}`}
                      onClick={() => setSelectedHorizon('7')}
                    >
                      7 days
                    </button>
                    <button
                      type="button"
                      className={`time-chip ${selectedHorizon === '14' ? 'active' : ''}`}
                      onClick={() => setSelectedHorizon('14')}
                    >
                      14 days
                    </button>
                    <button
                      type="button"
                      className={`time-chip ${selectedHorizon === '30' ? 'active' : ''}`}
                      onClick={() => setSelectedHorizon('30')}
                    >
                      30 days
                    </button>
                  </div>
                </div>

                {/* 2. Growth Assumptions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--dim)' }}>
                    Growth Assumption
                  </label>
                  <div className="assumptions-radios">
                    <label className="radio-row">
                      <input
                        type="radio"
                        name="assumption"
                        checked={assumption === 'repeat'}
                        onChange={() => setAssumption('repeat')}
                      />
                      <span>Repeat (last week’s pace)</span>
                    </label>
                    <label className="radio-row">
                      <input
                        type="radio"
                        name="assumption"
                        checked={assumption === 'accelerate'}
                        onChange={() => setAssumption('accelerate')}
                      />
                      <span>Accelerate (x1.5 each following week)</span>
                    </label>
                    <label className="radio-row">
                      <input
                        type="radio"
                        name="assumption"
                        checked={assumption === 'slow'}
                        onChange={() => setAssumption('slow')}
                      />
                      <span>Slow (x0.5 each following week)</span>
                    </label>
                  </div>
                </div>

                {/* 3. What-if Intervention Toggles */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--dim)' }}>
                    What-if Interventions
                  </label>
                  <div className="what-if-toggles">
                    <div className="what-if-toggle-row">
                      <span>Platform takedown notice sent</span>
                      <button
                        type="button"
                        className={`toggle-switch ${toggleNotice ? 'active' : ''}`}
                        onClick={() => setToggleNotice(!toggleNotice)}
                      />
                    </div>
                    <div className="what-if-toggle-row">
                      <span>Search engine de-indexing</span>
                      <button
                        type="button"
                        className={`toggle-switch ${toggleDeindex ? 'active' : ''}`}
                        onClick={() => setToggleDeindex(!toggleDeindex)}
                      />
                    </div>
                    <div className="what-if-toggle-row">
                      <span>Public consumer advisory</span>
                      <button
                        type="button"
                        className={`toggle-switch ${toggleAdvisory ? 'active' : ''}`}
                        onClick={() => setToggleAdvisory(!toggleAdvisory)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Assumed drop (the user's assumption) */}
              <div className="drop-assumption-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700 }}>
                  <label htmlFor="assumed-drop" style={{ color: 'var(--ink)' }}>Assumed drop if you act (your assumption)</label>
                  <span style={{ color: '#5BE0AE' }}>{assumedDrop}%</span>
                </div>
                <div className="progress-bar-track" style={{ height: '8px' }}>
                  <div
                    className="progress-bar-fill progress-fill-low"
                    style={{ width: `${assumedDrop}%` }}
                  />
                </div>
                <input
                  id="assumed-drop"
                  type="number"
                  className="input-text"
                  min={0}
                  max={100}
                  value={assumedDrop}
                  onChange={(e) => setAssumedDrop(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                />
                <div style={{ fontSize: '11.5px', color: 'var(--dim)', fontStyle: 'italic' }}>
                  {sim?.assumptionNote ?? 'The drop percentage is an assumption you enter, not a measurement.'}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <button
                  type="button"
                  className="btn-primary btn-large"
                  onClick={() => setRunTick((t) => t + 1)}
                >
                  <Play size={16} fill="white" />
                  <span>Run simulation</span>
                </button>
              </div>
            </div>
          </div>

          {/* "What Could Happen" SmoothLines */}
          <div className="card">
            <div className="card-header">
              <div className="card-header-left">
                <div className="card-header-icon" style={{ color: '#A78BFA' }}>
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2 className="card-title">What Could Happen</h2>
                  <p className="card-subtitle">
                    Projected entity expansion: inaction trajectory vs intervention outcome
                  </p>
                </div>
              </div>
            </div>

            {simLoading && !sim && <p className="card-subtitle">Loading…</p>}
            {simError && <p className="card-subtitle">{simError}</p>}
            {!simLoading && !simError && !sim && (
              <p className="card-subtitle">No campaigns have been found for this brand yet.</p>
            )}
            {sim && <SmoothLines
              data={chartPoints}
              forecastSplitIndex={splitIndex}
              showBand={true}
              solidColor="#FF5C5C"
              forecastColor="#A78BFA"
              tertiaryColor="#34D399"
              yMax={yMax}
              height={230}
            />}

            <div style={{ display: 'flex', gap: '24px', marginTop: '12px', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', height: '3px', background: '#FF5C5C', borderRadius: '2px' }} />
                <span style={{ color: 'var(--ink)' }}>Observed past</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', borderTop: '2px dashed #A78BFA' }} />
                <span style={{ color: '#A78BFA' }}>Do nothing (dashed violet)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', borderTop: '2px dashed #34D399' }} />
                <span style={{ color: '#5BE0AE' }}>Act today (dashed green)</span>
              </div>
            </div>
          </div>

          {/* 3 Comparison Cards */}
          <div className="comparison-cards-grid">
            {/* Card 1: Now */}
            <div className="card comparison-card">
              <div className="card-header">
                <div className="card-header-left">
                  <h2 className="card-title" style={{ fontSize: '15px' }}>Now</h2>
                </div>
                <span className="tag tag-neutral">Active Footprint</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--dim)' }}>Current confirmed malicious assets</p>
              <div className="comparison-metrics-row">
                <div className="comp-metric">
                  <span className="comp-metric-num" style={{ color: '#FF9A4D' }}>{sim?.comparison.now.profiles ?? '—'}</span>
                  <span className="comp-metric-label">{pl(sim?.comparison.now.profiles ?? 0, 'Profile')}</span>
                </div>
                <div className="comp-metric">
                  <span className="comp-metric-num" style={{ color: '#5AA9FF' }}>{sim?.comparison.now.websites ?? '—'}</span>
                  <span className="comp-metric-label">{pl(sim?.comparison.now.websites ?? 0, 'Website')}</span>
                </div>
                <div className="comp-metric">
                  <span className="comp-metric-num" style={{ color: '#FF5C5C' }}>{sim?.comparison.now.apps ?? '—'}</span>
                  <span className="comp-metric-label">{pl(sim?.comparison.now.apps ?? 0, 'App')}</span>
                </div>
              </div>
            </div>

            {/* Card 2: No action */}
            <div className="card comparison-card" style={{ borderColor: 'rgba(255, 92, 92, 0.3)' }}>
              <div className="card-header">
                <div className="card-header-left">
                  <h2 className="card-title" style={{ fontSize: '15px', color: '#FF9696' }}>No Action</h2>
                </div>
                <span className="tag tag-critical">Estimate</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--dim)' }}>Projected spread if left untouched</p>
              <div className="comparison-metrics-row">
                <div className="comp-metric">
                  <span className="comp-metric-num" style={{ color: '#FF5C5C' }}>{sim?.comparison.doNothing.profiles ?? '—'}</span>
                  <span className="comp-metric-label">{pl(sim?.comparison.doNothing.profiles ?? 0, 'Profile')}</span>
                </div>
                <div className="comp-metric">
                  <span className="comp-metric-num" style={{ color: '#FF5C5C' }}>{sim?.comparison.doNothing.websites ?? '—'}</span>
                  <span className="comp-metric-label">{pl(sim?.comparison.doNothing.websites ?? 0, 'Website')}</span>
                </div>
                <div className="comp-metric">
                  <span className="comp-metric-num" style={{ color: '#FF5C5C' }}>{sim?.comparison.doNothing.apps ?? '—'}</span>
                  <span className="comp-metric-label">{pl(sim?.comparison.doNothing.apps ?? 0, 'App')}</span>
                </div>
              </div>
            </div>

            {/* Card 3: If we act */}
            <div className="card comparison-card" style={{ borderColor: 'rgba(52, 211, 153, 0.3)' }}>
              <div className="card-header">
                <div className="card-header-left">
                  <h2 className="card-title" style={{ fontSize: '15px', color: '#5BE0AE' }}>If We Act</h2>
                </div>
                <span className="tag tag-ok">What-if</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--dim)' }}>Contained risk with immediate takedowns</p>
              <div className="comparison-metrics-row">
                <div className="comp-metric">
                  <span className="comp-metric-num" style={{ color: '#34D399' }}>{sim?.comparison.actToday.profiles ?? '—'}</span>
                  <span className="comp-metric-label">{pl(sim?.comparison.actToday.profiles ?? 0, 'Profile')}</span>
                </div>
                <div className="comp-metric">
                  <span className="comp-metric-num" style={{ color: '#34D399' }}>{sim?.comparison.actToday.websites ?? '—'}</span>
                  <span className="comp-metric-label">{pl(sim?.comparison.actToday.websites ?? 0, 'Website')}</span>
                </div>
                <div className="comp-metric">
                  <span className="comp-metric-num" style={{ color: '#34D399' }}>{sim?.comparison.actToday.apps ?? '—'}</span>
                  <span className="comp-metric-label">{pl(sim?.comparison.actToday.apps ?? 0, 'App')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* "How To Read This" Card */}
          <div className="card">
            <div className="card-header">
              <div className="card-header-left">
                <div className="card-header-icon">
                  <HelpCircle size={20} />
                </div>
                <h2 className="card-title">How To Read This</h2>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--dim)', lineHeight: '1.6' }}>
              {sim?.method ?? 'The projection is calculated from this campaign’s recent pace.'}{' '}
              Every number here is an estimate, a mathematical scenario for risk prioritization. It does not guarantee that the activity will stop.
            </p>
          </div>

          {sim?.sample && (
            <div className="page-bottom-note">
              Sample data for the fictional brand Acme Bank.
            </div>
          )}
        </div>
      </div>
    </>
  );
};
