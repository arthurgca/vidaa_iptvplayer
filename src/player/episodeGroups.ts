import type { Episode } from '../types';

export interface LogicalEpisode extends Episode { streams: Episode[] }

/** Call for one provider/catalog response only. Titles retain case and punctuation. */
export function groupEpisodes(episodes: Episode[], seriesId: string): LogicalEpisode[] {
  const groups = new Map<string, LogicalEpisode>();
  const result: LogicalEpisode[] = [];
  for (const stream of episodes) {
    const title = stream.name.trim().replace(/\s+/g, ' ');
    const known = (n: number | null) => n !== null && Number.isSafeInteger(n) && n >= 0;
    const reliable = !stream.identityAmbiguous && known(stream.season) && known(stream.episode) && title;
    const key = reliable ? `logical:${JSON.stringify([seriesId, stream.seasonId ?? String(stream.season), stream.season, stream.episode, title])}` : undefined;
    let group = key ? groups.get(key) : undefined;
    if (!group) {
      group = { ...stream, id: key || stream.id, streams: [] };
      result.push(group);
      if (key) groups.set(key, group);
    }
    if (!group.streams.some(existing => existing.id === stream.id)) group.streams.push(stream);
  }
  for (const group of result) {
    // Lexical ID order is locale-independent and does not depend on response order.
    group.streams.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const richness = (stream: Episode) => Number(Boolean(stream.thumbnail)) + Number(Boolean(stream.description)) + Number(Boolean(stream.duration));
    const display = group.streams.reduce((best, stream) => richness(stream) > richness(best) ? stream : best);
    Object.assign(group, display, { id: group.id });
    // Keep single-stream navigation keys compatible with existing saved context.
    if (group.streams.length === 1) group.id = group.streams[0]!.id;
  }
  return result;
}
