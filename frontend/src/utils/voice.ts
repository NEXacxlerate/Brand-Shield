// Voice agent helpers that do not need React: the page list the agent may open, collecting the fields of the current page,
// filling React-controlled inputs, and turning spoken emails / phone numbers into written ones.

export interface VoiceRoute {
  path: string;
  spoken_names: string[];
}

export type VoiceAction =
  | { type: 'navigate'; path: string }
  | { type: 'scroll'; direction: 'up' | 'down' | 'top' | 'bottom' }
  | { type: 'click'; id: string; label?: string }
  | { type: 'select'; id: string; option: string; label?: string }
  | { type: 'fill'; id: string; value: string; label?: string }
  | { type: 'toggle'; id: string; on?: boolean; label?: string }
  | { type: 'wait'; ms: number }
  | { type: 'find'; query: string; etype?: string }
  | { type: 'back' }
  | { type: 'close' }
  | { type: 'highlight' };

/** A question the agent is waiting on; sent back with the next utterance, which is then treated as its answer. */
export interface VoiceAsk {
  kind: 'confirm' | 'choose_option' | 'provide_value';
  question: string;
  options?: string[];
  field_id?: string | null;
  guided?: boolean;
  skipped?: string[];
  follow_up?: boolean;
  then?: VoiceAction[];
}

/** One visible interactive element, with short keys (i id, t type, l label, n field name, v value, r required, d disabled, e error, o options, c checked). */
export interface SnapshotEl {
  i: string;
  t: string;
  l: string;
  n?: string;
  v?: string;
  r?: 1;
  d?: 1;
  e?: string;
  o?: string[];
  c?: boolean;
  /** Off-screen (in the DOM but outside the viewport). */
  off?: 1;
}

export interface VoiceRequest {
  text: string;
  route: string;
  title: string;
  routes: VoiceRoute[];
  snapshot: SnapshotEl[];
  done_steps: Record<string, string>[];
  pending: VoiceAsk | null;
  last_turns: { r: string; t: string }[];
  last_fill: { i: string; l: string; prev: string; v: string } | null;
}

export interface VoiceResponse {
  actions: VoiceAction[];
  reply: string;
  ask: VoiceAsk | null;
  finish: boolean;
  cancel_pending: boolean;
  source?: string;
}

/** Every page the voice agent may open (the server keeps its own allowlist too). */
const ADMIN_ONLY = new Set(['/sources', '/settings', '/evaluation']);

const ALL_ROUTES: VoiceRoute[] = [
  { path: '/dashboard', spoken_names: ['dashboard', 'overview', 'home'] },
  { path: '/brand', spoken_names: ['brand registry', 'brand profile', 'brand'] },
  { path: '/social', spoken_names: ['social threats', 'social media', 'social monitoring'] },
  { path: '/apps', spoken_names: ['app threats', 'apps', 'app store monitoring'] },
  { path: '/web', spoken_names: ['web threats', 'websites', 'domains'] },
  { path: '/investigations', spoken_names: ['investigations', 'cases'] },
  { path: '/lookalike', spoken_names: ['look-alike lab', 'lookalike lab', 'lab'] },
  { path: '/sources', spoken_names: ['source health', 'sources'] },
  { path: '/reports', spoken_names: ['reports', 'report'] },
  { path: '/settings', spoken_names: ['settings', 'preferences'] },
  { path: '/evaluation', spoken_names: ['model evaluation', 'evaluation'] },
  { path: '/setup', spoken_names: ['setup', 'brand setup'] },
  { path: '/protect-brand', spoken_names: ['protect your brand', 'protect brand', 'add brand'] },
  { path: '/studio/', spoken_names: ['brand studio', 'studio'] },
];

/** The pages the voice agent may open for this person (administrator-only pages are left out for everyone else). */
export function voiceRoutes(isAdmin: boolean): VoiceRoute[] {
  return isAdmin ? ALL_ROUTES : ALL_ROUTES.filter((r) => !ADMIN_ONLY.has(r.path));
}

const SENSITIVE = /pass|pwd|secret|token|otp|\bpin\b|cvv|cvc|card.?num|credit|ssn|api.?key|credential|auth/i;

type Fillable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function usable(el: Element): el is Fillable {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return false;
  if (el.disabled || (el as HTMLInputElement).readOnly) return false;
  if (el instanceof HTMLInputElement && ['password', 'hidden', 'file', 'checkbox', 'radio', 'range'].includes(el.type)) return false;
  const name = el.dataset.voice ?? '';
  return !!name && !SENSITIVE.test(name);
}

/** data-voice names of the fields that can be filled on the page right now (not hidden, enabled, never passwords). */
export function collectVoiceFields(root: ParentNode = document): string[] {
  const out: string[] = [];
  root.querySelectorAll('[data-voice]').forEach((el) => {
    if (!usable(el)) return;
    if (el.closest('[hidden], [aria-hidden="true"]')) return;
    const name = (el as HTMLElement).dataset.voice as string;
    if (!out.includes(name)) out.push(name);
  });
  return out;
}

const DIGITS: Record<string, string> = {
  zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4', for: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};

export function spokenEmail(value: string): string {
  let v = ` ${value.trim().toLowerCase()} `;
  for (const [word, ch] of [[' at the rate ', '@'], [' at ', '@'], [' dot ', '.'], [' period ', '.'], [' underscore ', '_'], [' dash ', '-'], [' hyphen ', '-']]) {
    v = v.split(word).join(ch);
  }
  return v.replace(/\s+/g, '');
}

export function spokenPhone(value: string): string {
  const words = value.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  let out = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const rep = w === 'double' ? 2 : w === 'triple' ? 3 : 0;
    if (rep && DIGITS[words[i + 1]]) {
      out += DIGITS[words[i + 1]].repeat(rep);
      i++;
    } else if (w === 'plus') out += '+';
    else if (DIGITS[w]) out += DIGITS[w];
    else if (/^\+?\d+$/.test(w)) out += w;
  }
  return out || value;
}

/** Written form for email and phone fields; other values are left as they are. */
export function normalizeSpoken(value: string, el: Fillable | null, name: string): string {
  const type = el instanceof HTMLInputElement ? el.type : '';
  if (type === 'email' || /email/i.test(name) || (/\bat\b/.test(value) && /\bdot\b/.test(value))) return spokenEmail(value);
  if (type === 'tel' || /phone|mobile|tel/i.test(name)) return spokenPhone(value);
  return value;
}

/**
 * Set a value on a React-controlled field: React tracks the value through the native setter, so assign with the prototype's setter
 * and dispatch the event React listens to (input for text, change for select). Returns the value actually set, or null.
 */
export function fillVoiceField(name: string, rawValue: string, root: ParentNode = document): string | null {
  const el = Array.from(root.querySelectorAll(`[data-voice="${CSS.escape(name)}"]`)).find(usable) ?? null;
  if (!el) return null;
  let value = normalizeSpoken(rawValue, el, name);
  if (el instanceof HTMLSelectElement) {
    const want = value.trim().toLowerCase();
    const opt =
      Array.from(el.options).find((o) => o.value.toLowerCase() === want || o.text.trim().toLowerCase() === want) ??
      Array.from(el.options).find((o) => o.text.toLowerCase().includes(want) || o.value.toLowerCase().includes(want));
    if (!opt) return null;
    value = opt.value;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.focus();
    return opt.text;
  }
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  return value;
}
