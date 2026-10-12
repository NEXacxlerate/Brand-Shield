// Investigations API: submit, list, detail, lifecycle, notes, evidence, and the action buttons on the Results page.
import { request, session } from './client';
import { brandId, fmtDateTime, titleCase, withSample } from './common';
import { INVESTIGATION_DETAIL, RECENT_INVESTIGATIONS } from '../data/mockData';
import type { RecentInvestigation } from '../data/mockData';

// ------------------------------------------------------------ wire types ---
export type Lifecycle = 'open' | 'investigating' | 'on_hold' | 'resolved';

export interface ApiRecentRow {
  id: string;
  input: string;
  type: string;
  result: string;
  risk: number;
  status: 'Malicious' | 'Suspicious' | 'Clean';
  created_at: string;
}

interface ApiInvestigationRow extends ApiRecentRow {
  lifecycle: Lifecycle;
  assigned_to: string | null;
  sample: boolean;
}

interface ApiInvestigationPage {
  items: ApiInvestigationRow[];
  page: number;
  page_size: number;
  total: number;
}

export interface ApiStep {
  name: string;
  status: string;
  detail: string;
}

interface ApiInvestigationDetail {
  id: string;
  input: string;
  type: string;
  depth: string;
  lifecycle: Lifecycle;
  assigned_to: string | null;
  risk: { score: number; severity: string; label: string };
  classification: { label: string; pct: number }[];
  findings: string[];
  summary: { text: string; source: 'rules' | 'ai' };
  related: { entity: string; type: string; risk: string; link: 'verified' | 'inferred'; entity_id: number | null }[];
  actions: { key: string; label: string; detail: string }[];
  notes: { id: number; author: string | null; text: string; created_at: string }[];
  evidence_count: number;
  steps: ApiStep[];
  method: string;
  campaign_id: number | null;
  created_at: string | null;
  sample: boolean;
}

export interface ApiBrand {
  id: number;
  name: string;
}

export interface EvidenceItem {
  id: number;
  kind: string;
  filename: string;
  sha256: string;
  size: number;
  captured_at: string;
}

// ------------------------------------------------------------ view models ---
/** The dashboard/investigate table row: the sample shape plus the real case id. */
export interface RecentCase extends RecentInvestigation {
  caseId: string;
  lifecycle?: Lifecycle;
}

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';

export interface InvestigationView {
  caseId: string;
  target: string;
  type: string;
  mode: string;
  assignedTo: string;
  lifecycle: Lifecycle;
  riskScore: number;
  severity: Severity;
  riskLabel: string;
  classifications: { label: string; percentage: number }[];
  keyFindings: string[];
  evidenceCount: number;
  summary: string;
  summarySource: 'rules' | 'ai' | null;
  method: string;
  relatedEntities: { entity: string; type: string; risk: Severity; link: 'Verified' | 'Inferred' }[];
  actions: { key: string; title: string; desc: string }[];
  notes: { id: number; author: string; text: string; createdAt: string }[];
}

