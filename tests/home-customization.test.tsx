// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../src/api/client';
import { Home } from '../src/screens/Home';
import { Settings } from '../src/screens/Settings';
import { App } from '../src/App';
import { MediaRows, type MediaRow } from '../src/components/MediaRows';
import { useFocusManager } from '../src/navigation/FocusContext';
import type { FocusManager } from '../src/navigation/FocusManager';
import { listenToRemote, type RemoteAction } from '../src/platform/remote';
import { defaultHomePreferences } from '../src/homePreferences';
import type { HomeCatalog, HomeConfiguration } from '../src/homePreferences';
import type { AppConfig } from '../src/types';

let root: HTMLDivElement, focus: FocusManager, handler: ((action: RemoteAction) => boolean) | null, stop: () => void, config: AppConfig;
const leave = vi.fn();
const settle = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
const ready = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 80)));
function Harness({ children }: { children: preact.ComponentChildren }) { focus = useFocusManager(); return <>{children}</>; }
const settings = () => <Settings language="en" setLanguage={() => {}} saved={() => {}} cleared={() => {}} leave={leave} registerAction={value => { handler = value; }} />;
const home = () => <Home open={() => {}} movie={() => {}} series={() => {}} favorite={() => {}} resume={() => {}} />;
async function mount(children: preact.ComponentChildren) { act(() => render(<Harness>{children}</Harness>, root)); await settle(); await ready(); }
const press = async (key: string) => { act(() => { (document.activeElement || document).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); }); await settle(); };
const select = async (name: string) => { act(() => { expect(focus.focus(`settings:${name}`)).toBe(true); focus.select(); }); await settle(); };
beforeEach(() => {
  root = document.createElement('div'); document.body.append(root);
  handler = null; leave.mockClear(); stop = listenToRemote(action => handler?.(action));
  config = { xtreamBaseUrl: 'https://fixture.invalid', xtreamUsername: 'user', xtreamPassword: '', xmltvUrl: '', epgRefreshHours: 6, preferredLiveFormat: 'auto', autoplayLive: false, rememberLastChannel: true, demoMode: false, language: 'en', passwordConfigured: true, languageConfigured: true, configured: true, homePreferences: null, homeProviderKey: 'fixture' };
  vi.spyOn(api, 'config').mockImplementation(async () => structuredClone(config));
  vi.spyOn(api, 'status').mockResolvedValue({ version: '1.2.2', configured: true, demoMode: false, language: 'en', languageConfigured: true, autoplayLive: false });
  vi.spyOn(api, 'saveConfig').mockImplementation(async value => { config = { ...config, ...value }; return structuredClone(config); });
  vi.spyOn(api, 'vodCategories').mockResolvedValue([{ id: '1', name: 'Same category' }, { id: '2', name: 'Same category' }, ...Array.from({ length: 100 }, (_, i) => ({ id: `cat${i}`, name: `Long category ${i} `.repeat(4) }))]);
  vi.spyOn(api, 'seriesCategories').mockResolvedValue([{ id: '1', name: 'Series category' }]);
  vi.spyOn(api, 'vod').mockResolvedValue({ items: [{ id: 'm', name: 'Original movie', categoryId: '1' }], total: 1, offset: 0, limit: 12 });
  vi.spyOn(api, 'series').mockResolvedValue({ items: [{ id: 's', name: 'Original show', categoryId: '1' }], total: 1, offset: 0, limit: 12 });
  vi.spyOn(api, 'history').mockResolvedValue([{ type: 'movie', id: 'h', item: { id: 'h', name: 'Resume', categoryId: '1' }, position: 60, duration: 900, watchedAt: 1 }]);
  vi.spyOn(api, 'favorites').mockResolvedValue([{ type: 'movie', id: 'f', item: { id: 'f', name: 'Favorite', categoryId: '1' }, addedAt: 1 }]);
  vi.spyOn(api, 'homeCatalog').mockImplementation(async kind => ({ rows: (kind === 'movies' ? config.homePreferences?.movieCategoryIds : config.homePreferences?.seriesCategoryIds)?.map(id => ({ id, title: `Category ${kind} ${id}`, items: [{ id: `${kind}${id}`, name: `Item ${kind} ${id}`, categoryId: id }] })) || [], failed: false }));
});
afterEach(() => { act(() => render(null, root)); root.remove(); stop(); vi.restoreAllMocks(); });

