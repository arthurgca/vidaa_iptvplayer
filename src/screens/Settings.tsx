import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/client';
import { ErrorState, Spinner } from '../components/common';
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

export function Settings({ firstRun = false, saved }: { firstRun?: boolean; saved: () => void }) {
  const [config, setConfig] = useState<AppConfig>(); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api.config().then(setConfig).catch((reason) => setError(reason.message)); }, []);
  useEffect(() => {
    if (!firstRun) return;
    const timer = window.setInterval(() => { api.status().then((status) => { if (status.configured) saved(); }).catch(() => undefined); }, 3000);
    return () => window.clearInterval(timer);
  }, [firstRun]);
  if (!config) return error ? <ErrorState error={error} /> : <Spinner label="Loading settings…" />;
  const field = (key: keyof AppConfig, value: string | boolean | number) => setConfig({ ...config, [key]: value });
  const run = (action: () => Promise<unknown>, success: string, after?: () => void) => { setBusy(true); setError(''); setMessage(''); action().then(() => { setMessage(success); after?.(); }).catch((reason) => setError(reason.message)).finally(() => setBusy(false)); };
  return <main className="screen settings-screen"><header><span className="eyebrow">{firstRun ? 'FIRST SETUP' : 'SETTINGS'}</span><h1>{firstRun ? 'Connect your IPTV provider' : 'Provider & playback'}</h1><p>{firstRun ? 'Press OK on a field to type, or configure this page from another device. The TV will continue automatically.' : 'Environment variables override values saved here.'}</p></header>
    <form className="settings-form" onSubmit={(e) => e.preventDefault()}>
      <RemoteInput focusKey="settings:server" index={0} label="Xtream Server" value={config.xtreamBaseUrl} input={(value) => field('xtreamBaseUrl', value)} placeholder="http://provider.example:8080" />
      <RemoteInput focusKey="settings:username" index={1} label="Username" value={config.xtreamUsername} input={(value) => field('xtreamUsername', value)} autocomplete="username" />
      <RemoteInput focusKey="settings:password" index={2} label="Password" type="password" value={config.xtreamPassword} input={(value) => field('xtreamPassword', value)} placeholder={config.passwordConfigured ? 'Saved (leave blank to keep)' : ''} autocomplete="current-password" />
      <RemoteInput focusKey="settings:xmltv" index={3} label={<>XMLTV URL <small>optional</small></>} value={config.xmltvUrl} input={(value) => field('xmltvUrl', value)} placeholder="http://provider.example/xmltv.php?..." />
      <div className="settings-row">
        <RemoteSelect focusKey="settings:format" index={4} label="Live format" value={config.preferredLiveFormat} change={(value) => field('preferredLiveFormat', value)} options={[{ value: 'auto', label: 'Auto' }, { value: 'hls', label: 'HLS' }, { value: 'ts', label: 'MPEG-TS' }]} />
        <RemoteSelect focusKey="settings:epg" index={5} label="EPG refresh" value={config.epgRefreshHours} change={(value) => field('epgRefreshHours', Number(value))} options={[{ value: 3, label: '3 hours' }, { value: 6, label: '6 hours' }, { value: 12, label: '12 hours' }]} />
      </div>
      <div className="toggle-row">
        <Focusable focusKey="settings:demo" group="settings-controls" index={6} orientation="vertical" onSelect={() => field('demoMode', !config.demoMode)} className="toggle-control"><span className={`toggle-box ${config.demoMode ? 'checked' : ''}`} />Demo mode</Focusable>
        <Focusable focusKey="settings:autoplay" group="settings-controls" index={7} orientation="vertical" onSelect={() => field('autoplayLive', !config.autoplayLive)} className="toggle-control"><span className={`toggle-box ${config.autoplayLive ? 'checked' : ''}`} />Autoplay live</Focusable>
        <Focusable focusKey="settings:remember" group="settings-controls" index={8} orientation="vertical" onSelect={() => field('rememberLastChannel', !config.rememberLastChannel)} className="toggle-control"><span className={`toggle-box ${config.rememberLastChannel ? 'checked' : ''}`} />Remember channel</Focusable>
      </div>
      {error && <p className="form-message error">{error}</p>}{message && <p className="form-message success">{message}</p>}
      <div className="form-actions">
        <Focusable focusKey="settings:test" group="settings-controls" index={9} orientation="vertical" disabled={busy} onSelect={() => run(() => api.testConfig(config), 'Connection successful.')} className="secondary-button">Test Connection</Focusable>
        <Focusable focusKey="settings:save" group="settings-controls" index={10} orientation="vertical" disabled={busy} onSelect={() => run(() => api.saveConfig(config), 'Settings saved.', saved)} className="primary-button">Save</Focusable>
        {!firstRun && <Focusable focusKey="settings:refresh" group="settings-controls" index={11} orientation="vertical" disabled={busy} onSelect={() => run(api.refresh, 'IPTV and EPG caches refreshed.')} className="secondary-button">Refresh IPTV Data</Focusable>}
      </div>
    </form></main>;
}
