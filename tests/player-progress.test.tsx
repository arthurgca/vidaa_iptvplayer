// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api/client';
import { clearEpgCache } from '../src/api/epg';
import { Player, PROGRESS_SAVE_INTERVAL_MS, type Playable } from '../src/player/Player';
import type { RemoteAction } from '../src/platform/remote';
import type { TrackVideo } from '../src/player/tracks';

let container: HTMLDivElement;
let video: HTMLVideoElement;
let action: ((action: RemoteAction) => boolean) | null;
const movie: Playable = { type: 'movie', id: 'movie', item: { id: 'movie', name: 'Movie', categoryId: '' } };
const event = (name: string) => act(() => { video.dispatchEvent(new Event(name)); });
const advance = (time = PROGRESS_SAVE_INTERVAL_MS) => act(() => { vi.advanceTimersByTime(time); });

function mount(media = movie) {
  act(() => render(<Player media={media} registerAction={(handler) => { action = handler; }} close={() => undefined} />, container));
  video = container.querySelector('video')!;
  Object.defineProperty(video, 'duration', { configurable: true, value: 300 });
  Object.defineProperty(video, 'paused', { configurable: true, value: false });
}

beforeEach(() => {
  vi.useFakeTimers(); clearEpgCache();
  container = document.createElement('div'); document.body.append(container);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'textTracks', 'get').mockReturnValue(Object.assign(new EventTarget(), { length: 0 }) as TextTrackList);
  vi.spyOn(HTMLMediaElement.prototype as TrackVideo, 'audioTracks', 'get').mockReturnValue(Object.assign(new EventTarget(), { length: 0 }) as NonNullable<TrackVideo['audioTracks']>);
  vi.spyOn(api, 'watched').mockImplementation(async (row) => ({ ...row, watchedAt: Date.now() }));
  vi.spyOn(api, 'epg').mockResolvedValue({ progress: 0 });
});

afterEach(() => {
  act(() => render(null, container)); container.remove();
  vi.useRealTimers(); vi.restoreAllMocks();
});

describe('watch progress checkpoints', () => {
  it('jumps six browse rows with page buttons without tuning until OK', () => {
    const channels = Array.from({ length: 14 }, (_, index) => ({ id: String(index), name: `Channel ${index}`, categoryId: '' }));
    mount({ type: 'live', id: '0', item: channels[0]!, channels }); event('playing');
    act(() => { action?.('NAV_LEFT'); });
    act(() => { action?.('CHANNEL_DOWN'); });
    expect(container.querySelector('.browse-row-active .browse-name strong')?.textContent).toBe('Channel 6');
    expect(video.src).toContain('/api/play/live/0');
    act(() => { action?.('CHANNEL_DOWN'); });
    act(() => { action?.('CHANNEL_DOWN'); });
    expect(container.querySelector('.browse-row-active .browse-name strong')?.textContent).toBe('Channel 13');
    act(() => { action?.('CHANNEL_UP'); });
    expect(container.querySelector('.browse-row-active .browse-name strong')?.textContent).toBe('Channel 7');
    act(() => { action?.('SELECT'); });
    expect(video.src).toContain('/api/play/live/7');
  });

  it('saves during playback without leaving the player and retries after a failed save', async () => {
    mount(); event('loadedmetadata'); event('playing');
    vi.mocked(api.watched).mockClear();
    vi.mocked(api.watched).mockRejectedValueOnce(new Error('Offline'));
    video.currentTime = 120; advance();
    expect(api.watched).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'movie', position: 120, duration: 300, completed: false }), true);
    await act(async () => { await Promise.resolve(); });
    video.currentTime = 135; advance();
    expect(api.watched).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.watched).mock.calls[1]?.[0].position).toBe(135);
  });

  it('flushes the current position on hide, page exit, pause, and player exit', () => {
    mount(); event('loadedmetadata'); event('playing');
    video.currentTime = 123;
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(api.watched).toHaveBeenLastCalledWith(expect.objectContaining({ position: 123 }), true);
    video.currentTime = 124;
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(api.watched).toHaveBeenLastCalledWith(expect.objectContaining({ position: 124 }), true);
    video.currentTime = 125; event('pause');
    expect(api.watched).toHaveBeenLastCalledWith(expect.objectContaining({ position: 125 }), true);
    video.currentTime = 126;
    act(() => render(null, container));
    expect(api.watched).toHaveBeenLastCalledWith(expect.objectContaining({ position: 126 }), true);
    const calls = vi.mocked(api.watched).mock.calls.length;
    advance();
    act(() => { window.dispatchEvent(new Event('pagehide')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(api.watched).toHaveBeenCalledTimes(calls);
  });

  it('does not save media that never started or lose the requested resume position', () => {
    mount({ ...movie, resumeAt: 120 });
    advance();
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(api.watched).not.toHaveBeenCalled();
    event('playing');
    expect(api.watched).toHaveBeenLastCalledWith(expect.objectContaining({ position: 120 }), true);
  });

  it('preserves completion and orders snapshots even when several events occur in one millisecond', () => {
    mount(); event('loadedmetadata'); event('playing');
    video.currentTime = 300; event('ended');
    video.currentTime = 0;
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(api.watched).toHaveBeenLastCalledWith(expect.objectContaining({ position: 300, completed: true }), true);
    const checkpoints = vi.mocked(api.watched).mock.calls.map(([row]) => row.checkpointAt!);
    expect(checkpoints.every((time, index) => index === 0 || time > checkpoints[index - 1]!)).toBe(true);
  });

  it('records live channels as soon as they play and keeps channel switches in separate sessions', () => {
    const channels = [{ id: '1', name: 'One', categoryId: '' }, { id: '2', name: 'Two', categoryId: '' }];
    mount({ type: 'live', id: '1', item: channels[0]!, channels });
    event('playing');
    expect(api.watched).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'live', id: '1' }), true);
    act(() => { action?.('CHANNEL_DOWN'); });
    event('playing');
    video.currentTime = 15; advance();
    expect(api.watched).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'live', id: '2', position: 15 }), true);
  });
});
