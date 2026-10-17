import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/client';
import { ErrorState, Spinner } from '../components/common';
import { useTranslate } from '../i18n/I18nContext';
import { LANGUAGES, type Language, type TranslationKey } from '../i18n';
import { Focusable, useFocusManager, useFocusProxy } from '../navigation/FocusContext';
import type { RemoteAction } from '../platform/remote';
import type { AppConfig } from '../types';
import { APP_VERSION } from '../version';
import { HomeSettings } from './HomeSettings';

const sections = ['general', 'provider', 'playback', 'data', 'home'] as const;
type Section = typeof sections[number];
type Field = 'language' | 'xtreamBaseUrl' | 'xtreamUsername' | 'xtreamPassword' | 'xmltvUrl' | 'demoMode' | 'preferredLiveFormat' | 'autoplayLive' | 'rememberLastChannel' | 'epgRefreshHours';
const fields: Field[] = ['language', 'xtreamBaseUrl', 'xtreamUsername', 'xtreamPassword', 'xmltvUrl', 'demoMode', 'preferredLiveFormat', 'autoplayLive', 'rememberLastChannel', 'epgRefreshHours'];
const controlKeys: Record<Section, string[]> = {
  general: ['language'], provider: ['xtreamBaseUrl', 'xtreamUsername', 'xtreamPassword', 'demoMode', 'test'],
  playback: ['preferredLiveFormat', 'autoplayLive', 'rememberLastChannel'], data: ['xmltvUrl', 'epgRefreshHours', 'refresh', 'clear-content', 'clear-all'], home: ['home:continueWatching', 'home:restore']
};
const key = (value: string) => `settings:${value}`;
type Choice = { value: string; label: string };
type Dialog = { title: string; help?: string; choices: Choice[]; selected?: string; choose: (value: string) => void };

