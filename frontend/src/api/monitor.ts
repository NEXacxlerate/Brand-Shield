// Brand Monitor API: GET /api/brands/{id}/monitor, adapted to the page's view-model.
import { request } from './client';
import { brandId, fmtChange, withSample } from './common';
import { BRAND_MONITOR_DATA } from '../data/advancedData';

interface MonitorOut {
  grade: { letter: string; score: number };
  takedown_status: { label: string; count: number }[];
  activity: { weeks: string[]; new: number[]; confirmed: number[]; reported: number[]; includes_sample_history: boolean };
  severity: { label: string; pct: number; count: number }[];
  platforms: { name: string; count: number; change_pct: number; trend: number[] }[];
  alerts: { id: number; kind: string; title: string; ago: string; severity: string; sample: boolean }[];
  queue: {
    id: number;
    label: string;
    type: string;
    platform: string;
    score: number;
    severity: string;
    campaign_id: number | null;
    first_seen: string | null;
  }[];
  coverage: { channel: string; entities: number; mode: 'live' | 'sample' | 'not connected' }[];
}

export interface BrandMonitorView {
  grade: string;
  score: number;
  takedowns: { label: string; count: number }[];
  activityWeeks: { week: string; newThreats: number; inReview: number; takenDown: number }[];
  severities: { label: string; count: number; color: string }[];
  platforms: { name: string; count: number; change: string; bars: number[] }[];
  queueCount: number;
  awaitingCount: number;
  coverage: { channel: string; entities: number; mode: string }[];
  isSample: boolean;
}

const SEVERITY_COLOR: Record<string, string> = {
  info: '#5AA9FF',
  low: '#34D399',
  medium: '#F5C542',
  high: '#FF9A4D',
  critical: '#FF5C5C'
};

const SAMPLE: BrandMonitorView = {
  ...BRAND_MONITOR_DATA,
  queueCount: 24,
  awaitingCount: 8,
  coverage: [],
  isSample: true
};

function adapt(m: MonitorOut): BrandMonitorView {
  const a = m.activity;
  return {
    grade: m.grade.letter,
    score: m.grade.score,
    takedowns: m.takedown_status,
    activityWeeks: a.weeks.map((w, i) => ({
      week: w,
      newThreats: a.new[i] ?? 0,
      inReview: a.confirmed[i] ?? 0,
      takenDown: a.reported[i] ?? 0
    })),
    severities: m.severity.map((s) => ({ label: s.label, count: s.count, color: SEVERITY_COLOR[s.label.toLowerCase()] ?? '#5AA9FF' })),
    platforms: m.platforms.map((p) => ({ name: p.name, count: p.count, change: fmtChange(p.change_pct), bars: p.trend })),
    queueCount: m.queue.length,
    awaitingCount: m.takedown_status.find((t) => t.label === 'Awaiting review')?.count ?? 0,
    coverage: m.coverage.map((c) => ({ channel: c.channel, entities: c.entities, mode: c.mode })),
    isSample: false
  };
}

export const monitorApi = {
  getBrandMonitor(): Promise<BrandMonitorView> {
    return withSample(async () => adapt(await request<MonitorOut>(`/api/brands/${await brandId()}/monitor`)), SAMPLE);
  }
};
