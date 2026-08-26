import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/client';
import { ErrorState, Spinner } from '../components/common';
import { useTranslate } from '../i18n/I18nContext';
import { LANGUAGES, type Language } from '../i18n';
import { Focusable, useFocusProxy } from '../navigation/FocusContext';
import type { AppConfig } from '../types';

const useFieldProxy = (focusKey: string, index: number, activate: () => void) =>
  useFocusProxy({ focusKey, group: 'settings-controls', index, orientation: 'vertical', activate });

interface RemoteInputProps {
  focusKey: string; index: number; label: preact.ComponentChildren; value: string;
  type?: string; placeholder?: string; autocomplete?: string; input: (value: string) => void;
}

function RemoteInput({ focusKey, index, label, value, type = 'text', placeholder, autocomplete, input }: RemoteInputProps) {
  const target = useRef<HTMLInputElement>(null);
  const proxy = useFieldProxy(focusKey, index, () => { target.current?.focus(); target.current?.click(); });
  return <label>{label}<div {...proxy} className="settings-control" data-focus-proxy>
    <input ref={target} tabIndex={-1} type={type} value={value} placeholder={placeholder} autocomplete={autocomplete} onInput={(event) => input(event.currentTarget.value)} />
  </div></label>;
}

interface RemoteSelectProps {
  focusKey: string; index: number; label: preact.ComponentChildren; value: string | number;
  options: { value: string | number; label: string }[]; change: (value: string) => void;
}

