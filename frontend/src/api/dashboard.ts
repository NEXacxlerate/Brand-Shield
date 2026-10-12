// Dashboard API: one call, adapted into the view models the page already renders.
import { request } from './client';
import { brandId, fmtChange, SEVERITY_LABEL, titleCase, withSample } from './common';
import { adaptRecent } from './investigations';
import type { ApiRecentRow, RecentCase } from './investigations';
import {
  CRITICAL_ALERTS,
  KPI_DATA,
  RECENT_INVESTIGATIONS,
  SCAM_CAMPAIGNS,
  STATE_THREATS,
  THREAT_CATEGORIES
} from '../data/mockData';
import type { CampaignSummary, CriticalAlert, KPICardData, StateThreat, ThreatCategory } from '../data/mockData';

interface ApiDashboard {
  kpis: { key: string; label: string; value: number; change_pct: number; trend: number[]; good: boolean }[];
  states: { code: string; name: string; threats: number; change_pct: number; level: 'high' | 'medium' | 'low' }[];
  categories: { label: string; pct: number; color: string; count: number }[];
  campaigns: { id: number; name: string; entities: number; risk: string; sample?: boolean }[];
  alerts: { id: number; kind: string; title: string; ago: string; severity: string; sample?: boolean }[];
  recent: ApiRecentRow[];
  ai_summary: {
    text: string;
    source: 'rules' | 'ai';
    counts: AiCounts;
    campaign_id: number | null;
  };
}

interface AiCounts {
  social: number;
  websites: number;
  apps: number;
  phones: number;
  payment_ids: number;
}

export interface AiCounter {
  label: string;
  count: number;
  color: string;
}

export interface DashboardView {
  kpis: KPICardData[];
  states: StateThreat[];
  categories: ThreatCategory[];
  totalThreats: string;
  campaigns: CampaignSummary[];
  alerts: CriticalAlert[];
  recent: RecentCase[];
  aiText: string;
  aiCounters: AiCounter[];
  campaignId: number | null;
  isSample: boolean;
}

const KPI_COLORS: Record<string, KPICardData['color']> = {
  investigations: 'blue',
  active_threats: 'red',
  suspicious_apps: 'violet',
  fake_profiles: 'green'
};
const KPI_ORDER: KPICardData['color'][] = ['blue', 'red', 'violet', 'green'];

const COUNTER_STYLE: Record<keyof AiCounts, { label: string; color: string }> = {
  social: { label: 'Social Profiles', color: '#FF9A4D' },
  websites: { label: 'Websites', color: '#5AA9FF' },
  apps: { label: 'Apps', color: '#FF5C5C' },
  phones: { label: 'Phone Numbers', color: '#5AA9FF' },
  payment_ids: { label: 'Payment ID', color: '#EDEDF2' }
};

function counters(c: AiCounts): AiCounter[] {
  return (Object.keys(COUNTER_STYLE) as (keyof AiCounts)[])
    .map((k) => ({ ...COUNTER_STYLE[k], count: c[k] }))
    .filter((x) => x.count > 0);
}

const SAMPLE: DashboardView = {
  kpis: KPI_DATA,
  states: STATE_THREATS,
  categories: THREAT_CATEGORIES,
  totalThreats: '2,487',
  campaigns: SCAM_CAMPAIGNS,
  alerts: CRITICAL_ALERTS,
  recent: RECENT_INVESTIGATIONS.map((r) => ({ ...r, caseId: '' })),
  aiText:
    'A coordinated impersonation campaign targeting Acme Bank has been detected. The profile, website and Android app share similar content, infrastructure and behavioural patterns. This campaign closely matches 17 previously identified scams.',
  aiCounters: counters({ social: 8, websites: 3, apps: 2, phones: 2, payment_ids: 1 }),
  campaignId: null,
  isSample: true
};

function adapt(d: ApiDashboard): DashboardView {
  return {
    kpis: d.kpis.map((k, i) => ({
      title: k.label,
      value: k.value.toLocaleString('en-US'),
      change: fmtChange(k.change_pct),
      isGood: k.good,
      trend: k.trend,
      color: KPI_COLORS[k.key] ?? KPI_ORDER[i % 4]
    })),
    states: d.states.map((s) => ({
      state: s.name,
      threats: s.threats,
      change: fmtChange(s.change_pct),
      severity: titleCase(s.level) as StateThreat['severity']
    })),
    categories: d.categories.map((c) => ({ label: c.label, percentage: c.pct, color: c.color })),
    totalThreats: d.categories.reduce((n, c) => n + c.count, 0).toLocaleString('en-US'),
    campaigns: d.campaigns.map((c) => ({
      name: c.name,
      entities: c.entities,
      risk: (SEVERITY_LABEL[c.risk] ?? 'Low') as CampaignSummary['risk']
    })),
    alerts: d.alerts.map((a) => ({
      id: String(a.id),
      title: a.title,
      timeAgo: a.ago,
      severity: (SEVERITY_LABEL[a.severity] ?? 'Medium') as CriticalAlert['severity']
    })),
    recent: adaptRecent(d.recent),
    aiText: d.ai_summary.text,
    aiCounters: counters(d.ai_summary.counts),
    campaignId: d.ai_summary.campaign_id,
    isSample: false
  };
}

export const dashboardApi = {
  async getDashboard(): Promise<DashboardView> {
    return withSample(async () => {
      const b = await brandId();
      return adapt(await request<ApiDashboard>(`/api/dashboard?brand_id=${b}`));
    }, SAMPLE);
  }
};