/** Module-level identity and a stable proxy keep the native keyboard open through updates. */
function RemoteInput({ name, label, value, password, help, locked, busy, error, change }: {
  name: Field; label: string; value: string; password?: boolean; help?: string; locked: boolean; busy: boolean; error?: string; change: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const t = useTranslate();
  const proxy = useFocusProxy({ focusKey: key(name), group: 'settings-controls', index: fields.indexOf(name), activate: () => {
    if (!locked && !busy) { input.current?.focus(); input.current?.click(); }
  } });
  return <label className="settings-field" htmlFor={key(name)}><span className="settings-label">{label}{help && <small>{help}</small>}{locked && <small className="settings-managed">{t('settings.ui.managed')}</small>}</span>
    <div {...proxy} className="settings-control" data-focus-proxy>
      <input id={key(name)} ref={input} tabIndex={-1} type={password ? 'password' : 'text'} value={value} readOnly={locked || busy}
        autocomplete={password ? 'current-password' : name === 'xtreamUsername' ? 'username' : 'off'} spellcheck={false}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${key(name)}:error` : undefined}
        placeholder={locked ? t('settings.ui.managedSecret') : password && help ? t('settings.passwordSaved') : ''}
        onInput={event => change(event.currentTarget.value)}
        onKeyDown={event => {
          if (event.key === 'Backspace' || event.keyCode === 8) event.stopPropagation();
          if (event.key === 'Enter' || event.keyCode === 13) { event.preventDefault(); event.stopPropagation(); input.current?.blur(); event.currentTarget.closest<HTMLElement>('[data-focus-proxy]')?.focus(); }
        }} />
      {error && <small id={`${key(name)}:error`} className="settings-field-error">{error}</small>}
    </div>
  </label>;
}

function SettingsDialog({ dialog, close }: { dialog: Dialog; close: () => void }) {
  const focus = useFocusManager(); const opener = useRef(focus.focused);
  const t = useTranslate();
  useLayoutEffect(() => {
    focus.setScope('settings-dialog', `settings-dialog:${dialog.selected ?? dialog.choices[0]!.value}`);
    return () => { focus.setScope('root'); focus.focus(opener.current); };
  }, []);
  return <div className="settings-modal"><div className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title">
    <h2 id="settings-dialog-title">{dialog.title}</h2>{dialog.help && <p>{dialog.help}</p>}
    <div className="settings-dialog-options">{dialog.choices.map((choice, index) => <Focusable key={choice.value} focusKey={`settings-dialog:${choice.value}`} group="settings-dialog" index={index} orientation="vertical" className={`settings-choice${dialog.selected === choice.value ? ' selected' : ''}`} onSelect={() => dialog.choose(choice.value)}><span>{choice.label}</span>{dialog.selected === choice.value && <span>✓</span>}</Focusable>)}</div>
    <button type="button" className="settings-dialog-close" onClick={close} tabIndex={-1} aria-label={t('settings.ui.cancel')}>×</button>
  </div></div>;
}

interface SettingsProps {
  updated?: (value: AppConfig) => void;
  firstRun?: boolean; language: Language; setLanguage: (language: Language) => void; saved: () => void; cleared: () => void;
  leave?: () => void; registerAction?: (handler: ((action: RemoteAction) => boolean) | null) => void;
}

export function Settings({ firstRun = false, language, setLanguage, saved, cleared, leave, registerAction, updated }: SettingsProps) {
  const t = useTranslate(); const focus = useFocusManager();
  const [config, setConfig] = useState<AppConfig>(); const [baseline, setBaseline] = useState<AppConfig>();
  const [section, setSection] = useState<Section>(firstRun ? 'provider' : 'general');
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [invalid, setInvalid] = useState<Partial<Record<Field, string>>>({});
  const [busy, setBusy] = useState(''); const busyRef = useRef(false);
  const [dialog, setDialog] = useState<Dialog>();
  const [serverVersion, setServerVersion] = useState(APP_VERSION);
  const pane = useRef<HTMLDivElement>(null); const scrolls = useRef<Partial<Record<Section, number>>>({});
  const lastControl = useRef<Partial<Record<Section, string>>>({});
  const action = useRef<(action: RemoteAction) => boolean>(() => false);
  useLayoutEffect(() => { registerAction?.(value => action.current(value)); return () => registerAction?.(null); }, []);
  useEffect(() => {
    let active = true;
    api.config().then(value => { if (active) { const next = { ...value, language: value.languageConfigured ? value.language : language }; setConfig(next); setBaseline(next); } }).catch(() => { if (active) setError(t('settings.ui.loadError')); });
    api.status().then(status => { if (active) setServerVersion(status.version); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useLayoutEffect(() => { if (pane.current) pane.current.scrollTop = scrolls.current[section] ?? 0; }, [section]);
  useLayoutEffect(() => { if (config) focus.focus(key(`tab:${section}`)); }, [Boolean(config)]);
  const managed = (name: Field) => Boolean(config?.managedSettings?.includes(name));
  const edits: Partial<AppConfig> = {};
  if (config && baseline) for (const name of fields) {
    if (!managed(name) && config[name] !== baseline[name]) (edits as Record<string, unknown>)[name] = config[name];
  }
  if (config && baseline && JSON.stringify(config.homePreferences ?? null) !== JSON.stringify(baseline.homePreferences ?? null)) {
    edits.homePreferences = config.homePreferences ?? null; edits.homeProviderKey = baseline.homeProviderKey;
  }
  const dirty = Object.keys(edits).length > 0;
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', prevent); return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  const change = (name: Field, value: string | number | boolean) => {
    if (!config || busyRef.current || managed(name)) return;
    setConfig({ ...config, [name]: value }); setInvalid(previous => ({ ...previous, [name]: undefined })); setMessage(''); setError('');
  };
  const switchSection = (next: Section) => {
    if (dialog) return;
    if (pane.current) scrolls.current[section] = pane.current.scrollTop;
    setSection(next);
    focus.focus(key(`tab:${next}`));
  };
  const requestLeave = () => {
    if (busyRef.current) return;
    if (!dirty) { (leave ?? saved)(); return; }
    setDialog({ title: t('settings.ui.leaveTitle'), help: t('settings.ui.leaveHelp'), choices: [{ value: 'cancel', label: t('settings.ui.cancel') }, { value: 'discard', label: t('settings.ui.discard') }], choose: value => { setDialog(undefined); if (value === 'discard') (leave ?? saved)(); } });
  };
  const controls = controlKeys[section].filter(value => !firstRun || !['refresh', 'clear-content', 'clear-all'].includes(value));
  const sequence = [...controls, 'save', 'exit'].map(key);
  action.current = remote => {
    if (dialog) {
      if (remote === 'BACK') setDialog(undefined);
      else if (remote === 'SELECT') focus.select();
      else if (['NAV_UP', 'NAV_LEFT', 'CHANNEL_UP'].includes(remote)) focus.jump('settings-dialog', -1);
      else if (['NAV_DOWN', 'NAV_RIGHT', 'CHANNEL_DOWN'].includes(remote)) focus.jump('settings-dialog', 1);
      return true;
    }
    if (remote === 'BACK') { requestLeave(); return true; }
    if (remote === 'SELECT') { focus.select(); return true; }
    const tab = sections.findIndex(value => focus.focused === key(`tab:${value}`));
    if (tab >= 0) {
      if (remote === 'NAV_LEFT' || remote === 'NAV_RIGHT') {
        const next = sections[Math.max(0, Math.min(sections.length - 1, tab + (remote === 'NAV_LEFT' ? -1 : 1)))]!;
        switchSection(next); focus.focus(key(`tab:${next}`));
      } else if (remote === 'NAV_DOWN' || remote === 'CHANNEL_DOWN') focus.focus(lastControl.current[section] ?? key(controls[0]!));
      return true;
    }
    const index = sequence.indexOf(focus.focused);
    if (section === 'home' && focus.focused.startsWith('settings:home:')) {
      if (remote === 'NAV_UP') focus.move('up');
      if (remote === 'NAV_DOWN') focus.move('down');
      if (remote === 'NAV_LEFT') focus.move('left');
      if (remote === 'NAV_RIGHT') focus.move('right');
      if (remote === 'CHANNEL_UP' || remote === 'CHANNEL_DOWN') focus.page(remote === 'CHANNEL_UP' ? -1 : 1, ['settings-controls']);
      return true;
    }
    if (index >= 0) {
      if (index < controls.length) lastControl.current[section] = focus.focused;
      if (focus.focused === key('save') || focus.focused === key('exit')) {
        if (remote === 'NAV_UP') focus.focus(key(controls[controls.length - 1]!));
        if (remote === 'NAV_LEFT') focus.focus(key('save'));
        if (remote === 'NAV_RIGHT') focus.focus(key('exit'));
        if (remote === 'CHANNEL_UP') focus.focus(key(controls[0]!));
        if (remote === 'CHANNEL_DOWN') focus.focus(key(controls[controls.length - 1]!));
        return true;
      }
      if (remote === 'NAV_UP') focus.focus(index === 0 ? key(`tab:${section}`) : sequence[index - 1]!);
      if (remote === 'NAV_DOWN') focus.focus(sequence[Math.min(sequence.length - 1, index + 1)]!);
      if (remote === 'CHANNEL_UP') focus.focus(key(controls[0]!));
      if (remote === 'CHANNEL_DOWN') focus.focus(key(controls[controls.length - 1]!));
    }
    return true;
  };
  if (!config) return error ? <ErrorState error={error} /> : <Spinner label={t('settings.loading')} />;
  const run = async (name: string, operation: () => Promise<void>, failure: string) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(name); setError(''); setMessage('');
    try { await operation(); } catch { setError(failure); } finally { busyRef.current = false; setBusy(''); }
  };
  const validUrls = (names: Array<'xtreamBaseUrl' | 'xmltvUrl'> = ['xtreamBaseUrl', 'xmltvUrl']) => {
    const errors: Partial<Record<Field, string>> = {};
    for (const name of names) {
      if (managed(name) || !config[name]) continue;
      try { const url = new URL(config[name]); if (!['http:', 'https:'].includes(url.protocol) || name === 'xtreamBaseUrl' && (url.username || url.password)) throw new Error(); }
      catch { errors[name] = t('settings.ui.urlError'); }
    }
    setInvalid(errors);
    if (Object.keys(errors).length) { setError(t('settings.ui.urlError')); return false; }
    return true;
  };
  const save = () => {
    if (!dirty || !validUrls()) return;
    void run('save', async () => {
      const next = await api.saveConfig({ ...(!config.languageConfigured ? { language: config.language } : {}), ...edits }); setConfig(next); setBaseline(next); setLanguage(next.language); updated?.(next); setMessage(t('settings.ui.savedHelp'));
      if (firstRun && next.configured) saved();
    }, t('settings.ui.saveError'));
  };
  const test = () => {
    if (!validUrls(['xtreamBaseUrl'])) return;
    void run('test', async () => {
      try { const result = await api.testConfig(config); setMessage(t(result.message === 'demo' ? 'settings.ui.demo' : 'settings.ui.connected')); }
      catch (reason) {
        const code = reason instanceof Error ? reason.message : '';
        setError(['timeout', 'auth', 'response', 'unreachable', 'missing'].includes(code) ? t(`settings.ui.${code}` as TranslationKey) : t('settings.ui.failed'));
      }
    }, t('settings.ui.failed'));
  };
  const maintenance = (scope: 'refresh' | 'content' | 'all') => {
    if (busyRef.current) return;
    if (dirty) { setError(t('settings.ui.saveFirst')); return; }
    if (scope === 'refresh') {
      void run('refresh', async () => { await api.refresh(); cleared(); setMessage(t('settings.ui.refreshOk')); }, t('settings.ui.operationError')); return;
    }
    setDialog({ title: t(scope === 'all' ? 'settings.ui.clearAllTitle' : 'settings.ui.clearTitle'),
      help: t('settings.ui.clearHelp') + (scope === 'all' ? ' ' + t('settings.ui.clearAllHelp') : ''),
      choices: [{ value: 'cancel', label: t('settings.ui.cancel') }, { value: 'delete', label: t('settings.ui.confirmDelete') }], choose: value => {
        setDialog(undefined); if (value !== 'delete') return;
        void run(scope, async () => {
          const next = await (scope === 'all' ? api.clearAllData() : api.clearData()); setConfig(next); setBaseline(next); updated?.(next); cleared();
          setMessage(t(scope === 'all' ? 'settings.ui.clearAllOk' : 'settings.ui.clearOk'));
        }, t('settings.ui.operationError'));
      } });
  };
  const input = (name: Field, label: string, help?: string) => <RemoteInput key={name} name={name} label={label} value={String(config[name])} locked={managed(name)} busy={Boolean(busy)} password={name === 'xtreamPassword'} help={help} error={invalid[name]} change={value => change(name, value)} />;
  const select = (name: Field, label: string, options: Choice[], help?: string) => {
    const selected = String(config[name]);
    const selectedLabel = options.find(option => option.value === selected)?.label ?? selected;
    const all = options.some(option => option.value === selected) ? options : [{ value: selected, label: selectedLabel }, ...options];
    return <div className="settings-field"><span className="settings-label">{label}{help && <small>{help}</small>}{managed(name) && <small className="settings-managed">{t('settings.ui.managed')}</small>}</span>
      <Focusable focusKey={key(name)} group="settings-controls" index={fields.indexOf(name)} className="settings-value" onSelect={() => {
        if (managed(name) || busyRef.current) return;
        focus.focus(key(name));
        setDialog({ title: label, choices: [...all, { value: '__cancel', label: t('settings.ui.cancel') }], selected, choose: value => { setDialog(undefined); if (value !== '__cancel') change(name, name === 'epgRefreshHours' ? Number(value) : value); } });
      }}><strong>{selectedLabel}</strong><span>{managed(name) ? '—' : '⌄'}</span></Focusable></div>;
  };
  const toggle = (name: Field, label: string, help?: string) => <div className="settings-field"><span className="settings-label">{label}{help && <small>{help}</small>}{managed(name) && <small className="settings-managed">{t('settings.ui.managed')}</small>}</span>
    <Focusable focusKey={key(name)} group="settings-controls" index={fields.indexOf(name)} className="settings-value" onSelect={() => change(name, !config[name])}><strong>{t(config[name] ? 'settings.ui.on' : 'settings.ui.off')}</strong><span className={`settings-switch${config[name] ? ' checked' : ''}`} aria-hidden="true">{config[name] ? '✓' : '−'}</span></Focusable></div>;
  const button = (name: string, label: string, choose: () => void, danger = false) => <Focusable focusKey={key(name)} group="settings-controls" index={20 + controls.indexOf(name)} className={danger ? 'danger-button' : 'secondary-button'} onSelect={() => { focus.focus(key(name)); choose(); }}>{busy === name ? t('settings.ui.working') : label}</Focusable>;
  return <main className="screen settings-screen">
    <header className="settings-header"><div><span className="eyebrow">{t(firstRun ? 'settings.firstRun.eyebrow' : 'settings.eyebrow')}</span><h1>{t(firstRun ? 'settings.firstRun.title' : 'settings.title')}</h1></div><p>{t('settings.ui.help')}</p></header>
    <nav className="settings-tabs" aria-label={t('settings.title')}>{sections.map((value, index) => <Focusable key={value} focusKey={key(`tab:${value}`)} group="settings-tabs" index={index} orientation="horizontal" className={value === section ? 'settings-tab selected' : 'settings-tab'} onSelect={() => switchSection(value)}>{t(`settings.ui.${value}`)}</Focusable>)}</nav>
    <form className="settings-form" onSubmit={event => event.preventDefault()}>
      <div className="settings-pane" ref={pane} key={section} aria-label={t(`settings.ui.${section}`)}>
        <h2>{t(`settings.ui.${section}`)}</h2>{section !== 'home' && <p className="settings-section-help">{t(`settings.ui.${section === 'general' ? 'generalHelp' : section === 'provider' ? 'providerHelp' : section === 'playback' ? 'playbackHelp' : 'dataHelp'}`)}</p>}
        {section === 'home' && <HomeSettings key={baseline?.homeProviderKey} value={config.homePreferences ?? null} busy={Boolean(busy)} locked={!config.configured || ['xtreamBaseUrl', 'xtreamUsername', 'xtreamPassword', 'demoMode'].some(name => name in edits)} change={value => {
          if (busyRef.current) return;
          setConfig(previous => previous ? { ...previous, homePreferences: value } : previous); setMessage(''); setError('');
        }} />}
        {section === 'general' && <>{select('language', t('settings.language'), LANGUAGES.map(option => ({ ...option })))}<p className="app-version">{serverVersion === APP_VERSION ? t('settings.version', { version: APP_VERSION }) : t('settings.versionMismatch', { app: APP_VERSION, server: serverVersion })}</p></>}
        {section === 'provider' && <>{input('xtreamBaseUrl', t('settings.server'))}{input('xtreamUsername', t('settings.username'))}{input('xtreamPassword', t('settings.password'), config.passwordConfigured ? t('settings.ui.passwordHelp') : undefined)}{toggle('demoMode', t('settings.demoMode'), t('settings.ui.demoHelp'))}<div className="settings-inline-action">{button('test', t('settings.test'), test)}</div></>}
        {section === 'playback' && <>{select('preferredLiveFormat', t('settings.liveFormat'), [{ value: 'auto', label: t('settings.liveFormat.auto') }, { value: 'hls', label: 'HLS' }, { value: 'ts', label: 'MPEG-TS' }])}{toggle('autoplayLive', t('settings.autoplayLive'))}{toggle('rememberLastChannel', t('settings.rememberChannel'))}</>}
        {section === 'data' && <>{input('xmltvUrl', t('settings.xmltv') + ' · ' + t('settings.optional'))}{select('epgRefreshHours', t('settings.epgRefresh'), [3, 6, 12].map(hours => ({ value: String(hours), label: t('settings.epgRefresh.hours', { count: hours }) })), t('settings.ui.epgHelp'))}{!firstRun && <div className="settings-maintenance"><p>{t('settings.ui.refreshHelp')}</p>{button('refresh', t('settings.refresh'), () => maintenance('refresh'))}<p>{t('settings.ui.clearHelp')}</p>{button('clear-content', t('settings.ui.clearContent'), () => maintenance('content'), true)}{button('clear-all', t('settings.ui.clearAll'), () => maintenance('all'), true)}</div>}</>}
      </div>
      <footer className="settings-save-bar"><div aria-live="polite" role="status"><strong className={dirty ? 'settings-dirty' : ''}>{busy ? t(busy === 'save' ? 'settings.ui.saving' : 'settings.ui.working') : t(dirty ? 'settings.ui.dirty' : 'settings.ui.clean')}</strong><p className={error ? 'error' : ''}>{error || message}</p></div>
        <Focusable focusKey={key('save')} group="settings-controls" index={40} className="primary-button" onSelect={save}>{t('settings.save')}</Focusable>
        <Focusable focusKey={key('exit')} group="settings-controls" index={41} className="secondary-button" onSelect={requestLeave}>{t('settings.ui.exit')}</Focusable>
      </footer>
    </form>
    {dialog && <SettingsDialog dialog={dialog} close={() => setDialog(undefined)} />}
  </main>;
}
