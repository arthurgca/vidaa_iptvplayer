import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api/client';
import { clearEpgCache, EPG_TTL_MS, isEpgFresh, loadEpg, peekEpg, programProgress } from '../src/api/epg';
import { browseWindow } from '../src/player/Player';

afterEach(() => { clearEpgCache(); vi.restoreAllMocks(); });

const window = (start: number, end: number) => ({ current: { channelId: 'c', title: 'Now', start, end }, next: undefined, progress: 0 });

describe('browse window', () => {
  it('centres the cursor and pins the window to both ends of the list', () => {
    expect(browseWindow(4, 2, 6)).toEqual({ start: 0, end: 4 });
    expect(browseWindow(40, 0, 6)).toEqual({ start: 0, end: 6 });
    expect(browseWindow(40, 20, 6)).toEqual({ start: 17, end: 23 });
    expect(browseWindow(40, 39, 6)).toEqual({ start: 34, end: 40 });
  });
});

describe('EPG cache', () => {
  it('fetches a channel once per TTL and shares an in-flight request', async () => {
    const epg = vi.spyOn(api, 'epg').mockResolvedValue(window(0, 100));
    await Promise.all([loadEpg('cnn'), loadEpg('cnn')]);
    await loadEpg('cnn');
    expect(epg).toHaveBeenCalledTimes(1);
    expect(isEpgFresh('cnn')).toBe(true);
    expect(isEpgFresh('cnn', Date.now() + EPG_TTL_MS + 1)).toBe(false);
  });

  it('keeps serving the last window to rows while a failed lookup stays cached', async () => {
    const epg = vi.spyOn(api, 'epg').mockRejectedValue(new Error('offline'));
    await expect(loadEpg('bbc')).resolves.toBeUndefined();
    expect(peekEpg('bbc')).toBeUndefined();
    expect(epg).toHaveBeenCalledTimes(1);

    epg.mockResolvedValue(window(0, 100));
    clearEpgCache();
    await loadEpg('bbc');
    expect(peekEpg('bbc')?.current?.title).toBe('Now');
  });
});

describe('programme progress', () => {
  it('measures elapsed time locally so cached windows still advance', () => {
    expect(programProgress(window(1_000, 3_000).current, 2_000)).toBe(50);
    expect(programProgress(window(1_000, 3_000).current, 500)).toBe(0);
    expect(programProgress(window(1_000, 3_000).current, 9_000)).toBe(100);
    expect(programProgress(undefined)).toBe(0);
    expect(programProgress({ channelId: 'c', title: 'Bad', start: 5, end: 5 })).toBe(0);
  });
});
