import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { homeProviderKey, validateHomePreferences } from '../server/homePreferences';
import { defaultHomePreferences } from '../src/homePreferences';
import { homeCategoryRows } from '../server/homeCatalog';
import { MovieIndex } from '../server/xtream/movieIndex';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'vidaa-home-preferences-')); vi.resetModules(); vi.stubEnv('DATA_DIR', directory);
  for (const name of ['XTREAM_BASE_URL', 'XTREAM_USERNAME', 'XTREAM_PASSWORD', 'DEMO_MODE']) vi.stubEnv(name, '');
});
afterEach(async () => { vi.unstubAllEnvs(); vi.resetModules(); await rm(directory, { recursive: true, force: true }); });

it('distinguishes original, empty, and ordered category selections and validates the schema', () => {
  expect(validateHomePreferences(null)).toBeNull();
  const value = { ...defaultHomePreferences(), movieCategoryIds: ['2', '1', '2'], seriesCategoryIds: [] };
  expect(validateHomePreferences(value)).toEqual({ ...value, movieCategoryIds: ['2', '1'] });
  for (const invalid of [{}, { ...value, movieCategoryIds: '1' }, { ...value, version: 2 }, { ...value, sectionVisibility: {} }, { ...value, seriesCategoryIds: [2] }]) expect(() => validateHomePreferences(invalid)).toThrow();
});

it('selects by ID, unions memberships, preserves selection order and current names, omits unavailable/empty/unplayable categories', () => {
  const index = new MovieIndex([
    { stream_id: 'a', name: 'First', category_id: '1', category_ids: ['2'] },
    { stream_id: 'b', name: 'Second', category_id: '2' },
    { name: 'Broken', category_id: 'broken' },
    ...Array.from({ length: 50 }, (_, id) => ({ stream_id: `other${id}`, name: 'Other', category_id: 'other' }))
  ]);
  const categories = [{ id: '1', name: 'Same name' }, { id: '2', name: 'Same name' }, { id: 'empty', name: 'Empty' }, { id: 'broken', name: 'Broken' }, { id: 'other', name: 'Other' }];
  const selected = ['2', 'missing', '1', 'empty', 'broken', 'other'];
  const rows = homeCategoryRows(index, categories, selected);
  expect(rows.map(row => row.id)).toEqual(['2', '1', 'other']);
  expect(rows[0]?.items.map(item => item.id)).toEqual(['a', 'b']); expect(rows[2]?.items).toHaveLength(12);
  expect(homeCategoryRows(index, [{ id: '2', name: 'Renamed' }], selected)[0]?.title).toBe('Renamed');
  expect(selected).toEqual(['2', 'missing', '1', 'empty', 'broken', 'other']);
});

it('persists through restart and provider switches, rejects stale writes, and restores only the current Home defaults', async () => {
  let config = await import('../server/config'); await config.initConfig();
  await config.saveConfig({ xtreamBaseUrl: 'https://fixture.invalid', xtreamUsername: 'A', xtreamPassword: 'secret', autoplayLive: false });
  const scopeA = config.publicConfig().homeProviderKey;
  const home = { ...defaultHomePreferences(), movieCategoryIds: ['2', '1'], seriesCategoryIds: [], sectionVisibility: { favorites: false, continueWatching: true } };
  await config.saveConfig({ homePreferences: home, homeProviderKey: scopeA });
  vi.resetModules(); config = await import('../server/config'); await config.initConfig();
  expect(config.publicConfig().homePreferences).toEqual(home);
  await config.saveConfig({ xtreamUsername: 'B' });
  expect(config.publicConfig().homePreferences).toBeNull();
  await expect(config.saveConfig({ homePreferences: home, homeProviderKey: scopeA })).rejects.toThrow('Provider changed');
  const scopeB = config.publicConfig().homeProviderKey;
  await config.saveConfig({ homePreferences: { ...home, movieCategoryIds: ['1'] }, homeProviderKey: scopeB });
  await config.saveConfig({ xtreamUsername: 'A', xtreamPassword: 'rotated-secret' });
  expect(config.publicConfig().homeProviderKey).toBe(scopeA); expect(config.publicConfig().homePreferences).toEqual(home);
  await config.saveConfig({ homePreferences: null, homeProviderKey: scopeA });
  expect(config.publicConfig().homePreferences).toBeNull(); expect(config.getConfig()).toMatchObject({ autoplayLive: false, xtreamPassword: 'rotated-secret' });
  await config.saveConfig({ xtreamUsername: 'B' }); expect(config.publicConfig().homePreferences?.movieCategoryIds).toEqual(['1']);
  const stored = JSON.parse(await readFile(path.join(directory, 'config.json'), 'utf8'));
  expect(Object.keys(stored.homePreferencesByProvider)).toEqual([scopeB]);
  expect(JSON.stringify(stored.homePreferencesByProvider)).not.toMatch(/secret|fixture|https|username/);
  expect(config.publicConfig()).not.toHaveProperty('homePreferencesByProvider');
  expect(config.getConfig()).not.toHaveProperty('homePreferencesByProvider');
});

it('separates content types, accounts, providers, and demo mode while ignoring password rotation', async () => {
  const config = await import('../server/config'); await config.initConfig(); const base = config.getConfig();
  const first = homeProviderKey({ ...base, xtreamBaseUrl: 'https://fixture.invalid', xtreamUsername: 'a' });
  expect(homeProviderKey({ ...base, xtreamBaseUrl: 'https://fixture.invalid/', xtreamUsername: 'a', xtreamPassword: 'new' })).toBe(first);
  for (const update of [{ xtreamUsername: 'b' }, { xtreamBaseUrl: 'https://another.invalid' }, { demoMode: true }]) expect(homeProviderKey({ ...base, xtreamBaseUrl: 'https://fixture.invalid', xtreamUsername: 'a', ...update })).not.toBe(first);
});

it('rejects a queued Home write if a provider change reaches the atomic writer first', async () => {
  const config = await import('../server/config'); await config.initConfig();
  await config.saveConfig({ xtreamBaseUrl: 'https://fixture.invalid', xtreamUsername: 'A' });
  const scope = config.publicConfig().homeProviderKey;
  const results = await Promise.allSettled([
    config.saveConfig({ xtreamUsername: 'B' }),
    config.saveConfig({ homeProviderKey: scope, homePreferences: { ...defaultHomePreferences(), movieCategoryIds: ['1'] } })
  ]);
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
  expect(config.publicConfig().homePreferences).toBeNull();
  await config.saveConfig({ xtreamUsername: 'A' }); expect(config.publicConfig().homePreferences).toBeNull();
});
