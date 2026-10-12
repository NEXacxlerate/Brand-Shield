import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Plus,
  Bell
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { api, useAsync, toast, errorMessage } from '../api';
import { KIND_BY_LABEL } from '../api/watchlist';
import type { WatchRow } from '../api/watchlist';
import './WatchlistPage.css';

interface WatchlistPageProps {
  onOpenMobileMenu?: () => void;
}

export const WatchlistPage: React.FC<WatchlistPageProps> = ({ onOpenMobileMenu }) => {
  const { data, loading, error } = useAsync(() => api.getWatchlist(), []);
  const [entities, setEntities] = useState<WatchRow[]>([]);
  useEffect(() => {
    if (data) setEntities(data);
  }, [data]);
  const isLive = !loading && !error && !entities.some((e) => e.isSample);
  const [newEntity, setNewEntity] = useState('');
  const [entityType, setEntityType] = useState('Domain');

  // 4 alert toggles for form
  const [toggleDns, setToggleDns] = useState(true);
  const [toggleBio, setToggleBio] = useState(true);
  const [toggleApk, setToggleApk] = useState(true);
  const [toggleVelocity, setToggleVelocity] = useState(false);

  // 4 alert rules
  const [rule1, setRule1] = useState(true);
  const [rule2, setRule2] = useState(true);
  const [rule3, setRule3] = useState(true);
  const [rule4, setRule4] = useState(false);

  const typeOptions = ['Domain', 'Social Profile', 'Phone Number', 'Android APK', 'Payment ID'];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = newEntity.trim();
    if (!value) return;
    try {
      const row = await api.addWatchItem(KIND_BY_LABEL[entityType] ?? 'domain', value, {
        dns: toggleDns,
        cert: toggleDns,
        title: toggleBio
      });
      setEntities((prev) => [row, ...prev.filter((p) => !p.isSample)]);
      setNewEntity('');
      toast.success('Added to the watchlist');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const replaceRow = (row: WatchRow) => setEntities((prev) => prev.map((p) => (p.id === row.id ? row : p)));

  const toggleEntityActive = async (item: WatchRow) => {
    if (item.isSample) return;
    const on = !item.active;
    try {
      replaceRow(await api.setWatchRules(item.id, { dns: on, cert: on, title: on }));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const checkNow = async (item: WatchRow) => {
    try {
      const row = await api.checkWatchItem(item.id);
      replaceRow(row);
      toast.success(`Checked ${row.entity}: ${row.status}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const acknowledge = async (item: WatchRow) => {
    try {
      replaceRow(await api.acknowledgeWatchItem(item.id));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <Header
        title="Watchlist"
        subtitle="Continuous tracking and change detection for high-risk suspicious indicators."
        actions={
          <span className="tag tag-ok" style={{ height: '32px', padding: '0 12px', fontSize: '12.5px' }}>
            {entities.filter((e) => e.active).length} Actively Monitored
          </span>
        }
        onOpenMobileMenu={onOpenMobileMenu}
      />

      <div className="panel-content">
        <div className="watchlist-page">
          {/* Top 2 Columns Grid: Add to Watchlist + Alert Rules */}
          <div className="watchlist-top-grid">
            {/* Add to Watchlist Form */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <div className="card-header-icon">
                    <Bookmark size={20} />
                  </div>
                  <div>
                    <h2 className="card-title">Add to Watchlist</h2>
                    <p className="card-subtitle">Register new indicators for automated crawl alerts</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleAdd}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="new-entity-input" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                    Entity or Indicator
                  </label>
                  <input
                    id="new-entity-input"
                    type="text"
                    className="input-text"
                    placeholder="e.g. refund-desk-acme.in, @acme_bot, or +91 91234 56789"
                    value={newEntity}
                    onChange={(e) => setNewEntity(e.target.value)}
                    required
                  />
                </div>

                {/* Type chips */}
                <div className="entity-type-chips">
                  {typeOptions.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`entity-type-chip ${entityType === t ? 'active' : ''}`}
                      onClick={() => setEntityType(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {/* 4 Alert Toggles */}
                <div className="alert-toggles-grid">
                  <div className="alert-toggle-box">
                    <span>DNS / Certificate changes</span>
                    <button
                      type="button"
                      className={`toggle-switch ${toggleDns ? 'active' : ''}`}
                      onClick={() => setToggleDns(!toggleDns)}
                      aria-label="DNS / Certificate changes"
                    />
                  </div>

                  <div className="alert-toggle-box">
                    <span>New bio links & handles</span>
                    <button
                      type="button"
                      className={`toggle-switch ${toggleBio ? 'active' : ''}`}
                      onClick={() => setToggleBio(!toggleBio)}
                      aria-label="New bio links & handles"
                    />
                  </div>

                  <div className="alert-toggle-box">
                    <span>Sideload APK binary updates</span>
                    <button
                      type="button"
                      className={`toggle-switch ${toggleApk ? 'active' : ''}`}
                      onClick={() => setToggleApk(!toggleApk)}
                      aria-label="Sideload APK binary updates"
                    />
                  </div>

                  <div className="alert-toggle-box">
                    <span>Transaction velocity spikes</span>
                    <button
                      type="button"
                      className={`toggle-switch ${toggleVelocity ? 'active' : ''}`}
                      onClick={() => setToggleVelocity(!toggleVelocity)}
                      aria-label="Transaction velocity spikes"
                    />
                  </div>
                </div>

                <button type="submit" className="btn-primary" style={{ width: '100%' }}>
                  <Plus size={16} />
                  <span>Add to Watchlist</span>
                </button>
              </form>
            </div>

            {/* Alert Rules List */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-left">
                  <div className="card-header-icon" style={{ color: '#5AA9FF' }}>
                    <Bell size={20} />
                  </div>
                  <div>
                    <h2 className="card-title">Alert Rules</h2>
                    <p className="card-subtitle">Automated notification triggers</p>
                  </div>
                </div>
              </div>

              <div className="rules-list">
                <div className="rule-item">
                  <div className="rule-info">
                    <span className="rule-name">Instant notification on DNS alter</span>
                    <span className="rule-desc">Sends urgent webhook if IP changes to known bulletproof host</span>
                  </div>
                  <button
                    type="button"
                    className={`toggle-switch ${rule1 ? 'active' : ''}`}
                    onClick={() => setRule1(!rule1)}
                    aria-label="Instant notification on DNS alter"
                  />
                </div>

                <div className="rule-item">
                  <div className="rule-info">
                    <span className="rule-name">Trigger deep crawl on bio edit</span>
                    <span className="rule-desc">Scrapes newly linked Telegram or WhatsApp redirect numbers</span>
                  </div>
                  <button
                    type="button"
                    className={`toggle-switch ${rule2 ? 'active' : ''}`}
                    onClick={() => setRule2(!rule2)}
                    aria-label="Trigger deep crawl on bio edit"
                  />
                </div>

                <div className="rule-item">
                  <div className="rule-info">
                    <span className="rule-name">Escalate if APK requests SMS</span>
                    <span className="rule-desc">Raises priority to Critical if READ_SMS added in binary</span>
                  </div>
                  <button
                    type="button"
                    className={`toggle-switch ${rule3 ? 'active' : ''}`}
                    onClick={() => setRule3(!rule3)}
                    aria-label="Escalate if APK requests SMS"
                  />
                </div>

                <div className="rule-item">
                  <div className="rule-info">
                    <span className="rule-name">Weekly stable infrastructure digest</span>
                    <span className="rule-desc">Consolidated PDF report for long-dormant parking domains</span>
                  </div>
                  <button
                    type="button"
                    className={`toggle-switch ${rule4 ? 'active' : ''}`}
                    onClick={() => setRule4(!rule4)}
                    aria-label="Weekly stable infrastructure digest"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Watched Entities Table (6 rows) */}
          <div className="card">
            <div className="card-header">
              <div className="card-header-left">
                <h2 className="card-title">Watched Entities</h2>
              </div>
            </div>

            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Entity</th>
                    <th>Type</th>
                    <th>Date Added</th>
                    <th>Status</th>
                    <th>Monitoring Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {entities.map((item) => (
                    <tr key={item.id}>
                      <td className="col-entity-input" style={{ fontWeight: 600 }} title={item.entity}>{item.entity}</td>
                      <td style={{ color: 'var(--dim)', fontSize: '12.5px' }}>{item.type}</td>
                      <td style={{ color: 'var(--dim)', fontSize: '12.5px' }}>{item.dateAdded}</td>
                      <td>
                        <span
                          className={`tag ${
                            item.status === 'Changed'
                              ? 'tag-high'
                              : item.status === 'Spreading'
                              ? 'tag-critical'
                              : 'tag-ok'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`toggle-switch ${item.active ? 'active' : ''}`}
                          onClick={() => toggleEntityActive(item)}
                          aria-label={`Toggle monitoring for ${item.entity}`}
                        />
                        {!item.isSample && (
                          <>
                            {' '}
                            <button type="button" className="btn-secondary btn-small" onClick={() => checkNow(item)}>
                              Check now
                            </button>
                            {item.status !== 'Stable' && (
                              <>
                                {' '}
                                <button type="button" className="btn-secondary btn-small" onClick={() => acknowledge(item)}>
                                  Reset
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loading && <div className="page-bottom-note">Loading…</div>}
              {!loading && error && <div className="page-bottom-note">{error}</div>}
              {!loading && !error && entities.length === 0 && (
                <div className="page-bottom-note">Nothing is on the watchlist yet.</div>
              )}
            </div>
          </div>

          <div className="page-bottom-note">
            {isLive ? 'Live watchlist for your brand.' : 'Sample data for the fictional brand Acme Bank.'}
          </div>
        </div>
      </div>
    </>
  );
};
