// Manual candidate entry and CSV/JSON import (dry run first, per-row report). Writers only; nothing here opens a URL.
import React, { useState } from 'react';
import { ApiError } from '../../api/client';
import { sm } from '../../api/sm';
import type { ImportReport } from '../../api/types';
import { Notice } from '../common/States';
import '../common/ConfirmDialog.css';
import './CandidateTools.css';

type Kind = 'social' | 'app' | 'web';

const FIELDS: Record<Kind, { key: string; label: string; required?: boolean; options?: string[] }[]> = {
  social: [
    { key: 'platform', label: 'Platform', required: true, options: ['instagram', 'facebook', 'x', 'telegram', 'linkedin', 'youtube'] },
    { key: 'handle', label: 'Handle', required: true },
    { key: 'display_name', label: 'Display name' },
    { key: 'url', label: 'Profile URL' },
    { key: 'bio', label: 'Bio' },
  ],
  app: [
    { key: 'store', label: 'Store', required: true, options: ['google_play', 'app_store', 'third_party_apk'] },
    { key: 'package_id', label: 'Package or bundle id', required: true },
    { key: 'name', label: 'App name', required: true },
    { key: 'publisher', label: 'Publisher' },
    { key: 'description', label: 'Description' },
  ],
  web: [
    { key: 'url', label: 'URL (never opened by this app)', required: true },
    { key: 'title', label: 'Title' },
    { key: 'note', label: 'Note' },
  ],
};

const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="confirm-backdrop" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
    <div className="confirm-dialog card candidate-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <h3 className="panel-card-title">{title}</h3>
      {children}
    </div>
  </div>
);

export const CandidateTools: React.FC<{ kind: Kind; canWrite: boolean; onChanged: () => void }> = ({ kind, canWrite, onChanged }) => {
  const [open, setOpen] = useState<'add' | 'import' | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const hint = canWrite ? undefined : 'Your role can view but not add candidates';
  return (
    <>
      <div className="candidate-tools" data-testid="candidate-tools">
        <button type="button" className="btn-secondary btn-sm" disabled={!canWrite} title={hint} onClick={() => setOpen('add')}>
          Add candidate
        </button>
        <button type="button" className="btn-secondary btn-sm" disabled={!canWrite} title={hint} onClick={() => setOpen('import')}>
          Import CSV / JSON
        </button>
      </div>
      {done && (
        <Notice kind="info" onClose={() => setDone(null)}>
          {done}
        </Notice>
      )}
      {open === 'add' && (
        <AddDialog
          kind={kind}
          onClose={() => setOpen(null)}
          onAdded={(m) => {
            setDone(m);
            setOpen(null);
            onChanged();
          }}
        />
      )}
      {open === 'import' && (
        <ImportDialog
          kind={kind}
          onClose={() => setOpen(null)}
          onImported={(m) => {
            setDone(m);
            onChanged();
          }}
        />
      )}
    </>
  );
};

const AddDialog: React.FC<{ kind: Kind; onClose: () => void; onAdded: (m: string) => void }> = ({ kind, onClose, onAdded }) => {
  const fields = FIELDS[kind];
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.options ? f.options[0] : ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = Object.fromEntries(Object.entries(vals).filter(([, v]) => v.trim() !== ''));
      const r = await sm.addCandidate(kind, body);
      onAdded(r.message || `Candidate saved (${r.status}).`);
    } catch (err) {
      setError(msg(err, 'Could not add the candidate.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add a candidate by hand" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="candidate-form">
        {fields.map((f) => (
          <label key={f.key} className="candidate-field">
            <span className="field-lbl">
              {f.label}
              {f.required ? ' *' : ''}
            </span>
            {f.options ? (
              <select data-voice={f.key} className="field-input" value={vals[f.key]} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input data-voice={f.key} className="field-input" value={vals[f.key]} required={f.required} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
            )}
          </label>
        ))}
        {error && <Notice>{error}</Notice>}
        <div className="confirm-actions">
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={busy}>
            {busy ? 'Saving…' : 'Add and score'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const ImportDialog: React.FC<{ kind: Kind; onClose: () => void; onImported: (m: string) => void }> = ({ kind, onClose, onImported }) => {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const format = file && file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv';

  const run = async (dry: boolean) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const r = await sm.importCandidates(kind, format, file, dry);
      setReport(r);
      if (!dry) onImported(`Import finished: ${r.created} created, ${r.updated} updated, ${r.rejected} rejected.`);
    } catch (err) {
      setError(msg(err, 'Could not import the file.'));
    } finally {
      setBusy(false);
    }
  };

  const problems = report?.results.filter((r) => r.status === 'error') ?? [];
  return (
    <Modal title={`Import ${kind} candidates`} onClose={onClose}>
      <p className="eval-sub">
        Columns: {FIELDS[kind].map((f) => f.key).join(', ')}. CSV or JSON, UTF-8. Run the dry run first: it validates and saves nothing.
      </p>
      <input
        type="file"
        accept=".csv,.json,text/csv,application/json"
        aria-label="Import file"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setReport(null);
        }}
      />
      {error && <Notice>{error}</Notice>}
      {report && (
        <div data-testid="import-report" className="import-report">
          <strong>{report.dry_run ? 'Dry run' : 'Imported'}:</strong> {report.total} rows, {report.accepted} valid, {report.rejected} rejected, {report.duplicates} duplicates.
          {problems.length > 0 && (
            <ul className="import-errors">
              {problems.map((r) => (
                <li key={r.row}>
                  Row {r.row}: {r.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="confirm-actions">
        <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn-secondary btn-sm" disabled={!file || busy} onClick={() => void run(true)}>
          Dry run
        </button>
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={!file || busy || !report?.dry_run || report.accepted === 0}
          onClick={() => void run(false)}
          title="Run the dry run first"
        >
          Import valid rows
        </button>
      </div>
    </Modal>
  );
};
