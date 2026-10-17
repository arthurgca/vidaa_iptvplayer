import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HistoryItem } from '../server/types';

let temporary = '';

afterEach(async () => {
  delete process.env.DATA_DIR;
  vi.resetModules();
  if (temporary) await rm(temporary, { recursive: true, force: true });
  temporary = '';
});

describe('content data state', () => {
  const historyRow = (type: HistoryItem['type'], id: string, checkpointAt = 100): HistoryItem => ({
    type, id, item: type === 'series' ? { id, name: 'Same episode title', season: 9, episode: Number(id) || 1 } : { id, name: 'Same title', categoryId: '' },
    ...(type === 'series' ? { series: { id: 'show', name: 'The Office', categoryId: '' } } : {}),
    position: 120, duration: 600, watchedAt: checkpointAt, checkpointAt
  });
  async function setup() {
    temporary = await mkdtemp(path.join(tmpdir(), 'vidaa-store-'));
    process.env.DATA_DIR = temporary;
    return import('../server/store');
  }

  it('clears all persisted records beyond the read limit, retains favorites and settings, and survives restart', async () => {
    const { library, initStore } = await setup();
    const history = Array.from({ length: 150 }, (_, i) => historyRow((['movie', 'series', 'live'] as const)[i % 3]!, String(i), 200 - i));
    const favorites = [{ type: 'movie', id: 'favorite', item: { id: 'favorite', name: 'Favorite', categoryId: '' }, addedAt: 1 }];
    const config = JSON.stringify({ xtreamPassword: 'fixture', homePreferencesByProvider: { fixture: { movieCategoryIds: ['1'] } } });
    await writeFile(path.join(temporary, 'library.json'), JSON.stringify({ history, favorites, contentCleared: false }));
    await writeFile(path.join(temporary, 'config.json'), config);
    await initStore(); expect(library.history()).toHaveLength(100);
    await library.clearHistory();
    const disk = JSON.parse(await readFile(path.join(temporary, 'library.json'), 'utf8'));
    expect(disk.history).toEqual([]); expect(disk.favorites).toEqual(favorites); expect(disk.contentCleared).toBe(false);
    expect(await readFile(path.join(temporary, 'config.json'), 'utf8')).toBe(config);
    vi.resetModules(); const reloaded = await import('../server/store'); await reloaded.initStore();
    expect(reloaded.library.history()).toEqual([]); expect(reloaded.library.favorites()).toEqual(favorites);
    await reloaded.library.clearHistory(); expect(reloaded.library.history()).toEqual([]);
  });

  it('removes by type and episode ID, preserves chronology, and blocks delayed saves across restart', async () => {
    const { library } = await setup();
    const first = historyRow('series', '1', 100); const second = historyRow('series', '2', 300); const movie = historyRow('movie', '1', 200);
    await Promise.all([first, second, movie].map(row => library.watched(row)));
    expect(library.history().map(row => [row.type, row.id])).toEqual([['series', '2'], ['movie', '1'], ['series', '1']]);
    const oldSession = library.historyVersion();
    await library.forget('series', '1');
    await expect(library.watched({ ...first, checkpointAt: 9999 }, oldSession)).rejects.toThrow('Watch history changed');
    // Removing another episode must not interrupt an unrelated active movie.
    await library.watched({ ...movie, checkpointAt: 400 }, oldSession);
    vi.resetModules(); const reloaded = await import('../server/store'); await reloaded.initStore();
    expect(reloaded.library.history().map(row => [row.type, row.id])).toEqual([['movie', '1'], ['series', '2']]);
    await expect(reloaded.library.watched(first, oldSession)).rejects.toThrow('Watch history changed');
    await reloaded.library.watched(first, reloaded.library.historyVersion());
    expect(reloaded.library.history()).toHaveLength(3);
  });

  it('serializes clear, concurrent favorites, and delayed checkpoints without restoring deleted history', async () => {
    const { library } = await setup(); const movie = historyRow('movie', 'movie');
    await library.watched(movie); const version = library.historyVersion();
    const outcomes = await Promise.allSettled([
      library.clearHistory(), library.watched({ ...movie, checkpointAt: 9000 }, version),
      library.favorite({ type: 'movie', id: 'favorite', item: { id: 'favorite', name: 'Favorite', categoryId: '' }, addedAt: 1 })
    ]);
    expect(outcomes.map(value => value.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(library.history()).toEqual([]); expect(library.favorites()).toHaveLength(1);
    vi.resetModules(); const reloaded = await import('../server/store'); await reloaded.initStore();
    await expect(reloaded.library.watched(movie, version)).rejects.toThrow('Watch history changed');
    await reloaded.library.watched(movie, reloaded.library.historyVersion());
    expect(reloaded.library.history()).toEqual([movie]);
  });

  it.each(['clear', 'single'] as const)('keeps memory and disk unchanged when %s deletion fails, and recovers the write queue', async kind => {
    const { library } = await setup(); const movie = historyRow('movie', 'movie'); await library.watched(movie);
    const disk = await readFile(path.join(temporary, 'library.json'), 'utf8');
    const blocked = path.join(temporary, 'library.json.tmp'); await mkdir(blocked);
    await expect(kind === 'clear' ? library.clearHistory() : library.forget('movie', 'movie')).rejects.toThrow();
    expect(library.history()).toEqual([movie]); expect(library.historyVersion()).toBe(0);
    expect(await readFile(path.join(temporary, 'library.json'), 'utf8')).toBe(disk);
    await rm(blocked, { recursive: true });
    await library.clearHistory(); expect(library.history()).toEqual([]);
    vi.resetModules(); const reloaded = await import('../server/store'); await reloaded.initStore(); expect(reloaded.library.history()).toEqual([]);
  });
  it('persists the newest checkpoint when progress requests arrive out of order', async () => {
    temporary = await mkdtemp(path.join(tmpdir(), 'vidaa-store-'));
    process.env.DATA_DIR = temporary;
    const { library } = await import('../server/store');
    const row = { type: 'movie' as const, id: 'movie', item: { id: 'movie', name: 'Movie', categoryId: '' }, position: 300, duration: 300, completed: true, watchedAt: 2, checkpointAt: 200 };
    await library.watched(row);
    expect(await library.watched({ ...row, position: 250, completed: false, watchedAt: 3, checkpointAt: 100 })).toEqual(row);
    vi.resetModules();
    const reloaded = await import('../server/store'); await reloaded.initStore();
    expect(reloaded.library.history()).toEqual([row]);
    await reloaded.library.watched({ ...row, position: 20, completed: false, checkpointAt: 300 });
    expect(reloaded.library.history()[0]?.position).toBe(20);
    expect(reloaded.library.history()[0]?.completed).toBe(false);
  });

  it('keeps the last played channel first when an older channel save arrives late', async () => {
    temporary = await mkdtemp(path.join(tmpdir(), 'vidaa-store-'));
    process.env.DATA_DIR = temporary;
    const { library } = await import('../server/store');
    const row = (id: string, checkpointAt: number) => ({ type: 'live' as const, id, item: { id, name: id, categoryId: '' }, position: 0, duration: 0, watchedAt: Date.now(), checkpointAt });
    await library.watched(row('new', 200));
    await library.watched(row('old', 100));
    expect(library.history().map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('persists favorite reordering and removes one history item without affecting favorites', async () => {
    temporary = await mkdtemp(path.join(tmpdir(), 'vidaa-store-'));
    process.env.DATA_DIR = temporary;
    const { library } = await import('../server/store');
    const channel = (id: string) => ({ id, name: id, categoryId: 'one' });
    for (const id of ['a', 'b', 'c']) await library.favorite({ type: 'live', id, item: channel(id), addedAt: 0 });
    await library.moveFavorite('live', 'a', -1);
    expect(library.favorites().map((row) => row.id)).toEqual(['c', 'a', 'b']);
    await library.moveFavorite('live', 'c', -1);
    expect(library.favorites().map((row) => row.id)).toEqual(['c', 'a', 'b']);
    await expect(library.moveFavorite('live', 'a', 2)).rejects.toThrow('Invalid move direction');
    await Promise.all(['a', 'b'].map((id) => library.watched({ type: 'live', id, item: channel(id), position: 0, duration: 0, watchedAt: 0 })));
    await library.forget('live', 'a');
    vi.resetModules();
    const reloaded = await import('../server/store'); await reloaded.initStore();
    expect(reloaded.library.favorites().map((row) => row.id)).toEqual(['c', 'a', 'b']);
    expect(reloaded.library.history().map((row) => row.id)).toEqual(['b']);
  });

  it('stays cleared until an explicit restore and persists both transitions', async () => {
    temporary = await mkdtemp(path.join(tmpdir(), 'vidaa-store-'));
    process.env.DATA_DIR = temporary;
    const { library } = await import('../server/store');

    await library.clear();
    expect(library.contentCleared()).toBe(true);
    expect(library.favorites()).toEqual([]);
    expect(library.history()).toEqual([]);

    vi.resetModules();
    const reloaded = await import('../server/store');
    await reloaded.initStore();
    expect(reloaded.library.contentCleared()).toBe(true);

    await reloaded.library.restoreContent();
    expect(reloaded.library.contentCleared()).toBe(false);
  });
});
