import { expect, it } from 'vitest';
import { normalizeChannels, normalizeSeries, normalizeSeriesInfo, normalizeVod, normalizeVodInfo } from '../server/xtream/normalizer';
import { parseXmltv } from '../server/epg/xmltv';
import { matchEpgChannel } from '../server/epg/matcher';
import { scheduleWindow } from '../server/epg/schedule';

// Synthetic Xtream/XMLTV shapes, not captured provider data. No credentials or real artwork URLs.
it('keeps representative sparse Xtream list/detail metadata usable without inventing artwork or ratings', () => {
  const raw = [
    { stream_id: 501, name: 'Fixture movie', category_id: 'cinema', stream_icon: 'https://artwork.invalid/poster.jpg', rating: '8.2', container_extension: 'mkv' },
    { stream_id: '502', title: 'An exceptionally long fixture title '.repeat(6), category_id: 'family', cover: '', plot: '' }
  ];
  const items = normalizeVod(raw);
  expect(items[0]).toMatchObject({ id: '501', categoryId: 'cinema', poster: 'https://artwork.invalid/poster.jpg', rating: '8.2', extension: 'mkv' });
  expect(items[1]?.name).toBe(raw[1]!.title);
  expect(items[1]?.poster).toBeUndefined(); expect(items[1]?.rating).toBeUndefined(); expect(items[1]?.description).toBeUndefined();
  const detail = normalizeVodInfo({ movie_data: { stream_id: 501, container_extension: 'mkv' }, info: { plot: 'Only available in details', backdrop_path: [] } }, items[0]);
  expect(detail.name).toBe('Fixture movie'); expect(detail.description).toBe('Only available in details'); expect(detail.backdrop).toBeUndefined();
  const series = normalizeSeries([{ series_id: '701', name: 'Fixture series', cover: '', releaseDate: '2025', plot: '' }])[0];
  expect(series).toMatchObject({ id: '701', year: '2025' }); expect(series?.poster).toBeUndefined();
  const episodes = normalizeSeriesInfo({ info: { name: 'Fixture series' }, episodes: { '2': [{ id: 'e2', season: 2, episode_num: 1, title: 'Return', info: { duration: '48m' } }] } }, '701');
  expect(episodes.episodes[0]).toMatchObject({ id: 'e2', season: 2, episode: 1, duration: '48m' });
});

it('maps representative live numbers/logos and consecutive XMLTV programmes without requiring descriptions', () => {
  const channel = normalizeChannels([{ stream_id: 101, name: 'Fixture News HD', num: '7', stream_icon: '', category_id: 2, epg_channel_id: 'fixture.news' }])[0]!;
  const xml = '<tv><channel id="fixture.news"><display-name>Fixture News</display-name></channel><programme start="20261015140000 -0300" stop="20261015143000 -0300" channel="fixture.news"><title>Fixture &amp; News</title></programme><programme start="20261015143000 -0300" stop="20261015150000 -0300" channel="fixture.news"><title>Fixture Next</title><desc>Next description</desc></programme></tv>';
  const parsed = parseXmltv(xml, 0, Date.UTC(2030, 0));
  expect(channel).toMatchObject({ number: 7, categoryId: '2', epgChannelId: 'fixture.news' }); expect(channel.logo).toBeUndefined();
  expect(matchEpgChannel(channel, parsed.channelNames)).toBe('fixture.news');
  const window = scheduleWindow(parsed.programs, Date.UTC(2026, 9, 15, 17, 15), Date.UTC(2026, 9, 15, 18));
  expect(window.map((p) => p.title)).toEqual(['Fixture & News', 'Fixture Next']);
  expect(window[0]?.description).toBeUndefined();
});
