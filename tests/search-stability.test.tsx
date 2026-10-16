// @vitest-environment jsdom
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../src/api/client';
import { MediaCatalog } from '../src/screens/MediaCatalog';
import { useFocusManager } from '../src/navigation/FocusContext';
import type { FocusManager } from '../src/navigation/FocusManager';
import type { Page, VodItem } from '../src/types';

let container: HTMLDivElement, focus: FocusManager;
const settle = (ms = 0) => act(() => new Promise<void>(resolve => setTimeout(resolve, ms)));
const page = (id: string): Page<VodItem> => ({ items: [{ id, name: id, categoryId: 'cat' }], total: 1, offset: 0, limit: 120 });
function Harness({ kind }: { kind: 'movies' | 'series' }) {
  focus = useFocusManager();
  const [query, setQuery] = useState({ search: '', category: '', offset: 0 });
  return <MediaCatalog kind={kind} query={query} setQuery={setQuery} open={vi.fn()} />;
}
beforeEach(() => { container = document.createElement('div'); document.body.append(container); });
afterEach(() => { act(() => render(null, container)); container.remove(); vi.restoreAllMocks(); });

it.each(['movies', 'series'] as const)('%s keeps input identity, selection and scroll through repeated updates and stale responses', async kind => {
  vi.spyOn(api, kind === 'movies' ? 'vodCategories' : 'seriesCategories').mockResolvedValue([{ id: 'cat', name: 'Category' }]);
  const pending: Array<{ term: string; resolve: (value: Page<VodItem>) => void }> = [];
  const windows = vi.spyOn(api, kind === 'movies' ? 'movieWindow' : 'seriesWindow').mockImplementation((...args: Parameters<typeof api.movieWindow>) => new Promise(resolve => pending.push({ term: args[2] || '', resolve })));
  act(() => render(<Harness kind={kind} />, container)); await settle();
  const input = container.querySelector('input')!;
  const header = container.querySelector('header');
  const blur = vi.fn(); input.addEventListener('blur', blur);
  act(() => { focus.focus(`${kind}:search`); focus.select(); });
  const type = async (term: string, pause = 280) => {
    act(() => { input.value = term; input.setSelectionRange(term.length, term.length); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await settle(pause);
    expect(container.querySelector('input')).toBe(input);
    expect(container.querySelector('header')).toBe(header);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe(term);
    expect(input.selectionStart).toBe(term.length);
  };
  await type('A');
  act(() => pending[0]!.resolve(page('obsolete-initial'))); await settle();
  expect(document.activeElement).toBe(input);
  for (const term of ['Ab', 'Abc', 'Ab', '']) {
    await type(term);
    act(() => pending[pending.length - 1]!.resolve(page(`result-${term}`))); await settle();
    expect(document.activeElement).toBe(input);
  }
  act(() => pending[1]!.resolve(page('obsolete-search'))); await settle();
  expect(container.textContent).not.toContain('obsolete-search');
  const requests = windows.mock.calls.length;
  for (const term of ['r', 'ra', 'rap', 'ra', 'r', '']) await type(term, 0);
  await settle(280);
  expect(windows).toHaveBeenCalledTimes(requests);
  expect(blur).not.toHaveBeenCalled();
  expect(container.querySelector('.movies-grid')?.scrollTop).toBe(0);
});
