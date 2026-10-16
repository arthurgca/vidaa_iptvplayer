// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { api } from '../src/api/client';
import { useFocusManager } from '../src/navigation/FocusContext';
import type { FocusManager } from '../src/navigation/FocusManager';

let container: HTMLDivElement; let focus: FocusManager;
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
const focused = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 70)));
async function press(key: string) { act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key })); }); await settle(); }
function Harness() { focus = useFocusManager(); return <App />; }
async function openHome(index: number) {
  act(() => render(<Harness />, container)); await settle();
  act(() => (container.querySelectorAll('.home-card')[index] as HTMLButtonElement).click());
  await settle(); await settle(); await focused();
}

beforeEach(() => {
  container = document.createElement('div'); document.body.append(container);
  vi.spyOn(api, 'status').mockResolvedValue({ version: '1.2.2', configured: true, demoMode: true, language: 'en', languageConfigured: true, autoplayLive: false });
  vi.spyOn(api, 'favorites').mockResolvedValue([]);
  vi.spyOn(api, 'history').mockResolvedValue([]);
});
afterEach(() => { act(() => render(null, container)); container.remove(); vi.restoreAllMocks(); });

describe('remote page jumps in long screens', () => {
  it.each(['favorites', 'recent'] as const)('jumps through %s without opening or removing an item', async (kind) => {
    const rows = Array.from({ length: 32 }, (_, index) => ({ type: 'live' as const, id: String(index), item: { id: String(index), name: `Channel ${index}`, categoryId: '' }, addedAt: 0, position: 0, duration: 0, watchedAt: 0 }));
    vi.mocked(api.favorites).mockResolvedValue(rows); vi.mocked(api.history).mockResolvedValue(rows);
    const remove = vi.spyOn(api, 'forget'); const unfavorite = vi.spyOn(api, 'unfavorite');
    await openHome(kind === 'favorites' ? 3 : 4);
    act(() => { focus.focus(`${kind}:live:1`); });
    await press('PageDown'); expect(focus.focused).toBe(`${kind}:live:${kind === 'favorites' ? 26 : 6}`);
    await press('PageUp'); expect(focus.focused).toBe(`${kind}:live:1`);
    expect(container.querySelector('.player-screen')).toBeNull();
    expect(remove).not.toHaveBeenCalled(); expect(unfavorite).not.toHaveBeenCalled();
  });

  it('pages episode and season lists without changing the selected season or starting playback', async () => {
    const item = { id: 'show', name: 'Show', categoryId: '' };
    vi.spyOn(api, 'seriesCategories').mockResolvedValue([]);
    vi.spyOn(api, 'seriesWindow').mockResolvedValue({ offset: 0, limit: 60, total: 1, items: [item] });
    vi.spyOn(api, 'seriesInfo').mockResolvedValue({ item, episodes: Array.from({ length: 32 }, (_, index) => ({ id: String(index), name: `Episode ${index}`, season: index < 16 ? 1 : 2, episode: index % 16 + 1 })) });
    await openHome(2);
    act(() => container.querySelector<HTMLButtonElement>('.poster-card')!.click()); await settle(); await settle(); await focused();
    act(() => { focus.focus('series-detail:episode:1'); });
    await press('PageDown'); expect(focus.focused).toBe('series-detail:episode:6');
    await press('PageUp'); expect(focus.focused).toBe('series-detail:episode:1');
    act(() => { focus.focus('series-detail:season:1'); });
    await press('PageDown'); expect(focus.focused).toBe('series-detail:season:2');
    expect(container.querySelector('.season-list .active-item')?.textContent).toBe('Season 1');
    expect(container.querySelector('.player-screen')).toBeNull();
  });

  it('moves through Settings without activating inputs or toggles', async () => {
    vi.spyOn(api, 'config').mockResolvedValue({ xtreamBaseUrl: '', xtreamUsername: '', xtreamPassword: '', xmltvUrl: '', epgRefreshHours: 6, preferredLiveFormat: 'auto', autoplayLive: false, rememberLastChannel: true, demoMode: true, language: 'en', passwordConfigured: false, languageConfigured: true, configured: true });
    const save = vi.spyOn(api, 'saveConfig');
    await openHome(5);
    act(() => { focus.focus('settings:language'); });
    await press('PageDown'); expect(focus.focused).toBe('settings:format');
    await press('PageDown'); expect(focus.focused).toBe('settings:test');
    await press('PageUp'); expect(focus.focused).toBe('settings:format');
    expect(document.activeElement?.tagName).toBe('DIV');
    expect(save).not.toHaveBeenCalled();
  });
});
