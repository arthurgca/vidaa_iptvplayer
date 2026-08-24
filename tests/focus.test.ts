import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusManager } from '../src/navigation/FocusManager';

function element() {
  return { focus() {}, scrollIntoView() {} } as unknown as HTMLElement;
}

describe('FocusManager', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('moves deterministically through vertical lists and explicit neighbors', () => {
    const manager = new FocusManager();
    manager.register({ key: 'cat:0', group: 'cat', index: 0, orientation: 'vertical', neighbors: { right: 'channel:0' }, onSelect() {}, element: element() });
    manager.register({ key: 'cat:1', group: 'cat', index: 1, orientation: 'vertical', onSelect() {}, element: element() });
    manager.register({ key: 'channel:0', group: 'channel', index: 0, orientation: 'vertical', neighbors: { left: 'cat:0' }, onSelect() {}, element: element() });
    expect(manager.focused).toBe('cat:0');
    manager.move('down'); expect(manager.focused).toBe('cat:1');
    manager.focus('cat:0'); manager.move('right'); expect(manager.focused).toBe('channel:0');
    manager.move('left'); expect(manager.focused).toBe('cat:0');
  });
  it('moves through grids by their declared column count', () => {
    const manager = new FocusManager();
    for (let index = 0; index < 8; index++) manager.register({ key: `grid:${index}`, group: 'grid', index, columns: 4, orientation: 'grid', onSelect() {}, element: element() });
    manager.focus('grid:1'); manager.move('down'); expect(manager.focused).toBe('grid:5');
    manager.move('right'); expect(manager.focused).toBe('grid:6');
  });
  it('scrolls only the nearest list and leaves clipping layouts fixed', () => {
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top, x: 0, y: top, toJSON() {} });
    const layout = { parentElement: null, scrollHeight: 300, clientHeight: 100, scrollWidth: 100, clientWidth: 100, scrollTop: 0, scrollLeft: 0, getBoundingClientRect: () => rect(0, 100) };
    const list = { parentElement: layout, scrollHeight: 300, clientHeight: 100, scrollWidth: 100, clientWidth: 100, scrollTop: 0, scrollLeft: 0, getBoundingClientRect: () => rect(0, 100) };
    const item = { parentElement: list, focus() {}, getBoundingClientRect: () => rect(120, 150) } as unknown as HTMLElement;
    vi.stubGlobal('window', { getComputedStyle: (node: unknown) => node === list ? { overflowY: 'auto', overflowX: 'hidden' } : { overflowY: 'hidden', overflowX: 'hidden' } });
    const manager = new FocusManager();
    manager.register({ key: 'list:0', group: 'list', index: 0, onSelect() {}, element: item });
    expect(list.scrollTop).toBe(58);
    expect(layout.scrollTop).toBe(0);
  });
});
