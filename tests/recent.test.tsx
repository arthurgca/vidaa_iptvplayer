// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { api } from '../src/api/client';
import { useFocusManager } from '../src/navigation/FocusContext';
import type { FocusManager } from '../src/navigation/FocusManager';
import { Player, type Playable } from '../src/player/Player';
import type { HistoryItem } from '../src/types';

vi.mock('../src/player/Player', async original => ({ ...await original<typeof import('../src/player/Player')>(), Player: vi.fn(({ media }: { media: Playable }) => <main className="test-player">{media.id}</main>) }));
let container: HTMLDivElement; let focus: FocusManager; let persisted: HistoryItem[];
const show = { id: 'show', name: 'The Office', poster: '/show.png', categoryId: '' };
const sample = (): HistoryItem[] => [
  { type: 'series', id: 'e2', item: { id: 'e2', name: 'New Guys', season: 9, episode: 1 }, series: show, position: 120, duration: 1200, watchedAt: 400 },
  { type: 'movie', id: 'same', item: { id: 'same', name: 'Movie', categoryId: '', poster: '/movie.png' }, position: 300, duration: 1800, watchedAt: 300 },
  { type: 'series', id: 'e1', item: { id: 'e1', name: 'New Guys', season: 8, episode: 24 }, series: show, position: 30, duration: 1200, watchedAt: 200 },
  { type: 'live', id: 'same', item: { id: 'same', name: 'Channel', categoryId: '', logo: '/channel.png' }, position: 100, duration: 300, watchedAt: 100 }
];
const settle = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
async function press(key: string) { act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }); await settle(); }
function Harness() { focus = useFocusManager(); return <App />; }
function target(key: string) { return container.querySelector<HTMLButtonElement>(`[data-focus-key="${key}"]`)!; }
async function choose(key: string) { act(() => { focus.focus(key); }); await press('Enter'); }
async function mountRecent() {
  act(() => render(<Harness />, container)); await settle(); await settle();
  await choose('home:recent'); await settle();
}
beforeEach(() => {
  persisted = sample(); container = document.createElement('div'); document.body.append(container);
  vi.spyOn(api, 'status').mockResolvedValue({ version: '1.2.2', configured: true, demoMode: true, language: 'en', languageConfigured: true, autoplayLive: false });
  vi.spyOn(api, 'config').mockResolvedValue({ homePreferences: null, homeProviderKey: 'fixture' } as Awaited<ReturnType<typeof api.config>>);
  vi.spyOn(api, 'history').mockImplementation(async () => [...persisted]);
  vi.spyOn(api, 'favorites').mockResolvedValue([]);
  vi.spyOn(api, 'vod').mockResolvedValue({ items: [], offset: 0, total: 0, limit: 12 });
  vi.spyOn(api, 'series').mockResolvedValue({ items: [], offset: 0, total: 0, limit: 12 });
  vi.spyOn(api, 'seriesInfo').mockResolvedValue({ item: show, episodes: sample().filter(row => row.type === 'series').map(row => row.item) as import('../src/types').Episode[] });
  vi.spyOn(api, 'forget').mockImplementation(async (type, id) => { persisted = persisted.filter(row => row.type !== type || row.id !== id); });
  vi.spyOn(api, 'clearHistory').mockImplementation(async () => { persisted = []; });
  vi.mocked(Player).mockClear();
});
afterEach(() => { act(() => render(null, container)); container.remove(); vi.restoreAllMocks(); });

