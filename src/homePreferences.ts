/** null = original preview; [] = deliberately hidden. Arrays also define the display order. */
import type { HomePreferences } from '../server/homePreferences';
export type { HomePreferences };
export interface HomeConfiguration { homeProviderKey: string; homePreferences: HomePreferences | null }
export const defaultHomePreferences = (): HomePreferences => ({ version: 1, movieCategoryIds: null, seriesCategoryIds: null, sectionVisibility: { continueWatching: true, favorites: true } });
export interface HomePreviewRow { id: string; title?: string; items: import('./types').VodItem[] }
export interface HomeCatalog { rows: HomePreviewRow[]; failed: boolean }
