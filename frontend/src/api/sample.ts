// Global "is the data I am looking at sample data?" flag. It is derived from the API itself, never guessed:
// any JSON answer with a boolean `is_sample`, or a `data_mode` / `effective_data_mode` / `effective_mode` of "sample" or "live".
import { useSyncExternalStore } from 'react';
import { onResponse } from './client';

let sample = false;
const listeners = new Set<() => void>();

function set(v: boolean) {
  if (sample !== v) {
    sample = v;
    listeners.forEach((l) => l());
  }
}

/** Exported for tests and for pages that know the answer first-hand. */
export function noteSampleFlag(body: unknown): void {
  if (!body || typeof body !== 'object') return;
  const b = body as Record<string, unknown>;
  if (typeof b.is_sample === 'boolean') {
    set(b.is_sample);
    return;
  }
  for (const key of ['effective_data_mode', 'effective_mode', 'data_mode']) {
    const v = b[key];
    if (v === 'sample') return set(true);
    if (v === 'live') return set(false);
  }
}

onResponse((_path, body) => noteSampleFlag(body));

export function isSampleNow(): boolean {
  return sample;
}

export function resetSampleFlag(): void {
  set(false);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useIsSample(): boolean {
  return useSyncExternalStore(subscribe, () => sample, () => false);
}
