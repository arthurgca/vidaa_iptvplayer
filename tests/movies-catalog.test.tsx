// @vitest-environment jsdom
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaCatalog } from '../src/screens/MediaCatalog';
import { App } from '../src/App';
import { api } from '../src/api/client';
import { emptyCatalogQuery, type CatalogQuery } from '../src/catalogQuery';
import { useFocusManager } from '../src/navigation/FocusContext';
import type { FocusManager } from '../src/navigation/FocusManager';
import type { Page, VodItem } from '../src/types';

const movies = Array.from({ length: 43534 }, (_, i) => ({ id: String(i), name: `Movie ${i}`, categoryId: i % 2 ? 'odd' : 'even', extension: 'mkv' }));
let container: HTMLDivElement; let focus: FocusManager; const open = vi.fn();
const settle = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
const ready = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 75)));
async function key(key: string) { act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }); await settle(); }
function page(category = '', offset = 0, search = '', anchor = ''): Page<VodItem> {
  const rows = movies.filter(item => (!category || item.categoryId === category) && item.name.toLowerCase().includes(search.toLowerCase()));
  if (anchor) { const i = rows.findIndex(item => item.id === anchor); if (i >= 0) offset = Math.floor(i / 120) * 120; }
  offset = Math.min(offset, Math.floor(Math.max(0, rows.length - 1) / 120) * 120);
  return { items: rows.slice(offset, offset + 120), total: rows.length, offset, limit: 120 };
}
function Harness({ initial = emptyCatalogQuery(), restoreFocus, routed = false }: { initial?: CatalogQuery; restoreFocus?: string; routed?: boolean }) {
  focus = useFocusManager(); const [query, setQuery] = useState(initial);
  return routed ? <App /> : <MediaCatalog kind="movies" query={query} setQuery={setQuery} restoreFocus={restoreFocus} open={open} />;
}
async function mount(initial?: CatalogQuery, restoreFocus?: string, routed = false) {
  act(() => render(<Harness initial={initial} restoreFocus={restoreFocus} routed={routed} />, container)); await settle(); await ready();
}
beforeEach(() => {
  container = document.createElement('div'); document.body.append(container); open.mockClear();
  vi.spyOn(api, 'vodCategories').mockResolvedValue([{ id: 'even', name: 'Provider | Pares' }, { id: 'odd', name: 'Stand Up Commedy' }, { id: 'empty', name: 'Provider empty' }]);
  vi.spyOn(api, 'movieWindow').mockImplementation(async (category, offset, search, anchor) => page(category, offset, search, anchor));
});
afterEach(() => { act(() => render(null, container)); container.remove(); vi.restoreAllMocks(); });

