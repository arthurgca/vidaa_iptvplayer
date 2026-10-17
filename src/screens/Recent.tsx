import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/client';
import { Image, Progress, Spinner } from '../components/common';
import { useTranslate } from '../i18n/I18nContext';
import { Focusable, useFocusManager } from '../navigation/FocusContext';
import { restoreBrowseScroll, type ScrollPosition } from '../navigation/scroll';
import type { RemoteAction } from '../platform/remote';
import { formatPlaybackTime } from '../player/Player';
import { isWatched, resumePosition } from '../player/history';
import type { Episode, HistoryItem } from '../types';

const CLEAR = 'recent:clear';
const BACK = 'recent:back';
const CANCEL = 'recent-dialog:cancel';
const CONFIRM = 'recent-dialog:confirm';
const rowKey = (row: HistoryItem) => `recent:${row.type}:${row.id}`;

function ClearHistoryDialog({ busy, error, cancel, confirm }: { busy: boolean; error: string; cancel: () => void; confirm: () => void }) {
  const t = useTranslate(); const focus = useFocusManager();
  useLayoutEffect(() => {
    focus.setScope('recent-dialog', CANCEL);
    return () => focus.setScope('root');
  }, []);
  return <div className="settings-modal"><section className="settings-dialog recent-dialog" role="dialog" aria-modal="true" aria-labelledby="recent-dialog-title" aria-describedby="recent-dialog-help" aria-busy={busy}>
    <h2 id="recent-dialog-title">{t('library.recent.confirmTitle')}</h2>
    <p id="recent-dialog-help">{t('library.recent.confirmHelp')}</p>
    <div role="status" aria-live="polite">{busy ? t('library.saving') : error && <p className="error" role="alert">{error}</p>}</div>
    <div className="recent-dialog-actions">
      <Focusable focusKey={CANCEL} group="recent-dialog" index={0} orientation="horizontal" neighbors={{ left: CANCEL, right: CONFIRM, up: CANCEL, down: CANCEL }} onSelect={cancel} className="secondary-button">{t('settings.ui.cancel')}</Focusable>
      <Focusable focusKey={CONFIRM} group="recent-dialog" index={1} orientation="horizontal" neighbors={{ left: CANCEL, right: CONFIRM, up: CONFIRM, down: CONFIRM }} onSelect={confirm} disabled={busy} className="danger-button">{t('library.recent.clearConfirm')}</Focusable>
    </div>
  </section></div>;
}

interface RecentProps {
  open: (row: HistoryItem) => void; back?: () => void; restoreFocus?: string; scroll?: ScrollPosition[];
  cancelPendingOpen?: () => void;
  registerAction?: (handler: ((action: RemoteAction) => boolean) | null) => void;
}

