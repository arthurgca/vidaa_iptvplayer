import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { AppConfig, Language } from './types.js';

const dataDir = process.env.DATA_DIR || path.resolve('data');
const configPath = path.join(dataDir, 'config.json');

const bool = (value: string | undefined, fallback: boolean) => value == null ? fallback : value === 'true' || value === '1';
export const isLanguage = (value: unknown): value is Language => value === 'en' || value === 'pt';
/** First recognized language wins, so an unknown value saved or exported can never reach the UI. */
const pickLanguage = (...values: unknown[]): Language => values.find(isLanguage) ?? 'en';

const defaults: AppConfig = {
  xtreamBaseUrl: '', xtreamUsername: '', xtreamPassword: '', xmltvUrl: '',
  epgRefreshHours: 6, preferredLiveFormat: 'auto', autoplayLive: true,
  rememberLastChannel: true, demoMode: bool(process.env.DEMO_MODE, false),
  language: pickLanguage(process.env.LANGUAGE)
};

let saved: Partial<AppConfig> = {};
const environmentKeys: Record<keyof AppConfig, string> = {
  xtreamBaseUrl: 'XTREAM_BASE_URL', xtreamUsername: 'XTREAM_USERNAME', xtreamPassword: 'XTREAM_PASSWORD',
  xmltvUrl: 'XMLTV_URL', epgRefreshHours: 'EPG_REFRESH_HOURS', preferredLiveFormat: 'PREFERRED_LIVE_FORMAT',
  autoplayLive: 'AUTOPLAY_LIVE', rememberLastChannel: 'REMEMBER_LAST_CHANNEL', demoMode: 'DEMO_MODE', language: 'LANGUAGE'
};
export function managedSettings(): (keyof AppConfig)[] {
  return (Object.keys(environmentKeys) as (keyof AppConfig)[]).filter(key => {
    const value = process.env[environmentKeys[key]];
    return key === 'language' ? isLanguage(value) : ['autoplayLive', 'rememberLastChannel', 'demoMode'].includes(key) ? value != null : Boolean(value);
  });
}
let writes = Promise.resolve();
function persist(change: (previous: Partial<AppConfig>) => Partial<AppConfig>) {
  const operation = writes.catch(() => undefined).then(async () => {
    const next = change(saved);
    await writeFile(`${configPath}.tmp`, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(`${configPath}.tmp`, configPath);
    saved = next;
  });
  writes = operation;
  return operation;
}

export async function initConfig(): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  try { saved = JSON.parse(await readFile(configPath, 'utf8')) as Partial<AppConfig>; } catch { saved = {}; }
}

export function getConfig(): AppConfig {
  const config = { ...defaults, ...saved };
  return {
    ...config,
    xtreamBaseUrl: process.env.XTREAM_BASE_URL || config.xtreamBaseUrl,
    xtreamUsername: process.env.XTREAM_USERNAME || config.xtreamUsername,
    xtreamPassword: process.env.XTREAM_PASSWORD || config.xtreamPassword,
    xmltvUrl: process.env.XMLTV_URL || config.xmltvUrl,
    epgRefreshHours: Number(process.env.EPG_REFRESH_HOURS || config.epgRefreshHours) || 6,
    preferredLiveFormat: (process.env.PREFERRED_LIVE_FORMAT as AppConfig['preferredLiveFormat']) || config.preferredLiveFormat,
    autoplayLive: bool(process.env.AUTOPLAY_LIVE, config.autoplayLive),
    rememberLastChannel: bool(process.env.REMEMBER_LAST_CHANNEL, config.rememberLastChannel),
    demoMode: bool(process.env.DEMO_MODE, config.demoMode),
    language: pickLanguage(process.env.LANGUAGE, config.language)
  };
}

export async function saveConfig(update: Partial<AppConfig>): Promise<AppConfig> {
  const permitted: (keyof AppConfig)[] = ['xtreamBaseUrl','xtreamUsername','xtreamPassword','xmltvUrl','epgRefreshHours','preferredLiveFormat','autoplayLive','rememberLastChannel','demoMode','language'];
  await persist(previous => {
    const next = { ...previous };
    for (const key of permitted) {
      const value = update[key];
      if (value === undefined || managedSettings().includes(key)) continue;
      // The public settings response never exposes the password. A blank value
      // therefore means "keep the existing password", as the UI promises.
      if (key === 'xtreamPassword' && value === '' && Boolean(getConfig().xtreamPassword)) continue;
      (next as Record<string, unknown>)[key] = value;
    }
    return next;
  });
  return getConfig();
}

/** Remove account and catalog sources without resetting device-facing preferences. */
export async function clearIptvConfig(): Promise<AppConfig> {
  await persist(previous => {
    const cleared = { ...previous };
    const iptvKeys: (keyof AppConfig)[] = ['xtreamBaseUrl', 'xtreamUsername', 'xtreamPassword', 'xmltvUrl', 'demoMode'];
    for (const key of iptvKeys) delete cleared[key];
    return cleared;
  });
  return getConfig();
}

// Until someone has actually chosen one, the TV's own language is a better guess than our default,
// so the client is told whether `language` is a real preference or just the fallback.
export const languageConfigured = () => isLanguage(saved.language) || isLanguage(process.env.LANGUAGE);

export function publicConfig(config = getConfig()) {
  const managed = managedSettings();
  let publicBaseUrl = config.xtreamBaseUrl;
  if (managed.includes('xtreamBaseUrl')) {
    try {
      const url = new URL(publicBaseUrl);
      url.username = ''; url.password = ''; url.search = ''; url.hash = '';
      publicBaseUrl = url.toString();
    } catch { publicBaseUrl = ''; }
  }
  return { ...config, xtreamBaseUrl: publicBaseUrl, xmltvUrl: managed.includes('xmltvUrl') ? '' : config.xmltvUrl, xtreamPassword: '', managedSettings: managed, passwordConfigured: Boolean(config.xtreamPassword), languageConfigured: languageConfigured(), configured: config.demoMode || Boolean(config.xtreamBaseUrl && config.xtreamUsername && config.xtreamPassword) };
}

export { dataDir };