it('preserves the default Home rows and their original limits and order', async () => {
  await mount(home());
  expect([...root.querySelectorAll('.media-row h2')].map(row => row.textContent)).toEqual(['Continue Watching', 'Favorites', 'Movies · Browse all in Movies', 'Series · Browse all in Series']);
  expect(api.vod).toHaveBeenCalledWith(undefined, 0, '', 12); expect(api.series).toHaveBeenCalledWith(undefined, 0, '', 12); expect(api.homeCatalog).not.toHaveBeenCalled();
});

it('selects duplicate names by ID with OK, retains DOM focus, preserves drafts across tabs, and warns before discard', async () => {
  await mount(settings()); await select('tab:home'); await press('ArrowDown'); expect(focus.focused).toBe('settings:home:continueWatching');
  act(() => { focus.focus('settings:home:movies:1'); }); const button = document.activeElement;
  await press('Enter'); expect(document.activeElement).toBe(button); expect(focus.focused).toBe('settings:home:movies:1');
  expect(root.querySelector('[data-focus-key="settings:home:movies:1"] .checked')).not.toBeNull();
  expect(root.querySelector('[data-focus-key="settings:home:movies:2"] .checked')).toBeNull();
  expect(root.querySelectorAll('.home-setting-item.category')).toHaveLength(20);
  await select('home:movies:2'); await select('tab:playback'); await select('tab:home');
  await press('Escape'); expect(root.querySelector('[role=dialog]')).not.toBeNull(); expect(leave).not.toHaveBeenCalled();
  await press('Escape'); expect(focus.focused).toBe('settings:tab:home');
  await select('save'); expect(api.saveConfig).toHaveBeenCalledWith({ homeProviderKey: 'fixture', homePreferences: { ...defaultHomePreferences(), movieCategoryIds: ['1', '2'] } });
});

it('moves a selection while retaining the same DOM action, saves order, and resets only Home', async () => {
  config.homePreferences = { ...defaultHomePreferences(), movieCategoryIds: ['1', '2'], seriesCategoryIds: [] };
  await mount(settings()); await select('tab:home'); await select('home:order');
  act(() => { focus.focus('settings:home:movies:2:up'); }); const button = document.activeElement;
  await press('Enter'); expect(focus.focused).toBe('settings:home:movies:2:up'); expect(document.activeElement).toBe(button);
  await press('ArrowDown'); expect(focus.focused).toBe('settings:home:movies:1:up');
  await select('save'); expect(config.homePreferences?.movieCategoryIds).toEqual(['2', '1']); expect(focus.focused).toBe('settings:save');
  await select('home:restore'); expect(config.homePreferences).not.toBeNull(); // still only a draft
  await select('save'); expect(config.homePreferences).toBeNull(); expect(config.xtreamUsername).toBe('user'); expect(config.autoplayLive).toBe(false);
  expect(api.saveConfig).toHaveBeenLastCalledWith({ homePreferences: null, homeProviderKey: 'fixture' });
});

it('keeps missing selections, paginates with the remote, and leaves category failures retryable without destroying preferences', async () => {
  config.homePreferences = { ...defaultHomePreferences(), movieCategoryIds: ['missing', '1'] };
  await mount(settings()); await select('tab:home'); await select('home:next');
  expect(focus.focused).toBe('settings:home:movies:cat18');
  await select('home:order'); expect(root.textContent).toContain('Unavailable category · ID missing');
  await select('home:movies:missing:down'); await select('save'); expect(config.homePreferences?.movieCategoryIds).toEqual(['1', 'missing']);
  vi.mocked(api.vodCategories).mockRejectedValue(new Error('Offline'));
  await select('tab:general'); await select('tab:home');
  expect(root.textContent).toContain('Saved selections are retained');
  expect(root.textContent).toContain('Unavailable category · ID missing');
  await select('home:retry'); expect(api.vodCategories).toHaveBeenCalledTimes(3);
  expect(config.homePreferences?.movieCategoryIds).toEqual(['1', 'missing']);
});

