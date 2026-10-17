import type { AppConfig } from './types.js';
import { isLanguage, managedSettings } from './config.js';
import { normalizeBaseUrl } from './xtream/client.js';

/** Errors never echo submitted credentials or URLs. */
export function configUpdate(body: unknown): Partial<AppConfig> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid configuration.');
  const result: Record<string, unknown> = {};
  const fields = ['xtreamBaseUrl', 'xtreamUsername', 'xtreamPassword', 'xmltvUrl', 'epgRefreshHours', 'preferredLiveFormat', 'autoplayLive', 'rememberLastChannel', 'demoMode', 'language'] as const;
  for (const key of fields) {
    if (managedSettings().includes(key) || !(key in body)) continue;
    const value = (body as Record<string, unknown>)[key];
    if (['autoplayLive', 'rememberLastChannel', 'demoMode'].includes(key)) {
      if (typeof value !== 'boolean') throw new Error('Invalid preference.');
    } else if (key === 'epgRefreshHours') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error('EPG interval must be a positive number.');
    } else if (typeof value !== 'string') throw new Error('Invalid configuration field.');
    if (key === 'language' && !isLanguage(value)) throw new Error('Unsupported language.');
    if (key === 'preferredLiveFormat' && !['auto', 'hls', 'ts'].includes(String(value))) throw new Error('Unsupported live format.');
    if ((key === 'xtreamBaseUrl' || key === 'xmltvUrl') && value) {
      try {
        const url = key === 'xtreamBaseUrl' ? normalizeBaseUrl(String(value)) : new URL(String(value));
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch { throw new Error(key === 'xtreamBaseUrl' ? 'Enter a valid HTTP or HTTPS server URL without embedded credentials.' : 'Enter a valid HTTP or HTTPS XMLTV URL.'); }
    }
    if (key === 'xtreamPassword' && value === '') continue;
    result[key] = value;
  }
  return result;
}
