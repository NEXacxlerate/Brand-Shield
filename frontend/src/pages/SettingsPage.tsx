import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Empty, ErrorBox, Loading, Notice } from '../components/common/States';
import { ApiError, downloadFile, isAbortError } from '../api/client';
import { SCHEDULE_LABEL } from '../api/format';
import { sm } from '../api/sm';
import type { DataMode, DataModeInfo, Rules, Schedule, SensitivityPreview, Settings } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useMe } from '../hooks/useMe';
import { usePref } from '../hooks/usePref';
import './SettingsPage.css';

type Tab = 'Monitoring' | 'Notifications' | 'Account';
const TABS = ['Monitoring', 'Notifications', 'Account'] as const;

const SOCIAL_PLATFORMS: [string, string][] = [
  ['Instagram', 'instagram'],
  ['Facebook', 'facebook'],
  ['X', 'x'],
  ['Telegram', 'telegram'],
  ['LinkedIn', 'linkedin'],
];
const STORE_PLATFORMS: [string, string][] = [
  ['Google Play', 'google_play'],
  ['Apple App Store', 'app_store'],
  ['Third-party APK sites', 'third_party_apk'],
];
const RULE_LABELS: [keyof Rules, string][] = [
  ['character_swaps', 'Character swaps (rn → m)'],
  ['digits_and_symbols', 'Digits and symbols for letters'],
  ['added_words', 'Added words'],
  ['spacing_and_separators', 'Spacing and separators'],
  ['transposed_or_missing', 'Transposed or missing letters'],
];
const SCHEDULES: Schedule[] = ['5m', '15m', '1h', '1d'];

interface Draft {
  schedule: Schedule;
  sources: Record<string, boolean>;
  sensitivity: number;
  rules: Rules;
  words: string[];
  emailAlerts: boolean;
  weeklyDigest: boolean;
  webhookOn: boolean;
  webhookUrl: string;
}

function toDraft(s: Settings): Draft {
  return {
    schedule: s.monitoring.schedule,
    sources: { ...s.monitoring.sources },
    sensitivity: s.monitoring.sensitivity,
    rules: { ...s.monitoring.rules },
    words: [...s.monitoring.impersonation_words],
    emailAlerts: s.notifications.email_alerts,
    weeklyDigest: s.notifications.weekly_digest,
    webhookOn: !!s.notifications.webhook_url || s.notifications.webhook_configured,
    webhookUrl: s.notifications.webhook_url,
  };
}

