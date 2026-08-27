import { getConfig } from '../config.js';

const allowedActions = new Set([
  'get_live_categories','get_live_streams','get_vod_categories','get_vod_streams','get_vod_info',
  'get_series_categories','get_series','get_series_info','get_short_epg','get_simple_data_table'
]);

interface CacheEntry { expires: number; value: unknown }
const cache = new Map<string, CacheEntry>();
let cacheGeneration = 0;
const TTL: Record<string, number> = {
  get_live_categories: 12 * 3600_000, get_live_streams: 3600_000,
  get_vod_categories: 12 * 3600_000, get_vod_streams: 6 * 3600_000,
  get_series_categories: 12 * 3600_000, get_series: 6 * 3600_000,
  get_vod_info: 6 * 3600_000, get_series_info: 6 * 3600_000,
  get_short_epg: 5 * 60_000, get_simple_data_table: 5 * 60_000
};

export function normalizeBaseUrl(raw: string): URL {
  const value = raw.trim().replace(/\/+$/, '');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS provider URLs are allowed.');
  if (url.username || url.password) throw new Error('Do not include credentials in the server URL.');
  return url;
}

export function streamUrl(kind: 'live' | 'movie' | 'series', id: string, extension?: string): string {
  const config = getConfig();
  const base = normalizeBaseUrl(config.xtreamBaseUrl);
  const format = kind === 'live' && config.preferredLiveFormat !== 'auto' ? (config.preferredLiveFormat === 'hls' ? 'm3u8' : 'ts') : (extension || (kind === 'live' ? 'ts' : 'mp4'));
  base.pathname = `${base.pathname.replace(/\/$/, '')}/${kind}/${encodeURIComponent(config.xtreamUsername)}/${encodeURIComponent(config.xtreamPassword)}/${encodeURIComponent(id)}.${format}`;
  return base.toString();
}

export async function xtream(action?: string, params: Record<string, string> = {}, candidate?: { baseUrl: string; username: string; password: string }): Promise<unknown> {
  if (action && !allowedActions.has(action)) throw new Error('Unsupported provider action.');
  const config = getConfig();
  const credentials = candidate || { baseUrl: config.xtreamBaseUrl, username: config.xtreamUsername, password: config.xtreamPassword };
  const url = normalizeBaseUrl(credentials.baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/player_api.php`;
  url.searchParams.set('username', credentials.username);
  url.searchParams.set('password', credentials.password);
  if (action) url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const key = `${url.origin}${url.pathname}?action=${action || ''}&${Object.entries(params).sort().map(([k,v]) => `${k}=${v}`).join('&')}`;
  const hit = cache.get(key);
  if (!candidate && hit && hit.expires > Date.now()) return hit.value;
  const startedInGeneration = cacheGeneration;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json', 'user-agent': 'VIDAA-IPTV/1.0' } });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
    const body = await response.json();
    if (!candidate && startedInGeneration === cacheGeneration) cache.set(key, { value: body, expires: Date.now() + (TTL[action || ''] || 60_000) });
    return body;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The IPTV provider timed out.');
    throw error;
  } finally { clearTimeout(timeout); }
}

export function clearXtreamCache() { cacheGeneration += 1; cache.clear(); }

export function validateAccount(body: unknown): boolean {
  const root = body as Record<string, unknown> | null;
  const user = root?.user_info as Record<string, unknown> | undefined;
  if (!user) return false;
  const status = String(user.status || '').toLowerCase();
  return user.auth === 1 || user.auth === '1' || status === 'active';
}
