// Round 2 investigation API client.
// Reads R1 detection data read-only; all writes go to the R2 layer.
import { request } from './client';

export type R2Status = 'new' | 'under_review' | 'confirmed' | 'false_positive' | 'closed';
export type R2Level = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface R2InvRow {
  id: number;
  detection_id: number;
  risk_score: number;
  risk_level: R2Level;
  status: R2Status;
  assigned_to: string | null;
  platform: string;
  name: string;
  handle: string | null;
  category: string;
  r1_score: number;
  r1_band: string;
  alerted: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface R2BreakdownItem {
  value: number | boolean | null;
  points: number;
  weight: number;
  label: string;
  contributing: boolean;
}

export interface R2ScoreBreakdown {
  score: number;
  level: R2Level;
  explanation: string;
  breakdown: {
    name_similarity: R2BreakdownItem;
    logo_similarity: R2BreakdownItem;
    description_overlap: R2BreakdownItem;
    publisher_mismatch: R2BreakdownItem;
    other_signals: R2BreakdownItem;
  };
}

export interface R2DetectionSnapshot {
  detection_id: number;
  platform: string;
  category: string;
  type: string;
  source_url: string | null;
  suspected_asset: {
    name: string;
    handle: string | null;
    package_id: string | null;
    publisher: string | null;
    url: string | null;
    bio: string | null;
    followers: number | null;
    verified: boolean | null;
  };
  evidence: {
    name_similarity_pct: number;
    logo_similarity_pct: number | null;
    page_url: string | null;
    captured_at: string | null;
  };
  r1_score: number;
  r1_band: string;
  r1_severity: string;
  reasons: Array<{ signal: string; detail: string; points: number }>;
  found_at: string | null;
  last_seen_at: string | null;
}

export interface R2HistoryEvent {
  id: number;
  action: string;
  from_status: string | null;
  to_status: string | null;
  actor: string;
  note: string;
  created_at: string | null;
}

export interface R2InvDetail extends R2InvRow {
  score_breakdown: R2ScoreBreakdown;
  history: R2HistoryEvent[];
  detection: R2DetectionSnapshot | null;
}

export interface R2List {
  total: number;
  items: R2InvRow[];
  counts: {
    by_status: Record<string, number>;
    by_level: Record<string, number>;
  };
}

export interface R2Alert {
  id: number;
  investigation_id: number;
  detection_id: number;
  risk_score: number;
  risk_level: R2Level;
  platform: string;
  name: string;
  dismissed: boolean;
  dismissed_by: string | null;
  dismissed_at: string | null;
  created_at: string | null;
}

type Sig = AbortSignal | undefined;

function qs(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const r2api = {
  sync: (signal?: Sig) =>
    request<{ imported: number; already_present: number; total_r1: number }>(
      '/api/r2/investigations/sync',
      { method: 'POST', json: {}, signal }
    ),

  list: (
    params: { status?: string; risk_level?: string; platform?: string; category?: string; q?: string; limit?: number; offset?: number },
    signal?: Sig
  ) =>
    request<R2List>(`/api/r2/investigations${qs(params)}`, { signal }),

  detail: (id: number, signal?: Sig) =>
    request<R2InvDetail>(`/api/r2/investigations/${id}`, { signal }),

  start: (id: number, note = '') =>
    request<R2InvRow>(`/api/r2/investigations/${id}/start`, { method: 'POST', json: { note } }),

  confirm: (id: number, note = '') =>
    request<R2InvRow>(`/api/r2/investigations/${id}/confirm`, { method: 'POST', json: { note } }),

  falsePositive: (id: number, note = '') =>
    request<R2InvRow>(`/api/r2/investigations/${id}/false-positive`, { method: 'POST', json: { note } }),

  close: (id: number, note = '') =>
    request<R2InvRow>(`/api/r2/investigations/${id}/close`, { method: 'POST', json: { note } }),

  reopen: (id: number, note = '') =>
    request<R2InvRow>(`/api/r2/investigations/${id}/reopen`, { method: 'POST', json: { note } }),

  addNote: (id: number, note: string) =>
    request<R2InvRow>(`/api/r2/investigations/${id}/note`, { method: 'POST', json: { note } }),

  assign: (id: number, analyst: string) =>
    request<R2InvRow>(`/api/r2/investigations/${id}/assign`, { method: 'POST', json: { analyst } }),

  takedown: (id: number, signal?: Sig) =>
    request<{ investigation_id: number; detection_id: number; text: string }>(
      `/api/r2/investigations/${id}/takedown`,
      { signal }
    ),

  alerts: (signal?: Sig) =>
    request<{ items: R2Alert[]; total: number }>('/api/r2/alerts', { signal }),

  dismissAlert: (id: number) =>
    request<R2Alert>(`/api/r2/alerts/${id}/dismiss`, { method: 'POST', json: {} }),
};
