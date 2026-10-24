// A compact picture of what the person can interact with, for the voice agent's planner, plus the full-DOM element index that
// find_element searches. Elements are rendered (non-zero size, not display:none / visibility:hidden) but NOT required to be in the
// viewport: off-screen ones carry off:1. Open shadow roots, same-origin iframes and portals (dropdown options live under <body>) are
// included. Each element gets a stable data-voice-id.
import type { SnapshotEl } from './voice';

const MAX = 150;
const MAX_ROWS = 40;
const SENSITIVE = /pass(word|code)?|pwd|secret|token|\botp\b|one.?time|\bpin\b|cvv|cvc|card|credit|ssn|api.?key|credential|auth/i;
const CONTROLS = [
  'button', 'a[href]', 'input', 'textarea', 'select', '[role="tab"]', '[role="button"]', '[role="combobox"]', '[aria-haspopup]',
  '[role="checkbox"]', '[role="radio"]', '[role="switch"]', '[role="option"]', '[role="menuitem"]', '[role="listbox"] li', '[role="menu"] li',
  '[data-radix-collection-item]', 'tbody tr', '[role="row"]', '.detection-row-card', '[data-voice-row]',
].join(',');

let counter = 0;

/** Console tracing for development only: localStorage voiceDebug=1. Never active in a production build. */
export function dbg(...args: unknown[]) {
  try {
    if (import.meta.env.DEV && localStorage.getItem('voiceDebug') === '1') console.log('[voice]', ...args);
  } catch {
    /* storage unavailable */
  }
}

export function voiceId(el: Element): string {
  const h = el as HTMLElement;
  if (!h.dataset.voiceId) h.dataset.voiceId = `v${++counter % 99000 || 1}`;
  return h.dataset.voiceId;
}

