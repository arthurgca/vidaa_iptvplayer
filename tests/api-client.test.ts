import { afterEach, expect, it, vi } from 'vitest';
import { api, clearMovieWindows } from '../src/api/client';

afterEach(() => { clearMovieWindows(); vi.restoreAllMocks(); });

it('requests 20 live channels per page while preserving filters and offset', async () => {
  const result = { offset: 40, limit: 20, total: 205, items: [] };
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(result)));
  expect(await api.channels('news', 40, 'match')).toEqual(result);
  const params = new URL(fetch.mock.calls[0]![0] as string, 'http://localhost').searchParams;
  expect(params.get('limit')).toBe('20');
  expect(params.get('offset')).toBe('40');
  expect(params.get('category_id')).toBe('news');
  expect(params.get('search')).toBe('match');
});

it('shares movie window requests, keeps six windows, evicts failures and invalidates on refresh', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ items: [], total: 43534, offset: 0, limit: 120 })));
  await Promise.all([api.movieWindow('', 0), api.movieWindow('', 0)]); expect(fetch).toHaveBeenCalledTimes(1);
  for (let i = 1; i <= 6; i++) await api.movieWindow('', i * 120);
  await api.movieWindow('', 0); expect(fetch).toHaveBeenCalledTimes(8);
  await api.movieWindow('', 0); expect(fetch).toHaveBeenCalledTimes(8);
  await api.refresh(); await api.movieWindow('', 0); expect(fetch).toHaveBeenCalledTimes(10);
  fetch.mockRejectedValueOnce(new Error('offline'));
  await expect(api.movieWindow('broken')).rejects.toThrow('offline');
  await api.movieWindow('broken'); expect(fetch).toHaveBeenCalledTimes(12);
});