describe('Recently Watched remote interactions', () => {
  it('renders chronological mixed content and contextual progress without fetching labels', async () => {
    await mountRecent();
    expect([...container.querySelectorAll('.recent-info > strong')].map(node => node.textContent)).toEqual(['The Office — S09E01', 'Movie', 'The Office — S08E24', 'Channel']);
    expect(container.textContent).toContain('New Guys'); expect(container.textContent).toContain('4 entries');
    expect(container.querySelector('.recent-entry-live .progress')).toBeNull();
    expect(container.querySelector('.recent-entry-live .recent-primary')?.textContent).toContain('Watch');
    expect(api.seriesInfo).not.toHaveBeenCalled(); expect(focus.focused).toBe('recent:series:e2');
    expect(document.activeElement).toBe(target(focus.focused));
  });

  it.each([['movie', 'same', 300], ['series', 'e2', 120], ['live', 'same', undefined]] as const)('opens the correct %s using existing playback and restores slow history focus and scroll', async (type, id, resumeAt) => {
    await mountRecent(); const key = `recent:${type}:${id}`;
    const list = container.querySelector<HTMLElement>('.recent-list')!; list.scrollTop = 247;
    await choose(key); await settle();
    const calls = vi.mocked(Player).mock.calls; const props = calls[calls.length - 1]![0];
    expect(props.media).toMatchObject({ type, id, ...(resumeAt === undefined ? {} : { resumeAt }) });
    if (type === 'series') expect(props.media.series?.id).toBe('show');
    let finish!: (rows: HistoryItem[]) => void;
    vi.mocked(api.history).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await press('Escape'); await act(() => new Promise(resolve => setTimeout(resolve, 100)));
    await act(async () => finish([...persisted])); await settle();
    expect(focus.focused).toBe(key); expect(document.activeElement).toBe(target(key));
    expect(container.querySelector('.recent-list')!.scrollTop).toBe(247);
  });

  it('uses vertical lanes, header navigation and Page buttons without activation', async () => {
    persisted = Array.from({ length: 100 }, (_, i) => ({ ...sample()[1]!, id: String(i), item: { ...sample()[1]!.item, id: String(i) } }));
    await mountRecent(); await press('ArrowUp'); expect(focus.focused).toBe('recent:clear');
    await press('ArrowDown'); expect(focus.focused).toBe('recent:movie:0');
    await press('ArrowRight'); expect(focus.focused).toBe('recent:movie:0:remove');
    await press('ArrowDown'); expect(focus.focused).toBe('recent:movie:1:remove');
    await press('PageDown'); expect(focus.focused).toBe('recent:movie:6:remove');
    await press('PageUp'); expect(focus.focused).toBe('recent:movie:1:remove');
    for (let i = 0; i < 50; i++) await press('ArrowDown');
    expect(focus.focused).toBe('recent:movie:51:remove'); await press('ArrowLeft'); expect(focus.focused).toBe('recent:movie:51');
    expect(api.forget).not.toHaveBeenCalled(); expect(Player).not.toHaveBeenCalled();
  });

  it('removes distinct episodes and movies, retains DOM and scroll, and focuses a neighbor', async () => {
    await mountRecent(); const list = container.querySelector<HTMLElement>('.recent-list')!; list.scrollTop = 150;
    const retained = target('recent:series:e1'); const screen = container.querySelector('.recent-screen');
    await choose('recent:movie:same:remove');
    expect(api.forget).toHaveBeenCalledWith('movie', 'same'); expect(persisted.some(row => row.type === 'live' && row.id === 'same')).toBe(true);
    expect(focus.focused).toBe('recent:series:e1'); expect(target('recent:series:e1')).toBe(retained);
    expect(container.querySelector('.recent-screen')).toBe(screen); expect(list.scrollTop).toBe(150);
    await choose('recent:series:e2:remove'); expect(persisted.some(row => row.id === 'e1')).toBe(true);
    expect(focus.focused).toBe('recent:series:e1');
    await choose('recent:live:same:remove'); expect(focus.focused).toBe('recent:series:e1');
    await choose('recent:series:e1:remove'); expect(focus.focused).toBe('recent:back');
    expect(container.textContent).toContain('No recently watched content'); expect(target('recent:clear').disabled).toBe(true);
    expect(api.history).toHaveBeenCalledTimes(2); // Home + initial Recent, no refetch after mutations.
  });

  it('keeps data on confirmation, Cancel and Back, then clears and updates Home Continue Watching', async () => {
    await mountRecent();
    await choose('recent:clear'); expect(focus.focused).toBe('recent-dialog:cancel'); expect(persisted).toHaveLength(4);
    await press('ArrowDown'); expect(focus.focused).toBe('recent-dialog:cancel');
    await press('PageDown'); expect(focus.focused).toBe('recent-dialog:cancel');
    await press('Escape'); expect(container.querySelector('[role="dialog"]')).toBeNull(); expect(focus.focused).toBe('recent:clear');
    await choose('recent:clear'); await press('Enter'); expect(persisted).toHaveLength(4); expect(focus.focused).toBe('recent:clear');
    await choose('recent:clear'); await press('ArrowRight'); await press('Enter');
    expect(api.clearHistory).toHaveBeenCalledTimes(1); expect(persisted).toEqual([]); expect(focus.focused).toBe('recent:back');
    expect(container.querySelector('[role="dialog"]')).toBeNull(); await press('Escape'); await settle();
    expect(container.querySelector('[data-focus-key^="home:continue:"]')).toBeNull();
  });

  it('guards duplicate operations, keeps visible data until commit, and preserves navigation during removal', async () => {
    await mountRecent(); let finish!: () => void;
    vi.mocked(api.forget).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await choose('recent:movie:same:remove'); await press('Enter');
    expect(api.forget).toHaveBeenCalledTimes(1); expect(container.querySelectorAll('.recent-entry')).toHaveLength(4);
    await press('Escape'); expect(container.querySelector('.recent-screen')).not.toBeNull();
    await press('ArrowDown'); expect(focus.focused).toBe('recent:series:e1:remove');
    await act(async () => finish()); expect(focus.focused).toBe('recent:series:e1:remove');
    let clear!: () => void;
    vi.mocked(api.clearHistory).mockImplementationOnce(() => new Promise(resolve => { clear = resolve; }));
    await choose('recent:clear'); await choose('recent-dialog:confirm');
    expect(focus.focused).toBe('recent-dialog:cancel'); await press('Enter'); await press('Escape');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull(); expect(api.clearHistory).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('.recent-entry')).toHaveLength(3);
    await act(async () => clear()); expect(container.querySelectorAll('.recent-entry')).toHaveLength(0);
  });

  it('cancels an outstanding episode metadata selection when history management begins', async () => {
    await mountRecent(); let finish!: (value: Awaited<ReturnType<typeof api.seriesInfo>>) => void;
    vi.mocked(api.seriesInfo).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await choose('recent:series:e2'); expect(Player).not.toHaveBeenCalled();
    await choose('recent:clear'); await choose('recent-dialog:confirm');
    await act(async () => finish({ item: show, episodes: [] })); await settle();
    expect(Player).not.toHaveBeenCalled(); expect(container.textContent).toContain('No recently watched content');
  });

  it('retains failed deletions with an error and can retry', async () => {
    await mountRecent(); vi.mocked(api.forget).mockRejectedValueOnce(new Error('disk full'));
    await choose('recent:series:e2:remove'); expect(container.querySelectorAll('.recent-entry')).toHaveLength(4);
    expect(focus.focused).toBe('recent:series:e2:remove'); expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not save');
    await choose('recent:clear'); vi.mocked(api.clearHistory).mockRejectedValueOnce(new Error('disk full'));
    await choose('recent-dialog:confirm'); expect(container.querySelector('[role="dialog"]')).not.toBeNull(); expect(persisted).toHaveLength(4);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not save'); expect(focus.focused).toBe('recent-dialog:cancel');
    await choose('recent-dialog:confirm'); expect(persisted).toEqual([]);
  });

  it('loads with retry, tolerates missing metadata and artwork, and never invents progress', async () => {
    vi.mocked(api.history).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('offline'));
    await mountRecent(); expect(focus.focused).toBe('recent:retry'); expect(container.textContent).toContain('Could not load');
    persisted = [{ ...sample()[1]!, position: NaN, duration: 0, item: { id: 'same', name: '', categoryId: '' } }];
    await choose('recent:retry'); expect(container.querySelector('.recent-info > strong')?.textContent).toBe('Unavailable title');
    expect(container.querySelector('.image-fallback')).not.toBeNull(); expect(container.querySelector('.progress')).toBeNull();
    expect(container.querySelector('.recent-position')).toBeNull();
    expect(document.activeElement).toBe(target(focus.focused));
  });
});
