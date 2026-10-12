import React from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useIsSample } from '../../api/sample';
import './States.css';

/** First-load placeholder (no data yet). Re-loads keep the old data on screen instead. */
export const Loading: React.FC<{ what?: string }> = ({ what = 'Loading' }) => (
  <div className="state-note" role="status" aria-live="polite">
    <span className="state-spinner" aria-hidden="true" />
    {what}…
  </div>
);

/** A failed load with a retry button. The message is the server's own (or the network message). */
export const ErrorBox: React.FC<{ error: ApiError | Error | string; onRetry?: () => void; compact?: boolean }> = ({ error, onRetry, compact }) => (
  <div className={`state-error ${compact ? 'compact' : ''}`} role="alert">
    <span>{typeof error === 'string' ? error : error.message}</span>
    {onRetry && (
      <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>
        Retry
      </button>
    )}
  </div>
);

/** Nothing to show yet. */
export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="state-note state-empty">{children}</div>;

/** Whole-page state when the workspace has no brand profile yet (every data page needs one). */
export const NoBrand: React.FC = () => (
  <div className="state-note state-empty">
    No brand profile yet. <Link to="/setup">Set up your brand profile</Link> to start monitoring.
  </div>
);

/** Small inline notice for an action that failed (optimistic rollbacks, scan errors). */
export const Notice: React.FC<{ kind?: 'error' | 'info'; children: React.ReactNode; onClose?: () => void }> = ({ kind = 'error', children, onClose }) => (
  <div className={`state-inline ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
    <span>{children}</span>
    {onClose && (
      <button type="button" className="state-inline-close" onClick={onClose} aria-label="Dismiss">
        ×
      </button>
    )}
  </div>
);

/**
 * The footer note shown on every data page, only while the API says the data is sample data.
 * The brand name comes from the API (the design says "Acme Bank" because that is the sample brand).
 */
export const SampleNote: React.FC<{ brandName?: string | null }> = ({ brandName }) => {
  const sample = useIsSample();
  if (!sample) return null;
  return (
    <div className="page-bottom-note" data-testid="sample-note">
      Sample data for the fictional brand {brandName || 'Acme Bank'}. Not real detections.
    </div>
  );
};
