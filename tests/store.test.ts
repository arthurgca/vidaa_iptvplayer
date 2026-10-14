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
