import type { Episode, HistoryItem } from '../types';

export function isWatched(row?: Pick<HistoryItem, 'position' | 'duration' | 'completed'>) {
  return Boolean(row && (row.completed || (Number.isFinite(row.duration) && row.duration > 0 && row.position / row.duration >= .95)));
}

export function resumePosition(row?: Pick<HistoryItem, 'position' | 'duration' | 'completed'>) {
  return row && Number.isFinite(row.position) && row.position > 10 && !isWatched(row) ? row.position : 0;
}

export function orderedEpisodes(episodes: Episode[]) {
  return [...episodes].sort((a, b) => a.season - b.season || a.episode - b.episode);
}

export function nextEpisode(episodes: Episode[], id: string) {
  const ordered = orderedEpisodes(episodes);
  const index = ordered.findIndex((episode) => episode.id === id);
  return index < 0 ? undefined : ordered[index + 1];
}
