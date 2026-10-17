// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { api } from '../src/api/client';
import { Image, Progress } from '../src/components/common';
import { MediaRows, type MediaRow } from '../src/components/MediaRows';
import { Focusable, useFocusManager } from '../src/navigation/FocusContext';
import type { FocusManager } from '../src/navigation/FocusManager';
import { Home } from '../src/screens/Home';
import { continuing, historyProgress, historyTitle } from '../src/screens/libraryRows';
import { Player, type Playable } from '../src/player/Player';
import type { HistoryItem } from '../src/types';

vi.mock('../src/player/Player', async (original) => ({
  ...await original<typeof import('../src/player/Player')>(),
  Player: vi.fn(({ media }: { media: Playable }) => <main className="test-player">{media.id}</main>)
}));
let container: HTMLDivElement; let focus: FocusManager;
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
const ready = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 75)));
const item = { id: 'movie', name: 'Movie', categoryId: 'drama' };
const show = { id: 'show', name: 'Show', categoryId: 'drama' };
const episodes = [{ id: 'e1', name: 'Pilot', season: 1, episode: 1 }, { id: 'e2', name: 'Crossing', season: 2, episode: 1 }];
const row: HistoryItem = { type: 'movie', id: item.id, item, position: 600, duration: 1800, watchedAt: 1 };
const episodeRow: HistoryItem = { ...row, type: 'series', id: 'e1', item: episodes[0]!, series: show, watchedAt: 2 };
function Harness({ children }: { children: preact.ComponentChildren }) { focus = useFocusManager(); return <>{children}</>; }
async function mount(children: preact.ComponentChildren) { act(() => render(<Harness>{children}</Harness>, container)); await settle(); await ready(); }
const key = async (key: string) => { act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }); await settle(); };

beforeEach(() => {
  vi.spyOn(api, 'config').mockResolvedValue({ homePreferences: null, homeProviderKey: 'fixture' } as Awaited<ReturnType<typeof api.config>>);
  container = document.createElement('div'); document.body.append(container);
  vi.spyOn(api, 'status').mockResolvedValue({ version: '1.2.2', configured: true, demoMode: true, language: 'en', languageConfigured: true, autoplayLive: false });
  vi.spyOn(api, 'history').mockResolvedValue([episodeRow, row]);
  vi.spyOn(api, 'favorites').mockResolvedValue([]);
  vi.spyOn(api, 'vod').mockResolvedValue({ items: [item], offset: 0, total: 1, limit: 12 });
  vi.spyOn(api, 'series').mockResolvedValue({ items: [show], offset: 0, total: 1, limit: 12 });
  vi.spyOn(api, 'seriesInfo').mockResolvedValue({ item: show, episodes });
  vi.mocked(Player).mockClear();
});
afterEach(() => { act(() => render(null, container)); container.remove(); vi.restoreAllMocks(); });

describe('Continue Watching selection', () => {
  it('reuses completion boundaries, excludes live and invalid positions, and caps the list', () => {
    expect(continuing([row, { ...row, id: 'short', position: 10 }, { ...row, id: 'done', position: 1710 }, { ...row, id: 'invalid', position: Infinity }, { ...row, id: 'explicit', completed: true }, { ...row, type: 'live', id: 'live' }])).toEqual([row]);
    expect(continuing(Array.from({ length: 30 }, (_, i) => ({ ...row, id: String(i), watchedAt: i })))).toHaveLength(12);
    expect(continuing([row], 'series')).toEqual([]);
  });
  it('supersedes old episode progress with newer series activity, including completion', () => {
    const newest = { ...episodeRow, id: 'e2', item: episodes[1]!, watchedAt: 3, completed: true };
    expect(continuing([episodeRow, row, newest])).toEqual([row]);
    expect(continuing([episodeRow, { ...newest, completed: false }])[0]?.id).toBe('e2');
    expect(historyTitle(episodeRow)).toBe('Show · S01E01 · Pilot');
    expect(historyProgress({ ...row, duration: 0 })).toBeUndefined();
  });
  it.each([row, episodeRow])('resumes $type through the existing player path and restores Home focus/scroll on Back', async (history) => {
    vi.mocked(api.history).mockResolvedValue([history]);
    await mount(<App />);
    act(() => { focus.focus(`home:continue:${history.type}:${history.id}`); });
    const scroller = container.querySelector<HTMLElement>('[data-scroll-key="home:rows"]')!;
    scroller.scrollTop = 123;
    await key('Enter'); await settle();
    const calls = vi.mocked(Player).mock.calls; const props = calls[calls.length - 1]?.[0];
    expect(props?.media).toMatchObject({ id: history.id, type: history.type, resumeAt: 600, item: history.item });
    if (history.type === 'series') expect(props?.media).toMatchObject({ episodes, series: show });
    await key('Escape'); await settle(); await ready();
    expect(focus.focused).toBe(`home:continue:${history.type}:${history.id}`);
    expect(container.querySelector<HTMLElement>('[data-scroll-key="home:rows"]')?.scrollTop).toBe(123);
  });
});

