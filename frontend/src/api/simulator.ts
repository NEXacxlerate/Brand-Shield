// Threat Simulator API: read-only what-if projection (nothing is written; any role may run it).
import { request } from './client';
import { withSample } from './common';
import { SIMULATOR_DATA } from '../data/advancedData';

export interface SimParams {
  campaignId: number;
  horizonDays: 7 | 14 | 30;
  assumption: 'repeat' | 'accelerate' | 'slow';
  actions: string[];
  assumedDropPct: number;
}

export interface SimCounts {
  profiles: number;
  websites: number;
  apps: number;
}

export interface SimVM {
  observed: number[];
  doNothing: number[];
  actToday: number[];
  comparison: { now: SimCounts; doNothing: SimCounts; actToday: SimCounts };
  method: string;
  assumptionNote: string;
  isEstimate: boolean;
  /** Offline sample data (not from the server). */
  sample: boolean;
}

interface SimApi {
  observed: number[];
  baseline: number[];
  acted: number[];
  now: number;
  no_action: number;
  if_act: number;
  method: string;
  assumption_note: string;
  is_estimate: boolean;
}

/** Split `total` across the type mix proportionally (largest remainder), so the parts add up to the total exactly. */
function split(total: number, mix: [number, number, number]): SimCounts {
  const t = Math.max(0, Math.round(total));
  const sum = mix[0] + mix[1] + mix[2];
  if (sum <= 0) return { profiles: t, websites: 0, apps: 0 };
  const raw = mix.map((m) => (m / sum) * t);
  const parts = raw.map(Math.floor);
  let left = t - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f);
  for (let k = 0; left > 0; k = (k + 1) % 3, left--) parts[order[k].i]++;
  return { profiles: parts[0], websites: parts[1], apps: parts[2] };
}

const SAMPLE: SimVM = {
  observed: SIMULATOR_DATA.observed,
  doNothing: SIMULATOR_DATA.doNothing,
  actToday: SIMULATOR_DATA.actToday,
  comparison: SIMULATOR_DATA.comparison,
  method: 'Sample data: the server could not be reached, so no projection was calculated.',
  assumptionNote: 'These numbers are bundled samples, an estimate for illustration only.',
  isEstimate: true,
  sample: true
};

export const simulatorApi = {
  runSimulation: (p: SimParams): Promise<SimVM> =>
    withSample(async () => {
      const [sim, camp] = await Promise.all([
        request<SimApi>('/api/simulator', {
          method: 'POST',
          json: {
            campaign_id: p.campaignId,
            horizon_days: p.horizonDays,
            assumption: p.assumption,
            actions: p.actions,
            assumed_drop_pct: p.assumedDropPct
          }
        }),
        request<{ counts: Record<string, number> }>(`/api/campaigns/${p.campaignId}`)
      ]);
      const mix: [number, number, number] = [camp.counts.social ?? 0, camp.counts.website ?? 0, camp.counts.app ?? 0];
      return {
        observed: sim.observed,
        doNothing: sim.baseline,
        actToday: sim.acted,
        comparison: { now: split(sim.now, mix), doNothing: split(sim.no_action, mix), actToday: split(sim.if_act, mix) },
        method: sim.method,
        assumptionNote: sim.assumption_note,
        isEstimate: sim.is_estimate,
        sample: false
      };
    }, SAMPLE)
};
