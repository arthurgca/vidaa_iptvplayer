import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

let temporary = '';

afterEach(async () => {
  delete process.env.DATA_DIR;
  vi.resetModules();
  if (temporary) await rm(temporary, { recursive: true, force: true });
  temporary = '';
});

describe('content data state', () => {
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
