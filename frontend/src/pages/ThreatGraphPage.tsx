import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Share2,
  Download,
  AlertTriangle,
  ExternalLink,
  Layers,
  FileText
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { EntityGraph } from '../components/charts/EntityGraph';
import { api, useAsync, toast, errorMessage, brandId, titleCase } from '../api';
import { downloadJson } from '../api/campaigns';
import type { GraphNodeVM } from '../api/campaigns';
import './ThreatGraphPage.css';

interface ThreatGraphPageProps {
  onOpenMobileMenu?: () => void;
}

export const ThreatGraphPage: React.FC<ThreatGraphPageProps> = ({ onOpenMobileMenu }) => {
  const navigate = useNavigate();
  const [chosenCampaign, setChosenCampaign] = useState<number | null>(null);
  const [showAttackPath, setShowAttackPath] = useState(true);
  const [showForecast, setShowForecast] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const camps = useAsync(async () => api.listCampaigns(await brandId()), []);
  const activeCampaign: number | null = chosenCampaign ?? camps.data?.[0]?.id ?? null;
  const graphState = useAsync(
    async () => (activeCampaign === null ? null : api.getThreatGraph(activeCampaign)),
    [activeCampaign]
  );
  const graph = graphState.data;
  const selectedNode: GraphNodeVM | undefined =
    graph?.nodes.find((n) => n.id === selectedId) ?? graph?.nodes.find((n) => n.type !== 'ghost' && n.risk === 'critical') ?? graph?.nodes[0];
  const selectedEntityId = selectedNode?.entityId ?? null;
  const infoState = useAsync(
    async () => (selectedEntityId === null ? null : api.getEntityInfo(selectedEntityId)),
    [selectedEntityId]
  );
  const info = infoState.data;
  const severity = info?.severity ?? selectedNode?.risk ?? 'low';
  const SEV_COLOR: Record<string, string> = { critical: '#FF5C5C', high: '#FF9A4D', medium: '#F5C542', low: '#5AA9FF' };
  const TYPE_LABEL: Record<string, string> = { website: 'Website', social: 'Social profile', app: 'Mobile app', identifier: 'Shared identifier', ghost: 'Predicted (estimate)' };

  const exportGraph = () => {
    if (!graph) return;
    downloadJson(`threat-graph-${activeCampaign ?? 'sample'}.json`, graph);
    toast.success('Graph exported as JSON.');
  };
  const shareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Copied link');
    } catch {
      toast.error('Could not copy the link.');
    }
  };
  const prepareDossier = async () => {
    if (activeCampaign === null || graph?.campaignId === null) {
      toast.error('Sign in to the server to create a dossier.');
      return;
    }
    try {
      await api.createDossier(activeCampaign);
      toast.success('Draft dossier created. A person must approve it in Reports.');
      navigate('/reports');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <Header
        title="Threat Graph"
        subtitle="Discover connected entities and the complete scam network behind one clue."
        actions={
          <>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={shareLink}
            >
              <Share2 size={14} />
              <span>Share with team</span>
            </button>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={exportGraph}
            >
              <Download size={14} />
              <span>Export graph</span>
            </button>
          </>
        }
        onOpenMobileMenu={onOpenMobileMenu}
      />

      <div className="panel-content">
        <div className="graph-page">
          {/* Controls Bar */}
          <div className="graph-controls-card">
            <div className="campaign-chips">
              {(camps.data ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`campaign-chip ${activeCampaign === c.id ? 'active' : ''}`}
                  onClick={() => {
                    setChosenCampaign(c.id);
                    setSelectedId(null);
                  }}
                >
                  <span>C-{c.id} {c.name}</span>
                  <span className="chip-score">{Math.round(c.risk)}</span>
                </button>
              ))}
            </div>

            <div className="graph-toggles">
              <div className="graph-toggle-item" onClick={() => setShowAttackPath(!showAttackPath)}>
                <button
                  type="button"
                  className={`toggle-switch ${showAttackPath ? 'active' : ''}`}
                  aria-label="Attack path"
                />
                <span>Attack path</span>
              </div>

              <div className="graph-toggle-item" onClick={() => setShowForecast(!showForecast)}>
                <button
                  type="button"
                  className={`toggle-switch ${showForecast ? 'active' : ''}`}
                  aria-label="Forecast (estimate)"
                />
                <span>Forecast (estimate)</span>
              </div>

              <div className="graph-toggle-item" onClick={() => setShowLabels(!showLabels)}>
                <button
                  type="button"
                  className={`toggle-switch ${showLabels ? 'active' : ''}`}
                  aria-label="Labels"
                />
                <span>Labels</span>
              </div>
            </div>
          </div>

          {(camps.loading || graphState.loading) && (
            <div className="card"><p className="card-subtitle">Loading…</p></div>
          )}
          {!camps.loading && !graphState.loading && (camps.error || graphState.error) && (
            <div className="card"><p className="card-subtitle">{camps.error || graphState.error}</p></div>
          )}
          {!camps.loading && !graphState.loading && !camps.error && !graphState.error && !graph && (
            <div className="card"><p className="card-subtitle">No campaigns have been found for this brand yet.</p></div>
          )}

          {/* Main 2 Column Grid */}
          {graph && !graphState.loading && (
          <div className="graph-main-grid">
            {/* Left: EntityGraph + What Links These Entities */}
            <div className="graph-col">
            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <div className="card-header-icon">
                    <Share2 size={20} />
                  </div>
                  <div>
                    <h2 className="card-title">Entity Graph</h2>
                    <p className="card-subtitle">{graph.nodes.filter((n) => n.type !== 'ghost').length} entities linked by {graph.linksTable.length} shared signals</p>
                  </div>
                </div>
                <span className="tag tag-neutral">Last 30 days</span>
              </div>

              <EntityGraph
                graph={graph}
                showAttackPath={showAttackPath}
                showForecast={showForecast}
                showLabels={showLabels}
                selectedNodeId={selectedNode?.id}
                onSelectNode={(n) => setSelectedId(n.id)}
              />

              {/* Legend Row */}
              <div className="graph-legend-row">
                <div className="legend-group">
                  <div className="legend-symbol">
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#5AA9FF' }} />
                    <span>Social profile</span>
                  </div>
                  <div className="legend-symbol">
                    <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: '#FF5C5C' }} />
                    <span>Website</span>
                  </div>
                  <div className="legend-symbol">
                    <span style={{ width: '0', height: '0', borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '9px solid #34D399' }} />
                    <span>Mobile app</span>
                  </div>
                  <div className="legend-symbol">
                    <span style={{ width: '8px', height: '8px', transform: 'rotate(45deg)', background: '#F5C542' }} />
                    <span>Shared identifier</span>
                  </div>
                </div>

                <div className="legend-group">
                  <span style={{ color: '#FF5C5C', fontWeight: 700 }}>• Critical</span>
                  <span style={{ color: '#FF9A4D', fontWeight: 700 }}>• High</span>
                  <span style={{ color: '#F5C542', fontWeight: 700 }}>• Medium</span>
                </div>
              </div>
            </div>

              {/* What Links These Entities */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-left">
                    <div className="card-header-icon">
                      <Layers size={20} />
                    </div>
                    <div>
                      <h2 className="card-title">What Links These Entities</h2>
                      <p className="card-subtitle">Shared infrastructure and operational pivot points</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary btn-small"
                    onClick={prepareDossier}
                  >
                    <FileText size={13} />
                    <span>Prepare takedown dossier</span>
                  </button>
                </div>

                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Value</th>
                        <th>Entities</th>
                      </tr>
                    </thead>
                    <tbody>
                      {graph.linksTable.map((link, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{link.type}</td>
                          <td className="col-entity-input cell-text" title={String(link.value)}>{link.value}</td>
                          <td>
                            <span className="tag tag-neutral" style={{ fontWeight: 700 }}>
                              {link.count}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right: Selected Node Details & Attack Path */}
            <div className="graph-col">
              {/* Selected Node Details */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-left">
                    <div>
                      <h2 className="card-title" title={selectedNode?.label}>Selected: {selectedNode?.label || '—'}</h2>
                    </div>
                  </div>
                  <span className={`tag tag-${severity}`}>{titleCase(severity)}</span>
                </div>

                <div className="selected-entity-grid">
                  <div className="entity-meta-item">
                    <span className="entity-meta-label">Risk</span>
                    <span className="entity-meta-val" style={{ color: SEV_COLOR[severity] ?? '#5AA9FF' }}>{info?.risk ?? '—'}</span>
                  </div>
                  <div className="entity-meta-item">
                    <span className="entity-meta-label">Type</span>
                    <span className="entity-meta-val">{info?.type ?? TYPE_LABEL[selectedNode?.type ?? ''] ?? '—'}</span>
                  </div>
                  <div className="entity-meta-item">
                    <span className="entity-meta-label">Registered</span>
                    <span className="entity-meta-val">{info?.registered ?? '—'}</span>
                  </div>
                  <div className="entity-meta-item">
                    <span className="entity-meta-label">Name match</span>
                    <span className="entity-meta-val">{info?.nameMatch ?? '—'}</span>
                  </div>
                  <div className="entity-meta-item">
                    <span className="entity-meta-label">Asks for</span>
                    <span className="entity-meta-val">{info?.asksFor ?? '—'}</span>
                  </div>
                  <div className="entity-meta-item">
                    <span className="entity-meta-label">Linked entities</span>
                    <span className="entity-meta-val">{info?.linked ?? '—'}</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => navigate('/results')}
                >
                  <span>Open full evidence</span>
                  <ExternalLink size={14} />
                </button>
              </div>

              {/* Attack Path Stepper */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-left">
                    <div className="card-header-icon" style={{ color: '#FF5C5C' }}>
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <h2 className="card-title">Attack Path</h2>
                      <p className="card-subtitle">How a victim is drawn in</p>
                    </div>
                  </div>
                </div>

                <div className="attack-path-steps">
                  {graph.attackSteps.map((s) => (
                    <div key={s.step} className="attack-step-row">
                      <div className={`attack-step-num ${s.current ? 'current' : ''}`}>
                        {s.step}
                      </div>
                      <div className="attack-step-content">
                        <div className="attack-step-title">{s.name}</div>
                        <div className="attack-step-detail">{s.detail}</div>
                        <div className="attack-step-sub">{s.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          )}

          {graph && graph.campaignId === null && (
            <div className="page-bottom-note">
              Sample data for the fictional brand Acme Bank.
            </div>
          )}
        </div>
      </div>
    </>
  );
};
