import type { Language } from '../i18n';
import { clearEpgCache } from './epg';
import type { AppConfig, Category, Channel, EpgNow, Favorite, HistoryItem, MediaKind, MovieSort, Page, SeriesItem, VodItem, Episode, GuidePage } from '../types';

export interface AppStatus { version: string; configured: boolean; demoMode: boolean; language: Language; languageConfigured: boolean; autoplayLive: boolean }
export interface LiveSelection { channel?: Channel; offset: number; channels: Channel[] }
export const LIVE_PAGE_SIZE = 20;

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json', ...options?.headers } });
  const body = response.status === 204 ? undefined : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string })?.error || `Request failed (${response.status})`);
  return body as T;
}

const query = (values: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)); });
  return params.toString();
};

// Six small windows, never the entire catalog on the television. Share in-flight reads.
const movieWindows = new Map<string, { expires: number; value: Promise<Page<VodItem>> }>();
let liveCatalog: { expires: number; value: Promise<Channel[]> } | undefined;
let liveCategories: { expires: number; value: Promise<Category[]> } | undefined;
export function clearMovieWindows() { movieWindows.clear(); liveCatalog = undefined; liveCategories = undefined; }
function fullLiveCatalog() {
  if (liveCatalog && liveCatalog.expires > Date.now()) return liveCatalog.value;
  const entry = { expires: Date.now() + 5 * 60_000, value: request<Channel[]>('/api/xtream/live/catalog') };
  liveCatalog = entry;
  void entry.value.catch(() => { if (liveCatalog === entry) liveCatalog = undefined; });
  return entry.value;
}
function getLiveCategories() {
  if (liveCategories && liveCategories.expires > Date.now()) return liveCategories.value;
  const entry = { expires: Date.now() + 5 * 60_000, value: request<Category[]>('/api/xtream/categories/live') };
  liveCategories = entry;
  void entry.value.catch(() => { if (liveCategories === entry) liveCategories = undefined; });
  return entry.value;
}
async function catalogMutation<T>(operation: Promise<T>) { const result = await operation; clearMovieWindows(); clearEpgCache(); return result; }
function movieWindow(categoryId = '', offset = 0, search = '', anchor = '', sort: MovieSort = 'added-desc') {
  const key = query({ category_id: categoryId, offset, limit: 120, search, anchor, sort });
  const hit = movieWindows.get(key);
  if (hit && hit.expires > Date.now()) { movieWindows.delete(key); movieWindows.set(key, hit); return hit.value; }
  const value = request<Page<VodItem>>(`/api/xtream/vod/catalog?${key}`);
  const entry = { expires: Date.now() + 5 * 60_000, value }; movieWindows.set(key, entry);
  if (movieWindows.size > 6) movieWindows.delete(movieWindows.keys().next().value!);
  void value.catch(() => { if (movieWindows.get(key) === entry) movieWindows.delete(key); });
  return value;
}

export const api = {
  status: () => request<AppStatus>('/api/status'),
  config: () => request<AppConfig>('/api/config'),
  saveConfig: (value: Partial<AppConfig>) => catalogMutation(request<AppConfig>('/api/config', { method: 'PUT', body: JSON.stringify(value) })),
  testConfig: (value: Partial<AppConfig>) => request<{ ok: boolean; message: string }>('/api/config/test', { method: 'POST', body: JSON.stringify(value) }),
  refresh: () => catalogMutation(request<{ ok: boolean }>('/api/refresh', { method: 'POST' })),
  clearData: () => catalogMutation(request<AppConfig>('/api/data', { method: 'DELETE' })),
  clearAllData: () => catalogMutation(request<AppConfig>('/api/data/all', { method: 'DELETE' })),
  liveCategories: getLiveCategories,
  liveCatalog: fullLiveCatalog,
  liveSelection: () => request<LiveSelection>('/api/live/selection'),
  channels: (categoryId?: string, offset = 0, search = '') => request<Page<Channel>>(`/api/xtream/streams/live?${query({ category_id: categoryId, offset, limit: LIVE_PAGE_SIZE, search })}`),
  vodCategories: () => request<Category[]>('/api/xtream/vod/categories'),
  movieWindow,
  vod: (categoryId?: string, offset = 0, search = '', limit = 60) => request<Page<VodItem>>(`/api/xtream/vod?${query({ category_id: categoryId, offset, limit, search })}`),
  vodInfo: (id: string) => request<VodItem>(`/api/xtream/vod/${encodeURIComponent(id)}`),
  seriesCategories: () => request<Category[]>('/api/xtream/series/categories'),
  series: (categoryId?: string, offset = 0, search = '', limit = 60) => request<Page<SeriesItem>>(`/api/xtream/series?${query({ category_id: categoryId, offset, limit, search })}`),
  seriesInfo: (id: string) => request<{ item: SeriesItem; episodes: Episode[] }>(`/api/xtream/series/${encodeURIComponent(id)}`),
  epg: (channelId: string, signal?: AbortSignal) => request<EpgNow>(`/api/epg/${encodeURIComponent(channelId)}`, signal ? { signal } : undefined),
  guide: (start: number, offset = 0, categoryId = '', search = '') => request<GuidePage>(`/api/guide?${query({ start, offset, category_id: categoryId, search })}`),
  favorites: () => request<Favorite[]>('/api/favorites'),
  favorite: (value: Omit<Favorite, 'addedAt'>) => request<Favorite>('/api/favorites', { method: 'PUT', body: JSON.stringify(value) }),
  unfavorite: (type: string, id: string) => request<void>(`/api/favorites/${type}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  moveFavorite: (type: string, id: string, direction: number) => request<Favorite[]>('/api/favorites/move', { method: 'POST', body: JSON.stringify({ type, id, direction }) }),
  history: () => request<HistoryItem[]>('/api/history'),
  forget: (type: string, id: string) => request<void>(`/api/history/${type}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  watched: (value: Omit<HistoryItem, 'watchedAt'>, keepalive = false) => request<HistoryItem>('/api/history', { method: 'POST', body: JSON.stringify(value), keepalive }),
  playUrl: (kind: MediaKind, id: string, extension?: string) => `/api/play/${kind}/${encodeURIComponent(id)}${extension ? `?ext=${encodeURIComponent(extension)}` : ''}`
};
