import type { Channel, HistoryItem } from './types.js';

/** Resolve remembered channels against the current provider catalog, never stale history metadata. */
export function liveSelection(channels: Channel[], history: HistoryItem[], remember: boolean) {
  const last = remember ? history.find((row) => row.type === 'live') : undefined;
  const index = last ? channels.findIndex((channel) => channel.id === last.id) : -1;
  const selected = Math.max(0, index);
  const offset = Math.floor(selected / 100) * 100;
  return { channel: channels[selected], offset, channels: channels.slice(offset, offset + 100) };
}
