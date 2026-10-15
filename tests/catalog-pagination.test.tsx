// @vitest-environment jsdom
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { api } from '../src/api/client';
import { emptyCatalogQuery, type CatalogQuery } from '../src/hooks/useCatalogPage';
import { FocusProvider, useFocusManager } from '../src/navigation/FocusContext';
import type { FocusManager } from '../src/navigation/FocusManager';
import { LiveTV } from '../src/screens/LiveTV';
import { MediaCatalog } from '../src/screens/MediaCatalog';
import type { Channel, Page, VodItem } from '../src/types';

let container: HTMLDivElement;
let focus: FocusManager;
const open = vi.fn();
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const settle = () => act(tick);
const button = (label: string) => [...container.querySelectorAll('button')].find((node) => node.textContent === label)!;
const click = async (label: string) => { act(() => button(label).click()); await settle(); };
const page = <T,>(items: T[], offset: number, limit: number): Page<T> => ({ items: items.slice(offset, offset + limit), offset, limit, total: items.length });
const movies: VodItem[] = Array.from({ length: 125 }, (_, index) => ({ id: String(index), name: `Movie ${index}`, categoryId: 'drama' }));
const channels: Channel[] = Array.from({ length: 205 }, (_, index) => ({ id: String(index), name: `Channel ${index}`, categoryId: 'news' }));

function Harness({ kind, initial = emptyCatalogQuery(), restoreFocus }: { kind: 'live' | 'movies' | 'series'; initial?: CatalogQuery; restoreFocus?: string }) {
  focus = useFocusManager();
  const [query, setQuery] = useState(initial);
  return kind === 'live'
    ? <LiveTV query={query} setQuery={setQuery} restoreFocus={restoreFocus} play={open} guide={() => undefined} />
    : <MediaCatalog kind={kind} query={query} setQuery={setQuery} restoreFocus={restoreFocus} open={open} />;
}

async function mount(kind: 'live' | 'movies' | 'series', initial?: CatalogQuery, restoreFocus?: string) {
  act(() => render(<FocusProvider><Harness kind={kind} initial={initial} restoreFocus={restoreFocus} /></FocusProvider>, container));
  await settle();
}

function RoutedHarness() {
  focus = useFocusManager();
  return <App />;
}

beforeEach(() => {
  container = document.createElement('div'); document.body.append(container);
  vi.spyOn(api, 'liveCategories').mockResolvedValue([{ id: 'news', name: 'News' }]);
  vi.spyOn(api, 'vodCategories').mockResolvedValue([{ id: 'drama', name: 'Drama' }]);
  vi.spyOn(api, 'seriesCategories').mockResolvedValue([{ id: 'drama', name: 'Drama' }]);
  vi.spyOn(api, 'channels').mockImplementation(async (_category, offset = 0) => page(channels, offset, 20));
  vi.spyOn(api, 'vod').mockImplementation(async (_category, offset = 0) => page(movies, offset, 60));
  vi.spyOn(api, 'series').mockImplementation(async (_category, offset = 0) => page(movies, offset, 60));
  vi.spyOn(api, 'epg').mockResolvedValue({ progress: 0 });
  vi.spyOn(api, 'favorites').mockResolvedValue([]);
  open.mockClear();
});

afterEach(() => {
  act(() => render(null, container)); container.remove();
  vi.restoreAllMocks();
});

