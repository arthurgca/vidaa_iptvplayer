export type CatalogKind = 'movies' | 'series';

/** Provider IDs identify media, but a rendered occurrence also needs its own identity when rows are duplicated. */
export const catalogItemFocusKey = (kind: CatalogKind, category: string, id: string, index: number) =>
  `${kind}:item:${category || 'all'}:${id}:${index}`;

export const catalogCategoryFocusKey = (kind: CatalogKind, id: string, index: number) =>
  `${kind}:cat:${id}:${index}`;
