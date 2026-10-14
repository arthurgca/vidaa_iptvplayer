import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dataDir, getConfig } from '../config.js';
import { demoPrograms } from '../demo.js';
import type { Channel, Program } from '../types.js';
import { xtream } from '../xtream/client.js';
import { matchEpgChannel } from './matcher.js';
import { parseXmltv, type ParsedXmltv } from './xmltv.js';
import { scheduleWindow } from './schedule.js';

interface EpgCache extends ParsedXmltv { refreshedAt: number }
const cachePath = path.join(dataDir, 'epg-cache.json');
let cache: EpgCache = { programs: [], channelNames: {}, refreshedAt: 0 };
let refreshing: Promise<void> | null = null;
let generation = 0;

async function persistCache(value: EpgCache, expectedGeneration = generation) {
  const temporary = `${cachePath}.${expectedGeneration}.tmp`;
  await writeFile(temporary, JSON.stringify(value), 'utf8');
  if (expectedGeneration !== generation) { await unlink(temporary).catch(() => undefined); return false; }
  await rename(temporary, cachePath);
  return true;
}

export async function initEpg() {
  try { cache = JSON.parse(await readFile(cachePath, 'utf8')) as EpgCache; } catch { /* first run */ }
  const config = getConfig();
  if (config.demoMode) cache = { programs: demoPrograms(), channelNames: {}, refreshedAt: Date.now() };
  else if (config.xmltvUrl && Date.now() - cache.refreshedAt > config.epgRefreshHours * 3600_000) void refreshEpg();
  setInterval(() => void refreshEpg(), 30 * 60_000).unref();
}

export async function refreshEpg(force = false): Promise<void> {
  if (refreshing) return refreshing;
  const config = getConfig();
  if (config.demoMode) { cache = { programs: demoPrograms(), channelNames: {}, refreshedAt: Date.now() }; return; }
  if (!config.xmltvUrl) return;
  if (!force && Date.now() - cache.refreshedAt < config.epgRefreshHours * 3600_000) return;
  const startedInGeneration = generation;
  refreshing = (async () => {
    const url = new URL(config.xmltvUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('XMLTV URL must use HTTP or HTTPS.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'VIDAA-IPTV/1.0', accept: 'application/xml,text/xml,*/*' } });
      if (!response.ok) throw new Error(`XMLTV server returned HTTP ${response.status}.`);
      const declared = Number(response.headers.get('content-length') || 0);
      if (declared > 100 * 1024 * 1024) throw new Error('XMLTV file exceeds the 100 MB safety limit.');
      const xml = await response.text();
      if (xml.length > 100 * 1024 * 1024) throw new Error('XMLTV file exceeds the 100 MB safety limit.');
      const parsed = parseXmltv(xml);
      if (startedInGeneration !== generation) return;
      const next = { ...parsed, refreshedAt: Date.now() };
      if (!await persistCache(next, startedInGeneration) || startedInGeneration !== generation) return;
      cache = next;
    } finally { clearTimeout(timeout); }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

/** Clear memory and disk, and prevent an older in-flight refresh from restoring stale data. */
export async function clearEpg() {
  generation += 1;
  cache = { programs: [], channelNames: {}, refreshedAt: 0 };
  await persistCache(cache);
}

function programWindow(programs: Program[]) {
  const now = Date.now();
  const current = programs.find((program) => program.start <= now && program.end > now);
  const next = programs.find((program) => program.start >= (current?.end || now));
  const progress = current ? Math.max(0, Math.min(100, Math.round(((now - current.start) / (current.end - current.start)) * 100))) : 0;
  return { current, next, progress };
}

function decode(value: unknown): string {
  if (typeof value !== 'string') return '';
  try { return Buffer.from(value, 'base64').toString('utf8'); } catch { return value; }
}

export async function scheduleForChannel(channel: Channel, start = Date.now() - 6 * 3600_000, end = Date.now() + 48 * 3600_000, full = true): Promise<Program[]> {
  if (getConfig().demoMode) {
    const programs = cache.programs.filter((program) => program.channelId === channel.epgChannelId);
    return scheduleWindow(programs, start, end);
  }
  const matched = matchEpgChannel(channel, cache.channelNames);
  if (matched) {
    const programs = scheduleWindow(cache.programs.filter((program) => program.channelId === matched), start, end);
    if (programs.length) return programs;
  }
  try {
    let result: Record<string, unknown> | undefined;
    if (full) result = await xtream('get_simple_data_table', { stream_id: channel.id }).catch(() => undefined) as Record<string, unknown> | undefined;
    const hasListings = result && (Array.isArray(result) ? result.length > 0 : Array.isArray(result.epg_listings) && result.epg_listings.length > 0);
    if (!hasListings) result = await xtream('get_short_epg', { stream_id: channel.id, limit: full ? '100' : '4' }) as Record<string, unknown>;
    if (!result) return [];
    const rows = (Array.isArray(result) ? result : result.epg_listings || []) as Record<string, unknown>[];
    const programs = rows.map((item) => ({ channelId: channel.epgChannelId || channel.id, title: decode(item.title), description: decode(item.description) || undefined,
      start: Number(item.start_timestamp) * 1000 || Date.parse(String(item.start)), end: Number(item.stop_timestamp) * 1000 || Date.parse(String(item.end)) })).filter((item) => item.start && item.end);
    return scheduleWindow(programs, start, end);
  } catch { return []; }
}

export async function epgForChannel(channel: Channel) { return programWindow(await scheduleForChannel(channel, undefined, undefined, false)); }

export function epgStatus() { return { refreshedAt: cache.refreshedAt, programCount: cache.programs.length, channelCount: Object.keys(cache.channelNames).length }; }