export function Recent({ open, back, restoreFocus, scroll, registerAction, cancelPendingOpen }: RecentProps) {
  const t = useTranslate(); const focus = useFocusManager();
  const [rows, setRows] = useState<HistoryItem[]>(); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [dialog, setDialog] = useState(false);
  const alive = useRef(true); const working = useRef(false); const loading = useRef(false);
  const initialized = useRef(false); const pendingFocus = useRef<string>();
  const action = useRef<(action: RemoteAction) => boolean>(() => false);
  const load = async () => {
    if (working.current || loading.current) return;
    loading.current = true;
    try {
      const value = await api.history();
      if (alive.current) {
        if (focus.focused === 'recent:retry') pendingFocus.current = value[0] ? rowKey(value[0]) : BACK;
        setError(''); setRows(value);
      }
    }
    catch { if (alive.current) setError(t('library.recent.loadError')); }
    finally { loading.current = false; }
  };
  useEffect(() => { void load(); return () => { alive.current = false; }; }, []);
  useLayoutEffect(() => { registerAction?.(value => action.current(value)); return () => registerAction?.(null); }, []);

  // Restore once after real data registers. Subsequent asynchronous updates keep
  // the same keyed row elements and never restart the page's initial focus.
  useLayoutEffect(() => {
    if (dialog) return;
    if (!rows && !error) { focus.focus(BACK); return; }
    if (pendingFocus.current) {
      const target = pendingFocus.current; pendingFocus.current = undefined;
      if (!focus.focus(target)) focus.focus(rows?.[0] ? rowKey(rows[0]) : BACK);
    } else if (!initialized.current && (rows || error)) {
      initialized.current = true;
      if (!restoreFocus || !focus.focus(restoreFocus)) focus.focus(rows?.[0] ? rowKey(rows[0]) : error ? 'recent:retry' : BACK);
      restoreBrowseScroll(scroll);
    }
  }, [rows, error, dialog]);

  const closeDialog = () => {
    if (working.current) return;
    pendingFocus.current = CLEAR; setDialog(false); setError('');
  };
  const clear = async () => {
    if (working.current || !rows?.length) return;
    working.current = true; focus.focus(CANCEL); setBusy(true); setError('');
    try {
      await api.clearHistory();
      if (alive.current) { pendingFocus.current = BACK; setRows([]); setDialog(false); }
    } catch { if (alive.current) setError(t('library.recent.deleteError')); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  };
  const remove = async (row: HistoryItem, index: number) => {
    if (working.current || dialog) return;
    cancelPendingOpen?.();
    working.current = true; setBusy(true); setError('');
    const key = rowKey(row);
    try {
      await api.forget(row.type, row.id);
      if (!alive.current) return;
      // Only move focus if its row is disappearing. Navigation during the save
      // remains valid, and the list container retains its current scroll offset.
      if (focus.focused === key || focus.focused === `${key}:remove`) {
        const next = rows?.[index + 1] || rows?.[index - 1]; pendingFocus.current = next ? rowKey(next) : BACK;
      }
      setRows(current => current?.filter(value => value.type !== row.type || value.id !== row.id));
    } catch { if (alive.current) setError(t('library.recent.deleteError')); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  };
  action.current = remote => {
    if (!dialog) return working.current && remote === 'BACK';
    if (working.current) return true;
    if (remote === 'BACK') closeDialog();
    else if (remote === 'SELECT') focus.select();
    else if (remote === 'NAV_LEFT' || remote === 'NAV_RIGHT') focus.move(remote === 'NAV_LEFT' ? 'left' : 'right');
    return true;
  };

  return <main className="screen recent-screen">
    <header className="section-header"><div><span className="eyebrow">{t('library.recent.eyebrow')}</span><h1>{t('library.recent.title')}</h1>{rows && <p className="recent-count">{t(rows.length === 1 ? 'library.recent.countOne' : 'library.recent.count', { count: rows.length })}</p>}</div>
      <Focusable focusKey={CLEAR} group="recent-header" index={0} neighbors={{ up: CLEAR, down: rows?.[0] ? rowKey(rows[0]) : BACK, left: CLEAR, right: CLEAR }} onSelect={() => { if (!working.current && rows?.length) { cancelPendingOpen?.(); setError(''); setDialog(true); } }} disabled={!rows?.length} className="secondary-button">{t('library.recent.clear')}</Focusable>
    </header>
    <div className="recent-status" aria-live="polite">{!dialog && error && <div className="form-message error" role="alert"><p>{error}</p>{!rows && <Focusable focusKey="recent:retry" group="recent-status" index={0} onSelect={() => { void load(); }} className="secondary-button">{t('common.retry')}</Focusable>}</div>}{!dialog && busy && <span role="status">{t('library.saving')}</span>}</div>
    <div className="recent-list" data-scroll-key="recent:list">
      {!rows && !error && <div className="state-panel"><Spinner /><Focusable focusKey={BACK} group="recent-loading" index={0} onSelect={() => back?.()} className="secondary-button">{t('common.back')}</Focusable></div>}
      {rows?.length === 0 && <div className="state-panel recent-empty"><span className="recent-empty-symbol" aria-hidden="true">▷</span><h2>{t('library.recent.emptyTitle')}</h2><p>{t('library.recent.empty')}</p><Focusable focusKey={BACK} group="recent-empty" index={0} onSelect={() => back?.()} className="secondary-button">{t('common.back')}</Focusable></div>}
      {rows?.map((row, index) => {
        const key = rowKey(row); const resume = row.type === 'live' ? 0 : resumePosition(row); const episode = row.item as Episode;
        const episodeNumber = row.type === 'series' ? [episode.season != null && `S${String(episode.season).padStart(2, '0')}`, episode.episode != null && `E${String(episode.episode).padStart(2, '0')}`].filter(Boolean).join('') : '';
        const title = row.type === 'series' && row.series?.name ? `${row.series.name}${episodeNumber ? ` — ${episodeNumber}` : ''}` : row.item.name || t('library.recent.untitled');
        const image = row.type === 'series' ? row.series?.poster || episode.thumbnail : 'logo' in row.item ? row.item.logo : 'poster' in row.item ? row.item.poster : undefined;
        const above = index ? rowKey(rows[index - 1]!) : CLEAR; const below = index < rows.length - 1 ? rowKey(rows[index + 1]!) : key;
        return <article key={key} className={`recent-entry recent-entry-${row.type}`}>
          <Focusable focusKey={key} group="recent" index={index} orientation="vertical" neighbors={{ up: above, down: below, left: key, right: `${key}:remove` }} onSelect={() => { if (!working.current && !dialog) open(row); }} className="recent-play">
            <Image src={image} alt={title} className="recent-artwork" />
            <span className="recent-info"><small>{t(`kind.${row.type}`)}</small><strong>{title}</strong>
              {row.type === 'series' && row.item.name !== title && <span className="recent-episode">{row.series?.name ? row.item.name : episodeNumber}</span>}
              {row.type !== 'live' && (isWatched(row) ? <span className="recent-position">{t('details.watched')}</span> : resume > 0 && <span className="recent-position">{t('library.continueAt', { time: formatPlaybackTime(resume) })}</span>)}
              {resume > 0 && Number.isFinite(row.duration) && row.duration > 0 && <Progress value={resume / row.duration * 100} />}
            </span>
            <span className="recent-primary">{t(row.type === 'live' ? 'library.recent.watch' : resume > 0 ? 'library.recent.resume' : 'details.play')}</span>
          </Focusable>
          <Focusable focusKey={`${key}:remove`} group="recent-remove" index={index} orientation="vertical" neighbors={{ left: key, right: `${key}:remove`, up: index ? `${above}:remove` : CLEAR, down: below === key ? `${key}:remove` : `${below}:remove` }} onSelect={() => { void remove(row, index); }} className="recent-remove" title={`${t('library.remove')} · ${title}`}><span aria-hidden="true">×</span> {t('library.remove')}</Focusable>
        </article>;
      })}
    </div>
    {dialog && <ClearHistoryDialog busy={busy} error={error} cancel={closeDialog} confirm={() => { void clear(); }} />}
  </main>;
}
