import type { Program } from '../types.js';

export function decodeEpgText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || text.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return text;
  const bytes = Buffer.from(text, 'base64');
  const decoded = bytes.toString('utf8');
  return bytes.toString('base64') === text && !/[\u0000-\u0008\u000e-\u001f\ufffd]/.test(decoded) ? decoded.trim() : text;
}

export function epgTimestamp(epoch: unknown, fallback: unknown): number {
  for (const value of [epoch, fallback]) {
    const numeric = Number(value);
    if (value !== '' && value != null && Number.isFinite(numeric) && numeric > 0) return numeric < 1e12 ? numeric * 1000 : numeric;
    // A server-local wall clock has no reliable timezone. Never guess an offset.
    if (typeof value === 'string' && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
      const parsed = Date.parse(value); if (Number.isFinite(parsed)) return parsed;
    }
  }
  return NaN;
}

export function normalizeEpgRows(rows: Record<string, unknown>[], channelId: string): Program[] {
  return rows.map(item => ({ channelId, title: decodeEpgText(item.title), description: decodeEpgText(item.description) || undefined,
    start: epgTimestamp(item.start_timestamp, item.start), end: epgTimestamp(item.stop_timestamp, item.end) }));
}
