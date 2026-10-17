import type { Category } from './types.js';
import type { MovieIndex } from './xtream/movieIndex.js';

/** One indexed catalog, bounded previews, no per-category provider calls or metadata requests. */
export function homeCategoryRows(index: MovieIndex, categories: Category[], selected: string[]) {
  const available = new Map(categories.map(category => [category.id, category]));
  return selected.flatMap(id => {
    const category = available.get(id); if (!category) return [];
    const items = index.page(id, '', 0, 12).items;
    return items.length ? [{ id, title: category.name, items }] : [];
  });
}
