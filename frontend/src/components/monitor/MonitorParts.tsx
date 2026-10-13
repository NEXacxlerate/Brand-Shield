// Pieces shared by the Social and App Store pages. Markup and class names are the ones of the original screens.
import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, ShieldCheck } from 'lucide-react';
import { fmtDayTime, platformLabel } from '../../api/format';
import type { DetectionDetail, ExcludedItem, FalsePositiveItem, SourceItem } from '../../api/types';
import { ApiError } from '../../api/client';
import { sm } from '../../api/sm';
import { Empty, ErrorBox, Loading } from '../common/States';
import { RetryCostDialog, isConfirmationRequired, retryNeedsConfirm } from '../common/ConfirmDialog';
import type { ApiState } from '../../hooks/useApi';

type Load<T> = Pick<ApiState<T>, 'data' | 'loading' | 'error' | 'reload'>;
import '../common/States.css';

const SLUG_WORDS: Record<string, string> = {
  google_play: 'Google Play',
  app_store: 'App Store',
  third_party_apk: 'Third-party APK',
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
  telegram: 'Telegram',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
};

/** "@acmebank on instagram" -> "@acmebank on Instagram"; "Acme Bank Ltd · google_play" -> "Acme Bank Ltd · Google Play". */
export function prettySlugs(text: string): string {
  return text.replace(/\b(google_play|app_store|third_party_apk|instagram|facebook|linkedin|youtube|telegram)\b/g, (m) => SLUG_WORDS[m]).replace(/ on x$/, ' on X');
}

/** Only http(s) links are made clickable (the evidence URL comes from a third party). */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
  try {
    const p = new URL(u);
    return p.protocol === 'http:' || p.protocol === 'https:' ? p.toString() : null;
  } catch {
    return null;
  }
}

export function shortHash(sha: string | null | undefined): string {
  return sha ? `${sha.substring(0, 4)}…${sha.substring(sha.length - 4)}` : 'n/a';
}

