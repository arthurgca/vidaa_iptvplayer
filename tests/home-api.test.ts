import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { defaultHomePreferences } from '../src/homePreferences';

let child: ChildProcess, provider: Server, directory: string, base: string, providerUrl: string;
let removed = false, failing = false;
const received: string[] = [];
async function listen(server: Server) { await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); return (server.address() as { port: number }).port; }
const close = (server: Server) => new Promise<void>(resolve => server.close(() => resolve()));
const request = async (endpoint: string, method = 'GET', body?: unknown) => {
  const response = await fetch(`${base}/api/${endpoint}`, { method, headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, value: await response.json() };
};
let env: NodeJS.ProcessEnv;
async function start() {
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env, windowsHide: true, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* waiting for fixture */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Home API fixture did not start.');
}
async function stop() {
  if (child && child.exitCode === null) { child.kill(); await new Promise<void>(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', () => resolve()); }); }
}
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'vidaa-home-api-'));
  provider = createServer((req, res) => {
    const url = new URL(req.url!, 'http://fixture'); const action = url.searchParams.get('action') || '';
    received.push(action); res.setHeader('content-type', 'application/json');
    if (failing) { res.statusCode = 503; res.end('{}'); return; }
    if (action.includes('categories')) { res.end(JSON.stringify([{ category_id: '1', category_name: 'Duplicate name' }, ...removed ? [] : [{ category_id: '2', category_name: 'Duplicate name' }], { category_id: 'empty', category_name: 'Empty' }])); return; }
    res.end(JSON.stringify([{ stream_id: 'a', series_id: 's', name: 'First', category_id: '1', category_ids: ['2'] }, { stream_id: 'b', series_id: 't', name: 'Second', category_id: '2' }]));
  });
  providerUrl = `http://127.0.0.1:${await listen(provider)}`;
  const reservation = createServer(); const port = await listen(reservation); await close(reservation); base = `http://127.0.0.1:${port}`;
  env = { ...process.env, DATA_DIR: directory, PORT: String(port), NODE_ENV: 'test' };
  for (const key of ['XTREAM_BASE_URL', 'XTREAM_USERNAME', 'XTREAM_PASSWORD', 'XMLTV_URL', 'EPG_REFRESH_HOURS', 'PREFERRED_LIVE_FORMAT', 'AUTOPLAY_LIVE', 'REMEMBER_LAST_CHANNEL', 'DEMO_MODE', 'LANGUAGE']) delete env[key];
  await start();
}, 15000);
afterAll(async () => { await stop(); if (provider) await close(provider); if (directory) await rm(directory, { recursive: true, force: true }); });

it('connects Home to persisted settings, refresh/restart/provider changes and existing shared catalog caching', async () => {
  let config = (await request('config', 'PUT', { xtreamBaseUrl: providerUrl, xtreamUsername: 'A', xtreamPassword: 'secret', autoplayLive: false })).value;
  expect(config.homePreferences).toBeNull();
  // Original renderer path stays in provider order and retains its 12-item bound.
  expect((await request('xtream/vod?limit=12')).value.items.map((item: { id: string }) => item.id)).toEqual(['a', 'b']);
  expect(received.filter(value => value === 'get_vod_streams')).toHaveLength(1);
  const preferences = { ...defaultHomePreferences(), movieCategoryIds: ['2', 'missing', '1', 'empty'], seriesCategoryIds: ['1'], sectionVisibility: { favorites: false, continueWatching: false } };
  config = (await request('config', 'PUT', { homePreferences: preferences, homeProviderKey: config.homeProviderKey })).value;
  const endpoint = `home/catalog/movies?provider=${config.homeProviderKey}`;
  const first = (await request(endpoint)).value;
  expect(first.failed).toBe(false); expect(first.rows.map((row: { id: string }) => row.id)).toEqual(['2', '1']);
  expect(first.rows[0].items.map((item: { id: string }) => item.id)).toEqual(['a', 'b']);
  await request(endpoint); await request('xtream/vod/catalog?category_id=1');
  expect(received.filter(value => value === 'get_vod_streams')).toHaveLength(1); // Home save did not flush a warm catalog
  expect(received.filter(value => value === 'get_vod_categories')).toHaveLength(1);
  expect(received.every(value => !value.endsWith('_info'))).toBe(true);
  const series = (await request(`home/catalog/series?provider=${config.homeProviderKey}`)).value;
  expect(series.rows[0].items[0].id).toBe('s');
  await stop(); await start();
  expect((await request('config')).value.homePreferences).toEqual(preferences);
  removed = true; await request('refresh', 'POST');
  expect((await request(endpoint)).value.rows.map((row: { id: string }) => row.id)).toEqual(['1']);
  expect((await request('config')).value.homePreferences).toEqual(preferences);
  failing = true; await request('refresh', 'POST');
  expect((await request(endpoint)).value).toEqual({ rows: [], failed: true });
  expect((await request('config')).value.homePreferences).toEqual(preferences);
  failing = false; expect((await request(endpoint)).value.rows).toHaveLength(1); // retry recovers without another save
  const providerA = config.homeProviderKey;
  config = (await request('config', 'PUT', { xtreamUsername: 'B' })).value;
  expect(config.homeProviderKey).not.toBe(providerA); expect(config.homePreferences).toBeNull();
  expect((await request(endpoint)).status).toBe(409);
  expect((await request('config', 'PUT', { homeProviderKey: providerA, homePreferences: preferences })).status).not.toBe(200);
  config = (await request('config', 'PUT', { xtreamUsername: 'A' })).value;
  expect(config.homePreferences).toEqual(preferences);
  await request('favorites', 'PUT', { type: 'movie', id: 'f', item: { id: 'f', name: 'Favorite', categoryId: '1' } });
  await request('history', 'POST', { type: 'movie', id: 'h', item: { id: 'h', name: 'History', categoryId: '1' }, position: 60, duration: 600 });
  await request('config', 'PUT', { homePreferences: null, homeProviderKey: providerA });
  expect((await request('config')).value).toMatchObject({ homePreferences: null, passwordConfigured: true, autoplayLive: false });
  expect((await request('favorites')).value).toHaveLength(1); expect((await request('history')).value).toHaveLength(1);
}, 15000);
