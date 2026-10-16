// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../src/api/client';
import { useFocusManager } from '../src/navigation/FocusContext';
import type { FocusManager } from '../src/navigation/FocusManager';
import { LiveTV } from '../src/screens/LiveTV';
import type { EpgNow } from '../src/types';
import { clearEpgCache } from '../src/api/epg';

let container: HTMLDivElement; let focus: FocusManager;
const channels = [0, 1, 2].map((i) => ({ id: String(i), name: `Channel ${i}`, categoryId: 'news', number: i + 1 }));
const play = vi.fn();
const settle = (ms = 0) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
function Harness() {
  focus = useFocusManager();
  const [query, setQuery] = useState({ category: '', search: '', offset: 0 });
  return <LiveTV query={query} setQuery={setQuery} lastTuned="0" play={play} guide={vi.fn()} />;
}
beforeEach(() => {
  container = document.createElement('div'); document.body.append(container); play.mockClear();
  vi.spyOn(api, 'liveCategories').mockResolvedValue([{ id: 'news', name: 'News' }]);
  vi.spyOn(api, 'channels').mockResolvedValue({ items: channels, total: 3, offset: 0, limit: 20 });
  vi.spyOn(api, 'liveCatalog').mockResolvedValue(channels);
  vi.spyOn(api, 'favorites').mockResolvedValue([{ type: 'live', id: '0', item: channels[0]!, addedAt: 1 }]);
  vi.spyOn(api, 'epg').mockResolvedValue({ progress: 0 });
});
afterEach(() => { act(() => render(null, container)); container.remove(); clearEpgCache(); vi.restoreAllMocks(); });

it('keeps the same editing input through changing and empty results', async () => {
  act(() => render(<Harness />, container)); await settle();
  const input = container.querySelector('input')!;
  const wrapper = input.parentElement!;
  const trace: string[] = [];
  input.addEventListener('input', () => trace.push('input'));
  input.addEventListener('blur', () => trace.push('blur'));
  wrapper.addEventListener('focus', () => trace.push('proxy-focus'));
  const register = focus.register.bind(focus);
  vi.spyOn(focus, 'register').mockImplementation(node => {
    if (node.key === 'live:search') trace.push('register-search');
    register(node);
  });
  act(() => input.focus());
  trace.length = 0;
  for (const value of ['C', 'Ch', 'Channel 2', 'absent', 'absen', '']) {
    act(() => { input.value = value; input.setSelectionRange(value.length, value.length); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await settle();
    expect(container.querySelector('input')).toBe(input);
    expect(document.activeElement, JSON.stringify(trace)).toBe(input);
    expect(input.value).toBe(value);
    expect(input.selectionStart).toBe(value.length);
  }
  expect(trace).not.toContain('blur');
  expect(api.liveCatalog).toHaveBeenCalledTimes(1);
  expect(play).not.toHaveBeenCalled();
});

it('does not take focus when the initial catalog arrives during editing', async () => {
  let resolve!: (value: typeof channels) => void;
  vi.mocked(api.liveCatalog).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  act(() => render(<Harness />, container)); await settle();
  const input = container.querySelector('input')!;
  act(() => { input.focus(); input.value = 'Channel'; input.dispatchEvent(new Event('input', { bubbles: true })); }); await settle();
  act(() => resolve(channels)); await settle();
  expect(container.querySelector('input')).toBe(input);
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe('Channel');
});

it('preserves channel identity, selection and scroll when EPG arrives', async () => {
  let resolve!: (value: EpgNow) => void;
  vi.mocked(api.epg).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  act(() => render(<Harness />, container)); await settle();
  act(() => { focus.focus('live:channel:2'); }); await settle(180);
  const channel = container.querySelector('[data-channel-id="2"]');
  const list = container.querySelector<HTMLElement>('.channel-list')!;
  list.scrollTop = 30;
  const blur = vi.fn(); channel!.addEventListener('blur', blur);
  act(() => resolve({ progress: 0, status: 'empty' })); await settle();
  expect(focus.focused).toBe('live:channel:2');
  expect(document.activeElement).toBe(channel);
  expect(container.querySelector('[data-channel-id="2"]')).toBe(channel);
  expect(container.querySelector('.selected-row')).toBe(channel);
  expect(list.scrollTop).toBe(30);
  expect(blur).not.toHaveBeenCalled();
  expect(play).not.toHaveBeenCalled();
});

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

it('ignores stale programme requests, clears old information immediately and handles missing EPG', async () => {
  let resolve!: (value: EpgNow) => void;
  vi.mocked(api.epg).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  act(() => render(<Harness />, container)); await settle();
  act(() => { focus.focus('live:channel:0'); }); await settle(); await settle(180);
  act(() => { focus.focus('live:channel:1'); }); await settle();
  act(() => resolve({ current: { channelId: '0', title: 'Wrong old programme', start: 1, end: 2 }, progress: 70 }));
  await settle(); await settle(180);
  const pane = container.querySelector('.epg-panel')!;
  expect(pane.textContent).toContain('Channel 1');
  expect(pane.textContent).toContain('Programme information unavailable');
  expect(pane.textContent).not.toContain('Wrong old programme');
  expect(pane.querySelector('.progress')).toBeNull();
  expect(api.favorites).toHaveBeenCalledTimes(1);
});

it('debounces rapid navigation and keeps favorite toggling bound to its channel', async () => {
  act(() => render(<Harness />, container)); await settle();
  act(() => { focus.focus('live:channel:1'); focus.focus('live:channel:2'); }); await settle(); await settle(180);
  expect(api.epg).toHaveBeenCalledTimes(1);
  expect(api.epg).toHaveBeenCalledWith('2');
  vi.spyOn(api, 'favorite').mockResolvedValue({ type: 'live', id: '2', item: channels[2]!, addedAt: 1 });
  act(() => { focus.move('right'); focus.select(); }); await settle();
  expect(api.favorite).toHaveBeenCalledWith({ type: 'live', id: '2', item: channels[2] });
  expect(focus.focused).toBe('live:favorite');
  expect(container.querySelector('.epg-favorite')?.textContent).toContain('★ Favorite');
});
