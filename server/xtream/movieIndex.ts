import type { VodItem } from '../types.js';
import { normalizeVod } from './normalizer.js';

const indexes = new WeakMap<object, MovieIndex>();
const searchable = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const SORTS = ['title-asc', 'title-desc', 'added-desc', 'added-asc', 'release-desc', 'release-asc', 'rating-desc', 'rating-asc'];
const dateValue = (value: unknown): number | undefined => {
  const text = String(value ?? '').trim();
  if (!/^\d{4}(-\d{2}-\d{2})?$/.test(text)) return undefined;
  const date = Date.parse(text); return Number.isFinite(date) ? date : undefined;
};
export class MovieIndex {
  readonly items: VodItem[] = [];
  private categories = new Map<string, number[]>();
  private names: string[] = [];
  private searches = new Map<string, number[]>();
  private values: Array<{ added?: number; release?: number; rating?: number }> = [];
  private orders = new Map<string, number[]>();
  constructor(raw: unknown) {
    const ids = new Map<string, number>();
    const memberships = new Map<string, Set<number>>();
    for (const row of Array.isArray(raw) ? raw : []) {
      if (!row || typeof row !== 'object') continue;
      const item = normalizeVod([row])[0];
      if (!item) continue;
      let index = ids.get(item.id);
      if (index === undefined) {
        index = this.items.length; ids.set(item.id, index); this.items.push(item); this.names.push(searchable(item.name));
        const added = Number(row.added); const rating = Number(item.rating);
        this.values.push({ added: added > 0 && Number.isFinite(added) ? added : undefined,
          release: dateValue(row.release_date ?? row.releasedate ?? row.releaseDate ?? row.year), rating: rating > 0 && rating <= 10 ? rating : undefined });
      }
      const categoryIds = [row.category_id, ...(Array.isArray(row.category_ids) ? row.category_ids : [])];
      for (const category of new Set(categoryIds.filter((id) => id != null && String(id) !== '').map(String))) {
        if (!memberships.has(category)) memberships.set(category, new Set());
        memberships.get(category)!.add(index);
      }
    }
    for (const [category, members] of memberships) this.categories.set(category, [...members].sort((a, b) => a - b));
  }
  page(category = '', search = '', offset = 0, limit = 120, anchor = '', requestedSort = '') {
    const term = searchable(search.trim());
    let candidates = category ? this.categories.get(category) || [] : undefined;
    if (term) {
      const key = JSON.stringify([category, term]);
      let matches = this.searches.get(key);
      if (!matches) {
        matches = [];
        if (candidates) { for (const index of candidates) if (this.names[index]!.includes(term)) matches.push(index); }
        else { for (let i = 0; i < this.items.length; i++) if (this.names[i]!.includes(term)) matches.push(i); }
        this.searches.set(key, matches);
        if (this.searches.size > 8) this.searches.delete(this.searches.keys().next().value!);
      } else { this.searches.delete(key); this.searches.set(key, matches); }
      candidates = matches;
    }
    // Cache each requested ordering once. Unknown values sort last in both directions.
    if (SORTS.includes(requestedSort)) {
      let order = this.orders.get(requestedSort);
      if (!order) {
        const [field, direction] = requestedSort.split('-'); const sign = direction === 'asc' ? 1 : -1;
        const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
        order = this.items.map((_, index) => index).sort((a, b) => {
          if (field === 'title') return sign * collator.compare(this.items[a]!.name, this.items[b]!.name) || a - b;
          const av = this.values[a]![field as 'added' | 'release' | 'rating']; const bv = this.values[b]![field as 'added' | 'release' | 'rating'];
          if (av === undefined || bv === undefined) return av === bv ? a - b : av === undefined ? 1 : -1;
          return sign * (av - bv) || a - b;
        });
        this.orders.set(requestedSort, order);
      }
      if (candidates) {
        const key = JSON.stringify([category, term, requestedSort]); let sorted = this.searches.get(key);
        if (!sorted) {
          const eligible = new Set(candidates); sorted = order.filter(index => eligible.has(index));
          this.searches.set(key, sorted); if (this.searches.size > 8) this.searches.delete(this.searches.keys().next().value!);
        } else { this.searches.delete(key); this.searches.set(key, sorted); }
        candidates = sorted;
      } else candidates = order;
    }
    const total = candidates?.length ?? this.items.length;
    limit = Number.isFinite(limit) ? Math.min(120, Math.max(1, Math.floor(limit))) : 120;
    offset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
    if (anchor) {
      const index = candidates ? candidates.findIndex(i => this.items[i]!.id === anchor) : this.items.findIndex(item => item.id === anchor);
      if (index >= 0) offset = Math.floor(index / limit) * limit;
    }
    if (offset >= total) offset = Math.floor(Math.max(0, total - 1) / limit) * limit;
    const items = candidates ? candidates.slice(offset, offset + limit).map(index => this.items[index]!) : this.items.slice(offset, offset + limit);
    return { items, total, offset, limit };
  }
}

/** Raw cache identity controls lifetime; provider refresh/account changes cannot reuse an old index. */
export function movieIndex(raw: unknown) {
  if (!raw || typeof raw !== 'object') return new MovieIndex([]);
  let index = indexes.get(raw);
  if (!index) { index = new MovieIndex(raw); indexes.set(raw, index); }
  return index;
}
