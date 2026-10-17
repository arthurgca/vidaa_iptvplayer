import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';

let child: ChildProcess, provider: Server, directory: string, base: string, providerUrl: string;
const received: string[] = [];
async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as { port: number }).port;
}
const close = (server: Server) => new Promise<void>(resolve => server.close(() => resolve()));
const request = async (endpoint: string, method = 'GET', body?: unknown) => {
  const response = await fetch(`${base}/api/${endpoint}`, { method, headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const value = response.status === 204 ? undefined : await response.json();
  return { status: response.status, value };
};
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'vidaa-settings-api-'));
  provider = createServer((req, res) => {
    const url = new URL(req.url!, 'http://fixture');
    if (url.pathname === '/guide.xml') { res.end('<?xml version="1.0"?><tv></tv>'); return; }
    received.push(url.searchParams.get('username') ?? '');
    res.setHeader('content-type', 'application/json');
    if (url.searchParams.has('action')) { res.end('[]'); return; }
    if (url.searchParams.get('password') === 'rejected') { res.end('{"user_info":{"auth":0,"status":"Expired"}}'); return; }
    if (url.pathname.startsWith('/unexpected/')) { res.end('not json'); return; }
    res.end('{"user_info":{"auth":1,"status":"Active"}}');
  });
  providerUrl = `http://127.0.0.1:${await listen(provider)}`;
  const reservation = createServer(); const port = await listen(reservation); await close(reservation);
  base = `http://127.0.0.1:${port}`;
  const env = { ...process.env };
  for (const key of ['XTREAM_BASE_URL', 'XTREAM_PASSWORD', 'EPG_REFRESH_HOURS', 'PREFERRED_LIVE_FORMAT', 'AUTOPLAY_LIVE', 'REMEMBER_LAST_CHANNEL', 'DEMO_MODE', 'LANGUAGE']) delete env[key];
  Object.assign(env, { DATA_DIR: directory, PORT: String(port), NODE_ENV: 'test', XTREAM_USERNAME: 'managed-user', XMLTV_URL: `${providerUrl}/guide.xml?token=hidden` });
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env, windowsHide: true, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* waiting for isolated fixture */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Settings API fixture did not start.');
}, 15000);
afterAll(async () => {
  if (child && child.exitCode === null) {
    // Kill the Node server directly, without a shell helper or descendant process.
    child.kill(); await new Promise<void>(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', () => resolve()); });
  }
  if (provider) await close(provider);
  if (directory) await rm(directory, { recursive: true, force: true });
});

it('tests the edited effective account with environment precedence, reliable failures and no persistence', async () => {
  expect((await request('config', 'PUT', { xtreamBaseUrl: providerUrl, xtreamPassword: 'saved-password', language: 'pt', autoplayLive: false })).status).toBe(200);
  const original = (await request('config')).value;
  expect(original).toMatchObject({ xtreamUsername: 'managed-user', xtreamPassword: '', xmltvUrl: '', passwordConfigured: true });
  expect(JSON.stringify(original)).not.toContain('hidden');
  expect((await request('config/test', 'POST', { xtreamUsername: 'draft-user', xtreamPassword: '' })).value).toEqual({ ok: true, message: 'connected' });
  expect(received[received.length - 1]).toBe('managed-user');
  expect((await request('config/test', 'POST', { xtreamPassword: 'rejected' })).value).toEqual({ error: 'auth' });
  expect((await request('config/test', 'POST', { xtreamBaseUrl: `${providerUrl}/unexpected` })).value).toEqual({ error: 'response' });
  expect((await request('config/test', 'POST', { xtreamBaseUrl: '' })).value).toEqual({ error: 'missing' });
  expect((await request('config/test', 'POST', { demoMode: true })).value).toEqual({ ok: true, message: 'demo' });
  expect((await request('config')).value).toEqual(original);
});

it('preserves credentials for content clearing, restores catalogs on refresh, and scopes account removal', async () => {
  const item = { id: 'favorite', name: 'Fixture', categoryId: '' };
  await request('favorites', 'PUT', { type: 'movie', id: item.id, item });
  await request('history', 'POST', { type: 'movie', id: item.id, item, position: 30, duration: 120 });
  expect((await request('favorites')).value).toHaveLength(1);
  expect((await request('history')).value).toHaveLength(1);
  expect((await request('data', 'DELETE')).value).toMatchObject({ passwordConfigured: true, configured: true });
  expect((await request('favorites')).value).toEqual([]); expect((await request('history')).value).toEqual([]);
  const before = received.length;
  expect((await request('xtream/live/catalog')).value).toEqual([]); expect(received.length).toBe(before);
  expect((await request('refresh', 'POST')).status).toBe(200);
  await request('xtream/live/catalog'); expect(received.length).toBeGreaterThan(before);
  const removed = await request('data/all', 'DELETE');
  expect(removed.value).toMatchObject({ xtreamBaseUrl: '', xtreamUsername: 'managed-user', passwordConfigured: false, configured: false, language: 'pt', autoplayLive: false });
});