describe('catalog pagination', () => {
  it.each([0, 20, 200])('jumps five live channels within the page at offset %s without paging or playing', async (offset) => {
    vi.spyOn(api, 'status').mockResolvedValue({ version: '1.2.2', configured: true, demoMode: true, language: 'en', languageConfigured: true, autoplayLive: false });
    vi.spyOn(api, 'liveSelection').mockResolvedValue({ offset, channel: channels[offset], channels: channels.slice(offset, offset + 20) });
    act(() => render(<RoutedHarness />, container)); await settle();
    act(() => (container.querySelectorAll('.home-card')[0] as HTMLButtonElement).click()); await settle(); await settle();
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 70)));
    const last = Math.min(offset + 19, channels.length - 1);
    const count = vi.mocked(api.channels).mock.calls.length;
    const press = async (key: string) => { act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key })); }); await settle(); };
    act(() => { focus.focus(`live:channel:${offset + 1}`); });
    await press('PageDown'); expect(focus.focused).toBe(`live:channel:${Math.min(offset + 6, last)}`);
    expect(container.querySelector('.epg-panel h2')?.textContent).toBe(`Channel ${Math.min(offset + 6, last)}`);
    await press('PageUp'); expect(focus.focused).toBe(`live:channel:${Math.max(offset, Math.min(offset + 6, last) - 5)}`);
    act(() => { focus.focus(`live:channel:${last}`); });
    await press('ChannelDown'); expect(focus.focused).toBe(`live:channel:${last}`);
    act(() => { focus.focus(`live:channel:${offset}`); });
    await press('ChannelUp'); expect(focus.focused).toBe(`live:channel:${offset}`);
    expect(api.channels).toHaveBeenCalledTimes(count);
    expect(container.querySelector('.player-screen')).toBeNull();
    expect(container.textContent).toContain('jump 5 channels');
  });

  it('ignores live channel jumps while the page is loading', async () => {
    vi.spyOn(api, 'status').mockResolvedValue({ version: '1.2.2', configured: true, demoMode: true, language: 'en', languageConfigured: true, autoplayLive: false });
    vi.spyOn(api, 'liveSelection').mockResolvedValue({ offset: 0, channel: channels[0], channels: channels.slice(0, 20) });
    let resolve!: (value: Page<Channel>) => void;
    vi.mocked(api.channels).mockImplementation(() => new Promise((done) => { resolve = done; }));
    act(() => render(<RoutedHarness />, container)); await settle();
    act(() => (container.querySelectorAll('.home-card')[0] as HTMLButtonElement).click()); await settle(); await settle();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' })); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp' })); }); await settle();
    expect(api.channels).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('.channel-row')).toHaveLength(0);
    act(() => resolve(page(channels, 0, 20))); await settle();
    expect(container.querySelectorAll('.channel-row')).toHaveLength(20);
  });

  it.each(['movies', 'series'] as const)('pages the routed %s catalog with P UP/P DOWN, retaining filters and respecting bounds', async (kind) => {
    vi.spyOn(api, 'status').mockResolvedValue({ version: '1.2.2', configured: true, demoMode: true, language: 'en', languageConfigured: true, autoplayLive: false });
    act(() => render(<RoutedHarness />, container)); await settle();
    const homeIndex = kind === 'movies' ? 1 : 2;
    act(() => (container.querySelectorAll('.home-card')[homeIndex] as HTMLButtonElement).click()); await settle(); await settle();
    await click('Drama');
    const input = container.querySelector('input')!;
    act(() => { input.value = 'match'; input.dispatchEvent(new Event('input', { bubbles: true })); }); await settle();
    const loader = kind === 'movies' ? api.vod : api.series;
    const category = 'drama'; const size = 60;
    const press = async (key: string) => { act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }); await settle(); };
    const count = vi.mocked(loader).mock.calls.length;
    await press('PageUp'); expect(loader).toHaveBeenCalledTimes(count);
    await press('PageDown'); expect(loader).toHaveBeenLastCalledWith(category, size, 'match');
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 70)));
    expect(document.activeElement?.textContent).toContain('Movie 60');
    await press('ChannelDown'); expect(loader).toHaveBeenLastCalledWith(category, size * 2, 'match');
    const finalCount = vi.mocked(loader).mock.calls.length;
    await press('PageDown'); expect(loader).toHaveBeenCalledTimes(finalCount);
    await press('ChannelUp'); expect(loader).toHaveBeenLastCalledWith(category, size, 'match');
    expect(container.querySelector('input')?.value).toBe('match');
  });

  it('ignores repeated page buttons while the routed catalog request is pending', async () => {
    vi.spyOn(api, 'status').mockResolvedValue({ version: '1.2.2', configured: true, demoMode: true, language: 'en', languageConfigured: true, autoplayLive: false });
    act(() => render(<RoutedHarness />, container)); await settle();
    act(() => (container.querySelectorAll('.home-card')[1] as HTMLButtonElement).click()); await settle();
    let resolve!: (value: Page<VodItem>) => void;
    vi.mocked(api.vod).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' })); }); await settle();
    const count = vi.mocked(api.vod).mock.calls.length;
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' })); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp' })); }); await settle();
    expect(api.vod).toHaveBeenCalledTimes(count);
    act(() => resolve(page(movies, 60, 60))); await settle();
    expect(container.textContent).toContain('61–120 of 125');
  });

  it('keeps page-change focus intent when another restoration runs while the page loads', async () => {
    await mount('movies');
    let resolve!: (value: Page<VodItem>) => void;
    vi.mocked(api.vod).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    act(() => { focus.focus('movies:page:next'); focus.select(); }); await settle();
    act(() => { focus.focus('movies:cat:all'); });
    act(() => resolve(page(movies, 60, 60))); await settle();
    await act(() => new Promise<void>((done) => setTimeout(done, 70)));
    expect(document.activeElement?.textContent).toContain('Movie 60');
  });

  it('pages TV Guide channels without changing the time window and focuses the new first channel', async () => {
    vi.spyOn(api, 'status').mockResolvedValue({ version: '1.2.2', configured: true, demoMode: true, language: 'en', languageConfigured: true, autoplayLive: false });
    vi.spyOn(api, 'liveSelection').mockResolvedValue({ offset: 0, channels: channels.slice(0, 20) });
    vi.spyOn(api, 'guide').mockImplementation(async (start, offset = 0) => ({ start, end: start + 3 * 3600_000, offset, limit: 6, total: 13, items: channels.slice(offset, Math.min(offset + 6, 13)).map((channel) => ({ channel, programs: [] })) }));
    act(() => render(<RoutedHarness />, container)); await settle();
    act(() => (container.querySelectorAll('.home-card')[0] as HTMLButtonElement).click()); await settle(); await settle();
    await click('TV Guide'); await settle();
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 70)));
    const start = vi.mocked(api.guide).mock.calls[0]![0];
    const press = async (keyCode: number) => { act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', keyCode })); }); await settle(); };
    await press(427); expect(api.guide).toHaveBeenCalledTimes(1);
    await press(428); expect(api.guide).toHaveBeenLastCalledWith(start, 6, '', '');
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 70)));
    expect(document.activeElement?.textContent).toContain('Channel 6');
    await press(428); expect(api.guide).toHaveBeenLastCalledWith(start, 12, '', '');
    await press(428); expect(api.guide).toHaveBeenCalledTimes(3);
    await press(427); expect(api.guide).toHaveBeenLastCalledWith(start, 6, '', '');
  });

  it.each(['movies', 'series'] as const)('browses every %s page, including a short final page, without growing the grid', async (kind) => {
    await mount(kind);
    expect(container.querySelectorAll('.poster-card')).toHaveLength(60);
    expect(container.textContent).toContain('1–60 of 125');
    expect(button('‹ Previous').disabled).toBe(true);
    await click('Next ›');
    expect(api[kind === 'movies' ? 'vod' : 'series']).toHaveBeenLastCalledWith(undefined, 60, '');
    expect(container.querySelectorAll('.poster-card')).toHaveLength(60);
    expect(container.textContent).toContain('61–120 of 125');
    await click('Next ›');
    expect(container.querySelectorAll('.poster-card')).toHaveLength(5);
    expect(container.textContent).toContain('121–125 of 125');
    expect(button('Next ›').disabled).toBe(true);
    await click('‹ Previous');
    expect(container.textContent).toContain('61–120 of 125');
    act(() => (container.querySelector('.poster-card') as HTMLButtonElement).click());
    expect(open).toHaveBeenCalledWith(movies[60]);
  });

  it('shows 20 live channels per page and plays using the current page', async () => {
    await mount('live');
    expect(container.querySelectorAll('.channel-row')).toHaveLength(20);
    expect(container.textContent).toContain('1–20 of 205');
    await click('Next ›');
    expect(api.channels).toHaveBeenLastCalledWith(undefined, 20, '');
    expect(container.querySelectorAll('.channel-row')).toHaveLength(20);
    expect(container.textContent).toContain('21–40 of 205');
    expect(container.querySelector('.channel-number')?.textContent).toBe('21');
    act(() => (container.querySelector('.channel-row') as HTMLButtonElement).click());
    expect(open).toHaveBeenCalledWith(channels[20], channels.slice(20, 40));
    act(() => render(null, container));
    await mount('live', { category: '', search: '', offset: 200 });
    expect(container.querySelectorAll('.channel-row')).toHaveLength(5);
    expect(container.textContent).toContain('201–205 of 205');
    expect(button('Next ›').disabled).toBe(true);
    await click('‹ Previous');
    expect(api.channels).toHaveBeenLastCalledWith(undefined, 180, '');
  });

  it.each(['live', 'movies', 'series'] as const)('resets %s category and search to page one and carries filters into the next request', async (kind) => {
    await mount(kind);
    const loader = kind === 'live' ? api.channels : kind === 'movies' ? api.vod : api.series;
    const category = kind === 'live' ? 'news' : 'drama';
    const size = kind === 'live' ? 20 : 60;
    await click('Next ›');
    await click(kind === 'live' ? 'News' : 'Drama');
    expect(loader).toHaveBeenLastCalledWith(category, 0, '');
    await click('Next ›');
    const input = container.querySelector('input')!;
    act(() => { input.value = 'match'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await settle();
    expect(loader).toHaveBeenLastCalledWith(category, 0, 'match');
    await click('Next ›');
    expect(loader).toHaveBeenLastCalledWith(category, size, 'match');
  });

  it('ignores a late page response after the filter has changed', async () => {
    let resolve!: (value: Page<VodItem>) => void;
    vi.mocked(api.vod).mockImplementation((_category, offset = 0, search = '') => offset === 60 && !search
      ? new Promise((done) => { resolve = done; })
      : Promise.resolve(page(search ? movies.slice(0, 2) : movies, offset, 60)));
    await mount('movies');
    await click('Next ›');
    expect(button('Next ›').disabled).toBe(true);
    expect(container.querySelectorAll('.poster-card')).toHaveLength(0);
    const input = container.querySelector('input')!;
    act(() => { input.value = 'new'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await settle();
    act(() => resolve(page(movies, 60, 60))); await settle();
    expect(container.querySelectorAll('.poster-card')).toHaveLength(2);
    expect(container.textContent).toContain('1–2 of 2');
  });

  it('retries a failed later page by remote and still allows returning to the previous page', async () => {
    vi.mocked(api.vod).mockImplementationOnce(async () => page(movies, 0, 60)).mockRejectedValueOnce(new Error('Offline'));
    await mount('movies'); await click('Next ›');
    expect(container.textContent).toContain('Offline');
    expect(button('‹ Previous').disabled).toBe(false);
    expect(focus.focus('movies:retry')).toBe(true);
    act(() => focus.select()); await settle();
    expect(api.vod).toHaveBeenLastCalledWith(undefined, 60, '');
    expect(container.textContent).toContain('61–120 of 125');
  });

  it('handles an empty catalog and keeps previous available if the catalog shrinks', async () => {
    vi.mocked(api.vod).mockResolvedValue({ items: [], total: 0, offset: 0, limit: 60 });
    await mount('movies');
    expect(container.textContent).toContain('No movies found.');
    expect(button('‹ Previous').disabled).toBe(true);
    expect(button('Next ›').disabled).toBe(true);
    act(() => render(null, container));
    vi.mocked(api.vod).mockResolvedValue({ items: [], total: 20, offset: 60, limit: 60 });
    await mount('movies', { category: '', search: '', offset: 60 });
    expect(button('‹ Previous').disabled).toBe(false);
    expect(button('Next ›').disabled).toBe(true);
    await click('‹ Previous');
    expect(api.vod).toHaveBeenLastCalledWith(undefined, 0, '');
  });

  it('connects the final grid row to pagination and restores a later-page item after remount', async () => {
    const query = { category: 'drama', search: 'match', offset: 60 };
    await mount('movies', query, 'movies:item:drama:64:64');
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 70)));
    expect(focus.focused).toBe('movies:item:drama:64:64');
    expect(focus.focus('movies:item:drama:119:119')).toBe(true);
    act(() => { focus.move('down'); });
    expect(focus.focused).toBe('movies:page:next');
    act(() => { focus.move('up'); });
    expect(focus.focused).toBe('movies:item:drama:119:119');
    act(() => { focus.move('down'); focus.select(); }); await settle();
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 70)));
    expect(focus.focused).toBe('movies:item:drama:120:120');
  });

  it.each(['movies', 'series'] as const)('keeps the %s filters, page, and selected item through a real details/Back route transition', async (kind) => {
    vi.spyOn(api, 'status').mockResolvedValue({ version: '1.2.2', configured: true, demoMode: true, language: 'en', languageConfigured: true, autoplayLive: false });
    vi.spyOn(api, 'history').mockResolvedValue([]);
    vi.spyOn(api, 'vodInfo').mockResolvedValue(movies[64]!);
    vi.spyOn(api, 'seriesInfo').mockResolvedValue({ item: movies[64]!, episodes: [] });
    act(() => render(<RoutedHarness />, container)); await settle();
    act(() => (container.querySelectorAll('.home-card')[kind === 'movies' ? 1 : 2] as HTMLButtonElement).click()); await settle();
    await click('Drama');
    const input = container.querySelector('input')!;
    act(() => { input.value = 'match'; input.dispatchEvent(new Event('input', { bubbles: true })); }); await settle();
    await click('Next ›');
    const target = `${kind}:item:drama:64:64`;
    expect(focus.focus(target)).toBe(true);
    act(() => focus.select()); await settle();
    expect(container.querySelector('.poster-grid')).toBeNull();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }); await settle();
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 70)));
    expect(api[kind === 'movies' ? 'vod' : 'series']).toHaveBeenLastCalledWith('drama', 60, 'match');
    expect(container.querySelector('input')?.value).toBe('match');
    expect(container.textContent).toContain('61–120 of 125');
    expect(focus.focused).toBe(target);
  });

  it('disables Next for an exact page-size total and connects the last live channel to the pager', async () => {
    vi.mocked(api.channels).mockImplementation(async (_category, offset = 0) => page(channels.slice(0, 40), offset, 20));
    await mount('live');
    expect(focus.focus('live:channel:19')).toBe(true);
    act(() => { focus.move('down'); });
    expect(focus.focused).toBe('live:page:next');
    act(() => focus.select()); await settle();
    expect(button('Next ›').disabled).toBe(true);
    expect(container.textContent).toContain('21–40 of 40');
    expect(focus.focus('live:channel:39')).toBe(true);
    act(() => { focus.move('down'); });
    expect(focus.focused).toBe('live:page:previous');
  });
});
