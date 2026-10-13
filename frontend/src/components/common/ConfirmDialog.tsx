import React, { useEffect, useRef } from 'react';
import { ApiError } from '../../api/client';
import type { SourceItem } from '../../api/types';
import './ConfirmDialog.css';

/** True when a manual retry of this source spends paid credits and therefore needs an explicit confirmation. */
export function retryNeedsConfirm(item: Pick<SourceItem, 'retry_estimate'>): boolean {
  return (item.retry_estimate?.credits ?? 0) > 0;
}

/** The server refuses an unconfirmed paid retry with 409 `{ code: 'confirmation_required', estimated_credits }`. */
export function isConfirmationRequired(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status === 409 && typeof e.body === 'object' && e.body !== null && (e.body as { code?: string }).code === 'confirmation_required';
}

export const ConfirmDialog: React.FC<{
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}> = ({ title, confirmLabel, onConfirm, onCancel, children }) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="confirm-backdrop" onMouseDown={(ev) => ev.target === ev.currentTarget && onCancel()}>
      <div className="confirm-dialog card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h3 id="confirm-title" className="panel-card-title">{title}</h3>
        <div className="confirm-body">{children}</div>
        <div className="confirm-actions">
          <button type="button" className="btn-secondary btn-sm" ref={cancelRef} onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-primary btn-sm" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

/** The text of the credit warning, shared by Source Health and the sources bar. */
export const RetryCostDialog: React.FC<{ item: Pick<SourceItem, 'name' | 'retry_estimate'>; credits?: number; remaining?: number | null; onConfirm: () => void; onCancel: () => void }> = ({
  item,
  credits,
  remaining,
  onConfirm,
  onCancel
}) => {
  const n = credits ?? item.retry_estimate?.credits ?? 0;
  const left = remaining !== undefined ? remaining : item.retry_estimate?.remaining ?? null;
  return (
    <ConfirmDialog title={`Retry ${item.name}?`} confirmLabel={`Spend up to ${n} credits and retry`} onConfirm={onConfirm} onCancel={onCancel}>
      <p>
        This retry searches again and can use <strong>up to {n} Tavily credits</strong>, even if nothing new is found.
        {left != null ? ` ${left} credits are left this month.` : ''}
      </p>
      <p className="confirm-note">The app also retries by itself after a wait. Retry by hand only if you need the answer now.</p>
    </ConfirmDialog>
  );
};