export interface CaseList {
  items: RecentCase[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SubmitInput {
  type: string;
  value: string;
  depth: 'quick' | 'deep';
  brandId?: number;
  file?: File | null;
}

export interface SubmitResult {
  id: string;
  steps: ApiStep[];
  status: string;
}

// --------------------------------------------------------------- adapters ---
function asSeverity(s: string): Severity {
  const t = titleCase(s.toLowerCase());
  return t === 'Critical' || t === 'High' || t === 'Medium' ? t : 'Low';
}

export function adaptRecent(items: ApiRecentRow[], offset = 0): RecentCase[] {
  return items.map((r, i) => ({
    id: offset + i + 1,
    caseId: r.id,
    input: r.input,
    type: r.type,
    result: r.result,
    riskScore: r.risk,
    status: r.status,
    dateTime: fmtDateTime(r.created_at)
  }));
}

function adaptDetail(d: ApiInvestigationDetail): InvestigationView {
  return {
    caseId: d.id,
    target: d.input,
    type: d.type,
    mode: d.depth === 'deep' ? 'Deep investigation' : 'Quick scan',
    assignedTo: d.assigned_to ?? '',
    lifecycle: d.lifecycle,
    riskScore: Math.round(d.risk.score),
    severity: asSeverity(d.risk.severity),
    riskLabel: d.risk.label,
    classifications: d.classification.map((c) => ({ label: c.label, percentage: c.pct })),
    keyFindings: d.findings,
    evidenceCount: d.evidence_count,
    summary: d.summary.text,
    summarySource: d.summary.source,
    method: d.method,
    relatedEntities: d.related.map((r) => ({
      entity: r.entity,
      type: r.type,
      risk: asSeverity(r.risk),
      link: r.link === 'verified' ? 'Verified' : 'Inferred'
    })),
    actions: d.actions.map((a) => ({ key: a.key, title: a.label, desc: a.detail })),
    notes: d.notes.map((n) => ({ id: n.id, author: n.author ?? '', text: n.text, createdAt: n.created_at }))
  };
}

const SAMPLE_CASES: CaseList = {
  items: RECENT_INVESTIGATIONS.map((r) => ({ ...r, caseId: '' })),
  total: RECENT_INVESTIGATIONS.length,
  page: 1,
  pageSize: 20
};

const SAMPLE_DETAIL: InvestigationView = {
  caseId: INVESTIGATION_DETAIL.caseId,
  target: INVESTIGATION_DETAIL.target,
  type: INVESTIGATION_DETAIL.type,
  mode: INVESTIGATION_DETAIL.mode,
  assignedTo: INVESTIGATION_DETAIL.assignedTo,
  lifecycle: 'investigating',
  riskScore: INVESTIGATION_DETAIL.riskScore,
  severity: INVESTIGATION_DETAIL.severity,
  riskLabel: 'High Risk',
  classifications: INVESTIGATION_DETAIL.classifications,
  keyFindings: INVESTIGATION_DETAIL.keyFindings,
  evidenceCount: INVESTIGATION_DETAIL.evidenceCount,
  summary: INVESTIGATION_DETAIL.summary,
  summarySource: null,
  method: '',
  relatedEntities: INVESTIGATION_DETAIL.relatedEntities.map((r) => ({ ...r, risk: asSeverity(r.risk), link: r.link === 'Verified' ? ('Verified' as const) : ('Inferred' as const) })),
  actions: INVESTIGATION_DETAIL.actions.map((a, i) => ({
    key: ['block_report', 'monitor', 'verify', 'escalate'][i] ?? a.title,
    title: a.title,
    desc: a.desc
  })),
  notes: []
};

// ------------------------------------------------------------------ calls ---
const WATCH_KIND: Record<string, 'domain' | 'profile' | 'phone' | 'payment'> = {
  domain: 'domain',
  url: 'domain',
  website: 'domain',
  profile: 'profile',
  'social profile': 'profile',
  phone: 'phone',
  'phone number': 'phone',
  payment: 'payment',
  wallet: 'payment',
  identifier: 'payment'
};

export const investigationsApi = {
  async listBrands(): Promise<ApiBrand[]> {
    return request<ApiBrand[]>('/api/brands', { fallback: [{ id: 1, name: 'Acme Bank' }] });
  },

  async listInvestigations(opts: { page?: number; q?: string; status?: Lifecycle | '' } = {}): Promise<CaseList> {
    const page = opts.page ?? 1;
    const qs = new URLSearchParams({ page: String(page) });
    if (opts.q) qs.set('q', opts.q);
    if (opts.status) qs.set('status', opts.status);
    return withSample(async () => {
      const r = await request<ApiInvestigationPage>(`/api/investigations?${qs.toString()}`);
      return {
        items: adaptRecent(r.items, (r.page - 1) * r.page_size).map((c, i) => ({ ...c, lifecycle: r.items[i].lifecycle })),
        total: r.total,
        page: r.page,
        pageSize: r.page_size
      };
    }, SAMPLE_CASES);
  },

  /** Case detail. With no id, the most recent case; null if there are no cases yet. */
  async getInvestigation(id?: string | null): Promise<InvestigationView | null> {
    return withSample(async () => {
      let caseId = id;
      if (!caseId) {
        const list = await request<ApiInvestigationPage>('/api/investigations?page=1');
        if (!list.items.length) return null;
        caseId = list.items[0].id;
      }
      return adaptDetail(await request<ApiInvestigationDetail>(`/api/investigations/${encodeURIComponent(caseId)}`));
    }, SAMPLE_DETAIL);
  },

  async submitInvestigation(input: SubmitInput): Promise<SubmitResult> {
    const brand = input.brandId ?? (await brandId());
    if (input.file) {
      const form = new FormData();
      form.set('type', input.type);
      form.set('value', input.value);
      form.set('depth', input.depth);
      form.set('brand_id', String(brand));
      form.set('file', input.file);
      return request<SubmitResult>('/api/investigations', { method: 'POST', form });
    }
    return request<SubmitResult>('/api/investigations', {
      method: 'POST',
      json: { type: input.type, value: input.value, depth: input.depth, brand_id: brand }
    });
  },

  async setCaseStatus(id: string, status: Lifecycle): Promise<void> {
    await request(`/api/investigations/${encodeURIComponent(id)}`, { method: 'PATCH', json: { status } });
  },

  /** Assign the case to the signed-in user (the API assigns by user id). Returns the name. */
  async assignToMe(id: string): Promise<string> {
    const me = session.user();
    if (!me) throw new Error('Sign in to assign cases.');
    await request(`/api/investigations/${encodeURIComponent(id)}`, { method: 'PATCH', json: { assigned_to: me.id } });
    return me.name;
  },

  async addNote(id: string, text: string): Promise<void> {
    await request(`/api/investigations/${encodeURIComponent(id)}/notes`, { method: 'POST', json: { text } });
  },

  async listEvidence(id: string): Promise<EvidenceItem[]> {
    return request<EvidenceItem[]>(`/api/evidence?case=${encodeURIComponent(id)}`, { fallback: [] });
  },

  async uploadEvidence(id: string, file: File, kind = 'file'): Promise<void> {
    const form = new FormData();
    form.set('file', file);
    form.set('case', id);
    form.set('kind', kind);
    await request('/api/evidence', { method: 'POST', form });
  },

  async monitorCase(view: Pick<InvestigationView, 'target' | 'type'>): Promise<void> {
    const kind = WATCH_KIND[view.type.toLowerCase()] ?? 'domain';
    await request('/api/watchlist', { method: 'POST', json: { kind, value: view.target } });
  },

  /** Creates a DRAFT dossier; it still has to be approved in Reports. */
  async draftReport(id: string): Promise<void> {
    await request('/api/reports', { method: 'POST', json: { investigation_id: id, format: 'pdf' } });
  }
};
