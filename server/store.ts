import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dataDir } from './config.js';
import type { Favorite, HistoryItem } from './types.js';

interface StoreData { favorites: Favorite[]; history: HistoryItem[]; contentCleared: boolean }
const storePath = path.join(dataDir, 'library.json');
let data: StoreData = { favorites: [], history: [], contentCleared: false };

export async function initStore() {
  try { data = { ...data, ...JSON.parse(await readFile(storePath, 'utf8')) }; } catch { /* first run */ }
}

let writes = Promise.resolve();
function persist() {
  const snapshot = JSON.stringify(data);
  const write = writes.catch(() => undefined).then(async () => {
    const temporary = `${storePath}.tmp`;
    await writeFile(temporary, snapshot, 'utf8');
    await rename(temporary, storePath);
  });
  writes = write;
  return write;
}

export const library = {
  contentCleared: () => data.contentCleared,
  favorites: () => data.favorites,
  async favorite(value: Favorite) {
    data.favorites = data.favorites.filter((item) => !(item.type === value.type && item.id === value.id));
    data.favorites.unshift(value); await persist(); return value;
  },
  async unfavorite(type: string, id: string) {
    data.favorites = data.favorites.filter((item) => !(item.type === type && item.id === id)); await persist();
  },
  async moveFavorite(type: string, id: string, direction: number) {
    if (direction !== -1 && direction !== 1) throw new Error('Invalid move direction.');
    const from = data.favorites.findIndex((item) => item.type === type && item.id === id);
    const to = from + direction;
    if (from >= 0 && to >= 0 && to < data.favorites.length) {
      [data.favorites[from], data.favorites[to]] = [data.favorites[to]!, data.favorites[from]!];
      await persist();
    }
    return data.favorites;
  },
  async forget(type: string, id: string) {
    data.history = data.history.filter((item) => !(item.type === type && item.id === id));
    await persist();
  },
  history: () => data.history.slice(0, 100),
  async watched(value: HistoryItem) {
    data.history = data.history.filter((item) => !(item.type === value.type && item.id === value.id));
    data.history.unshift(value); data.history = data.history.slice(0, 100); await persist(); return value;
  },
  async clear() {
    data = { favorites: [], history: [], contentCleared: true };
    await persist();
  },
  async restoreContent() {
    if (!data.contentCleared) return;
    data.contentCleared = false;
    await persist();
  }
};
