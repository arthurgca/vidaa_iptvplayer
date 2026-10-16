import type { Episode, HistoryItem } from '../types';
import { resumePosition } from '../player/history';

/** A newer episode supersedes older progress, including when it is completed. */
export function continuing(history: HistoryItem[], type?: 'movie' | 'series') {
  const seen = new Set<string>();
  return [...history].sort((a, b) => (b.checkpointAt ?? b.watchedAt) - (a.checkpointAt ?? a.watchedAt)).filter((row) => {
    if (row.type === 'live' || (type && row.type !== type)) return false;
    const identity = row.type === 'series' && row.series ? `series:${row.series.id}` : `${row.type}:${row.id}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return resumePosition(row) > 0;
  }).slice(0, 12);
}

export function historyTitle(row: HistoryItem) {
  if (row.type !== 'series') return row.item.name;
  const episode = row.item as Episode;
  return `${row.series?.name ? `${row.series.name} · ` : ''}S${episode.season == null ? '—' : String(episode.season).padStart(2, '0')}E${episode.episode == null ? '—' : String(episode.episode).padStart(2, '0')} · ${episode.name}`;
}

export function historyImage(row: HistoryItem) {
  return row.type === 'series' ? row.series?.poster : 'poster' in row.item ? row.item.poster : undefined;
}

export function historyProgress(row: HistoryItem) {
  return Number.isFinite(row.duration) && row.duration > 0 ? row.position / row.duration * 100 : undefined;
}
