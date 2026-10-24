// Details a person types in several Studio tools (brand name, industry, audience, ...) are remembered, per account, in this
// browser. The same field is shared by every tool that has it, so it is typed once and survives a reload.
import { useCallback, useSyncExternalStore } from 'react';
import { session } from './session';

export type ProfileField = 'brandName' | 'industry' | 'audience' | 'description' | 'personality' | 'style' | 'mood';
type Profile = Partial<Record<ProfileField, string>>;

const listeners = new Set<() => void>();
let cache: { key: string; value: Profile } | null = null;

function storageKey(): string {
  return `brandshield.studio.profile.${session.user()?.id ?? 'anon'}`;
}

function load(): Profile {
  const key = storageKey();
  if (cache && cache.key === key) return cache.value;
  let value: Profile = {};
  try {
    const raw = localStorage.getItem(key);
    if (raw) value = JSON.parse(raw) as Profile;
  } catch {
    /* storage unavailable or corrupt: start empty */
  }
  cache = { key, value };
  return value;
}

export function getRemembered(field: ProfileField): string {
  return load()[field] ?? '';
}

export function setRemembered(field: ProfileField, value: string): void {
  const key = storageKey();
  const next = { ...load(), [field]: value };
  cache = { key, value: next };
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* ignore: the value still lives in memory for this page */
  }
  listeners.forEach((l) => l());
}

export function clearRemembered(): void {
  cache = { key: storageKey(), value: {} };
  try {
    localStorage.removeItem(storageKey());
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Like useState(''), but remembered across tools and reloads. `fallback` shows while nothing has been remembered yet. */
export function useRemembered(field: ProfileField, fallback = ''): [string, (v: string) => void] {
  const value = useSyncExternalStore(subscribe, () => load()[field], () => undefined);
  const set = useCallback((v: string) => setRemembered(field, v), [field]);
  return [value ?? fallback, set];
}
