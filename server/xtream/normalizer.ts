import type { Category, Channel, Episode, SeriesItem, VodItem } from '../types.js';

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
  return input.map((raw) => raw as UnknownRecord).map((item) => ({
    id: text(item.stream_id ?? item.id),
    name: text(item.name) || 'Unnamed channel',
    categoryId: text(item.category_id),
    logo: optional(item.stream_icon ?? item.logo),
    epgChannelId: optional(item.epg_channel_id ?? item.tv_archive_id),
    number: number(item.num ?? item.stream_id),
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

export function normalizeSeriesInfo(input: unknown, seriesId: string) {
  const root = (input || {}) as UnknownRecord;
  const info = (root.info || {}) as UnknownRecord;
  const episodesRoot = root.episodes as Record<string, unknown[]> | unknown[] | undefined;
  const episodeRows: UnknownRecord[] = [];
  if (Array.isArray(episodesRoot)) episodeRows.push(...episodesRoot as UnknownRecord[]);
  else if (episodesRoot) Object.keys(episodesRoot).forEach((season) => {
    const rows = episodesRoot[season]; if (Array.isArray(rows)) episodeRows.push(...rows as UnknownRecord[]);
  });
  const episodes: Episode[] = episodeRows.map((item) => {
    const details = (item.info || {}) as UnknownRecord;
    return { id: text(item.id ?? item.stream_id), name: text(item.title ?? item.name) || 'Episode', season: Number(item.season ?? details.season) || 1,
      episode: Number(item.episode_num ?? item.episode ?? details.episode) || 1, extension: optional(item.container_extension) || 'mp4',
      duration: optional(details.duration ?? item.duration), description: optional(details.plot ?? details.description) };
  }).filter((episode) => episode.id);
  const details: SeriesItem = { id: seriesId, name: text(info.name) || 'Series', categoryId: text(info.category_id), poster: optional(info.cover),
    backdrop: Array.isArray(info.backdrop_path) ? optional(info.backdrop_path[0]) : optional(info.backdrop_path), year: optional(info.year ?? info.releaseDate),
    rating: optional(info.rating), genre: optional(info.genre), description: optional(info.plot ?? info.description) };
  return { item: details, episodes };
}
