import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/client';
import { Empty, Image, Spinner } from '../components/common';
import { useTranslate } from '../i18n/I18nContext';
import { Focusable, useFocusManager } from '../navigation/FocusContext';
import { formatPlaybackTime } from '../player/Player';
import { isWatched, resumePosition } from '../player/history';
import type { Favorite, HistoryItem } from '../types';

function useLibrary<T>(load: () => Promise<T[]>) {
  const [data, setData] = useState<T[]>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const working = useRef(false); const focus = useFocusManager();
  const retry = () => { setError(''); load().then(setData).catch((reason) => setError(reason.message)); };
  useEffect(retry, []);
  const run = (action: () => Promise<T[]>, fallback: string) => {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); const key = focus.focused;
    action().then(setData).catch((reason) => setError(reason.message)).finally(() => {
      working.current = false; setBusy(false);
      window.setTimeout(() => { if (!focus.focus(key) && !focus.focus(fallback)) focus.focusFirst(); }, 50);
    });
  };
  return { data, error, busy, retry, run };
}

export function Favorites({ open }: { open: (row: Favorite) => void }) {
  const t = useTranslate(); const focus = useFocusManager(); const rows = useLibrary(api.favorites); const [editing, setEditing] = useState(false);
  const edit = () => { setEditing(!editing); window.setTimeout(() => focus.focus('favorites:edit'), 50); };
  const picture = (row: Favorite) => 'logo' in row.item ? row.item.logo : 'poster' in row.item ? row.item.poster : undefined;
  return <LibraryShell eyebrow={t('library.favorites.eyebrow')} title={t('library.favorites.title')} action={<Focusable focusKey="favorites:edit" group="favorites-header" index={0} neighbors={{ down: rows.data?.[0] ? `favorites:${rows.data[0].type}:${rows.data[0].id}` : undefined }} onSelect={edit} className="secondary-button">{t(editing ? 'library.done' : 'library.edit')}</Focusable>}>
    {rows.error && <LibraryError error={rows.error} retry={rows.retry} />}{rows.busy && <p role="status">{t('library.saving')}</p>}
    {!rows.data ? !rows.error && <Spinner /> : !rows.data.length ? <Empty>{t('library.favorites.empty')}</Empty> : editing ? <div className="library-edit-list">{rows.data.map((row,index) => {
      const key = `favorites:${row.type}:${row.id}`;
      const remove = () => rows.run(async () => { await api.unfavorite(row.type, row.id); return api.favorites(); }, rows.data?.[index + 1] ? `favorites:${rows.data[index + 1]!.type}:${rows.data[index + 1]!.id}` : index ? `favorites:${rows.data![index - 1]!.type}:${rows.data![index - 1]!.id}` : 'favorites:edit');
      return <div key={key} className="library-edit-row">
        <Focusable focusKey={key} group="favorites-items" index={index} orientation="vertical" neighbors={{ up: !index ? 'favorites:edit' : undefined, right: index ? `${key}:up` : rows.data!.length > 1 ? `${key}:down` : `${key}:remove` }} onSelect={() => open(row)} className="recent-row"><Image src={picture(row)} alt={row.item.name} /><span><small>{t(`kind.${row.type}`)}</small><strong>{row.item.name}</strong></span></Focusable>
        <div className="library-row-actions">
          <Focusable focusKey={`${key}:up`} group={`${key}:actions`} index={0} orientation="horizontal" neighbors={{ left: key }} disabled={!index} onSelect={() => rows.run(() => api.moveFavorite(row.type, row.id, -1), key)} className="secondary-button">{t('library.moveUp')}</Focusable>
          <Focusable focusKey={`${key}:down`} group={`${key}:actions`} index={1} orientation="horizontal" neighbors={{ left: index ? `${key}:up` : key }} disabled={index === rows.data!.length - 1} onSelect={() => rows.run(() => api.moveFavorite(row.type, row.id, 1), key)} className="secondary-button">{t('library.moveDown')}</Focusable>
          <Focusable focusKey={`${key}:remove`} group={`${key}:actions`} index={2} orientation="horizontal" neighbors={{ left: index < rows.data!.length - 1 ? `${key}:down` : index ? `${key}:up` : key }} onSelect={remove} className="danger-button">{t('library.remove')}</Focusable>
        </div>
      </div>;
    })}</div> : <div className="library-grid">{rows.data.map((row,index) => <Focusable key={`${row.type}-${row.id}`} focusKey={`favorites:${row.type}:${row.id}`} group="favorites" index={index} columns={5} orientation="grid" neighbors={{ up: index < 5 ? 'favorites:edit' : undefined }} onSelect={() => open(row)} className="library-card"><Image src={picture(row)} alt={row.item.name} /><span><small>{t(`kind.${row.type}`)}</small><strong>{row.item.name}</strong></span></Focusable>)}</div>}
  </LibraryShell>;
}

export function Recent({ open }: { open: (row: HistoryItem) => void }) {
  const t = useTranslate(); const rows = useLibrary(api.history);
  return <LibraryShell eyebrow={t('library.recent.eyebrow')} title={t('library.recent.title')}>
    {rows.error && <LibraryError error={rows.error} retry={rows.retry} />}{rows.busy && <p role="status">{t('library.saving')}</p>}
    {!rows.data ? !rows.error && <Spinner /> : !rows.data.length ? <Empty>{t('library.recent.empty')}</Empty> : <div className="recent-list">{rows.data.map((row,index) => {
      const key = `recent:${row.type}:${row.id}`; const resume = resumePosition(row);
      return <div key={key} className="library-edit-row">
        <Focusable focusKey={key} group="recent" index={index} orientation="vertical" neighbors={{ right: `${key}:remove` }} onSelect={() => open(row)} className="recent-row"><Image src={'logo' in row.item ? row.item.logo : 'poster' in row.item ? row.item.poster : row.series?.poster} alt={row.item.name} /><span><small>{t(`kind.${row.type}`)}</small><strong>{row.item.name}</strong>{row.type !== 'live' && (isWatched(row) ? <em>{t('details.watched')}</em> : resume > 0 && <em>{t('library.continueAt', { time: formatPlaybackTime(resume) })}</em>)}</span><b>▶</b></Focusable>
        <Focusable focusKey={`${key}:remove`} group="recent-remove" index={index} orientation="vertical" neighbors={{ left: key }} onSelect={() => rows.run(async () => { await api.forget(row.type, row.id); return api.history(); }, rows.data?.[index + 1] ? `recent:${rows.data[index + 1]!.type}:${rows.data[index + 1]!.id}` : index ? `recent:${rows.data![index - 1]!.type}:${rows.data![index - 1]!.id}` : 'library:retry')} className="danger-button">{t('library.remove')}</Focusable>
      </div>;
    })}</div>}
  </LibraryShell>;
}

function LibraryError({ error, retry }: { error: string; retry: () => void }) {
  const t = useTranslate();
  return <div className="form-message error"><p>{error}</p><Focusable focusKey="library:retry" group="library-errors" index={0} onSelect={retry} className="secondary-button">{t('common.retry')}</Focusable></div>;
}

function LibraryShell({ eyebrow, title, action, children }: { eyebrow: string; title: string; action?: preact.ComponentChildren; children: preact.ComponentChildren }) {
  return <main className="screen library-screen"><header className="section-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>{action}</header>{children}</main>;
}
