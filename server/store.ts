import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dataDir } from './config.js';
import type { Favorite, HistoryItem } from './types.js';

interface StoreData {
  favorites: Favorite[]; history: HistoryItem[]; contentCleared: boolean;
  historyVersion: number; historyClearedVersion: number; historyRemovedVersions: Record<string, number>;
}
const emptyStore = (): StoreData => ({ favorites: [], history: [], contentCleared: false, historyVersion: 0, historyClearedVersion: 0, historyRemovedVersions: {} });
const storePath = path.join(dataDir, 'library.json');
let data = emptyStore();

export async function initStore() {
  try { data = { ...emptyStore(), ...JSON.parse(await readFile(storePath, 'utf8')) }; } catch { data = emptyStore(); /* first run */ }
}

let writes = Promise.resolve();
function persist(change: (current: StoreData) => StoreData) {
  const write = writes.catch(() => undefined).then(async () => {
    const next = change(data);
    const temporary = `${storePath}.tmp`;
    await writeFile(temporary, JSON.stringify(next), 'utf8');
    await rename(temporary, storePath);
    // Publish only committed data. A failed disk write must leave reads unchanged.
    data = next;
  });
  writes = write;
  return write;
}

export const library = {
  contentCleared: () => data.contentCleared,
  favorites: () => data.favorites,
  async favorite(value: Favorite) {
    await persist(current => ({ ...current, favorites: [value, ...current.favorites.filter((item) => !(item.type === value.type && item.id === value.id))] })); return value;
  },
  async unfavorite(type: string, id: string) {
    await persist(current => ({ ...current, favorites: current.favorites.filter((item) => !(item.type === type && item.id === id)) }));
  },
  async moveFavorite(type: string, id: string, direction: number) {
    if (direction !== -1 && direction !== 1) throw new Error('Invalid move direction.');
    await persist(current => {
      const favorites = [...current.favorites];
      const from = favorites.findIndex((item) => item.type === type && item.id === id); const to = from + direction;
      if (from >= 0 && to >= 0 && to < favorites.length) [favorites[from], favorites[to]] = [favorites[to]!, favorites[from]!];
      return { ...current, favorites };
    });
    return data.favorites;
  },
  async forget(type: string, id: string) {
    await persist(current => ({ ...current,
      history: current.history.filter((item) => !(item.type === type && item.id === id)),
      historyVersion: current.historyVersion + 1,
      historyRemovedVersions: { ...current.historyRemovedVersions, [JSON.stringify([type, id])]: current.historyVersion + 1 }
    }));
  },
  historyVersion: () => data.historyVersion,
  async clearHistory() {
    await persist(current => ({ ...current, history: [], historyVersion: current.historyVersion + 1, historyClearedVersion: current.historyVersion + 1, historyRemovedVersions: {} }));
  },
  history: () => data.history.slice(0, 100),
  async watched(value: HistoryItem, version = 0) {
    let result = value;
    await persist(current => {
      const minimum = Math.max(current.historyClearedVersion, current.historyRemovedVersions[JSON.stringify([value.type, value.id])] || 0);
      // Each player captures a server revision at session start. Old sessions stay
      // invalid after deletion, even when their next checkpoint has a newer time.
      if (!Number.isSafeInteger(version) || version < minimum || version > current.historyVersion) throw new Error('Watch history changed. Start playback again to save progress.');
      const previous = current.history.find((item) => item.type === value.type && item.id === value.id);
      if (previous?.checkpointAt && value.checkpointAt && previous.checkpointAt > value.checkpointAt) { result = previous; return current; }
      const history = [value, ...current.history.filter((item) => !(item.type === value.type && item.id === value.id))];
      history.sort((a, b) => (b.checkpointAt ?? b.watchedAt) - (a.checkpointAt ?? a.watchedAt));
      return { ...current, history: history.slice(0, 100) };
    });
    return result;
  },
  async clear() {
    await persist(current => ({ ...emptyStore(), contentCleared: true, historyVersion: current.historyVersion + 1, historyClearedVersion: current.historyVersion + 1 }));
  },
  async restoreContent() {
    await persist(current => ({ ...current, contentCleared: false }));
  }
};
