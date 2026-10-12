import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Globe,
  User,
  MessageSquare,
  Image,
  Smartphone,
  Phone,
  Wallet,
  UploadCloud,
  Check,
  Search,
  ChevronDown,
  Layers,
  HelpCircle,
  Clock
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { api, errorMessage, toast, useAsync } from '../api';
import './InvestigatePage.css';

interface InvestigatePageProps {
  onOpenMobileMenu?: () => void;
}

export const InvestigatePage: React.FC<InvestigatePageProps> = ({ onOpenMobileMenu }) => {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState('url');
  const [inputValue, setInputValue] = useState('acrnebank-refund.com');
  const [scanMode, setScanMode] = useState<'quick' | 'deep'>('quick');
  const [targetBrand, setTargetBrand] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const brands = useAsync(() => api.listBrands(), []);
  const cases = useAsync(() => api.listInvestigations({ page: 1 }), []);
  const brandChoice = targetBrand || String(brands.data?.[0]?.id ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputTypes = [
    { id: 'url', label: 'URL / Domain', icon: <Globe size={18} /> },
    { id: 'profile', label: 'Social Media Profile', icon: <User size={18} /> },
    { id: 'message', label: 'Message / SMS / Email', icon: <MessageSquare size={18} /> },
    { id: 'image', label: 'Screenshot / Image', icon: <Image size={18} /> },
    { id: 'apk', label: 'APK / App File', icon: <Smartphone size={18} /> },
    { id: 'phone', label: 'Phone Number', icon: <Phone size={18} /> },
    { id: 'wallet', label: 'Wallet Address / Other', icon: <Wallet size={18} /> }
  ];

  const handleFile = (f: File | null) => {
    setFile(f);
    if (!f) return;
    const name = f.name.toLowerCase();
    if (name.endsWith('.apk')) setSelectedType('apk');
    else if (f.type.startsWith('image/')) setSelectedType('image');
    else if (selectedType !== 'message') setSelectedType('message');
    toast.info(`Selected ${f.name}`);
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await api.submitInvestigation({
        type: selectedType,
        value: inputValue,
        depth: scanMode,
        brandId: brandChoice ? Number(brandChoice) : undefined,
        file
      });
      toast.success(`Case ${res.id} created`);
      navigate(`/results?case=${encodeURIComponent(res.id)}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Header
        title="Investigate"
        subtitle="Submit suspicious content. We validate it, pull out the indicators and open a case."
        actions={
          <>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => {
                const el = document.getElementById('recent-investigations-table');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <Clock size={14} />
              <span>Recent cases</span>
            </button>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => alert('Submit any URL, domain, handle, phone number or APK to begin full forensic attribution.')}
            >
              <HelpCircle size={14} />
              <span>Help</span>
            </button>
          </>
        }
        onOpenMobileMenu={onOpenMobileMenu}
      />

      <div className="panel-content">
        <div className="investigate-page">
          {/* Top Form Grid */}
          <div className="investigate-top-grid">
            {/* Left Card: Input form */}
            <div className="card">
              <h2 className="card-title">1. What do you want to check?</h2>
              <p className="card-subtitle">
                Pick an input type, or paste anything and we detect it for you.
              </p>

              {/* 7 Type tiles */}
              <div className="type-tiles-grid">
                {inputTypes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`type-tile ${selectedType === t.id ? 'selected' : ''}`}
                    onClick={() => setSelectedType(t.id)}
                  >
                    {t.icon}
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>

              <form onSubmit={handleAnalyze}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                  <label htmlFor="url-input" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                    URL or domain
                  </label>
                  <input
                    id="url-input"
                    type="text"
                    className="input-text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Enter profile URL, domain, APK, phone number..."
                    required={!file}
                  />
                </div>

                {/* Dropzone */}
                <div className="dropzone-box">
                  <div className="dropzone-text">
                    <UploadCloud size={24} color="var(--dim)" />
                    <div>
                      Or drop a screenshot or APK here. Files are scanned for safety before analysis.
                    </div>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    style={{ display: 'none' }}
                    accept={selectedType === 'apk' ? '.apk' : selectedType === 'image' ? 'image/*' : undefined}
                    onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  />
                  <button type="button" className="btn-secondary btn-small" onClick={() => fileRef.current?.click()}>
                    {file ? file.name : 'Browse files'}
                  </button>
                </div>

                {/* Radio cards: Quick Scan / Deep Investigation */}
                <div className="scan-mode-grid">
                  <div
                    className={`scan-mode-card ${scanMode === 'quick' ? 'selected' : ''}`}
                    onClick={() => setScanMode('quick')}
                  >
                    <div className="scan-mode-header">
                      <div className="radio-indicator">
                        {scanMode === 'quick' && <div className="radio-indicator-inner" />}
                      </div>
                      <span>Quick Scan</span>
                    </div>
                    <div className="scan-mode-desc">
                      Basic checks: name similarity, domain age, DNS records.
                    </div>
                  </div>

                  <div
                    className={`scan-mode-card ${scanMode === 'deep' ? 'selected' : ''}`}
                    onClick={() => setScanMode('deep')}
                  >
                    <div className="scan-mode-header">
                      <div className="radio-indicator">
                        {scanMode === 'deep' && <div className="radio-indicator-inner" />}
                      </div>
                      <span>Deep Investigation</span>
                    </div>
                    <div className="scan-mode-desc">
                      Adds page capture, logo match, certificate history and graph linking.
                    </div>
                  </div>
                </div>

                {/* Target brand dropdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '22px' }}>
                  <label htmlFor="target-brand" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                    Target brand (optional)
                  </label>
                  <select
                    id="target-brand"
                    className="input-text"
                    value={brandChoice}
                    onChange={(e) => setTargetBrand(e.target.value)}
                    style={{ cursor: 'pointer' }}
                  >
                    {(brands.data ?? []).map((b) => (
                      <option key={b.id} value={String(b.id)}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <button type="submit" className="btn-primary btn-large" style={{ minWidth: '160px' }}>
                  <Search size={16} strokeWidth={2} />
                  <span>{isSubmitting ? 'Analyzing...' : 'Analyze'}</span>
                </button>
              </form>
            </div>

            {/* Right Card: What happens next + Analyzers */}
            <div className="card">
              <h2 className="card-title">What happens next</h2>
              <p className="card-subtitle">Your input is checked before anything runs</p>

              <div className="stepper-list">
                <div className="step-item">
                  <div className="step-circle done">
                    <Check size={13} strokeWidth={2.5} />
                  </div>
                  <div className="step-info">
                    <div className="step-title">Format validation</div>
                    <div className="step-desc">Valid domain, no syntax problems.</div>
                  </div>
                </div>

                <div className="step-item">
                  <div className="step-circle done">
                    <Check size={13} strokeWidth={2.5} />
                  </div>
                  <div className="step-info">
                    <div className="step-title">Data normalization</div>
                    <div className="step-desc">Look-alike characters folded: acrnebank-refund reads as acmebank-refund.</div>
                  </div>
                </div>

                <div className="step-item">
                  <div className="step-circle current">3</div>
                  <div className="step-info">
                    <div className="step-title">Input classification</div>
                    <div className="step-desc">Domain. Routing to the Domain and URL analyzer.</div>
                  </div>
                </div>

                <div className="step-item">
                  <div className="step-circle pending">4</div>
                  <div className="step-info">
                    <div className="step-title">Create investigation case</div>
                    <div className="step-desc">Case ID INV-2026-0143 is assigned and the first data stored.</div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '24px', borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '10px' }}>
                  Analyzers for this input
                </h3>

                <div className="analyzers-list">
                  <div className="analyzer-item">
                    <div className="analyzer-icon">
                      <Globe size={18} />
                    </div>
                    <div className="analyzer-info">
                      <span className="analyzer-name">Domain & URL analyzer</span>
                      <span className="analyzer-desc">RDAP, DNS, look-alike checks</span>
                    </div>
                  </div>

                  <div className="analyzer-item">
                    <div className="analyzer-icon">
                      <User size={18} />
                    </div>
                    <div className="analyzer-info">
                      <span className="analyzer-name">Profile analyzer</span>
                      <span className="analyzer-desc">Username similarity</span>
                    </div>
                  </div>

                  <div className="analyzer-item">
                    <div className="analyzer-icon">
                      <MessageSquare size={18} />
                    </div>
                    <div className="analyzer-info">
                      <span className="analyzer-name">Message analyzer</span>
                      <span className="analyzer-desc">Scam wording, links, senders</span>
                    </div>
                  </div>

                  <div className="analyzer-item">
                    <div className="analyzer-icon">
                      <Image size={18} />
                    </div>
                    <div className="analyzer-info">
                      <span className="analyzer-name">Image analyzer</span>
                      <span className="analyzer-desc">Logo similarity, metadata</span>
                    </div>
                  </div>

                  <div className="analyzer-item">
                    <div className="analyzer-icon">
                      <Smartphone size={18} />
                    </div>
                    <div className="analyzer-info">
                      <span className="analyzer-name">App analyzer</span>
                      <span className="analyzer-desc">Package, signing, permissions</span>
                    </div>
                  </div>

                  <div className="analyzer-item">
                    <div className="analyzer-icon">
                      <Layers size={18} />
                    </div>
                    <div className="analyzer-info">
                      <span className="analyzer-name">Threat intel</span>
                      <span className="analyzer-desc">URLhaus, open feeds, custom feeds</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Table: Recent Investigations */}
          <div id="recent-investigations-table" className="card">
            <div className="card-header">
              <div className="card-header-left">
                <div>
                  <h2 className="card-title">Recent investigations</h2>
                  <p className="card-subtitle">Case lifecycle: Open, Investigating, On Hold, Resolved</p>
                </div>
              </div>
              <button type="button" className="btn-secondary btn-small">
                <span>All status</span>
                <ChevronDown size={14} />
              </button>
            </div>

            <div className="data-table-container">
              <table className="data-table table-recent">
                <thead>
                  <tr>
                    <th className="col-idx">#</th>
                    <th className="col-input">Input</th>
                    <th className="col-type">Type</th>
                    <th className="col-result">Result</th>
                    <th className="col-num">Risk Score</th>
                    <th className="col-status">Status</th>
                    <th className="col-date">Date &amp; Time</th>
                    <th className="col-action">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(cases.data?.items ?? []).map((item) => (
                    <tr key={item.caseId || item.id}>
                      <td className="col-idx">{item.id}</td>
                      <td
                        className="col-entity-input col-input"
                        style={{ fontWeight: 600 }}
                        title={item.input}
                      >
                        {item.input}
                      </td>
                      <td className="col-type cell-text" title={item.type}>{item.type}</td>
                      <td className="col-result cell-text" title={item.result}>{item.result}</td>
                      <td className="col-num">
                        <span style={{ fontWeight: 700, color: item.riskScore > 85 ? '#FF5C5C' : '#FF9A4D' }}>
                          {item.riskScore}/100
                        </span>
                      </td>
                      <td className="col-status">
                        <span className={`tag ${item.status === 'Malicious' ? 'tag-critical' : 'tag-high'}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="col-date" style={{ color: 'var(--dim)', fontSize: '12.5px' }}>
                        {item.dateTime}
                      </td>
                      <td className="col-action">
                        <button
                          type="button"
                          className="btn-secondary btn-small"
                          onClick={() => navigate(item.caseId ? `/results?case=${encodeURIComponent(item.caseId)}` : '/results')}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cases.loading && <div style={{ color: 'var(--dim)', fontSize: '13px', padding: '12px 0' }}>Loading…</div>}
            {!cases.loading && cases.error && <div style={{ color: 'var(--dim)', fontSize: '13px', padding: '12px 0' }}>{cases.error}</div>}
            {!cases.loading && !cases.error && cases.data?.items.length === 0 && (
              <div style={{ color: 'var(--dim)', fontSize: '13px', padding: '12px 0' }}>No investigations yet.</div>
            )}
          </div>

          {cases.data?.items.some((c) => !c.caseId) && (
            <div className="page-bottom-note">
              Sample cases for the fictional brand Acme Bank.
            </div>
          )}
        </div>
      </div>
    </>
  );
};