export const SettingsPage: React.FC = () => {
  const { user, isAdmin, canWrite } = useMe();
  const settings = useApi((signal) => sm.settings(signal), []);
  const [activeTab, setActiveTab] = usePref<Tab>('settingsTab', 'Monitoring', TABS);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newWord, setNewWord] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SensitivityPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Fill the form from the server once; a reload after saving replaces it with what the server stored.
  const loadedAt = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (settings.data && loadedAt.current === undefined) {
      loadedAt.current = settings.data.updated_at;
      setDraft(toDraft(settings.data));
    }
  }, [settings.data]);

  // "N of M current candidates would be sent to review": recomputed by the server (debounced) as the slider moves.
  const sens = draft?.sensitivity;
  useEffect(() => {
    if (sens === undefined) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      sm.sensitivityPreview(sens, ctl.signal)
        .then((p) => {
          setPreview(p);
          setPreviewError(null);
        })
        .catch((e: unknown) => {
          if (!isAbortError(e)) setPreviewError(e instanceof ApiError ? e.message : 'Could not update the preview.');
        });
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [sens]);

  const dirty = useMemo(() => {
    if (!settings.data || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(toDraft(settings.data));
  }, [settings.data, draft]);

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const readOnly = !isAdmin;

  const handleAddWord = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newWord.trim() && draft) {
      e.preventDefault();
      const w = newWord.trim().toLowerCase();
      if (!draft.words.includes(w)) patch({ words: [...draft.words, w] });
      setNewWord('');
    }
  };

  const handleSave = async () => {
    if (!draft || !settings.data) return;
    setSaving(true);
    setSaveError(null);
    try {
      const words = newWord.trim() && !draft.words.includes(newWord.trim().toLowerCase()) ? [...draft.words, newWord.trim().toLowerCase()] : draft.words;
      const saved = await sm.saveSettings({
        monitoring: { schedule: draft.schedule, sources: draft.sources, sensitivity: draft.sensitivity, rules: draft.rules, impersonation_words: words },
        notifications: { email_alerts: draft.emailAlerts, weekly_digest: draft.weeklyDigest, webhook_url: draft.webhookOn ? draft.webhookUrl.trim() : '' },
      });
      settings.setData(saved);
      loadedAt.current = saved.updated_at;
      setDraft(toDraft(saved));
      setNewWord('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : 'Could not save the settings.');
    } finally {
      setSaving(false);
    }
  };

  const saveBar = (
    <>
      {saveError && <Notice>{saveError}</Notice>}
      <div className="profile-bottom-save-bar" style={{ marginTop: 16 }}>
        <span className="save-note-text">
          {readOnly ? 'Only administrators can change settings. You can view them here.' : dirty ? 'You have unsaved changes.' : 'Changes are applied to the next scan after you save.'}
        </span>
        <div className="save-btn-group">
          <button
            type="button"
            className="btn-secondary"
            disabled={!dirty || saving}
            onClick={() => settings.data && setDraft(toDraft(settings.data))}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="settings-save"
            onClick={() => void handleSave()}
            disabled={!dirty || saving || readOnly}
          >
            {saving ? 'Saving…' : saved ? 'Saved successfully ✓' : 'Save settings'}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <Header
        title="Settings"
        subtitle="Control what is monitored, how strict matching is and who is told"
      />

      <div className="panel-content">
        <div className="pdf-settings-wrap">
          {settings.loading && <Loading what="Loading settings" />}
          {settings.error && <ErrorBox error={settings.error} onRetry={settings.reload} />}

          {draft && settings.data && (
            <>
              {/* Top Tabs */}
              <div className="settings-tabs-row">
                {TABS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`settings-tab-btn ${activeTab === t ? 'active' : ''}`}
                    onClick={() => setActiveTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {activeTab === 'Monitoring' && (
                <>
                  <div className="settings-two-col-grid">
                    {/* Left: Scan Schedule */}
                    <div className="card settings-left-card">
                      <h3 className="panel-card-title">Scan schedule</h3>

                      <div className="settings-field">
                        <label className="settings-lbl" htmlFor="st-schedule">How often to scan</label>
                        <select data-voice="schedule"
                          id="st-schedule"
                          className="settings-select"
                          value={draft.schedule}
                          disabled={readOnly}
                          onChange={(e) => patch({ schedule: e.target.value as Schedule })}
                        >
                          {SCHEDULES.map((s) => (
                            <option key={s} value={s}>{SCHEDULE_LABEL[s]}</option>
                          ))}
                          {draft.schedule === 'off' && <option value="off">Off</option>}
                        </select>
                        {settings.data.scheduler && !settings.data.scheduler.enabled && (
                          <div className="helper-note warn">{settings.data.scheduler.reason}</div>
                        )}
                      </div>

                      {/* Social platforms checkboxes */}
                      <div className="settings-field">
                        <label className="settings-lbl">Social platforms</label>
                        <div className="checkboxes-stack">
                          {SOCIAL_PLATFORMS.map(([label, slug]) => (
                            <label key={slug} className="settings-chk-label">
                              <input
                                type="checkbox"
                                checked={draft.sources[slug] ?? true}
                                disabled={readOnly}
                                onChange={() => patch({ sources: { ...draft.sources, [slug]: !(draft.sources[slug] ?? true) } })}
                                className="settings-chk-input"
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* App stores checkboxes */}
                      <div className="settings-field">
                        <label className="settings-lbl">App stores</label>
                        <div className="checkboxes-stack">
                          {STORE_PLATFORMS.map(([label, slug]) => (
                            <label key={slug} className="settings-chk-label">
                              <input
                                type="checkbox"
                                checked={draft.sources[slug] ?? true}
                                disabled={readOnly}
                                onChange={() => patch({ sources: { ...draft.sources, [slug]: !(draft.sources[slug] ?? true) } })}
                                className="settings-chk-input"
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Right: Sensitivity & Look-alike rules */}
                    <div className="settings-right-stack">
                      {/* Detection sensitivity */}
                      <div className="card sensitivity-card">
                        <h3 className="panel-card-title">Detection sensitivity</h3>

                        <div className="sensitivity-threshold-text">
                          Send to review when risk score is at least <strong className="sensitivity-value">{draft.sensitivity}</strong>
                        </div>

                        <div className="slider-wrapper">
                          <input
                            type="range"
                            min={50}
                            max={95}
                            value={draft.sensitivity}
                            disabled={readOnly}
                            aria-label="Detection sensitivity"
                            onChange={(e) => patch({ sensitivity: Number(e.target.value) })}
                            className="sensitivity-range-slider"
                            style={{ '--pct': `${((draft.sensitivity - 50) / 45) * 100}%` } as React.CSSProperties}
                          />
                          <div className="slider-labels-row">
                            <span>More detections</span>
                            <span>Fewer, higher confidence</span>
                          </div>
                        </div>

                        <p className="sensitivity-summary-note" data-testid="sensitivity-summary">
                          {preview && preview.sensitivity === draft.sensitivity
                            ? `${preview.would_review} of the ${preview.total} candidates found so far would be sent to review at this level. ${preview.message}`
                            : previewError ?? 'Checking how many detections this level would send to review…'}
                        </p>
                      </div>

                      {/* Look-alike rules */}
                      <div className="card lookalike-rules-card">
                        <h3 className="panel-card-title">Look-alike rules</h3>

                        <div className="rules-checkbox-stack">
                          {RULE_LABELS.map(([key, label]) => (
                            <label key={key} className="settings-chk-label">
                              <input
                                type="checkbox"
                                checked={draft.rules[key]}
                                disabled={readOnly}
                                onChange={() => patch({ rules: { ...draft.rules, [key]: !draft.rules[key] } })}
                                className="settings-chk-input"
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>

                        {/* Impersonation words */}
                        <div className="impersonation-words-section">
                          <div className="settings-lbl">Impersonation words</div>
                          <div className="words-pill-wrap">
                            {draft.words.map((w) => (
                              <span key={w} className="impersonation-word-pill">
                                {w}
                                {!readOnly && (
                                  <button
                                    type="button"
                                    className="remove-word-btn"
                                    aria-label={`Remove ${w}`}
                                    onClick={() => patch({ words: draft.words.filter((x) => x !== w) })}
                                  >
                                    ×
                                  </button>
                                )}
                              </span>
                            ))}
                            <input data-voice="impersonation_word"
                              type="text"
                              placeholder="Add a word"
                              aria-label="Add an impersonation word"
                              value={newWord}
                              disabled={readOnly}
                              onChange={(e) => setNewWord(e.target.value)}
                              onKeyDown={handleAddWord}
                              className="add-word-input"
                            />
                          </div>
                        </div>

                        <Link to="/lookalike" className="try-rules-link">
                          Try these rules in the Look-alike Lab →
                        </Link>
                      </div>
                    </div>
                  </div>
                  {saveBar}
                </>
              )}

              {activeTab === 'Notifications' && (
                <>
                  <div className="card" style={{ padding: '24px' }}>
                    <h3 className="panel-card-title" style={{ marginBottom: '14px' }}>
                      Alert Notifications
                    </h3>
                    <div className="helper-note warn" style={{ marginBottom: 12 }} data-testid="not-delivered">
                      Preferences are saved, but nothing is delivered yet (delivery: {settings.data.notifications.delivery.replace(/_/g, ' ')}). No email, digest or webhook is sent.
                    </div>
                    <div className="checkboxes-stack">
                      <label className="settings-chk-label">
                        <input
                          type="checkbox"
                          checked={draft.emailAlerts}
                          disabled={readOnly}
                          onChange={(e) => patch({ emailAlerts: e.target.checked })}
                          className="settings-chk-input"
                        />
                        <span>Send email alerts for risk scores above 85 <em className="helper-note">(not delivered yet)</em></span>
                      </label>
                      <label className="settings-chk-label">
                        <input
                          type="checkbox"
                          checked={draft.weeklyDigest}
                          disabled={readOnly}
                          onChange={(e) => patch({ weeklyDigest: e.target.checked })}
                          className="settings-chk-input"
                        />
                        <span>Weekly digest summary <em className="helper-note">(not delivered yet)</em></span>
                      </label>
                      <label className="settings-chk-label">
                        <input
                          type="checkbox"
                          checked={draft.webhookOn}
                          disabled={readOnly}
                          onChange={(e) => patch({ webhookOn: e.target.checked })}
                          className="settings-chk-input"
                        />
                        <span>Webhook dispatch to a Slack or other channel <em className="helper-note">(not delivered yet)</em></span>
                      </label>
                      {draft.webhookOn && (
                        <input data-voice="webhook_url"
                          type="url"
                          className="settings-select"
                          placeholder="https://hooks.example.com/…"
                          aria-label="Webhook URL"
                          value={draft.webhookUrl}
                          disabled={readOnly}
                          onChange={(e) => patch({ webhookUrl: e.target.value })}
                          style={{ maxWidth: 480 }}
                        />
                      )}
                      {draft.webhookOn && readOnly && <div className="helper-note">The webhook address is visible to administrators only.</div>}
                    </div>
                  </div>
                  {saveBar}
                </>
              )}

              {activeTab === 'Account' && <AccountTab settings={settings.data} user={user} isAdmin={isAdmin} canWrite={canWrite} />}
            </>
          )}
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------- Providers ---
const ProvidersPanel: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const providers = useApi((signal) => sm.providers(signal), []);
  const sources = useApi((signal) => sm.sources(signal), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      providers.setData(await sm.setProvider(name));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change the provider.');
    } finally {
      setBusy(false);
    }
  };

  const p = providers.data;
  const sb = sources.data?.reputation;
  return (
    <div data-testid="providers-panel">
      <h3 className="panel-card-title" style={{ margin: '28px 0 10px' }}>Analysis providers</h3>
      {providers.loading && <Loading what="Loading providers" />}
      {providers.error && <ErrorBox error={providers.error} onRetry={providers.reload} compact />}
      {p && (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: 8 }}>
            Hosted text analysis is {p.hosted_text_analysis_enabled ? 'enabled' : 'off'} (SCAM_LLM_ENABLED). Active text provider: <strong>{p.active_text_provider}</strong>. Keys are never shown.
          </p>
          <div className="format-toggle-row" role="radiogroup" aria-label="Active text provider">
            {['off', ...p.text_providers.map((t) => t.name)].map((name) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={p.active_text_provider === name}
                className={`format-toggle-btn ${p.active_text_provider === name ? 'active' : ''}`}
                disabled={!isAdmin || busy}
                onClick={() => void choose(name)}
              >
                {name}
              </button>
            ))}
          </div>
          {!isAdmin && <div className="helper-note">Read only: only administrators can choose the active provider.</div>}
          <div className="helper-note">
            {p.text_providers.map((t) => `${t.label}: ${t.configured ? 'configured' : 'not configured'}${t.reason && !t.configured ? ` (${t.reason})` : ''}`).join(' · ')}
          </div>
        </>
      )}
      {error && <Notice onClose={() => setError(null)}>{error}</Notice>}
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: 8 }} data-testid="safe-browsing-status">
        Google Safe Browsing: <strong>{sources.loading ? 'checking…' : sb ? (sb.configured ? 'configured: yes' : 'configured: no') : 'status unavailable'}</strong>
      </p>
    </div>
  );
};

// ---------------------------------------------------------------- Account tab ---
const MODES: { value: DataMode; label: string; hint: string }[] = [
  { value: 'live', label: 'Live', hint: 'Only real collectors are used. A source that cannot be reached shows as unavailable, never as sample data.' },
  { value: 'sample', label: 'Sample', hint: 'Fictional sample candidates only. No real platform or search provider is contacted.' },
  { value: 'auto', label: 'Auto', hint: 'Live when a live source is configured, otherwise sample.' },
];

const AccountTab: React.FC<{ settings: Settings; user: ReturnType<typeof useMe>['user']; isAdmin: boolean; canWrite: boolean }> = ({ settings, user, isAdmin, canWrite }) => {
  const mode = useApi((signal) => sm.dataMode(signal), []);
  const [info, setInfo] = useState<DataModeInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const current = info ?? mode.data;

  const setMode = async (value: DataMode) => {
    if (!current || value === current.data_mode) return;
    setBusy(true);
    setError(null);
    try {
      setInfo(await sm.setDataMode(value));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change the data mode.');
    } finally {
      setBusy(false);
    }
  };

  const exportAudit = async () => {
    setAuditError(null);
    try {
      await downloadFile('/api/audit/export.csv', 'audit-log.csv');
    } catch (e) {
      setAuditError(e instanceof ApiError ? e.message : 'Could not export the audit log.');
    }
  };

  return (
    <div className="card" style={{ padding: '24px' }}>
      <h3 className="panel-card-title" style={{ marginBottom: '14px' }}>
        Workspace & Account
      </h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', marginBottom: '16px' }} data-testid="account-line">
        Signed in as {settings.account.user.name} ({settings.account.user.email}), role {settings.account.user.role}. Organization: {settings.account.organization || 'not set yet'}.
      </p>
      <button type="button" className="btn-secondary" onClick={() => void exportAudit()} disabled={!canWrite} title={canWrite ? undefined : 'Analysts and administrators can export the audit log'}>
        Export Audit Log
      </button>
      {auditError && <Notice>{auditError}</Notice>}

      <h3 className="panel-card-title" style={{ margin: '28px 0 10px' }}>Data mode</h3>
      {mode.loading && <Loading />}
      {mode.error && <ErrorBox error={mode.error} onRetry={mode.reload} compact />}
      {current && (
        <div data-testid="data-mode">
          <div className="format-toggle-row" role="radiogroup" aria-label="Data mode">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={current.data_mode === m.value}
                className={`format-toggle-btn ${current.data_mode === m.value ? 'active' : ''}`}
                disabled={!isAdmin || busy}
                onClick={() => void setMode(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="helper-note">{MODES.find((m) => m.value === current.data_mode)?.hint}</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: 8 }} data-testid="effective-mode">
            Showing <strong>{current.effective_mode}</strong> data right now. {current.reason}
          </p>
          {!isAdmin && <div className="helper-note">Read only: only administrators can change the data mode{user ? ` (you are ${user.role})` : ''}.</div>}
          {current.chain.length > 0 && (
            <div className="helper-note">
              Collectors: {current.chain.map((c) => `${c.name} (${c.active ? 'active' : c.configured ? 'configured' : 'not configured'})`).join(', ')}
            </div>
          )}
        </div>
      )}
      {error && <Notice onClose={() => setError(null)}>{error}</Notice>}

      <ProvidersPanel isAdmin={isAdmin} />

      <h3 className="panel-card-title" style={{ margin: '28px 0 10px' }}>Accuracy</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: 10 }}>
        See precision, recall and F1 for each look-alike technique and how the labelled test names perform.
      </p>
      <Link to="/evaluation" className="try-rules-link" data-testid="evaluation-link">
        Open the evaluation →
      </Link>
      {!current && !mode.loading && !mode.error && <Empty>No data-mode information.</Empty>}
    </div>
  );
};
