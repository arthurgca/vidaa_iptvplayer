import { describe, expect, it } from 'vitest';
import { normalizeChannels, normalizeSeriesInfo, normalizeVod } from '../server/xtream/normalizer';
import { normalizeBaseUrl, streamUrl } from '../server/xtream/client';

describe('Xtream normalization', () => {
  it('normalizes common provider response variations', () => {
    expect(normalizeChannels([{ stream_id: 7, name: 'News', category_id: 2, stream_icon: 'logo', epg_channel_id: 'news.hd' }])[0]).toMatchObject({ id: '7', categoryId: '2', logo: 'logo' });
    expect(normalizeVod([{ id: '9', title: 'Movie', cover: 'poster' }])[0]).toMatchObject({ id: '9', name: 'Movie' });
    expect(normalizeSeriesInfo({ info: { name: 'Show' }, episodes: { '1': [{ id: '11', title: 'Pilot', episode_num: 1 }] } }, '3').episodes[0]).toMatchObject({ id: '11', season: 1, episode: 1 });
  });
  it('validates provider schemes and constructs encoded stream URLs', () => {
    expect(() => normalizeBaseUrl('file:///etc/passwd')).toThrow(/HTTP/);
    process.env.XTREAM_BASE_URL = 'http://iptv.example:8080'; process.env.XTREAM_USERNAME = 'my user'; process.env.XTREAM_PASSWORD = 'p/word';
    expect(streamUrl('live', '123', 'm3u8')).toBe('http://iptv.example:8080/live/my%20user/p%2Fword/123.m3u8');
    delete process.env.XTREAM_BASE_URL; delete process.env.XTREAM_USERNAME; delete process.env.XTREAM_PASSWORD;
  });
});
