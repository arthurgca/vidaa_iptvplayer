import type { Category, Channel, Episode, Season, SeriesItem, VodItem } from '../types.js';

type UnknownRecord = Record<string, unknown>;
const text = (value: unknown) => value == null ? '' : String(value);
const optional = (value: unknown) => value == null || value === '' ? undefined : String(value);
const number = (value: unknown) => Number(value) || undefined;

export function normalizeCategories(input: unknown): Category[] {
  if (!Array.isArray(input)) return [];
  return input.map((raw) => raw as UnknownRecord).map((item) => ({
    id: text(item.category_id ?? item.id), name: text(item.category_name ?? item.name) || 'Uncategorized'
  })).filter((item) => item.id);
}

export function normalizeChannels(input: unknown): Channel[] {
  if (!Array.isArray(input)) return [];
  return input.map((raw) => raw as UnknownRecord).map((item, index) => ({
    id: text(item.stream_id ?? item.id),
    name: text(item.name) || 'Unnamed channel',
    categoryId: text(item.category_id),
    logo: optional(item.stream_icon ?? item.logo),
    epgChannelId: optional(item.epg_channel_id),
    number: number(item.num) || index + 1,
    extension: optional(item.container_extension) || 'ts'
  })).filter((item) => item.id);
}

export function normalizeVod(input: unknown): VodItem[] {
  if (!Array.isArray(input)) return [];
  return input.map((raw) => raw as UnknownRecord).map((item) => ({
    id: text(item.stream_id ?? item.id), name: text(item.name ?? item.title) || 'Untitled', categoryId: text(item.category_id),
    poster: optional(item.stream_icon ?? item.cover), year: optional(item.year ?? item.releaseDate), rating: optional(item.rating),
    duration: optional(item.duration), genre: optional(item.genre), description: optional(item.plot ?? item.description),
    extension: optional(item.container_extension) || 'mp4'
  })).filter((item) => item.id);
}

export function normalizeVodInfo(input: unknown, fallback?: VodItem): VodItem {
  const root = (input || {}) as UnknownRecord;
  const info = ((root.info || root.movie_data || root) as UnknownRecord);
  const movie = ((root.movie_data || {}) as UnknownRecord);
  return {
    id: text(movie.stream_id ?? info.stream_id ?? fallback?.id), name: text(info.name ?? movie.name ?? fallback?.name) || 'Untitled',
    categoryId: text(movie.category_id ?? fallback?.categoryId), poster: optional(info.movie_image ?? info.cover_big ?? info.cover ?? fallback?.poster),
    backdrop: Array.isArray(info.backdrop_path) ? optional(info.backdrop_path[0]) : optional(info.backdrop_path),
    year: optional(info.year ?? info.releasedate ?? fallback?.year), rating: optional(info.rating ?? fallback?.rating),
    duration: optional(info.duration ?? info.duration_secs ?? fallback?.duration), genre: optional(info.genre ?? fallback?.genre),
    description: optional(info.plot ?? info.description ?? fallback?.description), extension: optional(movie.container_extension ?? fallback?.extension) || 'mp4'
  };
}

export function normalizeSeries(input: unknown): SeriesItem[] {
  if (!Array.isArray(input)) return [];
  return input.map((raw) => raw as UnknownRecord).map((item) => ({
    id: text(item.series_id ?? item.id), name: text(item.name ?? item.title) || 'Untitled series', categoryId: text(item.category_id),
    poster: optional(item.cover ?? item.stream_icon), backdrop: Array.isArray(item.backdrop_path) ? optional(item.backdrop_path[0]) : optional(item.backdrop_path),
    year: optional(item.year ?? item.releaseDate), rating: optional(item.rating), genre: optional(item.genre), description: optional(item.plot ?? item.description)
  })).filter((item) => item.id);
}