it('renders selected movies and series in separate saved order, hides optional rows, and retains all shortcuts when empty', async () => {
  config.homePreferences = { ...defaultHomePreferences(), movieCategoryIds: ['2', '1'], seriesCategoryIds: ['1'], sectionVisibility: { continueWatching: false, favorites: false } };
  await mount(home());
  expect([...root.querySelectorAll('.media-row h2')].map(row => row.textContent)).toEqual(['Category movies 2', 'Category movies 1', 'Category series 1']);
  expect(api.vod).not.toHaveBeenCalled(); expect(api.series).not.toHaveBeenCalled(); expect(api.homeCatalog).toHaveBeenCalledTimes(2);
  act(() => render(null, root)); config.homePreferences.movieCategoryIds = []; config.homePreferences.seriesCategoryIds = [];
  await mount(home()); expect(root.querySelectorAll('.media-row')).toHaveLength(0); expect(root.querySelectorAll('.home-card')).toHaveLength(6);
  expect(api.homeCatalog).toHaveBeenCalledTimes(2); // intentionally empty never requests catalog previews
});

it('preserves surviving card identity on row insertion/reorder/metadata and picks a neighboring row when removed', async () => {
  const card = (key: string) => ({ key, title: key, select() {} });
  const a: MediaRow = { id: 'a', title: 'A', cards: [card('a1')] }, b: MediaRow = { id: 'b', title: 'B', cards: [card('b1')] }, c: MediaRow = { id: 'c', title: 'C', cards: [card('c1')] };
  await mount(<MediaRows rows={[a, b, c]} scope="home" top="home:live" />);
  act(() => { focus.focus('b1'); }); const button = document.activeElement;
  act(() => render(<Harness><MediaRows rows={[c, b, a]} scope="home" top="home:live" /></Harness>, root)); await settle();
  expect(document.activeElement).toBe(button); expect(focus.focused).toBe('b1');
  act(() => render(<Harness><MediaRows rows={[c, { ...b, title: 'Metadata changed' }, a]} scope="home" top="home:live" /></Harness>, root)); await settle(); expect(document.activeElement).toBe(button);
  act(() => render(<Harness><MediaRows rows={[c, a]} scope="home" top="home:live" /></Harness>, root)); await settle(); expect(focus.focused).toBe('a1');
});

it('applies saved settings through the real router without reloading Home or losing the Settings Save control', async () => {
  await mount(<App />);
  act(() => { focus.focus('home:settings'); focus.select(); }); await settle(); await ready();
  await select('tab:home'); await select('home:movies:2'); await select('home:series'); await select('home:series:1');
  const saveButton = root.querySelector('[data-focus-key="settings:save"]');
  await select('save'); expect(root.querySelector('[data-focus-key="settings:save"]')).toBe(saveButton);
  await press('Escape'); await ready();
  expect(root.querySelector('.home-screen')).not.toBeNull(); expect(root.textContent).toContain('Category movies 2'); expect(root.textContent).toContain('Category series 1');
  expect(focus.focused).toBe('home:settings'); expect(api.status).toHaveBeenCalledTimes(2); // startup + Settings version, no authentication restart
  expect(api.config).toHaveBeenCalledTimes(2); // initial fallback + Settings read; Save supplies the next Home snapshot
  const detail = vi.spyOn(api, 'vodInfo').mockResolvedValue({ id: 'movies2', name: 'Selected movie details', categoryId: '2' });
  act(() => { focus.focus('home:movies:category:2:movies2'); });
  const scroller = root.querySelector<HTMLElement>('[data-scroll-key="home:rows"]')!; scroller.scrollTop = 123;
  await press('Enter'); await ready(); expect(detail).toHaveBeenCalledWith('movies2'); expect(root.textContent).toContain('Selected movie details');
  await press('Escape'); await ready(); expect(focus.focused).toBe('home:movies:category:2:movies2');
  expect(root.querySelector<HTMLElement>('[data-scroll-key="home:rows"]')?.scrollTop).toBe(123);
});

