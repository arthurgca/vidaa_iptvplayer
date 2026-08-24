import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initConfig, getConfig, publicConfig, saveConfig } from './config.js';
import { demoCategories, demoChannels, demoEpisodes, demoSeries, demoVod } from './demo.js';
import { epgForChannel, epgStatus, initEpg, refreshEpg } from './epg/service.js';
import { initStore, library } from './store.js';
import type { Category, Channel, Favorite, HistoryItem, SeriesItem, VodItem } from './types.js';
import { clearXtreamCache, streamUrl, validateAccount, xtream } from './xtream/client.js';
import { normalizeCategories, normalizeChannels, normalizeSeries, normalizeSeriesInfo, normalizeVod, normalizeVodInfo } from './xtream/normalizer.js';

await initConfig();
await initStore();
await initEpg();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const asyncRoute = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };
const stringParam = (value: unknown) => typeof value === 'string' ? value : '';
const page = <T>(items: T[], req: Request) => {
  const search = stringParam(req.query.search).trim().toLowerCase();
  const filtered = search ? items.filter((item) => String((item as Record<string, unknown>).name || '').toLowerCase().includes(search)) : items;
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
  return { items: filtered.slice(offset, offset + limit), total: filtered.length, offset, limit };
};

async function categories(kind: 'live' | 'vod' | 'series'): Promise<Category[]> {
  const config = getConfig();
  if (config.demoMode) return demoCategories[kind] || [];
  const actions = { live: 'get_live_categories', vod: 'get_vod_categories', series: 'get_series_categories' } as const;
  return normalizeCategories(await xtream(actions[kind]));
}

async function live(categoryId?: string): Promise<Channel[]> {
  if (getConfig().demoMode) return categoryId ? demoChannels.filter((item) => item.categoryId === categoryId) : demoChannels;
  return normalizeChannels(await xtream('get_live_streams', categoryId ? { category_id: categoryId } : {}));
}

async function vod(categoryId?: string): Promise<VodItem[]> {
  if (getConfig().demoMode) return categoryId ? demoVod.filter((item) => item.categoryId === categoryId) : demoVod;
  return normalizeVod(await xtream('get_vod_streams', categoryId ? { category_id: categoryId } : {}));
}

