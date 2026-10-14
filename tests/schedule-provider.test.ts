import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleForChannel } from '../server/epg/service';
import { xtream } from '../server/xtream/client';

vi.mock('../server/config', () => ({ dataDir: '.', getConfig: () => ({ demoMode: false }) }));
vi.mock('../server/xtream/client', () => ({ xtream: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const channel = { id: '42', name: 'News', categoryId: 'news', epgChannelId: 'news.id' };
const entry = { title: Buffer.from('Evening news').toString('base64'), description: Buffer.from('The latest news').toString('base64'), start_timestamp: 100, stop_timestamp: 200 };

describe('provider guide schedules', () => {
  it('loads and decodes the provider full schedule rather than limiting it to now/next', async () => {
    vi.mocked(xtream).mockResolvedValue({ epg_listings: [entry, { ...entry, start_timestamp: 200, stop_timestamp: 300 }] });
    const programs = await scheduleForChannel(channel, 100_000, 300_000);
    expect(programs).toHaveLength(2);
    expect(programs[0]).toMatchObject({ title: 'Evening news', description: 'The latest news', start: 100_000, end: 200_000 });
    expect(xtream).toHaveBeenCalledWith('get_simple_data_table', { stream_id: '42' });
  });

  it.each(['empty', 'unsupported'])('falls back to short EPG when the full schedule is %s', async (reason) => {
    const mock = vi.mocked(xtream);
    if (reason === 'unsupported') mock.mockRejectedValueOnce(new Error('Unsupported action'));
    else mock.mockResolvedValueOnce({ epg_listings: [] });
    mock.mockResolvedValueOnce({ epg_listings: [entry] });
    expect(await scheduleForChannel(channel, 100_000, 300_000)).toHaveLength(1);
    expect(mock).toHaveBeenLastCalledWith('get_short_epg', { stream_id: '42', limit: '100' });
  });

  it('keeps unavailable schedules empty and prevents invalid programme times entering the grid', async () => {
    vi.mocked(xtream).mockResolvedValue({ epg_listings: [{ ...entry, stop_timestamp: 50 }, { ...entry, stop_timestamp: 'bad', end: 'bad' }] });
    expect(await scheduleForChannel(channel, 100_000, 300_000)).toEqual([]);
    vi.mocked(xtream).mockRejectedValue(new Error('Offline'));
    expect(await scheduleForChannel(channel, 100_000, 300_000)).toEqual([]);
  });
});
