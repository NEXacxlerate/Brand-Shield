// App Analysis API: POST /api/apps/analyze (APK upload or JSON metadata), adapted to the page's view-model.
import { request } from './client';
import { APP_ANALYSIS_DATA } from '../data/advancedData';

export interface AppAnalysisView {
  verdictScore: number;
  verdictLabel: string;
  verdictSeverity: string;
  verdictDesc: string;
  officialApp: { name: string; pkg: string; source: string };
  thisApp: { name: string; pkg: string; source: string };
  iconSimilarity: number | null;
  staticIndicators: { check: string; finding: string; flag: string }[];
  permissions: { name: string; desc: string; status: string }[];
  embeddedUrls: { url: string; note: string; tag: string }[];
  investigationId: string | null;
  isSample: boolean;
}

interface AppAnalysisResponse {
  verdict: { score: number; severity: string };
  official: { name: string; package: string; developer?: string; cert_sha256?: string; source: string };
  app: { name: string; package: string; version?: string; developer?: string; cert_sha256?: string; source: string };
  icon_similarity: number | null;
  indicators: { check: string; finding: string; flag: string }[];
  permissions: { name: string; risky: boolean; reason: string }[];
  urls: { url: string; note: string; flag: string }[];
  evidence_id?: string | number | null;
  investigation_id?: string | null;
}

export interface AppMetadata {
  package: string;
  title: string;
  developer: string;
  cert_sha256: string;
  permissions: string[];
  urls: string[];
  store: 'play' | 'sideload';
  installs?: number;
  released_days_ago?: number;
  version?: string;
}

const STORAGE_KEY = 'scammind.lastApp';
const LABELS: Record<string, string> = {
  critical: 'Critical Risk',
  high: 'High Risk',
  medium: 'Medium Risk',
  low: 'Low Risk'
};

export const SAMPLE_APP: AppAnalysisView = { ...APP_ANALYSIS_DATA, iconSimilarity: APP_ANALYSIS_DATA.iconSimilarity, investigationId: null, isSample: true };

function adapt(r: AppAnalysisResponse): AppAnalysisView {
  const sev = r.verdict.severity.toLowerCase();
  const flagged = r.indicators.filter((i) => !['Low', 'Normal', 'OK', 'Match'].includes(i.flag)).slice(0, 3);
  const desc = flagged.length
    ? flagged.map((i) => `${i.check}: ${i.finding}`).join('. ') + '.'
    : 'No strong counterfeit indicators were found.';
  return {
    verdictScore: r.verdict.score,
    verdictLabel: LABELS[sev] ?? `${sev} risk`,
    verdictSeverity: sev.charAt(0).toUpperCase() + sev.slice(1),
    verdictDesc: desc,
    officialApp: { name: r.official.name, pkg: r.official.package, source: r.official.source },
    thisApp: { name: r.app.name, pkg: r.app.package, source: r.app.source },
    iconSimilarity: r.icon_similarity,
    staticIndicators: r.indicators,
    permissions: r.permissions.map((p) => ({ name: p.name, desc: p.reason, status: p.risky ? 'Risky' : 'Normal' })),
    embeddedUrls: r.urls.map((u) => ({ url: u.url, note: u.note, tag: u.flag === 'Suspicious' ? 'Suspicious' : u.flag || 'Source' })),
    investigationId: r.investigation_id ?? null,
    isSample: false
  };
}

function remember(v: AppAnalysisView) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

export const appsApi = {
  /** The last analysis of this session, or the bundled sample. */
  getLastApp(): AppAnalysisView {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as AppAnalysisView;
    } catch {
      /* ignore */
    }
    return SAMPLE_APP;
  },
  async analyzeApk(file: File): Promise<AppAnalysisView> {
    const form = new FormData();
    form.append('file', file);
    const v = adapt(await request<AppAnalysisResponse>('/api/apps/analyze', { method: 'POST', form }));
    remember(v);
    return v;
  },
  async analyzeMetadata(meta: AppMetadata): Promise<AppAnalysisView> {
    const v = adapt(await request<AppAnalysisResponse>('/api/apps/analyze', { method: 'POST', json: meta }));
    remember(v);
    return v;
  }
};