async function series(categoryId?: string): Promise<SeriesItem[]> {
  if (getConfig().demoMode) return categoryId ? demoSeries.filter((item) => item.categoryId === categoryId) : demoSeries;
  return normalizeSeries(await xtream('get_series', categoryId ? { category_id: categoryId } : {}));
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/status', (_req, res) => res.json({ configured: publicConfig().configured, demoMode: getConfig().demoMode, epg: epgStatus() }));
app.get('/api/config', (_req, res) => res.json(publicConfig()));
app.put('/api/config', asyncRoute(async (req, res) => {
  const update = req.body as Record<string, unknown>;
  if (update.xtreamBaseUrl && !/^https?:\/\//i.test(String(update.xtreamBaseUrl))) throw new Error('Xtream Server must begin with http:// or https://.');
  if (update.xmltvUrl && !/^https?:\/\//i.test(String(update.xmltvUrl))) throw new Error('XMLTV URL must begin with http:// or https://.');
  if (!update.xtreamPassword) delete update.xtreamPassword;
  const config = await saveConfig(update);
  clearXtreamCache();
  if (config.xmltvUrl || config.demoMode) void refreshEpg(true);
  res.json(publicConfig(config));
}));
app.post('/api/config/test', asyncRoute(async (req, res) => {
  const current = getConfig();
  const baseUrl = stringParam(req.body?.xtreamBaseUrl) || current.xtreamBaseUrl;
  const username = stringParam(req.body?.xtreamUsername) || current.xtreamUsername;
  const password = stringParam(req.body?.xtreamPassword) || current.xtreamPassword;
  if (req.body?.demoMode === true) { res.json({ ok: true, message: 'Demo mode is ready.' }); return; }
  if (!baseUrl || !username || !password) throw new Error('Server, username, and password are required.');
  const body = await xtream(undefined, {}, { baseUrl, username, password });
  if (!validateAccount(body)) throw new Error('The provider did not return an active Xtream account.');
  res.json({ ok: true, message: 'Connection successful.' });
}));
app.post('/api/refresh', asyncRoute(async (_req, res) => {
  clearXtreamCache(); await refreshEpg(true); res.json({ ok: true, epg: epgStatus() });
}));

app.get('/api/xtream/:kind/live', asyncRoute(async (req, res) => {
  if (req.params.kind !== 'categories' && req.params.kind !== 'streams') { res.status(404).end(); return; }
  if (req.params.kind === 'categories') res.json(await categories('live'));
  else res.json(page(await live(stringParam(req.query.category_id) || undefined), req));
}));
app.get('/api/xtream/live-categories', asyncRoute(async (_req, res) => res.json(await categories('live'))));
app.get('/api/xtream/live-streams', asyncRoute(async (req, res) => res.json(page(await live(stringParam(req.query.category_id) || undefined), req))));
app.get('/api/xtream/vod/categories', asyncRoute(async (_req, res) => res.json(await categories('vod'))));
app.get('/api/xtream/vod', asyncRoute(async (req, res) => res.json(page(await vod(stringParam(req.query.category_id) || undefined), req))));
app.get('/api/xtream/vod/:id', asyncRoute(async (req, res) => {
  const id = stringParam(req.params.id);
  const fallback = (await vod()).find((item) => item.id === id);
  if (getConfig().demoMode) { if (!fallback) { res.status(404).end(); return; } res.json(fallback); return; }
  res.json(normalizeVodInfo(await xtream('get_vod_info', { vod_id: id }), fallback));
}));
app.get('/api/xtream/series/categories', asyncRoute(async (_req, res) => res.json(await categories('series'))));
app.get('/api/xtream/series', asyncRoute(async (req, res) => res.json(page(await series(stringParam(req.query.category_id) || undefined), req))));
app.get('/api/xtream/series/:id', asyncRoute(async (req, res) => {
  const id = stringParam(req.params.id);
  if (getConfig().demoMode) {
    const item = demoSeries.find((entry) => entry.id === id); if (!item) { res.status(404).end(); return; }
    res.json({ item, episodes: demoEpisodes[id] || [] }); return;
  }
  res.json(normalizeSeriesInfo(await xtream('get_series_info', { series_id: id }), id));
}));
app.get('/api/epg/:channelId', asyncRoute(async (req, res) => {
  const item = (await live()).find((channel) => channel.id === req.params.channelId);
  if (!item) { res.status(404).json({ error: 'Channel not found.' }); return; }
  res.json(await epgForChannel(item));
}));

app.get('/api/favorites', (_req, res) => res.json(library.favorites()));
app.put('/api/favorites', asyncRoute(async (req, res) => {
  const favorite = req.body as Favorite;
  if (!['live','movie','series'].includes(favorite.type) || !favorite.id || !favorite.item) throw new Error('Invalid favorite.');
  res.json(await library.favorite({ ...favorite, addedAt: Date.now() }));
}));
app.delete('/api/favorites/:type/:id', asyncRoute(async (req, res) => { await library.unfavorite(stringParam(req.params.type), stringParam(req.params.id)); res.status(204).end(); }));
app.get('/api/history', (_req, res) => res.json(library.history()));
app.post('/api/history', asyncRoute(async (req, res) => {
  const item = req.body as HistoryItem;
  if (!['live','movie','series'].includes(item.type) || !item.id || !item.item) throw new Error('Invalid history item.');
  res.json(await library.watched({ ...item, position: Math.max(0, Number(item.position) || 0), duration: Math.max(0, Number(item.duration) || 0), watchedAt: Date.now() }));
}));

app.get('/api/play/:kind/:id', asyncRoute(async (req, res) => {
  const kind = stringParam(req.params.kind);
  if (!['live','movie','series'].includes(kind)) { res.status(404).end(); return; }
  if (getConfig().demoMode) {
    const target = kind === 'live' ? 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' : 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
    res.redirect(302, target); return;
  }
  let extension: string | undefined;
  if (kind === 'live') extension = (await live()).find((item) => item.id === req.params.id)?.extension;
  if (kind === 'movie') extension = (await vod()).find((item) => item.id === req.params.id)?.extension;
  res.redirect(302, streamUrl(kind as 'live' | 'movie' | 'series', stringParam(req.params.id), stringParam(req.query.ext) || extension));
}));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
app.use(express.static(root, { maxAge: '1h', index: false }));
app.get('*splat', (_req, res) => res.sendFile(path.join(root, 'index.html')));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, '[provider]') : 'Unexpected server error.';
  if (process.env.NODE_ENV !== 'test') console.error(`[server] ${message}`);
  res.status(502).json({ error: message });
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, '0.0.0.0', () => console.log(`VIDAA IPTV listening on port ${port}${getConfig().demoMode ? ' (demo mode)' : ''}`));
