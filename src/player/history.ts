import type { Episode, HistoryItem } from '../types';

export function isWatched(row?: Pick<HistoryItem, 'position' | 'duration' | 'completed'>) {
  return Boolean(row && (row.completed || (Number.isFinite(row.duration) && row.duration > 0 && row.position / row.duration >= .95)));
}

export function resumePosition(row?: Pick<HistoryItem, 'position' | 'duration' | 'completed'>) {
  return row && Number.isFinite(row.position) && row.position > 10 && !isWatched(row) ? row.position : 0;
}

export function orderedEpisodes(episodes: Episode[]) {
  const groups = new Map<string, number>();
  episodes.forEach(episode => { const key = episode.seasonId ?? String(episode.season ?? 'unknown'); if (!groups.has(key)) groups.set(key, groups.size); });
  // Explicit provider-index ties also work on older TV engines without stable Array.sort.
  return episodes.map((episode, index) => ({ episode, index })).sort((a, b) =>
    ((a.episode.season ?? Infinity) - (b.episode.season ?? Infinity) || 0)
    || (groups.get(a.episode.seasonId ?? String(a.episode.season ?? 'unknown'))! - groups.get(b.episode.seasonId ?? String(b.episode.season ?? 'unknown'))!)
    || ((a.episode.episode ?? Infinity) - (b.episode.episode ?? Infinity) || 0)
    || a.index - b.index).map(row => row.episode);
}

export function nextEpisode(episodes: Episode[], id: string) {
  const ordered = orderedEpisodes(episodes);
  const index = ordered.findIndex((episode) => episode.id === id);
  return index < 0 ? undefined : ordered[index + 1];
}
