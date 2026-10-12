// The single brand of the workspace, shared by the sidebar, the setup wizard and the pages that need its id.
// Loaded from GET /api/me (default_brand_id) then GET /api/brands/{id}. Pages call `refreshBrand()` after changing it.
import { useEffect, useSyncExternalStore } from 'react';
import { ApiError, session } from '../api/client';
import { sm } from '../api/sm';
import type { Brand } from '../api/types';

export interface BrandState {
  brand: Brand | null;
  /** True until the first answer arrives. */
  loading: boolean;
  /** The workspace has no brand yet (the API said so). */
  missing: boolean;
  error: ApiError | null;
}

let state: BrandState = { brand: null, loading: true, missing: false, error: null };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function emit(next: BrandState) {
  state = next;
  listeners.forEach((l) => l());
}

export function brandSnapshot(): BrandState {
  return state;
}

/** Test helper: forget everything (sign-out and unit tests). */
export function resetBrand() {
  inflight = null;
  emit({ brand: null, loading: true, missing: false, error: null });
}

/** (Re)load the brand. Concurrent calls share one request. */
export function refreshBrand(): Promise<void> {
  if (!session.isAuthenticated()) return Promise.resolve();
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const me = await sm.me();
      session.saveUser(me);
      if (me.default_brand_id == null) {
        emit({ brand: null, loading: false, missing: true, error: null });
        return;
      }
      const brand = await sm.brand(me.default_brand_id);
      emit({ brand, loading: false, missing: false, error: null });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, 'Something went wrong');
      if (err.status === 404) emit({ brand: null, loading: false, missing: true, error: null });
      else emit({ brand: state.brand, loading: false, missing: false, error: err });
    }
  })().finally(() => {
    inflight = null;
  });
  inflight = p;
  return p;
}

/** Replace the cached brand with a fresher copy returned by a mutation. */
export function setBrandCache(brand: Brand) {
  emit({ brand, loading: false, missing: false, error: null });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useBrand(): BrandState & { reload: () => Promise<void> } {
  const s = useSyncExternalStore(subscribe, brandSnapshot, brandSnapshot);
  useEffect(() => {
    if (s.loading && !inflight) void refreshBrand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { ...s, reload: refreshBrand };
}
