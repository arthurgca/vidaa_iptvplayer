// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { api } from '../src/api/client';
import { useFocusManager } from '../src/navigation/FocusContext';
import type { FocusManager } from '../src/navigation/FocusManager';

let container: HTMLDivElement, focus: FocusManager;
const settle = (ms = 0) => act(() => new Promise<void>(resolve => setTimeout(resolve, ms)));
function Harness() { focus = useFocusManager(); return <App />; }
async function press(key: string) {
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
  await settle();
}
const items = Array.from({ length: 300 }, (_, i) => ({ id: String(i), name: i === 0 ? 'Senhor dos Aneis' : `Title ${i}`, categoryId: 'cat' }));
async function open(kind: 'live' | 'movies' | 'series') {
  act(() => render(<Harness />, container)); await settle();
  act(() => { container.querySelector<HTMLButtonElement>(`[data-focus-key="home:${kind}"]`)!.click(); });
  await settle(); await settle(80);
}
beforeEach(() => {
  container = document.createElement('div'); document.body.append(container);
  vi.spyOn(api, 'status').mockResolvedValue({ version: '1.2.2', configured: true, demoMode: true, language: 'en', languageConfigured: true, autoplayLive: false, home: { homeProviderKey: '', homePreferences: null } });
  vi.spyOn(api, 'favorites').mockResolvedValue([]);
  vi.spyOn(api, 'history').mockResolvedValue([]);
  vi.spyOn(api, 'liveSelection').mockResolvedValue({ channels: items, offset: 0 });
  vi.spyOn(api, 'liveCatalog').mockResolvedValue(items);
  vi.spyOn(api, 'epg').mockResolvedValue({ progress: 0, status: 'empty' });
  for (const method of ['liveCategories', 'vodCategories', 'seriesCategories'] as const) vi.spyOn(api, method).mockResolvedValue([{ id: 'cat', name: 'Category' }]);
  const windowPage = async (...args: Parameters<typeof api.movieWindow>) => {
    const offset = args[1] || 0;
    const filtered = items.filter(item => item.name.toLowerCase().includes((args[2] || '').toLowerCase()));
    return { items: filtered.slice(offset, offset + 120), offset, total: filtered.length, limit: 120 };
  };
  vi.spyOn(api, 'movieWindow').mockImplementation(windowPage);
  vi.spyOn(api, 'seriesWindow').mockImplementation(windowPage);
  const preview = { items: items.slice(0, 12), offset: 0, total: items.length, limit: 12 };
  vi.spyOn(api, 'vod').mockResolvedValue(preview);
  vi.spyOn(api, 'series').mockResolvedValue(preview);
});
afterEach(() => { act(() => render(null, container)); container.remove(); vi.restoreAllMocks(); });

describe.each(['live', 'movies', 'series'] as const)('%s browse shortcuts', kind => {
  it('opens options deep in a list, traps focus and returns to the same item and scroll position', async () => {
    await open(kind);
    for (let i = 0; i < 10; i++) await press('PageDown');
    const origin = focus.focused;
    const list = container.querySelector<HTMLElement>(kind === 'live' ? '.channel-list' : '.movies-grid')!;
    const top = list.scrollTop;
    expect(Number(origin.split(':').pop())).toBeGreaterThan(0);
    await press('ContextMenu');
    expect(focus.focused).toBe(`${kind}:menu:home`);
    expect(focus.focus(origin)).toBe(false);
    await press('PageDown'); await press('ArrowRight');
    expect(focus.focused).toBe(`${kind}:menu:home`);
    await press('Escape');
    expect(focus.focused).toBe(origin); expect(list.scrollTop).toBe(top);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('.player-screen')).toBeNull();
  });

  it('opens categories and search from options and returns directly Home', async () => {
    await open(kind);
    for (let i = 0; i < 10; i++) await press('PageDown');
    await press('m'); await press('ArrowDown'); await press('Enter'); await settle(60);
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Categories');
    await press('Escape');
    await press('m'); await press('ArrowDown'); await press('ArrowDown'); await press('Enter');
    expect(document.activeElement).toBe(container.querySelector('input'));
    const input = container.querySelector('input')!;
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    await settle();
    await press('m'); await press('Enter'); await settle(80);
    expect(container.querySelector('.home-screen')).not.toBeNull();
    expect(focus.focused).toBe('home:live');
  });

  it.each([
    ['Backspace', 8, ''],
    ['Backspace', 8, 'Title'],
    ['Unidentified', 8, 'Title'],
    ['Backspace', 461, 'Title'],
    ['Backspace', 10009, 'Title'],
    ['Escape', 27, 'Title']
  ])('finishes search editing with %s / %s and a second Back returns Home', async (key, keyCode, value) => {
    await open(kind);
    act(() => { focus.focus(`${kind}:search`); focus.select(); });
    const input = container.querySelector('input')!;
    act(() => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await settle();
    const event = new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true });
    act(() => { input.dispatchEvent(event); }); await settle(280);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input.parentElement);
    expect(focus.focused).toBe(`${kind}:search`);
    expect(input.value).toBe(value);
    expect(container.querySelector('.home-screen')).toBeNull();
    await press('Escape'); await settle(80);
    expect(container.querySelector('.home-screen')).not.toBeNull();
  });

  it.each(['input', 'document'] as const)('exits the nonempty search with controller Back delivered to %s and reaches the result without Enter', async target => {
    await open(kind);
    act(() => { focus.focus(`${kind}:search`); focus.select(); });
    const input = container.querySelector('input')!;
    act(() => { input.value = 'senhor'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await settle(280); await settle(); await settle();
    // The TV keyboard can consume the first Back while leaving the input focused.
    expect(document.activeElement).toBe(input);
    expect(container.querySelector(kind === 'live' ? '.channel-row' : '.movie-card')?.textContent).toContain('Senhor dos Aneis');
    const back = new KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true });
    act(() => { (target === 'input' ? input : document).dispatchEvent(back); });
    await settle();
    expect(back.defaultPrevented).toBe(true);
    expect(input.value).toBe('senhor');
    expect(document.activeElement).toBe(input.parentElement);
    expect(container.querySelector('.home-screen')).toBeNull();
    await press('ArrowDown');
    expect(focus.focused).toBe(`${kind}:${kind === 'live' ? 'channel' : 'item'}:0`);
    expect(document.activeElement?.textContent).toContain('Senhor dos Aneis');
    expect(container.querySelector('.player-screen')).toBeNull();
  });
});
