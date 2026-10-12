// Campaign-level API: Threat Graph, Threat Evolution, Scam DNA. Each call adapts the server response to the view-model shapes the
// pages already render (see src/data/advancedData.ts) and falls back to that bundled sample data only when the server is unreachable.
import { request } from './client';
import { withSample, titleCase } from './common';
import type { CampaignBrief } from './common';
import { THREAT_GRAPH_DATA, THREAT_EVOLUTION_DATA, SCAM_DNA_DATA } from '../data/advancedData';

/** Download any JSON-serialisable value as a file, client-side. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------------ list ---
const SAMPLE_CAMPAIGNS: CampaignBrief[] = [
  { id: 1, label: 'Campaign C-1', name: 'Refund scam', size: 10, risk: 96, severity: 'critical', hypothesis: { label: 'Refund scam', match: 0.48 } },
  { id: 9, label: 'Campaign C-9', name: 'KYC phishing', size: 4, risk: 87, severity: 'critical', hypothesis: { label: 'KYC phishing', match: 0.3 } }
];

// ----------------------------------------------------------------- graph ---
export type GraphNodeType = 'identifier' | 'website' | 'social' | 'app' | 'ghost' | string;

export interface GraphNodeVM {
  id: string;
  label: string;
  type: GraphNodeType;
  risk: string;
  x: number;
  y: number;
  entityId?: number | null;
}

export interface GraphEdgeVM {
  from: string;
  to: string;
  dashed?: boolean;
  attackPath?: boolean;
}

/** Same shape as THREAT_GRAPH_DATA (the part EntityGraph draws). */
export interface GraphDrawVM {
  brandNode: { id: string; label: string; type: string; x: number; y: number };
  nodes: GraphNodeVM[];
  edges: GraphEdgeVM[];
}

export interface GraphVM extends GraphDrawVM {
  attackSteps: { step: number; name: string; detail: string; sub: string; current?: boolean }[];
  linksTable: { type: string; value: string; count: number }[];
  campaignId: number | null;
}

interface GraphApi {
  nodes: {
    id: string;
    kind: string;
    label: string;
    severity: string;
    x: number;
    y: number;
    predicted: boolean;
    sub: string;
    entity_id: number | null;
    score: number | null;
  }[];
  edges: { source: string; target: string; kind: string; predicted: boolean }[];
  attack_path: { stage: string; title: string; ids: number[]; detail: string }[];
  shared: { kind: string; value: string; label: string; display: string; count: number; ids: number[] }[];
  campaign_id: number;
}

function adaptGraph(g: GraphApi): GraphVM {
  const brand = g.nodes.find((n) => n.kind === 'brand');
  const brandKey = brand?.id ?? 'brand';
  const key = (id: string) => (id === brandKey ? 'brand' : id);
  const pathIds = new Set<number>();
  g.attack_path.forEach((s) => s.ids.forEach((i) => pathIds.add(i)));
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const onPath = (id: string) => {
    const n = byId.get(id);
    return !!n && !n.predicted && n.entity_id != null && pathIds.has(n.entity_id);
  };

  const nodes: GraphNodeVM[] = g.nodes
    .filter((n) => n.kind !== 'brand')
    .map((n) => ({
      id: n.id,
      label: n.label,
      type: n.predicted ? 'ghost' : n.kind,
      risk: n.severity,
      x: n.x,
      y: n.y,
      entityId: n.entity_id
    }));
  const edges: GraphEdgeVM[] = g.edges.map((e) => ({
    from: key(e.source),
    to: key(e.target),
    dashed: e.kind === 'impersonates' || e.kind === 'predicted' || e.predicted,
    attackPath: onPath(e.source) && onPath(e.target)
  }));

  const steps = g.attack_path;
  let currentIdx = steps.findIndex((s) => s.stage === 'Payment');
  if (currentIdx < 0) {
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].stage !== 'Victim') {
        currentIdx = i;
        break;
      }
    }
  }
  return {
    brandNode: { id: 'brand', label: brand?.label ?? 'Brand', type: 'brand', x: brand?.x ?? 450, y: brand?.y ?? 55 },
    nodes,
    edges,
    attackSteps: steps.map((s, i) => ({ step: i + 1, name: s.stage, detail: s.title, sub: s.detail, current: i === currentIdx })),
    linksTable: g.shared.map((s) => ({ type: s.label, value: s.display, count: s.count })),
    campaignId: g.campaign_id
  };
}

const SAMPLE_GRAPH: GraphVM = {
  brandNode: THREAT_GRAPH_DATA.brandNode,
  nodes: THREAT_GRAPH_DATA.nodes.map((n) => ({ ...n })),
  // sample edges name the brand 'acme-bank'; the drawing code looks the brand up by brandNode.id
  edges: THREAT_GRAPH_DATA.edges.map((e) => ({ ...e })),
  attackSteps: THREAT_GRAPH_DATA.attackSteps.map((s) => ({ ...s })),
  linksTable: THREAT_GRAPH_DATA.linksTable.map((l) => ({ ...l })),
  campaignId: null
};

