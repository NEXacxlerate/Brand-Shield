// Last answer of every page request, kept for the whole browser session (not per component).
// A page that is opened again shows this at once and refreshes it in the background (stale-while-revalidate), so moving between
// pages no longer shows a loading screen. Cleared when the session ends (sign-out, expired login) so nobody sees another user's data.
const MAX_ENTRIES = 150;
const entries = new Map<string, unknown>();

export function cacheGet<T>(key: string): T | undefined {
  return entries.get(key) as T | undefined;
}

export function cacheHas(key: string): boolean {
  return entries.has(key);
}

export function cacheSet(key: string, value: unknown) {
  if (value === null || value === undefined) {
    entries.delete(key);
    return;
  }
  if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
  entries.set(key, value);
}

export function clearQueryCache() {
  entries.clear();
}
