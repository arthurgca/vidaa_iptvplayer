// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../src/api/client';
import { SeriesDetails } from '../src/screens/SeriesDetails';
import { useFocusManager } from '../src/navigation/FocusContext';
import type { FocusManager } from '../src/navigation/FocusManager';
import type { Episode, SeriesInfo } from '../src/types';
import { normalizeSeriesInfo } from '../server/xtream/normalizer';
import { rawVariants, seriesId } from './fixtures/xtream-episode-variants';
import type { RemoteAction } from '../src/platform/remote';

let container: HTMLDivElement, focus: FocusManager;
const seed = { id: 'show', name: 'Actual catalog title', categoryId: 'cat', rating: '0' };
const episodes: Episode[] = [0, 1, 2, 10].flatMap(season => [2, 10, 1].map(episode => ({ id: `${season}-${episode}`, season, episode, name: `Episode ${episode}`, extension: 'mkv' })));
const detail: SeriesInfo = { item: seed, episodes, seasons: [0, 1, 2, 3, 10].map(number => ({ id: String(number), number })) };
const play = vi.fn(), back = vi.fn(), save = vi.fn();
const settle = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
const ready = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 70)));
function Harness(props: Partial<Parameters<typeof SeriesDetails>[0]>) { focus = useFocusManager(); return <SeriesDetails seed={seed} play={play} back={back} saveContext={save} {...props} />; }
async function mount(props = {}) { act(() => render(<Harness {...props} />, container)); await settle(); await ready(); }
async function select(key: string) { act(() => { expect(focus.focus(key)).toBe(true); focus.select(); }); await settle(); }
beforeEach(() => {
  container = document.createElement('div'); document.body.append(container);
  vi.spyOn(api, 'seriesInfo').mockResolvedValue(detail); vi.spyOn(api, 'history').mockResolvedValue([]); vi.spyOn(api, 'favorites').mockResolvedValue([]);
  play.mockClear(); back.mockClear(); save.mockClear();
});
afterEach(() => { act(() => render(null, container)); container.remove(); vi.restoreAllMocks(); });

it('selects numeric seasons including zero, sorts episodes and keeps season switches local', async () => {
  await mount(); expect(focus.focused).toBe('series-detail:season:0'); expect(container.textContent).not.toContain('★ 0');
  expect([...container.querySelectorAll('.season-list button')].map(x => x.textContent)).toEqual(['Season 0','Season 1','Season 2','Season 3','Season 10']);
  await select('series-detail:season:10'); expect(focus.focused).toBe('series-detail:season:10');
  expect([...container.querySelectorAll('.episode-copy strong')].map(x => x.textContent)).toEqual(['Episode 1','Episode 2','Episode 10']);
  act(() => { focus.move('right'); }); expect(focus.focused).toBe('series-detail:episode:10-1'); expect(play).not.toHaveBeenCalled();
  await select('series-detail:season:1'); await select('series-detail:season:2'); await select('series-detail:season:10');
  expect(api.seriesInfo).toHaveBeenCalledTimes(1); expect(play).not.toHaveBeenCalled();
  await select('series-detail:episode:10-2'); expect(play).toHaveBeenCalledWith(expect.objectContaining({ id: '10-2', extension: 'mkv' }), seed, 0, expect.any(Array));
  await select('series-detail:season:3'); expect(container.textContent).toContain('not supplied episodes'); expect(focus.focused).toBe('series-detail:season:3');
});

