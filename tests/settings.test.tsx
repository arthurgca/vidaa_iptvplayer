// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Settings } from '../src/screens/Settings';
import { api } from '../src/api/client';
import { useFocusManager } from '../src/navigation/FocusContext';
import { listenToRemote, type RemoteAction } from '../src/platform/remote';
import type { FocusManager } from '../src/navigation/FocusManager';
import type { AppConfig } from '../src/types';

const initial: AppConfig = { xtreamBaseUrl: 'https://provider.invalid/path:8080', xtreamUsername: 'user', xtreamPassword: '', xmltvUrl: '', epgRefreshHours: 6, preferredLiveFormat: 'auto', autoplayLive: false, rememberLastChannel: true, demoMode: false, language: 'en', passwordConfigured: true, languageConfigured: true, configured: true };
let root: HTMLDivElement, focus: FocusManager, handler: ((action: RemoteAction) => boolean) | null;
let stop: () => void;
const leave = vi.fn(), saved = vi.fn(), cleared = vi.fn(), language = vi.fn();
const settle = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
function Harness() { focus = useFocusManager(); return <Settings language="en" setLanguage={language} saved={saved} cleared={cleared} leave={leave} registerAction={value => { handler = value; }} />; }
const press = async (key: string) => { act(() => { (document.activeElement ?? document).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); }); await settle(); };
const select = async (name: string) => { act(() => { focus.focus(`settings:${name}`); focus.select(); }); await settle(); };
const type = async (name: string, value: string) => { const input = root.querySelector<HTMLInputElement>(`input[id="settings:${name}"]`)!; act(() => { input.value = value; input.setSelectionRange(value.length, value.length); input.dispatchEvent(new Event('input', { bubbles: true })); }); await settle(); return input; };
beforeEach(() => {
  root = document.createElement('div'); document.body.append(root);
  vi.spyOn(api, 'config').mockResolvedValue({ ...initial });
  vi.spyOn(api, 'status').mockResolvedValue({ version: '1.2.2', configured: true, demoMode: false, language: 'en', languageConfigured: true, autoplayLive: false });
  stop = listenToRemote(action => handler?.(action));
});
afterEach(() => { act(() => render(null, root)); root.remove(); stop(); vi.restoreAllMocks(); vi.clearAllMocks(); });
async function mount() { act(() => render(<Harness />, root)); await settle(); }

it('keeps input identity, cursor and focus during edits, delayed status and Backspace; preserves drafts across sections', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof api.status>>) => void;
  vi.mocked(api.status).mockImplementation(() => new Promise(done => { resolve = done; }));
  await mount(); await select('tab:provider'); await select('xtreamBaseUrl');
  const input = root.querySelector<HTMLInputElement>('input')!; const blur = vi.fn(); input.addEventListener('blur', blur);
  for (const value of ['h', 'ht', 'https://new.invalid/subpath?custom=1']) {
    await type('xtreamBaseUrl', value);
    expect(root.querySelector('input')).toBe(input); expect(document.activeElement).toBe(input); expect(input.selectionStart).toBe(value.length);
  }
  act(() => resolve({ version: '9', configured: true, demoMode: false, language: 'en', languageConfigured: true, autoplayLive: false })); await settle();
  await press('Backspace'); expect(document.activeElement).toBe(input); expect(blur).not.toHaveBeenCalled();
  await press('Escape'); expect(focus.focused).toBe('settings:xtreamBaseUrl'); expect(document.activeElement).not.toBe(input);
  await select('tab:playback'); await select('tab:provider');
  expect(root.querySelector<HTMLInputElement>('input')?.value).toBe('https://new.invalid/subpath?custom=1');
  await press('Escape'); expect(root.querySelector('[role=dialog]')).not.toBeNull(); expect(leave).not.toHaveBeenCalled();
  await press('Escape'); expect(root.querySelector('[role=dialog]')).toBeNull(); expect(focus.focused).toBe('settings:tab:provider');
});

