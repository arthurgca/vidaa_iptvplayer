// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../src/api/client';
import { useFocusManager } from '../src/navigation/FocusContext';
import type { FocusManager } from '../src/navigation/FocusManager';
import { LiveTV } from '../src/screens/LiveTV';
import type { EpgNow } from '../src/types';

let container: HTMLDivElement; let focus: FocusManager;
const channels = [0, 1, 2].map((i) => ({ id: String(i), name: `Channel ${i}`, categoryId: 'news', number: i + 1 }));
const play = vi.fn();
const settle = (ms = 0) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
function Harness() {
  focus = useFocusManager();
  return <LiveTV query={{ category: '', search: '', offset: 0 }} setQuery={vi.fn()} lastTuned="0" play={play} guide={vi.fn()} />;
}
beforeEach(() => {
  container = document.createElement('div'); document.body.append(container); play.mockClear();
  vi.spyOn(api, 'liveCategories').mockResolvedValue([{ id: 'news', name: 'News' }]);
  vi.spyOn(api, 'channels').mockResolvedValue({ items: channels, total: 3, offset: 0, limit: 20 });
  vi.spyOn(api, 'favorites').mockResolvedValue([{ type: 'live', id: '0', item: channels[0]!, addedAt: 1 }]);
  vi.spyOn(api, 'epg').mockResolvedValue({ progress: 0 });
});
afterEach(() => { act(() => render(null, container)); container.remove(); vi.restoreAllMocks(); });

it('updates preview without tuning, marks the last tuned channel independently, and only tunes on OK', async () => {
  act(() => render(<Harness />, container)); await settle(); await settle(140);
  act(() => { focus.focus('live:channel:1'); }); await settle();
  expect(container.querySelector('.selected-row')?.textContent).toContain('Channel 1');
  expect(container.querySelector('.tuned-badge')?.closest('button')?.textContent).toContain('Channel 0');
  expect(container.querySelector('.channel-star')).not.toBeNull();
  expect(play).not.toHaveBeenCalled();
  act(() => focus.select()); expect(play).toHaveBeenCalledWith(channels[1], channels);
  expect(api.favorites).toHaveBeenCalledTimes(1);
});

it('cancels stale programme requests, clears old information immediately and handles missing EPG', async () => {
  let resolve!: (value: EpgNow) => void;
  vi.mocked(api.epg).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  act(() => render(<Harness />, container)); await settle();
  act(() => { focus.focus('live:channel:0'); }); await settle(); await settle(145);
  const signal = vi.mocked(api.epg).mock.calls[0]?.[1];
  act(() => { focus.focus('live:channel:1'); }); await settle();
  expect(signal?.aborted).toBe(true);
  act(() => resolve({ current: { channelId: '0', title: 'Wrong old programme', start: 1, end: 2 }, progress: 70 }));
  await settle(); await settle(145);
  const pane = container.querySelector('.epg-panel')!;
  expect(pane.textContent).toContain('Channel 1');
  expect(pane.textContent).toContain('No programme information');
  expect(pane.textContent).toContain('Next programme unavailable');
  expect(pane.textContent).not.toContain('Wrong old programme');
  expect(pane.querySelector('.progress')).toBeNull();
  expect(api.favorites).toHaveBeenCalledTimes(1);
});

it('debounces rapid navigation and keeps favorite toggling bound to its channel', async () => {
  act(() => render(<Harness />, container)); await settle();
  act(() => { focus.focus('live:channel:1'); focus.focus('live:channel:2'); }); await settle(); await settle(145);
  expect(api.epg).toHaveBeenCalledTimes(1);
  expect(api.epg).toHaveBeenCalledWith('2', expect.any(AbortSignal));
  vi.spyOn(api, 'favorite').mockResolvedValue({ type: 'live', id: '2', item: channels[2]!, addedAt: 1 });
  act(() => { focus.move('right'); focus.select(); }); await settle();
  expect(api.favorite).toHaveBeenCalledWith({ type: 'live', id: '2', item: channels[2] });
  expect(focus.focused).toBe('live:favorite');
  expect(container.querySelector('.epg-favorite')?.textContent).toContain('★ Favorite');
});