it('uses persisted resume/watched state and restores season and episode after remount', async () => {
  vi.mocked(api.history).mockResolvedValue([{ type: 'series', id: '10-2', item: episodes.find(e => e.id === '10-2')!, series: seed, position: 120, duration: 2400, watchedAt: 1 }]);
  await mount({ context: { seasonId: '10', episodeId: '10-2' }, restoreFocus: 'series-detail:episode:10-2' });
  expect(focus.focused).toBe('series-detail:episode:10-2'); expect(container.querySelector('.season-list .active-item')?.textContent).toBe('Season 10');
  await select('series-detail:episode:10-2'); expect(play.mock.calls[0]?.[2]).toBe(120);
  // Actual playback unmounts details; emulate returning before restarting.
  act(() => render(null, container));
  await mount({ context: { seasonId: '10', episodeId: '10-2' }, restoreFocus: 'series-detail:episode:10-2' });
  await select('series-detail:restart:10-2'); expect(play.mock.calls[1]?.[2]).toBe(0);
  expect(save).toHaveBeenCalledWith({ seasonId: '10', episodeId: '10-2' });
});

it('keeps unknown numbers and missing metadata usable and clamps episode edges', async () => {
  vi.mocked(api.seriesInfo).mockResolvedValue({ item: seed, episodes: [{ id: 'unknown', season: null, episode: null, name: '', description: undefined }] });
  await mount(); expect(container.textContent).toContain('Unnumbered season'); expect(container.textContent).not.toContain('No description');
  await select('series-detail:season:unknown'); act(() => { focus.move('right'); }); expect(focus.focused).toBe('series-detail:episode:unknown');
  act(() => { focus.move('down'); }); expect(focus.focused).toBe('series-detail:episode:unknown');
  expect(container.querySelector('.episode-number')?.textContent).toBe('—');
});

it('does not allow a stale show response to replace the newly opened show', async () => {
  let resolve!: (value: SeriesInfo) => void;
  vi.mocked(api.seriesInfo).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await mount(); expect(focus.focused).toBe('series-detail:back');
  act(() => render(<Harness seed={{ ...seed, id: 'other', name: 'Other show' }} />, container)); await settle(); await ready();
  act(() => resolve({ item: { ...seed, name: 'Stale show' }, episodes: [] })); await settle();
  expect(container.textContent).not.toContain('Stale show'); expect(container.querySelectorAll('.episode-row')).toHaveLength(3);
});

it('provides focused Back while loading, remote retry on failure and an empty-details fallback', async () => {
  vi.mocked(api.seriesInfo).mockRejectedValueOnce(new Error('offline'));
  await mount(); expect(focus.focused).toBe('series-detail:back');
  act(() => { focus.move('down'); }); expect(focus.focused).toBe('series-detail:retry');
  await select('series-detail:retry'); await ready(); expect(focus.focused).toBe('series-detail:season:0');
  act(() => render(null, container)); vi.mocked(api.seriesInfo).mockResolvedValue({ item: seed, episodes: [] });
  await mount(); expect(container.textContent).toContain('No seasons or episodes'); await select('series-detail:back'); expect(back).toHaveBeenCalled();
});

const variantDetail = normalizeSeriesInfo(rawVariants, seriesId);
const variantSeed = variantDetail.item;
const groupedKey = () => container.querySelector<HTMLButtonElement>('.episode-row')!.dataset.focusKey!;

it.each(['406214', '418954', '419000'])('selects original variant %s exactly once using remote navigation', async id => {
  vi.mocked(api.seriesInfo).mockResolvedValue(variantDetail);
  await mount({ seed: variantSeed });
  expect(container.querySelectorAll('.episode-row')).toHaveLength(1);
  expect(container.querySelector('.episode-list h2')?.textContent).toContain('1 episodes');
  expect(container.textContent).toContain('3 streams available');
  const key = groupedKey(); await select(key);
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  expect([...container.querySelectorAll('.settings-choice')].map(e => e.textContent)).toEqual(['Stream 1', 'Stream 2', 'Stream 3']);
  expect(focus.focused).toBe('series-stream:406214');
  const index = ['406214', '418954', '419000'].indexOf(id);
  act(() => { for (let i = 0; i < index; i++) focus.move('down'); focus.select(); focus.select(); });
  await settle();
  expect(play).toHaveBeenCalledTimes(1);
  expect(play.mock.calls[0]![0]).toBe(variantDetail.episodes.find(e => e.id === id));
  expect(play.mock.calls[0]![0].extension).toBe('mp4');
  expect(play.mock.calls[0]![2]).toBe(0);
  expect(focus.focused).toBe(key);
  expect(api.seriesInfo).toHaveBeenCalledTimes(1);
});

