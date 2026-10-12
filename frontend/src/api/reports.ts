// Reports API: list, create, preview, approve (human approval only), download.
import { request, downloadFile } from './client';
import { fmtDate, withSample } from './common';
import { REPORTS_DATA } from '../data/advancedData';

export interface ReportRow {
  /** Report code, e.g. REP-2026-001 (what the table shows). */
  id: string;
  /** Numeric id for API calls (0 for bundled sample rows). */
  numId: number;
  title: string;
  scope: string;
  status: 'Draft' | 'Ready' | 'Approved';
  format: 'PDF' | 'JSON';
  date: string;
  approvedBy: string | null;
  approvedAt: string | null;
  isSample: boolean;
}

interface ReportOut {
  id: number;
  code: string;
  title: string;
  scope: string;
  status: 'draft' | 'ready' | 'approved';
  format: 'pdf' | 'json';
  campaign_id: number | null;
  investigation_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  sample: boolean;
}

interface ApproveOut {
  ok: boolean;
  report: ReportOut;
  marked_reported: number[];
}

const SAMPLE_ROWS: ReportRow[] = REPORTS_DATA.map((r) => ({
  ...r,
  numId: 0,
  status: r.status as ReportRow['status'],
  format: r.format as ReportRow['format'],
  approvedBy: null,
  approvedAt: null,
  isSample: true
}));

function adapt(r: ReportOut): ReportRow {
  return {
    id: r.code,
    numId: r.id,
    title: r.title,
    scope: r.campaign_id ? `Campaign C-${r.campaign_id}` : r.investigation_id ?? r.scope,
    status: (r.status.charAt(0).toUpperCase() + r.status.slice(1)) as ReportRow['status'],
    format: r.format === 'pdf' ? 'PDF' : 'JSON',
    date: fmtDate(r.created_at),
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    isSample: r.sample
  };
}

export const reportsApi = {
  getReports(): Promise<ReportRow[]> {
    return withSample(async () => (await request<ReportOut[]>('/api/reports')).map(adapt), SAMPLE_ROWS);
  },
  async createReport(body: {
    campaign_id?: number;
    investigation_id?: string;
    format: 'pdf' | 'json';
    scope?: string;
  }): Promise<ReportRow> {
    return adapt(await request<ReportOut>('/api/reports', { method: 'POST', json: { scope: 'all', ...body } }));
  },
  getReportPreview(id: number): Promise<string> {
    return request<string>(`/api/reports/${id}/preview`, { text: true });
  },
  async approveReport(id: number, scope = 'all'): Promise<{ report: ReportRow; marked: number }> {
    const r = await request<ApproveOut>(`/api/reports/${id}/approve`, { method: 'POST', json: { scope } });
    return { report: adapt(r.report), marked: r.marked_reported.length };
  },
  downloadReport(r: ReportRow): Promise<void> {
    return downloadFile(`/api/reports/${r.numId}/download`, `${r.id}.${r.format.toLowerCase()}`);
  }
};
