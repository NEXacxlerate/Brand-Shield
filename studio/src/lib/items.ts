// Saved items (collections) live in the BrandShield database: /api/studio/items, owner-only.
import { request } from './api';
import type { SavedItem } from '../types';

export interface ItemList {
  total: number;
  limit: number;
  offset: number;
  items: SavedItem[];
}

export type NewItem = Omit<SavedItem, 'id' | 'userId' | 'timestamp'>;

export function listItems(opts: { type?: string; limit?: number; offset?: number } = {}): Promise<ItemList> {
  const q = new URLSearchParams();
  if (opts.type) q.set('type', opts.type);
  q.set('limit', String(opts.limit ?? 500));
  if (opts.offset) q.set('offset', String(opts.offset));
  return request<ItemList>(`/api/studio/items?${q.toString()}`);
}

const SAVE_LIMIT_BYTES = 1_500_000; // the server refuses pictures over 2 MB; stay well under it

/**
 * A generated 1024 px PNG can be larger than the server accepts. Pictures over the limit are scaled down (and, if needed, saved as
 * WebP) before they are sent. Anything that cannot be decoded here (tests, odd data) is sent as it is.
 */
export async function fitForSave(dataUrl: string): Promise<string> {
  const approxBytes = Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);
  if (approxBytes <= SAVE_LIMIT_BYTES || typeof document === 'undefined') return dataUrl;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode'));
      el.src = dataUrl;
    });
    let side = Math.min(1, 768 / Math.max(img.naturalWidth, img.naturalHeight));
    for (let attempt = 0; attempt < 4; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(64, Math.round(img.naturalWidth * side));
      canvas.height = Math.max(64, Math.round(img.naturalHeight * side));
      const ctx = canvas.getContext('2d');
      if (!ctx) return dataUrl;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const out = canvas.toDataURL('image/webp', 0.9);
      if (Math.floor(((out.length - out.indexOf(',') - 1) * 3) / 4) <= SAVE_LIMIT_BYTES) return out;
      side *= 0.75;
    }
  } catch {
    /* fall through */
  }
  return dataUrl;
}

/** `url` of a logo is a data URL while creating (sent as image_base64); the server answers with its own image path. */
export async function createItem(item: NewItem): Promise<SavedItem> {
  const body: Record<string, unknown> = { type: item.type, label: item.label, data: item.data ?? {} };
  if (item.url && item.url.startsWith('data:image/')) body.image_base64 = await fitForSave(item.url);
  return request<SavedItem>('/api/studio/items', { method: 'POST', json: body });
}

export async function deleteItem(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/studio/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** The picture of an item, as a Blob (the endpoint needs the Authorization header, so an <img src> cannot load it). */
export function fetchItemImage(path: string): Promise<Blob> {
  return request<Blob>(path, { blob: true });
}

const LEGACY_KEY = 'brandcraft_collections';

/** One-off upload of the old guest collection (browser storage of the former standalone app), then forget it. Returns the count sent. */
export async function uploadLegacyGuestItems(): Promise<number> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return 0;
  }
  if (!raw) return 0;
  let local: SavedItem[] = [];
  try {
    local = (JSON.parse(raw) as SavedItem[]).filter((i) => i && i.userId === 'guest');
  } catch {
    local = [];
  }
  let sent = 0;
  for (const it of local) {
    try {
      await createItem({ type: it.type, label: it.label, data: it.data, url: it.url });
      sent++;
    } catch {
      return sent; // keep the rest for next time (limit reached, offline, ...)
    }
  }
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
  return sent;
}
