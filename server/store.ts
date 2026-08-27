import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dataDir } from './config.js';
import type { Favorite, HistoryItem } from './types.js';

interface StoreData { favorites: Favorite[]; history: HistoryItem[] }
const storePath = path.join(dataDir, 'library.json');
let data: StoreData = { favorites: [], history: [] };

export async function initStore() {
  try { data = { ...data, ...JSON.parse(await readFile(storePath, 'utf8')) }; } catch { /* first run */ }
}

async function persist() {
  const temporary = `${storePath}.tmp`;
  await writeFile(temporary, JSON.stringify(data), 'utf8');
  await rename(temporary, storePath);
}

export const library = {
  favorites: () => data.favorites,
  async favorite(value: Favorite) {
    data.favorites = data.favorites.filter((item) => !(item.type === value.type && item.id === value.id));
    data.favorites.unshift(value); await persist(); return value;
  },
  async unfavorite(type: string, id: string) {
    data.favorites = data.favorites.filter((item) => !(item.type === type && item.id === id)); await persist();
  },
  history: () => data.history.slice(0, 100),
  async watched(value: HistoryItem) {
    data.history = data.history.filter((item) => !(item.type === value.type && item.id === value.id));
    data.history.unshift(value); data.history = data.history.slice(0, 100); await persist(); return value;
  },
  async clear() {
    data = { favorites: [], history: [] };
    await persist();
  }
};