/** Rendered: non-zero size and not hidden. Being outside the viewport is fine. */
export function visible(el: Element): boolean {
  if (el.closest('.voice-agent, [hidden], [aria-hidden="true"]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0 && el.getClientRects().length === 0) return false;
  const win = el.ownerDocument.defaultView ?? window;
  const cs = win.getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

export function isOffscreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  const win = el.ownerDocument.defaultView ?? window;
  return r.bottom < 0 || r.top > win.innerHeight || r.right < 0 || r.left > win.innerWidth;
}

const clip = (s: string | null | undefined, n = 40) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Every document and open shadow root that can hold controls: the page, its same-origin iframes and open shadow roots. */
function roots(start: ParentNode = document, acc: ParentNode[] = []): ParentNode[] {
  acc.push(start);
  for (const host of Array.from(start.querySelectorAll('*'))) {
    if (host.shadowRoot) roots(host.shadowRoot, acc);
    if (host instanceof HTMLIFrameElement) {
      try {
        if (host.contentDocument) roots(host.contentDocument, acc);
      } catch {
        /* cross-origin frame */
      }
    }
  }
  return acc;
}

/** querySelectorAll across the page, open shadow roots and same-origin iframes. */
export function queryDeep(selector: string): Element[] {
  return roots().flatMap((r) => Array.from(r.querySelectorAll(selector)));
}

/** The topmost open dialog, if any: while it is open the page behind it is not offered. */
export function openModal(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"]')).filter(visible);
  return all[all.length - 1] ?? null;
}

function typeOf(el: Element): string | null {
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  const role = el.getAttribute('role');
  if (el instanceof HTMLInputElement) {
    if (['password', 'hidden', 'file', 'range', 'color'].includes(el.type)) return null;
    if (el.type === 'checkbox') return role === 'switch' ? 'switch' : 'checkbox';
    if (el.type === 'radio') return 'radio';
    if (['button', 'submit', 'reset'].includes(el.type)) return 'button';
    return 'input';
  }
  if (role === 'option' || role === 'menuitem' || el.hasAttribute('data-radix-collection-item') || (el.tagName === 'LI' && el.closest('[role="listbox"], [role="menu"]'))) return 'option';
  if (role === 'combobox' || el.hasAttribute('aria-haspopup')) return 'dropdown';
  if (role === 'tab') return 'tab';
  if (role === 'switch') return 'switch';
  if (role === 'checkbox') return 'checkbox';
  if (role === 'radio') return 'radio';
  if (el.tagName === 'TR' || role === 'row' || el.classList.contains('detection-row-card') || el.hasAttribute('data-voice-row')) return 'row';
  if (el.tagName === 'A') return 'link';
  return 'button';
}

/** Text of the closest heading or label before the element (last resort label). */
function nearbyText(el: Element): string {
  let node: Element | null = el;
  for (let hops = 0; node && hops < 4; hops++, node = node.parentElement) {
    let sib = node.previousElementSibling;
    for (let n = 0; sib && n < 4; n++, sib = sib.previousElementSibling) {
      if (sib.matches('h1, h2, h3, h4, h5, h6, label, legend, .field-lbl, [class*="label"]')) {
        const t = clip(sib.textContent);
        if (t) return t;
      }
    }
  }
  return '';
}

function labelOf(el: Element, type: string): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return clip(aria);
  const doc = el.ownerDocument;
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const t = by.split(' ').map((id) => doc.getElementById(id)?.textContent ?? '').join(' ');
    if (clip(t)) return clip(t);
  }
  if (el.id) {
    const lab = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (lab && clip(lab.textContent)) return clip(lab.textContent);
  }
  if (['input', 'textarea', 'select', 'checkbox', 'radio', 'switch', 'dropdown'].includes(type)) {
    const wrap = el.closest('label');
    const lbl = wrap?.querySelector('.field-lbl, .setup-label, span');
    if (clip(lbl?.textContent)) return clip(lbl?.textContent);
    if (clip(wrap?.textContent)) return clip(wrap?.textContent);
    const ph = el.getAttribute('placeholder');
    if (ph) return clip(ph);
    const group = el.closest('.form-group, .field, .setup-field')?.querySelector('label, .field-lbl, .setup-label');
    if (clip(group?.textContent)) return clip(group?.textContent);
    const nm = el.getAttribute('name');
    if (nm) return clip(nm.replace(/[_-]/g, ' '));
  }
  const html = el as HTMLElement;
  let text = html.innerText ?? '';
  if (type === 'row') {
    const cells = Array.from(el.querySelectorAll('td, th')).slice(0, 3).map((c) => clip((c as HTMLElement).innerText, 30)).filter(Boolean);
    text = cells.length ? cells.join(' · ') : text.split('\n').filter(Boolean).slice(0, 3).join(' · ');
  }
  return clip(text) || clip(el.getAttribute('title')) || clip(html.dataset?.voice?.replace(/[_-]/g, ' ')) || nearbyText(el);
}

function errorOf(el: Element): string | undefined {
  const by = el.getAttribute('aria-describedby');
  if (el.getAttribute('aria-invalid') === 'true' && by) {
    const t = clip(el.ownerDocument.getElementById(by)?.textContent, 100);
    if (t) return t;
  }
  const scope = el.closest('label, .form-group, .field, .setup-field') ?? el.parentElement;
  const t = clip(scope?.querySelector('[role="alert"], [class*="error"], [class*="invalid"]')?.textContent, 100);
  return t || undefined;
}

export function pageTitle(): string {
  return clip(document.querySelector('h1')?.textContent || document.title, 60);
}