it('uses the existing startup snapshot without an extra configuration request', async () => {
  vi.mocked(api.status).mockResolvedValue({ version: '1.2.2', configured: true, demoMode: false, language: 'en', languageConfigured: true, autoplayLive: false, home: { homeProviderKey: 'fixture', homePreferences: null } });
  await mount(<App />); expect(api.config).not.toHaveBeenCalled(); expect(api.vod).toHaveBeenCalledTimes(1); expect(api.series).toHaveBeenCalledTimes(1);
});

it('retains draft changes when categories arrive late and keeps the moved action across category pages', async () => {
  let arrive!: (value: Awaited<ReturnType<typeof api.vodCategories>>) => void;
  vi.mocked(api.vodCategories).mockImplementation(() => new Promise(resolve => { arrive = resolve; }));
  config.homePreferences = { ...defaultHomePreferences(), movieCategoryIds: Array.from({ length: 21 }, (_, i) => String(i + 1)) };
  await mount(settings()); await select('tab:home'); await select('home:favorites'); const button = document.activeElement;
  act(() => arrive(Array.from({ length: 21 }, (_, i) => ({ id: String(i + 1), name: `Category ${i + 1}` })))); await settle();
  expect(document.activeElement).toBe(button);
  await select('home:order'); await select('home:next'); expect(focus.focused).toBe('settings:home:movies:21');
  await select('home:movies:21:up'); expect(focus.focused).toBe('settings:home:movies:21:up');
  await select('save'); expect(config.homePreferences?.movieCategoryIds?.slice(19)).toEqual(['21', '20']); expect(config.homePreferences?.sectionVisibility.favorites).toBe(false);
});

it('preserves surviving Home cards through preference changes and ignores responses for older selections', async () => {
  const configuration = (ids: string[]): HomeConfiguration => ({ homeProviderKey: 'fixture', homePreferences: { ...defaultHomePreferences(), movieCategoryIds: ids, seriesCategoryIds: [], sectionVisibility: { continueWatching: false, favorites: false } } });
  const screen = (ids: string[]) => <Home configuration={configuration(ids)} open={() => {}} movie={() => {}} series={() => {}} favorite={() => {}} resume={() => {}} />;
  const result = (ids: string[]): HomeCatalog => ({ rows: ids.map(id => ({ id, title: `Category ${id}`, items: [{ id, name: `Item ${id}`, categoryId: id }] })), failed: false });
  vi.mocked(api.homeCatalog).mockResolvedValueOnce(result(['1', '2']));
  await mount(screen(['1', '2'])); act(() => { focus.focus('home:movies:category:2:2'); }); const button = document.activeElement;
  let old!: (value: HomeCatalog) => void;
  vi.mocked(api.homeCatalog).mockImplementationOnce(() => new Promise(resolve => { old = resolve; })).mockResolvedValueOnce(result(['2', '4']));
  act(() => render(<Harness>{screen(['2', '1', '3'])}</Harness>, root)); await settle();
  expect(document.activeElement).toBe(button);
  act(() => render(<Harness>{screen(['2', '4'])}</Harness>, root)); await settle(); await ready();
  expect(document.activeElement).toBe(button); expect(focus.focused).toBe('home:movies:category:2:2');
  act(() => old(result(['2', '1', '3']))); await settle();
  expect([...root.querySelectorAll('.media-row h2')].map(row => row.textContent)).toEqual(['Category 2', 'Category 4']);
  vi.mocked(api.homeCatalog).mockResolvedValueOnce(result(['4']));
  act(() => render(<Harness>{screen(['4'])}</Harness>, root)); await settle(); await ready();
  expect(focus.focused).toBe('home:movies:category:4:4');
});
