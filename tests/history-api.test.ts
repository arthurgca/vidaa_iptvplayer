import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { HistoryItem } from '../src/types';
import { continuing } from '../src/screens/libraryRows';

let child: ChildProcess; let directory: string; let base: string; let port: number;
async function stop() {
  if (child && child.exitCode === null) {
    child.kill(); await new Promise<void>(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', () => resolve()); });
  }
}
async function start() {
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: { ...process.env, DATA_DIR: directory, PORT: String(port), NODE_ENV: 'test', DEMO_MODE: 'true' }, windowsHide: true, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* waiting for isolated server */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('History API fixture did not start.');
}
async function request(endpoint: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${base}/api/${endpoint}`, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, value: response.status === 204 ? undefined : await response.json() };
}
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'vidaa-history-api-'));
  const reservation = createServer(); await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
  port = (reservation.address() as { port: number }).port;
  await new Promise<void>(resolve => reservation.close(() => resolve())); base = `http://127.0.0.1:${port}`;
  await start();
}, 15000);
afterAll(async () => { await stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

it('commits scoped history deletion through HTTP, protects unrelated settings, rejects old players and persists after a real server restart', async () => {
  await request('config', 'PUT', { xtreamBaseUrl: 'https://fixture.invalid', xtreamUsername: 'fixture', xtreamPassword: 'secret', autoplayLive: false });
  const configuration = (await request('config')).value;
  await request('config', 'PUT', { homeProviderKey: configuration.homeProviderKey, homePreferences: { version: 1, movieCategoryIds: ['1'], seriesCategoryIds: ['2'], sectionVisibility: { continueWatching: true, favorites: true } } });
  const configBefore = await readFile(path.join(directory, 'config.json'), 'utf8');
  const favorite = { type: 'movie', id: 'favorite', item: { id: 'favorite', name: 'Favorite', categoryId: '' } };
  await request('favorites', 'PUT', favorite); const favoritesBefore = (await request('favorites')).value;
  const rows = (['movie', 'series', 'series', 'live'] as const).map((type, index) => ({ type, id: String(index),
    item: type === 'series' ? { id: String(index), name: 'Same title', season: 1, episode: index } : { id: String(index), name: type, categoryId: '' },
    ...(type === 'series' ? { series: { id: 'show', name: 'Show', categoryId: '' } } : {}), position: 120, duration: 600, checkpointAt: 100 + index
  }));
  const version = (await request('history/version')).value;
  for (const row of rows) expect((await request('history', 'POST', { ...row, historyVersion: version })).status).toBe(200);
  expect((await request('history')).value.map((row: HistoryItem) => row.id)).toEqual(['3', '2', '1', '0']);
  expect((await request('history/series/1', 'DELETE')).status).toBe(204);
  expect((await request('history', 'POST', { ...rows[1], checkpointAt: 99999, historyVersion: version })).status).toBe(502);
  expect((await request('history')).value.map((row: HistoryItem) => row.id)).toEqual(['3', '2', '0']);
  expect(continuing((await request('history')).value)).toHaveLength(2);

  // A real filesystem failure must return an error and retain both GET and disk state.
  const before = await readFile(path.join(directory, 'library.json'), 'utf8');
  const blocked = path.join(directory, 'library.json.tmp'); await mkdir(blocked);
  expect((await request('history', 'DELETE')).status).toBe(502);
  expect((await request('history')).value).toHaveLength(3);
  expect(await readFile(path.join(directory, 'library.json'), 'utf8')).toBe(before);
  await rm(blocked, { recursive: true });

  expect((await request('history', 'DELETE')).status).toBe(204);
  expect((await request('history')).value).toEqual([]); expect(continuing((await request('history')).value)).toEqual([]);
  expect((await request('live/selection')).value.channel.id).toBe('101'); // Existing fallback to the first catalog channel.
  expect(JSON.parse(await readFile(path.join(directory, 'library.json'), 'utf8')).history).toEqual([]);
  expect((await request('favorites')).value).toEqual(favoritesBefore);
  expect(await readFile(path.join(directory, 'config.json'), 'utf8')).toBe(configBefore);
  await stop(); await start();
  expect((await request('history')).value).toEqual([]); expect((await request('favorites')).value).toEqual(favoritesBefore);
  expect((await request('history', 'POST', { ...rows[0], checkpointAt: Date.now(), historyVersion: version })).status).toBe(502);
  expect((await request('history')).value).toEqual([]);
  expect((await request('history', 'DELETE')).status).toBe(204); // Safe on an empty store.
  const nextVersion = (await request('history/version')).value;
  expect((await request('history', 'POST', { ...rows[0], checkpointAt: Date.now(), historyVersion: nextVersion })).status).toBe(200);
  expect((await request('history')).value).toHaveLength(1);
}, 15000);
