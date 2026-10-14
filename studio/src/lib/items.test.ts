import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createItem, deleteItem, fetchItemImage, listItems, uploadLegacyGuestItems } from './items';
import { json, putSession, setLocks } from '../test/helpers';

const item = { id: '17', userId: '5', type: 'logo', label: 'Acme logo', data: {}, url: '/api/studio/items/17/image', timestamp: 1 };

beforeEach(() => { localStorage.clear(); putSession(); setLocks(undefined); });
afterEach(() => { vi.unstubAllGlobals(); });

function stub(fn: (url: string, init?: RequestInit) => Response) {
  const f = vi.fn(async (url: string, init?: RequestInit) => fn(url, init));
  vi.stubGlobal('fetch', f);
  return f;
}

describe('items client (/api/studio/items)', () => {
  it('lists with type, limit and offset', async () => {
    const f = stub(() => json({ total: 1, limit: 100, offset: 0, items: [item] }));
    const res = await listItems({ type: 'logo', limit: 100, offset: 5 });
    expect(res.items).toHaveLength(1);
    expect(f.mock.calls[0][0]).toBe('/api/studio/items?type=logo&limit=100&offset=5');
  });

  it('sends a logo data URL as image_base64 and everything else as JSON data', async () => {
    const f = stub(() => json(item, 201));
    await createItem({ type: 'logo', label: 'Acme logo', url: 'data:image/png;base64,AAAA', data: { style: 'Minimalist' } });
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ type: 'logo', label: 'Acme logo', data: { style: 'Minimalist' }, image_base64: 'data:image/png;base64,AAAA' });
    await createItem({ type: 'palette', label: 'P', data: { colors: [] } });
    expect(JSON.parse((f.mock.calls[1][1] as RequestInit).body as string)).not.toHaveProperty('image_base64');
  });

  it('deletes by id and reports server errors with their message', async () => {
    const f = stub((url, init) => (init?.method === 'DELETE' && url.endsWith('/17') ? json({ ok: true }) : json({ detail: 'Item not found' }, 404)));
    await deleteItem('17');
    await expect(deleteItem('99')).rejects.toMatchObject({ status: 404, message: 'Item not found' });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('fetches an item picture as a blob with the Authorization header', async () => {
    const f = stub(() => new Response('x', { status: 200, headers: { 'Content-Type': 'image/png' } }));
    const blob = await fetchItemImage('/api/studio/items/17/image');
    expect(blob.size).toBe(1);
    expect((f.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer A1' });
  });

  it('uploads the old guest collection once and forgets it', async () => {
    localStorage.setItem('brandcraft_collections', JSON.stringify([
      { id: 'a', userId: 'guest', type: 'brand_name', label: 'Nova', data: { explanation: 'x' }, timestamp: 1 },
      { id: 'b', userId: 'someone-else', type: 'brand_name', label: 'Skip', timestamp: 2 },
    ]));
    const f = stub(() => json(item, 201));
    expect(await uploadLegacyGuestItems()).toBe(1);
    expect(f).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('brandcraft_collections')).toBeNull();
    expect(await uploadLegacyGuestItems()).toBe(0);
  });
});
