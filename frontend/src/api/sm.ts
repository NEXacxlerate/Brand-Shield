// Typed calls to the ScamMind server. One function per endpoint; pages use them through hooks.
// Every function accepts an optional AbortSignal (last argument) so a page can cancel what it no longer needs.
import { authApi } from './auth';
import { downloadFile, request } from './client';
import type {
  Brand,
  BrandIdentityInput,
  Category,
  DataMode,
  DataModeInfo,
  Dashboard,
  DetectionDetail,
  DetectionList,
  Evaluation,
  ExcludedItem,
  FalsePositiveItem,
  LogoInfo,
  LookalikeResult,
  Me,
  OfficialAccount,
  OfficialApp,
  Report,
  ReportCreate,
  ReportPreview,
  RetryResult,
  Scan,
  ScanScope,
  ScanStart,
  ScanStatusInfo,
  SensitivityPreview,
  Settings,
  SettingsUpdate,
  SourceItem,
  SourceList,
  TestCaseList,
  TestCaseRun
} from './types';

type Sig = AbortSignal | undefined;
type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export function qs(params: Query): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x)));
    else p.append(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const sm = {
  // ---- auth / me
  login: authApi.login,
  logout: authApi.logout,
  me: (signal?: Sig) => request<Me>('/api/me', { signal }),

  // ---- brand
  brands: (signal?: Sig) => request<{ id: number; name: string }[]>('/api/brands', { signal }),
  brand: (id: number, signal?: Sig) => request<Brand>(`/api/brands/${id}`, { signal }),
  createBrand: (body: Pick<BrandIdentityInput, 'name'> & Partial<BrandIdentityInput>) => request<Brand>('/api/brands', { method: 'POST', json: body }),
  updateBrand: (id: number, body: BrandIdentityInput) => request<Brand>(`/api/brands/${id}`, { method: 'PUT', json: body }),
  uploadLogo: (id: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<LogoInfo>(`/api/brands/${id}/logo`, { method: 'POST', form });
  },
  logoBlob: (id: number, signal?: Sig) => request<Blob>(`/api/brands/${id}/logo`, { blob: true, signal }),
  addAccount: (id: number, platform: string, handle: string) =>
    request<OfficialAccount>(`/api/brands/${id}/accounts`, { method: 'POST', json: { platform, handle } }),
  removeAccount: (id: number, accountId: number) => request<{ ok: boolean }>(`/api/brands/${id}/accounts/${accountId}`, { method: 'DELETE' }),
  addApp: (id: number, body: { name: string; package_id: string; publisher: string; stores: string[] }) =>
    request<OfficialApp>(`/api/brands/${id}/apps`, { method: 'POST', json: body }),
  removeApp: (id: number, appId: number) => request<{ ok: boolean }>(`/api/brands/${id}/apps/${appId}`, { method: 'DELETE' }),

  // ---- dashboard / scans
  dashboard: (signal?: Sig) => request<Dashboard>('/api/dashboard', { signal }),
  startScan: (scope: ScanScope) => request<ScanStart>('/api/scan', { method: 'POST', json: { scope } }),
  job: (jobId: string, signal?: Sig) => request<Scan>(`/api/jobs/${encodeURIComponent(jobId)}`, { signal }),
  scanStatus: (signal?: Sig) => request<ScanStatusInfo>('/api/scan/status', { signal }),
  scans: (limit = 5, signal?: Sig) => request<{ total: number; items: Scan[] }>(`/api/scans${qs({ limit })}`, { signal }),

  // ---- detections
  detections: (q: { category?: Category; type?: string; platform?: string; status?: string[]; sort?: string; limit?: number; q?: string }, signal?: Sig) =>
    request<DetectionList>(`/api/detections${qs({ sort: 'score_desc', limit: 200, ...q })}`, { signal }),
  detection: (id: number, signal?: Sig) => request<DetectionDetail>(`/api/detections/${id}`, { signal }),
  setStatus: (id: number, status: 'reviewing' | 'confirmed' | 'dismissed') =>
    request<DetectionDetail & { audit_id: number }>(`/api/detections/${id}/status`, { method: 'POST', json: { status } }),
  markOfficial: (id: number) =>
    request<{ detection: DetectionDetail; allowlist_entry: { kind: string; id: number }; official_assets: number }>(`/api/detections/${id}/mark-official`, { method: 'POST', json: {} }),
  excluded: (category: Category, signal?: Sig) => request<{ total: number; items: ExcludedItem[] }>(`/api/detections/excluded${qs({ category })}`, { signal }),
  falsePositives: (category: Category, signal?: Sig) =>
    request<{ total: number; items: FalsePositiveItem[] }>(`/api/detections/false-positives${qs({ category })}`, { signal }),
  evidenceBlob: (id: number, signal?: Sig) => request<Blob>(`/api/detections/${id}/evidence/screenshot`, { blob: true, signal }),

  // ---- sources
  sources: (signal?: Sig) => request<SourceList>('/api/sources', { signal }),
  sourcesByKind: (kind: 'social' | 'store', signal?: Sig) => request<SourceList>(`/api/sources${qs({ kind })}`, { signal }),
  setMonitored: (id: number, monitored: boolean) => request<SourceItem>(`/api/sources/${id}`, { method: 'PATCH', json: { monitored } }),
  retrySource: (id: number) => request<RetryResult>(`/api/sources/${id}/retry`, { method: 'POST' }),
  dataMode: (signal?: Sig) => request<DataModeInfo>('/api/settings/data-mode', { signal }),
  setDataMode: (data_mode: DataMode) => request<DataModeInfo>('/api/settings/data-mode', { method: 'PUT', json: { data_mode } }),

  // ---- look-alike
  lookalikeTest: (name: string, signal?: Sig) => request<LookalikeResult>('/api/lookalike/test', { method: 'POST', json: { name }, signal }),
  testCases: (signal?: Sig) => request<TestCaseList>('/api/lookalike/test-cases', { signal }),
  runTestCases: () => request<TestCaseRun>('/api/lookalike/test-cases/run', { method: 'POST' }),

  // ---- settings
  settings: (signal?: Sig) => request<Settings>('/api/settings', { signal }),
  saveSettings: (body: SettingsUpdate) => request<Settings>('/api/settings', { method: 'PUT', json: body }),
  sensitivityPreview: (sensitivity: number, signal?: Sig) =>
    request<SensitivityPreview>('/api/settings/sensitivity-preview', { method: 'POST', json: { sensitivity }, signal }),

  // ---- reports
  reportPreview: (q: { from?: string; to?: string; types?: string[]; status?: string; ids?: number[]; include_evidence?: boolean }, signal?: Sig) =>
    request<ReportPreview>(`/api/reports/preview${qs({ ...q, types: q.types?.join(','), ids: q.ids?.join(',') })}`, { signal }),
  reports: (limit = 10, signal?: Sig) => request<{ total: number; items: Report[] }>(`/api/reports${qs({ limit })}`, { signal }),
  createReport: (body: ReportCreate) => request<Report>('/api/reports', { method: 'POST', json: body }),
  approveReport: (id: number) => request<Report>(`/api/reports/${id}/approve`, { method: 'POST' }),
  reportHtml: (id: number, signal?: Sig) => request<string>(`/api/reports/${id}/preview`, { text: true, signal }),
  downloadReport: (id: number, kind: 'csv' | 'html', filename: string) => downloadFile(`/api/reports/${id}/export.${kind}`, filename),

  // ---- evaluation
  evaluation: (signal?: Sig) => request<Evaluation>('/api/evaluation', { signal }),
  runEvaluation: () => request<Evaluation>('/api/evaluation/run', { method: 'POST' })
};
