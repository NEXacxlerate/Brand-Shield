import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useApi } from './useApi';
import { clearQueryCache } from '../api/queryCache';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearQueryCache();
});

describe('useApi keeps the last answer between visits', () => {
  it('shows the previous data at once when the page is opened again, and still refreshes it', async () => {
    const load = vi.fn().mockResolvedValueOnce({ n: 1 }).mockResolvedValueOnce({ n: 2 });
    const useIt = () => useApi((signal) => load(signal), ['same-inputs']);

    const first = renderHook(useIt);
    expect(first.result.current.loading).toBe(true); // nothing known yet: a loading state is honest
    await waitFor(() => expect(first.result.current.data).toEqual({ n: 1 }));
    first.unmount(); // leave the page

    const second = renderHook(useIt); // come back
    expect(second.result.current.loading).toBe(false); // no loading screen
    expect(second.result.current.data).toEqual({ n: 1 }); // the last answer is there on the very first render
    await waitFor(() => expect(second.result.current.data).toEqual({ n: 2 })); // and the fresh answer replaces it
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not reuse data for different inputs', async () => {
    const load = vi.fn().mockImplementation(async () => ({ ok: true }));
    const a = renderHook(() => useApi(() => load('a'), ['a']));
    await waitFor(() => expect(a.result.current.data).toEqual({ ok: true }));
    a.unmount();
    const b = renderHook(() => useApi(() => load('b'), ['b']));
    expect(b.result.current.loading).toBe(true);
    expect(b.result.current.data).toBeNull();
  });

  it('forgets everything when the session is cleared', async () => {
    const load = vi.fn().mockResolvedValue({ secret: 'user-1' });
    const first = renderHook(() => useApi(() => load(), ['x']));
    await waitFor(() => expect(first.result.current.data).toEqual({ secret: 'user-1' }));
    first.unmount();
    clearQueryCache(); // what session.clear() (sign-out / expired login) does
    const again = renderHook(() => useApi(() => load(), ['x']));
    expect(again.result.current.data).toBeNull();
  });
});
