import type { EpgNow, Program } from '../types';
import { api } from './client';

export const EPG_TTL_MS = 60_000;

interface Entry { value?: EpgNow; fetchedAt: number; pending?: Promise<EpgNow | undefined> }

const entries = new Map<string, Entry>();

/** Last known window for a channel, however old. Rows keep showing it so the bar never blanks; the TTL only decides when a refetch is worth making. */
export function peekEpg(channelId: string) { return entries.get(channelId)?.value; }

export function isEpgFresh(channelId: string, now = Date.now()) {
  const entry = entries.get(channelId);
  return Boolean(entry && !entry.pending && now - entry.fetchedAt < EPG_TTL_MS);
}

export function loadEpg(channelId: string): Promise<EpgNow | undefined> {
  const entry = entries.get(channelId);
  if (entry?.pending) return entry.pending;
  if (entry && isEpgFresh(channelId)) return Promise.resolve(entry.value);
  const settle = (value: EpgNow | undefined) => { entries.set(channelId, { value, fetchedAt: Date.now() }); return value; };
  const pending = api.epg(channelId).then(settle, () => settle(undefined));
  entries.set(channelId, { value: entry?.value, fetchedAt: entry?.fetchedAt || 0, pending });
  return pending;
}

export function clearEpgCache() { entries.clear(); }

/** Elapsed share of a programme, recomputed locally so a cached window still draws a moving bar. */
export function programProgress(program: Program | undefined, now = Date.now()) {
  if (!program || program.end <= program.start) return 0;
  return Math.max(0, Math.min(100, ((now - program.start) / (program.end - program.start)) * 100));
}
