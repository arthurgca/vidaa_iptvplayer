export type Direction = 'up'|'down'|'left'|'right';
/** A neighbor may list fallbacks; the first key that resolves wins. `@previous` means "wherever focus came from". */
export type NeighborTarget = string | string[];
export const PREVIOUS_FOCUS = '@previous';
export interface FocusNode {
  key: string; group: string; index: number; columns?: number; orientation?: 'vertical'|'horizontal'|'grid';
  neighbors?: Partial<Record<Direction, NeighborTarget>>; onSelect: () => void; element: HTMLElement;
  /** Nodes opted out of auto-focus are still reachable by arrow keys, but never claim focus on their own. */
  autoFocus?: boolean;
}

export class FocusManager {
  private nodes = new Map<string, FocusNode>();
  private current = '';
  private previousKey = '';
  private scope = 'root';
  private listeners = new Set<(key: string) => void>();

  register(node: FocusNode) { this.nodes.set(node.key, node); if (!this.current && node.autoFocus !== false) this.focus(node.key); }
  unregister(key: string) { this.nodes.delete(key); if (this.previousKey === key) this.previousKey = ''; }
  subscribe(listener: (key: string) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  get focused() { return this.current; }
  get previous() { return this.previousKey; }
  setScope(scope: string, initial?: string) { this.scope = scope; if (initial) this.focus(initial); }
  focus(key: string) {
    const node = this.nodes.get(key); if (!node || !this.inScope(node)) return false;
    if (this.current && this.current !== key) this.previousKey = this.current;
    this.current = key; this.focusWithoutScrolling(node.element); this.scrollNearestContainer(node.element);
    this.listeners.forEach((listener) => listener(key)); return true;
  }
  select() { this.nodes.get(this.current)?.onSelect(); }
  move(direction: Direction) {
    const current = this.nodes.get(this.current);
    if (!current) return this.focusFirst();
    for (const neighbor of this.neighborKeys(current.neighbors?.[direction])) if (this.focus(neighbor)) return true;
    const group = [...this.nodes.values()].filter((node) => node.group === current.group && this.inScope(node)).sort((a,b) => a.index - b.index);
    const orientation = current.orientation || 'vertical';
    let delta = 0;
    if (orientation === 'vertical') delta = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
    if (orientation === 'horizontal') delta = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
    if (orientation === 'grid') delta = direction === 'left' ? -1 : direction === 'right' ? 1 : direction === 'up' ? -(current.columns || 1) : current.columns || 1;
    if (delta) {
      const position = group.findIndex((node) => node.key === current.key);
      const target = group[position + delta];
      if (target && this.focus(target.key)) return true;
    }
    const spatial = this.spatialNeighbor(current, direction);
    return spatial ? this.focus(spatial.key) : false;
  }
  focusFirst() {
    const candidates = [...this.nodes.values()].filter((node) => this.inScope(node)).sort((a,b) => a.index-b.index);
    const first = candidates.find((node) => node.autoFocus !== false) || candidates[0];
    return first ? this.focus(first.key) : false;
  }
  private neighborKeys(target: NeighborTarget | undefined) {
    if (!target) return [];
    return (Array.isArray(target) ? target : [target]).flatMap((key) => key !== PREVIOUS_FOCUS ? [key]
      : this.previousKey && this.previousKey !== this.current ? [this.previousKey] : []);
  }
  /** Geometry is the fallback for mixed layouts such as Settings, whose rows have different column counts. */
  private spatialNeighbor(current: FocusNode, direction: Direction) {
    if (typeof current.element.getBoundingClientRect !== 'function') return undefined;
    const origin = current.element.getBoundingClientRect();
    const originX = (origin.left + origin.right) / 2; const originY = (origin.top + origin.bottom) / 2;
    let best: FocusNode | undefined; let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of this.nodes.values()) {
      if (candidate.key === current.key || !this.inScope(candidate) || typeof candidate.element.getBoundingClientRect !== 'function') continue;
      const rect = candidate.element.getBoundingClientRect();
      const dx = (rect.left + rect.right) / 2 - originX; const dy = (rect.top + rect.bottom) / 2 - originY;
      const primary = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
      if (primary <= 1) continue;
      const cross = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      const score = primary + cross * 2;
      if (score < bestScore) { best = candidate; bestScore = score; }
    }
    return best;
  }
  private inScope(node: FocusNode) { return this.scope === 'root' || node.key.startsWith(`${this.scope}:`); }
  private focusWithoutScrolling(element: HTMLElement) {
    const positions: Array<{ element: HTMLElement; top: number; left: number }> = [];
    let ancestor = element.parentElement;
    while (ancestor) {
      positions.push({ element: ancestor, top: ancestor.scrollTop, left: ancestor.scrollLeft });
      ancestor = ancestor.parentElement;
    }
    element.focus({ preventScroll: true });
    positions.forEach((position) => {
      position.element.scrollTop = position.top;
      position.element.scrollLeft = position.left;
    });
  }
  private scrollNearestContainer(element: HTMLElement) {
    let container = element.parentElement;
    while (container) {
      const style = window.getComputedStyle(container);
      const scrollsY = /^(auto|scroll)$/.test(style.overflowY) && container.scrollHeight > container.clientHeight;
      const scrollsX = /^(auto|scroll)$/.test(style.overflowX) && container.scrollWidth > container.clientWidth;
      if (scrollsY || scrollsX) {
        const item = element.getBoundingClientRect();
        const viewport = container.getBoundingClientRect();
        const margin = 8;
        if (scrollsY && item.top < viewport.top + margin) container.scrollTop += item.top - viewport.top - margin;
        else if (scrollsY && item.bottom > viewport.bottom - margin) container.scrollTop += item.bottom - viewport.bottom + margin;
        if (scrollsX && item.left < viewport.left + margin) container.scrollLeft += item.left - viewport.left - margin;
        else if (scrollsX && item.right > viewport.right - margin) container.scrollLeft += item.right - viewport.right + margin;
        return;
      }
      container = container.parentElement;
    }
  }
}
