import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { useAppStore } from '../data/store';
import './SettingsPage.css';

export const SettingsPage: React.FC = () => {
  const { settings, setSettings } = useAppStore();

  const [activeTab, setActiveTab] = useState<'Monitoring' | 'Notifications' | 'Account'>('Monitoring');
  const [scanSchedule, setScanSchedule] = useState(settings.scanSchedule || 'Every 5 minutes');
  const [sensitivity, setSensitivity] = useState(settings.sensitivity || 75);

  const [platforms, setPlatforms] = useState<Record<string, boolean>>(
    settings.monitoredPlatforms || {
      Instagram: true,
      Facebook: true,
      X: true,
      Telegram: true,
      LinkedIn: true,
      'Google Play': true,
      'Apple App Store': true,
      'Third-party APK sites': true,
    }
  );

  const [rules, setRules] = useState(
    settings.rules || {
      characterSwaps: true,
      digitsAndSymbols: true,
      addedWords: true,
      spacingAndSeparators: true,
      transposedOrMissing: true,
    }
  );

  const [words, setWords] = useState<string[]>(
    settings.impersonationWords || ['support', 'helpline', 'official', 'refund', 'rewards', 'kyc']
  );
  const [newWord, setNewWord] = useState('');

  const togglePlatform = (p: string) => {
    setPlatforms((prev) => ({ ...prev, [p]: !prev[p] }));
  };

  const toggleRule = (r: keyof typeof rules) => {
    setRules((prev) => ({ ...prev, [r]: !prev[r] }));
  };

  const handleAddWord = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newWord.trim()) {
      e.preventDefault();
      if (!words.includes(newWord.trim())) {
        const updated = [...words, newWord.trim()];
        setWords(updated);
        setSettings((prev) => ({ ...prev, impersonationWords: updated }));
      }
      setNewWord('');
    }
  };

  const handleRemoveWord = (w: string) => {
    const updated = words.filter((item) => item !== w);
    setWords(updated);
    setSettings((prev) => ({ ...prev, impersonationWords: updated }));
  };

  return (
    <>
      <Header
        title="Settings"
        subtitle="Control what is monitored, how strict matching is and who is told"
      />

      <div className="panel-content">
        <div className="pdf-settings-wrap">
          {/* Top Tabs */}
          <div className="settings-tabs-row">
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === 'Monitoring' ? 'active' : ''}`}
              onClick={() => setActiveTab('Monitoring')}
            >
              Monitoring
            </button>
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === 'Notifications' ? 'active' : ''}`}
              onClick={() => setActiveTab('Notifications')}
            >
              Notifications
            </button>
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === 'Account' ? 'active' : ''}`}
              onClick={() => setActiveTab('Account')}
            >
              Account
            </button>
          </div>

          {activeTab === 'Monitoring' && (
            <div className="settings-two-col-grid">
              {/* Left: Scan Schedule */}
              <div className="card settings-left-card">
                <h3 className="panel-card-title">Scan schedule</h3>

                <div className="settings-field">
                  <label className="settings-lbl">How often to scan</label>
                  <select
                    className="settings-select"
                    value={scanSchedule}
                    onChange={(e) => setScanSchedule(e.target.value)}
                  >
                    <option value="Every 5 minutes">Every 5 minutes</option>
                    <option value="Every 15 minutes">Every 15 minutes</option>
                    <option value="Hourly">Hourly</option>
                    <option value="Daily">Daily</option>
                  </select>
                </div>

                {/* Social platforms checkboxes */}
                <div className="settings-field">
                  <label className="settings-lbl">Social platforms</label>
                  <div className="checkboxes-stack">
                    {['Instagram', 'Facebook', 'X', 'Telegram', 'LinkedIn'].map((p) => (
                      <label key={p} className="settings-chk-label">
                        <input
                          type="checkbox"
                          checked={platforms[p] ?? true}
                          onChange={() => togglePlatform(p)}
                          className="settings-chk-input"
                        />
                        <span>{p}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* App stores checkboxes */}
                <div className="settings-field">
                  <label className="settings-lbl">App stores</label>
                  <div className="checkboxes-stack">
                    {['Google Play', 'Apple App Store', 'Third-party APK sites'].map((p) => (
                      <label key={p} className="settings-chk-label">
                        <input
                          type="checkbox"
                          checked={platforms[p] ?? true}
                          onChange={() => togglePlatform(p)}
                          className="settings-chk-input"
                        />
                        <span>{p}</span>
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
                    Send to review when risk score is at least {sensitivity}
                  </div>

                  <div className="slider-wrapper">
                    <input
                      type="range"
                      min={50}
                      max={95}
                      value={sensitivity}
                      onChange={(e) => setSensitivity(Number(e.target.value))}
                      className="sensitivity-range-slider"
                    />
                    <div className="slider-labels-row">
                      <span>More detections</span>
                      <span>Fewer, higher confidence</span>
                    </div>
                  </div>

                  <p className="sensitivity-summary-note">
                    11 of the 11 current detections would be sent to review at this level. A balanced setting for most teams.
                  </p>
                </div>

                {/* Look-alike rules */}
                <div className="card lookalike-rules-card">
                  <h3 className="panel-card-title">Look-alike rules</h3>

                  <div className="rules-checkbox-stack">
                    <label className="settings-chk-label">
                      <input
                        type="checkbox"
                        checked={rules.characterSwaps}
                        onChange={() => toggleRule('characterSwaps')}
                        className="settings-chk-input"
                      />
                      <span>Character swaps (rn → m)</span>
                    </label>

                    <label className="settings-chk-label">
                      <input
                        type="checkbox"
                        checked={rules.digitsAndSymbols}
                        onChange={() => toggleRule('digitsAndSymbols')}
                        className="settings-chk-input"
                      />
                      <span>Digits and symbols for letters</span>
                    </label>

                    <label className="settings-chk-label">
                      <input
                        type="checkbox"
                        checked={rules.addedWords}
                        onChange={() => toggleRule('addedWords')}
                        className="settings-chk-input"
                      />
                      <span>Added words</span>
                    </label>

                    <label className="settings-chk-label">
                      <input
                        type="checkbox"
                        checked={rules.spacingAndSeparators}
                        onChange={() => toggleRule('spacingAndSeparators')}
                        className="settings-chk-input"
                      />
                      <span>Spacing and separators</span>
                    </label>

                    <label className="settings-chk-label">
                      <input
                        type="checkbox"
                        checked={rules.transposedOrMissing}
                        onChange={() => toggleRule('transposedOrMissing')}
                        className="settings-chk-input"
                      />
                      <span>Transposed or missing letters</span>
                    </label>
                  </div>

                  {/* Impersonation words */}
                  <div className="impersonation-words-section">
                    <div className="settings-lbl">Impersonation words</div>
                    <div className="words-pill-wrap">
                      {words.map((w) => (
                        <span key={w} className="impersonation-word-pill">
                          {w}
                          <button
                            type="button"
                            className="remove-word-btn"
                            onClick={() => handleRemoveWord(w)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        placeholder="Add a word"
                        value={newWord}
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
          )}

          {activeTab === 'Notifications' && (
            <div className="card" style={{ padding: '24px' }}>
              <h3 className="panel-card-title" style={{ marginBottom: '14px' }}>
                Alert Notifications
              </h3>
              <div className="checkboxes-stack">
                <label className="settings-chk-label">
                  <input type="checkbox" defaultChecked className="settings-chk-input" />
                  <span>Send email alerts for risk scores above 85</span>
                </label>
                <label className="settings-chk-label">
                  <input type="checkbox" defaultChecked className="settings-chk-input" />
                  <span>Daily digest summary at 9:00 AM</span>
                </label>
                <label className="settings-chk-label">
                  <input type="checkbox" defaultChecked className="settings-chk-input" />
                  <span>Webhook dispatch to Slack Security Channel</span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'Account' && (
            <div className="card" style={{ padding: '24px' }}>
              <h3 className="panel-card-title" style={{ marginBottom: '14px' }}>
                Workspace & Account
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', marginBottom: '16px' }}>
                Signed in as Harini (admin@company.com). Organization: Acme Brand Security Workspace.
              </p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => alert('Access audit log exported to CSV.')}
              >
                Export Audit Log
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
