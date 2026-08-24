import { describe, expect, it } from 'vitest';
import { matchEpgChannel, normalizeChannelName } from '../server/epg/matcher';
import { parseXmltv, parseXmltvDate } from '../server/epg/xmltv';

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
});