it('saves only changed values, never sends a blank saved password, and waits for persistence', async () => {
  let finish!: (value: AppConfig) => void;
  const save = vi.spyOn(api, 'saveConfig').mockImplementation(() => new Promise(done => { finish = done; }));
  await mount(); await select('tab:provider'); await type('xtreamUsername', 'changed'); await select('save'); await select('save');
  expect(save).toHaveBeenCalledTimes(1); expect(save).toHaveBeenCalledWith({ xtreamUsername: 'changed' });
  expect(root.textContent).toContain('Saving'); expect(root.textContent).not.toContain('Saved.');
  act(() => finish({ ...initial, xtreamUsername: 'changed' })); await settle();
  expect(root.textContent).toContain('All changes saved'); expect(saved).not.toHaveBeenCalled(); expect(focus.focused).toBe('settings:save');
  expect(root.querySelector<HTMLInputElement>('input[type=password]')?.value).toBe('');
});

it('keeps failed saves dirty and allows remote discard', async () => {
  vi.spyOn(api, 'saveConfig').mockRejectedValue(new Error('sensitive provider details'));
  await mount(); await select('tab:playback'); await select('autoplayLive'); await select('save');
  expect(root.textContent).toContain('Could not save'); expect(root.textContent).toContain('Unsaved changes'); expect(root.textContent).not.toContain('sensitive');
  await press('Escape'); expect(focus.focused).toBe('settings:tab:playback');
  await press('Escape'); await press('ArrowDown'); await press('Enter'); expect(leave).toHaveBeenCalledTimes(1);
});

it('saves a replacement password only on Save and clears its editable copy afterward', async () => {
  const save = vi.spyOn(api, 'saveConfig').mockResolvedValue(initial);
  await mount(); await select('tab:provider'); await select('xtreamPassword');
  const input = await type('xtreamPassword', 'new-secret');
  expect(input.type).toBe('password'); expect(save).not.toHaveBeenCalled();
  await press('Enter'); await select('save'); expect(save).toHaveBeenCalledWith({ xtreamPassword: 'new-secret' });
  expect(input.value).toBe(''); expect(root.textContent).not.toContain('new-secret');
});

it('blocks maintenance while dirty and reports refresh failure without exposing raw errors', async () => {
  const refresh = vi.spyOn(api, 'refresh').mockRejectedValue(new Error('token=secret'));
  await mount(); await select('tab:playback'); await select('autoplayLive'); await select('tab:data'); await select('refresh');
  expect(refresh).not.toHaveBeenCalled(); expect(root.textContent).toContain('Save your edits');
  await select('tab:playback'); await select('autoplayLive'); await select('tab:data'); await select('refresh');
  expect(refresh).toHaveBeenCalledTimes(1); expect(root.textContent).toContain('Operation failed'); expect(root.textContent).not.toContain('secret');
  expect(focus.focused).toBe('settings:refresh');
});

it('uses TV choice dialogs and saves language and playback without applying drafts early', async () => {
  vi.spyOn(api, 'saveConfig').mockResolvedValue({ ...initial, language: 'pt', preferredLiveFormat: 'hls', autoplayLive: true, rememberLastChannel: false });
  await mount(); await select('language'); expect(focus.focused).toBe('settings-dialog:en');
  await press('ArrowDown'); await press('Enter'); expect(focus.focused).toBe('settings:language'); expect(language).not.toHaveBeenCalled();
  await select('tab:playback'); await select('preferredLiveFormat'); await press('ArrowDown'); await press('Enter');
  await select('autoplayLive'); await select('rememberLastChannel'); await select('save');
  expect(api.saveConfig).toHaveBeenCalledWith({ language: 'pt', preferredLiveFormat: 'hls', autoplayLive: true, rememberLastChannel: false });
  expect(language).toHaveBeenCalledWith('pt');
});

it('represents managed preferences and blocks writes to them', async () => {
  vi.mocked(api.config).mockResolvedValue({ ...initial, managedSettings: ['xtreamBaseUrl', 'xtreamPassword', 'autoplayLive', 'language'] });
  await mount(); await select('language'); expect(root.querySelector('[role=dialog]')).toBeNull();
  await select('tab:provider'); await select('xtreamBaseUrl'); expect(root.querySelector<HTMLInputElement>('input')?.readOnly).toBe(true);
  expect(document.activeElement?.tagName).toBe('DIV'); expect(root.textContent).toContain('Managed by environment');
  await select('tab:playback'); await select('autoplayLive'); expect(root.textContent).toContain('All changes saved');
});

