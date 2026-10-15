// @vitest-environment jsdom
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../src/api/client';
import { clearEpgCache } from '../src/api/epg';
import { LiveTV } from '../src/screens/LiveTV';
import { useFocusManager } from '../src/navigation/FocusContext';
import type { FocusManager } from '../src/navigation/FocusManager';
import type { Channel, EpgNow } from '../src/types';

let container: HTMLDivElement, focus: FocusManager;
const channels: Channel[] = Array.from({ length: 8726 }, (_, i) => ({ id: String(i), name: i === 8725 ? 'End needle' : i === 10 || i === 11 ? 'Duplicate' : `Channel ${i}`, categoryId: i % 2 ? 'news' : 'sport' }));
const play = vi.fn();
const settle = (ms = 0) => act(() => new Promise<void>(resolve => setTimeout(resolve, ms)));
function Harness({ anchor }: { anchor?: string }) {
  focus = useFocusManager();
  const [query, setQuery] = useState({ category: '', search: '', offset: 0 });
  return <LiveTV query={query} setQuery={setQuery} restoreFocus={anchor} play={play} guide={vi.fn()} />;
}
const press = async (key: string) => { act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }); await settle(); };
const mount = async (anchor?: string) => { act(() => render(<Harness anchor={anchor} />, container)); await settle(); await settle(); };
const click = async (text: string) => { act(() => [...container.querySelectorAll('button')].find(node => node.textContent === text)!.click()); await settle(); };
const search = async (text: string) => { act(() => { const input = container.querySelector('input')!; input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); }); await settle(); };
beforeEach(() => {
  container = document.createElement('div'); document.body.append(container); play.mockClear(); clearEpgCache();
  vi.spyOn(api, 'liveCategories').mockResolvedValue([{ id: 'news', name: 'News' }, { id: 'sport', name: 'Sport' }, { id: 'empty', name: 'Empty' }]);
  vi.spyOn(api, 'liveCatalog').mockResolvedValue(channels);
  vi.spyOn(api, 'favorites').mockResolvedValue([]);
  vi.spyOn(api, 'epg').mockResolvedValue({ progress: 0, status: 'unavailable' });
});
afterEach(() => { act(() => render(null, container)); container.remove(); vi.restoreAllMocks(); clearEpgCache(); });

it('crosses old page boundaries, jumps logical viewports and clamps at both catalog ends without tuning', async () => {
  await mount('live:channel:19'); expect(focus.focused).toBe('live:channel:19');
  await press('ArrowDown'); expect(focus.focused).toBe('live:channel:20');
  await press('PageDown'); expect(focus.focused).toBe('live:channel:26');
  for (let i = 0; i < 100; i++) await press('ArrowDown');
  expect(focus.focused).toBe('live:channel:126'); expect(container.querySelectorAll('.channel-row').length).toBeLessThan(15);
  expect(api.liveCatalog).toHaveBeenCalledTimes(1); expect(play).not.toHaveBeenCalled();
  act(() => render(null, container)); await mount('live:channel:8725');
  await press('ArrowDown'); await press('PageDown'); expect(focus.focused).toBe('live:channel:8725');
  act(() => render(null, container)); await mount('live:channel:0');
  await press('PageUp'); expect(focus.focused).toBe('live:channel:0');
  await press('ArrowUp'); expect(focus.focused).toBe('live:categories');
});

it('traps category focus, cancels to its origin, retains the selected ID, and handles empty categories', async () => {
  await mount('live:channel:35');
  await press('ArrowLeft'); await settle(5); expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  expect(focus.focus('live:guide')).toBe(false);
  await press('Escape'); expect(focus.focused).toBe('live:channel:35');
  await press('ArrowLeft'); await click('News'); expect(focus.focused).toBe('live:channel:35');
  await press('ArrowLeft'); await click('Sport'); expect(focus.focused).toBe('live:channel:0');
  await press('ArrowLeft'); await click('Empty'); expect(focus.focused).toBe('live:search');
  expect(container.querySelectorAll('.channel-row')).toHaveLength(0);
  await press('ArrowLeft'); await press('Enter'); await click('All channels'); expect(focus.focused).toBe('live:channel:0');
});

it('searches the entire selected category, finds the final channel and restores browsing after clear', async () => {
  await mount('live:channel:300'); act(() => { focus.focus('live:search'); });
  await search('needle'); expect(container.querySelectorAll('.channel-row')).toHaveLength(1); expect(container.textContent).toContain('End needle');
  await search(''); await press('ArrowDown'); expect(focus.focused).toBe('live:channel:300');
  await press('ArrowLeft'); await click('Sport'); act(() => { focus.focus('live:search'); });
  await search('needle'); expect(container.querySelectorAll('.channel-row')).toHaveLength(0);
  expect(api.liveCatalog).toHaveBeenCalledTimes(1);
});

it('retains duplicate names by ID and tunes exactly the highlighted channel once with the full queue', async () => {
  await mount('live:channel:10'); await press('ArrowDown'); await press('Enter');
  expect(play).toHaveBeenCalledTimes(1); expect(play).toHaveBeenCalledWith(channels[11], channels);
});

it.each(['unavailable', 'empty', 'error'] as const)('presents EPG %s without a schedule or progress', async status => {
  vi.mocked(api.epg).mockResolvedValue({ progress: 90, status });
  await mount(); await settle(190);
  expect(container.querySelector('.epg-panel .progress')).toBeNull();
  expect(container.querySelector('.epg-program')?.textContent).toContain(status === 'error' ? 'could not be loaded' : status === 'empty' ? 'No programme scheduled now' : 'unavailable');
});

it('shows loading distinctly, rejects placeholder/invalid programmes and reuses cached revisits', async () => {
  let done!: (value: EpgNow) => void;
  vi.mocked(api.epg).mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
  await mount(); expect(container.querySelector('.epg-program')?.textContent).toContain('Loading'); await settle(180);
  act(() => done({ current: { channelId: '0', title: 'No programmes', start: Date.now() - 100, end: Date.now() + 60000 }, progress: 50 })); await settle();
  expect(container.querySelector('.epg-panel .progress')).toBeNull();
  await press('ArrowDown'); await settle(190); await press('ArrowUp'); await settle(190);
  expect(api.epg).toHaveBeenCalledTimes(2);
});

it('keeps headers operable while catalog loading and offers retry after failure', async () => {
  let reject!: (error: Error) => void;
  vi.mocked(api.liveCatalog).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  await mount(); await press('PageDown'); expect(container.querySelectorAll('.channel-row')).toHaveLength(0);
  act(() => { focus.focus('live:categories'); }); await press('Enter'); await click('All channels');
  act(() => reject(new Error('Offline'))); await settle(); await settle(); expect(focus.focused).toBe('live:retry');
  await press('Enter'); await settle(); expect(focus.focused).toBe('live:channel:0');
});
