import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusManager, PREVIOUS_FOCUS } from '../src/navigation/FocusManager';

function element() {
  return { focus() {}, scrollIntoView() {} } as unknown as HTMLElement;
}

describe('FocusManager', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pages within allowed groups and clamps list/grid jumps without activating items', () => {
    const manager = new FocusManager(); const select = vi.fn();
    manager.register({ key: 'header', group: 'header', index: 0, onSelect: select, element: element() });
    for (let index = 0; index < 32; index++) manager.register({ key: `grid:${index}`, group: 'grid', index, columns: 5, orientation: 'grid', onSelect: select, element: element() });
    manager.page(1, ['grid']); expect(manager.focused).toBe('grid:0');
    manager.focus('grid:2'); manager.page(1, ['grid']); expect(manager.focused).toBe('grid:27');
    manager.page(1, ['grid']); expect(manager.focused).toBe('grid:31');
    expect(manager.page(1, ['grid'])).toBe(false);
    manager.page(-1, ['grid']); expect(manager.focused).toBe('grid:6');
    manager.page(-1, ['grid']); expect(manager.focused).toBe('grid:0');
    expect(manager.page(-1, ['grid'])).toBe(false);
    expect(manager.page(1, ['missing'])).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });

  it('measures the nearest scrollable viewport and preserves the grid column during a page jump', () => {
    const manager = new FocusManager();
    const rect = (left: number, top: number) => ({ left, right: left + 100, top, bottom: top + 40, width: 100, height: 40 });
    const container = { clientHeight: 200, scrollHeight: 2000, scrollWidth: 200, clientWidth: 200, scrollTop: 0, scrollLeft: 0, parentElement: null, getBoundingClientRect: () => ({ ...rect(0, 0), bottom: 200 }) };
    vi.stubGlobal('window', { innerHeight: 1000, getComputedStyle: () => ({ overflowY: 'auto', overflowX: 'hidden' }) });
    for (let index = 0; index < 20; index++) {
      const item = { focus() {}, parentElement: container, getBoundingClientRect: () => rect(index % 2 * 120, Math.floor(index / 2) * 60) } as unknown as HTMLElement;
      manager.register({ key: String(index), group: 'grid', index, columns: 2, orientation: 'grid', onSelect() {}, element: item });
    }
    manager.focus('1'); manager.page(1, ['grid']); expect(manager.focused).toBe('7');
    manager.page(-1, ['grid']); expect(manager.focused).toBe('1');
    expect(manager.page(-1, ['grid'])).toBe(false);
  });

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
  it('reaches an opted-out node by arrow keys without ever landing on it first', () => {
    const manager = new FocusManager();
    manager.register({ key: 'live:search', group: 'live-search', index: 0, orientation: 'horizontal', autoFocus: false, neighbors: { down: [PREVIOUS_FOCUS, 'live:cat:all'] }, onSelect() {}, element: element() });
    expect(manager.focused).toBe('');
    manager.register({ key: 'live:cat:all', group: 'live-cats', index: 0, orientation: 'vertical', neighbors: { up: 'live:search' }, onSelect() {}, element: element() });
    manager.register({ key: 'live:cat:1', group: 'live-cats', index: 1, orientation: 'vertical', onSelect() {}, element: element() });
    expect(manager.focused).toBe('live:cat:all');
    manager.focusFirst(); expect(manager.focused).toBe('live:cat:all');
    manager.move('up'); expect(manager.focused).toBe('live:search');
    manager.move('down'); expect(manager.focused).toBe('live:cat:all');
  });
  it('returns from a neighbor chain to wherever focus came from, then falls back', () => {
    const manager = new FocusManager();
    manager.register({ key: 'search', group: 'search', index: 0, autoFocus: false, neighbors: { down: [PREVIOUS_FOCUS, 'row:1'] }, onSelect() {}, element: element() });
    for (let index = 0; index < 3; index++) manager.register({ key: `row:${index}`, group: 'rows', index, orientation: 'vertical', neighbors: { up: index === 0 ? 'search' : undefined }, onSelect() {}, element: element() });
    manager.focus('row:2'); manager.focus('search');
    manager.move('down'); expect(manager.focused).toBe('row:2');
    manager.focus('row:0'); manager.move('up'); expect(manager.focused).toBe('search');
    // Unregistering the remembered node drops it from the chain; the static fallback takes over.
    manager.unregister('row:0');
    expect(manager.previous).toBe('');
    manager.move('down'); expect(manager.focused).toBe('row:1');
  });
  it('moves through grids by their declared column count', () => {
    const manager = new FocusManager();
    for (let index = 0; index < 8; index++) manager.register({ key: `grid:${index}`, group: 'grid', index, columns: 4, orientation: 'grid', onSelect() {}, element: element() });
    manager.focus('grid:1'); manager.move('down'); expect(manager.focused).toBe('grid:5');
    manager.move('right'); expect(manager.focused).toBe('grid:6');
    manager.focus('grid:4'); expect(manager.move('left')).toBe(false); expect(manager.focused).toBe('grid:4');
    manager.focus('grid:3'); expect(manager.move('right')).toBe(false); expect(manager.focused).toBe('grid:3');
  });
  it('uses element positions to navigate mixed row layouts in every direction', () => {
    const manager = new FocusManager();
    const positioned = (left: number, top: number) => ({
      focus() {}, parentElement: null,
      getBoundingClientRect: () => ({ left, right: left + 100, top, bottom: top + 40, width: 100, height: 40 })
    } as unknown as HTMLElement);
    manager.register({ key: 'settings:server', group: 'settings', index: 0, orientation: 'vertical', onSelect() {}, element: positioned(0, 0) });
    manager.register({ key: 'settings:user', group: 'settings', index: 1, orientation: 'vertical', onSelect() {}, element: positioned(200, 0) });
    manager.register({ key: 'settings:password', group: 'settings', index: 2, orientation: 'vertical', onSelect() {}, element: positioned(0, 80) });
    manager.register({ key: 'settings:xmltv', group: 'settings', index: 3, orientation: 'vertical', onSelect() {}, element: positioned(200, 80) });
    manager.move('right'); expect(manager.focused).toBe('settings:user');
    manager.move('left'); expect(manager.focused).toBe('settings:server');
    manager.move('down'); expect(manager.focused).toBe('settings:password');
    manager.move('right'); expect(manager.focused).toBe('settings:xmltv');
    manager.move('up'); expect(manager.focused).toBe('settings:user');
  });
  it('does not let an old button cleanup unregister its replacement', () => {
    const manager = new FocusManager(); const oldButton = element(); const replacement = element();
    manager.register({ key: 'save', group: 'actions', index: 0, onSelect() {}, element: oldButton });
    manager.register({ key: 'save', group: 'actions', index: 0, onSelect() {}, element: replacement });
    manager.unregister('save', oldButton);
    expect(manager.focus('save')).toBe(true);
  });
  it('updates navigation metadata without focusing the same element again', () => {
    const manager = new FocusManager(); const button = element();
    const nativeFocus = vi.spyOn(button, 'focus');
    manager.register({ key: 'save', group: 'actions', index: 0, onSelect() {}, element: button });
    manager.register({ key: 'next', group: 'other', index: 0, onSelect() {}, element: element() });
    nativeFocus.mockClear();
    manager.register({ key: 'save', group: 'actions', index: 2, neighbors: { right: 'next' }, onSelect() {}, element: button });
    expect(nativeFocus).not.toHaveBeenCalled();
    expect(manager.focused).toBe('save');
    manager.move('right'); expect(manager.focused).toBe('next');
  });
  it('does not turn a horizontal press into a mostly vertical jump', () => {
    const manager = new FocusManager();
    const positioned = (left: number, top: number) => ({
      focus() {}, parentElement: null,
      getBoundingClientRect: () => ({ left, right: left + 80, top, bottom: top + 40, width: 80, height: 40 })
    } as unknown as HTMLElement);
    manager.register({ key: 'current', group: 'current', index: 0, orientation: 'vertical', onSelect() {}, element: positioned(100, 100) });
    manager.register({ key: 'mostly-above', group: 'other', index: 0, orientation: 'vertical', onSelect() {}, element: positioned(80, 0) });
    expect(manager.move('left')).toBe(false);
    expect(manager.focused).toBe('current');
  });
  it('scrolls only the nearest list and leaves clipping layouts fixed', () => {
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top, x: 0, y: top, toJSON() {} });
    const layout = { parentElement: null, scrollHeight: 300, clientHeight: 100, scrollWidth: 100, clientWidth: 100, scrollTop: 0, scrollLeft: 0, getBoundingClientRect: () => rect(0, 100) };
    const list = { parentElement: layout, scrollHeight: 300, clientHeight: 100, scrollWidth: 100, clientWidth: 100, scrollTop: 0, scrollLeft: 0, getBoundingClientRect: () => rect(0, 100) };
    const item = { parentElement: list, focus() { list.scrollTop = 40; layout.scrollTop = 40; }, getBoundingClientRect: () => rect(120, 150) } as unknown as HTMLElement;
    vi.stubGlobal('window', { getComputedStyle: (node: unknown) => node === list ? { overflowY: 'auto', overflowX: 'hidden' } : { overflowY: 'hidden', overflowX: 'hidden' } });
    const manager = new FocusManager();
    manager.register({ key: 'list:0', group: 'list', index: 0, onSelect() {}, element: item });
    expect(list.scrollTop).toBe(58);
    expect(layout.scrollTop).toBe(0);
  });

  it('reveals a card in both its horizontal track and its outer vertical shelf viewport', () => {
    const rect = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height, width, height });
    const outer = { parentElement: null, scrollHeight: 1000, clientHeight: 200, scrollWidth: 400, clientWidth: 400, scrollTop: 0, scrollLeft: 0, getBoundingClientRect: () => rect(0, 0, 400, 200) };
    const track = { parentElement: outer, scrollHeight: 150, clientHeight: 150, scrollWidth: 1000, clientWidth: 400, scrollTop: 0, scrollLeft: 0, getBoundingClientRect: () => rect(0, 300, 400, 150) };
    const card = { parentElement: track, focus() {}, getBoundingClientRect: () => rect(600, 310, 100, 120) } as unknown as HTMLElement;
    vi.stubGlobal('window', { getComputedStyle: (node: unknown) => node === track ? { overflowX: 'auto', overflowY: 'hidden' } : { overflowX: 'hidden', overflowY: 'auto' } });
    const manager = new FocusManager();
    manager.register({ key: 'card', group: 'shelf', index: 0, onSelect() {}, element: card });
    expect(track.scrollLeft).toBe(308);
    expect(outer.scrollTop).toBe(238);
    expect(outer.scrollLeft).toBe(0);
  });
});
