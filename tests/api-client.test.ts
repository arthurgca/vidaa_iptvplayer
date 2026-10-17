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

it('rejects an old backend detail response at the Series catalog URL and retries without caching it', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ item: { id: 'catalog' }, episodes: [] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'show' }], total: 1, offset: 0, limit: 120 })));
  await expect(api.seriesWindow()).rejects.toThrow('Invalid catalog response');
  expect((await api.seriesWindow()).items[0]?.id).toBe('show');
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('shares small Home previews, isolates providers and orders, preserves warm catalog windows on Home saves, and invalidates refreshes', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => new Response(JSON.stringify(String(url).includes('/home/')
    ? { rows: [], failed: false } : { items: [], total: 10, offset: 0, limit: 120 })));
  await api.movieWindow();
  await Promise.all([api.homeCatalog('movies', 'A', ['1', '2']), api.homeCatalog('movies', 'A', ['1', '2'])]);
  expect(fetch).toHaveBeenCalledTimes(2);
  await api.homeCatalog('movies', 'B', ['1', '2']); await api.homeCatalog('movies', 'A', ['2', '1']); expect(fetch).toHaveBeenCalledTimes(4);
  await api.saveConfig({ homePreferences: null, homeProviderKey: 'A' });
  await api.movieWindow(); expect(fetch).toHaveBeenCalledTimes(5); // Home preferences did not discard the movie window
  await api.homeCatalog('movies', 'A', ['1', '2']); expect(fetch).toHaveBeenCalledTimes(6);
  await api.refresh(); await api.homeCatalog('movies', 'A', ['1', '2']); expect(fetch).toHaveBeenCalledTimes(8);
});

it('does not retain failed Home previews or let an invalidated in-flight preview replace a newer entry', async () => {
  let complete!: (response: Response) => void;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }))
    .mockResolvedValue(new Response(JSON.stringify({ rows: [], failed: false })));
  const old = api.homeCatalog('movies', 'A', ['1']); clearMovieWindows();
  const newer = api.homeCatalog('movies', 'A', ['1']); await newer;
  complete(new Response(JSON.stringify({ rows: [], failed: true }))); await old;
  await api.homeCatalog('movies', 'A', ['1']); expect(fetch).toHaveBeenCalledTimes(2);
  clearMovieWindows(); fetch.mockImplementation(async () => new Response(JSON.stringify({ rows: [], failed: true })));
  await api.homeCatalog('movies', 'A', ['1']); await api.homeCatalog('movies', 'A', ['1']); expect(fetch).toHaveBeenCalledTimes(4);
});
