// Watchlist API: list/add/patch/delete watch items, plus alerts.
import { request } from './client';
import { brandId, fmtDate, titleCase, withSample } from './common';
import { WATCHLIST_DATA } from '../data/advancedData';

export type WatchKind = 'domain' | 'profile' | 'phone' | 'payment' | 'app';
export type WatchStatus = 'stable' | 'changed' | 'spreading' | 'offline';

export interface WatchRules {
  dns?: boolean;
  cert?: boolean;
  title?: boolean;
  [k: string]: unknown;
}

export interface WatchRow {
  id: number;
  entity: string;
  type: string;
  status: string;
  /** Monitoring is on when at least one rule is enabled. */
  active: boolean;
  dateAdded: string;
  rules: WatchRules;
  isSample: boolean;
}

interface WatchOut {
  id: number;
  brand_id: number;
  kind: WatchKind;
  value: string;
  rules: WatchRules;
  status: WatchStatus;
  last_checked: string | null;
  created_at: string;
}

export interface AlertItem {
  id: number;
  kind: string;
  severity: string;
  title: string;
  detail: string;
  read: boolean;
  sample: boolean;
  ago: string;
}

const KIND_LABEL: Record<WatchKind, string> = {
  domain: 'Domain',
  profile: 'Social Profile',
  phone: 'Phone Number',
  payment: 'Payment ID',
  app: 'Android APK'
};

/** The page's type-chip labels -> API kinds. */
export const KIND_BY_LABEL: Record<string, WatchKind> = {
  Domain: 'domain',
  'Social Profile': 'profile',
  'Phone Number': 'phone',
  'Android APK': 'app',
  'Payment ID': 'payment'
};

function adapt(w: WatchOut): WatchRow {
  const rules = w.rules ?? {};
  return {
    id: w.id,
    entity: w.value,
    type: w.value.includes('t.me') ? 'Telegram' : KIND_LABEL[w.kind] ?? w.kind,
    status: titleCase(w.status),
    active: !!(rules.dns || rules.cert || rules.title),
    dateAdded: fmtDate(w.created_at),
    rules,
    isSample: false
  };
}

const SAMPLE_ROWS: WatchRow[] = WATCHLIST_DATA.map((w) => ({ ...w, rules: {}, isSample: true }));

export const watchlistApi = {
  getWatchlist(): Promise<WatchRow[]> {
    return withSample(async () => {
      const b = await brandId();
      return (await request<WatchOut[]>(`/api/watchlist?brand_id=${b}`)).map(adapt);
    }, SAMPLE_ROWS);
  },
  async addWatchItem(kind: WatchKind, value: string, rules?: WatchRules): Promise<WatchRow> {
    const b = await brandId();
    return adapt(
      await request<WatchOut>('/api/watchlist', { method: 'POST', json: { brand_id: b, kind, value, ...(rules ? { rules } : {}) } })
    );
  },
  async checkWatchItem(id: number): Promise<WatchRow> {
    return adapt(await request<WatchOut>(`/api/watchlist/${id}`, { method: 'PATCH', json: { check_now: true } }));
  },
  async acknowledgeWatchItem(id: number): Promise<WatchRow> {
    return adapt(await request<WatchOut>(`/api/watchlist/${id}`, { method: 'PATCH', json: { status: 'stable' } }));
  },
  async setWatchRules(id: number, rules: { dns: boolean; cert: boolean; title: boolean }): Promise<WatchRow> {
    return adapt(await request<WatchOut>(`/api/watchlist/${id}`, { method: 'PATCH', json: { rules } }));
  },
  async removeWatchItem(id: number): Promise<void> {
    await request<unknown>(`/api/watchlist/${id}`, { method: 'DELETE' });
  },
  getAlerts(unread = true): Promise<AlertItem[]> {
    return request<AlertItem[]>(`/api/alerts?unread=${unread}`, { fallback: [] });
  },
  async markAlertRead(id: number): Promise<void> {
    await request<unknown>(`/api/alerts/${id}/read`, { method: 'POST' });
  }
};
