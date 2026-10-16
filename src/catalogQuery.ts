import type { MovieSort } from './types';

export interface CatalogQuery { category: string; search: string; offset: number; sort?: MovieSort }
export const emptyCatalogQuery = (): CatalogQuery => ({ category: '', search: '', offset: 0 });
