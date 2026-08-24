import { useEffect, useState } from 'preact/hooks';
import { api } from '../api/client';
import { ErrorState, Spinner } from '../components/common';
import type { AppConfig } from '../types';

export function Settings({ firstRun = false, saved }: { firstRun?: boolean; saved: () => void }) {
  const [config, setConfig] = useState<AppConfig>(); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api.config().then(setConfig).catch((reason) => setError(reason.message)); }, []);
  if (!config) return error ? <ErrorState error={error} /> : <Spinner label="Loading settings…" />;
  const field = (key: keyof AppConfig, value: string | boolean | number) => setConfig({ ...config, [key]: value });
  const run = (action: () => Promise<unknown>, success: string, after?: () => void) => { setBusy(true); setError(''); setMessage(''); action().then(() => { setMessage(success); after?.(); }).catch((reason) => setError(reason.message)).finally(() => setBusy(false)); };
  return <main className="screen settings-screen"><header><span className="eyebrow">{firstRun ? 'FIRST SETUP' : 'SETTINGS'}</span><h1>{firstRun ? 'Connect your IPTV provider' : 'Provider & playback'}</h1><p>{firstRun ? 'Enter Xtream credentials, or leave Demo Mode enabled to explore the app.' : 'Environment variables override values saved here.'}</p></header>
    <form className="settings-form" onSubmit={(e) => e.preventDefault()}>
      <label>Xtream Server<input value={config.xtreamBaseUrl} onInput={(e) => field('xtreamBaseUrl', e.currentTarget.value)} placeholder="http://provider.example:8080" /></label>
      <label>Username<input value={config.xtreamUsername} onInput={(e) => field('xtreamUsername', e.currentTarget.value)} autocomplete="username" /></label>
      <label>Password<input type="password" value={config.xtreamPassword} onInput={(e) => field('xtreamPassword', e.currentTarget.value)} placeholder={config.passwordConfigured ? 'Saved (leave blank to keep)' : ''} autocomplete="current-password" /></label>
      <label>XMLTV URL <small>optional</small><input value={config.xmltvUrl} onInput={(e) => field('xmltvUrl', e.currentTarget.value)} placeholder="http://provider.example/xmltv.php?..." /></label>
      <div className="settings-row"><label>Live format<select value={config.preferredLiveFormat} onChange={(e) => field('preferredLiveFormat', e.currentTarget.value)}><option value="auto">Auto</option><option value="hls">HLS</option><option value="ts">MPEG-TS</option></select></label><label>EPG refresh<select value={config.epgRefreshHours} onChange={(e) => field('epgRefreshHours', Number(e.currentTarget.value))}><option value={3}>3 hours</option><option value={6}>6 hours</option><option value={12}>12 hours</option></select></label></div>
      <div className="toggle-row"><label><input type="checkbox" checked={config.demoMode} onChange={(e) => field('demoMode', e.currentTarget.checked)} /> Demo mode</label><label><input type="checkbox" checked={config.autoplayLive} onChange={(e) => field('autoplayLive', e.currentTarget.checked)} /> Autoplay live</label><label><input type="checkbox" checked={config.rememberLastChannel} onChange={(e) => field('rememberLastChannel', e.currentTarget.checked)} /> Remember channel</label></div>
      {error && <p className="form-message error">{error}</p>}{message && <p className="form-message success">{message}</p>}
      <div className="form-actions"><button className="secondary-button" disabled={busy} onClick={() => run(() => api.testConfig(config), 'Connection successful.')}>Test Connection</button><button className="primary-button" disabled={busy} onClick={() => run(() => api.saveConfig(config), 'Settings saved.', saved)}>Save</button>{!firstRun && <button className="secondary-button" disabled={busy} onClick={() => run(api.refresh, 'IPTV and EPG caches refreshed.')}>Refresh IPTV Data</button>}</div>
    </form></main>;
}
