import type { Language } from '../i18n';
import type { AppConfig, Category, Channel, EpgNow, Favorite, HistoryItem, MediaKind, Page, SeriesItem, VodItem, Episode } from '../types';

export interface AppStatus { version: string; configured: boolean; demoMode: boolean; language: Language; languageConfigured: boolean }

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

export const api = {
  status: () => request<AppStatus>('/api/status'),
  config: () => request<AppConfig>('/api/config'),
  saveConfig: (value: Partial<AppConfig>) => request<AppConfig>('/api/config', { method: 'PUT', body: JSON.stringify(value) }),
  testConfig: (value: Partial<AppConfig>) => request<{ ok: boolean; message: string }>('/api/config/test', { method: 'POST', body: JSON.stringify(value) }),
  refresh: () => request<{ ok: boolean }>('/api/refresh', { method: 'POST' }),
  clearData: () => request<AppConfig>('/api/data', { method: 'DELETE' }),
  clearAllData: () => request<AppConfig>('/api/data/all', { method: 'DELETE' }),
  liveCategories: () => request<Category[]>('/api/xtream/categories/live'),
  channels: (categoryId?: string, offset = 0, search = '') => request<Page<Channel>>(`/api/xtream/streams/live?${query({ category_id: categoryId, offset, limit: 100, search })}`),
  vodCategories: () => request<Category[]>('/api/xtream/vod/categories'),
  vod: (categoryId?: string, offset = 0, search = '') => request<Page<VodItem>>(`/api/xtream/vod?${query({ category_id: categoryId, offset, limit: 60, search })}`),
  vodInfo: (id: string) => request<VodItem>(`/api/xtream/vod/${encodeURIComponent(id)}`),
  seriesCategories: () => request<Category[]>('/api/xtream/series/categories'),
  series: (categoryId?: string, offset = 0, search = '') => request<Page<SeriesItem>>(`/api/xtream/series?${query({ category_id: categoryId, offset, limit: 60, search })}`),
  seriesInfo: (id: string) => request<{ item: SeriesItem; episodes: Episode[] }>(`/api/xtream/series/${encodeURIComponent(id)}`),
  epg: (channelId: string) => request<EpgNow>(`/api/epg/${encodeURIComponent(channelId)}`),
  favorites: () => request<Favorite[]>('/api/favorites'),
  favorite: (value: Omit<Favorite, 'addedAt'>) => request<Favorite>('/api/favorites', { method: 'PUT', body: JSON.stringify(value) }),
  unfavorite: (type: string, id: string) => request<void>(`/api/favorites/${type}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  history: () => request<HistoryItem[]>('/api/history'),
  watched: (value: Omit<HistoryItem, 'watchedAt'>) => request<HistoryItem>('/api/history', { method: 'POST', body: JSON.stringify(value) }),
  playUrl: (kind: MediaKind, id: string, extension?: string) => `/api/play/${kind}/${encodeURIComponent(id)}${extension ? `?ext=${encodeURIComponent(extension)}` : ''}`
};
