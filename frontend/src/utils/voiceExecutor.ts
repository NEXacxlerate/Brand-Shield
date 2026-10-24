// Runs one voice action against the live page: click, fill, select (native or custom dropdown), toggle, scroll, back, close.
// Elements are found by the data-voice-id the snapshot gave them. Nothing here talks to the server.
import { collectAll, dbg, isOffscreen, openModal, queryDeep, visible, type Found } from './voiceSnapshot';
import type { VoiceAction } from './voice';

export interface ExecEnv {
  navigate: (path: string) => void;
  back: () => void;
}

export interface ExecResult {
  ok: boolean;
  /** The page probably changed (route, modal, tab, loaded data): take a new snapshot afterwards. */
  changed: boolean;
  error?: string;
  prev?: string;
  /** find_element: ids of the matches, and a one-line description for the planner. */
  found?: string[];
  info?: string;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Best fuzzy match of `target` among `items` (exact, then prefix, then contains, then shared words), or -1. */
export function bestMatch(target: string, items: string[]): number {
  const t = norm(target);
  if (!t) return -1;
  let best = -1;
  let bestScore = 0;
  items.forEach((item, idx) => {
    const n = norm(item);
    if (!n) return;
    let score = 0;
    if (n === t) score = 100;
    else if (n.startsWith(t) || t.startsWith(n)) score = 85;
    else if (n.includes(t) || t.includes(n)) score = 75;
    else {
      const a = new Set(t.split(' '));
      const b = new Set(n.split(' '));
      const shared = [...a].filter((w) => b.has(w)).length;
      score = (shared / Math.max(a.size, b.size)) * 70;
    }
    if (score > bestScore) {
      best = idx;
      bestScore = score;
    }
  });
  return bestScore >= 50 ? best : -1;
}

const squeeze = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** 0-100: how well `query` matches any of `texts` ("bar1nexa" matches "Bar1 Nexa"). */
function fuzzyScore(query: string, texts: string[]): number {
  const q = squeeze(query);
  if (q.length < 2) return 0;
  const qt = new Set(norm(query).split(' ').filter(Boolean));
  let best = 0;
  for (const t of texts) {
    const c = squeeze(t);
    if (!c) continue;
    let s = 0;
    if (c === q) s = 100;
    else if (c.includes(q)) s = 90;
    else if (q.includes(c) && c.length >= 3) s = 70;
    else {
      const tt = new Set(norm(t).split(' '));
      s = ([...qt].filter((w) => tt.has(w)).length / Math.max(qt.size, tt.size)) * 65;
    }
    best = Math.max(best, s);
  }
  return best;
}

export interface Match {
  id: string;
  type: string;
  label: string;
  off: boolean;
}

function search(query: string, etype?: string): Found[] {
  const types = etype ? etype.split(',') : null;
  const all = collectAll();
  const pool = types && all.some((f) => types.includes(f.e.t)) ? all.filter((f) => types.includes(f.e.t)) : all;
  return pool
    .map((f) => ({
      f,
      s: fuzzyScore(query, [
        f.e.l, f.e.v ?? '', f.e.n ?? '', f.el.getAttribute('placeholder') ?? '', f.el.getAttribute('aria-label') ?? '',
        f.e.t === 'row' ? f.el.innerText.slice(0, 300) : '',
      ]),
    }))
    .filter((x) => x.s >= 55)
    .sort((a, b) => b.s - a.s || a.f.index - b.f.index)
    .slice(0, 3)
    .map((x) => x.f);
}

/** One step down the scrolling area; false when it is already at the end. */
function scrollStep(): boolean {
  const { el, viewport } = scrollContainer();
  if (el.scrollTop >= el.scrollHeight - el.clientHeight - 2) return false;
  el.scrollBy({ top: viewport * 0.8, behavior: 'auto' });
  return true;
}

/**
 * Finds a control by what it says, anywhere in the live DOM (portals, shadow roots, iframes, off-screen). No server call.
 * The best match is scrolled into view and flashed; if nothing matches, the page is scrolled step by step (lists may load lazily).
 */
export async function findElement(query: string, etype?: string): Promise<{ matches: Match[]; best: HTMLElement | null }> {
  let hits = search(query, etype);
  for (let step = 0; !hits.length && step < 5; step++) {
    if (!scrollStep()) break;
    await settle(1500);
    hits = search(query, etype);
  }
  const best = hits[0]?.el ?? null;
  if (best && isOffscreen(best)) {
    best.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(350);
  }
  if (best) flash(best);
  dbg('find_element', query, etype ?? '-', hits.length ? hits.map((h) => `${h.e.i}:${h.e.l}`) : 'no fuzzy match above threshold');
  return { matches: hits.map((h) => ({ id: h.e.i, type: h.e.t, label: h.e.l, off: !!h.e.off })), best };
}

function byId(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-voice-id="${CSS.escape(id)}"]`);
}

/** A brief outline on the element being acted on (Web Animations: no class or attribute changes for the page to react to). */
export function flash(el: Element) {
  try {
    (el as HTMLElement).animate?.(
      [{ boxShadow: '0 0 0 3px rgba(139,155,255,0.95)' }, { boxShadow: '0 0 0 8px rgba(139,155,255,0)' }],
      { duration: 900, easing: 'ease-out' }
    );
  } catch {
    /* animations unavailable */
  }
}

function setNative(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

function scrollContainer(): { el: HTMLElement; viewport: number } {
  const modal = openModal();
  const candidates = [modal, document.querySelector<HTMLElement>('.main-panel'), document.scrollingElement as HTMLElement | null];
  for (const c of candidates) {
    if (!c) continue;
    const isRoot = c === document.scrollingElement;
    if (c.scrollHeight > c.clientHeight + 4 && (isRoot || ['auto', 'scroll'].includes(getComputedStyle(c).overflowY))) {
      return { el: c, viewport: isRoot ? window.innerHeight : c.clientHeight };
    }
  }
  return { el: document.scrollingElement as HTMLElement, viewport: window.innerHeight };
}

function scroll(direction: 'up' | 'down' | 'top' | 'bottom') {
  const { el, viewport } = scrollContainer();
  const max = el.scrollHeight - el.clientHeight;
  const top = direction === 'top' ? 0 : direction === 'bottom' ? max : Math.max(0, Math.min(max, el.scrollTop + (direction === 'down' ? 1 : -1) * viewport * 0.8));
  el.scrollTo({ top, behavior: 'smooth' });
}

async function selectOption(el: HTMLElement, option: string): Promise<ExecResult> {
  if (el instanceof HTMLSelectElement) {
    const prev = el.selectedOptions[0]?.text ?? '';
    const opts = Array.from(el.options);
    const idx = bestMatch(option, opts.map((o) => o.text));
    const at = idx >= 0 ? idx : bestMatch(option, opts.map((o) => o.value));
    if (at < 0) return { ok: false, changed: false, error: `There is no option called ${option}.` };
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    flash(el);
    setNative(el, opts[at].value);
    return { ok: true, changed: true, prev };
  }
  return pickFromDropdown(el, option);
}

const GENERIC_OPTIONS =
  '[role="option"], [role="menuitem"], [role="listbox"] li, [role="menu"] li, [data-radix-collection-item], li, [class*="option"], [class*="menu-item"], [class*="dropdown-item"]';

const shownValue = (el: HTMLElement) => ((el as HTMLInputElement).value || el.innerText || '').trim();

/** Non-native dropdown: open it, wait for the page to settle, look for the option anywhere in the page (options render in portals), click it, check the trigger changed. */
async function pickFromDropdown(trigger: HTMLElement, option: string): Promise<ExecResult> {
  const id = trigger.dataset.voiceId;
  const current = () => (id ? document.querySelector<HTMLElement>(`[data-voice-id="${CSS.escape(id)}"]`) : null) ?? trigger;
  let lastError = 'The options did not open.';
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = shownValue(current());
    const existing = new Set(queryDeep(GENERIC_OPTIONS));
    current().scrollIntoView({ block: 'center' });
    flash(current());
    current().click();
    await settle(1500);
    let items = queryDeep(GENERIC_OPTIONS).filter((o) => visible(o) && !current().contains(o)) as HTMLElement[];
    const fresh = items.filter((o) => !existing.has(o));
    if (fresh.length) items = fresh; // what the click just opened
    const idx = bestMatch(option, items.map((o) => o.innerText || o.textContent || ''));
    dbg('dropdown options', items.length, 'best', idx, 'for', option);
    if (idx < 0) {
      lastError = items.length ? `There is no option called ${option}.` : 'The options did not open.';
      continue;
    }
    items[idx].scrollIntoView({ block: 'nearest' });
    flash(items[idx]);
    const label = (items[idx].innerText || items[idx].textContent || '').trim();
    items[idx].click();
    await sleep(150);
    await settle(1000);
    const after = shownValue(current());
    if (after !== before || norm(after).includes(norm(label))) return { ok: true, changed: true };
    lastError = `I chose ${label} but the list still shows ${before || 'nothing'}.`;
  }
  return { ok: false, changed: true, error: lastError };
}

export async function executeAction(a: VoiceAction, env: ExecEnv): Promise<ExecResult> {
  switch (a.type) {
    case 'navigate':
      env.navigate(a.path);
      return { ok: true, changed: true };
    case 'back':
      env.back();
      return { ok: true, changed: true };
    case 'scroll':
      scroll(a.direction);
      return { ok: true, changed: false };
    case 'find': {
      const r = await findElement(a.query, a.etype);
      if (!r.matches.length) return { ok: false, changed: false, error: `I could not find ${a.query} on this page.` };
      return {
        ok: true, changed: false, found: r.matches.map((m) => m.id),
        info: r.matches.map((m) => `${m.id}:${m.label}${m.off ? ' (off-screen)' : ''}`).join('; '),
      };
    }
    case 'wait':
      await sleep(Math.min(2000, a.ms));
      return { ok: true, changed: true };
    case 'close': {
      const modal = openModal();
      const btn = modal
        ? Array.from(modal.querySelectorAll<HTMLElement>('button, [role="button"]')).find((b) => /close|cancel|dismiss|✕|×/i.test(`${b.getAttribute('aria-label') ?? ''} ${b.innerText}`))
        : null;
      if (btn) btn.click();
      else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { ok: true, changed: true };
    }
    case 'highlight': {
      const el = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"], input[autocomplete="one-time-code"]')).find(visible);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.focus();
        try {
          el.animate([{ boxShadow: '0 0 0 3px rgba(240,86,106,0.95)' }, { boxShadow: '0 0 0 10px rgba(240,86,106,0)' }], { duration: 700, iterations: 3 });
        } catch {
          /* animations unavailable */
        }
      }
      return { ok: true, changed: false };
    }
    default:
      break;
  }
  // resolve: (1) the id from the latest snapshot, (2) if it is missing or stale (re-rendered), search by the label the planner gave
  let el = byId(a.id);
  const why = !el ? 'not in DOM (stale id)' : !visible(el) ? 'hidden' : '';
  if (why) {
    dbg('id lookup failed:', a.id, why, '- searching by label', a.label);
    const hint = a.type === 'select' ? 'select,dropdown' : a.type === 'fill' ? 'input,textarea' : a.type === 'toggle' ? 'checkbox,radio,switch' : undefined;
    el = a.label ? (await findElement(a.label, hint)).best : null;
    if (!el) return { ok: false, changed: false, error: `I could not find ${a.label ?? 'that control'} on this page.` };
  }
  if (!el) return { ok: false, changed: false, error: `I could not find ${a.label ?? 'that control'} on this page.` };
  dbg('matched', a.type, a.id, el.tagName, el.innerText?.slice(0, 30));
  switch (a.type) {
    case 'click':
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      flash(el);
      el.click();
      return { ok: true, changed: true };
    case 'select':
      return selectOption(el, a.option);
    case 'fill': {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return { ok: false, changed: false, error: `${a.label ?? 'That control'} is not a text field.` };
      if (el.disabled || el.readOnly) return { ok: false, changed: false, error: `${a.label ?? 'That field'} cannot be edited.` };
      const prev = el.value;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      flash(el);
      el.focus();
      setNative(el, a.value);
      return { ok: true, changed: false, prev };
    }
    case 'toggle': {
      const on = el instanceof HTMLInputElement ? el.checked : el.getAttribute('aria-checked') === 'true';
      if (a.on === undefined || on !== a.on) {
        flash(el);
        el.click();
      }
      return { ok: true, changed: true };
    }
    default:
      return { ok: false, changed: false, error: 'Unknown action.' };
  }
}

const BUSY = '[aria-busy="true"], .spinner, .loading, .animate-spin, [role="progressbar"], .skeleton, [class*="loading"]';

/** Resolves once the page stops changing (about 250 ms of quiet, no spinners), or after `maxMs`. */
export function settle(maxMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    let timer = 0;
    let finished = false;
    const busy = () => Array.from(document.querySelectorAll(BUSY)).some((el) => !el.closest('.voice-agent') && visible(el));
    const done = () => {
      if (finished) return;
      finished = true;
      obs.disconnect();
      window.clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (busy() && Date.now() - start < maxMs) timer = window.setTimeout(check, 150);
      else done();
    };
    const obs = new MutationObserver((muts) => {
      if (muts.every((m) => (m.target as Element).closest?.('.voice-agent'))) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(check, 250);
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    timer = window.setTimeout(check, 300);
    window.setTimeout(done, maxMs);
  });
}