/** The snapshot entry for one element, or null when it is not an offerable control (or is sensitive). Assigns its data-voice-id. */
export function describeEl(el: Element): SnapshotEl | null {
  const type = typeOf(el);
  if (!type) return null;
  const label = labelOf(el, type);
  const name = (el as HTMLElement).dataset?.voice;
  const probe = `${label} ${name ?? ''} ${el.id} ${el.getAttribute('name') ?? ''} ${el.getAttribute('autocomplete') ?? ''}`;
  if (SENSITIVE.test(probe) || el.getAttribute('autocomplete') === 'one-time-code') return null;
  if (!label && !name) return null;
  const e: SnapshotEl = { i: voiceId(el), t: type, l: label };
  if (name) e.n = name;
  if (el instanceof HTMLSelectElement) {
    e.v = clip(el.selectedOptions[0]?.text);
    e.o = Array.from(el.options).map((o) => clip(o.text, 60)).filter(Boolean).slice(0, 40);
  } else if (el instanceof HTMLInputElement && (type === 'checkbox' || type === 'radio' || type === 'switch')) {
    e.c = el.checked;
  } else if (type === 'switch' || (type === 'checkbox' && !(el instanceof HTMLInputElement))) {
    e.c = el.getAttribute('aria-checked') === 'true';
  } else if (type === 'input' || type === 'textarea') {
    const v = clip((el as HTMLInputElement).value);
    if (v) e.v = v;
  } else if (type === 'dropdown') {
    const v = clip((el as HTMLInputElement).value || (el as HTMLElement).innerText);
    if (v && v !== label) e.v = v;
  }
  if ((el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true') e.r = 1;
  if ((el as HTMLInputElement).disabled || el.getAttribute('aria-disabled') === 'true') e.d = 1;
  const err = errorOf(el);
  if (err && (type === 'input' || type === 'textarea' || type === 'select')) e.e = err;
  if (isOffscreen(el)) e.off = 1;
  return e;
}

export interface Found {
  el: HTMLElement;
  e: SnapshotEl;
  /** Page order across all roots. */
  index: number;
  inModal: boolean;
}

/** Every offerable control in the whole live DOM (portals, shadow roots, iframes, off-screen), in page order. Not capped. */
export function collectAll(): Found[] {
  const modal = openModal();
  const out: Found[] = [];
  const seen = new Set<Element>();
  for (const root of roots()) {
    for (const el of Array.from(root.querySelectorAll(CONTROLS))) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (!visible(el)) continue;
      const e = describeEl(el);
      if (!e) continue;
      const inModal = !!modal && modal.contains(el);
      if (modal && !inModal && e.t !== 'option') continue; // behind an open dialog: not offered (its dropdown options are)
      out.push({ el: el as HTMLElement, e, index: out.length, inModal });
    }
  }
  return out;
}

function priority(f: Found): number {
  if (f.inModal) return 0;
  if (['input', 'textarea', 'select', 'dropdown', 'checkbox', 'radio', 'switch'].includes(f.e.t)) return 1;
  if (['button', 'tab', 'option'].includes(f.e.t)) return 2;
  return f.e.t === 'row' ? 3 : 4;
}

/**
 * What the planner sees: at most MAX controls, chosen by priority (open dialog, form fields, buttons/tabs/options, rows, links) and
 * listed in page order. `pinned` ids (found by find_element) are always included. A first entry reports how many rows the page lists.
 */
export function getPageSnapshot(pinned: string[] = []): SnapshotEl[] {
  const all = collectAll();
  const rows = all.filter((f) => f.e.t === 'row');
  const keepRows = new Set(rows.slice(0, MAX_ROWS));
  const pool = all.filter((f) => f.e.t !== 'row' || keepRows.has(f) || pinned.includes(f.e.i));
  const chosen = [...pool].sort((a, b) => (pinned.includes(a.e.i) ? -1 : priority(a)) - (pinned.includes(b.e.i) ? -1 : priority(b)) || a.index - b.index).slice(0, MAX);
  const out = chosen.sort((a, b) => a.index - b.index).map((f) => f.e);
  if (rows.length) out.unshift({ i: 'v0', t: 'info', l: 'List rows', v: `${rows.length} rows${rows.length > MAX_ROWS ? ` (first ${MAX_ROWS} listed)` : ''}` });
  dbg('snapshot', out.length, 'of', all.length, 'controls');
  return out;
}
