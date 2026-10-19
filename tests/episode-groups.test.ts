import { expect, it } from 'vitest';
import { normalizeSeriesInfo } from '../server/xtream/normalizer';
import { groupEpisodes } from '../src/player/episodeGroups';
import { nextEpisode, orderedEpisodes } from '../src/player/history';
import { rawVariants, otherSeries, seriesId } from './fixtures/xtream-episode-variants';

it('groups provider-shaped variants without modifying records or losing original sources', () => {
  const detail = normalizeSeriesInfo(rawVariants, seriesId);
  const snapshot = JSON.stringify(detail);
  const grouped = groupEpisodes(detail.episodes, seriesId);
  expect(grouped).toHaveLength(1);
  expect(grouped[0]!.streams.map(stream => stream.id)).toEqual(['406214', '418954', '419000']);
  expect(grouped[0]!.streams[0]).toBe(detail.episodes[1]);
  expect(JSON.stringify(detail)).toBe(snapshot);
  const refreshed = groupEpisodes([...detail.episodes].reverse(), seriesId);
  expect(refreshed[0]!.id).toBe(grouped[0]!.id);
  expect(refreshed[0]!.streams).toEqual(grouped[0]!.streams);
  const other = groupEpisodes(normalizeSeriesInfo(otherSeries, '2751').episodes, '2751');
  expect(other[0]!.streams.map(s => s.id)).toEqual(['405597']);
});

it('keeps seasons, numbers, meaningful title differences and ambiguous records separate', () => {
  const base = { id: 'a', title: 'Return', season: 3, episode_num: 1 };
  const detail = normalizeSeriesInfo({ episodes: { '3': [base, { ...base, id: 'b' },
    { ...base, id: 'next', episode_num: 2 }, { ...base, id: 'title', title: 'Return (Part II)' },
    { ...base, id: 'missing-number', episode_num: undefined }, { ...base, id: 'missing-title', title: '' },
    { ...base, id: 'conflict-number', info: { episode: 2 } },
    { ...base, id: 'conflict-season', info: { season: 4 } },
    { ...base, id: 'conflict-series', series_id: 'another' },
    { ...base, id: 'conflict-title', name: 'Other title' }],
    '4': [{ ...base, season: 4, id: 'season4' }],
    unknown: [{ id: 'unknown1', title: 'Return', episode_num: 1 }, { id: 'unknown2', title: 'Return', episode_num: 1 }]
  } }, 'show');
  const groups = groupEpisodes(orderedEpisodes(detail.episodes), 'show');
  expect(groups).toHaveLength(detail.episodes.length - 1);
  expect(groups.filter(g => g.streams.length > 1).map(g => g.streams.map(s => s.id))).toEqual([['a', 'b']]);
  expect(nextEpisode(detail.episodes, 'a')?.id).not.toBe('b');
});

it('counts logical episodes and skips alternative streams for next-episode playback', () => {
  const episodes = Array.from({ length: 8 }, (_, index) => Array.from({ length: index < 4 ? 3 : 2 }, (_, stream) => ({
    id: `${index}-${stream}`, title: `Episode ${index + 1}`, season: 3, episode_num: index + 1
  }))).flat();
  const detail = normalizeSeriesInfo({ episodes: { '3': episodes } }, 'show');
  expect(detail.episodes).toHaveLength(20);
  expect(groupEpisodes(detail.episodes, 'show')).toHaveLength(8);
  expect(nextEpisode(detail.episodes, '0-2')?.id).toBe('1-0');
});