it('tests unsaved configuration without saving and never renders raw provider failures', async () => {
  const test = vi.spyOn(api, 'testConfig').mockRejectedValueOnce(new Error('timeout')).mockRejectedValueOnce(new Error('password=secret'));
  const save = vi.spyOn(api, 'saveConfig');
  await mount(); await select('tab:provider'); await type('xtreamUsername', 'edited'); await select('test');
  expect(test).toHaveBeenCalledWith(expect.objectContaining({ xtreamUsername: 'edited', xtreamPassword: '' }));
  expect(root.textContent).toContain('timed out'); expect(save).not.toHaveBeenCalled(); expect(focus.focused).toBe('settings:test');
  await select('test'); expect(root.textContent).not.toContain('secret'); expect(root.textContent).toContain('Connection test failed');
});

it('validates URLs on action without rejecting legitimate paths, ports or query parameters', async () => {
  const test = vi.spyOn(api, 'testConfig').mockResolvedValue({ ok: true, message: 'connected' });
  await mount(); await select('tab:provider'); await type('xtreamBaseUrl', 'not a URL'); await select('test'); expect(test).not.toHaveBeenCalled();
  expect(root.querySelector('[aria-invalid=true]')).not.toBeNull();
  await type('xtreamBaseUrl', 'https://provider.invalid:1234/custom/path?service=abc'); await select('test'); expect(test).toHaveBeenCalledTimes(1);
});

it('requires explicit destructive confirmation, restores focus, and prevents duplicate maintenance requests', async () => {
  const clear = vi.spyOn(api, 'clearData').mockResolvedValue(initial); const all = vi.spyOn(api, 'clearAllData').mockResolvedValue(initial);
  let done!: (value: { ok: boolean }) => void;
  const refresh = vi.spyOn(api, 'refresh').mockImplementation(() => new Promise(resolve => { done = resolve; }));
  await mount(); await select('tab:data'); await select('clear-content');
  expect(root.querySelector('[role=dialog]')?.textContent).toContain('favorites, history, watch progress'); expect(clear).not.toHaveBeenCalled();
  await press('Escape'); expect(focus.focused).toBe('settings:clear-content');
  await select('clear-content'); await press('ArrowDown'); await press('Enter'); expect(clear).toHaveBeenCalledTimes(1); expect(cleared).toHaveBeenCalledTimes(1);
  await select('clear-all'); expect(root.querySelector('[role=dialog]')?.textContent).toContain('Environment configuration remains active');
  await press('ArrowDown'); await press('Enter'); expect(all).toHaveBeenCalledTimes(1);
  await select('refresh'); await select('refresh'); expect(refresh).toHaveBeenCalledTimes(1);
  act(() => done({ ok: true })); await settle(); expect(root.textContent).toContain('Catalogs reload when opened'); expect(focus.focused).toBe('settings:refresh');
});

it('Back moves a deep dirty form to its existing tab and Down restores the same control and scroll', async () => {
  await mount(); await select('tab:provider'); await type('xtreamUsername', 'unsaved');
  await select('test');
  const pane = root.querySelector<HTMLElement>('.settings-pane')!;
  const screen = root.querySelector('main');
  pane.scrollTop = 240;
  const origin = focus.focused;
  await press('Escape');
  expect(focus.focused).toBe('settings:tab:provider');
  expect(root.querySelector('[role=dialog]')).toBeNull();
  expect(root.querySelector('main')).toBe(screen);
  expect(root.querySelector<HTMLInputElement>('[id="settings:xtreamUsername"]')!.value).toBe('unsaved');
  expect(pane.scrollTop).toBe(240);
  await press('ArrowDown'); expect(focus.focused).toBe(origin);
  expect(leave).not.toHaveBeenCalled();
});
