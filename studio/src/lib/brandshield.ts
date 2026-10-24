// "Create brand & protect it in BrandShield": client-side rules and the registration flow.
// Rules mirror the backend (docs/STUDIO_INTEGRATION_CONTRACT.md section 3): logo PNG/JPEG/WebP, <= 2 MB, >= 256 px, width/height 0.8..1.25.
import { request, ApiError } from './api';

export const LOGO_RULES = {
  types: ['image/png', 'image/jpeg', 'image/webp'],
  maxBytes: 2 * 1024 * 1024,
  minPx: 256,
  minRatio: 0.8,
  maxRatio: 1.25,
  target: 512,
} as const;

export const INDUSTRIES = [
  'Banking', 'Fintech & Payments', 'Insurance', 'E-commerce & Retail', 'Technology & Software', 'Telecom',
  'Healthcare & Pharma', 'Education', 'Travel & Hospitality', 'Food & Beverage', 'Media & Entertainment',
  'Logistics & Transport', 'Energy & Utilities', 'Real Estate', 'Government & Non-profit', 'Other',
];

export const MAX_ALIASES = 8;

// ------------------------------------------------------------ derivations ---
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function dedupe(list: string[], skip: string[] = []): string[] {
  const seen = new Set(skip.map((s) => s.toLowerCase()));
  const out: string[] = [];
  for (const raw of list) {
    const v = clean(raw);
    const k = v.toLowerCase();
    if (!v || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** Sensible spelling variants of a brand name: "Acme Bank" -> acmebank, acme-bank, acme_bank, acme. Never the name itself. */
export function deriveAliases(name: string, max = MAX_ALIASES): string[] {
  const n = clean(name);
  if (!n) return [];
  const words = n.toLowerCase().split(/[^a-z0-9À-ɏ]+/i).filter(Boolean);
  const variants: string[] = [];
  if (words.length > 1) {
    variants.push(words.join(''), words.join('-'), words.join('_'));
    if (words[0].length >= 4) variants.push(words[0]); // distinctive first word
  } else if (words.length === 1 && words[0] !== n.toLowerCase()) {
    variants.push(words[0]); // punctuation stripped
  }
  return dedupe(variants, [n]).slice(0, max);
}

const STOP = new Set(['the', 'and', 'for', 'with', 'your', 'our', 'you', 'that', 'this', 'from', 'are', 'was', 'have', 'will']);

/** Keywords from the name (always) and an optional tagline/description: lower case words of 3+ letters, deduplicated. */
export function deriveKeywords(name: string, tagline = '', max = 8): string[] {
  const nameWords = clean(name).toLowerCase().split(/[^a-z0-9À-ɏ]+/i).filter((w) => w.length >= 3);
  const joined = clean(name).toLowerCase().replace(/[^a-z0-9À-ɏ]+/gi, '');
  const tagWords = clean(tagline).toLowerCase().split(/[^a-z0-9À-ɏ]+/i).filter((w) => w.length >= 4 && !STOP.has(w));
  return dedupe([joined, ...nameWords, ...tagWords]).slice(0, max);
}

const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "https://www.Acme.com/path" -> "acme.com". Returns null when it does not look like a domain. */
export function normalizeDomain(input: string): string | null {
  let d = input.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
  d = d.split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
  return DOMAIN_RE.test(d) ? d : null;
}

// ------------------------------------------------------------------ logo ---
export interface LogoMeta {
  type: string;
  size: number;
  width: number;
  height: number;
}

export interface LogoCheck {
  /** False when the file cannot be used at all (wrong type or unreadable). */
  usable: boolean;
  /** True when the picture must be redrawn on a 512 x 512 canvas before uploading. */
  needsResize: boolean;
  /** Plain-language explanation of every problem and of what will be done about it. */
  notes: string[];
}

export function checkLogoMeta(m: LogoMeta): LogoCheck {
  const notes: string[] = [];
  if (!(LOGO_RULES.types as readonly string[]).includes(m.type)) {
    return { usable: false, needsResize: false, notes: ['The logo must be a PNG, JPEG or WebP picture.'] };
  }
  if (!m.width || !m.height) return { usable: false, needsResize: false, notes: ['This picture could not be read.'] };
  let needsResize = false;
  const ratio = m.width / m.height;
  if (ratio < LOGO_RULES.minRatio || ratio > LOGO_RULES.maxRatio) {
    needsResize = true;
    notes.push(`The picture is ${m.width} x ${m.height}, not square enough; it was centred on a white ${LOGO_RULES.target} x ${LOGO_RULES.target} square.`);
  }
  if (m.width < LOGO_RULES.minPx || m.height < LOGO_RULES.minPx) {
    needsResize = true;
    notes.push(`The picture is smaller than ${LOGO_RULES.minPx} px; it was enlarged to fit ${LOGO_RULES.target} x ${LOGO_RULES.target}.`);
  }
  if (m.size > LOGO_RULES.maxBytes) {
    needsResize = true;
    notes.push('The file is larger than 2 MB; it was re-saved at 512 x 512 as a PNG.');
  }
  return { usable: true, needsResize, notes };
}

/** Geometry of "contain" fitting into a target x target square (pure; the canvas code just draws these numbers). */
export function fitSquare(w: number, h: number, target: number = LOGO_RULES.target) {
  const scale = Math.min(target / w, target / h);
  const dw = Math.round(w * scale);
  const dh = Math.round(h * scale);
  return { scale, dw, dh, dx: Math.floor((target - dw) / 2), dy: Math.floor((target - dh) / 2) };
}

export interface PreparedLogo {
  blob: Blob;
  resized: boolean;
  notes: string[];
}

function loadBitmap(blob: Blob): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number) => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight, draw: (ctx, dx, dy, dw, dh) => ctx.drawImage(img, dx, dy, dw, dh) });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This picture could not be read.'));
    };
    img.src = url;
  });
}