// --------------------------------------------------------- selected entity ---
export interface EntityInfoVM {
  risk: number | null;
  severity: string;
  type: string;
  registered: string;
  nameMatch: string;
  asksFor: string;
  linked: number | null;
}

interface EntityDetailApi {
  entity: { score: number; severity: string; type: string; platform: string; age_days: number; data: Record<string, unknown> };
  signals: { name: string; label: string; strength: number; reason: string }[];
  campaign: { size: number } | null;
}

const TYPE_LABEL: Record<string, string> = { website: 'Website', social: 'Social profile', app: 'Mobile app', identifier: 'Shared identifier' };

function adaptEntity(d: EntityDetailApi): EntityInfoVM {
  const sig = (name: string) => d.signals.find((s) => s.name === name);
  const regDays = d.entity.data?.registered_days_ago;
  const name = sig('name_similarity');
  const asks = sig('credential_capture') ?? sig('risky_permissions') ?? sig('scam_language');
  return {
    risk: Math.round(d.entity.score),
    severity: d.entity.severity,
    type: TYPE_LABEL[d.entity.type] ?? titleCase(d.entity.type),
    registered:
      typeof regDays === 'number' ? `${Math.round(regDays)} days ago` : `First seen ${Math.round(d.entity.age_days)} days ago`,
    nameMatch: name && name.strength > 0 ? name.reason : 'No strong match',
    asksFor: asks && asks.strength > 0 ? asks.reason : 'Nothing flagged',
    linked: d.campaign ? Math.max(0, d.campaign.size - 1) : null
  };
}

// ------------------------------------------------------------- evolution ---
const STAGE_STYLE: Record<string, { color: string; desc: string }> = {
  Normal: { color: '#34D399', desc: 'Looks normal' },
  Anomaly: { color: '#5AA9FF', desc: 'Slightly unusual' },
  Suspicious: { color: '#F5C542', desc: 'Several signals' },
  Impersonation: { color: '#FF9A4D', desc: 'Strong resemblance' },
  Campaign: { color: '#FF5C5C', desc: 'Linked to others' },
  'Active scam': { color: '#FF5C5C', desc: 'Money or data asked' }
};

export interface EvolutionVM {
  stages: { name: string; count: number; color: string; desc: string }[];
  growthTimeline: { day: string; observed?: number; forecast?: number; lower?: number; upper?: number }[];
  /** Index of "today" in growthTimeline (where the observed line ends and the forecast starts). */
  splitIndex: number;
  stageChanges: { entity: string; from: string; to: string; when: string }[];
  timeline: { time: string; title: string; desc: string }[];
  forecast: { next7: number; recent: number; previous: number; trend: string; basis: string };
  campaignId: number | null;
}

interface EvolutionApi {
  stages: { name: string; count: number }[];
  growth: {
    days: number[];
    labels: string[];
    observed: (number | null)[];
    forecast: (number | null)[];
    band: ([number, number] | null)[];
  };
  forecast: { next7: number; recent: number; previous: number; trend: string; basis: string };
  stage_changes: { entity: string; from: string; to: string; when: string }[];
  timeline: { days_ago: number; time: string; title: string; desc: string }[];
  campaign_id: number;
}

const opt = (v: number | null | undefined) => (v === null || v === undefined ? undefined : v);

function adaptEvolution(e: EvolutionApi): EvolutionVM {
  const g = e.growth;
  return {
    stages: e.stages.map((s) => ({ name: s.name, count: s.count, ...(STAGE_STYLE[s.name] ?? { color: '#8B8B98', desc: '' }) })),
    growthTimeline: g.labels.map((label, i) => ({
      day: label,
      observed: opt(g.observed[i]),
      forecast: opt(g.forecast[i]),
      lower: opt(g.band[i]?.[0]),
      upper: opt(g.band[i]?.[1])
    })),
    splitIndex: Math.max(0, g.days.indexOf(0)),
    stageChanges: e.stage_changes.map((c) => ({ entity: c.entity, from: c.from, to: c.to, when: c.when })),
    timeline: [...e.timeline].sort((a, b) => a.days_ago - b.days_ago).map((t) => ({ time: t.time, title: t.title, desc: t.desc })),
    forecast: e.forecast,
    campaignId: e.campaign_id
  };
}

const SAMPLE_EVOLUTION: EvolutionVM = {
  ...THREAT_EVOLUTION_DATA,
  splitIndex: 6,
  forecast: {
    next7: 8,
    recent: 8,
    previous: 2,
    trend: 'accelerating',
    basis: 'The forecast assumes the last 7 days’ pace repeats.'
  },
  campaignId: null
};

// ------------------------------------------------------------------- DNA ---
// Typical benign baseline (illustrative): a fixed neutral 0.5 on every axis, drawn only for visual contrast.
const BENIGN_BASELINE = 0.5;

export interface DnaVM {
  radarAxes: { axis: string; current: number; baseline: number }[];
  reasons: { name: string; strength: 'Strong' | 'Medium'; percent: number; note: string }[];
  closestCampaigns: { playbook: string; wording: string; similarity: string; risk: string }[];
  learningLoop: string[];
  sideBySide: { knownLabel: string; caseLabel: string; known: string; case: string; tokens: string[] };
  map: { x: number; y: number; cluster: string; label: string; kind: string; current: boolean }[];
  note: string;
  campaignId: number | null;
}

