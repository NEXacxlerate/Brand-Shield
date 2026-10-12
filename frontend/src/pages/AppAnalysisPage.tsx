import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Smartphone,
  UploadCloud,
  FileCode,
  ShieldAlert,
  History,
  FileText,
  Link2
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { SemiGauge } from '../components/charts/SemiGauge';
import { api, toast, errorMessage } from '../api';
import type { AppAnalysisView } from '../api/apps';
import './AppAnalysisPage.css';

interface AppAnalysisPageProps {
  onOpenMobileMenu?: () => void;
}

export const AppAnalysisPage: React.FC<AppAnalysisPageProps> = ({ onOpenMobileMenu }) => {
  const navigate = useNavigate();
  const [result, setResult] = useState<AppAnalysisView>(() => api.getLastApp());
  const {
    verdictScore,
    verdictLabel,
    verdictSeverity,
    verdictDesc,
    officialApp,
    thisApp,
    iconSimilarity,
    staticIndicators,
    permissions,
    embeddedUrls
  } = result;

  const [analyzing, setAnalyzing] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [metaText, setMetaText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (job: () => Promise<AppAnalysisView>) => {
    setAnalyzing(true);
    try {
      setResult(await job());
      setShowMeta(false);
      toast.success('App analysed');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) void run(() => api.analyzeApk(f));
  };

  const handleMeta = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(metaText);
    } catch {
      toast.error('The metadata is not valid JSON.');
      return;
    }
    void run(() => api.analyzeMetadata(parsed as Parameters<typeof api.analyzeMetadata>[0]));
  };

  const handleReport = async () => {
    if (!result.investigationId) {
      toast.error('Analyse an app first: a report needs a saved investigation.');
      return;
    }
    try {
      const r = await api.createReport({ investigation_id: result.investigationId, format: 'json' });
      toast.success(`${r.id} created as a draft. It is not approved or filed.`);
      navigate('/reports');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <Header
        title="App Analysis"
        subtitle="Upload an APK or paste its metadata to spot counterfeit and malicious apps."
        actions={
          <>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => alert('Viewing previous 14 mobile app forensic analyses...')}
            >
              <History size={14} />
              <span>History</span>
            </button>
            <button
              type="button"
              className="btn-primary btn-small"
              onClick={handleReport}
            >
              <FileText size={14} />
              <span>Generate report</span>
            </button>
          </>
        }
        onOpenMobileMenu={onOpenMobileMenu}
      />

      <div className="panel-content">
        <div className="apps-page">
          {/* Top 3 Cards Grid */}
          <div className="apps-top-grid">
            {/* Card 1: Analyze an App */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <div className="card-header-icon">
                    <Smartphone size={20} />
                  </div>
                  <div>
                    <h2 className="card-title">Analyze an App</h2>
                  </div>
                </div>
              </div>

              <div className="upload-apk-box">
                <UploadCloud size={32} color="var(--pri)" />
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--ink)' }}>
                    Drop an APK here, or paste app metadata
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--dim)', marginTop: '4px' }}>
                    Package name, permissions, signing certificate and embedded URLs are read for you.
                  </div>
                </div>
              </div>

              <input ref={fileRef} type="file" accept=".apk" onChange={handleFile} style={{ display: 'none' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-primary btn-small"
                  onClick={() => fileRef.current?.click()}
                  disabled={analyzing}
                >
                  <UploadCloud size={14} />
                  <span>{analyzing ? 'Scanning...' : 'Upload APK'}</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => setShowMeta((v) => !v)}
                  disabled={analyzing}
                >
                  <FileCode size={14} />
                  <span>Paste metadata</span>
                </button>
              </div>
              {showMeta && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                  <textarea
                    className="input-text"
                    rows={6}
                    value={metaText}
                    onChange={(e) => setMetaText(e.target.value)}
                    placeholder='{"package":"com.example.app","title":"Example","developer":"Dev","cert_sha256":"...","permissions":["INTERNET"],"urls":[],"store":"sideload"}'
                    aria-label="App metadata JSON"
                  />
                  <button type="button" className="btn-primary btn-small" onClick={handleMeta} disabled={analyzing || !metaText.trim()}>
                    <span>Analyse metadata</span>
                  </button>
                </div>
              )}
            </div>

            {/* Card 2: Verdict */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <div className="card-header-icon" style={{ color: '#FF5C5C' }}>
                    <ShieldAlert size={20} />
                  </div>
                  <h2 className="card-title">Verdict</h2>
                </div>
                <span className={`tag tag-${verdictSeverity.toLowerCase()}`}>{verdictSeverity}</span>
              </div>

              <div className="card-body-center">
                <SemiGauge
                  value={verdictScore}
                  label={verdictLabel}
                  sublabel={verdictDesc}
                  size={230}
                />
              </div>
            </div>

            {/* Card 3: Official vs This App */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <h2 className="card-title">Official vs This App</h2>
                </div>
              </div>

              <div className="card-body-center">
              <div className="official-vs-app-grid">
                <div className="app-profile-box">
                  <span className="app-profile-title">Official</span>
                  <span className="app-profile-name">{officialApp.name}</span>
                  <span className="app-profile-pkg">{officialApp.pkg}</span>
                  <span className="app-profile-meta">{officialApp.source}</span>
                </div>

                <div className="app-profile-box" style={{ borderColor: 'rgba(255, 92, 92, 0.4)' }}>
                  <span className="app-profile-title" style={{ color: '#FF9696' }}>This app</span>
                  <span className="app-profile-name">{thisApp.name}</span>
                  <span className="app-profile-pkg" style={{ color: '#FF9A4D' }}>{thisApp.pkg}</span>
                  <span className="app-profile-meta">{thisApp.source}</span>
                </div>
              </div>

              <div className="icon-similarity-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', fontWeight: 600 }}>
                  <span>Icon similarity</span>
                  <span style={{ color: '#FF5C5C', fontWeight: 700 }}>{iconSimilarity === null ? 'n/a' : `${iconSimilarity}%`}</span>
                </div>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill progress-fill-critical"
                    style={{ width: `${iconSimilarity ?? 0}%` }}
                  />
                </div>
              </div>
              </div>
            </div>
          </div>

          {/* Middle 2 Cards Grid: Static Indicators & Permissions */}
          <div className="apps-middle-grid">
            <div className="stack-col">
            {/* Static Indicators */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <h2 className="card-title">Static Indicators</h2>
                </div>
              </div>

              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Check</th>
                      <th>Finding</th>
                      <th>Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staticIndicators.map((ind, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }} title={ind.check}>{ind.check}</td>
                        <td className="col-entity-input" title={ind.finding}>{ind.finding}</td>
                        <td>
                          <span
                            className={`tag ${
                              ind.flag === 'Look-alike' || ind.flag === 'Mismatch' || ind.flag === 'Outside store'
                                ? 'tag-critical'
                                : ind.flag === 'New'
                                ? 'tag-medium'
                                : 'tag-neutral'
                            }`}
                          >
                            {ind.flag}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

              {/* Embedded URLs (under Static Indicators) */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-left">
                    <div className="card-header-icon">
                      <Link2 size={20} />
                    </div>
                    <h2 className="card-title">Embedded URLs</h2>
                  </div>
                </div>

                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>URL</th>
                        <th>Note</th>
                        <th>Tag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {embeddedUrls.map((u, i) => (
                        <tr key={i}>
                          <td className="col-entity-input" style={{ fontFamily: 'monospace', fontWeight: 600 }} title={u.url}>
                            {u.url}
                          </td>
                          <td className="cell-text" style={{ color: 'var(--mut)' }} title={u.note}>{u.note}</td>
                          <td>
                            <span className={`tag ${u.tag === 'Suspicious' ? 'tag-critical' : 'tag-neutral'}`}>
                              {u.tag}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Permissions */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <div>
                    <h2 className="card-title">Permissions</h2>
                    <p className="card-subtitle">Compared with what the official app asks for</p>
                  </div>
                </div>
              </div>

              <div>
                {permissions.map((perm, idx) => (
                  <div key={idx} className="permission-item">
                    <div>
                      <div className="permission-name">{perm.name}</div>
                      <div className="permission-desc">{perm.desc}</div>
                    </div>
                    <span
                      className={`tag ${perm.status === 'Normal' ? 'tag-low' : 'tag-critical'}`}
                    >
                      {perm.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="page-bottom-note">
            {result.isSample ? 'Sample app metadata for the fictional brand Acme Bank.' : 'Result of your most recent analysis in this session.'}
          </div>
        </div>
      </div>
    </>
  );
};