/** Check a logo picture against BrandShield's rules and, when needed, redraw it on a 512 x 512 white PNG. */
export async function prepareLogo(blob: Blob): Promise<PreparedLogo> {
  const bmp = await loadBitmap(blob);
  const check = checkLogoMeta({ type: blob.type, size: blob.size, width: bmp.width, height: bmp.height });
  if (!check.usable) throw new Error(check.notes.join(' '));
  if (!check.needsResize) return { blob, resized: false, notes: [] };
  const t = LOGO_RULES.target;
  const canvas = document.createElement('canvas');
  canvas.width = t;
  canvas.height = t;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot resize pictures.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, t, t);
  const g = fitSquare(bmp.width, bmp.height, t);
  bmp.draw(ctx, g.dx, g.dy, g.dw, g.dh);
  const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!out) throw new Error('The picture could not be converted.');
  return { blob: out, resized: true, notes: check.notes };
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error('Not a picture.');
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

// ---------------------------------------------------------- registration ---
export interface BrandForm {
  name: string;
  industry: string;
  description: string;
  aliases: string[];
  keywords: string[];
  domains: string[];
}

export interface BrandResult {
  id: number;
  name: string;
  industry: string;
  aliases: string[];
  keywords: string[];
  domains: string[];
  description?: string | null;
  logo?: { url: string; width?: number; height?: number } | null;
  refresh?: { results_retired?: number; rescan?: string; message?: string } | null;
}

export function buildPayload(f: BrandForm) {
  const body: Record<string, unknown> = {
    name: clean(f.name),
    industry: clean(f.industry),
    aliases: dedupe(f.aliases, [clean(f.name)]),
    keywords: dedupe(f.keywords),
    domains: dedupe(f.domains.map((d) => normalizeDomain(d) ?? d.trim())),
  };
  if (clean(f.description)) body.description = clean(f.description);
  return body;
}

export interface RegisterOutcome {
  status: 'created' | 'updated' | 'cancelled';
  brand?: BrandResult;
  /** Null when no logo was given; otherwise whether it was stored. A failed logo does not undo the brand. */
  logo: { ok: boolean; error?: string } | null;
}

async function uploadLogo(brandId: number, logo: Blob): Promise<{ ok: boolean; error?: string }> {
  const form = new FormData();
  const ext = logo.type === 'image/jpeg' ? 'jpg' : logo.type === 'image/webp' ? 'webp' : 'png';
  form.append('file', logo, `logo.${ext}`);
  try {
    await request(`/api/brands/${brandId}/logo`, { method: 'POST', form });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'The logo could not be uploaded.' };
  }
}

/** POST /api/brands, then the logo. An account can protect several brands, so this always creates a new one (409 = the account's limit). */
export async function registerBrand(form: BrandForm, logo: Blob | null): Promise<RegisterOutcome> {
  const payload = buildPayload(form);
  const brand = await request<BrandResult>('/api/brands', { method: 'POST', json: payload });
  const logoResult = logo ? await uploadLogo(brand.id, logo) : null;
  return { status: 'created', brand, logo: logoResult };
}

/** Map a 422 `fields` object (FastAPI loc[-1]) to the wizard's fields. */
export function mapFieldErrors(fields: Record<string, string>): Partial<Record<'name' | 'industry' | 'description' | 'aliases' | 'keywords' | 'domains' | 'logo', string>> {
  const out: Partial<Record<'name' | 'industry' | 'description' | 'aliases' | 'keywords' | 'domains' | 'logo', string>> = {};
  for (const k of ['name', 'industry', 'description', 'aliases', 'keywords', 'domains'] as const) if (fields[k]) out[k] = fields[k];
  if (fields.file) out.logo = fields.file;
  return out;
}