interface DnaApi {
  families: { name: string; strength: number; label: 'Strong' | 'Medium' | 'Weak'; evidence: string }[];
  closest: { playbook: string; similarity: number; risk: string; traits: string[] }[];
  side_by_side: { known: string; case: string; shared_tokens: string[]; case_label: string; known_label: string | null };
  map: { x: number; y: number; cluster: string; label: string; kind: string; current: boolean }[];
  note: string;
  campaign_id: number;
}

function adaptDna(d: DnaApi): DnaVM {
  return {
    radarAxes: d.families.map((f) => ({ axis: f.name, current: f.strength, baseline: BENIGN_BASELINE })),
    reasons: d.families.map((f) => ({
      name: f.name,
      strength: f.label === 'Strong' ? 'Strong' : 'Medium',
      percent: Math.round(f.strength * 100),
      note: f.evidence
    })),
    closestCampaigns: d.closest.map((c) => ({
      playbook: c.playbook,
      wording: c.traits.length ? c.traits.join(', ') : 'Text comparison',
      similarity: `${Math.round(c.similarity * 100)}%`,
      risk: titleCase(c.risk)
    })),
    learningLoop: [...SCAM_DNA_DATA.learningLoop],
    sideBySide: {
      knownLabel: d.side_by_side.known_label || 'Known playbook',
      caseLabel: d.side_by_side.case_label || `Case C-${d.campaign_id}`,
      known: d.side_by_side.known,
      case: d.side_by_side.case,
      tokens: d.side_by_side.shared_tokens
    },
    map: d.map,
    note: d.note,
    campaignId: d.campaign_id
  };
}

const SAMPLE_DNA: DnaVM = {
  radarAxes: SCAM_DNA_DATA.radarAxes,
  reasons: SCAM_DNA_DATA.reasons.map((r) => ({ ...r, strength: r.strength === 'Strong' ? 'Strong' : 'Medium' })),
  closestCampaigns: SCAM_DNA_DATA.closestCampaigns,
  learningLoop: SCAM_DNA_DATA.learningLoop,
  sideBySide: {
    knownLabel: 'Known playbook',
    caseLabel: '@acme_refund_help bio',
    known: SCAM_DNA_DATA.sideBySide.playbook,
    case: SCAM_DNA_DATA.sideBySide.actual,
    tokens: ['DM us for your refund', 'verification fee', 'screenshot of the payment', 'acmerefund@okaxis']
  },
  map: [
    { x: 0.158, y: 0.25, cluster: 'Refund scams', label: 'Refund scam playbook', kind: 'playbook', current: false },
    { x: 0.5, y: 0.75, cluster: 'KYC phishing', label: 'KYC phishing playbook', kind: 'playbook', current: false },
    { x: 0.842, y: 0.25, cluster: 'Fake giveaways', label: 'Fake giveaway playbook', kind: 'playbook', current: false },
    { x: 0.789, y: 0.833, cluster: 'Fake care numbers', label: 'Fake care number playbook', kind: 'playbook', current: false },
    { x: 0.171, y: 0.267, cluster: 'Refund scams', label: 'Case', kind: 'campaign', current: true }
  ],
  note: 'Similarity is a text comparison, not a probability that the case is that scam.',
  campaignId: null
};

// ------------------------------------------------------------------- api ---
export const campaignsApi = {
  listCampaigns: (brand: number): Promise<CampaignBrief[]> =>
    request<CampaignBrief[]>(`/api/campaigns?brand_id=${brand}`, { fallback: SAMPLE_CAMPAIGNS }),

  getCampaignDetail: (id: number) =>
    request<{ id: number; counts: Record<string, number>; label: string; name: string }>(`/api/campaigns/${id}`),

  getThreatGraph: (id: number): Promise<GraphVM> =>
    withSample(async () => adaptGraph(await request<GraphApi>(`/api/campaigns/${id}/graph`)), SAMPLE_GRAPH),

  getEntityInfo: async (entityId: number): Promise<EntityInfoVM> =>
    adaptEntity(await request<EntityDetailApi>(`/api/entities/${entityId}`)),

  getThreatEvolution: (id: number): Promise<EvolutionVM> =>
    withSample(async () => adaptEvolution(await request<EvolutionApi>(`/api/campaigns/${id}/evolution`)), SAMPLE_EVOLUTION),

  getScamDna: (id: number): Promise<DnaVM> =>
    withSample(async () => adaptDna(await request<DnaApi>(`/api/campaigns/${id}/dna`)), SAMPLE_DNA),

  confirmCampaign: (id: number) =>
    request<{ ok: boolean; campaign_id: number; learned: number; campaigns: number }>(`/api/campaigns/${id}/confirm`, { method: 'POST' }),

  createDossier: (campaignId: number) =>
    request<{ id: number; code: string }>('/api/reports', { method: 'POST', json: { campaign_id: campaignId, format: 'pdf' } })
};