describe('bounded shelves and remote fallbacks', () => {
  const home = () => <Home open={vi.fn()} movie={vi.fn()} series={vi.fn()} resume={vi.fn()} favorite={vi.fn()} />;
  it('requests 12-item Home pages, bounds even oversized responses and never fetches card details', async () => {
    vi.mocked(api.vod).mockResolvedValue({ items: Array.from({ length: 60 }, (_, i) => ({ ...item, id: String(i) })), offset: 0, total: 600, limit: 12 });
    const details = vi.spyOn(api, 'vodInfo');
    await mount(home());
    expect(api.vod).toHaveBeenCalledWith(undefined, 0, '', 12);
    expect(api.series).toHaveBeenCalledWith(undefined, 0, '', 12);
    expect(container.querySelector('[aria-label="Movies · Browse all in Movies"]')?.querySelectorAll('.poster-card')).toHaveLength(12);
    expect(details).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Continue Watching');
    expect(container.textContent).toContain('Show · S01E01 · Pilot');
  });
  it('keeps saved resume rows and a remote-reachable retry when the provider fails', async () => {
    vi.mocked(api.vod).mockRejectedValue(new Error('Offline'));
    await mount(home());
    expect(container.textContent).toContain('Some library rows could not be loaded.');
    act(() => { focus.focus('home:live'); focus.move('down'); focus.move('up'); });
    expect(focus.focused).toBe('home:retry');
    act(() => focus.select()); await settle();
    expect(api.vod).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll('.resume-card')).toHaveLength(2);
  });
  it('renders saved progress while catalog requests are still pending', async () => {
    vi.mocked(api.vod).mockImplementation(() => new Promise(() => undefined));
    vi.mocked(api.series).mockImplementation(() => new Promise(() => undefined));
    await mount(home());
    expect(container.querySelectorAll('.resume-card')).toHaveLength(2);
    act(() => { focus.focus('home:live'); focus.move('down'); });
    expect(focus.focused).toBe('home:continue:series:e1');
  });
  it('clamps row edges, remembers adjacent row positions and jumps without selecting', async () => {
    const select = vi.fn();
    const rows: MediaRow[] = [3, 2].map((count, r) => ({ id: String(r), title: `Row ${r}`, cards: Array.from({ length: count }, (_, i) => ({ key: `card:${r}:${i}`, title: `Card ${i}`, select })) }));
    await mount(<><Focusable focusKey="top" group="top" index={0} onSelect={select}>Top</Focusable><MediaRows rows={rows} scope="test" top="top" /></>);
    act(() => { focus.focus('card:0:2'); focus.move('right'); }); expect(focus.focused).toBe('card:0:2');
    act(() => { focus.move('down'); }); await settle(); expect(focus.focused).toBe('card:1:1');
    act(() => { focus.move('left'); }); await settle(); expect(focus.focused).toBe('card:1:0');
    act(() => { focus.move('up'); }); await settle(); expect(focus.focused).toBe('card:0:2');
    act(() => { focus.move('down'); }); expect(focus.focused).toBe('card:1:0');
    act(() => { focus.jumpRow(5); }); expect(focus.focused).toBe('card:1:1');
    expect(select).not.toHaveBeenCalled();
  });
  it('recovers from a broken image when its source changes and never renders NaN progress', async () => {
    await mount(<><Image src="broken.jpg" alt="Title" /><Progress value={NaN} /></>);
    act(() => { container.querySelector('img')!.dispatchEvent(new Event('error')); });
    expect(container.querySelector('.image-fallback')?.textContent).toBe('T');
    act(() => render(<Harness><Image src="new.jpg" alt="New title" /><Progress value={Infinity} /></Harness>, container));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('new.jpg');
    expect(container.querySelector<HTMLElement>('.progress span')?.style.width).toBe('0%');
  });
});
