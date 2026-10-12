// Helpers shared by the page-level API modules.
import { ApiError, request } from './client';

export interface CampaignBrief {
  id: number;
  name: string;
  label: string;
  size: number;
  risk: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  hypothesis: { label: string; match: number };
}

let brandCache: number | null = null;

/** The brand every page works on: the user's default brand (the first one). Falls back to 1 offline. */
export async function brandId(): Promise<number> {
  if (brandCache) return brandCache;
  const me = await request<{ default_brand_id: number | null } | null>('/api/me', { fallback: null });
  brandCache = me?.default_brand_id ?? 1;
  return brandCache;
}

export function resetBrandCache() {
  brandCache = null;
}

/** The highest-risk campaign of the brand (what Graph, Evolution, DNA and the Simulator show). null if there is none. */
export async function primaryCampaignId(brand?: number): Promise<number | null> {
  const b = brand ?? (await brandId());
  const list = await request<CampaignBrief[]>(`/api/campaigns?brand_id=${b}`, { fallback: [] });
  return list.length ? list[0].id : null;
}

export const SEVERITY_LABEL: Record<string, 'Critical' | 'High' | 'Medium' | 'Low'> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low'
};

export function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** 12.4 -> "↑ 12%", -3 -> "↓ 3%". */
export function fmtChange(pct: number): string {
  const r = Math.round(Math.abs(pct));
  return `${pct >= 0 ? '↑' : '↓'} ${r}%`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO timestamp -> "11 Oct 2026" in the viewer's local time. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** ISO timestamp -> "11 Oct 2026, 10:42 AM". */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${fmtDate(iso)}, ${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}

/**
 * Run an API call; if the server cannot be reached (ApiError status 0, or the offline sample session), return the bundled sample
 * data instead so the page still renders. Any other error (401/403/404/422/500) is rethrown for the page to show.
 */
export async function withSample<T>(fn: () => Promise<T>, sample: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) return sample;
    throw e;
  }
}