function RemoteSelect({ focusKey, index, label, value, options, change }: RemoteSelectProps) {
  const target = useRef<HTMLSelectElement>(null);
  const proxy = useFieldProxy(focusKey, index, () => { target.current?.focus(); target.current?.click(); });
  return <label>{label}<div {...proxy} className="settings-control" data-focus-proxy>
    <select ref={target} tabIndex={-1} value={value} onChange={(event) => change(event.currentTarget.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
  </div></label>;
}

interface SettingsProps { firstRun?: boolean; language: Language; setLanguage: (language: Language) => void; saved: () => void }

export function Settings({ firstRun = false, language, setLanguage, saved }: SettingsProps) {
  const t = useTranslate();
  const [config, setConfig] = useState<AppConfig>(); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api.config().then(setConfig).catch((reason) => setError(reason.message)); }, []);
  useEffect(() => {
    if (!firstRun) return;
    const timer = window.setInterval(() => { api.status().then((status) => { if (status.configured) saved(); }).catch(() => undefined); }, 3000);
    return () => window.clearInterval(timer);
  }, [firstRun]);
  if (!config) return error ? <ErrorState error={error} /> : <Spinner label={t('settings.loading')} />;
  const field = (key: keyof AppConfig, value: string | boolean | number) => setConfig({ ...config, [key]: value });
  const run = (action: () => Promise<unknown>, success: string, after?: () => void) => { setBusy(true); setError(''); setMessage(''); action().then(() => { setMessage(success); after?.(); }).catch((reason) => setError(reason.message)).finally(() => setBusy(false)); };
  // The language switches the moment it is picked — waiting for Save would leave the chooser
  // arguing with the screen around it — and is persisted on its own so it survives a first run
  // abandoned before any credentials are entered.
  const changeLanguage = (value: string) => {
    const next = value === 'pt' ? 'pt' : 'en';
    setLanguage(next); setConfig({ ...config, language: next });
    api.saveConfig({ language: next }).catch(() => undefined);
  };
  return <main className="screen settings-screen"><header><span className="eyebrow">{firstRun ? t('settings.firstRun.eyebrow') : t('settings.eyebrow')}</span><h1>{firstRun ? t('settings.firstRun.title') : t('settings.title')}</h1><p>{firstRun ? t('settings.firstRun.help') : t('settings.help')}</p></header>
    <form className="settings-form" onSubmit={(e) => e.preventDefault()}>
      <div className="settings-row">
        <RemoteSelect focusKey="settings:language" index={0} label={t('settings.language')} value={language} change={changeLanguage} options={LANGUAGES.map((option) => ({ value: option.value, label: option.label }))} />
      </div>
      <RemoteInput focusKey="settings:server" index={1} label={t('settings.server')} value={config.xtreamBaseUrl} input={(value) => field('xtreamBaseUrl', value)} placeholder="http://provider.example:8080" />
      <RemoteInput focusKey="settings:username" index={2} label={t('settings.username')} value={config.xtreamUsername} input={(value) => field('xtreamUsername', value)} autocomplete="username" />
      <RemoteInput focusKey="settings:password" index={3} label={t('settings.password')} type="password" value={config.xtreamPassword} input={(value) => field('xtreamPassword', value)} placeholder={config.passwordConfigured ? t('settings.passwordSaved') : ''} autocomplete="current-password" />
      <RemoteInput focusKey="settings:xmltv" index={4} label={<span>{t('settings.xmltv')} <small>{t('settings.optional')}</small></span>} value={config.xmltvUrl} input={(value) => field('xmltvUrl', value)} placeholder="http://provider.example/xmltv.php?..." />
      <div className="settings-row">
        <RemoteSelect focusKey="settings:format" index={5} label={t('settings.liveFormat')} value={config.preferredLiveFormat} change={(value) => field('preferredLiveFormat', value)} options={[{ value: 'auto', label: t('settings.liveFormat.auto') }, { value: 'hls', label: 'HLS' }, { value: 'ts', label: 'MPEG-TS' }]} />
        <RemoteSelect focusKey="settings:epg" index={6} label={t('settings.epgRefresh')} value={config.epgRefreshHours} change={(value) => field('epgRefreshHours', Number(value))} options={[3, 6, 12].map((hours) => ({ value: hours, label: t('settings.epgRefresh.hours', { count: hours }) }))} />
      </div>
      <div className="toggle-row">
        <Focusable focusKey="settings:demo" group="settings-controls" index={7} orientation="vertical" onSelect={() => field('demoMode', !config.demoMode)} className="toggle-control"><span className={`toggle-box ${config.demoMode ? 'checked' : ''}`} />{t('settings.demoMode')}</Focusable>
        <Focusable focusKey="settings:autoplay" group="settings-controls" index={8} orientation="vertical" onSelect={() => field('autoplayLive', !config.autoplayLive)} className="toggle-control"><span className={`toggle-box ${config.autoplayLive ? 'checked' : ''}`} />{t('settings.autoplayLive')}</Focusable>
        <Focusable focusKey="settings:remember" group="settings-controls" index={9} orientation="vertical" onSelect={() => field('rememberLastChannel', !config.rememberLastChannel)} className="toggle-control"><span className={`toggle-box ${config.rememberLastChannel ? 'checked' : ''}`} />{t('settings.rememberChannel')}</Focusable>
      </div>
      {error && <p className="form-message error">{error}</p>}{message && <p className="form-message success">{message}</p>}
      <div className="form-actions">
        <Focusable focusKey="settings:test" group="settings-controls" index={10} orientation="vertical" disabled={busy} onSelect={() => run(() => api.testConfig(config), t('settings.testOk'))} className="secondary-button">{t('settings.test')}</Focusable>
        <Focusable focusKey="settings:save" group="settings-controls" index={11} orientation="vertical" disabled={busy} onSelect={() => run(() => api.saveConfig({ ...config, language }), t('settings.saved'), saved)} className="primary-button">{t('settings.save')}</Focusable>
        {!firstRun && <Focusable focusKey="settings:refresh" group="settings-controls" index={12} orientation="vertical" disabled={busy} onSelect={() => run(api.refresh, t('settings.refreshed'))} className="secondary-button">{t('settings.refresh')}</Focusable>}
      </div>
    </form></main>;
}
