// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it } from 'vitest';
import { Focusable, useFocusManager, useSectionNavigation } from '../src/navigation/FocusContext';
import type { FocusManager } from '../src/navigation/FocusManager';
import type { RemoteAction } from '../src/platform/remote';

let focus: FocusManager, handle: (action: RemoteAction) => boolean;
const root = document.createElement('div');
document.body.append(root);
function Harness({ ids }: { ids: string[] }) {
  focus = useFocusManager();
  handle = useSectionNavigation(['section:options'], 'section');
  return <>
    <Focusable focusKey="section:options" group="header" index={0} onSelect={() => {}}>Options</Focusable>
    {ids.map((id, index) => <Focusable key={id} focusKey={`section:${id}`} group="items" index={index} onSelect={() => {}}>{id}</Focusable>)}
  </>;
}
afterEach(() => { focus.setScope('root'); act(() => render(null, root)); });

it('keeps options focused through content updates, restores stable IDs and falls back when removed', () => {
  act(() => render(<Harness ids={['a', 'b', 'c']} />, root));
  focus.focus('section:b');
  expect(handle('BACK')).toBe(true);
  const options = document.activeElement;
  act(() => render(<Harness ids={['c', 'a', 'b']} />, root));
  expect(document.activeElement).toBe(options);
  expect(focus.focused).toBe('section:options');
  expect(handle('NAV_DOWN')).toBe(true);
  expect(focus.focused).toBe('section:b');
  handle('BACK');
  act(() => render(<Harness ids={['c', 'a']} />, root));
  expect(handle('NAV_DOWN')).toBe(true);
  expect(focus.focused).toBe('section:c');
});

it('leaves nested scopes and top-level Back to their existing handlers', () => {
  act(() => render(<Harness ids={['a']} />, root));
  focus.focus('section:options');
  expect(handle('BACK')).toBe(false);
  focus.setScope('section', 'section:a');
  expect(handle('BACK')).toBe(false);
  expect(focus.focused).toBe('section:a');
});
