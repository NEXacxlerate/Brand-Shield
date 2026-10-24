import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Empty, ErrorBox, Loading, Notice } from '../components/common/States';
import { ApiError } from '../api/client';
import { sm } from '../api/sm';
import type { AdminBrandRow } from '../api/types';
import { useApi } from '../hooks/useApi';
import './AdminBrandsPage.css';

export const AdminBrandsPage: React.FC = () => {
  const list = useApi((signal) => sm.adminBrands(signal), []);
  const [target, setTarget] = useState<AdminBrandRow | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  const close = () => { setTarget(null); setTyped(''); };

  const remove = async () => {
    if (!target || typed !== target.name) return;
    setBusy(true);
    try {
      await sm.adminDeleteBrand(target.id, target.name);
      setMsg({ kind: 'info', text: `Deleted "${target.name}".` });
      close();
      list.reload();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof ApiError ? e.message : 'Could not delete the brand.' });
    } finally {
      setBusy(false);
    }
  };

  const rows = list.data ?? [];

  return (
    <>
      <Header title="All Brands" subtitle="Every registered brand with its owner. Admin only." />
      <div className="panel-content ab-page">
        {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}
        {list.loading && <Loading what="Loading brands" />}
        {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
        {!list.loading && !list.error && rows.length === 0 && <Empty>No brands have been registered yet.</Empty>}

        {rows.length > 0 && (
          <div className="card ab-card">
            <div className="ab-table-wrap">
              <table className="ab-table">
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th>Domains</th>
                    <th>Registered by</th>
                    <th>Role</th>
                    <th>Created</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.id}>
                      <td><strong>{b.name}</strong>{b.industry && <div className="ab-sub">{b.industry}</div>}</td>
                      <td>{b.domains.length ? b.domains.join(', ') : '—'}</td>
                      <td>{b.owner_name ?? 'No owner'}{b.owner_email && <div className="ab-sub">{b.owner_email}</div>}</td>
                      <td>{b.owner_role ?? '—'}</td>
                      <td>{new Date(b.created_at).toLocaleDateString()}</td>
                      <td>
                        <button type="button" className="btn-secondary btn-sm ab-del" onClick={() => { setTarget(b); setTyped(''); }}>
                          <Trash2 size={14} /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {target && (
        <div className="ab-overlay" role="dialog" aria-modal="true" aria-label="Delete brand" onClick={close}>
          <div className="card ab-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Delete "{target.name}"?</h3>
            <p className="ab-sub">
              It is removed from {target.owner_email ?? 'its owner'}'s account, and its scans stop. Records are kept for the audit trail.
              Type the brand name to confirm.
            </p>
            <input
              className="form-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={target.name}
              autoFocus
              aria-label="Type the brand name to confirm"
            />
            <div className="ab-actions">
              <button type="button" className="btn-secondary" onClick={close} disabled={busy}>Cancel</button>
              <button type="button" className="btn-primary ab-danger" onClick={() => void remove()} disabled={busy || typed !== target.name}>
                {busy ? 'Deleting…' : 'Delete brand'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
