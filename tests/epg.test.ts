import { describe, expect, it } from 'vitest';
import { matchEpgChannel, normalizeChannelName } from '../server/epg/matcher';
import { parseXmltv, parseXmltvDate } from '../server/epg/xmltv';
import { normalizeEpgRows, epgTimestamp, decodeEpgText } from '../server/epg/xtream';
import { scheduleWindow } from '../server/epg/schedule';

describe('EPG', () => {
  it('parses XMLTV dates, channels, entities and programme metadata', () => {
    const xml = `<?xml version="1.0"?><tv><channel id="cnn.us"><display-name>CNN HD</display-name></channel><programme start="20260824140000 -0300" stop="20260824150000 -0300" channel="cnn.us"><title>CNN &amp; World</title><desc>Headlines</desc></programme></tv>`;
    const parsed = parseXmltv(xml, 0, Date.UTC(2030, 0));
    expect(parsed.channelNames['cnn.us']).toEqual(['CNN HD']);
    expect(parsed.programs[0]).toMatchObject({ channelId: 'cnn.us', title: 'CNN & World', description: 'Headlines' });
    expect(parseXmltvDate('20260824140000 -0300')).toBe(Date.UTC(2026, 7, 24, 17));
  });
  it('matches exact IDs first and uses conservative normalized names', () => {
    const names = { 'cnn.us': ['CNN'], 'cnn.int': ['CNN International'] };
    expect(matchEpgChannel({ id: '1', name: 'Anything', categoryId: 'x', epgChannelId: 'cnn.us' }, names)).toBe('cnn.us');
    expect(normalizeChannelName('BR: CNN FHD')).toBe('cnn');
    expect(matchEpgChannel({ id: '2', name: 'CNN HD', categoryId: 'x' }, names)).toBe('cnn.us');
  });
  it('converts offsets across midnight and rejects invalid calendar dates and ambiguous wall clocks', () => {
    expect(parseXmltvDate('20261015233000 -0300')).toBe(Date.UTC(2026, 9, 16, 2, 30));
    expect(parseXmltvDate('20261016053000 +0300')).toBe(Date.UTC(2026, 9, 16, 2, 30));
    expect(parseXmltvDate('20261016023000')).toBe(Date.UTC(2026, 9, 16, 2, 30));
    expect(parseXmltvDate('20260230023000 -0300')).toBe(0);
    expect(parseXmltvDate('20261016253000 -0300')).toBe(0);
    expect(epgTimestamp(undefined, '2026-10-15 23:30:00')).toBeNaN();
    expect(epgTimestamp('1792117800', 'ignored')).toBe(1792117800000);
    expect(epgTimestamp(undefined, '2026-10-15T23:30:00-03:00')).toBe(Date.UTC(2026, 9, 16, 2, 30));
  });
  it('preserves plain text, decodes provider base64 and removes blank, placeholder, duplicate and malformed records', () => {
    expect(decodeEpgText('Evening news')).toBe('Evening news');
    expect(decodeEpgText(Buffer.from('Notícias às 23h').toString('base64'))).toBe('Notícias às 23h');
    const item = { title: Buffer.from('News').toString('base64'), start_timestamp: 100, stop_timestamp: 200 };
    const rows = normalizeEpgRows([item, item, { ...item, title: '' }, { ...item, title: 'No programmes' }, { ...item, stop_timestamp: 50 }, { ...item, start_timestamp: 'bad' }], 'a');
    expect(scheduleWindow(rows, 0, 300_000)).toEqual([{ channelId: 'a', title: 'News', description: undefined, start: 100_000, end: 200_000 }]);
  });
});