it('closes with Back, traps focus and restores the exact row and scroll container', async () => {
  vi.mocked(api.seriesInfo).mockResolvedValue(variantDetail);
  let action: ((action: RemoteAction) => boolean) | null = null;
  await mount({ seed: variantSeed, registerAction: (value: typeof action) => { action = value; } });
  const key = groupedKey(), row = container.querySelector('.episode-row');
  const list = container.querySelector<HTMLElement>('.episode-list')!; list.scrollTop = 240;
  await select(key);
  expect(list.scrollTop).toBe(240); expect(focus.focus('series-detail:back')).toBe(false);
  act(() => { for (let i = 0; i < 30; i++) action?.('NAV_DOWN'); });
  expect(focus.focused).toBe('series-stream:419000');
  act(() => { action?.('BACK'); }); await settle();
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(focus.rootScope).toBe(true); expect(focus.focused).toBe(key);
  expect(document.activeElement).toBe(row); expect(list.scrollTop).toBe(240);
  expect(container.querySelector('.episode-row')).toBe(row);
  expect(play).not.toHaveBeenCalled(); expect(back).not.toHaveBeenCalled();
});

it('continues the previous variant, uses variant-specific resume and restores grouped context after playback', async () => {
  vi.mocked(api.seriesInfo).mockResolvedValue(variantDetail);
  vi.mocked(api.history).mockResolvedValue([
    { type: 'series', id: '418954', item: variantDetail.episodes[0]!, series: variantSeed, position: 123, duration: 3936, watchedAt: 20 },
    { type: 'series', id: '406214', item: variantDetail.episodes[1]!, series: variantSeed, position: 42, duration: 3936, watchedAt: 10 }
  ]);
  await mount({ seed: variantSeed });
  const key = groupedKey(); await select('details:continue');
  expect(focus.focused).toBe('series-stream:418954');
  act(() => { focus.move('up'); focus.select(); }); await settle();
  expect(play.mock.calls[0]![0].id).toBe('406214'); expect(play.mock.calls[0]![2]).toBe(42);
  expect(save).toHaveBeenLastCalledWith({ seasonId: '3', episodeId: key.slice('series-detail:episode:'.length) });
  const list = container.querySelector<HTMLElement>('.episode-list')!; list.scrollTop = 150;
  act(() => render(null, container));
  vi.mocked(api.seriesInfo).mockResolvedValue({ ...variantDetail, episodes: [...variantDetail.episodes].reverse() });
  await mount({ seed: variantSeed, restoreFocus: key, context: { seasonId: '3', episodeId: key.slice('series-detail:episode:'.length) }, scroll: [{ key: 'series:episodes', top: 150, left: 0 }] });
  expect(focus.focused).toBe(key); expect(container.querySelector<HTMLElement>('.episode-list')!.scrollTop).toBe(150);
  await select(key); expect(focus.focused).toBe('series-stream:418954');
  act(() => focus.select()); await settle();
  expect(play.mock.calls[1]![0].id).toBe('418954'); expect(play.mock.calls[1]![2]).toBe(123);
});

it('continues to the next logical episode after a completed variant', async () => {
  const next = { ...variantDetail.episodes[0]!, id: 'next', episode: 2, name: 'S03E02' };
  vi.mocked(api.seriesInfo).mockResolvedValue({ ...variantDetail, episodes: [...variantDetail.episodes, next] });
  vi.mocked(api.history).mockResolvedValue([{ type: 'series', id: '418954', item: variantDetail.episodes[0]!, series: variantSeed, position: 3936, duration: 3936, watchedAt: 1 }]);
  await mount({ seed: variantSeed }); await select('details:continue');
  expect(play.mock.calls[0]![0]).toBe(next); expect(container.querySelector('[role="dialog"]')).toBeNull();
});
