import { describe, expect, it } from 'vitest';
import { liveSelection } from '../server/liveSelection';
import type { HistoryItem } from '../server/types';

const channels = Array.from({ length: 205 }, (_, index) => ({ id: String(index), name: `Current ${index}`, categoryId: 'news' }));
const history: HistoryItem[] = [
  { type: 'movie', id: 'movie', item: { id: 'movie', name: 'Movie', categoryId: '' }, position: 10, duration: 100, watchedAt: 3 },
  { type: 'live', id: '204', item: { ...channels[204]!, name: 'Stale name' }, position: 0, duration: 0, watchedAt: 2 },
  { type: 'live', id: '1', item: channels[1]!, position: 0, duration: 0, watchedAt: 1 }
];

describe('live playback selection', () => {
  it('restores the most recent live channel and its page using current catalog metadata', () => {
    const selection = liveSelection(channels, history, true);
    expect(selection.channel).toEqual(channels[204]);
    expect(selection.offset).toBe(200);
    expect(selection.channels).toEqual(channels.slice(200));
  });

  it('ignores saved channels when remembering is disabled', () => {
    expect(liveSelection(channels, history, false).channel).toEqual(channels[0]);
    expect(liveSelection(channels, history, false).offset).toBe(0);
  });

  it('falls back to the first available channel for missing history or a removed channel', () => {
    expect(liveSelection(channels, [], true).channel).toEqual(channels[0]);
    expect(liveSelection(channels.slice(0, 200), history, true).channel).toEqual(channels[0]);
    expect(liveSelection([], history, true)).toEqual({ channel: undefined, offset: 0, channels: [] });
  });
});