// Xtream variants use an object keyed by season, flat episode arrays, or nested arrays.
// Keep unknown numbers unknown; never turn specials (zero) into season/episode one.
const record = (value: unknown): UnknownRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
const ordinal = (value: unknown): number | undefined => {
  if (value == null || String(value).trim() === '') return undefined;
  const n = Number(value); return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
};
const firstText = (...values: unknown[]) => values.map(optional).find(value => value?.trim());

export function normalizeSeriesInfo(input: unknown, seriesId: string, fallback?: SeriesItem) {
  const root = record(input), info = record(root.info);
  const seasons = new Map<string, Season>();
  const addSeason = (id: string, number?: number, name?: string) => {
    if (!seasons.has(id)) seasons.set(id, { id, number, name });
    else if (name) seasons.get(id)!.name = name;
  };
  const declared: Array<[string | undefined, unknown]> = Array.isArray(root.seasons)
    ? root.seasons.map(row => [undefined, row]) : Object.entries(record(root.seasons));
  declared.forEach(([group, raw], index) => {
    const row = record(raw), number = ordinal(row.season_number) ?? ordinal(row.season) ?? ordinal(group);
    addSeason(number === undefined ? `declared:${text(row.id) || group || index}` : String(number), number, optional(row.name));
  });
  const episodes: Episode[] = [];
  const append = (raw: unknown, group?: string) => {
    const item = record(raw), details = record(item.info);
    const id = text(item.id ?? item.stream_id); if (!id) return;
    const season = ordinal(item.season) ?? ordinal(details.season) ?? ordinal(group);
    const seasonId = season === undefined ? `group:${group ?? 'unknown'}` : String(season);
    const conflicts = (values: unknown[]) => new Set(values.map(ordinal).filter(value => value !== undefined)).size > 1;
    const identityAmbiguous = conflicts([item.season, details.season, group])
      || conflicts([item.episode_num, item.episode, details.episode_num, details.episode])
      || [item.series_id, details.series_id].some(value => value != null && text(value) !== seriesId)
      || Boolean(item.title && item.name && text(item.title).trim() !== text(item.name).trim());
    addSeason(seasonId, season);
    episodes.push({ id, name: firstText(item.title, item.name) || '', season: season ?? null, seasonId,
      episode: ordinal(item.episode_num) ?? ordinal(item.episode) ?? ordinal(details.episode_num) ?? ordinal(details.episode) ?? null,
      extension: optional(item.container_extension) || 'mp4',
      thumbnail: firstText(details.movie_image, details.cover_big, item.movie_image, item.cover),
      duration: firstText(details.duration, item.duration) || (Number(details.duration_secs) > 0 ? `${Math.round(Number(details.duration_secs) / 60)} min` : undefined),
      description: firstText(details.plot, details.description, item.plot, item.description),
      ...(identityAmbiguous ? { identityAmbiguous: true } : {}) });
  };
  if (Array.isArray(root.episodes)) root.episodes.forEach((entry, index) => {
    if (Array.isArray(entry)) entry.forEach(row => append(row, String(index)));
    else append(entry);
  });
  else Object.entries(record(root.episodes)).forEach(([group, rows]) => {
    if (Array.isArray(rows)) { const number = ordinal(group); addSeason(number === undefined ? `group:${group}` : String(number), number); rows.forEach(row => append(row, group)); }
  });
  const details: SeriesItem = { id: seriesId, name: firstText(info.name, info.title, fallback?.name) || '', categoryId: firstText(info.category_id, fallback?.categoryId) || '',
    poster: firstText(info.cover, info.stream_icon, fallback?.poster),
    backdrop: firstText(Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : info.backdrop_path, fallback?.backdrop),
    year: firstText(info.year, info.release_date, info.releaseDate, fallback?.year), rating: firstText(info.rating, fallback?.rating),
    genre: firstText(info.genre, fallback?.genre), description: firstText(info.plot, info.description, fallback?.description) };
  return { item: details, episodes, seasons: [...seasons.values()].sort((a,b) => (a.number ?? Infinity) - (b.number ?? Infinity) || 0) };
}
