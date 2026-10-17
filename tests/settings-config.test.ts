import { mkdtemp, readFile, mkdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'vidaa-settings-'));
  vi.resetModules(); vi.stubEnv('DATA_DIR', directory);
  for (const name of ['XTREAM_BASE_URL', 'XTREAM_USERNAME', 'XTREAM_PASSWORD', 'XMLTV_URL', 'EPG_REFRESH_HOURS', 'PREFERRED_LIVE_FORMAT', 'AUTOPLAY_LIVE', 'REMEMBER_LAST_CHANNEL', 'DEMO_MODE', 'LANGUAGE']) delete process.env[name];
});
afterEach(async () => { vi.unstubAllEnvs(); vi.resetModules(); await rm(directory, { recursive: true, force: true }); });

it('restores compatible saved settings after restart and preserves a blank masked password', async () => {
  const config = await import('../server/config'); await config.initConfig();
  await config.saveConfig({ xtreamBaseUrl: 'https://fixture.invalid/path', xtreamUsername: 'test', xtreamPassword: 'secret', language: 'pt', preferredLiveFormat: 'hls', autoplayLive: false, rememberLastChannel: false, epgRefreshHours: 3 });
  await config.saveConfig({ xtreamPassword: '', xmltvUrl: 'https://epg.invalid/guide.xml' });
  expect(config.getConfig().xtreamPassword).toBe('secret'); expect(config.publicConfig().xtreamPassword).toBe('');
  vi.resetModules(); const reopened = await import('../server/config'); await reopened.initConfig();
  expect(reopened.getConfig()).toMatchObject({ language: 'pt', preferredLiveFormat: 'hls', autoplayLive: false, rememberLastChannel: false, epgRefreshHours: 3, xtreamPassword: 'secret' });
});

it('reports exact environment precedence, hides sensitive XMLTV, and ignores managed updates', async () => {
  const config = await import('../server/config'); await config.initConfig(); await config.saveConfig({ xtreamPassword: 'saved', language: 'pt' });
  vi.stubEnv('XTREAM_PASSWORD', 'external'); vi.stubEnv('XMLTV_URL', 'https://epg.invalid?password=secret'); vi.stubEnv('AUTOPLAY_LIVE', ''); vi.stubEnv('LANGUAGE', 'invalid');
  expect(config.managedSettings().sort()).toEqual(['autoplayLive', 'xmltvUrl', 'xtreamPassword'].sort());
  expect(config.publicConfig()).toMatchObject({ xtreamPassword: '', xmltvUrl: '', autoplayLive: false, language: 'pt' });
  await config.saveConfig({ xtreamPassword: 'overwrite', autoplayLive: true });
  expect(JSON.parse(await readFile(path.join(directory, 'config.json'), 'utf8')).xtreamPassword).toBe('saved');
});

it('does not change effective configuration after failed persistence and serializes concurrent saves', async () => {
  const config = await import('../server/config'); await config.initConfig(); await config.saveConfig({ xtreamUsername: 'original' });
  const target = path.join(directory, 'config.json'); await rename(target, `${target}.backup`); await mkdir(target);
  await expect(config.saveConfig({ xtreamUsername: 'lost' })).rejects.toThrow(); expect(config.getConfig().xtreamUsername).toBe('original');
  await rm(target, { recursive: true }); await rename(`${target}.backup`, target);
  await Promise.all([config.saveConfig({ language: 'pt' }), config.saveConfig({ preferredLiveFormat: 'ts' })]);
  expect(JSON.parse(await readFile(target, 'utf8'))).toMatchObject({ xtreamUsername: 'original', language: 'pt', preferredLiveFormat: 'ts' });
});

it('validates writable schema and URLs without echoing credentials or narrowing provider paths', async () => {
  const { configUpdate } = await import('../server/configValidation');
  expect(configUpdate({ xtreamBaseUrl: 'https://provider.invalid:8443/path?custom=1', xmltvUrl: 'https://epg.invalid?password=secret', epgRefreshHours: 24, xtreamPassword: '' })).toEqual({ xtreamBaseUrl: 'https://provider.invalid:8443/path?custom=1', xmltvUrl: 'https://epg.invalid?password=secret', epgRefreshHours: 24 });
  for (const value of [{ xtreamBaseUrl: 'https://user:secret@provider.invalid' }, { autoplayLive: 'false' }, { epgRefreshHours: -1 }, { preferredLiveFormat: 'mp4' }, { language: 'es' }]) expect(() => configUpdate(value)).toThrow();
  expect(() => configUpdate({ xtreamBaseUrl: 'password=secret' })).toThrow('Enter a valid HTTP');
});
