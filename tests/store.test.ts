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
