// Display helpers: wire values -> the labels used in the design (docs/API.md section 3). Times are formatted in the viewer's zone.
import type { DetectionStatus, DetectionType, Platform, SourceStatus } from './types';

export const TYPE_LABEL: Record<DetectionType, string> = {
  fake_profile: 'Fake profile',
  fake_brand_page: 'Fake brand page',
  scam_account: 'Scam account',
  fake_app: 'Fake app'
};

/** Dashboard "Recent detections" uses the shorter "Fake page" in the design. */
export const TYPE_LABEL_SHORT: Record<DetectionType, string> = { ...TYPE_LABEL, fake_brand_page: 'Fake page' };

/** Replace EVERY underscore (the old `type.replace('_', ' ')` only replaced the first one: "fake brand_page"). */
export function humanize(s: string): string {
  return s.replace(/_/g, ' ');
}

export function typeLabel(t: string, short = false): string {
  const map = short ? TYPE_LABEL_SHORT : TYPE_LABEL;
  return (map as Record<string, string>)[t] ?? humanize(t).replace(/^./, (c) => c.toUpperCase());
}

/** Detection platform labels as the design shows them: "App Store" (sources use "Apple App Store"), "Third-party APK". */
export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
  telegram: 'Telegram',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  google_play: 'Google Play',
  app_store: 'App Store',
  third_party_apk: 'Third-party APK'
};

/** Source-level names (Source Health, Settings): the stores are named in full. */
export const SOURCE_LABEL: Record<Platform, string> = {
  ...PLATFORM_LABEL,
  app_store: 'Apple App Store',
  third_party_apk: 'Third-party APK sites'
};

export function platformLabel(p: string): string {
  return (PLATFORM_LABEL as Record<string, string>)[p] ?? humanize(p).replace(/^./, (c) => c.toUpperCase());
}

export function sourceLabel(p: string): string {
  return (SOURCE_LABEL as Record<string, string>)[p] ?? platformLabel(p);
}

export const STATUS_LABEL: Record<DetectionStatus, string> = {
  new: 'New',
  reviewing: 'Reviewing',
  confirmed: 'Confirmed',
  dismissed: 'Dismissed',
  marked_official: 'Marked official'
};

export function statusLabel(s: string): string {
  return (STATUS_LABEL as Record<string, string>)[s] ?? humanize(s).replace(/^./, (c) => c.toUpperCase());
}

/** New=blue, Reviewing=orange, Confirmed=red, everything else (Dismissed, Marked official)=green. */
export function statusChip(s: string): string {
  return s === 'new' ? 'chip-blue' : s === 'reviewing' ? 'chip-orange' : s === 'confirmed' ? 'chip-red' : 'chip-green';
}

export function sourceStatusLabel(s: SourceStatus): string {
  return s === 'online' ? 'Online' : s === 'slow' ? 'Slow' : 'Unavailable';
}

export function riskBandLabel(b: string): string {
  return b === 'high' ? 'High' : b === 'medium' ? 'Medium' : 'Low';
}

/** Needs-review chip colour by band (the design only shows High, red). */
export function bandChip(b: string): string {
  return b === 'high' ? 'chip-red' : b === 'medium' ? 'chip-orange' : 'chip-neutral';
}

// ---------------------------------------------------------------- time ----
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function valid(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clock12(d: Date): string {
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}

/** "12 Oct, 11:58 AM" (detection detail, cached-since). */
export function fmtDayTime(iso: string | null | undefined): string {
  const d = valid(iso);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}, ${clock12(d)}` : '';
}

/** "12 Oct 2026, 11:58 AM" (dashboard hero, full sync). */
export function fmtFull(iso: string | null | undefined): string {
  const d = valid(iso);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${clock12(d)}` : '';
}

/** "5 Oct" (recent exports). */
export function fmtDay(iso: string | null | undefined): string {
  const d = valid(iso);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : '';
}

/** "11:58 AM" (source last sync). */
export function fmtClock(iso: string | null | undefined): string {
  const d = valid(iso);
  return d ? clock12(d) : '';
}

/** "12:10" 24-hour clock (Source Health "Next scan"). */
export function fmtClock24(iso: string | null | undefined): string {
  const d = valid(iso);
  return d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
}

/** "2 minutes ago", "1 hour ago", "3 days ago". */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  const d = valid(iso);
  if (!d) return '';
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} ${m === 1 ? 'minute' : 'minutes'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(h / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/** Age of cached data in words: 90 -> "2 minutes", 7200 -> "2 hours". */
export function ageWords(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '';
  const m = Math.round(seconds / 60);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  const d = Math.round(h / 24);
  return `${d} days`;
}

/** Minutes until an ISO time (for "Retrying in 4 minutes"). */
export function minutesUntil(iso: string | null | undefined, now: number = Date.now()): number | null {
  const d = valid(iso);
  return d ? Math.max(0, Math.ceil((d.getTime() - now) / 60000)) : null;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function pct(n: number | null | undefined, digits = 1): string {
  return n === null || n === undefined ? 'n/a' : `${(n * 100).toFixed(digits)}%`;
}

export const SCHEDULE_LABEL: Record<string, string> = {
  off: 'Off',
  '5m': 'Every 5 minutes',
  '15m': 'Every 15 minutes',
  '1h': 'Hourly',
  '1d': 'Daily'
};

/** The wire value of the monitored-platform label used on the Settings page. */
export function scheduleWords(s: string | null | undefined): string {
  return (s && SCHEDULE_LABEL[s]) || s || '';
}