// ------------------------------------------------------------- sources bar
export const SourcesBar: React.FC<{
  state: Load<{ items: SourceItem[] }>;
  /** apps page: red variant with an inline Retry for the unavailable source */
  variant: 'social' | 'apps';
  onRetried: () => void;
}> = ({ state, variant, onRetried }) => {
  const [retrying, setRetrying] = React.useState<number | null>(null);
  const [retryError, setRetryError] = React.useState<string | null>(null);
  const items = state.data?.items ?? [];
  const problems = items.filter((s) => s.status !== 'online');

  const [confirm, setConfirm] = React.useState<{ item: SourceItem; credits?: number; remaining?: number | null } | null>(null);

  /** A retry that can spend paid credits asks first and shows the cost (the server refuses an unconfirmed one with 409). */
  const retry = async (item: SourceItem, confirmed = false) => {
    if (!confirmed && retryNeedsConfirm(item)) {
      setConfirm({ item });
      return;
    }
    setConfirm(null);
    setRetrying(item.id);
    setRetryError(null);
    try {
      await sm.retrySource(item.id, confirmed);
      onRetried();
    } catch (e) {
      if (isConfirmationRequired(e)) {
        const b = e.body as { estimated_credits?: number; credits_remaining?: number | null };
        setConfirm({ item, credits: b.estimated_credits, remaining: b.credits_remaining });
      } else {
        setRetryError(e instanceof ApiError ? e.message : 'Retry failed.');
      }
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="sources-status-bar">
      <div className="sources-pills-row">
        <span className="source-lbl">Sources</span>
        {state.loading && <span className="source-pill">Checking…</span>}
        {items.map((s) => (
          <span
            key={s.id}
            className={`source-pill ${s.status === 'slow' ? 'warn' : s.status === 'unavailable' ? (variant === 'apps' ? 'alert-red' : 'warn') : 'ok'}`}
          >
            <span className={`src-dot ${s.status === 'online' ? 'dot-green' : s.status === 'slow' ? 'dot-orange' : 'dot-red'}`} />
            {s.name}
            {s.status === 'slow' ? ' · slow' : s.status === 'unavailable' ? ' · unavailable' : ''}
          </span>
        ))}
      </div>

      {state.error && <ErrorBox error={state.error} onRetry={state.reload} compact />}
      {problems.map((s) => (
        <div key={s.id} className={`source-warning-box ${s.status === 'unavailable' && variant === 'apps' ? 'red-warn' : ''}`} data-testid="source-warning">
          <AlertTriangle size={14} className={s.status === 'unavailable' && variant === 'apps' ? 'warn-icon-red' : 'warn-icon'} />
          <span>
            {s.name}: {s.message}
            {s.cached_at && s.status === 'unavailable' ? ` Cached results from ${fmtDayTime(s.cached_at)}.` : ''}{' '}
            {variant === 'apps' ? (
              <button type="button" className="retry-inline-btn" onClick={() => void retry(s)} disabled={retrying === s.id}>
                {retrying === s.id ? 'Retrying…' : 'Retry'}
              </button>
            ) : (
              <Link to="/sources" className="warn-details-link">
                Details
              </Link>
            )}
          </span>
        </div>
      ))}
      {retryError && <div className="helper-note warn">{retryError}</div>}
      {confirm && (
        <RetryCostDialog
          item={confirm.item}
          credits={confirm.credits}
          remaining={confirm.remaining}
          onConfirm={() => void retry(confirm.item, true)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
};

// ------------------------------------------------------------- bottom panels
/** "@acmebank on Instagram": the handle in bold, the platform in regular weight (as in the design). */
export function renderAccountLabel(text: string): React.ReactNode {
  const i = text.lastIndexOf(' on ');
  if (i < 0) return text;
  return (
    <>
      <strong className="excluded-handle">{text.slice(0, i)}</strong>
      {text.slice(i)}
    </>
  );
}

export const ExcludedCard: React.FC<{ state: Load<{ items: ExcludedItem[] }>; kind: 'account' | 'app'; description: string }> = ({ state, kind, description }) => {
  const items = (state.data?.items ?? []).filter((i) => i.kind === kind);
  return (
    <div className="card bottom-dual-card">
      <div className="dual-card-head">
        <ShieldCheck size={17} className="dual-head-icon ok" aria-hidden="true" />
        <h3 className="panel-card-title">Excluded as official</h3>
      </div>
      <p className="dual-card-desc">{description}</p>
      <div className="allowlist-items-list">
        {state.loading && <Loading />}
        {state.error && <ErrorBox error={state.error} onRetry={state.reload} compact />}
        {state.data && items.length === 0 && <Empty>No official {kind === 'account' ? 'accounts' : 'apps'} on the allowlist yet.</Empty>}
        {items.map((it) => (
          <div key={`${it.kind}-${it.id}`} className="excluded-row">
            {kind === 'account' ? (
              <span>{renderAccountLabel(prettySlugs(it.label))}</span>
            ) : (
              <div>
                <div className="guard-entity-title">{it.label}</div>
                <div className="guard-entity-sub">{prettySlugs(it.sub ?? '')}</div>
              </div>
            )}
            <span className="chip chip-green" title={it.matched_rule}>{it.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const GuardCard: React.FC<{ state: Load<{ items: FalsePositiveItem[] }>; kind: 'social' | 'apps'; description: string }> = ({ state, kind, description }) => {
  const items = state.data?.items ?? [];
  const pctText = (v: number | null, what: string) => (v === null || v === undefined ? `${what} not compared` : `${what} ${v}% match`);
  return (
    <div className="card bottom-dual-card">
      <div className="dual-card-head">
        <Check size={17} className="dual-head-icon" aria-hidden="true" />
        <h3 className="panel-card-title">False-positive guard</h3>
      </div>
      <p className="dual-card-desc">{description}</p>
      <div className="allowlist-items-list">
        {state.loading && <Loading />}
        {state.error && <ErrorBox error={state.error} onRetry={state.reload} compact />}
        {state.data && items.length === 0 && <Empty>Nothing has been cleared yet.</Empty>}
        {items.map((it) => (
          <div key={it.id} className="excluded-row" title={it.reason}>
            <div>
              <div className="guard-entity-title">
                {kind === 'social' ? `${it.handle || it.name} · ${platformLabel(it.platform)}` : `${it.name}${it.package_id ? ` · ${it.package_id}` : ''}`}
              </div>
              <div className="guard-entity-sub">
                {kind === 'social'
                  ? [it.name_match_percent !== null ? `Name ${it.name_match_percent}% match` : null, pctText(it.logo_match_percent, 'logo')].filter(Boolean).join(', ')
                  : [it.publisher, [pctText(it.icon_match_percent, 'icon')].join('')].filter(Boolean).join(' · ')}
              </div>
            </div>
            <span className="chip chip-neutral">Not flagged</span>
          </div>
        ))}
      </div>
      <Link to="/lookalike" className="see-names-link">
        See how names are matched →
      </Link>
    </div>
  );
};

// ------------------------------------------------------------- detail blocks
export const ReasonsBox: React.FC<{ d: DetectionDetail }> = ({ d }) => {
  // Each bar is that signal's points relative to the strongest signal of this detection (real data, nothing added).
  const maxPts = Math.max(1, ...d.reasons.map((r) => r.points));
  return (
    <div className="scored-breakdown-box">
      <div className="scored-head">
        <h4 className="scored-title">Why it scored {d.score}</h4>
        <span className="scored-sub">Points added by each signal</span>
      </div>
      <div className="signals-list">
        {d.reasons.map((r, i) => (
          <div key={i} className="signal-item">
            <div className="signal-line">
              <span className="signal-label">
                <strong className="signal-name">{r.label}</strong> · {r.detail}
              </span>
              <span className="signal-pts">+{r.points}</span>
            </div>
            <div className="signal-bar" aria-hidden="true">
              <div className="signal-bar-fill" style={{ width: `${Math.max(2, (r.points / maxPts) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const EvidenceBox: React.FC<{ d: DetectionDetail }> = ({ d }) => {
  const href = safeHref(d.evidence.page_url);
  const [shotError, setShotError] = React.useState<string | null>(null);
  const openShot = async () => {
    setShotError(null);
    try {
      const blob = await sm.evidenceBlob(d.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setShotError(e instanceof ApiError ? e.message : 'Could not load the screenshot.');
    }
  };
  return (
    <div className="evidence-kept-box">
      <div className="evidence-title">Evidence kept</div>
      <div className="evidence-row">
        {d.evidence.screenshot_url ? (
          <button type="button" className="evidence-link" onClick={() => void openShot()}>
            Profile screenshot
          </button>
        ) : (
          <span className="evidence-text" title="Screenshots are switched off by default">No screenshot</span>
        )}
        {href ? (
          <a className="evidence-link" href={href} target="_blank" rel="noopener noreferrer">
            Profile URL
          </a>
        ) : (
          <span className="evidence-text">No URL</span>
        )}
        <span className="evidence-text">Captured {fmtDayTime(d.evidence.captured_at) || 'n/a'}</span>
        <span className="evidence-sha" title={d.evidence.sha256 ?? undefined}>SHA-256 {shortHash(d.evidence.sha256)}</span>
      </div>
      {shotError && <div className="helper-note warn">{shotError}</div>}
    </div>
  );
};

export const ActionRow: React.FC<{
  confirmLabel: string;
  disabled: boolean;
  onAction: (a: 'confirmed' | 'reviewing' | 'dismissed' | 'official') => void;
}> = ({ confirmLabel, disabled, onAction }) => (
  <div className="detail-actions-row">
    <button type="button" className="btn-danger-outline" disabled={disabled} onClick={() => onAction('confirmed')}>
      {confirmLabel}
    </button>
    <button type="button" className="btn-secondary" disabled={disabled} onClick={() => onAction('reviewing')}>
      Keep reviewing
    </button>
    <button type="button" className="btn-secondary" disabled={disabled} onClick={() => onAction('dismissed')}>
      Dismiss as false positive
    </button>
    <button type="button" className="btn-secondary" disabled={disabled} onClick={() => onAction('official')}>
      Mark as official
    </button>
  </div>
);