describe('Movies virtual grid and remote', () => {
  it('lands on artwork, clamps row edges, reaches beyond old pages and bounds DOM across deep navigation', async () => {
    await mount(); expect(focus.focused).toBe('movies:item:0');
    await key('ArrowLeft'); expect(focus.focused).toBe('movies:item:0');
    for (let i = 0; i < 8; i++) await key('ArrowRight'); expect(focus.focused).toBe('movies:item:5');
    for (let i = 0; i < 30; i++) await key('PageDown');
    expect(Number(focus.focused.split(':').pop())).toBeGreaterThan(120);
    expect(container.querySelectorAll('.movie-card').length).toBeLessThanOrEqual(36);
    expect(container.querySelector('.catalog-pagination')).toBeNull();
    await key('Enter'); expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: '185', extension: 'mkv' }));
  });
  it('keeps category focus modal, cancels without changing context and selects original provider labels', async () => {
    await mount(); await key('ArrowUp'); await key('Enter'); await ready();
    expect(focus.focused).toBe('movies:selector:0');
    expect(focus.focus('movies:item:0')).toBe(false);
    await key('ArrowDown'); await key('ArrowRight'); expect(focus.focused).toBe('movies:selector:1');
    await key('Escape'); expect(focus.focused).toBe('movies:categories'); expect(container.querySelector('[role="dialog"]')).toBeNull();
    await key('Enter'); await ready(); await key('ArrowDown'); await key('Enter'); await settle();
    expect(api.movieWindow).toHaveBeenLastCalledWith('even', 0, '', '', 'added-desc');
    expect(focus.focused).toBe('movies:item:0');
    expect(container.querySelector('input')?.placeholder).toBe('Search in Provider | Pares');
  });
  it('searches the full selected category after a pause, exits editing with Enter and keeps search focused', async () => {
    await mount({ category: 'even', search: '', offset: 0 });
    act(() => { focus.focus('movies:search'); focus.select(); });
    const input = container.querySelector('input')!; const requests = vi.mocked(api.movieWindow).mock.calls.length;
    act(() => { input.value = 'Movie 43532'; input.dispatchEvent(new Event('input', { bubbles: true })); }); await settle();
    expect(api.movieWindow).toHaveBeenCalledTimes(requests);
    await act(() => new Promise<void>(resolve => setTimeout(resolve, 280))); await settle();
    expect(api.movieWindow).toHaveBeenLastCalledWith('even', 0, 'Movie 43532', '', 'added-desc');
    expect(document.activeElement).toBe(input); expect(container.querySelectorAll('.movie-card')).toHaveLength(1);
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }); await settle();
    expect(focus.focused).toBe('movies:search'); expect(document.activeElement).not.toBe(input);
    await key('ArrowDown'); expect(focus.focused).toBe('movies:item:43532');
  });
  it('ignores stale responses and exposes empty and failed states with remote retry', async () => {
    let resolve!: (data: Page<VodItem>) => void;
    vi.mocked(api.movieWindow).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await mount(); expect(focus.focused).toBe('movies:categories');
    act(() => { focus.focus('movies:search'); focus.select(); const input = container.querySelector('input')!; input.value = 'absent'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(() => new Promise<void>(done => setTimeout(done, 280))); await settle();
    act(() => resolve(page())); await settle();
    expect(container.querySelectorAll('.movie-card')).toHaveLength(0); expect(container.textContent).toContain('No movies found.');
    expect(focus.focused).toBe('movies:search');
    act(() => render(null, container));
    vi.mocked(api.movieWindow).mockRejectedValueOnce(new Error('offline'));
    await mount(); expect(container.textContent).toContain('Movies could not be loaded.');
    await key('ArrowDown'); expect(focus.focused).toBe('movies:retry'); await key('Enter'); await settle();
    expect(focus.focused).toBe('movies:item:0');
  });
  it('uses ID before obsolete index when restoring and clamps the end of a changed catalog', async () => {
    await mount({ category: 'odd', search: '', offset: 42000 }, 'movies:item:301');
    expect(focus.focused).toBe('movies:item:301'); expect(api.movieWindow).toHaveBeenCalledWith('odd', 42000, '', '301', 'added-desc');
    act(() => render(null, container));
    await mount({ category: '', search: '', offset: 999999 }, 'movies:item:removed');
    expect(focus.focused).toBe('movies:item:43533'); await key('ArrowDown'); expect(focus.focused).toBe('movies:item:43533');
  });
  it('retains the old visible focus during slow boundary requests and honors the last destination', async () => {
    await mount({ category: '', search: '', offset: 90 }); await key('PageDown');
    let resolve!: (value: Page<VodItem>) => void;
    const pending = new Promise<Page<VodItem>>(done => { resolve = done; });
    vi.mocked(api.movieWindow).mockImplementation(async (category, offset, search, anchor) => offset === 120 ? pending : page(category, offset, search, anchor));
    await key('PageDown'); await key('PageDown'); await key('PageDown');
    expect(focus.focused).toBe('movies:item:102'); expect(container.querySelector('[data-movie-index="102"]')).not.toBeNull();
    act(() => resolve(page('', 120))); await settle(); await settle();
    expect(focus.focused).toBe('movies:item:114');
  });
  it('restores category, search and focused movie through the existing details route', async () => {
    vi.spyOn(api, 'status').mockResolvedValue({ version: '1.2.2', configured: true, demoMode: true, language: 'en', languageConfigured: true, autoplayLive: false });
    vi.spyOn(api, 'history').mockResolvedValue([]); vi.spyOn(api, 'favorites').mockResolvedValue([]);
    vi.spyOn(api, 'vod').mockResolvedValue({ items: movies.slice(0, 12), total: movies.length, offset: 0, limit: 12 });
    vi.spyOn(api, 'series').mockResolvedValue({ items: [], total: 0, offset: 0, limit: 12 });
    vi.spyOn(api, 'vodInfo').mockResolvedValue(movies[150]!);
    await mount(undefined, undefined, true);
    act(() => (container.querySelectorAll('.home-card')[1] as HTMLButtonElement).click()); await settle(); await ready();
    for (let i = 0; i < 25; i++) await key('PageDown'); expect(focus.focused).toBe('movies:item:150');
    await key('Enter'); await settle(); expect(container.querySelector('.detail-copy')).not.toBeNull();
    await key('Escape'); await settle(); await ready(); expect(focus.focused).toBe('movies:item:150');
    expect(api.movieWindow).toHaveBeenCalledWith('', 120, '', '150', 'added-desc');
  });
  it('selects ordering by remote, preserves filters and restores the selected ordering after remount', async () => {
    await mount({ category: 'even', search: 'Movie', offset: 0 });
    await key('ArrowUp'); await key('ArrowRight'); expect(focus.focused).toBe('movies:sort');
    await key('Enter'); await ready(); expect(focus.focused).toBe('movies:selector:2');
    await key('ArrowDown'); await key('ArrowDown'); await key('Enter'); await settle();
    expect(api.movieWindow).toHaveBeenLastCalledWith('even', 0, 'Movie', '', 'release-desc');
    expect(container.querySelector('.movies-sort-control')?.textContent).toContain('Release date · Newest');
    expect(focus.focused).toBe('movies:item:0');
    act(() => render(null, container));
    await mount({ category: 'even', search: 'Movie', offset: 100, sort: 'rating-asc' }, 'movies:item:200');
    expect(api.movieWindow).toHaveBeenCalledWith('even', 0, 'Movie', '200', 'rating-asc');
    expect(focus.focused).toBe('movies:item:200');
  });
  it('keeps All movies and remote Retry available when category loading fails', async () => {
    vi.mocked(api.vodCategories).mockRejectedValueOnce(new Error('offline'));
    await mount(); await key('ArrowUp'); await key('Enter'); await ready();
    expect(container.textContent).toContain('Categories could not be loaded.');
    await key('ArrowDown'); expect(focus.focused).toBe('movies:selector:retry');
    await key('Enter'); await settle(); await ready();
    expect(api.vodCategories).toHaveBeenCalledTimes(2); expect(focus.focused).toBe('movies:selector:1');
    await key('Escape'); expect(focus.focused).toBe('movies:categories');
  });
});
