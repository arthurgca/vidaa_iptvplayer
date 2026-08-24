import type { Channel } from '../types.js';

export function normalizeChannelName(name: string): string {
  return name.toLowerCase()
    .replace(/\b(uhd|fhd|hd|sd|4k|1080p|720p)\b/g, '')
    .replace(/\b(us|uk|br|pt|en):\s*/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

export function matchEpgChannel(channel: Channel, channelNames: Record<string, string[]>): string | undefined {
  if (channel.epgChannelId && channelNames[channel.epgChannelId]) return channel.epgChannelId;
  const normalized = normalizeChannelName(channel.name);
  if (normalized.length < 2) return undefined;
  const exact: string[] = [];
  for (const [id, names] of Object.entries(channelNames)) {
    if (normalizeChannelName(id) === normalized || names.some((name) => normalizeChannelName(name) === normalized)) exact.push(id);
  }
  return exact.length === 1 ? exact[0] : undefined;
}
