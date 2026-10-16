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
  vi.spyOn(api, 'liveCatalog').mockResolvedValue(channels);
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

});
