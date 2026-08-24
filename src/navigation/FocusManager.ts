export type Direction = 'up'|'down'|'left'|'right';
export interface FocusNode {
  key: string; group: string; index: number; columns?: number; orientation?: 'vertical'|'horizontal'|'grid';
  neighbors?: Partial<Record<Direction, string>>; onSelect: () => void; element: HTMLElement;
}

export class FocusManager {
  private nodes = new Map<string, FocusNode>();
  private current = '';
  private scope = 'root';
  private listeners = new Set<(key: string) => void>();

  register(node: FocusNode) { this.nodes.set(node.key, node); if (!this.current) this.focus(node.key); }
  unregister(key: string) { this.nodes.delete(key); }
  subscribe(listener: (key: string) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  get focused() { return this.current; }
  setScope(scope: string, initial?: string) { this.scope = scope; if (initial) this.focus(initial); }
  focus(key: string) {
    const node = this.nodes.get(key); if (!node || !this.inScope(node)) return false;
    this.current = key; node.element.focus({ preventScroll: true }); node.element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.listeners.forEach((listener) => listener(key)); return true;
  }
  select() { this.nodes.get(this.current)?.onSelect(); }
  move(direction: Direction) {
    const current = this.nodes.get(this.current);
    if (!current) return this.focusFirst();
    const neighbor = current.neighbors?.[direction];
    if (neighbor && this.focus(neighbor)) return true;
    const group = [...this.nodes.values()].filter((node) => node.group === current.group && this.inScope(node)).sort((a,b) => a.index - b.index);
    const orientation = current.orientation || 'vertical';
    let delta = 0;
    if (orientation === 'vertical') delta = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
    if (orientation === 'horizontal') delta = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
    if (orientation === 'grid') delta = direction === 'left' ? -1 : direction === 'right' ? 1 : direction === 'up' ? -(current.columns || 1) : current.columns || 1;
    if (!delta) return false;
    const position = group.findIndex((node) => node.key === current.key);
    const target = group[position + delta];
    return target ? this.focus(target.key) : false;
  }
  focusFirst() { const first = [...this.nodes.values()].filter((node) => this.inScope(node)).sort((a,b) => a.index-b.index)[0]; return first ? this.focus(first.key) : false; }
  private inScope(node: FocusNode) { return this.scope === 'root' || node.key.startsWith(`${this.scope}:`); }
}
