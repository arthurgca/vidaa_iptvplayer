import { afterEach, expect, it, vi } from 'vitest';
import { normalizeSeriesInfo } from '../server/xtream/normalizer';
import { seriesIndex } from '../server/xtream/movieIndex';
import { clearXtreamCache, xtream } from '../server/xtream/client';
import { api, clearMovieWindows } from '../src/api/client';
import { orderedEpisodes } from '../src/player/history';

afterEach(() => { clearMovieWindows(); clearXtreamCache(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it('preserves zero, empty declarations, group numbers, absent numbers and numeric ordering', () => {
  const detail = normalizeSeriesInfo({ seasons: [{ season_number: '10', name: 'Provider season ten' }, { season_number: 0 }, { season_number: 3 }], episodes: {
    '10': [{ id: 'ten', episode_num: '10', title: 'Same' }, { id: 'two', episode_num: '2', title: 'Same', container_extension: 'mkv', info: { movie_image: 'thumb', duration_secs: 120, plot: 'Plot' } }, { id: 'unknown' }, { id: 'two-again', episode_num: 2 }],
    '0': [{ id: 'special', episode_num: '0', season: '0' }],
    '2': [],
    extras: [{ id: 'extra' }], bonus: [{ id: 'bonus' }]
  } }, 'show');
  expect(detail.seasons.map(s => s.number)).toEqual([0, 2, 3, 10, undefined, undefined]);
  expect(detail.episodes.find(e => e.id === 'special')).toMatchObject({ season: 0, episode: 0, seasonId: '0' });
  expect(detail.episodes.find(e => e.id === 'unknown')).toMatchObject({ season: 10, episode: null, name: '' });
  expect(detail.episodes.find(e => e.id === 'two')).toMatchObject({ id: 'two', extension: 'mkv', thumbnail: 'thumb', duration: '2 min', description: 'Plot' });
  expect(orderedEpisodes(detail.episodes).map(e => e.id)).toEqual(['special', 'two', 'two-again', 'ten', 'unknown', 'extra', 'bonus']);
  expect(detail.episodes.find(e => e.id === 'extra')?.seasonId).not.toBe(detail.episodes.find(e => e.id === 'bonus')?.seasonId);
});

it('accepts flat and nested arrays, ignores malformed rows and falls back to real catalog metadata', () => {
  const seed = { id: 'show', name: 'Real name', categoryId: 'cat', poster: 'cover', description: 'Catalog plot' };
  const flat = normalizeSeriesInfo({ info: { name: '', cover: '', rating: '0' }, episodes: [null, {}, { stream_id: 'flat', info: { season: '10', episode: '2', cover_big: 'thumb' } }] }, 'show', seed);
  expect(flat.item).toMatchObject(seed); expect(flat.item.rating).toBe('0');
  expect(flat.episodes).toHaveLength(1); expect(flat.episodes[0]).toMatchObject({ season: 10, episode: 2, thumbnail: 'thumb' });
  const nested = normalizeSeriesInfo({ episodes: [[{ id: 'zero' }], [{ id: 'one' }]] }, 'show');
  expect(nested.episodes.map(e => e.season)).toEqual([0, 1]);
  expect(normalizeSeriesInfo({ seasons: [{ season_number: 10 }] }, 'show').episodes).toEqual([]);
  expect(normalizeSeriesInfo({ seasons: { '10': { name: 'Provider season' }, '0': {} } }, 'show').seasons)
    .toEqual([{ id: '0', number: 0, name: undefined }, { id: '10', number: 10, name: 'Provider season' }]);
});

it('indexes 10,708 real identifiers once, searches the full category and preserves multi-category membership', () => {
  const raw = Array.from({ length: 10708 }, (_, i) => ({ series_id: String(i), name: i === 10707 ? 'Última série' : `Show ${i}`, category_id: i % 2 ? 'odd' : 'even', last_modified: i, rating: i % 2 ? '8' : '0' }));
  raw.push({ ...raw[10707]!, category_id: 'extra' });
  const index = seriesIndex(raw); expect(seriesIndex(raw)).toBe(index);
  expect(index.page().total).toBe(10708);
  expect(index.page('odd', 'ultima serie').items[0]?.id).toBe('10707');
  expect(index.page('extra').items.map(i => i.id)).toEqual(['10707']);
  expect(index.page('', '', 0, 120, '', 'added-desc').items[0]?.id).toBe('10707');
  expect(index.page('', '', 0, 120, '', 'rating-asc').items[0]?.rating).toBe('8');
  expect(index.page('', '', 999999).items.slice(-1)[0]?.id).toBe('10707');
});

it('coalesces browser details, reuses them across seasons, evicts errors, expires and invalidates on refresh', async () => {
  let now = Date.now(); vi.spyOn(Date, 'now').mockImplementation(() => now);
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => new Response(JSON.stringify(String(input).includes('/catalog?') ? { items: [], total: 0, offset: 0, limit: 120 } : { item: { id: 'show' }, episodes: [] })));
  const [a, b] = await Promise.all([api.seriesInfo('show'), api.seriesInfo('show')]); expect(a).toBe(b); expect(fetch).toHaveBeenCalledTimes(1);
  await api.seriesInfo('show'); expect(fetch).toHaveBeenCalledTimes(1);
  now += 300001; await api.seriesInfo('show'); expect(fetch).toHaveBeenCalledTimes(2);
  for (let i = 0; i < 8; i++) await api.seriesInfo(String(i));
  await api.seriesInfo('show'); expect(fetch).toHaveBeenCalledTimes(11);
  fetch.mockRejectedValueOnce(new Error('offline')); await expect(api.seriesInfo('failed')).rejects.toThrow(); await api.seriesInfo('failed'); expect(fetch).toHaveBeenCalledTimes(13);
  await api.seriesWindow(); await api.seriesWindow(); expect(fetch).toHaveBeenCalledTimes(14);
  await api.refresh(); await api.seriesInfo('show'); await api.seriesWindow(); expect(fetch).toHaveBeenCalledTimes(17);
});

it('rejects authentication objects for Series and bounds raw detail cache without evicting the catalog', async () => {
  vi.stubEnv('XTREAM_BASE_URL', 'http://fixture.invalid'); vi.stubEnv('XTREAM_USERNAME', 'fixture'); vi.stubEnv('XTREAM_PASSWORD', 'fixture');
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{"user_info":{"auth":0}}')).mockImplementation(async input => new Response(String(input).includes('get_series_info') ? '{"info":{},"episodes":{}}' : '[]'));
  await expect(xtream('get_series')).rejects.toThrow('invalid series catalog');
  await xtream('get_series');
  await Promise.all([xtream('get_series_info', { series_id: '0' }), xtream('get_series_info', { series_id: '0' })]); expect(fetch).toHaveBeenCalledTimes(3);
  for (let i = 1; i <= 24; i++) await xtream('get_series_info', { series_id: String(i) });
  await xtream('get_series'); expect(fetch).toHaveBeenCalledTimes(27);
  await xtream('get_series_info', { series_id: '0' }); expect(fetch).toHaveBeenCalledTimes(28);
});
