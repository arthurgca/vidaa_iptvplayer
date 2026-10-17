import { createHash } from 'node:crypto';
import type { AppConfig } from './types.js';

export interface HomePreferences {
  version: 1;
  movieCategoryIds: string[] | null;
  seriesCategoryIds: string[] | null;
  sectionVisibility: { continueWatching: boolean; favorites: boolean };
}
/** Password rotation retains preferences; different accounts/providers/demo never share category IDs. */
export function homeProviderKey(config: AppConfig) {
  let base = config.xtreamBaseUrl.trim().replace(/\/+$/, '');
  try { const url = new URL(base); url.hash = ''; url.pathname = url.pathname.replace(/\/+$/, ''); base = url.toString(); } catch { /* unconfigured */ }
  return createHash('sha256').update(JSON.stringify(config.demoMode ? ['demo'] : [base, config.xtreamUsername])).digest('hex');
}
export function validateHomePreferences(value: unknown): HomePreferences | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Home preferences.');
  const row = value as Record<string, unknown>;
  const ids = (input: unknown): string[] | null => {
    if (input === null) return null;
    if (!Array.isArray(input) || input.length > 2000 || input.some(id => typeof id !== 'string' || !id || id.length > 128)) throw new Error('Invalid Home categories.');
    return [...new Set(input as string[])];
  };
  const visibility = row.sectionVisibility as Record<string, unknown> | undefined;
  if (row.version !== 1 || !visibility || typeof visibility.continueWatching !== 'boolean' || typeof visibility.favorites !== 'boolean') throw new Error('Invalid Home sections.');
  return { version: 1, movieCategoryIds: ids(row.movieCategoryIds), seriesCategoryIds: ids(row.seriesCategoryIds), sectionVisibility: { continueWatching: visibility.continueWatching, favorites: visibility.favorites } };
}
